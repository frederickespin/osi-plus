import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { custodyPayloadHash, normalizeCustodyMovement, normalizeCustodyReceipt, normalizeCustodyReceptionAction, normalizeWarehouseGrant, normalizeWarehouseGrantUpdate } from "../api/_lib/customerCustodyContract.js";
import { resolveCustomerCustodyMode } from "../api/_lib/customerCustodyMode.js";

const ref = (digit) => `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;
function command(operation, requestId, payload) { return { requestId, payloadHash: custodyPayloadHash({ operation, requestId, ...payload }), ...payload }; }
test("receipt starts a scan-first session without manual item rows", () => { const payload = { clientRef: ref("1"), caseRef: null, warehouseRef: ref("2"), destinationLocationRef: ref("3"), storageType: "PERSONAL_EFFECTS", intakeSource: "OWN_PICKUP", manifestCode: "MAN-001", expectedUnits: null, groupLeadName: "Jefe", driverName: "Chofer", vehicleCode: "IP-07", sealNumber: "04781", departedAt: "2026-11-06T11:00:00.000Z", arrivedAt: null, receivedAt: "2026-11-06T12:00:00.000Z", billingStartAt: null, notes: null, items: [] }; const normalized = normalizeCustodyReceipt(command("CUSTOMER_CUSTODY_RECEIVE", ref("4"), payload)); assert.equal(normalized.intakeSource, "OWN_PICKUP"); assert.equal(normalized.items.length, 0); assert.equal(normalized.expectedUnits, null); for (const changed of [{ ...payload, clientRef: "invalid" }, { ...payload, intakeSource: "INTERNAL_MATERIALS" }, { ...payload, extra: true }]) assert.throws(() => normalizeCustodyReceipt(command("CUSTOMER_CUSTODY_RECEIVE", ref("4"), changed))); });
test("the four approved customer storage groups are accepted", () => { const base = { clientRef: ref("1"), caseRef: null, warehouseRef: ref("2"), destinationLocationRef: ref("3"), intakeSource: "DIRECT_WAREHOUSE", manifestCode: null, expectedUnits: 1, groupLeadName: null, driverName: null, vehicleCode: null, sealNumber: null, departedAt: null, arrivedAt: "2026-11-06T12:00:00.000Z", receivedAt: "2026-11-06T12:00:00.000Z", billingStartAt: null, notes: null, items: [{ externalCode: null, description: "Lote", category: null, quantity: 1, unit: "pieza", volumeM3: null, weightKg: null, condition: "GOOD", evidence: null, notes: null }] }; for (const storageType of ["PERSONAL_EFFECTS", "IMPORT_STORAGE", "INTERNATIONAL_DISPATCH", "COMMERCIAL_STORAGE"]) assert.equal(normalizeCustodyReceipt(command("CUSTOMER_CUSTODY_RECEIVE", ref("4"), { ...base, storageType })).storageType, storageType); });
test("reception actions enforce scan-first identity and location inputs", () => { const base = { storageRef: ref("1"), action: "SCAN_ITEM", itemRef: null, scanCode: "CST-001", locationRef: null, unitType: null, genericContents: null, inspectionResult: null, locationStatus: null, occurredAt: "2026-11-06T13:00:00.000Z", notes: null, evidence: null, expectedLotVersion: 2, expectedItemVersion: 1 }; assert.equal(normalizeCustodyReceptionAction(command("CUSTOMER_CUSTODY_RECEPTION_ACTION", ref("4"), base)).action, "SCAN_ITEM"); assert.throws(() => normalizeCustodyReceptionAction(command("CUSTOMER_CUSTODY_RECEPTION_ACTION", ref("4"), { ...base, scanCode: null }))); const label = { ...base, action: "REGISTER_UNLABELED_ITEM", scanCode: null, expectedItemVersion: null, unitType: "BOX", genericContents: ["Mobiliario"] }; assert.deepEqual(normalizeCustodyReceptionAction(command("CUSTOMER_CUSTODY_RECEPTION_ACTION", ref("5"), label)).genericContents, ["Mobiliario"]); const putAway = { ...base, action: "PUT_AWAY_SCAN", locationRef: ref("3") }; assert.equal(normalizeCustodyReceptionAction(command("CUSTOMER_CUSTODY_RECEPTION_ACTION", ref("6"), putAway)).locationRef, ref("3")); });
test("movement destination rules are explicit", () => { const base = { storageRef: ref("1"), itemRef: ref("2"), movementType: "TRANSFER", destinationLocationRef: ref("3"), quantity: 1, occurredAt: "2026-11-06T13:00:00.000Z", notes: null, expectedVersion: 1 }; assert.equal(normalizeCustodyMovement(command("CUSTOMER_CUSTODY_MOVE", ref("4"), base)).movementType, "TRANSFER"); assert.throws(() => normalizeCustodyMovement(command("CUSTOMER_CUSTODY_MOVE", ref("4"), { ...base, destinationLocationRef: null }))); assert.throws(() => normalizeCustodyMovement(command("CUSTOMER_CUSTODY_MOVE", ref("4"), { ...base, movementType: "DISPATCH" }))); });
test("access grants separate inventory scope from operations", () => { const payload = { membershipRef: ref("1"), warehouseRef: ref("2"), locationRef: null, inventoryScope: "CUSTOMER_CUSTODY", operations: ["VIEW", "RECEIVE"] }; assert.deepEqual(normalizeWarehouseGrant(command("WAREHOUSE_ACCESS_GRANT_CREATE", ref("3"), payload)).operations, ["VIEW", "RECEIVE"]); assert.throws(() => normalizeWarehouseGrant(command("WAREHOUSE_ACCESS_GRANT_CREATE", ref("3"), { ...payload, operations: ["VIEW", "VIEW"] }))); });
test("access grants can be explicitly revised or deactivated", () => { const grantRef = ref("1"); const payload = { expectedVersion: 2, operations: ["VIEW"], status: "INACTIVE" }; const requestId = ref("2"); const input = { requestId, payloadHash: custodyPayloadHash({ operation: "WAREHOUSE_ACCESS_GRANT_UPDATE", requestId, grantRef, ...payload }), ...payload }; assert.equal(normalizeWarehouseGrantUpdate(input, grantRef).status, "INACTIVE"); assert.throws(() => normalizeWarehouseGrantUpdate({ ...input, expectedVersion: 1 }, grantRef)); });
test("production and unrelated preview branches remain disabled", () => { assert.throws(() => resolveCustomerCustodyMode({ CUSTOMER_CUSTODY_API_MODE: "DISABLED" })); const preview = { CUSTOMER_CUSTODY_API_MODE: "PREVIEW_REHEARSAL", CUSTOMER_CUSTODY_API_BATCH: "V17-CUSTOMER-CUSTODY-21A-PREVIEW", VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature/v17-customer-custody-21a", MT01B_AUTH_MODE: "LEGACY", MT01B_TENANT_SWITCH_ENABLED: "false", VITE_MT01B2_CLIENT_ENABLED: "false" }; assert.equal(resolveCustomerCustodyMode(preview), "PREVIEW_REHEARSAL"); for (const override of [{ VERCEL_ENV: "production" }, { VERCEL_GIT_COMMIT_REF: "main" }, { CUSTOMER_CUSTODY_API_BATCH: "wrong" }]) assert.throws(() => resolveCustomerCustodyMode({ ...preview, ...override })); });
test("frontend Preview is pinned to the same exact branch and batch", () => { const source = readFileSync("src/customer-custody/mode.ts", "utf8"); assert.match(source, /VITE_VERCEL_ENV === "preview"/); assert.match(source, /VITE_VERCEL_GIT_COMMIT_REF === "feature\/v17-customer-custody-21a"/); assert.match(source, /V17-CUSTOMER-CUSTODY-21A-PREVIEW/); assert.doesNotMatch(source, /productionApiEnabled\s*=\s*true/); });
test("manual transport assignment declares its future service-order authority", () => { const source = readFileSync("src/customer-custody/CustomerCustodyApp.tsx", "utf8"); assert.match(source, /Asignación operativa/); assert.match(source, /Orden no vinculada · entrada manual/); assert.match(source, /se precargarán y podrán confirmarse o corregirse/); });
test("custody routes are explicitly classified as protected same-origin APIs", () => {
  const inventory = JSON.parse(readFileSync("scripts/protected-cors-route-inventory.json", "utf8"));
  for (const route of [
    "/api/customer-custody/access-grants",
    "/api/customer-custody/access-grants/[grantRef]",
    "/api/customer-custody/lots",
    "/api/customer-custody/movements",
    "/api/customer-custody/reception-actions",
  ]) assert.ok(inventory.categories.protectedSameOrigin.includes(route), `missing protected route ${route}`);
});
test("database migration seals custody history and enforces tenant-first scope", () => {
  const sql = readFileSync("prisma/migrations/20261106010000_v17_customer_custody/migration.sql", "utf8");
  for (const authority of [
    "customer_storage_lots_case_client_fkey",
    "customer_custody_commands_append_only",
    "customer_custody_movements_append_only",
    "v17_customer_custody_movement_append_only_guard",
    "warehouse_access_grants_scope_guard",
  ]) assert.match(sql, new RegExp(authority));
  assert.match(sql, /CHECK \(cardinality\("operations"\) > 0\)/);
  assert.match(sql, /CHECK \("quantity" > 0\)/);
});
test("customer storage groups are persisted on the lot and indexed tenant-first", () => {
  const sql = readFileSync("prisma/migrations/20261109010000_v17_customer_storage_groups/migration.sql", "utf8");
  for (const group of ["PERSONAL_EFFECTS", "IMPORT_STORAGE", "INTERNATIONAL_DISPATCH", "COMMERCIAL_STORAGE"]) assert.match(sql, new RegExp(group));
  assert.match(sql, /customer_storage_lots_type_idx/);
});
test("reception migration preserves chain of custody and compact scan identifiers", () => {
  const sql = readFileSync("prisma/migrations/20261110010000_v17_customer_custody_reception/migration.sql", "utf8");
  for (const authority of ["CustomerCustodyIntakeSource", "CustomerCustodyReceptionStage", "customer_storage_lots_reception_location_fkey", "customer_storage_lots_reception_stage_idx", "customer_stored_items_external_code_key"]) assert.match(sql, new RegExp(authority));
  assert.match(sql, /expected_units.*> 0/s);
});
test("scan-first migration keeps visual occupancy independent from volume", () => {
  const sql = readFileSync("prisma/migrations/20261110020000_v17_customer_custody_scan_first/migration.sql", "utf8");
  for (const authority of ["CustomerCustodyUnitType", "GENERATED_AT_RECEPTION", "CustomerCustodyLocationOccupancyStatus", "REVIEW_REQUIRED", "customer_custody_location_state_events_append_only"]) assert.match(sql, new RegExp(authority));
  assert.match(sql, /capacity is confirmed visually/i);
  assert.doesNotMatch(sql, /volume_m3[^\n]+FULL/i);
});
test("missing custody evidence is persisted as SQL NULL", () => {
  const source = readFileSync("api/_lib/customerCustodyDomain.js", "utf8");
  assert.match(source, /item\.evidence === null \? Prisma\.DbNull : item\.evidence/);
  assert.doesNotMatch(source, /item\.evidence === null \? Prisma\.JsonNull/);
});
test("custody client presentation uses the canonical fiscal name", () => {
  const source = readFileSync("api/_lib/customerCustodyDomain.js", "utf8");
  assert.match(source, /fiscalName/);
  assert.doesNotMatch(source, /companyName/);
});
