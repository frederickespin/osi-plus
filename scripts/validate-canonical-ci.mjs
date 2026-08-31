import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { approvalPersistenceMode } from "../api/_lib/approvalRequestAdapter.js";
import { resolveCrateCalculationAuthority } from "../api/_lib/crateSettingsAdapter.js";
import { logisticsGeoIntegrationMode } from "../api/_lib/logisticsGeoAdapter.js";
import { quoteChangeOrderPersistenceMode } from "../api/_lib/quoteChangeOrderAdapter.js";
import { vehicleEngineIntegrationMode } from "../api/_lib/vehicleEngineAdapter.js";
import { resolveMt01bAuthPolicy } from "../api/_lib/authPolicy.js";

export const DB01_RUNTIME_SERVICE_MODULES = Object.freeze([
  { service: "CommercialAuditLog", pattern: /commercialauditlog/i },
  { service: "ApprovalRequest", pattern: /approvalrequest/i },
  { service: "RiskEngine", pattern: /riskengine/i },
  { service: "LogisticOverrideApproval", pattern: /logisticoverrideapproval/i },
  { service: "QuoteChangeOrder", pattern: /quotechangeorder/i },
  { service: "LogisticsGeography", pattern: /(?:geonormalization|logisticsgeo|logisticszonerules)/i },
  { service: "Vehicle", pattern: /(?:vehiclenormalization|vehiclefleet|vehicleimport|vehicleengine)/i },
  { service: "CrateSettings", pattern: /cratesettings(?:adapter|import|support|validation|versioned)/i },
]);

export const DB01_RUNTIME_IMPORT_ALLOWLIST = Object.freeze([]);

export const CANONICAL_MIGRATIONS = Object.freeze([
  "20260801000000_production_baseline",
  "20260801001000_mt01a_tenant_memberships",
  "20260801002000_commercial_audit_log",
  "20260801003000_approval_requests",
  "20260801004000_risk_engine_rules_evaluations",
  "20260801005000_logistic_override_approvals",
  "20260801006000_quote_change_orders",
  "20260801007000_logistics_geography_zone_rules",
  "20260801008000_vehicle_engine_settings",
  "20260801009000_logistics_rate_metadata",
  "20260801010000_crate_settings",
  "20260801011000_mt01b_auth_sessions",
  "20260801012000_mt01c1a_employee_profiles",
  "20260801013000_mt01c1b1_provisioning_persistence",
  "20260801014000_mt01c2b1_commercial_tenant_foundation",
  "20260801015000_crm01b_pipeline_mutation_authority",
  "20260801020000_v17_pipeline_case_client_authority",
  "20260821010000_v17_pipeline_case_public_ref",
  "20260824010000_v17_client_public_ref_case_mutations",
  "20260827010000_v17_tenant_membership_public_ref",
  "20260827020000_v17_admin_identity_invitation",
  "20260831010000_v17_crm_icp_foundation",
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function assertCanonicalCiTarget(raw = process.env.DATABASE_URL) {
  invariant(process.env.CANONICAL_DB_VALIDATION === "true", "Falta CANONICAL_DB_VALIDATION=true");
  invariant(raw, "DATABASE_URL es obligatoria");
  const url = new URL(raw);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  invariant(["postgres:", "postgresql:"].includes(url.protocol), "El protocolo debe ser PostgreSQL");
  invariant(new Set(["127.0.0.1", "localhost", "::1"]).has(url.hostname), "La base canónica CI debe ser local");
  invariant(url.port === "55432", "La base canónica CI debe usar el puerto aislado 55432");
  invariant(new Set(["osi_db01n_ci", "osi_mt01c1b3a_q1_20260809", "osi_mt01c2b1_local", "osi_db01n_mt01c2b1_local", "osi_mt01c2b2_local", "osi_db01n_mt01c2b2_local", "osi_mt01c2b3a_local", "osi_db01n_mt01c2b3a_local", "osi_mt01c2b3b_local", "osi_db01n_mt01c2b3b_local", "osi_crm01b_local", "osi_v17_case_client_local", "osi_v17_case_public_ref_local"]).has(database), "La base canónica debe pertenecer a la allowlist local exacta");
  invariant(url.searchParams.get("schema") === "osi", "La URL canónica debe incluir schema=osi");
  invariant(!raw.toLowerCase().includes("neon"), "Se rechazó una referencia Neon");

  for (const key of [
    "DATABASE_URL", "DIRECT_URL", "DB01D_DATABASE_URL", "DB01E_DATABASE_URL",
    "DB01F_DATABASE_URL", "DB01G_DATABASE_URL", "DB01H_DATABASE_URL",
    "DB01I_DATABASE_URL", "DB01J_DATABASE_URL", "MT01C2B1_TEST_DATABASE_URL", "MT01C2B2_TEST_DATABASE_URL",
    "MT01C2B3A_TEST_DATABASE_URL", "MT01C2B3B_TEST_DATABASE_URL", "CRM01A_TEST_DATABASE_URL",
    "CRM01B1_TEST_DATABASE_URL", "V17_CASE_CLIENT_TEST_DATABASE_URL", "V17_CASE_PUBLIC_REF_TEST_DATABASE_URL",
  ]) {
    invariant(process.env[key] === raw, `${key} no coincide con la base aislada de CI`);
  }
  return { database, host: url.hostname, port: url.port, schema: "osi" };
}

export function validateMigrationFiles(root = process.cwd()) {
  const migrationRoot = resolve(root, "prisma/migrations");
  const directories = readdirSync(migrationRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  invariant(
    JSON.stringify(directories) === JSON.stringify([...CANONICAL_MIGRATIONS].sort()),
    `La cadena activa no coincide con las ${CANONICAL_MIGRATIONS.length} migraciones canónicas`,
  );

  for (const migration of CANONICAL_MIGRATIONS) {
    const directory = resolve(migrationRoot, migration);
    const entries = readdirSync(directory).sort();
    invariant(entries.length === 1 && entries[0] === "migration.sql", `${migration} contiene archivos inesperados`);
    const sqlPath = resolve(directory, "migration.sql");
    invariant(statSync(sqlPath).size > 0, `${migration}/migration.sql está vacío`);
    const bytes = readFileSync(sqlPath);
    invariant(!bytes.includes(0), `${migration}/migration.sql contiene bytes nulos`);
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }
  return directories;
}

function trackedFiles() {
  const result = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  invariant(result.status === 0, result.stderr || "No se pudo inventariar Git");
  return result.stdout.split("\0").filter(Boolean);
}

function validateTrackedSecrets(root = process.cwd()) {
  const files = trackedFiles();
  const forbiddenEnvironmentFiles = files.filter((file) => {
    const name = basename(file);
    return (name === ".env" || name.startsWith(".env.")) && name !== ".env.example";
  });
  invariant(forbiddenEnvironmentFiles.length === 0, `Archivos de entorno versionados: ${forbiddenEnvironmentFiles.join(", ")}`);

  const forbiddenBinarySecrets = files.filter((file) => /\.(?:pem|key|p12|pfx|dump|sqlite|db)$/i.test(file));
  invariant(forbiddenBinarySecrets.length === 0, `Artefactos sensibles versionados: ${forbiddenBinarySecrets.join(", ")}`);

  const findings = [];
  const credentialUrl = /postgres(?:ql)?:\/\/[^\s:"'\]]+:[^\s@"'\]]+@[^\s"'\]]+/gi;
  const privateKeyMarker = ["-----BEGIN ", "PRIVATE KEY-----"].join("");
  const neonMarker = [".neon", ".tech"].join("");
  for (const file of files) {
    if (file === ".env.example") continue;
    const absolute = resolve(root, file);
    let bytes;
    try {
      bytes = readFileSync(absolute);
    } catch {
      continue;
    }
    if (bytes.includes(0)) continue;
    const contents = bytes.toString("utf8");
    if (contents.includes(privateKeyMarker) || contents.toLowerCase().includes(neonMarker)) findings.push(file);
    for (const match of contents.matchAll(credentialUrl)) {
      if (file !== ".github/workflows/ci.yml") findings.push(file);
      else {
        const url = new URL(match[0]);
        if (!new Set(["127.0.0.1", "localhost", "::1"]).has(url.hostname)) findings.push(file);
      }
    }
  }
  invariant(findings.length === 0, `Posibles secretos o conexiones externas: ${[...new Set(findings)].join(", ")}`);
  return files.length;
}

export function validateMt01bFoundationIsolation({ root = process.cwd(), files = trackedFiles() } = {}) {
  files = files.map((file) => file.replaceAll("\\", "/"));
  const contextPilotRoutes = new Set([
    "api/clients/index.js",
    "api/k/dashboard.js",
    "api/osis/[id].js",
    "api/osis/index.js",
    "api/projects/index.js",
    "api/users/index.js",
  ]);
  const forbiddenPaths = files.filter((file) => /(?:select-tenant|switch-tenant|auth\/memberships|tenant(?:selection|switcher))/i.test(file));
  invariant(forbiddenPaths.length === 0, `MT-01B1 no permite selección o cambio de empresa: ${forbiddenPaths.join(", ")}`);

  const runtime = files.filter((file) => /^(?:api|src)\/.+\.(?:[cm]?[jt]sx?)$/.test(file));
  const imports = [];
  const directWrites = [];
  for (const file of runtime) {
    let source;
    try { source = readFileSync(resolve(root, file), "utf8"); } catch { continue; }
    if (!file.startsWith("api/_lib/") && !file.startsWith("api/auth/") && /(?:authContext|authSession|membershipAuthorization)/i.test(source)) {
      const exactPilotImport = /from\s+["']\.\.\/_lib\/authContextPilot\.js["']/.test(source);
      if (!contextPilotRoutes.has(file) || !exactPilotImport || /from\s+["'][^"']*(?:authContext|authSession|membershipAuthorization)(?!Pilot\.js)[^"']*["']/.test(source)) {
        imports.push(file);
      }
    }
    if (file !== "api/_lib/membershipAuthorization.js" &&
        /(?:tenantMembership\s*\.\s*(?:update|updateMany|upsert|delete)|UPDATE\s+["'`]*tenant_memberships)/i.test(source)) directWrites.push(file);
  }
  invariant(imports.length === 0, `MT-01B sólo permite el piloto empresarial explícito en rutas inventariadas: ${imports.join(", ")}`);
  invariant(directWrites.length === 0, `Escritura de membresía fuera del servicio único: ${directWrites.join(", ")}`);
  return runtime.length;
}

export function validateMt01b2FrontendIsolation({ root = process.cwd(), files = trackedFiles(), env = process.env } = {}) {
  invariant(String(env.VITE_MT01B2_CLIENT_ENABLED || "false").toLowerCase() !== "true", "MT-01B2A frontend debe permanecer desactivado");
  invariant(env.COMMERCIAL_TENANCY_WRITE_MODE === undefined || env.COMMERCIAL_TENANCY_WRITE_MODE === "LEGACY_ONLY", "MT-01C2B3A exige LEGACY_ONLY exacto");
  invariant(env.COMMERCIAL_TENANCY_READ_MODE === undefined || env.COMMERCIAL_TENANCY_READ_MODE === "LEGACY_ONLY", "MT-01C2B3B exige LEGACY_ONLY exacto");
  invariant(env.COMMERCIAL_TENANCY_MUTATION_MODE === undefined || env.COMMERCIAL_TENANCY_MUTATION_MODE === "DISABLED", "mutaciones comerciales generales deben permanecer DISABLED en CI");
  files = files.map((file) => file.replaceAll("\\", "/"));
  const authSourceFiles = files.filter((file) => file.startsWith("src/auth-v2/") && /\.(?:[cm]?[jt]sx?)$/.test(file));
  const persistentMarkers = ["local" + "Storage", "session" + "Storage", "indexed" + "DB"];
  const persistenceViolations = [];
  for (const file of authSourceFiles) {
    let source;
    try { source = readFileSync(resolve(root, file), "utf8"); } catch { continue; }
    const marker = persistentMarkers.find((candidate) => source.includes(candidate));
    if (marker) persistenceViolations.push(`${file}:${marker}`);
  }
  invariant(persistenceViolations.length === 0, `MT-01B2A no permite tokens en almacenamiento persistente: ${persistenceViolations.join(", ")}`);

  const activeRuntime = files.filter((file) => file.startsWith("src/") && !file.startsWith("src/auth-v2/") && /\.(?:[cm]?[jt]sx?)$/.test(file));
  const authorizedBootstrap = "src/lib/mt01b2FrontendBootstrap.ts";
  const imports = [];
  for (const file of activeRuntime) {
    let source;
    try { source = readFileSync(resolve(root, file), "utf8"); } catch { continue; }
    for (const specifier of moduleSpecifiers(source)) {
      if (/(?:^|\/)auth-v2(?:\/|$)/i.test(specifier) && file !== authorizedBootstrap) {
        imports.push(`${file} -> ${specifier}`);
      }
    }
  }
  invariant(imports.length === 0, `MT-01B2 sólo permite importar auth-v2 desde ${authorizedBootstrap}: ${imports.join(", ")}`);
  return { authSourceFiles: authSourceFiles.length, activeRuntimeFiles: activeRuntime.length };
}

export function validateMt01b2LegacyBundle({ root = process.cwd() } = {}) {
  const assetsRoot = resolve(root, "dist/assets");
  if (!existsSync(assetsRoot)) return { checked: false, jsFiles: 0, bytes: 0 };
  const jsFiles = readdirSync(assetsRoot).filter((file) => file.endsWith(".js"));
  const forbidden = [
    "osi-plus:mt01b2:session",
    "CrossTabSessionCoordinator",
    "MT01B_REFRESH_IN_PROGRESS",
    "/auth/session/upgrade",
  ];
  const findings = [];
  let bytes = 0;
  for (const file of jsFiles) {
    const source = readFileSync(resolve(assetsRoot, file), "utf8");
    bytes += Buffer.byteLength(source);
    for (const marker of forbidden) {
      if (source.includes(marker)) findings.push(`${file}:${marker}`);
    }
  }
  invariant(findings.length === 0, `El build LEGACY contiene la integración MT-01B2: ${findings.join(", ")}`);
  return { checked: true, jsFiles: jsFiles.length, bytes };
}

function validateFixtureRuntimeIsolation(root = process.cwd()) {
  const runtimeFiles = trackedFiles().filter((file) => /^(?:api|src)\//.test(file) && /\.(?:[cm]?[jt]sx?)$/.test(file));
  const forbiddenImport = /(?:from\s*|import\s*\(|require\s*\()\s*["'][^"']*scripts\/fixtures\/db01(?:\/|["'])/;
  const violations = runtimeFiles.filter((file) => {
    try {
      return forbiddenImport.test(readFileSync(resolve(root, file), "utf8").replaceAll("\\", "/"));
    } catch {
      return false;
    }
  });
  invariant(violations.length === 0, `Runtime no puede importar fixtures DB-01: ${violations.join(", ")}`);
  return runtimeFiles.length;
}

function moduleSpecifiers(source) {
  const values = [];
  const patterns = [
    /\b(?:import|export)\s+(?:[^;"']*?\s+from\s+)?["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) values.push(match[1].replaceAll("\\", "/"));
  }
  return [...new Set(values)];
}

function db01ServiceForSpecifier(specifier) {
  const normalized = String(specifier || "").replaceAll("\\", "/");
  return DB01_RUNTIME_SERVICE_MODULES.find(({ pattern }) => pattern.test(normalized))?.service || null;
}

export function validateDb01RuntimeActivation({
  root = process.cwd(),
  files = trackedFiles(),
  allowlist = DB01_RUNTIME_IMPORT_ALLOWLIST,
} = {}) {
  const allowed = new Set(allowlist.map((entry) => `${entry.file}:${entry.service}`));
  const runtimeFiles = files
    .map((file) => file.replaceAll("\\", "/"))
    .filter((file) => (
      (file.startsWith("api/") && !file.startsWith("api/_lib/")) || file.startsWith("src/")
    ) && /\.(?:[cm]?[jt]sx?)$/.test(file));
  const violations = [];
  for (const file of runtimeFiles) {
    let source;
    try {
      source = readFileSync(resolve(root, file), "utf8");
    } catch {
      continue;
    }
    for (const specifier of moduleSpecifiers(source)) {
      const service = db01ServiceForSpecifier(specifier);
      if (service && !allowed.has(`${file}:${service}`)) violations.push({ file, service, specifier });
    }
  }
  invariant(
    violations.length === 0,
    `Activación DB-01 bloqueada: ${violations.map(({ file, service, specifier }) => `${file} -> ${service} (${specifier})`).join(", ")}`,
  );
  return runtimeFiles.length;
}

export function validateRuntimeDefaults(env = process.env) {
  invariant(approvalPersistenceMode({}) === "LEGACY_ONLY", "ApprovalRequest no está en LEGACY_ONLY");
  invariant(quoteChangeOrderPersistenceMode({}) === "LEGACY_ONLY", "QuoteChangeOrder no está en LEGACY_ONLY");
  invariant(logisticsGeoIntegrationMode({}) === "LEGACY_ONLY", "Geografía no está en LEGACY_ONLY");
  invariant(vehicleEngineIntegrationMode({}) === "LEGACY_ONLY", "Vehículos no están en LEGACY_ONLY");
  const crate = resolveCrateCalculationAuthority({ legacySettings: {}, relationalSettings: {} });
  invariant(crate.authority === "LEGACY" && crate.effectsApplied === false, "CrateSettings no conserva autoridad legacy");

  invariant(approvalPersistenceMode(env) === "LEGACY_ONLY", "ApprovalRequest relacional o DUAL_WRITE no permitido");
  invariant(quoteChangeOrderPersistenceMode(env) === "LEGACY_ONLY", "QuoteChangeOrder relacional o DUAL_WRITE no permitido");
  invariant(logisticsGeoIntegrationMode(env) === "LEGACY_ONLY", "SHADOW geográfico no permitido");

  const forbidden = [
    "DB01E_APPROVAL_RELATIONAL_ENABLED", "DB01E_APPROVAL_RELATIONAL_AUTHORITY",
    "DB01G_CHANGE_ORDER_RELATIONAL_ENABLED", "DB01G_CHANGE_ORDER_RELATIONAL_AUTHORITY",
    "DB01H_LOGISTICS_GEO_ENABLED", "DB01H_LOGISTICS_GEO_SHADOW",
    "DB01H_LOGISTICS_RELATIONAL_ENABLED", "DB01H_LOGISTICS_SHADOW_ENABLED",
    "DB01J_CRATE_SETTINGS_RELATIONAL_ENABLED", "DB01J_CRATE_SETTINGS_DUAL_WRITE_ENABLED",
    "DB01J_CRATE_SETTINGS_SHADOW_ENABLED", "DB01J_CRATE_SETTINGS_ENFORCED_ENABLED",
    "DB01J_CRATE_SETTINGS_EFFECTS_ENABLED",
  ].filter((key) => String(env[key] || "false").toLowerCase() === "true");
  invariant(forbidden.length === 0, `Feature flags no permitidos en CI: ${forbidden.join(", ")}`);
  invariant(String(env.DB01F_RISK_ENGINE_MODE || "LEGACY_ONLY").toUpperCase() === "LEGACY_ONLY", "Modo de riesgo no permitido");
  invariant(String(env.DB01I_VEHICLE_ENGINE_MODE || "LEGACY_ONLY").toUpperCase() === "LEGACY_ONLY", "Modo de vehículos no permitido");
  invariant(new Set(["LEGACY", "LEGACY_ONLY"]).has(String(env.DB01J_CRATE_SETTINGS_AUTHORITY || "LEGACY").toUpperCase()), "Autoridad CrateSettings no permitida");
  const authPolicy = resolveMt01bAuthPolicy(env);
  invariant(authPolicy.mode === "LEGACY", "MT-01B debe permanecer en LEGACY");
  invariant(authPolicy.tenantSwitchEnabled === false, "MT-01B no permite cambio de empresa");
  invariant(!env.MT01B_LEGACY_TOKEN_ACCEPT_UNTIL, "La fecha legacy sólo se configura al activar HYBRID en MT-01B2");
  invariant(String(env.VITE_MT01B2_CLIENT_ENABLED || "false").toLowerCase() !== "true", "MT-01B2A frontend debe permanecer desactivado");
}

async function validateDatabase(raw) {
  const prisma = new PrismaClient({ datasourceUrl: raw });
  try {
    const identity = await prisma.$queryRawUnsafe(`SELECT current_database() AS database, current_schema() AS schema`);
    invariant(new Set(["osi_db01n_ci", "osi_mt01c1b3a_q1_20260809", "osi_mt01c2b1_local", "osi_db01n_mt01c2b1_local", "osi_mt01c2b2_local", "osi_db01n_mt01c2b2_local", "osi_mt01c2b3a_local", "osi_db01n_mt01c2b3a_local", "osi_mt01c2b3b_local", "osi_db01n_mt01c2b3b_local", "osi_v17_case_client_local", "osi_v17_case_public_ref_local"]).has(identity[0]?.database) && identity[0]?.schema === "osi", "Identidad PostgreSQL inesperada");
    const historyTables = await prisma.$queryRawUnsafe(`
      SELECT table_schema FROM information_schema.tables
      WHERE table_name = '_prisma_migrations' ORDER BY table_schema
    `);
    invariant(historyTables.length === 1 && historyTables[0]?.table_schema === "osi", "Debe existir una sola _prisma_migrations en osi");
    const migrations = await prisma.$queryRawUnsafe(`
      SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
      FROM "osi"."_prisma_migrations" ORDER BY migration_name
    `);
    invariant(migrations.length === CANONICAL_MIGRATIONS.length, `El historial no contiene ${CANONICAL_MIGRATIONS.length} migraciones`);
    invariant(
      JSON.stringify(migrations.map((row) => row.migration_name)) === JSON.stringify([...CANONICAL_MIGRATIONS].sort()),
      "El historial contiene migraciones no canónicas",
    );
    invariant(migrations.every((row) => row.finished_at && !row.rolled_back_at && row.applied_steps_count === 1), "Hay migraciones incompletas o revertidas");
    const riskModes = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::integer AS count FROM "osi"."risk_engine_settings" WHERE "mode" <> 'LEGACY_ONLY'`);
    invariant(riskModes[0]?.count === 0, "El motor de riesgo no inicia en LEGACY_ONLY");
    return { historySchema: "osi", appliedMigrations: migrations.length };
  } finally {
    await prisma.$disconnect();
  }
}

export async function validateCanonicalCi({ phase = "database" } = {}) {
  const target = assertCanonicalCiTarget();
  const migrations = validateMigrationFiles();
  const trackedFileCount = validateTrackedSecrets();
  const runtimeFilesChecked = validateFixtureRuntimeIsolation();
  const db01RuntimeFilesChecked = validateDb01RuntimeActivation();
  const mt01bRuntimeFilesChecked = validateMt01bFoundationIsolation();
  const mt01b2Frontend = validateMt01b2FrontendIsolation();
  const mt01b2LegacyBundle = validateMt01b2LegacyBundle();
  validateRuntimeDefaults();
  const database = phase === "database" ? await validateDatabase(process.env.DATABASE_URL) : null;
  return { ok: true, phase, target, migrations: migrations.length, trackedFileCount, runtimeFilesChecked, db01RuntimeFilesChecked, mt01bRuntimeFilesChecked, mt01b2Frontend, mt01b2LegacyBundle, database };
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  const phase = process.argv.includes("--preflight") ? "preflight" : "database";
  validateCanonicalCi({ phase })
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`Validación canónica rechazada: ${error.message}\n`);
      process.exitCode = 1;
    });
}
