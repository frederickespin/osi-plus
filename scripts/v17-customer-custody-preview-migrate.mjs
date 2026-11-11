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
export const CUSTOMER_CUSTODY_MIGRATION = "20261111020000_v17_customer_custody_inventory_numbers";
export const CUSTOMER_CUSTODY_MIGRATION_CHECKSUM = "e238d66e5f18f03016d294424100c5e1daf46fc248e96a2d0c48f3c59177069e";
export const RETAINED_PREVIEW_EXTENSION = Object.freeze({
  name: "20260917010000_v17_engineering_crating",
  checksum: "b437aae3600a23c655d97e674c3bfaa9a1721e0d54a26dcccc1181d90fdf2d0f",
});

const executeFile = promisify(execFile);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
function requireCondition(condition, code) {
  if (!condition) throw new Error(`CUSTOMER_CUSTODY_PREVIEW_MIGRATION_${code}`);
}

function classifyUnexpectedFailure(error, stage) {
  const rawCode = error?.code ?? error?.errorCode;
  const prismaCode = typeof rawCode === "string" && /^P[0-9]{4}$/u.test(rawCode) ? rawCode : null;
  const safeNames = new Set(["PrismaClientInitializationError", "PrismaClientKnownRequestError",
    "PrismaClientUnknownRequestError", "PrismaClientValidationError", "TypeError"]);
  const safeName = safeNames.has(error?.name) ? error.name.replace(/([a-z])([A-Z])/gu, "$1_$2").toUpperCase() : null;
  requireCondition(false, [stage, prismaCode, safeName].filter(Boolean).join("_"));
}

function validateTargetUrls(env) {
  let direct;
  let application;
  try {
    direct = new URL(env.DIRECT_URL);
    application = new URL(env.DATABASE_URL);
  } catch {
    requireCondition(false, "DIRECT_TARGET_INVALID_URL");
  }
  requireCondition(["postgres:", "postgresql:"].includes(direct.protocol)
    && ["postgres:", "postgresql:"].includes(application.protocol), "DIRECT_TARGET_INVALID_PROTOCOL");
  requireCondition(Boolean(direct.hostname) && !direct.hostname.includes("-pooler."), "DIRECT_TARGET_INVALID_DIRECT_HOST");
  requireCondition(direct.hostname === application.hostname.replace(/-pooler(?=\.)/u, ""), "DIRECT_TARGET_INVALID_HOST_PAIR");
  requireCondition((direct.port || "5432") === (application.port || "5432"), "DIRECT_TARGET_INVALID_PORT_PAIR");
  requireCondition(decodeURIComponent(direct.pathname.slice(1)) === "v17_consolidated_preview_10b"
    && decodeURIComponent(application.pathname.slice(1)) === "v17_consolidated_preview_10b", "DIRECT_TARGET_INVALID_DATABASE");
  requireCondition(direct.searchParams.getAll("schema").length === 1 && direct.searchParams.get("schema") === "osi"
    && application.searchParams.getAll("schema").length === 1 && application.searchParams.get("schema") === "osi", "DIRECT_TARGET_INVALID_SCHEMA");
  requireCondition(!direct.hash && !application.hash, "DIRECT_TARGET_INVALID_FRAGMENT");
}

export function previewMigrationOperation(env = process.env) {
  const raw = env[CUSTOMER_CUSTODY_PREVIEW_MIGRATION_OPERATION];
  if (raw === undefined || raw === "DISABLED") return null;
  const match = /^APPLY:([a-f0-9]{40})$/u.exec(raw);
  requireCondition(match
    && env.VERCEL === "1"
    && env.VERCEL_ENV === "preview"
    && env.VERCEL_GIT_COMMIT_REF === "feature/v17-storage-commercial-contract-22a"
    && env.VERCEL_GIT_COMMIT_SHA === match[1], "OPERATION_TARGET_INVALID");
  requireCondition(env.PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK === undefined, "MIGRATION_LOCK_REQUIRED");
  requireCondition(env.CUSTOMER_CUSTODY_API_MODE === "PREVIEW_REHEARSAL"
    && env.CUSTOMER_CUSTODY_API_BATCH === "V17-STORAGE-COMMERCIAL-CONTRACT-22A-PREVIEW"
    && env.VITE_CUSTOMER_CUSTODY_UI_MODE === "PREVIEW_REHEARSAL"
    && env.VITE_CUSTOMER_CUSTODY_UI_BATCH === "V17-STORAGE-COMMERCIAL-CONTRACT-22A-PREVIEW", "FEATURE_GATE_INVALID");
  validateTargetUrls(env);
  return Object.freeze({ commit: match[1] });
}

export function previewMigrationManifest(root = process.cwd()) {
  const names = validateMigrationFiles(root);
  requireCondition(names.length === 48 && names.at(-1) === CUSTOMER_CUSTODY_MIGRATION, "SOURCE_INVENTORY_INVALID");
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

export function validatePreviewRelationState(relations, alreadyApplied) {
  const base = ["grants_exists", "lots_exists", "items_exists", "commands_exists", "movements_exists",
    "storage_groups_exists", "reception_workflow_exists", "scan_first_exists"];
  requireCondition(relations && base.every((name) => relations[name] === true)
    && relations.authorizations_exists === true
    && relations.lot_authorization_exists === true
    && relations.agreements_exists === true
    && relations.authorization_agreement_exists === true
    && relations.inventory_number_exists === alreadyApplied
    && relations.next_item_number_exists === alreadyApplied
    && Object.values(relations).filter(Boolean).length === (alreadyApplied ? 14 : 12), "RELATION_STATE_INVALID");
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
    const [relations] = await tx.$queryRawUnsafe("SELECT to_regclass('osi.warehouse_access_grants') IS NOT NULL AS grants_exists, to_regclass('osi.customer_storage_lots') IS NOT NULL AS lots_exists, to_regclass('osi.customer_stored_items') IS NOT NULL AS items_exists, to_regclass('osi.customer_custody_commands') IS NOT NULL AS commands_exists, to_regclass('osi.customer_custody_movements') IS NOT NULL AS movements_exists, EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'osi' AND table_name = 'customer_storage_lots' AND column_name = 'storage_type') AS storage_groups_exists, EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'osi' AND table_name = 'customer_storage_lots' AND column_name = 'reception_stage') AS reception_workflow_exists, to_regclass('osi.customer_custody_location_states') IS NOT NULL AS scan_first_exists, to_regclass('osi.customer_storage_authorizations') IS NOT NULL AS authorizations_exists, EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'osi' AND table_name = 'customer_storage_lots' AND column_name = 'authorization_id') AS lot_authorization_exists, to_regclass('osi.customer_storage_agreements') IS NOT NULL AS agreements_exists, EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'osi' AND table_name = 'customer_storage_authorizations' AND column_name = 'storage_agreement_id') AS authorization_agreement_exists, EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'osi' AND table_name = 'customer_stored_items' AND column_name = 'inventory_number') AS inventory_number_exists, EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'osi' AND table_name = 'customer_storage_lots' AND column_name = 'next_item_number') AS next_item_number_exists");
    validatePreviewRelationState(relations, plan.alreadyApplied);
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
    let before;
    try {
      before = await snapshot(prisma, manifest);
    } catch (error) {
      if (/^CUSTOMER_CUSTODY_PREVIEW_MIGRATION_[A-Z0-9_]+$/u.test(error?.message ?? "")) throw error;
      classifyUnexpectedFailure(error, "SNAPSHOT_FAILED");
    }
    if (before.plan.alreadyApplied) {
      return { commit: operation.commit, status: "VERIFIED_22A_APPLIED", applied: before.plan.applied,
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
    let after;
    try {
      after = await snapshot(prisma, manifest);
    } catch (error) {
      if (/^CUSTOMER_CUSTODY_PREVIEW_MIGRATION_[A-Z0-9_]+$/u.test(error?.message ?? "")) throw error;
      classifyUnexpectedFailure(error, "VERIFY_SNAPSHOT_FAILED");
    }
    const previousBefore = before.history.filter((row) => row.migration_name !== CUSTOMER_CUSTODY_MIGRATION);
    const previousAfter = after.history.filter((row) => row.migration_name !== CUSTOMER_CUSTODY_MIGRATION);
    requireCondition(after.plan.alreadyApplied && after.plan.applied === before.plan.applied + 1
      && JSON.stringify(previousAfter) === JSON.stringify(previousBefore), "PREVIOUS_STATE_CHANGED");
    return { commit: operation.commit, status: "VERIFIED_22A_APPLIED", applied: after.plan.applied,
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
    const code = /^CUSTOMER_CUSTODY_PREVIEW_MIGRATION_[A-Z0-9_]+$/u.test(error?.message ?? "")
      ? error.message : "CUSTOMER_CUSTODY_PREVIEW_MIGRATION_FAILED";
    process.stderr.write(`${JSON.stringify({ customerCustodyPreviewMigration: { status: "BLOCKED", code } })}\n`);
    process.exitCode = 1;
  }
}
