// Read-only, independently captured 39 -> 40 evidence. The nullable column and
// one CHECK are additions; one existing function is deliberately replaced.
// Neither a capture nor a transition check accepts or rewrites a baseline.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WAREHOUSE_ROUTES_MIGRATION, WAREHOUSE_ROUTES_MIGRATION_CHECKSUM } from "../shared/warehouseRoutesMigration.js";
import { WAREHOUSE_SHEET_MIGRATION } from "../shared/warehouseSheetMigration.js";
import { validateAppliedMigrationHistory, validateMigrationFiles } from "./canonical-migrations.mjs";
import { createCrm01b1LocalPrisma, validateCrm01b1LocalUrl } from "./crm-01b1-local-target.mjs";
import { createWarehouseConfigurationPg17LocalPrisma } from "./v17-warehouse-configuration-pg17-local-target.mjs";
import {
  CATALOG_SQL, SQL_ONLY_SQL, EXTENSIONS_SQL, EXTENSION_MEMBERS_SQL,
  mapSqlOnlyObjects, summarizeCrm01b1Catalog,
} from "./crm-01b1-sql-drift-baseline.mjs";

export { WAREHOUSE_ROUTES_MIGRATION, WAREHOUSE_ROUTES_MIGRATION_CHECKSUM } from "../shared/warehouseRoutesMigration.js";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const fields = ["kind", "schema_name", "table_name", "object_name", "definition"];
const addedKeys = [
  "check|osi|warehouse_location_addresses|warehouse_location_addresses_zone_code_check",
  "column|osi|warehouse_location_addresses|zone_code",
];
const replacedKey = "function|osi||v17_warehouse_location_address_guard()";
const key = (row) => fields.slice(0, 4).map((field) => row[field]).join("|");
function invariant(condition, message) {
  if (!condition) throw new Error(`WAREHOUSE_ROUTES_CATALOG: ${message}`);
}

export function sortWarehouseRoutesCatalogRows(rows) {
  return [...rows].sort((left, right) => {
    for (const field of fields) {
      if (left[field] < right[field]) return -1;
      if (left[field] > right[field]) return 1;
    }
    return 0;
  });
}

export function partitionWarehouseRoutesCatalog(rows) {
  return {
    preservedRows: rows.filter((row) => !addedKeys.includes(key(row)) && key(row) !== replacedKey),
    addedRows: rows.filter((row) => addedKeys.includes(key(row))),
    replacedRows: rows.filter((row) => key(row) === replacedKey),
  };
}

function validateEvidenceIdentity(evidence, phase, serverMajor) {
  invariant([17, 18].includes(serverMajor), "requires an explicit PostgreSQL17 or18 profile");
  invariant(evidence?.evidenceOnly === true && evidence.baselineAccepted === false && evidence.phase === phase,
    "evidence phase or acceptance marker invalid");
  invariant(evidence.provenance?.kind === "LOCAL_DISPOSABLE_POSTGRESQL"
    && evidence.server?.version_number === (serverMajor === 17 ? "170011" : "180006"),
  "requires independently measured PostgreSQL17.11 or18.6 evidence");
  invariant(evidence.target?.database === (serverMajor === 17 ? "osi_warehouse_17_compat" : "osi_db01n_ci")
    && evidence.target.schema === "osi" && evidence.target.address === "127.0.0.1"
    && evidence.target.port === (serverMajor === 17 ? 55434 : 55432)
    && (serverMajor !== 17 || evidence.target.serverVersion === 170011), "evidence target invalid");
  invariant(evidence.provenance.catalogQuerySha256 === sha256(CATALOG_SQL)
    && evidence.provenance.sqlOnlyQuerySha256 === sha256(SQL_ONLY_SQL)
    && evidence.provenance.searchPath === "osi" && evidence.provenance.readOnly === true,
  "catalog query or read-only snapshot scope changed");
  invariant(evidence.migration?.name === WAREHOUSE_ROUTES_MIGRATION
    && (phase === "before39" || evidence.migration.sha256 === WAREHOUSE_ROUTES_MIGRATION_CHECKSUM),
  "migration source is not the reviewed20D SQL");
  invariant(same(sortWarehouseRoutesCatalogRows(evidence.catalogRows), evidence.catalogRows)
    && same(summarizeCrm01b1Catalog(evidence.catalogRows), evidence.catalog), "catalog fingerprint/order invalid");
  const names = validateAppliedMigrationHistory(evidence.history?.rows, {
    throughMigration: phase === "before39" ? WAREHOUSE_SHEET_MIGRATION : WAREHOUSE_ROUTES_MIGRATION,
  });
  invariant(names.length === (phase === "before39" ? 39 : 40)
    && same(names, evidence.history.migrations) && names.length === evidence.history.complete,
  "history does not match its named checkpoint");
  invariant(same(Object.keys(evidence.migrationChecksums), names)
    && evidence.history.rows.every((row) => /^[0-9a-f]{64}$/u.test(row.checksum)
      && row.checksum === evidence.migrationChecksums[row.migration_name])
    && (phase === "before39" || evidence.migrationChecksums[WAREHOUSE_ROUTES_MIGRATION] === WAREHOUSE_ROUTES_MIGRATION_CHECKSUM),
  "history/source checksums differ");
  const partition = partitionWarehouseRoutesCatalog(evidence.catalogRows);
  invariant(partition.replacedRows.length === 1
    && same(partition.addedRows.map(key), phase === "before39" ? [] : addedKeys),
  "exact20D object identities do not match checkpoint");
  invariant(Array.isArray(evidence.dataFingerprint) && evidence.dataFingerprint.length > 0
    && new Set(evidence.dataFingerprint.map((row) => row.table)).size === evidence.dataFingerprint.length
    && evidence.dataFingerprint.every((row) => typeof row.table === "string"
      && Number.isSafeInteger(row.rows) && row.rows >= 0 && /^[0-9a-f]{64}$/u.test(row.sha256)),
  "data fingerprints invalid");
  invariant(evidence.extensionMembers?.count === evidence.extensionMemberRows?.length
    && evidence.extensionMembers.sha256 === sha256(JSON.stringify(evidence.extensionMemberRows)), "extension fingerprint invalid");
}

// This verifies the measured change without choosing a fixture or accepting it.
// The before capture can predate completion of SQL40; its39 source checksums are
// compared individually against40 instead of pretending both manifests match.
export function validateWarehouseRoutesCatalogChange(before, after, serverMajor) {
  validateEvidenceIdentity(before, "before39", serverMajor);
  validateEvidenceIdentity(after, "after40", serverMajor);
  invariant(same(before.target, after.target) && same(before.server, after.server), "target or server changed");
  invariant(Object.entries(before.migrationChecksums).every(([name, checksum]) => after.migrationChecksums[name] === checksum),
    "one of39 historical SQL sources changed");
  const beforePartition = partitionWarehouseRoutesCatalog(before.catalogRows);
  const afterPartition = partitionWarehouseRoutesCatalog(after.catalogRows);
  invariant(same(beforePartition.preservedRows, afterPartition.preservedRows),
    "a pre-existing object outside the reviewed function replacement changed");
  invariant(!same(beforePartition.replacedRows, afterPartition.replacedRows), "reviewed function was not replaced");
  invariant(same(before.catalog, summarizeCrm01b1Catalog(sortWarehouseRoutesCatalogRows([
    ...afterPartition.preservedRows, ...beforePartition.replacedRows,
  ]))), "previous catalog cannot be reconstructed exactly");
  invariant(same(before.history.rows, after.history.rows.filter((row) => row.migration_name !== WAREHOUSE_ROUTES_MIGRATION)),
    "previous migration ledger changed");
  invariant(same(before.extensions, after.extensions) && same(before.extensionMembers, after.extensionMembers)
    && same(before.extensionMemberRows, after.extensionMemberRows), "previous extension changed");
  invariant(same(before.dataFingerprint, after.dataFingerprint), "previous table data changed");
  invariant(after.zoneCodeNonNullRows === 0, "migration populated zone_code on existing addresses");
  return {
    previousObjectsUnchangedExceptReviewedReplacement: true,
    previousCatalogReconstructed: true, previousHistoryUnchanged: true,
    previousExtensionUnchanged: true, previousDataUnchanged: true,
    existingAddressZoneCodesRemainNull: true,
  };
}

export function validateWarehouseRoutesCatalogTransition(before, after, fixture, serverMajor) {
  const verification = validateWarehouseRoutesCatalogChange(before, after, serverMajor);
  invariant(fixture?.provenance?.kind === "LOCAL_DISPOSABLE_POSTGRESQL"
    && fixture.provenance.server?.version_number === after.server.version_number
    && fixture.provenance.catalogQuerySha256 === sha256(CATALOG_SQL)
    && fixture.provenance.previousObjectsUnchangedExceptReviewedReplacement === true
    && fixture.provenance.previousObjectsUnchangedAfterMigration !== true,
  "approved engine-specific fixture provenance invalid");
  invariant(fixture.migration?.name === WAREHOUSE_ROUTES_MIGRATION
    && fixture.migration.sha256 === WAREHOUSE_ROUTES_MIGRATION_CHECKSUM, "fixture SQL source invalid");
  invariant(same(before.catalog, fixture.previousCatalog) && same(after.catalog, fixture.catalog),
    "whole catalog differs from independently measured fixture");
  const beforePartition = partitionWarehouseRoutesCatalog(before.catalogRows);
  const afterPartition = partitionWarehouseRoutesCatalog(after.catalogRows);
  for (const [rows, name] of [[afterPartition.addedRows, "added"],
    [beforePartition.replacedRows, "replacedBefore"], [afterPartition.replacedRows, "replacedAfter"]]) {
    invariant(same(rows, fixture.delta?.[`${name}Rows`])
      && same(summarizeCrm01b1Catalog(rows), fixture.delta[`${name}Catalog`]), `${name} differs from engine-specific fixture`);
  }
  invariant(same(after.sqlOnly?.counts, fixture.sqlOnlyCounts) && after.sqlOnly.unmapped.length === 0,
    "SQL-only attribution differs from measured fixture");
  return { ...verification, approvedEngineSpecificDeltaMatched: true };
}

export async function collectWarehouseRoutesCatalogEvidence({
  phase, serverMajor = 18, root = process.cwd(), env = process.env,
  rawUrl = serverMajor === 17 ? env.V17_WAREHOUSE_CONFIGURATION_PG17_DATABASE_URL : env.CRM01B1_TEST_DATABASE_URL,
} = {}) {
  invariant(["before39", "after40"].includes(phase), "phase must be before39 or after40");
  invariant([17, 18].includes(serverMajor), "server profile must be17 or18");
  if (serverMajor === 18) {
    invariant(env.CANONICAL_DB_VALIDATION === "true", "requires disposable canonical CI mode");
    invariant(validateCrm01b1LocalUrl(rawUrl).database === "osi_db01n_ci", "only canonical disposable database accepted");
  }
  const sourceNames = validateMigrationFiles(root);
  invariant(sourceNames.length === 40 && sourceNames.at(-1) === WAREHOUSE_ROUTES_MIGRATION
    && sourceNames.at(-2) === WAREHOUSE_SHEET_MIGRATION, "requires exact40 named source inventory");
  const names = phase === "before39" ? sourceNames.slice(0, 39) : sourceNames;
  const migrations = await Promise.all(names.map(async (name) => [name,
    await readFile(resolve(root, "prisma/migrations", name, "migration.sql"), "utf8"),
  ]));
  const migrationChecksums = Object.fromEntries(migrations.map(([name, sql]) => [name, sha256(sql)]));
  invariant(sha256(await readFile(resolve(root, "prisma/migrations", WAREHOUSE_ROUTES_MIGRATION, "migration.sql")))
    === WAREHOUSE_ROUTES_MIGRATION_CHECKSUM, "SQL40 source differs from reviewed checksum");
  const prismaVersion = JSON.parse(await readFile(resolve(root, "node_modules/prisma/package.json"), "utf8")).version;
  invariant(prismaVersion === "6.19.2", "requires reviewed Prisma version");
  const pg17ExtensionFixture = serverMajor === 17
    ? JSON.parse(await readFile(resolve(root, "tests/crm-01b1/warehouse-sheet-20c-pg17-catalog.json"), "utf8")) : null;
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const { prisma, target } = serverMajor === 17
    ? await createWarehouseConfigurationPg17LocalPrisma(rawUrl, { env }) : await createCrm01b1LocalPrisma(rawUrl);
  try {
    const evidence = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '30s'");
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '1s'");
      await tx.$executeRawUnsafe("SET LOCAL search_path = osi");
      const [server] = await tx.$queryRawUnsafe(`
        SELECT current_setting('server_version_num') AS version_number,
               current_setting('server_version') AS version,
               datcollate AS collation, datctype AS character_type
        FROM pg_database WHERE datname = current_database()
      `);
      const [scope] = await tx.$queryRawUnsafe("SELECT current_schema() AS schema, current_schemas(false) = ARRAY['osi']::name[] AS path_matches, current_setting('transaction_read_only') AS read_only");
      invariant(scope.schema === "osi" && scope.path_matches === true && scope.read_only === "on", "snapshot scope invalid");
      const history = await tx.$queryRawUnsafe("SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count FROM osi._prisma_migrations ORDER BY migration_name");
      const applied = validateAppliedMigrationHistory(history, {
        throughMigration: phase === "before39" ? WAREHOUSE_SHEET_MIGRATION : WAREHOUSE_ROUTES_MIGRATION,
      });
      invariant(history.every((row) => row.checksum === migrationChecksums[row.migration_name]), "applied checksums differ from sources");
      const catalogRows = await tx.$queryRawUnsafe(CATALOG_SQL);
      const sqlOnlyRows = await tx.$queryRawUnsafe(SQL_ONLY_SQL);
      const extensions = await tx.$queryRawUnsafe(EXTENSIONS_SQL);
      const extensionMemberRows = await tx.$queryRawUnsafe(EXTENSION_MEMBERS_SQL);
      const tables = await tx.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname = 'osi' AND tablename <> '_prisma_migrations' ORDER BY tablename");
      const dataFingerprint = [];
      for (const { tablename } of tables) {
        const quotedTable = `"${tablename.replaceAll('"', '""')}"`;
        const projection = tablename === "warehouse_location_addresses" ? "(to_jsonb(t) - 'zone_code')" : "to_jsonb(t)";
        const rows = await tx.$queryRawUnsafe(`SELECT ${projection}::text AS row_json FROM osi.${quotedTable} t ORDER BY 1`);
        dataFingerprint.push({ table: tablename, rows: rows.length, sha256: sha256(JSON.stringify(rows.map((row) => row.row_json))) });
      }
      const zoneCodeNonNullRows = phase === "after40"
        ? (await tx.$queryRawUnsafe("SELECT count(*)::integer AS total FROM osi.warehouse_location_addresses WHERE zone_code IS NOT NULL"))[0].total : null;
      // PG17's independently frozen btree_gist1.7 has188 members, whereas the
      // canonical PG18 inventory pins1.8/212. Preserve that provenance without
      // relaxing the canonical mapper's1.8 requirement or relabelling1.7.
      const extensionKeys = new Set(extensionMemberRows.map((row) => `${row.kind}:${row.object_name}`));
      if (pg17ExtensionFixture) {
        invariant(same(extensions, pg17ExtensionFixture.extensions)
          && same({ count: extensionMemberRows.length, sha256: sha256(JSON.stringify(extensionMemberRows)) },
            pg17ExtensionFixture.extensionMembers), "PG17 extension differs from its independent historical fixture");
      }
      const sqlOnly = serverMajor === 17
        ? { ...mapSqlOnlyObjects(sqlOnlyRows.filter((row) => !extensionKeys.has(`${row.kind}:${row.object_name}`)), migrations),
          extensionMembersExcluded: extensionMemberRows.length }
        : mapSqlOnlyObjects(sqlOnlyRows, migrations, extensionMemberRows);
      invariant(sqlOnly.unmapped.length === 0, "SQL-only objects lack explicit migration provenance");
      return {
        evidenceOnly: true, baselineAccepted: false, phase,
        provenance: { kind: "LOCAL_DISPOSABLE_POSTGRESQL", capturedAt: new Date().toISOString(), sourceCommit, prismaVersion,
          catalogQuerySha256: sha256(CATALOG_SQL), sqlOnlyQuerySha256: sha256(SQL_ONLY_SQL), searchPath: "osi", readOnly: true },
        target, server, migration: { name: WAREHOUSE_ROUTES_MIGRATION,
          ...(phase === "after40" ? { sha256: WAREHOUSE_ROUTES_MIGRATION_CHECKSUM } : {}) },
        migrationChecksums, history: { complete: applied.length, migrations: applied, rows: history },
        catalog: summarizeCrm01b1Catalog(catalogRows), catalogRows, sqlOnly, sqlOnlyRows,
        extensions, extensionMembers: { count: extensionMemberRows.length, sha256: sha256(JSON.stringify(extensionMemberRows)) },
        extensionMemberRows, dataFingerprint, zoneCodeNonNullRows,
      };
    }, { maxWait: 5000, timeout: 60000, isolationLevel: "RepeatableRead" });
    validateEvidenceIdentity(evidence, phase, serverMajor);
    return evidence;
  } finally { await prisma.$disconnect(); }
}

export async function captureWarehouseRoutesCatalog({ phase, outputPath, previousPath,
  serverMajor = 18, root = process.cwd(), env = process.env } = {}) {
  invariant(typeof outputPath === "string" && outputPath.length > 0, "output path required");
  invariant(phase === "before39" ? previousPath === undefined : phase === "after40"
    && typeof previousPath === "string" && previousPath.length > 0, "after40 requires independent before39 evidence");
  const previousBytes = phase === "after40" ? await readFile(previousPath) : null;
  const evidence = await collectWarehouseRoutesCatalogEvidence({ phase, serverMajor, root, env });
  if (previousBytes) {
    const fixture = JSON.parse(await readFile(resolve(root,
      `tests/crm-01b1/warehouse-routes-20d${serverMajor === 17 ? "-pg17" : ""}-catalog.json`), "utf8"));
    evidence.verification = validateWarehouseRoutesCatalogTransition(JSON.parse(previousBytes), evidence, fixture, serverMajor);
    evidence.provenance.previousEvidenceSha256 = sha256(previousBytes);
  }
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  return evidence;
}

export async function runWarehouseRoutesCatalogCli(serverMajor = 18) {
  try {
    const args = process.argv.slice(2);
    invariant((args.length === 2 && args[0] === "--before")
      || (args.length === 4 && args[0] === "--after" && args[2] === "--previous"),
    "usage: --before <output.json> | --after <output.json> --previous <before.json>");
    const evidence = await captureWarehouseRoutesCatalog({ phase: args[0] === "--before" ? "before39" : "after40",
      outputPath: args[1], ...(args[0] === "--after" ? { previousPath: args[3] } : {}), serverMajor });
    process.stdout.write(`${JSON.stringify({ evidenceOnly: true, baselineAccepted: false, phase: evidence.phase,
      target: evidence.target, server: evidence.server, migrations: evidence.history.complete,
      catalog: evidence.catalog, verification: evidence.verification })}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ evidenceOnly: true, baselineAccepted: false, error: error.message })}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runWarehouseRoutesCatalogCli();
