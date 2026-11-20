import { ROAD_TRANSPORT_KINDS } from "../../shared/transportCostScope.js";
import type { TransportBasis, TransportComponentKind, TransportPurpose } from "./transportApi";

export const PURPOSE_LABELS: Record<TransportPurpose, string> = { QUOTE: "Cotizaciones", SERVICE: "Servicios operativos", VISIT: "Visitas presenciales" };
export const KIND_LABELS: Record<TransportComponentKind, string> = { BASE: "Base de transporte", FUEL: "Combustible", TOLL: "Peaje", PER_DIEM: "Dieta", ALLOWANCE: "Viático", OTHER: "Otro costo vehicular" };
export const BASIS_LABELS: Record<TransportBasis, string> = { TRIP: "Por viaje", GALLON: "Por galón", PASS: "Por paso", PERSON_DAY: "Por persona / día", FIXED: "Cantidad indicada", KM: "Por kilómetro" };
export const UNIT_LABELS: Record<TransportBasis, string> = { TRIP: "viajes", GALLON: "gal", PASS: "pasos", PERSON_DAY: "persona/día", FIXED: "unidades", KM: "km" };
export const STATE_LABELS = { DRAFT: "Borrador", ACTIVE: "Activa", INACTIVE: "Inactiva" } as const;
export const INCLUDED_KINDS: readonly TransportComponentKind[] = ROAD_TRANSPORT_KINDS.filter((kind) => kind !== "BASE");

export function formatTransportNumber(value: string | number | null, maximumFractionDigits = 4): string {
  if (value === null || value === "") return "Pendiente";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? new Intl.NumberFormat("es-DO", { maximumFractionDigits }).format(parsed) : "Pendiente";
}

export function formatTransportDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Fecha pendiente" : date.toLocaleString("es-DO", { dateStyle: "short", timeStyle: "short" });
}
