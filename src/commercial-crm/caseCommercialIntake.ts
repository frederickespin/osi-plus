import { planPricedAdditions, type PlanPricedAddition } from "@/crm-services/planPricedAdditions";

export type CaseDirectQuote = Readonly<{
  source: "CLIENT_LIST" | "ESTIMATE";
  clientList: string | null;
  volumeM3: number | null;
  originAccess: string | null;
  destinationAccess: string | null;
  specialWork: string | null;
}>;

export type CaseCommercialIntake = Readonly<{
  serviceStartDate: string | null;
  directQuote: CaseDirectQuote | null;
  directQuoteRecordedAt: string | null;
  pricedAdditions?: readonly PlanPricedAddition[];
}>;

export function isServiceIntakeDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value) || value.startsWith("0000")) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function commercialIntake(preference: Readonly<Record<string, unknown>> | undefined): CaseCommercialIntake {
  const serviceStartDate = isServiceIntakeDate(preference?.serviceStartDate) ? preference.serviceStartDate : null;
  const raw = preference?.directQuote;
  const pricedAdditions = planPricedAdditions(preference);
  const additions = pricedAdditions.length ? { pricedAdditions } : {};
  const empty = { serviceStartDate, directQuote: null, directQuoteRecordedAt: null, ...additions };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return empty;
  const entry = raw as Record<string, unknown>;
  if (entry.source !== "CLIENT_LIST" && entry.source !== "ESTIMATE") return empty;
  const optionalText = (value: unknown) => typeof value === "string" && value.trim() ? value : null;
  const volumeM3 = typeof entry.volumeM3 === "number" && Number.isFinite(entry.volumeM3) && entry.volumeM3 > 0 ? entry.volumeM3 : null;
  const capturedAt = preference?.directQuoteRecordedAt;
  return {
    serviceStartDate,
    ...additions,
    directQuoteRecordedAt: typeof capturedAt === "string" && Number.isFinite(Date.parse(capturedAt)) ? capturedAt : null,
    directQuote: {
      source: entry.source, volumeM3, clientList: optionalText(entry.clientList), originAccess: optionalText(entry.originAccess),
      destinationAccess: optionalText(entry.destinationAccess), specialWork: optionalText(entry.specialWork),
    },
  };
}
