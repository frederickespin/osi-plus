import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { validateV17CasePublicRefLocalUrl } from "./v17-case-public-ref-local-target.mjs";

const source = validateV17CasePublicRefLocalUrl();
const CASE_PUBLIC_REF_MIGRATION = "20260821010000_v17_pipeline_case_public_ref";
const database = "osi_v17_case_public_ref_race";
const atomicDatabase = "osi_v17_case_public_ref_atomic";
const targetUrl = new URL(source.raw);
targetUrl.pathname = `/${database}`;
targetUrl.searchParams.set("connection_limit", "8");
const maintenanceUrl = new URL(source.raw);
maintenanceUrl.pathname = "/postgres";
maintenanceUrl.searchParams.set("schema", "public");
const results = [];
const atomicUrl = new URL(targetUrl);
atomicUrl.pathname = `/${atomicDatabase}`;

function check(name, condition, detail) {
  results.push({ name, passed: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
  if (!condition) throw new Error(name);
}

function fingerprint(rows) {
  return createHash("sha256")
    .update(JSON.stringify(rows, (_, value) => typeof value === "bigint" ? value.toString() : value))
    .digest("hex");
}

function runPrisma(args, schema, url) {
  const result = spawnSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), ...args, "--schema", schema], {
    cwd: process.cwd(), env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url }, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`PRISMA_COMMAND_FAILED: ${result.error?.message || result.stderr || result.stdout || `exit=${result.status}`}`);
  return `${result.stdout}\n${result.stderr}`;
}

function startMigration(schema, url) {
  const child = spawn(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy", "--schema", schema], {
    cwd: process.cwd(), env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url }, stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  return new Promise((resolveMigration, rejectMigration) => {
    child.once("error", rejectMigration);
    child.once("exit", (code) => {
      if (code !== 0) rejectMigration(new Error(`MIGRATION_FAILED: ${stderr || stdout || `exit=${code}`}`));
      else resolveMigration(`${stdout}\n${stderr}`);
    });
  });
}

async function waitFor(observer, query, predicate, label) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const rows = await observer.$queryRawUnsafe(query);
    if (predicate(rows)) return rows;
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
  }
  throw new Error(`LOCK_WAIT_TIMEOUT: ${label}`);
}

const fixture = `v17pr-race-${Date.now()}`;
const tempRoot = mkdtempSync(join(tmpdir(), "v17-public-ref-race-"));
const tempPrisma = join(tempRoot, "prisma");
mkdirSync(join(tempPrisma, "migrations"), { recursive: true });
cpSync(resolve("prisma/schema.prisma"), join(tempPrisma, "schema.prisma"));
for (const name of readdirSync(resolve("prisma/migrations"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  // This suite exercises migration 18 in isolation. Later migrations must not
  // leak into its 17-migration baseline as the repository grows.
  .filter((name) => name < CASE_PUBLIC_REF_MIGRATION)) {
  cpSync(resolve("prisma/migrations", name), join(tempPrisma, "migrations", name), { recursive: true });
}

const maintenance = new PrismaClient({ datasourceUrl: maintenanceUrl.toString() });
let seed;
let blocker;
let observer;
let inserter;
try {
  await maintenance.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${atomicDatabase}" WITH (FORCE)`);
  await maintenance.$executeRawUnsafe(`CREATE DATABASE "${atomicDatabase}"`);
  runPrisma(["migrate", "deploy"], join(tempPrisma, "schema.prisma"), atomicUrl.toString());
  const atomic = new PrismaClient({ datasourceUrl: atomicUrl.toString() });
  await atomic.tenant.create({ data: { id: `${fixture}-atomic-tenant`, code: `${fixture}-AT`.toUpperCase(), name: "Synthetic atomic rollback" } });
  await atomic.$executeRawUnsafe(`
    INSERT INTO "osi"."osi_pipeline_cases"
      ("id", "tenant_id", "caseCode", "clientName", "mode", "serviceType", "customerType", "ownerName", "originLocation", "destinationLocation")
    VALUES ($1, $2, $3, 'Synthetic atomic', 'LOCAL', 'MOVING', 'L4_PERSONAL', 'Synthetic owner', 'Synthetic origin', 'Synthetic destination')
  `, `${fixture}-atomic-case`, `${fixture}-atomic-tenant`, `${fixture}-ATOMIC`.toUpperCase());
  const [atomicBefore] = await atomic.$queryRawUnsafe(`SELECT "id", "caseCode", "createdAt", "updatedAt" FROM "osi"."osi_pipeline_cases" WHERE "id"=$1`, `${fixture}-atomic-case`);
  await atomic.$disconnect();

  const injectedDirectory = join(tempPrisma, "migrations", CASE_PUBLIC_REF_MIGRATION);
  cpSync(resolve("prisma/migrations", CASE_PUBLIC_REF_MIGRATION), injectedDirectory, { recursive: true });
  const injectedPath = join(injectedDirectory, "migration.sql");
  const migrationSql = readFileSync(injectedPath, "utf8");
  writeFileSync(injectedPath, migrationSql.replace("\nCOMMIT;", `
DO $v17_atomic_failure$
BEGIN
  RAISE EXCEPTION 'V17_PUBLIC_REF_INJECTED_ATOMIC_FAILURE';
END
$v17_atomic_failure$;

COMMIT;`), "utf8");
  const failedMigration = spawnSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy", "--schema", join(tempPrisma, "schema.prisma")], {
    cwd: process.cwd(), env: { ...process.env, DATABASE_URL: atomicUrl.toString(), DIRECT_URL: atomicUrl.toString() }, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
  });
  check("fallo inyectado interrumpe la migración", failedMigration.status !== 0);
  const atomicAfterClient = new PrismaClient({ datasourceUrl: atomicUrl.toString() });
  const [atomicAfter] = await atomicAfterClient.$queryRawUnsafe(`SELECT
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='osi' AND table_name='osi_pipeline_cases' AND column_name='public_ref') AS column_exists,
    (SELECT COUNT(*)::integer FROM pg_constraint WHERE connamespace='osi'::regnamespace AND conname='osi_pipeline_cases_tenant_id_public_ref_key') AS constraint_count,
    (SELECT COUNT(*)::integer FROM pg_trigger WHERE tgname='osi_pipeline_cases_public_ref_immutable_trg' AND NOT tgisinternal) AS trigger_count,
    (SELECT COUNT(*)::integer FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='osi' AND p.proname='osi_prevent_pipeline_case_public_ref_change') AS function_count,
    (SELECT COUNT(*)::integer FROM "osi"."osi_pipeline_cases" WHERE "id"=$1) AS case_count
  `, `${fixture}-atomic-case`);
  const [atomicBusinessAfter] = await atomicAfterClient.$queryRawUnsafe(`SELECT "id", "caseCode", "createdAt", "updatedAt" FROM "osi"."osi_pipeline_cases" WHERE "id"=$1`, `${fixture}-atomic-case`);
  check("fallo intermedio revierte integralmente columna y objetos", atomicAfter.column_exists === false
    && atomicAfter.constraint_count === 0 && atomicAfter.trigger_count === 0 && atomicAfter.function_count === 0);
  check("fallo intermedio conserva fila y timestamps", atomicAfter.case_count === 1 && fingerprint(atomicBusinessAfter) === fingerprint(atomicBefore));
  await atomicAfterClient.$disconnect();
  await maintenance.$executeRawUnsafe(`DROP DATABASE "${atomicDatabase}" WITH (FORCE)`);
  rmSync(injectedDirectory, { recursive: true, force: true });

  await maintenance.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  await maintenance.$executeRawUnsafe(`CREATE DATABASE "${database}"`);
  const baselineOutput = runPrisma(["migrate", "deploy"], join(tempPrisma, "schema.prisma"), targetUrl.toString());
  check("baseline de carrera aplica 17 migraciones", /17 migrations found/.test(baselineOutput));

  seed = new PrismaClient({ datasourceUrl: targetUrl.toString() });
  await seed.tenant.create({ data: { id: `${fixture}-tenant`, code: `${fixture}-T`.toUpperCase(), name: "Synthetic migration race" } });
  await seed.$executeRawUnsafe(`
    INSERT INTO "osi"."osi_pipeline_cases"
      ("id", "tenant_id", "caseCode", "clientName", "mode", "serviceType", "customerType", "status", "version", "ownerName", "originLocation", "destinationLocation")
    SELECT
      $1 || '-case-' || lpad(gs::text, 5, '0'), $1 || '-tenant', upper($1 || '-CASE-' || lpad(gs::text, 5, '0')),
      'Synthetic legacy', 'LOCAL', 'MOVING', 'L4_PERSONAL',
      CASE WHEN gs % 4 = 0 THEN 'APPROVED'::"osi"."PipelineCaseStatus"
           WHEN gs % 4 = 1 THEN 'NEW_INBOX'::"osi"."PipelineCaseStatus"
           WHEN gs % 4 = 2 THEN 'AWAITING_ICP'::"osi"."PipelineCaseStatus"
           ELSE 'OPS_HANDOFF'::"osi"."PipelineCaseStatus" END,
      (gs % 7) + 1, 'Synthetic owner', 'Synthetic origin', 'Synthetic destination'
    FROM generate_series(1, 10000) AS gs
  `, fixture);
  const businessSql = `SELECT "id", "tenant_id", "caseCode", "status"::text, "version", "ownerId", "ownerName", "createdAt", "updatedAt" FROM "osi"."osi_pipeline_cases" WHERE "id" LIKE $1 ORDER BY "id"`;
  const businessBefore = fingerprint(await seed.$queryRawUnsafe(businessSql, `${fixture}-case-%`));
  check("fixture de carrera contiene 10000 casos preexistentes", await seed.pipelineCase.count({ where: { id: { startsWith: `${fixture}-case-` } } }) === 10_000);
  await seed.$disconnect();
  seed = undefined;

  // Apply only migration 18 in the race phase. Pointing at the repository's
  // complete tree would allow later migrations to start while the concurrent
  // INSERT is being released, contaminating this lock-order experiment.
  cpSync(resolve("prisma/migrations", CASE_PUBLIC_REF_MIGRATION), injectedDirectory, { recursive: true });

  blocker = new PrismaClient({ datasourceUrl: targetUrl.toString() });
  observer = new PrismaClient({ datasourceUrl: targetUrl.toString() });
  inserter = new PrismaClient({ datasourceUrl: targetUrl.toString() });
  let releaseBlocker;
  let blockerReady;
  const release = new Promise((resolveRelease) => { releaseBlocker = resolveRelease; });
  const ready = new Promise((resolveReady) => { blockerReady = resolveReady; });
  const blockerTask = blocker.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`LOCK TABLE "osi"."osi_pipeline_cases" IN ACCESS SHARE MODE`);
    blockerReady();
    await release;
  }, { timeout: 30_000 });
  await ready;

  const migrationPromise = startMigration(join(tempPrisma, "schema.prisma"), targetUrl.toString());
  await waitFor(observer, `
    SELECT pid FROM pg_locks
    WHERE relation='"osi"."osi_pipeline_cases"'::regclass
      AND mode='AccessExclusiveLock' AND NOT granted
  `, (rows) => rows.length === 1, "migration AccessExclusiveLock");
  check("migración espera ACCESS EXCLUSIVE antes de la carrera", true);

  let insertPidReady;
  const insertPidPromise = new Promise((resolvePid) => { insertPidReady = resolvePid; });
  const concurrentId = `${fixture}-concurrent-insert`;
  const insertPromise = inserter.$transaction(async (tx) => {
    const [session] = await tx.$queryRawUnsafe(`SELECT pg_backend_pid() AS pid`);
    insertPidReady(Number(session.pid));
    return tx.$executeRawUnsafe(`
      INSERT INTO "osi"."osi_pipeline_cases"
        ("id", "tenant_id", "caseCode", "clientName", "mode", "serviceType", "customerType", "ownerName", "originLocation", "destinationLocation")
      VALUES ($1, $2, $3, 'Synthetic concurrent', 'LOCAL', 'MOVING', 'L4_PERSONAL', 'Synthetic owner', 'Synthetic origin', 'Synthetic destination')
    `, concurrentId, `${fixture}-tenant`, `${fixture}-CONCURRENT`.toUpperCase());
  }, { timeout: 30_000 });
  const insertPid = await insertPidPromise;
  await waitFor(observer, `
    SELECT pid FROM pg_locks
    WHERE pid=${insertPid} AND relation='"osi"."osi_pipeline_cases"'::regclass
      AND mode='RowExclusiveLock' AND NOT granted
  `, (rows) => rows.length === 1, "concurrent INSERT RowExclusiveLock");
  check("INSERT concurrente queda bloqueado detrás de la migración", true);

  releaseBlocker();
  await blockerTask;
  const [migrationOutput, inserted] = await Promise.all([migrationPromise, insertPromise]);
  check("migración 18 completa dentro de la carrera", /20260821010000_v17_pipeline_case_public_ref/.test(migrationOutput));
  check("INSERT concurrente completa después del COMMIT", inserted === 1);

  const verified = new PrismaClient({ datasourceUrl: targetUrl.toString() });
  const refs = await verified.$queryRawUnsafe(`SELECT "id", "public_ref"::text AS public_ref FROM "osi"."osi_pipeline_cases" WHERE "id" LIKE $1 ORDER BY "id"`, `${fixture}-%`);
  const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  check("10001 filas quedan con UUID v4 RFC válido", refs.length === 10_001 && refs.every((row) => uuidV4.test(row.public_ref)));
  check("carrera deja cero NULL y cero duplicados", refs.every((row) => row.public_ref) && new Set(refs.map((row) => row.public_ref)).size === refs.length);
  check("ningún UUID deriva de la PK CUID", refs.every((row) => row.id !== row.public_ref && !row.id.includes(row.public_ref) && !row.public_ref.includes(row.id)));
  check("backfill 10000 conserva datos empresariales y timestamps", fingerprint(await verified.$queryRawUnsafe(businessSql, `${fixture}-case-%`)) === businessBefore);
  check("backfill no crea journal", await verified.pipelineCaseCommand.count({ where: { pipelineCaseId: { startsWith: `${fixture}-case-` } } }) === 0);
  const [concurrent] = refs.filter((row) => row.id === concurrentId);
  check("INSERT concurrente recibe default y nunca observa NULL", uuidV4.test(concurrent?.public_ref || ""));
  await verified.$disconnect();

  process.stdout.write(`${JSON.stringify({
    ok: true,
    target: { database, host: "127.0.0.1", port: 55432 },
    assertions: results.length,
    atomicity: { explicitTransaction: true, migrationLock: "AccessExclusiveLock", concurrentInsert: "blocked_then_uuid" },
    backfill: { rows: 10_000, concurrentRows: 1, nulls: 0, duplicates: 0 },
    results,
  }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, assertions: results.length, error: {
    name: error.name, code: error.code || "V17_PUBLIC_REF_MIGRATION_RACE_FAILED",
    message: String(error.message).replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]"),
  }, results }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  await seed?.$disconnect().catch(() => {});
  await blocker?.$disconnect().catch(() => {});
  await observer?.$disconnect().catch(() => {});
  await inserter?.$disconnect().catch(() => {});
  await maintenance.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${atomicDatabase}" WITH (FORCE)`).catch(() => {});
  await maintenance.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`).catch(() => {});
  await maintenance.$disconnect();
  rmSync(tempRoot, { recursive: true, force: true });
}
