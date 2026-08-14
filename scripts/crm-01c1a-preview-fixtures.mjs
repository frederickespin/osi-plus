import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const PREFIX = "CRM01C1A-PREVIEW-20260813-";
const DATABASE = "crm01c1a_rehearsal";
const BRANCH = "br-mute-credit-ahxnvfx0";
const url = process.env.CRM01C1A_REHEARSAL_DIRECT_URL;
const action = process.argv[2] || "status";

function stop(message) { throw new Error(`CRM01C1A_FIXTURES: ${message}`); }
if (!url) stop("CRM01C1A_REHEARSAL_DIRECT_URL es obligatoria");
const parsed = new URL(url);
if (decodeURIComponent(parsed.pathname.slice(1)) !== DATABASE || parsed.searchParams.get("schema") !== "osi" || parsed.hostname.includes("pooler")) {
  stop("destino directo aislado inválido");
}
if (!['seed', 'status'].includes(action)) stop("acción no autorizada");

const prisma = new PrismaClient({ datasources: { db: { url } } });
const ids = Object.freeze({
  tenant: `${PREFIX}TENANT-A`, tenantB: `${PREFIX}TENANT-B`,
  admin: `${PREFIX}USER-A`, sales1: `${PREFIX}USER-V1`, sales2: `${PREFIX}USER-V2`, denied: `${PREFIX}USER-N`,
  adminM: `${PREFIX}MEM-A`, sales1M: `${PREFIX}MEM-V1`, sales2M: `${PREFIX}MEM-V2`, deniedM: `${PREFIX}MEM-N`,
});

async function identity() {
  const rows = await prisma.$queryRawUnsafe("SELECT current_database() AS database_name, current_setting('neon.branch_id', true) AS branch_id, EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'osi') AS schema_present");
  const row = rows[0];
  if (row?.database_name !== DATABASE || row?.schema_present !== true || row?.branch_id !== BRANCH) stop("identidad PostgreSQL distinta");
}

async function counts() {
  const [tenants, users, memberships, clients, projects, cases, commands, audits, sessions, refresh] = await Promise.all([
    prisma.tenant.count({ where: { id: { startsWith: PREFIX } } }),
    prisma.user.count({ where: { id: { startsWith: PREFIX } } }),
    prisma.tenantMembership.count({ where: { id: { startsWith: PREFIX } } }),
    prisma.client.count({ where: { code: { startsWith: PREFIX } } }),
    prisma.project.count({ where: { code: { startsWith: PREFIX } } }),
    prisma.pipelineCase.count({ where: { caseCode: { startsWith: PREFIX } } }),
    prisma.pipelineCaseCommand.count({ where: { pipelineCaseId: { startsWith: PREFIX } } }),
    prisma.commercialAuditLog.count({ where: { entityId: { startsWith: PREFIX } } }),
    prisma.authSession.count({ where: { userId: { startsWith: PREFIX } } }),
    prisma.authRefreshToken.count({ where: { session: { userId: { startsWith: PREFIX } } } }),
  ]);
  return { tenants, users, memberships, clients, projects, cases, commands, audits, sessions, refresh };
}

async function seed() {
  const adminPassword = process.env.CRM01C1A_ADMIN_PASSWORD;
  const salesPassword = process.env.CRM01C1A_SALES_PASSWORD;
  if (!adminPassword || !salesPassword) stop("credenciales sintéticas ausentes");
  const before = await counts();
  if (Object.values(before).some(Number)) stop("la base ya contiene fixtures del lote");
  const [adminHash, salesHash] = await Promise.all([bcrypt.hash(adminPassword, 10), bcrypt.hash(salesPassword, 10)]);
  await prisma.$transaction(async (tx) => {
    await tx.tenant.createMany({ data: [
      { id: ids.tenant, code: `${PREFIX}T-A`, name: `${PREFIX}Tenant A`, status: 'ACTIVE', provisioningBatchId: PREFIX },
      { id: ids.tenantB, code: `${PREFIX}T-B`, name: `${PREFIX}Tenant B`, status: 'ACTIVE', provisioningBatchId: PREFIX },
    ] });
    await tx.user.createMany({ data: [
      { id: ids.admin, code: `${PREFIX}A`, name: `${PREFIX}Administrador`, email: `${PREFIX.toLowerCase()}admin@example.test`, normalizedEmail: `${PREFIX.toLowerCase()}admin@example.test`, phone: '+10000000001', role: 'A', status: 'active', joinDate: '2026-08-13', passwordHash: adminHash },
      { id: ids.sales1, code: `${PREFIX}V1`, name: `${PREFIX}Vendedor Uno`, email: `${PREFIX.toLowerCase()}v1@example.test`, normalizedEmail: `${PREFIX.toLowerCase()}v1@example.test`, phone: '+10000000002', role: 'V', status: 'active', joinDate: '2026-08-13', passwordHash: salesHash },
      { id: ids.sales2, code: `${PREFIX}V2`, name: `${PREFIX}Vendedor Dos`, email: `${PREFIX.toLowerCase()}v2@example.test`, normalizedEmail: `${PREFIX.toLowerCase()}v2@example.test`, phone: '+10000000003', role: 'V', status: 'active', joinDate: '2026-08-13', passwordHash: salesHash },
      { id: ids.denied, code: `${PREFIX}N`, name: `${PREFIX}Sin Permiso`, email: `${PREFIX.toLowerCase()}denied@example.test`, normalizedEmail: `${PREFIX.toLowerCase()}denied@example.test`, phone: '+10000000004', role: 'N', status: 'active', joinDate: '2026-08-13', passwordHash: salesHash },
    ] });
    await tx.tenantMembership.createMany({ data: [
      { id: ids.adminM, tenantId: ids.tenant, userId: ids.admin, role: 'A', status: 'ACTIVE', isDefault: true, authorizationVersion: 1, provisioningBatchId: PREFIX },
      { id: ids.sales1M, tenantId: ids.tenant, userId: ids.sales1, role: 'V', status: 'ACTIVE', isDefault: true, authorizationVersion: 1, provisioningBatchId: PREFIX },
      { id: ids.sales2M, tenantId: ids.tenant, userId: ids.sales2, role: 'V', status: 'ACTIVE', isDefault: true, authorizationVersion: 1, provisioningBatchId: PREFIX },
      { id: ids.deniedM, tenantId: ids.tenantB, userId: ids.denied, role: 'N', status: 'ACTIVE', isDefault: true, authorizationVersion: 1, provisioningBatchId: PREFIX },
    ] });
    await tx.client.createMany({ data: Array.from({ length: 7 }, (_, index) => ({
      id: `${PREFIX}CLIENT-${index + 1}`, tenantId: ids.tenant, code: `${PREFIX}CLI-${index + 1}`, name: `${PREFIX}Cliente ${index + 1}`,
      email: `client${index + 1}@example.test`, phone: `+1000000010${index}`, address: `${PREFIX}Address`, type: 'SYNTHETIC', status: 'ACTIVE', createdAt: '2026-08-13',
    })) });
    await tx.pipelineCase.createMany({ data: Array.from({ length: 51 }, (_, index) => {
      const number = index + 1;
      const status = number <= 4 ? 'APPROVED' : number <= 8 ? 'OPS_HANDOFF' : number <= 14 ? 'SURVEY_SCHEDULED' : number <= 20 ? 'NEGOTIATION' : 'NEW_INBOX';
      const owner = number <= 39 ? (number % 2 ? { ownerMembershipId: ids.sales1M, ownerUserId: ids.sales1 } : { ownerMembershipId: ids.sales2M, ownerUserId: ids.sales2 }) : {};
      return { id: `${PREFIX}CASE-${number}`, tenantId: ids.tenant, caseCode: `${PREFIX}CASE-${number}`, clientName: `${PREFIX}Cliente ${((index % 7) + 1)}`, mode: 'LOCAL', serviceType: 'SYNTHETIC', customerType: 'L3_CORPORATE', status, version: 1, ownerName: owner.ownerMembershipId ? `${PREFIX}Owner` : 'Sin asignar', originLocation: `${PREFIX}Origin`, destinationLocation: `${PREFIX}Destination`, ...owner };
    }) });
    await tx.project.createMany({ data: Array.from({ length: 2 }, (_, index) => ({ id: `${PREFIX}PROJECT-${index + 1}`, tenantId: ids.tenant, pipelineCaseId: `${PREFIX}CASE-${21 + index}`, code: `${PREFIX}PRJ-${index + 1}`, name: `${PREFIX}Proyecto ${index + 1}`, clientId: `${PREFIX}CLIENT-${index + 1}`, clientName: `${PREFIX}Cliente ${index + 1}`, status: 'ACTIVE', startDate: '2026-08-13' })) });
    await tx.pipelineEvent.createMany({ data: Array.from({ length: 6 }, (_, index) => ({ id: `${PREFIX}EVIDENCE-${index + 1}`, caseId: `${PREFIX}CASE-${9 + index}`, eventType: 'SURVEY', status: index < 3 ? 'DONE' : 'PENDING', startAt: new Date('2026-08-13T12:00:00Z'), code: `${PREFIX}EVIDENCE-${index + 1}` })) });
  }, { maxWait: 5_000, timeout: 20_000 });
  const after = await counts();
  if (JSON.stringify(after) !== JSON.stringify({ tenants: 2, users: 4, memberships: 4, clients: 7, projects: 2, cases: 51, commands: 0, audits: 0, sessions: 0, refresh: 0 })) stop("conteos posteriores inesperados");
  return after;
}

try {
  await identity();
  const result = action === 'seed' ? await seed() : await counts();
  process.stdout.write(`${JSON.stringify({ ok: true, action, database: DATABASE, branch: BRANCH, counts: result })}\n`);
} finally {
  await prisma.$disconnect();
}
