import { createHash } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const CODE = /^[A-Z][A-Z0-9_-]{0,63}$/;
const ENTITY_KINDS = new Set(["PERSON", "COMPANY", "ORGANIZATION", "AGENT", "LEAD_ACCOUNT", "SUPPLIER", "REFERRER", "THIRD_PARTY", "ASSOCIATION"]);
const RELATIONSHIP_TYPES = new Set(["EMPLOYED_BY", "LEAD_ACCOUNT", "BOOKER", "PAYER", "APPROVER", "REFERRER", "AGENT", "SUPPLIER", "ASSOCIATED_WITH"]);
const PARTY_ROLES = new Set(["COMPANY", "LEAD_ACCOUNT", "BOOKER", "PAYER", "APPROVER", "REFERRER", "AGENT", "SUPPLIER"]);
const CALCULATION_TYPES = new Set(["PERCENTAGE", "FIXED_AMOUNT", "POLICY"]);

export class CommercialRelationshipsError extends Error {
  constructor(code, status = 400) { super(code); this.name = "CommercialRelationshipsError"; this.code = code; this.status = status; }
}
export function commercialFail(code, status = 400) { throw new CommercialRelationshipsError(code, status); }
export function canonicalCommercialJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalCommercialJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalCommercialJson(value[key])}`).join(",")}}`;
}
export function commercialPayloadHash(value) { return createHash("sha256").update(canonicalCommercialJson(value), "utf8").digest("hex"); }
function object(value) { if (!value || typeof value !== "object" || Array.isArray(value)) commercialFail("COMMERCIAL_RELATIONSHIPS_INPUT_INVALID"); return value; }
function exact(value, keys) { if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) commercialFail("COMMERCIAL_RELATIONSHIPS_INPUT_INVALID"); }
function text(value, max = 320, optional = false) { if (optional && (value === null || value === undefined || value === "")) return null; if (typeof value !== "string" || value !== value.trim() || value.length < 1 || value.length > max) commercialFail("COMMERCIAL_RELATIONSHIPS_INPUT_INVALID"); return value; }
function uuid(value) { const result = text(value, 36); if (!UUID.test(result)) commercialFail("COMMERCIAL_RELATIONSHIPS_NOT_FOUND", 404); return result; }
export function normalizeCommercialCaseRef(value) { return uuid(value); }
function integer(value, min = 1, max = 1_000_000) { if (!Number.isSafeInteger(value) || value < min || value > max) commercialFail("COMMERCIAL_RELATIONSHIPS_INPUT_INVALID"); return value; }
function enumValue(value, allowed) { const result = text(value, 80); if (!allowed.has(result)) commercialFail("COMMERCIAL_RELATIONSHIPS_INPUT_INVALID"); return result; }
function json(value) { return Object.freeze({ ...object(value) }); }
function instant(value, optional = true) { if (optional && (value === null || value === undefined)) return null; const result = text(value, 40); if (new Date(result).toISOString() !== result) commercialFail("COMMERCIAL_RELATIONSHIPS_INPUT_INVALID"); return result; }
function period(validFrom, validTo) { const from = instant(validFrom); const to = instant(validTo); if (from && to && new Date(to) <= new Date(from)) commercialFail("COMMERCIAL_RELATIONSHIPS_PERIOD_INVALID"); return { validFrom: from, validTo: to }; }
function command(value, operation, payload) { const requestId = text(value.requestId, 191); const payloadHash = text(value.payloadHash, 64); const body = Object.fromEntries(Object.entries(value).filter(([key]) => !["requestId", "payloadHash"].includes(key))); const computed = commercialPayloadHash({ operation, requestId, ...body }); if (!SHA.test(payloadHash) || payloadHash !== computed) commercialFail("COMMERCIAL_RELATIONSHIPS_PAYLOAD_HASH_MISMATCH"); return Object.freeze({ operation, requestId, payloadHash, ...payload }); }
function amount(value, calculationType) { if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (calculationType === "PERCENTAGE" && value > 100)) commercialFail("COMMERCIAL_RELATIONSHIPS_INPUT_INVALID"); return value; }

export function normalizeCommercialEntityCreate(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "code", "displayName", "legalName", "kind", "clientRef", "countryCode", "taxReference", "validFrom", "validTo"]); const dates = period(value.validFrom, value.validTo);
  const code = text(value.code, 64); if (!CODE.test(code)) commercialFail("COMMERCIAL_RELATIONSHIPS_INPUT_INVALID");
  const countryCode = text(value.countryCode, 2, true); if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) commercialFail("COMMERCIAL_RELATIONSHIPS_INPUT_INVALID");
  return command(value, "ENTITY_CREATE", { code, displayName: text(value.displayName, 200), legalName: text(value.legalName, 240, true), kind: enumValue(value.kind, ENTITY_KINDS), clientRef: value.clientRef ? uuid(value.clientRef) : null, countryCode, taxReference: text(value.taxReference, 64, true), ...dates });
}

export function normalizeCommercialEntityUpdate(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "entityRef", "expectedVersion", "displayName", "legalName", "countryCode", "taxReference", "status", "validFrom", "validTo"]); const dates = period(value.validFrom, value.validTo);
  const countryCode = text(value.countryCode, 2, true); if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) commercialFail("COMMERCIAL_RELATIONSHIPS_INPUT_INVALID");
  return command(value, "ENTITY_UPDATE", { entityRef: uuid(value.entityRef), expectedVersion: integer(value.expectedVersion), displayName: text(value.displayName, 200), legalName: text(value.legalName, 240, true), countryCode, taxReference: text(value.taxReference, 64, true), status: enumValue(value.status, new Set(["ACTIVE", "INACTIVE"])), ...dates });
}

export function normalizeCommercialRelationshipCreate(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "sourceEntityRef", "targetEntityRef", "type", "reference", "conditions", "metadata", "validFrom", "validTo"]); const dates = period(value.validFrom, value.validTo);
  const sourceEntityRef = uuid(value.sourceEntityRef); const targetEntityRef = uuid(value.targetEntityRef); if (sourceEntityRef === targetEntityRef) commercialFail("COMMERCIAL_RELATIONSHIPS_INPUT_INVALID");
  return command(value, "RELATIONSHIP_CREATE", { sourceEntityRef, targetEntityRef, type: enumValue(value.type, RELATIONSHIP_TYPES), reference: text(value.reference, 120, true), conditions: json(value.conditions), metadata: json(value.metadata), ...dates });
}

export function normalizeCommercialTariffPublish(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "seriesRef", "expectedVersion", "code", "name", "currency", "scope", "rateDefinition", "validFrom", "validTo"]); const dates = period(value.validFrom, value.validTo); const currency = text(value.currency, 3); if (!/^[A-Z]{3}$/.test(currency)) commercialFail("COMMERCIAL_RELATIONSHIPS_INPUT_INVALID");
  return command(value, "TARIFF_PUBLISH", { seriesRef: value.seriesRef ? uuid(value.seriesRef) : null, expectedVersion: integer(value.expectedVersion, 0), code: text(value.code, 64), name: text(value.name, 160), currency, scope: json(value.scope), rateDefinition: json(value.rateDefinition), ...dates });
}

export function normalizePricingAgreementPublish(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "seriesRef", "expectedVersion", "entityRef", "relationshipRef", "tariffRef", "serviceScope", "modeScope", "conditions", "administrativeTerms", "adjustments", "validFrom", "validTo"]); const dates = period(value.validFrom, value.validTo); const entityRef = value.entityRef ? uuid(value.entityRef) : null; const relationshipRef = value.relationshipRef ? uuid(value.relationshipRef) : null; if (Number(Boolean(entityRef)) + Number(Boolean(relationshipRef)) !== 1 || !Array.isArray(value.modeScope) || !Array.isArray(value.adjustments)) commercialFail("COMMERCIAL_RELATIONSHIPS_INPUT_INVALID");
  const adjustments = value.adjustments.map((entry) => { const row = object(entry); exact(row, ["kind", "calculationType", "value", "base", "reasonCode", "approvalRef", "validFrom", "validTo"]); const calculationType = enumValue(row.calculationType, CALCULATION_TYPES); return Object.freeze({ kind: enumValue(row.kind, new Set(["DISCOUNT", "ADMINISTRATIVE_CHARGE"])), calculationType, value: amount(row.value, calculationType), base: text(row.base, 80), reasonCode: text(row.reasonCode, 80), approvalRef: row.approvalRef ? uuid(row.approvalRef) : null, ...period(row.validFrom, row.validTo) }); });
  return command(value, "PRICING_AGREEMENT_PUBLISH", { seriesRef: value.seriesRef ? uuid(value.seriesRef) : null, expectedVersion: integer(value.expectedVersion, 0), entityRef, relationshipRef, tariffRef: uuid(value.tariffRef), serviceScope: json(value.serviceScope), modeScope: Object.freeze(value.modeScope.map((entry) => text(entry, 32))), conditions: json(value.conditions), administrativeTerms: json(value.administrativeTerms), adjustments: Object.freeze(adjustments), ...dates });
}

export function normalizeReferralAgreementPublish(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "seriesRef", "expectedVersion", "referrerEntityRef", "calculationType", "value", "currency", "basisPolicy", "serviceScope", "authorizationRef", "reference", "validFrom", "validTo"]); const calculationType = enumValue(value.calculationType, CALCULATION_TYPES); const currency = text(value.currency, 3, true); if ((calculationType === "FIXED_AMOUNT") !== Boolean(currency) || (currency && !/^[A-Z]{3}$/.test(currency))) commercialFail("COMMERCIAL_RELATIONSHIPS_INPUT_INVALID");
  return command(value, "REFERRAL_AGREEMENT_PUBLISH", { seriesRef: value.seriesRef ? uuid(value.seriesRef) : null, expectedVersion: integer(value.expectedVersion, 0), referrerEntityRef: uuid(value.referrerEntityRef), calculationType, value: amount(value.value, calculationType), currency, basisPolicy: json(value.basisPolicy), serviceScope: json(value.serviceScope), authorizationRef: value.authorizationRef ? uuid(value.authorizationRef) : null, reference: text(value.reference, 120), ...period(value.validFrom, value.validTo) });
}

export function normalizeCommissionAgreementPublish(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "seriesRef", "expectedVersion", "beneficiaryEntityRef", "referralAgreementRef", "kind", "calculationType", "value", "currency", "basisPolicy", "serviceScope", "validFrom", "validTo"]); const kind = enumValue(value.kind, new Set(["INTERNAL", "EXTERNAL_REFERRAL"])); const referralAgreementRef = value.referralAgreementRef ? uuid(value.referralAgreementRef) : null; if ((kind === "EXTERNAL_REFERRAL") !== Boolean(referralAgreementRef)) commercialFail("COMMERCIAL_RELATIONSHIPS_INPUT_INVALID"); const calculationType = enumValue(value.calculationType, CALCULATION_TYPES); const currency = text(value.currency, 3, true); if ((calculationType === "FIXED_AMOUNT") !== Boolean(currency)) commercialFail("COMMERCIAL_RELATIONSHIPS_INPUT_INVALID");
  return command(value, "COMMISSION_AGREEMENT_PUBLISH", { seriesRef: value.seriesRef ? uuid(value.seriesRef) : null, expectedVersion: integer(value.expectedVersion, 0), beneficiaryEntityRef: uuid(value.beneficiaryEntityRef), referralAgreementRef, kind, calculationType, value: amount(value.value, calculationType), currency, basisPolicy: json(value.basisPolicy), serviceScope: json(value.serviceScope), ...period(value.validFrom, value.validTo) });
}

export function normalizeCaseCommercialContextPublish(input, caseRef) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "seriesRef", "expectedVersion", "parties", "pricingAgreementRef", "referralAgreementRef"]); if (!Array.isArray(value.parties) || value.parties.length > PARTY_ROLES.size) commercialFail("COMMERCIAL_RELATIONSHIPS_INPUT_INVALID");
  const roles = new Set(); const parties = value.parties.map((entry) => { const row = object(entry); exact(row, ["role", "entityRef", "relationshipRef"]); const role = enumValue(row.role, PARTY_ROLES); if (roles.has(role)) commercialFail("COMMERCIAL_RELATIONSHIPS_INPUT_INVALID"); roles.add(role); return Object.freeze({ role, entityRef: uuid(row.entityRef), relationshipRef: row.relationshipRef ? uuid(row.relationshipRef) : null }); });
  const normalizedCaseRef = uuid(caseRef); const requestId = text(value.requestId, 191); const payloadHash = text(value.payloadHash, 64); const body = Object.fromEntries(Object.entries(value).filter(([key]) => !["requestId", "payloadHash"].includes(key))); if (!SHA.test(payloadHash) || payloadHash !== commercialPayloadHash({ operation: "CASE_CONTEXT_PUBLISH", requestId, caseRef: normalizedCaseRef, ...body })) commercialFail("COMMERCIAL_RELATIONSHIPS_PAYLOAD_HASH_MISMATCH");
  return Object.freeze({ operation: "CASE_CONTEXT_PUBLISH", requestId, payloadHash, caseRef: normalizedCaseRef, seriesRef: value.seriesRef ? uuid(value.seriesRef) : null, expectedVersion: integer(value.expectedVersion, 0), parties: Object.freeze(parties), pricingAgreementRef: value.pricingAgreementRef ? uuid(value.pricingAgreementRef) : null, referralAgreementRef: value.referralAgreementRef ? uuid(value.referralAgreementRef) : null });
}

export function normalizeCommercialContactCreate(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "entityRef", "displayName", "position", "email", "phone", "preferredChannel", "validFrom", "validTo"]);
  return command(value, "CONTACT_CREATE", { entityRef: uuid(value.entityRef), displayName: text(value.displayName, 160), position: text(value.position, 120, true), email: text(value.email, 320, true)?.toLowerCase() || null, phone: text(value.phone, 32, true), preferredChannel: text(value.preferredChannel, 32, true), ...period(value.validFrom, value.validTo) });
}

export function normalizeAssociationMembershipCreate(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "memberEntityRef", "associationEntityRef", "membershipNumber", "validFrom", "validTo"]); const memberEntityRef = uuid(value.memberEntityRef); const associationEntityRef = uuid(value.associationEntityRef); if (memberEntityRef === associationEntityRef) commercialFail("COMMERCIAL_RELATIONSHIPS_INPUT_INVALID");
  return command(value, "ASSOCIATION_MEMBERSHIP_CREATE", { memberEntityRef, associationEntityRef, membershipNumber: text(value.membershipNumber, 120, true), ...period(value.validFrom, value.validTo) });
}

export function normalizeCertificationCreate(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "entityRef", "type", "issuer", "documentRef", "issuedAt", "expiresAt"]); const issuedAt = value.issuedAt ? text(value.issuedAt, 10) : null; const expiresAt = value.expiresAt ? text(value.expiresAt, 10) : null; if ((issuedAt && !/^\d{4}-\d{2}-\d{2}$/.test(issuedAt)) || (expiresAt && (!/^\d{4}-\d{2}-\d{2}$/.test(expiresAt) || (issuedAt && expiresAt <= issuedAt)))) commercialFail("COMMERCIAL_RELATIONSHIPS_INPUT_INVALID");
  return command(value, "CERTIFICATION_CREATE", { entityRef: uuid(value.entityRef), type: text(value.type, 120), issuer: text(value.issuer, 200), documentRef: value.documentRef ? uuid(value.documentRef) : null, issuedAt, expiresAt });
}

export function normalizeInstructionPublish(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "seriesRef", "expectedVersion", "entityRef", "relationshipRef", "category", "serviceScope", "content", "validFrom", "validTo"]); const entityRef = value.entityRef ? uuid(value.entityRef) : null; const relationshipRef = value.relationshipRef ? uuid(value.relationshipRef) : null; if (Number(Boolean(entityRef)) + Number(Boolean(relationshipRef)) !== 1) commercialFail("COMMERCIAL_RELATIONSHIPS_INPUT_INVALID");
  return command(value, "INSTRUCTION_PUBLISH", { seriesRef: value.seriesRef ? uuid(value.seriesRef) : null, expectedVersion: integer(value.expectedVersion, 0), entityRef, relationshipRef, category: text(value.category, 80), serviceScope: json(value.serviceScope), content: json(value.content), ...period(value.validFrom, value.validTo) });
}

export function requirePublishedPayer(parties) { const payer = parties.find((entry) => entry.role === "PAYER"); if (!payer) commercialFail("COMMERCIAL_PAYER_REQUIRED", 409); return payer; }
