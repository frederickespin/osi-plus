import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATION = "prisma/migrations/20260904010000_v17_services_tenant_first/migration.sql";
function fail(message) { throw new Error(`V17_SERVICES_TENANT_FIRST_GUARD:${message}`); }
function read(root, overrides, path) { return overrides[path] ?? readFileSync(resolve(root, path), "utf8"); }
function need(source, pattern, message) { if (!pattern.test(source)) fail(message); }

export function validateV17ServicesTenantFirst({ root = process.cwd(), overrides = {} } = {}) {
  const schema = read(root, overrides, "prisma/schema.prisma");
  const migration = read(root, overrides, MIGRATION);
  const api = read(root, overrides, "api/_lib/crmServicesApiDomain.js");
  const contract = read(root, overrides, "api/_lib/crmServicesContract.js");
  const http = read(root, overrides, "api/_lib/crmServicesHttp.js");
  const rbac = read(root, overrides, "api/_lib/rbac.js");
  const panel = read(root, overrides, "src/crm-services/ServiceCasePanel.tsx");
  const mode = read(root, overrides, "src/crm-services/mode.ts");
  const detail = read(root, overrides, "src/commercial-crm/CommercialCaseDetail.tsx");

  for (const model of ["ServiceCatalogItem", "ServiceCatalogCompatibility", "ServiceDefaultCombination", "PipelineCaseServiceRevision", "PipelineCaseServiceItem", "ServiceMutationCommand"]) need(schema, new RegExp(`model ${model} \\{`), `falta ${model}`);
  const catalogModel = schema.match(/model ServiceCatalogItem \{[^}]*\}/)?.[0] ?? "";
  need(catalogModel, /serviceRef[\s\S]*tenantId[\s\S]*@@unique\(\[tenantId, serviceRef\]/, "catálogo no es tenant-first");
  if (/serviceRef\s+String\s+@id/.test(schema)) fail("serviceRef reemplaza la PK interna");
  need(schema, /model PipelineCaseServiceRevision[\s\S]*@@unique\(\[tenantId, pipelineCaseId, revision\]/, "historial no versiona por caso/tenant");
  need(migration, /pipeline_case_service_items_one_primary_key/, "no se impide más de un principal por revisión");
  need(migration, /CREATE TRIGGER "case_service_revision_immutable" BEFORE UPDATE OR DELETE ON "osi"\."pipeline_case_service_revisions"/, "snapshots no son inmutables");
  need(migration, /CREATE TRIGGER "case_service_item_immutable" BEFORE UPDATE OR DELETE ON "osi"\."pipeline_case_service_items"/, "ítems históricos no son inmutables");
  need(migration, /service_catalog_identity_immutable/, "serviceRef/código no son inmutables");
  need(migration, /service_catalog_compatibilities_primary_fkey[\s\S]*\("tenant_id", "primary_service_id"\)/, "compatibilidad omite tenant");
  need(migration, /classification_status[\s\S]*'PENDING'/, "Otro no queda pendiente de clasificación");
  if (/service_catalog_items[\s\S]{0,160}\bINSERT\s+INTO/i.test(migration)) fail("la migración inventa un seed productivo");

  need(api, /resolveActor|async function actor/, "API no revalida actor");
  need(api, /m\."tenant_id"=\$\{tenantId\} AND m\."id"=\$\{membershipId\} AND m\."user_id"=\$\{userId\}/, "AuthorizationContext no liga Tenant/Membership/User");
  need(api, /denied\.has\(permission\)[\s\S]*!effective\.has\(permission\)/, "deniedPermissions no prevalece");
  need(api, /const where = \{ tenantId: who\.tenantId, publicRef: serviceRef\(ref\)/, "caso no se resuelve por tenant + caseRef");
  need(api, /compatibleModes\.includes\(pipelineCase\.mode\)/, "modo ICP no gobierna compatibilidad");
  need(api, /pipelineCaseServiceRevision\.create[\s\S]*pipelineCaseServiceItem\.createMany/, "selección no crea snapshot append-only");
  need(api, /appendCommercialAudit[\s\S]*serviceMutationCommand\.create/, "mutaciones no comparten auditoría/idempotencia");
  if (/serviceCatalogItem\.delete\s*\(/.test(api)) fail("se habilitó borrado destructivo del catálogo");
  if (/clientName|tenantId:\s*input|actorUserId:\s*input|role:\s*input/.test(contract)) fail("contrato acepta autoridad legacy o de cliente");

  for (const permission of ["services:catalog:view", "services:catalog:manage", "services:case:view", "services:case:update"]) if (!rbac.includes(permission)) fail(`falta permiso ${permission}`);
  need(rbac, /EXPLICIT_SERVICE_PERMISSIONS[\s\S]*!EXPLICIT_SERVICE_PERMISSIONS\.has\(permission\)/, "roles baseline conceden Servicios");
  need(http, /resolveCrmServicesApiMode\(env, req\); sameOrigin\(req\);[\s\S]*resolveContext[\s\S]*readJsonObject/, "gate/origin/auth/body fuera de orden");
  if (/PRODUCTION_(?:READ|WRITE|PILOT)/.test(http) || /PRODUCTION_(?:READ|WRITE|PILOT)/.test(mode)) fail("Servicios habilita Production");
  need(mode, /return preview \? value : CRM_SERVICES_UI_MODES\.DISABLED/, "frontend no falla cerrado");
  need(panel, /Modo \/ Alcance[\s\S]*Necesidad principal[\s\S]*Servicios asociados al caso/, "orden visual aprobado ausente");
  need(panel, /<input\s+readOnly\s+value=\{MODE_LABEL\[workspace\.mode\]\}/, "Servicios permite alterar el modo del caso");
  need(panel, /window\.confirm\([\s\S]*Cambiar la necesidad principal/, "cambio de necesidad principal pierde decisiones sin confirmar");
  need(panel, /Plan vigente V[\s\S]*Historial del plan[\s\S]*workspace\.planHistory\.map[\s\S]*Guardar Plan V/, "plan de servicios versionado no es visible");
  need(panel, /Agregar desde el catálogo[\s\S]*availableCatalog\.map[\s\S]*addCatalogService/, "Servicios asociados no se seleccionan desde el catálogo compatible");
  need(panel, /<table aria-labelledby="selected-services-heading"[\s\S]*selectedCatalogServices\.map[\s\S]*Según tarifario[\s\S]*removeCatalogService/, "selección no se presenta como listado compacto editable");
  need(detail, /const canViewCosts = costingEnabled && costingAccess\.canView;[\s\S]*const costs = canViewCosts && item &&[\s\S]*<CostingPanel[\s\S]*onContinueToProposals=\{canViewQuote \? openProposals : undefined\}/, "se perdió el acceso autorizado a los costos y el paso a propuestas");
  need(detail, /canViewQuote && \(activeTab === "QUOTE"[\s\S]*<CaseProposals[\s\S]*canAuthorizeMargin=\{costingAccess\.canAuthorizeMargin\}/, "Cotización debe conservar su propio permiso y la autorización de margen");
  need(panel, /id: "plan", label: "Plan"[\s\S]*if \(intake\?\.addresses\)[^\n]*label: "Direcciones"[\s\S]*if \(storageSelected\)[^\n]*label: "Movimientos"[\s\S]*if \(canViewConfiguration\)[^\n]*label: "Configuración"[\s\S]*if \(intake\?\.costs\)[^\n]*label: "Costos internos"/, "las áreas del plan no respetan su disponibilidad");
  need(panel, /role="tablist"[\s\S]*aria-selected=\{activeStage === stage\.id\}[\s\S]*activeStage === stage\.id \? "bg-\[#003366\] text-white/, "pestañas compactas no resaltan la pantalla activa");
  need(panel, /id="storage-addresses-panel"[\s\S]*hidden=\{activeStage !== "addresses"\}[\s\S]*intake\.addresses/, "Direcciones debe tener su propia pantalla");
  need(panel, /id="storage-costs-panel"[\s\S]*hidden=\{activeStage !== "costs"\}[\s\S]*activeStage === "costs" && intake\.costs/, "Costos internos debe tener su propia pantalla");
  need(panel, /storageSelected && <div id="storage-movements-panel"[\s\S]*hidden=\{activeStage !== "movements"\}[\s\S]*activeView="authorization"/, "los movimientos de almacenaje deben abrirse en su propia pantalla");
  need(detail, /\["CONTRACT", "Contrato", FileText\][\s\S]*activeTab === "CONTRACT"[\s\S]*ContractCasePanel/, "Contrato no está separado como pantalla principal del caso");
  need(detail, /activeTab === "SERVICES" && servicesEnabled[\s\S]*ServiceCasePanel/, "UI carga Servicios sin autorización previa");

  const forbiddenDomain = ["estimatedCbm", "requiresSurvey", "surveyMethod", "QuoteLineItem", "unitPrice", "cost"].filter((term) => new RegExp(`\\b${term}\\b`, "i").test(api + contract));
  if (forbiddenDomain.length) fail(`Servicios absorbió ICP/Survey/Costing/Quote: ${forbiddenDomain.join(",")}`);
  return Object.freeze({ ok: true, migration: "20260904010000_v17_services_tenant_first", migrationSha256: createHash("sha256").update(Buffer.from(migration, "utf8")).digest("hex"), productionApiEnabled: false, runtimeConsumers: 4, effectiveProductionConsumers: 0, previewConsumers: 1 });
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(validateV17ServicesTenantFirst(), null, 2)}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`); process.exitCode = 1; }
}
