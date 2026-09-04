import type { UserRole } from "@/types/osi.types";

export type HubAppId =
  | "commercial-crm"
  | "coordination"
  | "operations"
  | "materials-equipment"
  | "tools-equipment"
  | "workshop"
  | "administration"
  | "human-resources"
  | "osi-survey";

export type HubIconId = "briefcase" | "route" | "truck" | "warehouse" | "hammer" | "settings" | "users" | "clipboard";
export type HubAppStatus = "REGISTERED_INACTIVE" | "PLANNED";
export type HubMobileAvailability = "RESPONSIVE" | "MOBILE_PRIMARY" | "DESKTOP_PRIMARY";

export type HubApplication = Readonly<{
  appId: HubAppId;
  name: string;
  description: string;
  icon: HubIconId;
  route: string;
  routeAliases?: readonly string[];
  status: HubAppStatus;
  requiredPermissions: readonly string[];
  permissionMode: "ANY" | "ALL";
  requiresExplicitPermissions?: boolean;
  baselineRoles: readonly UserRole[];
  mobileAvailability: HubMobileAvailability;
  directAccessAllowed: boolean;
  lazy: true;
}>;

export const HUB_APPLICATIONS: readonly HubApplication[] = Object.freeze([
  { appId: "commercial-crm", name: "Comercial y CRM", description: "Clientes, oportunidades y continuidad comercial.", icon: "briefcase", route: "/commercial", routeAliases: ["/crm", "/sales/pipeline"], status: "REGISTERED_INACTIVE", requiredPermissions: ["pipeline:view"], permissionMode: "ALL", requiresExplicitPermissions: true, baselineRoles: ["A", "V"], mobileAvailability: "RESPONSIVE", directAccessAllowed: true, lazy: true },
  { appId: "coordination", name: "Coordinación", description: "Planificación, proyectos y seguimiento operativo.", icon: "route", route: "/coordination", status: "REGISTERED_INACTIVE", requiredPermissions: ["projects:view", "ops:view"], permissionMode: "ANY", baselineRoles: ["A", "K"], mobileAvailability: "RESPONSIVE", directAccessAllowed: true, lazy: true },
  { appId: "operations", name: "Operaciones", description: "Servicios, despacho, supervisión, choferes y control de acceso.", icon: "truck", route: "/operations", status: "REGISTERED_INACTIVE", requiredPermissions: ["ops:view", "osi:view", "security:view"], permissionMode: "ANY", baselineRoles: ["A", "B", "C1", "D", "PE", "N", "E", "G"], mobileAvailability: "RESPONSIVE", directAccessAllowed: true, lazy: true },
  { appId: "materials-equipment", name: "Materiales e Inventario", description: "Consumibles, recetas, reservas, entradas y salidas trazables.", icon: "warehouse", route: "/materials", status: "REGISTERED_INACTIVE", requiredPermissions: ["inventory:catalog:view", "inventory:stock:view"], permissionMode: "ALL", requiresExplicitPermissions: true, baselineRoles: [], mobileAvailability: "RESPONSIVE", directAccessAllowed: true, lazy: true },
  { appId: "tools-equipment", name: "Herramientas y Equipos", description: "Activos reutilizables, disponibilidad, custodia y mantenimiento.", icon: "hammer", route: "/assets", status: "REGISTERED_INACTIVE", requiredPermissions: ["assets:instance:view"], permissionMode: "ALL", requiresExplicitPermissions: true, baselineRoles: [], mobileAvailability: "RESPONSIVE", directAccessAllowed: true, lazy: true },
  { appId: "workshop", name: "Taller y Carpintería", description: "Órdenes, cajas, instalación y mantenimiento.", icon: "hammer", route: "/workshop", status: "REGISTERED_INACTIVE", requiredPermissions: ["wms:view", "fleet:view", "osi:view"], permissionMode: "ANY", baselineRoles: ["A", "PA", "PB", "PC", "PD", "PF"], mobileAvailability: "RESPONSIVE", directAccessAllowed: true, lazy: true },
  { appId: "administration", name: "Administración", description: "Acceso, roles y permisos del tenant.", icon: "settings", route: "/administration", status: "REGISTERED_INACTIVE", requiredPermissions: ["membership:view"], permissionMode: "ALL", requiresExplicitPermissions: true, baselineRoles: ["A"], mobileAvailability: "RESPONSIVE", directAccessAllowed: true, lazy: true },
  { appId: "human-resources", name: "Recursos Humanos", description: "Personal, indicadores y gestión laboral.", icon: "users", route: "/hr", status: "REGISTERED_INACTIVE", requiredPermissions: ["hr:view"], permissionMode: "ALL", baselineRoles: ["A", "I"], mobileAvailability: "RESPONSIVE", directAccessAllowed: true, lazy: true },
  { appId: "osi-survey", name: "OSi Survey", description: "Agenda, inventario observado y publicaciones inmutables.", icon: "clipboard", route: "/survey", status: "REGISTERED_INACTIVE", requiredPermissions: ["survey:assignment:view"], permissionMode: "ALL", requiresExplicitPermissions: true, baselineRoles: [], mobileAvailability: "MOBILE_PRIMARY", directAccessAllowed: true, lazy: true },
]);

const COMMERCIAL_CASE_ROUTE = /^\/commercial\/cases\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/;

export function commercialCaseRefFromRoute(pathname: string) {
  return COMMERCIAL_CASE_ROUTE.exec(pathname)?.[1] ?? null;
}

export function findHubApplicationByRoute(pathname: string) {
  if (commercialCaseRefFromRoute(pathname)) {
    return HUB_APPLICATIONS.find((application) => application.appId === "commercial-crm") ?? null;
  }
  return HUB_APPLICATIONS.find((application) => application.route === pathname || application.routeAliases?.includes(pathname)) ?? null;
}
