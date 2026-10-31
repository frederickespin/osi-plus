import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { fleetDriverReference, fleetDriverVehicleRef, normalizeFleetDriverQuery, parseFleetPrimaryCommand, parseFleetTemporaryRequest, parseFleetAuthorizationDecision } from "../api/_lib/fleetDriversContract.js";

const requestId = randomUUID(); const driverMembershipRef = randomUUID();
const primary = { requestId, expectedVersion: 0, driverMembershipRef, reason: "Asignación habitual" };
const temporal = { requestId, driverMembershipRef, startsAt: "2026-11-01T12:00:00.000Z", endsAt: "2026-11-01T20:00:00.000Z", reason: "Cobertura de turno" };
const invalid = (work) => assert.throws(work, (error) => error.code === "FLEET_DRIVERS_INPUT_INVALID" && error.status === 400);

test("habitual admite revisión inicial cero, persona pública o retiro explícito", () => {
  assert.deepEqual(parseFleetPrimaryCommand(primary), primary);
  assert.deepEqual(parseFleetPrimaryCommand({ ...primary, expectedVersion: 4, driverMembershipRef: null }), { ...primary, expectedVersion: 4, driverMembershipRef: null });
  assert.equal(fleetDriverVehicleRef("historical-cuid-123"), "historical-cuid-123");
  assert.equal(fleetDriverReference(driverMembershipRef.toUpperCase()), driverMembershipRef);
});
test("contratos no aceptan empresa, autor, roles ni campos extra", () => {
  for (const [parser, valid] of [[parseFleetPrimaryCommand, primary], [parseFleetTemporaryRequest, temporal], [parseFleetAuthorizationDecision, { requestId, expectedVersion: 1, action: "APPROVE" }]]) {
    for (const [key, value] of Object.entries({ tenantId: "other", requestedBy: driverMembershipRef, approvedBy: driverMembershipRef, permissions: ["fleet:drivers:authorize"], separationOfDutiesRequired: false, role: "A" })) invalid(() => parser({ ...valid, [key]: value }));
    for (const value of [null, [], "text", 42, Object.create({ inherited: true })]) invalid(() => parser(value));
  }
});
test("las referencias no admiten nombres libres, identificadores internos ni arrays", () => {
  for (const value of [undefined, "", "U007", "driver@example.invalid", [], {}, "../other", `${driverMembershipRef} `]) invalid(() => parseFleetPrimaryCommand({ ...primary, driverMembershipRef: value }));
  for (const value of [undefined, "", "nonce", {}, "11111111-1111-5111-8111-111111111111"]) {
    invalid(() => parseFleetPrimaryCommand({ ...primary, requestId: value }));
  }
});
test("versiones requieren enteros y no se coercionan", () => {
  for (const value of [undefined, null, "1", -1, 0.5, Infinity, 2147483647]) invalid(() => parseFleetPrimaryCommand({ ...primary, expectedVersion: value }));
  for (const value of [undefined, null, "1", 0, -1, 0.5]) invalid(() => parseFleetAuthorizationDecision({ requestId, expectedVersion: value, action: "APPROVE" }));
});
test("temporal conserva ámbito UTC explícito y normaliza segundos a milisegundos", () => {
  assert.deepEqual(parseFleetTemporaryRequest(temporal), temporal);
  assert.equal(parseFleetTemporaryRequest({ ...temporal, startsAt: "2026-11-01T12:00:00Z" }).startsAt, temporal.startsAt);
  for (const value of ["2026-11-01", "2026-11-01T08:00", "2026-11-01T08:00:00-04:00", "2026-02-31T12:00:00.000Z", "1899-12-31T00:00:00.000Z", null]) invalid(() => parseFleetTemporaryRequest({ ...temporal, startsAt: value }));
  for (const endsAt of [temporal.startsAt, "2026-11-01T11:59:59.999Z"]) invalid(() => parseFleetTemporaryRequest({ ...temporal, endsAt }));
});
test("motivos son texto acotado; rechazo y revocación exigen explicación", () => {
  for (const reason of [undefined, null, "", "  ", "x".repeat(501), "nul\u0000byte", 1]) {
    invalid(() => parseFleetPrimaryCommand({ ...primary, reason }));
    invalid(() => parseFleetTemporaryRequest({ ...temporal, reason }));
  }
  assert.match(parseFleetAuthorizationDecision({ requestId, expectedVersion: 1, action: "APPROVE" }).reason, /responsable de Flota/);
  for (const action of ["REJECT", "REVOKE"]) invalid(() => parseFleetAuthorizationDecision({ requestId, expectedVersion: 1, action }));
  invalid(() => parseFleetAuthorizationDecision({ requestId, expectedVersion: 1, action: "REACTIVATE", reason: "Cambio" }));
});
test("consultas separan opciones e historial, acotan páginas y rechazan autoridad extra", () => {
  assert.deepEqual(normalizeFleetDriverQuery(), { page: 1, pageSize: 20, search: "" });
  assert.deepEqual(normalizeFleetDriverQuery({}, { allowHistoryKind: true }), { page: 1, pageSize: 20, historyKind: "TEMPORARY" });
  assert.equal(normalizeFleetDriverQuery({ page: "2", pageSize: "50", search: "  Pérez  " }).search, "Pérez");
  for (const input of [{ tenantId: "other" }, { page: 0 }, { pageSize: 51 }, { page: "01" }, { search: ["a"] }, { search: "x".repeat(121) }, { historyKind: "PRIMARY" }]) invalid(() => normalizeFleetDriverQuery(input));
  for (const input of [{ historyKind: "ALL" }, { search: "name" }, { page: [] }]) invalid(() => normalizeFleetDriverQuery(input, { allowHistoryKind: true }));
});
