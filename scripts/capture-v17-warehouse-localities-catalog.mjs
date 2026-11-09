// Read-only independent evidence for40 ->41. Only a nullable column and CHECK
// may be added; no old object, row, extension or applied migration may change.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WAREHOUSE_LOCALITIES_MIGRATION, WAREHOUSE_LOCALITIES_MIGRATION_CHECKSUM } from "../shared/warehouseLocalitiesMigration.js";
import { WAREHOUSE_ROUTES_MIGRATION } from "../shared/warehouseRoutesMigration.js";
import { validateAppliedMigrationHistory, validateMigrationFiles } from "./canonical-migrations.mjs";
import { createCrm01b1LocalPrisma, validateCrm01b1LocalUrl } from "./crm-01b1-local-target.mjs";
import { createWarehouseConfigurationPg17LocalPrisma } from "./v17-warehouse-configuration-pg17-local-target.mjs";
import { CATALOG_SQL, SQL_ONLY_SQL, EXTENSIONS_SQL, EXTENSION_MEMBERS_SQL, mapSqlOnlyObjects, summarizeCrm01b1Catalog } from "./crm-01b1-sql-drift-baseline.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fields = ["kind", "schema_name", "table_name", "object_name", "definition"];
const addedKeys = ["check|osi|warehouse_sheet_profiles|warehouse_sheet_profiles_locality_number_check", "column|osi|warehouse_sheet_profiles|locality_number"];
const key = (row) => fields.slice(0, 4).map((field) => row[field]).join("|");
function invariant(condition, message) { if (!condition) throw new Error(`WAREHOUSE_LOCALITIES_CATALOG: ${message}`); }
export function sortWarehouseLocalitiesCatalogRows(rows) {
  return [...rows].sort((a, b) => {
    for (const field of fields) { if (a[field] < b[field]) return -1; if (a[field] > b[field]) return 1; }
    return 0;
  });
}
export function partitionWarehouseLocalitiesCatalog(rows) {
  return { preservedRows: rows.filter((row) => !addedKeys.includes(key(row))), addedRows: rows.filter((row) => addedKeys.includes(key(row))) };
}
function validateEvidence(evidence, phase, serverMajor) {
  invariant([17, 18].includes(serverMajor), "requires an explicit PostgreSQL17 or18 profile");
  invariant(evidence?.evidenceOnly === true && evidence.baselineAccepted === false && evidence.phase === phase, "invalid evidence markers");
  invariant(evidence.provenance?.kind === "LOCAL_DISPOSABLE_POSTGRESQL"
    && evidence.server?.version_number === (serverMajor === 17 ? "170011" : "180006"), "requires independently measured PostgreSQL17.11 or18.6");
  invariant(evidence.target?.database === (serverMajor === 17 ? "osi_warehouse_17_compat" : "osi_db01n_ci")
    && evidence.target.schema === "osi" && evidence.target.address === "127.0.0.1"
    && evidence.target.port === (serverMajor === 17 ? 55434 : 55432)
    && (serverMajor !== 17 || evidence.target.serverVersion === 170011), "invalid local evidence target");
  invariant(evidence.provenance.catalogQuerySha256 === sha256(CATALOG_SQL)
    && evidence.provenance.sqlOnlyQuerySha256 === sha256(SQL_ONLY_SQL)
    && evidence.provenance.searchPath === "osi" && evidence.provenance.readOnly === true, "snapshot query or scope changed");
  invariant(evidence.migration?.name === WAREHOUSE_LOCALITIES_MIGRATION
    && evidence.migration.sha256 === WAREHOUSE_LOCALITIES_MIGRATION_CHECKSUM, "SQL41 checksum changed");
  invariant(same(sortWarehouseLocalitiesCatalogRows(evidence.catalogRows), evidence.catalogRows)
    && same(summarizeCrm01b1Catalog(evidence.catalogRows), evidence.catalog), "catalog fingerprint invalid");
  const names = validateAppliedMigrationHistory(evidence.history?.rows, { throughMigration: phase === "before40" ? WAREHOUSE_ROUTES_MIGRATION : WAREHOUSE_LOCALITIES_MIGRATION });
  invariant(names.length === (phase === "before40" ? 40 : 41) && same(names, evidence.history.migrations)
    && names.length === evidence.history.complete, "history checkpoint invalid");
  invariant(same(Object.keys(evidence.migrationChecksums), names)
    && evidence.history.rows.every((row) => /^[a-f0-9]{64}$/u.test(row.checksum) && row.checksum === evidence.migrationChecksums[row.migration_name]), "history/source checksums differ");
  const partition = partitionWarehouseLocalitiesCatalog(evidence.catalogRows);
  invariant(same(partition.addedRows.map(key), phase === "before40" ? [] : addedKeys), "unexpected41 object identities");
  invariant(Array.isArray(evidence.dataFingerprint) && evidence.dataFingerprint.length > 0
    && new Set(evidence.dataFingerprint.map((row) => row.table)).size === evidence.dataFingerprint.length
    && evidence.dataFingerprint.every((row) => typeof row.table === "string" && Number.isSafeInteger(row.rows) && row.rows >= 0 && /^[a-f0-9]{64}$/u.test(row.sha256)), "invalid data fingerprints");
  invariant(evidence.extensionMembers?.count === evidence.extensionMemberRows?.length
    && evidence.extensionMembers.sha256 === sha256(JSON.stringify(evidence.extensionMemberRows)), "invalid extension fingerprint");
}
export function validateWarehouseLocalitiesCatalogChange(before, after, serverMajor) {
  validateEvidence(before, "before40", serverMajor); validateEvidence(after, "after41", serverMajor);
  invariant(same(before.target, after.target) && same(before.server, after.server), "target or server changed");
  invariant(Object.entries(before.migrationChecksums).every(([name, checksum]) => after.migrationChecksums[name] === checksum), "historical SQL changed");
  invariant(same(before.catalogRows, partitionWarehouseLocalitiesCatalog(after.catalogRows).preservedRows), "a previous catalog object changed");
  invariant(same(before.history.rows, after.history.rows.filter((row) => row.migration_name !== WAREHOUSE_LOCALITIES_MIGRATION)), "previous ledger changed");
  invariant(same(before.extensions, after.extensions) && same(before.extensionMembers, after.extensionMembers)
    && same(before.extensionMemberRows, after.extensionMemberRows), "previous extension changed");
  invariant(same(before.dataFingerprint, after.dataFingerprint), "previous table data changed");
  invariant(after.localityNumberNonNullRows === 0, "existing locality numbers were populated");
  return { previousObjectsUnchangedAfterMigration: true, previousHistoryUnchanged: true, previousExtensionUnchanged: true, previousDataUnchanged: true, existingLocalitiesRemainNull: true };
}
export function validateWarehouseLocalitiesCatalogTransition(before, after, fixture, serverMajor) {
  const verification = validateWarehouseLocalitiesCatalogChange(before, after, serverMajor);
  invariant(fixture?.provenance?.kind === "LOCAL_DISPOSABLE_POSTGRESQL"
    && fixture.provenance.server?.version_number === after.server.version_number
    && fixture.provenance.catalogQuerySha256 === sha256(CATALOG_SQL)
    && fixture.provenance.previousObjectsUnchangedAfterMigration === true, "fixture provenance invalid");
  invariant(fixture.migration?.name === WAREHOUSE_LOCALITIES_MIGRATION && fixture.migration.sha256 === WAREHOUSE_LOCALITIES_MIGRATION_CHECKSUM, "fixture SQL invalid");
  invariant(same(before.catalog, fixture.previousCatalog) && same(after.catalog, fixture.catalog), "whole catalog differs from measured fixture");
  const { addedRows } = partitionWarehouseLocalitiesCatalog(after.catalogRows);
  invariant(same(addedRows, fixture.delta?.addedRows) && same(summarizeCrm01b1Catalog(addedRows), fixture.delta.addedCatalog), "added objects differ from measured fixture");
  invariant(same(after.sqlOnly.counts, fixture.sqlOnlyCounts) && after.sqlOnly.unmapped.length === 0, "SQL-only attribution differs from measured fixture");
  return { ...verification, approvedEngineSpecificDeltaMatched: true };
}
export async function collectWarehouseLocalitiesCatalogEvidence({ phase, serverMajor = 18, root = process.cwd(), env = process.env,
  rawUrl = serverMajor === 17 ? env.V17_WAREHOUSE_CONFIGURATION_PG17_DATABASE_URL : env.CRM01B1_TEST_DATABASE_URL } = {}) {
  invariant(["before40", "after41"].includes(phase) && [17, 18].includes(serverMajor), "invalid phase or server profile");
  if (serverMajor === 18) {
    invariant(env.CANONICAL_DB_VALIDATION === "true", "requires disposable canonical CI mode");
    invariant(validateCrm01b1LocalUrl(rawUrl).database === "osi_db01n_ci", "only canonical disposable database accepted");
  }
  const source = validateMigrationFiles(root);
  const checkpoint = source.indexOf(WAREHOUSE_LOCALITIES_MIGRATION);
  invariant(source.length === 43 && source.at(-1) === "20261109010000_v17_customer_storage_groups" && checkpoint === 40 && source[checkpoint - 1] === WAREHOUSE_ROUTES_MIGRATION, "requires exact43 source inventory with localities checkpoint");
  invariant(sha256(await readFile(resolve(root, "prisma/migrations", WAREHOUSE_LOCALITIES_MIGRATION, "migration.sql"))) === WAREHOUSE_LOCALITIES_MIGRATION_CHECKSUM, "reviewed SQL41 changed");
  const names = source.slice(0, phase === "before40" ? 40 : checkpoint + 1);
  const migrations = await Promise.all(names.map(async (name) => [name, await readFile(resolve(root, "prisma/migrations", name, "migration.sql"), "utf8")]));
  const migrationChecksums = Object.fromEntries(migrations.map(([name, sql]) => [name, sha256(sql)]));
  const prismaVersion = JSON.parse(await readFile(resolve(root, "node_modules/prisma/package.json"), "utf8")).version;
  invariant(prismaVersion === "6.19.2", "requires reviewed Prisma version");
  const previousFixture = JSON.parse(await readFile(resolve(root, `tests/crm-01b1/warehouse-routes-20d${serverMajor === 17 ? "-pg17" : ""}-catalog.json`), "utf8"));
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const { prisma, target } = serverMajor === 17 ? await createWarehouseConfigurationPg17LocalPrisma(rawUrl, { env }) : await createCrm01b1LocalPrisma(rawUrl);
  try {
    const evidence = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '30s'");
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '1s'");
      await tx.$executeRawUnsafe("SET LOCAL search_path = osi");
      const [server] = await tx.$queryRawUnsafe("SELECT current_setting('server_version_num') AS version_number, current_setting('server_version') AS version, datcollate AS collation, datctype AS character_type FROM pg_database WHERE datname=current_database()");
      const [scope] = await tx.$queryRawUnsafe("SELECT current_schema() AS schema, current_schemas(false)=ARRAY['osi']::name[] AS path_matches, current_setting('transaction_read_only') AS read_only");
      invariant(scope.schema === "osi" && scope.path_matches === true && scope.read_only === "on", "snapshot scope invalid");
      const history = await tx.$queryRawUnsafe("SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count FROM osi._prisma_migrations ORDER BY migration_name");
      const applied = validateAppliedMigrationHistory(history, { throughMigration: phase === "before40" ? WAREHOUSE_ROUTES_MIGRATION : WAREHOUSE_LOCALITIES_MIGRATION });
      invariant(history.every((row) => row.checksum === migrationChecksums[row.migration_name]), "applied checksums differ from source");
      const catalogRows = await tx.$queryRawUnsafe(CATALOG_SQL), sqlOnlyRows = await tx.$queryRawUnsafe(SQL_ONLY_SQL);
      const extensions = await tx.$queryRawUnsafe(EXTENSIONS_SQL), extensionMemberRows = await tx.$queryRawUnsafe(EXTENSION_MEMBERS_SQL);
      const extensionMembers = { count: extensionMemberRows.length, sha256: sha256(JSON.stringify(extensionMemberRows)) };
      invariant(same(extensions, previousFixture.extensions) && same(extensionMembers, previousFixture.extensionMembers), "extension differs from independently measured historical engine fixture");
      const extensionKeys = new Set(extensionMemberRows.map((row) => `${row.kind}:${row.object_name}`));
      const sqlOnly = serverMajor === 17
        ? { ...mapSqlOnlyObjects(sqlOnlyRows.filter((row) => !extensionKeys.has(`${row.kind}:${row.object_name}`)), migrations), extensionMembersExcluded: extensionMemberRows.length }
        : mapSqlOnlyObjects(sqlOnlyRows, migrations, extensionMemberRows);
      invariant(sqlOnly.unmapped.length === 0, "SQL-only objects lack migration provenance");
      const tables = await tx.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname='osi' AND tablename<>'_prisma_migrations' ORDER BY tablename");
      const dataFingerprint = [];
      for (const { tablename } of tables) {
        const table = `"${tablename.replaceAll('"', '""')}"`;
        const projection = tablename === "warehouse_sheet_profiles" ? "(to_jsonb(t)-'locality_number')" : "to_jsonb(t)";
        const rows = await tx.$queryRawUnsafe(`SELECT ${projection}::text AS row_json FROM osi.${table} t ORDER BY 1`);
        dataFingerprint.push({ table: tablename, rows: rows.length, sha256: sha256(JSON.stringify(rows.map((row) => row.row_json))) });
      }
      const localityNumberNonNullRows = phase === "after41" ? (await tx.$queryRawUnsafe("SELECT count(*)::integer AS total FROM osi.warehouse_sheet_profiles WHERE locality_number IS NOT NULL"))[0].total : null;
      return { evidenceOnly: true, baselineAccepted: false, phase,
        provenance: { kind: "LOCAL_DISPOSABLE_POSTGRESQL", capturedAt: new Date().toISOString(), sourceCommit, prismaVersion, catalogQuerySha256: sha256(CATALOG_SQL), sqlOnlyQuerySha256: sha256(SQL_ONLY_SQL), searchPath: "osi", readOnly: true },
        target, server, migration: { name: WAREHOUSE_LOCALITIES_MIGRATION, sha256: WAREHOUSE_LOCALITIES_MIGRATION_CHECKSUM }, migrationChecksums,
        history: { complete: applied.length, migrations: applied, rows: history }, catalog: summarizeCrm01b1Catalog(catalogRows), catalogRows, sqlOnly, sqlOnlyRows,
        extensions, extensionMembers, extensionMemberRows, dataFingerprint, localityNumberNonNullRows };
    }, { maxWait: 5000, timeout: 60000, isolationLevel: "RepeatableRead" });
    validateEvidence(evidence, phase, serverMajor); return evidence;
  } finally { await prisma.$disconnect(); }
}
export async function captureWarehouseLocalitiesCatalog({ phase, outputPath, previousPath, serverMajor = 18, root = process.cwd(), env = process.env } = {}) {
  invariant(typeof outputPath === "string" && outputPath.length > 0, "output path required");
  invariant(phase === "before40" ? previousPath === undefined : phase === "after41" && typeof previousPath === "string" && previousPath.length > 0, "after41 requires independent before40 evidence");
  const previousBytes = phase === "after41" ? await readFile(previousPath) : null;
  const evidence = await collectWarehouseLocalitiesCatalogEvidence({ phase, serverMajor, root, env });
  if (previousBytes) {
    const fixture = JSON.parse(await readFile(resolve(root, `tests/crm-01b1/warehouse-localities-20e${serverMajor === 17 ? "-pg17" : ""}-catalog.json`), "utf8"));
    evidence.verification = validateWarehouseLocalitiesCatalogTransition(JSON.parse(previousBytes), evidence, fixture, serverMajor);
    evidence.provenance.previousEvidenceSha256 = sha256(previousBytes);
  }
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx", mode: 0o600 }); return evidence;
}
export async function runWarehouseLocalitiesCatalogCli(serverMajor = 18) {
  try {
    const args = process.argv.slice(2);
    invariant((args.length === 2 && args[0] === "--before") || (args.length === 4 && args[0] === "--after" && args[2] === "--previous"), "usage: --before <output.json> | --after <output.json> --previous <before.json>");
    const evidence = await captureWarehouseLocalitiesCatalog({ phase: args[0] === "--before" ? "before40" : "after41", outputPath: args[1], ...(args[0] === "--after" ? { previousPath: args[3] } : {}), serverMajor });
    process.stdout.write(`${JSON.stringify({ evidenceOnly: true, baselineAccepted: false, phase: evidence.phase, target: evidence.target, server: evidence.server, migrations: evidence.history.complete, catalog: evidence.catalog, verification: evidence.verification })}\n`);
  } catch (error) { process.stderr.write(`${JSON.stringify({ evidenceOnly: true, baselineAccepted: false, error: error.message })}\n`); process.exitCode = 1; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runWarehouseLocalitiesCatalogCli();
