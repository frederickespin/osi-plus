import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { calculateQuoteTotals, normalizeQuoteCreate, normalizeQuotePublish, normalizeQuoteRevise, quoteHash } from "../api/_lib/quoteContract.js";
import { getQuoteClientProjection, getQuoteClientProposal, quoteContractInternals } from "../api/_lib/quoteDomain.js";

const ref = () => randomUUID();
function payload(overrides = {}) {
  return {
    caseRef: ref(), costingRevisionRef: ref(), position: 1, proposalName: "Servicio estándar", currency: "USD", issueDate: "2026-09-05", validUntil: "2026-10-05",
    commercialContext: { company: null, leadAccount: null, booker: null, tariff: null, associations: ["FIDI"], referral: null, commissionContext: null },
    payer: { kind: "CLIENT", reference: "CLIENT-CONTRACT-1", displayName: "Cliente de prueba", sourceVersion: 1, validFrom: null, validUntil: null, conditions: null },
    terms: { paymentTerms: "50% inicial", scope: "Servicio definido", exclusions: [], clientNotes: null, specialConditions: [], templateRef: null, templateVersion: null },
    exchange: null, discount: null, marginAuthorizationRef: null,
    lines: [{ sourceKind: "COSTING", costingLineRef: ref(), concept: "Servicio", quantity: "1", unit: "SERVICE", economicClass: "PR", quotedPrice: "125", currency: "USD", reason: null, manualAuthority: null }],
    ...overrides,
  };
}
function signed(data, operation = "QUOTE_PROPOSAL_CREATE") { const requestId = ref(); return { requestId, payloadHash: quoteHash({ operation, requestId, ...data }), ...data }; }

let assertions = 0;
const normalized = normalizeQuoteCreate(signed(payload())); assert.equal(normalized.payer.kind, "CLIENT"); assertions += 1;
assert.throws(() => normalizeQuoteCreate(signed(payload({ payer: undefined }))), /QUOTE_PAYLOAD_INVALID/); assertions += 1;
assert.throws(() => normalizeQuoteCreate({ ...signed(payload()), payloadHash: "0".repeat(64) }), /QUOTE_PAYLOAD_HASH_MISMATCH/); assertions += 1;
const pending = payload({ lines: [{ sourceKind: "MANUAL", costingLineRef: null, concept: "Proveedor pendiente", quantity: "1", unit: "SERVICE", economicClass: "EX", quotedPrice: null, currency: "USD", reason: "Pendiente de oferta", manualAuthority: { kind: "PROVIDER_OFFER", reference: "OFFER-PENDING", version: 1, status: "PENDING", capturedCost: null, suggestedPrice: null } }] });
assert.equal(normalizeQuoteCreate(signed(pending)).lines[0].manualAuthority.status, "PENDING"); assertions += 1;
assert.throws(() => normalizeQuoteCreate(signed(payload({ lines: [{ ...pending.lines[0], quotedPrice: "1" }] }))), /QUOTE_MANUAL_AUTHORITY_INVALID/); assertions += 1;
const totals = calculateQuoteTotals([{ priceStatus: "CONFIRMED", capturedCost: "70", suggestedPrice: "100", quotedPrice: "125", economicClass: "PR" }, { priceStatus: "CONFIRMED", capturedCost: "20", suggestedPrice: "30", quotedPrice: "35", economicClass: "EX" }, { priceStatus: "PENDING", capturedCost: null, suggestedPrice: null, quotedPrice: null, economicClass: "DE" }], { kind: "AMOUNT", base: "160", value: "10" });
assert.deepEqual(totals, { capturedCost: 90, suggestedPrice: 130, grossQuotedPrice: 160, discountAmount: 10, totalQuotedPrice: 150, regularPrice: 130, payablePrice: 150, foregoneRevenue: 0, differenceVsSuggested: 20, marginAmount: 60, marginBps: 4000, external: 35, disbursements: 0, pendingLines: 1 }); assertions += 1;
const waivedTotals = calculateQuoteTotals([{ priceStatus: "CONFIRMED", capturedCost: "70", suggestedPrice: "100", quotedPrice: "0", economicClass: "PR" }], null);
assert.deepEqual({ regularPrice: waivedTotals.regularPrice, payablePrice: waivedTotals.payablePrice, foregoneRevenue: waivedTotals.foregoneRevenue }, { regularPrice: 100, payablePrice: 0, foregoneRevenue: 100 }); assertions += 1;
const extra = { sourceKind: "MANUAL", costingLineRef: null, concept: "Grúa", quantity: "2", unit: "hora", economicClass: "EX", quotedPrice: "250", currency: "USD", reason: "Cargo adicional del caso", manualAuthority: { kind: "QUOTE_ADDITIONAL_CHARGE", reference: ref(), version: 1, status: "CONFIRMED", capturedCost: "200", suggestedPrice: "250" } };
const packageQuote = payload();
const chargedPackage = normalizeQuoteCreate(signed({ ...packageQuote, lines: [...packageQuote.lines, extra] }));
const withCharges = calculateQuoteTotals(chargedPackage.lines.map((line) => ({
  ...line, priceStatus: "CONFIRMED", capturedCost: line.manualAuthority?.capturedCost ?? "80",
  suggestedPrice: line.manualAuthority?.suggestedPrice ?? "125",
})), null);
assert.equal(withCharges.totalQuotedPrice, 375);
assert.equal(withCharges.external, 250);
assert.equal(withCharges.capturedCost, 280);
assertions += 3;
const issuedBase = { ...packageQuote.lines[0], quantity: "2", quotedPrice: "75" };
const catalogRef = ref();
const catalogExtra = {
  ...extra, concept: "Caja adicional", quantity: "3", unit: "caja", quotedPrice: "60", economicClass: "PR",
  manualAuthority: { kind: "QUOTE_CATALOG_COMPONENT", reference: catalogRef, version: 2, status: "CONFIRMED", capturedCost: null, suggestedPrice: null },
};
const tariff = {
  revisionRef: packageQuote.costingRevisionRef, revision: 1, baseCurrency: "USD",
  inputSnapshot: { packagePricing: { minimumSale: "100", allowEdits: true, pricingRuleRef: ref(), pricingVersion: 1 } },
  lines: [
    { ...packageQuote.lines[0], lineRef: issuedBase.costingLineRef, classification: "PR", baseUnitCost: "50", totalCost: "50", suggestedPrice: "80", family: "LABOR", source: "ADMIN" },
    { lineRef: ref(), snapshot: { packageMinimum: true }, suggestedPrice: "20" },
  ],
};
const quoteContext = { tenantId: "demo", membershipId: "seller", userId: "seller", effectivePermissions: ["quote:override-price"] };
const catalogDatabase = { costingRule: { findMany: async ({ where }) => {
  assert.equal(where.tenantId, quoteContext.tenantId);
  return [{ ruleRef: catalogRef, version: 2, name: "Caja adicional", family: "MATERIAL", currency: "USD", classification: "PR",
    unitCost: "12", conditions: { packageComponentCode: "BOX" }, result: { unit: "caja", saleUnitPrice: "20" } }];
} } };
const adjustedPackage = normalizeQuoteCreate(signed({ ...packageQuote, packageAdjustmentReason: "Se compactó el alcance", lines: [issuedBase, catalogExtra] }));
const adjustedLines = await quoteContractInternals.buildLines(catalogDatabase, adjustedPackage, tariff, quoteContext);
assert.deepEqual(adjustedLines.map((line) => [line.concept, line.quotedPrice, line.capturedCost]), [
  ["Servicio", "75", "100"],
  ["Ajuste al mínimo del paquete", "25", "0"],
  ["Caja adicional", "60", "36"],
]);
assert.equal(calculateQuoteTotals(adjustedLines, null).totalQuotedPrice, 160);
await assert.rejects(quoteContractInternals.buildLines(catalogDatabase, adjustedPackage, tariff, { ...quoteContext, effectivePermissions: [] }), /QUOTE_FORBIDDEN/);
await assert.rejects(quoteContractInternals.buildLines(catalogDatabase, { ...adjustedPackage, packageAdjustmentReason: null }, tariff, quoteContext), /QUOTE_PACKAGE_ADJUSTMENT_REASON_REQUIRED/);
assertions += 4;
const directPayload = { ...packageQuote, costingRevisionRef: null, terms: { ...packageQuote.terms, groupName: "Empaque y transporte" }, lines: [catalogExtra] };
const direct = normalizeQuoteCreate(signed(directPayload));
const catalogBasis = { lines: [] };
const catalogSeller = { ...quoteContext, effectivePermissions: [] };
assert.equal(direct.terms.groupName, "Empaque y transporte");
assert.equal(direct.costingRevisionRef, null);
assert.throws(() => normalizeQuoteCreate(signed({ ...directPayload, lines: packageQuote.lines })), /QUOTE_DIRECT_LINES_REQUIRED/);
assert.throws(() => normalizeQuoteCreate(signed({ ...directPayload, lines: pending.lines })), /QUOTE_DIRECT_LINES_REQUIRED/);
assert.throws(() => normalizeQuoteCreate(signed({ ...directPayload, lines: [{ ...catalogExtra, lineRef: ref(), manualAuthority: null }] })), /QUOTE_LINE_SOURCE_INVALID/);
const [initialLine] = await quoteContractInternals.buildLines(catalogDatabase, direct, catalogBasis, catalogSeller);
assert.deepEqual([initialLine.quotedPrice, initialLine.suggestedPrice, initialLine.capturedCost], ["60", "60.00", "36"]);
const lineRef = ref();
const existing = { lines: [{ ...initialLine, lineRef }] };
const revisionPayload = { ...directPayload, proposalRef: ref(), expectedRevision: 1, lines: [
  { ...catalogExtra, lineRef, manualAuthority: null, quantity: "5", quotedPrice: "100" },
] };
const revision = normalizeQuoteRevise(signed(revisionPayload, "QUOTE_PROPOSAL_REVISE"));
const [revisedLine] = await quoteContractInternals.buildLines({}, revision, catalogBasis, catalogSeller, existing);
assert.deepEqual([revisedLine.sourceRef, revisedLine.sourceVersion, revisedLine.suggestedPrice, revisedLine.capturedCost], [catalogRef, 2, "100", "60"]);
await assert.rejects(quoteContractInternals.buildLines({}, revision, catalogBasis, catalogSeller, { lines: [] }), /QUOTE_LINE_SOURCE_INVALID/);
await assert.rejects(quoteContractInternals.buildLines({}, { ...revision, lines: [{ ...revision.lines[0], quotedPrice: "90" }] }, catalogBasis, catalogSeller, existing), /QUOTE_FORBIDDEN/);
const approvalInput = { proposalRef: revision.proposalRef, expectedRevision: 1, marginApprovalReason: "Descuento autorizado" };
assert.equal(normalizeQuotePublish(signed(approvalInput, "QUOTE_PROPOSAL_PUBLISH")).marginApprovalReason, approvalInput.marginApprovalReason);
assert.throws(() => normalizeQuotePublish(signed({ ...approvalInput, marginApprovalReason: "" }, "QUOTE_PROPOSAL_PUBLISH")), /QUOTE_PAYLOAD_INVALID/);
assertions += 11;
const client = getQuoteClientProjection({ proposalRef: ref(), reference: "Q-2026-000001-A", revisionRef: ref(), revision: 1, state: "SENT", proposalName: "A", currency: "USD", issueDate: "2026-09-05", validUntil: "2026-10-05", client: {}, commercialContext: {}, payer: {}, terms: {}, exchange: null, discount: null, totals: { capturedCost: 90, suggestedPrice: 130, grossQuotedPrice: 160, discountAmount: 0, totalQuotedPrice: 160 }, lines: [{ lineRef: ref(), sourceKind: "COSTING", concept: "Servicio", quantity: "1", unit: "SERVICE", economicClass: "PR", capturedCost: "90", suggestedPrice: "130", quotedPrice: "160", currency: "USD", priceStatus: "CONFIRMED", position: 1 }], logicalSha256: "a".repeat(64) });
assert.equal("capturedCost" in client.lines[0], false); assert.equal("suggestedPrice" in client.lines[0], false); assert.equal("capturedCost" in client.totals, false); assertions += 3;
const reader = { tenantId: ref(), membershipId: ref(), userId: ref(), effectivePermissions: ["quote:view"] };
const proposalRef = ref(), archivedRef = ref();
const archived = {
  revisionRef: archivedRef, revision: 2, state: "SENT", issueDate: new Date("2026-09-05"), validUntil: new Date("2026-10-05"),
  currency: "USD", proposalName: "Primer transporte", termsSnapshot: { scope: "Entrega al puerto" },
  payerSnapshot: { displayName: "Familia Pérez" }, clientSnapshot: { client: { displayName: "Familia Pérez" } },
  commercialContextSnapshot: { commissionContext: { amount: 20 } }, totalsSnapshot: { grossQuotedPrice: 100, discountAmount: 10, totalQuotedPrice: 90 },
  lines: [{ lineRef: ref(), quantity: "1", quotedPrice: "100", concept: "Transporte", currency: "USD", position: 1 }], issues: [],
};
const previous = await getQuoteClientProposal({ quoteProposal: {
  findFirst: async ({ where, select }) => {
    assert.deepEqual(where, { tenantId: reader.tenantId, proposalRef, pipelineCase: { ownerMembershipId: reader.membershipId, ownerUserId: reader.userId } });
    assert.deepEqual(select.revisions.where, { tenantId: reader.tenantId, revisionRef: archivedRef });
    return { proposalRef, reference: "Q-1", currentRevision: 3, state: "DRAFT", revisions: [archived] };
  },
} }, reader, proposalRef, archivedRef);
assert.deepEqual([previous.state, previous.revisionRef, previous.totals.totalQuotedPrice, previous.terms.scope], ["SENT", archivedRef, 90, "Entrega al puerto"]);
assert.equal("commercialContext" in previous, false);
await assert.rejects(getQuoteClientProposal({}, { ...reader, deniedPermissions: ["quote:view"] }, proposalRef, archivedRef), /QUOTE_FORBIDDEN/);
await assert.rejects(getQuoteClientProposal({ quoteProposal: { findFirst: async () => ({ revisions: [] }) } }, reader, proposalRef, ref()), /QUOTE_NOT_FOUND/);
assertions += 6;
console.log(`V17-QUOTE-09A contract: ${assertions}/${assertions}`);
