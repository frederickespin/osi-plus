import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

import {
  HISTORICAL_POLICY_TEMPLATE,
  schedulingHash,
} from "../api/_lib/surveySchedulingContract.js";
import {
  getSurveySchedulingWorkspace,
  mutateSurveyScheduling,
} from "../api/_lib/surveySchedulingDomain.js";
import { listSurveyAgenda } from "../api/_lib/crmSurveyDomain.js";

const raw = process.env.V17_SCHEDULING_TEST_DATABASE_URL;
assert.ok(raw, "V17_SCHEDULING_TEST_DATABASE_URL requerida");
const url = new URL(raw);
assert.ok(["localhost", "127.0.0.1", "::1"].includes(url.hostname));
const canonicalCi = process.env.CANONICAL_DB_VALIDATION === "true" && url.hostname === "127.0.0.1" && url.port === "55432" && url.pathname === "/osi_db01n_ci";
assert.ok((url.port === "55444" && url.pathname === "/v17_scheduling_11b") || canonicalCi, "base Scheduling aislada o CI canónica requerida");
assert.equal(url.searchParams.get("schema"), "osi");

const prisma = new PrismaClient({ datasourceUrl: raw });
const run = randomUUID().slice(0, 8).toUpperCase();
let assertions = 0;
const check = (value, message) => {
  assert.ok(value, message);
  assertions += 1;
};
const command = (operation, payload, requestId = randomUUID()) => ({
  operation,
  requestId,
  ...payload,
  payloadHash: schedulingHash({ operation, requestId, ...payload }),
});

async function createCase(tenant, membership, user, service, suffix) {
  let pipelineCase = await prisma.pipelineCase.create({
    data: {
      tenantId: tenant.id,
      caseCode: `SCH-${run}-${suffix}`,
      mode: "LOCAL",
      serviceType: "Mudanza local",
      customerType: "L4_PERSONAL",
      ownerName: user.name,
      ownerMembershipId: membership.id,
      ownerUserId: user.id,
      estimatedCbm: 12,
      originLocation: "snapshot",
      destinationLocation: "snapshot",
    },
  });
  await prisma.pipelineCaseRouteSnapshot.createMany({
    data: [
      { tenantId: tenant.id, pipelineCaseId: pipelineCase.id, routeVersion: 1, role: "ORIGIN", stopOrder: 0, countryCode: "DO", provinceState: "Distrito Nacional", cityMunicipality: "Santo Domingo", streetAndNumber: "Synthetic origin" },
      { tenantId: tenant.id, pipelineCaseId: pipelineCase.id, routeVersion: 1, role: "DESTINATION", stopOrder: 0, countryCode: "DO", provinceState: "Distrito Nacional", cityMunicipality: "Santo Domingo", streetAndNumber: "Synthetic destination" },
    ],
  });
  pipelineCase = await prisma.pipelineCase.update({
    where: { id: pipelineCase.id },
    data: { routeContractVersion: 2, routeRevision: 1, destinationStatus: "CONFIRMED" },
  });
  const revision = await prisma.pipelineCaseServiceRevision.create({
    data: {
      tenantId: tenant.id,
      pipelineCaseId: pipelineCase.id,
      revision: 1,
      modeSnapshot: "LOCAL",
      source: "MANUAL",
      createdByMembershipId: membership.id,
      createdByUserId: user.id,
      items: { create: [{ serviceId: service.id, kind: "PRIMARY", source: "MANUAL", position: 0, serviceRefSnapshot: service.serviceRef, codeSnapshot: service.code, nameSnapshot: service.name, catalogVersionSnapshot: service.version }] },
    },
  });
  const calculation = await prisma.logisticsCalculation.create({
    data: {
      tenantId: tenant.id,
      pipelineCaseId: pipelineCase.id,
      routeVersion: 1,
      serviceSelectionRef: revision.selectionRef,
      serviceRevision: 1,
      availabilityObservedAt: new Date(),
      intervalStart: new Date("2026-09-14T12:00:00.000Z"),
      intervalEnd: new Date("2026-09-14T22:00:00.000Z"),
      inputSnapshot: { route: { version: 1, distanceKm: 10, zoneType: "METRO", zoneCode: "METRO_SANTO_DOMINGO" } },
      rulesSnapshot: [],
      resultSnapshot: { items: [{ snapshot: { zoneType: "METRO", zoneCode: "METRO_SANTO_DOMINGO" } }], issues: [] },
      inputHash: "1".repeat(64),
      resultHash: "2".repeat(64),
      requestId: randomUUID(),
      payloadHash: "3".repeat(64),
      actorMembershipId: membership.id,
      actorUserId: user.id,
    },
  });
  const plan = await prisma.logisticsPlan.create({ data: { tenantId: tenant.id, pipelineCaseId: pipelineCase.id } });
  await prisma.logisticsPlanRevision.create({
    data: {
      tenantId: tenant.id,
      planId: plan.id,
      calculationId: calculation.id,
      revision: 1,
      inputSnapshot: calculation.inputSnapshot,
      rulesSnapshot: [],
      resultSnapshot: calculation.resultSnapshot,
      logicalSha256: "4".repeat(64),
      publishedByMembershipId: membership.id,
      publishedByUserId: user.id,
    },
  });
  return pipelineCase;
}

try {
  const migrations = await prisma.$queryRaw`SELECT migration_name, finished_at, rolled_back_at, applied_steps_count FROM "osi"."_prisma_migrations" ORDER BY started_at`;
  assert.equal(migrations.length, 30);
  check(migrations.every((row) => row.finished_at && !row.rolled_back_at && row.applied_steps_count === 1), "30 migraciones completas");

  const tenant = await prisma.tenant.create({ data: { code: `SCH-${run}`, name: "Scheduling isolated test", countryCode: "DO" } });
  const otherTenant = await prisma.tenant.create({ data: { code: `SCX-${run}`, name: "Scheduling cross tenant", countryCode: "DO" } });
  const admin = await prisma.user.create({ data: { code: `SCH-A-${run}`, name: "Synthetic scheduling administrator", email: `sch-a-${run}@example.invalid`, phone: "0000000000", role: "A", status: "ACTIVE", joinDate: "2026-09-11", passwordHash: "synthetic-not-authenticatable" } });
  const evaluator = await prisma.user.create({ data: { code: `SCH-E-${run}`, name: "Synthetic evaluator", email: `sch-e-${run}@example.invalid`, phone: "0000000000", role: "V", status: "ACTIVE", joinDate: "2026-09-11", passwordHash: "synthetic-not-authenticatable" } });
  const alternateEvaluator = await prisma.user.create({ data: { code: `SCH-F-${run}`, name: "Synthetic alternate evaluator", email: `sch-f-${run}@example.invalid`, phone: "0000000000", role: "V", status: "ACTIVE", joinDate: "2026-09-11", passwordHash: "synthetic-not-authenticatable" } });
  const deniedUser = await prisma.user.create({ data: { code: `SCH-D-${run}`, name: "Synthetic denied actor", email: `sch-d-${run}@example.invalid`, phone: "0000000000", role: "V", status: "ACTIVE", joinDate: "2026-09-11", passwordHash: "synthetic-not-authenticatable" } });
  const schedulingPermissions = ["survey:schedule:view", "survey:schedule:manage", "survey:schedule:assign", "survey:schedule:reschedule", "survey:visit-fee:view", "survey:visit-fee:approve"];
  const adminMembership = await prisma.tenantMembership.create({ data: { tenantId: tenant.id, userId: admin.id, role: "A", grantedPermissions: [...schedulingPermissions, "survey:perform"], deniedPermissions: [] } });
  const crossTenantMembership = await prisma.tenantMembership.create({ data: { tenantId: otherTenant.id, userId: admin.id, role: "A", grantedPermissions: schedulingPermissions, deniedPermissions: [] } });
  const evaluatorMembership = await prisma.tenantMembership.create({ data: { tenantId: tenant.id, userId: evaluator.id, role: "V", grantedPermissions: ["survey:schedule:view", "survey:assignment:view", "survey:perform"], deniedPermissions: [] } });
  const alternateEvaluatorMembership = await prisma.tenantMembership.create({ data: { tenantId: tenant.id, userId: alternateEvaluator.id, role: "V", grantedPermissions: ["survey:schedule:view", "survey:perform"], deniedPermissions: [] } });
  const deniedMembership = await prisma.tenantMembership.create({ data: { tenantId: tenant.id, userId: deniedUser.id, role: "V", grantedPermissions: [], deniedPermissions: ["survey:schedule:view"] } });
  const service = await prisma.serviceCatalogItem.create({ data: { tenantId: tenant.id, code: `MOVING_${run}`, name: "Mudanza local", usage: "PRIMARY", compatibleModes: ["LOCAL"] } });
  const firstCase = await createCase(tenant, adminMembership, admin, service, "01");
  const secondCase = await createCase(tenant, adminMembership, admin, service, "02");
  const context = { tenantId: tenant.id, membershipId: adminMembership.id, userId: admin.id };
  const deniedContext = { tenantId: tenant.id, membershipId: deniedMembership.id, userId: deniedUser.id };

  const policyConfiguration = {
    ...HISTORICAL_POLICY_TEMPLATE,
    profiles: HISTORICAL_POLICY_TEMPLATE.profiles.map((row) => ({
      code: row.code,
      zoneType: row.zoneType,
      minDistanceExclusiveKm: row.minDistanceExclusiveKm ?? null,
      maxDistanceKm: row.maxDistanceKm ?? null,
      dailyCapacity: row.dailyCapacity,
    })),
    slots: HISTORICAL_POLICY_TEMPLATE.slots.map((row) => ({ ...row })),
    closedWeekdays: [...HISTORICAL_POLICY_TEMPLATE.closedWeekdays],
    closedDates: [],
    freeZoneCodes: [],
    evaluatorCapabilities: [
      { membershipRef: evaluatorMembership.publicRef, capabilities: ["CAN_PERFORM_IN_PERSON_SURVEY"] },
      { membershipRef: alternateEvaluatorMembership.publicRef, capabilities: ["CAN_PERFORM_IN_PERSON_SURVEY"] },
      { membershipRef: adminMembership.publicRef, capabilities: ["CAN_APPROVE_VISIT_FEE", "CAN_PERFORM_IN_PERSON_SURVEY"] },
    ],
  };
  const policy = await mutateSurveyScheduling(context, command("PUBLISH_POLICY", { seriesRef: null, expectedVersion: 0, timezone: "America/Santo_Domingo", configuration: policyConfiguration, validFrom: new Date(Date.now() - 60_000).toISOString() }), prisma);
  assert.equal(policy.version, 1); assertions += 1;

  const decide = (caseRef) => mutateSurveyScheduling(context, command("DECIDE_METHOD", { caseRef, expectedVersion: null, method: "IN_PERSON", commercialState: "READY_TO_SCHEDULE", informationSource: "COMMERCIAL", rationaleCode: "CLIENT_REQUEST" }), prisma);
  const firstDecision = await decide(firstCase.publicRef);
  const secondDecision = await decide(secondCase.publicRef);
  assert.deepEqual([firstDecision.state, secondDecision.state], ["READY_TO_SCHEDULE", "READY_TO_SCHEDULE"]); assertions += 1;

  const makeSchedule = (decisionRef) => command("SCHEDULE", { decisionRef, expectedDecisionVersion: 1, evaluatorMembershipRef: evaluatorMembership.publicRef, scheduledStart: "2026-09-14T13:00:00.000Z", scheduledEnd: "2026-09-14T16:00:00.000Z", slotKey: "MORNING", instruction: "Synthetic controlled visit", saturdayApprovalReason: null });
  const concurrent = await Promise.allSettled([
    mutateSurveyScheduling(context, makeSchedule(firstDecision.decisionRef), prisma),
    mutateSurveyScheduling(context, makeSchedule(secondDecision.decisionRef), prisma),
  ]);
  assert.equal(concurrent.filter((row) => row.status === "fulfilled").length, 1); assertions += 1;
  assert.equal(concurrent.filter((row) => row.status === "rejected").length, 1); assertions += 1;
  const winner = concurrent.find((row) => row.status === "fulfilled").value;
  const loser = concurrent.find((row) => row.status === "rejected").reason;
  check(loser?.status === 409, "la colisión devuelve conflicto estable");
  const evaluatorAgenda = await listSurveyAgenda({ tenantId: tenant.id, membershipId: evaluatorMembership.id, userId: evaluator.id }, prisma);
  assert.equal(evaluatorAgenda.length, 1); assertions += 1;
  assert.equal(evaluatorAgenda[0].evaluationMethod, "IN_PERSON"); assertions += 1;
  assert.equal(evaluatorAgenda[0].serviceSelectionRef != null, true); assertions += 1;
  assert.deepEqual(evaluatorAgenda[0].context.services.map((item) => item.name), ["Mudanza local"]); assertions += 1;
  assert.match(evaluatorAgenda[0].context.origin, /Synthetic origin/); assertions += 1;
  assert.match(evaluatorAgenda[0].context.destination, /Synthetic destination/); assertions += 1;

  const replayRequest = randomUUID();
  const replayCommand = command("RESCHEDULE", { assignmentRef: winner.assignmentRef, expectedVersion: 1, scheduledStart: "2026-09-14T18:00:00.000Z", scheduledEnd: "2026-09-14T20:30:00.000Z", slotKey: "AFTERNOON", reasonCode: "CLIENT_CONFIRMED", notificationRequired: true, saturdayApprovalReason: null }, replayRequest);
  const competingReschedule = command("RESCHEDULE", { assignmentRef: winner.assignmentRef, expectedVersion: 1, scheduledStart: "2026-09-14T18:00:00.000Z", scheduledEnd: "2026-09-14T20:30:00.000Z", slotKey: "AFTERNOON", reasonCode: "SECOND_ACTOR_REQUEST", notificationRequired: true, saturdayApprovalReason: null });
  const reschedules = await Promise.allSettled([mutateSurveyScheduling(context, replayCommand, prisma), mutateSurveyScheduling(context, competingReschedule, prisma)]);
  assert.equal(reschedules.filter((row) => row.status === "fulfilled").length, 1); assertions += 1;
  assert.equal(reschedules.filter((row) => row.status === "rejected" && row.reason?.status === 409).length, 1); assertions += 1;
  const changed = reschedules.find((row) => row.status === "fulfilled").value;
  const winningRescheduleCommand = reschedules[0].status === "fulfilled" ? replayCommand : competingReschedule;
  const replayed = await mutateSurveyScheduling(context, winningRescheduleCommand, prisma);
  assert.deepEqual(replayed, changed); assertions += 1;
  assert.equal(await prisma.surveyMutationCommand.count({ where: { tenantId: tenant.id, requestId: winningRescheduleCommand.requestId } }), 1); assertions += 1;
  assert.equal(await prisma.commercialAuditLog.count({ where: { tenant_id: tenant.id, request_id: winningRescheduleCommand.requestId } }), 1); assertions += 1;

  const evaluatorChanges = await Promise.allSettled([
    mutateSurveyScheduling(context, command("CHANGE_EVALUATOR", { assignmentRef: winner.assignmentRef, expectedVersion: 2, evaluatorMembershipRef: alternateEvaluatorMembership.publicRef, reasonCode: "LOAD_BALANCE", notificationRequired: true }), prisma),
    mutateSurveyScheduling(context, command("CHANGE_EVALUATOR", { assignmentRef: winner.assignmentRef, expectedVersion: 2, evaluatorMembershipRef: adminMembership.publicRef, reasonCode: "COMMERCIAL_VISIT", notificationRequired: true }), prisma),
  ]);
  assert.equal(evaluatorChanges.filter((row) => row.status === "fulfilled").length, 1); assertions += 1;
  assert.equal(evaluatorChanges.filter((row) => row.status === "rejected" && row.reason?.status === 409).length, 1); assertions += 1;

  const winningCase = concurrent[0].status === "fulfilled" ? firstCase : secondCase;
  const workspace = await getSurveySchedulingWorkspace(context, { caseRef: winningCase.publicRef, date: "2026-09-14" }, prisma);
  assert.equal(workspace.assignment.slotKey, "AFTERNOON"); assertions += 1;
  assert.equal(workspace.assignment.version, 3); assertions += 1;
  assert.equal(workspace.availability.dayOccupied, 1); assertions += 1;
  assert.equal(workspace.availability.slots.find((slot) => slot.key === "AFTERNOON").available, false); assertions += 1;
  check(!JSON.stringify(workspace).includes(adminMembership.id) && !JSON.stringify(workspace).includes(evaluatorMembership.id), "DTO no publica PK internas");

  const fee = await mutateSurveyScheduling(context, command("UPDATE_VISIT_FEE", { decisionRef: winner.decisionRef, expectedVersion: null, disposition: "FREE", suggestedAmount: null, currency: null, logisticsRevisionRef: null, costingRevisionRef: null, costingLineRef: null, communicationStatus: "NOT_COMMUNICATED", approvalStatus: "NOT_REQUIRED", paymentStatus: "NOT_REQUIRED", waiverReason: null }), prisma);
  assert.equal(fee.disposition, "FREE"); assertions += 1;
  const communication = await mutateSurveyScheduling(context, command("PREPARE_COMMUNICATION", { decisionRef: winner.decisionRef, assignmentRef: winner.assignmentRef, templateCode: "PIC_CLIENT_VISIT", templateVersion: 1, audience: "CLIENT", channel: "WHATSAPP", recipientRef: null, contentHash: "5".repeat(64) }), prisma);
  assert.equal(communication.status, "PREPARED"); assertions += 1;

  await prisma.pipelineCaseRouteSnapshot.createMany({ data: [
    { tenantId: tenant.id, pipelineCaseId: winningCase.id, routeVersion: 2, role: "ORIGIN", stopOrder: 0, countryCode: "DO", provinceState: "Santiago", cityMunicipality: "Santiago", streetAndNumber: "Synthetic changed origin" },
    { tenantId: tenant.id, pipelineCaseId: winningCase.id, routeVersion: 2, role: "DESTINATION", stopOrder: 0, countryCode: "DO", provinceState: "Distrito Nacional", cityMunicipality: "Santo Domingo", streetAndNumber: "Synthetic destination" },
  ] });
  await prisma.pipelineCase.update({ where: { id: winningCase.id }, data: { routeRevision: 2 } });
  const staleWorkspace = await getSurveySchedulingWorkspace(context, { caseRef: winningCase.publicRef }, prisma);
  assert.equal(staleWorkspace.assignment.routeStale, true); assertions += 1;
  await assert.rejects(mutateSurveyScheduling(context, command("RESCHEDULE", { assignmentRef: winner.assignmentRef, expectedVersion: 3, scheduledStart: "2026-09-15T13:00:00.000Z", scheduledEnd: "2026-09-15T16:00:00.000Z", slotKey: "MORNING", reasonCode: "ROUTE_CHANGED", notificationRequired: true, saturdayApprovalReason: null }), prisma), /CRM_SURVEY_ROUTE_REVALIDATION_REQUIRED/); assertions += 1;

  await assert.rejects(getSurveySchedulingWorkspace(deniedContext, { caseRef: winningCase.publicRef }, prisma), /CRM_SURVEY_PERMISSION_FORBIDDEN/); assertions += 1;
  await assert.rejects(getSurveySchedulingWorkspace({ tenantId: otherTenant.id, membershipId: crossTenantMembership.id, userId: admin.id }, { caseRef: winningCase.publicRef }, prisma), /CRM_SURVEY_RESOURCE_NOT_FOUND/); assertions += 1;
  await assert.rejects(prisma.surveyAssignmentEvent.update({ where: { id: (await prisma.surveyAssignmentEvent.findFirst({ where: { tenantId: tenant.id } })).id }, data: { reasonCode: "MUTATED" } }), /SURVEY_SCHEDULING_APPEND_ONLY/); assertions += 1;

  const counts = await Promise.all([
    prisma.surveyEvaluationDecision.count({ where: { tenantId: tenant.id } }),
    prisma.surveyAssignment.count({ where: { tenantId: tenant.id } }),
    prisma.surveyAssignmentEvent.count({ where: { tenantId: tenant.id } }),
    prisma.surveyVisitFee.count({ where: { tenantId: tenant.id } }),
    prisma.surveyCommunicationRecord.count({ where: { tenantId: tenant.id } }),
  ]);
  assert.deepEqual(counts.slice(1), [1, 7, 1, 1]); assertions += 1;
  process.stdout.write(`${JSON.stringify({ ok: true, assertions, migrations: "30/30", simultaneousSlotWinners: 1, simultaneousSlotLosers: 1, concurrentRescheduleWinners: 1, concurrentEvaluatorChangeWinners: 1, idempotentCommands: 1, routeRevalidation: "REQUIRED", counts })}\n`);
} finally {
  await prisma.$disconnect();
}
