import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODELS = ["AssetModel", "AssetInstance", "AssetCodeCounter", "AssetCostVersion", "AssetMutationCommand", "AssetReservation", "AssetAssignment", "AssetInspection", "AssetIncident", "AssetMaintenanceRule", "AssetMaintenanceOrder", "AssetHistoryEvent", "ExternalResourceOffer", "ExternalResourceReservation"];
const ROUTES = ["models", "instances", "reservations", "assignments", "assignments/handout", "assignments/return", "inspections", "incidents", "maintenance", "costs", "external/offers", "external/reservations"];
function invariant(value, message) { if (!value) throw new Error(`V17_TOOLS_EQUIPMENT_GUARD: ${message}`); }
function load(root, path, overrides) { return overrides?.get(path) ?? readFileSync(resolve(root, path), "utf8"); }
export function validateToolsEquipmentGuard({ root = process.cwd(), overrides = new Map() } = {}) {
  const schema = load(root, "prisma/schema.prisma", overrides); const migration = load(root, "prisma/migrations/20260907010000_v17_tools_equipment/migration.sql", overrides); const domain = load(root, "api/_lib/toolsEquipmentDomain.js", overrides); const contract = load(root, "api/_lib/toolsEquipmentContract.js", overrides); const http = load(root, "api/_lib/toolsEquipmentHttp.js", overrides); const mode = load(root, "src/tools-equipment/mode.ts", overrides); const hub = load(root, "src/hub/HubWorkspace.tsx", overrides); const catalog = load(root, "src/hub/appCatalog.ts", overrides); const inventory = load(root, "scripts/protected-cors-route-inventory.json", overrides); const rbac = load(root, "api/_lib/rbac.js", overrides);
  for (const model of MODELS) invariant(new RegExp(`model ${model}\\s*\\{`, "u").test(schema), `modelo ${model} ausente`);
  const instance = schema.slice(schema.indexOf("model AssetInstance {"), schema.indexOf("model AssetCostVersion {"));
  invariant(/assetRef[\s\S]*@db\.Uuid/u.test(instance) && /@@unique\(\[tenantId, assetRef\]/u.test(instance), "assetRef tenant-first ausente");
  invariant(!/^\s*(?:available|availability)\s+Boolean/mu.test(instance), "booleano availability mutable introducido");
  invariant(/^\s*operationalStatus\s+AssetOperationalStatus\b/mu.test(instance) && /^\s*physicalCondition\s+AssetPhysicalCondition\b/mu.test(instance), "estado y condición no están separados");
  invariant(/^\s*currentLocation\s+MaterialLocation\?/mu.test(instance), "ubicación canónica de Materiales no reutilizada");
  const material = schema.slice(schema.indexOf("model MaterialCatalogItem {"), schema.indexOf("model MaterialUnitConversion {"));
  invariant(!/Asset|Tool|Equipment|Vehicle/u.test(material), "activos mezclados con catálogo consumible");
  const vehicle = schema.slice(schema.indexOf("model Vehicle {"), schema.indexOf("model VehicleEngineSettings {"));
  invariant(!/AssetInstance|assetRef/u.test(vehicle), "Vehicle fue convertido o duplicado como AssetInstance");
  invariant(/asset_reservations_no_active_overlap/u.test(migration) && /asset_assignments_one_active_per_instance_key/u.test(migration), "reserva o custodia concurrente sin constraint");
  invariant(/asset_lock_and_assert_reservation_interval/u.test(migration) && /asset_lock_and_assert_maintenance_interval/u.test(migration) && /ASSET_MAINTENANCE_CONFLICT/u.test(migration) && /ASSET_RESERVATION_CONFLICT/u.test(migration), "mantenimiento/reserva sin exclusión segura");
  invariant(/asset_history_events_append_only/u.test(migration) && /asset_inspections_append_only/u.test(migration) && /asset_commands_append_only/u.test(migration) && /asset_cost_versions_append_only/u.test(migration), "historial mutable");
  invariant(/asset_assert_serial_policy/u.test(migration) && /asset_code_counters/u.test(migration), "serial o código interno sin autoridad DB");
  invariant(!/\bMAX\s*\(/u.test(domain) && !/max\s*\+\s*1/iu.test(domain), "MAX+1 prohibido");
  invariant(!/localStorage|sessionStorage/u.test(domain + contract), "storage browser como autoridad");
  invariant(!/\.delete(?:Many)?\s*\(/u.test(domain), "borrado destructivo en dominio");
  invariant(!/costing|quoteLine|quotation/iu.test(domain), "Costing/Cotización implementado antes de autoridad");
  invariant(/resolveCrmPipelineContext/u.test(http) && /if \(!prepareToolsEquipmentRequest\(req, res, env\)\) return;[\s\S]*resolveContext\(req[\s\S]*readJsonObject\(req/u.test(http), "gate/AuthContext/body fuera de orden");
  invariant(/productionApiEnabled = false/u.test(http) && !/PRODUCTION[_A-Z]*\s*:/u.test(http + mode), "modo Production introducido");
  invariant(/DISABLED/u.test(mode) && /LOCAL_ONLY/u.test(mode) && /PREVIEW_REHEARSAL/u.test(mode), "matriz de modos incompleta");
  invariant(/const ToolsEquipmentApp = lazy/u.test(hub), "módulo no es lazy");
  const boundary = 'if (selected?.appId === "tools-equipment" && toolsEnabled && toolsAuthorized)';
  invariant(hub.includes(boundary) && hub.indexOf(boundary) < hub.indexOf("<ToolsEquipmentApp"), "autorización no precede lazy render");
  const app = catalog.slice(catalog.indexOf('{ appId: "tools-equipment"'), catalog.indexOf('{ appId: "workshop"'));
  invariant(/requiresExplicitPermissions: true/u.test(app) && /baselineRoles: \[\]/u.test(app) && /assets:instance:view/u.test(app), "Hub concede activos por rol baseline");
  const parsed = JSON.parse(inventory); const protectedRoutes = new Set(parsed.categories.protectedSameOrigin); for (const route of ROUTES) invariant(protectedRoutes.has(`/api/assets/${route}`), `ruta protegida no inventariada: ${route}`);
  invariant(/resourceAvailability/u.test(contract) && /kind === "VEHICLE"/u.test(contract) && /kind === "EXTERNAL_OFFER"/u.test(contract), "contrato común futuro incompleto");
  invariant(/providerReference/u.test(schema) && !/model AssetProvider/u.test(schema), "proveedor paralelo creado sin autoridad tenant-first");
  invariant(/const EXPLICIT_ASSET_PERMISSIONS/u.test(rbac) && /!EXPLICIT_ASSET_PERMISSIONS\.has\(permission\)/u.test(rbac) && /ASSETS_INSTANCE_VIEW: "assets:instance:view"/u.test(rbac), "permisos de activos no son grants explícitos");
  return Object.freeze({ ok: true, models: MODELS.length, routes: ROUTES.length, productionApiEnabled: false, vehicleSeparate: true, consumablesSeparate: true });
}
if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) { try { process.stdout.write(JSON.stringify(validateToolsEquipmentGuard()) + "\n"); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; } }
