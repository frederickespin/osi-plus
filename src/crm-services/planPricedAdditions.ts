import type { QuoteCatalogItem } from "@/costing/api";
import { pricingDecimal } from "@/costing/pricingInput";

export type PlanPricedAddition = QuoteCatalogItem & Readonly<{ quantity: string }>;

export function validPlanQuantity(row: PlanPricedAddition) {
  const parsed = pricingDecimal(row.quantity, 6);
  return parsed !== null && Number(parsed) > 0 && Number(parsed) <= 1_000_000;
}

export function planPricedAdditions(preference?: Readonly<Record<string, unknown>>): readonly PlanPricedAddition[] {
  const quick = preference?.quickQuote;
  if (!quick || typeof quick !== "object" || !("pricedAdditions" in quick) || !Array.isArray(quick.pricedAdditions)) return [];
  return quick.pricedAdditions.filter((row): row is PlanPricedAddition =>
    !!row && typeof row.ruleRef === "string" && Number.isInteger(row.version) && typeof row.name === "string" &&
    typeof row.unit === "string" && typeof row.unitPrice === "string" && pricingDecimal(row.unitPrice, 10) !== null &&
    typeof row.currency === "string" && /^[A-Z]{3}$/.test(row.currency) && typeof row.family === "string" &&
    ["PR", "EX", "DE"].includes(row.classification) && typeof row.quantity === "string" && validPlanQuantity(row));
}
