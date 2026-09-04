import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_MODELS = ["MaterialUnit", "MaterialCatalogItem", "MaterialUnitConversion", "MaterialCostVersion", "MaterialSupplierReference", "MaterialWarehouse", "MaterialLocation", "MaterialInventoryCommand", "MaterialInventoryMovement", "MaterialReservation", "MaterialReservationEvent", "PackingRecipe", "PackingRecipeVersion", "PackingRecipeLine", "MaterialRequirementSnapshot", "MaterialRequirementLine", "MaterialPurchaseRequest"];
function invariant(value, message) { if (!value) throw new Error(`V17_MATERIALS_INVENTORY_GUARD: ${message}`); }
function load(root, path, overrides) { return overrides?.get(path) ?? readFileSync(resolve(root, path), "utf8"); }
export function validateMaterialsInventoryGuard({ root = process.cwd(), overrides = new Map() } = {}) {
  const schema = load(root, "prisma/schema.prisma", overrides); const migration = load(root, "prisma/migrations/20260906010000_v17_materials_inventory/migration.sql", overrides);
  const contract = load(root, "api/_lib/materialsInventoryContract.js", overrides); const domain = load(root, "api/_lib/materialsInventoryDomain.js", overrides); const http = load(root, "api/_lib/materialsInventoryHttp.js", overrides);
  const mode = load(root, "src/materials-inventory/mode.ts", overrides); const hub = load(root, "src/hub/HubWorkspace.tsx", overrides); const catalog = load(root, "src/hub/appCatalog.ts", overrides); const survey = load(root, "src/survey/SurveyApp.tsx", overrides);
  for (const model of REQUIRED_MODELS) invariant(new RegExp(`model ${model}\\s*\\{`, "u").test(schema), `modelo ${model} ausente`);
  const materialModel = schema.slice(schema.indexOf("model MaterialCatalogItem {"), schema.indexOf("model MaterialUnitConversion {"));
  invariant(!/^\s*quantity\s+/mu.test(materialModel), "cantidad mutable introducida en catálogo");
  invariant(/@@unique\(\[tenantId, materialRef\]/u.test(schema) && /@@unique\(\[tenantId, warehouseRef\]/u.test(schema) && /@@unique\(\[tenantId, locationRef\]/u.test(schema), "referencias tenant-first incompletas");
  invariant(/material_inventory_movements_append_only/u.test(migration) && /material_reservation_events_append_only/u.test(migration) && /material_requirement_lines_append_only/u.test(migration), "append-only incompleto");
  invariant(/material_cost_versions_one_current_idx/u.test(migration) && /packing_recipe_versions_one_active_idx/u.test(migration), "versionado canónico incompleto");
  invariant(/material_locations_parent_guard/u.test(migration) && /material_inventory_movements_quantity_check/u.test(migration), "constraints físicos incompletos");
  invariant(!/\bMAX\s*\(/u.test(domain) && !/max\s*\+\s*1/iu.test(domain), "generación MAX+1 prohibida");
  invariant(!/\b(?:unitCost|materialCost|hardCodedCost)\s*=\s*\d/iu.test(domain), "costo hard-coded introducido");
  invariant(!/materialCatalogItem\.findFirst\(\{\s*where:\s*\{\s*(?:name|materialRef)/u.test(domain), "catálogo resuelto sin tenant o por nombre");
  invariant(!/localStorage|sessionStorage/u.test(domain + contract), "storage browser como autoridad");
  invariant(!/\.delete(?:Many)?\s*\(/u.test(domain), "borrado destructivo en dominio");
  invariant(/pg_advisory_xact_lock/u.test(domain) && /Serializable/u.test(domain) && /MATERIALS_NEGATIVE_STOCK_FORBIDDEN/u.test(domain), "concurrencia o stock negativo sin protección");
  invariant(/resolveCrmPipelineContext/u.test(http) && /resolveMaterialsApiMode\(env, req\); assertSameOrigin\(req\)/u.test(http) && /if \(!prepareMaterialsRequest\(req, res, env\)\) return;[\s\S]*resolveContext\(req[\s\S]*readJsonObject\(req/u.test(http), "gate/AuthContext/body fuera de orden");
  invariant(!/PRODUCTION/u.test(Object.values(JSON.parse(JSON.stringify({ mode }))).join("")) || !/PRODUCTION[_A-Z]*\s*:/u.test(mode), "modo Production introducido");
  invariant(/DISABLED/u.test(mode) && /LOCAL_ONLY/u.test(mode) && /PREVIEW_REHEARSAL/u.test(mode), "matriz de modos cerrada incompleta");
  invariant(/const MaterialsInventoryApp = lazy/u.test(hub) && /if \(selected\?\.appId === "materials-equipment" && materialsEnabled\)/u.test(hub) && hub.indexOf("if (selected?.appId === \"materials-equipment\" && materialsEnabled)") < hub.indexOf("<MaterialsInventoryApp"), "lazy boundary de inventario no autorizada");
  const materialApp = catalog.slice(catalog.indexOf('{ appId: "materials-equipment"'), catalog.indexOf('{ appId: "workshop"'));
  invariant(/requiresExplicitPermissions: true/u.test(materialApp) && /baselineRoles: \[\]/u.test(materialApp) && /inventory:catalog:view/u.test(materialApp) && /inventory:stock:view/u.test(materialApp), "catálogo Hub concede acceso implícito");
  invariant(/El evaluador no selecciona materiales/u.test(survey) && !/materialRef|materialId/u.test(survey), "Survey selecciona materiales manualmente");
  invariant(/resolveRecipeQuantity/u.test(contract) && /surveyPublication.*recipeVersion/u.test(domain), "resolución Survey→receta ausente");
  invariant(/export async function createRecipeVersion\(/u.test(domain) && /RECIPE_VERSION_ACTIVATE/u.test(contract), "versionado administrable de receta ausente");
  invariant(/export async function assignReservation\(/u.test(domain) && /RESERVED[\s\S]*ASSIGNED/u.test(domain), "asignación explícita ausente");
  invariant(/export async function transitionPurchaseRequest\(/u.test(domain) && /purchaseRequestId/u.test(schema) && /movementType: "RECEIPT"/u.test(domain), "compra aprobada no genera recepción trazable");
  invariant(!/AssetInstance|maintenance|vehicleId/iu.test(schema.slice(schema.indexOf("model MaterialUnit"), schema.indexOf("model CatalogMaterial"))), "herramientas/equipos mezclados con consumibles");
  return Object.freeze({ ok: true, models: REQUIRED_MODELS.length, productionApiEnabled: false, tenantFirst: true, appendOnly: true });
}
if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) { try { process.stdout.write(JSON.stringify(validateMaterialsInventoryGuard()) + "\n"); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; } }
