import type { AdminFleetEditableFields, AdminFleetPatchInput, AdminFleetStatus, AdminFleetVehicle } from "../../shared/adminFleet.js";

export type FleetStatus = AdminFleetStatus;
export type WeightUnit = AdminFleetVehicle["weightUnit"];
export type VolumeUnit = AdminFleetVehicle["volumeUnit"];
export type DimensionUnit = AdminFleetVehicle["dimensionUnit"];
export type VehicleValues = AdminFleetEditableFields;
export type FleetVehicle = Readonly<AdminFleetVehicle>;

export type FleetList = Readonly<{ data: readonly FleetVehicle[]; containerVolumeTypes: readonly string[]; total: number; page: number; pageSize: number }>;
export type FleetListFilters = Readonly<{ search: string; operationalStatus: FleetStatus | ""; vehicleType: string; page: number; pageSize: number }>;
export type FleetCreate = Omit<VehicleValues, "businessCode"> & { requestId: string; businessCode?: string };
export type FleetUpdate = AdminFleetPatchInput;
export type FleetVehicleType = Readonly<{ name: string; variableVolume: boolean; registered: boolean }>;
export type FleetBase = Readonly<{ code: string; name: string; address: string }>;
export type FleetOptions = Readonly<{ types: readonly FleetVehicleType[]; bases: readonly FleetBase[] }>;

export const FLEET_STATUS_LABELS: Readonly<Record<FleetStatus, string>> = {
  AVAILABLE: "Disponible", IN_USE: "En uso", UNAVAILABLE: "No disponible", RETIRED: "Retirado",
};
export const WEIGHT_LABELS: Readonly<Record<WeightUnit, string>> = { KG: "kg", LB: "lb" };
export const VOLUME_LABELS: Readonly<Record<VolumeUnit, string>> = { CBM: "m³", CFT: "pie³" };
export const DIMENSION_LABELS: Readonly<Record<DimensionUnit, string>> = { M: "m", CM: "cm", FT: "pie", IN: "pulg" };
