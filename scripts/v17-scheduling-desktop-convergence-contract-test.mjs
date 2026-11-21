import assert from "node:assert/strict";
import {
  HISTORICAL_POLICY_TEMPLATE,
  normalizeSchedulingMutation,
  resolveOperationalCapability,
  resolveScheduleProfile,
  resolveSlotAvailability,
  schedulingHash,
  validateVisitFeeSource,
} from "../api/_lib/surveySchedulingContract.js";
import { calculateLogisticsPlan } from "../api/_lib/logisticsEngineContract.js";
import { classifyLogisticsMetro, logisticsVisitReferenceKm } from "../api/_lib/logisticsMetroClassification.js";

let checks = 0;
function check(name, run) { run(); checks += 1; process.stdout.write(`PASS ${name}\n`); }
function fails(name, run, code) { check(name, () => assert.throws(run, (error) => error?.code === code)); }
const uuid = (suffix) => `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;

const metro = {
  geometry: [[-70, 18], [-69, 18], [-69, 19], [-70, 19]],
  localities: [
    { city: "Municipio Á", sector: null, classification: "METRO" },
    { city: "Municipio Á", sector: "Sector Exterior", classification: "INTERIOR" },
  ],
};
check("la misma zona reconoce la localidad del lugar de visita y prefiere el sector", () => {
  const address = { countryCode: "DO", cityMunicipality: "municipio a" };
  assert.equal(classifyLogisticsMetro(metro, address), "METRO");
  assert.equal(classifyLogisticsMetro(metro, { ...address, sector: "sector exterior" }), "INTERIOR");
  assert.equal(classifyLogisticsMetro(metro, { ...address, cityMunicipality: "Sin clasificar" }), null);
  assert.equal(classifyLogisticsMetro(metro, { ...address, countryCode: "ES" }, [-69.5, 18.5]), null);
  assert.equal(classifyLogisticsMetro(metro, null, [-69.5, 18.5]), "METRO");
  assert.equal(classifyLogisticsMetro(metro, null, [-71, 18.5]), "INTERIOR");
});
check("la referencia de visita exige coincidencia y kilómetros sin conflicto", () => {
  const address = { countryCode: "DO", cityMunicipality: "municipio a", sector: "sector exterior" };
  const zone = {
    purposes: ["VISIT"], locationType: "SECTOR", city: "Municipio Á", sector: "Sector Exterior",
    zoneType: "INTERIOR", referenceDistanceKm: "42", referenceDistanceSource: "Medición de prueba", baseAddress: "Avenida de prueba",
  };
  assert.equal(logisticsVisitReferenceKm([zone], address, [{ active: true, address: zone.baseAddress }]), 42);
  assert.equal(logisticsVisitReferenceKm([zone, { ...zone, referenceDistanceKm: "30" }], address, []), null);
  assert.equal(logisticsVisitReferenceKm([{ ...zone, purposes: ["SERVICE"] }], address, []), null);
});

check("METRO histórico conserva 2 slots y capacidad 2", () => {
  const profile = resolveScheduleProfile(HISTORICAL_POLICY_TEMPLATE, "METRO", 10);
  assert.equal(profile.code, "METRO"); assert.equal(profile.dailyCapacity, 2);
  assert.deepEqual(HISTORICAL_POLICY_TEMPLATE.slots.filter((slot) => slot.profile === "METRO").map((slot) => [slot.key, slot.startTime, slot.endTime]), [["MORNING", "09:00", "12:00"], ["AFTERNOON", "14:00", "16:30"]]);
});
check("INTERIOR hasta 30 km conserva capacidad 2", () => assert.equal(resolveScheduleProfile(HISTORICAL_POLICY_TEMPLATE, "INTERIOR", 30).code, "INTERIOR_SHORT"));
check("INTERIOR mayor de 30 km conserva capacidad 1", () => assert.equal(resolveScheduleProfile(HISTORICAL_POLICY_TEMPLATE, "INTERIOR", 30.01).dailyCapacity, 1));
fails("domingo permanece cerrado", () => resolveSlotAvailability(HISTORICAL_POLICY_TEMPLATE, { profile: "METRO", date: "2026-09-06", slotKey: "MORNING", dayCount: 0, slotCount: 0 }), "CRM_SURVEY_DAY_CLOSED");
fails("sábado exige validación", () => resolveSlotAvailability(HISTORICAL_POLICY_TEMPLATE, { profile: "METRO", date: "2026-09-05", slotKey: "MORNING", dayCount: 0, slotCount: 0 }), "CRM_SURVEY_SATURDAY_APPROVAL_REQUIRED");
check("sábado validado conserva capacidad", () => assert.equal(resolveSlotAvailability(HISTORICAL_POLICY_TEMPLATE, { profile: "METRO", date: "2026-09-05", slotKey: "MORNING", dayCount: 0, slotCount: 0, saturdayApproved: true }).tone, "GREEN"));
fails("slot ocupado falla cerrado", () => resolveSlotAvailability(HISTORICAL_POLICY_TEMPLATE, { profile: "METRO", date: "2026-09-07", slotKey: "MORNING", dayCount: 1, slotCount: 1 }), "CRM_SURVEY_SLOT_FULL");

const capabilityPolicy = { ...HISTORICAL_POLICY_TEMPLATE, evaluatorCapabilities: [{ membershipRef: uuid(1), capabilities: ["CAN_PERFORM_IN_PERSON_SURVEY"] }, { membershipRef: uuid(2), capabilities: ["CAN_PERFORM_IN_PERSON_SURVEY", "CAN_PERFORM_OUT_OF_AREA_VISIT"] }] };
check("vendedor con capacidad explícita puede evaluar METRO", () => assert.equal(resolveOperationalCapability(capabilityPolicy, uuid(1), "IN_PERSON", "METRO"), true));
check("RBAC sin capacidad operacional no concede evaluación", () => assert.equal(resolveOperationalCapability(capabilityPolicy, uuid(3), "IN_PERSON", "METRO"), false));
check("INTERIOR requiere capacidad adicional", () => { assert.equal(resolveOperationalCapability(capabilityPolicy, uuid(1), "IN_PERSON", "INTERIOR_SHORT"), false); assert.equal(resolveOperationalCapability(capabilityPolicy, uuid(2), "IN_PERSON", "INTERIOR_LONG"), true); });

function signed(operation, payload, requestId = uuid(9)) { const body = { operation, requestId, ...payload }; return { ...body, payloadHash: schedulingHash(body) }; }
check("decisión presencial queda lista para agenda", () => assert.equal(normalizeSchedulingMutation(signed("DECIDE_METHOD", { caseRef: uuid(4), expectedVersion: null, method: "IN_PERSON", commercialState: "READY_TO_SCHEDULE", informationSource: "COMMERCIAL", rationaleCode: null })).method, "IN_PERSON"));
check("métodos remotos no crean visita implícita", () => assert.equal(normalizeSchedulingMutation(signed("DECIDE_METHOD", { caseRef: uuid(4), expectedVersion: null, method: "CLIENT_PHOTOS_DOCUMENTS", commercialState: "WAITING_CLIENT_INFO", informationSource: "CLIENT", rationaleCode: null })).commercialState, "WAITING_CLIENT_INFO"));
check("visita virtual permite cita sin traslado", () => assert.equal(normalizeSchedulingMutation(signed("DECIDE_METHOD", { caseRef: uuid(4), expectedVersion: null, method: "VIRTUAL", commercialState: "READY_TO_SCHEDULE", informationSource: "COMMERCIAL", rationaleCode: null })).commercialState, "READY_TO_SCHEDULE"));
check("agenda conserva lugar estructurado y duración exacta de la visita", () => {
  const command = normalizeSchedulingMutation(signed("SCHEDULE", {
    decisionRef: uuid(14), expectedDecisionVersion: 1, evaluatorMembershipRef: uuid(15),
    scheduledStart: "2030-09-16T13:00:00.000Z", scheduledEnd: "2030-09-16T13:45:00.000Z",
    slotKey: "MORNING", instruction: null, saturdayApprovalReason: null,
    visitReasonRef: uuid(16), visitRouteRole: "ORIGIN", visitRouteOrder: 0,
  }));
  assert.equal(command.visitRouteRole, "ORIGIN");
  assert.equal(command.visitRouteOrder, 0);
  assert.equal(new Date(command.scheduledEnd) - new Date(command.scheduledStart), 45 * 60_000);
});
fails("hash recibido se recalcula en servidor", () => normalizeSchedulingMutation({ ...signed("DECIDE_METHOD", { caseRef: uuid(4), expectedVersion: null, method: "NONE", commercialState: "NOT_REQUIRED", informationSource: null, rationaleCode: null }), payloadHash: "0".repeat(64) }), "CRM_SURVEY_PAYLOAD_HASH_MISMATCH");

check("Visit Fee gratuito no inventa importe", () => assert.equal(validateVisitFeeSource({ disposition: "FREE", suggestedAmount: null }).suggestedAmount, null));
fails("Visit Fee cobrable exige Motor y Costing", () => validateVisitFeeSource({ disposition: "CHARGEABLE", suggestedAmount: 500, currency: "DOP" }), "CRM_SURVEY_VISIT_FEE_SOURCE_REQUIRED");
check("Visit Fee cobrable conserva referencias publicadas", () => assert.equal(validateVisitFeeSource({ disposition: "CHARGEABLE", suggestedAmount: 500, currency: "DOP", logisticsRevisionRef: uuid(5), costingRevisionRef: uuid(6), costingLineRef: uuid(7) }).currency, "DOP"));
check("Motor publica clasificación de zona administrada", () => {
  const facts = { mode: "LOCAL", route: { distanceStatus: "KNOWN", distanceKm: 18, destinationStatus: "CONFIRMED", version: 1 }, services: { codes: [] }, survey: { volumeM3: 1, weightKg: 1, itemCount: 1, accessFlags: [] }, materials: { lines: [] }, assets: [], vehicles: [], externalOffers: [], availabilityObservedAt: "2026-09-05T00:00:00.000Z" };
  const rule = { ruleRef: uuid(10), seriesRef: uuid(11), family: "ZONE", code: "METRO_POLICY", priority: 100, specificity: 1, version: 1, conditionHash: "a".repeat(64), state: "ACTIVE", conditions: { maxDistanceKm: 30 }, result: { kind: "VISIT_ZONE", label: "METRO", quantity: 1, unit: "visita", zoneType: "METRO", zoneCode: "METRO_MAIN" } };
  assert.deepEqual(calculateLogisticsPlan(facts, [rule]).items[0].snapshot.zoneType, "METRO");
});
fails("Motor rechaza zona no administrada", () => calculateLogisticsPlan({ mode: "LOCAL", route: { distanceStatus: "KNOWN", distanceKm: 1, destinationStatus: "CONFIRMED", version: 1 }, services: { codes: [] }, survey: { volumeM3: 1, weightKg: 1, itemCount: 1, accessFlags: [] }, materials: { lines: [] }, assets: [], vehicles: [], externalOffers: [], availabilityObservedAt: "2026-09-05T00:00:00.000Z" }, [{ ruleRef: uuid(12), seriesRef: uuid(13), family: "ZONE", code: "BAD_ZONE", priority: 1, specificity: 1, version: 1, conditionHash: "b".repeat(64), state: "ACTIVE", conditions: {}, result: { kind: "VISIT_ZONE", label: "Bad", quantity: 1, zoneType: "UNKNOWN", zoneCode: "UNKNOWN" } }]), "LOGISTICS_RULE_RESULT_INVALID");

process.stdout.write(`Scheduling 11B contract: ${checks}/${checks}\n`);
