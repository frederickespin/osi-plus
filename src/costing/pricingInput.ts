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

export const pricingQuantity = new Intl.NumberFormat("es-DO", { maximumFractionDigits: 2 });
