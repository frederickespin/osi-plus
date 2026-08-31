import { createHash } from "node:crypto";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,190}$/;
const HASH = /^[0-9a-f]{64}$/;
const ISO_COUNTRY = /^[A-Z]{2}$/;
const NORMALIZED_PHONE = /^\+[1-9][0-9]{7,14}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MODES = new Set(["LOCAL", "EXPORT", "IMPORT"]);
const DESTINATION_STATUSES = new Set(["CONFIRMED", "APPROXIMATE", "PENDING"]);
const CLIENT_PROFILE_TYPES = new Set(["INDIVIDUAL", "CORPORATE", "LEAD_ACCOUNT", "COMMERCIAL", "DIPLOMATIC"]);
const CHANNELS = new Set([
  "WHATSAPP", "INSTAGRAM", "FACEBOOK", "RECOMMENDATION", "YOUTUBE", "OTHER_SOCIAL",
  "PROMOTION", "CALL", "EMAIL", "WEB", "REFERRED",
]);
const SURVEY_METHODS = new Set(["PRESENCIAL", "VIRTUAL", "LISTADO_FOTOS", "NO_APLICA"]);
const ROOT_FIELDS = new Set([
  "requestId", "payloadHash", "client", "clientProfileType", "caseContact", "mode", "serviceType",
  "intakeChannel", "estimatedCbm", "requiresSurvey", "surveyMethod", "route",
]);
const UNSIGNED_ROOT_FIELDS = new Set([...ROOT_FIELDS].filter((field) => field !== "payloadHash"));
const CONTACT_FIELDS = new Set(["displayName", "phone", "email"]);
const EXISTING_CLIENT_FIELDS = new Set(["kind", "clientRef"]);
const INLINE_CLIENT_FIELDS = new Set([
  "kind", "displayName", "taxId", "phone", "email", "duplicateConfirmation",
]);
const DUPLICATE_CONFIRMATION_FIELDS = new Set(["confirmed", "matchFingerprint"]);
const ROUTE_FIELDS = new Set(["destinationStatus", "origin", "destination", "additionalStops"]);
const ADDRESS_SELECTION_FIELDS = new Set(["kind", "addressRef"]);
const NEW_ADDRESS_SELECTION_FIELDS = new Set(["kind", "saveForClient", "label", "address"]);
const ADDRESS_FIELDS = new Set([
  "countryCode", "provinceState", "cityMunicipality", "sector", "streetAndNumber",
  "buildingResidential", "floorUnit", "arrivalReference", "locationContactName", "locationContactPhone",
]);
const SEARCH_FIELDS = new Set(["query", "page", "pageSize"]);
const PUBLIC_SEARCH_RESULT_FIELDS = new Set(["clientRef", "displayName", "type", "status", "matchHints"]);
const PUBLIC_SEARCH_HINT_FIELDS = new Set(["taxId", "phone", "email"]);

export class CrmIcpV2Error extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = "CrmIcpV2Error";
    this.code = code;
    this.status = status;
  }
}

function fail(code, status) { throw new CrmIcpV2Error(code, status); }
function exactObject(value, fields, code = "CRM_ICP_INPUT_INVALID") {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code, 400);
  const keys = Object.keys(value);
  if (keys.length !== fields.size || keys.some((key) => !fields.has(key))) fail(code, 400);
}
function optionalExactObject(value, fields, code = "CRM_ICP_INPUT_INVALID") {
  if (value === null || value === undefined) return null;
  exactObject(value, fields, code);
  return value;
}
function cleanText(value, { min = 1, max, optional = false } = {}) {
  if ((value === null || value === undefined || value === "") && optional) return null;
  if (typeof value !== "string" || value !== value.trim() || value !== value.normalize("NFC")
    || value.length < min || value.length > max || /[\u0000-\u001f\u007f\ufeff]/u.test(value)) {
    fail("CRM_ICP_INPUT_INVALID", 400);
  }
  return value;
}
function enumValue(value, allowed) {
  const normalized = cleanText(value, { max: 80 });
  if (!allowed.has(normalized)) fail("CRM_ICP_INPUT_INVALID", 400);
  return normalized;
}
function boolean(value) {
  if (typeof value !== "boolean") fail("CRM_ICP_INPUT_INVALID", 400);
  return value;
}
function nonNegativeNumber(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1_000_000) {
    fail("CRM_ICP_INPUT_INVALID", 400);
  }
  return value;
}
function positiveInteger(value, max) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) fail("CRM_ICP_INPUT_INVALID", 400);
  return value;
}
function publicRef(value) {
  if (typeof value !== "string" || !UUID_V4.test(value)) fail("CRM_PIPELINE_RESOURCE_NOT_FOUND", 404);
  return value;
}
function requestId(value) {
  const normalized = cleanText(value, { min: 8, max: 191 });
  if (!REQUEST_ID.test(normalized)) fail("CRM_ICP_INPUT_INVALID", 400);
  return normalized;
}
function normalizePhone(value, optional = false) {
  if ((value === null || value === undefined || value === "") && optional) return Object.freeze({ display: null, normalized: null });
  const display = cleanText(value, { min: 8, max: 40 });
  const digits = display.replace(/[^0-9+]/g, "");
  const normalized = digits.startsWith("+") ? `+${digits.slice(1).replace(/\D/g, "")}` : null;
  if (!normalized || !NORMALIZED_PHONE.test(normalized)) fail("CRM_ICP_INPUT_INVALID", 400);
  return Object.freeze({ display, normalized });
}
function normalizeEmail(value, optional = true) {
  if ((value === null || value === undefined || value === "") && optional) return Object.freeze({ display: null, normalized: null });
  const display = cleanText(value, { min: 3, max: 320 });
  const normalized = display.toLowerCase();
  if (!EMAIL.test(normalized)) fail("CRM_ICP_INPUT_INVALID", 400);
  return Object.freeze({ display, normalized });
}
function normalizeTaxId(value) {
  if (value === null || value === undefined || value === "") return null;
  const display = cleanText(value, { min: 5, max: 48 });
  const normalized = display.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (normalized.length < 5 || normalized.length > 32) fail("CRM_ICP_INPUT_INVALID", 400);
  return Object.freeze({ display, normalized });
}
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}
export function hashCrmIcpV2Payload(value) {
  return createHash("sha256").update(canonical(value), "utf8").digest("hex");
}

function normalizeContact(input) {
  exactObject(input, CONTACT_FIELDS);
  const phone = normalizePhone(input.phone);
  const email = normalizeEmail(input.email);
  return Object.freeze({
    displayName: cleanText(input.displayName, { min: 2, max: 160 }),
    phone: phone.display,
    phoneNormalized: phone.normalized,
    email: email.display,
    emailNormalized: email.normalized,
  });
}

function normalizeDuplicateConfirmation(value) {
  if (value === null || value === undefined) return null;
  exactObject(value, DUPLICATE_CONFIRMATION_FIELDS);
  if (value.confirmed !== true || typeof value.matchFingerprint !== "string" || !HASH.test(value.matchFingerprint)) {
    fail("CRM_ICP_DUPLICATE_CONFIRMATION_INVALID", 409);
  }
  return Object.freeze({ confirmed: true, matchFingerprint: value.matchFingerprint });
}

function normalizeClient(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("CRM_ICP_INPUT_INVALID", 400);
  if (input.kind === "EXISTING") {
    exactObject(input, EXISTING_CLIENT_FIELDS);
    return Object.freeze({ kind: "EXISTING", clientRef: publicRef(input.clientRef) });
  }
  if (input.kind === "INLINE") {
    exactObject(input, INLINE_CLIENT_FIELDS);
    const phone = normalizePhone(input.phone);
    const email = normalizeEmail(input.email);
    return Object.freeze({
      kind: "INLINE",
      displayName: cleanText(input.displayName, { min: 2, max: 200 }),
      taxId: normalizeTaxId(input.taxId),
      phone: phone.display,
      phoneNormalized: phone.normalized,
      email: email.display,
      emailNormalized: email.normalized,
      duplicateConfirmation: normalizeDuplicateConfirmation(input.duplicateConfirmation),
    });
  }
  fail("CRM_ICP_INPUT_INVALID", 400);
}

function normalizeAddress(input) {
  exactObject(input, ADDRESS_FIELDS);
  const phone = normalizePhone(input.locationContactPhone, true);
  const countryCode = cleanText(input.countryCode, { min: 2, max: 2 });
  if (!ISO_COUNTRY.test(countryCode)) fail("CRM_ICP_INPUT_INVALID", 400);
  return Object.freeze({
    countryCode,
    provinceState: cleanText(input.provinceState, { max: 160, optional: true }),
    cityMunicipality: cleanText(input.cityMunicipality, { max: 160 }),
    sector: cleanText(input.sector, { max: 160, optional: true }),
    streetAndNumber: cleanText(input.streetAndNumber, { max: 240, optional: true }),
    buildingResidential: cleanText(input.buildingResidential, { max: 160, optional: true }),
    floorUnit: cleanText(input.floorUnit, { max: 80, optional: true }),
    arrivalReference: cleanText(input.arrivalReference, { max: 320, optional: true }),
    locationContactName: cleanText(input.locationContactName, { max: 160, optional: true }),
    locationContactPhone: phone.normalized,
  });
}

function normalizeAddressSelection(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("CRM_ICP_INPUT_INVALID", 400);
  if (input.kind === "CLIENT_ADDRESS") {
    exactObject(input, ADDRESS_SELECTION_FIELDS);
    return Object.freeze({ kind: "CLIENT_ADDRESS", addressRef: publicRef(input.addressRef) });
  }
  if (input.kind === "NEW_ADDRESS") {
    exactObject(input, NEW_ADDRESS_SELECTION_FIELDS);
    return Object.freeze({
      kind: "NEW_ADDRESS",
      saveForClient: boolean(input.saveForClient),
      label: cleanText(input.label, { max: 80, optional: true }),
      address: normalizeAddress(input.address),
    });
  }
  fail("CRM_ICP_INPUT_INVALID", 400);
}

function normalizeRoute(input) {
  exactObject(input, ROUTE_FIELDS);
  const destinationStatus = enumValue(input.destinationStatus, DESTINATION_STATUSES);
  const destination = input.destination === null ? null : normalizeAddressSelection(input.destination);
  if (!Array.isArray(input.additionalStops) || input.additionalStops.length > 8) fail("CRM_ICP_ROUTE_INVALID", 400);
  const additionalStops = input.additionalStops.map((item, index) => Object.freeze({
    order: index + 1,
    selection: normalizeAddressSelection(item),
  }));
  if ((destinationStatus === "PENDING") !== (destination === null)) fail("CRM_ICP_ROUTE_INVALID", 400);
  return Object.freeze({
    destinationStatus,
    origin: normalizeAddressSelection(input.origin),
    destination,
    additionalStops: Object.freeze(additionalStops),
  });
}

export function normalizeCrmIcpV2UnsignedInput(input) {
  exactObject(input, UNSIGNED_ROOT_FIELDS);
  const normalized = Object.freeze({
    operation: "CREATE_ICP_V2",
    requestId: requestId(input.requestId),
    client: normalizeClient(input.client),
    clientProfileType: enumValue(input.clientProfileType, CLIENT_PROFILE_TYPES),
    caseContact: normalizeContact(input.caseContact),
    mode: enumValue(input.mode, MODES),
    serviceType: cleanText(input.serviceType, { min: 2, max: 80 }),
    intakeChannel: enumValue(input.intakeChannel, CHANNELS),
    estimatedCbm: nonNegativeNumber(input.estimatedCbm),
    requiresSurvey: boolean(input.requiresSurvey),
    surveyMethod: enumValue(input.surveyMethod, SURVEY_METHODS),
    route: normalizeRoute(input.route),
  });
  if ((normalized.requiresSurvey && normalized.surveyMethod === "NO_APLICA")
    || (!normalized.requiresSurvey && normalized.surveyMethod !== "NO_APLICA")) {
    fail("CRM_ICP_SURVEY_INVALID", 400);
  }
  return normalized;
}

export function normalizeCrmIcpV2CreateInput(input) {
  exactObject(input, ROOT_FIELDS);
  const { payloadHash, ...unsignedInput } = input;
  const normalized = normalizeCrmIcpV2UnsignedInput(unsignedInput);
  if (typeof payloadHash !== "string" || !HASH.test(payloadHash)
    || payloadHash !== hashCrmIcpV2Payload(normalized)) {
    fail("CRM_PIPELINE_PAYLOAD_HASH_INVALID", 400);
  }
  return Object.freeze({ ...normalized, payloadHash });
}

function fullAddress(address) {
  return Boolean(address?.countryCode && address?.provinceState && address?.cityMunicipality && address?.streetAndNumber);
}
function minimumInternationalAddress(address) {
  return Boolean(address?.countryCode && address?.cityMunicipality);
}
function materialize(selection, authority) {
  if (!selection) return null;
  if (selection.kind === "NEW_ADDRESS") return Object.freeze({
    sourceAddressRef: null,
    saveForClient: selection.saveForClient,
    label: selection.label,
    ...selection.address,
  });
  const resolved = authority.resolveAddress(selection.addressRef);
  if (!resolved || resolved.addressRef !== selection.addressRef || resolved.tenantMatched !== true || resolved.active !== true) {
    fail("CRM_PIPELINE_RESOURCE_NOT_FOUND", 404);
  }
  return Object.freeze({ sourceAddressRef: selection.addressRef, saveForClient: false, label: null, ...normalizeAddress(resolved.address) });
}

export function classifyIcpInlineClientDuplicate(assessment, confirmation) {
  exactObject(assessment, new Set(["exactTaxId", "exactPhoneEmail", "partialMatch", "matchFingerprint"]));
  if (assessment.exactTaxId === true) fail("CRM_ICP_CLIENT_DUPLICATE", 409);
  if (assessment.exactPhoneEmail === true) fail("CRM_ICP_CLIENT_DUPLICATE", 409);
  if (assessment.partialMatch !== true) return Object.freeze({ result: "CLEAR", auditRequired: false });
  if (typeof assessment.matchFingerprint !== "string" || !HASH.test(assessment.matchFingerprint)
    || confirmation?.confirmed !== true || confirmation.matchFingerprint !== assessment.matchFingerprint) {
    fail("CRM_ICP_CLIENT_DUPLICATE_CONFIRMATION_REQUIRED", 409);
  }
  return Object.freeze({ result: "PARTIAL_CONFIRMED", auditRequired: true, matchFingerprint: assessment.matchFingerprint });
}

export function buildCrmIcpV2AtomicPlan(command, authority) {
  if (!command || command.operation !== "CREATE_ICP_V2" || !authority || typeof authority.resolveAddress !== "function") {
    fail("CRM_ICP_AUTHORITY_INVALID", 503);
  }
  const tenantCountryCode = cleanText(authority.tenantCountryCode, { min: 2, max: 2 });
  if (!ISO_COUNTRY.test(tenantCountryCode)) fail("CRM_ICP_AUTHORITY_INVALID", 503);
  const origin = materialize(command.route.origin, authority);
  const destination = materialize(command.route.destination, authority);
  const stops = command.route.additionalStops.map((item) => Object.freeze({
    role: "ADDITIONAL_STOP",
    stopOrder: item.order,
    ...materialize(item.selection, authority),
  }));
  if (stops.some((item) => !fullAddress(item))) fail("CRM_ICP_ROUTE_INVALID", 400);

  if (command.route.destinationStatus === "PENDING") {
    if (command.mode !== "LOCAL" || authority.pendingDestinationAuthorized !== true || destination !== null) {
      fail("CRM_ICP_PENDING_DESTINATION_FORBIDDEN", 403);
    }
  } else if (!destination) fail("CRM_ICP_ROUTE_INVALID", 400);

  if (command.mode === "LOCAL") {
    if (!fullAddress(origin) || origin.countryCode !== tenantCountryCode
      || (destination && (!fullAddress(destination) || destination.countryCode !== tenantCountryCode))) {
      fail("CRM_ICP_ROUTE_INVALID", 400);
    }
  } else if (command.mode === "EXPORT") {
    if (command.route.destinationStatus === "PENDING" || !fullAddress(origin)
      || origin.countryCode !== tenantCountryCode || !minimumInternationalAddress(destination)) {
      fail("CRM_ICP_ROUTE_INVALID", 400);
    }
  } else if (command.mode === "IMPORT") {
    if (command.route.destinationStatus === "PENDING" || !minimumInternationalAddress(origin)
      || !fullAddress(destination) || destination.countryCode !== tenantCountryCode) {
      fail("CRM_ICP_ROUTE_INVALID", 400);
    }
  }

  let duplicate = Object.freeze({ result: "NOT_APPLICABLE", auditRequired: false });
  if (command.client.kind === "INLINE") {
    duplicate = classifyIcpInlineClientDuplicate(authority.duplicateAssessment, command.client.duplicateConfirmation);
  } else if (authority.resolveClient(command.client.clientRef) !== true) {
    fail("CRM_PIPELINE_RESOURCE_NOT_FOUND", 404);
  }

  const snapshots = Object.freeze([
    Object.freeze({ role: "ORIGIN", stopOrder: 0, ...origin }),
    ...(destination ? [Object.freeze({ role: "DESTINATION", stopOrder: 0, ...destination })] : []),
    ...stops,
  ]);
  return Object.freeze({
    transaction: "CASE_CLIENT_ROUTE_COMMAND_AUDIT",
    requestId: command.requestId,
    payloadHash: command.payloadHash,
    routeContractVersion: 2,
    nextRouteRevision: 1,
    client: command.client.kind === "INLINE"
      ? Object.freeze({ action: "CREATE_INLINE", codeAuthority: "osi.next_icp_client_code", ...command.client })
      : Object.freeze({ action: "LINK_EXISTING", clientRef: command.client.clientRef }),
    duplicate,
    snapshots,
    audit: Object.freeze({
      source: "CRM_ICP_V2",
      action: "CRM_PIPELINE_CASE_CREATED",
      routeSnapshotCount: snapshots.length,
      additionalStopCount: stops.length,
      inlineClient: command.client.kind === "INLINE",
      reusableAddressCount: snapshots.filter((item) => item.saveForClient).length,
      partialDuplicateConfirmed: duplicate.result === "PARTIAL_CONFIRMED",
    }),
  });
}

export function normalizeCrmIcpClientSearchInput(input) {
  exactObject(input, SEARCH_FIELDS, "CRM_ICP_SEARCH_INVALID");
  return Object.freeze({
    query: cleanText(input.query, { min: 2, max: 160 }),
    page: positiveInteger(input.page, 10_000),
    pageSize: positiveInteger(input.pageSize, 50),
  });
}

function maskTaxId(value) {
  const text = String(value || "");
  return text.length < 4 ? null : `${"•".repeat(Math.min(6, text.length - 4))}${text.slice(-4)}`;
}
function maskPhone(value) {
  const text = String(value || "");
  return text.length < 4 ? null : `••••${text.slice(-4)}`;
}
function maskEmail(value) {
  const text = String(value || "");
  const at = text.indexOf("@");
  if (at < 1) return null;
  return `${text[0]}•••@${text.slice(at + 1)}`;
}

export function toCrmIcpClientSearchResult(row) {
  const result = Object.freeze({
    clientRef: publicRef(row?.publicRef),
    displayName: cleanText(row?.displayName, { min: 1, max: 200 }),
    type: cleanText(row?.type, { min: 1, max: 80 }),
    status: cleanText(row?.status, { min: 1, max: 80 }),
    matchHints: Object.freeze({
      taxId: maskTaxId(row?.taxId),
      phone: maskPhone(row?.phone),
      email: maskEmail(row?.email),
    }),
  });
  exactObject(result, PUBLIC_SEARCH_RESULT_FIELDS);
  exactObject(result.matchHints, PUBLIC_SEARCH_HINT_FIELDS);
  return result;
}

export function requireCrmIcpSearchAuthority(context) {
  const active = context?.userActive === true && context?.membershipActive === true && context?.tenantActive === true;
  const role = String(context?.role || "").toUpperCase();
  const granted = new Set(Array.isArray(context?.grantedPermissions) ? context.grantedPermissions.map(String) : []);
  const denied = new Set(Array.isArray(context?.deniedPermissions) ? context.deniedPermissions.map(String) : []);
  if (!active || !new Set(["A", "V"]).has(role) || denied.has("pipeline:view") || !granted.has("pipeline:view")) {
    fail("CRM_PIPELINE_PERMISSION_FORBIDDEN", 403);
  }
  return Object.freeze({ allowed: true, tenantId: cleanText(context.tenantId, { max: 191 }) });
}

export function buildCrmIcpClientSearchPlan(input, context) {
  const search = normalizeCrmIcpClientSearchInput(input);
  const authority = requireCrmIcpSearchAuthority(context);
  return Object.freeze({
    transport: "POST_SAME_ORIGIN_READ_ONLY",
    tenantId: authority.tenantId,
    query: search.query,
    matchFields: Object.freeze(["name", "taxIdNormalized", "normalizedPhone", "normalizedEmail"]),
    skip: (search.page - 1) * search.pageSize,
    take: search.pageSize,
    response: "MINIMAL_MASKED",
  });
}

export const CRM_ICP_V2_CONTRACT = Object.freeze({
  routeContractVersion: 2,
  maximumAdditionalStops: 8,
  clientCodeAuthority: "osi.next_icp_client_code",
  inlineClientPersistence: "ATOMIC_WITH_CASE",
  searchTransport: "POST_SAME_ORIGIN_READ_ONLY",
  productionApiEnabled: false,
});
