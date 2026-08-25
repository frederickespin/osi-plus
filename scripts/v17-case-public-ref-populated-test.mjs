import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { validateV17CasePublicRefLocalUrl } from "./v17-case-public-ref-local-target.mjs";

const source = validateV17CasePublicRefLocalUrl();
const CASE_PUBLIC_REF_MIGRATION = "20260821010000_v17_pipeline_case_public_ref";
const sourceUrl = new URL(source.raw);
const database = "osi_v17_case_public_ref_populated";
const targetUrl = new URL(source.raw);
targetUrl.pathname = `/${database}`;
const maintenanceUrl = new URL(source.raw);
maintenanceUrl.pathname = "/postgres";
maintenanceUrl.searchParams.set("schema", "public");
const results = [];
function check(name, condition, detail) {
  results.push({ name, passed: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
  if (!condition) throw new Error(name);
}
function runPrisma(args, cwd, url) {
  const result = spawnSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), ...args], {
    cwd, env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url }, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`PRISMA_COMMAND_FAILED: ${result.error?.message || result.stderr || result.stdout || `exit=${result.status}`}`);
  return `${result.stdout}\n${result.stderr}`;
}
function fingerprint(rows) {
  return createHash("sha256").update(JSON.stringify(rows, (_, value) => typeof value === "bigint" ? value.toString() : value)).digest("hex");
}
const fixturePrefix = `v17pr-pop-${Date.now()}`;
const tempRoot = mkdtempSync(join(tmpdir(), "v17-public-ref-17-"));
const tempPrisma = join(tempRoot, "prisma");
mkdirSync(join(tempPrisma, "migrations"), { recursive: true });
cpSync(resolve("prisma/schema.prisma"), join(tempPrisma, "schema.prisma"));
const migrationNames = readdirSync(resolve("prisma/migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
const baselineMigrationCount = migrationNames.length - 1;
for (const name of migrationNames.filter((name) => name !== CASE_PUBLIC_REF_MIGRATION)) {
  cpSync(resolve("prisma/migrations", name), join(tempPrisma, "migrations", name), { recursive: true });
}

const maintenance = new PrismaClient({ datasourceUrl: maintenanceUrl.toString() });
let prisma;
try {
  await maintenance.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  await maintenance.$executeRawUnsafe(`CREATE DATABASE "${database}"`);
  const firstDeploy = runPrisma(["migrate", "deploy", "--schema", join(tempPrisma, "schema.prisma")], process.cwd(), targetUrl.toString());
  check("baseline poblada contiene la cadena actual sin migración 18", new RegExp(`${baselineMigrationCount} migrations found`).test(firstDeploy));
  prisma = new PrismaClient({ datasourceUrl: targetUrl.toString() });
  const [preflight] = await prisma.$queryRawUnsafe(`
    SELECT
      (SELECT COUNT(*)::integer FROM "osi"."_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS migrations,
      to_regprocedure('pg_catalog.gen_random_uuid()') IS NOT NULL AS uuid_available,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='osi' AND table_name='osi_pipeline_cases' AND column_name='public_ref') AS column_exists
  `);
  check("gen_random_uuid disponible antes de migrar", preflight.uuid_available === true);
  check("migración 18 y columna ausentes antes del ensayo", preflight.migrations === baselineMigrationCount && preflight.column_exists === false);

  const tenants = [];
  const clients = [];
  const owners = [];
  for (let index = 0; index < 3; index += 1) {
    tenants.push(await prisma.tenant.create({ data: { id: `${fixturePrefix}-tenant-${index}`, code: `${fixturePrefix}-T${index}`.toUpperCase(), name: `Synthetic tenant ${index}` } }));
    clients.push(await prisma.client.create({ data: {
      id: `${fixturePrefix}-client-${index}`, tenantId: `${fixturePrefix}-tenant-${index}`, code: `${fixturePrefix}-C${index}`.toUpperCase(),
      name: `Synthetic client ${index}`, email: `${fixturePrefix}-${index}@example.test`, phone: "0000000000", address: "Synthetic",
      type: index % 2 ? "ORGANIZATION" : "PERSON", status: "active", createdAt: "2026-08-21",
    } }));
    owners.push(await prisma.user.create({ data: {
      id: `${fixturePrefix}-owner-${index}`, code: `${fixturePrefix}-O${index}`.toUpperCase(), name: `Synthetic owner ${index}`,
      email: `${fixturePrefix}-owner-${index}@example.test`, normalizedEmail: `${fixturePrefix}-owner-${index}@example.test`, phone: "0000000000",
      role: "V", status: "active", joinDate: "2026-08-21", passwordHash: "synthetic-not-a-credential",
    } }));
  }
  const statuses = ["NEW_INBOX", "AWAITING_ICP", "APPROVED", "OPS_HANDOFF"];
  for (let index = 0; index < 51; index += 1) {
    const tenant = tenants[index % tenants.length];
    const client = index % 2 === 0 ? clients[index % clients.length] : null;
    const owner = index % 3 === 0 ? owners[index % owners.length] : null;
    await prisma.$executeRawUnsafe(`
      INSERT INTO "osi"."osi_pipeline_cases"
        ("id", "tenant_id", "client_id", "caseCode", "clientName", "mode", "serviceType", "customerType", "status", "version", "ownerId", "ownerName", "originLocation", "destinationLocation")
      VALUES ($1,$2,$3,$4,'Synthetic legacy','LOCAL','MOVING','L4_PERSONAL',$5::"osi"."PipelineCaseStatus",$6,$7,'Synthetic owner','Synthetic origin','Synthetic destination')
    `, `${fixturePrefix}-case-${String(index).padStart(2, "0")}`, tenant.id, client?.id ?? null, `${fixturePrefix}-CASE-${String(index).padStart(2, "0")}`.toUpperCase(), statuses[index % statuses.length], (index % 5) + 1, owner?.id ?? null);
  }
  const businessSql = `SELECT "id", "tenant_id", "client_id", "caseCode", "status"::text, "version", "ownerId", "ownerName", "createdAt", "updatedAt" FROM "osi"."osi_pipeline_cases" WHERE "id" LIKE $1 ORDER BY "id"`;
  const businessBeforeRows = await prisma.$queryRawUnsafe(businessSql, `${fixturePrefix}-case-%`);
  const businessBefore = fingerprint(businessBeforeRows);
  const journalBefore = await prisma.pipelineCaseCommand.count({ where: { pipelineCaseId: { startsWith: `${fixturePrefix}-case-` } } });
  check("fixture pre-migración contiene 51 casos variados", businessBeforeRows.length === 51 && new Set(businessBeforeRows.map((row) => row.tenant_id)).size === 3);

  await prisma.$disconnect();
  prisma = undefined;
  const migrationOutput = runPrisma(["migrate", "deploy", "--schema", resolve("prisma/schema.prisma")], process.cwd(), targetUrl.toString());
  check("migración 18 aplicada como único paso", /Applying migration `20260821010000_v17_pipeline_case_public_ref`/.test(migrationOutput));
  prisma = new PrismaClient({ datasourceUrl: targetUrl.toString() });
  const refsFirst = await prisma.$queryRawUnsafe(`SELECT "id", "public_ref"::text AS public_ref FROM "osi"."osi_pipeline_cases" WHERE "id" LIKE $1 ORDER BY "id"`, `${fixturePrefix}-case-%`);
  check("backfill produjo 51 referencias no nulas y distintas", refsFirst.length === 51 && refsFirst.every((row) => row.public_ref) && new Set(refsFirst.map((row) => row.public_ref)).size === 51);
  check("backfill no reutiliza id", refsFirst.every((row) => row.id !== row.public_ref && !row.public_ref.includes(row.id)));
  check("datos empresariales permanecen idénticos", fingerprint(await prisma.$queryRawUnsafe(businessSql, `${fixturePrefix}-case-%`)) === businessBefore);
  check("journal permanece intacto", journalBefore === 0 && await prisma.pipelineCaseCommand.count({ where: { pipelineCaseId: { startsWith: `${fixturePrefix}-case-` } } }) === 0);

  const secondDeploy = runPrisma(["migrate", "deploy", "--schema", resolve("prisma/schema.prisma")], process.cwd(), targetUrl.toString());
  check("segundo deploy sin pendientes", /No pending migrations to apply/.test(secondDeploy));
  const refsSecond = await prisma.$queryRawUnsafe(`SELECT "id", "public_ref"::text AS public_ref FROM "osi"."osi_pipeline_cases" WHERE "id" LIKE $1 ORDER BY "id"`, `${fixturePrefix}-case-%`);
  check("segundo deploy no cambia referencias", fingerprint(refsSecond) === fingerprint(refsFirst));
  await prisma.$disconnect();
  prisma = new PrismaClient({ datasourceUrl: targetUrl.toString() });
  const refsRestart = await prisma.$queryRawUnsafe(`SELECT "id", "public_ref"::text AS public_ref FROM "osi"."osi_pipeline_cases" WHERE "id" LIKE $1 ORDER BY "id"`, `${fixturePrefix}-case-%`);
  check("reinicio Prisma no cambia referencias", fingerprint(refsRestart) === fingerprint(refsFirst));

  await prisma.$disconnect();
  prisma = undefined;
  const rollback = spawnSync(process.execPath, [resolve("scripts/v17-case-public-ref-rollback.mjs")], {
    cwd: process.cwd(), env: { ...process.env, V17_CASE_PUBLIC_REF_TEST_DATABASE_URL: targetUrl.toString() }, encoding: "utf8",
  });
  if (rollback.status !== 0) throw new Error(`ROLLBACK_FAILED: ${rollback.stderr || rollback.stdout}`);
  prisma = new PrismaClient({ datasourceUrl: targetUrl.toString() });
  const [rolledBack] = await prisma.$queryRawUnsafe(`SELECT
    (SELECT COUNT(*)::integer FROM "osi"."_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS migrations,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='osi' AND table_name='osi_pipeline_cases' AND column_name='public_ref') AS column_exists`);
  check("rollback restaura la cadena actual sin migración 18", rolledBack.migrations === baselineMigrationCount && rolledBack.column_exists === false);
  check("rollback conserva datos empresariales", fingerprint(await prisma.$queryRawUnsafe(businessSql, `${fixturePrefix}-case-%`)) === businessBefore);
  await prisma.$disconnect();
  prisma = undefined;
  const status17 = runPrisma(["migrate", "status", "--schema", join(tempPrisma, "schema.prisma")], process.cwd(), targetUrl.toString());
  check("status de cadena sin migración 18 actualizado", /Database schema is up to date/.test(status17));
  runPrisma(["migrate", "deploy", "--schema", resolve("prisma/schema.prisma")], process.cwd(), targetUrl.toString());
  prisma = new PrismaClient({ datasourceUrl: targetUrl.toString() });
  const refsReapplied = await prisma.$queryRawUnsafe(`SELECT "id", "public_ref"::text AS public_ref FROM "osi"."osi_pipeline_cases" WHERE "id" LIKE $1 ORDER BY "id"`, `${fixturePrefix}-case-%`);
  check("reaplicación genera referencias nuevas como se esperaba", refsReapplied.length === 51 && refsReapplied.some((row, index) => row.public_ref !== refsFirst[index].public_ref));
  check("reaplicación conserva datos empresariales", fingerprint(await prisma.$queryRawUnsafe(businessSql, `${fixturePrefix}-case-%`)) === businessBefore);

  process.stdout.write(`${JSON.stringify({ ok: true, target: { database, host: "127.0.0.1", port: 55432 }, assertions: results.length, backfill: { rows: 51, nulls: 0, duplicates: 0 }, rollback: true, reapplied: true, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, target: { database, host: "127.0.0.1", port: 55432 }, assertions: results.length, error: { name: error.name, code: error.code || "V17_PUBLIC_REF_POPULATED_FAILED", message: String(error.message).replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]") }, results }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  if (prisma) await prisma.$disconnect().catch(() => {});
  await maintenance.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`).catch(() => {});
  await maintenance.$disconnect();
  rmSync(tempRoot, { recursive: true, force: true });
}
