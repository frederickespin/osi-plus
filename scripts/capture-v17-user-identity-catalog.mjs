// Read-only evidence from the disposable canonical CI database. This command
// never accepts, updates, or supplies an expected catalog fingerprint.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateAppliedMigrationHistory, validateMigrationFiles } from "./canonical-migrations.mjs";
import { createCrm01b1LocalPrisma, validateCrm01b1LocalUrl } from "./crm-01b1-local-target.mjs";
import {
  CATALOG_SQL, SQL_ONLY_SQL, EXTENSIONS_SQL, EXTENSION_MEMBERS_SQL,
  mapSqlOnlyObjects, summarizeCrm01b1Catalog,
} from "./crm-01b1-sql-drift-baseline.mjs";

function invariant(condition, message) {
  if (!condition) throw new Error(`V17_IDENTITY_CATALOG_EVIDENCE: ${message}`);
}

export async function captureUserIdentityCatalog({ root = process.cwd(), rawUrl = process.env.CRM01B1_TEST_DATABASE_URL } = {}) {
  invariant(process.env.CANONICAL_DB_VALIDATION === "true", "requires the disposable canonical CI environment");
  const candidateTarget = validateCrm01b1LocalUrl(rawUrl);
  invariant(candidateTarget.database === "osi_db01n_ci", "only the disposable canonical database is accepted");
  const names = validateMigrationFiles(root);
  invariant(names.length === 36 && names.at(-1) === "20261030010000_v17_user_identity_enrollment", "19C requires the exact named 36-migration inventory");
  const migrations = await Promise.all(names.map(async (name) => [name, await readFile(join(root, "prisma/migrations", name, "migration.sql"), "utf8")]));
  const migrationChecksums = Object.fromEntries(migrations.map(([name, sql]) => [name, createHash("sha256").update(sql).digest("hex")]));
  const { prisma, target } = await createCrm01b1LocalPrisma(rawUrl);
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '30s'");
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '1s'");
      const [server] = await tx.$queryRawUnsafe(`
        SELECT current_setting('server_version_num') AS version_number,
               current_setting('server_version') AS version,
               datcollate AS collation, datctype AS character_type
        FROM pg_database WHERE datname = current_database()
      `);
      invariant(Number(server.version_number) >= 180000 && Number(server.version_number) < 190000, "requires PostgreSQL 18");
      const history = await tx.$queryRawUnsafe(`
        SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count
        FROM "osi"."_prisma_migrations" ORDER BY migration_name
      `);
      const appliedNames = validateAppliedMigrationHistory(history);
      invariant(history.every((row) => row.checksum === migrationChecksums[row.migration_name]), "applied checksums differ from the reviewed source files");
      const catalogRows = await tx.$queryRawUnsafe(CATALOG_SQL);
      const sqlOnlyRows = await tx.$queryRawUnsafe(SQL_ONLY_SQL);
      const extensionEvidence = {
        extensions: await tx.$queryRawUnsafe(EXTENSIONS_SQL),
        members: await tx.$queryRawUnsafe(EXTENSION_MEMBERS_SQL),
      };
      return {
        evidenceOnly: true, baselineAccepted: false,
        profileCandidate: "canonical-36-user-identity-19c",
        target, server, history: { complete: appliedNames.length, migrations: appliedNames },
        migrationChecksums, catalog: summarizeCrm01b1Catalog(catalogRows),
        sqlOnly: mapSqlOnlyObjects(sqlOnlyRows, migrations, extensionEvidence.members),
        extensions: extensionEvidence.extensions,
        extensionMembers: {
          count: extensionEvidence.members.length,
          sha256: createHash("sha256").update(JSON.stringify(extensionEvidence.members)).digest("hex"),
        },
        catalogRows, sqlOnlyRows, extensionEvidence,
      };
    }, { maxWait: 5_000, timeout: 35_000 });
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const evidence = await captureUserIdentityCatalog();
    const evidencePath = process.env.V17_IDENTITY_CATALOG_EVIDENCE_PATH;
    if (evidencePath) await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    const { catalogRows: _catalogRows, sqlOnlyRows: _sqlOnlyRows, extensionEvidence: _extensionEvidence, ...summary } = evidence;
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ evidenceOnly: true, baselineAccepted: false, error: error.message })}\n`);
    process.exitCode = 1;
  }
}
