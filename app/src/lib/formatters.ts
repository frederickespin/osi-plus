const EN_US_2D = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(value: number, currency = "RD$") {
  const amount = Number.isFinite(value) ? value : 0;
  return `${currency} ${EN_US_2D.format(amount)}`;
}

