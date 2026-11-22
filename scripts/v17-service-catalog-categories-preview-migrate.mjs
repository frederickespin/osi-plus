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

const PREVIOUS_MIGRATION = "20261121010000_v17_fleet_transit_classification";
const CATEGORY_MIGRATION = "20261121020000_v17_service_catalog_categories";

async function migrateCategories(env = process.env) {
  const commit = env.V17_SERVICE_CATALOG_CATEGORIES_PREVIEW_COMMIT;
  if (!commit || commit !== env.VERCEL_GIT_COMMIT_SHA || env.VERCEL !== "1" || env.VERCEL_ENV !== "preview"
    || env.VERCEL_GIT_COMMIT_REF !== V17_COMMERCIAL_STORAGE_SERVICES_PREVIEW_BRANCH) return false;
  if (!/^[a-f0-9]{40}$/u.test(commit) || env.PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK !== undefined) {
    throw new Error("PREVIEW_TARGET_INVALID");
  }

  const target = assertAdminFleetPreviewEnvironment(env);
  const app = new URL(env.DATABASE_URL);
  const direct = new URL(env.DIRECT_URL);
  if (!["postgresql:", "postgres:"].includes(direct.protocol) || direct.hostname.includes("-pooler.")
    || direct.hostname !== app.hostname.replace(/-pooler(?=\.)/u, "") || (direct.port || "5432") !== (app.port || "5432")
    || decodeURIComponent(direct.pathname.slice(1)) !== target.database || direct.searchParams.getAll("schema").length !== 1
    || direct.searchParams.get("schema") !== "osi" || direct.hash) throw new Error("DIRECT_TARGET_INVALID");

  const names = validateMigrationFiles();
  if (names.at(-2) !== PREVIOUS_MIGRATION || names.at(-1) !== CATEGORY_MIGRATION) {
    throw new Error("MIGRATION_INVENTORY_INVALID");
  }
  const checksums = new Map(names.map((name) => [
    name, createHash("sha256").update(readFileSync(resolve("prisma/migrations", name, "migration.sql"))).digest("hex"),
  ]));
  checksums.set(RETAINED_PREVIEW_EXTENSION.name, RETAINED_PREVIEW_EXTENSION.checksum);
  const required = [...names.slice(0, -1), RETAINED_PREVIEW_EXTENSION.name];
  const prisma = new PrismaClient({ datasources: { db: { url: env.DIRECT_URL } }, log: [] });

  async function applied() {
    await assertAdminFleetDatabase(prisma, "PREVIEW_REHEARSAL", env);
    const rows = await prisma.$queryRaw`
      SELECT "migration_name", "checksum", "finished_at", "applied_steps_count"
      FROM "osi"."_prisma_migrations"
      WHERE "rolled_back_at" IS NULL
    `;
    const appliedNames = new Set();
    for (const row of rows) {
      if (appliedNames.has(row.migration_name) || checksums.get(row.migration_name) !== row.checksum
        || !row.finished_at || row.applied_steps_count !== 1) throw new Error("MIGRATION_HISTORY_INVALID");
      appliedNames.add(row.migration_name);
    }
    const [schema] = await prisma.$queryRaw`
      SELECT to_regclass('osi.service_catalog_categories') IS NOT NULL AS "categories_exist"
    `;
    const categoriesApplied = appliedNames.has(CATEGORY_MIGRATION);
    if (required.some((name) => !appliedNames.has(name)) || schema?.categories_exist !== categoriesApplied) {
      throw new Error("MIGRATION_STATE_INVALID");
    }
    return categoriesApplied;
  }

  try {
    if (!await applied()) {
      await promisify(execFile)(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], {
        env: { ...env, DATABASE_URL: env.DIRECT_URL }, timeout: 120000, maxBuffer: 1048576, windowsHide: true,
      });
      if (!await applied()) throw new Error("MIGRATION_MISSING");
    }
    return true;
  } finally {
    await prisma.$disconnect();
  }
}

try {
  if (await migrateCategories()) process.stdout.write("Service catalog categories verified in the commercial Preview.\n");
} catch (error) {
  const message = /^[A-Z_]+$/u.test(error?.message ?? "") ? error.message : "DATABASE_OPERATION_FAILED";
  process.stderr.write("SERVICE_CATALOG_CATEGORIES_PREVIEW_MIGRATION_" + message + "\n");
  process.exitCode = 1;
}
