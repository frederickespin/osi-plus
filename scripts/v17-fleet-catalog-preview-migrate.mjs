import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { PrismaClient } from "@prisma/client";
import { assertAdminFleetDatabase, assertAdminFleetPreviewEnvironment } from "../api/_lib/adminFleetAccess.js";
import { V17_COMMERCIAL_STORAGE_SERVICES_PREVIEW_BRANCH } from "../shared/v17ConsolidatedPreview.js";
import { validateMigrationFiles } from "./canonical-migrations.mjs";
import { RETAINED_PREVIEW_EXTENSION } from "./v17-customer-custody-preview-migrate.mjs";

const MIGRATION = "20261120010000_v17_fleet_vehicle_types";

async function migrateFleetCatalog(env = process.env) {
  const commit = env.V17_FLEET_CATALOG_PREVIEW_COMMIT;
  if (!commit || commit !== env.VERCEL_GIT_COMMIT_SHA) return false;
  if (!/^[a-f0-9]{40}$/u.test(commit) || env.VERCEL_GIT_COMMIT_REF !== V17_COMMERCIAL_STORAGE_SERVICES_PREVIEW_BRANCH
    || env.PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK !== undefined) throw new Error("PREVIEW_TARGET_INVALID");
  const target = assertAdminFleetPreviewEnvironment(env);
  const app = new URL(env.DATABASE_URL);
  const direct = new URL(env.DIRECT_URL);
  if (!["postgresql:", "postgres:"].includes(direct.protocol) || direct.hostname.includes("-pooler.")
    || direct.hostname !== app.hostname.replace(/-pooler(?=\.)/u, "") || (direct.port || "5432") !== (app.port || "5432")
    || decodeURIComponent(direct.pathname.slice(1)) !== target.database || direct.searchParams.getAll("schema").length !== 1
    || direct.searchParams.get("schema") !== "osi" || direct.hash) throw new Error("DIRECT_TARGET_INVALID");

  const names = validateMigrationFiles();
  if (names.at(-1) !== MIGRATION) throw new Error("MIGRATION_INVENTORY_INVALID");
  const checksums = new Map(names.map((name) => [
    name, createHash("sha256").update(readFileSync(resolve("prisma/migrations", name, "migration.sql"))).digest("hex"),
  ]));
  checksums.set(RETAINED_PREVIEW_EXTENSION.name, RETAINED_PREVIEW_EXTENSION.checksum);
  const prisma = new PrismaClient({ datasources: { db: { url: env.DIRECT_URL } }, log: [] });
  async function readApplied() {
    await assertAdminFleetDatabase(prisma, "PREVIEW_REHEARSAL", env);
    const rows = await prisma.$queryRaw`
      SELECT "migration_name", "checksum", "finished_at", "rolled_back_at", "applied_steps_count"
      FROM "osi"."_prisma_migrations"
    `;
    const applied = new Set();
    for (const row of rows) {
      if (applied.has(row.migration_name) || checksums.get(row.migration_name) !== row.checksum
        || !row.finished_at || row.rolled_back_at || row.applied_steps_count !== 1) throw new Error("MIGRATION_HISTORY_INVALID");
      applied.add(row.migration_name);
    }
    const [{ exists }] = await prisma.$queryRaw`SELECT to_regclass('osi.fleet_vehicle_types') IS NOT NULL AS "exists"`;
    if (names.slice(0, -1).some((name) => !applied.has(name)) || exists !== applied.has(MIGRATION)) throw new Error("MIGRATION_STATE_INVALID");
    return exists;
  }
  try {
    if (!await readApplied()) {
      await promisify(execFile)(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], {
        env: { ...env, DATABASE_URL: env.DIRECT_URL }, timeout: 120000, maxBuffer: 1048576, windowsHide: true,
      });
      if (!await readApplied()) throw new Error("FLEET_CATALOG_MIGRATION_MISSING");
    }
    return true;
  } finally {
    await prisma.$disconnect();
  }
}

try {
  if (await migrateFleetCatalog()) process.stdout.write("Fleet vehicle catalog verified in the commercial Preview.\n");
} catch (error) {
  const message = /^[A-Z_]+$/u.test(error?.message ?? "") ? error.message : "DATABASE_OPERATION_FAILED";
  process.stderr.write("FLEET_CATALOG_PREVIEW_MIGRATION_" + message + "\n");
  process.exitCode = 1;
}
