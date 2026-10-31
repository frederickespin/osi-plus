export type AdministrationSectionId = "access" | "fleet" | "services" | "logistics" | "costing" | "communications" | "policies";

export type AdministrationSection = Readonly<{
  id: AdministrationSectionId;
  label: string;
  route: string;
  permissions: readonly string[];
}>;

// These are independent entry points. A deny still removes that permission;
// it does not remove access to an unrelated administrative section.
export const ADMINISTRATION_SECTIONS: readonly AdministrationSection[] = Object.freeze([
  { id: "access", label: "Usuarios y roles", route: "/administration/access", permissions: ["membership:view"] },
  { id: "fleet", label: "Flota vehicular", route: "/administration/fleet", permissions: ["fleet:view"] },
  { id: "services", label: "Servicios y paquetes", route: "/administration/services", permissions: ["services:catalog:view", "services:packages:view", "services:materials:view"] },
  { id: "logistics", label: "Motor Logístico", route: "/administration/logistics", permissions: ["logistics:rules:view"] },
  { id: "costing", label: "Costos y monedas", route: "/administration/costing", permissions: ["costing:rules:view"] },
  { id: "communications", label: "Plantillas y comunicaciones", route: "/administration/communications", permissions: ["communications:templates:view"] },
  { id: "policies", label: "Políticas operativas", route: "/administration/policies", permissions: [
    "personnel:profiles:view", "personnel:capabilities:view", "scheduling:policies:view",
    "scheduling:exceptions:request", "scheduling:exceptions:approve", "scheduling:exceptions:respond",
  ] },
]);

export function administrationSectionFromRoute(pathname: string) {
  return ADMINISTRATION_SECTIONS.find((section) => section.route === pathname) ?? null;
}

export function availableAdministrationSections(
  enabled: Readonly<Record<AdministrationSectionId, boolean>>,
  effectivePermissions: readonly string[] | null,
  deniedPermissions: readonly string[],
) {
  const effective = new Set(effectivePermissions || []);
  const denied = new Set(deniedPermissions);
  return ADMINISTRATION_SECTIONS.filter((section) => enabled[section.id]
    && section.permissions.some((permission) => effective.has(permission) && !denied.has(permission)));
}
