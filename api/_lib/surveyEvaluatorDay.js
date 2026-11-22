import { Prisma } from "@prisma/client";

export const DEFAULT_SURVEY_TIMEZONE = "America/Santo_Domingo";
const MINUTES = 60_000;
const ONE_LOCAL_DAY = 36 * 60 * MINUTES;
const calendarFormatters = new Map();

export function localCalendarDate(value, timezone) {
  if (!calendarFormatters.has(timezone)) {
    calendarFormatters.set(timezone, new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }));
  }
  const parts = calendarFormatters.get(timezone).formatToParts(value);
  const component = (name) => parts.find((part) => part.type === name).value;
  return [component("year"), component("month"), component("day")].join("-");
}

export function evaluatorAgendaDateRange(start, end = start) {
  return {
    gte: new Date(start.getTime() - ONE_LOCAL_DAY),
    lt: new Date(end.getTime() + ONE_LOCAL_DAY),
  };
}

export function isOutsideMetroAssignment(row) {
  if (row.zoneCode === "VIRTUAL") return false;
  const zone = row.contextSnapshot?.zone?.type;
  if (zone) return zone !== "METRO";
  return row.scheduleProfile === "INTERIOR_SHORT" || row.scheduleProfile === "INTERIOR_LONG";
}

export function metroReturnAt(row) {
  const value = row.contextSnapshot?.metroReturnRecordedAt;
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

export function replacementAssignmentContext(row) {
  const context = { ...row.contextSnapshot };
  delete context.metroReturnRecordedAt;
  return context;
}

export function isActiveAgendaAssignment(row) {
  if (isOutsideMetroAssignment(row) && (row.status === "COMPLETED" || metroReturnAt(row))) return true;
  return !row.routeInvalidatedAt && !["CANCELLED", "SUPERSEDED"].includes(row.status);
}

export function canReportMetroReturn(row, timezone, now) {
  return isOutsideMetroAssignment(row) &&
    isActiveAgendaAssignment(row) &&
    !metroReturnAt(row) &&
    row.scheduledStart <= now &&
    localCalendarDate(row.scheduledStart, timezone) === localCalendarDate(now, timezone);
}

export function evaluatorDayConflict(rows, {
  start, end, timezone, outsideMetro, bufferMinutes = 0, excludeAssignmentId = null,
}) {
  const date = localCalendarDate(start, timezone);
  const bufferedStart = start.getTime() - bufferMinutes * MINUTES;
  const bufferedEnd = end.getTime() + bufferMinutes * MINUTES;
  let conflict = null;
  for (const row of rows) {
    if ((excludeAssignmentId && row.id === excludeAssignmentId) || !isActiveAgendaAssignment(row)) continue;
    const sameDay = localCalendarDate(row.scheduledStart, timezone) === date;
    const existingOutsideMetro = isOutsideMetroAssignment(row);
    const returnedAt = existingOutsideMetro ? metroReturnAt(row) : null;
    if (sameDay && existingOutsideMetro) {
      if (outsideMetro) return "CRM_SURVEY_INTERIOR_DAILY_LIMIT";
      if (!returnedAt) return "CRM_SURVEY_EVALUATOR_OUTSIDE_METRO";
      if (Date.parse(returnedAt) > bufferedStart) conflict ??= "CRM_SURVEY_EVALUATOR_CONFLICT";
      continue;
    }
    if (sameDay && outsideMetro) {
      conflict = "CRM_SURVEY_EVALUATOR_DAY_BLOCKED";
      continue;
    }
    const existingEnd = returnedAt ? Date.parse(returnedAt) : row.scheduledEnd?.getTime();
    if (row.scheduledStart.getTime() < bufferedEnd &&
        (existingEnd != null ? existingEnd > bufferedStart : sameDay)) {
      conflict ??= "CRM_SURVEY_EVALUATOR_CONFLICT";
    }
  }
  return conflict;
}

export async function lockSurveyEvaluatorDay(tx, tenantId, start) {
  const date = start.toISOString().slice(0, 10);
  const rows = await tx.$queryRaw(
    Prisma.sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${`SURVEY-11B:${tenantId}:EVALUATOR:${date}`},0)) AS "ok"`,
  );
  return rows[0]?.ok === true;
}

export async function findSurveyEvaluatorDayConflict(tx, tenantId, evaluator, options) {
  const range = evaluatorAgendaDateRange(options.start, options.end);
  const rows = await tx.surveyAssignment.findMany({
    where: {
      tenantId,
      evaluatorMembershipId: evaluator.id,
      evaluatorUserId: evaluator.userId,
      OR: [
        { scheduledStart: range },
        { scheduledStart: { lt: range.gte }, scheduledEnd: { gte: range.gte } },
      ],
    },
    select: {
      id: true,
      scheduledStart: true,
      scheduledEnd: true,
      scheduleProfile: true,
      zoneCode: true,
      contextSnapshot: true,
      status: true,
      routeInvalidatedAt: true,
    },
  });
  return evaluatorDayConflict(rows, options);
}
