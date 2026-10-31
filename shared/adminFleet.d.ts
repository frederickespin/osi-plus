export const ADMIN_FLEET_BATCH: "V17-ADMINISTRATION-FLEET-19D";
export const ADMIN_FLEET_MODES: Readonly<{ DISABLED: "DISABLED"; LOCAL_ONLY: "LOCAL_ONLY"; PREVIEW_REHEARSAL: "PREVIEW_REHEARSAL" }>;
export const ADMIN_FLEET_STATUSES: readonly ["AVAILABLE", "IN_USE", "UNAVAILABLE", "RETIRED"];
export const ADMIN_FLEET_WEIGHT_UNITS: readonly ["KG", "LB"];
export const ADMIN_FLEET_VOLUME_UNITS: readonly ["CBM", "CFT"];
export const ADMIN_FLEET_DIMENSION_UNITS: readonly ["M", "CM", "FT", "IN"];
export type AdminFleetStatus = typeof ADMIN_FLEET_STATUSES[number];
export interface AdminFleetVehicle {
  vehicleRef: string;
  businessCode: string;
  plate: string | null;
  vin: string | null;
  vehicleType: string;
  brand: string | null;
  model: string | null;
  modelYear: number | null;
  capacityWeight: number | null;
  capacityVolume: number | null;
  usableLength: number | null;
  usableWidth: number | null;
  usableHeight: number | null;
  weightUnit: typeof ADMIN_FLEET_WEIGHT_UNITS[number];
  volumeUnit: typeof ADMIN_FLEET_VOLUME_UNITS[number];
  dimensionUnit: typeof ADMIN_FLEET_DIMENSION_UNITS[number];
  operationalStatus: AdminFleetStatus;
  availableForCalculation: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  hubCode: string | null;
  rowVersion: number;
  updatedAt: string;
  retiredAt: string | null;
  calculationLocked: boolean;
}
export type AdminFleetEditableFields = Pick<AdminFleetVehicle,
  "businessCode" | "plate" | "vin" | "vehicleType" | "brand" | "model" | "modelYear" |
  "capacityWeight" | "capacityVolume" | "usableLength" | "usableWidth" | "usableHeight" |
  "weightUnit" | "volumeUnit" | "dimensionUnit" | "operationalStatus" | "availableForCalculation" |
  "effectiveFrom" | "effectiveTo" | "hubCode">;
export type AdminFleetCreateInput = Pick<AdminFleetEditableFields, "businessCode" | "vehicleType"> &
  Partial<Omit<AdminFleetEditableFields, "businessCode" | "vehicleType">> & { requestId: string };
export interface AdminFleetPatchInput { requestId: string; expectedVersion: number; changes: Partial<AdminFleetEditableFields>; }
