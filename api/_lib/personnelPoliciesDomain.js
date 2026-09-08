import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { appendCommercialAudit } from "./commercialAuditLog.js";
import {
  renderCommunicationTemplate,
  communicationHash,
} from "./communicationsContract.js";
import { PERMS, permsForRole } from "./rbac.js";
import {
  PersonnelPoliciesError,
  normalizePersonnelPoliciesQuery,
  normalizePersonnelPolicyMutation,
  personnelFail,
} from "./personnelPoliciesContract.js";

const SOURCE = "V17_PERSONNEL_OPERATIONAL_POLICIES_14A";
const SERIALIZABLE = Object.freeze({
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 3_000,
  timeout: 15_000,
});
const READ_PERMISSIONS = Object.freeze([
  PERMS.PERSONNEL_PROFILES_VIEW,
  PERMS.PERSONNEL_CAPABILITIES_VIEW,
  PERMS.SCHEDULING_POLICIES_VIEW,
  PERMS.SCHEDULING_EXCEPTIONS_REQUEST,
  PERMS.SCHEDULING_EXCEPTIONS_APPROVE,
  PERMS.SCHEDULING_EXCEPTIONS_RESPOND,
]);
const OPERATION_PERMISSION = Object.freeze({
  PROFILE_UPDATE: PERMS.PERSONNEL_PROFILES_MANAGE,
  CAPABILITY_CREATE: PERMS.PERSONNEL_CAPABILITIES_MANAGE,
  CAPABILITY_ASSIGN: PERMS.PERSONNEL_CAPABILITIES_MANAGE,
  CAPABILITY_REVOKE: PERMS.PERSONNEL_CAPABILITIES_MANAGE,
  ZONE_ASSIGN: PERMS.PERSONNEL_PROFILES_MANAGE,
  POLICY_PUBLISH: PERMS.SCHEDULING_POLICIES_MANAGE,
  SCHEDULE_OVERRIDE_CREATE: PERMS.SCHEDULING_POLICIES_MANAGE,
  VISIT_REASON_CREATE: PERMS.SCHEDULING_POLICIES_MANAGE,
  EXCEPTION_REQUEST: PERMS.SCHEDULING_EXCEPTIONS_REQUEST,
  EXCEPTION_RESPOND: PERMS.SCHEDULING_EXCEPTIONS_RESPOND,
  EXCEPTION_DECIDE: PERMS.SCHEDULING_EXCEPTIONS_APPROVE,
  REBOOK_VISIT: PERMS.SURVEY_SCHEDULE_RESCHEDULE,
  CANCEL_VISIT: PERMS.SURVEY_SCHEDULE_RESCHEDULE,
  RECORD_CLIENT_CONFIRMATION: PERMS.SURVEY_SCHEDULE_MANAGE,
});

function requiredContext(value) {
  if (typeof value !== "string" || !value || value.length > 191)
    personnelFail("PERSONNEL_POLICIES_FORBIDDEN", 403);
  return value;
}

async function actor(tx, context, permissions, { any = false } = {}) {
  const tenantId = requiredContext(context?.tenantId);
  const membershipId = requiredContext(context?.membershipId);
  const userId = requiredContext(context?.userId);
  const rows = await tx.$queryRaw(Prisma.sql`
    SELECT m."id",m."public_ref",m."tenant_id",m."user_id",m."role"::text AS "role",
      m."status"::text AS "membership_status",m."granted_permissions",m."denied_permissions",
      u."status" AS "user_status",u."name" AS "user_name",t."status"::text AS "tenant_status"
    FROM "osi"."tenant_memberships" m
    JOIN "osi"."osi_users" u ON u."id"=m."user_id"
    JOIN "osi"."tenants" t ON t."id"=m."tenant_id"
    WHERE m."tenant_id"=${tenantId} AND m."id"=${membershipId} AND m."user_id"=${userId}
    LIMIT 1 FOR KEY SHARE OF m
  `);
  const row = rows[0];
  if (
    !row ||
    row.membership_status !== "ACTIVE" ||
    String(row.user_status).toUpperCase() !== "ACTIVE" ||
    row.tenant_status !== "ACTIVE"
  ) {
    personnelFail("PERSONNEL_POLICIES_FORBIDDEN", 403);
  }
  const denied = new Set((row.denied_permissions || []).map(String));
  const effective = new Set(
    [
      ...permsForRole(row.role),
      ...(row.granted_permissions || []).map(String),
    ].filter((permission) => !denied.has(permission)),
  );
  const required = Array.isArray(permissions) ? permissions : [permissions];
  const permitted = any
    ? required.some((permission) => effective.has(permission))
    : required.every((permission) => effective.has(permission));
  if (!permitted) personnelFail("PERSONNEL_POLICIES_FORBIDDEN", 403);
  return Object.freeze({
    tenantId,
    membershipId: String(row.id),
    membershipRef: String(row.public_ref),
    userId: String(row.user_id),
    userName: String(row.user_name),
    role: String(row.role),
    effective,
  });
}

async function limits(tx) {
  await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '300ms'");
  await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '10s'");
}
async function lock(tx, tenantId, scope) {
  const rows = await tx.$queryRaw(
    Prisma.sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${`PERSONNEL-14A:${tenantId}:${scope}`},0)) AS "ok"`,
  );
  if (rows[0]?.ok !== true) personnelFail("PERSONNEL_POLICIES_CONFLICT", 409);
}
async function replay(tx, tenantId, command) {
  const prior = await tx.personnelPolicyCommand.findFirst({
    where: { tenantId, requestId: command.requestId },
  });
  if (!prior) return null;
  if (
    prior.operation !== command.operation ||
    prior.payloadHash !== command.payloadHash
  )
    personnelFail("PERSONNEL_POLICIES_IDEMPOTENCY_CONFLICT", 409);
  return prior.resultJson;
}

function instant(value) {
  return value ? new Date(value).toISOString() : null;
}
function profileDto(row) {
  return Object.freeze({
    profileRef: row.profileRef,
    displayName: row.membership.user.name,
    jobTitle: row.jobTitle,
    employmentStatus: row.employmentStatus,
    availabilityStatus: row.availabilityStatus,
    restrictions: row.operationalRestrictions,
    notes: row.operationalNotes,
    validFrom: instant(row.operationalValidFrom),
    validTo: instant(row.operationalValidTo),
    capabilities: row.capabilityAssignments.map((entry) => ({
      assignmentRef: entry.assignmentRef,
      capabilityRef: entry.capability.capabilityRef,
      code: entry.capability.code,
      name: entry.capability.name,
      restrictions: entry.restrictions,
      validFrom: instant(entry.validFrom),
      validTo: instant(entry.validTo),
    })),
    zones: row.zoneAssignments.map((entry) => ({
      assignmentRef: entry.assignmentRef,
      ruleRef: entry.logisticsRule.ruleRef,
      code: entry.logisticsRule.code,
      name: entry.logisticsRule.name,
      validFrom: instant(entry.validFrom),
      validTo: instant(entry.validTo),
    })),
    overrides: row.scheduleOverrides.map((entry) => ({
      overrideRef: entry.overrideRef,
      kind: entry.kind,
      startsAt: entry.startsAt.toISOString(),
      endsAt: entry.endsAt.toISOString(),
      method: entry.method,
      travelBufferMinutes: entry.travelBufferMinutes,
      reason: entry.reason,
      status: entry.status,
      version: entry.version,
    })),
  });
}
function policyDto(row) {
  if (!row) return null;
  return Object.freeze({
    policyRef: row.policyRef,
    seriesRef: row.seriesRef,
    version: row.version,
    state: row.state,
    timezone: row.timezone,
    defaultVisitMinutes: row.defaultVisitMinutes,
    minimumTravelBufferMinutes: row.minimumTravelBufferMinutes,
    virtualPreparationMinutes: row.virtualPreparationMinutes,
    validFrom: instant(row.validFrom),
    validTo: instant(row.validTo),
    windows: row.windows.map((window) => ({
      windowRef: window.windowRef,
      weekday: window.weekday,
      startMinute: window.startMinute,
      endMinute: window.endMinute,
      capacity: window.capacity,
      method: window.method,
      calendarDate: window.calendarDate
        ? window.calendarDate.toISOString().slice(0, 10)
        : null,
      zone: window.logisticsRule
        ? {
            ruleRef: window.logisticsRule.ruleRef,
            code: window.logisticsRule.code,
            name: window.logisticsRule.name,
          }
        : null,
      requiresApproval: window.requiresApproval,
      kind: window.kind,
    })),
  });
}
function exceptionDto(row) {
  return Object.freeze({
    requestRef: row.requestRef,
    caseRef: row.pipelineCase.publicRef,
    caseCode: row.pipelineCase.caseCode,
    evaluator: {
      profileRef: row.evaluatorProfile.profileRef,
      displayName: row.evaluatorMembership.user.name,
    },
    reason: {
      reasonRef: row.visitReason.reasonRef,
      code: row.visitReason.code,
      name: row.visitReason.name,
    },
    method: row.method,
    requestedStart: row.requestedStart.toISOString(),
    requestedEnd: row.requestedEnd.toISOString(),
    requesterOrigin: row.requesterOrigin,
    reasonDescription: row.reasonDescription,
    requiredResources: row.requiredResourcesSnapshot,
    impact: row.impactSnapshot,
    violatedRules: row.violatedRulesSnapshot,
    status: row.status,
    evaluatorResponse: row.evaluatorResponse,
    adminDecision: row.adminDecision,
    alternativeStart: instant(row.proposedAlternativeStart),
    alternativeEnd: instant(row.proposedAlternativeEnd),
    version: row.version,
    expiresAt: instant(row.expiresAt),
  });
}

export async function getPersonnelPoliciesWorkspace(
  context,
  rawQuery,
  database,
) {
  const query = normalizePersonnelPoliciesQuery(rawQuery);
  return database.$transaction(
    async (tx) => {
      const who = await actor(tx, context, READ_PERMISSIONS, { any: true });
      const now = new Date();
      const canProfiles = who.effective.has(PERMS.PERSONNEL_PROFILES_VIEW);
      const canCapabilities = who.effective.has(
        PERMS.PERSONNEL_CAPABILITIES_VIEW,
      );
      const canPolicies = who.effective.has(PERMS.SCHEDULING_POLICIES_VIEW);
      const canApprove = who.effective.has(PERMS.SCHEDULING_EXCEPTIONS_APPROVE);
      const canRespond = who.effective.has(PERMS.SCHEDULING_EXCEPTIONS_RESPOND);
      const canRequest = who.effective.has(PERMS.SCHEDULING_EXCEPTIONS_REQUEST);
      if (
        (query.section === "PERSONNEL" && !canProfiles) ||
        (query.section === "POLICIES" && !canPolicies) ||
        (query.section === "EXCEPTIONS" &&
          !canApprove &&
          !canRespond &&
          !canRequest)
      )
        personnelFail("PERSONNEL_POLICIES_FORBIDDEN", 403);
      const exceptionScope = canApprove
        ? {}
        : {
            OR: [
              ...(canRespond
                ? [
                    {
                      evaluatorMembershipId: who.membershipId,
                      evaluatorUserId: who.userId,
                    },
                  ]
                : []),
              ...(canRequest
                ? [
                    {
                      requestedByMembershipId: who.membershipId,
                      requestedByUserId: who.userId,
                    },
                  ]
                : []),
            ],
          };
      const [profiles, capabilities, policy, reasons, exceptions, zoneRules] =
        await Promise.all([
          canProfiles
            ? tx.employeeProfile.findMany({
                where: {
                  tenantId: who.tenantId,
                  ...(query.profileRef ? { profileRef: query.profileRef } : {}),
                },
                include: {
                  membership: { include: { user: true } },
                  capabilityAssignments: {
                    where: { status: "ACTIVE" },
                    include: { capability: true },
                    orderBy: { createdAt: "asc" },
                  },
                  zoneAssignments: {
                    where: { status: "ACTIVE" },
                    include: { logisticsRule: true },
                    orderBy: { createdAt: "asc" },
                  },
                  scheduleOverrides: {
                    where: { status: "ACTIVE", endsAt: { gte: now } },
                    orderBy: { startsAt: "asc" },
                  },
                },
                orderBy: { membership: { user: { name: "asc" } } },
              })
            : [],
          canCapabilities
            ? tx.operationalCapability.findMany({
                where: { tenantId: who.tenantId },
                orderBy: [{ status: "asc" }, { name: "asc" }],
              })
            : [],
          canPolicies
            ? tx.visitPolicyVersion.findFirst({
                where: { tenantId: who.tenantId, state: "ACTIVE" },
                include: {
                  windows: {
                    include: { logisticsRule: true },
                    orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
                  },
                },
              })
            : null,
          canPolicies || canRequest
            ? tx.visitReason.findMany({
                where: { tenantId: who.tenantId, status: "ACTIVE" },
                orderBy: [
                  { kind: "asc" },
                  { sortOrder: "asc" },
                  { name: "asc" },
                ],
              })
            : [],
          canApprove || canRespond || canRequest
            ? tx.afterHoursVisitRequest.findMany({
                where: {
                  tenantId: who.tenantId,
                  ...exceptionScope,
                  ...(query.caseRef
                    ? { pipelineCase: { publicRef: query.caseRef } }
                    : {}),
                },
                include: {
                  pipelineCase: true,
                  evaluatorProfile: true,
                  evaluatorMembership: { include: { user: true } },
                  visitReason: true,
                },
                orderBy: { createdAt: "desc" },
                take: 100,
              })
            : [],
          canPolicies || canProfiles
            ? tx.logisticsRule.findMany({
                where: {
                  tenantId: who.tenantId,
                  family: "ZONE",
                  state: "ACTIVE",
                },
                orderBy: [{ priority: "desc" }, { name: "asc" }],
              })
            : [],
        ]);
      return Object.freeze({
        personnel: profiles.map(profileDto),
        capabilities: capabilities.map((row) => ({
          capabilityRef: row.capabilityRef,
          code: row.code,
          name: row.name,
          description: row.description,
          status: row.status,
          version: row.version,
        })),
        activePolicy: policyDto(policy),
        reasons: reasons.map((row) => ({
          reasonRef: row.reasonRef,
          code: row.code,
          name: row.name,
          kind: row.kind,
          requesterOrigin: row.requesterOrigin,
          visibleToClient: row.visibleToClient,
          visibleToEvaluator: row.visibleToEvaluator,
        })),
        exceptions: exceptions.map(exceptionDto),
        zones: zoneRules.map((row) => ({
          ruleRef: row.ruleRef,
          code: row.code,
          name: row.name,
        })),
        precedence: [
          "EMPLOYEE_OVERRIDE",
          "APPROVED_EXCEPTION",
          "TENANT_POLICY",
          "FAIL_CLOSED",
        ],
        generatedAt: now.toISOString(),
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      timeout: 10_000,
    },
  );
}

async function byProfile(tx, who, profileRef) {
  const row = await tx.employeeProfile.findFirst({
    where: { tenantId: who.tenantId, profileRef },
    include: { membership: { include: { user: true } } },
  });
  if (
    !row ||
    row.membership.status !== "ACTIVE" ||
    String(row.membership.user.status).toUpperCase() !== "ACTIVE"
  )
    personnelFail("PERSONNEL_POLICIES_NOT_FOUND", 404);
  return row;
}
async function byRule(tx, who, ruleRef) {
  const row = await tx.logisticsRule.findFirst({
    where: { tenantId: who.tenantId, ruleRef, family: "ZONE", state: "ACTIVE" },
  });
  if (!row) personnelFail("PERSONNEL_POLICIES_NOT_FOUND", 404);
  return row;
}
async function byReason(tx, who, reasonRef, kind) {
  const row = await tx.visitReason.findFirst({
    where: {
      tenantId: who.tenantId,
      reasonRef,
      status: "ACTIVE",
      ...(kind ? { kind } : {}),
    },
  });
  if (!row) personnelFail("PERSONNEL_POLICIES_NOT_FOUND", 404);
  return row;
}
async function byAssignment(tx, who, assignmentRef) {
  const row = await tx.surveyAssignment.findFirst({
    where: { tenantId: who.tenantId, assignmentRef },
    include: {
      pipelineCase: {
        include: {
          client: true,
          routeSnapshots: {
            orderBy: [
              { routeVersion: "desc" },
              { role: "asc" },
              { stopOrder: "asc" },
            ],
          },
        },
      },
      evaluatorMembership: { include: { user: true } },
      evaluationDecision: true,
      visitReason: true,
    },
  });
  if (!row) personnelFail("PERSONNEL_POLICIES_NOT_FOUND", 404);
  return row;
}

function capabilityForMethod(method) {
  if (method === "IN_PERSON") return "CAN_PERFORM_IN_PERSON_SURVEY";
  if (method === "VIRTUAL") return "CAN_PERFORM_VIRTUAL_SURVEY";
  if (method === "CLIENT_PHOTOS_DOCUMENTS")
    return "CAN_PERFORM_PHOTO_BASED_SURVEY";
  return null;
}
async function evaluatorAuthority(tx, who, profile, method) {
  const code = capabilityForMethod(method);
  if (!code) return;
  const count = await tx.operationalCapabilityAssignment.count({
    where: {
      tenantId: who.tenantId,
      employeeProfileId: profile.id,
      status: "ACTIVE",
      AND: [
        { OR: [{ validFrom: null }, { validFrom: { lte: new Date() } }] },
        { OR: [{ validTo: null }, { validTo: { gt: new Date() } }] },
      ],
      capability: { code, status: "ACTIVE" },
    },
  });
  if (count !== 1)
    personnelFail("PERSONNEL_OPERATIONAL_CAPABILITY_REQUIRED", 409);
}
function minuteOfDay(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => parts.find((entry) => entry.type === type)?.value;
  const day = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[
    get("weekday")
  ];
  return {
    weekday: day,
    minute: Number(get("hour")) * 60 + Number(get("minute")),
    date: `${get("year")}-${get("month")}-${get("day")}`,
  };
}
function conflicts(windows) {
  const ordered = [...windows].sort(
    (a, b) =>
      (a.calendarDate || "").localeCompare(b.calendarDate || "") ||
      a.weekday - b.weekday ||
      a.method.localeCompare(b.method) ||
      (a.zoneRuleRef || "").localeCompare(b.zoneRuleRef || "") ||
      a.startMinute - b.startMinute,
  );
  return ordered.some((entry, index) => {
    const previous = ordered[index - 1];
    return (
      previous &&
      previous.calendarDate === entry.calendarDate &&
      previous.weekday === entry.weekday &&
      previous.method === entry.method &&
      previous.zoneRuleRef === entry.zoneRuleRef &&
      entry.startMinute < previous.endMinute
    );
  });
}
async function activePolicy(tx, who) {
  const now = new Date();
  const rows = await tx.visitPolicyVersion.findMany({
    where: {
      tenantId: who.tenantId,
      state: "ACTIVE",
      AND: [
        { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
        { OR: [{ validTo: null }, { validTo: { gt: now } }] },
      ],
    },
    include: { windows: true },
    take: 2,
  });
  if (rows.length !== 1) personnelFail("PERSONNEL_VISIT_POLICY_REQUIRED", 409);
  return rows[0];
}
export async function resolvePersonnelScheduleAuthority(
  tx,
  who,
  profile,
  method,
  start,
  end,
  exceptionRef = null,
  motorTravelMinutes = 0,
  excludeAssignmentId = null,
) {
  if (end <= start) personnelFail("PERSONNEL_POLICIES_INPUT_INVALID");
  await evaluatorAuthority(tx, who, profile, method);
  const policy = await activePolicy(tx, who);
  const overrides = await tx.operationalScheduleOverride.findMany({
    where: {
      tenantId: who.tenantId,
      employeeProfileId: profile.id,
      status: "ACTIVE",
      startsAt: { lte: start },
      endsAt: { gte: end },
      OR: [{ method: null }, { method }],
    },
    orderBy: { createdAt: "desc" },
    take: 2,
  });
  if (
    overrides.length > 1 &&
    overrides[0].createdAt.getTime() === overrides[1].createdAt.getTime()
  )
    personnelFail("PERSONNEL_VISIT_POLICY_CONFLICT", 409);
  const override = overrides[0] || null;
  if (override?.kind === "UNAVAILABLE")
    personnelFail("PERSONNEL_AFTER_HOURS_REQUEST_REQUIRED", 409);
  const activeZones = await tx.operationalZoneAssignment.findMany({
    where: {
      tenantId: who.tenantId,
      employeeProfileId: profile.id,
      status: "ACTIVE",
      AND: [
        { OR: [{ validFrom: null }, { validFrom: { lte: start } }] },
        { OR: [{ validTo: null }, { validTo: { gt: end } }] },
      ],
    },
    select: { logisticsRuleId: true },
  });
  const zoneIds = new Set(activeZones.map((entry) => entry.logisticsRuleId));
  const local = minuteOfDay(start, policy.timezone);
  const scopedWindows = policy.windows.filter(
    (window) =>
      window.weekday === local.weekday &&
      window.method === method &&
      (!window.logisticsRuleId || zoneIds.has(window.logisticsRuleId)) &&
      window.startMinute <= local.minute &&
      window.endMinute >= local.minute + Math.ceil((end - start) / 60_000),
  );
  const datedWindows = scopedWindows.filter(
    (window) => window.calendarDate?.toISOString().slice(0, 10) === local.date,
  );
  const effectiveWindows = datedWindows.length
    ? datedWindows
    : scopedWindows.filter((window) => !window.calendarDate);
  const windows = effectiveWindows.some(
    (window) => window.kind === "SPECIAL_CLOSURE",
  )
    ? []
    : effectiveWindows;
  const approved = exceptionRef
    ? await tx.afterHoursVisitRequest.findFirst({
        where: {
          tenantId: who.tenantId,
          requestRef: exceptionRef,
          status: "APPROVED",
          evaluatorProfileId: profile.id,
          requestedStart: start,
          requestedEnd: end,
        },
      })
    : null;
  if (
    override?.kind !== "AVAILABLE" &&
    (!windows.length || windows[0]?.requiresApproval) &&
    !approved
  )
    personnelFail("PERSONNEL_AFTER_HOURS_REQUEST_REQUIRED", 409);
  if (windows.length > 1) personnelFail("PERSONNEL_VISIT_POLICY_CONFLICT", 409);
  const physical = method === "IN_PERSON";
  const buffer = physical
    ? Math.max(
        policy.minimumTravelBufferMinutes,
        override?.kind === "TRAVEL_BUFFER"
          ? override.travelBufferMinutes || 0
          : 0,
        Number.isFinite(Number(motorTravelMinutes))
          ? Number(motorTravelMinutes)
          : 0,
      )
    : policy.virtualPreparationMinutes;
  const occupied = await tx.surveyAssignment.count({
    where: {
      tenantId: who.tenantId,
      ...(excludeAssignmentId ? { id: { not: excludeAssignmentId } } : {}),
      evaluatorMembershipId: profile.membershipId,
      evaluatorUserId: profile.userId,
      status: { in: ["ASSIGNED", "ARRIVED", "IN_PROGRESS"] },
      scheduledStart: { lt: new Date(end.getTime() + buffer * 60_000) },
      OR: [
        { scheduledEnd: null },
        { scheduledEnd: { gt: new Date(start.getTime() - buffer * 60_000) } },
      ],
    },
  });
  if (occupied > 0) personnelFail("PERSONNEL_EVALUATOR_UNAVAILABLE", 409);
  if (windows[0]) {
    const candidates = await tx.surveyAssignment.findMany({
      where: {
        tenantId: who.tenantId,
        ...(excludeAssignmentId ? { id: { not: excludeAssignmentId } } : {}),
        operationalPolicyId: policy.id,
        status: { in: ["ASSIGNED", "ARRIVED", "IN_PROGRESS"] },
        scheduledStart: {
          gte: new Date(start.getTime() - 864e5),
          lt: new Date(start.getTime() + 864e5),
        },
        evaluationDecision: { method },
      },
      select: { scheduledStart: true },
    });
    const matchingCount = candidates.filter((entry) => {
      const localEntry = minuteOfDay(entry.scheduledStart, policy.timezone);
      return (
        localEntry.weekday === local.weekday &&
        localEntry.minute >= windows[0].startMinute &&
        localEntry.minute < windows[0].endMinute
      );
    }).length;
    if (matchingCount >= windows[0].capacity)
      personnelFail("PERSONNEL_VISIT_WINDOW_FULL", 409);
  }
  return { policy, buffer, window: windows[0] || null };
}

async function latestLogistics(tx, who, pipelineCaseId) {
  return tx.logisticsPlanRevision.findFirst({
    where: {
      tenantId: who.tenantId,
      status: "PUBLISHED",
      plan: { pipelineCaseId },
    },
    include: {
      items: { orderBy: { position: "asc" } },
      issues: { where: { status: "OPEN" } },
    },
    orderBy: { revision: "desc" },
  });
}
function logisticsSnapshot(revision) {
  if (!revision)
    return {
      revisionId: null,
      resources: [],
      impact: { logisticsStatus: "NOT_AVAILABLE" },
      violations: ["LOGISTICS_PLAN_REQUIRED"],
    };
  const resources = revision.items
    .filter((item) =>
      [
        "ASSET",
        "EXTERNAL",
        "TRANSPORT",
        "PER_DIEM",
        "LODGING",
        "TOLL",
        "PARKING",
      ].includes(item.family),
    )
    .map((item) => ({
      family: item.family,
      kind: item.kind,
      label: item.label,
      quantity: item.quantity == null ? null : Number(item.quantity),
      unit: item.unit,
      availability: item.availability,
    }));
  const violations = [
    ...revision.issues.map((issue) => issue.code),
    ...revision.items
      .filter(
        (item) =>
          item.shortageQuantity != null && Number(item.shortageQuantity) > 0,
      )
      .map((item) => `RESOURCE_SHORTAGE:${item.family}`),
  ];
  const result =
    revision.resultSnapshot && typeof revision.resultSnapshot === "object"
      ? revision.resultSnapshot
      : {};
  return {
    revisionId: revision.id,
    resources,
    impact: {
      zoneCode: typeof result.zoneCode === "string" ? result.zoneCode : null,
      distanceKm: Number.isFinite(Number(result.distanceKm))
        ? Number(result.distanceKm)
        : null,
      travelMinutes: Number.isFinite(Number(result.travelMinutes))
        ? Number(result.travelMinutes)
        : null,
      resourceStatus: violations.length ? "REVIEW_REQUIRED" : "AVAILABLE",
    },
    violations,
  };
}

async function event(
  tx,
  who,
  command,
  eventType,
  aggregateRef,
  beforeSnapshot,
  afterSnapshot,
) {
  return tx.visitPolicyEvent.create({
    data: {
      tenantId: who.tenantId,
      aggregateType: command.operation,
      aggregateRef,
      eventType,
      beforeSnapshot: beforeSnapshot === null ? Prisma.DbNull : beforeSnapshot,
      afterSnapshot,
      actorMembershipId: who.membershipId,
      actorUserId: who.userId,
      requestId: command.requestId,
    },
  });
}
async function persist(
  tx,
  who,
  command,
  targetRef,
  eventType,
  result,
  beforeSnapshot = null,
) {
  await event(tx, who, command, eventType, targetRef, beforeSnapshot, result);
  await tx.personnelPolicyCommand.create({
    data: {
      tenantId: who.tenantId,
      requestId: command.requestId,
      operation: command.operation,
      payloadHash: command.payloadHash,
      targetRef,
      resultJson: result,
      actorMembershipId: who.membershipId,
      actorUserId: who.userId,
    },
  });
  await appendCommercialAudit(
    tx,
    {
      tenantId: who.tenantId,
      actorKind: "MEMBERSHIP",
      actorMembershipId: who.membershipId,
    },
    {
      source: SOURCE,
      action: eventType,
      entity: "PERSONNEL_OPERATIONAL_POLICY",
      entityId: targetRef,
      requestId: command.requestId,
      correlationId: command.requestId,
      beforeJson: beforeSnapshot,
      afterJson: result,
      metadataJson: { operation: command.operation },
    },
  );
  return result;
}

export async function prepareOperationalSchedulingCommunications(
  tx,
  who,
  assignment,
  reason,
  milestone,
) {
  const categories =
    milestone === "EVALUATOR_ASSIGNMENT"
      ? ["EVALUATOR_ASSIGNMENT"]
      : ["VISIT_CONFIRMATION"];
  const templates = await tx.communicationTemplate.findMany({
    where: {
      tenantId: who.tenantId,
      state: "PUBLISHED",
      category: { in: categories },
    },
    include: {
      versions: {
        where: { state: "PUBLISHED" },
        orderBy: { version: "desc" },
        take: 1,
      },
    },
  });
  if (!templates.length) return [];
  const routes = assignment.pipelineCase.routeSnapshots.filter(
    (entry) => entry.routeVersion === assignment.routeVersion,
  );
  const address = (role) => {
    const row = routes.find((entry) => entry.role === role);
    return row
      ? [
          row.streetAndNumber,
          row.sector,
          row.cityMunicipality,
          row.provinceState,
          row.countryCode,
        ]
          .filter(Boolean)
          .join(", ")
      : "Por confirmar";
  };
  const resources = Array.isArray(assignment.resourcesSnapshot)
    ? assignment.resourcesSnapshot
        .map((entry) => entry.label)
        .filter(Boolean)
        .join(", ")
    : "";
  const variables = {
    "client.name": assignment.pipelineCase.client?.displayName || "Cliente",
    "case.reference": assignment.pipelineCase.caseCode,
    "survey.date": assignment.scheduledStart.toISOString().slice(0, 10),
    "survey.time": assignment.scheduledStart.toISOString().slice(11, 16),
    "evaluator.name": assignment.evaluatorMembership.user.name,
    "origin.address": address("ORIGIN"),
    "destination.address": address("DESTINATION"),
    "booker.name": "Booker",
    "leadAccount.name": "Lead Account",
    "agent.name": "Agente",
    "quote.reference": "Propuesta",
    "quote.validUntil": "Vigencia por confirmar",
    "visit.fee": "Tarifa por confirmar",
    "visit.instructions":
      assignment.instructionSnapshot || "Sin instrucciones adicionales",
    "visit.reason": reason?.name || "Visita programada",
    "visit.method":
      assignment.evaluationDecision?.method || "Método por confirmar",
    "visit.travelMinutes": assignment.travelBufferMinutes
      ? `${assignment.travelBufferMinutes} min`
      : "No aplica",
    "visit.resources": resources || "Sin recursos adicionales",
  };
  const created = [];
  for (const template of templates) {
    const version = template.versions[0];
    if (!version) continue;
    const audience =
      version.audiences.includes("EVALUATOR") &&
      milestone === "EVALUATOR_ASSIGNMENT"
        ? "EVALUATOR"
        : version.audiences.includes("CLIENT")
          ? "CLIENT"
          : null;
    if (!audience) continue;
    const recipientRef =
      audience === "CLIENT"
        ? assignment.pipelineCase.client?.publicRef
        : assignment.evaluatorMembership.publicRef;
    if (!recipientRef) continue;
    const rendered = renderCommunicationTemplate(
      {
        subject: version.subjectTemplate,
        bodyText: version.bodyTextTemplate,
        bodyHtml: version.bodyHtmlTemplate,
      },
      variables,
    );
    const channel =
      audience === "EVALUATOR" && version.channels.includes("INTERNAL")
        ? "INTERNAL"
        : version.channels[0];
    const contentSha256 = communicationHash(rendered);
    const row = await tx.communicationRecord.create({
      data: {
        tenantId: who.tenantId,
        pipelineCaseId: assignment.pipelineCaseId,
        templateVersionId: version.id,
        surveyAssignmentId: assignment.id,
        milestone,
        channel,
        recipientType: audience,
        recipientRef,
        recipientSnapshot: {
          audience,
          displayName:
            audience === "CLIENT"
              ? variables["client.name"]
              : variables["evaluator.name"],
        },
        renderedSubject: rendered.subject,
        renderedBodyText: rendered.bodyText,
        renderedBodyHtml: rendered.bodyHtml,
        resolvedVariables: variables,
        contextSnapshot: {
          caseRef: assignment.pipelineCase.publicRef,
          assignmentRef: assignment.assignmentRef,
          reason: reason?.code || null,
        },
        contentSha256,
        status: "PREPARED",
        preparedByMembershipId: who.membershipId,
        preparedByUserId: who.userId,
      },
    });
    created.push({
      communicationRef: row.communicationRef,
      audience,
      channel,
      status: row.status,
    });
  }
  return created;
}

async function execute(tx, who, command) {
  if (command.operation === "PROFILE_UPDATE") {
    const current = await byProfile(tx, who, command.profileRef);
    const before = {
      profileRef: current.profileRef,
      jobTitle: current.jobTitle,
      availabilityStatus: current.availabilityStatus,
      restrictions: current.operationalRestrictions,
      notes: current.operationalNotes,
      validFrom: instant(current.operationalValidFrom),
      validTo: instant(current.operationalValidTo),
    };
    const row = await tx.employeeProfile.update({
      where: { id: current.id },
      data: {
        jobTitle: command.jobTitle,
        availabilityStatus: command.availabilityStatus,
        operationalRestrictions: command.restrictions,
        operationalNotes: command.notes,
        operationalValidFrom: command.validFrom
          ? new Date(command.validFrom)
          : null,
        operationalValidTo: command.validTo ? new Date(command.validTo) : null,
      },
    });
    return persist(
      tx,
      who,
      command,
      row.profileRef,
      "PROFILE_UPDATED",
      {
        profileRef: row.profileRef,
        availabilityStatus: row.availabilityStatus,
        replayed: false,
      },
      before,
    );
  }
  if (command.operation === "CAPABILITY_CREATE") {
    const row = await tx.operationalCapability.create({
      data: {
        tenantId: who.tenantId,
        code: command.code,
        name: command.name,
        description: command.description,
        actorMembershipId: who.membershipId,
        actorUserId: who.userId,
        requestId: command.requestId,
        payloadHash: command.payloadHash,
      },
    });
    return persist(tx, who, command, row.capabilityRef, "CAPABILITY_CREATED", {
      capabilityRef: row.capabilityRef,
      code: row.code,
      status: row.status,
      version: row.version,
      replayed: false,
    });
  }
  if (command.operation === "CAPABILITY_ASSIGN") {
    const profile = await byProfile(tx, who, command.profileRef);
    const capability = await tx.operationalCapability.findFirst({
      where: {
        tenantId: who.tenantId,
        capabilityRef: command.capabilityRef,
        status: "ACTIVE",
      },
    });
    if (!capability) personnelFail("PERSONNEL_POLICIES_NOT_FOUND", 404);
    const row = await tx.operationalCapabilityAssignment.create({
      data: {
        tenantId: who.tenantId,
        employeeProfileId: profile.id,
        capabilityId: capability.id,
        restrictions: command.restrictions,
        validFrom: command.validFrom ? new Date(command.validFrom) : null,
        validTo: command.validTo ? new Date(command.validTo) : null,
        actorMembershipId: who.membershipId,
        actorUserId: who.userId,
        requestId: command.requestId,
        payloadHash: command.payloadHash,
      },
    });
    return persist(tx, who, command, row.assignmentRef, "CAPABILITY_ASSIGNED", {
      assignmentRef: row.assignmentRef,
      profileRef: profile.profileRef,
      capabilityRef: capability.capabilityRef,
      status: row.status,
      replayed: false,
    });
  }
  if (command.operation === "CAPABILITY_REVOKE") {
    const row = await tx.operationalCapabilityAssignment.findFirst({
      where: {
        tenantId: who.tenantId,
        assignmentRef: command.assignmentRef,
        status: "ACTIVE",
      },
    });
    if (!row) personnelFail("PERSONNEL_POLICIES_NOT_FOUND", 404);
    const updated = await tx.operationalCapabilityAssignment.update({
      where: { id: row.id },
      data: { status: "REVOKED", validTo: new Date() },
    });
    return persist(
      tx,
      who,
      command,
      updated.assignmentRef,
      "CAPABILITY_REVOKED",
      {
        assignmentRef: updated.assignmentRef,
        status: updated.status,
        reason: command.reason,
        replayed: false,
      },
      { status: row.status },
    );
  }
  if (command.operation === "ZONE_ASSIGN") {
    const profile = await byProfile(tx, who, command.profileRef);
    const rule = await byRule(tx, who, command.ruleRef);
    const row = await tx.operationalZoneAssignment.create({
      data: {
        tenantId: who.tenantId,
        employeeProfileId: profile.id,
        logisticsRuleId: rule.id,
        validFrom: command.validFrom ? new Date(command.validFrom) : null,
        validTo: command.validTo ? new Date(command.validTo) : null,
        actorMembershipId: who.membershipId,
        actorUserId: who.userId,
        requestId: command.requestId,
        payloadHash: command.payloadHash,
      },
    });
    return persist(tx, who, command, row.assignmentRef, "ZONE_ASSIGNED", {
      assignmentRef: row.assignmentRef,
      profileRef: profile.profileRef,
      ruleRef: rule.ruleRef,
      status: row.status,
      replayed: false,
    });
  }
  if (command.operation === "POLICY_PUBLISH") {
    if (conflicts(command.windows))
      personnelFail("PERSONNEL_VISIT_POLICY_CONFLICT", 409);
    const current = await tx.visitPolicyVersion.findFirst({
      where: { tenantId: who.tenantId },
      orderBy: { version: "desc" },
    });
    if ((current?.version || 0) !== command.expectedVersion)
      personnelFail("PERSONNEL_POLICIES_VERSION_CONFLICT", 409);
    const validFrom = new Date(command.validFrom);
    if (current?.state === "ACTIVE")
      await tx.visitPolicyVersion.update({
        where: { id: current.id },
        data: { state: "RETIRED", validTo: validFrom },
      });
    const ruleRefs = command.windows
      .map((entry) => entry.zoneRuleRef)
      .filter(Boolean);
    const rules = ruleRefs.length
      ? await tx.logisticsRule.findMany({
          where: {
            tenantId: who.tenantId,
            ruleRef: { in: ruleRefs },
            family: "ZONE",
            state: "ACTIVE",
          },
        })
      : [];
    if (rules.length !== new Set(ruleRefs).size)
      personnelFail("PERSONNEL_POLICIES_NOT_FOUND", 404);
    const ruleByRef = new Map(rules.map((row) => [row.ruleRef, row.id]));
    const row = await tx.visitPolicyVersion.create({
      data: {
        tenantId: who.tenantId,
        seriesRef: current?.seriesRef || randomUUID(),
        version: (current?.version || 0) + 1,
        state: "ACTIVE",
        timezone: command.timezone,
        defaultVisitMinutes: command.defaultVisitMinutes,
        minimumTravelBufferMinutes: command.minimumTravelBufferMinutes,
        virtualPreparationMinutes: command.virtualPreparationMinutes,
        validFrom,
        replacesPolicyId: current?.id || null,
        actorMembershipId: who.membershipId,
        actorUserId: who.userId,
        requestId: command.requestId,
        payloadHash: command.payloadHash,
        windows: {
          create: command.windows.map((entry) => ({
            weekday: entry.weekday,
            startMinute: entry.startMinute,
            endMinute: entry.endMinute,
            capacity: entry.capacity,
            method: entry.method,
            calendarDate: entry.calendarDate
              ? new Date(`${entry.calendarDate}T00:00:00.000Z`)
              : null,
            ...(entry.zoneRuleRef
              ? {
                  logisticsRule: {
                    connect: {
                      tenantId_id: {
                        tenantId: who.tenantId,
                        id: ruleByRef.get(entry.zoneRuleRef),
                      },
                    },
                  },
                }
              : {}),
            requiresApproval: entry.requiresApproval,
            kind: entry.kind,
          })),
        },
      },
      include: { windows: { include: { logisticsRule: true } } },
    });
    return persist(
      tx,
      who,
      command,
      row.policyRef,
      "POLICY_PUBLISHED",
      { ...policyDto(row), replayed: false },
      current
        ? {
            policyRef: current.policyRef,
            version: current.version,
            state: current.state,
          }
        : null,
    );
  }
  if (command.operation === "SCHEDULE_OVERRIDE_CREATE") {
    const profile = await byProfile(tx, who, command.profileRef);
    const rule = command.zoneRuleRef
      ? await byRule(tx, who, command.zoneRuleRef)
      : null;
    const row = await tx.operationalScheduleOverride.create({
      data: {
        tenantId: who.tenantId,
        employeeProfileId: profile.id,
        kind: command.kind,
        startsAt: new Date(command.startsAt),
        endsAt: new Date(command.endsAt),
        method: command.method,
        logisticsRuleId: rule?.id || null,
        travelBufferMinutes: command.travelBufferMinutes,
        reason: command.reason,
        actorMembershipId: who.membershipId,
        actorUserId: who.userId,
        requestId: command.requestId,
        payloadHash: command.payloadHash,
      },
    });
    return persist(
      tx,
      who,
      command,
      row.overrideRef,
      "SCHEDULE_OVERRIDE_CREATED",
      {
        overrideRef: row.overrideRef,
        profileRef: profile.profileRef,
        kind: row.kind,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        version: row.version,
        replayed: false,
      },
    );
  }
  if (command.operation === "VISIT_REASON_CREATE") {
    const row = await tx.visitReason.create({
      data: {
        tenantId: who.tenantId,
        code: command.code,
        name: command.name,
        kind: command.kind,
        requesterOrigin: command.requesterOrigin,
        visibleToClient: command.visibleToClient,
        visibleToEvaluator: command.visibleToEvaluator,
      },
    });
    return persist(tx, who, command, row.reasonRef, "VISIT_REASON_CREATED", {
      reasonRef: row.reasonRef,
      code: row.code,
      kind: row.kind,
      replayed: false,
    });
  }
  if (command.operation === "EXCEPTION_REQUEST") {
    const profile = await byProfile(tx, who, command.profileRef);
    await evaluatorAuthority(tx, who, profile, command.method);
    const reason = await byReason(tx, who, command.reasonRef);
    const pipelineCase = await tx.pipelineCase.findFirst({
      where: { tenantId: who.tenantId, publicRef: command.caseRef },
    });
    if (!pipelineCase) personnelFail("PERSONNEL_POLICIES_NOT_FOUND", 404);
    const assignment = command.assignmentRef
      ? await tx.surveyAssignment.findFirst({
          where: {
            tenantId: who.tenantId,
            assignmentRef: command.assignmentRef,
            pipelineCaseId: pipelineCase.id,
          },
        })
      : null;
    if (command.assignmentRef && !assignment)
      personnelFail("PERSONNEL_POLICIES_NOT_FOUND", 404);
    const physical = command.method === "IN_PERSON";
    const logistics = physical
      ? await latestLogistics(tx, who, pipelineCase.id)
      : null;
    const snapshot = physical
      ? logisticsSnapshot(logistics)
      : {
          revisionId: null,
          resources: [],
          impact: { logisticsStatus: "NOT_REQUIRED" },
          violations: [],
        };
    const row = await tx.afterHoursVisitRequest.create({
      data: {
        tenantId: who.tenantId,
        pipelineCaseId: pipelineCase.id,
        assignmentId: assignment?.id || null,
        evaluatorProfileId: profile.id,
        evaluatorMembershipId: profile.membershipId,
        evaluatorUserId: profile.userId,
        visitReasonId: reason.id,
        logisticsRevisionId: snapshot.revisionId,
        method: command.method,
        requestedStart: new Date(command.requestedStart),
        requestedEnd: new Date(command.requestedEnd),
        requesterOrigin: command.requesterOrigin,
        reasonDescription: command.reasonDescription,
        requiredResourcesSnapshot: snapshot.resources,
        impactSnapshot: snapshot.impact,
        violatedRulesSnapshot: [
          "OUTSIDE_TENANT_POLICY",
          ...snapshot.violations,
        ],
        requestedByMembershipId: who.membershipId,
        requestedByUserId: who.userId,
        expiresAt: new Date(
          Math.min(
            new Date(command.requestedStart).getTime(),
            Date.now() + 14 * 864e5,
          ),
        ),
      },
      include: {
        pipelineCase: true,
        evaluatorProfile: true,
        evaluatorMembership: { include: { user: true } },
        visitReason: true,
      },
    });
    return persist(tx, who, command, row.requestRef, "EXCEPTION_REQUESTED", {
      ...exceptionDto(row),
      replayed: false,
    });
  }
  if (command.operation === "EXCEPTION_RESPOND") {
    const row = await tx.afterHoursVisitRequest.findFirst({
      where: { tenantId: who.tenantId, requestRef: command.requestRef },
      include: {
        pipelineCase: true,
        evaluatorProfile: true,
        evaluatorMembership: { include: { user: true } },
        visitReason: true,
      },
    });
    if (!row) personnelFail("PERSONNEL_POLICIES_NOT_FOUND", 404);
    if (
      row.evaluatorMembershipId !== who.membershipId ||
      row.evaluatorUserId !== who.userId
    )
      personnelFail("PERSONNEL_POLICIES_NOT_FOUND", 404);
    if (
      row.version !== command.expectedVersion ||
      row.status !== "PENDING" ||
      row.evaluatorResponse !== "PENDING"
    )
      personnelFail("PERSONNEL_POLICIES_VERSION_CONFLICT", 409);
    if (
      (command.response === "ALTERNATIVE_PROPOSED") !==
      Boolean(command.alternativeStart && command.alternativeEnd)
    )
      personnelFail("PERSONNEL_POLICIES_INPUT_INVALID");
    const updated = await tx.afterHoursVisitRequest.update({
      where: { id: row.id },
      data: {
        evaluatorResponse: command.response,
        proposedAlternativeStart: command.alternativeStart
          ? new Date(command.alternativeStart)
          : null,
        proposedAlternativeEnd: command.alternativeEnd
          ? new Date(command.alternativeEnd)
          : null,
        responseReason: command.reason,
        version: { increment: 1 },
      },
      include: {
        pipelineCase: true,
        evaluatorProfile: true,
        evaluatorMembership: { include: { user: true } },
        visitReason: true,
      },
    });
    return persist(
      tx,
      who,
      command,
      row.requestRef,
      "EVALUATOR_RESPONDED",
      { ...exceptionDto(updated), replayed: false },
      { evaluatorResponse: row.evaluatorResponse, version: row.version },
    );
  }
  if (command.operation === "EXCEPTION_DECIDE") {
    const row = await tx.afterHoursVisitRequest.findFirst({
      where: { tenantId: who.tenantId, requestRef: command.requestRef },
      include: {
        pipelineCase: true,
        evaluatorProfile: true,
        evaluatorMembership: { include: { user: true } },
        visitReason: true,
      },
    });
    if (!row) personnelFail("PERSONNEL_POLICIES_NOT_FOUND", 404);
    if (
      row.version !== command.expectedVersion ||
      row.status !== "PENDING" ||
      row.adminDecision !== "PENDING"
    )
      personnelFail("PERSONNEL_POLICIES_VERSION_CONFLICT", 409);
    if (command.decision === "APPROVED" && row.evaluatorResponse !== "ACCEPTED")
      personnelFail("PERSONNEL_EVALUATOR_ACCEPTANCE_REQUIRED", 409);
    if (
      command.decision === "APPROVED" &&
      Array.isArray(row.violatedRulesSnapshot) &&
      row.violatedRulesSnapshot.some(
        (entry) =>
          entry === "LOGISTICS_PLAN_REQUIRED" ||
          String(entry).startsWith("RESOURCE_SHORTAGE"),
      )
    )
      personnelFail("PERSONNEL_RESOURCE_APPROVAL_REQUIRED", 409);
    const updated = await tx.afterHoursVisitRequest.update({
      where: { id: row.id },
      data: {
        adminDecision: command.decision,
        status: command.decision,
        decisionReason: command.reason,
        decidedByMembershipId: who.membershipId,
        decidedByUserId: who.userId,
        decidedAt: new Date(),
        version: { increment: 1 },
      },
      include: {
        pipelineCase: true,
        evaluatorProfile: true,
        evaluatorMembership: { include: { user: true } },
        visitReason: true,
      },
    });
    return persist(
      tx,
      who,
      command,
      row.requestRef,
      command.decision === "APPROVED" ? "ADMIN_APPROVED" : "ADMIN_REJECTED",
      {
        ...exceptionDto(updated),
        notificationRequired: true,
        notificationMilestone:
          command.decision === "APPROVED"
            ? "AFTER_HOURS_APPROVED"
            : "AFTER_HOURS_REJECTED",
        replayed: false,
      },
      { adminDecision: row.adminDecision, version: row.version },
    );
  }
  if (
    ["REBOOK_VISIT", "CANCEL_VISIT", "RECORD_CLIENT_CONFIRMATION"].includes(
      command.operation,
    )
  ) {
    const current = await byAssignment(tx, who, command.assignmentRef);
    if (
      current.version !== command.expectedVersion ||
      ["CANCELLED", "COMPLETED", "SUPERSEDED"].includes(current.status)
    )
      personnelFail("PERSONNEL_POLICIES_VERSION_CONFLICT", 409);
    if (command.operation === "RECORD_CLIENT_CONFIRMATION") {
      const updated = await tx.surveyAssignment.update({
        where: { id: current.id },
        data: {
          clientConfirmation: command.confirmation,
          version: { increment: 1 },
        },
      });
      return persist(
        tx,
        who,
        command,
        current.assignmentRef,
        "CLIENT_CONFIRMATION_RECORDED",
        {
          assignmentRef: updated.assignmentRef,
          clientConfirmation: updated.clientConfirmation,
          version: updated.version,
          replayed: false,
        },
        {
          clientConfirmation: current.clientConfirmation,
          version: current.version,
        },
      );
    }
    const reason = await byReason(
      tx,
      who,
      command.reasonRef,
      command.operation === "CANCEL_VISIT" ? "CANCELLATION" : "RESCHEDULE",
    );
    if (command.operation === "CANCEL_VISIT") {
      const updated = await tx.surveyAssignment.update({
        where: { id: current.id },
        data: { status: "CANCELLED", version: { increment: 1 } },
      });
      await tx.surveyAssignmentEvent.create({
        data: {
          tenantId: who.tenantId,
          pipelineCaseId: current.pipelineCaseId,
          evaluationDecisionId: current.evaluationDecisionId,
          assignmentId: current.id,
          eventType: "CANCELLED",
          reasonCode: reason.code,
          notificationRequired: true,
          beforeSnapshot: {
            assignmentRef: current.assignmentRef,
            status: current.status,
          },
          afterSnapshot: {
            assignmentRef: updated.assignmentRef,
            status: updated.status,
          },
          actorMembershipId: who.membershipId,
          actorUserId: who.userId,
        },
      });
      const communications = await prepareOperationalSchedulingCommunications(
        tx,
        who,
        current,
        reason,
        "VISIT_CANCELLED",
      );
      return persist(
        tx,
        who,
        command,
        current.assignmentRef,
        "VISIT_CANCELLED",
        {
          assignmentRef: updated.assignmentRef,
          status: updated.status,
          version: updated.version,
          reason: { reasonRef: reason.reasonRef, code: reason.code },
          communications,
          replayed: false,
        },
        { status: current.status, version: current.version },
      );
    }
    const evaluatorProfile = await tx.employeeProfile.findFirst({
      where: {
        tenantId: who.tenantId,
        membershipId: current.evaluatorMembershipId,
      },
      select: { profileRef: true },
    });
    if (!evaluatorProfile) personnelFail("PERSONNEL_POLICIES_NOT_FOUND", 404);
    const profile = await byProfile(tx, who, evaluatorProfile.profileRef);
    const start = new Date(command.scheduledStart);
    const end = new Date(command.scheduledEnd);
    const logistics = await latestLogistics(tx, who, current.pipelineCaseId);
    const resources = logisticsSnapshot(logistics);
    const authority = await resolvePersonnelScheduleAuthority(
      tx,
      who,
      profile,
      current.evaluationDecision.method,
      start,
      end,
      null,
      resources.impact.travelMinutes || 0,
      current.id,
    );
    const replacement = await tx.surveyAssignment.create({
      data: {
        tenantId: who.tenantId,
        pipelineCaseId: current.pipelineCaseId,
        serviceRevisionId: current.serviceRevisionId,
        routeVersion: current.pipelineCase.routeRevision,
        evaluatorMembershipId: current.evaluatorMembershipId,
        evaluatorUserId: current.evaluatorUserId,
        scheduledStart: start,
        scheduledEnd: end,
        contextSnapshot: {
          ...(current.contextSnapshot || {}),
          rebookingOrigin: command.requesterOrigin,
          rebookingReason: command.reasonDescription,
        },
        instructionSnapshot: current.instructionSnapshot,
        evaluationDecisionId: current.evaluationDecisionId,
        schedulePolicyId: current.schedulePolicyId,
        operationalPolicyId: authority.policy.id,
        visitReasonId: reason.id,
        logisticsRevisionId: resources.revisionId,
        scheduleProfile: current.scheduleProfile,
        zoneCode: current.zoneCode,
        slotKey: current.slotKey,
        travelBufferMinutes: authority.buffer,
        clientConfirmation: "NOT_CONFIRMED",
        evaluatorConfirmation: "PENDING",
        resourcesSnapshot: resources.resources,
        replacesAssignmentId: current.id,
        createdByMembershipId: who.membershipId,
        createdByUserId: who.userId,
      },
      include: {
        pipelineCase: { include: { client: true, routeSnapshots: true } },
        evaluatorMembership: { include: { user: true } },
        evaluationDecision: true,
      },
    });
    await tx.surveyAssignment.update({
      where: { id: current.id },
      data: { status: "SUPERSEDED", version: { increment: 1 } },
    });
    await tx.surveyAssignmentEvent.create({
      data: {
        tenantId: who.tenantId,
        pipelineCaseId: current.pipelineCaseId,
        evaluationDecisionId: current.evaluationDecisionId,
        assignmentId: replacement.id,
        eventType: "RESCHEDULED",
        reasonCode: reason.code,
        notificationRequired: true,
        beforeSnapshot: {
          assignmentRef: current.assignmentRef,
          scheduledStart: current.scheduledStart,
          scheduledEnd: current.scheduledEnd,
        },
        afterSnapshot: {
          assignmentRef: replacement.assignmentRef,
          scheduledStart: replacement.scheduledStart,
          scheduledEnd: replacement.scheduledEnd,
          travelBufferMinutes: replacement.travelBufferMinutes,
        },
        actorMembershipId: who.membershipId,
        actorUserId: who.userId,
      },
    });
    const communications = await prepareOperationalSchedulingCommunications(
      tx,
      who,
      replacement,
      reason,
      "VISIT_RESCHEDULED",
    );
    return persist(
      tx,
      who,
      command,
      replacement.assignmentRef,
      "VISIT_RESCHEDULED",
      {
        assignmentRef: replacement.assignmentRef,
        replacesAssignmentRef: current.assignmentRef,
        status: replacement.status,
        version: replacement.version,
        reason: { reasonRef: reason.reasonRef, code: reason.code },
        travelBufferMinutes: replacement.travelBufferMinutes,
        communications,
        replayed: false,
      },
      { assignmentRef: current.assignmentRef, version: current.version },
    );
  }
  personnelFail("PERSONNEL_POLICIES_INPUT_INVALID");
}

export async function mutatePersonnelPolicies(context, raw, database) {
  const command = normalizePersonnelPolicyMutation(raw);
  try {
    return await database.$transaction(async (tx) => {
      await limits(tx);
      const who = await actor(
        tx,
        context,
        OPERATION_PERMISSION[command.operation],
      );
      await lock(tx, who.tenantId, `COMMAND:${command.requestId}`);
      const prior = await replay(tx, who.tenantId, command);
      if (prior) return { ...prior, replayed: true };
      if (
        ["POLICY_PUBLISH", "EXCEPTION_DECIDE", "REBOOK_VISIT"].includes(
          command.operation,
        )
      )
        await lock(tx, who.tenantId, command.operation);
      return execute(tx, who, command);
    }, SERIALIZABLE);
  } catch (error) {
    if (
      error instanceof PersonnelPoliciesError ||
      (typeof error?.code === "string" && Number.isInteger(error?.status))
    )
      throw error;
    const code = [error?.meta?.code, error?.cause?.code, error?.code].find(
      (value) => typeof value === "string",
    );
    if (["P2002", "P2034", "23505", "40001", "55P03", "57014"].includes(code))
      personnelFail("PERSONNEL_POLICIES_CONFLICT", 409, error);
    if (["P2003", "P2025", "23503", "23514"].includes(code))
      personnelFail("PERSONNEL_POLICIES_STATE_INVALID", 409, error);
    personnelFail("PERSONNEL_POLICIES_DATABASE_UNAVAILABLE", 503, error);
  }
}

export const __personnelPoliciesInternals = Object.freeze({
  capabilityForMethod,
  conflicts,
  logisticsSnapshot,
  minuteOfDay,
});
