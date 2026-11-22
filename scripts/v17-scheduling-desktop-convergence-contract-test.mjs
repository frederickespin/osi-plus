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
import { canReportMetroReturn, evaluatorDayConflict, replacementAssignmentContext } from "../api/_lib/surveyEvaluatorDay.js";
import { evaluateExactSurveySlots, parseSurveyExactQuery } from "../api/_lib/surveyExactAvailability.js";

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

const timezone = "America/Santo_Domingo";
const offMetro = {
  id: "out-of-area",
  scheduledStart: new Date("2026-11-24T13:00:00.000Z"),
  scheduledEnd: new Date("2026-11-24T20:00:00.000Z"),
  contextSnapshot: { zone: { type: "INTERIOR" } },
  status: "COMPLETED",
};
const returned = {
  ...offMetro,
  contextSnapshot: {
    ...offMetro.contextSnapshot,
    metroReturnRecordedAt: "2026-11-24T16:30:00.000Z",
  },
};
function conflictFor(rows, when, options = {}) {
  const start = new Date(when);
  return evaluatorDayConflict(rows, {
    start, end: new Date(start.getTime() + 45 * 60_000),
    timezone, bufferMinutes: 45, outsideMetro: false, ...options,
  });
}
check("una visita fuera de zona bloquea el día hasta el regreso registrado", () => {
  assert.equal(conflictFor([offMetro], "2026-11-24T23:00:00.000Z"), "CRM_SURVEY_EVALUATOR_OUTSIDE_METRO");
  assert.equal(conflictFor([offMetro], "2026-11-25T13:00:00.000Z"), null);
  assert.equal(conflictFor([{ ...offMetro, status: "SUPERSEDED" }], "2026-11-24T18:00:00.000Z"), null);
});
check("el regreso libera visitas posteriores según el tiempo de traslado", () => {
  assert.equal(conflictFor([returned], "2026-11-24T17:14:00.000Z"), "CRM_SURVEY_EVALUATOR_CONFLICT");
  assert.equal(conflictFor([returned], "2026-11-24T17:15:00.000Z"), null);
  assert.equal(conflictFor([returned], "2026-11-24T16:30:00.000Z", { bufferMinutes: 0 }), null);
});
check("el regreso no permite una segunda salida de zona ni elimina citas existentes", () => {
  assert.equal(conflictFor([returned], "2026-11-24T19:30:00.000Z", { outsideMetro: true }), "CRM_SURVEY_INTERIOR_DAILY_LIMIT");
  const metroVisit = { ...offMetro, id: "metro", contextSnapshot: { zone: { type: "METRO" } } };
  assert.equal(conflictFor([metroVisit], "2026-11-24T22:00:00.000Z", { outsideMetro: true }), "CRM_SURVEY_EVALUATOR_DAY_BLOCKED");
  assert.equal(conflictFor([offMetro], "2026-11-24T18:00:00.000Z", { outsideMetro: true, excludeAssignmentId: offMetro.id }), null);
});
check("una salida realizada permanece en su fecha y una cita nueva no hereda el regreso", () => {
  const invalidated = { ...offMetro, routeInvalidatedAt: new Date("2026-11-24T17:00:00.000Z") };
  assert.equal(conflictFor([invalidated], "2026-11-24T18:00:00.000Z", { outsideMetro: true }), "CRM_SURVEY_INTERIOR_DAILY_LIMIT");
  assert.equal(conflictFor([{ ...returned, status: "CANCELLED" }], "2026-11-24T18:00:00.000Z", { outsideMetro: true }), "CRM_SURVEY_INTERIOR_DAILY_LIMIT");
  assert.equal(conflictFor([{ ...returned, scheduledEnd: new Date("2026-11-25T18:00:00.000Z") }], "2026-11-25T13:00:00.000Z"), null);
  assert.deepEqual(replacementAssignmentContext(returned), { zone: { type: "INTERIOR" } });
  assert.equal(returned.contextSnapshot.metroReturnRecordedAt, "2026-11-24T16:30:00.000Z");
});
check("el evaluador registra el regreso solo en la fecha local de la visita y una vez", () => {
  assert.equal(canReportMetroReturn(offMetro, timezone, new Date("2026-11-25T02:00:00.000Z")), true);
  assert.equal(canReportMetroReturn(offMetro, timezone, new Date("2026-11-25T04:00:00.000Z")), false);
  assert.equal(canReportMetroReturn(offMetro, timezone, new Date("2026-11-24T12:00:00.000Z")), false);
  assert.equal(canReportMetroReturn(returned, timezone, new Date("2026-11-24T17:00:00.000Z")), false);
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

const surveyDate = "2030-09-16";
const surveyTimezone = "America/Santo_Domingo";
const exactProfile = { code: "METRO", zoneType: "METRO", dailyCapacity: 8 };
const exactPolicy = {
  id: "survey-policy",
  timezone: surveyTimezone,
  configuration: {
    ...HISTORICAL_POLICY_TEMPLATE,
    profiles: [exactProfile],
    slots: [{ profile: "METRO", key: "DAY", startTime: "09:00", endTime: "17:00", capacity: 8 }],
  },
};
const exactOperationalPolicy = {
  id: "operational-policy",
  timezone: surveyTimezone,
  minimumTravelBufferMinutes: 45,
  virtualPreparationMinutes: 0,
  windows: [{
    weekday: 1, method: "IN_PERSON", startMinute: 540, endMinute: 1020, capacity: 8,
  }],
};
const candidates = [
  { membershipId: "ana", membershipRef: uuid(20), profileId: "ana-profile" },
  { membershipId: "luis", membershipRef: uuid(21), profileId: "luis-profile" },
];
const otherVisit = {
  id: "visit-luis", pipelineCaseId: "other-case", evaluatorMembershipId: "luis",
  scheduledStart: new Date(`${surveyDate}T19:00:00Z`),
  scheduledEnd: new Date(`${surveyDate}T19:45:00Z`),
  zoneCode: "METRO", scheduleProfile: "METRO", status: "ASSIGNED",
  contextSnapshot: { privateCustomerName: "Cliente de otro caso" },
};
const outsideTrip = {
  id: "trip-ana", pipelineCaseId: "other-outside-case", evaluatorMembershipId: "ana",
  scheduledStart: new Date(`${surveyDate}T13:00:00Z`),
  scheduledEnd: new Date(`${surveyDate}T15:00:00Z`),
  zoneCode: "INTERIOR", scheduleProfile: "INTERIOR_SHORT", status: "COMPLETED",
};
function exactSlots(time, options = {}) {
  return evaluateExactSurveySlots({
    query: parseSurveyExactQuery({ date: surveyDate, time }),
    policy: exactPolicy, operationalPolicy: exactOperationalPolicy,
    profile: exactProfile, zoneCode: "METRO", method: "IN_PERSON",
    candidates, assignments: [], overrides: [], zoneAssignments: [],
    pipelineCaseId: "current-case", ...options,
  });
}
fails("la hora y la fecha exactas se validan", () =>
  parseSurveyExactQuery({ date: "2030-02-29", time: "10:00" }), "CRM_SURVEY_SLOT_INVALID");
check("acepta cualquier minuto disponible y emite hora de RD y duración de 45 minutos", () => {
  const observed = exactSlots("09:07");
  assert.equal(observed.scheduledStart, `${surveyDate}T13:07:00.000Z`);
  assert.equal(observed.scheduledEnd, `${surveyDate}T13:52:00.000Z`);
  assert.equal(observed.slotKey, "DAY");
  assert.deepEqual(observed.evaluators, candidates.map((candidate) => candidate.membershipRef));
  assert.deepEqual(observed.alternatives, []);
});
check("ofrece horas realmente disponibles si la visita y el traslado ocupan la hora pedida", () => {
  const observed = exactSlots("14:00", { assignments: [otherVisit, outsideTrip] });
  assert.deepEqual(observed.evaluators, []);
  assert.equal(observed.alternatives[0]?.time, "13:30");
  assert.deepEqual(observed.alternatives[0]?.evaluatorMembershipRefs, [uuid(21)]);
  assert.deepEqual(observed.agenda.map((entry) => entry.label), ["Visita programada", "Visita fuera de zona metro"]);
  assert.doesNotMatch(JSON.stringify(observed.agenda), /Cliente de otro caso|other-case/);
});
check("el regreso abre agenda solamente después del margen de traslado", () => {
  const returned = {
    ...outsideTrip,
    contextSnapshot: { metroReturnRecordedAt: `${surveyDate}T16:30:00Z` },
  };
  assert.deepEqual(exactSlots("13:14", { assignments: [returned] }).evaluators, [uuid(21)]);
  assert.deepEqual(exactSlots("13:15", { assignments: [returned] }).evaluators, [uuid(20), uuid(21)]);
});
check("la agenda no sugiere otra salida para quien ya regresó de una visita fuera de zona", () => {
  const profile = { ...exactProfile, code: "INTERIOR_SHORT", zoneType: "INTERIOR" };
  const policy = { ...exactPolicy, configuration: {
    ...exactPolicy.configuration,
    profiles: [profile],
    slots: exactPolicy.configuration.slots.map((slot) => ({ ...slot, profile: profile.code })),
  } };
  const completedTrip = {
    ...outsideTrip,
    routeInvalidatedAt: new Date(`${surveyDate}T17:00:00Z`),
    contextSnapshot: { metroReturnRecordedAt: `${surveyDate}T16:30:00Z` },
  };
  const result = exactSlots("14:00", { profile, policy, zoneCode: "INTERIOR", assignments: [completedTrip] });
  assert.deepEqual(result.evaluators, [uuid(21)]);
  assert.equal(result.agenda[0]?.returnedToMetroAt, completedTrip.contextSnapshot.metroReturnRecordedAt);
});
check("el horario extraordinario se marca y la duración editable puede hacerlo ordinario", () => {
  assert.equal(exactSlots("16:20").requiresApproval, true);
  const query = parseSurveyExactQuery({ date: surveyDate, time: "16:20", durationMinutes: "30" });
  assert.equal(exactSlots("16:20", { query }).requiresApproval, false);
});
check("la reprogramación excluye la cita que está reemplazando", () => {
  const observed = exactSlots("15:00", {
    candidates: [candidates[1]], assignments: [otherVisit], excludedAssignmentId: otherVisit.id,
  });
  assert.deepEqual(observed.evaluators, [uuid(21)]);
  assert.deepEqual(observed.agenda, []);
});

process.stdout.write(`Scheduling 11B contract: ${checks}/${checks}\n`);
