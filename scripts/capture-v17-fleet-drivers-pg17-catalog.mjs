// PostgreSQL 17 compatibility is measured independently from the frozen PG18
// catalog. Evidence cannot rewrite or implicitly accept either profile.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FLEET_DRIVERS_MIGRATION, FLEET_DRIVERS_MIGRATION_CHECKSUM } from "../shared/adminFleetDrivers.js";
import { validateAppliedMigrationHistory, validateMigrationFiles } from "./canonical-migrations.mjs";
import { createFleetDriversPg17LocalPrisma } from "./v17-fleet-drivers-pg17-local-target.mjs";
import {
  CATALOG_SQL, SQL_ONLY_SQL, EXTENSIONS_SQL, EXTENSION_MEMBERS_SQL,
  mapSqlOnlyObjects, summarizeCrm01b1Catalog,
} from "./crm-01b1-sql-drift-baseline.mjs";
import {
  FLEET_DRIVER_CATALOG_TABLES, FLEET_DRIVER_CATALOG_FUNCTIONS, partitionFleetDriverCatalog,
} from "./capture-v17-fleet-drivers-catalog.mjs";

const PREVIOUS_MIGRATION = "20261030010000_v17_user_identity_enrollment";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
function invariant(condition, message) {
  if (!condition) throw new Error(`FLEET_DRIVERS_PG17_CATALOG: ${message}`);
}

function validateEvidenceIdentity(evidence, phase) {
  invariant(evidence?.evidenceOnly === true && evidence.baselineAccepted === false && evidence.phase === phase,
    "evidence phase or acceptance marker invalid");
  invariant(evidence.provenance?.kind === "LOCAL_DISPOSABLE_POSTGRESQL"
    && evidence.server?.version_number === "170011", "requires measured PostgreSQL 17.11 evidence");
  invariant(evidence.target?.database === "osi_fleet_17_compat" && evidence.target.schema === "osi"
    && evidence.target.address === "127.0.0.1" && evidence.target.port === 55433 && evidence.target.serverVersion === 170011,
  "evidence must belong to the exact local PG17 target");
  invariant(evidence.provenance.catalogQuerySha256 === sha256(CATALOG_SQL)
    && evidence.provenance.sqlOnlyQuerySha256 === sha256(SQL_ONLY_SQL)
    && evidence.provenance.searchPath === "osi" && evidence.provenance.readOnly === true,
  "catalog queries or snapshot scope differ from measured evidence");
  invariant(evidence.migration?.name === FLEET_DRIVERS_MIGRATION
    && evidence.migration.sha256 === FLEET_DRIVERS_MIGRATION_CHECKSUM, "migration source is not the reviewed 19F SQL");
  invariant(same(summarizeCrm01b1Catalog(evidence.catalogRows), evidence.catalog), "catalog rows do not match their fingerprint");
  const partition = partitionFleetDriverCatalog(evidence.catalogRows);
  invariant(phase === "before36" ? partition.deltaRows.length === 0 : partition.deltaRows.length > 0,
    "19F objects do not match the evidence checkpoint");
  invariant(same(summarizeCrm01b1Catalog(partition.previousRows), evidence.previousCatalog)
    && same(partition.deltaRows, evidence.delta?.rows)
    && same(summarizeCrm01b1Catalog(partition.deltaRows), evidence.delta.catalog), "catalog partition differs from measured rows");
  const names = validateAppliedMigrationHistory(evidence.history?.rows,
    phase === "before36" ? { throughMigration: PREVIOUS_MIGRATION } : {});
  invariant(names.length === (phase === "before36" ? 36 : 37)
    && same(names, evidence.history.migrations) && names.length === evidence.history.complete,
  "history does not match its named checkpoint");
  invariant(evidence.history.rows.every((row) => /^[0-9a-f]{64}$/u.test(row.checksum)
    && row.checksum === evidence.migrationChecksums?.[row.migration_name])
    && evidence.migrationChecksums?.[FLEET_DRIVERS_MIGRATION] === FLEET_DRIVERS_MIGRATION_CHECKSUM,
  "applied checksums differ from recorded sources");
}

export async function collectFleetDriversPg17CatalogEvidence({
  phase, root = process.cwd(), env = process.env,
  rawUrl = env.V17_FLEET_DRIVERS_PG17_DATABASE_URL,
} = {}) {
  invariant(["before36", "after37"].includes(phase), "phase must be before36 or after37");
  const names = validateMigrationFiles(root);
  invariant(names.length === 37 && names.at(-1) === FLEET_DRIVERS_MIGRATION && names.at(-2) === PREVIOUS_MIGRATION,
    "requires the exact 37-migration source inventory");
  const migrations = await Promise.all(names.map(async (name) => [name,
    await readFile(resolve(root, "prisma/migrations", name, "migration.sql"), "utf8"),
  ]));
  const migrationChecksums = Object.fromEntries(migrations.map(([name, sql]) => [name, sha256(sql)]));
  invariant(migrationChecksums[FLEET_DRIVERS_MIGRATION] === FLEET_DRIVERS_MIGRATION_CHECKSUM,
    "19F checksum differs from reviewed SQL");
  const prismaVersion = JSON.parse(await readFile(resolve(root, "node_modules/prisma/package.json"), "utf8")).version;
  invariant(prismaVersion === "6.19.2", "requires the reviewed Prisma version");
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  invariant(/^[0-9a-f]{40}$/u.test(sourceCommit), "source commit unavailable");
  const { prisma, target } = await createFleetDriversPg17LocalPrisma(rawUrl, { env });
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
      invariant(server.version_number === "170011", "requires PostgreSQL 17.11 exactly");
      const [scope] = await tx.$queryRawUnsafe("SELECT current_schema() AS schema, current_schemas(false) = ARRAY['osi']::name[] AS path_matches, current_setting('transaction_read_only') AS read_only");
      invariant(scope.schema === "osi" && scope.path_matches === true && scope.read_only === "on", "snapshot scope must be read-only with search_path=osi");
      const history = await tx.$queryRawUnsafe(`
        SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count
        FROM osi._prisma_migrations ORDER BY migration_name
      `);
      const applied = validateAppliedMigrationHistory(history,
        phase === "before36" ? { throughMigration: PREVIOUS_MIGRATION } : {});
      invariant(history.every((row) => row.checksum === migrationChecksums[row.migration_name]),
        "applied checksums differ from the exact source files");
      const catalogRows = await tx.$queryRawUnsafe(CATALOG_SQL);
      const sqlOnlyRows = await tx.$queryRawUnsafe(SQL_ONLY_SQL);
      const extensions = await tx.$queryRawUnsafe(EXTENSIONS_SQL);
      const extensionMembers = await tx.$queryRawUnsafe(EXTENSION_MEMBERS_SQL);
      const { previousRows, deltaRows } = partitionFleetDriverCatalog(catalogRows);
      invariant(phase === "before36" ? deltaRows.length === 0 : deltaRows.length > 0, "19F objects do not match the ledger state");
      const ownNames = new Set(deltaRows.map((row) => `${row.kind === "index" ? "special_index" : row.kind}:${row.object_name}`));
      const ownSqlOnly = mapSqlOnlyObjects(sqlOnlyRows.filter((row) => ownNames.has(`${row.kind}:${row.object_name}`)), migrations);
      invariant(ownSqlOnly.unmapped.length === 0 && Object.keys(ownSqlOnly.counts).every((name) => name === FLEET_DRIVERS_MIGRATION),
        "19F SQL-only objects have ambiguous source attribution");
      return {
        evidenceOnly: true, baselineAccepted: false, phase,
        provenance: { kind: "LOCAL_DISPOSABLE_POSTGRESQL", capturedAt: new Date().toISOString(), sourceCommit, prismaVersion,
          catalogQuerySha256: sha256(CATALOG_SQL), sqlOnlyQuerySha256: sha256(SQL_ONLY_SQL), searchPath: "osi", readOnly: true },
        target, server, migration: { name: FLEET_DRIVERS_MIGRATION, sha256: FLEET_DRIVERS_MIGRATION_CHECKSUM },
        migrationChecksums, history: { complete: applied.length, migrations: applied, rows: history },
        catalog: summarizeCrm01b1Catalog(catalogRows), previousCatalog: summarizeCrm01b1Catalog(previousRows),
        extensions, extensionMembers: { count: extensionMembers.length, sha256: sha256(JSON.stringify(extensionMembers)) },
        delta: { tables: FLEET_DRIVER_CATALOG_TABLES, functions: FLEET_DRIVER_CATALOG_FUNCTIONS,
          catalog: summarizeCrm01b1Catalog(deltaRows), rows: deltaRows,
          sqlOnlyCounts: ownSqlOnly.counts[FLEET_DRIVERS_MIGRATION] || {} },
        catalogRows, sqlOnlyRows, extensionMemberRows: extensionMembers,
      };
    }, { maxWait: 5000, timeout: 35000, isolationLevel: "RepeatableRead" });
    validateEvidenceIdentity(evidence, phase);
    return evidence;
  } finally {
    await prisma.$disconnect();
  }
}

export function validateFleetDriversPg17CatalogTransition(before, after, fixture) {
  validateEvidenceIdentity(before, "before36");
  validateEvidenceIdentity(after, "after37");
  invariant(fixture?.provenance?.kind === "LOCAL_DISPOSABLE_POSTGRESQL"
    && fixture.provenance.server?.version_number === "170011"
    && fixture.provenance.catalogQuerySha256 === sha256(CATALOG_SQL)
    && fixture.provenance.previousObjectsUnchangedAfterMigration === true, "approved PG17 fixture provenance invalid");
  invariant(fixture.migration?.name === FLEET_DRIVERS_MIGRATION
    && fixture.migration.sha256 === FLEET_DRIVERS_MIGRATION_CHECKSUM, "approved PG17 fixture source invalid");
  invariant(same(summarizeCrm01b1Catalog(fixture.delta?.rows), fixture.delta.catalog)
    && same(fixture.delta.tables, FLEET_DRIVER_CATALOG_TABLES)
    && same(fixture.delta.functions, FLEET_DRIVER_CATALOG_FUNCTIONS), "approved PG17 fixture rows invalid");
  invariant(same(before.target, after.target) && same(before.server, after.server)
    && same(before.migrationChecksums, after.migrationChecksums), "target, server or source checksums changed during migration");
  invariant(same(before.catalog, after.previousCatalog)
    && same(before.catalogRows, partitionFleetDriverCatalog(after.catalogRows).previousRows), "objects preceding 19F changed");
  invariant(same(before.history.rows, after.history.rows.filter((row) => row.migration_name !== FLEET_DRIVERS_MIGRATION)),
    "previous migration ledger changed");
  invariant(same(before.extensions, after.extensions) && same(before.extensionMembers, after.extensionMembers), "previous extension changed");
  invariant(same(after.delta.catalog, fixture.delta.catalog) && same(after.delta.sqlOnlyCounts, fixture.delta.sqlOnlyCounts),
    "19F catalog differs from independently measured PostgreSQL17 fixture");
  return { previousObjectsUnchangedAfterMigration: true, previousHistoryUnchanged: true,
    previousExtensionUnchanged: true, approvedPg17DeltaMatched: true };
}

export async function captureFleetDriversPg17Catalog({ phase, outputPath, previousPath, root = process.cwd(), env = process.env } = {}) {
  invariant(typeof outputPath === "string" && outputPath.length > 0, "output path required");
  invariant(phase === "before36" ? previousPath === undefined : phase === "after37" && typeof previousPath === "string" && previousPath.length > 0,
    "after37 requires the independently captured before36 file");
  const previousBytes = phase === "after37" ? await readFile(previousPath) : null;
  const fixture = phase === "after37"
    ? JSON.parse(await readFile(resolve(root, "tests/crm-01b1/fleet-drivers-19f-pg17-catalog.json"), "utf8")) : null;
  const evidence = await collectFleetDriversPg17CatalogEvidence({ phase, root, env });
  if (previousBytes) {
    evidence.verification = validateFleetDriversPg17CatalogTransition(JSON.parse(previousBytes), evidence, fixture);
    evidence.provenance.previousEvidenceSha256 = sha256(previousBytes);
  }
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  return evidence;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    invariant((args.length === 2 && args[0] === "--before")
      || (args.length === 4 && args[0] === "--after" && args[2] === "--previous"),
    "usage: --before <output.json> | --after <output.json> --previous <before.json>");
    const evidence = await captureFleetDriversPg17Catalog({ phase: args[0] === "--before" ? "before36" : "after37",
      outputPath: args[1], ...(args[0] === "--after" ? { previousPath: args[3] } : {}) });
    process.stdout.write(`${JSON.stringify({ evidenceOnly: true, baselineAccepted: false, phase: evidence.phase,
      target: evidence.target, server: evidence.server, migrations: evidence.history.complete,
      catalog: evidence.catalog, previousCatalog: evidence.previousCatalog, delta: evidence.delta.catalog,
      verification: evidence.verification })}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ evidenceOnly: true, baselineAccepted: false, error: error.message })}\n`);
    process.exitCode = 1;
  }
}
