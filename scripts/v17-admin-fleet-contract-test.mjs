import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  adminFleetVehicleDto, adminFleetVehicleRef, normalizeAdminFleetVehicle,
  parseAdminFleetCreate, parseAdminFleetFilters, parseAdminFleetPatch,
} from "../api/_lib/adminFleetContract.js";

const results = [];
const check = (name, run) => { run(); results.push({ name, passed: true }); };
const invalid = (work) => assert.throws(work, (error) => error.code === "ADMIN_FLEET_INPUT_INVALID" && error.status === 400);
const creation = () => ({ requestId: randomUUID(), businessCode: "Camión #01", vehicleType: "TRUCK" });
check("create requires only a request UUID and both business identity fields", () => {
  const { vehicle } = parseAdminFleetCreate(creation());
  assert.equal(vehicle.normalizedCode, "CAMION-01");
  assert.equal(vehicle.operationalStatus, "AVAILABLE");
  assert.equal(vehicle.capacityWeight, null);
  assert.equal(vehicle.capacityVolume, null);
  assert.equal(vehicle.weightUnit, "KG");
  assert.equal(vehicle.effectiveFrom, null);
});
check("create fingerprint is stable when the effective start was omitted", () => {
  const input = creation();
  assert.equal(parseAdminFleetCreate(input).vehicle.payloadHash, parseAdminFleetCreate(input).vehicle.payloadHash);
});
check("normalization shares historical code, plate and VIN duplicate semantics", () => {
  const { vehicle } = parseAdminFleetCreate({ ...creation(), plate: " ab-123 ", vin: " ab-12345 " });
  assert.equal(vehicle.normalizedPlate, "AB123");
  assert.equal(vehicle.normalizedVin, "AB12345");
  assert.equal(vehicle.plate, "AB-123");
});
check("supported source units are preserved", () => {
  const { vehicle } = parseAdminFleetCreate({ ...creation(), weightUnit: "LB", capacityWeight: 1500.125, volumeUnit: "CFT", capacityVolume: 300.0012, dimensionUnit: "IN", usableLength: 20.0123 });
  assert.equal(vehicle.capacityWeight, 1500.125); assert.equal(vehicle.weightUnit, "LB");
  assert.equal(vehicle.capacityVolume, 300.0012); assert.equal(vehicle.volumeUnit, "CFT");
  assert.equal(vehicle.usableLength, 20.0123); assert.equal(vehicle.dimensionUnit, "IN");
});
for (const status of ["UNAVAILABLE", "RETIRED"]) check(`${status} cannot remain available for calculations`, () => {
  assert.equal(parseAdminFleetCreate({ ...creation(), operationalStatus: status, availableForCalculation: true }).vehicle.availableForCalculation, false);
});
for (const field of ["businessCode", "vehicleType", "requestId"]) check(`create requires ${field}`, () => {
  const input = creation(); delete input[field]; invalid(() => parseAdminFleetCreate(input));
});
for (const value of ["", " ", "!!!", "中文", 123, true, null, "x".repeat(81)]) check(`invalid business code ${String(value).slice(0, 12)}`, () => invalid(() => parseAdminFleetCreate({ ...creation(), businessCode: value })));
for (const value of [true, "1", -1, 0, NaN, Infinity, 0.0001, 1.2345, 1e11, {}]) check(`capacity weight rejects coercion/rounding ${String(value)}`, () => invalid(() => parseAdminFleetCreate({ ...creation(), capacityWeight: value })));
for (const [field, value] of [["capacityVolume", 1.12345], ["usableLength", 0.00001], ["usableWidth", 1e8], ["modelYear", "2026"], ["modelYear", 2026.5], ["modelYear", 1800], ["modelYear", 2201], ["availableForCalculation", "false"], ["plate", "!"], ["vin", "1234"], ["brand", "x".repeat(121)], ["hubCode", "x\n"]]) check(`invalid ${field} ${String(value).slice(0, 12)}`, () => invalid(() => parseAdminFleetCreate({ ...creation(), [field]: value })));
for (const [field, value] of [["weightUnit", "kg"], ["volumeUnit", "M3"], ["dimensionUnit", "CM2"], ["operationalStatus", "ACTIVE"]]) check(`unsupported enum ${field}`, () => invalid(() => parseAdminFleetCreate({ ...creation(), [field]: value })));
for (const value of ["2026-10-31", "2026-02-31T00:00:00.000Z", "0000-01-01T00:00:00.000Z", "2026-10-31T00:00:00+00:00", 0, null]) check(`ambiguous effective start ${value}`, () => invalid(() => parseAdminFleetCreate({ ...creation(), effectiveFrom: value })));
check("canonical UTC timestamps and a nullable end are accepted", () => {
  const { vehicle } = parseAdminFleetCreate({ ...creation(), effectiveFrom: "2026-10-31T00:00:00Z", effectiveTo: null });
  assert.equal(vehicle.effectiveFrom.toISOString(), "2026-10-31T00:00:00.000Z");
  assert.equal(vehicle.effectiveTo, null);
});
check("effective end must follow start", () => invalid(() => parseAdminFleetCreate({ ...creation(), effectiveFrom: "2026-10-31T00:00:00.000Z", effectiveTo: "2026-10-30T00:00:00.000Z" })));
for (const field of ["tenantId", "tenant_id", "id", "source", "sourceStableId", "importBatchId", "rowVersion", "request_id", "payloadHash", "calculationLocked", "retiredAt", "createdByUserId", "code", "capacityKg"]) check(`create cannot mass-assign ${field}`, () => invalid(() => parseAdminFleetCreate({ ...creation(), [field]: "untrusted" })));
check("patch only accepts explicit changed business fields", () => {
  const result = parseAdminFleetPatch({ requestId: randomUUID(), expectedVersion: 2, changes: { brand: null, operationalStatus: "UNAVAILABLE" } });
  assert.deepEqual(result.changes, { brand: null, operationalStatus: "UNAVAILABLE" });
});
for (const changes of [{}, null, [], { source: "IMPORT" }, { rowVersion: 1 }, { calculationLocked: false }, { tenantId: "other" }, { effectiveFrom: null }]) check(`patch rejects unsafe/empty changes ${JSON.stringify(changes)}`, () => invalid(() => parseAdminFleetPatch({ requestId: randomUUID(), expectedVersion: 1, changes })));
for (const expectedVersion of [0, -1, 1.2, "1", 2147483647, null]) check(`patch rejects invalid version ${expectedVersion}`, () => invalid(() => parseAdminFleetPatch({ requestId: randomUUID(), expectedVersion, changes: { brand: "Acme" } })));
for (const requestId of ["request-1", "00000000-0000-1000-8000-000000000000", " ", 1]) check(`requestId must be UUIDv4 ${requestId}`, () => invalid(() => parseAdminFleetPatch({ requestId, expectedVersion: 1, changes: { brand: "Acme" } })));
check("opaque vehicle references preserve historical cuid and UUID", () => {
  for (const ref of [randomUUID(), "clx123syntheticlegacyvehicle", "vehicle-synthetic_1"]) assert.equal(adminFleetVehicleRef(ref), ref);
  for (const ref of ["../another", " ' or 1=1", "a/b", "x".repeat(192), ["id"], null]) assert.throws(() => adminFleetVehicleRef(ref), (error) => error.code === "ADMIN_FLEET_NOT_FOUND");
});
check("filters are bounded and optional blank text is absent", () => {
  assert.deepEqual(parseAdminFleetFilters({ search: " ", vehicleType: "", page: "2", pageSize: "50" }), { page: 2, pageSize: 50 });
});
for (const query of [{ tenantId: "other" }, { search: [] }, { search: "x".repeat(121) }, { page: "01" }, { page: "1e2" }, { page: 0 }, { pageSize: "51" }, { operationalStatus: "ACTIVE" }]) check(`reject invalid list query ${JSON.stringify(query)}`, () => invalid(() => parseAdminFleetFilters(query)));
check("DTO is an exact allowlist and numeric units stay paired", () => {
  const dto = adminFleetVehicleDto({ id: "legacy-cuid", business_code: "TR-1", vehicle_type: "TRUCK", model_year: 2020,
    capacity_weight: "200.125", capacity_volume: null, weight_unit: "LB", volume_unit: "CFT", dimension_unit: "IN",
    operational_status: "AVAILABLE", available_for_calculation: true, effective_from: new Date("2026-01-01T00:00:00Z"), updated_at: new Date("2026-10-31T00:00:00Z"), row_version: 3,
    tenant_id: "private-tenant", created_by_user_id: "private-user", request_id: "private-request", payload_hash: "private-hash", source: "private-source" });
  assert.equal(dto.vehicleRef, "legacy-cuid"); assert.equal(dto.capacityWeight, 200.125); assert.equal(dto.weightUnit, "LB");
  assert.equal(dto.capacityVolume, null); assert.equal(dto.retiredAt, null); assert.equal(dto.calculationLocked, false);
  assert.deepEqual(Object.keys(dto).sort(), ["vehicleRef", "businessCode", "plate", "vin", "vehicleType", "brand", "model", "modelYear",
    "capacityWeight", "capacityVolume", "usableLength", "usableWidth", "usableHeight", "weightUnit", "volumeUnit", "dimensionUnit",
    "operationalStatus", "availableForCalculation", "effectiveFrom", "effectiveTo", "hubCode", "rowVersion", "updatedAt", "retiredAt", "calculationLocked"].sort());
  assert.ok(!JSON.stringify(dto).includes("private-"));
  assert.ok(Object.isFrozen(dto));
});
check("historical normalizer is reused without changing metadata or source units", () => {
  const value = normalizeAdminFleetVehicle({ businessCode: "TR-1", vehicleType: "TRUCK", capacityWeight: 500, weightUnit: "LB" }, { source: "IMPORT", sourceStableId: "historical-ref" });
  assert.equal(value.source, "IMPORT"); assert.equal(value.sourceStableId, "historical-ref"); assert.equal(value.capacityWeight, 500);
});
process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
