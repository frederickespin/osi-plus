import { readFileSync, readdirSync } from "node:fs";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { validateMt01b3aRepository } from "./validate-mt01b3a-auth-guard.mjs";
import { validateMt01c2b2Guard } from "./validate-mt01c2b2-guard.mjs";
import { validateMt01c2b3b } from "./validate-mt01c2b3b-guard.mjs";

const EXPECTED_MIGRATIONS = 15;
const ACTIVATION_BATCH = "MT-01C2B2-IPACKERS-DO-V1";
const BRIDGE_PATH = "api/_lib/commercialTenancyWrite.js";
const PREPARED_ROUTES = Object.freeze([
  "api/clients/index.js",
  "api/projects/index.js",
  "api/k/dashboard.js",
  "api/k/project.js",
  "api/k/project-validate.js",
  "api/k/project-release.js",
]);

function invariant(condition, message) {
  if (!condition) throw new Error(`MT-01C2B3C: ${message}`);
}

function filesBelow(directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) found.push(...filesBelow(path));
    else found.push(path);
  }
  return found;
}

function repositoryText(root, path, overrides) {
  return overrides[path] ?? readFileSync(resolve(root, path), "utf8");
}

export function validateMt01c2b3c({
  root = process.cwd(),
  overrides = {},
  migrationNames,
  extraRuntimeSources = {},
} = {}) {
  const read = (path) => repositoryText(root, path, overrides);
  const migrations = migrationNames ?? readdirSync(resolve(root, "prisma/migrations"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  invariant(migrations.length === EXPECTED_MIGRATIONS, `se requieren exactamente ${EXPECTED_MIGRATIONS} migraciones`);
  invariant(!migrations.some((name) => /^20260801015000_|mt01c2b3c/i.test(name)), "migración 16 no autorizada");

  const envExample = read(".env.example");
  invariant(/^COMMERCIAL_TENANCY_WRITE_MODE="LEGACY_ONLY"$/m.test(envExample), "WRITE debe permanecer LEGACY_ONLY por defecto");
  invariant(/^COMMERCIAL_TENANCY_READ_MODE="LEGACY_ONLY"$/m.test(envExample), "READ debe permanecer LEGACY_ONLY por defecto");
  invariant(!envExample.includes("COMMERCIAL_TENANCY_ACTIVATION_BATCH"), ".env.example no puede preparar una activación");

  const bridge = read(BRIDGE_PATH);
  invariant(bridge.includes(`COMMERCIAL_TENANCY_ACTIVATION_BATCH = "${ACTIVATION_BATCH}"`), "identificador exacto del lote ausente");
  invariant(/vercelEnvironment\s*===\s*"production"/.test(bridge), "Production debe validarse con casing exacto");
  invariant(/env\.VERCEL_GIT_COMMIT_REF\s*===\s*"main"/.test(bridge), "la activación debe limitarse a main");
  invariant(!/(?:trim|upper|toUpperCase|toLowerCase)\s*\(\s*env\.COMMERCIAL_TENANCY_ACTIVATION_BATCH|env\.COMMERCIAL_TENANCY_ACTIVATION_BATCH\s*\.\s*(?:trim|toUpperCase|toLowerCase)/.test(bridge), "el lote no puede normalizarse implícitamente");
  invariant(/const activationBatch\s*=\s*env\.COMMERCIAL_TENANCY_ACTIVATION_BATCH/.test(bridge), "el lote debe leerse una sola vez dentro del resolver");
  invariant(/coordinatedLegacy\s*&&\s*activationBatch\s*!==\s*undefined/.test(bridge), "LEGACY con batch residual no está bloqueado");
  invariant(/coordinatedTenant\s*&&\s*activationBatch\s*!==\s*COMMERCIAL_TENANCY_ACTIVATION_BATCH/.test(bridge), "el modo tenant no exige el lote exacto");
  invariant(/coordinatedTenant\s*&&\s*isVercelRuntime\s*&&\s*!productionActivationAllowed/.test(bridge), "falta bloqueo Vercel salvo compuerta completa");
  invariant(/!coordinatedLegacy\s*&&\s*!coordinatedTenant/.test(bridge), "los modos parciales deben rechazarse");
  invariant(/COMMERCIAL_TENANCY_CONFIGURATION_INVALID/.test(bridge), "falta error 503 controlado");
  invariant(/return Object\.freeze\(\{ writeMode, readMode, tenantMode: coordinatedTenant \}\)/.test(bridge), "el resultado público no debe exponer el lote");

  for (const path of [".github/workflows/ci.yml", ".env.example", "package.json", "vercel.json"]) {
    const source = read(path);
    invariant(!source.includes("COMMERCIAL_TENANCY_ACTIVATION_BATCH"), `${path} configura el lote de activación`);
    invariant(!/COMMERCIAL_TENANCY_(?:WRITE|READ)_MODE\s*[:=]\s*["']?TENANT_(?:WRITE|READ)\b/.test(source), `${path} activa un modo tenant`);
  }

  const packageJson = JSON.parse(read("package.json"));
  invariant(!Object.values(packageJson.scripts || {}).some((command) => /mt-01c2b2-(?:backfill|rollback|dry-run)|mt-01c2b3b-readiness/i.test(String(command))), "backfill/readiness conectado a scripts automáticos");

  const runtimeSources = { ...extraRuntimeSources };
  for (const runtimeRoot of ["api", "src"]) {
    for (const absolute of filesBelow(resolve(root, runtimeRoot))) {
      if (!/\.[cm]?[jt]sx?$/.test(absolute)) continue;
      const path = relative(root, absolute).replaceAll("\\", "/");
      runtimeSources[path] ??= read(path);
    }
  }
  for (const [path, source] of Object.entries(runtimeSources)) {
    if (path !== BRIDGE_PATH) {
      invariant(!source.includes("COMMERCIAL_TENANCY_ACTIVATION_BATCH"), `${path} expone o consume el lote fuera de la compuerta servidor`);
      invariant(!/process\.env\.COMMERCIAL_TENANCY_(?:WRITE_MODE|READ_MODE)/.test(source), `${path} interpreta directamente los modos comerciales`);
    }
    invariant(!/mt-01c2b2-(?:backfill|rollback|dry-run)|mt-01c2b3b-readiness/i.test(source), `${path} conecta una operación administrativa al runtime`);
  }

  for (const path of PREPARED_ROUTES) {
    const source = runtimeSources[path];
    invariant(typeof source === "string" && /commercialTenancyWrite\.js/.test(source), `${path} no importa la autoridad canónica`);
    const handler = source.slice(source.indexOf("export default"));
    const resolverAt = handler.indexOf("resolveCommercialTenancyModes()");
    invariant(resolverAt >= 0, `${path} no invoca el resolver canónico`);
    const businessPositions = [
      "requireCommercialPermission(", "requirePilotAuth(", "requirePilotPermission(", "requireRoleFromHeaders(",
      "prisma.client.", "prisma.project.", "readJson", "ensureDefaultSignals(",
    ].map((needle) => handler.indexOf(needle)).filter((position) => position >= 0);
    invariant(businessPositions.every((position) => resolverAt < position), `${path} toca autoridad o datos antes de validar configuración`);
  }

  invariant(!/console\.(?:log|info|warn|error)[\s\S]{0,160}(?:activationBatch|COMMERCIAL_TENANCY_ACTIVATION_BATCH)/.test(bridge), "la compuerta registra el lote");
  invariant(/json\(\{\s*ok:\s*false,\s*error:\s*String\(error\.code/.test(bridge), "la respuesta controlada no está sanitizada");

  const authInventory = validateMt01b3aRepository(root);
  invariant(authInventory.legacyHeaderExceptions === 24, "aumentaron las excepciones heredadas");
  validateMt01c2b2Guard(root);
  validateMt01c2b3b({ root, overrides, migrationNames: migrations, extraRuntimeSources });

  return Object.freeze({
    ok: true,
    migrations: migrations.length,
    defaults: Object.freeze({ write: "LEGACY_ONLY", read: "LEGACY_ONLY" }),
    productionGate: Object.freeze({ environment: "production", branch: "main", exactBatch: true }),
    previewBlocked: true,
    legacyHeaderExceptions: authInventory.legacyHeaderExceptions,
    runtimeActivationConsumers: 0,
    preparedRoutes: PREPARED_ROUTES.length,
    automaticHooks: 0,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(validateMt01c2b3c(), null, 2)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
