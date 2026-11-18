import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { appendCommercialAudit } from "./commercialAuditLog.js";
import { CrmServicesError, serviceFail, serviceRef } from "./crmServicesContract.js";
import { normalizeChangeAddendumCommand } from "./changeAddendumContract.js";

const SOURCE = "V17_CHANGE_ADDENDA";
const REQUIRED_VIEW = ["services:case:view", "projects:view"];
const REQUIRED_WRITE = ["services:case:update", "projects:create"];
const TERMINAL = new Set(["REJECTED", "CANCELLED", "INVOICED"]);

function has(context, permission) { return context?.effectivePermissions?.includes(permission) && !context?.deniedPermissions?.includes(permission); }
function requirePermissions(context, permissions) {
  if (!context?.tenantId || !context?.membershipId || !context?.userId || permissions.some((permission) => !has(context, permission))) serviceFail("CHANGE_ADDENDUM_FORBIDDEN", 403);
}
function caseScope(context) { return context.role === "V" ? { ownerMembershipId: context.membershipId, ownerUserId: context.userId } : {}; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function requirementsOf(project) { return object(project?.coordination?.requirementsJson); }
function executionOrderOf(project) { return object(requirementsOf(project).executionOrder); }
function changeControlOf(project) { return object(requirementsOf(project).changeControl); }
function changeProject(pipelineCase) { return pipelineCase.projects.find((project) => Object.keys(changeControlOf(project)).length > 0) || null; }
function issuedProject(pipelineCase) { return pipelineCase.projects.find((project) => executionOrderOf(project).state === "ISSUED") || null; }

function servicesOf(revision) {
  if (!revision) return null;
  const items = revision.items.map((item) => ({ kind: item.kind, code: item.codeSnapshot, name: item.nameSnapshot, category: item.categorySnapshot, position: item.position }));
  return { selectionRef: revision.selectionRef, revision: revision.revision, mode: revision.modeSnapshot, primary: items.find((item) => item.kind === "PRIMARY") || null, associated: items.filter((item) => item.kind !== "PRIMARY") };
}

function proposalOf(proposal) {
  const revision = proposal?.revisions?.[0];
  if (!proposal || !revision) return null;
  const totals = object(revision.totalsSnapshot);
  return { proposalRef: proposal.proposalRef, reference: proposal.reference, revisionRef: revision.revisionRef, revision: revision.revision, currency: revision.currency, total: Number(totals.totalQuotedPrice ?? totals.payablePrice ?? totals.grossQuotedPrice ?? 0), acceptedAt: proposal.decisions?.[0]?.decidedAt?.toISOString() || proposal.updatedAt.toISOString() };
}

function authorityOf(pipelineCase) {
  const executionProject = issuedProject(pipelineCase);
  const storageAgreement = pipelineCase.customerStorageAgreements[0] || null;
  if (executionProject) {
    const order = executionOrderOf(executionProject);
    return { kind: "EXECUTION_ORDER", authorityRef: executionProject.id, authorityCode: executionProject.code, contractRef: order.contract?.evidenceRef || null, issuedAt: order.issuedAt || null };
  }
  if (storageAgreement) return { kind: "STORAGE_AGREEMENT", authorityRef: storageAgreement.agreementRef, authorityCode: storageAgreement.agreementCode, contractRef: storageAgreement.acceptanceEvidenceRef, issuedAt: storageAgreement.activatedAt?.toISOString() || null };
  return null;
}

function publicChange(change) {
  const economics = object(change.economics);
  const evidence = object(change.evidence);
  return Object.freeze({
    changeRef: String(change.changeRef), changeCode: String(change.changeCode), version: Number(change.version), state: String(change.state), documentKind: String(change.documentKind), changeClass: String(change.changeClass), changeKind: String(change.changeKind), requestedBy: String(change.requestedBy), serviceCode: change.serviceCode ? String(change.serviceCode) : null, serviceName: String(change.serviceName), reason: String(change.reason), quantity: change.quantity === null || change.quantity === undefined ? null : Number(change.quantity), unit: change.unit ? String(change.unit) : null,
    currency: String(economics.currency || "DOP"), catalogAmount: Number(economics.catalogAmount || 0), adjustedAmount: Number(economics.adjustedAmount || 0), adjustmentReason: economics.adjustmentReason ? String(economics.adjustmentReason) : null,
    scheduleDays: Number(change.scheduleDays || 0), operationalImpact: change.operationalImpact ? String(change.operationalImpact) : null,
    requestEvidenceRef: evidence.requestEvidenceRef ? String(evidence.requestEvidenceRef) : null, clientAcceptanceRef: evidence.clientAcceptanceRef ? String(evidence.clientAcceptanceRef) : null, internalApprovalRef: evidence.internalApprovalRef ? String(evidence.internalApprovalRef) : null,
    provisionalAuthorizedAt: change.provisionalAuthorizedAt ? String(change.provisionalAuthorizedAt) : null, executedAt: change.executedAt ? String(change.executedAt) : null, ratifiedAt: change.ratifiedAt ? String(change.ratifiedAt) : null,
    economicControlReady: change.documentKind === "OPERATIONAL_RECORD" ? Boolean(change.executedAt) : Boolean(change.executedAt && evidence.clientAcceptanceRef && evidence.internalApprovalRef),
    createdAt: String(change.createdAt), updatedAt: String(change.updatedAt),
  });
}

function workspace(pipelineCase) {
  const services = servicesOf(pipelineCase.serviceRevisions[0]);
  const proposal = proposalOf(pipelineCase.quoteProposals[0]);
  const authority = authorityOf(pipelineCase);
  const control = changeControlOf(changeProject(pipelineCase));
  const changes = Array.isArray(control.changes) ? control.changes.map(publicChange).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];
  return Object.freeze({
    case: { caseRef: pipelineCase.publicRef, caseCode: pipelineCase.caseCode, clientName: pipelineCase.client?.name || pipelineCase.clientName || "Cliente pendiente" },
    services, proposal, authority, blockers: authority ? [] : [{ code: "EXECUTION_AUTHORITY_REQUIRED", label: "Emita la orden de ejecución o active el contrato de almacenaje" }],
    workspaceVersion: Number(control.version || 0), changes,
  });
}

async function loadCase(tx, context, caseRef) {
  const pipelineCase = await tx.pipelineCase.findFirst({
    where: { tenantId: context.tenantId, publicRef: serviceRef(caseRef), ...caseScope(context) },
    include: {
      client: true,
      serviceRevisions: { orderBy: { revision: "desc" }, take: 1, include: { items: { orderBy: { position: "asc" } } } },
      quoteProposals: { where: { state: "ACCEPTED" }, orderBy: { updatedAt: "desc" }, take: 1, include: { revisions: { orderBy: { revision: "desc" }, take: 1 }, decisions: { where: { decision: "ACCEPTED" }, orderBy: { decidedAt: "desc" }, take: 1 } } },
      customerStorageAgreements: { where: { status: "ACTIVE" }, orderBy: { activatedAt: "desc" }, take: 1 },
      projects: { include: { coordination: true } },
    },
  });
  if (!pipelineCase) serviceFail("CHANGE_ADDENDUM_NOT_FOUND", 404);
  return pipelineCase;
}

function transition(change, input, context, now) {
  if (TERMINAL.has(change.state)) serviceFail("CHANGE_ADDENDUM_FINAL_IMMUTABLE", 409);
  if (Number(change.version) !== input.expectedChangeVersion) serviceFail("CHANGE_ADDENDUM_VERSION_CONFLICT", 409);
  const evidence = { ...object(change.evidence) };
  let state = change.state;
  const next = { ...change, version: Number(change.version) + 1, updatedAt: now, updatedByMembershipId: context.membershipId };
  if (input.action === "SEND_TO_CLIENT") {
    if (state !== "DRAFT" || change.documentKind === "OPERATIONAL_RECORD") serviceFail("CHANGE_ADDENDUM_STATE_INVALID", 409);
    state = "PENDING_CLIENT";
  } else if (input.action === "RECORD_CLIENT_ACCEPTANCE") {
    if (!(state === "PENDING_CLIENT" || (state === "EXECUTED" && change.changeClass === "EMERGENCY")) || !input.evidenceRef) serviceFail("CHANGE_ADDENDUM_EVIDENCE_REQUIRED", 409);
    evidence.clientAcceptanceRef = input.evidenceRef;
    state = state === "EXECUTED" ? "EXECUTED" : "PENDING_INTERNAL";
  } else if (input.action === "APPROVE_INTERNAL") {
    if (!(state === "PENDING_INTERNAL" || (state === "EXECUTED" && change.changeClass === "EMERGENCY" && evidence.clientAcceptanceRef)) || !input.evidenceRef) serviceFail("CHANGE_ADDENDUM_EVIDENCE_REQUIRED", 409);
    evidence.internalApprovalRef = input.evidenceRef;
    if (state === "EXECUTED") next.ratifiedAt = now;
    else state = "APPROVED";
  } else if (input.action === "AUTHORIZE_EMERGENCY") {
    if (change.changeClass !== "EMERGENCY" || !["DRAFT", "PENDING_CLIENT", "PENDING_INTERNAL"].includes(state) || !input.evidenceRef) serviceFail("CHANGE_ADDENDUM_STATE_INVALID", 409);
    evidence.internalApprovalRef = input.evidenceRef;
    next.provisionalAuthorizedAt = now;
  } else if (input.action === "MARK_EXECUTED") {
    const noCost = change.documentKind === "OPERATIONAL_RECORD" && state === "DRAFT";
    const approved = state === "APPROVED";
    const emergency = change.changeClass === "EMERGENCY" && Boolean(change.provisionalAuthorizedAt);
    if (!(noCost || approved || emergency)) serviceFail("CHANGE_ADDENDUM_STATE_INVALID", 409);
    state = "EXECUTED";
    next.executedAt = now;
  } else if (input.action === "REJECT") {
    if (!["PENDING_CLIENT", "PENDING_INTERNAL"].includes(state) || !input.evidenceRef) serviceFail("CHANGE_ADDENDUM_EVIDENCE_REQUIRED", 409);
    evidence.decisionRef = input.evidenceRef;
    state = "REJECTED";
  } else if (input.action === "CANCEL") {
    if (state === "EXECUTED") serviceFail("CHANGE_ADDENDUM_STATE_INVALID", 409);
    evidence.decisionRef = input.evidenceRef || null;
    state = "CANCELLED";
  } else serviceFail("CHANGE_ADDENDUM_STATE_INVALID", 409);
  return { ...next, state, evidence, transitions: [...(Array.isArray(change.transitions) ? change.transitions : []), { action: input.action, at: now, actorMembershipId: context.membershipId, evidenceRef: input.evidenceRef }] };
}

function draftChange(existing, input, context, pipelineCase, sequence, now) {
  if (existing && (existing.state !== "DRAFT" || Number(existing.version) !== input.expectedChangeVersion)) serviceFail("CHANGE_ADDENDUM_VERSION_CONFLICT", 409);
  const documentKind = input.changeClass === "NO_COST" ? "OPERATIONAL_RECORD" : "ADDENDUM";
  return {
    changeRef: existing?.changeRef || randomUUID(),
    changeCode: existing?.changeCode || `${documentKind === "ADDENDUM" ? "AD" : "AJ"}-${pipelineCase.caseCode}-${String(sequence).padStart(3, "0")}`,
    sequence: existing?.sequence || sequence,
    version: Number(existing?.version || 0) + 1,
    state: "DRAFT", documentKind, changeClass: input.changeClass, changeKind: input.changeKind, requestedBy: input.requestedBy,
    serviceCode: input.serviceCode, serviceName: input.serviceName, reason: input.reason, quantity: input.quantity, unit: input.unit,
    economics: { currency: input.currency || "DOP", catalogAmount: input.catalogAmount || 0, adjustedAmount: input.adjustedAmount || 0, adjustmentReason: input.adjustmentReason },
    scheduleDays: input.scheduleDays, operationalImpact: input.operationalImpact,
    evidence: { ...object(existing?.evidence), requestEvidenceRef: input.evidenceRef },
    provisionalAuthorizedAt: existing?.provisionalAuthorizedAt || null, executedAt: existing?.executedAt || null, ratifiedAt: existing?.ratifiedAt || null,
    createdAt: existing?.createdAt || now, createdByMembershipId: existing?.createdByMembershipId || context.membershipId,
    updatedAt: now, updatedByMembershipId: context.membershipId,
    transitions: [...(Array.isArray(existing?.transitions) ? existing.transitions : []), { action: "SAVE_DRAFT", at: now, actorMembershipId: context.membershipId, evidenceRef: input.evidenceRef }],
  };
}

function databaseError(error) {
  if (error instanceof CrmServicesError) return error;
  if (["P2002", "P2034"].includes(error?.code)) return new CrmServicesError("CHANGE_ADDENDUM_CONFLICT", 409, { cause: error });
  return new CrmServicesError("CHANGE_ADDENDUM_DATABASE_UNAVAILABLE", 503, { cause: error });
}

export async function getChangeAddendumWorkspace(database, context, caseRef) {
  requirePermissions(context, REQUIRED_VIEW);
  try { return await database.$transaction(async (tx) => workspace(await loadCase(tx, context, caseRef))); }
  catch (error) { throw databaseError(error); }
}

export async function saveChangeAddendum(database, context, caseRef, raw) {
  requirePermissions(context, REQUIRED_WRITE);
  const input = normalizeChangeAddendumCommand(raw);
  try {
    return await database.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:${caseRef}:change-addenda`}, 0))`);
      let pipelineCase = await loadCase(tx, context, caseRef);
      const replay = await tx.serviceMutationCommand.findUnique({ where: { tenantId_requestId: { tenantId: context.tenantId, requestId: input.requestId } } });
      if (replay) {
        const project = changeProject(pipelineCase);
        if (!project || project.id !== replay.targetRef || replay.operation !== input.operation || replay.payloadHash !== input.payloadHash) serviceFail("CRM_SERVICES_IDEMPOTENCY_CONFLICT", 409);
        return Object.freeze({ ...workspace(pipelineCase), replayed: true });
      }
      const authority = authorityOf(pipelineCase);
      if (!authority) serviceFail("CHANGE_ADDENDUM_AUTHORITY_REQUIRED", 409);
      const currentProject = changeProject(pipelineCase);
      const current = changeControlOf(currentProject);
      const currentVersion = Number(current.version || 0);
      if (input.expectedWorkspaceVersion !== currentVersion) serviceFail("CHANGE_ADDENDUM_VERSION_CONFLICT", 409);
      const changes = Array.isArray(current.changes) ? [...current.changes] : [];
      const index = input.changeRef ? changes.findIndex((item) => item.changeRef === input.changeRef) : -1;
      if (input.changeRef && index < 0) serviceFail("CHANGE_ADDENDUM_NOT_FOUND", 404);
      const now = new Date().toISOString();
      let nextChange;
      if (input.action === "SAVE_DRAFT") {
        nextChange = draftChange(index >= 0 ? changes[index] : null, input, context, pipelineCase, Math.max(0, ...changes.map((item) => Number(item.sequence || 0))) + 1, now);
      } else nextChange = transition(changes[index], input, context, now);
      if (index >= 0) changes[index] = nextChange; else changes.push(nextChange);
      const nextControl = { version: currentVersion + 1, authority, baseProposal: proposalOf(pipelineCase.quoteProposals[0]), services: servicesOf(pipelineCase.serviceRevisions[0]), changes, updatedAt: now };
      const projectData = { tenantId: context.tenantId, pipelineCaseId: pipelineCase.id, code: `CC-${pipelineCase.caseCode}-${pipelineCase.id.slice(-6).toUpperCase()}`, name: `Cambios · ${pipelineCase.client?.name || pipelineCase.clientName}`, clientId: pipelineCase.clientId, clientName: pipelineCase.client?.name || pipelineCase.clientName, status: "CHANGE_CONTROL_ACTIVE", startDate: now.slice(0, 10), totalValue: 0, quoteId: nextControl.baseProposal?.revisionRef || null, kState: "PENDING_VALIDATION" };
      let project;
      if (currentProject) {
        const { code: _code, ...updateData } = projectData;
        project = await tx.project.update({ where: { id: currentProject.id }, data: updateData });
        await tx.projectCoordination.update({ where: { projectId: project.id }, data: { status: "CHANGE_CONTROL_ACTIVE", requirementsJson: { ...requirementsOf(currentProject), changeControl: nextControl } } });
      } else {
        project = await tx.project.create({ data: { ...projectData, id: randomUUID() } });
        await tx.projectCoordination.create({ data: { projectId: project.id, status: "CHANGE_CONTROL_ACTIVE", requirementsJson: { changeControl: nextControl } } });
      }
      await tx.serviceMutationCommand.create({ data: { tenantId: context.tenantId, requestId: input.requestId, operation: input.operation, payloadHash: input.payloadHash, targetRef: project.id, resultingVersion: nextControl.version, actorMembershipId: context.membershipId, actorUserId: context.userId } });
      await appendCommercialAudit(tx, { tenantId: context.tenantId, actorKind: "MEMBERSHIP", actorMembershipId: context.membershipId }, { source: SOURCE, action: input.action, entity: nextChange.documentKind, entityId: nextChange.changeRef, requestId: input.requestId, correlationId: input.requestId, critical: input.action !== "SAVE_DRAFT", beforeJson: index >= 0 ? current.changes[index] : null, afterJson: nextChange, metadataJson: { caseRef: pipelineCase.publicRef, authority } });
      pipelineCase = await loadCase(tx, context, caseRef);
      return Object.freeze({ ...workspace(pipelineCase), replayed: false });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 3_000, timeout: 20_000 });
  } catch (error) { throw databaseError(error); }
}
