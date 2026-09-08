import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

export function validateCommercialPreviewCorrections12cGuard(overrides = {}) {
  const source = (path) => overrides[path] ?? read(path);
  const detail = source("src/commercial-crm/CommercialCaseDetail.tsx");
  const overview = source("src/commercial-crm/CaseWorkflowOverview.tsx");
  const survey = source("src/survey/SurveyCasePanel.tsx");
  const summary = source("src/logistics-engine/LogisticsVisitSummary.tsx");
  const admin = source("src/admin-tenant/AdminTenantMembershipModule.tsx");
  const hub = source("src/hub/HubWorkspace.tsx");
  const catalog = source("src/hub/appCatalog.ts");
  const rules = source("src/logistics-engine/LogisticsRulesAdmin.tsx");
  const costing = source("src/costing/CostingPanel.tsx");
  const http = source("api/_lib/logisticsEngineHttp.js");

  const tabs = detail.slice(detail.indexOf("const TABS"), detail.indexOf("] as const") + 10);
  assert.doesNotMatch(tabs, /LOGISTICS|Motor Logístico/, "Motor no puede ser tab de Comercial");
  assert.doesNotMatch(detail, /LogisticsPlanPanel/, "Comercial no puede importar el workspace operativo del Motor");
  assert.doesNotMatch(overview, /onSelectTab\(["']LOGISTICS["']\)|Motor Logístico[^\n]*button/, "el resumen no puede abrir Motor manualmente");
  assert.match(tabs, /\["SUMMARY", "Resumen"[\s\S]*\["SERVICES", "Servicios"[\s\S]*\["SURVEY", "Evaluación"[\s\S]*\["COSTING", "Costos"[\s\S]*\["QUOTE", "Cotización"/, "flujo comercial consolidado ausente");
  assert.match(survey, /<LogisticsVisitSummary/);
  assert.match(survey, /logisticsApi\.plan\(authorization, caseRef\)/, "Evaluación debe leer la revisión publicada");
  assert.doesNotMatch(survey + summary, /logisticsApi\.(?:calculate|publish|versionRule)|calculateLogisticsPlan|ruleMatches/, "Evaluación no puede calcular ni administrar el Motor");
  assert.doesNotMatch(summary, /fetch\(|axios|XMLHttpRequest|localStorage|sessionStorage/, "el resumen debe ser presentacional");
  assert.doesNotMatch(costing, /logisticsApi\.(?:calculate|publish)|calculateLogisticsPlan|ruleMatches/, "Costos no puede duplicar fórmulas logísticas");
  assert.match(admin, /const LogisticsRulesAdmin = lazy/);
  assert.match(admin, /const logisticsAdminEnabled = isLogisticsUiEnabled\(\) && logisticsRulesAccess\.canRulesView/);
  assert.match(admin, /logisticsAdminEnabled && <Suspense/);
  assert.match(hub, /const LogisticsRulesAdmin = lazy/);
  assert.match(hub, /const logisticsAdminAvailable = isLogisticsUiEnabled\(\) && logisticsAccess\.canRulesView/);
  assert.match(hub, /selected\?\.appId === "administration" && logisticsAdminAvailable/);
  assert.match(hub, /adminMembershipAvailable \|\| logisticsAdminAvailable/);
  const administrationCatalog = catalog.slice(catalog.indexOf('appId: "administration"'), catalog.indexOf('appId: "human-resources"'));
  assert.match(administrationCatalog, /requiredPermissions: \[[^\]]*"membership:view"[^\]]*"logistics:rules:view"[^\]]*\]/);
  assert.match(administrationCatalog, /permissionMode: "ANY"/);
  assert.match(rules, /id="admin-logistics-engine"/);
  assert.match(rules, /Administración · Motor Logístico/);
  assert.doesNotMatch(http, /PRODUCTION_(?:READ|WRITE|PILOT)/, "12C no activa Production");
  const migrationCount = readdirSync("prisma/migrations", { withFileTypes: true }).filter((entry) => entry.isDirectory()).length;
  assert.equal(migrationCount, 33, "linaje consolidado debe conservar exactamente 33 migraciones");
  return Object.freeze({ ok: true, commercialMotorTabs: 0, adminLazyBoundary: true, independentAdminSurfaces: true, publishedResultOnly: true, productionApiEnabled: false, migrations: migrationCount });
}

if (import.meta.url === `file:///${process.argv[1]?.replaceAll("\\", "/")}`) process.stdout.write(`${JSON.stringify(validateCommercialPreviewCorrections12cGuard())}\n`);
