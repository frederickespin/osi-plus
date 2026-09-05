import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(path, "utf8");

export function validateCostingGuard(overrides = {}) {
  const source = (path) => overrides[path] ?? read(path);
  const schema = source("prisma/schema.prisma");
  const migration = source("prisma/migrations/20260909010000_v17_costing/migration.sql");
  const domain = source("api/_lib/costingDomain.js");
  const contract = source("api/_lib/costingContract.js");
  const http = source("api/_lib/costingHttp.js");
  const rbac = source("api/_lib/rbac.js");
  const detail = source("src/commercial-crm/CommercialCaseDetail.tsx");
  const admin = source("src/admin-tenant/AdminTenantMembershipModule.tsx");
  const panel = source("src/costing/CostingPanel.tsx");
  const env = source(".env.example");
  for (const model of ["CostingRule", "CostingExchangeRate", "CostingCalculation", "CostingRevision", "CostingLine", "CostingIssue", "CostingOverride", "CostingMarginAuthorization", "CostingMutationCommand"]) assert.match(schema, new RegExp(`model ${model}\\b`), `${model} ausente`);
  for (const marker of ["costing_calculations_append_only", "costing_revisions_append_only", "costing_lines_append_only", "costing_overrides_append_only", "costing_rules_no_equal_conflict", "costing_exchange_rates_no_overlap", "costing_issues_resolution_only"]) assert.match(migration, new RegExp(marker));
  assert.match(domain, /tenantId: context\.tenantId, publicRef: caseRef/);
  assert.match(domain, /ownerMembershipId: context\.membershipId[\s\S]*ownerUserId: context\.userId/);
  assert.match(domain, /status: "PUBLISHED"[\s\S]*logisticsPlanRevision/);
  assert.match(domain, /COSTING_INPUT_STALE/);
  assert.match(domain, /pg_advisory_xact_lock/);
  assert.match(domain, /MaterialCostVersion|costVersionRef/);
  assert.match(domain, /AssetCostVersion|costVersions/);
  assert.match(domain, /contractualReference/);
  assert.doesNotMatch(domain, /raw\.(?:tenantId|actor|role|userId|membershipId)/);
  assert.doesNotMatch(domain, /quoteOperationalCost|quotedPrice|DisenaCotiza|useCasesStore|localStorage|sessionStorage/);
  assert.match(contract, /PROVIDER_PRICE_PENDING/); assert.match(contract, /CURRENCY_RATE_MISSING/); assert.match(contract, /MARGIN_POLICY_MISSING/);
  assert.match(contract, /classification === "PR"/); assert.match(contract, /classification === "EX"/); assert.match(contract, /classification === "DE"/);
  assert.match(contract, /costAuthorityHash/); assert.match(contract, /logisticsSnapshot/);
  assert.match(http, /DISABLED:[\s\S]*LOCAL_ONLY:[\s\S]*PREVIEW_REHEARSAL:/);
  assert.doesNotMatch(http, /PRODUCTION_(?:READ|WRITE|PILOT)/);
  assert.match(http, /prepareCostingRequest\(req, res, env\)[\s\S]*resolveContext[\s\S]*readJsonObject/);
  assert.match(env, /COSTING_ENGINE_API_MODE="DISABLED"/); assert.match(env, /VITE_COSTING_UI_MODE="DISABLED"/);
  for (const permission of ["costing:view", "costing:calculate", "costing:publish", "costing:override", "costing:authorize-margin", "costing:rules:view", "costing:rules:manage"]) assert.match(rbac, new RegExp(permission));
  assert.match(rbac, /EXPLICIT_COSTING_PERMISSIONS/); assert.match(rbac, /!EXPLICIT_COSTING_PERMISSIONS\.has\(permission\)/);
  assert.match(detail, /const CostingPanel = lazy/); assert.match(detail, /costingEnabled && costingAccess\.canView/);
  assert.match(admin, /const CostingRulesAdmin = lazy/); assert.match(admin, /costingEnabled && costingAccess\?\.canRulesView/);
  assert.doesNotMatch(panel, /quotedPrice|Cotización definitiva|localStorage|sessionStorage/);
  const inventory = JSON.parse(source("scripts/protected-cors-route-inventory.json"));
  for (const route of ["/api/costing/authorizations", "/api/costing/calculate", "/api/costing/exchange-rates", "/api/costing/issues/resolve", "/api/costing/overrides", "/api/costing/publish", "/api/costing/revisions/[caseRef]", "/api/costing/rules"]) assert.ok(inventory.categories.protectedSameOrigin.includes(route), `CORS no inventaría ${route}`);
  return Object.freeze({ ok: true, models: 9, routes: 8, families: 13, productionApiEnabled: false, migrationSha256: createHash("sha256").update(Buffer.from(migration)).digest("hex") });
}

if (import.meta.url === `file:///${process.argv[1]?.replaceAll("\\", "/")}`) process.stdout.write(JSON.stringify(validateCostingGuard()) + "\n");
