import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateToolsEquipmentGuard } from "./validate-v17-tools-equipment-guard.mjs";
const files = ["prisma/schema.prisma", "prisma/migrations/20260907010000_v17_tools_equipment/migration.sql", "api/_lib/toolsEquipmentDomain.js", "api/_lib/toolsEquipmentContract.js", "api/_lib/toolsEquipmentHttp.js", "api/_lib/rbac.js", "src/tools-equipment/mode.ts", "src/hub/HubWorkspace.tsx", "src/hub/appCatalog.ts", "scripts/protected-cors-route-inventory.json"];
const base = new Map(files.map((file) => [file, readFileSync(resolve(file), "utf8")]));
// Other models also contain operationalStatus; insert the forbidden field in
// AssetInstance itself so schema ordering cannot redirect this regression.
function addInstanceField(schema, field) { return schema.replace(/(^model AssetInstance\s*\{)/mu, `$1\n  ${field}`); }
const cases = [
  ["AssetModel ausente", "prisma/schema.prisma", (v) => v.replace("model AssetModel {", "model RemovedAssetModel {")],
  ["availability boolean", "prisma/schema.prisma", (v) => addInstanceField(v, "availability Boolean"), /V17_TOOLS_EQUIPMENT_GUARD: booleano availability mutable introducido/u],
  ["available boolean", "prisma/schema.prisma", (v) => addInstanceField(v, "available Boolean @default(false)"), /V17_TOOLS_EQUIPMENT_GUARD: booleano availability mutable introducido/u],
  ["estado/condición unidos", "prisma/schema.prisma", (v) => v.replace("physicalCondition", "removedCondition")],
  ["almacén duplicado", "prisma/schema.prisma", (v) => v.replace("currentLocation   MaterialLocation?", "currentLocation   DuplicatedAssetLocation?")],
  ["mezcla consumible", "prisma/schema.prisma", (v) => v.replace("model MaterialCatalogItem {", "model MaterialCatalogItem {\n  assetInstance AssetInstance?")],
  ["Vehicle duplicado", "prisma/schema.prisma", (v) => v.replace("model Vehicle {", "model Vehicle {\n  assetRef String?")],
  ["solapamiento", "prisma/migrations/20260907010000_v17_tools_equipment/migration.sql", (v) => v.replaceAll("asset_reservations_no_active_overlap", "removed_overlap")],
  ["doble custodia", "prisma/migrations/20260907010000_v17_tools_equipment/migration.sql", (v) => v.replaceAll("asset_assignments_one_active_per_instance_key", "removed_assignment")],
  ["conflicto mantenimiento", "prisma/migrations/20260907010000_v17_tools_equipment/migration.sql", (v) => v.replaceAll("ASSET_MAINTENANCE_CONFLICT", "REMOVED")],
  ["append-only", "prisma/migrations/20260907010000_v17_tools_equipment/migration.sql", (v) => v.replaceAll("asset_history_events_append_only", "removed_history")],
  ["MAX+1", "api/_lib/toolsEquipmentDomain.js", (v) => `${v}\nconst unsafe = MAX(value) + 1;`],
  ["storage", "api/_lib/toolsEquipmentDomain.js", (v) => `${v}\nlocalStorage.setItem('assets', 'x');`],
  ["delete", "api/_lib/toolsEquipmentDomain.js", (v) => `${v}\nprisma.assetInstance.delete({});`],
  ["gate tardía", "api/_lib/toolsEquipmentHttp.js", (v) => v.replace("if (!prepareToolsEquipmentRequest(req, res, env)) return;", "")],
  ["Production", "api/_lib/toolsEquipmentHttp.js", (v) => v.replace("PREVIEW_REHEARSAL: \"PREVIEW_REHEARSAL\"", "PREVIEW_REHEARSAL: \"PREVIEW_REHEARSAL\", PRODUCTION: \"PRODUCTION\"")],
  ["lazy directo", "src/hub/HubWorkspace.tsx", (v) => v.replace('toolsEnabled && toolsAuthorized', "toolsEnabled")],
  ["rol baseline", "src/hub/appCatalog.ts", (v) => v.replace(/(appId: "tools-equipment"[\s\S]*?)baselineRoles: \[\]/u, '$1baselineRoles: ["A"]')],
  ["ruta no inventariada", "scripts/protected-cors-route-inventory.json", (v) => v.replace('      "/api/assets/incidents",\r\n', "").replace('      "/api/assets/incidents",\n', "")],
  ["Vehicle fuera contrato", "api/_lib/toolsEquipmentContract.js", (v) => v.replace('if (resource.kind === "VEHICLE")', 'if (resource.kind === "REMOVED")')],
  ["permisos implícitos", "api/_lib/rbac.js", (v) => v.replace("&& !EXPLICIT_ASSET_PERMISSIONS.has(permission)", "")],
];
validateToolsEquipmentGuard();
for (const [name, file, mutate, expected = /V17_TOOLS_EQUIPMENT_GUARD/u] of cases) {
  const source = base.get(file); const mutated = mutate(source);
  assert.notEqual(mutated, source, `mutation did not change its fixture: ${name}`);
  const overrides = new Map(base); overrides.set(file, mutated);
  assert.throws(() => validateToolsEquipmentGuard({ overrides }), expected, name);
}
process.stdout.write(JSON.stringify({ ok: true, assertions: cases.length }) + "\n");
