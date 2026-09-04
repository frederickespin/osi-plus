import assert from "node:assert/strict";
import {
  assetAvailability,
  canonicalAssetPayloadHash,
  normalizeAssetAssignment,
  normalizeAssetCostVersion,
  normalizeAssetInstanceCreate,
  normalizeAssetReservation,
  normalizeAssetReturn,
  normalizeExternalReservation,
  resourceAvailability,
} from "../api/_lib/toolsEquipmentContract.js";

const refs = Array.from({ length: 8 }, () => crypto.randomUUID());
function command(operation, payload, requestId = crypto.randomUUID()) {
  return { requestId, payloadHash: canonicalAssetPayloadHash({ operation, requestId, ...payload }), ...payload };
}

const instance = normalizeAssetInstanceCreate(command("ASSET_INSTANCE_CREATE", { modelRef: refs[0], locationRef: refs[1], internalCodePrefix: "EQP", serialNumber: "SERIAL-SYNTHETIC", barcode: null, physicalCondition: "GOOD", acquiredAt: "2026-09-04", acquisitionCost: 1200, replacementCost: 1500, currency: "DOP" }));
assert.equal(instance.internalCodePrefix, "EQP");
assert.throws(() => normalizeAssetInstanceCreate({ ...instance, internalCodePrefix: "eqp" }), /ASSET_INPUT_INVALID|ASSET_PAYLOAD_HASH_MISMATCH/);
assert.throws(() => normalizeAssetInstanceCreate(command("ASSET_INSTANCE_CREATE", { modelRef: refs[0], locationRef: refs[1], internalCodePrefix: "EQP", serialNumber: null, barcode: null, physicalCondition: "GOOD", acquiredAt: null, acquisitionCost: 1, replacementCost: null, currency: null })), /ASSET_INPUT_INVALID/);

const startsAt = "2026-09-04T12:00:00.000Z"; const endsAt = "2026-09-04T14:00:00.000Z";
const reservation = normalizeAssetReservation(command("ASSET_RESERVATION_CREATE", { assetRef: refs[2], caseRef: null, operationalReference: "SYNTHETIC-OP", startsAt, endsAt }));
assert.equal(reservation.assetRef, refs[2]);
assert.throws(() => normalizeAssetReservation(command("ASSET_RESERVATION_CREATE", { assetRef: refs[2], caseRef: null, operationalReference: null, startsAt, endsAt })), /ASSET_INPUT_INVALID/);
assert.throws(() => normalizeAssetReservation(command("ASSET_RESERVATION_CREATE", { assetRef: refs[2], caseRef: null, operationalReference: "SYNTHETIC-OP", startsAt: endsAt, endsAt: startsAt })), /ASSET_INTERVAL_INVALID/);

assert.equal(normalizeAssetAssignment(command("ASSET_ASSIGNMENT_CREATE", { assetRef: refs[2], reservationRef: refs[3], caseRef: null, assigneeRef: refs[4], custodianRef: refs[4], operationalReference: null, originLocationRef: refs[1], destinationLocationRef: null })).assigneeRef, refs[4]);
assert.throws(() => normalizeAssetReturn(command("ASSET_RETURN", { assignmentRef: refs[5], expectedVersion: 1, condition: "DAMAGED", locationRef: refs[1], returnedAt: endsAt, damageDescription: null, evidenceRefs: [] })), /ASSET_DAMAGE_DETAILS_REQUIRED/);

const available = assetAvailability({ asset: { operationalStatus: "AVAILABLE", physicalCondition: "GOOD" }, reservations: [], assignments: [], maintenance: [], startsAt, endsAt });
assert.equal(available.available, true);
assert.equal(assetAvailability({ asset: { operationalStatus: "AVAILABLE", physicalCondition: "GOOD" }, reservations: [{ status: "ACTIVE", startsAt: "2026-09-04T13:00:00.000Z", endsAt: "2026-09-04T15:00:00.000Z" }], assignments: [], maintenance: [], startsAt, endsAt }).available, false);
assert.equal(assetAvailability({ asset: { operationalStatus: "AVAILABLE", physicalCondition: "UNSAFE" }, reservations: [], assignments: [], maintenance: [], startsAt, endsAt }).blockedStatus, true);

assert.equal(resourceAvailability({ kind: "ASSET_INSTANCE", assetRef: refs[2], available: true, capacity: { units: 1 }, locationRef: refs[1] }).available, true);
assert.equal(resourceAvailability({ kind: "VEHICLE", vehicleCode: "VEH-SYNTHETIC", available: false, capacity: {} }).kind, "VEHICLE");
assert.equal(resourceAvailability({ kind: "EXTERNAL_OFFER", offerRef: refs[6], availabilityStatus: "AVAILABLE", capacity: { quantity: 2 } }).available, true);
assert.throws(() => resourceAvailability({ kind: "MATERIAL", materialRef: refs[7] }), /ASSET_RESOURCE_KIND_INVALID/);

const external = normalizeExternalReservation(command("EXTERNAL_RESERVATION_CREATE", { offerRef: refs[6], caseRef: null, startsAt, endsAt, quantity: 2, agreedAmount: 300, currency: "DOP", operationalReference: "SYNTHETIC-RENTAL" }));
assert.equal(external.quantity, 2);
assert.throws(() => normalizeExternalReservation({ ...external, quantity: 3 }), /ASSET_INPUT_INVALID|ASSET_PAYLOAD_HASH_MISMATCH/);
assert.equal(normalizeAssetCostVersion(command("ASSET_COST_VERSION_CREATE", { assetRef: refs[2], costType: "INTERNAL_RATE", amount: 25, currency: "DOP", temporalUnit: "HOUR", validFrom: startsAt, source: "SYNTHETIC_TEST" })).costType, "INTERNAL_RATE");
assert.throws(() => normalizeAssetCostVersion(command("ASSET_COST_VERSION_CREATE", { assetRef: refs[2], costType: "REPLACEMENT", amount: 25, currency: "DOP", temporalUnit: "HOUR", validFrom: startsAt, source: "SYNTHETIC_TEST" })), /ASSET_INPUT_INVALID/);
process.stdout.write(JSON.stringify({ ok: true, assertions: 17, temporalAvailability: true, productionApiEnabled: false }) + "\n");
