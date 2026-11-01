import type { HubApplication } from "@/hub/appCatalog";

export type WarehouseSectionId = "spaces" | "materials" | "equipment";

export type WarehouseSection = Readonly<{
  id: WarehouseSectionId;
  label: string;
  route: string;
  permissions: readonly string[];
}>;

// Every permission within a section is required. Sections are independent.
export const WAREHOUSE_SECTIONS: readonly WarehouseSection[] = Object.freeze([
  { id: "spaces", label: "Espacios y ubicaciones", route: "/warehouses/spaces", permissions: ["inventory:stock:view"] },
  { id: "materials", label: "Materiales de embalaje", route: "/warehouses/materials", permissions: ["inventory:catalog:view", "inventory:stock:view"] },
  { id: "equipment", label: "Herramientas y equipos", route: "/warehouses/equipment", permissions: ["assets:instance:view"] },
]);

export function warehouseSectionFromRoute(pathname: string) {
  return WAREHOUSE_SECTIONS.find((section) => section.route === pathname) ?? null;
}

export function isWarehouseSectionAllowed(
  section: WarehouseSection,
  effectivePermissions: readonly string[] | null,
  deniedPermissions: readonly string[],
) {
  const effective = new Set(effectivePermissions || []);
  const denied = new Set(deniedPermissions);
  return section.permissions.every((permission) => effective.has(permission) && !denied.has(permission));
}

export function availableWarehouseSections(
  enabled: Readonly<Record<WarehouseSectionId, boolean>>,
  effectivePermissions: readonly string[] | null,
  deniedPermissions: readonly string[],
) {
  return WAREHOUSE_SECTIONS.filter((section) => enabled[section.id]
    && isWarehouseSectionAllowed(section, effectivePermissions, deniedPermissions));
}

/** Group launchers only after the Hub has authorized and enabled each application. */
export function groupWarehouseLaunchers(
  applications: readonly HubApplication[],
  sections: readonly WarehouseSection[],
) {
  if (!applications.some((application) => application.appId === "warehouses")) return applications;
  return applications.filter((application) => !(
    application.appId === "materials-equipment" && sections.some((section) => section.id === "materials")
    || application.appId === "tools-equipment" && sections.some((section) => section.id === "equipment")
  ));
}
