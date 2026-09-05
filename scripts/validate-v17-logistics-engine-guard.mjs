import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const read = (path) => readFileSync(path, "utf8");
export function validateLogisticsEngineGuard(overrides = {}) {
  const source = (path) => overrides[path] ?? read(path);
  const schema = source("prisma/schema.prisma"); const migration = source("prisma/migrations/20260908010000_v17_logistics_engine/migration.sql"); const domain = source("api/_lib/logisticsEngineDomain.js"); const contract = source("api/_lib/logisticsEngineContract.js"); const http = source("api/_lib/logisticsEngineHttp.js"); const rbac = source("api/_lib/rbac.js"); const detail = source("src/commercial-crm/CommercialCaseDetail.tsx"); const admin = source("src/admin-tenant/AdminTenantMembershipModule.tsx"); const env = source(".env.example");
  for (const model of ["LogisticsRule", "LogisticsCalculation", "LogisticsPlan", "LogisticsPlanRevision", "LogisticsPlanItem", "LogisticsPlanIssue", "LogisticsPlanOverride", "LogisticsMutationCommand"]) assert.match(schema, new RegExp(`model ${model}\\b`), `${model} ausente`);
  assert.match(migration, /logistics_revisions_append_only/); assert.match(migration, /logistics_items_append_only/); assert.match(migration, /logistics_rules_no_equal_conflict/); assert.match(migration, /logistics_issues_resolution_only/);
  assert.match(domain, /tenantId: context\.tenantId[\s\S]*publicRef: caseRef/); assert.match(domain, /ownerMembershipId: context\.membershipId[\s\S]*ownerUserId: context\.userId/); assert.match(domain, /LOGISTICS_INPUT_STALE/); assert.match(domain, /pg_advisory_xact_lock/); assert.match(domain, /SurveyPublication[\s\S]*MaterialRequirementSnapshot|surveyPublication[\s\S]*materialRequirement/);
  assert.doesNotMatch(domain, /context\.(?:tenantId|userId|membershipId)\s*=|raw\.(?:tenantId|actor|role)/); assert.match(contract, /LOGISTICS_COMMERCIAL_VALUE_FORBIDDEN/); assert.match(contract, /LOGISTICS_RULE_CONFLICT/);
  assert.match(http, /DISABLED:[\s\S]*LOCAL_ONLY:[\s\S]*PREVIEW_REHEARSAL:/); assert.doesNotMatch(http, /PRODUCTION_(?:READ|WRITE|PILOT)/); assert.match(http, /prepareLogisticsRequest\(req, res, env\)[\s\S]*resolveContext[\s\S]*readJsonObject/); assert.match(env, /LOGISTICS_ENGINE_API_MODE="DISABLED"/); assert.match(env, /VITE_LOGISTICS_ENGINE_UI_MODE="DISABLED"/);
  for (const permission of ["logistics:plan:view", "logistics:plan:calculate", "logistics:plan:publish", "logistics:rules:view", "logistics:rules:manage"]) assert.match(rbac, new RegExp(permission));
  assert.match(rbac, /const EXPLICIT_LOGISTICS_PERMISSIONS = new Set\(\[/);
  assert.match(rbac, /!EXPLICIT_LOGISTICS_PERMISSIONS\.has\(permission\)/);
  assert.match(detail, /const LogisticsPlanPanel = lazy/); assert.match(detail, /logisticsEnabled && logisticsAccess\.canView/); assert.match(admin, /const LogisticsRulesAdmin = lazy/); assert.match(admin, /canRulesView/);
  assert.doesNotMatch(source("src/logistics-engine/LogisticsPlanPanel.tsx"), /localStorage|sessionStorage|quote|margin|markup/i);
  const inventory = JSON.parse(source("scripts/protected-cors-route-inventory.json")); for (const route of ["/api/logistics/plans/[caseRef]", "/api/logistics/plans/calculate", "/api/logistics/plans/publish", "/api/logistics/plans/overrides", "/api/logistics/plans/issues/resolve", "/api/logistics/rules"]) assert.ok(inventory.categories.protectedSameOrigin.includes(route), `CORS no inventaría ${route}`);
  return Object.freeze({ ok: true, models: 8, routes: 6, permissions: 8, productionApiEnabled: false, migrationSha256: createHash("sha256").update(Buffer.from(migration)).digest("hex") });
}
if (import.meta.url === `file:///${process.argv[1]?.replaceAll("\\", "/")}`) process.stdout.write(JSON.stringify(validateLogisticsEngineGuard()) + "\n");
