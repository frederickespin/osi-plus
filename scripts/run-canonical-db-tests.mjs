import { spawnSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { assertCanonicalCiTarget } from "./validate-canonical-ci.mjs";

const EXPECTED_DB_TESTS = Object.freeze({ d: 21, e: 37, f: 38, g: 47, h: 35, i: 36, j: 31 });

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function runJson(script) {
  const result = spawnSync(process.execPath, [resolve("scripts", script)], {
    cwd: process.cwd(), env: process.env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`${script} falló: ${(result.stderr || result.stdout).trim().slice(-2_000)}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`${script} no produjo JSON válido`);
  }
}

function passedCount(report) {
  if (Array.isArray(report.results)) return report.results.filter((result) => result.passed === true).length;
  return Number(report.passed || 0);
}

assertCanonicalCiTarget();
const envPath = resolve(".env.mt01a.local");
invariant(!existsSync(envPath), `${envPath} ya existe; no será sobrescrito`);
const resultsPath = resolve(tmpdir(), `db01j-ci-results-${process.pid}.json`);

try {
  writeFileSync(envPath, [
    `DATABASE_URL=${process.env.DATABASE_URL}`,
    `DIRECT_URL=${process.env.DIRECT_URL}`,
    "VERCEL_ENV=development",
    "MT01A_INITIAL_TENANT_CODE=IPACKERS-DO",
    "MT01A_INITIAL_TENANT_NAME=International Packers SRL",
    "MT01A_BACKFILL_BATCH_ID=MT-01A-CI-V1",
    "",
  ].join("\n"), { encoding: "utf8", mode: 0o600 });
  process.env.DB01J_RESULTS_PATH = resultsPath;

  const synthetic = runJson("mt-01a-synthetic-users.mjs");
  const dryRun = runJson("mt-01a-dry-run.mjs");
  const firstBackfill = runJson("mt-01a-backfill.mjs");
  const secondBackfill = runJson("mt-01a-backfill.mjs");
  const mtTests = runJson("mt-01a-test.mjs");
  const rollback = runJson("mt-01a-rollback.mjs");
  const reapply = runJson("mt-01a-backfill.mjs");

  invariant(synthetic.created === 18, "MT-01A no creó 18 usuarios sintéticos");
  invariant(dryRun.membershipsToCreate === 18 && dryRun.unmigratableRows === 0, "Dry-run MT-01A inesperado");
  invariant(firstBackfill.created === 18, "El primer backfill no creó 18 membresías");
  invariant(secondBackfill.created === 0 && secondBackfill.existing === 18, "El segundo backfill no fue idempotente");
  invariant(passedCount(mtTests) === 7, "Las siete restricciones MT-01A no pasaron");
  invariant(rollback.membershipsDeleted === 18 && rollback.tenantDeleted === true, "Rollback MT-01A incompleto");
  invariant(reapply.created === 18, "Reaplicación MT-01A incompleta");

  let dbPassed = 0;
  const suites = {};
  for (const [letter, expected] of Object.entries(EXPECTED_DB_TESTS)) {
    const report = runJson(`db01${letter}-test.mjs`);
    const passed = passedCount(report);
    invariant(Number(report.failed || 0) === 0 && passed === expected, `DB-01${letter.toUpperCase()} esperaba ${expected} pruebas y obtuvo ${passed}`);
    suites[`DB-01${letter.toUpperCase()}`] = passed;
    dbPassed += passed;
  }
  const total = passedCount(mtTests) + dbPassed;
  invariant(total === 252, `La cadena esperaba 252 pruebas y obtuvo ${total}`);
  process.stdout.write(`${JSON.stringify({ ok: true, mt01a: 7, suites, total }, null, 2)}\n`);
} finally {
  rmSync(envPath, { force: true });
  rmSync(resultsPath, { force: true });
}
