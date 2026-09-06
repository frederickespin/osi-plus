import assert from "node:assert/strict";
import { buildCommercialQuoteSnapshot } from "../api/_lib/commercialRelationshipsDomain.js";
import { commercialPayloadHash, normalizeCaseCommercialContextPublish, normalizeCommissionAgreementPublish, normalizeCommercialEntityCreate, normalizeCommercialEntityUpdate, normalizeCommercialRelationshipCreate, normalizePricingAgreementPublish, requirePublishedPayer } from "../api/_lib/commercialRelationshipsContract.js";

const refs = ["10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000002", "10000000-0000-4000-8000-000000000003", "10000000-0000-4000-8000-000000000004"];
function signed(operation, requestId, body, caseRef) { return { requestId, payloadHash: commercialPayloadHash(caseRef ? { operation, requestId, caseRef, ...body } : { operation, requestId, ...body }), ...body }; }
function rejects(fn, code) { assert.throws(fn, (error) => error.code === code); }

const entityBody = { code: "ENTITY_001", displayName: "Entidad sintética", legalName: null, kind: "COMPANY", clientRef: null, countryCode: "DO", taxReference: null, validFrom: null, validTo: null };
assert.equal(normalizeCommercialEntityCreate(signed("ENTITY_CREATE", "entity-1", entityBody)).kind, "COMPANY");
rejects(() => normalizeCommercialEntityCreate(signed("ENTITY_CREATE", "entity-2", { ...entityBody, tenantId: "forbidden" })), "COMMERCIAL_RELATIONSHIPS_INPUT_INVALID");
const entityUpdate = { entityRef: refs[0], expectedVersion: 1, displayName: "Entidad sintética editada", legalName: null, countryCode: "DO", taxReference: null, status: "ACTIVE", validFrom: null, validTo: null };
assert.equal(normalizeCommercialEntityUpdate(signed("ENTITY_UPDATE", "entity-update-1", entityUpdate)).expectedVersion, 1);
rejects(() => normalizeCommercialEntityUpdate(signed("ENTITY_UPDATE", "entity-update-2", { ...entityUpdate, kind: "COMPANY" })), "COMMERCIAL_RELATIONSHIPS_INPUT_INVALID");

const relationshipBody = { sourceEntityRef: refs[0], targetEntityRef: refs[1], type: "BOOKER", reference: "BOOK-1", conditions: {}, metadata: {}, validFrom: "2026-09-01T00:00:00.000Z", validTo: null };
assert.equal(normalizeCommercialRelationshipCreate(signed("RELATIONSHIP_CREATE", "relation-1", relationshipBody)).type, "BOOKER");
rejects(() => normalizeCommercialRelationshipCreate(signed("RELATIONSHIP_CREATE", "relation-2", { ...relationshipBody, targetEntityRef: refs[0] })), "COMMERCIAL_RELATIONSHIPS_INPUT_INVALID");

const pricingBody = { seriesRef: null, expectedVersion: 0, entityRef: refs[0], relationshipRef: null, tariffRef: refs[1], serviceScope: { serviceRefs: [] }, modeScope: ["LOCAL"], conditions: {}, administrativeTerms: {}, adjustments: [{ kind: "DISCOUNT", calculationType: "PERCENTAGE", value: 8, base: "SELLING_PRICE", reasonCode: "AGREEMENT", approvalRef: null, validFrom: null, validTo: null }], validFrom: null, validTo: null };
assert.equal(normalizePricingAgreementPublish(signed("PRICING_AGREEMENT_PUBLISH", "pricing-1", pricingBody)).adjustments.length, 1);
rejects(() => normalizePricingAgreementPublish(signed("PRICING_AGREEMENT_PUBLISH", "pricing-2", { ...pricingBody, relationshipRef: refs[2] })), "COMMERCIAL_RELATIONSHIPS_INPUT_INVALID");

const commissionBody = { seriesRef: null, expectedVersion: 0, beneficiaryEntityRef: refs[0], referralAgreementRef: null, kind: "INTERNAL", calculationType: "POLICY", value: 0, currency: null, basisPolicy: { basis: "PROFIT" }, serviceScope: {}, validFrom: null, validTo: null };
assert.equal(normalizeCommissionAgreementPublish(signed("COMMISSION_AGREEMENT_PUBLISH", "commission-1", commissionBody)).kind, "INTERNAL");
rejects(() => normalizeCommissionAgreementPublish(signed("COMMISSION_AGREEMENT_PUBLISH", "commission-2", { ...commissionBody, kind: "EXTERNAL_REFERRAL" })), "COMMERCIAL_RELATIONSHIPS_INPUT_INVALID");

const caseBody = { seriesRef: null, expectedVersion: 0, parties: [{ role: "COMPANY", entityRef: refs[0], relationshipRef: refs[2] }, { role: "PAYER", entityRef: refs[1], relationshipRef: refs[3] }], pricingAgreementRef: refs[2], referralAgreementRef: null };
assert.equal(normalizeCaseCommercialContextPublish(signed("CASE_CONTEXT_PUBLISH", "context-1", caseBody, refs[0]), refs[0]).parties.length, 2);
rejects(() => normalizeCaseCommercialContextPublish(signed("CASE_CONTEXT_PUBLISH", "context-2", { ...caseBody, parties: [...caseBody.parties, caseBody.parties[1]] }, refs[0]), refs[0]), "COMMERCIAL_RELATIONSHIPS_INPUT_INVALID");

const quoteSnapshot = buildCommercialQuoteSnapshot({ contextRef: refs[0], state: "PUBLISHED", logicalSha256: "a".repeat(64), associationsSnapshot: [], instructionsSnapshot: [], pricingAgreement: { agreementRef: refs[1] }, referralAgreement: null, parties: [{ role: "PAYER", entity: { entityRef: refs[2], displayName: "Pagador explícito", kind: "COMPANY" }, relationship: { relationshipRef: refs[3] } }, { role: "APPROVER", entity: { entityRef: refs[0], displayName: "Aprobador distinto", kind: "PERSON" }, relationship: null }] });
assert.equal(quoteSnapshot.payerRef, refs[2]); assert.notEqual(quoteSnapshot.payerRef, quoteSnapshot.parties.find((row) => row.role === "APPROVER").entityRef);
rejects(() => requirePublishedPayer([{ role: "BOOKER" }]), "COMMERCIAL_PAYER_REQUIRED");
console.log(JSON.stringify({ ok: true, assertions: 13, boundaries: ["payer-explicit", "booker-independent", "versioned-pricing", "internal-vs-referral"] }));
