import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createQuoteProposal, getQuoteCase, getQuoteClientProjection, getQuoteClientProposal, publishQuoteProposal, recordQuoteDecision, reviseQuoteProposal, sendQuoteProposal } from "../api/_lib/quoteDomain.js";
import { quoteHash } from "../api/_lib/quoteContract.js";
import { costingHash } from "../api/_lib/costingContract.js";
import { getCosting, getQuoteAddOnCatalog, versionCostingRule } from "../api/_lib/costingDomain.js";
import { createV17QuoteLocalPrisma } from "./v17-quote-local-target.mjs";
import { createPublishedQuoteCostingFixture } from "./v17-quote-db-fixture.mjs";

const { prisma } = await createV17QuoteLocalPrisma(process.env.V17_QUOTE_TEST_DATABASE_URL);
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
  const fixtures = [];
  for (let index = 0; index < 2; index += 1) fixtures.push(await createPublishedQuoteCostingFixture(prisma, permissions));
  const costings = fixtures.map((fixture) => fixture.costing);
  const contexts = fixtures.map((fixture) => fixture.context);
  assert.ok(costings.length >= 2); assertions += 1;
  assert.notEqual(costings[0].tenantId, costings[1].tenantId); assertions += 1;
  assert.notEqual(costings[0].pipelineCaseId, costings[1].pipelineCaseId); assertions += 1;
  await assert.rejects(getQuoteCase(prisma, contexts[0], costings[1].pipelineCase.publicRef), /QUOTE_NOT_FOUND/); assertions += 1;
  await assert.rejects(createQuoteProposal(prisma, contexts[0], signed("QUOTE_PROPOSAL_CREATE", draft(costings[1], 1))), /QUOTE_NOT_FOUND/); assertions += 1;
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
  assert.deepEqual(view.proposals[0].versions.map(({ revision, state }) => [revision, state]), [[3, "ACCEPTED"], [2, "READY"], [1, "DRAFT"]]);
  assert.deepEqual(await getQuoteClientProposal(prisma, contexts[0], first.proposalRef), projection);
  const original = await getQuoteClientProposal(prisma, contexts[0], first.proposalRef, first.revisionRef);
  assert.deepEqual([original.state, original.revision, original.totals.totalQuotedPrice], ["DRAFT", 1, first.totals.totalQuotedPrice]);
  await assert.rejects(getQuoteClientProposal(prisma, contexts[1], first.proposalRef, first.revisionRef), /QUOTE_NOT_FOUND/);
  await assert.rejects(getQuoteClientProposal(prisma, contexts[0], second.proposalRef, first.revisionRef), /QUOTE_NOT_FOUND/);
  assertions += 5;

  const a = await createQuoteProposal(prisma, contexts[1], signed("QUOTE_PROPOSAL_CREATE", draft(costings[1], 1))); const b = await createQuoteProposal(prisma, contexts[1], signed("QUOTE_PROPOSAL_CREATE", draft(costings[1], 2)));
  const ar = await publishQuoteProposal(prisma, contexts[1], signed("QUOTE_PROPOSAL_PUBLISH", { proposalRef: a.proposalRef, expectedRevision: a.revision })); const br = await publishQuoteProposal(prisma, contexts[1], signed("QUOTE_PROPOSAL_PUBLISH", { proposalRef: b.proposalRef, expectedRevision: b.revision }));
  const as = await sendQuoteProposal(prisma, contexts[1], signed("QUOTE_PROPOSAL_SEND", { proposalRef: a.proposalRef, expectedRevision: ar.revision, channel: "MANUAL", recipient: { kind: "RECIPIENT_ON_FILE", displayName: null, reference: null, present: true }, evidenceRef: null })); const bs = await sendQuoteProposal(prisma, contexts[1], signed("QUOTE_PROPOSAL_SEND", { proposalRef: b.proposalRef, expectedRevision: br.revision, channel: "MANUAL", recipient: { kind: "RECIPIENT_ON_FILE", displayName: null, reference: null, present: true }, evidenceRef: null }));
  const results = await Promise.allSettled([recordQuoteDecision(prisma, contexts[1], signed("QUOTE_CLIENT_DECISION", { proposalRef: a.proposalRef, expectedRevision: as.revision, decision: "ACCEPTED", method: "SIGNED", decidedBy: { kind: "CLIENT_REPRESENTATIVE", displayName: null, reference: null, present: true }, evidenceRef: "DOC-A", reason: null })), recordQuoteDecision(prisma, contexts[1], signed("QUOTE_CLIENT_DECISION", { proposalRef: b.proposalRef, expectedRevision: bs.revision, decision: "ACCEPTED", method: "SIGNED", decidedBy: { kind: "CLIENT_REPRESENTATIVE", displayName: null, reference: null, present: true }, evidenceRef: "DOC-B", reason: null }))]);
  assert.equal(results.filter((row) => row.status === "fulfilled").length, 1); assert.equal(results.filter((row) => row.status === "rejected").length, 1); assertions += 2;
  const acceptedCount = await prisma.quoteProposal.count({ where: { tenantId: contexts[1].tenantId, pipelineCaseId: costings[1].pipelineCaseId, state: "ACCEPTED" } }); assert.equal(acceptedCount, 1); assertions += 1;
  const blocked = await createQuoteProposal(prisma, contexts[1], signed("QUOTE_PROPOSAL_CREATE", draft(costings[1], 3)));
  const manualPending = draft(costings[1], 3, { lines: [{ sourceKind: "MANUAL", costingLineRef: null, concept: "Proveedor pendiente", quantity: "1", unit: "SERVICE", economicClass: "EX", quotedPrice: null, currency: costings[1].baseCurrency, reason: "Oferta externa pendiente", manualAuthority: { kind: "PROVIDER_OFFER", reference: "PROVIDER-OFFER-PENDING", version: 1, status: "PENDING", capturedCost: null, suggestedPrice: null } }] });
  const pendingRevision = await reviseQuoteProposal(prisma, contexts[1], signed("QUOTE_PROPOSAL_REVISE", { ...manualPending, proposalRef: blocked.proposalRef, expectedRevision: blocked.revision }));
  await assert.rejects(publishQuoteProposal(prisma, contexts[1], signed("QUOTE_PROPOSAL_PUBLISH", { proposalRef: blocked.proposalRef, expectedRevision: pendingRevision.revision })), /QUOTE_BLOCKERS_PRESENT/); assertions += 1;
  const expiredPayload = draft(costings[1], 3, { issueDate: "2020-01-01", validUntil: "2020-01-02" });
  const expiredRevision = await reviseQuoteProposal(prisma, contexts[1], signed("QUOTE_PROPOSAL_REVISE", { ...expiredPayload, proposalRef: blocked.proposalRef, expectedRevision: pendingRevision.revision }));
  await assert.rejects(publishQuoteProposal(prisma, contexts[1], signed("QUOTE_PROPOSAL_PUBLISH", { proposalRef: blocked.proposalRef, expectedRevision: expiredRevision.revision })), /QUOTE_EXPIRED/); assertions += 1;
  const sourceLine = costings[1].lines.find((row) => row.suggestedPrice != null);
  const belowPayload = draft(costings[1], 3, { lines: [{ sourceKind: "COSTING", costingLineRef: sourceLine.lineRef, concept: sourceLine.concept, quantity: String(sourceLine.quantity), unit: sourceLine.unit, economicClass: sourceLine.classification, quotedPrice: (Number(sourceLine.suggestedPrice) / 2).toFixed(6), currency: costings[1].baseCurrency, reason: null, manualAuthority: null }] });
  const belowRevision = await reviseQuoteProposal(prisma, contexts[1], signed("QUOTE_PROPOSAL_REVISE", { ...belowPayload, proposalRef: blocked.proposalRef, expectedRevision: expiredRevision.revision }));
  await assert.rejects(publishQuoteProposal(prisma, contexts[1], signed("QUOTE_PROPOSAL_PUBLISH", { proposalRef: blocked.proposalRef, expectedRevision: belowRevision.revision })), /QUOTE_BLOCKERS_PRESENT/); assertions += 1;
  const restoredRevision = await reviseQuoteProposal(prisma, contexts[1], signed("QUOTE_PROPOSAL_REVISE", { ...draft(costings[1], 3), proposalRef: blocked.proposalRef, expectedRevision: belowRevision.revision }));
  await prisma.costingIssue.create({ data: { tenantId: costings[1].tenantId, revisionId: costings[1].id, code: "QUOTE_TEST_COSTING_BLOCKER", severity: "BLOCKER", family: null, message: "Bloqueo sintético", source: "ADMIN", sourceSnapshot: { synthetic: true } } });
  await assert.rejects(publishQuoteProposal(prisma, contexts[1], signed("QUOTE_PROPOSAL_PUBLISH", { proposalRef: blocked.proposalRef, expectedRevision: restoredRevision.revision })), /QUOTE_COSTING_BLOCKERS_PRESENT/); assertions += 1;
  const line = await prisma.quoteLine.findFirst({ where: { tenantId: contexts[0].tenantId } }); await assert.rejects(prisma.quoteLine.update({ where: { id: line.id }, data: { concept: "Mutable" } }), /QUOTE_APPEND_ONLY/); assertions += 1;
  const commands = await prisma.quoteMutationCommand.count({ where: { tenantId: contexts[0].tenantId, requestId: input.requestId } }); assert.equal(commands, 1); assertions += 1;

  // The salesperson can go directly from a case to a proposal using a
  // standalone sale rate, even before a service selection or cost calculation.
  const seller = { ...contexts[0], effectivePermissions: permissions.filter((permission) => !["quote:tenant", "quote:internal-cost:view"].includes(permission)) };
  const catalogAdmin = { ...seller, effectivePermissions: ["costing:rules:manage"] };
  const costingReader = { ...seller, effectivePermissions: ["costing:view"] };
  const sourceCase = costings[0].pipelineCase;
  const directCase = await prisma.pipelineCase.create({ data: {
    tenantId: seller.tenantId, caseCode: `QUOTE-DIRECT-${randomUUID().slice(0, 8)}`,
    mode: sourceCase.mode, serviceType: sourceCase.serviceType, customerType: sourceCase.customerType,
    ownerName: sourceCase.ownerName, ownerMembershipId: seller.membershipId, ownerUserId: seller.userId,
    originLocation: "Synthetic direct origin", destinationLocation: "Synthetic direct destination",
  } });
  const component = {
    seriesRef: null, family: "MATERIAL", code: "QUOTE_DIRECT_BOX", name: "Cajas adicionales", classification: "PR", source: "ADMIN",
    priority: 100, specificity: 10, conditions: { packageComponentCode: "QUOTE_DIRECT_BOX" }, unitCost: "30", currency: "DOP",
    minimumMarginBps: 2500, recommendedMarginBps: 3500, result: { unit: "unidad", saleUnitPrice: "60" }, state: "ACTIVE", validFrom: null, validTo: null,
  };
  function signedRule(data) {
    const requestId = randomUUID();
    return { requestId, payloadHash: costingHash({ operation: "COSTING_RULE_VERSION", requestId, ...data }), ...data };
  }
  const rate = await versionCostingRule(prisma, catalogAdmin, signedRule(component));
  const catalog = await getQuoteAddOnCatalog(prisma, seller, directCase.publicRef, "DOP");
  assert.deepEqual(catalog.map(({ ruleRef, unitPrice }) => [ruleRef, unitPrice]), [[rate.ruleRef, "60"]]);
  assert.equal("unitCost" in catalog[0], false);
  await assert.rejects(getQuoteAddOnCatalog(prisma, seller, costings[1].pipelineCase.publicRef, "DOP"), /COSTING_NOT_FOUND/);
  assertions += 3;
  const directBase = draft(costings[0], 1);
  const directInput = {
    ...directBase, caseRef: directCase.publicRef, costingRevisionRef: null,
    terms: { ...directBase.terms, groupName: "Material de empaque" },
    lines: [{
      sourceKind: "MANUAL", costingLineRef: null, concept: component.name, quantity: "2", unit: component.result.unit,
      quotedPrice: "120", economicClass: component.classification, currency: component.currency, reason: "Tarifa de catálogo",
      manualAuthority: { kind: "QUOTE_CATALOG_COMPONENT", reference: rate.ruleRef, version: rate.version, status: "CONFIRMED", capturedCost: null, suggestedPrice: null },
    }],
  };
  const direct = await createQuoteProposal(prisma, seller, signed("QUOTE_PROPOSAL_CREATE", directInput));
  assert.deepEqual([direct.sourceMode, direct.flexibleBasis, direct.groupName, direct.totals.totalQuotedPrice], ["CATALOG", true, "Material de empaque", 120]);
  assert.equal(getQuoteClientProjection(direct).groupName, direct.groupName);
  assert.equal("capturedCost" in direct.lines[0], false);
  assert.equal(await getCosting(prisma, costingReader, directCase.publicRef), null);
  await assert.rejects(getCosting(prisma, costingReader, directCase.publicRef, undefined, direct.costingRevisionRef), /COSTING_NOT_FOUND/);
  assert.equal((await getCosting(prisma, costingReader, sourceCase.publicRef, undefined, costings[0].revisionRef)).revisionRef, costings[0].revisionRef);
  assertions += 6;
  await versionCostingRule(prisma, catalogAdmin, signedRule({ ...component, seriesRef: rate.seriesRef, result: { ...component.result, saleUnitPrice: "70" } }));
  const directRevised = await reviseQuoteProposal(prisma, seller, signed("QUOTE_PROPOSAL_REVISE", {
    ...directInput, proposalRef: direct.proposalRef, expectedRevision: direct.revision,
    lines: [{ ...directInput.lines[0], lineRef: direct.lines[0].lineRef, manualAuthority: null, quantity: "3", quotedPrice: "150", reason: "Descuento solicitado" }],
  }));
  assert.deepEqual(directRevised.lines[0].catalog, { ruleRef: rate.ruleRef, version: 1, unitPrice: "60" });
  assert.equal(directRevised.totals.totalQuotedPrice, 150);
  assert.equal(directRevised.issues.some((issue) => issue.code === "MARGIN_AUTHORIZATION_REQUIRED"), true);
  const publishDirect = { proposalRef: direct.proposalRef, expectedRevision: directRevised.revision };
  await assert.rejects(publishQuoteProposal(prisma, seller, signed("QUOTE_PROPOSAL_PUBLISH", publishDirect)), /QUOTE_BLOCKERS_PRESENT/);
  const approveDirect = signed("QUOTE_PROPOSAL_PUBLISH", { ...publishDirect, marginApprovalReason: "Descuento al cliente autorizado" });
  await assert.rejects(publishQuoteProposal(prisma, seller, approveDirect), /QUOTE_FORBIDDEN/);
  const approver = { ...contexts[0], effectivePermissions: [...contexts[0].effectivePermissions, "costing:authorize-margin"] };
  const directReady = await publishQuoteProposal(prisma, approver, approveDirect);
  assert.equal(directReady.state, "READY");
  assert.equal(directReady.marginAuthorization.quoteRevisionRef, directRevised.revisionRef);
  assert.equal(directReady.issues.some((issue) => issue.code === "MARGIN_AUTHORIZATION_REQUIRED" && issue.status === "RESOLVED"), true);
  const directSent = await sendQuoteProposal(prisma, seller, signed("QUOTE_PROPOSAL_SEND", { proposalRef: direct.proposalRef, expectedRevision: directReady.revision, channel: "MANUAL", recipient: { kind: "RECIPIENT_ON_FILE", displayName: null, reference: null, present: true }, evidenceRef: null }));
  const directAccepted = await recordQuoteDecision(prisma, seller, signed("QUOTE_CLIENT_DECISION", { proposalRef: direct.proposalRef, expectedRevision: directSent.revision, decision: "ACCEPTED", method: "SIGNED_DOCUMENT", decidedBy: { kind: "CLIENT_REPRESENTATIVE", displayName: null, reference: null, present: true }, evidenceRef: "DOC-DIRECT-TEST", reason: null }));
  assert.equal(directAccepted.state, "ACCEPTED");
  assert.equal(directAccepted.operationalHandoff.caseRef, directCase.publicRef);
  assert.equal(directAccepted.operationalHandoff.logisticsPlanRevisionRef, null);
  assertions += 11;
  console.log(`V17-QUOTE-09A database: ${assertions}/${assertions}`);
} finally { await prisma.$disconnect(); }
