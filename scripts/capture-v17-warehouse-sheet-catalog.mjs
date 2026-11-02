// Read-only evidence from the disposable canonical database. Capturing a new
// catalog never accepts it or changes a frozen baseline.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateAppliedMigrationHistory, validateMigrationFiles } from "./canonical-migrations.mjs";
import { createCrm01b1LocalPrisma, validateCrm01b1LocalUrl } from "./crm-01b1-local-target.mjs";
import {
  CATALOG_SQL, SQL_ONLY_SQL, EXTENSIONS_SQL, EXTENSION_MEMBERS_SQL,
  CANONICAL_38_WAREHOUSE_CONFIGURATION_CATALOG, CANONICAL_38_WAREHOUSE_CONFIGURATION_SQL_ONLY_COUNTS,
  mapSqlOnlyObjects, summarizeCrm01b1Catalog, validateCrm01b1CatalogSummary, validateSqlOnlyInventory,
} from "./crm-01b1-sql-drift-baseline.mjs";

import { WAREHOUSE_SHEET_MIGRATION, WAREHOUSE_SHEET_MIGRATION_CHECKSUM, WAREHOUSE_SHEET_TABLES, WAREHOUSE_SHEET_FUNCTIONS, WAREHOUSE_SHEET_ENUMS } from "../shared/warehouseSheetMigration.js";
export { WAREHOUSE_SHEET_MIGRATION, WAREHOUSE_SHEET_TABLES, WAREHOUSE_SHEET_FUNCTIONS, WAREHOUSE_SHEET_ENUMS } from "../shared/warehouseSheetMigration.js";

function invariant(condition, message) {
  if (!condition) throw new Error(`V17_WAREHOUSE_SHEET_CATALOG_EVIDENCE: ${message}`);
}

export function partitionWarehouseSheetCatalog(catalogRows) {
  const belongsToWarehouseSheet = (row) => row.schema_name === "osi" && (WAREHOUSE_SHEET_TABLES.includes(row.table_name)
    || (row.kind === "function" && WAREHOUSE_SHEET_FUNCTIONS.includes(row.object_name))
    || (row.kind === "enum" && WAREHOUSE_SHEET_ENUMS.some((name) => row.object_name.startsWith(name + ":"))));
  return {
    previousRows: catalogRows.filter((row) => !belongsToWarehouseSheet(row)),
    deltaRows: catalogRows.filter(belongsToWarehouseSheet),
  };
}

export async function captureWarehouseSheetCatalog({ root = process.cwd(), rawUrl = process.env.CRM01B1_TEST_DATABASE_URL } = {}) {
  invariant(process.env.CANONICAL_DB_VALIDATION === "true", "requires the disposable canonical CI environment");
  const candidateTarget = validateCrm01b1LocalUrl(rawUrl);
  invariant(candidateTarget.database === "osi_db01n_ci", "only the disposable canonical database is accepted");
  const names = validateMigrationFiles(root).filter((name) => name <= WAREHOUSE_SHEET_MIGRATION);
  invariant(names.length === 39 && names.at(-1) === WAREHOUSE_SHEET_MIGRATION, "20C requires the exact named 39-migration inventory");
  const migrations = await Promise.all(names.map(async (name) => [name, await readFile(join(root, "prisma/migrations", name, "migration.sql"), "utf8")]));
  const migrationChecksums = Object.fromEntries(migrations.map(([name, sql]) => [name, createHash("sha256").update(sql).digest("hex")]));
  invariant(migrationChecksums[WAREHOUSE_SHEET_MIGRATION] === WAREHOUSE_SHEET_MIGRATION_CHECKSUM, "20C SQL differs from reviewed source");
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
      const appliedNames = validateAppliedMigrationHistory(history, { throughMigration: WAREHOUSE_SHEET_MIGRATION });
      invariant(history.every((row) => row.checksum === migrationChecksums[row.migration_name]), "applied checksums differ from the reviewed source files");
      const catalogRows = await tx.$queryRawUnsafe(CATALOG_SQL);
      const sqlOnlyRows = await tx.$queryRawUnsafe(SQL_ONLY_SQL);
      const extensionEvidence = {
        extensions: await tx.$queryRawUnsafe(EXTENSIONS_SQL),
        members: await tx.$queryRawUnsafe(EXTENSION_MEMBERS_SQL),
      };
      const { previousRows, deltaRows } = partitionWarehouseSheetCatalog(catalogRows);
      const previousCatalog = summarizeCrm01b1Catalog(previousRows);
      validateCrm01b1CatalogSummary(previousCatalog, CANONICAL_38_WAREHOUSE_CONFIGURATION_CATALOG);
      const sqlOnly = mapSqlOnlyObjects(sqlOnlyRows, migrations, extensionEvidence.members);
      invariant(sqlOnly.unmapped.length === 0, "SQL-only objects lack migration provenance");
      const { [WAREHOUSE_SHEET_MIGRATION]: ownSqlOnlyCounts, ...previousSqlOnlyCounts } = sqlOnly.counts;
      invariant(ownSqlOnlyCounts, "20C SQL-only objects were not measured");
      validateSqlOnlyInventory({ counts: previousSqlOnlyCounts, unmapped: [] }, CANONICAL_38_WAREHOUSE_CONFIGURATION_SQL_ONLY_COUNTS);
      return {
        evidenceOnly: true, baselineAccepted: false, capturedAt: new Date().toISOString(),
        profileCandidate: "canonical-39-warehouse-sheet-20c",
        provenance: { kind: "LOCAL_DISPOSABLE_POSTGRESQL", server, catalogQuerySha256: createHash("sha256").update(CATALOG_SQL).digest("hex"), previousObjectsUnchangedAfterMigration: true },
        migration: { name: WAREHOUSE_SHEET_MIGRATION, sha256: WAREHOUSE_SHEET_MIGRATION_CHECKSUM },
        target, server, history: { complete: appliedNames.length, migrations: appliedNames },
        migrationChecksums, catalog: summarizeCrm01b1Catalog(catalogRows), previousCatalog,
        sqlOnly, previousSqlOnlyCounts,
        extensions: extensionEvidence.extensions,
        extensionMembers: {
          count: extensionEvidence.members.length,
          sha256: createHash("sha256").update(JSON.stringify(extensionEvidence.members)).digest("hex"),
        },
        delta: {
          tables: WAREHOUSE_SHEET_TABLES, functions: WAREHOUSE_SHEET_FUNCTIONS, enums: WAREHOUSE_SHEET_ENUMS,
          catalog: summarizeCrm01b1Catalog(deltaRows), rows: deltaRows, sqlOnlyCounts: ownSqlOnlyCounts,
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
    const evidence = await captureWarehouseSheetCatalog();
    const evidencePath = process.env.V17_WAREHOUSE_SHEET_CATALOG_EVIDENCE_PATH;
    if (evidencePath) await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    const { catalogRows: _catalogRows, sqlOnlyRows: _sqlOnlyRows, extensionEvidence: _extensionEvidence, delta, ...summary } = evidence;
    process.stdout.write(`${JSON.stringify({ ...summary, delta: { ...delta, rows: undefined } }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ evidenceOnly: true, baselineAccepted: false, error: error.message })}\n`);
    process.exitCode = 1;
  }
}
