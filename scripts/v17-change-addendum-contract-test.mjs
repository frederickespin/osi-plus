import assert from "node:assert/strict";
import { normalizeChangeAddendumCommand } from "../api/_lib/changeAddendumContract.js";
import { hashCrmServicesPayload } from "../api/_lib/crmServicesContract.js";

function signed(action, overrides = {}) {
  const input = {
    operation: `CHANGE_ADDENDUM_${action}`,
    requestId: "123e4567-e89b-42d3-a456-426614174000",
    action,
    expectedWorkspaceVersion: 0,
    changeRef: action === "SAVE_DRAFT" ? null : "223e4567-e89b-42d3-a456-426614174000",
    expectedChangeVersion: action === "SAVE_DRAFT" ? 0 : 1,
    changeClass: action === "SAVE_DRAFT" ? "ECONOMIC_OR_TERM" : null,
    changeKind: action === "SAVE_DRAFT" ? "ADDED" : null,
    requestedBy: action === "SAVE_DRAFT" ? "CLIENT" : null,
    serviceCode: action === "SAVE_DRAFT" ? "PACKING" : null,
    serviceName: action === "SAVE_DRAFT" ? "Empaque adicional" : null,
    reason: action === "SAVE_DRAFT" ? "El cliente añadió cristalería." : null,
    quantity: action === "SAVE_DRAFT" ? 2 : null,
    unit: action === "SAVE_DRAFT" ? "horas" : null,
    catalogAmount: action === "SAVE_DRAFT" ? 1000 : null,
    adjustedAmount: action === "SAVE_DRAFT" ? 900 : null,
    currency: action === "SAVE_DRAFT" ? "DOP" : null,
    adjustmentReason: action === "SAVE_DRAFT" ? "Relación comercial vigente." : null,
    scheduleDays: action === "SAVE_DRAFT" ? 1 : 0,
    operationalImpact: action === "SAVE_DRAFT" ? "Se requiere un empacador adicional." : null,
    evidenceRef: action === "RECORD_CLIENT_ACCEPTANCE" ? "CORREO-CLIENTE-001" : null,
    ...overrides,
  };
  const payloadHash = hashCrmServicesPayload(input);
  const { operation: _operation, ...body } = input;
  return { ...body, payloadHash };
}

assert.equal(normalizeChangeAddendumCommand(signed("SAVE_DRAFT")).operation, "CHANGE_ADDENDUM_SAVE_DRAFT");
assert.equal(normalizeChangeAddendumCommand(signed("RECORD_CLIENT_ACCEPTANCE")).evidenceRef, "CORREO-CLIENTE-001");
assert.throws(() => normalizeChangeAddendumCommand(signed("SAVE_DRAFT", { adjustmentReason: null })), /CHANGE_ADDENDUM_ADJUSTMENT_REASON_REQUIRED/);
assert.throws(() => normalizeChangeAddendumCommand(signed("SAVE_DRAFT", { changeClass: "NO_COST", catalogAmount: 10, adjustedAmount: 0, adjustmentReason: "" })), /CHANGE_ADDENDUM_NO_COST_INVALID/);
assert.throws(() => normalizeChangeAddendumCommand({ ...signed("SEND_TO_CLIENT"), payloadHash: "0".repeat(64) }), /CRM_SERVICES_PAYLOAD_HASH_INVALID/);

process.stdout.write(`${JSON.stringify({ ok: true, flow: "change-addenda", states: ["DRAFT", "PENDING_CLIENT", "PENDING_INTERNAL", "APPROVED", "EXECUTED"], emergencyRatification: true })}\n`);
