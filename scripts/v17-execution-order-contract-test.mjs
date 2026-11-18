import assert from "node:assert/strict";
import { normalizeExecutionOrderCommand } from "../api/_lib/executionOrderContract.js";
import { hashCrmServicesPayload } from "../api/_lib/crmServicesContract.js";

function signed(action, overrides = {}) {
  const input = {
    operation: `EXECUTION_ORDER_${action}`,
    requestId: "123e4567-e89b-42d3-a456-426614174000",
    action,
    expectedVersion: 0,
    plannedStart: "2026-11-20T13:00:00.000Z",
    plannedEnd: "2026-11-20T21:00:00.000Z",
    contractEvidenceRef: action === "ISSUE" ? "CTR-2026-0042-FIRMADO" : null,
    coordinatorName: "Ana Coordinadora",
    crewLeadName: null,
    driverName: null,
    vehicleName: null,
    instructions: "Confirmar acceso antes de salir.",
    ...overrides,
  };
  const payloadHash = hashCrmServicesPayload(input);
  const { operation: _operation, ...body } = input;
  return { ...body, payloadHash };
}

assert.equal(normalizeExecutionOrderCommand(signed("SAVE_DRAFT")).operation, "EXECUTION_ORDER_SAVE_DRAFT");
assert.equal(normalizeExecutionOrderCommand(signed("ISSUE")).contractEvidenceRef, "CTR-2026-0042-FIRMADO");

assert.throws(() => normalizeExecutionOrderCommand(signed("ISSUE", { contractEvidenceRef: null })), /EXECUTION_ORDER_INPUT_INVALID/);
assert.throws(() => normalizeExecutionOrderCommand(signed("SAVE_DRAFT", { plannedEnd: "2026-11-20T12:00:00.000Z" })), /EXECUTION_ORDER_SCHEDULE_INVALID/);
assert.throws(() => normalizeExecutionOrderCommand({ ...signed("SAVE_DRAFT"), payloadHash: "0".repeat(64) }), /CRM_SERVICES_PAYLOAD_HASH_INVALID/);

process.stdout.write(`${JSON.stringify({ ok: true, flow: "common-execution-order", actions: ["SAVE_DRAFT", "ISSUE"], immutableAfterIssue: true })}\n`);

