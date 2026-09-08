import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { listCommunicationRecords, listCommunicationRecipients, listCommunicationTemplates } from "../api/_lib/communicationsDomain.js";
import { normalizeTemplateCreate } from "../api/_lib/communicationsContract.js";
import { COMMUNICATION_TRANSPORT_CAPABILITIES } from "../api/_lib/communicationsTransport.js";

const EXPECTED_DATABASE = "v17_consolidated_preview_10b";
const EXPECTED_BRANCH = "br-mute-credit-ahxnvfx0";
const TENANT_CODE = "V17-CONSOLIDATED-PREVIEW-10B";
const OTHER_TENANT_CODE = "V17-CONSOLIDATED-PREVIEW-10B-X";
function fail(code) { throw new Error(`V17_COMMUNICATIONS_PREVIEW_VERIFY_BLOCKED:${code}`); }
const raw = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!raw || process.env.VERCEL_ENV === "production") fail("ENVIRONMENT");
const url = new URL(raw);
if (decodeURIComponent(url.pathname.slice(1)) !== EXPECTED_DATABASE || url.searchParams.get("schema") !== "osi" || /fragrant-night|bitter-bush/i.test(url.hostname)) fail("DATABASE");
const prisma = new PrismaClient({ datasources: { db: { url: raw } } });

try {
  const identity = await prisma.$queryRawUnsafe("SELECT current_database() AS database, current_setting('neon.branch_id', true) AS branch");
  assert.equal(identity[0]?.database, EXPECTED_DATABASE); assert.equal(identity[0]?.branch, EXPECTED_BRANCH);
  const migrations = await prisma.$queryRawUnsafe("SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count FROM osi._prisma_migrations ORDER BY migration_name");
  assert.equal(migrations.length, 33); assert.ok(migrations.every((row) => row.finished_at && !row.rolled_back_at && row.applied_steps_count === 1));
  const migration32 = migrations.find((row) => row.migration_name === "20260913010000_v17_communications_templates");
  const localSha = createHash("sha256").update(readFileSync("prisma/migrations/20260913010000_v17_communications_templates/migration.sql")).digest("hex");
  assert.equal(migration32?.checksum, localSha);

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: TENANT_CODE } });
  const other = await prisma.tenant.findUniqueOrThrow({ where: { code: OTHER_TENANT_CODE } });
  const admin = await prisma.tenantMembership.findFirstOrThrow({ where: { tenantId: tenant.id, role: "A", status: "ACTIVE" }, include: { user: true } });
  const deny = await prisma.tenantMembership.findFirstOrThrow({ where: { tenantId: tenant.id, deniedPermissions: { has: "pipeline:view" }, status: "ACTIVE" } });
  const required = ["communications:templates:view", "communications:templates:manage", "communications:view", "communications:prepare", "communications:send", "communications:tenant"];
  assert.ok(required.every((permission) => admin.grantedPermissions.includes(permission) && !admin.deniedPermissions.includes(permission)));
  assert.ok(deny.deniedPermissions.includes("pipeline:view"));
  const context = { tenantId: tenant.id, membershipId: admin.id, userId: admin.userId, role: "A", effectivePermissions: admin.grantedPermissions, deniedPermissions: admin.deniedPermissions };
  const templates = await listCommunicationTemplates(prisma, context);
  assert.deepEqual({ total: templates.length, published: templates.filter((row) => row.state === "PUBLISHED").length, draft: templates.filter((row) => row.state === "DRAFT").length, inactive: templates.filter((row) => row.state === "INACTIVE").length }, { total: 8, published: 6, draft: 1, inactive: 1 });

  const cases = await prisma.pipelineCase.findMany({ where: { tenantId: tenant.id, caseCode: { in: ["PV10B-B-EXPORT", "PV10B-C-PENDING", "PV10B-D-QUOTES"] } } });
  const byCode = new Map(cases.map((row) => [row.caseCode, row]));
  const visitRecords = await listCommunicationRecords(prisma, context, byCode.get("PV10B-B-EXPORT").publicRef);
  const corporateRecords = await listCommunicationRecords(prisma, context, byCode.get("PV10B-C-PENDING").publicRef);
  const quoteRecords = await listCommunicationRecords(prisma, context, byCode.get("PV10B-D-QUOTES").publicRef);
  assert.ok(visitRecords.length >= 5); assert.ok(corporateRecords.length >= 3); assert.ok(quoteRecords.length >= 6);
  assert.ok([...visitRecords, ...corporateRecords, ...quoteRecords].every((row) => row.status === "PREPARED" && !row.sentAt && !row.deliveredAt));
  assert.ok([...visitRecords, ...corporateRecords, ...quoteRecords].every((row) => !row.recipient.destination || /\*{3}/.test(row.recipient.destination)));
  const corporateRecipientTypes = new Set(corporateRecords.map((row) => row.recipientType));
  assert.ok(["BOOKER", "LEAD_ACCOUNT", "AGENT"].every((type) => corporateRecipientTypes.has(type)));
  const quoteMilestones = new Set(quoteRecords.map((row) => row.milestone));
  assert.ok(["QUOTE_SENT", "FOLLOW_UP_1", "FOLLOW_UP_2", "EXPIRY_REMINDER", "QUOTE_ACCEPTED", "QUOTE_REJECTED"].every((milestone) => quoteMilestones.has(milestone)));
  assert.ok(visitRecords.some((row) => row.milestone === "VISIT_CONFIRMATION")); assert.ok(visitRecords.some((row) => row.milestone === "VISIT_RESCHEDULED")); assert.ok(visitRecords.some((row) => row.milestone === "VISIT_CANCELLED"));

  const crossCase = await prisma.pipelineCase.findFirstOrThrow({ where: { tenantId: other.id, caseCode: "PV10B-X-TENANT-SENTINEL" } });
  await assert.rejects(() => listCommunicationRecipients(prisma, context, crossCase.publicRef), (error) => error?.status === 404);
  assert.equal(templates.some((row) => row.code === "PV13B-X-TENANT-SENTINEL"), false);
  assert.deepEqual(COMMUNICATION_TRANSPORT_CAPABILITIES, { EMAIL: false, WHATSAPP: false, PORTAL: false, SMS: false, INTERNAL: false });
  const unsafePayload = { requestId: "preview-unsafe", payloadHash: "0".repeat(64), code: "UNSAFE_HTML", name: "Unsafe", category: "DOCUMENT_REQUEST", audiences: ["CLIENT"], channels: ["EMAIL"], subject: null, bodyText: "Seguro", bodyHtml: "<script>alert(1)</script>", variables: [], validFrom: null, validTo: null };
  assert.throws(() => normalizeTemplateCreate(unsafePayload), /COMMUNICATION_HTML_UNSAFE/);
  const counts = { records: visitRecords.length + corporateRecords.length + quoteRecords.length, prepared: await prisma.communicationRecord.count({ where: { tenantId: tenant.id, status: "PREPARED" } }), sent: await prisma.communicationRecord.count({ where: { tenantId: tenant.id, status: { in: ["SENT", "DELIVERED"] } } }), commands: await prisma.communicationCommand.count({ where: { tenantId: tenant.id } }), audits: await prisma.communicationAuditEvent.count({ where: { tenantId: tenant.id } }) };
  assert.ok(counts.records >= 14); assert.ok(counts.prepared >= counts.records); assert.equal(counts.sent, 0);
  console.log(JSON.stringify({ ok: true, database: EXPECTED_DATABASE, branch: EXPECTED_BRANCH, migrations: "33/33", checksum: localSha, templates: { total: 8, published: 6, draft: 1, inactive: 1 }, records: { scopedTotal: counts.records, visit: visitRecords.length, corporate: corporateRecords.length, quote: quoteRecords.length, preparedTenantWide: counts.prepared, sent: 0 }, permissions: { view: true, manage: true, prepare: true, sendPermissionTransportClosed: true, denyShellAuthority: true }, crossTenantBlocked: true, piiMasked: true, unsafeHtmlBlocked: true, externalTransport: { EMAIL: 0, WHATSAPP: 0, SMS: 0, PORTAL: 0, WEBHOOK: 0 }, audit: { commands: counts.commands, events: counts.audits } }));
} finally { await prisma.$disconnect(); }
