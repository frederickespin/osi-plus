import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  mutatePersonnelPolicies,
  prepareOperationalSchedulingCommunications,
} from "../api/_lib/personnelPoliciesDomain.js";
import { personnelPayloadHash } from "../api/_lib/personnelPoliciesContract.js";

const EXPECTED_DATABASE = "v17_consolidated_preview_10b";
const EXPECTED_BRANCH = "br-mute-credit-ahxnvfx0";
const EXPECTED_BATCH = "V17-PERSONNEL-POLICIES-PREVIEW-14B";
const TENANT_CODE = "V17-CONSOLIDATED-PREVIEW-10B";
const OTHER_TENANT_CODE = "V17-CONSOLIDATED-PREVIEW-10B-X";
const REQUIRED_ADMIN = [
  "personnel:profiles:view",
  "personnel:profiles:manage",
  "personnel:capabilities:view",
  "personnel:capabilities:manage",
  "scheduling:policies:view",
  "scheduling:policies:manage",
  "scheduling:exceptions:request",
  "scheduling:exceptions:respond",
  "scheduling:exceptions:approve",
];

function fail(code) {
  throw new Error(`V17_PERSONNEL_PREVIEW_SEED_BLOCKED:${code}`);
}
function exact(value, expected, code) {
  if (value !== expected) fail(code);
}
function stableUuid(label) {
  const bytes = createHash("sha256")
    .update(`v17-personnel-preview-14b:${label}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function command(operation, payload, label) {
  const requestId = `V17-14B-${label}`;
  return {
    operation,
    requestId,
    ...payload,
    payloadHash: personnelPayloadHash({ operation, requestId, ...payload }),
  };
}
function guardEnvironment() {
  exact(
    process.env.V17_PERSONNEL_PREVIEW_SEED_MODE,
    "PREVIEW_REHEARSAL",
    "MODE",
  );
  exact(process.env.V17_PERSONNEL_PREVIEW_SEED_BATCH, EXPECTED_BATCH, "BATCH");
  if (
    process.env.VERCEL_ENV === "production" ||
    process.env.NODE_ENV === "production"
  )
    fail("PRODUCTION_ENVIRONMENT");
  const raw = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!raw) fail("DATABASE_URL_MISSING");
  const url = new URL(raw);
  exact(
    decodeURIComponent(url.pathname.slice(1)),
    EXPECTED_DATABASE,
    "DATABASE",
  );
  exact(url.searchParams.get("schema"), "osi", "SCHEMA");
  if (/fragrant-night|bitter-bush/i.test(url.hostname))
    fail("PRODUCTION_TARGET");
  return raw;
}

const prisma = new PrismaClient({ datasourceUrl: guardEnvironment() });

async function ensureProfile(
  tenant,
  membership,
  employeeCode,
  jobTitle,
  restrictions,
) {
  return prisma.employeeProfile.upsert({
    where: {
      tenantId_membershipId: {
        tenantId: tenant.id,
        membershipId: membership.id,
      },
    },
    update: {},
    create: {
      profileRef: stableUuid(`profile:${employeeCode}`),
      tenantId: tenant.id,
      membershipId: membership.id,
      userId: membership.userId,
      employeeCode,
      normalizedEmployeeCode: employeeCode,
      jobTitle,
      departmentCode: "SURVEY",
      employmentStatus: "ACTIVE",
      availabilityStatus: "AVAILABLE",
      operationalRestrictions: restrictions,
      operationalNotes: "Fixture sintético para revisión 14B",
      operationalValidFrom: new Date("2026-09-01T00:00:00.000Z"),
      provisioningSource: "MANUAL",
      provisioningBatchId: EXPECTED_BATCH,
    },
  });
}

async function ensureDecision(
  tenant,
  pipelineCase,
  serviceRevision,
  actor,
  method,
  label,
) {
  const decisionRef = stableUuid(`decision:${label}`);
  const existing = await prisma.surveyEvaluationDecision.findFirst({
    where: { tenantId: tenant.id, decisionRef },
  });
  if (existing) return existing;
  const version =
    (
      await prisma.surveyEvaluationDecision.aggregate({
        where: { tenantId: tenant.id, pipelineCaseId: pipelineCase.id },
        _max: { version: true },
      })
    )._max.version || 0;
  return prisma.surveyEvaluationDecision.create({
    data: {
      decisionRef,
      seriesRef: stableUuid(`decision-series:${label}`),
      tenantId: tenant.id,
      pipelineCaseId: pipelineCase.id,
      serviceRevisionId: serviceRevision.id,
      routeVersion: pipelineCase.routeRevision,
      version: version + 1,
      method,
      commercialState: "SCHEDULED",
      informationSource: "COMMERCIAL",
      rationaleCode: `PREVIEW_14B_${label}`,
      createdByMembershipId: actor.id,
      createdByUserId: actor.userId,
    },
  });
}

async function ensureAssignment({
  tenant,
  pipelineCase,
  serviceRevision,
  decision,
  evaluator,
  actor,
  policy,
  schedulePolicy,
  reason,
  label,
  method,
  start,
  end,
  status = "ASSIGNED",
  travelBufferMinutes,
  resources = [],
  replacesAssignmentId = null,
}) {
  const assignmentRef = stableUuid(`assignment:${label}`);
  const existing = await prisma.surveyAssignment.findFirst({
    where: { tenantId: tenant.id, assignmentRef },
    include: {
      pipelineCase: { include: { client: true, routeSnapshots: true } },
      evaluatorMembership: { include: { user: true } },
      evaluationDecision: true,
    },
  });
  if (existing) return existing;
  return prisma.surveyAssignment.create({
    data: {
      assignmentRef,
      tenantId: tenant.id,
      pipelineCaseId: pipelineCase.id,
      serviceRevisionId: serviceRevision.id,
      routeVersion: pipelineCase.routeRevision,
      evaluatorMembershipId: evaluator.id,
      evaluatorUserId: evaluator.userId,
      scheduledStart: new Date(start),
      scheduledEnd: new Date(end),
      status,
      contextSnapshot: { synthetic: true, fixture: label, method },
      instructionSnapshot:
        method === "VIRTUAL"
          ? "Conexión virtual sintética; validar audio y documentación."
          : "Visita sintética; confirmar acceso y punto de encuentro.",
      evaluationDecisionId: decision.id,
      schedulePolicyId: schedulePolicy?.id || null,
      operationalPolicyId: policy.id,
      visitReasonId: reason.id,
      scheduleProfile: method === "VIRTUAL" ? "CUSTOM" : "METRO",
      zoneCode: method === "VIRTUAL" ? "VIRTUAL" : "METRO",
      slotKey: method === "VIRTUAL" ? "VIRTUAL_PM" : "METRO_AM",
      travelBufferMinutes,
      clientConfirmation: "NOT_CONFIRMED",
      evaluatorConfirmation: "CONFIRMED",
      resourcesSnapshot: resources,
      replacesAssignmentId,
      createdByMembershipId: actor.id,
      createdByUserId: actor.userId,
    },
    include: {
      pipelineCase: { include: { client: true, routeSnapshots: true } },
      evaluatorMembership: { include: { user: true } },
      evaluationDecision: true,
    },
  });
}

async function main() {
  const identity = await prisma.$queryRawUnsafe(
    "SELECT current_database() AS database, current_setting('neon.branch_id', true) AS branch",
  );
  exact(identity[0]?.database, EXPECTED_DATABASE, "DATABASE_RUNTIME");
  exact(identity[0]?.branch, EXPECTED_BRANCH, "BRANCH_RUNTIME");
  const migrations = await prisma.$queryRawUnsafe(
    "SELECT migration_name, finished_at, rolled_back_at, applied_steps_count FROM osi._prisma_migrations ORDER BY migration_name",
  );
  if (
    migrations.length !== 33 ||
    migrations.some(
      (row) =>
        !row.finished_at || row.rolled_back_at || row.applied_steps_count !== 1,
    )
  )
    fail("MIGRATIONS_NOT_33_COMPLETE");

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { code: TENANT_CODE },
  });
  const otherTenant = await prisma.tenant.findUniqueOrThrow({
    where: { code: OTHER_TENANT_CODE },
  });
  const admin = await prisma.tenantMembership.findFirstOrThrow({
    where: { tenantId: tenant.id, role: "A", status: "ACTIVE" },
    include: { user: true },
  });
  const evaluator = await prisma.tenantMembership.findFirstOrThrow({
    where: { tenantId: tenant.id, role: "E", status: "ACTIVE" },
    include: { user: true },
  });
  const deny = await prisma.tenantMembership.findFirstOrThrow({
    where: { tenantId: tenant.id, deniedPermissions: { has: "pipeline:view" } },
  });
  assert.ok(
    REQUIRED_ADMIN.every((permission) =>
      admin.grantedPermissions.includes(permission),
    ),
  );
  assert.ok(
    evaluator.grantedPermissions.includes("scheduling:exceptions:respond"),
  );
  assert.ok(deny.deniedPermissions.includes("pipeline:view"));

  const adminProfile = await ensureProfile(
    tenant,
    admin,
    "PV14B-ADMIN",
    "Coordinación de Survey",
    { surveyFieldWork: false, approvalOnly: true },
  );
  const evaluatorProfile = await ensureProfile(
    tenant,
    evaluator,
    "PV14B-EVALUATOR",
    "Evaluador operativo",
    { maximumDailyVisits: 4, requiresTravelBuffer: true },
  );
  const context = {
    tenantId: tenant.id,
    membershipId: admin.id,
    userId: admin.userId,
  };
  const evaluatorContext = {
    tenantId: tenant.id,
    membershipId: evaluator.id,
    userId: evaluator.userId,
  };

  const capabilityDefinitions = [
    [
      "CAN_PERFORM_IN_PERSON_SURVEY",
      "Visita presencial",
      "Autoriza evaluación física en zona asignada.",
    ],
    [
      "CAN_PERFORM_VIRTUAL_SURVEY",
      "Visita virtual",
      "Autoriza evaluación remota sin traslado físico.",
    ],
    [
      "CAN_APPROVE_AFTER_HOURS",
      "Responder fuera de horario",
      "Capacidad operacional; no sustituye permisos técnicos.",
    ],
  ];
  const capabilities = new Map();
  for (const [code, name, description] of capabilityDefinitions) {
    const result = await mutatePersonnelPolicies(
      context,
      command("CAPABILITY_CREATE", { code, name, description }, `CAP-${code}`),
      prisma,
    );
    capabilities.set(code, result);
  }
  for (const code of [
    "CAN_PERFORM_IN_PERSON_SURVEY",
    "CAN_PERFORM_VIRTUAL_SURVEY",
  ]) {
    await mutatePersonnelPolicies(
      context,
      command(
        "CAPABILITY_ASSIGN",
        {
          profileRef: evaluatorProfile.profileRef,
          capabilityRef: capabilities.get(code).capabilityRef,
          restrictions: code.includes("IN_PERSON")
            ? { zone: "METRO" }
            : { travelRequired: false },
          validFrom: "2026-09-01T00:00:00.000Z",
          validTo: null,
        },
        `ASSIGN-${code}`,
      ),
      prisma,
    );
  }

  const zoneRule = await prisma.logisticsRule.findFirst({
    where: { tenantId: tenant.id, family: "ZONE", state: "ACTIVE" },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });
  if (!zoneRule) fail("ZONE_RULE_MISSING");
  await mutatePersonnelPolicies(
    context,
    command(
      "ZONE_ASSIGN",
      {
        profileRef: evaluatorProfile.profileRef,
        ruleRef: zoneRule.ruleRef,
        validFrom: "2026-09-01T00:00:00.000Z",
        validTo: null,
      },
      "ZONE-METRO",
    ),
    prisma,
  );

  const windows = [];
  for (const weekday of [1, 2, 3, 4, 5]) {
    windows.push({
      weekday,
      startMinute: 480,
      endMinute: 1020,
      capacity: 4,
      method: "IN_PERSON",
      zoneRuleRef: zoneRule.ruleRef,
      calendarDate: null,
      requiresApproval: false,
      kind: "REGULAR",
    });
    windows.push({
      weekday,
      startMinute: 540,
      endMinute: 1080,
      capacity: 6,
      method: "VIRTUAL",
      zoneRuleRef: null,
      calendarDate: null,
      requiresApproval: false,
      kind: "REGULAR",
    });
  }
  const policyResult = await mutatePersonnelPolicies(
    context,
    command(
      "POLICY_PUBLISH",
      {
        expectedVersion: 0,
        timezone: "America/Santo_Domingo",
        defaultVisitMinutes: 90,
        minimumTravelBufferMinutes: 60,
        virtualPreparationMinutes: 15,
        validFrom: "2026-09-01T00:00:00.000Z",
        windows,
      },
      "POLICY-V1",
    ),
    prisma,
  );
  const policy = await prisma.visitPolicyVersion.findFirstOrThrow({
    where: { tenantId: tenant.id, policyRef: policyResult.policyRef },
  });
  await mutatePersonnelPolicies(
    context,
    command(
      "SCHEDULE_OVERRIDE_CREATE",
      {
        profileRef: evaluatorProfile.profileRef,
        kind: "TRAVEL_BUFFER",
        startsAt: "2026-09-16T12:00:00.000Z",
        endsAt: "2026-09-16T22:00:00.000Z",
        method: "IN_PERSON",
        zoneRuleRef: zoneRule.ruleRef,
        travelBufferMinutes: 60,
        reason: "Buffer de traslado METRO para fixture sintético",
      },
      "OVERRIDE-BUFFER",
    ),
    prisma,
  );

  const reasons = new Map();
  for (const [code, name, kind, origin] of [
    ["INITIAL_VISIT", "Evaluación inicial", "VISIT", "SALES"],
    ["CLIENT_REBOOK", "Cambio solicitado por cliente", "RESCHEDULE", "CLIENT"],
    ["OUT_OF_HOURS", "Visita fuera de horario", "VISIT", "ADMIN"],
    [
      "CLIENT_CANCEL",
      "Cancelación solicitada por cliente",
      "CANCELLATION",
      "CLIENT",
    ],
  ]) {
    const result = await mutatePersonnelPolicies(
      context,
      command(
        "VISIT_REASON_CREATE",
        {
          code,
          name,
          kind,
          requesterOrigin: origin,
          visibleToClient: true,
          visibleToEvaluator: true,
        },
        `REASON-${code}`,
      ),
      prisma,
    );
    reasons.set(
      code,
      await prisma.visitReason.findFirstOrThrow({
        where: { tenantId: tenant.id, reasonRef: result.reasonRef },
      }),
    );
  }

  const cases = await prisma.pipelineCase.findMany({
    where: {
      tenantId: tenant.id,
      caseCode: {
        in: [
          "PV10B-A-LOCAL",
          "PV10B-B-EXPORT",
          "PV10B-C-PENDING",
          "PV10B-D-QUOTES",
        ],
      },
    },
    include: { serviceRevisions: { orderBy: { revision: "desc" }, take: 1 } },
  });
  if (
    cases.length !== 4 ||
    cases.some((row) => row.serviceRevisions.length !== 1)
  )
    fail("CASE_FIXTURES_MISSING");
  const byCode = new Map(cases.map((row) => [row.caseCode, row]));
  const schedulePolicy =
    await prisma.surveySchedulePolicyVersion.findFirstOrThrow({
      where: { tenantId: tenant.id, state: "ACTIVE" },
      orderBy: { version: "desc" },
    });

  const physicalCase = byCode.get("PV10B-A-LOCAL");
  const physicalDecision = await ensureDecision(
    tenant,
    physicalCase,
    physicalCase.serviceRevisions[0],
    admin,
    "IN_PERSON",
    "A-IN-PERSON",
  );
  const physicalAssignment = await ensureAssignment({
    tenant,
    pipelineCase: physicalCase,
    serviceRevision: physicalCase.serviceRevisions[0],
    decision: physicalDecision,
    evaluator,
    actor: admin,
    policy,
    schedulePolicy,
    reason: reasons.get("INITIAL_VISIT"),
    label: "A-IN-PERSON",
    method: "IN_PERSON",
    start: "2026-09-14T14:00:00.000Z",
    end: "2026-09-14T15:30:00.000Z",
    travelBufferMinutes: 60,
    resources: [
      { type: "VEHICLE", label: "Vehículo de visita · referencia logística" },
      { type: "EQUIPMENT", label: "Kit de medición · referencia de Activos" },
    ],
  });
  if (
    !(await prisma.surveyVisitFee.findFirst({
      where: { tenantId: tenant.id, evaluationDecisionId: physicalDecision.id },
    }))
  ) {
    const logistics = await prisma.logisticsPlanRevision.findFirstOrThrow({
      where: {
        tenantId: tenant.id,
        plan: { pipelineCaseId: physicalCase.id },
        status: "PUBLISHED",
      },
      orderBy: { revision: "desc" },
    });
    const costing = await prisma.costingRevision.findFirstOrThrow({
      where: {
        tenantId: tenant.id,
        pipelineCaseId: physicalCase.id,
        status: "PUBLISHED",
      },
      include: { lines: { orderBy: { position: "asc" }, take: 1 } },
      orderBy: { revision: "desc" },
    });
    if (!costing.lines[0]) fail("VISIT_FEE_COSTING_LINE_MISSING");
    await prisma.surveyVisitFee.create({
      data: {
        tenantId: tenant.id,
        pipelineCaseId: physicalCase.id,
        evaluationDecisionId: physicalDecision.id,
        assignmentId: physicalAssignment.id,
        logisticsRevisionId: logistics.id,
        costingRevisionId: costing.id,
        costingLineId: costing.lines[0].id,
        disposition: "CHARGEABLE",
        suggestedAmount: "1500",
        currency: "DOP",
        communicationStatus: "PREPARED",
        approvalStatus: "APPROVED",
        paymentStatus: "PENDING",
        authorizedByMembershipId: admin.id,
        authorizedByUserId: admin.userId,
        authorizedAt: new Date("2026-09-08T14:00:00.000Z"),
      },
    });
  }

  const virtualCase = byCode.get("PV10B-C-PENDING");
  const virtualDecision = await ensureDecision(
    tenant,
    virtualCase,
    virtualCase.serviceRevisions[0],
    admin,
    "VIRTUAL",
    "B-VIRTUAL",
  );
  const virtualAssignment = await ensureAssignment({
    tenant,
    pipelineCase: virtualCase,
    serviceRevision: virtualCase.serviceRevisions[0],
    decision: virtualDecision,
    evaluator,
    actor: admin,
    policy,
    schedulePolicy,
    reason: reasons.get("INITIAL_VISIT"),
    label: "B-VIRTUAL",
    method: "VIRTUAL",
    start: "2026-09-15T15:00:00.000Z",
    end: "2026-09-15T16:00:00.000Z",
    travelBufferMinutes: 15,
  });
  for (const [assignment, milestone] of [
    [physicalAssignment, "VISIT_CONFIRMATION"],
    [virtualAssignment, "EVALUATOR_ASSIGNMENT"],
  ]) {
    if (
      (await prisma.communicationRecord.count({
        where: {
          tenantId: tenant.id,
          surveyAssignmentId: assignment.id,
          milestone,
        },
      })) === 0
    ) {
      await prisma.$transaction((tx) =>
        prepareOperationalSchedulingCommunications(
          tx,
          context,
          assignment,
          reasons.get("INITIAL_VISIT"),
          milestone,
        ),
      );
    }
  }

  const exceptionCase = byCode.get("PV10B-B-EXPORT");
  const exception = await mutatePersonnelPolicies(
    context,
    command(
      "EXCEPTION_REQUEST",
      {
        caseRef: exceptionCase.publicRef,
        assignmentRef: null,
        profileRef: evaluatorProfile.profileRef,
        reasonRef: reasons.get("OUT_OF_HOURS").reasonRef,
        method: "VIRTUAL",
        requestedStart: "2026-09-19T22:00:00.000Z",
        requestedEnd: "2026-09-19T23:00:00.000Z",
        requesterOrigin: "ADMIN",
        reasonDescription:
          "Cliente solicita atención fuera del horario publicado.",
      },
      "EXCEPTION-C",
    ),
    prisma,
  );
  const responded = await mutatePersonnelPolicies(
    evaluatorContext,
    command(
      "EXCEPTION_RESPOND",
      {
        requestRef: exception.requestRef,
        expectedVersion: 1,
        response: "ACCEPTED",
        alternativeStart: null,
        alternativeEnd: null,
        reason: "Evaluador confirma disponibilidad excepcional.",
      },
      "EXCEPTION-C-RESPOND",
    ),
    prisma,
  );
  await mutatePersonnelPolicies(
    context,
    command(
      "EXCEPTION_DECIDE",
      {
        requestRef: exception.requestRef,
        expectedVersion: responded.version,
        decision: "APPROVED",
        reason: "Aprobada para revisión sintética 14B.",
      },
      "EXCEPTION-C-APPROVE",
    ),
    prisma,
  );

  const rebookCase = byCode.get("PV10B-D-QUOTES");
  const rebookDecision = await ensureDecision(
    tenant,
    rebookCase,
    rebookCase.serviceRevisions[0],
    admin,
    "VIRTUAL",
    "D-REBOOK",
  );
  const oldAssignment = await ensureAssignment({
    tenant,
    pipelineCase: rebookCase,
    serviceRevision: rebookCase.serviceRevisions[0],
    decision: rebookDecision,
    evaluator,
    actor: admin,
    policy,
    schedulePolicy,
    reason: reasons.get("INITIAL_VISIT"),
    label: "D-ORIGINAL",
    method: "VIRTUAL",
    start: "2026-09-16T15:00:00.000Z",
    end: "2026-09-16T16:00:00.000Z",
    travelBufferMinutes: 15,
  });
  const rebookResult = await mutatePersonnelPolicies(
    context,
    command(
      "REBOOK_VISIT",
      {
        assignmentRef: oldAssignment.assignmentRef,
        expectedVersion: 1,
        scheduledStart: "2026-09-18T15:00:00.000Z",
        scheduledEnd: "2026-09-18T16:00:00.000Z",
        reasonRef: reasons.get("CLIENT_REBOOK").reasonRef,
        requesterOrigin: "CLIENT",
        reasonDescription:
          "Cambio de fecha solicitado por el cliente sintético.",
      },
      "REBOOK-D",
    ),
    prisma,
  );

  const crossUser = await prisma.user.upsert({
    where: { email: "personnel-cross-tenant-14b@example.invalid" },
    update: {},
    create: {
      code: "PV14B-X-E",
      name: "Evaluador Cross Tenant",
      email: "personnel-cross-tenant-14b@example.invalid",
      normalizedEmail: "personnel-cross-tenant-14b@example.invalid",
      phone: "+12025550198",
      role: "E",
      status: "ACTIVE",
      joinDate: "2026-09-08",
      passwordHash: "synthetic-non-authenticatable",
    },
  });
  const crossMembership =
    (await prisma.tenantMembership.findFirst({
      where: { tenantId: otherTenant.id, userId: crossUser.id },
    })) ||
    (await prisma.tenantMembership.create({
      data: {
        tenantId: otherTenant.id,
        userId: crossUser.id,
        role: "E",
        status: "ACTIVE",
        grantedPermissions: [
          "personnel:profiles:view",
          "scheduling:exceptions:respond",
        ],
        provisioningSource: "MANUAL",
        provisioningBatchId: EXPECTED_BATCH,
      },
    }));
  await ensureProfile(
    otherTenant,
    crossMembership,
    "PV14B-X-E",
    "Evaluador sentinel",
    { sentinel: true },
  );

  const result = {
    scenarios: {
      inHoursPhysical: physicalAssignment.status,
      virtual: virtualAssignment.status,
      afterHours: "APPROVED",
      rebooking: rebookResult.status,
      travelConflict: {
        blockedByBufferMinutes: 60,
        fixture: "OVERRIDE-BUFFER",
      },
    },
    counts: {
      profiles: await prisma.employeeProfile.count({
        where: { tenantId: tenant.id },
      }),
      capabilities: await prisma.operationalCapability.count({
        where: { tenantId: tenant.id },
      }),
      activePolicies: await prisma.visitPolicyVersion.count({
        where: { tenantId: tenant.id, state: "ACTIVE" },
      }),
      reasons: await prisma.visitReason.count({
        where: { tenantId: tenant.id, status: "ACTIVE" },
      }),
      exceptions: await prisma.afterHoursVisitRequest.count({
        where: { tenantId: tenant.id },
      }),
      assignments: await prisma.surveyAssignment.count({
        where: { tenantId: tenant.id },
      }),
      preparedCommunications: await prisma.communicationRecord.count({
        where: { tenantId: tenant.id, status: "PREPARED" },
      }),
      sentCommunications: await prisma.communicationRecord.count({
        where: { tenantId: tenant.id, status: { in: ["SENT", "DELIVERED"] } },
      }),
      crossTenantProfiles: await prisma.employeeProfile.count({
        where: { tenantId: otherTenant.id },
      }),
    },
  };
  assert.equal(result.counts.profiles, 2);
  assert.equal(result.counts.capabilities, 3);
  assert.equal(result.counts.activePolicies, 1);
  assert.equal(result.counts.reasons, 4);
  assert.equal(result.counts.sentCommunications, 0);
  assert.ok(result.counts.preparedCommunications >= 14);
  assert.ok(result.counts.crossTenantProfiles >= 1);
  assert.equal(adminProfile.tenantId, tenant.id);
  console.log(
    JSON.stringify({
      ok: true,
      migrations: "33/33",
      syntheticOnly: true,
      idempotent: true,
      productionApiEnabled: false,
      ...result,
    }),
  );
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
