import assert from "node:assert/strict";
import { normalizeEconomicControlCommand } from "../api/_lib/economicControlContract.js";
import { hashCrmServicesPayload } from "../api/_lib/crmServicesContract.js";

function signed(action, overrides = {}) {
  const input = {
    operation: `ECONOMIC_CONTROL_${action}`,
    requestId: "123e4567-e89b-42d3-a456-426614174000",
    action,
    expectedVersion: 0,
    billingEvidenceRef: "FISCAL-VALIDADA-001",
    completionEvidenceRef: "ACTA-ENTREGA-001",
    thirdPartyCostsStatus: "NONE",
    thirdPartyEvidenceRef: null,
    collectionState: action === "CLOSE" ? "CURRENT" : "PENDING",
    collectionEvidenceRef: action === "CLOSE" ? "RECIBO-001" : null,
    invoiceRef: action === "RECORD_INVOICE" || action === "CLOSE" ? "NCF-001" : null,
    notes: "Validación comercial sin asientos contables.",
    ...overrides,
  };
  const payloadHash = hashCrmServicesPayload(input);
  const { operation: _operation, ...request } = input;
  return { ...request, payloadHash };
}

assert.equal(normalizeEconomicControlCommand(signed("SAVE_DRAFT")).operation, "ECONOMIC_CONTROL_SAVE_DRAFT");
assert.equal(normalizeEconomicControlCommand(signed("MARK_READY")).thirdPartyCostsStatus, "NONE");
assert.equal(normalizeEconomicControlCommand(signed("RECORD_INVOICE")).invoiceRef, "NCF-001");
assert.equal(normalizeEconomicControlCommand(signed("CLOSE")).collectionState, "CURRENT");
assert.throws(() => normalizeEconomicControlCommand(signed("RECORD_INVOICE", { invoiceRef: null })), /ECONOMIC_CONTROL_INVOICE_REFERENCE_REQUIRED/);
assert.throws(() => normalizeEconomicControlCommand(signed("SAVE_DRAFT", { thirdPartyCostsStatus: "CONFIRMED", thirdPartyEvidenceRef: null })), /ECONOMIC_CONTROL_THIRD_PARTY_EVIDENCE_REQUIRED/);
assert.throws(() => normalizeEconomicControlCommand(signed("CLOSE", { collectionEvidenceRef: null })), /ECONOMIC_CONTROL_COLLECTION_EVIDENCE_REQUIRED/);
assert.throws(() => normalizeEconomicControlCommand({ ...signed("SAVE_DRAFT"), payloadHash: "0".repeat(64) }), /CRM_SERVICES_PAYLOAD_HASH_INVALID/);

process.stdout.write(`${JSON.stringify({ ok: true, flow: "economic-control", states: ["DRAFT", "READY", "INVOICED", "CLOSED"], accountingModule: false })}\n`);
