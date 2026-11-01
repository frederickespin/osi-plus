import assert from "node:assert/strict";
import test from "node:test";
import { canonicalPayloadHash } from "../api/_lib/materialsInventoryContract.js";
import { normalizeWarehouseAreaUseCreate, normalizeWarehouseAreaUseUpdate, normalizeWarehouseLocationConfiguration, warehouseAreaUseNameKey } from "../api/_lib/warehouseConfigurationContract.js";
import { isWarehouseConfigurationEnabled, resolveWarehouseConfigurationApiMode, WAREHOUSE_CONFIGURATION_PREVIEW_BATCH } from "../api/_lib/warehouseConfigurationMode.js";

const useRef = crypto.randomUUID(); const locationRef = crypto.randomUUID();
function command(operation, payload, scope = {}) { const requestId = crypto.randomUUID(); return { requestId, payloadHash: canonicalPayloadHash({ operation, requestId, ...scope, ...payload }), ...payload }; }
const usePayload = { name: "Materiales de embalaje", description: null, purpose: "INTERNAL" };
const configuration = { expectedVersion: 0, areaUseRef: null, characteristics: null, notes: null, operationalStatus: "ACTIVE", availabilityRule: "CONDITION_BASED", changeReason: null, acknowledgeImpact: false };

test("area-use creation has automatic code and explicit purpose", () => {
  const result = normalizeWarehouseAreaUseCreate(command("WAREHOUSE_AREA_USE_CREATE", usePayload));
  assert.equal(result.name, usePayload.name); assert.equal(result.purpose, "INTERNAL"); assert.equal(result.nameKey, "materiales de embalaje"); assert.equal(Object.hasOwn(result, "code"), false);
  for (const purpose of ["INTERNAL", "CLIENT_STORAGE", "MIXED"]) assert.equal(normalizeWarehouseAreaUseCreate(command("WAREHOUSE_AREA_USE_CREATE", { ...usePayload, purpose })).purpose, purpose);
});

test("duplicate-name normalization folds case, repeated space and Unicode equivalents", () => {
  assert.equal(warehouseAreaUseNameKey("ZONA  DE Embalaje"), warehouseAreaUseNameKey("Zona de embalaje"));
  assert.equal(warehouseAreaUseNameKey("ÁREA"), warehouseAreaUseNameKey("A\u0301rea"));
  assert.notEqual(warehouseAreaUseNameKey("Area"), warehouseAreaUseNameKey("Área"));
});

test("area-use create rejects manual codes, inferred goods and authority fields", () => {
  for (const extra of [{ code: "CUSTOM" }, { stock: 1 }, { tenantId: "other" }, { version: 1 }, { status: "ACTIVE" }, { clientRef: crypto.randomUUID() }]) assert.throws(() => normalizeWarehouseAreaUseCreate(command("WAREHOUSE_AREA_USE_CREATE", { ...usePayload, ...extra })), /WAREHOUSE_CONFIGURATION_INPUT_INVALID/);
  for (const purpose of [undefined, null, "CLIENT", "INTERNAL "]) assert.throws(() => normalizeWarehouseAreaUseCreate(command("WAREHOUSE_AREA_USE_CREATE", { ...usePayload, purpose })), /WAREHOUSE_CONFIGURATION_INPUT_INVALID/);
});

test("area-use text limits and exact whitespace are enforced", () => {
  for (const name of ["", "   ", " Name", "Name ", "x".repeat(161), null, 0]) assert.throws(() => normalizeWarehouseAreaUseCreate(command("WAREHOUSE_AREA_USE_CREATE", { ...usePayload, name })), /WAREHOUSE_CONFIGURATION_INPUT_INVALID/);
  assert.equal(normalizeWarehouseAreaUseCreate(command("WAREHOUSE_AREA_USE_CREATE", { ...usePayload, name: "x".repeat(160), description: "y".repeat(500) })).description.length, 500);
  assert.throws(() => normalizeWarehouseAreaUseCreate(command("WAREHOUSE_AREA_USE_CREATE", { ...usePayload, description: "y".repeat(501) })), /WAREHOUSE_CONFIGURATION_INPUT_INVALID/);
});

test("area-use updates bind URL identity, require version and preserve code authority", () => {
  const payload = { ...usePayload, expectedVersion: 2, status: "INACTIVE" };
  const input = command("WAREHOUSE_AREA_USE_UPDATE", payload, { useRef });
  assert.equal(normalizeWarehouseAreaUseUpdate(input, useRef).status, "INACTIVE");
  assert.throws(() => normalizeWarehouseAreaUseUpdate(input, crypto.randomUUID()), /WAREHOUSE_CONFIGURATION_PAYLOAD_HASH_MISMATCH/);
  for (const extra of [{ useRef }, { code: "RECODE" }, { expectedVersion: 0 }, { expectedVersion: "2" }, { status: "BLOCKED" }]) assert.throws(() => normalizeWarehouseAreaUseUpdate(command("WAREHOUSE_AREA_USE_UPDATE", { ...payload, ...extra }, { useRef }), useRef), /WAREHOUSE_CONFIGURATION_INPUT_INVALID/);
});

test("absent location settings use version0 and explicit nullable metadata", () => {
  const normalized = normalizeWarehouseLocationConfiguration(command("WAREHOUSE_LOCATION_CONFIGURATION_UPDATE", configuration, { locationRef }), locationRef);
  assert.equal(normalized.expectedVersion, 0); assert.equal(normalized.areaUseRef, null); assert.equal(normalized.acknowledgeImpact, false);
  assert.equal(normalized.operationalStatus, "ACTIVE"); assert.equal(normalized.availabilityRule, "CONDITION_BASED");
});

test("configuration separates informational dimensions from controls and ownership", () => {
  const normalized = normalizeWarehouseLocationConfiguration(command("WAREHOUSE_LOCATION_CONFIGURATION_UPDATE", { ...configuration, characteristics: "Puerta 2.4 m; estante metálico", notes: "Mantener pasillo libre", areaUseRef: useRef }, { locationRef }), locationRef);
  assert.equal(normalized.characteristics, "Puerta 2.4 m; estante metálico"); assert.equal(normalized.areaUseRef, useRef);
  for (const extra of [{ capacity: 20 }, { occupancy: 0 }, { available: true }, { tenantId: "other" }, { locationRef }, { warehouseRef: crypto.randomUUID() }, { controlReason: "old reason" }]) assert.throws(() => normalizeWarehouseLocationConfiguration(command("WAREHOUSE_LOCATION_CONFIGURATION_UPDATE", { ...configuration, ...extra }, { locationRef }), locationRef), /WAREHOUSE_CONFIGURATION_INPUT_INVALID/);
});

test("every operational state and availability rule is explicit", () => {
  for (const operationalStatus of ["ACTIVE", "RESTRICTED", "OUT_OF_SERVICE"]) for (const availabilityRule of ["CONDITION_BASED", "BLOCKED"]) {
    const normalized = normalizeWarehouseLocationConfiguration(command("WAREHOUSE_LOCATION_CONFIGURATION_UPDATE", { ...configuration, operationalStatus, availabilityRule }, { locationRef }), locationRef);
    assert.equal(normalized.operationalStatus, operationalStatus); assert.equal(normalized.availabilityRule, availabilityRule);
  }
  for (const change of [{ operationalStatus: "INACTIVE" }, { availabilityRule: "AVAILABLE" }, { acknowledgeImpact: "true" }, { expectedVersion: -1 }, { expectedVersion: 1.5 }, { expectedVersion: 1_000_001 }]) assert.throws(() => normalizeWarehouseLocationConfiguration(command("WAREHOUSE_LOCATION_CONFIGURATION_UPDATE", { ...configuration, ...change }, { locationRef }), locationRef), /WAREHOUSE_CONFIGURATION_INPUT_INVALID/);
});

test("metadata and fresh reason limits are bounded without numeric occupancy parsing", () => {
  const result = normalizeWarehouseLocationConfiguration(command("WAREHOUSE_LOCATION_CONFIGURATION_UPDATE", { ...configuration, characteristics: "x".repeat(180), notes: "x".repeat(2000), changeReason: "x".repeat(500), acknowledgeImpact: true }, { locationRef }), locationRef);
  assert.equal(result.characteristics.length, 180); assert.equal(result.notes.length, 2000); assert.equal(result.changeReason.length, 500);
  for (const change of [{ characteristics: "x".repeat(181) }, { notes: "x".repeat(2001) }, { changeReason: "x".repeat(501) }, { notes: 123 }]) assert.throws(() => normalizeWarehouseLocationConfiguration(command("WAREHOUSE_LOCATION_CONFIGURATION_UPDATE", { ...configuration, ...change }, { locationRef }), locationRef), /WAREHOUSE_CONFIGURATION_INPUT_INVALID/);
});

test("settings hash binds all controls, acknowledgment and URL identity", () => {
  const input = command("WAREHOUSE_LOCATION_CONFIGURATION_UPDATE", { ...configuration, operationalStatus: "RESTRICTED", changeReason: "Trabajo en el área", acknowledgeImpact: true }, { locationRef });
  for (const change of [{ operationalStatus: "ACTIVE" }, { acknowledgeImpact: false }, { notes: "changed" }]) assert.throws(() => normalizeWarehouseLocationConfiguration({ ...input, ...change }, locationRef), /WAREHOUSE_CONFIGURATION_PAYLOAD_HASH_MISMATCH/);
  assert.throws(() => normalizeWarehouseLocationConfiguration(input, crypto.randomUUID()), /WAREHOUSE_CONFIGURATION_PAYLOAD_HASH_MISMATCH/);
  assert.throws(() => normalizeWarehouseLocationConfiguration(input, "not-a-ref"), /WAREHOUSE_CONFIGURATION_INPUT_INVALID/);
});

const localReq = { headers: { host: "127.0.0.1:4173" }, rawHeaders: [], socket: { localAddress: "127.0.0.1", remoteAddress: "127.0.0.1", encrypted: false } };
const preview = { WAREHOUSE_CONFIGURATION_API_MODE: "PREVIEW_REHEARSAL", VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature/v17-consolidated-preview", WAREHOUSE_CONFIGURATION_API_BATCH: WAREHOUSE_CONFIGURATION_PREVIEW_BATCH, MT01B_AUTH_MODE: "LEGACY", MT01B_TENANT_SWITCH_ENABLED: "false", VITE_MT01B2_CLIENT_ENABLED: "false" };

test("configuration gate defaults OFF and unknown values never enable schema reads", () => {
  assert.equal(isWarehouseConfigurationEnabled({}), false); assert.equal(isWarehouseConfigurationEnabled({ WAREHOUSE_CONFIGURATION_API_MODE: "DISABLED" }), false);
  assert.throws(() => resolveWarehouseConfigurationApiMode({}, localReq), /WAREHOUSE_CONFIGURATION_DISABLED/);
  for (const mode of ["true", "PRODUCTION", "local_only", ""]) assert.throws(() => isWarehouseConfigurationEnabled({ WAREHOUSE_CONFIGURATION_API_MODE: mode }), /WAREHOUSE_CONFIGURATION_INVALID/);
});

test("local gate requires real loopback and cannot run on Vercel", () => {
  assert.equal(resolveWarehouseConfigurationApiMode({ WAREHOUSE_CONFIGURATION_API_MODE: "LOCAL_ONLY" }, localReq), "LOCAL_ONLY");
  assert.throws(() => resolveWarehouseConfigurationApiMode({ WAREHOUSE_CONFIGURATION_API_MODE: "LOCAL_ONLY" }, { ...localReq, socket: { ...localReq.socket, remoteAddress: "203.0.113.5" } }), /WAREHOUSE_CONFIGURATION_INVALID/);
  assert.throws(() => isWarehouseConfigurationEnabled({ WAREHOUSE_CONFIGURATION_API_MODE: "LOCAL_ONLY", VERCEL: "0" }), /WAREHOUSE_CONFIGURATION_INVALID/);
});

test("Preview gate pins consolidated branch, batch, authentication and tenancy", () => {
  assert.equal(isWarehouseConfigurationEnabled(preview), true);
  for (const change of [{ VERCEL_ENV: "production" }, { VERCEL_GIT_COMMIT_REF: "feature/v17-warehouses-configuration-20b" }, { VERCEL_GIT_COMMIT_REF: "main" }, { WAREHOUSE_CONFIGURATION_API_BATCH: "OTHER" }, { MT01B_AUTH_MODE: "TENANT" }, { MT01B_TENANT_SWITCH_ENABLED: "true" }, { VITE_MT01B2_CLIENT_ENABLED: "true" }, { VERCEL: "0" }]) assert.throws(() => isWarehouseConfigurationEnabled({ ...preview, ...change }), /WAREHOUSE_CONFIGURATION_INVALID/);
});
