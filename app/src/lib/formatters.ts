import { getMainCurrencySymbol } from "@/lib/systemSettingsStore";

const EN_US_2D = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function normalizeCurrencyLabel(raw?: string) {
  if (!raw) return getMainCurrencySymbol();
  const value = raw.trim().toUpperCase();
  if (value === "DOP" || value === "RD$" || value === "RD") return "RD$";
  if (value === "USD" || value === "US$" || value === "$") return "US$";
  return raw.trim();
}

export function formatCurrency(value: number, currency?: string) {
  const amount = Number.isFinite(value) ? value : 0;
  return `${normalizeCurrencyLabel(currency)} ${EN_US_2D.format(amount)}`;
}
