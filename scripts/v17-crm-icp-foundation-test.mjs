import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import {
  CRM_ICP_V2_CONTRACT,
  buildCrmIcpClientSearchPlan,
  buildCrmIcpV2AtomicPlan,
  hashCrmIcpV2Payload,
  normalizeCrmIcpClientSearchInput,
  normalizeCrmIcpV2CreateInput,
  normalizeCrmIcpV2UnsignedInput,
  requireCrmIcpSearchAuthority,
  toCrmIcpClientSearchResult,
} from "../api/_lib/crmIcpV2Domain.js";

const results = [];
function check(name, condition) {
  assert.equal(Boolean(condition), true, name);
  results.push({ name, passed: true });
}
function reject(name, code, action) {
  let error;
  try { action(); } catch (caught) { error = caught; }
  check(name, error?.code === code);
  return error;
}
function address(overrides = {}) {
  return {
    countryCode: "DO",
    provinceState: "Distrito Nacional",
    cityMunicipality: "Santo Domingo",
    sector: "Synthetic sector",
    streetAndNumber: "Synthetic street 1",
    buildingResidential: null,
    floorUnit: null,
    arrivalReference: null,
    locationContactName: null,
    locationContactPhone: null,
    ...overrides,
  };
}
function selection(overrides = {}) {
  return { kind: "NEW_ADDRESS", saveForClient: false, label: null, address: address(), ...overrides };
}
function unsigned(overrides = {}) {
  return {
    requestId: `icp-${randomUUID()}`,
    client: {
      kind: "INLINE",
      displayName: "Synthetic Client",
      taxId: "RNC-00001",
      phone: "+18095550101",
      email: "synthetic@example.invalid",
      duplicateConfirmation: null,
    },
    clientProfileType: "CORPORATE",
    caseContact: { displayName: "Synthetic Contact", phone: "+18095550102", email: null },
    mode: "LOCAL",
    serviceType: "LOCAL_MOVE",
    intakeChannel: "WHATSAPP",
    estimatedCbm: 12.5,
    requiresSurvey: true,
    surveyMethod: "PRESENCIAL",
    route: {
      destinationStatus: "CONFIRMED",
      origin: selection({ saveForClient: true, label: "Origen principal" }),
      destination: selection(),
      additionalStops: [],
    },
    ...overrides,
  };
}
function command(values = unsigned()) {
  const normalized = normalizeCrmIcpV2UnsignedInput(values);
  return normalizeCrmIcpV2CreateInput({ ...values, payloadHash: hashCrmIcpV2Payload(normalized) });
}
function authority(overrides = {}) {
  return {
    tenantCountryCode: "DO",
    pendingDestinationAuthorized: false,
    resolveAddress: () => null,
    resolveClient: () => true,
    duplicateAssessment: { exactTaxId: false, exactPhoneEmail: false, partialMatch: false, matchFingerprint: null },
    ...overrides,
  };
}

check("contrato permanece fundacional y no habilita API productiva", CRM_ICP_V2_CONTRACT.productionApiEnabled === false
  && CRM_ICP_V2_CONTRACT.routeContractVersion === 2 && CRM_ICP_V2_CONTRACT.maximumAdditionalStops === 8);

const local = command();
const localPlan = buildCrmIcpV2AtomicPlan(local, authority());
check("Client inline, caso, ruta, comando y auditoría comparten una transacción", localPlan.transaction === "CASE_CLIENT_ROUTE_COMMAND_AUDIT"
  && localPlan.client.action === "CREATE_INLINE" && localPlan.client.codeAuthority === "osi.next_icp_client_code"
  && localPlan.snapshots.length === 2 && localPlan.audit.inlineClient === true);
check("dirección reutilizable se registra sin sustituir el snapshot", localPlan.audit.reusableAddressCount === 1
  && localPlan.snapshots[0].saveForClient === true && localPlan.snapshots[0].sourceAddressRef === null);

const eightStops = Array.from({ length: 8 }, (_, index) => selection({ label: `Stop ${index + 1}` }));
const eightPlan = buildCrmIcpV2AtomicPlan(command(unsigned({ route: { ...unsigned().route, additionalStops: eightStops } })), authority());
check("ocho paradas adicionales ordenadas son aceptadas", eightPlan.audit.additionalStopCount === 8
  && eightPlan.snapshots.slice(2).every((item, index) => item.stopOrder === index + 1));
reject("nueve paradas adicionales son rechazadas", "CRM_ICP_ROUTE_INVALID", () => command(unsigned({
  route: { ...unsigned().route, additionalStops: [...eightStops, selection()] },
})));

const pending = command(unsigned({ route: { ...unsigned().route, destinationStatus: "PENDING", destination: null } }));
reject("destino pendiente exige autoridad explícita", "CRM_ICP_PENDING_DESTINATION_FORBIDDEN", () => buildCrmIcpV2AtomicPlan(pending, authority()));
const pendingPlan = buildCrmIcpV2AtomicPlan(pending, authority({ pendingDestinationAuthorized: true }));
check("destino pendiente autorizado sólo conserva origen", pendingPlan.snapshots.length === 1);
reject("EXPORT nunca acepta destino pendiente", "CRM_ICP_PENDING_DESTINATION_FORBIDDEN", () => buildCrmIcpV2AtomicPlan(
  command(unsigned({ mode: "EXPORT", route: { ...unsigned().route, destinationStatus: "PENDING", destination: null } })),
  authority({ pendingDestinationAuthorized: true }),
));

const exportCommand = command(unsigned({ mode: "EXPORT", route: {
  ...unsigned().route,
  destination: selection({ address: address({ countryCode: "US", provinceState: null, cityMunicipality: "Miami", streetAndNumber: null }) }),
} }));
check("EXPORT acepta origen completo y destino país/ciudad", buildCrmIcpV2AtomicPlan(exportCommand, authority()).snapshots.length === 2);

const importCommand = command(unsigned({ mode: "IMPORT", route: {
  ...unsigned().route,
  origin: selection({ address: address({ countryCode: "US", provinceState: null, cityMunicipality: "Miami", streetAndNumber: null }) }),
} }));
check("IMPORT acepta origen país/ciudad y destino local completo", buildCrmIcpV2AtomicPlan(importCommand, authority()).snapshots.length === 2);
reject("LOCAL rechaza origen incompleto", "CRM_ICP_ROUTE_INVALID", () => buildCrmIcpV2AtomicPlan(
  command(unsigned({ route: { ...unsigned().route, origin: selection({ address: address({ streetAndNumber: null }) }) } })), authority(),
));

const addressRef = randomUUID();
const selectedExistingAddress = command(unsigned({
  client: { kind: "EXISTING", clientRef: randomUUID() },
  route: { ...unsigned().route, origin: { kind: "CLIENT_ADDRESS", addressRef } },
}));
reject("dirección Client cross-tenant devuelve 404 sanitizado", "CRM_PIPELINE_RESOURCE_NOT_FOUND", () => buildCrmIcpV2AtomicPlan(
  selectedExistingAddress,
  authority({ resolveAddress: () => ({ addressRef, tenantMatched: false, active: true, address: address() }) }),
));
const selectedPlan = buildCrmIcpV2AtomicPlan(selectedExistingAddress, authority({
  resolveAddress: () => ({ addressRef, tenantMatched: true, active: true, address: address() }),
}));
check("addressRef tenant-first se copia como procedencia opcional", selectedPlan.snapshots[0].sourceAddressRef === addressRef);

reject("RNC exacto bloquea Client inline", "CRM_ICP_CLIENT_DUPLICATE", () => buildCrmIcpV2AtomicPlan(local, authority({
  duplicateAssessment: { exactTaxId: true, exactPhoneEmail: false, partialMatch: false, matchFingerprint: null },
})));
reject("teléfono y correo coincidentes bloquean Client inline", "CRM_ICP_CLIENT_DUPLICATE", () => buildCrmIcpV2AtomicPlan(local, authority({
  duplicateAssessment: { exactTaxId: false, exactPhoneEmail: true, partialMatch: false, matchFingerprint: null },
})));
const fingerprint = "a".repeat(64);
reject("coincidencia parcial exige confirmación auditada", "CRM_ICP_CLIENT_DUPLICATE_CONFIRMATION_REQUIRED", () => buildCrmIcpV2AtomicPlan(local, authority({
  duplicateAssessment: { exactTaxId: false, exactPhoneEmail: false, partialMatch: true, matchFingerprint: fingerprint },
})));
const partialValues = unsigned({ client: { ...unsigned().client, duplicateConfirmation: { confirmed: true, matchFingerprint: fingerprint } } });
const partialPlan = buildCrmIcpV2AtomicPlan(command(partialValues), authority({
  duplicateAssessment: { exactTaxId: false, exactPhoneEmail: false, partialMatch: true, matchFingerprint: fingerprint },
}));
check("confirmación parcial conserva fingerprint y exige auditoría", partialPlan.duplicate.auditRequired === true
  && partialPlan.audit.partialDuplicateConfirmed === true);

const invalidHashInput = unsigned();
reject("payloadHash siempre se recalcula canónicamente", "CRM_PIPELINE_PAYLOAD_HASH_INVALID", () => normalizeCrmIcpV2CreateInput({
  ...invalidHashInput, payloadHash: "0".repeat(64),
}));
const piiError = reject("errores no reproducen PII", "CRM_ICP_INPUT_INVALID", () => command(unsigned({
  caseContact: { ...unsigned().caseContact, phone: "private-phone-value" },
})));
check("mensaje de error es código estable sin PII", piiError.message === "CRM_ICP_INPUT_INVALID");

const search = normalizeCrmIcpClientSearchInput({ query: "synthetic@example.invalid", page: 1, pageSize: 20 });
check("búsqueda POST acepta término sólo en body y limita paginación", search.query.includes("@") && search.pageSize === 20);
reject("búsqueda rechaza propiedades desconocidas", "CRM_ICP_SEARCH_INVALID", () => normalizeCrmIcpClientSearchInput({
  query: "Synthetic", page: 1, pageSize: 20, tenantId: "forbidden",
}));
const auth = requireCrmIcpSearchAuthority({
  tenantId: "synthetic-tenant", userActive: true, membershipActive: true, tenantActive: true,
  role: "V", grantedPermissions: ["pipeline:view"], deniedPermissions: [],
});
check("A/V usan autoridad revalidada tenant-first", auth.allowed === true && auth.tenantId === "synthetic-tenant");
const searchPlan = buildCrmIcpClientSearchPlan({ query: "Synthetic", page: 2, pageSize: 20 }, {
  tenantId: "synthetic-tenant", userActive: true, membershipActive: true, tenantActive: true,
  role: "A", grantedPermissions: ["pipeline:view"], deniedPermissions: [],
});
check("plan de búsqueda es POST read-only, tenant-first y cubre cuatro autoridades", searchPlan.transport === "POST_SAME_ORIGIN_READ_ONLY"
  && searchPlan.tenantId === "synthetic-tenant" && searchPlan.skip === 20 && searchPlan.take === 20
  && searchPlan.matchFields.join(",") === "name,taxIdNormalized,normalizedPhone,normalizedEmail");
reject("deniedPermissions prevalece en búsqueda", "CRM_PIPELINE_PERMISSION_FORBIDDEN", () => requireCrmIcpSearchAuthority({
  tenantId: "synthetic-tenant", userActive: true, membershipActive: true, tenantActive: true,
  role: "A", grantedPermissions: ["pipeline:view"], deniedPermissions: ["pipeline:view"],
}));
const internalId = "internal-user-id-forbidden";
const publicResult = toCrmIcpClientSearchResult({
  publicRef: randomUUID(), displayName: "Synthetic Client", type: "CORPORATE", status: "ACTIVE",
  taxId: "RNC000012345", phone: "+18095550199", email: "private@example.invalid",
  userId: internalId,
});
const serialized = JSON.stringify(publicResult);
check("resultado de búsqueda es mínimo y enmascarado", Object.keys(publicResult).sort().join(",") === "clientRef,displayName,matchHints,status,type"
  && !serialized.includes("RNC000012345") && !serialized.includes("+18095550199")
  && !serialized.includes("private@example.invalid") && !serialized.includes(internalId));

process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
