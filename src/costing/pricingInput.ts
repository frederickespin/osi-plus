export function pricingDecimal(value: string, digits: number) {
  const number = value.trim().replace(",", ".").replace(/^\./, "0.").replace(/^0+(?=\d)/, "");
  if (!new RegExp(`^\\d{1,10}(?:\\.\\d{0,${digits}})?$`).test(number)) return null;
  return number.replace(/\.$/, "");
}

export function pricingMoney(value: string | number, currency: string) {
  if (!/^[A-Z]{3}$/.test(currency)) return Number(value).toFixed(2);
  return new Intl.NumberFormat("es-DO", {
    style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(Number(value));
}

/** Round extended catalog prices once, after multiplication, as the proposal API does. */
export function catalogAmountCents(quantity: string, unitPrice: string): bigint | null {
  const units = pricingDecimal(quantity, 6);
  const price = pricingDecimal(unitPrice, 10);
  if (units === null || price === null) return null;
  const [wholeUnits, fractionUnits = ""] = units.split(".");
  const [wholePrice, fractionPrice = ""] = price.split(".");
  const scaled = BigInt(wholeUnits + fractionUnits.padEnd(6, "0")) * BigInt(wholePrice + fractionPrice.padEnd(10, "0"));
  return (scaled + 50_000_000_000_000n) / 100_000_000_000_000n;
}

export const pricingQuantity = new Intl.NumberFormat("es-DO", { maximumFractionDigits: 2 });
export const pricingVolume = new Intl.NumberFormat("es-DO", { maximumFractionDigits: 6 });
