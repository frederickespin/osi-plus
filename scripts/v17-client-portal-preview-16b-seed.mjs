import assert from "node:assert/strict";
import { createHash, randomBytes, randomInt, scryptSync } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { applyClientVisitAction, confirmClientVisitQr, saveClientMiniSurvey } from "../api/_lib/clientTemporaryAccessDomain.js";
import { clientTemporaryPayloadHash } from "../api/_lib/clientTemporaryAccessContract.js";

const EXPECTED_DATABASE = "v17_consolidated_preview_10b";
const EXPECTED_BRANCH = "br-mute-credit-ahxnvfx0";
const EXPECTED_BATCH = "V17-CLIENT-PORTAL-PREVIEW-16B";
const TENANT_CODE = "V17-CONSOLIDATED-PREVIEW-10B";
const PRIVATE_FILE = resolve(".env.v17-client-portal-preview-16b.local");
const ACCESS_PERMISSIONS = ["client-access:view", "client-access:create", "client-access:revoke", "client-access:manage"];
const VISIT_SCOPES = ["VISIT_VIEW", "VISIT_CONFIRM", "VISIT_CHANGE_REQUEST", "VISIT_CANCEL_REQUEST", "VISIT_QR_CONFIRM"];
const SURVEY_SCOPES = ["VISIT_VIEW", "SURVEY_INFO_VIEW", "SURVEY_INFO_UPLOAD", "MINI_SURVEY_EDIT"];

function fail(code) { throw new Error(`V17_CLIENT_PORTAL_PREVIEW_BLOCKED:${code}`); }
function sha(value) { return createHash("sha256").update(value, "utf8").digest("hex"); }
function stableUuid(label) {
  const bytes = createHash("sha256").update(`v17-client-portal-preview:${label}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = bytes.toString("hex");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}
function signed(operation, requestId, body) { return { requestId, payloadHash: clientTemporaryPayloadHash({ operation, requestId, ...body }), ...body }; }
function signedVisit(requestId, body) {
  const { action, ...payload } = body;
  return { requestId, payloadHash: clientTemporaryPayloadHash({ operation: action, requestId, ...payload }), ...body };
}
function parsePrivateFile() {
  if (!existsSync(PRIVATE_FILE)) return null;
  return Object.fromEntries(readFileSync(PRIVATE_FILE, "utf8").trim().split(/\r?\n/u).map((line) => {
    const separator = line.indexOf("="); return [line.slice(0, separator), line.slice(separator + 1)];
  }));
}
function credentialsFromPrivate(values) {
  const result = {};
  for (const name of ["A_PENDING_IN_PERSON", "B_CONFIRMED", "C_CHANGE_REQUESTED", "D_VIRTUAL", "E_MINI", "G_CANCEL_REQUESTED", "F_REVOKED", "F_EXPIRED"]) {
    result[name] = { accessRef: values[`${name}_ACCESS_REF`], token: values[`${name}_TOKEN`], shortCode: values[`${name}_SHORT_CODE`] || "", path: values[`${name}_PATH`] };
    if (!result[name].accessRef || !result[name].token || !result[name].path) fail(`PRIVATE_MANIFEST_${name}`);
  }
  return result;
}
function writePrivateFile(credentials) {
  const lines = [`V17_CLIENT_PORTAL_PREVIEW_BATCH=${EXPECTED_BATCH}`];
  for (const [name, value] of Object.entries(credentials)) lines.push(`${name}_ACCESS_REF=${value.accessRef}`, `${name}_TOKEN=${value.token}`, `${name}_SHORT_CODE=${value.shortCode}`, `${name}_PATH=${value.path}`);
  writeFileSync(PRIVATE_FILE, `${lines.join("\n")}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  try { chmodSync(PRIVATE_FILE, 0o600); } catch { /* Windows ACL is tightened by the caller. */ }
}

const raw = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!raw || process.env.V17_CLIENT_PORTAL_PREVIEW_MODE !== "PREVIEW_REHEARSAL" || process.env.V17_CLIENT_PORTAL_PREVIEW_BATCH !== EXPECTED_BATCH || process.env.VERCEL_ENV === "production") fail("ENVIRONMENT");
const parsed = new URL(raw);
if (decodeURIComponent(parsed.pathname.slice(1)) !== EXPECTED_DATABASE || parsed.searchParams.get("schema") !== "osi" || /fragrant-night|bitter-bush/i.test(parsed.hostname)) fail("DATABASE");
const prisma = new PrismaClient({ datasources: { db: { url: raw } } });

async function ensureContact(tenant, membership, pipelineCase) {
  let context = await prisma.pipelineCaseCommercialContextVersion.findFirst({ where: { tenantId: tenant.id, pipelineCaseId: pipelineCase.id, state: "PUBLISHED" }, include: { parties: { include: { entity: { include: { contacts: { where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" } } } } } } }, orderBy: { version: "desc" } });
  if (!context) {
    let entity = await prisma.commercialEntity.findFirst({ where: { tenantId: tenant.id, clientId: pipelineCase.clientId } });
    if (!entity) entity = await prisma.commercialEntity.create({ data: { tenantId: tenant.id, clientId: pipelineCase.clientId, code: `PV16B-${pipelineCase.caseCode}`.slice(0, 64), displayName: `Cliente ${pipelineCase.caseCode}`, kind: "PERSON", countryCode: "DO" } });
    context = await prisma.pipelineCaseCommercialContextVersion.create({ data: { seriesRef: stableUuid(`context:${pipelineCase.caseCode}`), tenantId: tenant.id, pipelineCaseId: pipelineCase.id, version: 1, state: "PUBLISHED", logicalSha256: sha(`context:${pipelineCase.caseCode}`), createdByMembershipId: membership.id, createdByUserId: membership.userId, publishedAt: new Date(), parties: { create: { entityId: entity.id, role: "PAYER" } } }, include: { parties: { include: { entity: { include: { contacts: { where: { status: "ACTIVE" } } } } } } } });
  }
  const party = context.parties.find((entry) => entry.entity.contacts.length) || context.parties[0];
  if (!party) fail(`CASE_CONTACT_AUTHORITY_${pipelineCase.caseCode}`);
  if (party.entity.contacts[0]) return party.entity.contacts[0];
  return prisma.commercialEntityContact.create({ data: { tenantId: tenant.id, entityId: party.entity.id, displayName: `Contacto Portal ${pipelineCase.caseCode}`, position: "Contacto autorizado", emailNormalized: `${pipelineCase.caseCode.toLowerCase()}@example.invalid`, phoneNormalized: "+12025550190", preferredChannel: "EMAIL", status: "ACTIVE", validFrom: new Date("2026-09-01T00:00:00.000Z") } });
}

function accessDefinition(name, pipelineCase, assignment, contact, purpose, scopes) {
  const token = randomBytes(32).toString("base64url"); const shortCode = String(randomInt(0, 1_000_000)).padStart(6, "0"); const shortCodeSalt = randomBytes(16).toString("hex");
  const accessRef = stableUuid(`access:${name}`); const expiresAt = name === "F_EXPIRED" ? new Date("2026-09-08T23:59:59.000Z") : new Date("2026-10-16T23:59:59.000Z");
  const requestId = `v17-16b-fixture-${name.toLowerCase().replaceAll("_", "-")}`;
  const body = { caseRef: pipelineCase.publicRef, assignmentRef: assignment.assignmentRef, contactRef: contact.contactRef, communicationRef: null, purpose, scopes: [...scopes].sort(), expiresAt: expiresAt.toISOString(), maxUses: 100, shortCodeEnabled: true };
  return { name, accessRef, token, shortCode, shortCodeSalt, expiresAt, requestId, payloadHash: clientTemporaryPayloadHash({ operation: "ACCESS_CREATE", requestId, ...body }), pipelineCase, assignment, contact, purpose, scopes: [...scopes].sort() };
}

try {
  const identity = await prisma.$queryRawUnsafe("SELECT current_database() AS database, current_setting('neon.branch_id', true) AS branch");
  assert.deepEqual(identity, [{ database: EXPECTED_DATABASE, branch: EXPECTED_BRANCH }]);
  const migrations = await prisma.$queryRawUnsafe("SELECT finished_at, rolled_back_at, applied_steps_count FROM osi._prisma_migrations ORDER BY migration_name");
  if (migrations.length !== 35 || migrations.some((row) => !row.finished_at || row.rolled_back_at || row.applied_steps_count !== 1)) fail("MIGRATIONS_NOT_35_COMPLETE");
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: TENANT_CODE } });
  let admin = await prisma.tenantMembership.findFirstOrThrow({ where: { tenantId: tenant.id, role: "A", status: "ACTIVE" }, include: { user: true } });
  if (admin.deniedPermissions.some((permission) => ACCESS_PERMISSIONS.includes(permission))) fail("ADMIN_DENY_CONFLICT");
  const grants = [...new Set([...admin.grantedPermissions, ...ACCESS_PERMISSIONS])].sort();
  if (grants.length !== admin.grantedPermissions.length) admin = await prisma.tenantMembership.update({ where: { id: admin.id }, data: { grantedPermissions: grants, authorizationVersion: { increment: 1 } }, include: { user: true } });
  const actor = { tenantId: tenant.id, membershipId: admin.id, userId: admin.userId };
  const codes = ["PV10B-A-LOCAL", "PV10B-B-EXPORT", "PV15B-B-INTERIOR", "PV10B-C-PENDING", "PV10B-D-QUOTES", "PV15B-E-MINI"];
  const cases = await prisma.pipelineCase.findMany({ where: { tenantId: tenant.id, caseCode: { in: codes } }, include: { surveyAssignments: { include: { evaluationDecision: true, evaluatorMembership: { include: { employeeProfile: true } } }, orderBy: { createdAt: "desc" } } } });
  if (cases.length !== codes.length) fail("CASE_FIXTURES_MISSING");
  const byCode = new Map(cases.map((entry) => [entry.caseCode, entry])); const contacts = new Map();
  for (const code of codes) contacts.set(code, await ensureContact(tenant, admin, byCode.get(code)));
  const assignment = (entry) => entry.surveyAssignments.find((item) => item.status !== "SUPERSEDED") || entry.surveyAssignments[0];
  if (cases.some((entry) => !assignment(entry))) fail("ASSIGNMENT_FIXTURES_MISSING");

  let credentials;
  if (!existsSync(PRIVATE_FILE)) {
    const old = await prisma.clientTemporaryAccess.findMany({ where: { tenantId: tenant.id }, include: { commands: true } });
    if (old.some((row) => !row.commands.some((command) => command.requestId.startsWith("v17-16b-")))) fail("UNEXPECTED_ACCESS_FIXTURES_ALREADY_EXIST");
    const definitions = [
      accessDefinition("A_PENDING_IN_PERSON", byCode.get("PV10B-A-LOCAL"), assignment(byCode.get("PV10B-A-LOCAL")), contacts.get("PV10B-A-LOCAL"), "VISIT", VISIT_SCOPES),
      accessDefinition("B_CONFIRMED", byCode.get("PV10B-B-EXPORT"), assignment(byCode.get("PV10B-B-EXPORT")), contacts.get("PV10B-B-EXPORT"), "VISIT", VISIT_SCOPES),
      accessDefinition("C_CHANGE_REQUESTED", byCode.get("PV15B-B-INTERIOR"), assignment(byCode.get("PV15B-B-INTERIOR")), contacts.get("PV15B-B-INTERIOR"), "VISIT", VISIT_SCOPES),
      accessDefinition("D_VIRTUAL", byCode.get("PV10B-C-PENDING"), assignment(byCode.get("PV10B-C-PENDING")), contacts.get("PV10B-C-PENDING"), "VISIT", ["VISIT_VIEW", "VISIT_CONFIRM"]),
      accessDefinition("E_MINI", byCode.get("PV15B-E-MINI"), assignment(byCode.get("PV15B-E-MINI")), contacts.get("PV15B-E-MINI"), "MINI_SURVEY", SURVEY_SCOPES),
      accessDefinition("G_CANCEL_REQUESTED", byCode.get("PV10B-D-QUOTES"), assignment(byCode.get("PV10B-D-QUOTES")), contacts.get("PV10B-D-QUOTES"), "VISIT", VISIT_SCOPES),
      accessDefinition("F_EXPIRED", byCode.get("PV10B-A-LOCAL"), assignment(byCode.get("PV10B-A-LOCAL")), contacts.get("PV10B-A-LOCAL"), "VISIT", ["VISIT_VIEW"]),
    ];
    const recoveryRef = old[0]?.accessRef;
    if (!recoveryRef) fail("RECOVERY_REFERENCE_MISSING");
    await prisma.$transaction(async (tx) => {
      for (const row of old.filter((entry) => entry.status === "ACTIVE")) {
        await tx.clientTemporaryAccess.update({ where: { id: row.id }, data: { status: "REVOKED", revokedAt: new Date("2026-09-09T13:00:00.000Z"), revocationReason: "Preparación 16B reemplazada de forma segura", version: { increment: 1 } } });
        await tx.clientTemporaryAccessEvent.create({ data: { tenantId: tenant.id, accessId: row.id, eventType: "ACCESS_REVOKED", actorKind: "EMPLOYEE", actorMembershipId: admin.id, actorUserId: admin.userId, metadata: { reasonRecorded: true, setupRecovery: true } } });
      }
      for (const definition of definitions) {
        const status = definition.name === "F_EXPIRED" ? "EXPIRED" : "ACTIVE";
        const row = await tx.clientTemporaryAccess.create({ data: { accessRef: definition.accessRef, tenantId: tenant.id, pipelineCaseId: definition.pipelineCase.id, clientId: definition.pipelineCase.clientId, surveyAssignmentId: definition.assignment.id, selectedContactId: definition.contact.id, tokenHash: sha(definition.token), shortCodeHash: scryptSync(definition.shortCode, definition.shortCodeSalt, 32).toString("hex"), shortCodeSalt: definition.shortCodeSalt, shortCodeExpiresAt: definition.expiresAt, purpose: definition.purpose, status, maxUses: 100, expiresAt: definition.expiresAt, issuedAt: definition.name === "F_EXPIRED" ? new Date("2026-09-01T12:00:00.000Z") : new Date("2026-09-09T12:00:00.000Z"), issuedByMembershipId: admin.id, issuedByUserId: admin.userId, grants: { create: definition.scopes.map((scope) => ({ scope })) }, events: { create: { eventType: "ACCESS_CREATED", actorKind: "EMPLOYEE", actorMembershipId: admin.id, actorUserId: admin.userId, metadata: { purpose: definition.purpose, scopeCount: definition.scopes.length, syntheticPreview: true } } } } });
        await tx.clientTemporaryAccessCommand.create({ data: { tenantId: tenant.id, accessId: row.id, requestId: definition.requestId, operation: "ACCESS_CREATE", payloadHash: definition.payloadHash, resultJson: { accessRef: definition.accessRef } } });
      }
    });
    credentials = Object.fromEntries(definitions.map((definition) => [definition.name, { accessRef: definition.accessRef, token: definition.token, shortCode: definition.shortCode, path: `/client-access/${definition.accessRef}#token=${definition.token}` }]));
    const unavailableToken = randomBytes(32).toString("base64url");
    credentials.F_REVOKED = { accessRef: recoveryRef, token: unavailableToken, shortCode: "", path: `/client-access/${recoveryRef}#token=${unavailableToken}` };
    writePrivateFile(credentials);
  } else credentials = credentialsFromPrivate(parsePrivateFile());

  const rows = await prisma.clientTemporaryAccess.findMany({ where: { tenantId: tenant.id, accessRef: { in: Object.values(credentials).map((entry) => entry.accessRef) } }, include: { surveyAssignment: { include: { evaluatorMembership: { include: { employeeProfile: true } } } } } });
  const byRef = new Map(rows.map((row) => [row.accessRef, row]));
  const bRow = byRef.get(credentials.B_CONFIRMED.accessRef); const cRow = byRef.get(credentials.C_CHANGE_REQUESTED.accessRef); const eRow = byRef.get(credentials.E_MINI.accessRef); const cancelRow = byRef.get(credentials.G_CANCEL_REQUESTED.accessRef);
  if (![bRow, cRow, eRow, cancelRow].every(Boolean)) fail("FINAL_ACCESS_FIXTURES_MISSING");
  await applyClientVisitAction(bRow.accessRef, credentials.B_CONFIRMED.token, signedVisit("v17-16b-final-confirm-b", { action: "VISIT_CONFIRM", expectedVersion: 0, reasonRef: null, comment: null, suggestedAvailability: [] }), prisma, new Date("2026-09-09T13:10:00.000Z"));
  const reason = await prisma.visitReason.findFirstOrThrow({ where: { tenantId: tenant.id, status: "ACTIVE", visibleToClient: true, requesterOrigin: "CLIENT", kind: "RESCHEDULE" }, orderBy: { createdAt: "asc" } });
  await applyClientVisitAction(cRow.accessRef, credentials.C_CHANGE_REQUESTED.token, signedVisit("v17-16b-final-change-c", { action: "VISIT_CHANGE_REQUEST", expectedVersion: 0, reasonRef: reason.reasonRef, comment: "Solicitud sintética del cliente", suggestedAvailability: ["2026-09-20T14:00:00.000Z", "2026-09-21T15:00:00.000Z"] }), prisma, new Date("2026-09-09T13:20:00.000Z"));
  const catalog = await prisma.surveyCatalogVersion.findFirstOrThrow({ where: { tenantId: tenant.id, status: "ACTIVE" }, orderBy: { version: "desc" } });
  for (let index = 1; index <= 10; index += 1) {
    const code = `PV16B-MINI-${String(index).padStart(2, "0")}`;
    if (!await prisma.surveyArticleCatalogItem.findFirst({ where: { tenantId: tenant.id, catalogVersionId: catalog.id, code } })) await prisma.surveyArticleCatalogItem.create({ data: { tenantId: tenant.id, catalogVersionId: catalog.id, articleRef: stableUuid(`article:${code}`), code, name: `Artículo Mini sintético ${index}`, aliases: ["portal-preview"], defaultVolumeM3: String((index * 0.025).toFixed(3)), defaultWeightKg: String((index * 1.5).toFixed(1)), weightSource: "CATALOG", sortOrder: 100 + index } });
  }
  const articles = await prisma.surveyArticleCatalogItem.findMany({ where: { tenantId: tenant.id, catalogVersionId: catalog.id, code: { startsWith: "PV16B-MINI-" } }, orderBy: { code: "asc" }, take: 10 });
  await saveClientMiniSurvey(eRow.accessRef, credentials.E_MINI.token, signed("MINI_SURVEY_COMPLETE", "v17-16b-final-mini-e", { expectedVersion: 0, submit: true, notes: "Información sintética aportada por el cliente", items: articles.map((item, index) => ({ articleRef: item.articleRef, quantity: index + 1, measurements: null, notes: null })) }), prisma, new Date("2026-09-09T13:30:00.000Z"));
  await applyClientVisitAction(cancelRow.accessRef, credentials.G_CANCEL_REQUESTED.token, signedVisit("v17-16b-final-cancel-g", { action: "VISIT_CANCEL_REQUEST", expectedVersion: 0, reasonRef: null, comment: "Cancelación sintética solicitada", suggestedAvailability: [] }), prisma, new Date("2026-09-09T13:40:00.000Z"));
  const evaluatorRef = bRow.surveyAssignment?.evaluatorMembership.employeeProfile?.profileRef;
  if (!evaluatorRef) fail("EVALUATOR_PROFILE_REQUIRED_FOR_QR");
  await confirmClientVisitQr(bRow.accessRef, credentials.B_CONFIRMED.token, signed("QR_CONFIRM", "v17-16b-final-qr-b", { qrPayload: `osi-visit:v1:${bRow.surveyAssignment.assignmentRef}:${evaluatorRef}` }), prisma, new Date("2026-09-09T13:50:00.000Z"));
  const accessStates = Object.fromEntries((await prisma.clientTemporaryAccess.groupBy({ by: ["status"], where: { tenantId: tenant.id }, _count: { _all: true } })).map((row) => [row.status, row._count._all]));
  const responseStates = Object.fromEntries((await prisma.clientTemporaryVisitResponse.groupBy({ by: ["state"], where: { tenantId: tenant.id }, _count: { _all: true } })).map((row) => [row.state, row._count._all]));
  console.log(JSON.stringify({ ok: true, database: EXPECTED_DATABASE, branch: EXPECTED_BRANCH, migrations: "35/35", usableScenarios: 8, accessStates, responseStates, miniTypes: 10, miniSource: "CLIENT_SUPPLIED", qrVerified: 1, externalTransports: 0, productionApiEnabled: false, privateManifestWritten: true }));
} finally { await prisma.$disconnect(); }
