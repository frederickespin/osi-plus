import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  COMMUNICATION_PERMISSIONS,
  createCommunicationTemplate,
  inactivateCommunicationTemplate,
  listCommunicationRecipients,
  prepareCommunication,
  publishCommunicationTemplate,
} from "../api/_lib/communicationsDomain.js";
import { communicationHash } from "../api/_lib/communicationsContract.js";
import {
  createCommercialContact,
  createCommercialEntity,
  publishCaseCommercialContext,
} from "../api/_lib/commercialRelationshipsDomain.js";
import { commercialPayloadHash } from "../api/_lib/commercialRelationshipsContract.js";

const EXPECTED_DATABASE = "v17_consolidated_preview_10b";
const EXPECTED_BRANCH = "br-mute-credit-ahxnvfx0";
const EXPECTED_BATCH = "V17-COMMUNICATIONS-PREVIEW-13B";
const TENANT_CODE = "V17-CONSOLIDATED-PREVIEW-10B";
const OTHER_TENANT_CODE = "V17-CONSOLIDATED-PREVIEW-10B-X";
const COMMUNICATION_GRANTS = Object.freeze(Object.values(COMMUNICATION_PERMISSIONS));

function fail(code) { throw new Error(`V17_COMMUNICATIONS_PREVIEW_BLOCKED:${code}`); }
function exact(value, expected, code) { if (value !== expected) fail(code); }
function stableUuid(label) {
  const bytes = createHash("sha256").update(`v17-communications-preview-13b:${label}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function communicationCommand(operation, payload, label, hashContext = {}) {
  const requestId = stableUuid(label);
  return { requestId, payloadHash: communicationHash({ operation, requestId, ...hashContext, ...payload }), ...payload };
}
function commercialCommand(operation, payload, label, caseRef = null) {
  const requestId = stableUuid(`commercial:${label}`);
  return { requestId, payloadHash: commercialPayloadHash({ operation, requestId, ...(caseRef ? { caseRef } : {}), ...payload }), ...payload };
}

function guardEnvironment() {
  exact(process.env.V17_COMMUNICATIONS_PREVIEW_MODE, "PREVIEW_REHEARSAL", "MODE_INVALID");
  exact(process.env.V17_COMMUNICATIONS_PREVIEW_BATCH, EXPECTED_BATCH, "BATCH_INVALID");
  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") fail("PRODUCTION_ENVIRONMENT");
  const raw = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!raw) fail("DATABASE_URL_MISSING");
  const url = new URL(raw);
  exact(decodeURIComponent(url.pathname.slice(1)), EXPECTED_DATABASE, "DATABASE_INVALID");
  exact(url.searchParams.get("schema"), "osi", "SCHEMA_INVALID");
  if (/fragrant-night|bitter-bush/i.test(url.hostname) || /\bmain\b/i.test(url.pathname)) fail("KNOWN_PRODUCTION_TARGET");
  return raw;
}

const prisma = new PrismaClient({ datasources: { db: { url: guardEnvironment() } } });

const templateFixtures = Object.freeze([
  { code: "PIC_CLIENT_VISIT", name: "PIC cliente · visita presencial", category: "VISIT_CONFIRMATION", audiences: ["CLIENT"], channels: ["EMAIL", "WHATSAPP"], subject: "Visita {{case.reference}} confirmada", bodyText: "Hola {{client.name}}. La visita {{case.reference}} está pautada para {{survey.date}} a las {{survey.time}} con {{evaluator.name}} en {{origin.address}}. {{visit.instructions}}", variables: ["case.reference", "client.name", "evaluator.name", "origin.address", "survey.date", "survey.time", "visit.instructions"] },
  { code: "PIC_EVALUATOR_VISIT", name: "PIC evaluador · asignación", category: "EVALUATOR_ASSIGNMENT", audiences: ["EVALUATOR"], channels: ["EMAIL", "WHATSAPP"], subject: "Asignación {{case.reference}}", bodyText: "{{evaluator.name}}, visita {{case.reference}} el {{survey.date}} a las {{survey.time}}. Lugar: {{origin.address}}. {{visit.instructions}}", variables: ["case.reference", "evaluator.name", "origin.address", "survey.date", "survey.time", "visit.instructions"] },
  { code: "PIC_CLIENT_RESCHEDULED", name: "PIC cliente · reprogramación", category: "VISIT_CONFIRMATION", audiences: ["CLIENT"], channels: ["EMAIL"], subject: "Nueva fecha para {{case.reference}}", bodyText: "Hola {{client.name}}. La nueva cita es {{survey.date}} a las {{survey.time}}. Lugar: {{origin.address}}.", variables: ["case.reference", "client.name", "origin.address", "survey.date", "survey.time"] },
  { code: "PIC_CLIENT_CANCELLED", name: "PIC cliente · cancelación", category: "VISIT_CONFIRMATION", audiences: ["CLIENT"], channels: ["EMAIL"], subject: "Actualización de visita {{case.reference}}", bodyText: "Hola {{client.name}}. La visita del caso {{case.reference}} fue cancelada. Nuestro equipo coordinará el próximo paso.", variables: ["case.reference", "client.name"] },
  { code: "CORPORATE_CONTACT_CONTEXT", name: "Contexto Corporate · contactos", category: "BOOKER_NOTIFICATION", audiences: ["BOOKER", "LEAD_ACCOUNT", "AGENT"], channels: ["EMAIL"], subject: "Coordinación Corporate {{case.reference}}", bodyText: "Caso {{case.reference}} para {{client.name}}. Booker: {{booker.name}}. Lead Account: {{leadAccount.name}}. Agente: {{agent.name}}. Ruta: {{origin.address}} → {{destination.address}}.", variables: ["agent.name", "booker.name", "case.reference", "client.name", "destination.address", "leadAccount.name", "origin.address"] },
  { code: "QUOTE_MILESTONE", name: "Cotización · seguimiento", category: "QUOTE_FOLLOW_UP", audiences: ["CLIENT"], channels: ["EMAIL"], subject: "Cotización {{quote.reference}} · {{case.reference}}", bodyText: "Hola {{client.name}}. La cotización {{quote.reference}} del caso {{case.reference}} está vigente hasta {{quote.validUntil}}.", variables: ["case.reference", "client.name", "quote.reference", "quote.validUntil"] },
  { code: "PREVIEW_DRAFT_INFORMATION", name: "Draft de solicitud de información", category: "CLIENT_INFORMATION_REQUEST", audiences: ["CLIENT"], channels: ["EMAIL", "PORTAL"], subject: "Información requerida · {{case.reference}}", bodyText: "Hola {{client.name}}. Necesitamos completar información del caso {{case.reference}}.", variables: ["case.reference", "client.name"], draftOnly: true },
  { code: "PREVIEW_INACTIVE_DOCUMENT", name: "Plantilla inactiva de documento", category: "DOCUMENT_REQUEST", audiences: ["CLIENT"], channels: ["EMAIL"], subject: "Documento · {{case.reference}}", bodyText: "Hola {{client.name}}. Esta plantilla queda como evidencia inactiva del catálogo.", variables: ["case.reference", "client.name"], inactive: true },
]);

async function ensurePermissions(tenantId) {
  const admin = await prisma.tenantMembership.findFirst({ where: { tenantId, role: "A", status: "ACTIVE" }, include: { user: true } });
  const evaluator = await prisma.tenantMembership.findFirst({ where: { tenantId, role: "E", status: "ACTIVE" }, include: { user: true } });
  const deny = await prisma.tenantMembership.findFirst({ where: { tenantId, deniedPermissions: { has: "pipeline:view" }, status: "ACTIVE" }, include: { user: true } });
  if (!admin || !evaluator || !deny) fail("FIXTURE_IDENTITIES_MISSING");
  const adminGrants = [...new Set([...admin.grantedPermissions, ...COMMUNICATION_GRANTS])].sort();
  const evaluatorGrants = [...new Set([...evaluator.grantedPermissions, COMMUNICATION_PERMISSIONS.VIEW])].sort();
  const update = async (row, grants) => {
    if (JSON.stringify([...row.grantedPermissions].sort()) === JSON.stringify(grants)) return row;
    return prisma.tenantMembership.update({ where: { id: row.id }, data: { grantedPermissions: grants, authorizationVersion: { increment: 1 } }, include: { user: true } });
  };
  return { admin: await update(admin, adminGrants), evaluator: await update(evaluator, evaluatorGrants), deny };
}

async function ensureTemplate(context, fixture) {
  let row = await prisma.communicationTemplate.findFirst({ where: { tenantId: context.tenantId, code: fixture.code }, include: { versions: { orderBy: { version: "desc" } } } });
  if (!row) {
    const payload = { code: fixture.code, name: fixture.name, category: fixture.category, audiences: [...fixture.audiences].sort(), channels: [...fixture.channels].sort(), subject: fixture.subject, bodyText: fixture.bodyText, bodyHtml: null, variables: [...fixture.variables].sort(), validFrom: null, validTo: null };
    await createCommunicationTemplate(prisma, context, communicationCommand("TEMPLATE_CREATE", payload, `template:create:${fixture.code}`));
    row = await prisma.communicationTemplate.findFirstOrThrow({ where: { tenantId: context.tenantId, code: fixture.code }, include: { versions: { orderBy: { version: "desc" } } } });
  }
  if (fixture.draftOnly) return row;
  if (row.state === "DRAFT") {
    const version = row.versions[0]?.version;
    if (!version) fail(`TEMPLATE_VERSION_MISSING_${fixture.code}`);
    await publishCommunicationTemplate(prisma, context, row.templateRef, communicationCommand("TEMPLATE_PUBLISH", { version, expectedState: "DRAFT" }, `template:publish:${fixture.code}`, { templateRef: row.templateRef }));
    row = await prisma.communicationTemplate.findFirstOrThrow({ where: { tenantId: context.tenantId, code: fixture.code }, include: { versions: { orderBy: { version: "desc" } } } });
  }
  if (fixture.inactive && row.state !== "INACTIVE") {
    await inactivateCommunicationTemplate(prisma, context, row.templateRef, communicationCommand("TEMPLATE_INACTIVATE", { expectedVersion: row.versions[0].version }, `template:inactivate:${fixture.code}`, { templateRef: row.templateRef }));
    row = await prisma.communicationTemplate.findFirstOrThrow({ where: { tenantId: context.tenantId, code: fixture.code }, include: { versions: { orderBy: { version: "desc" } } } });
  }
  return row;
}

async function ensureCorporateAgent(context, scenario) {
  let agent = await prisma.commercialEntity.findFirst({ where: { tenantId: context.tenantId, code: "PV13B-AGENT-C" } });
  if (!agent) {
    const payload = { code: "PV13B-AGENT-C", displayName: "Agente Corporate Preview", legalName: null, kind: "PERSON", clientRef: null, countryCode: "DO", taxReference: null, validFrom: "2026-09-01T00:00:00.000Z", validTo: null };
    await createCommercialEntity(prisma, context, commercialCommand("ENTITY_CREATE", payload, "agent:create"));
    agent = await prisma.commercialEntity.findFirstOrThrow({ where: { tenantId: context.tenantId, code: "PV13B-AGENT-C" } });
  }
  let contact = await prisma.commercialEntityContact.findFirst({ where: { tenantId: context.tenantId, entityId: agent.id, status: "ACTIVE" } });
  if (!contact) {
    const payload = { entityRef: agent.entityRef, displayName: "Contacto Agente Preview", position: "Agente", email: "agent-13b@example.invalid", phone: "+12025550176", preferredChannel: "EMAIL", validFrom: "2026-09-01T00:00:00.000Z", validTo: null };
    await createCommercialContact(prisma, context, commercialCommand("CONTACT_CREATE", payload, "agent:contact"));
  }
  const current = await prisma.pipelineCaseCommercialContextVersion.findFirst({ where: { tenantId: context.tenantId, pipelineCaseId: scenario.id, state: "PUBLISHED" }, include: { parties: { include: { entity: true, relationship: true } }, pricingAgreement: true, referralAgreement: true }, orderBy: { version: "desc" } });
  if (!current) fail("CORPORATE_CONTEXT_MISSING");
  const leadAccount = current.parties.find((item) => item.role === "LEAD_ACCOUNT")?.entity;
  if (!leadAccount) fail("CORPORATE_LEAD_ACCOUNT_MISSING");
  contact = await prisma.commercialEntityContact.findFirst({ where: { tenantId: context.tenantId, entityId: leadAccount.id, status: "ACTIVE" } });
  if (!contact) {
    const payload = { entityRef: leadAccount.entityRef, displayName: "Contacto Lead Account Preview", position: "Lead Account", email: "lead-account-13b@example.invalid", phone: "+12025550175", preferredChannel: "EMAIL", validFrom: "2026-09-01T00:00:00.000Z", validTo: null };
    await createCommercialContact(prisma, context, commercialCommand("CONTACT_CREATE", payload, "lead-account:contact"));
  }
  if (current.parties.some((item) => item.role === "AGENT")) return;
  const parties = [...current.parties.map((item) => ({ role: item.role, entityRef: item.entity.entityRef, relationshipRef: item.relationship?.relationshipRef || null })), { role: "AGENT", entityRef: agent.entityRef, relationshipRef: null }];
  const payload = { seriesRef: current.seriesRef, expectedVersion: current.version, parties, pricingAgreementRef: current.pricingAgreement?.agreementRef || null, referralAgreementRef: current.referralAgreement?.referralAgreementRef || null };
  await publishCaseCommercialContext(prisma, context, scenario.publicRef, commercialCommand("CASE_CONTEXT_PUBLISH", payload, "context:corporate-agent", scenario.publicRef));
}

async function publishedTemplate(tenantId, code) {
  return prisma.communicationTemplate.findFirstOrThrow({ where: { tenantId, code, state: "PUBLISHED" }, include: { versions: { where: { state: "PUBLISHED" }, orderBy: { version: "desc" }, take: 1 } } });
}

async function prepare(context, templateCode, scenario, recipientType, channel, milestone, label, options = {}) {
  const template = await publishedTemplate(context.tenantId, templateCode);
  const version = template.versions[0];
  const recipients = await listCommunicationRecipients(prisma, context, scenario.publicRef, options);
  const recipient = recipients.find((item) => item.recipientType === recipientType && item.availableChannels.includes(channel));
  if (!recipient) fail(`RECIPIENT_MISSING_${label}`);
  const payload = { templateRef: template.templateRef, version: version.version, caseRef: scenario.publicRef, surveyAssignmentRef: options.surveyAssignmentRef || null, quoteRevisionRef: options.quoteRevisionRef || null, recipientType, recipientRef: recipient.recipientRef, channel, milestone };
  return prepareCommunication(prisma, context, communicationCommand("COMMUNICATION_PREPARE", payload, `prepare:${label}`));
}

async function main() {
  const identity = await prisma.$queryRawUnsafe("SELECT current_database() AS database, current_setting('neon.branch_id', true) AS branch");
  exact(identity[0]?.database, EXPECTED_DATABASE, "DATABASE_RUNTIME_INVALID");
  exact(identity[0]?.branch, EXPECTED_BRANCH, "BRANCH_RUNTIME_INVALID");
  const migrations = await prisma.$queryRawUnsafe("SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count FROM osi._prisma_migrations ORDER BY migration_name");
  if (migrations.length !== 33 || migrations.some((row) => !row.finished_at || row.rolled_back_at || row.applied_steps_count !== 1)) fail("MIGRATIONS_NOT_33_COMPLETE");

  const tenant = await prisma.tenant.findUnique({ where: { code: TENANT_CODE } });
  const otherTenant = await prisma.tenant.findUnique({ where: { code: OTHER_TENANT_CODE } });
  if (!tenant || !otherTenant) fail("TENANTS_MISSING");
  const identities = await ensurePermissions(tenant.id);
  const context = { tenantId: tenant.id, membershipId: identities.admin.id, userId: identities.admin.userId, role: "A", effectivePermissions: identities.admin.grantedPermissions, deniedPermissions: identities.admin.deniedPermissions };

  const scenarios = await prisma.pipelineCase.findMany({ where: { tenantId: tenant.id, caseCode: { in: ["PV10B-B-EXPORT", "PV10B-C-PENDING", "PV10B-D-QUOTES"] } } });
  if (scenarios.length !== 3) fail("SCENARIOS_MISSING");
  const byCode = new Map(scenarios.map((item) => [item.caseCode, item]));
  const visitCase = byCode.get("PV10B-B-EXPORT"); const corporateCase = byCode.get("PV10B-C-PENDING"); const quoteCase = byCode.get("PV10B-D-QUOTES");
  const assignment = await prisma.surveyAssignment.findFirst({ where: { tenantId: tenant.id, pipelineCaseId: visitCase.id }, orderBy: { createdAt: "desc" } });
  const quoteRevision = await prisma.quoteProposalRevision.findFirst({ where: { tenantId: tenant.id, proposal: { pipelineCaseId: quoteCase.id }, state: { in: ["READY", "SENT", "ACCEPTED", "REJECTED"] } }, orderBy: { createdAt: "desc" } });
  if (!assignment || !quoteRevision) fail("SCHEDULING_OR_QUOTE_FIXTURE_MISSING");

  await ensureCorporateAgent(context, corporateCase);
  for (const fixture of templateFixtures) await ensureTemplate(context, fixture);

  const scheduling = { surveyAssignmentRef: assignment.assignmentRef };
  await prepare(context, "PIC_CLIENT_VISIT", visitCase, "CLIENT", "EMAIL", "VISIT_CONFIRMATION", "visit-client-original", scheduling);
  await prepare(context, "PIC_EVALUATOR_VISIT", visitCase, "EVALUATOR", "EMAIL", "EVALUATOR_ASSIGNMENT", "visit-evaluator-original", scheduling);
  await prepare(context, "PIC_CLIENT_RESCHEDULED", visitCase, "CLIENT", "EMAIL", "VISIT_RESCHEDULED", "visit-client-rescheduled", scheduling);
  await prepare(context, "PIC_EVALUATOR_VISIT", visitCase, "EVALUATOR", "EMAIL", "VISIT_RESCHEDULED", "visit-evaluator-rescheduled", scheduling);
  await prepare(context, "PIC_CLIENT_CANCELLED", visitCase, "CLIENT", "EMAIL", "VISIT_CANCELLED", "visit-client-cancelled", scheduling);
  for (const recipientType of ["BOOKER", "LEAD_ACCOUNT", "AGENT"]) await prepare(context, "CORPORATE_CONTACT_CONTEXT", corporateCase, recipientType, "EMAIL", `${recipientType}_NOTIFICATION`, `corporate-${recipientType.toLowerCase()}`);
  const quote = { quoteRevisionRef: quoteRevision.revisionRef };
  for (const milestone of ["QUOTE_SENT", "FOLLOW_UP_1", "FOLLOW_UP_2", "EXPIRY_REMINDER", "QUOTE_ACCEPTED", "QUOTE_REJECTED"]) await prepare(context, "QUOTE_MILESTONE", quoteCase, "CLIENT", "EMAIL", milestone, `quote-${milestone.toLowerCase()}`, quote);

  if (!await prisma.communicationTemplate.findFirst({ where: { tenantId: otherTenant.id, code: "PV13B-X-TENANT-SENTINEL" } })) await prisma.communicationTemplate.create({ data: { tenantId: otherTenant.id, code: "PV13B-X-TENANT-SENTINEL", name: "Plantilla cross-tenant sintética", category: "DOCUMENT_REQUEST" } });
  const crossCase = await prisma.pipelineCase.findFirst({ where: { tenantId: otherTenant.id, caseCode: "PV10B-X-TENANT-SENTINEL" } });
  await assert.rejects(() => listCommunicationRecipients(prisma, context, crossCase.publicRef), (error) => error?.status === 404);

  const counts = {
    templates: await prisma.communicationTemplate.count({ where: { tenantId: tenant.id } }),
    publishedTemplates: await prisma.communicationTemplate.count({ where: { tenantId: tenant.id, state: "PUBLISHED" } }),
    draftTemplates: await prisma.communicationTemplate.count({ where: { tenantId: tenant.id, state: "DRAFT" } }),
    inactiveTemplates: await prisma.communicationTemplate.count({ where: { tenantId: tenant.id, state: "INACTIVE" } }),
    records: await prisma.communicationRecord.count({ where: { tenantId: tenant.id } }),
    prepared: await prisma.communicationRecord.count({ where: { tenantId: tenant.id, status: "PREPARED" } }),
    sent: await prisma.communicationRecord.count({ where: { tenantId: tenant.id, status: { in: ["SENT", "DELIVERED"] } } }),
  };
  assert.ok(counts.templates === 8 && counts.publishedTemplates === 6 && counts.draftTemplates === 1 && counts.inactiveTemplates === 1);
  assert.ok(counts.records >= 14 && counts.prepared === counts.records && counts.sent === 0);
  console.log(JSON.stringify({ ok: true, database: EXPECTED_DATABASE, branch: EXPECTED_BRANCH, migrations: "33/33", scenarios: ["VISIT", "RESCHEDULE", "CANCEL", "CORPORATE", "QUOTE"], counts, crossTenantBlocked: true, externalTransport: { EMAIL: 0, WHATSAPP: 0, SMS: 0, PORTAL: 0, WEBHOOK: 0 } }));
}

try { await main(); } finally { await prisma.$disconnect(); }
