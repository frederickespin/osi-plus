import assert from "node:assert/strict";
import {
  CRM_QUOTE_PROPOSAL_RUNTIME,
  CrmQuoteProposalError,
  buildCrmQuoteProposalAtomicPlan,
  hashCrmQuoteProposalPayload,
  normalizeCrmQuoteProposalInput,
  normalizeCrmQuoteProposalUnsignedInput,
} from "../api/_lib/crmQuoteProposalDomain.js";

const line = (overrides = {}) => ({
  reference: "LIN-001",
  catalogCode: "MOV-LOCAL",
  description: "Mudanza local",
  quantity: "2",
  unit: "jornada",
  economicClass: "OWN",
  source: { kind: "SERVICE", reference: "SRV-MOV-01", version: 3, status: "CONFIRMED" },
  unitCost: "1000",
  suggestedUnitPrice: "1500",
  quotedUnitPrice: "1400",
  ...overrides,
});

const unsigned = (overrides = {}) => ({
  requestId: "quote-proposal-test-001",
  caseRef: "8a5d4c12-8d6d-4e79-8a2d-26ae4b7d8e10",
  currency: "DOP",
  minimumOwnMarginBps: 2400,
  destinationStatus: "CONFIRMED",
  operationalFacts: { volumeSource: "SURVEY_PUBLISHED", volumeCbm: "25.5", sourceRef: "SUR-001", sourceVersion: 2 },
  exchange: { foreignCurrency: "USD", fixedRate: "60", currentRate: "61", foreignExposure: "1000" },
  proposals: [{ slot: 1, reference: "COT-ICP001-A", name: "Esencial", status: "READY", lineItems: [line()] }],
  ...overrides,
});

function signed(value = unsigned()) {
  const normalized = normalizeCrmQuoteProposalUnsignedInput(value);
  return { ...value, payloadHash: hashCrmQuoteProposalPayload(normalized) };
}

function rejects(code, fn) {
  assert.throws(fn, (error) => error instanceof CrmQuoteProposalError && error.code === code);
}

assert.deepEqual(CRM_QUOTE_PROPOSAL_RUNTIME, {
  productionApiEnabled: false,
  persistenceEnabled: false,
  runtimeConsumers: 0,
  canonicalHeader: "PipelineCaseQuote",
  legacyQuoteAuthority: false,
  taxComputationEnabled: false,
});

const normalized = normalizeCrmQuoteProposalInput(signed());
assert.equal(normalized.proposals.length, 1);
assert.equal(normalized.proposals[0].totals.confirmedQuoted, "2800.00");
assert.equal(normalized.proposals[0].totals.ownMarginBps, 2857);
assert.equal(normalized.proposals[0].lineItems[0].quotedDirection, "BELOW_SUGGESTED");
assert.equal(normalized.exchange.suggestedCompensation, "1000.00");
assert.equal(normalized.taxPolicy, "DEFERRED_NOT_COMPUTED");

const plan = buildCrmQuoteProposalAtomicPlan(normalized, {
  tenantMatched: true,
  caseMatched: true,
  membershipActive: true,
  permissionGranted: true,
  caseRef: normalized.caseRef,
  destinationStatus: "CONFIRMED",
});
assert.equal(plan.canonicalHeader, "PipelineCaseQuote");
assert.equal(plan.audit.legacyQuoteAuthority, false);
assert.equal(plan.transaction, "PIPELINE_CASE_QUOTE_PROPOSALS_COMMAND_AUDIT");

const three = normalizeCrmQuoteProposalUnsignedInput(unsigned({
  proposals: [
    { slot: 1, reference: "COT-ICP001-A", name: "Esencial", status: "READY", lineItems: [line()] },
    { slot: 2, reference: "COT-ICP001-B", name: "Recomendada", status: "APPROVED", lineItems: [line({ reference: "LIN-002", quotedUnitPrice: "1600" })] },
    { slot: 3, reference: "COT-ICP001-C", name: "Integral", status: "READY", lineItems: [line({ reference: "LIN-003" })] },
  ],
}));
assert.equal(three.proposals.length, 3);
assert.equal(three.proposals[1].lineItems[0].quotedDirection, "ABOVE_SUGGESTED");

const noVolume = normalizeCrmQuoteProposalUnsignedInput(unsigned({
  operationalFacts: { volumeSource: "NONE", volumeCbm: null, sourceRef: null, sourceVersion: null },
}));
assert.equal(noVolume.operationalFacts.volumeCbm, null);

const clientVolume = normalizeCrmQuoteProposalUnsignedInput(unsigned({
  operationalFacts: { volumeSource: "CLIENT_PROVIDED", volumeCbm: "12.75", sourceRef: "CLI-DATA-01", sourceVersion: 1 },
}));
assert.equal(clientVolume.operationalFacts.volumeSource, "CLIENT_PROVIDED");

const pending = normalizeCrmQuoteProposalUnsignedInput(unsigned({
  proposals: [{ slot: 1, reference: "COT-ICP001-A", name: "Esencial", status: "DRAFT", lineItems: [line({
    source: { kind: "PERMIT", reference: "PER-ZR-01", version: 1, status: "PENDING" },
    unitCost: null,
    suggestedUnitPrice: null,
    quotedUnitPrice: null,
  })] }],
}));
assert.equal(pending.proposals[0].approvable, false);
assert.equal(pending.proposals[0].blockers[0].code, "CONCEPT_PENDING");

rejects("CRM_QUOTE_PROPOSAL_LIMIT", () => normalizeCrmQuoteProposalUnsignedInput(unsigned({ proposals: [] })));
rejects("CRM_QUOTE_PROPOSAL_LIMIT", () => normalizeCrmQuoteProposalUnsignedInput(unsigned({
  proposals: [1, 2, 3, 4].map((slot) => ({ slot: Math.min(slot, 3), reference: `COT-00${slot}`, name: `Propuesta ${slot}`, status: "DRAFT", lineItems: [line({ reference: `LIN-00${slot}` })] })),
})));
rejects("CRM_QUOTE_MULTIPLE_APPROVALS", () => normalizeCrmQuoteProposalUnsignedInput(unsigned({
  proposals: [
    { slot: 1, reference: "COT-001", name: "Uno", status: "APPROVED", lineItems: [line()] },
    { slot: 2, reference: "COT-002", name: "Dos", status: "APPROVED", lineItems: [line({ reference: "LIN-002" })] },
  ],
})));
rejects("CRM_QUOTE_APPROVAL_BLOCKED", () => normalizeCrmQuoteProposalUnsignedInput(unsigned({
  destinationStatus: "PENDING",
  proposals: [{ slot: 1, reference: "COT-001", name: "Uno", status: "APPROVED", lineItems: [line()] }],
})));
rejects("CRM_QUOTE_APPROVAL_BLOCKED", () => normalizeCrmQuoteProposalUnsignedInput(unsigned({
  proposals: [{ slot: 1, reference: "COT-001", name: "Uno", status: "APPROVED", lineItems: [line({ quotedUnitPrice: "1100" })] }],
})));
rejects("CRM_QUOTE_PENDING_AMOUNT_FORBIDDEN", () => normalizeCrmQuoteProposalUnsignedInput(unsigned({
  proposals: [{ slot: 1, reference: "COT-001", name: "Uno", status: "DRAFT", lineItems: [line({
    source: { kind: "THIRD_PARTY", reference: "TER-001", version: 1, status: "PENDING" },
  })] }],
})));
rejects("CRM_QUOTE_VOLUME_SOURCE_INVALID", () => normalizeCrmQuoteProposalUnsignedInput(unsigned({
  operationalFacts: { volumeSource: "NONE", volumeCbm: "25", sourceRef: null, sourceVersion: null },
})));
rejects("CRM_QUOTE_INPUT_INVALID", () => normalizeCrmQuoteProposalUnsignedInput({ ...unsigned(), estimatedCbm: "25" }));
rejects("CRM_QUOTE_PAYLOAD_HASH_INVALID", () => normalizeCrmQuoteProposalInput({ ...signed(), payloadHash: "0".repeat(64) }));
rejects("CRM_QUOTE_PERMISSION_FORBIDDEN", () => buildCrmQuoteProposalAtomicPlan(normalized, {
  tenantMatched: true, caseMatched: true, membershipActive: true, permissionGranted: false,
  caseRef: normalized.caseRef, destinationStatus: "CONFIRMED",
}));
rejects("CRM_QUOTE_AUTHORITY_STALE", () => buildCrmQuoteProposalAtomicPlan(normalized, {
  tenantMatched: true, caseMatched: true, membershipActive: true, permissionGranted: true,
  caseRef: normalized.caseRef, destinationStatus: "PENDING",
}));

process.stdout.write(JSON.stringify({ ok: true, assertions: 31, target: "V17_CRM_QUOTE_DOMAIN_08A" }, null, 2));
