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
  const employeeIncompleteRun = runJson("mt-01c1a-incomplete-test.mjs", "MT-01C1A/INCOMPLETE_DRY_RUN");

  invariant(synthetic.created === 18, "MT-01A no creó 18 usuarios sintéticos");
  invariant(dryRun.membershipsToCreate === 18 && dryRun.unmigratableRows === 0, "Dry-run MT-01A inesperado");
  invariant(firstBackfill.created === 18, "El primer backfill no creó 18 membresías");
  invariant(secondBackfill.created === 0 && secondBackfill.existing === 18, "El segundo backfill no fue idempotente");
  invariant(passedCount(mtTests) === 7, "Las siete restricciones MT-01A no pasaron");
  invariant(rollback.membershipsDeleted === 18 && rollback.tenantDeleted === true, "Rollback MT-01A incompleto");
  invariant(reapply.created === 18, "Reaplicación MT-01A incompleta");
  invariant(employeeIncompleteRun.assertions === 11, `MT-01C1A dry-run esperaba 11 pruebas y obtuvo ${employeeIncompleteRun.assertions}`);

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
  const legacyAuthRun = runJson("mt-01b1-legacy-compat-test.mjs", "MT-01B1/LEGACY_COMPAT");
  const authFoundationRun = runJson("mt-01b1-test.mjs", "MT-01B1/FOUNDATION");
  const authRaceRun = runJson("mt-01b1-refresh-race-test.mjs", "MT-01B1/REFRESH_RACE");
  const authAdversarialRun = runJson("mt-01b1-adversarial-test.mjs", "MT-01B1/ADVERSARIAL");
  invariant(legacyAuthRun.assertions === 10, `MT-01B1 legacy esperaba 10 pruebas y obtuvo ${legacyAuthRun.assertions}`);
  invariant(authFoundationRun.assertions === 37, `MT-01B1 esperaba 37 pruebas y obtuvo ${authFoundationRun.assertions}`);
  invariant(authRaceRun.assertions === 62, `MT-01B1 race esperaba 62 pruebas y obtuvo ${authRaceRun.assertions}`);
  invariant(authAdversarialRun.assertions === 15, `MT-01B1 adversarial esperaba 15 pruebas y obtuvo ${authAdversarialRun.assertions}`);
  const employeeProfileRun = runJson("mt-01c1a-test.mjs", "MT-01C1A/EMPLOYEE_PROFILE");
  const employeeGuardRun = runJson("validate-mt01c1a-canonical-guard-test.mjs", "MT-01C1A/CANONICAL_GUARD");
  const employeeRuntimeGuardRun = runJson("validate-mt01c1a-guard.mjs", "MT-01C1A/RUNTIME_GUARD");
  invariant(employeeProfileRun.assertions === 31, `MT-01C1A esperaba 31 pruebas y obtuvo ${employeeProfileRun.assertions}`);
  invariant(employeeGuardRun.assertions === 3, `MT-01C1A guard esperaba 3 pruebas y obtuvo ${employeeGuardRun.assertions}`);
  invariant(employeeRuntimeGuardRun.report.ok === true, "La guardia runtime MT-01C1A falló");
  const provisioningDryRun = runJson("mt-01c1b1-email-dry-run.mjs", "MT-01C1B1/EMAIL_DRY_RUN");
  const provisioningRun = runJson("mt-01c1b1-test.mjs", "MT-01C1B1/PERSISTENCE");
  const provisioningGuardRun = runJson("validate-mt01c1b1-canonical-guard-test.mjs", "MT-01C1B1/CANONICAL_GUARD");
  const provisioningRuntimeGuardRun = runJson("validate-mt01c1b1-guard.mjs", "MT-01C1B1/RUNTIME_GUARD");
  invariant(provisioningDryRun.report.readOnly === true, "MT-01C1B1 dry-run no confirmó modo de sólo lectura");
  invariant(provisioningRun.assertions === 63, `MT-01C1B1 esperaba 63 pruebas y obtuvo ${provisioningRun.assertions}`);
  invariant(provisioningGuardRun.assertions === 5, `MT-01C1B1 guard esperaba 5 pruebas y obtuvo ${provisioningGuardRun.assertions}`);
  invariant(provisioningRuntimeGuardRun.report.ok === true, "La guardia runtime MT-01C1B1 falló");
  const provisioningDomainRun = runJson("mt-01c1b2b-test.mjs", "MT-01C1B2B/DOMAIN");
  const provisioningDomainGuardRun = runJson("validate-mt01c1b2b-guard-test.mjs", "MT-01C1B2B/GUARD");
  invariant(provisioningDomainRun.assertions === 29, `MT-01C1B2B esperaba 29 pruebas y obtuvo ${provisioningDomainRun.assertions}`);
  invariant(provisioningDomainGuardRun.assertions === 6, `MT-01C1B2B guard esperaba 6 pruebas y obtuvo ${provisioningDomainGuardRun.assertions}`);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    mt01a: 7,
    mt01b1: {
      legacy: legacyAuthRun.assertions,
      foundation: authFoundationRun.assertions,
      refreshRace: authRaceRun.assertions,
      adversarial: authAdversarialRun.assertions,
      total: 124,
    },
    mt01c1a: {
      incompleteDryRun: employeeIncompleteRun.assertions,
      employeeProfile: employeeProfileRun.assertions,
      canonicalGuard: employeeGuardRun.assertions,
      runtimeGuard: employeeRuntimeGuardRun.report.ok,
      total: 45,
    },
    mt01c1b1: {
      emailDryRunReadOnly: provisioningDryRun.report.readOnly,
      persistence: provisioningRun.assertions,
      canonicalGuard: provisioningGuardRun.assertions,
      runtimeGuard: provisioningRuntimeGuardRun.report.ok,
      total: 68,
    },
    mt01c1b2b: {
      domain: provisioningDomainRun.assertions,
      guard: provisioningDomainGuardRun.assertions,
      total: provisioningDomainRun.assertions + provisioningDomainGuardRun.assertions,
    },
    suites,
    suiteRuns: {
      "MT-01A": { status: "PASS", assertions: 7, durationMs: mtRun.durationMs, exitCode: mtRun.exitCode },
      ...suiteRuns,
      "MT-01B1/LEGACY_COMPAT": { status: "PASS", assertions: legacyAuthRun.assertions, durationMs: legacyAuthRun.durationMs, exitCode: 0 },
      "MT-01B1/FOUNDATION": { status: "PASS", assertions: authFoundationRun.assertions, durationMs: authFoundationRun.durationMs, exitCode: 0 },
      "MT-01B1/REFRESH_RACE": { status: "PASS", assertions: authRaceRun.assertions, durationMs: authRaceRun.durationMs, exitCode: 0 },
      "MT-01B1/ADVERSARIAL": { status: "PASS", assertions: authAdversarialRun.assertions, durationMs: authAdversarialRun.durationMs, exitCode: 0 },
      "MT-01C1A/INCOMPLETE_DRY_RUN": { status: "PASS", assertions: employeeIncompleteRun.assertions, durationMs: employeeIncompleteRun.durationMs, exitCode: 0 },
      "MT-01C1A/EMPLOYEE_PROFILE": { status: "PASS", assertions: employeeProfileRun.assertions, durationMs: employeeProfileRun.durationMs, exitCode: 0 },
      "MT-01C1A/CANONICAL_GUARD": { status: "PASS", assertions: employeeGuardRun.assertions, durationMs: employeeGuardRun.durationMs, exitCode: 0 },
      "MT-01C1A/RUNTIME_GUARD": { status: "PASS", assertions: 0, durationMs: employeeRuntimeGuardRun.durationMs, exitCode: 0 },
      "MT-01C1B1/EMAIL_DRY_RUN": { status: "PASS", assertions: 0, durationMs: provisioningDryRun.durationMs, exitCode: 0 },
      "MT-01C1B1/PERSISTENCE": { status: "PASS", assertions: provisioningRun.assertions, durationMs: provisioningRun.durationMs, exitCode: 0 },
      "MT-01C1B1/CANONICAL_GUARD": { status: "PASS", assertions: provisioningGuardRun.assertions, durationMs: provisioningGuardRun.durationMs, exitCode: 0 },
      "MT-01C1B1/RUNTIME_GUARD": { status: "PASS", assertions: 0, durationMs: provisioningRuntimeGuardRun.durationMs, exitCode: 0 },
      "MT-01C1B2B/DOMAIN": { status: "PASS", assertions: provisioningDomainRun.assertions, durationMs: provisioningDomainRun.durationMs, exitCode: 0 },
      "MT-01C1B2B/GUARD": { status: "PASS", assertions: provisioningDomainGuardRun.assertions, durationMs: provisioningDomainGuardRun.durationMs, exitCode: 0 },
    },
    total,
  }, null, 2)}\n`);
} finally {
  rmSync(envPath, { force: true });
  rmSync(resultsPath, { force: true });
}
