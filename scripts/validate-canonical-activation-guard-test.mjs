import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validateDb01RuntimeActivation,
  validateMt01bFoundationIsolation,
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

  process.stdout.write(`${JSON.stringify({ ok: true, passed: results.length, results }, null, 2)}\n`);
} finally {
  rmSync(root, { recursive: true, force: true });
}
