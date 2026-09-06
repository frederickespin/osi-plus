import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import { appendCommercialAudit } from "./commercialAuditLog.js";
import { PERMS, permsForRole } from "./rbac.js";
import { resolveSurveyAuthorization } from "./crmSurveyDomain.js";
import {
  normalizeSchedulingMutation,
  resolveOperationalCapability,
  resolveScheduleProfile,
  resolveSlotAvailability,
  schedulingHash,
  schedulingFail,
} from "./surveySchedulingContract.js";

const SOURCE = "V17_SCHEDULING_DESKTOP_CONVERGENCE_11B";
const SERIALIZABLE = Object.freeze({ isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 3_000, timeout: 20_000 });

function requiredPermission(operation) {
  if (operation === "PUBLISH_POLICY" || operation === "DECIDE_METHOD" || operation === "CANCEL" || operation === "PREPARE_COMMUNICATION") return PERMS.SURVEY_SCHEDULE_MANAGE;
  if (operation === "SCHEDULE" || operation === "CHANGE_EVALUATOR") return PERMS.SURVEY_SCHEDULE_ASSIGN;
  if (operation === "RESCHEDULE") return PERMS.SURVEY_SCHEDULE_RESCHEDULE;
  if (operation === "UPDATE_VISIT_FEE") return PERMS.SURVEY_VISIT_FEE_APPROVE;
  schedulingFail("CRM_SURVEY_SCHEDULING_INPUT_INVALID");
}

async function limits(tx) {
  await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '500ms'");
  await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '15s'");
}
async function lock(tx, tenantId, key) {
  const rows = await tx.$queryRaw(Prisma.sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${`SURVEY-11B:${tenantId}:${key}`},0)) AS "ok"`);
  if (rows[0]?.ok !== true) schedulingFail("CRM_SURVEY_SCHEDULING_CONFLICT", 409);
}
async function replay(tx, tenantId, command) {
  const prior = await tx.surveyMutationCommand.findFirst({ where: { tenantId, requestId: command.requestId } });
  if (!prior) return null;
  if (prior.operation !== command.operation || prior.payloadHash !== command.payloadHash) schedulingFail("CRM_SURVEY_IDEMPOTENCY_CONFLICT", 409);
  return Object.freeze(prior.resultJson);
}
async function persist(tx, who, command, targetRef, version, result, action, entity = "SURVEY_SCHEDULING") {
  await tx.surveyMutationCommand.create({ data: { tenantId: who.tenantId, requestId: command.requestId, operation: command.operation, payloadHash: command.payloadHash, targetRef, resultingVersion: version, actorMembershipId: who.membershipId, actorUserId: who.userId, resultJson: result } });
  await appendCommercialAudit(tx, { tenantId: who.tenantId, actorKind: "MEMBERSHIP", actorMembershipId: who.membershipId }, { source: SOURCE, action, entity, entityId: targetRef, requestId: command.requestId, correlationId: command.requestId, beforeJson: null, afterJson: { version }, metadataJson: { operation: command.operation } });
  return Object.freeze(result);
}
function publicScope(who) {
  if (who.effective.has(PERMS.SURVEY_SCHEDULE_MANAGE) || who.effective.has(PERMS.PIPELINE_UPDATE_ANY)) return {};
  return { ownerMembershipId: who.membershipId, ownerUserId: who.userId };
}
async function caseByRef(tx, who, caseRef) {
  const row = await tx.pipelineCase.findFirst({ where: { tenantId: who.tenantId, publicRef: caseRef, ...publicScope(who) }, include: { client: true, serviceRevisions: { orderBy: { revision: "desc" }, take: 1 }, routeSnapshots: { orderBy: [{ routeVersion: "desc" }, { role: "asc" }, { stopOrder: "asc" }] } } });
  if (!row) schedulingFail("CRM_SURVEY_RESOURCE_NOT_FOUND", 404);
  return row;
}
async function decisionByRef(tx, who, decisionRef) {
  const decision = await tx.surveyEvaluationDecision.findFirst({ where: { tenantId: who.tenantId, decisionRef } });
  if (!decision) schedulingFail("CRM_SURVEY_RESOURCE_NOT_FOUND", 404);
  const pipelineCase = await tx.pipelineCase.findFirst({ where: { tenantId: who.tenantId, id: decision.pipelineCaseId, ...publicScope(who) }, include: { client: true, serviceRevisions: { orderBy: { revision: "desc" }, take: 1 }, routeSnapshots: { orderBy: [{ routeVersion: "desc" }, { role: "asc" }, { stopOrder: "asc" }] } } });
  if (!pipelineCase) schedulingFail("CRM_SURVEY_RESOURCE_NOT_FOUND", 404);
  return { decision, pipelineCase };
}
async function activePolicy(tx, tenantId) {
  const now = new Date();
  const rows = await tx.surveySchedulePolicyVersion.findMany({ where: { tenantId, state: "ACTIVE", AND: [{ OR: [{ validFrom: null }, { validFrom: { lte: now } }] }, { OR: [{ validTo: null }, { validTo: { gt: now } }] }] }, orderBy: { version: "desc" }, take: 2 });
  if (rows.length !== 1) schedulingFail("CRM_SURVEY_SCHEDULE_POLICY_NOT_READY", 409);
  return rows[0];
}
function motorZone(revision, routeVersion) {
  if (!revision || Number(revision.inputSnapshot?.route?.version) !== routeVersion) schedulingFail("CRM_SURVEY_LOGISTICS_REVISION_REQUIRED", 409);
  const route = revision.inputSnapshot?.route || {};
  const zoneItem = revision.resultSnapshot?.items?.find((item) => item?.snapshot?.zoneType);
  const zoneType = route.zoneType || zoneItem?.snapshot?.zoneType;
  const zoneCode = route.zoneCode || zoneItem?.snapshot?.zoneCode || zoneType;
  if (typeof zoneType !== "string" || typeof zoneCode !== "string") schedulingFail("CRM_SURVEY_ZONE_UNRESOLVED", 409);
  return { zoneType, zoneCode, distanceKm: route.distanceKm == null ? null : Number(route.distanceKm) };
}
function routeSummary(route) {
  if (!route) return null;
  return [route.streetAndNumber, route.sector, route.cityMunicipality, route.provinceState, route.countryCode].filter(Boolean).join(", ") || null;
}
function evaluatorContext(pipelineCase, serviceRevision, decision, policy, zone) {
  const routes = pipelineCase.routeSnapshots.filter((route) => route.routeVersion === pipelineCase.routeRevision);
  return Object.freeze({
    caseCode: pipelineCase.caseCode,
    clientDisplayName: pipelineCase.client?.displayName || null,
    company: null,
    leadAccount: null,
    booker: null,
    origin: routeSummary(routes.find((route) => route.role === "ORIGIN")),
    destination: routeSummary(routes.find((route) => route.role === "DESTINATION")),
    routeVersion: pipelineCase.routeRevision,
    serviceSelectionRef: serviceRevision.selectionRef,
    services: serviceRevision.items.map((item) => ({ kind: item.kind, code: item.codeSnapshot, name: item.nameSnapshot })),
    evaluationMethod: decision.method,
    schedulingPolicyRef: policy.policyRef,
    zone: { type: zone.zoneType, code: zone.zoneCode, distanceKm: zone.distanceKm },
  });
}
async function latestMotor(tx, tenantId, pipelineCaseId) {
  return tx.logisticsPlanRevision.findFirst({ where: { tenantId, plan: { pipelineCaseId }, status: "PUBLISHED" }, orderBy: { revision: "desc" } });
}
async function evaluator(tx, who, policy, membershipRef, method, profile) {
  const row = await tx.tenantMembership.findFirst({ where: { tenantId: who.tenantId, publicRef: membershipRef, status: "ACTIVE", user: { status: "ACTIVE" } }, include: { user: true } });
  if (!row) schedulingFail("CRM_SURVEY_RESOURCE_NOT_FOUND", 404);
  const denied = new Set(row.deniedPermissions || []);
  const effective = new Set([...permsForRole(row.role), ...(row.grantedPermissions || [])].filter((permission) => !denied.has(permission)));
  if (!effective.has(PERMS.SURVEY_PERFORM) || denied.has(PERMS.SURVEY_PERFORM) || !resolveOperationalCapability(policy.configuration, row.publicRef, method, profile)) schedulingFail("CRM_SURVEY_EVALUATOR_INVALID", 409);
  return row;
}
async function scheduleCapacity(tx, who, policy, profile, zoneCode, slotKey, start, end, excludeId = null, saturdayApproved = false) {
  const date = start.toISOString().slice(0, 10);
  await lock(tx, who.tenantId, `CAPACITY:${policy.id}:${profile}:${zoneCode}:${date}:${slotKey}`);
  await lock(tx, who.tenantId, `EVALUATOR:${date}`);
  const base = { tenantId: who.tenantId, schedulePolicyId: policy.id, scheduleProfile: profile, zoneCode, scheduledStart: { gte: new Date(`${date}T00:00:00.000Z`), lt: new Date(`${date}T23:59:59.999Z`) }, status: { not: "CANCELLED" }, routeInvalidatedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) };
  const [dayCount, slotCount] = await Promise.all([tx.surveyAssignment.count({ where: base }), tx.surveyAssignment.count({ where: { ...base, slotKey } })]);
  return resolveSlotAvailability(policy.configuration, { profile, date, slotKey, dayCount, slotCount, saturdayApproved });
}
async function assertEvaluatorInterval(tx, who, evaluatorRow, start, end, excludeId = null) {
  const overlap = await tx.surveyAssignment.findFirst({ where: { tenantId: who.tenantId, evaluatorMembershipId: evaluatorRow.id, evaluatorUserId: evaluatorRow.userId, status: { not: "CANCELLED" }, routeInvalidatedAt: null, scheduledStart: { lt: end }, OR: [{ scheduledEnd: null }, { scheduledEnd: { gt: start } }], ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true } });
  if (overlap) schedulingFail("CRM_SURVEY_EVALUATOR_CONFLICT", 409);
}
function snapshotAssignment(row) {
  return { assignmentRef: row.assignmentRef, scheduledStart: row.scheduledStart.toISOString(), scheduledEnd: row.scheduledEnd?.toISOString() || null, evaluatorMembershipRef: row.evaluatorMembership?.publicRef || null, slotKey: row.slotKey, profile: row.scheduleProfile, zoneCode: row.zoneCode, status: row.status, version: row.version };
}
async function event(tx, who, decision, pipelineCaseId, assignmentId, eventType, beforeSnapshot, afterSnapshot, reasonCode = null, notificationRequired = false) {
  return tx.surveyAssignmentEvent.create({ data: { tenantId: who.tenantId, pipelineCaseId, evaluationDecisionId: decision.id, assignmentId, eventType, reasonCode, notificationRequired, beforeSnapshot, afterSnapshot, actorMembershipId: who.membershipId, actorUserId: who.userId } });
}

export async function getSurveySchedulingWorkspace(context, query, database) {
  return database.$transaction(async (tx) => {
    const who = await resolveSurveyAuthorization(tx, context, [PERMS.SURVEY_SCHEDULE_VIEW, PERMS.SURVEY_SCHEDULE_MANAGE], { any: true });
    const caseRef = String(query?.caseRef || "");
    const pipelineCase = await caseByRef(tx, who, caseRef);
    const decision = await tx.surveyEvaluationDecision.findFirst({ where: { tenantId: who.tenantId, pipelineCaseId: pipelineCase.id }, orderBy: { version: "desc" } });
    const assignment = decision ? await tx.surveyAssignment.findFirst({ where: { tenantId: who.tenantId, evaluationDecisionId: decision.id }, include: { evaluatorMembership: { include: { user: true } }, drafts: { orderBy: { revision: "desc" }, take: 1 } }, orderBy: { createdAt: "desc" } }) : null;
    const [policy, fee, events, communications, publication, motor] = await Promise.all([
      tx.surveySchedulePolicyVersion.findFirst({ where: { tenantId: who.tenantId, state: "ACTIVE" }, orderBy: { version: "desc" } }),
      decision ? tx.surveyVisitFee.findFirst({ where: { tenantId: who.tenantId, evaluationDecisionId: decision.id } }) : null,
      tx.surveyAssignmentEvent.findMany({ where: { tenantId: who.tenantId, pipelineCaseId: pipelineCase.id }, orderBy: { createdAt: "desc" }, take: 50 }),
      tx.surveyCommunicationRecord.findMany({ where: { tenantId: who.tenantId, pipelineCaseId: pipelineCase.id }, orderBy: { preparedAt: "desc" }, take: 20 }),
      tx.surveyPublication.findFirst({ where: { tenantId: who.tenantId, pipelineCaseId: pipelineCase.id, status: "CURRENT" }, orderBy: { publishedAt: "desc" }, include: { publishedByMembership: { include: { user: true } }, items: true, accessSnapshots: true } }),
      latestMotor(tx, who.tenantId, pipelineCase.id),
    ]);
    let schedulingContext = null;
    let availability = null;
    if (policy && motor) {
      let resolved = null;
      try {
        const zone = motorZone(motor, pipelineCase.routeRevision);
        const profile = resolveScheduleProfile(policy.configuration, zone.zoneType, zone.distanceKm);
        schedulingContext = { profile: profile.code, zoneCode: zone.zoneCode, distanceStatus: zone.distanceKm == null ? "PENDING" : "KNOWN", distanceKm: zone.distanceKm };
        resolved = { zone, profile };
      } catch { schedulingContext = null; }
      if (resolved) {
        const { zone, profile } = resolved;
        const requestedDate = query?.date == null || query.date === "" ? null : String(query.date);
        if (requestedDate) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate) || new Date(`${requestedDate}T12:00:00.000Z`).toISOString().slice(0, 10) !== requestedDate) schedulingFail("CRM_SURVEY_SLOT_INVALID");
          const base = { tenantId: who.tenantId, schedulePolicyId: policy.id, scheduleProfile: profile.code, zoneCode: zone.zoneCode, scheduledStart: { gte: new Date(`${requestedDate}T00:00:00.000Z`), lt: new Date(`${requestedDate}T23:59:59.999Z`) }, status: { not: "CANCELLED" }, routeInvalidatedAt: null };
          const rows = await tx.surveyAssignment.groupBy({ by: ["slotKey"], where: base, _count: { _all: true } });
          const bySlot = new Map(rows.map((row) => [row.slotKey, row._count._all]));
          const dayOccupied = rows.reduce((sum, row) => sum + row._count._all, 0);
          const day = new Date(`${requestedDate}T12:00:00.000Z`).getUTCDay();
          const closed = policy.configuration.closedDates.includes(requestedDate) || policy.configuration.closedWeekdays.includes(day);
          availability = {
            date: requestedDate,
            profile: profile.code,
            dayOccupied,
            dayCapacity: profile.dailyCapacity,
            closed,
            saturdayApprovalRequired: day === 6 && policy.configuration.saturdayRequiresApproval,
            slots: policy.configuration.slots.filter((slot) => slot.profile === profile.code).map((slot) => ({ key: slot.key, occupied: bySlot.get(slot.key) || 0, capacity: slot.capacity, available: !closed && dayOccupied < profile.dailyCapacity && (bySlot.get(slot.key) || 0) < slot.capacity })),
          };
        }
      }
    }
    const canAssign = who.effective.has(PERMS.SURVEY_SCHEDULE_ASSIGN) && policy;
    const candidates = canAssign ? await tx.tenantMembership.findMany({ where: { tenantId: who.tenantId, status: "ACTIVE", publicRef: { in: policy.configuration.evaluatorCapabilities.map((entry) => entry.membershipRef) }, user: { status: "ACTIVE" } }, include: { user: true }, orderBy: { user: { name: "asc" } } }) : [];
    return Object.freeze({
      caseRef: pipelineCase.publicRef,
      caseCode: pipelineCase.caseCode,
      routeVersion: pipelineCase.routeRevision,
      decision: decision ? { decisionRef: decision.decisionRef, method: decision.method, state: decision.commercialState, informationSource: decision.informationSource, rationaleCode: decision.rationaleCode, routeVersion: decision.routeVersion, version: decision.version, createdAt: decision.createdAt.toISOString() } : null,
      assignment: assignment ? { ...snapshotAssignment(assignment), evaluator: { displayName: assignment.evaluatorMembership.user.name }, instruction: assignment.instructionSnapshot, routeStale: assignment.routeVersion !== pipelineCase.routeRevision || Boolean(assignment.routeInvalidatedAt), surveyRef: assignment.drafts[0]?.surveyRef || null } : null,
      policy: policy ? { policyRef: policy.policyRef, version: policy.version, timezone: policy.timezone, profiles: policy.configuration.profiles, slots: policy.configuration.slots, closedWeekdays: policy.configuration.closedWeekdays, closedDates: policy.configuration.closedDates, saturdayRequiresApproval: policy.configuration.saturdayRequiresApproval } : null,
      schedulingContext,
      availability,
      evaluatorCandidates: candidates.map((row) => ({ membershipRef: row.publicRef, displayName: row.user.name, capabilities: policy.configuration.evaluatorCapabilities.find((entry) => entry.membershipRef === row.publicRef)?.capabilities || [] })),
      visitFee: fee ? { feeRef: fee.feeRef, disposition: fee.disposition, suggestedAmount: fee.suggestedAmount == null ? null : Number(fee.suggestedAmount), currency: fee.currency, communicationStatus: fee.communicationStatus, approvalStatus: fee.approvalStatus, paymentStatus: fee.paymentStatus, version: fee.version } : null,
      communications: communications.map((row) => ({ communicationRef: row.communicationRef, templateCode: row.templateCode, templateVersion: row.templateVersion, audience: row.audience, channel: row.channel, status: row.status, preparedAt: row.preparedAt.toISOString() })),
      history: events.map((row) => ({ eventRef: row.eventRef, type: row.eventType, reasonCode: row.reasonCode, notificationRequired: row.notificationRequired, createdAt: row.createdAt.toISOString() })),
      publication: publication ? { publicationRef: publication.publicationRef, publishedAt: publication.publishedAt.toISOString(), evaluatorDisplayName: publication.publishedByMembership.user.name, totals: publication.totalsSnapshot, needs: { flaggedItems: publication.items.filter((item) => item.flags.length > 0).length }, access: publication.accessSnapshots.map((entry) => ({ side: entry.side, facts: entry.factsSnapshot })) } : null,
    });
  });
}

async function decide(tx, who, command) {
  const pipelineCase = await caseByRef(tx, who, command.caseRef);
  await lock(tx, who.tenantId, `DECISION:${pipelineCase.id}`);
  const prior = await tx.surveyEvaluationDecision.findFirst({ where: { tenantId: who.tenantId, pipelineCaseId: pipelineCase.id }, orderBy: { version: "desc" } });
  if ((prior?.version || null) !== command.expectedVersion) schedulingFail("CRM_SURVEY_VERSION_CONFLICT", 409);
  const service = pipelineCase.serviceRevisions[0] || null;
  const row = await tx.surveyEvaluationDecision.create({ data: { tenantId: who.tenantId, pipelineCaseId: pipelineCase.id, serviceRevisionId: service?.id || null, routeVersion: pipelineCase.routeRevision, version: (prior?.version || 0) + 1, method: command.method, commercialState: command.commercialState, informationSource: command.informationSource, rationaleCode: command.rationaleCode, seriesRef: prior?.seriesRef || randomUUID(), replacesDecisionId: prior?.id || null, createdByMembershipId: who.membershipId, createdByUserId: who.userId } });
  await event(tx, who, row, pipelineCase.id, null, "METHOD_DECIDED", prior ? { method: prior.method, state: prior.commercialState, version: prior.version } : null, { method: row.method, state: row.commercialState, version: row.version });
  return persist(tx, who, command, row.decisionRef, row.version, { decisionRef: row.decisionRef, method: row.method, state: row.commercialState, version: row.version, replayed: false }, "SURVEY_METHOD_DECIDED");
}

async function publishPolicy(tx, who, command) {
  await lock(tx, who.tenantId, "POLICY");
  const latest = await tx.surveySchedulePolicyVersion.findFirst({ where: { tenantId: who.tenantId }, orderBy: { version: "desc" } });
  if ((latest?.version || 0) !== command.expectedVersion || (command.seriesRef && latest?.seriesRef !== command.seriesRef)) schedulingFail("CRM_SURVEY_VERSION_CONFLICT", 409);
  if (latest?.state === "ACTIVE") await tx.surveySchedulePolicyVersion.update({ where: { id: latest.id }, data: { state: "RETIRED", validTo: new Date(command.validFrom) } });
  const row = await tx.surveySchedulePolicyVersion.create({ data: { tenantId: who.tenantId, seriesRef: latest?.seriesRef || command.seriesRef || randomUUID(), version: (latest?.version || 0) + 1, state: "ACTIVE", timezone: command.timezone, configuration: command.configuration, configurationHash: schedulingHash(command.configuration), validFrom: new Date(command.validFrom), replacesPolicyId: latest?.id || null, createdByMembershipId: who.membershipId, createdByUserId: who.userId } });
  return persist(tx, who, command, row.policyRef, row.version, { policyRef: row.policyRef, version: row.version, state: row.state, replayed: false }, "SURVEY_SCHEDULE_POLICY_PUBLISHED", "SURVEY_SCHEDULE_POLICY");
}

async function schedule(tx, who, command) {
  const { decision, pipelineCase } = await decisionByRef(tx, who, command.decisionRef);
  const latest = await tx.surveyEvaluationDecision.findFirst({ where: { tenantId: who.tenantId, pipelineCaseId: pipelineCase.id }, orderBy: { version: "desc" } });
  if (!latest || latest.id !== decision.id || decision.version !== command.expectedDecisionVersion || decision.method !== "IN_PERSON" || decision.commercialState !== "READY_TO_SCHEDULE") schedulingFail("CRM_SURVEY_VERSION_CONFLICT", 409);
  if (!decision.serviceRevisionId) schedulingFail("CRM_SURVEY_SERVICE_REVISION_REQUIRED", 409);
  const serviceRevision = await tx.pipelineCaseServiceRevision.findFirst({ where: { tenantId: who.tenantId, pipelineCaseId: pipelineCase.id, id: decision.serviceRevisionId }, include: { items: { orderBy: { position: "asc" } } } });
  if (!serviceRevision) schedulingFail("CRM_SURVEY_RESOURCE_NOT_FOUND", 404);
  const policy = await activePolicy(tx, who.tenantId);
  const motor = await latestMotor(tx, who.tenantId, pipelineCase.id);
  const zone = motorZone(motor, pipelineCase.routeRevision);
  const profileConfig = resolveScheduleProfile(policy.configuration, zone.zoneType, zone.distanceKm);
  const evaluatorRow = await evaluator(tx, who, policy, command.evaluatorMembershipRef, decision.method, profileConfig.code);
  const start = new Date(command.scheduledStart); const end = new Date(command.scheduledEnd);
  const saturdayApproved = Boolean(command.saturdayApprovalReason);
  await scheduleCapacity(tx, who, policy, profileConfig.code, zone.zoneCode, command.slotKey, start, end, null, saturdayApproved);
  await assertEvaluatorInterval(tx, who, evaluatorRow, start, end);
  const nextDecision = await tx.surveyEvaluationDecision.create({ data: { tenantId: who.tenantId, pipelineCaseId: pipelineCase.id, serviceRevisionId: decision.serviceRevisionId, routeVersion: pipelineCase.routeRevision, version: decision.version + 1, method: decision.method, commercialState: "SCHEDULED", informationSource: decision.informationSource, rationaleCode: decision.rationaleCode, seriesRef: decision.seriesRef, replacesDecisionId: decision.id, createdByMembershipId: who.membershipId, createdByUserId: who.userId } });
  const assignment = await tx.surveyAssignment.create({ data: { tenantId: who.tenantId, pipelineCaseId: pipelineCase.id, serviceRevisionId: serviceRevision.id, routeVersion: pipelineCase.routeRevision, evaluatorMembershipId: evaluatorRow.id, evaluatorUserId: evaluatorRow.userId, scheduledStart: start, scheduledEnd: end, contextSnapshot: evaluatorContext(pipelineCase, serviceRevision, nextDecision, policy, zone), instructionSnapshot: command.instruction, evaluationDecisionId: nextDecision.id, schedulePolicyId: policy.id, scheduleProfile: profileConfig.code, zoneCode: zone.zoneCode, slotKey: command.slotKey, createdByMembershipId: who.membershipId, createdByUserId: who.userId }, include: { evaluatorMembership: true } });
  await event(tx, who, nextDecision, pipelineCase.id, assignment.id, "SCHEDULED", null, snapshotAssignment({ ...assignment, evaluatorMembership: evaluatorRow }), command.saturdayApprovalReason ? "SATURDAY_APPROVED" : null, true);
  return persist(tx, who, command, assignment.assignmentRef, assignment.version, { assignmentRef: assignment.assignmentRef, decisionRef: nextDecision.decisionRef, status: assignment.status, version: assignment.version, replayed: false }, "SURVEY_ASSIGNMENT_SCHEDULED");
}

async function assignmentByRef(tx, who, ref) {
  const row = await tx.surveyAssignment.findFirst({ where: { tenantId: who.tenantId, assignmentRef: ref }, include: { evaluatorMembership: { include: { user: true } } } });
  if (!row) schedulingFail("CRM_SURVEY_RESOURCE_NOT_FOUND", 404);
  const pipelineCase = await tx.pipelineCase.findFirst({ where: { tenantId: who.tenantId, id: row.pipelineCaseId, ...publicScope(who) }, include: { client: true } });
  if (!pipelineCase) schedulingFail("CRM_SURVEY_RESOURCE_NOT_FOUND", 404);
  const decision = await tx.surveyEvaluationDecision.findFirst({ where: { tenantId: who.tenantId, id: row.evaluationDecisionId } });
  const policy = await tx.surveySchedulePolicyVersion.findFirst({ where: { tenantId: who.tenantId, id: row.schedulePolicyId } });
  if (!decision || !policy) schedulingFail("CRM_SURVEY_STATE_INVALID", 409);
  return { row, pipelineCase, decision, policy };
}

async function changeAssignment(tx, who, command) {
  const current = await assignmentByRef(tx, who, command.assignmentRef);
  if (current.row.version !== command.expectedVersion || ["COMPLETED", "CANCELLED"].includes(current.row.status)) schedulingFail("CRM_SURVEY_VERSION_CONFLICT", 409);
  await lock(tx, who.tenantId, `ASSIGNMENT:${current.row.id}`);
  const before = snapshotAssignment(current.row);
  let data; let eventType; let action; let eventDecision = current.decision;
  if (command.operation === "CANCEL") {
    eventDecision = await tx.surveyEvaluationDecision.create({ data: { tenantId: who.tenantId, pipelineCaseId: current.pipelineCase.id, serviceRevisionId: current.decision.serviceRevisionId, routeVersion: current.pipelineCase.routeRevision, version: current.decision.version + 1, method: current.decision.method, commercialState: "CANCELLED", informationSource: current.decision.informationSource, rationaleCode: current.decision.rationaleCode, seriesRef: current.decision.seriesRef, replacesDecisionId: current.decision.id, createdByMembershipId: who.membershipId, createdByUserId: who.userId } });
    data = { status: "CANCELLED", evaluationDecisionId: eventDecision.id, version: { increment: 1 } }; eventType = "CANCELLED"; action = "SURVEY_ASSIGNMENT_CANCELLED";
  } else if (command.operation === "CHANGE_EVALUATOR") {
    const evaluatorRow = await evaluator(tx, who, current.policy, command.evaluatorMembershipRef, current.decision.method, current.row.scheduleProfile);
    await assertEvaluatorInterval(tx, who, evaluatorRow, current.row.scheduledStart, current.row.scheduledEnd || new Date(current.row.scheduledStart.getTime() + 60 * 60 * 1000), current.row.id);
    data = { evaluatorMembershipId: evaluatorRow.id, evaluatorUserId: evaluatorRow.userId, version: { increment: 1 } }; eventType = "EVALUATOR_CHANGED"; action = "SURVEY_EVALUATOR_CHANGED";
  } else {
    if (current.pipelineCase.routeRevision !== current.row.routeVersion) schedulingFail("CRM_SURVEY_ROUTE_REVALIDATION_REQUIRED", 409);
    const start = new Date(command.scheduledStart); const end = new Date(command.scheduledEnd);
    await scheduleCapacity(tx, who, current.policy, current.row.scheduleProfile, current.row.zoneCode, command.slotKey, start, end, current.row.id, Boolean(command.saturdayApprovalReason));
    await assertEvaluatorInterval(tx, who, current.row.evaluatorMembership, start, end, current.row.id);
    data = { scheduledStart: start, scheduledEnd: end, slotKey: command.slotKey, version: { increment: 1 } }; eventType = "RESCHEDULED"; action = "SURVEY_ASSIGNMENT_RESCHEDULED";
  }
  const updated = await tx.surveyAssignment.update({ where: { id: current.row.id }, data, include: { evaluatorMembership: true } });
  await event(tx, who, eventDecision, current.pipelineCase.id, updated.id, eventType, before, snapshotAssignment(updated), command.reasonCode, command.notificationRequired);
  return persist(tx, who, command, updated.assignmentRef, updated.version, { assignmentRef: updated.assignmentRef, status: updated.status, version: updated.version, replayed: false }, action);
}

async function visitFee(tx, who, command) {
  const { decision, pipelineCase } = await decisionByRef(tx, who, command.decisionRef);
  const current = await tx.surveyVisitFee.findFirst({ where: { tenantId: who.tenantId, evaluationDecisionId: decision.id } });
  if ((current?.version || null) !== command.expectedVersion) schedulingFail("CRM_SURVEY_VERSION_CONFLICT", 409);
  let source = { logisticsRevisionId: null, costingRevisionId: null, costingLineId: null };
  if (command.suggestedAmount != null) {
    const logistics = await tx.logisticsPlanRevision.findFirst({ where: { tenantId: who.tenantId, revisionRef: command.logisticsRevisionRef, plan: { pipelineCaseId: pipelineCase.id }, status: "PUBLISHED" } });
    const costing = await tx.costingRevision.findFirst({ where: { tenantId: who.tenantId, revisionRef: command.costingRevisionRef, pipelineCaseId: pipelineCase.id, logisticsRevisionId: logistics?.id || "" } });
    const line = costing ? await tx.costingLine.findFirst({ where: { tenantId: who.tenantId, revisionId: costing.id, lineRef: command.costingLineRef, family: { in: ["TRAVEL", "TRANSPORT"] }, source: "MOTOR" } }) : null;
    if (!logistics || !costing || !line || line.suggestedPrice == null || Number(line.suggestedPrice) !== command.suggestedAmount || line.baseCurrency !== command.currency) schedulingFail("CRM_SURVEY_VISIT_FEE_SOURCE_REQUIRED", 409);
    source = { logisticsRevisionId: logistics.id, costingRevisionId: costing.id, costingLineId: line.id };
  }
  const authorizing = command.approvalStatus === "APPROVED" || command.disposition === "WAIVED";
  const active = await activePolicy(tx, who.tenantId);
  if (authorizing && !active.configuration.evaluatorCapabilities.find((entry) => entry.membershipRef === who.membershipRef)?.capabilities.includes("CAN_APPROVE_VISIT_FEE")) schedulingFail("CRM_SURVEY_VISIT_FEE_FORBIDDEN", 403);
  const data = { tenantId: who.tenantId, pipelineCaseId: pipelineCase.id, evaluationDecisionId: decision.id, disposition: command.disposition, suggestedAmount: command.suggestedAmount, currency: command.currency, ...source, communicationStatus: command.communicationStatus, approvalStatus: command.approvalStatus, paymentStatus: command.paymentStatus, waiverReason: command.waiverReason, authorizedByMembershipId: authorizing ? who.membershipId : null, authorizedByUserId: authorizing ? who.userId : null, authorizedAt: authorizing ? new Date() : null };
  const row = current ? await tx.surveyVisitFee.update({ where: { id: current.id }, data: { ...data, version: { increment: 1 } } }) : await tx.surveyVisitFee.create({ data });
  await event(tx, who, decision, pipelineCase.id, current?.assignmentId || null, "VISIT_FEE_CHANGED", current ? { disposition: current.disposition, communicationStatus: current.communicationStatus, approvalStatus: current.approvalStatus, paymentStatus: current.paymentStatus, version: current.version } : null, { disposition: row.disposition, communicationStatus: row.communicationStatus, approvalStatus: row.approvalStatus, paymentStatus: row.paymentStatus, version: row.version });
  return persist(tx, who, command, row.feeRef, row.version, { feeRef: row.feeRef, disposition: row.disposition, communicationStatus: row.communicationStatus, approvalStatus: row.approvalStatus, paymentStatus: row.paymentStatus, version: row.version, replayed: false }, "SURVEY_VISIT_FEE_UPDATED", "SURVEY_VISIT_FEE");
}

async function prepareCommunication(tx, who, command) {
  if (!["PIC_CLIENT_VISIT", "PIC_EVALUATOR_VISIT"].includes(command.templateCode) || command.templateVersion !== 1) schedulingFail("CRM_SURVEY_COMMUNICATION_TEMPLATE_INVALID", 409);
  const { decision, pipelineCase } = await decisionByRef(tx, who, command.decisionRef);
  let assignment = null;
  if (command.assignmentRef) {
    assignment = await tx.surveyAssignment.findFirst({ where: { tenantId: who.tenantId, assignmentRef: command.assignmentRef, pipelineCaseId: pipelineCase.id } });
    if (!assignment) schedulingFail("CRM_SURVEY_RESOURCE_NOT_FOUND", 404);
  }
  const row = await tx.surveyCommunicationRecord.create({ data: { tenantId: who.tenantId, pipelineCaseId: pipelineCase.id, evaluationDecisionId: decision.id, assignmentId: assignment?.id || null, templateCode: command.templateCode, templateVersion: command.templateVersion, audience: command.audience, channel: command.channel, recipientRef: command.recipientRef, contentHash: command.contentHash, status: "PREPARED", preparedByMembershipId: who.membershipId, preparedByUserId: who.userId } });
  await event(tx, who, decision, pipelineCase.id, assignment?.id || null, "COMMUNICATION_PREPARED", null, { communicationRef: row.communicationRef, templateCode: row.templateCode, templateVersion: row.templateVersion, audience: row.audience, channel: row.channel, status: row.status });
  return persist(tx, who, command, row.communicationRef, 1, { communicationRef: row.communicationRef, status: row.status, replayed: false }, "SURVEY_PIC_PREPARED", "SURVEY_COMMUNICATION");
}

export async function mutateSurveyScheduling(context, raw, database) {
  const command = normalizeSchedulingMutation(raw);
  try {
    return await database.$transaction(async (tx) => {
      await limits(tx);
      const who = await resolveSurveyAuthorization(tx, context, requiredPermission(command.operation));
      await lock(tx, who.tenantId, `COMMAND:${command.requestId}`);
      const prior = await replay(tx, who.tenantId, command); if (prior) return prior;
      if (command.operation === "DECIDE_METHOD") return decide(tx, who, command);
      if (command.operation === "PUBLISH_POLICY") return publishPolicy(tx, who, command);
      if (command.operation === "SCHEDULE") return schedule(tx, who, command);
      if (["RESCHEDULE", "CHANGE_EVALUATOR", "CANCEL"].includes(command.operation)) return changeAssignment(tx, who, command);
      if (command.operation === "UPDATE_VISIT_FEE") return visitFee(tx, who, command);
      return prepareCommunication(tx, who, command);
    }, SERIALIZABLE);
  } catch (error) {
    if (error?.status) throw error;
    if (["P2002", "P2034", "23505", "40001", "55P03", "57014"].includes(error?.code)) schedulingFail("CRM_SURVEY_SCHEDULING_CONFLICT", 409);
    if (["P2003", "P2025", "23503", "23514"].includes(error?.code)) schedulingFail("CRM_SURVEY_STATE_INVALID", 409);
    throw error;
  }
}
