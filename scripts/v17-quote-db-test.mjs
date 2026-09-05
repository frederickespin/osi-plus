import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createQuoteProposal, getQuoteCase, getQuoteClientProjection, publishQuoteProposal, recordQuoteDecision, sendQuoteProposal } from "../api/_lib/quoteDomain.js";
import { quoteHash } from "../api/_lib/quoteContract.js";

const prisma = new PrismaClient();
const permissions = ["quote:view", "quote:create", "quote:update", "quote:publish", "quote:send", "quote:record-client-decision", "quote:override-price", "quote:internal-cost:view", "quote:tenant"];
function signed(operation, payload, requestId = randomUUID()) { return { requestId, payloadHash: quoteHash({ operation, requestId, ...payload }), ...payload }; }
function draft(costing, position, overrides = {}) {
  const first = costing.lines.find((line) => line.suggestedPrice != null);
  return {
    caseRef: costing.pipelineCase.publicRef, costingRevisionRef: costing.revisionRef, position, proposalName: `Opción ${position}`, currency: costing.baseCurrency,
    issueDate: new Date().toISOString().slice(0, 10), validUntil: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
    commercialContext: { company: null, leadAccount: null, booker: null, tariff: null, associations: [], referral: null, commissionContext: null },
    payer: { kind: "CLIENT", reference: "EXPLICIT-PAYER", displayName: "Pagador explícito", sourceVersion: 1, validFrom: null, validUntil: null, conditions: null },
    terms: { paymentTerms: "Contado", scope: "Alcance de prueba", exclusions: [], clientNotes: null, specialConditions: [], templateRef: null, templateVersion: null },
    exchange: null, discount: null, marginAuthorizationRef: null,
    lines: [{ sourceKind: "COSTING", costingLineRef: first.lineRef, concept: first.concept, quantity: String(first.quantity), unit: first.unit, economicClass: first.classification, quotedPrice: String(first.suggestedPrice), currency: costing.baseCurrency, reason: null, manualAuthority: null }],
    ...overrides,
  };
}

let assertions = 0;
try {
  const costings = await prisma.costingRevision.findMany({ where: { status: "PUBLISHED", issues: { none: { severity: "BLOCKER", status: "OPEN" } }, lines: { some: { suggestedPrice: { not: null } } } }, include: { lines: true, pipelineCase: true }, orderBy: { publishedAt: "asc" } });
  assert.ok(costings.length >= 2); assertions += 1;
  const contexts = costings.map((costing) => ({ tenantId: costing.tenantId, membershipId: costing.publishedByMembershipId, userId: costing.publishedByUserId, role: "A", effectivePermissions: permissions, deniedPermissions: [] }));
  const input = signed("QUOTE_PROPOSAL_CREATE", draft(costings[0], 1));
  const first = await createQuoteProposal(prisma, contexts[0], input); assert.equal(first.position, 1); assert.match(first.reference, /^Q-\d{4}-\d{6}-A$/); assertions += 2;
  const replay = await createQuoteProposal(prisma, contexts[0], input); assert.equal(replay.proposalRef, first.proposalRef); assertions += 1;
  await assert.rejects(createQuoteProposal(prisma, contexts[0], { ...input, payloadHash: "0".repeat(64), proposalName: "Manipulada" }), /QUOTE_PAYLOAD_HASH_MISMATCH|QUOTE_IDEMPOTENCY_CONFLICT/); assertions += 1;
  const second = await createQuoteProposal(prisma, contexts[0], signed("QUOTE_PROPOSAL_CREATE", draft(costings[0], 2)));
  const competingThird = await Promise.allSettled([
    createQuoteProposal(prisma, contexts[0], signed("QUOTE_PROPOSAL_CREATE", draft(costings[0], 3))),
    createQuoteProposal(prisma, contexts[0], signed("QUOTE_PROPOSAL_CREATE", draft(costings[0], 3))),
  ]);
  assert.equal(competingThird.filter((row) => row.status === "fulfilled").length, 1);
  assert.equal(competingThird.filter((row) => row.status === "rejected").length, 1);
  const third = competingThird.find((row) => row.status === "fulfilled").value;
  assert.notEqual(second.reference, third.reference); assertions += 3;
  const ready = await publishQuoteProposal(prisma, contexts[0], signed("QUOTE_PROPOSAL_PUBLISH", { proposalRef: first.proposalRef, expectedRevision: first.revision }));
  const sent = await sendQuoteProposal(prisma, contexts[0], signed("QUOTE_PROPOSAL_SEND", { proposalRef: first.proposalRef, expectedRevision: ready.revision, channel: "MANUAL", recipient: { kind: "RECIPIENT_ON_FILE", displayName: null, reference: null, present: true }, evidenceRef: null }));
  const accepted = await recordQuoteDecision(prisma, contexts[0], signed("QUOTE_CLIENT_DECISION", { proposalRef: first.proposalRef, expectedRevision: sent.revision, decision: "ACCEPTED", method: "SIGNED_DOCUMENT", decidedBy: { kind: "CLIENT_REPRESENTATIVE", displayName: null, reference: null, present: true }, evidenceRef: "DOC-TEST", reason: null })); assert.equal(accepted.state, "ACCEPTED"); assert.equal(accepted.operationalHandoff.caseRef, costings[0].pipelineCase.publicRef); assertions += 2;
  const view = await getQuoteCase(prisma, contexts[0], costings[0].pipelineCase.publicRef); assert.equal(view.proposals.length, 3); assertions += 1;
  const projection = getQuoteClientProjection(view.proposals[0]); assert.equal("capturedCost" in projection.lines[0], false); assert.equal("suggestedPrice" in projection.lines[0], false); assertions += 2;

  const a = await createQuoteProposal(prisma, contexts[1], signed("QUOTE_PROPOSAL_CREATE", draft(costings[1], 1))); const b = await createQuoteProposal(prisma, contexts[1], signed("QUOTE_PROPOSAL_CREATE", draft(costings[1], 2)));
  const ar = await publishQuoteProposal(prisma, contexts[1], signed("QUOTE_PROPOSAL_PUBLISH", { proposalRef: a.proposalRef, expectedRevision: a.revision })); const br = await publishQuoteProposal(prisma, contexts[1], signed("QUOTE_PROPOSAL_PUBLISH", { proposalRef: b.proposalRef, expectedRevision: b.revision }));
  const as = await sendQuoteProposal(prisma, contexts[1], signed("QUOTE_PROPOSAL_SEND", { proposalRef: a.proposalRef, expectedRevision: ar.revision, channel: "MANUAL", recipient: { kind: "RECIPIENT_ON_FILE", displayName: null, reference: null, present: true }, evidenceRef: null })); const bs = await sendQuoteProposal(prisma, contexts[1], signed("QUOTE_PROPOSAL_SEND", { proposalRef: b.proposalRef, expectedRevision: br.revision, channel: "MANUAL", recipient: { kind: "RECIPIENT_ON_FILE", displayName: null, reference: null, present: true }, evidenceRef: null }));
  const results = await Promise.allSettled([recordQuoteDecision(prisma, contexts[1], signed("QUOTE_CLIENT_DECISION", { proposalRef: a.proposalRef, expectedRevision: as.revision, decision: "ACCEPTED", method: "SIGNED", decidedBy: { kind: "CLIENT_REPRESENTATIVE", displayName: null, reference: null, present: true }, evidenceRef: "DOC-A", reason: null })), recordQuoteDecision(prisma, contexts[1], signed("QUOTE_CLIENT_DECISION", { proposalRef: b.proposalRef, expectedRevision: bs.revision, decision: "ACCEPTED", method: "SIGNED", decidedBy: { kind: "CLIENT_REPRESENTATIVE", displayName: null, reference: null, present: true }, evidenceRef: "DOC-B", reason: null }))]);
  assert.equal(results.filter((row) => row.status === "fulfilled").length, 1); assert.equal(results.filter((row) => row.status === "rejected").length, 1); assertions += 2;
  const acceptedCount = await prisma.quoteProposal.count({ where: { tenantId: contexts[1].tenantId, pipelineCaseId: costings[1].pipelineCaseId, state: "ACCEPTED" } }); assert.equal(acceptedCount, 1); assertions += 1;
  const line = await prisma.quoteLine.findFirst({ where: { tenantId: contexts[0].tenantId } }); await assert.rejects(prisma.quoteLine.update({ where: { id: line.id }, data: { concept: "Mutable" } }), /QUOTE_APPEND_ONLY/); assertions += 1;
  const commands = await prisma.quoteMutationCommand.count({ where: { tenantId: contexts[0].tenantId, requestId: input.requestId } }); assert.equal(commands, 1); assertions += 1;
  console.log(`V17-QUOTE-09A database: ${assertions}/${assertions}`);
} finally { await prisma.$disconnect(); }
