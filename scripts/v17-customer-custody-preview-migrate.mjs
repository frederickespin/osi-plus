// One reviewed Preview transition for customer custody. The hook is inert unless
// an exact branch/commit operation is present. Credentials remain inside the
// Vercel build environment and are never written to command arguments or logs.
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { PrismaClient } from "@prisma/client";
import { validateMigrationFiles } from "./canonical-migrations.mjs";

export const CUSTOMER_CUSTODY_PREVIEW_MIGRATION_OPERATION = "V17_CUSTOMER_CUSTODY_PREVIEW_MIGRATION";
export const CUSTOMER_CUSTODY_MIGRATION = "20261106010000_v17_customer_custody";
export const CUSTOMER_CUSTODY_MIGRATION_CHECKSUM = "a336da2ff366cf1134414e84d57b10cfff3219b30eee8d9023105f16eaef59ce";
export const RETAINED_PREVIEW_EXTENSION = Object.freeze({
  name: "20260917010000_v17_engineering_crating",
  checksum: "b437aae3600a23c655d97e674c3bfaa9a1721e0d54a26dcccc1181d90fdf2d0f",
});

const executeFile = promisify(execFile);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
function requireCondition(condition, code) {
  if (!condition) throw new Error(`CUSTOMER_CUSTODY_PREVIEW_MIGRATION_${code}`);
}

function validateTargetUrls(env) {
  let direct;
  let application;
  try {
    direct = new URL(env.DIRECT_URL);
    application = new URL(env.DATABASE_URL);
  } catch {
    requireCondition(false, "DIRECT_TARGET_INVALID");
  }
  requireCondition(["postgres:", "postgresql:"].includes(direct.protocol)
    && ["postgres:", "postgresql:"].includes(application.protocol)
    && Boolean(direct.hostname) && !direct.hostname.includes("-pooler.")
    && direct.hostname === application.hostname.replace(/-pooler(?=\.)/u, "")
    && (direct.port || "5432") === (application.port || "5432")
    && decodeURIComponent(direct.pathname.slice(1)) === "v17_consolidated_preview_10b"
    && decodeURIComponent(application.pathname.slice(1)) === "v17_consolidated_preview_10b"
    && direct.searchParams.getAll("schema").length === 1 && direct.searchParams.get("schema") === "osi"
    && application.searchParams.getAll("schema").length === 1 && application.searchParams.get("schema") === "osi"
    && !direct.hash && !application.hash, "DIRECT_TARGET_INVALID");
}

export function previewMigrationOperation(env = process.env) {
  const raw = env[CUSTOMER_CUSTODY_PREVIEW_MIGRATION_OPERATION];
  if (raw === undefined || raw === "DISABLED") return null;
  const match = /^APPLY:([a-f0-9]{40})$/u.exec(raw);
  requireCondition(match
    && env.VERCEL === "1"
    && env.VERCEL_ENV === "preview"
    && env.VERCEL_GIT_COMMIT_REF === "feature/v17-customer-custody-21a"
    && env.VERCEL_GIT_COMMIT_SHA === match[1], "OPERATION_TARGET_INVALID");
  requireCondition(env.PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK === undefined, "MIGRATION_LOCK_REQUIRED");
  requireCondition(env.CUSTOMER_CUSTODY_API_MODE === "PREVIEW_REHEARSAL"
    && env.CUSTOMER_CUSTODY_API_BATCH === "V17-CUSTOMER-CUSTODY-21A-PREVIEW"
    && env.VITE_CUSTOMER_CUSTODY_UI_MODE === "PREVIEW_REHEARSAL"
    && env.VITE_CUSTOMER_CUSTODY_UI_BATCH === "V17-CUSTOMER-CUSTODY-21A-PREVIEW", "FEATURE_GATE_INVALID");
  validateTargetUrls(env);
  return Object.freeze({ commit: match[1] });
}

export function previewMigrationManifest(root = process.cwd()) {
  const names = validateMigrationFiles(root);
  requireCondition(names.length === 42 && names.at(-1) === CUSTOMER_CUSTODY_MIGRATION, "SOURCE_INVENTORY_INVALID");
  const manifest = Object.fromEntries(names.map((name) => [name,
    sha256(readFileSync(resolve(root, "prisma/migrations", name, "migration.sql"))),
  ]));
  requireCondition(manifest[CUSTOMER_CUSTODY_MIGRATION] === CUSTOMER_CUSTODY_MIGRATION_CHECKSUM, "SOURCE_CHECKSUM_INVALID");
  return manifest;
}

export function validatePreviewHistory(history, manifest) {
  requireCondition(Array.isArray(history), "HISTORY_INVALID");
  const expected = { ...manifest, [RETAINED_PREVIEW_EXTENSION.name]: RETAINED_PREVIEW_EXTENSION.checksum };
  const names = new Set();
  for (const row of history) {
    requireCondition(row && typeof row.migration_name === "string" && !names.has(row.migration_name)
      && Object.hasOwn(expected, row.migration_name) && row.checksum === expected[row.migration_name]
      && row.finished_at && row.rolled_back_at === null && Number(row.applied_steps_count) === 1, "HISTORY_INVALID");
    names.add(row.migration_name);
  }
  const previous = Object.keys(manifest).filter((name) => name !== CUSTOMER_CUSTODY_MIGRATION);
  requireCondition(previous.every((name) => names.has(name))
    && names.has(RETAINED_PREVIEW_EXTENSION.name)
    && names.size === previous.length + 1 + (names.has(CUSTOMER_CUSTODY_MIGRATION) ? 1 : 0), "HISTORY_INVALID");
  return Object.freeze({ alreadyApplied: names.has(CUSTOMER_CUSTODY_MIGRATION), applied: names.size });
}

async function snapshot(prisma, manifest) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '30s'");
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '3s'");
    await tx.$executeRawUnsafe("SET LOCAL search_path = osi");
    const [identity] = await tx.$queryRawUnsafe("SELECT current_database() AS database, current_setting('neon.branch_id', true) AS branch, current_setting('server_version_num') AS server_version_num");
    requireCondition(identity?.database === "v17_consolidated_preview_10b"
      && identity.branch === "br-bitter-mountain-ahs311pu"
      && [17, 18].includes(Math.floor(Number(identity.server_version_num) / 10000)), "DATABASE_IDENTITY_INVALID");
    const tenants = await tx.$queryRawUnsafe("SELECT status::text AS status FROM osi.tenants WHERE code = 'V17-CONSOLIDATED-PREVIEW-10B'");
    requireCondition(tenants.length === 1 && tenants[0].status === "ACTIVE", "TENANT_INVALID");
    const history = await tx.$queryRawUnsafe("SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count FROM osi._prisma_migrations ORDER BY migration_name");
    const plan = validatePreviewHistory(history, manifest);
    const [relations] = await tx.$queryRawUnsafe("SELECT to_regclass('osi.warehouse_access_grants') IS NOT NULL AS grants_exists, to_regclass('osi.customer_storage_lots') IS NOT NULL AS lots_exists, to_regclass('osi.customer_stored_items') IS NOT NULL AS items_exists, to_regclass('osi.customer_custody_commands') IS NOT NULL AS commands_exists, to_regclass('osi.customer_custody_movements') IS NOT NULL AS movements_exists");
    const relationCount = Object.values(relations).filter(Boolean).length;
    requireCondition(relationCount === (plan.alreadyApplied ? 5 : 0), "RELATION_STATE_INVALID");
    return { plan, history, serverVersionNum: Number(identity.server_version_num) };
  }, { maxWait: 5000, timeout: 35000, isolationLevel: "RepeatableRead" });
}

export async function runCustomerCustodyPreviewMigration({ env = process.env, root = process.cwd() } = {}) {
  const operation = previewMigrationOperation(env);
  if (!operation) return null;
  const manifest = previewMigrationManifest(root);
  const prismaVersion = JSON.parse(readFileSync(resolve(root, "node_modules/prisma/package.json"), "utf8")).version;
  requireCondition(prismaVersion === "6.19.2", "PRISMA_VERSION_INVALID");
  const prisma = new PrismaClient({ datasources: { db: { url: env.DIRECT_URL } }, log: [] });
  try {
    const before = await snapshot(prisma, manifest);
    if (before.plan.alreadyApplied) {
      return { commit: operation.commit, status: "VERIFIED_21A_APPLIED", applied: before.plan.applied,
        serverVersionNum: before.serverVersionNum, retainedHistoricalExtension: RETAINED_PREVIEW_EXTENSION.name };
    }
    try {
      await executeFile(process.execPath, [resolve(root, "node_modules/prisma/build/index.js"), "migrate", "deploy", "--schema", resolve(root, "prisma/schema.prisma")], {
        cwd: root,
        env: { ...env, DATABASE_URL: env.DIRECT_URL, DIRECT_URL: env.DIRECT_URL },
        timeout: 120000,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      });
    } catch {
      requireCondition(false, "PRISMA_DEPLOY_FAILED");
    }
    const after = await snapshot(prisma, manifest);
    const previousBefore = before.history.filter((row) => row.migration_name !== CUSTOMER_CUSTODY_MIGRATION);
    const previousAfter = after.history.filter((row) => row.migration_name !== CUSTOMER_CUSTODY_MIGRATION);
    requireCondition(after.plan.alreadyApplied && after.plan.applied === before.plan.applied + 1
      && JSON.stringify(previousAfter) === JSON.stringify(previousBefore), "PREVIOUS_STATE_CHANGED");
    return { commit: operation.commit, status: "VERIFIED_21A_APPLIED", applied: after.plan.applied,
      previousHistoryPreserved: true, serverVersionNum: after.serverVersionNum,
      retainedHistoricalExtension: RETAINED_PREVIEW_EXTENSION.name };
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    requireCondition(process.argv.length === 3 && process.argv[2] === "--build-hook", "ARGUMENTS_INVALID");
    const result = await runCustomerCustodyPreviewMigration();
    if (result) process.stdout.write(`${JSON.stringify({ customerCustodyPreviewMigration: result })}\n`);
  } catch (error) {
    const code = /^CUSTOMER_CUSTODY_PREVIEW_MIGRATION_[A-Z_]+$/u.test(error?.message ?? "")
      ? error.message : "CUSTOMER_CUSTODY_PREVIEW_MIGRATION_FAILED";
    process.stderr.write(`${JSON.stringify({ customerCustodyPreviewMigration: { status: "BLOCKED", code } })}\n`);
    process.exitCode = 1;
  }
}
