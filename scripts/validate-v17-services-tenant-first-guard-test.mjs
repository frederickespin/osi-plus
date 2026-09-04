import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateV17ServicesTenantFirst } from "./validate-v17-services-tenant-first-guard.mjs";

const read = (path) => readFileSync(path, "utf8");
const cases = [
  ["catálogo sin tenant", "prisma/schema.prisma", (s) => s.replace("@@unique([tenantId, serviceRef]", "@@unique([serviceRef]")],
  ["PK pública", "prisma/schema.prisma", (s) => s.replace(/serviceRef\s+String\s+@default/, "serviceRef String @id @default")],
  ["nombre como autoridad", "api/_lib/crmServicesContract.js", (s) => `${s}\nconst clientName = input.name;`],
  ["borrado destructivo", "api/_lib/crmServicesApiDomain.js", (s) => `${s}\nserviceCatalogItem.delete({});`],
  ["modo desde cliente", "api/_lib/crmServicesContract.js", (s) => `${s}\nconst unsafe = { tenantId: input.tenantId };`],
  ["costo", "api/_lib/crmServicesApiDomain.js", (s) => `${s}\nconst unitPrice = 1;`],
  ["volumen", "api/_lib/crmServicesApiDomain.js", (s) => `${s}\nconst estimatedCbm = 1;`],
  ["Survey", "api/_lib/crmServicesApiDomain.js", (s) => `${s}\nconst requiresSurvey = true;`],
  ["Cotización", "api/_lib/crmServicesApiDomain.js", (s) => `${s}\nconst QuoteLineItem = {};`],
  ["Production habilitada", "api/_lib/crmServicesHttp.js", (s) => `${s}\nconst PRODUCTION_WRITE = true;`],
  ["deny no prevalece", "api/_lib/crmServicesApiDomain.js", (s) => s.replace("denied.has(permission) || !effective.has(permission)", "!effective.has(permission)")],
  ["snapshot mutable", "prisma/migrations/20260904010000_v17_services_tenant_first/migration.sql", (s) => s.replace("BEFORE UPDATE OR DELETE ON \"osi\".\"pipeline_case_service_revisions\"", "BEFORE INSERT ON \"osi\".\"pipeline_case_service_revisions\"")],
  ["sin confirmación", "src/crm-services/ServiceCasePanel.tsx", (s) => s.replace("window.confirm", "Boolean")],
];
assert.equal(validateV17ServicesTenantFirst().ok, true);
for (const [name, path, mutate] of cases) {
  let rejected = false;
  try { validateV17ServicesTenantFirst({ overrides: { [path]: mutate(read(path)) } }); } catch { rejected = true; }
  assert.equal(rejected, true, name);
}
process.stdout.write(`${JSON.stringify({ ok: true, negatives: cases.length }, null, 2)}\n`);
