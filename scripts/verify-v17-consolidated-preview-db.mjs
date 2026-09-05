import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const EXPECTED_DATABASE = "v17_consolidated_preview_10b";
const EXPECTED_BRANCH = "br-mute-credit-ahxnvfx0";

const prisma = new PrismaClient();

try {
  const identity = await prisma.$queryRawUnsafe("SELECT current_database() AS database, current_setting('neon.branch_id', true) AS branch");
  if (identity[0]?.database !== EXPECTED_DATABASE || identity[0]?.branch !== EXPECTED_BRANCH) throw new Error("PREVIEW_DB_IDENTITY_INVALID");
  const rows = await prisma.$queryRawUnsafe("SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count FROM osi._prisma_migrations ORDER BY migration_name");
  const directories = readdirSync("prisma/migrations").filter((entry) => existsSync(path.join("prisma/migrations", entry, "migration.sql"))).sort();
  const mismatches = rows.filter((row, index) => {
    const migration = directories[index];
    const checksum = migration ? createHash("sha256").update(readFileSync(path.join("prisma/migrations", migration, "migration.sql"))).digest("hex") : null;
    return row.migration_name !== migration || row.checksum !== checksum || !row.finished_at || row.rolled_back_at || row.applied_steps_count !== 1;
  });
  const migrationTables = await prisma.$queryRawUnsafe("SELECT table_schema, count(*)::int AS count FROM information_schema.tables WHERE table_name = '_prisma_migrations' GROUP BY table_schema ORDER BY table_schema");
  console.log(JSON.stringify({ database: EXPECTED_DATABASE, branch: EXPECTED_BRANCH, applied: rows.length, pending: directories.length - rows.length, failed: rows.filter((row) => !row.finished_at || row.rolled_back_at).length, checksumMismatches: mismatches.length, migrationTables }));
} finally {
  await prisma.$disconnect();
}
