import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validateDb01RuntimeActivation,
  validateMt01bFoundationIsolation,
  validateMt01b2FrontendIsolation,
  validateMt01b2LegacyBundle,
  validateRuntimeDefaults,
} from "./validate-canonical-ci.mjs";

const root = mkdtempSync(join(tmpdir(), "db01-activation-guard-"));
const results = [];

function check(name, condition) {
  if (!condition) throw new Error(`Falló: ${name}`);
  results.push({ name, passed: true });
}

function fixture(file, contents) {
  const target = join(root, file);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, contents, "utf8");
  return file;
}

function rejection(name, action, expected) {
  let error = null;
  try { action(); } catch (caught) { error = caught; }
  check(name, error instanceof Error && expected.every((fragment) => error.message.includes(fragment)));
  return error;
}

try {
  const safe = fixture("api/health.js", 'import { withCommonHeaders } from "./_lib/http.js";\n');
  validateDb01RuntimeActivation({ root, files: [safe] });
  validateRuntimeDefaults({});
  check("estado actual aprobado", true);

  const staticImport = fixture("api/fake-static.js", 'import { appendCommercialAudit } from "./_lib/commercialAuditLog.js";\n');
  const staticError = rejection(
    "import ficticio desde endpoint rechazado con archivo y servicio",
    () => validateDb01RuntimeActivation({ root, files: [staticImport] }),
    ["api/fake-static.js", "CommercialAuditLog"],
  );
  check("mensaje sanitizado no incluye secretos", !staticError.message.includes("DATABASE_URL") && !staticError.message.includes("password"));

  const internal = fixture("api/_lib/internal-test.js", 'import { createApprovalRequest } from "./approvalRequest.js";\n');
  validateDb01RuntimeActivation({ root, files: [internal] });
  check("import desde api/_lib permitido", true);

  const exported = fixture("src/fake-export.ts", 'export { evaluateRisk } from "../api/_lib/riskEngine.js";\n');
  rejection("re-export frontend rechazado", () => validateDb01RuntimeActivation({ root, files: [exported] }), ["RiskEngine"]);

  const required = fixture("api/fake-require.cjs", 'const vehicle = require("./_lib/vehicleFleet.js");\n');
  rejection("require endpoint rechazado", () => validateDb01RuntimeActivation({ root, files: [required] }), ["Vehicle"]);

  const dynamic = fixture("src/fake-dynamic.ts", 'const crate = import("../api/_lib/crateSettingsVersioned.js");\n');
  rejection("import dinámico frontend rechazado", () => validateDb01RuntimeActivation({ root, files: [dynamic] }), ["CrateSettings"]);

  const catalog = fixture("api/fake-catalog.js", [
    'import "./_lib/commercialAuditLog.js";',
    'import "./_lib/approvalRequestAdapter.js";',
    'import "./_lib/riskEngine.js";',
    'import "./_lib/logisticOverrideApproval.js";',
    'import "./_lib/quoteChangeOrderAdapter.js";',
    'import "./_lib/logisticsGeoAdmin.js";',
    'import "./_lib/vehicleEngineSettings.js";',
    'import "./_lib/crateSettingsImport.js";',
    "",
  ].join("\n"));
  rejection(
    "catálogo completo de servicios protegido",
    () => validateDb01RuntimeActivation({ root, files: [catalog] }),
    ["CommercialAuditLog", "ApprovalRequest", "RiskEngine", "LogisticOverrideApproval", "QuoteChangeOrder", "LogisticsGeography", "Vehicle", "CrateSettings"],
  );

  rejection(
    "activación SHADOW rechazada",
    () => validateRuntimeDefaults({ DB01H_LOGISTICS_GEO_ENABLED: "true", DB01H_LOGISTICS_GEO_SHADOW: "true" }),
    ["SHADOW"],
  );
  rejection(
    "activación DUAL_WRITE rechazada",
    () => validateRuntimeDefaults({ DB01E_APPROVAL_RELATIONAL_ENABLED: "true" }),
    ["DUAL_WRITE"],
  );
  rejection(
    "activación ENFORCED rechazada",
    () => validateRuntimeDefaults({ DB01I_VEHICLE_ENGINE_MODE: "ENFORCED" }),
    ["vehículos"],
  );
  rejection(
    "autoridad relacional rechazada",
    () => validateRuntimeDefaults({ DB01J_CRATE_SETTINGS_AUTHORITY: "RELATIONAL" }),
    ["Autoridad CrateSettings"],
  );
  rejection(
    "MT-01B HYBRID rechazado antes de B2",
    () => validateRuntimeDefaults({ MT01B_AUTH_MODE: "HYBRID", MT01B_LEGACY_TOKEN_ACCEPT_UNTIL: new Date(Date.now() + 3_600_000).toISOString() }),
    ["LEGACY"],
  );
  rejection(
    "tenant switch rechazado",
    () => validateRuntimeDefaults({ MT01B_TENANT_SWITCH_ENABLED: "true" }),
    ["cambio de empresa"],
  );
  const fakeSwitch = fixture("src/TenantSwitcher.tsx", "export function TenantSwitcher() { return null; }\n");
  rejection(
    "componente de cambio de tenant rechazado",
    () => validateMt01bFoundationIsolation({ root, files: [fakeSwitch] }),
    ["TenantSwitcher"],
  );

  const pilotRoute = fixture("api/clients/index.js", 'import { requirePilotPermission } from "../_lib/authContextPilot.js";\n');
  validateMt01bFoundationIsolation({ root, files: [pilotRoute] });
  check("ruta B3B1 inventariada puede usar sólo el adaptador piloto", true);

  const directContextRoute = fixture("api/clients/index.js", 'import { resolveAuthContext } from "../_lib/authContext.js";\n');
  rejection(
    "ruta B3B1 no puede importar contexto interno directamente",
    () => validateMt01bFoundationIsolation({ root, files: [directContextRoute] }),
    ["api/clients/index.js"],
  );

  const canonicalInventory = fixture("scripts/v17-auth-legacy-route-inventory.json", JSON.stringify({
    migratedActiveFiles: ["api/k/signal.js"],
  }));
  const canonicalRoute = fixture("api/k/signal.js", 'import { requireRole } from "../_lib/authContextMiddleware.js";\n');
  validateMt01bFoundationIsolation({ root, files: [canonicalInventory, canonicalRoute] });
  check("ruta inventariada puede usar sólo el middleware canónico", true);

  const unlistedCanonicalRoute = fixture("api/health.js", 'import { requireRole } from "./_lib/authContextMiddleware.js";\n');
  rejection(
    "middleware canónico fuera del inventario rechazado",
    () => validateMt01bFoundationIsolation({ root, files: [canonicalInventory, unlistedCanonicalRoute] }),
    ["api/health.js"],
  );

  const unlistedPilotRoute = fixture("api/health.js", 'import { requirePilotPermission } from "./_lib/authContextPilot.js";\n');
  rejection(
    "adaptador piloto fuera del inventario rechazado",
    () => validateMt01bFoundationIsolation({ root, files: [unlistedPilotRoute] }),
    ["api/health.js"],
  );

  const inactiveCoordinator = fixture("src/auth-v2/sessionCoordinator.ts", "export class SessionCoordinator {}\n");
  validateMt01b2FrontendIsolation({ root, files: [inactiveCoordinator], env: { VITE_MT01B2_CLIENT_ENABLED: "false" } });
  check("fundación frontend desacoplada aprobada", true);

  const activeImport = fixture("src/main.tsx", 'import { SessionCoordinator } from "./auth-v2/sessionCoordinator.ts";\n');
  rejection(
    "import del coordinador desde arranque activo rechazado",
    () => validateMt01b2FrontendIsolation({ root, files: [inactiveCoordinator, activeImport], env: {} }),
    ["src/main.tsx", "auth-v2/sessionCoordinator.ts"],
  );

  const allowedGate = fixture("src/lib/mt01b2FrontendBootstrap.ts", 'void import("../auth-v2/frontendSessionRuntime.ts");\n');
  validateMt01b2FrontendIsolation({ root, files: [inactiveCoordinator, allowedGate], env: {} });
  check("únicamente el bootstrap autorizado puede importar auth-v2", true);

  const unauthorizedGateImport = fixture("src/components/UnsafeAuth.tsx", 'import "../auth-v2/frontendSessionRuntime.ts";\n');
  rejection(
    "import auth-v2 fuera del bootstrap rechazado",
    () => validateMt01b2FrontendIsolation({ root, files: [inactiveCoordinator, unauthorizedGateImport], env: {} }),
    ["src/components/UnsafeAuth.tsx", "mt01b2FrontendBootstrap.ts"],
  );

  const dynamicDirectImport = fixture("src/direct-dynamic.ts", 'void import("./auth-v2/frontendSessionRuntime.ts");\n');
  rejection(
    "import dinámico directo del runtime V2 rechazado",
    () => validateMt01b2FrontendIsolation({ root, files: [inactiveCoordinator, dynamicDirectImport], env: {} }),
    ["src/direct-dynamic.ts", "frontendSessionRuntime.ts"],
  );

  const persistentToken = fixture("src/auth-v2/unsafe.ts", 'window.localStorage.setItem("accessToken", token);\n');
  rejection(
    "persistencia de token rechazada con archivo y mecanismo",
    () => validateMt01b2FrontendIsolation({ root, files: [persistentToken], env: {} }),
    ["src/auth-v2/unsafe.ts", "localStorage"],
  );

  rejection(
    "activación VITE de MT-01B2A rechazada",
    () => validateMt01b2FrontendIsolation({ root, files: [inactiveCoordinator], env: { VITE_MT01B2_CLIENT_ENABLED: "true" } }),
    ["desactivado"],
  );

  fixture("dist/assets/index-safe.js", 'console.log("legacy");\n');
  validateMt01b2LegacyBundle({ root });
  check("bundle LEGACY sin coordinador aprobado", true);

  fixture("dist/assets/index-unsafe.js", 'const channel = "osi-plus:mt01b2:session";\n');
  rejection(
    "bundle LEGACY con coordinador rechazado",
    () => validateMt01b2LegacyBundle({ root }),
    ["index-unsafe.js", "osi-plus:mt01b2:session"],
  );

  process.stdout.write(`${JSON.stringify({ ok: true, passed: results.length, results }, null, 2)}\n`);
} finally {
  rmSync(root, { recursive: true, force: true });
}
