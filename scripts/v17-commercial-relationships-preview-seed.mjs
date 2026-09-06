import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { commercialPayloadHash } from "../api/_lib/commercialRelationshipsContract.js";
import {
  createAssociationMembership,
  createCommercialCertification,
  createCommercialContact,
  createCommercialEntity,
  createCommercialRelationship,
  publishCaseCommercialContext,
  publishCommissionAgreement,
  publishCommercialInstruction,
  publishCommercialTariff,
  publishPricingAgreement,
  publishReferralAgreement,
} from "../api/_lib/commercialRelationshipsDomain.js";
import { createQuoteProposal } from "../api/_lib/quoteDomain.js";
import { quoteHash } from "../api/_lib/quoteContract.js";

const EXPECTED_DATABASE = "v17_consolidated_preview_10b";
const EXPECTED_BRANCH = "br-mute-credit-ahxnvfx0";
const EXPECTED_BATCH = "V17-COMMERCIAL-RELATIONSHIPS-12B";
const TENANT_CODE = "V17-CONSOLIDATED-PREVIEW-10B";
const OTHER_TENANT_CODE = "V17-CONSOLIDATED-PREVIEW-10B-X";
const PERMISSIONS = ["commercial:relationships:view", "commercial:relationships:manage", "commercial:tariffs:view", "commercial:tariffs:manage", "commercial:referrals:view", "commercial:referrals:manage", "commercial:commissions:view", "commercial:commissions:manage", "commercial:associations:view", "commercial:associations:manage", "quote:view", "quote:create"];

function fail(code) { throw new Error(`V17_RELATIONSHIPS_PREVIEW_BLOCKED:${code}`); }
function stableUuid(label) { const bytes = createHash("sha256").update(`v17-relationships-preview:${label}`).digest().subarray(0, 16); bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80; const value = bytes.toString("hex"); return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`; }
function signed(operation, body, label, caseRef) { const requestId = stableUuid(label); return { requestId, payloadHash: commercialPayloadHash({ operation, requestId, ...(caseRef ? { caseRef } : {}), ...body }), ...body }; }
function quoteSigned(operation, body, label) { const requestId = stableUuid(label); return { requestId, payloadHash: quoteHash({ operation, requestId, ...body }), ...body }; }
function entityPayload(code, displayName, kind, clientRef = null) { return { code, displayName, legalName: kind === "COMPANY" || kind === "ORGANIZATION" ? displayName : null, kind, clientRef, countryCode: "DO", taxReference: null, validFrom: "2026-09-01T00:00:00.000Z", validTo: null }; }

const raw = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!raw || process.env.V17_RELATIONSHIPS_PREVIEW_MODE !== "PREVIEW_REHEARSAL" || process.env.V17_RELATIONSHIPS_PREVIEW_BATCH !== EXPECTED_BATCH || process.env.VERCEL_ENV === "production") fail("ENVIRONMENT");
const url = new URL(raw);
if (decodeURIComponent(url.pathname.slice(1)) !== EXPECTED_DATABASE || url.searchParams.get("schema") !== "osi" || /fragrant-night|bitter-bush/i.test(url.hostname)) fail("DATABASE");
const prisma = new PrismaClient({ datasources: { db: { url: raw } } });

async function ensureEntity(context, payload) {
  const found = await prisma.commercialEntity.findFirst({ where: { tenantId: context.tenantId, code: payload.code } });
  if (found) return found;
  await createCommercialEntity(prisma, context, signed("ENTITY_CREATE", payload, `entity:${payload.code}`));
  return prisma.commercialEntity.findFirstOrThrow({ where: { tenantId: context.tenantId, code: payload.code } });
}
async function ensureRelationship(context, source, target, type, reference) {
  const found = await prisma.commercialRelationship.findFirst({ where: { tenantId: context.tenantId, reference } });
  return found || createCommercialRelationship(prisma, context, signed("RELATIONSHIP_CREATE", { sourceEntityRef: source.entityRef, targetEntityRef: target.entityRef, type, reference, conditions: { syntheticPreview: true }, metadata: {}, validFrom: "2026-09-01T00:00:00.000Z", validTo: "2027-09-01T00:00:00.000Z" }, `relationship:${reference}`));
}
async function ensureContact(context, entity, code, name) {
  const found = await prisma.commercialEntityContact.findFirst({ where: { tenantId: context.tenantId, entityId: entity.id, displayName: name } });
  return found || createCommercialContact(prisma, context, signed("CONTACT_CREATE", { entityRef: entity.entityRef, displayName: name, position: "Booker", email: `${code.toLowerCase()}@example.invalid`, phone: "+12025550177", preferredChannel: "EMAIL", validFrom: "2026-09-01T00:00:00.000Z", validTo: null }, `contact:${code}`));
}
async function ensureContext(context, scenario, parties, pricingAgreementRef = null, referralAgreementRef = null, label = scenario.caseCode) {
  const existing = await prisma.pipelineCaseCommercialContextVersion.findFirst({ where: { tenantId: context.tenantId, pipelineCaseId: scenario.id, state: "PUBLISHED" }, orderBy: { version: "desc" } });
  if (existing) return existing;
  const body = { seriesRef: null, expectedVersion: 0, parties: parties.map(([role, entity, relationship]) => ({ role, entityRef: entity.entityRef, relationshipRef: relationship?.relationshipRef || null })), pricingAgreementRef, referralAgreementRef };
  return publishCaseCommercialContext(prisma, context, scenario.publicRef, signed("CASE_CONTEXT_PUBLISH", body, `context:${label}:v1`, scenario.publicRef));
}

try {
  const identity = await prisma.$queryRawUnsafe("SELECT current_database() AS database, current_setting('neon.branch_id', true) AS branch");
  if (identity[0]?.database !== EXPECTED_DATABASE || identity[0]?.branch !== EXPECTED_BRANCH) fail("RUNTIME_IDENTITY");
  const migrations = await prisma.$queryRawUnsafe("SELECT finished_at, rolled_back_at, applied_steps_count FROM osi._prisma_migrations ORDER BY migration_name");
  if (migrations.length !== 31 || migrations.some((row) => !row.finished_at || row.rolled_back_at || row.applied_steps_count !== 1)) fail("MIGRATIONS");
  const tenant = await prisma.tenant.findUnique({ where: { code: TENANT_CODE } });
  const otherTenant = await prisma.tenant.findUnique({ where: { code: OTHER_TENANT_CODE } });
  const membership = await prisma.tenantMembership.findFirst({ where: { tenantId: tenant?.id, role: "A", status: "ACTIVE" }, include: { user: true } });
  if (!tenant || !otherTenant || !membership) fail("FIXTURE_AUTHORITY");
  const context = { tenantId: tenant.id, userId: membership.userId, membershipId: membership.id, role: "A", effectivePermissions: [...new Set([...membership.grantedPermissions, ...PERMISSIONS])], deniedPermissions: membership.deniedPermissions };
  const scenarios = await prisma.pipelineCase.findMany({ where: { tenantId: tenant.id, caseCode: { in: ["PV10B-A-LOCAL", "PV10B-B-EXPORT", "PV10B-C-PENDING", "PV10B-D-QUOTES"] } }, include: { client: true } });
  if (scenarios.length !== 4) fail("SCENARIOS");
  const byCase = new Map(scenarios.map((row) => [row.caseCode, row]));

  const clientA = await ensureEntity(context, entityPayload("PV12B-CLIENT-A", "Cliente personal Aurora", "PERSON", byCase.get("PV10B-A-LOCAL").client.publicRef));
  await ensureContext(context, byCase.get("PV10B-A-LOCAL"), [["PAYER", clientA, null]]);

  const clientB = await ensureEntity(context, entityPayload("PV12B-CLIENT-B", "Cliente corporativo Bruno", "PERSON", byCase.get("PV10B-B-EXPORT").client.publicRef));
  const companyB = await ensureEntity(context, entityPayload("PV12B-COMPANY-B", "Caribe Corporate Logistics", "COMPANY"));
  const bookerB = await ensureEntity(context, entityPayload("PV12B-BOOKER-B", "Booker Beatriz", "PERSON"));
  const approverB = await ensureEntity(context, entityPayload("PV12B-APPROVER-B", "Aprobador Regional B", "ORGANIZATION"));
  const approverB2 = await ensureEntity(context, entityPayload("PV12B-APPROVER-B2", "Aprobador Global B", "ORGANIZATION"));
  await ensureContact(context, bookerB, "PV12B-BOOKER-B", "Contacto Booker B");
  const employedB = await ensureRelationship(context, clientB, companyB, "EMPLOYED_BY", "PV12B-EMPLOYED-B");
  const bookerRelationB = await ensureRelationship(context, companyB, bookerB, "BOOKER", "PV12B-BOOKER-B");
  const payerB = await ensureRelationship(context, clientB, companyB, "PAYER", "PV12B-PAYER-B");
  const approveB = await ensureRelationship(context, companyB, approverB, "APPROVER", "PV12B-APPROVER-B");
  const contextB1 = await ensureContext(context, byCase.get("PV10B-B-EXPORT"), [["COMPANY", companyB, employedB], ["BOOKER", bookerB, bookerRelationB], ["PAYER", companyB, payerB], ["APPROVER", approverB, approveB]]);

  const clientC = await ensureEntity(context, entityPayload("PV12B-CLIENT-C", "Cliente Lead Account C", "PERSON", byCase.get("PV10B-C-PENDING").client.publicRef));
  const companyC = await ensureEntity(context, entityPayload("PV12B-COMPANY-C", "Empresa Exportadora C", "COMPANY"));
  const leadC = await ensureEntity(context, entityPayload("PV12B-LEAD-C", "Lead Account Internacional C", "LEAD_ACCOUNT"));
  const bookerC = await ensureEntity(context, entityPayload("PV12B-BOOKER-C", "Booker Corporate C", "COMPANY"));
  const payerC = await ensureEntity(context, entityPayload("PV12B-PAYER-C", "Pagador Autorizado C", "ORGANIZATION"));
  await ensureContact(context, bookerC, "PV12B-BOOKER-C", "Mesa Booker C");
  const companyRelC = await ensureRelationship(context, clientC, companyC, "EMPLOYED_BY", "PV12B-EMPLOYED-C");
  const leadRelC = await ensureRelationship(context, companyC, leadC, "LEAD_ACCOUNT", "PV12B-LEAD-C");
  const bookerRelC = await ensureRelationship(context, leadC, bookerC, "BOOKER", "PV12B-BOOKER-C");
  const payerRelC = await ensureRelationship(context, leadC, payerC, "PAYER", "PV12B-PAYER-C");
  let tariff = await prisma.commercialTariffVersion.findFirst({ where: { tenantId: tenant.id, code: "PV12B-CORPORATE" }, orderBy: { version: "desc" } });
  tariff ||= await publishCommercialTariff(prisma, context, signed("TARIFF_PUBLISH", { seriesRef: null, expectedVersion: 0, code: "PV12B-CORPORATE", name: "Tarifario Corporate Preview", currency: "USD", scope: { service: "EXPORT" }, rateDefinition: { authority: "CATALOG" }, validFrom: "2026-09-01T00:00:00.000Z", validTo: "2027-09-01T00:00:00.000Z" }, "tariff:C"));
  let pricing = await prisma.commercialPricingAgreementVersion.findFirst({ where: { tenantId: tenant.id, entityId: leadC.id, state: "PUBLISHED" }, include: { tariffVersion: true }, orderBy: { version: "desc" } });
  pricing ||= await publishPricingAgreement(prisma, context, signed("PRICING_AGREEMENT_PUBLISH", { seriesRef: null, expectedVersion: 0, entityRef: leadC.entityRef, relationshipRef: null, tariffRef: tariff.tariffRef, serviceScope: { service: "EXPORT" }, modeScope: ["EXPORT"], conditions: { corporate: true }, administrativeTerms: { paymentDays: 30 }, adjustments: [{ kind: "DISCOUNT", calculationType: "PERCENTAGE", value: 8, base: "QUOTED_SUBTOTAL", reasonCode: "LEAD_ACCOUNT", approvalRef: null, validFrom: "2026-09-01T00:00:00.000Z", validTo: "2027-09-01T00:00:00.000Z" }, { kind: "ADMINISTRATIVE_CHARGE", calculationType: "PERCENTAGE", value: 2, base: "QUOTED_SUBTOTAL", reasonCode: "ADMINISTRATION", approvalRef: null, validFrom: "2026-09-01T00:00:00.000Z", validTo: "2027-09-01T00:00:00.000Z" }], validFrom: "2026-09-01T00:00:00.000Z", validTo: "2027-09-01T00:00:00.000Z" }, "pricing:C"));
  const instructionExists = await prisma.commercialInstructionVersion.findFirst({ where: { tenantId: tenant.id, entityId: leadC.id, category: "COMMERCIAL_EXECUTION" } });
  if (!instructionExists) await publishCommercialInstruction(prisma, context, signed("INSTRUCTION_PUBLISH", { seriesRef: null, expectedVersion: 0, entityRef: leadC.entityRef, relationshipRef: null, category: "COMMERCIAL_EXECUTION", serviceScope: { mode: "EXPORT" }, content: { summary: "Utilizar tarifario corporativo; copiar al Booker y obtener aprobación del Lead Account." }, validFrom: "2026-09-01T00:00:00.000Z", validTo: "2027-09-01T00:00:00.000Z" }, "instruction:C"));
  await ensureContext(context, byCase.get("PV10B-C-PENDING"), [["COMPANY", companyC, companyRelC], ["LEAD_ACCOUNT", leadC, leadRelC], ["BOOKER", bookerC, bookerRelC], ["PAYER", payerC, payerRelC]], pricing.agreementRef || pricing.pricingAgreementRef);

  const clientD = await ensureEntity(context, entityPayload("PV12B-CLIENT-D", "Cliente referido D", "PERSON", byCase.get("PV10B-D-QUOTES").client.publicRef));
  const companyD = await ensureEntity(context, entityPayload("PV12B-COMPANY-D", "Empresa Asociada D", "COMPANY"));
  const referrerD = await ensureEntity(context, entityPayload("PV12B-REFERRER-D", "Referidor Externo D", "REFERRER"));
  const associationD = await ensureEntity(context, entityPayload("PV12B-ASSOCIATION-D", "Asociación Global de Mudanzas", "ASSOCIATION"));
  const beneficiaryD = await ensureEntity(context, entityPayload("PV12B-INTERNAL-D", "Beneficiario Interno D", "PERSON"));
  const companyRelD = await ensureRelationship(context, clientD, companyD, "EMPLOYED_BY", "PV12B-EMPLOYED-D");
  const referrerRelD = await ensureRelationship(context, clientD, referrerD, "REFERRER", "PV12B-REFERRER-D");
  let referral = await prisma.commercialReferralAgreementVersion.findFirst({ where: { tenantId: tenant.id, referrerEntityId: referrerD.id, reference: "PV12B-REFERRAL-D" } });
  referral ||= await publishReferralAgreement(prisma, context, signed("REFERRAL_AGREEMENT_PUBLISH", { seriesRef: null, expectedVersion: 0, referrerEntityRef: referrerD.entityRef, calculationType: "PERCENTAGE", value: 4, currency: null, basisPolicy: { basis: "COLLECTED_AMOUNT" }, serviceScope: { all: true }, authorizationRef: null, reference: "PV12B-REFERRAL-D", validFrom: "2026-09-01T00:00:00.000Z", validTo: "2027-09-01T00:00:00.000Z" }, "referral:D"));
  const commissionExists = await prisma.commercialCommissionAgreementVersion.findFirst({ where: { tenantId: tenant.id, beneficiaryEntityId: beneficiaryD.id, kind: "INTERNAL" } });
  if (!commissionExists) await publishCommissionAgreement(prisma, context, signed("COMMISSION_AGREEMENT_PUBLISH", { seriesRef: null, expectedVersion: 0, beneficiaryEntityRef: beneficiaryD.entityRef, referralAgreementRef: null, kind: "INTERNAL", calculationType: "POLICY", value: 0, currency: null, basisPolicy: { policy: "INTERNAL_ONLY" }, serviceScope: { all: true }, validFrom: "2026-09-01T00:00:00.000Z", validTo: "2027-09-01T00:00:00.000Z" }, "commission:D"));
  if (!await prisma.commercialAssociationMembership.findFirst({ where: { tenantId: tenant.id, memberEntityId: companyD.id, associationEntityId: associationD.id } })) await createAssociationMembership(prisma, context, signed("ASSOCIATION_MEMBERSHIP_CREATE", { memberEntityRef: companyD.entityRef, associationEntityRef: associationD.entityRef, membershipNumber: "PV12B-MEMBER-D", validFrom: "2026-09-01T00:00:00.000Z", validTo: "2027-09-01T00:00:00.000Z" }, "association:D"));
  if (!await prisma.commercialCertification.findFirst({ where: { tenantId: tenant.id, entityId: companyD.id, type: "QUALITY-PREVIEW" } })) await createCommercialCertification(prisma, context, signed("CERTIFICATION_CREATE", { entityRef: companyD.entityRef, type: "QUALITY-PREVIEW", issuer: "Autoridad sintética", documentRef: null, issuedAt: "2026-09-01", expiresAt: "2027-09-01" }, "certification:D"));
  await ensureContext(context, byCase.get("PV10B-D-QUOTES"), [["COMPANY", companyD, companyRelD], ["PAYER", clientD, null], ["REFERRER", referrerD, referrerRelD]], null, referral.referralAgreementRef);

  const quoteCase = byCase.get("PV10B-B-EXPORT");
  let quote = await prisma.quoteProposal.findFirst({ where: { tenantId: tenant.id, pipelineCaseId: quoteCase.id, position: 1 }, include: { revisions: { orderBy: { revision: "desc" }, take: 1 } } });
  if (!quote) {
    const costing = await prisma.costingRevision.findFirst({ where: { tenantId: tenant.id, pipelineCaseId: quoteCase.id, status: "PUBLISHED" }, include: { lines: { orderBy: { position: "asc" } } }, orderBy: { revision: "desc" } });
    const line = costing?.lines.find((item) => item.suggestedPrice != null);
    if (!costing || !line) fail("QUOTE_COSTING");
    const body = { caseRef: quoteCase.publicRef, costingRevisionRef: costing.revisionRef, position: 1, proposalName: "Corporate Snapshot Preview", currency: costing.baseCurrency, issueDate: "2026-09-06", validUntil: "2026-10-06", commercialContext: { company: null, leadAccount: null, booker: null, tariff: null, associations: [], referral: null, commissionContext: null }, payer: { kind: "AUTHORIZED_ENTITY", reference: "SYNTHETIC", displayName: "Sustituido por autoridad", sourceVersion: 1, validFrom: null, validUntil: null, conditions: null }, terms: { paymentTerms: "30 días", scope: "Caso Corporate sintético", exclusions: [], clientNotes: null, specialConditions: [], templateRef: null, templateVersion: null }, exchange: null, discount: null, marginAuthorizationRef: null, lines: [{ sourceKind: "COSTING", costingLineRef: line.lineRef, concept: line.concept, quantity: String(line.quantity), unit: line.unit, economicClass: line.classification, quotedPrice: String(line.suggestedPrice), currency: costing.baseCurrency, reason: null, manualAuthority: null }] };
    await createQuoteProposal(prisma, context, quoteSigned("QUOTE_PROPOSAL_CREATE", body, "quote:B:v1"));
    quote = await prisma.quoteProposal.findFirst({ where: { tenantId: tenant.id, pipelineCaseId: quoteCase.id, position: 1 }, include: { revisions: { orderBy: { revision: "desc" }, take: 1 } } });
  }
  const latestB = await prisma.pipelineCaseCommercialContextVersion.findFirst({ where: { tenantId: tenant.id, pipelineCaseId: quoteCase.id }, orderBy: { version: "desc" } });
  if (latestB.version === 1) {
    const approveB2 = await ensureRelationship(context, companyB, approverB2, "APPROVER", "PV12B-APPROVER-B2");
    const body = { seriesRef: latestB.seriesRef, expectedVersion: 1, parties: [["COMPANY", companyB, employedB], ["BOOKER", bookerB, bookerRelationB], ["PAYER", companyB, payerB], ["APPROVER", approverB2, approveB2]].map(([role, entity, relationship]) => ({ role, entityRef: entity.entityRef, relationshipRef: relationship.relationshipRef })), pricingAgreementRef: null, referralAgreementRef: null };
    await publishCaseCommercialContext(prisma, context, quoteCase.publicRef, signed("CASE_CONTEXT_PUBLISH", body, "context:B:v2", quoteCase.publicRef));
  }
  const quoteSnapshot = (await prisma.quoteProposalRevision.findFirst({ where: { tenantId: tenant.id, proposalId: quote.id }, orderBy: { revision: "desc" } })).commercialContextSnapshot;
  assert.equal(quoteSnapshot.company.displayName, "Caribe Corporate Logistics");
  assert.equal(quoteSnapshot.booker.displayName, "Booker Beatriz");
  const latestContextB = await prisma.pipelineCaseCommercialContextVersion.findFirst({ where: { tenantId: tenant.id, pipelineCaseId: quoteCase.id }, include: { parties: { include: { entity: true } } }, orderBy: { version: "desc" } });
  assert.equal(latestContextB.parties.find((item) => item.role === "APPROVER").entity.displayName, "Aprobador Global B");

  const sentinel = await prisma.commercialEntity.findFirst({ where: { tenantId: otherTenant.id, code: "PV12B-X-SENTINEL" } });
  if (!sentinel) await prisma.commercialEntity.create({ data: { tenantId: otherTenant.id, code: "PV12B-X-SENTINEL", displayName: "Entidad cross-tenant sintética", kind: "COMPANY", countryCode: "US" } });
  const counts = { entities: await prisma.commercialEntity.count({ where: { tenantId: tenant.id } }), relationships: await prisma.commercialRelationship.count({ where: { tenantId: tenant.id } }), contexts: await prisma.pipelineCaseCommercialContextVersion.count({ where: { tenantId: tenant.id } }), tariffs: await prisma.commercialTariffVersion.count({ where: { tenantId: tenant.id } }), agreements: await prisma.commercialPricingAgreementVersion.count({ where: { tenantId: tenant.id } }), referrals: await prisma.commercialReferralAgreementVersion.count({ where: { tenantId: tenant.id } }), commissions: await prisma.commercialCommissionAgreementVersion.count({ where: { tenantId: tenant.id } }), associations: await prisma.commercialAssociationMembership.count({ where: { tenantId: tenant.id } }), certifications: await prisma.commercialCertification.count({ where: { tenantId: tenant.id } }) };
  console.log(JSON.stringify({ ok: true, database: EXPECTED_DATABASE, branch: EXPECTED_BRANCH, migrations: "31/31", scenarios: ["A", "B", "C", "D"], quoteSnapshotPreserved: true, crossTenantSentinel: true, counts, productionApiEnabled: false }));
} finally {
  await prisma.$disconnect();
}
