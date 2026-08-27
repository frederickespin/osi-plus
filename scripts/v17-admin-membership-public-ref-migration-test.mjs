import { createHash, randomUUID } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const MIGRATION = "20260827010000_v17_tenant_membership_public_ref";
const sourceUrl = new URL(process.env.DATABASE_URL || "");
if (sourceUrl.hostname !== "127.0.0.1" || sourceUrl.port !== "55432" || sourceUrl.pathname !== "/osi_db01n_ci" || sourceUrl.searchParams.get("schema") !== "osi") {
  throw new Error("V17_ADMIN_MEMBERSHIP_MIGRATION_LOCAL_TARGET_REQUIRED");
}
const database = "osi_v17_admin_membership_migration";
const targetUrl = new URL(sourceUrl); targetUrl.pathname = `/${database}`;
const maintenanceUrl = new URL(sourceUrl); maintenanceUrl.pathname = "/postgres"; maintenanceUrl.searchParams.set("schema", "public");
const tempRoot = mkdtempSync(join(tmpdir(), "v17-admin-membership-migration-"));
const tempPrisma = join(tempRoot, "prisma");
const results = [];
function check(name, condition) { results.push({ name, passed: Boolean(condition) }); if (!condition) throw new Error(name); }
function fingerprint(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function prismaCommand(args, url) {
  const result = spawnSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), ...args], {
    cwd: process.cwd(), env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url }, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`PRISMA_COMMAND_FAILED: ${result.stderr || result.stdout}`);
  return `${result.stdout}\n${result.stderr}`;
}

mkdirSync(join(tempPrisma, "migrations"), { recursive: true });
cpSync(resolve("prisma/schema.prisma"), join(tempPrisma, "schema.prisma"));
for (const name of readdirSync(resolve("prisma/migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)) {
  if (name < MIGRATION) cpSync(resolve("prisma/migrations", name), join(tempPrisma, "migrations", name), { recursive: true });
}

const maintenance = new PrismaClient({ datasourceUrl: maintenanceUrl.href });
let prisma;
try {
  await maintenance.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  await maintenance.$executeRawUnsafe(`CREATE DATABASE "${database}"`);
  const baseline = prismaCommand(["migrate", "deploy", "--schema", join(tempPrisma, "schema.prisma")], targetUrl.href);
  check("baseline contiene 19 migraciones", /19 migrations found/.test(baseline));
  prisma = new PrismaClient({ datasourceUrl: targetUrl.href });
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  await prisma.$executeRawUnsafe(`INSERT INTO "osi"."tenants" ("id","code","name","updated_at") VALUES ($1,$2,$3,CURRENT_TIMESTAMP),($4,$5,$6,CURRENT_TIMESTAMP)`, tenantId, `AM-${randomUUID()}`.slice(0, 30).toUpperCase(), "Synthetic admin migration", otherTenantId, `AX-${randomUUID()}`.slice(0, 30).toUpperCase(), "Synthetic other tenant");
  const membershipIds = [];
  for (let index = 0; index < 12; index += 1) {
    const userId = randomUUID(); const membershipId = randomUUID(); membershipIds.push(membershipId);
    await prisma.$executeRawUnsafe(`INSERT INTO "osi"."osi_users" ("id","code","name","email","phone","role","status","department","joinDate","passwordHash","updatedAt") VALUES ($1,$2,$3,$4,'000','A','active','QA','2026-08-27','synthetic-not-login',CURRENT_TIMESTAMP)`, userId, `AM-${index}-${randomUUID()}`.slice(0, 30), `Persona ${index}`, `${randomUUID()}@example.invalid`);
    await prisma.$executeRawUnsafe(`INSERT INTO "osi"."tenant_memberships" ("id","tenant_id","user_id","role","status","granted_permissions","denied_permissions","updated_at") VALUES ($1,$2,$3,'A','ACTIVE',ARRAY[]::text[],ARRAY[]::text[],CURRENT_TIMESTAMP)`, membershipId, tenantId, userId);
  }
  const businessSql = `SELECT "id","tenant_id","user_id","role"::text,"status"::text,"granted_permissions","denied_permissions","authorization_version" FROM "osi"."tenant_memberships" WHERE "tenant_id"=$1 ORDER BY "id"`;
  const before = await prisma.$queryRawUnsafe(businessSql, tenantId);
  const beforeFingerprint = fingerprint(before);
  const [preflight] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::integer AS migrations, EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='osi' AND table_name='tenant_memberships' AND column_name='public_ref') AS column_exists FROM "osi"."_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`);
  check("publicRef ausente antes de migrar", preflight.migrations === 19 && preflight.column_exists === false);
  await prisma.$disconnect(); prisma = undefined;

  const deployed = prismaCommand(["migrate", "deploy", "--schema", resolve("prisma/schema.prisma")], targetUrl.href);
  check("migraciones 20 y 21 se aplican en orden", deployed.includes(`Applying migration \`${MIGRATION}\``)
    && deployed.includes("Applying migration `20260827020000_v17_admin_identity_invitation`"));
  prisma = new PrismaClient({ datasourceUrl: targetUrl.href });
  const refs = await prisma.$queryRawUnsafe(`SELECT "id","public_ref"::text AS "ref" FROM "osi"."tenant_memberships" WHERE "tenant_id"=$1 ORDER BY "id"`, tenantId);
  check("backfill UUID v4 no nulo y único", refs.length === 12 && refs.every((row) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(row.ref)) && new Set(refs.map((row) => row.ref)).size === 12);
  check("datos empresariales intactos", fingerprint(await prisma.$queryRawUnsafe(businessSql, tenantId)) === beforeFingerprint);
  let immutable = false; try { await prisma.$executeRawUnsafe(`UPDATE "osi"."tenant_memberships" SET "public_ref"=$1::uuid WHERE "id"=$2`, randomUUID(), membershipIds[0]); } catch { immutable = true; }
  check("publicRef inmutable", immutable);
  const firstRef = refs[0].ref;
  const userOther = randomUUID();
  await prisma.$executeRawUnsafe(`INSERT INTO "osi"."osi_users" ("id","code","name","email","phone","role","status","department","joinDate","passwordHash","updatedAt") VALUES ($1,$2,'Other','other-'||$1||'@example.invalid','000','A','active','QA','2026-08-27','synthetic-not-login',CURRENT_TIMESTAMP)`, userOther, `AO-${randomUUID()}`.slice(0, 30));
  await prisma.$executeRawUnsafe(`INSERT INTO "osi"."tenant_memberships" ("id","tenant_id","user_id","public_ref","role","status","updated_at") VALUES ($1,$2,$3,$4::uuid,'A','ACTIVE',CURRENT_TIMESTAMP)`, randomUUID(), otherTenantId, userOther, firstRef);
  let duplicateRejected = false; try { await prisma.$executeRawUnsafe(`INSERT INTO "osi"."tenant_memberships" ("id","tenant_id","user_id","public_ref","role","status","updated_at") VALUES ($1,$2,$3,$4::uuid,'A','ACTIVE',CURRENT_TIMESTAMP)`, randomUUID(), tenantId, userOther, firstRef); } catch { duplicateRejected = true; }
  check("unicidad es tenant-first", duplicateRejected);
  const second = prismaCommand(["migrate", "deploy", "--schema", resolve("prisma/schema.prisma")], targetUrl.href);
  check("segundo deploy sin pendientes", /No pending migrations to apply/.test(second));
  const diff = prismaCommand(["migrate", "diff", "--from-url", targetUrl.href, "--to-schema-datamodel", resolve("prisma/schema.prisma"), "--script", "--exit-code"], targetUrl.href);
  check("drift vacío", /This is an empty migration/.test(diff));
  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, backfill: 12, results }, null, 2)}\n`);
} finally {
  if (prisma) await prisma.$disconnect().catch(() => {});
  await maintenance.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`).catch(() => {});
  await maintenance.$disconnect();
  rmSync(tempRoot, { recursive: true, force: true });
}
