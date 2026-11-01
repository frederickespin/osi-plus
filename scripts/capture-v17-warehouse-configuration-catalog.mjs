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
  CANONICAL_37_FLEET_DRIVERS_CATALOG, CANONICAL_37_FLEET_DRIVERS_SQL_ONLY_COUNTS,
  mapSqlOnlyObjects, summarizeCrm01b1Catalog, validateCrm01b1CatalogSummary, validateSqlOnlyInventory,
} from "./crm-01b1-sql-drift-baseline.mjs";

import { WAREHOUSE_CONFIGURATION_MIGRATION, WAREHOUSE_CONFIGURATION_MIGRATION_CHECKSUM, WAREHOUSE_CONFIGURATION_TABLES, WAREHOUSE_CONFIGURATION_FUNCTIONS, WAREHOUSE_CONFIGURATION_ENUMS } from "../shared/warehouseConfigurationMigration.js";
export { WAREHOUSE_CONFIGURATION_MIGRATION, WAREHOUSE_CONFIGURATION_TABLES, WAREHOUSE_CONFIGURATION_FUNCTIONS, WAREHOUSE_CONFIGURATION_ENUMS } from "../shared/warehouseConfigurationMigration.js";

function invariant(condition, message) {
  if (!condition) throw new Error(`V17_WAREHOUSE_CONFIGURATION_CATALOG_EVIDENCE: ${message}`);
}

export function partitionWarehouseConfigurationCatalog(catalogRows) {
  const belongsToWarehouseConfiguration = (row) => row.schema_name === "osi" && (WAREHOUSE_CONFIGURATION_TABLES.includes(row.table_name)
    || (row.kind === "function" && WAREHOUSE_CONFIGURATION_FUNCTIONS.includes(row.object_name))
    || (row.kind === "enum" && WAREHOUSE_CONFIGURATION_ENUMS.some((name) => row.object_name.startsWith(name + ":"))));
  return {
    previousRows: catalogRows.filter((row) => !belongsToWarehouseConfiguration(row)),
    deltaRows: catalogRows.filter(belongsToWarehouseConfiguration),
  };
}

export async function captureWarehouseConfigurationCatalog({ root = process.cwd(), rawUrl = process.env.CRM01B1_TEST_DATABASE_URL } = {}) {
  invariant(process.env.CANONICAL_DB_VALIDATION === "true", "requires the disposable canonical CI environment");
  const candidateTarget = validateCrm01b1LocalUrl(rawUrl);
  invariant(candidateTarget.database === "osi_db01n_ci", "only the disposable canonical database is accepted");
  const names = validateMigrationFiles(root);
  invariant(names.length === 38 && names.at(-1) === WAREHOUSE_CONFIGURATION_MIGRATION, "20B requires the exact named 38-migration inventory");
  const migrations = await Promise.all(names.map(async (name) => [name, await readFile(join(root, "prisma/migrations", name, "migration.sql"), "utf8")]));
  const migrationChecksums = Object.fromEntries(migrations.map(([name, sql]) => [name, createHash("sha256").update(sql).digest("hex")]));
  invariant(migrationChecksums[WAREHOUSE_CONFIGURATION_MIGRATION] === WAREHOUSE_CONFIGURATION_MIGRATION_CHECKSUM, "20B SQL differs from reviewed source");
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
      const { previousRows, deltaRows } = partitionWarehouseConfigurationCatalog(catalogRows);
      const previousCatalog = summarizeCrm01b1Catalog(previousRows);
      validateCrm01b1CatalogSummary(previousCatalog, CANONICAL_37_FLEET_DRIVERS_CATALOG);
      const sqlOnly = mapSqlOnlyObjects(sqlOnlyRows, migrations, extensionEvidence.members);
      invariant(sqlOnly.unmapped.length === 0, "SQL-only objects lack migration provenance");
      const { [WAREHOUSE_CONFIGURATION_MIGRATION]: ownSqlOnlyCounts, ...previousSqlOnlyCounts } = sqlOnly.counts;
      invariant(ownSqlOnlyCounts, "20B SQL-only objects were not measured");
      validateSqlOnlyInventory({ counts: previousSqlOnlyCounts, unmapped: [] }, CANONICAL_37_FLEET_DRIVERS_SQL_ONLY_COUNTS);
      return {
        evidenceOnly: true, baselineAccepted: false, capturedAt: new Date().toISOString(),
        profileCandidate: "canonical-38-warehouse-configuration-20b",
        provenance: { kind: "LOCAL_DISPOSABLE_POSTGRESQL", server, catalogQuerySha256: createHash("sha256").update(CATALOG_SQL).digest("hex"), previousObjectsUnchangedAfterMigration: true },
        migration: { name: WAREHOUSE_CONFIGURATION_MIGRATION, sha256: WAREHOUSE_CONFIGURATION_MIGRATION_CHECKSUM },
        target, server, history: { complete: appliedNames.length, migrations: appliedNames },
        migrationChecksums, catalog: summarizeCrm01b1Catalog(catalogRows), previousCatalog,
        sqlOnly, previousSqlOnlyCounts,
        extensions: extensionEvidence.extensions,
        extensionMembers: {
          count: extensionEvidence.members.length,
          sha256: createHash("sha256").update(JSON.stringify(extensionEvidence.members)).digest("hex"),
        },
        delta: {
          tables: WAREHOUSE_CONFIGURATION_TABLES, functions: WAREHOUSE_CONFIGURATION_FUNCTIONS, enums: WAREHOUSE_CONFIGURATION_ENUMS,
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
    const evidence = await captureWarehouseConfigurationCatalog();
    const evidencePath = process.env.V17_WAREHOUSE_CONFIGURATION_CATALOG_EVIDENCE_PATH;
    if (evidencePath) await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    const { catalogRows: _catalogRows, sqlOnlyRows: _sqlOnlyRows, extensionEvidence: _extensionEvidence, delta, ...summary } = evidence;
    process.stdout.write(`${JSON.stringify({ ...summary, delta: { ...delta, rows: undefined } }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ evidenceOnly: true, baselineAccepted: false, error: error.message })}\n`);
    process.exitCode = 1;
  }
}
