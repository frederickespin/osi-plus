import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { appendCommercialAudit } from "./commercialAuditLog.js";
import { CrmServicesError, serviceFail, serviceRef } from "./crmServicesContract.js";
import { normalizeEconomicControlCommand } from "./economicControlContract.js";

const SOURCE = "V17_ECONOMIC_CONTROL";
const REQUIRED_VIEW = ["services:case:view", "projects:view"];
const REQUIRED_WRITE = ["services:case:update", "projects:create"];

function has(context, permission) { return context?.effectivePermissions?.includes(permission) && !context?.deniedPermissions?.includes(permission); }
function requirePermissions(context, permissions) {
  if (!context?.tenantId || !context?.membershipId || !context?.userId || permissions.some((permission) => !has(context, permission))) serviceFail("ECONOMIC_CONTROL_FORBIDDEN", 403);
}
function caseScope(context) { return context.role === "V" ? { ownerMembershipId: context.membershipId, ownerUserId: context.userId } : {}; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function requirementsOf(project) { return object(project?.coordination?.requirementsJson); }
function executionOrderOf(project) { return object(requirementsOf(project).executionOrder); }
function changeControlOf(project) { return object(requirementsOf(project).changeControl); }
function economicControlOf(project) { return object(requirementsOf(project).economicControl); }
function issuedProject(pipelineCase) { return pipelineCase.projects.find((project) => executionOrderOf(project).state === "ISSUED") || null; }
function changeProject(pipelineCase) { return pipelineCase.projects.find((project) => Object.keys(changeControlOf(project)).length > 0) || null; }
function economicProject(pipelineCase) { return pipelineCase.projects.find((project) => Object.keys(economicControlOf(project)).length > 0) || null; }

function proposalOf(proposal) {
  const revision = proposal?.revisions?.[0];
  if (!proposal || !revision) return null;
  const totals = object(revision.totalsSnapshot);
  return {
    proposalRef: proposal.proposalRef,
    reference: proposal.reference,
    revisionRef: revision.revisionRef,
    revision: revision.revision,
    currency: revision.currency,
    total: Number(totals.totalQuotedPrice ?? totals.payablePrice ?? totals.grossQuotedPrice ?? 0),
    acceptedAt: proposal.decisions?.[0]?.decidedAt?.toISOString() || proposal.updatedAt.toISOString(),
  };
}

function authorityOf(pipelineCase) {
  const executionProject = issuedProject(pipelineCase);
  const storageAgreement = pipelineCase.customerStorageAgreements[0] || null;
  if (executionProject) {
    const order = executionOrderOf(executionProject);
    return { kind: "EXECUTION_ORDER", authorityRef: executionProject.id, authorityCode: executionProject.code, contractRef: order.contract?.evidenceRef || null };
  }
  if (storageAgreement) return { kind: "STORAGE_AGREEMENT", authorityRef: storageAgreement.agreementRef, authorityCode: storageAgreement.agreementCode, contractRef: storageAgreement.acceptanceEvidenceRef };
  return null;
}

function changesOf(pipelineCase) {
  const control = changeControlOf(changeProject(pipelineCase));
  return Array.isArray(control.changes) ? control.changes : [];
}

function publicChange(change) {
  const economics = object(change.economics);
  const evidence = object(change.evidence);
  const ready = change.documentKind === "OPERATIONAL_RECORD"
    ? Boolean(change.executedAt)
    : Boolean(change.executedAt && evidence.clientAcceptanceRef && evidence.internalApprovalRef);
  const amount = Number(economics.adjustedAmount || 0);
  return Object.freeze({
    changeRef: String(change.changeRef),
    changeCode: String(change.changeCode),
    state: String(change.state),
    documentKind: String(change.documentKind),
    changeKind: String(change.changeKind),
    serviceName: String(change.serviceName),
    currency: String(economics.currency || "DOP"),
    amount: change.changeKind === "REMOVED" ? -amount : amount,
    economicControlReady: ready,
  });
}

function defaultControl() {
  return { version: 0, state: "DRAFT", billingEvidenceRef: null, completionEvidenceRef: null, thirdPartyCostsStatus: "PENDING", thirdPartyEvidenceRef: null, collectionState: "NOT_VALIDATED", collectionEvidenceRef: null, invoiceRef: null, invoiceIssuedAt: null, closedAt: null, notes: null, history: [] };
}

function financials(proposal, changes) {
  const publicChanges = changes.map(publicChange);
  const accepted = publicChanges.filter((change) => change.documentKind === "ADDENDUM" && change.economicControlReady);
  const addendaTotal = accepted.filter((change) => change.currency === proposal?.currency).reduce((sum, change) => sum + change.amount, 0);
  return Object.freeze({
    currency: proposal?.currency || "DOP",
    baseAmount: Number(proposal?.total || 0),
    addendaAmount: Math.round(addendaTotal * 100) / 100,
    controlledTotal: Math.round((Number(proposal?.total || 0) + addendaTotal) * 100) / 100,
    changes: publicChanges,
  });
}

function blockersOf({ proposal, authority, changes, control }) {
  const blockers = [];
  if (!proposal) blockers.push({ code: "ACCEPTED_PROPOSAL_REQUIRED", label: "Propuesta aceptada pendiente" });
  if (!authority) blockers.push({ code: "EXECUTION_AUTHORITY_REQUIRED", label: "Orden de ejecución o contrato activo pendiente" });
  if (changes.some((change) => !["EXECUTED", "INVOICED", "REJECTED", "CANCELLED"].includes(String(change.state)))) blockers.push({ code: "CHANGE_PENDING", label: "Hay cambios o adendas sin resolver" });
  if (changes.some((change) => String(change.state) === "EXECUTED" && !publicChange(change).economicControlReady)) blockers.push({ code: "CHANGE_EVIDENCE_PENDING", label: "Hay cambios ejecutados sin ratificación completa" });
  if (proposal && changes.some((change) => publicChange(change).economicControlReady && publicChange(change).documentKind === "ADDENDUM" && publicChange(change).currency !== proposal.currency)) blockers.push({ code: "CURRENCY_MISMATCH", label: "Existen adendas en otra moneda" });
  if (!control.billingEvidenceRef) blockers.push({ code: "BILLING_EVIDENCE_REQUIRED", label: "Validación de facturación pendiente" });
  if (!control.completionEvidenceRef) blockers.push({ code: "COMPLETION_EVIDENCE_REQUIRED", label: "Evidencia de ejecución pendiente" });
  if (control.thirdPartyCostsStatus === "PENDING") blockers.push({ code: "THIRD_PARTY_COSTS_PENDING", label: "Cargos de terceros pendientes de confirmar" });
  return blockers;
}

function publicControl(control) {
  return Object.freeze({
    version: Number(control.version || 0), state: String(control.state || "DRAFT"),
    billingEvidenceRef: control.billingEvidenceRef ? String(control.billingEvidenceRef) : null,
    completionEvidenceRef: control.completionEvidenceRef ? String(control.completionEvidenceRef) : null,
    thirdPartyCostsStatus: String(control.thirdPartyCostsStatus || "PENDING"),
    thirdPartyEvidenceRef: control.thirdPartyEvidenceRef ? String(control.thirdPartyEvidenceRef) : null,
    collectionState: String(control.collectionState || "NOT_VALIDATED"),
    collectionEvidenceRef: control.collectionEvidenceRef ? String(control.collectionEvidenceRef) : null,
    invoiceRef: control.invoiceRef ? String(control.invoiceRef) : null,
    invoiceIssuedAt: control.invoiceIssuedAt ? String(control.invoiceIssuedAt) : null,
    closedAt: control.closedAt ? String(control.closedAt) : null,
    notes: control.notes ? String(control.notes) : null,
    history: Array.isArray(control.history) ? control.history.map((item) => ({ action: String(item.action), at: String(item.at), actorMembershipId: String(item.actorMembershipId) })) : [],
  });
}

function workspace(pipelineCase) {
  const proposal = proposalOf(pipelineCase.quoteProposals[0]);
  const authority = authorityOf(pipelineCase);
  const changes = changesOf(pipelineCase);
  const control = { ...defaultControl(), ...economicControlOf(economicProject(pipelineCase)) };
  return Object.freeze({
    case: { caseRef: pipelineCase.publicRef, caseCode: pipelineCase.caseCode, clientName: pipelineCase.client?.name || pipelineCase.clientName || "Cliente pendiente" },
    proposal, authority, financials: financials(proposal, changes), control: publicControl(control), blockers: blockersOf({ proposal, authority, changes, control }),
  });
}

async function loadCase(tx, context, caseRef) {
  const pipelineCase = await tx.pipelineCase.findFirst({
    where: { tenantId: context.tenantId, publicRef: serviceRef(caseRef), ...caseScope(context) },
    include: {
      client: true,
      quoteProposals: { where: { state: "ACCEPTED" }, orderBy: { updatedAt: "desc" }, take: 1, include: { revisions: { orderBy: { revision: "desc" }, take: 1 }, decisions: { where: { decision: "ACCEPTED" }, orderBy: { decidedAt: "desc" }, take: 1 } } },
      customerStorageAgreements: { where: { status: "ACTIVE" }, orderBy: { activatedAt: "desc" }, take: 1 },
      projects: { include: { coordination: true } },
    },
  });
  if (!pipelineCase) serviceFail("ECONOMIC_CONTROL_NOT_FOUND", 404);
  return pipelineCase;
}

function databaseError(error) {
  if (error instanceof CrmServicesError) return error;
  if (["P2002", "P2034"].includes(error?.code)) return new CrmServicesError("ECONOMIC_CONTROL_CONFLICT", 409, { cause: error });
  return new CrmServicesError("ECONOMIC_CONTROL_DATABASE_UNAVAILABLE", 503, { cause: error });
}

export async function getEconomicControlWorkspace(database, context, caseRef) {
  requirePermissions(context, REQUIRED_VIEW);
  try { return await database.$transaction(async (tx) => workspace(await loadCase(tx, context, caseRef))); }
  catch (error) { throw databaseError(error); }
}

export async function saveEconomicControl(database, context, caseRef, raw) {
  requirePermissions(context, REQUIRED_WRITE);
  const input = normalizeEconomicControlCommand(raw);
  try {
    return await database.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:${caseRef}:economic-control`}, 0))`);
      let pipelineCase = await loadCase(tx, context, caseRef);
      const replay = await tx.serviceMutationCommand.findUnique({ where: { tenantId_requestId: { tenantId: context.tenantId, requestId: input.requestId } } });
      if (replay) {
        const project = economicProject(pipelineCase);
        if (!project || project.id !== replay.targetRef || replay.operation !== input.operation || replay.payloadHash !== input.payloadHash) serviceFail("CRM_SERVICES_IDEMPOTENCY_CONFLICT", 409);
        return Object.freeze({ ...workspace(pipelineCase), replayed: true });
      }
      const existingProject = economicProject(pipelineCase);
      const previous = { ...defaultControl(), ...economicControlOf(existingProject) };
      if (input.expectedVersion !== Number(previous.version || 0)) serviceFail("ECONOMIC_CONTROL_VERSION_CONFLICT", 409);
      if (previous.state === "CLOSED") serviceFail("ECONOMIC_CONTROL_CLOSED", 409);
      if (previous.state === "INVOICED" && input.action !== "CLOSE") serviceFail("ECONOMIC_CONTROL_STATE_INVALID", 409);
      const now = new Date().toISOString();
      const invoiced = previous.state === "INVOICED";
      const next = {
        ...previous,
        version: Number(previous.version || 0) + 1,
        billingEvidenceRef: invoiced ? previous.billingEvidenceRef : input.billingEvidenceRef,
        completionEvidenceRef: invoiced ? previous.completionEvidenceRef : input.completionEvidenceRef,
        thirdPartyCostsStatus: invoiced ? previous.thirdPartyCostsStatus : input.thirdPartyCostsStatus,
        thirdPartyEvidenceRef: invoiced ? previous.thirdPartyEvidenceRef : input.thirdPartyEvidenceRef,
        collectionState: input.collectionState,
        collectionEvidenceRef: input.collectionEvidenceRef,
        invoiceRef: invoiced ? previous.invoiceRef : input.invoiceRef,
        notes: input.notes,
        updatedAt: now,
        updatedByMembershipId: context.membershipId,
      };
      const proposal = proposalOf(pipelineCase.quoteProposals[0]);
      const preflightBlockers = blockersOf({ proposal, authority: authorityOf(pipelineCase), changes: changesOf(pipelineCase), control: next });
      if (input.action === "MARK_READY") {
        if (preflightBlockers.length) serviceFail("ECONOMIC_CONTROL_BLOCKED", 409);
        next.state = "READY";
      } else if (input.action === "RECORD_INVOICE") {
        if (previous.state !== "READY") serviceFail("ECONOMIC_CONTROL_STATE_INVALID", 409);
        next.state = "INVOICED";
        next.invoiceIssuedAt = now;
      } else if (input.action === "CLOSE") {
        if (previous.state !== "INVOICED" || !["CURRENT", "EXEMPTED"].includes(input.collectionState) || !input.collectionEvidenceRef) serviceFail("ECONOMIC_CONTROL_CLOSE_BLOCKED", 409);
        next.state = "CLOSED";
        next.closedAt = now;
      } else if (previous.state === "READY" && preflightBlockers.length) {
        next.state = "DRAFT";
      } else if (previous.state === "INVOICED" && preflightBlockers.length) {
        serviceFail("ECONOMIC_CONTROL_BLOCKED", 409);
      }
      next.history = [...(Array.isArray(previous.history) ? previous.history : []), { action: input.action, at: now, actorMembershipId: context.membershipId }];
      const totals = financials(proposal, changesOf(pipelineCase));
      const projectData = { tenantId: context.tenantId, pipelineCaseId: pipelineCase.id, code: `EC-${pipelineCase.caseCode}-${pipelineCase.id.slice(-6).toUpperCase()}`, name: `Control económico · ${pipelineCase.client?.name || pipelineCase.clientName}`, clientId: pipelineCase.clientId, clientName: pipelineCase.client?.name || pipelineCase.clientName, status: `ECONOMIC_CONTROL_${next.state}`, startDate: now.slice(0, 10), totalValue: totals.controlledTotal, quoteId: proposal?.revisionRef || null, kState: next.state === "CLOSED" ? "VALIDATED" : "PENDING_VALIDATION" };
      let project;
      if (existingProject) {
        const { code: _code, ...updateData } = projectData;
        project = await tx.project.update({ where: { id: existingProject.id }, data: updateData });
        await tx.projectCoordination.update({ where: { projectId: project.id }, data: { status: projectData.status, requirementsJson: { ...requirementsOf(existingProject), economicControl: next } } });
      } else {
        project = await tx.project.create({ data: { ...projectData, id: randomUUID() } });
        await tx.projectCoordination.create({ data: { projectId: project.id, status: projectData.status, requirementsJson: { economicControl: next } } });
      }
      await tx.serviceMutationCommand.create({ data: { tenantId: context.tenantId, requestId: input.requestId, operation: input.operation, payloadHash: input.payloadHash, targetRef: project.id, resultingVersion: next.version, actorMembershipId: context.membershipId, actorUserId: context.userId } });
      await appendCommercialAudit(tx, { tenantId: context.tenantId, actorKind: "MEMBERSHIP", actorMembershipId: context.membershipId }, { source: SOURCE, action: input.action, entity: "ECONOMIC_CONTROL", entityId: project.id, requestId: input.requestId, correlationId: input.requestId, critical: input.action !== "SAVE_DRAFT", beforeJson: previous, afterJson: next, metadataJson: { caseRef: pipelineCase.publicRef, totals } });
      pipelineCase = await loadCase(tx, context, caseRef);
      return Object.freeze({ ...workspace(pipelineCase), replayed: false });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 3_000, timeout: 20_000 });
  } catch (error) { throw databaseError(error); }
}
