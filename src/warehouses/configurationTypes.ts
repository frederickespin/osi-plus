export type WarehouseAreaPurpose = "INTERNAL" | "CLIENT_STORAGE" | "MIXED";
export type WarehouseOperationalStatus = "ACTIVE" | "RESTRICTED" | "OUT_OF_SERVICE";
export type WarehouseAvailabilityRule = "CONDITION_BASED" | "BLOCKED";

export type WarehouseAreaUse = Readonly<{
  useRef: string;
  code: string;
  name: string;
  description: string | null;
  purpose: WarehouseAreaPurpose;
  status: "ACTIVE" | "INACTIVE";
  version: number;
  assignedLocationCount: number;
}>;

export type WarehouseLocationConfiguration = Readonly<{
  locationRef: string;
  warehouseRef: string;
  configRef: string | null;
  version: number;
  areaUseRef: string | null;
  characteristics: string | null;
  notes: string | null;
  operationalStatus: WarehouseOperationalStatus;
  availabilityRule: WarehouseAvailabilityRule;
  lastControlReason: string | null;
  effective: Readonly<{
    operationalStatus: WarehouseOperationalStatus;
    availabilityRule: WarehouseAvailabilityRule;
    canReceive: boolean;
    canDispatch: boolean;
    inherited: boolean;
    blockedBy: readonly Readonly<{ warehouseRef: string | null; locationRef: string | null; kind: "WAREHOUSE_INACTIVE" | "LOCATION_INACTIVE" | "OPERATIONAL_STATUS" | "DISPATCH_BLOCKED" | "HIERARCHY_INVALID"; value: string; reason: string | null }>[];
  }>;
}>;

export type WarehouseConfiguration = Readonly<{
  areaUses: readonly WarehouseAreaUse[];
  locations: readonly WarehouseLocationConfiguration[];
}>;

export const AREA_PURPOSE_LABELS: Readonly<Record<WarehouseAreaPurpose, string>> = {
  INTERNAL: "Uso interno", CLIENT_STORAGE: "Almacenamiento de clientes", MIXED: "Uso mixto",
};
export const OPERATIONAL_STATUS_LABELS: Readonly<Record<WarehouseOperationalStatus, string>> = {
  ACTIVE: "Activo", RESTRICTED: "Restringido", OUT_OF_SERVICE: "Fuera de servicio",
};
export const AVAILABILITY_RULE_LABELS: Readonly<Record<WarehouseAvailabilityRule, string>> = {
  CONDITION_BASED: "Según condición operativa", BLOCKED: "Despachos bloqueados",
};
