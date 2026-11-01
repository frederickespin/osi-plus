// One reviewed, additive Preview migration. The build hook is inert unless a
// branch-scoped operation names the exact deployed commit. Credentials stay in
// the Vercel build environment; neither command arguments nor logs contain them.
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual, promisify } from "node:util";
import { PrismaClient } from "@prisma/client";
import { isWarehouseConfigurationEnabled } from "../api/_lib/warehouseConfigurationMode.js";
import { resolveMaterialsApiMode } from "../api/_lib/materialsInventoryHttp.js";
import { WAREHOUSE_SHEET_MIGRATION, WAREHOUSE_SHEET_MIGRATION_CHECKSUM } from "../shared/warehouseSheetMigration.js";
import { validateMigrationFiles } from "./canonical-migrations.mjs";
import { CATALOG_SQL, summarizeCrm01b1Catalog } from "./crm-01b1-sql-drift-baseline.mjs";
import { partitionWarehouseSheetCatalog } from "./capture-v17-warehouse-sheet-catalog.mjs";

export const WAREHOUSE_SHEET_PREVIEW_MIGRATION_OPERATION = "V17_WAREHOUSE_SHEET_PREVIEW_MIGRATION";
export const RETAINED_PREVIEW_EXTENSION = Object.freeze({
  name: "20260917010000_v17_engineering_crating",
  checksum: "b437aae3600a23c655d97e674c3bfaa9a1721e0d54a26dcccc1181d90fdf2d0f",
});
const executeFile = promisify(execFile);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
function requireCondition(condition, code) {
  if (!condition) throw new Error(`WAREHOUSE_SHEET_PREVIEW_MIGRATION_${code}`);
}

export function previewMigrationOperation(env = process.env) {
  const raw = env[WAREHOUSE_SHEET_PREVIEW_MIGRATION_OPERATION];
  if (raw === undefined || raw === "DISABLED") return null;
  const match = /^(CHECK):([a-f0-9]{40})$/u.exec(raw)
    || /^(APPLY):([a-f0-9]{40}):([a-f0-9]{64}):([1-9][0-9]{0,6})$/u.exec(raw);
  requireCondition(match && env.VERCEL === "1" && env.VERCEL_ENV === "preview"
    && env.VERCEL_GIT_COMMIT_REF === "feature/v17-consolidated-preview"
    && env.VERCEL_GIT_COMMIT_SHA === match[2], "OPERATION_TARGET_INVALID");
  requireCondition(resolveMaterialsApiMode(env) === "PREVIEW_REHEARSAL", "BASE_MATERIALS_GATE_REQUIRED");
  requireCondition(isWarehouseConfigurationEnabled(env) && env.WAREHOUSE_CONFIGURATION_API_MODE === "PREVIEW_REHEARSAL", "BASE_CONFIGURATION_GATE_REQUIRED");
  requireCondition(env.PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK === undefined, "MIGRATION_LOCK_REQUIRED");
  // The operational hook must finish before enabling any new configuration route.
  requireCondition([undefined, "DISABLED"].includes(env.WAREHOUSE_SHEET_API_MODE)
    && [undefined, "DISABLED"].includes(env.VITE_WAREHOUSE_SHEET_UI_MODE), "FEATURE_MUST_BE_DISABLED");
  let direct; let application;
  try { direct = new URL(env.DIRECT_URL); application = new URL(env.DATABASE_URL); } catch { requireCondition(false, "DIRECT_TARGET_INVALID"); }
  requireCondition(["postgres:", "postgresql:"].includes(direct.protocol)
    && Boolean(direct.hostname) && !direct.hostname.includes("-pooler.")
    && direct.hostname === application.hostname.replace(/-pooler(?=\.)/u, "")
    && (direct.port || "5432") === (application.port || "5432")
    && decodeURIComponent(direct.pathname.slice(1)) === "v17_consolidated_preview_10b"
    && direct.searchParams.getAll("schema").length === 1 && direct.searchParams.get("schema") === "osi"
    && !direct.hash, "DIRECT_TARGET_INVALID");
  return Object.freeze({ mode: match[1], commit: match[2],
    ...(match[1] === "APPLY" ? { previousCatalog: { sha256: match[3], count: Number(match[4]) } } : {}),
  });
}

export function validatePreviewCatalogPin(operation, previousCatalog) {
  if (operation.mode !== "APPLY") return;
  requireCondition(operation.previousCatalog?.sha256 === previousCatalog.sha256
    && operation.previousCatalog?.count === previousCatalog.count, "CHECK_BASELINE_CHANGED");
}

export function validatePreviewDatabaseIdentity(identity) {
  requireCondition(identity?.database === "v17_consolidated_preview_10b", "DATABASE_NAME_INVALID");
  requireCondition(identity.branch === "br-mute-credit-ahxnvfx0", "NEON_BRANCH_INVALID");
  previewServerMajor(identity.server_version_num);
}

function previewServerMajor(version) {
  const value = Number(version);
  const major = Math.floor(value / 10000);
  requireCondition(Number.isSafeInteger(value) && [17, 18].includes(major), "SERVER_VERSION_INVALID");
  return major;
}

export function selectPreviewWarehouseSheetCatalogProfile(version, fixtures) {
  const serverMajor = previewServerMajor(version);
  const fixture = fixtures?.[serverMajor];
  requireCondition(fixture?.migration?.name === WAREHOUSE_SHEET_MIGRATION
    && fixture.migration.sha256 === WAREHOUSE_SHEET_MIGRATION_CHECKSUM
    && fixture.provenance?.kind === "LOCAL_DISPOSABLE_POSTGRESQL"
    && Math.floor(Number(fixture.provenance.server?.version_number) / 10000) === serverMajor
    && fixture.provenance.catalogQuerySha256 === sha256(CATALOG_SQL)
    && fixture.provenance.previousObjectsUnchangedAfterMigration === true
    && Array.isArray(fixture.delta?.rows) && fixture.delta.rows.length > 0, "CATALOG_SOURCE_INVALID");
  const { previousRows, deltaRows } = partitionWarehouseSheetCatalog(fixture.delta.rows);
  const expectedDelta = summarizeCrm01b1Catalog(deltaRows);
  requireCondition(previousRows.length === 0 && isDeepStrictEqual(expectedDelta, fixture.delta.catalog), "CATALOG_SOURCE_INVALID");
  return { serverMajor, expectedDelta };
}

export async function normalizePreviewSnapshotSchema(tx) {
  const [initial] = await tx.$queryRawUnsafe("SELECT current_setting('transaction_read_only') = 'on' AS read_only, to_regnamespace('osi') IS NOT NULL AS schema_exists, current_schemas(false) = ARRAY['osi']::name[] AS path_matches");
  requireCondition(initial?.read_only === true, "SNAPSHOT_NOT_READ_ONLY");
  requireCondition(initial.schema_exists === true, "SCHEMA_UNAVAILABLE");
  // A connection can target Prisma's osi schema while its SQL search_path still
  // starts at public. Normalize only this read-only transaction, including the
  // catalog deparser's name visibility; never change a role/database setting.
  await tx.$executeRawUnsafe("SET LOCAL search_path = osi");
  const [selected] = await tx.$queryRawUnsafe("SELECT current_schema() AS schema, to_regnamespace('osi') IS NOT NULL AS schema_exists, to_regclass('_prisma_migrations') = to_regclass('osi._prisma_migrations') AS ledger_matches");
  requireCondition(selected?.schema_exists === true && selected.schema === "osi", "SCHEMA_SELECTION_INVALID");
  requireCondition(selected.ledger_matches === true, "LEDGER_SCOPE_INVALID");
  return { searchPathNormalized: initial.path_matches !== true };
}

export function previewMigrationManifest(root = process.cwd()) {
  const names = validateMigrationFiles(root);
  requireCondition(names.length === 39 && names.at(-1) === WAREHOUSE_SHEET_MIGRATION, "SOURCE_INVENTORY_INVALID");
  const manifest = Object.fromEntries(names.map((name) => [name,
    sha256(readFileSync(resolve(root, "prisma/migrations", name, "migration.sql"))),
  ]));
  requireCondition(manifest[WAREHOUSE_SHEET_MIGRATION] === WAREHOUSE_SHEET_MIGRATION_CHECKSUM, "SOURCE_CHECKSUM_INVALID");
  return manifest;
}

export function validatePreviewWarehouseSheetHistory(history, manifest) {
  const expected = { ...manifest, [RETAINED_PREVIEW_EXTENSION.name]: RETAINED_PREVIEW_EXTENSION.checksum };
  requireCondition(Array.isArray(history), "HISTORY_INVALID");
  const names = new Set();
  for (const row of history) {
    requireCondition(row && typeof row.migration_name === "string" && !names.has(row.migration_name)
      && Object.hasOwn(expected, row.migration_name) && row.checksum === expected[row.migration_name]
      && row.finished_at && row.rolled_back_at === null && Number(row.applied_steps_count) === 1, "HISTORY_INVALID");
    names.add(row.migration_name);
  }
  const pending = Object.keys(expected).filter((name) => !names.has(name));
  requireCondition(pending.length === 0 || (pending.length === 1 && pending[0] === WAREHOUSE_SHEET_MIGRATION), "PENDING_PLAN_INVALID");
  return { applied: names.size, pending, alreadyApplied: pending.length === 0 };
}

async function snapshot(prisma, manifest, fixtures) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '30s'");
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '3s'");
    const [identity] = await tx.$queryRawUnsafe("SELECT current_database() AS database, current_setting('neon.branch_id', true) AS branch, current_setting('server_version_num') AS server_version_num");
    validatePreviewDatabaseIdentity(identity);
    const { serverMajor, expectedDelta } = selectPreviewWarehouseSheetCatalogProfile(identity.server_version_num, fixtures);
    const schema = await normalizePreviewSnapshotSchema(tx);
    const tenants = await tx.$queryRawUnsafe("SELECT status::text AS status FROM osi.tenants WHERE code = 'V17-CONSOLIDATED-PREVIEW-10B'");
    requireCondition(tenants.length === 1 && tenants[0].status === "ACTIVE", "TENANT_INVALID");
    const history = await tx.$queryRawUnsafe("SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count FROM osi._prisma_migrations ORDER BY migration_name");
    const plan = validatePreviewWarehouseSheetHistory(history, manifest);
    const [relations] = await tx.$queryRawUnsafe("SELECT to_regclass('osi.warehouse_sheet_profiles') IS NOT NULL AS profiles_exists, to_regclass('osi.warehouse_location_addresses') IS NOT NULL AS addresses_exists");
    requireCondition(relations.profiles_exists === plan.alreadyApplied && relations.addresses_exists === plan.alreadyApplied, "RELATION_STATE_INVALID");
    const catalog = await tx.$queryRawUnsafe(CATALOG_SQL);
    const { previousRows, deltaRows } = partitionWarehouseSheetCatalog(catalog);
    const previousCatalog = summarizeCrm01b1Catalog(previousRows);
    const delta = summarizeCrm01b1Catalog(deltaRows);
    requireCondition(plan.alreadyApplied
      ? delta.count === expectedDelta.count && delta.sha256 === expectedDelta.sha256
      : deltaRows.length === 0, "CATALOG_INVALID");
    return { plan, previousCatalog, delta, serverMajor, serverVersionNum: Number(identity.server_version_num), previousHistory: history.filter((row) => row.migration_name !== WAREHOUSE_SHEET_MIGRATION), ...schema };
  }, { maxWait: 5000, timeout: 35000, isolationLevel: "RepeatableRead" });
}

export async function runWarehouseSheetPreviewMigration({ env = process.env, root = process.cwd() } = {}) {
  const operation = previewMigrationOperation(env);
  if (!operation) return null;
  const manifest = previewMigrationManifest(root);
  // These are independent measured deltas. PG17 does not expose table NOT NULL
  // constraints in pg_constraint, so the frozen canonical PG18 fixture remains
  // intact and is never filtered or used as a fallback for another major.
  const fixtures = {
    17: JSON.parse(readFileSync(resolve(root, "tests/crm-01b1/warehouse-sheet-20c-pg17-catalog.json"), "utf8")),
    18: JSON.parse(readFileSync(resolve(root, "tests/crm-01b1/warehouse-sheet-20c-catalog.json"), "utf8")),
  };
  const prismaVersion = JSON.parse(readFileSync(resolve(root, "node_modules/prisma/package.json"), "utf8")).version;
  requireCondition(prismaVersion === "6.19.2", "PRISMA_VERSION_INVALID");
  const prisma = new PrismaClient({ datasources: { db: { url: env.DIRECT_URL } }, log: [] });
  try {
    const before = await snapshot(prisma, manifest, fixtures);
    // APPLY, including an already-applied retry, is bound to the independently
    // reviewed CHECK evidence. It cannot silently accept a changed old catalog.
    validatePreviewCatalogPin(operation, before.previousCatalog);
    if (operation.mode === "CHECK" || before.plan.alreadyApplied) {
      return { operation: operation.mode, commit: operation.commit,
        status: before.plan.alreadyApplied ? "VERIFIED_20C_APPLIED" : "VERIFIED_20C_PENDING",
        applied: before.plan.applied, pending: before.plan.pending,
        serverMajor: before.serverMajor, serverVersionNum: before.serverVersionNum,
        searchPathNormalized: before.searchPathNormalized,
        previousCatalog: { sha256: before.previousCatalog.sha256, count: before.previousCatalog.count },
        retainedHistoricalExtension: RETAINED_PREVIEW_EXTENSION.name, historicalExtensionSourceReviewed: false };
    }
    // Prisma owns execution and its ledger. A checked plan contains only 20C;
    // no db push, manual ledger writes, resolve, seeds or permission grants.
    try {
      await executeFile(process.execPath, [resolve(root, "node_modules/prisma/build/index.js"), "migrate", "deploy", "--schema", resolve(root, "prisma/schema.prisma")], {
        cwd: root, env: { ...env, DATABASE_URL: env.DIRECT_URL, DIRECT_URL: env.DIRECT_URL },
        timeout: 120000, maxBuffer: 1024 * 1024, windowsHide: true,
      });
    } catch { requireCondition(false, "PRISMA_DEPLOY_FAILED"); }
    const after = await snapshot(prisma, manifest, fixtures);
    requireCondition(after.serverMajor === before.serverMajor
      && after.plan.alreadyApplied && after.plan.applied === before.plan.applied + 1
      && JSON.stringify(after.previousHistory) === JSON.stringify(before.previousHistory)
      && after.previousCatalog.count === before.previousCatalog.count
      && after.previousCatalog.sha256 === before.previousCatalog.sha256, "PREVIOUS_STATE_CHANGED");
    return { operation: operation.mode, commit: operation.commit, status: "VERIFIED_20C_APPLIED",
      applied: after.plan.applied, pending: [], previousCatalogPreserved: true,
      serverMajor: after.serverMajor, serverVersionNum: after.serverVersionNum,
      searchPathNormalized: before.searchPathNormalized || after.searchPathNormalized,
      warehouseCatalog: after.delta.sha256, retainedHistoricalExtension: RETAINED_PREVIEW_EXTENSION.name,
      historicalExtensionSourceReviewed: false };
  } finally { await prisma.$disconnect(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    requireCondition(process.argv.length === 3 && process.argv[2] === "--build-hook", "ARGUMENTS_INVALID");
    const result = await runWarehouseSheetPreviewMigration();
    if (result) process.stdout.write(`${JSON.stringify({ warehouseSheetPreviewMigration: result })}\n`);
  } catch (error) {
    const code = /^WAREHOUSE_SHEET_PREVIEW_MIGRATION_[A-Z_]+$/u.test(error?.message ?? "") ? error.message : "WAREHOUSE_SHEET_PREVIEW_MIGRATION_FAILED";
    process.stderr.write(`${JSON.stringify({ warehouseSheetPreviewMigration: { status: "BLOCKED", code } })}\n`);
    process.exitCode = 1;
  }
}
