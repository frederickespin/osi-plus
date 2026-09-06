import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const raw = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!raw) throw new Error("V17_RELATIONSHIPS_PREVIEW_DATABASE_REQUIRED");
const target = new URL(raw);
if (decodeURIComponent(target.pathname.slice(1)) !== "v17_consolidated_preview_10b" || target.searchParams.get("schema") !== "osi" || /fragrant-night|bitter-bush/i.test(target.hostname)) throw new Error("V17_RELATIONSHIPS_PREVIEW_DATABASE_FORBIDDEN");
const prisma = new PrismaClient({ datasources: { db: { url: raw } } });
function digest(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16); }

try {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await tx.$executeRawUnsafe("SET LOCAL search_path = osi, public");
    const identity = await tx.$queryRawUnsafe("SELECT current_database() AS database, current_schema() AS schema, current_setting('neon.branch_id', true) AS branch");
    const migrations = await tx.$queryRawUnsafe("SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count FROM osi._prisma_migrations ORDER BY migration_name");
    const scenarios = await tx.pipelineCase.findMany({ where: { tenant: { code: "V17-CONSOLIDATED-PREVIEW-10B" }, caseCode: { in: ["PV10B-A-LOCAL", "PV10B-B-EXPORT", "PV10B-C-PENDING", "PV10B-D-QUOTES"] } }, select: { id: true, caseCode: true, commercialContexts: { select: { version: true, logicalSha256: true, parties: { select: { role: true } } }, orderBy: { version: "asc" } }, quoteProposals: { select: { id: true, revisions: { select: { commercialContextSnapshot: true, payerSnapshot: true }, orderBy: { revision: "desc" }, take: 1 } } } }, orderBy: { caseCode: "asc" } });
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { code: "V17-CONSOLIDATED-PREVIEW-10B" } });
    const other = await tx.tenant.findUniqueOrThrow({ where: { code: "V17-CONSOLIDATED-PREVIEW-10B-X" } });
    const counts = { entities: await tx.commercialEntity.count({ where: { tenantId: tenant.id } }), relationships: await tx.commercialRelationship.count({ where: { tenantId: tenant.id } }), contexts: await tx.pipelineCaseCommercialContextVersion.count({ where: { tenantId: tenant.id } }), tariffs: await tx.commercialTariffVersion.count({ where: { tenantId: tenant.id } }), agreements: await tx.commercialPricingAgreementVersion.count({ where: { tenantId: tenant.id } }), referrals: await tx.commercialReferralAgreementVersion.count({ where: { tenantId: tenant.id } }), commissions: await tx.commercialCommissionAgreementVersion.count({ where: { tenantId: tenant.id } }), associations: await tx.commercialAssociationMembership.count({ where: { tenantId: tenant.id } }), certifications: await tx.commercialCertification.count({ where: { tenantId: tenant.id } }), crossTenantEntities: await tx.commercialEntity.count({ where: { tenantId: other.id } }) };
    const locks = await tx.$queryRawUnsafe("SELECT count(*)::int AS count FROM pg_locks WHERE NOT granted");
    return { identity, migrations, scenarios, counts, locks };
  });
  assert.equal(result.identity[0].database, "v17_consolidated_preview_10b");
  assert.equal(result.identity[0].schema, "osi");
  assert.equal(result.identity[0].branch, "br-mute-credit-ahxnvfx0");
  assert.equal(result.migrations.length, 31);
  assert.equal(result.migrations.filter((row) => !row.finished_at || row.rolled_back_at || row.applied_steps_count !== 1).length, 0);
  assert.equal(result.scenarios.length, 4);
  assert.equal(result.scenarios.every((row) => row.commercialContexts.length >= 1), true);
  assert.equal(result.counts.crossTenantEntities >= 1, true);
  console.log(JSON.stringify({ ok: true, database: result.identity[0].database, schema: result.identity[0].schema, branch: result.identity[0].branch, migrations: { applied: 31, pending: 0, failed: 0, checksumFingerprint: digest(result.migrations.map((row) => [row.migration_name, row.checksum])) }, scenarios: result.scenarios.map((row) => ({ caseCode: row.caseCode, contextVersions: row.commercialContexts.map((item) => item.version), quoteSnapshots: row.quoteProposals.length })), counts: result.counts, waitingLocks: result.locks[0].count, transaction: "ROLLED_BACK", productionApiEnabled: false }));
} finally {
  await prisma.$disconnect();
}
