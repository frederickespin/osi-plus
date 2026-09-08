import assert from "node:assert/strict";
import fs from "node:fs";
const ROOT = new URL("../", import.meta.url);
const read = (path, overrides = {}) =>
  overrides[path] ?? fs.readFileSync(new URL(path, ROOT), "utf8");
export function validatePersonnelPoliciesGuard(overrides = {}) {
  const schema = read("prisma/schema.prisma", overrides);
  const migration = read(
    "prisma/migrations/20260914010000_v17_personnel_operational_policies/migration.sql",
    overrides,
  );
  const contract = read("api/_lib/personnelPoliciesContract.js", overrides);
  const domain = read("api/_lib/personnelPoliciesDomain.js", overrides);
  const http = read("api/_lib/personnelPoliciesHttp.js", overrides);
  const scheduling = read("api/_lib/surveySchedulingDomain.js", overrides);
  const schedulingUi = read("src/survey/SurveyCasePanel.tsx", overrides);
  const mode = read("src/personnel-policies/mode.ts", overrides);
  const access = read("src/personnel-policies/access.ts", overrides);
  const ui = read(
    "src/personnel-policies/PersonnelPoliciesAdmin.tsx",
    overrides,
  );
  const hub = read("src/hub/HubWorkspace.tsx", overrides);
  const catalog = read("src/hub/appCatalog.ts", overrides);
  const inventory = JSON.parse(
    read("scripts/protected-cors-route-inventory.json", overrides),
  );
  for (const model of [
    "OperationalCapability",
    "OperationalCapabilityAssignment",
    "OperationalZoneAssignment",
    "VisitPolicyVersion",
    "VisitPolicyWindow",
    "VisitReason",
    "OperationalScheduleOverride",
    "AfterHoursVisitRequest",
    "VisitPolicyEvent",
    "PersonnelPolicyCommand",
  ])
    assert.match(schema, new RegExp(`model ${model}\\s*\\{`), `falta ${model}`);
  assert.match(
    schema,
    /model EmployeeProfile[\s\S]*membership\s+TenantMembership[\s\S]*capabilityAssignments/,
  );
  assert.doesNotMatch(schema, /model OperationalPersonProfile/);
  for (const invariant of [
    "visit_policy_versions_active_key",
    "operational_capability_assignments_active_key",
    "personnel_policy_version_guard",
    "personnel_append_only",
    "survey_assignment_operational_snapshot_immutable",
  ])
    assert.ok(
      migration.includes(invariant),
      `invariante ausente: ${invariant}`,
    );
  assert.ok(
    /model VisitPolicyWindow[\s\S]*calendarDate\s+DateTime\?/u.test(schema) &&
      migration.includes('"calendar_date" DATE') &&
      contract.includes("calendarDate"),
    "días especiales sin autoridad fechada",
  );
  assert.ok(
    domain.includes("permsForRole") &&
      domain.includes("denied_permissions") &&
      domain.includes("tenantId: who.tenantId"),
    "AuthorizationContext tenant-first incompleto",
  );
  assert.ok(
    domain.includes("LogisticsPlanRevision") ||
      domain.includes("logisticsPlanRevision"),
  );
  assert.ok(
    domain.includes("travelMinutes") &&
      !ui.includes("minimumTravelBufferMinutes ="),
    "buffer logístico duplicado en frontend",
  );
  assert.ok(
    domain.includes('status: "SUPERSEDED"') &&
      domain.includes("replacesAssignmentId") &&
      (domain.includes("SurveyAssignmentEvent") ||
        domain.includes("surveyAssignmentEvent")),
    "rebooking destructivo",
  );
  assert.ok(
    domain.includes('status: "PREPARED"') && !domain.includes('status: "SENT"'),
    "transporte externo activado",
  );
  assert.ok(
    schedulingUi.includes("PERSONNEL_AFTER_HOURS_REQUEST_REQUIRED") &&
      schedulingUi.includes("Solicitar excepción") &&
      schedulingUi.includes('personnelApi.mutate("EXCEPTION_REQUEST"'),
    "Scheduling rechaza fuera de horario sin alternativa",
  );
  const gate = "if (!preparePersonnelPoliciesRequest(req, res, env)) return;";
  assert.ok(
    http.includes("productionApiEnabled = false") &&
      http.includes(gate) &&
      http.indexOf(gate) < http.indexOf("resolveContext(req"),
    "gate no precede auth",
  );
  assert.ok(
    mode.includes("productionApiEnabled = false") &&
      mode.includes("LOCAL_ONLY") &&
      mode.includes("VERCEL"),
    "frontend no falla cerrado",
  );
  assert.ok(
    access.includes("blocked.has(permission)") &&
      hub.indexOf("personnelPoliciesAvailable") <
        hub.indexOf("<PersonnelPoliciesAdmin"),
    "deny/lazy boundary alterado",
  );
  assert.ok(
    [
      "scheduling:exceptions:request",
      "scheduling:exceptions:approve",
      "scheduling:exceptions:respond",
    ].every((permission) => catalog.includes(permission)),
    "respondedores de excepciones fuera del catálogo Hub",
  );
  assert.ok(
    ui.includes("Personal y Políticas") &&
      [
        "Personal",
        "Capacidades",
        "Horarios",
        "Zonas",
        "Excepciones",
        "Políticas de visitas",
      ].every((label) => ui.includes(label)),
    "workspace administrativo incompleto",
  );
  assert.ok(
    inventory.categories.protectedSameOrigin.includes(
      "/api/personnel/policies",
    ),
    "ruta privada no inventariada",
  );
  assert.ok(
    contract.includes("EMPLOYEE_OVERRIDE") &&
      contract.includes("APPROVED_EXCEPTION") &&
      contract.includes("TENANT_POLICY") &&
      contract.includes("FAIL_CLOSED"),
    "precedencia ausente",
  );
  assert.doesNotMatch(
    `${domain}\n${scheduling}`,
    /role\s*===\s*["'](?:A|V)["'][\s\S]{0,80}CAN_PERFORM/u,
    "rol usado como capacidad",
  );
  return {
    models: 10,
    route: "/api/personnel/policies",
    specialDays: true,
    productionApiEnabled: false,
  };
}
if (
  process.argv[1] &&
  import.meta.url ===
    new URL(`file:///${process.argv[1].replaceAll("\\", "/")}`).href
)
  console.log("V17-PERSONNEL-POLICIES-GUARD", validatePersonnelPoliciesGuard());
