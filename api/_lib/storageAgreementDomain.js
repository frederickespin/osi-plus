import { Prisma } from "@prisma/client";
import { custodyFail } from "./customerCustodyContract.js";
import { hasStorageService, storageServiceItem } from "./storageServiceSelection.js";

const AGREEMENT_INCLUDE = Object.freeze({
  client: { select: { publicRef: true, code: true, name: true, fiscalName: true } },
  pipelineCase: { select: { publicRef: true, caseCode: true } },
  serviceRevision: { include: { items: { orderBy: { position: "asc" } } } },
  acceptedQuoteRevision: { include: { proposal: { select: { proposalRef: true, reference: true } } } },
  createdByMembership: { include: { user: { select: { name: true, email: true } } } },
  activatedByMembership: { include: { user: { select: { name: true, email: true } } } },
});

function actor(context) { return { actorMembershipId: context.membershipId, actorUserId: context.userId }; }
function acceptedQuote(decision) { return decision ? { proposalRef: decision.proposal.proposalRef, proposalReference: decision.proposal.reference, revisionRef: decision.revision.revisionRef, proposalName: decision.revision.proposalName, currency: decision.revision.currency, acceptedAt: decision.decidedAt.toISOString(), evidenceRef: decision.evidenceRef } : null; }
function mapAgreement(row) {
  if (!row) return null;
  const storage = storageServiceItem(row.serviceRevision);
  return { agreementRef: row.agreementRef, agreementCode: row.agreementCode, status: row.status, holderName: row.holderName, identityType: row.identityType, identityNumberMasked: row.identityNumberMasked, identityEvidenceRef: row.identityEvidenceRef, billingPartyType: row.billingPartyType, billingName: row.billingName, billingTaxId: row.billingTaxId, billingEmail: row.billingEmail, billingAddress: row.billingAddress, billingCurrency: row.billingCurrency, billingFrequency: row.billingFrequency, invoiceDay: row.invoiceDay, startDate: row.startDate.toISOString().slice(0, 10), estimatedDurationMonths: row.estimatedDurationMonths, estimatedEndDate: row.estimatedEndDate.toISOString().slice(0, 10), capacityBasis: row.capacityBasis, capacityQuantity: Number(row.capacityQuantity), termsVersion: row.termsVersion, acceptanceEvidenceRef: row.acceptanceEvidenceRef, acceptedAt: row.acceptedAt?.toISOString() ?? null, signedAt: row.signedAt?.toISOString() ?? null, activatedAt: row.activatedAt?.toISOString() ?? null, version: row.version, client: { clientRef: row.client.publicRef, code: row.client.code, name: row.client.fiscalName || row.client.name }, case: { caseRef: row.pipelineCase.publicRef, caseNumber: row.pipelineCase.caseCode }, service: storage ? { selectionRef: row.serviceRevision.selectionRef, code: storage.codeSnapshot, name: storage.nameSnapshot } : null, quote: { revisionRef: row.acceptedQuoteRevision.revisionRef, proposalRef: row.acceptedQuoteRevision.proposal.proposalRef, proposalReference: row.acceptedQuoteRevision.proposal.reference, proposalName: row.acceptedQuoteRevision.proposalName, currency: row.acceptedQuoteRevision.currency }, createdBy: { name: row.createdByMembership.user.name, email: row.createdByMembership.user.email }, activatedBy: row.activatedByMembership ? { name: row.activatedByMembership.user.name, email: row.activatedByMembership.user.email } : null };
}
async function replay(tx, context, input) { const prior = await tx.customerCustodyCommand.findUnique({ where: { tenantId_requestId: { tenantId: context.tenantId, requestId: input.requestId } } }); if (!prior) return null; if (prior.payloadHash !== input.payloadHash || prior.operation !== input.operation) custodyFail("CUSTOMER_CUSTODY_IDEMPOTENCY_CONFLICT", 409); return prior.resultJson; }
async function loadAcceptedDecision(prisma, tenantId, pipelineCaseId, revisionRef) { return prisma.quoteClientDecision.findFirst({ where: { tenantId, decision: "ACCEPTED", revision: { revisionRef, proposal: { pipelineCaseId } } }, include: { proposal: true, revision: true }, orderBy: { decidedAt: "desc" } }); }

export async function getStorageAgreementWorkspace(prisma, context, query = {}) {
  const caseRef = typeof query.caseRef === "string" ? query.caseRef : ""; if (!caseRef) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  const pipelineCase = await prisma.pipelineCase.findFirst({ where: { tenantId: context.tenantId, publicRef: caseRef }, include: { client: true, serviceRevisions: { include: { items: { orderBy: { position: "asc" } } }, orderBy: { revision: "desc" }, take: 1 }, customerStorageAgreements: { include: AGREEMENT_INCLUDE, orderBy: { createdAt: "desc" }, take: 1 } } });
  if (!pipelineCase?.client) custodyFail("CUSTOMER_CUSTODY_RESOURCE_NOT_FOUND", 404);
  const currentService = pipelineCase.serviceRevisions[0] ?? null;
  const decision = await prisma.quoteClientDecision.findFirst({ where: { tenantId: context.tenantId, decision: "ACCEPTED", proposal: { pipelineCaseId: pipelineCase.id } }, include: { proposal: true, revision: true }, orderBy: { decidedAt: "desc" } });
  const agreement = pipelineCase.customerStorageAgreements[0] ?? null;
  const active = agreement?.status === "ACTIVE";
  return { caseRef: pipelineCase.publicRef, caseNumber: pipelineCase.caseCode, client: { clientRef: pipelineCase.client.publicRef, code: pipelineCase.client.code, name: pipelineCase.client.fiscalName || pipelineCase.client.name }, serviceSelectionRef: currentService?.selectionRef ?? null, storageServiceSelected: hasStorageService(currentService), acceptedQuote: acceptedQuote(decision), agreement: mapAgreement(agreement), requirements: { storageServiceSelected: hasStorageService(currentService), acceptedQuote: Boolean(decision), contractCaptured: Boolean(agreement), billingConfirmed: Boolean(agreement?.billingName && agreement?.billingEmail && agreement?.billingAddress), identityConfirmed: Boolean(agreement?.identityEvidenceRef), signed: Boolean(agreement?.signedAt && agreement?.acceptanceEvidenceRef), active } };
}

export async function saveStorageAgreement(prisma, context, input) {
  return prisma.$transaction(async (tx) => {
    const prior = await replay(tx, context, input); if (prior) return prior;
    const [pipelineCase, serviceRevision] = await Promise.all([
      tx.pipelineCase.findFirst({ where: { tenantId: context.tenantId, publicRef: input.caseRef }, include: { client: true } }),
      tx.pipelineCaseServiceRevision.findFirst({ where: { tenantId: context.tenantId, selectionRef: input.serviceSelectionRef }, include: { items: { orderBy: { position: "asc" } } } }),
    ]);
    if (!pipelineCase?.client || !serviceRevision || serviceRevision.pipelineCaseId !== pipelineCase.id) custodyFail("CUSTOMER_CUSTODY_RESOURCE_NOT_FOUND", 404);
    if (!hasStorageService(serviceRevision)) custodyFail("CUSTOMER_CUSTODY_STORAGE_SERVICE_REQUIRED", 409);
    const decision = await loadAcceptedDecision(tx, context.tenantId, pipelineCase.id, input.acceptedProposalRevisionRef); if (!decision) custodyFail("CUSTOMER_STORAGE_ACCEPTED_QUOTE_REQUIRED", 409);
    const existing = await tx.customerStorageAgreement.findFirst({ where: { tenantId: context.tenantId, acceptedQuoteRevisionId: decision.revisionId }, include: AGREEMENT_INCLUDE });
    if (existing && existing.status !== "DRAFT") custodyFail("CUSTOMER_STORAGE_AGREEMENT_LOCKED", 409);
    const data = { serviceRevisionId: serviceRevision.id, holderName: input.holderName, identityType: input.identityType, identityNumberMasked: input.identityNumberMasked, identityEvidenceRef: input.identityEvidenceRef, billingPartyType: input.billingPartyType, billingName: input.billingName, billingTaxId: input.billingTaxId, billingEmail: input.billingEmail, billingAddress: input.billingAddress, billingCurrency: input.billingCurrency, billingFrequency: input.billingFrequency, invoiceDay: input.invoiceDay, startDate: new Date(`${input.startDate}T00:00:00.000Z`), estimatedDurationMonths: input.estimatedDurationMonths, estimatedEndDate: new Date(`${input.estimatedEndDate}T00:00:00.000Z`), capacityBasis: input.capacityBasis, capacityQuantity: new Prisma.Decimal(input.capacityQuantity), termsVersion: input.termsVersion, version: existing ? { increment: 1 } : 1 };
    const row = existing ? await tx.customerStorageAgreement.update({ where: { id: existing.id }, data, include: AGREEMENT_INCLUDE }) : await tx.customerStorageAgreement.create({ data: { tenantId: context.tenantId, clientId: pipelineCase.client.id, pipelineCaseId: pipelineCase.id, acceptedQuoteRevisionId: decision.revisionId, agreementCode: `ALM-${input.requestId.replaceAll("-", "").slice(0, 12).toUpperCase()}`, ...data, createdByMembershipId: context.membershipId, createdByUserId: context.userId }, include: AGREEMENT_INCLUDE });
    const result = mapAgreement(row); await tx.customerCustodyCommand.create({ data: { tenantId: context.tenantId, requestId: input.requestId, operation: input.operation, payloadHash: input.payloadHash, targetRef: row.agreementRef, resultJson: result, ...actor(context) } }); return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function activateStorageAgreement(prisma, context, input) {
  return prisma.$transaction(async (tx) => {
    const prior = await replay(tx, context, input); if (prior) return prior;
    const current = await tx.customerStorageAgreement.findFirst({ where: { tenantId: context.tenantId, agreementRef: input.agreementRef }, include: AGREEMENT_INCLUDE }); if (!current) custodyFail("CUSTOMER_CUSTODY_RESOURCE_NOT_FOUND", 404);
    if (current.status !== "DRAFT") custodyFail("CUSTOMER_STORAGE_AGREEMENT_LOCKED", 409);
    const decision = await loadAcceptedDecision(tx, context.tenantId, current.pipelineCaseId, current.acceptedQuoteRevision.revisionRef); if (!decision) custodyFail("CUSTOMER_STORAGE_ACCEPTED_QUOTE_REQUIRED", 409);
    const active = await tx.customerStorageAgreement.findFirst({ where: { tenantId: context.tenantId, pipelineCaseId: current.pipelineCaseId, status: "ACTIVE", id: { not: current.id } } }); if (active) custodyFail("CUSTOMER_STORAGE_ACTIVE_AGREEMENT_EXISTS", 409);
    const changed = await tx.customerStorageAgreement.updateMany({ where: { tenantId: context.tenantId, id: current.id, status: "DRAFT", version: input.expectedVersion }, data: { status: "ACTIVE", acceptanceEvidenceRef: input.acceptanceEvidenceRef, acceptedAt: new Date(input.acceptedAt), signedAt: new Date(input.signedAt), activatedAt: new Date(), activatedByMembershipId: context.membershipId, activatedByUserId: context.userId, version: { increment: 1 } } }); if (changed.count !== 1) custodyFail("CUSTOMER_CUSTODY_VERSION_CONFLICT", 409);
    const row = await tx.customerStorageAgreement.findUniqueOrThrow({ where: { id: current.id }, include: AGREEMENT_INCLUDE }); const result = mapAgreement(row); await tx.customerCustodyCommand.create({ data: { tenantId: context.tenantId, requestId: input.requestId, operation: input.operation, payloadHash: input.payloadHash, targetRef: row.agreementRef, resultJson: result, ...actor(context) } }); return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
