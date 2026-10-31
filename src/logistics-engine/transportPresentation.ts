import type { TransportBasis, TransportComponentKind, TransportPurpose } from "./transportApi";

export const PURPOSE_LABELS: Record<TransportPurpose, string> = { QUOTE: "Cotización", SERVICE: "Servicio", VISIT: "Visita presencial" };
export const KIND_LABELS: Record<TransportComponentKind, string> = { BASE: "Base de transporte", FUEL: "Combustible", TOLL: "Peaje", PER_DIEM: "Dieta", ALLOWANCE: "Viático", OTHER: "Otro gasto" };
export const BASIS_LABELS: Record<TransportBasis, string> = { TRIP: "Por viaje", GALLON: "Por galón", PASS: "Por paso", PERSON_DAY: "Por persona / día", FIXED: "Cantidad indicada", KM: "Por kilómetro" };
export const UNIT_LABELS: Record<TransportBasis, string> = { TRIP: "viajes", GALLON: "gal", PASS: "pasos", PERSON_DAY: "persona/día", FIXED: "unidades", KM: "km" };
export const STATE_LABELS = { DRAFT: "Borrador", ACTIVE: "Activa", INACTIVE: "Inactiva" } as const;
export const TRANSPORT_PURPOSES: readonly TransportPurpose[] = ["QUOTE", "SERVICE", "VISIT"];
export const INCLUDED_KINDS: readonly TransportComponentKind[] = ["FUEL", "TOLL", "PER_DIEM", "ALLOWANCE", "OTHER"];

export function formatTransportNumber(value: string | number | null, maximumFractionDigits = 4): string {
  if (value === null || value === "") return "Pendiente";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? new Intl.NumberFormat("es-DO", { maximumFractionDigits }).format(parsed) : "Pendiente";
}

export function formatTransportDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Fecha pendiente" : date.toLocaleString("es-DO", { dateStyle: "short", timeStyle: "short" });
}
