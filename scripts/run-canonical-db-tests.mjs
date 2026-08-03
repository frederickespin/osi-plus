import { spawnSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { assertCanonicalCiTarget } from "./validate-canonical-ci.mjs";

const EXPECTED_DB_TESTS = Object.freeze({ d: 21, e: 37, f: 38, g: 47, h: 35, i: 60, j: 54 });
const SENSITIVE_NAME = /(DATABASE_URL|DIRECT_URL|PASSWORD|TOKEN|SECRET|API_KEY)/i;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function sanitizeDiagnostic(value) {
  let output = String(value || "");
  output = output.replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "[REDACTED_DATABASE_URL]");
  for (const [name, secret] of Object.entries(process.env)) {
    if (!SENSITIVE_NAME.test(name) || !secret || secret.length < 6) continue;
    output = output.split(secret).join(`[REDACTED_${name}]`);
  }
  return output.slice(-6_000);
}

function parseReport(output) {
  try { return JSON.parse(String(output || "").trim()); }
  catch { return null; }
}

function runJson(script, suite) {
  const started = performance.now();
  process.stderr.write(`[canonical-suite] START suite=${suite} script=${script}\n`);
  const result = spawnSync(process.execPath, [resolve("scripts", script)], {
    cwd: process.cwd(), env: process.env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  const durationMs = Number((performance.now() - started).toFixed(2));
  const report = parseReport(result.stdout) || parseReport(result.stderr);
  const assertions = passedCount(report || {});
  if (result.status !== 0) {
    const error = report?.error || {};
    const diagnostic = sanitizeDiagnostic(JSON.stringify({
      name: error.name || "SuiteFailure",
      code: error.code || result.signal || "UNKNOWN",
      message: error.message || result.stderr || result.stdout || "Sin diagnóstico",
      stack: error.stack || null,
    }, null, 2));
    process.stderr.write(`[canonical-suite] FAIL suite=${suite} exit=${result.status ?? "null"} assertions=${assertions} durationMs=${durationMs}\n`);
    process.stderr.write(`[canonical-suite] STOPPED suite=${suite}\n`);
    process.stderr.write(`[canonical-suite] DIAGNOSTIC suite=${suite}\n${diagnostic}\n`);
    throw new Error(`${suite} falló (exit=${result.status ?? "null"}, assertions=${assertions}, durationMs=${durationMs})`);
  }
  if (!report) {
    process.stderr.write(`[canonical-suite] FAIL suite=${suite} exit=0 assertions=0 durationMs=${durationMs}\n`);
    process.stderr.write(`[canonical-suite] STOPPED suite=${suite}\n`);
    throw new Error(`${script} no produjo JSON válido`);
  }
  process.stderr.write(`[canonical-suite] PASS suite=${suite} exit=0 assertions=${assertions} durationMs=${durationMs}\n`);
  return { report, durationMs, assertions, exitCode: 0 };
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

  const synthetic = runJson("mt-01a-synthetic-users.mjs", "MT-01A/SYNTHETIC_USERS").report;
  const dryRun = runJson("mt-01a-dry-run.mjs", "MT-01A/DRY_RUN").report;
  const firstBackfill = runJson("mt-01a-backfill.mjs", "MT-01A/BACKFILL_FIRST").report;
  const secondBackfill = runJson("mt-01a-backfill.mjs", "MT-01A/BACKFILL_SECOND").report;
  const mtRun = runJson("mt-01a-test.mjs", "MT-01A/TESTS");
  const mtTests = mtRun.report;
  const rollback = runJson("mt-01a-rollback.mjs", "MT-01A/ROLLBACK").report;
  const reapply = runJson("mt-01a-backfill.mjs", "MT-01A/REAPPLY").report;

  invariant(synthetic.created === 18, "MT-01A no creó 18 usuarios sintéticos");
  invariant(dryRun.membershipsToCreate === 18 && dryRun.unmigratableRows === 0, "Dry-run MT-01A inesperado");
  invariant(firstBackfill.created === 18, "El primer backfill no creó 18 membresías");
  invariant(secondBackfill.created === 0 && secondBackfill.existing === 18, "El segundo backfill no fue idempotente");
  invariant(passedCount(mtTests) === 7, "Las siete restricciones MT-01A no pasaron");
  invariant(rollback.membershipsDeleted === 18 && rollback.tenantDeleted === true, "Rollback MT-01A incompleto");
  invariant(reapply.created === 18, "Reaplicación MT-01A incompleta");

  let dbPassed = 0;
  const suites = {};
  const suiteRuns = {};
  for (const [letter, expected] of Object.entries(EXPECTED_DB_TESTS)) {
    const suite = `DB-01${letter.toUpperCase()}`;
    const run = runJson(`db01${letter}-test.mjs`, suite);
    const report = run.report;
    const passed = passedCount(report);
    invariant(Number(report.failed || 0) === 0 && passed === expected, `DB-01${letter.toUpperCase()} esperaba ${expected} pruebas y obtuvo ${passed}`);
    suites[suite] = passed;
    suiteRuns[suite] = { status: "PASS", assertions: passed, durationMs: run.durationMs, exitCode: run.exitCode };
    dbPassed += passed;
  }
  const expectedTotal = 7 + Object.values(EXPECTED_DB_TESTS).reduce((sum, count) => sum + count, 0);
  const total = passedCount(mtTests) + dbPassed;
  invariant(total === expectedTotal, `La cadena esperaba ${expectedTotal} pruebas y obtuvo ${total}`);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    mt01a: 7,
    suites,
    suiteRuns: { "MT-01A": { status: "PASS", assertions: 7, durationMs: mtRun.durationMs, exitCode: mtRun.exitCode }, ...suiteRuns },
    total,
  }, null, 2)}\n`);
} finally {
  rmSync(envPath, { force: true });
  rmSync(resultsPath, { force: true });
}
