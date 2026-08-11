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

const canonicalTarget = assertCanonicalCiTarget();
invariant(canonicalTarget.host === "127.0.0.1", "MT-01C1B2B exige que el runner canónico use 127.0.0.1");
invariant(
  !process.env.MT01C1B2B_TEST_DATABASE_URL || process.env.MT01C1B2B_TEST_DATABASE_URL === process.env.DATABASE_URL,
  "MT01C1B2B_TEST_DATABASE_URL no coincide con el destino canónico validado",
);
process.env.MT01C1B2B_TEST_DATABASE_URL = process.env.DATABASE_URL;
invariant(
  !process.env.MT01C2B1_TEST_DATABASE_URL || process.env.MT01C2B1_TEST_DATABASE_URL === process.env.DATABASE_URL,
  "MT01C2B1_TEST_DATABASE_URL no coincide con el destino canónico validado",
);
process.env.MT01C2B1_TEST_DATABASE_URL = process.env.DATABASE_URL;
invariant(
  !process.env.MT01C2B2_TEST_DATABASE_URL || process.env.MT01C2B2_TEST_DATABASE_URL === process.env.DATABASE_URL,
  "MT01C2B2_TEST_DATABASE_URL no coincide con el destino canónico validado",
);
process.env.MT01C2B2_TEST_DATABASE_URL = process.env.DATABASE_URL;
invariant(
  !process.env.MT01C2B3A_TEST_DATABASE_URL || process.env.MT01C2B3A_TEST_DATABASE_URL === process.env.DATABASE_URL,
  "MT01C2B3A_TEST_DATABASE_URL no coincide con el destino canónico validado",
);
process.env.MT01C2B3A_TEST_DATABASE_URL = process.env.DATABASE_URL;
invariant(
  !process.env.MT01C2B3B_TEST_DATABASE_URL || process.env.MT01C2B3B_TEST_DATABASE_URL === process.env.DATABASE_URL,
  "MT01C2B3B_TEST_DATABASE_URL no coincide con el destino canónico validado",
);
process.env.MT01C2B3B_TEST_DATABASE_URL = process.env.DATABASE_URL;
invariant(
  !process.env.CRM01A_TEST_DATABASE_URL || process.env.CRM01A_TEST_DATABASE_URL === process.env.DATABASE_URL,
  "CRM01A_TEST_DATABASE_URL no coincide con el destino canónico validado",
);
process.env.CRM01A_TEST_DATABASE_URL = process.env.DATABASE_URL;
process.env.COMMERCIAL_TENANCY_READ_MODE = "LEGACY_ONLY";
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
  const commercialBackfillRun = runJson("mt-01c2b2-test.mjs", "MT-01C2B2/BACKFILL");
  const commercialBackfillDatabaseGuardRun = runJson("mt-01c2b2-database-guard-test.mjs", "MT-01C2B2/DATABASE_GUARD");
  const commercialBackfillGuardRun = runJson("validate-mt01c2b2-guard.mjs", "MT-01C2B2/GUARD");
  const commercialBackfillGuardTestsRun = runJson("validate-mt01c2b2-guard-test.mjs", "MT-01C2B2/GUARD_TESTS");
  invariant(commercialBackfillRun.report.ok === true && commercialBackfillRun.assertions >= 25, `MT-01C2B2 esperaba al menos 25 pruebas y obtuvo ${commercialBackfillRun.assertions}`);
  invariant(commercialBackfillDatabaseGuardRun.assertions >= 14, `MT-01C2B2 database guard esperaba al menos 14 pruebas y obtuvo ${commercialBackfillDatabaseGuardRun.assertions}`);
  invariant(commercialBackfillGuardRun.report.ok === true, "MT-01C2B2 guard falló");
  invariant(commercialBackfillGuardTestsRun.assertions >= 5, `MT-01C2B2 guard tests esperaba al menos 5 pruebas y obtuvo ${commercialBackfillGuardTestsRun.assertions}`);
  const commercialWriteBridgeRun = runJson("mt-01c2b3a-test.mjs", "MT-01C2B3A/WRITE_BRIDGE");
  const commercialWriteBridgeGuardRun = runJson("validate-mt01c2b3a-guard.mjs", "MT-01C2B3A/GUARD");
  const commercialWriteBridgeGuardTestsRun = runJson("validate-mt01c2b3a-guard-test.mjs", "MT-01C2B3A/GUARD_TESTS");
  invariant(commercialWriteBridgeRun.report.ok === true && commercialWriteBridgeRun.assertions >= 30, `MT-01C2B3A esperaba al menos 30 pruebas y obtuvo ${commercialWriteBridgeRun.assertions}`);
  invariant(commercialWriteBridgeGuardRun.report.ok === true, "MT-01C2B3A guard falló");
  invariant(commercialWriteBridgeGuardTestsRun.assertions >= 12, `MT-01C2B3A guard tests esperaba al menos 12 pruebas y obtuvo ${commercialWriteBridgeGuardTestsRun.assertions}`);
  const commercialReadBridgeRun = runJson("mt-01c2b3b-test.mjs", "MT-01C2B3B/READ_BRIDGE");
  const commercialReadBridgeDifferentialRun = runJson("mt-01c2b3b-legacy-differential.mjs", "MT-01C2B3B/LEGACY_DIFFERENTIAL");
  const commercialReadBridgePerformanceRun = runJson("mt-01c2b3b-performance.mjs", "MT-01C2B3B/PERFORMANCE");
  const commercialReadBridgeDatabaseGuardRun = runJson("mt-01c2b3b-local-target-test.mjs", "MT-01C2B3B/DATABASE_GUARD");
  const commercialReadBridgeGuardRun = runJson("validate-mt01c2b3b-guard.mjs", "MT-01C2B3B/GUARD");
  const commercialReadBridgeGuardTestsRun = runJson("validate-mt01c2b3b-guard-test.mjs", "MT-01C2B3B/GUARD_TESTS");
  invariant(commercialReadBridgeRun.report.ok === true && commercialReadBridgeRun.assertions >= 35, `MT-01C2B3B esperaba al menos 35 pruebas y obtuvo ${commercialReadBridgeRun.assertions}`);
  invariant(commercialReadBridgeDifferentialRun.report.ok === true && commercialReadBridgeDifferentialRun.assertions >= 10, "MT-01C2B3B diff LEGACY incompleto");
  invariant(commercialReadBridgePerformanceRun.report.ok === true && commercialReadBridgePerformanceRun.assertions >= 10, "MT-01C2B3B rendimiento incompleto");
  invariant(commercialReadBridgeDatabaseGuardRun.assertions >= 14, `MT-01C2B3B database guard esperaba al menos 14 pruebas y obtuvo ${commercialReadBridgeDatabaseGuardRun.assertions}`);
  invariant(commercialReadBridgeGuardRun.report.ok === true, "MT-01C2B3B guard falló");
  invariant(commercialReadBridgeGuardTestsRun.assertions >= 14, `MT-01C2B3B guard tests esperaba al menos 14 pruebas y obtuvo ${commercialReadBridgeGuardTestsRun.assertions}`);
  const commercialActivationGateRun = runJson("mt-01c2b3c-test.mjs", "MT-01C2B3C/ACTIVATION_GATE");
  const commercialActivationGateGuardRun = runJson("validate-mt01c2b3c-guard.mjs", "MT-01C2B3C/GUARD");
  const commercialActivationGateGuardTestsRun = runJson("validate-mt01c2b3c-guard-test.mjs", "MT-01C2B3C/GUARD_TESTS");
  invariant(commercialActivationGateRun.report.ok === true && commercialActivationGateRun.assertions >= 20, `MT-01C2B3C esperaba al menos 20 pruebas y obtuvo ${commercialActivationGateRun.assertions}`);
  invariant(commercialActivationGateGuardRun.report.ok === true, "MT-01C2B3C guard falló");
  invariant(commercialActivationGateGuardTestsRun.assertions >= 12, `MT-01C2B3C guard tests esperaba al menos 12 pruebas y obtuvo ${commercialActivationGateGuardTestsRun.assertions}`);
  const crmPipelineRun = runJson("crm-01a-test.mjs", "CRM-01A/PIPELINE_READ");
  const crmPipelinePerformanceRun = runJson("crm-01a-performance.mjs", "CRM-01A/PERFORMANCE");
  const crmPipelineDatabaseGuardRun = runJson("crm-01a-local-target-test.mjs", "CRM-01A/DATABASE_GUARD");
  const crmPipelineGuardRun = runJson("validate-crm-01a-guard.mjs", "CRM-01A/GUARD");
  const crmPipelineGuardTestsRun = runJson("validate-crm-01a-guard-test.mjs", "CRM-01A/GUARD_TESTS");
  invariant(crmPipelineRun.report.ok === true && crmPipelineRun.assertions >= 45, `CRM-01A esperaba al menos 45 pruebas y obtuvo ${crmPipelineRun.assertions}`);
  invariant(crmPipelinePerformanceRun.report.ok === true
    && JSON.stringify(crmPipelinePerformanceRun.report.fixtureSets) === JSON.stringify([2_000, 10_000]), "CRM-01A rendimiento incompleto");
  invariant(crmPipelineDatabaseGuardRun.assertions >= 12, `CRM-01A database guard esperaba 12 pruebas y obtuvo ${crmPipelineDatabaseGuardRun.assertions}`);
  invariant(crmPipelineGuardRun.report.ok === true, "CRM-01A guard falló");
  invariant(crmPipelineGuardTestsRun.assertions >= 11, `CRM-01A guard tests esperaba al menos 11 pruebas y obtuvo ${crmPipelineGuardTestsRun.assertions}`);

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
  const provisioningDatabaseGuardRun = runJson("mt-01c1b2b-database-guard-test.mjs", "MT-01C1B2B/DATABASE_GUARD");
  const provisioningDomainRun = runJson("mt-01c1b2b-test.mjs", "MT-01C1B2B/DOMAIN");
  const provisioningDomainGuardRun = runJson("validate-mt01c1b2b-guard-test.mjs", "MT-01C1B2B/GUARD");
  invariant(provisioningDomainRun.assertions === 75, `MT-01C1B2B esperaba 75 pruebas y obtuvo ${provisioningDomainRun.assertions}`);
  invariant(provisioningDatabaseGuardRun.assertions === 15, `MT-01C1B2B database guard esperaba 15 pruebas y obtuvo ${provisioningDatabaseGuardRun.assertions}`);
  invariant(provisioningDomainGuardRun.assertions === 12, `MT-01C1B2B guard esperaba 12 pruebas y obtuvo ${provisioningDomainGuardRun.assertions}`);
  const provisioningExecutorRun = runJson("mt-01c1b3a-test.mjs", "MT-01C1B3A/EXECUTOR");
  const provisioningExecutorGuardRun = runJson("validate-mt01c1b3a-guard-test.mjs", "MT-01C1B3A/GUARD");
  invariant(provisioningExecutorRun.report.failed === 0 && provisioningExecutorRun.assertions === 52, `MT-01C1B3A esperaba 52 pruebas y obtuvo ${provisioningExecutorRun.assertions}`);
  invariant(provisioningExecutorGuardRun.assertions === 11, `MT-01C1B3A guard esperaba 11 pruebas y obtuvo ${provisioningExecutorGuardRun.assertions}`);
  process.env.SECCOM01A_TEST_DATABASE_URL = process.env.DATABASE_URL;
  const secComRun = runJson("sec-com-01a-test.mjs", "SEC-COM-01A/ROUTES");
  const secComGuardRun = runJson("validate-sec-com-01a-guard-test.mjs", "SEC-COM-01A/GUARD");
  invariant(secComRun.report.failed === undefined && secComRun.assertions === 30, `SEC-COM-01A esperaba 30 pruebas y obtuvo ${secComRun.assertions}`);
  invariant(secComGuardRun.assertions === 18, `SEC-COM-01A guard esperaba 18 pruebas y obtuvo ${secComGuardRun.assertions}`);
  const commercialTenantRun = runJson("mt-01c2b1-test.mjs", "MT-01C2B1/FOUNDATION");
  const commercialTenantDryRun = runJson("mt-01c2b1-dry-run.mjs", "MT-01C2B1/DRY_RUN");
  const commercialTenantGuardRun = runJson("validate-mt01c2b1-guard.mjs", "MT-01C2B1/RUNTIME_GUARD");
  const commercialTenantGuardTests = runJson("validate-mt01c2b1-guard-test.mjs", "MT-01C2B1/GUARD_TESTS");
  invariant(commercialTenantRun.assertions >= 25, `MT-01C2B1 esperaba al menos 25 pruebas y obtuvo ${commercialTenantRun.assertions}`);
  invariant(commercialTenantDryRun.report.readOnly === true && commercialTenantDryRun.report.wroteRows === 0, "MT-01C2B1 dry-run no fue de sólo lectura");
  invariant(commercialTenantGuardRun.report.ok === true, "MT-01C2B1 guard falló");
  invariant(commercialTenantGuardTests.assertions >= 7, `MT-01C2B1 guard esperaba al menos 7 pruebas y obtuvo ${commercialTenantGuardTests.assertions}`);
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
      databaseGuard: provisioningDatabaseGuardRun.assertions,
      domain: provisioningDomainRun.assertions,
      guard: provisioningDomainGuardRun.assertions,
      total: provisioningDatabaseGuardRun.assertions + provisioningDomainRun.assertions + provisioningDomainGuardRun.assertions,
    },
    mt01c1b3a: {
      executor: provisioningExecutorRun.assertions,
      guard: provisioningExecutorGuardRun.assertions,
      total: provisioningExecutorRun.assertions + provisioningExecutorGuardRun.assertions,
    },
    secCom01a: {
      routes: secComRun.assertions,
      guard: secComGuardRun.assertions,
      total: secComRun.assertions + secComGuardRun.assertions,
    },
    mt01c2b1: {
      foundation: commercialTenantRun.assertions,
      dryRunReadOnly: commercialTenantDryRun.report.readOnly,
      runtimeGuard: commercialTenantGuardRun.report.ok,
      guardTests: commercialTenantGuardTests.assertions,
      total: commercialTenantRun.assertions + commercialTenantGuardTests.assertions,
    },
    mt01c2b2: {
      backfill: commercialBackfillRun.assertions,
      databaseGuard: commercialBackfillDatabaseGuardRun.assertions,
      guard: commercialBackfillGuardRun.report.ok,
      guardTests: commercialBackfillGuardTestsRun.assertions,
      total: commercialBackfillRun.assertions + commercialBackfillDatabaseGuardRun.assertions + commercialBackfillGuardTestsRun.assertions,
    },
    mt01c2b3a: {
      writeBridge: commercialWriteBridgeRun.assertions,
      guard: commercialWriteBridgeGuardRun.report.ok,
      guardTests: commercialWriteBridgeGuardTestsRun.assertions,
      total: commercialWriteBridgeRun.assertions + commercialWriteBridgeGuardTestsRun.assertions,
    },
    mt01c2b3b: {
      readBridge: commercialReadBridgeRun.assertions,
      legacyDifferential: commercialReadBridgeDifferentialRun.assertions,
      performance: commercialReadBridgePerformanceRun.assertions,
      databaseGuard: commercialReadBridgeDatabaseGuardRun.assertions,
      guard: commercialReadBridgeGuardRun.report.ok,
      guardTests: commercialReadBridgeGuardTestsRun.assertions,
      total: commercialReadBridgeRun.assertions + commercialReadBridgeDifferentialRun.assertions + commercialReadBridgePerformanceRun.assertions + commercialReadBridgeDatabaseGuardRun.assertions + commercialReadBridgeGuardTestsRun.assertions,
    },
    mt01c2b3c: {
      activationGate: commercialActivationGateRun.assertions,
      guard: commercialActivationGateGuardRun.report.ok,
      guardTests: commercialActivationGateGuardTestsRun.assertions,
      total: commercialActivationGateRun.assertions + commercialActivationGateGuardTestsRun.assertions,
    },
    crm01a: {
      pipelineRead: crmPipelineRun.assertions,
      performanceFixtures: crmPipelinePerformanceRun.report.fixtureSets,
      databaseGuard: crmPipelineDatabaseGuardRun.assertions,
      guard: crmPipelineGuardRun.report.ok,
      guardTests: crmPipelineGuardTestsRun.assertions,
      total: crmPipelineRun.assertions + crmPipelineDatabaseGuardRun.assertions + crmPipelineGuardTestsRun.assertions,
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
      "MT-01C1B2B/DATABASE_GUARD": { status: "PASS", assertions: provisioningDatabaseGuardRun.assertions, durationMs: provisioningDatabaseGuardRun.durationMs, exitCode: 0 },
      "MT-01C1B2B/GUARD": { status: "PASS", assertions: provisioningDomainGuardRun.assertions, durationMs: provisioningDomainGuardRun.durationMs, exitCode: 0 },
      "MT-01C1B3A/EXECUTOR": { status: "PASS", assertions: provisioningExecutorRun.assertions, durationMs: provisioningExecutorRun.durationMs, exitCode: 0 },
      "MT-01C1B3A/GUARD": { status: "PASS", assertions: provisioningExecutorGuardRun.assertions, durationMs: provisioningExecutorGuardRun.durationMs, exitCode: 0 },
      "SEC-COM-01A/ROUTES": { status: "PASS", assertions: secComRun.assertions, durationMs: secComRun.durationMs, exitCode: 0 },
      "SEC-COM-01A/GUARD": { status: "PASS", assertions: secComGuardRun.assertions, durationMs: secComGuardRun.durationMs, exitCode: 0 },
      "MT-01C2B1/FOUNDATION": { status: "PASS", assertions: commercialTenantRun.assertions, durationMs: commercialTenantRun.durationMs, exitCode: 0 },
      "MT-01C2B1/DRY_RUN": { status: "PASS", assertions: 0, durationMs: commercialTenantDryRun.durationMs, exitCode: 0 },
      "MT-01C2B1/RUNTIME_GUARD": { status: "PASS", assertions: 0, durationMs: commercialTenantGuardRun.durationMs, exitCode: 0 },
      "MT-01C2B1/GUARD_TESTS": { status: "PASS", assertions: commercialTenantGuardTests.assertions, durationMs: commercialTenantGuardTests.durationMs, exitCode: 0 },
      "MT-01C2B2/BACKFILL": { status: "PASS", assertions: commercialBackfillRun.assertions, durationMs: commercialBackfillRun.durationMs, exitCode: 0 },
      "MT-01C2B2/DATABASE_GUARD": { status: "PASS", assertions: commercialBackfillDatabaseGuardRun.assertions, durationMs: commercialBackfillDatabaseGuardRun.durationMs, exitCode: 0 },
      "MT-01C2B2/GUARD": { status: "PASS", assertions: 0, durationMs: commercialBackfillGuardRun.durationMs, exitCode: 0 },
      "MT-01C2B2/GUARD_TESTS": { status: "PASS", assertions: commercialBackfillGuardTestsRun.assertions, durationMs: commercialBackfillGuardTestsRun.durationMs, exitCode: 0 },
      "MT-01C2B3A/WRITE_BRIDGE": { status: "PASS", assertions: commercialWriteBridgeRun.assertions, durationMs: commercialWriteBridgeRun.durationMs, exitCode: 0 },
      "MT-01C2B3A/GUARD": { status: "PASS", assertions: 0, durationMs: commercialWriteBridgeGuardRun.durationMs, exitCode: 0 },
      "MT-01C2B3A/GUARD_TESTS": { status: "PASS", assertions: commercialWriteBridgeGuardTestsRun.assertions, durationMs: commercialWriteBridgeGuardTestsRun.durationMs, exitCode: 0 },
      "MT-01C2B3B/READ_BRIDGE": { status: "PASS", assertions: commercialReadBridgeRun.assertions, durationMs: commercialReadBridgeRun.durationMs, exitCode: 0 },
      "MT-01C2B3B/LEGACY_DIFFERENTIAL": { status: "PASS", assertions: commercialReadBridgeDifferentialRun.assertions, durationMs: commercialReadBridgeDifferentialRun.durationMs, exitCode: 0 },
      "MT-01C2B3B/PERFORMANCE": { status: "PASS", assertions: commercialReadBridgePerformanceRun.assertions, durationMs: commercialReadBridgePerformanceRun.durationMs, exitCode: 0 },
      "MT-01C2B3B/DATABASE_GUARD": { status: "PASS", assertions: commercialReadBridgeDatabaseGuardRun.assertions, durationMs: commercialReadBridgeDatabaseGuardRun.durationMs, exitCode: 0 },
      "MT-01C2B3B/GUARD": { status: "PASS", assertions: 0, durationMs: commercialReadBridgeGuardRun.durationMs, exitCode: 0 },
      "MT-01C2B3B/GUARD_TESTS": { status: "PASS", assertions: commercialReadBridgeGuardTestsRun.assertions, durationMs: commercialReadBridgeGuardTestsRun.durationMs, exitCode: 0 },
      "MT-01C2B3C/ACTIVATION_GATE": { status: "PASS", assertions: commercialActivationGateRun.assertions, durationMs: commercialActivationGateRun.durationMs, exitCode: 0 },
      "MT-01C2B3C/GUARD": { status: "PASS", assertions: 0, durationMs: commercialActivationGateGuardRun.durationMs, exitCode: 0 },
      "MT-01C2B3C/GUARD_TESTS": { status: "PASS", assertions: commercialActivationGateGuardTestsRun.assertions, durationMs: commercialActivationGateGuardTestsRun.durationMs, exitCode: 0 },
      "CRM-01A/PIPELINE_READ": { status: "PASS", assertions: crmPipelineRun.assertions, durationMs: crmPipelineRun.durationMs, exitCode: 0 },
      "CRM-01A/PERFORMANCE": { status: "PASS", assertions: crmPipelinePerformanceRun.assertions, durationMs: crmPipelinePerformanceRun.durationMs, exitCode: 0 },
      "CRM-01A/DATABASE_GUARD": { status: "PASS", assertions: crmPipelineDatabaseGuardRun.assertions, durationMs: crmPipelineDatabaseGuardRun.durationMs, exitCode: 0 },
      "CRM-01A/GUARD": { status: "PASS", assertions: 0, durationMs: crmPipelineGuardRun.durationMs, exitCode: 0 },
      "CRM-01A/GUARD_TESTS": { status: "PASS", assertions: crmPipelineGuardTestsRun.assertions, durationMs: crmPipelineGuardTestsRun.durationMs, exitCode: 0 },
    },
    total,
  }, null, 2)}\n`);
} finally {
  rmSync(envPath, { force: true });
  rmSync(resultsPath, { force: true });
}
