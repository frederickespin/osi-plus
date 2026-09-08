import assert from "node:assert/strict";
import fs from "node:fs";
import { validatePersonnelPoliciesGuard } from "./validate-v17-personnel-policies-guard.mjs";
const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
let checks = 0;
const negative = (label, path, mutate) => {
  let failed = false;
  try {
    validatePersonnelPoliciesGuard({ [path]: mutate(read(path)) });
  } catch {
    failed = true;
  }
  assert.ok(failed, label);
  checks += 1;
};
negative(
  "identidad paralela",
  "prisma/schema.prisma",
  (text) => `${text}\nmodel OperationalPersonProfile { id String @id }`,
);
negative("sin tenant", "api/_lib/personnelPoliciesDomain.js", (text) =>
  text.replaceAll("tenantId: who.tenantId", ""),
);
negative(
  "rol como capacidad",
  "api/_lib/personnelPoliciesDomain.js",
  (text) =>
    `${text}\nconst unsafe = role === "A" ? "CAN_PERFORM_IN_PERSON_SURVEY" : null;`,
);
negative(
  "sin append-only",
  "prisma/migrations/20260914010000_v17_personnel_operational_policies/migration.sql",
  (text) => text.replaceAll("personnel_append_only", "removed_guard"),
);
negative("días especiales sin fecha", "prisma/schema.prisma", (text) =>
  text.replace(/^\s*calendarDate\s+DateTime\?.*$/mu, ""),
);
negative(
  "rebooking destructivo",
  "api/_lib/personnelPoliciesDomain.js",
  (text) =>
    text
      .replaceAll('status: "SUPERSEDED"', 'status: "ASSIGNED"')
      .replaceAll("replacesAssignmentId", "legacyAssignmentId"),
);
negative("env Production", "api/_lib/personnelPoliciesHttp.js", (text) =>
  text.replace("productionApiEnabled = false", "productionApiEnabled = true"),
);
negative("gate tardío", "api/_lib/personnelPoliciesHttp.js", (text) =>
  text.replace(
    "const mode = preparePersonnelPoliciesRequest(req, res, env);",
    "const lateGate = true;",
  ),
);
negative("Preview sin branch", "api/_lib/personnelPoliciesHttp.js", (text) =>
  text.replace(
    "PREVIEW_BRANCH: isV17ConsolidatedPreviewBranch(env.VERCEL_GIT_COMMIT_REF)",
    "PREVIEW_BRANCH: true",
  ),
);
negative("Preview sin DB", "api/_lib/personnelPoliciesHttp.js", (text) =>
  text.replace("previewUrlAuthorized(env.DATABASE_URL)", "true"),
);
negative(
  "Preview con transporte",
  "api/_lib/personnelPoliciesHttp.js",
  (text) =>
    text.replace(
      'COMMUNICATIONS_EXTERNAL_TRANSPORT_MODE === "DISABLED"',
      'COMMUNICATIONS_EXTERNAL_TRANSPORT_MODE === "ENABLED"',
    ),
);
negative(
  "transporte enviado",
  "api/_lib/personnelPoliciesDomain.js",
  (text) => `${text}\nconst unsafeTransport = { status: "SENT" };`,
);
negative(
  "sin alternativa fuera de horario",
  "src/survey/SurveyCasePanel.tsx",
  (text) => text.replace("Solicitar excepción", "Horario rechazado"),
);
negative(
  "ventana zonificada sin FK",
  "api/_lib/personnelPoliciesDomain.js",
  (text) =>
    text.replace(
      "logisticsRuleId: entry.zoneRuleRef",
      "legacyZone: entry.zoneRuleRef",
    ),
);
negative(
  "ruta CORS ausente",
  "scripts/protected-cors-route-inventory.json",
  (text) => text.replace('      "/api/personnel/policies",\n', ""),
);
negative("deny eliminado", "src/personnel-policies/access.ts", (text) =>
  text.replace(" && !blocked.has(permission)", ""),
);
negative(
  "evaluador sin acceso a excepciones",
  "src/hub/appCatalog.ts",
  (text) =>
    text.replace('"scheduling:exceptions:respond"', '"removed:respond"'),
);
assert.equal(validatePersonnelPoliciesGuard().productionApiEnabled, false);
checks += 1;
console.log(`V17-PERSONNEL-POLICIES-GUARD-NEGATIVE ${checks}/${checks}`);
