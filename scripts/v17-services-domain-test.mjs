import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hashCrmServicesPayload, normalizeCaseServiceSelection, normalizeServiceCatalogCreate, normalizeServiceDefaults } from "../api/_lib/crmServicesContract.js";

const id = () => randomUUID();
const sign = (payload) => ({ ...Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "operation")), payloadHash: hashCrmServicesPayload(payload) });
const createPayload = { operation: "CATALOG_CREATE", requestId: "services-create-0001", code: "MOV_LOCAL", name: "Mudanza local", category: "Mudanzas", usage: "PRIMARY", compatibleModes: ["LOCAL"], sortOrder: 10, allowedComplementaryRefs: [] };
assert.equal(normalizeServiceCatalogCreate(sign(createPayload)).code, "MOV_LOCAL");
assert.throws(() => normalizeServiceCatalogCreate(sign({ ...createPayload, compatibleModes: [] })), /CRM_SERVICES_MODE_REQUIRED/);
assert.throws(() => normalizeServiceCatalogCreate({ ...sign(createPayload), payloadHash: "0".repeat(64) }), /CRM_SERVICES_PAYLOAD_HASH_INVALID/);

const primaryRef = id(); const complementaryRef = id();
const defaultsPayload = { operation: "DEFAULTS_SAVE", requestId: "services-default-001", primaryServiceRef: primaryRef, combinationRef: null, code: "MOV_LOCAL_DEFAULT", name: "Mudanza local estándar", isDefault: true, status: "ACTIVE", expectedVersion: null, complementaryRefs: [complementaryRef] };
assert.deepEqual(normalizeServiceDefaults(sign(defaultsPayload)).complementaryRefs, [complementaryRef]);
assert.throws(() => normalizeServiceDefaults(sign({ ...defaultsPayload, complementaryRefs: [complementaryRef, complementaryRef] })), /CRM_SERVICES_DUPLICATE_SELECTION/);

const selectionPayload = { operation: "CASE_SELECTION_SAVE", requestId: "services-case-0001", expectedRevision: 0, primaryServiceRef: primaryRef, complementaryRefs: [complementaryRef], defaultCombinationRef: null, otherServices: [{ description: "Permiso especializado" }] };
const selection = normalizeCaseServiceSelection(sign(selectionPayload));
assert.equal(selection.otherServices[0].description, "Permiso especializado");
assert.throws(() => normalizeCaseServiceSelection(sign({ ...selectionPayload, otherServices: [{ description: "x" }] })), /CRM_SERVICES_INPUT_INVALID/);
assert.throws(() => normalizeCaseServiceSelection(sign({ ...selectionPayload, tenantId: "forbidden" })), /CRM_SERVICES_INPUT_INVALID/);
process.stdout.write(`${JSON.stringify({ ok: true, assertions: 8 }, null, 2)}\n`);
