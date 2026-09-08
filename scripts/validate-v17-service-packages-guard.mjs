import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const fail = (message) => { throw new Error(`V17_SERVICE_PACKAGES_GUARD: ${message}`); };
const read = (path, overrides = {}) => overrides[path] ?? readFileSync(resolve(root, path), "utf8");
const need = (text, expression, message) => { if (!expression.test(text)) fail(message); };

export function validateServicePackages(overrides = {}) {
  const schema = read("prisma/schema.prisma", overrides); const migration = read("prisma/migrations/20260915010000_v17_service_packages_resources/migration.sql", overrides); const domain = read("api/_lib/servicePackagesDomain.js", overrides); const contract = read("api/_lib/servicePackagesContract.js", overrides); const http = read("api/_lib/crmServicesHttp.js", overrides); const rbac = read("api/_lib/rbac.js", overrides); const access = read("src/crm-services/access.ts", overrides); const admin = read("src/crm-services/ServiceConfigurationAdmin.tsx", overrides); const panel = read("src/crm-services/ServiceCasePanel.tsx", overrides); const packageJson = read("package.json", overrides);
  for (const model of ["ServiceModeDefinition", "ServiceCatalogMode", "ServicePackage", "ServicePackageVersion", "ServicePackageVersionService", "ServicePackageRequirement", "ServiceMaterialPolicy", "ServiceMaterialPolicyVersion", "ServiceMaterialPolicyLine", "CaseServiceConfigurationRevision", "CaseServiceConfigurationItem", "ServiceConfigurationCommand", "ServiceConfigurationAuditEvent", "ServiceConfigurationConflict"]) need(schema, new RegExp(`model ${model}\\b`), `falta ${model}`);
  for (const relation of ["service_package_versions_package_fkey", "service_package_requirements_material_fkey", "service_package_requirements_asset_fkey", "service_package_requirements_capability_fkey", "case_service_configurations_case_fkey"]) need(migration, new RegExp(`CONSTRAINT "${relation}" FOREIGN KEY \\("tenant_id",`), `FK ${relation} no es tenant-first`);
  for (const invariant of ["service_package_version_services_primary_key", "service_package_versions_one_published_key", "service_material_policy_lines_values_check"]) need(migration, new RegExp(invariant), `falta invariante ${invariant}`);
  for (const fn of ["service_configuration_append_only", "service_configuration_version_guard"]) need(migration, new RegExp(`CREATE OR REPLACE FUNCTION "osi"\\."${fn}"`), `falta función ${fn}`);
  need(domain, /JOIN "osi"\."osi_users"[\s\S]*JOIN "osi"\."tenants"[\s\S]*denied\.has\(permission\)/, "AuthorizationContext no revalida User/Membership/Tenant o deny");
  need(domain, /CASE_OVERRIDE[\s\S]*COMMERCIAL_AGREEMENT[\s\S]*SERVICE_PACKAGE[\s\S]*SERVICE_MODE_DEFAULT[\s\S]*MANUAL_RESOLUTION/, "precedencia no es determinista");
  need(domain, /surveyPublication\.findFirst[\s\S]*pipelineCaseId/, "Survey no se resuelve tenant/case-first");
  need(domain, /pipelineCaseCommercialContextVersion\.findFirst[\s\S]*pricingAgreement/, "acuerdo comercial no se resuelve contra el caso");
  need(domain, /serviceConfigurationCommand\.create[\s\S]*serviceConfigurationAuditEvent\.create/, "mutación crítica sin comando y auditoría");
  need(domain, /resolveServiceConfigurationConflict[\s\S]*state: "RESOLVED"[\s\S]*CONFIGURATION_CONFLICT_RESOLVED/, "resolución de conflicto no es transaccional/auditada");
  need(contract, /exact\(input,[\s\S]*payloadHash/, "payloads no son cerrados"); need(contract, /SERVICE_PACKAGES_PAYLOAD_HASH_INVALID/, "servidor no recalcula payloadHash");
  for (const permission of ["services:packages:view", "services:packages:manage", "services:materials:view", "services:materials:manage", "services:case-config:view", "services:case-config:update"]) { if (!rbac.includes(permission) || !access.includes(permission)) fail(`falta permiso explícito ${permission}`); }
  need(http, /CRM_SERVICES_API_MODES[\s\S]*DISABLED[\s\S]*LOCAL_ONLY[\s\S]*PREVIEW_REHEARSAL/, "gate fail-closed ausente"); need(http, /CRM_SERVICES_DISABLED", 409/, "DISABLED no bloquea antes del contexto");
  need(admin, /Configuración de Servicios[\s\S]*Paquetes[\s\S]*Políticas de materiales/, "UI administrativa incompleta"); need(admin, /PERSONNEL[\s\S]*MATERIAL[\s\S]*ASSET[\s\S]*TRANSPORT[\s\S]*DURATION[\s\S]*CRATING/, "editor no separa recursos"); need(panel, /Configuración final del caso[\s\S]*override del caso[\s\S]*acuerdo comercial[\s\S]*paquete/, "workspace final/precedencia ausente");
  if (/useCasesStore|caseBridge|salesStore|localCaseCache|TemplateRepository/.test(`${domain}\n${admin}\n${panel}`)) fail("se reintrodujo autoridad legacy");
  if (/productionApiEnabled\s*[:=]\s*true/i.test(`${packageJson}\n${http}\n${admin}\n${panel}`)) fail("Production fue activada");
  if (/\b(?:70|30)\s*%/.test(`${domain}\n${contract}\n${admin}`)) fail("porcentaje empresarial hard-coded");
  if (/employeeId|vehicleId|licensePlate|stockQuantity/.test(`${contract}\n${domain}`)) fail("paquete asigna persona/vehículo/stock concreto");
  return Object.freeze({ models: 14, permissions: 6, productionApiEnabled: false });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) process.stdout.write(`${JSON.stringify({ ok: true, ...validateServicePackages() })}\n`);
