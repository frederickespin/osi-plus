import type { AdminFleetEditableFields, AdminFleetPatchInput, AdminFleetStatus, AdminFleetVehicle } from "../../shared/adminFleet.js";

export type FleetStatus = AdminFleetStatus;
export type WeightUnit = AdminFleetVehicle["weightUnit"];
export type VolumeUnit = AdminFleetVehicle["volumeUnit"];
export type DimensionUnit = AdminFleetVehicle["dimensionUnit"];
export type VehicleValues = AdminFleetEditableFields;
export type FleetVehicle = Readonly<AdminFleetVehicle>;

export type FleetList = Readonly<{ data: readonly FleetVehicle[]; total: number; page: number; pageSize: number }>;
export type FleetListFilters = Readonly<{ search: string; operationalStatus: FleetStatus | ""; vehicleType: string; page: number; pageSize: number }>;
export type FleetCreate = VehicleValues & { requestId: string };
export type FleetUpdate = AdminFleetPatchInput;

export const FLEET_STATUS_LABELS: Readonly<Record<FleetStatus, string>> = {
  AVAILABLE: "Disponible", IN_USE: "En uso", UNAVAILABLE: "No disponible", RETIRED: "Retirado",
};
export const WEIGHT_LABELS: Readonly<Record<WeightUnit, string>> = { KG: "kg", LB: "lb" };
export const VOLUME_LABELS: Readonly<Record<VolumeUnit, string>> = { CBM: "m³", CFT: "pie³" };
export const DIMENSION_LABELS: Readonly<Record<DimensionUnit, string>> = { M: "m", CM: "cm", FT: "pie", IN: "pulg" };
