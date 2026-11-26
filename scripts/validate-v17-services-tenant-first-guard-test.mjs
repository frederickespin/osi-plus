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
  ["sin selector de catálogo", "src/crm-services/ServiceCasePanel.tsx", (s) => s.replace("Agregar desde el catálogo", "Agregar manualmente")],
  ["modo editable", "src/crm-services/ServiceCasePanel.tsx", (s) => s.replace("readOnly value={MODE_LABEL[workspace.mode]}", "value={MODE_LABEL[workspace.mode]}")],
  ["sin listado compacto", "src/crm-services/ServiceCasePanel.tsx", (s) => s.replace('<table aria-labelledby="selected-services-heading"', '<div aria-labelledby="selected-services-heading"')],
  ["costos sin permiso", "src/commercial-crm/CommercialCaseDetail.tsx", (s) => s.replace("const canViewCosts = costingEnabled && costingAccess.canView;", "const canViewCosts = costingEnabled;")],
  ["cotización sin control de margen", "src/commercial-crm/CommercialCaseDetail.tsx", (s) => s.replace("canAuthorizeMargin={costingAccess.canAuthorizeMargin}", "canAuthorizeMargin={true}")],
  ["configuración visible sin permiso", "src/crm-services/ServiceCasePanel.tsx", (s) => s.replace("if (canViewConfiguration) stages.push", "stages.push")],
  ["sin flujo guiado", "src/crm-services/ServiceCasePanel.tsx", (s) => s.replace('label: "Movimientos"', 'label: "Todo junto"')],
  ["sin pestaña activa", "src/crm-services/ServiceCasePanel.tsx", (s) => s.replace('bg-[#003366] text-white', 'bg-white text-slate-600')],
  ["sin pestaña de direcciones", "src/crm-services/ServiceCasePanel.tsx", (s) => s.replace('label: "Direcciones"', 'label: "Otra"')],
  ["costos siempre visibles", "src/crm-services/ServiceCasePanel.tsx", (s) => s.replace('hidden={activeStage !== "costs"}', 'hidden={false}')],
  ["movimientos siempre visibles", "src/crm-services/ServiceCasePanel.tsx", (s) => s.replace('hidden={activeStage !== "movements"}', 'hidden={false}')],
  ["contrato duplicado", "src/commercial-crm/CommercialCaseDetail.tsx", (s) => s.replace('activeTab === "CONTRACT"', 'activeTab === "SERVICES"')],
];
assert.equal(validateV17ServicesTenantFirst().ok, true);
for (const [name, path, mutate] of cases) {
  const original = read(path);
  const changed = mutate(original);
  assert.notEqual(changed, original, name + " debe modificar el código de referencia");
  let rejected = false;
  try { validateV17ServicesTenantFirst({ overrides: { [path]: changed } }); } catch { rejected = true; }
  assert.equal(rejected, true, name);
}
process.stdout.write(`${JSON.stringify({ ok: true, negatives: cases.length }, null, 2)}\n`);
