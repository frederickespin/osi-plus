import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { calculateQuoteTotals, normalizeQuoteCreate, quoteHash } from "../api/_lib/quoteContract.js";
import { getQuoteClientProjection } from "../api/_lib/quoteDomain.js";

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
function signed(data) { const requestId = ref(); return { requestId, payloadHash: quoteHash({ operation: "QUOTE_PROPOSAL_CREATE", requestId, ...data }), ...data }; }

let assertions = 0;
const normalized = normalizeQuoteCreate(signed(payload())); assert.equal(normalized.payer.kind, "CLIENT"); assertions += 1;
assert.throws(() => normalizeQuoteCreate(signed(payload({ payer: undefined }))), /QUOTE_PAYLOAD_INVALID/); assertions += 1;
assert.throws(() => normalizeQuoteCreate({ ...signed(payload()), payloadHash: "0".repeat(64) }), /QUOTE_PAYLOAD_HASH_MISMATCH/); assertions += 1;
const pending = payload({ lines: [{ sourceKind: "MANUAL", costingLineRef: null, concept: "Proveedor pendiente", quantity: "1", unit: "SERVICE", economicClass: "EX", quotedPrice: null, currency: "USD", reason: "Pendiente de oferta", manualAuthority: { kind: "PROVIDER_OFFER", reference: "OFFER-PENDING", version: 1, status: "PENDING", capturedCost: null, suggestedPrice: null } }] });
assert.equal(normalizeQuoteCreate(signed(pending)).lines[0].manualAuthority.status, "PENDING"); assertions += 1;
assert.throws(() => normalizeQuoteCreate(signed(payload({ lines: [{ ...pending.lines[0], quotedPrice: "1" }] }))), /QUOTE_MANUAL_AUTHORITY_INVALID/); assertions += 1;
const totals = calculateQuoteTotals([{ priceStatus: "CONFIRMED", capturedCost: "70", suggestedPrice: "100", quotedPrice: "125", economicClass: "PR" }, { priceStatus: "CONFIRMED", capturedCost: "20", suggestedPrice: "30", quotedPrice: "35", economicClass: "EX" }, { priceStatus: "PENDING", capturedCost: null, suggestedPrice: null, quotedPrice: null, economicClass: "DE" }], { kind: "AMOUNT", base: "160", value: "10" });
assert.deepEqual(totals, { capturedCost: 90, suggestedPrice: 130, grossQuotedPrice: 160, discountAmount: 10, totalQuotedPrice: 150, differenceVsSuggested: 20, marginAmount: 60, marginBps: 4000, external: 35, disbursements: 0, pendingLines: 1 }); assertions += 1;
const client = getQuoteClientProjection({ proposalRef: ref(), reference: "Q-2026-000001-A", revisionRef: ref(), revision: 1, state: "SENT", proposalName: "A", currency: "USD", issueDate: "2026-09-05", validUntil: "2026-10-05", client: {}, commercialContext: {}, payer: {}, terms: {}, exchange: null, discount: null, totals: { capturedCost: 90, suggestedPrice: 130, grossQuotedPrice: 160, discountAmount: 0, totalQuotedPrice: 160 }, lines: [{ lineRef: ref(), sourceKind: "COSTING", concept: "Servicio", quantity: "1", unit: "SERVICE", economicClass: "PR", capturedCost: "90", suggestedPrice: "130", quotedPrice: "160", currency: "USD", priceStatus: "CONFIRMED", position: 1 }], logicalSha256: "a".repeat(64) });
assert.equal("capturedCost" in client.lines[0], false); assert.equal("suggestedPrice" in client.lines[0], false); assert.equal("capturedCost" in client.totals, false); assertions += 3;
console.log(`V17-QUOTE-09A contract: ${assertions}/${assertions}`);
