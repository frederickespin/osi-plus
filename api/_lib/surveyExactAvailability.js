import { personnelScheduleWindow, personnelVisitInWindow } from "./personnelPoliciesDomain.js";
import {
  evaluatorAgendaDateRange,
  evaluatorDayConflict,
  isActiveAgendaAssignment,
  isOutsideMetroAssignment,
  localCalendarDate,
  metroReturnAt,
} from "./surveyEvaluatorDay.js";
import { resolveSlotAvailability, schedulingFail } from "./surveySchedulingContract.js";

const MINUTE = 60_000;
const OCCUPIED_STATUSES = ["ASSIGNED", "ARRIVED", "IN_PROGRESS"];

export function parseSurveyExactQuery(query) {
  if (query?.time == null) return null;
  const { date, time, mode } = query;
  const day = new Date(`${date}T12:00:00.000Z`);
  const duration = query.durationMinutes ?? "45";
  if (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(day.getTime()) ||
    day.toISOString().slice(0, 10) !== date ||
    typeof time !== "string" ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) ||
    !["string", "number"].includes(typeof duration) ||
    !/^\d{1,3}$/.test(String(duration)) ||
    Number(duration) < 15 ||
    Number(duration) > 240 ||
    (mode !== undefined && mode !== "reschedule")
  ) schedulingFail("CRM_SURVEY_SLOT_INVALID");
  return { date, time, durationMinutes: Number(duration), mode };
}

function minuteNumber(time) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function clockTime(minute) {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function arrivalClock(timezone) {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  function localTimestamp(instant) {
    return formatter.format(instant).replace(" ", "T");
  }
  return (date, time) => {
    const expected = `${date}T${time}`;
    const wallTime = Date.parse(`${expected}:00Z`);
    let instant = new Date(wallTime);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const wall = localTimestamp(instant);
      if (wall === expected) return instant;
      instant = new Date(instant.getTime() + wallTime - Date.parse(`${wall}:00Z`));
    }
    return null;
  };
}

function groupBy(rows, field) {
  const grouped = new Map();
  for (const row of rows) {
    const key = row[field];
    const values = grouped.get(key) || [];
    values.push(row);
    grouped.set(key, values);
  }
  return grouped;
}

export function evaluateExactSurveySlots({
  query, policy, operationalPolicy, profile, zoneCode, method, candidates,
  assignments, overrides, zoneAssignments, motorTravelMinutes,
  excludedAssignmentId, pipelineCaseId,
}) {
  const { date, time, durationMinutes } = query;
  const timezone = operationalPolicy?.timezone || policy.timezone;
  const localArrival = arrivalClock(timezone);
  const outsideMetro = method === "IN_PERSON" && profile.zoneType !== "METRO";
  const slots = policy.configuration.slots.filter((slot) => slot.profile === profile.code);
  const bookings = assignments.filter((row) => row.id !== excludedAssignmentId);
  const bookingsByEvaluator = groupBy(bookings, "evaluatorMembershipId");
  const overridesByProfile = groupBy(overrides, "employeeProfileId");
  const zonesByProfile = groupBy(zoneAssignments, "employeeProfileId");
  const operationalBookings = bookings.filter((entry) =>
    entry.operationalPolicyId === operationalPolicy?.id &&
    entry.evaluationDecision?.method === method &&
    OCCUPIED_STATUSES.includes(entry.status),
  );
  const requestedMinute = minuteNumber(time);
  function evaluationAt(minute) {
    const start = localArrival(date, clockTime(minute));
    const end = start ? new Date(start.getTime() + durationMinutes * MINUTE) : null;
    const result = { start, end, slotKey: null, evaluators: [], pendingApproval: [] };
    if (!start || localCalendarDate(end, timezone) !== date) return result;
    const coveringSlots = slots.filter((slot) => minute >= minuteNumber(slot.startTime) && minute < minuteNumber(slot.endTime));
    const capacityDate = start.toISOString().slice(0, 10);
    const dayBookings = bookings.filter((row) =>
      row.schedulePolicyId === policy.id &&
      row.scheduleProfile === profile.code && row.zoneCode === zoneCode &&
      !["CANCELLED", "SUPERSEDED"].includes(row.status) && !row.routeInvalidatedAt &&
      row.scheduledStart.toISOString().slice(0, 10) === capacityDate,
    );
    const vacantSlot = coveringSlots.find((slot) => {
      try {
        resolveSlotAvailability(policy.configuration, {
          profile: profile.code,
          date: capacityDate,
          slotKey: slot.key,
          dayCount: dayBookings.length,
          slotCount: dayBookings.filter((row) => row.slotKey === slot.key).length,
          saturdayApproved: true,
        });
        return true;
      } catch (error) {
        if (!error.code?.startsWith("CRM_SURVEY_")) throw error;
        return false;
      }
    });
    if (!vacantSlot) return result;
    result.slotKey = vacantSlot.key;
    for (const candidate of candidates) {
      const visits = bookingsByEvaluator.get(candidate.membershipId) || [];
      let bufferMinutes = 0;
      let requiresApproval = false;
      if (operationalPolicy) {
        const activeOverrides = (overridesByProfile.get(candidate.profileId) || []).filter(
          (override) => override.startsAt <= start && override.endsAt >= end,
        );
        const zoneIds = new Set((zonesByProfile.get(candidate.profileId) || []).filter(
          (entry) => (!entry.validFrom || entry.validFrom <= start) && (!entry.validTo || entry.validTo > end),
        ).map((entry) => entry.logisticsRuleId));
        let authority;
        try {
          authority = personnelScheduleWindow({
            policy: operationalPolicy, method, start, end,
            overrides: activeOverrides, zoneIds, motorTravelMinutes,
          });
        } catch (error) {
          if (error.code !== "PERSONNEL_VISIT_POLICY_CONFLICT") throw error;
          continue;
        }
        if (authority.unavailable || authority.windowConflict) continue;
        if (authority.window && operationalBookings.filter((entry) =>
          personnelVisitInWindow(entry.scheduledStart, start, timezone, authority.window, authority.local.weekday),
        ).length >= authority.window.capacity) continue;
        bufferMinutes = authority.buffer;
        requiresApproval = authority.requiresApproval;
      }
      if (evaluatorDayConflict(visits, { start, end, timezone, outsideMetro, bufferMinutes })) continue;
      (requiresApproval ? result.pendingApproval : result.evaluators).push(candidate.membershipRef);
    }
    return result;
  }

  const requested = evaluationAt(requestedMinute);
  const alternatives = [];
  if (candidates.length && !requested.evaluators.length) {
    const startingMinutes = new Set([
      ...Array.from({ length: 96 }, (_, index) => index * 15),
      ...slots.map((slot) => minuteNumber(slot.startTime)),
    ]);
    const nearbyMinutes = [...startingMinutes]
      .filter((minute) => minute !== requestedMinute &&
        slots.some((slot) => minute >= minuteNumber(slot.startTime) && minute < minuteNumber(slot.endTime)))
      .sort((left, right) => Math.abs(left - requestedMinute) - Math.abs(right - requestedMinute) || left - right);
    for (const minute of nearbyMinutes) {
      const alternative = evaluationAt(minute);
      if (!alternative.evaluators.length) continue;
      alternatives.push({
        time: clockTime(minute),
        slotKey: alternative.slotKey,
        evaluatorMembershipRefs: alternative.evaluators,
      });
      if (alternatives.length === 4) break;
    }
  }
  const evaluatorRefs = new Map(candidates.map((candidate) => [candidate.membershipId, candidate.membershipRef]));
  const agenda = bookings.filter((row) =>
    evaluatorRefs.has(row.evaluatorMembershipId) &&
    isActiveAgendaAssignment(row) && localCalendarDate(row.scheduledStart, timezone) === date,
  ).map((row) => {
    const outsideMetro = isOutsideMetroAssignment(row);
    return {
      evaluatorMembershipRef: evaluatorRefs.get(row.evaluatorMembershipId),
      scheduledStart: row.scheduledStart.toISOString(),
      scheduledEnd: row.scheduledEnd?.toISOString() || null,
      label: row.pipelineCaseId === pipelineCaseId ? "Visita de este caso"
        : outsideMetro ? "Visita fuera de zona metro" : "Visita programada",
      outsideMetro,
      returnedToMetroAt: metroReturnAt(row),
    };
  });
  return {
    date, time, durationMinutes, timezone,
    scheduledStart: requested.start?.toISOString() || null,
    scheduledEnd: requested.end?.toISOString() || null,
    slotKey: requested.slotKey,
    requiresApproval: !requested.evaluators.length && requested.pendingApproval.length > 0,
    evaluators: requested.evaluators.length ? requested.evaluators : requested.pendingApproval,
    alternatives,
    agenda,
  };
}

export async function loadExactSurveyAvailability(tx, {
  tenantId, query, policy, operationalPolicy, profile, zoneCode, method,
  candidates, motorTravelMinutes, excludedAssignmentId, pipelineCaseId,
}) {
  const noon = new Date(`${query.date}T12:00:00Z`);
  const scheduledStart = evaluatorAgendaDateRange(noon, noon);
  const profileIds = candidates.map((candidate) => candidate.profileId).filter(Boolean);
  const assignmentScopes = [
    { evaluatorMembershipId: { in: candidates.map((candidate) => candidate.membershipId) } },
    { schedulePolicyId: policy.id, scheduleProfile: profile.code, zoneCode },
  ];
  if (operationalPolicy) assignmentScopes.push({
    operationalPolicyId: operationalPolicy.id,
    evaluationDecision: { method },
    status: { in: OCCUPIED_STATUSES },
  });
  const [assignments, overrides, zoneAssignments] = candidates.length ? await Promise.all([
    tx.surveyAssignment.findMany({
      where: {
        tenantId,
        AND: [
          { OR: [
            { scheduledStart },
            { scheduledStart: { lt: scheduledStart.gte }, scheduledEnd: { gte: scheduledStart.gte } },
          ] },
          { OR: assignmentScopes },
        ],
      },
      select: {
        id: true, pipelineCaseId: true, evaluatorMembershipId: true, scheduledStart: true,
        scheduledEnd: true, schedulePolicyId: true, operationalPolicyId: true, scheduleProfile: true,
        zoneCode: true, slotKey: true, contextSnapshot: true, status: true, routeInvalidatedAt: true,
        travelBufferMinutes: true, evaluationDecision: { select: { method: true } },
      },
      orderBy: { scheduledStart: "asc" },
    }),
    operationalPolicy && profileIds.length ? tx.operationalScheduleOverride.findMany({
      where: {
        tenantId, employeeProfileId: { in: profileIds }, status: "ACTIVE",
        startsAt: { lt: scheduledStart.lt }, endsAt: { gte: scheduledStart.gte },
        OR: [{ method: null }, { method }],
      },
      orderBy: { createdAt: "desc" },
    }) : [],
    operationalPolicy && profileIds.length ? tx.operationalZoneAssignment.findMany({
      where: { tenantId, employeeProfileId: { in: profileIds }, status: "ACTIVE" },
    }) : [],
  ]) : [[], [], []];
  return evaluateExactSurveySlots({
    query, policy, operationalPolicy, profile, zoneCode, method, candidates, motorTravelMinutes,
    assignments, overrides, zoneAssignments, excludedAssignmentId, pipelineCaseId,
  });
}
