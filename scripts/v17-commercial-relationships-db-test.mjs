import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { commercialPayloadHash } from "../api/_lib/commercialRelationshipsContract.js";
import {
  buildCommercialQuoteSnapshot,
  createAssociationMembership,
  createCommercialCertification,
  createCommercialContact,
  createCommercialEntity,
  createCommercialRelationship,
  getCaseCommercialContext,
  listCommercialEntities,
  publishCaseCommercialContext,
  publishCommissionAgreement,
  publishCommercialInstruction,
  publishCommercialTariff,
  publishPricingAgreement,
  publishReferralAgreement,
  resolveCommercialQuoteAuthority,
  updateCommercialEntity,
} from "../api/_lib/commercialRelationshipsDomain.js";

const target = new URL(process.env.V17_COMMERCIAL_RELATIONSHIPS_TEST_DATABASE_URL || process.env.DATABASE_URL || "");
if (!["127.0.0.1", "localhost"].includes(target.hostname) || target.port !== "55432" || target.searchParams.get("schema") !== "osi") throw new Error("V17_COMMERCIAL_RELATIONSHIPS_LOCAL_DATABASE_REQUIRED");
const prisma = new PrismaClient();
const permissions = ["commercial:relationships:view", "commercial:relationships:manage", "commercial:tariffs:view", "commercial:tariffs:manage", "commercial:referrals:view", "commercial:referrals:manage", "commercial:commissions:view", "commercial:commissions:manage", "commercial:associations:view", "commercial:associations:manage"];
function signed(operation, body, requestId = randomUUID(), caseRef) { return { requestId, payloadHash: commercialPayloadHash({ operation, requestId, ...(caseRef ? { caseRef } : {}), ...body }), ...body }; }
function entity(code, displayName, kind) { return { code, displayName, legalName: null, kind, clientRef: null, countryCode: "DO", taxReference: null, validFrom: null, validTo: null }; }

let assertions = 0;
try {
  const tenant = await prisma.tenant.create({ data: { code: "COMMERCIAL-REL-12A", name: "Tenant sintético 12A" } });
  const otherTenant = await prisma.tenant.create({ data: { code: "COMMERCIAL-REL-12A-X", name: "Tenant aislado 12A" } });
  const user = await prisma.user.create({ data: { code: "CR12A-A", name: "Actor sintético", email: "cr12a@example.invalid", phone: "0000000000", role: "A", status: "ACTIVE", joinDate: "2026-09-12", passwordHash: "SYNTHETIC_NOT_AUTHENTICATABLE" } });
  const membership = await prisma.tenantMembership.create({ data: { tenantId: tenant.id, userId: user.id, role: "A", grantedPermissions: permissions, isDefault: true } });
  const context = { tenantId: tenant.id, userId: user.id, membershipId: membership.id, role: "A", effectivePermissions: permissions, deniedPermissions: [] };
  const otherContext = { ...context, tenantId: otherTenant.id };
  const pipelineCase = await prisma.pipelineCase.create({ data: { tenantId: tenant.id, caseCode: "CR12A-CASE-001", clientName: null, mode: "LOCAL", serviceType: "MOVING", customerType: "L4_PERSONAL", ownerName: "Sin asignar", originLocation: "Origen sintético", destinationLocation: "Destino sintético" } });

  const definitions = [entity("COMPANY-001", "Empresa sintética", "COMPANY"), entity("LEAD-001", "Lead Account sintético", "LEAD_ACCOUNT"), entity("BOOKER-001", "Booker sintético", "PERSON"), entity("PAYER-001", "Pagador sintético", "ORGANIZATION"), entity("APPROVER-001", "Aprobador sintético", "PERSON"), entity("REFERRER-001", "Referidor sintético", "REFERRER"), entity("ASSOCIATION-001", "Asociación configurada", "ASSOCIATION")];
  const entities = [];
  for (const definition of definitions) entities.push(await createCommercialEntity(prisma, context, signed("ENTITY_CREATE", definition)));
  assert.equal(entities.length, 7); assertions += 1;
  const replayInput = signed("ENTITY_CREATE", entity("SUPPLIER-001", "Proveedor sintético", "SUPPLIER"));
  const firstSupplier = await createCommercialEntity(prisma, context, replayInput); const replaySupplier = await createCommercialEntity(prisma, context, replayInput);
  assert.equal(replaySupplier.entityRef, firstSupplier.entityRef); assertions += 1;
  const byCode = new Map([...entities, firstSupplier].map((row) => [row.code, row]));
  const companyUpdate = { entityRef: byCode.get("COMPANY-001").entityRef, expectedVersion: 1, displayName: "Empresa sintética editada", legalName: null, countryCode: "DO", taxReference: null, status: "ACTIVE", validFrom: null, validTo: null };
  const updatedCompany = await updateCommercialEntity(prisma, context, signed("ENTITY_UPDATE", companyUpdate));
  assert.equal(updatedCompany.version, 2); assert.equal(updatedCompany.displayName, "Empresa sintética editada"); assertions += 2;
  await assert.rejects(updateCommercialEntity(prisma, context, signed("ENTITY_UPDATE", companyUpdate)), /COMMERCIAL_RELATIONSHIPS_VERSION_CONFLICT/); assertions += 1;

  const relationInput = { sourceEntityRef: byCode.get("COMPANY-001").entityRef, targetEntityRef: byCode.get("PAYER-001").entityRef, type: "PAYER", reference: "PAY-EXPLICIT", conditions: {}, metadata: {}, validFrom: null, validTo: null };
  const payerRelationship = await createCommercialRelationship(prisma, context, signed("RELATIONSHIP_CREATE", relationInput));
  assert.equal(payerRelationship.type, "PAYER"); assertions += 1;
  await createCommercialRelationship(prisma, context, signed("RELATIONSHIP_CREATE", { ...relationInput, targetEntityRef: byCode.get("LEAD-001").entityRef, type: "LEAD_ACCOUNT", reference: null }));
  await createCommercialContact(prisma, context, signed("CONTACT_CREATE", { entityRef: byCode.get("BOOKER-001").entityRef, displayName: "Contacto sintético", position: "Booker", email: null, phone: null, preferredChannel: "MANUAL", validFrom: null, validTo: null }));

  const tariff = await publishCommercialTariff(prisma, context, signed("TARIFF_PUBLISH", { seriesRef: null, expectedVersion: 0, code: "MASTER-DO", name: "Tarifa de referencia", currency: "DOP", scope: { service: "MOVING" }, rateDefinition: { authority: "REFERENCE_ONLY" }, validFrom: null, validTo: null }));
  const pricing = await publishPricingAgreement(prisma, context, signed("PRICING_AGREEMENT_PUBLISH", { seriesRef: null, expectedVersion: 0, entityRef: byCode.get("LEAD-001").entityRef, relationshipRef: null, tariffRef: tariff.tariffRef, serviceScope: { service: "MOVING" }, modeScope: ["LOCAL"], conditions: { explicit: true }, administrativeTerms: { billing: "CONFIGURED" }, adjustments: [{ kind: "DISCOUNT", calculationType: "PERCENTAGE", value: 5, base: "QUOTED_SUBTOTAL", reasonCode: "ACCOUNT_AGREEMENT", approvalRef: null, validFrom: null, validTo: null }, { kind: "ADMINISTRATIVE_CHARGE", calculationType: "FIXED_AMOUNT", value: 100, base: "PROPOSAL", reasonCode: "ADMIN_FEE", approvalRef: null, validFrom: null, validTo: null }], validFrom: null, validTo: null }));
  assert.equal(pricing.adjustments.length, 2); assertions += 1;
  const referral = await publishReferralAgreement(prisma, context, signed("REFERRAL_AGREEMENT_PUBLISH", { seriesRef: null, expectedVersion: 0, referrerEntityRef: byCode.get("REFERRER-001").entityRef, calculationType: "PERCENTAGE", value: 3, currency: null, basisPolicy: { basis: "COLLECTED_AMOUNT" }, serviceScope: { service: "MOVING" }, authorizationRef: null, reference: "REF-EXPLICIT", validFrom: null, validTo: null }));
  const internalCommission = await publishCommissionAgreement(prisma, context, signed("COMMISSION_AGREEMENT_PUBLISH", { seriesRef: null, expectedVersion: 0, beneficiaryEntityRef: byCode.get("BOOKER-001").entityRef, referralAgreementRef: null, kind: "INTERNAL", calculationType: "POLICY", value: 0, currency: null, basisPolicy: { policy: "CONFIGURED_BY_SERVICE" }, serviceScope: { service: "MOVING" }, validFrom: null, validTo: null }));
  await publishCommissionAgreement(prisma, context, signed("COMMISSION_AGREEMENT_PUBLISH", { seriesRef: null, expectedVersion: 0, beneficiaryEntityRef: byCode.get("REFERRER-001").entityRef, referralAgreementRef: referral.referralAgreementRef, kind: "EXTERNAL_REFERRAL", calculationType: "PERCENTAGE", value: 3, currency: null, basisPolicy: { basis: "COLLECTED_AMOUNT" }, serviceScope: { service: "MOVING" }, validFrom: null, validTo: null }));
  const association = await createAssociationMembership(prisma, context, signed("ASSOCIATION_MEMBERSHIP_CREATE", { memberEntityRef: byCode.get("COMPANY-001").entityRef, associationEntityRef: byCode.get("ASSOCIATION-001").entityRef, membershipNumber: "MEMBER-SYNTHETIC", validFrom: null, validTo: null }));
  await createCommercialCertification(prisma, context, signed("CERTIFICATION_CREATE", { entityRef: byCode.get("COMPANY-001").entityRef, type: "QUALITY-SYNTHETIC", issuer: "Autoridad configurada", documentRef: null, issuedAt: "2026-01-01", expiresAt: "2027-01-01" }));
  await publishCommercialInstruction(prisma, context, signed("INSTRUCTION_PUBLISH", { seriesRef: null, expectedVersion: 0, entityRef: byCode.get("LEAD-001").entityRef, relationshipRef: null, category: "PROPOSAL_FORMAT", serviceScope: { service: "MOVING" }, content: { rule: "CONFIGURED" }, validFrom: null, validTo: null }));
  assert.match(association.membershipRef, /^[0-9a-f-]{36}$/); assertions += 1;

  const casePayload = { seriesRef: null, expectedVersion: 0, parties: [{ role: "COMPANY", entityRef: byCode.get("COMPANY-001").entityRef, relationshipRef: null }, { role: "LEAD_ACCOUNT", entityRef: byCode.get("LEAD-001").entityRef, relationshipRef: null }, { role: "BOOKER", entityRef: byCode.get("BOOKER-001").entityRef, relationshipRef: null }, { role: "PAYER", entityRef: byCode.get("PAYER-001").entityRef, relationshipRef: payerRelationship.relationshipRef }, { role: "APPROVER", entityRef: byCode.get("APPROVER-001").entityRef, relationshipRef: null }, { role: "REFERRER", entityRef: byCode.get("REFERRER-001").entityRef, relationshipRef: null }], pricingAgreementRef: pricing.pricingAgreementRef, referralAgreementRef: referral.referralAgreementRef };
  const snapshot = await publishCaseCommercialContext(prisma, context, pipelineCase.publicRef, signed("CASE_CONTEXT_PUBLISH", casePayload, randomUUID(), pipelineCase.publicRef));
  assert.notEqual(snapshot.payerRef, snapshot.parties.find((row) => row.role === "APPROVER").entityRef); assertions += 1;
  assert.equal(snapshot.associations.length, 1); assert.equal(snapshot.instructions.length, 1); assertions += 2;
  const quoteSnapshot = buildCommercialQuoteSnapshot(await prisma.pipelineCaseCommercialContextVersion.findFirst({ where: { tenantId: tenant.id, contextRef: snapshot.commercialContextRef }, include: { parties: { include: { entity: true, relationship: true } }, pricingAgreement: true, referralAgreement: true } }));
  assert.equal(quoteSnapshot.payerRef, snapshot.payerRef); assertions += 1;
  const quoteAuthority = await resolveCommercialQuoteAuthority(prisma, context, pipelineCase.id); assert.equal(quoteAuthority.payer.reference, snapshot.payerRef); assert.equal(quoteAuthority.commercialContext.tariff.reference, pricing.pricingAgreementRef); assert.equal(quoteAuthority.commercialContext.referral.reference, referral.referralAgreementRef); assertions += 3;
  const loaded = await getCaseCommercialContext(prisma, context, pipelineCase.publicRef, { requirePayer: true }); assert.equal(loaded.logicalSha256, snapshot.logicalSha256); assertions += 1;
  await assert.rejects(getCaseCommercialContext(prisma, otherContext, pipelineCase.publicRef), /COMMERCIAL_RELATIONSHIPS_NOT_FOUND/); assertions += 1;
  await assert.rejects(getCaseCommercialContext(prisma, context, "not-a-public-ref"), /COMMERCIAL_RELATIONSHIPS_NOT_FOUND/); assertions += 1;
  const tenantPage = await listCommercialEntities(prisma, context); const otherPage = await listCommercialEntities(prisma, { ...otherContext, effectivePermissions: permissions }); assert.equal(tenantPage.total, 8); assert.equal(otherPage.total, 0); assertions += 2;
  await assert.rejects(listCommercialEntities(prisma, { ...context, deniedPermissions: ["commercial:relationships:view"] }), /COMMERCIAL_RELATIONSHIPS_FORBIDDEN/); assertions += 1;

  const tariffV2 = { seriesRef: tariff.seriesRef, expectedVersion: 1, code: "MASTER-DO", name: "Tarifa de referencia v2", currency: "DOP", scope: { service: "MOVING" }, rateDefinition: { authority: "REFERENCE_ONLY", revision: 2 }, validFrom: null, validTo: null };
  const concurrent = await Promise.allSettled([publishCommercialTariff(prisma, context, signed("TARIFF_PUBLISH", tariffV2)), publishCommercialTariff(prisma, context, signed("TARIFF_PUBLISH", tariffV2))]);
  assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1); assert.equal(concurrent.filter((result) => result.status === "rejected").length, 1); assertions += 2;
  const relationshipRaceInput = { sourceEntityRef: byCode.get("COMPANY-001").entityRef, targetEntityRef: byCode.get("APPROVER-001").entityRef, type: "APPROVER", reference: "APPROVAL-EXPLICIT", conditions: {}, metadata: {}, validFrom: null, validTo: null };
  const relationshipRace = await Promise.allSettled([createCommercialRelationship(prisma, context, signed("RELATIONSHIP_CREATE", relationshipRaceInput)), createCommercialRelationship(prisma, context, signed("RELATIONSHIP_CREATE", relationshipRaceInput))]);
  assert.equal(relationshipRace.filter((result) => result.status === "fulfilled").length, 1); assert.equal(relationshipRace.filter((result) => result.status === "rejected").length, 1); assertions += 2;
  const pricingV2 = { seriesRef: pricing.seriesRef, expectedVersion: 1, entityRef: byCode.get("LEAD-001").entityRef, relationshipRef: null, tariffRef: tariff.tariffRef, serviceScope: { service: "MOVING" }, modeScope: ["LOCAL"], conditions: { explicit: true, revision: 2 }, administrativeTerms: { billing: "CONFIGURED" }, adjustments: [], validFrom: null, validTo: null };
  const pricingRace = await Promise.allSettled([publishPricingAgreement(prisma, context, signed("PRICING_AGREEMENT_PUBLISH", pricingV2)), publishPricingAgreement(prisma, context, signed("PRICING_AGREEMENT_PUBLISH", pricingV2))]);
  assert.equal(pricingRace.filter((result) => result.status === "fulfilled").length, 1); assert.equal(pricingRace.filter((result) => result.status === "rejected").length, 1); assertions += 2;
  const commissionV2 = { seriesRef: internalCommission.seriesRef, expectedVersion: 1, beneficiaryEntityRef: byCode.get("BOOKER-001").entityRef, referralAgreementRef: null, kind: "INTERNAL", calculationType: "POLICY", value: 0, currency: null, basisPolicy: { policy: "CONFIGURED_BY_SERVICE", revision: 2 }, serviceScope: { service: "MOVING" }, validFrom: null, validTo: null };
  const commissionRace = await Promise.allSettled([publishCommissionAgreement(prisma, context, signed("COMMISSION_AGREEMENT_PUBLISH", commissionV2)), publishCommissionAgreement(prisma, context, signed("COMMISSION_AGREEMENT_PUBLISH", commissionV2))]);
  assert.equal(commissionRace.filter((result) => result.status === "fulfilled").length, 1); assert.equal(commissionRace.filter((result) => result.status === "rejected").length, 1); assertions += 2;
  const immutable = await prisma.commercialTariffVersion.findFirst({ where: { tenantId: tenant.id } }); await assert.rejects(prisma.commercialTariffVersion.update({ where: { id: immutable.id }, data: { name: "Mutación prohibida" } }), /COMMERCIAL_(?:VERSION|RELATIONSHIP)_APPEND_ONLY/); assertions += 1;
  assert.equal(await prisma.commercialRelationshipCommand.count({ where: { tenantId: tenant.id } }), await prisma.commercialRelationshipEvent.count({ where: { tenantId: tenant.id } })); assertions += 1;
  assert.equal(await prisma.commercialRelationshipCommand.count({ where: { tenantId: tenant.id, requestId: replayInput.requestId } }), 1); assertions += 1;
  const publicJson = JSON.stringify({ tenantPage, snapshot, tariff, pricing, referral }); for (const forbidden of [tenant.id, user.id, membership.id, pipelineCase.id]) assert.equal(publicJson.includes(forbidden), false); assertions += 4;
  console.log(`V17-COMMERCIAL-RELATIONSHIPS-12A database: ${assertions}/${assertions}`);
} finally { await prisma.$disconnect(); }
