import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  getPersonnelPoliciesWorkspace,
  mutatePersonnelPolicies,
  resolvePersonnelScheduleAuthority,
} from "../api/_lib/personnelPoliciesDomain.js";
import { personnelPayloadHash } from "../api/_lib/personnelPoliciesContract.js";

const raw = process.env.V17_PERSONNEL_POLICIES_TEST_DATABASE_URL;
assert.ok(raw, "V17_PERSONNEL_POLICIES_TEST_DATABASE_URL requerida");
const url = new URL(raw);
assert.ok(
  ["127.0.0.1", "localhost"].includes(url.hostname) &&
    url.port === "55449" &&
    url.pathname === "/v17_personnel_14a_clean" &&
    url.searchParams.get("schema") === "osi",
  "PostgreSQL 18 local aislado requerido",
);
const prisma = new PrismaClient({ datasourceUrl: raw });
const run = randomUUID().slice(0, 8).toUpperCase();
let checks = 0;
const pass = (value, message) => {
  assert.ok(value, message);
  checks += 1;
};
const signed = (operation, payload, requestId = randomUUID()) => ({
  operation,
  requestId,
  ...payload,
  payloadHash: personnelPayloadHash({ operation, requestId, ...payload }),
});
const permissions = [
  "personnel:profiles:view",
  "personnel:profiles:manage",
  "personnel:capabilities:view",
  "personnel:capabilities:manage",
  "scheduling:policies:view",
  "scheduling:policies:manage",
  "scheduling:exceptions:request",
  "scheduling:exceptions:approve",
  "scheduling:exceptions:respond",
  "survey:schedule:manage",
  "survey:schedule:reschedule",
  "survey:perform",
];
try {
  const migrations =
    await prisma.$queryRaw`SELECT migration_name,finished_at,rolled_back_at,applied_steps_count FROM "osi"."_prisma_migrations" ORDER BY started_at`;
  assert.equal(migrations.length, 33);
  pass(
    migrations.every(
      (row) =>
        row.finished_at && !row.rolled_back_at && row.applied_steps_count === 1,
    ),
    "33/33 completas",
  );
  const tenant = await prisma.tenant.create({
    data: {
      code: `PER-${run}`,
      name: "Tenant personal sintético",
      countryCode: "DO",
    },
  });
  const otherTenant = await prisma.tenant.create({
    data: {
      code: `PEX-${run}`,
      name: "Tenant alterno sintético",
      countryCode: "DO",
    },
  });
  const admin = await prisma.user.create({
    data: {
      code: `PER-A-${run}`,
      name: "Administrador sintético",
      email: `admin-${run}@example.invalid`,
      phone: "0000000000",
      role: "A",
      status: "ACTIVE",
      joinDate: "2026-09-14",
      passwordHash: "synthetic-non-authenticatable",
    },
  });
  const evaluator = await prisma.user.create({
    data: {
      code: `PER-E-${run}`,
      name: "Evaluador sintético",
      email: `evaluator-${run}@example.invalid`,
      phone: "0000000001",
      role: "V",
      status: "ACTIVE",
      joinDate: "2026-09-14",
      passwordHash: "synthetic-non-authenticatable",
    },
  });
  const denied = await prisma.user.create({
    data: {
      code: `PER-D-${run}`,
      name: "Denegado sintético",
      email: `denied-${run}@example.invalid`,
      phone: "0000000002",
      role: "V",
      status: "ACTIVE",
      joinDate: "2026-09-14",
      passwordHash: "synthetic-non-authenticatable",
    },
  });
  const adminMembership = await prisma.tenantMembership.create({
    data: {
      tenantId: tenant.id,
      userId: admin.id,
      role: "A",
      grantedPermissions: permissions,
    },
  });
  const evaluatorMembership = await prisma.tenantMembership.create({
    data: {
      tenantId: tenant.id,
      userId: evaluator.id,
      role: "V",
      grantedPermissions: ["scheduling:exceptions:respond", "survey:perform"],
    },
  });
  const deniedMembership = await prisma.tenantMembership.create({
    data: {
      tenantId: tenant.id,
      userId: denied.id,
      role: "V",
      grantedPermissions: [],
      deniedPermissions: ["personnel:profiles:view"],
    },
  });
  const otherMembership = await prisma.tenantMembership.create({
    data: {
      tenantId: otherTenant.id,
      userId: admin.id,
      role: "A",
      grantedPermissions: permissions,
    },
  });
  const profile = await prisma.employeeProfile.create({
    data: {
      tenantId: tenant.id,
      membershipId: evaluatorMembership.id,
      userId: evaluator.id,
      employeeCode: `E-${run}`,
      normalizedEmployeeCode: `E-${run}`,
      jobTitle: "Evaluador",
      employmentStatus: "ACTIVE",
      availabilityStatus: "AVAILABLE",
    },
  });
  const context = {
    tenantId: tenant.id,
    membershipId: adminMembership.id,
    userId: admin.id,
  };
  const evaluatorContext = {
    tenantId: tenant.id,
    membershipId: evaluatorMembership.id,
    userId: evaluator.id,
  };
  const zoneRule = await prisma.logisticsRule.create({
    data: {
      tenantId: tenant.id,
      seriesRef: randomUUID(),
      family: "ZONE",
      code: `METRO_${run}`,
      name: "Zona metropolitana sintética",
      conditions: { countryCode: "DO" },
      conditionHash: "1".repeat(64),
      result: { travelMinutes: 45 },
      state: "ACTIVE",
      version: 1,
      requestId: `zone-${run}`,
      payloadHash: "2".repeat(64),
      actorMembershipId: adminMembership.id,
      actorUserId: admin.id,
    },
  });
  const capabilityRequest = `cap-${run}`;
  const capabilityCommand = signed(
    "CAPABILITY_CREATE",
    {
      code: `CAN_PERFORM_IN_PERSON_${run}`,
      name: "Evaluación presencial",
      description: "Capacidad operacional sintética",
    },
    capabilityRequest,
  );
  const firstCapability = await mutatePersonnelPolicies(
    context,
    capabilityCommand,
    prisma,
  );
  const replayedCapability = await mutatePersonnelPolicies(
    context,
    capabilityCommand,
    prisma,
  );
  assert.equal(firstCapability.capabilityRef, replayedCapability.capabilityRef);
  checks += 1;
  assert.equal(
    await prisma.operationalCapability.count({
      where: { tenantId: tenant.id },
    }),
    1,
  );
  checks += 1;
  const canonicalCapability = await mutatePersonnelPolicies(
    context,
    signed("CAPABILITY_CREATE", {
      code: "CAN_PERFORM_IN_PERSON_SURVEY",
      name: "Puede evaluar presencialmente",
      description: null,
    }),
    prisma,
  );
  const assignment = await mutatePersonnelPolicies(
    context,
    signed("CAPABILITY_ASSIGN", {
      profileRef: profile.profileRef,
      capabilityRef: canonicalCapability.capabilityRef,
      restrictions: {},
      validFrom: null,
      validTo: null,
    }),
    prisma,
  );
  pass(assignment.status === "ACTIVE", "capacidad asignada a perfil vinculado");
  const virtualCapability = await mutatePersonnelPolicies(
    context,
    signed("CAPABILITY_CREATE", {
      code: "CAN_PERFORM_VIRTUAL_SURVEY",
      name: "Puede evaluar virtualmente",
      description: null,
    }),
    prisma,
  );
  await mutatePersonnelPolicies(
    context,
    signed("CAPABILITY_ASSIGN", {
      profileRef: profile.profileRef,
      capabilityRef: virtualCapability.capabilityRef,
      restrictions: {},
      validFrom: null,
      validTo: null,
    }),
    prisma,
  );
  const zoneAssignment = await mutatePersonnelPolicies(
    context,
    signed("ZONE_ASSIGN", {
      profileRef: profile.profileRef,
      ruleRef: zoneRule.ruleRef,
      validFrom: null,
      validTo: null,
    }),
    prisma,
  );
  pass(zoneAssignment.status === "ACTIVE", "zona tenant-first asignada");
  const visitReason = await mutatePersonnelPolicies(
    context,
    signed("VISIT_REASON_CREATE", {
      code: `INITIAL_${run}`,
      name: "Evaluación inicial",
      kind: "VISIT",
      requesterOrigin: null,
      visibleToClient: true,
      visibleToEvaluator: true,
    }),
    prisma,
  );
  const windows = [1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    startMinute: 480,
    endMinute: 1020,
    capacity: 4,
    method: "IN_PERSON",
    zoneRuleRef: weekday === 1 ? zoneRule.ruleRef : null,
    calendarDate: null,
    requiresApproval: false,
    kind: "REGULAR",
  }));
  windows.push(
    ...[1, 2, 3, 4, 5].map((weekday) => ({
      weekday,
      startMinute: 480,
      endMinute: 1020,
      capacity: 4,
      method: "VIRTUAL",
      zoneRuleRef: null,
      calendarDate: null,
      requiresApproval: false,
      kind: "REGULAR",
    })),
  );
  windows.push({
    weekday: 6,
    startMinute: 480,
    endMinute: 720,
    capacity: 2,
    method: "IN_PERSON",
    zoneRuleRef: null,
    calendarDate: "2030-09-14",
    requiresApproval: true,
    kind: "SPECIAL_OPENING",
  });
  const policy = await mutatePersonnelPolicies(
    context,
    signed("POLICY_PUBLISH", {
      expectedVersion: 0,
      timezone: "America/Santo_Domingo",
      defaultVisitMinutes: 120,
      minimumTravelBufferMinutes: 45,
      virtualPreparationMinutes: 15,
      validFrom: "2026-09-01T00:00:00.000Z",
      windows,
    }),
    prisma,
  );
  pass(
    policy.version === 1 &&
      policy.windows.length === 11 &&
      policy.windows.some((window) => window.calendarDate === "2030-09-14"),
    "política semanal y día especial publicados",
  );
  const pipelineCase = await prisma.pipelineCase.create({
    data: {
      tenantId: tenant.id,
      caseCode: `PER-${run}-01`,
      mode: "LOCAL",
      serviceType: "Mudanza local",
      customerType: "L4_PERSONAL",
      ownerName: admin.name,
      ownerMembershipId: adminMembership.id,
      ownerUserId: admin.id,
      estimatedCbm: 1,
      originLocation: "snapshot",
      destinationLocation: "snapshot",
    },
  });
  const operationalPolicy = await prisma.visitPolicyVersion.findFirstOrThrow({
    where: { tenantId: tenant.id, policyRef: policy.policyRef },
  });
  const physicalAuthority = await resolvePersonnelScheduleAuthority(
    prisma,
    context,
    profile,
    "IN_PERSON",
    new Date("2030-09-16T13:00:00.000Z"),
    new Date("2030-09-16T14:00:00.000Z"),
    null,
    70,
  );
  pass(
    physicalAuthority.buffer === 70,
    "visita presencial usa el máximo entre política y Motor",
  );
  const virtualAuthority = await resolvePersonnelScheduleAuthority(
    prisma,
    context,
    profile,
    "VIRTUAL",
    new Date("2030-09-16T13:00:00.000Z"),
    new Date("2030-09-16T14:00:00.000Z"),
    null,
    500,
  );
  pass(
    virtualAuthority.buffer === 15,
    "visita virtual ignora traslado físico y usa preparación",
  );
  await assert.rejects(
    resolvePersonnelScheduleAuthority(
      prisma,
      context,
      profile,
      "IN_PERSON",
      new Date("2030-09-14T13:00:00.000Z"),
      new Date("2030-09-14T14:00:00.000Z"),
    ),
    /PERSONNEL_AFTER_HOURS_REQUEST_REQUIRED/,
  );
  checks += 1;
  const serviceRevision = await prisma.pipelineCaseServiceRevision.create({
    data: {
      tenantId: tenant.id,
      pipelineCaseId: pipelineCase.id,
      revision: 1,
      modeSnapshot: "LOCAL",
      source: "MANUAL",
      createdByMembershipId: adminMembership.id,
      createdByUserId: admin.id,
    },
  });
  await prisma.surveyAssignment.create({
    data: {
      tenantId: tenant.id,
      pipelineCaseId: pipelineCase.id,
      serviceRevisionId: serviceRevision.id,
      routeVersion: 1,
      evaluatorMembershipId: evaluatorMembership.id,
      evaluatorUserId: evaluator.id,
      scheduledStart: new Date("2030-09-16T13:00:00.000Z"),
      scheduledEnd: new Date("2030-09-16T14:00:00.000Z"),
      contextSnapshot: {},
      operationalPolicyId: operationalPolicy.id,
      visitReasonId: (
        await prisma.visitReason.findFirstOrThrow({
          where: { tenantId: tenant.id, reasonRef: visitReason.reasonRef },
        })
      ).id,
      travelBufferMinutes: 70,
      createdByMembershipId: adminMembership.id,
      createdByUserId: admin.id,
    },
  });
  await assert.rejects(
    resolvePersonnelScheduleAuthority(
      prisma,
      context,
      profile,
      "IN_PERSON",
      new Date("2030-09-16T14:30:00.000Z"),
      new Date("2030-09-16T15:30:00.000Z"),
      null,
      70,
    ),
    /PERSONNEL_EVALUATOR_UNAVAILABLE/,
  );
  checks += 1;
  const exception = await mutatePersonnelPolicies(
    context,
    signed("EXCEPTION_REQUEST", {
      caseRef: pipelineCase.publicRef,
      assignmentRef: null,
      profileRef: profile.profileRef,
      reasonRef: visitReason.reasonRef,
      method: "VIRTUAL",
      requestedStart: "2030-09-15T23:00:00.000Z",
      requestedEnd: "2030-09-16T01:00:00.000Z",
      requesterOrigin: "CLIENT",
      reasonDescription: "Solicitud excepcional sintética",
    }),
    prisma,
  );
  pass(
    exception.status === "PENDING" && exception.evaluatorResponse === "PENDING",
    "excepción virtual creada sin traslado físico",
  );
  const response = await mutatePersonnelPolicies(
    evaluatorContext,
    signed("EXCEPTION_RESPOND", {
      requestRef: exception.requestRef,
      expectedVersion: 1,
      response: "ACCEPTED",
      alternativeStart: null,
      alternativeEnd: null,
      reason: null,
    }),
    prisma,
  );
  pass(
    response.evaluatorResponse === "ACCEPTED" && response.version === 2,
    "respuesta independiente del evaluador",
  );
  const decisions = await Promise.allSettled(
    [1, 2].map((index) =>
      mutatePersonnelPolicies(
        context,
        signed("EXCEPTION_DECIDE", {
          requestRef: exception.requestRef,
          expectedVersion: 2,
          decision: "APPROVED",
          reason: `Aprobación ${index}`,
        }),
        prisma,
      ),
    ),
  );
  assert.equal(decisions.filter((row) => row.status === "fulfilled").length, 1);
  checks += 1;
  assert.equal(
    decisions.filter(
      (row) => row.status === "rejected" && row.reason?.status === 409,
    ).length,
    1,
  );
  checks += 1;
  const physicalException = await mutatePersonnelPolicies(
    context,
    signed("EXCEPTION_REQUEST", {
      caseRef: pipelineCase.publicRef,
      assignmentRef: null,
      profileRef: profile.profileRef,
      reasonRef: visitReason.reasonRef,
      method: "IN_PERSON",
      requestedStart: "2030-09-17T23:00:00.000Z",
      requestedEnd: "2030-09-18T01:00:00.000Z",
      requesterOrigin: "ADMIN",
      reasonDescription: "Solicitud física sin revisión logística",
    }),
    prisma,
  );
  await mutatePersonnelPolicies(
    evaluatorContext,
    signed("EXCEPTION_RESPOND", {
      requestRef: physicalException.requestRef,
      expectedVersion: 1,
      response: "ACCEPTED",
      alternativeStart: null,
      alternativeEnd: null,
      reason: null,
    }),
    prisma,
  );
  await assert.rejects(
    mutatePersonnelPolicies(
      context,
      signed("EXCEPTION_DECIDE", {
        requestRef: physicalException.requestRef,
        expectedVersion: 2,
        decision: "APPROVED",
        reason: "No debe aprobarse sin Motor",
      }),
      prisma,
    ),
    /PERSONNEL_RESOURCE_APPROVAL_REQUIRED/,
  );
  checks += 1;
  const workspace = await getPersonnelPoliciesWorkspace(context, {}, prisma);
  pass(
    workspace.personnel.length === 1 &&
      workspace.capabilities.length === 3 &&
      workspace.activePolicy.version === 1 &&
      workspace.exceptions.some((entry) => entry.status === "APPROVED"),
    "workspace tenant-first cerrado",
  );
  const serialized = JSON.stringify(workspace);
  pass(
    !serialized.includes(profile.id) &&
      !serialized.includes(tenant.id) &&
      !serialized.includes(adminMembership.id),
    "DTO no publica PK internas",
  );
  await assert.rejects(
    getPersonnelPoliciesWorkspace(
      {
        tenantId: tenant.id,
        membershipId: deniedMembership.id,
        userId: denied.id,
      },
      {},
      prisma,
    ),
    /PERSONNEL_POLICIES_FORBIDDEN/,
  );
  checks += 1;
  const otherWorkspace = await getPersonnelPoliciesWorkspace(
    {
      tenantId: otherTenant.id,
      membershipId: otherMembership.id,
      userId: admin.id,
    },
    {},
    prisma,
  );
  assert.equal(otherWorkspace.personnel.length, 0);
  checks += 1;
  await assert.rejects(
    prisma.visitPolicyEvent.deleteMany({ where: { tenantId: tenant.id } }),
    /append-only/i,
  );
  checks += 1;
  assert.equal(
    await prisma.personnelPolicyCommand.count({
      where: { tenantId: tenant.id, requestId: capabilityRequest },
    }),
    1,
  );
  checks += 1;
  assert.equal(
    await prisma.commercialAuditLog.count({
      where: {
        tenant_id: tenant.id,
        source: "V17_PERSONNEL_OPERATIONAL_POLICIES_14A",
      },
    }),
    await prisma.personnelPolicyCommand.count({
      where: { tenantId: tenant.id },
    }),
  );
  checks += 1;
  console.log(`V17-PERSONNEL-POLICIES-DB ${checks}/${checks}`);
} finally {
  await prisma.$disconnect();
}
