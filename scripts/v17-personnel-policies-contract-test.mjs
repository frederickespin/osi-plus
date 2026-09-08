import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { __personnelPoliciesInternals } from "../api/_lib/personnelPoliciesDomain.js";
import {
  normalizePersonnelPolicyMutation,
  personnelPayloadHash,
  PERSONNEL_POLICY_PRECEDENCE,
} from "../api/_lib/personnelPoliciesContract.js";

let checks = 0;
const ok = (value, message) => {
  assert.ok(value, message);
  checks += 1;
};
const signed = (operation, payload, requestId = randomUUID()) => ({
  operation,
  requestId,
  ...payload,
  payloadHash: personnelPayloadHash({ operation, requestId, ...payload }),
});
const capability = normalizePersonnelPolicyMutation(
  signed("CAPABILITY_CREATE", {
    code: "CAN_PERFORM_IN_PERSON_SURVEY",
    name: "Visita presencial",
    description: null,
  }),
);
ok(
  capability.code === "CAN_PERFORM_IN_PERSON_SURVEY",
  "capacidad administrable",
);
const windows = [
  {
    weekday: 1,
    startMinute: 480,
    endMinute: 1020,
    capacity: 4,
    method: "IN_PERSON",
    zoneRuleRef: null,
    calendarDate: null,
    requiresApproval: false,
    kind: "REGULAR",
  },
];
const policy = normalizePersonnelPolicyMutation(
  signed("POLICY_PUBLISH", {
    expectedVersion: 0,
    timezone: "America/Santo_Domingo",
    defaultVisitMinutes: 120,
    minimumTravelBufferMinutes: 45,
    virtualPreparationMinutes: 15,
    validFrom: "2030-01-01T00:00:00.000Z",
    windows,
  }),
);
ok(
  policy.minimumTravelBufferMinutes === 45 && policy.windows.length === 1,
  "política semanal configurable",
);
ok(
  __personnelPoliciesInternals.conflicts([
    ...windows,
    { ...windows[0], startMinute: 900, endMinute: 1100 },
  ]),
  "conflicto de igual alcance detectado",
);
ok(
  !__personnelPoliciesInternals.conflicts([
    ...windows,
    { ...windows[0], weekday: 2 },
  ]),
  "días distintos no colisionan",
);
const specialOpening = {
  ...windows[0],
  weekday: 6,
  calendarDate: "2030-09-14",
  kind: "SPECIAL_OPENING",
};
ok(
  normalizePersonnelPolicyMutation(
    signed("POLICY_PUBLISH", {
      expectedVersion: 0,
      timezone: "America/Santo_Domingo",
      defaultVisitMinutes: 120,
      minimumTravelBufferMinutes: 45,
      virtualPreparationMinutes: 15,
      validFrom: "2030-01-01T00:00:00.000Z",
      windows: [...windows, specialOpening],
    }),
  ).windows[1].calendarDate === "2030-09-14",
  "día especial fechado",
);
assert.throws(
  () =>
    normalizePersonnelPolicyMutation(
      signed("POLICY_PUBLISH", {
        expectedVersion: 0,
        timezone: "America/Santo_Domingo",
        defaultVisitMinutes: 120,
        minimumTravelBufferMinutes: 45,
        virtualPreparationMinutes: 15,
        validFrom: "2030-01-01T00:00:00.000Z",
        windows: [{ ...specialOpening, weekday: 5 }],
      }),
    ),
  /INPUT_INVALID/,
);
checks += 1;
assert.throws(
  () =>
    normalizePersonnelPolicyMutation(
      signed("POLICY_PUBLISH", {
        expectedVersion: 0,
        timezone: "America/Santo_Domingo",
        defaultVisitMinutes: 120,
        minimumTravelBufferMinutes: 45,
        virtualPreparationMinutes: 15,
        validFrom: "2030-01-01T00:00:00.000Z",
        windows: [{ ...windows[0], kind: "SPECIAL_CLOSURE" }],
      }),
    ),
  /INPUT_INVALID/,
);
checks += 1;
ok(
  PERSONNEL_POLICY_PRECEDENCE.join(">") ===
    "EMPLOYEE_OVERRIDE>APPROVED_EXCEPTION>TENANT_POLICY>FAIL_CLOSED",
  "precedencia explícita",
);
for (const [label, mutate, expected] of [
  [
    "hash manipulado",
    (value) => ({ ...value, payloadHash: "0".repeat(64) }),
    /PAYLOAD_HASH_MISMATCH/,
  ],
  [
    "campo interno",
    (value) => ({ ...value, tenantId: randomUUID() }),
    /INPUT_INVALID/,
  ],
  [
    "código inválido",
    () =>
      signed("CAPABILITY_CREATE", {
        code: "survey perform",
        name: "X",
        description: null,
      }),
    /INPUT_INVALID/,
  ],
]) {
  assert.throws(
    () =>
      normalizePersonnelPolicyMutation(
        mutate(
          signed("CAPABILITY_CREATE", {
            code: "VALID",
            name: "Válida",
            description: null,
          }),
        ),
      ),
    expected,
    label,
  );
  checks += 1;
}
const overridePayload = {
  profileRef: randomUUID(),
  kind: "AVAILABLE",
  startsAt: "2030-01-01T10:00:00.000Z",
  endsAt: "2030-01-01T09:00:00.000Z",
  method: null,
  zoneRuleRef: null,
  travelBufferMinutes: null,
  reason: "Disponibilidad especial",
};
assert.throws(
  () =>
    normalizePersonnelPolicyMutation(
      signed("SCHEDULE_OVERRIDE_CREATE", overridePayload),
    ),
  /INPUT_INVALID/,
);
checks += 1;
assert.throws(
  () =>
    normalizePersonnelPolicyMutation(
      signed("SCHEDULE_OVERRIDE_CREATE", {
        ...overridePayload,
        startsAt: "2030-01-01T08:00:00.000Z",
        kind: "TRAVEL_BUFFER",
      }),
    ),
  /INPUT_INVALID/,
);
checks += 1;
const request = {
  caseRef: randomUUID(),
  assignmentRef: null,
  profileRef: randomUUID(),
  reasonRef: randomUUID(),
  method: "VIRTUAL",
  requestedStart: "2030-01-01T10:00:00.000Z",
  requestedEnd: "2030-01-01T11:00:00.000Z",
  requesterOrigin: "CLIENT",
  reasonDescription: "Horario solicitado por cliente",
};
ok(
  normalizePersonnelPolicyMutation(signed("EXCEPTION_REQUEST", request))
    .method === "VIRTUAL",
  "excepción cerrada",
);
assert.throws(
  () =>
    normalizePersonnelPolicyMutation(
      signed("EXCEPTION_REQUEST", {
        ...request,
        requestedEnd: request.requestedStart,
      }),
    ),
  /INPUT_INVALID/,
);
checks += 1;
const response = {
  requestRef: randomUUID(),
  expectedVersion: 1,
  response: "ALTERNATIVE_PROPOSED",
  alternativeStart: "2030-01-02T10:00:00.000Z",
  alternativeEnd: "2030-01-02T11:00:00.000Z",
  reason: "Propongo alternativa",
};
ok(
  normalizePersonnelPolicyMutation(signed("EXCEPTION_RESPOND", response))
    .response === "ALTERNATIVE_PROPOSED",
  "alternativa coherente",
);
assert.throws(
  () =>
    normalizePersonnelPolicyMutation(
      signed("EXCEPTION_RESPOND", { ...response, alternativeEnd: null }),
    ),
  /INPUT_INVALID/,
);
checks += 1;
ok(
  __personnelPoliciesInternals.capabilityForMethod("IN_PERSON") ===
    "CAN_PERFORM_IN_PERSON_SURVEY",
  "permiso técnico separado de capacidad",
);
ok(
  __personnelPoliciesInternals.capabilityForMethod("VIRTUAL") ===
    "CAN_PERFORM_VIRTUAL_SURVEY",
  "capacidad virtual separada",
);
const logistics = __personnelPoliciesInternals.logisticsSnapshot(null);
ok(
  logistics.impact.logisticsStatus === "NOT_AVAILABLE" &&
    logistics.violations.includes("LOGISTICS_PLAN_REQUIRED"),
  "ausencia de Motor falla explícita",
);
console.log(`V17-PERSONNEL-POLICIES-CONTRACT ${checks}/${checks}`);
