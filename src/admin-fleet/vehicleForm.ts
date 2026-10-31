import type { FleetVehicle, VehicleValues } from "./types";

type StringField = "businessCode" | "plate" | "vin" | "vehicleType" | "brand" | "model" | "modelYear" | "capacityWeight" | "capacityVolume" | "usableLength" | "usableWidth" | "usableHeight" | "effectiveFrom" | "effectiveTo" | "hubCode";
export type VehicleDraft = Omit<VehicleValues, StringField> & Record<StringField, string>;

export function vehicleDraft(vehicle?: FleetVehicle): VehicleDraft {
  return {
    businessCode: vehicle?.businessCode || "", plate: vehicle?.plate || "", vin: vehicle?.vin || "",
    vehicleType: vehicle?.vehicleType || "", brand: vehicle?.brand || "", model: vehicle?.model || "",
    modelYear: vehicle?.modelYear?.toString() || "", capacityWeight: vehicle?.capacityWeight?.toString() || "",
    capacityVolume: vehicle?.capacityVolume?.toString() || "", usableLength: vehicle?.usableLength?.toString() || "",
    usableWidth: vehicle?.usableWidth?.toString() || "", usableHeight: vehicle?.usableHeight?.toString() || "",
    weightUnit: vehicle?.weightUnit || "KG", volumeUnit: vehicle?.volumeUnit || "CBM", dimensionUnit: vehicle?.dimensionUnit || "M",
    operationalStatus: vehicle?.operationalStatus || "AVAILABLE", availableForCalculation: vehicle?.availableForCalculation ?? true,
    effectiveFrom: vehicle?.effectiveFrom.slice(0, 10) || new Date().toISOString().slice(0, 10), effectiveTo: vehicle?.effectiveTo?.slice(0, 10) || "",
    hubCode: vehicle?.hubCode || "",
  };
}

function numeric(value: string, label: string, precision: number, maximum: number) {
  if (!value.trim()) return null;
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/u.test(normalized) || (normalized.split(".")[1]?.length || 0) > precision) {
    throw new Error(`${label}: use un número positivo con hasta ${precision} decimales, sin separadores de miles.`);
  }
  const result = Number(normalized);
  if (!Number.isFinite(result) || result <= 0 || result > maximum) throw new Error(`${label}: el valor está fuera del rango permitido.`);
  return result;
}

function effectiveDate(value: string, original?: string | null) {
  if (!value) return null;
  if (value === original?.slice(0, 10)) return original;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("Revise las fechas de vigencia.");
  }
  return date.toISOString();
}

export function vehicleValues(draft: VehicleDraft, original?: FleetVehicle): VehicleValues {
  const text = (value: string) => value.trim() || null;
  const businessCode = draft.businessCode.trim();
  const vehicleType = draft.vehicleType.trim();
  if (!businessCode || !vehicleType) throw new Error("Complete el código y el tipo de vehículo.");
  const modelYear = numeric(draft.modelYear, "Año", 0, 2200);
  if (modelYear !== null && modelYear < 1900) throw new Error("El año debe estar entre 1900 y 2200.");
  const effectiveFrom = effectiveDate(draft.effectiveFrom, original?.effectiveFrom);
  const effectiveTo = effectiveDate(draft.effectiveTo, original?.effectiveTo);
  if (!effectiveFrom) throw new Error("Indique la fecha inicial de vigencia.");
  if (effectiveFrom && effectiveTo && effectiveTo <= effectiveFrom) throw new Error("La fecha final debe ser posterior a la fecha inicial.");
  return {
    businessCode, vehicleType, plate: text(draft.plate), vin: text(draft.vin), brand: text(draft.brand), model: text(draft.model), modelYear,
    capacityWeight: numeric(draft.capacityWeight, "Capacidad de peso", 3, 99999999999.999),
    capacityVolume: numeric(draft.capacityVolume, "Capacidad de volumen", 4, 9999999999.9999),
    usableLength: numeric(draft.usableLength, "Largo útil", 4, 99999999.9999),
    usableWidth: numeric(draft.usableWidth, "Ancho útil", 4, 99999999.9999),
    usableHeight: numeric(draft.usableHeight, "Alto útil", 4, 99999999.9999),
    weightUnit: draft.weightUnit, volumeUnit: draft.volumeUnit, dimensionUnit: draft.dimensionUnit,
    operationalStatus: draft.operationalStatus,
    availableForCalculation: ["AVAILABLE", "IN_USE"].includes(draft.operationalStatus) && draft.availableForCalculation,
    effectiveFrom, effectiveTo, hubCode: text(draft.hubCode),
  };
}

export function vehicleChanges(vehicle: FleetVehicle, values: VehicleValues): Partial<VehicleValues> {
  return Object.fromEntries(Object.entries(values).filter(([key, value]) => value !== vehicle[key as keyof VehicleValues]));
}

export function hasVehicleChanges(vehicle: FleetVehicle | null, draft: VehicleDraft | null) {
  if (!draft) return false;
  if (!vehicle) return Boolean(draft.businessCode.trim() && draft.vehicleType.trim());
  const baseline = vehicleDraft(vehicle);
  return (Object.keys(draft) as (keyof VehicleDraft)[]).some((key) => draft[key] !== baseline[key]);
}
