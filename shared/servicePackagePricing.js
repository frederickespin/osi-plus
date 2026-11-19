export const PACKAGE_PRICING_KIND = "SERVICE_PACKAGE_PRICING";
export const PACKAGE_QUOTE_BASIS = "PACKAGE_QUOTATION";

export const PACKAGE_BASE_LABELS = Object.freeze({
  FIXED: "Cantidad fija",
  M3: "Por m³",
  FT3: "Por pie³",
  CWT: "Por CWT",
  CHARGEABLE_KG: "Por kg cobrable",
  CAPACITY: "Por viaje según capacidad",
});

export function isPackagePricingRule(rule) {
  return rule?.result?.kind === PACKAGE_PRICING_KIND;
}

export function minimumForPackage(price, volumeM3) {
  const tiers = price.volumeTiers;
  if (!tiers?.length) return { maxM3: null, afterM3: null, minimumSale: price.minimumSale };
  const index = tiers.findIndex(({ maxM3 }) => maxM3 === null || volumeM3 <= maxM3);
  return index < 0 ? null : { ...tiers[index], afterM3: index === 0 ? null : tiers[index - 1].maxM3 };
}

export function isPackageMinimumLine(line) {
  return line?.snapshot?.packageMinimum === true
    || (line?.source === "COMBO" && line.family === "ADDITIONAL"
      && line.logisticsItemRef == null && typeof line.snapshot?.minimumSale === "string");
}

const KG_PER_CWT = 45.359237;
const M3_PER_FT3 = 0.3048 ** 3;

function roundUpUnits(value) {
  // Avoid rounding an exact multiple up due to binary floating-point noise.
  return Math.ceil(value - value * Number.EPSILON);
}

export function packageMeasures(volumeM3, grossKg, shipment) {
  const volumeFt3 = volumeM3 / M3_PER_FT3;
  const estimatedKg = shipment.mode === "SEA" ? volumeM3 * shipment.factor : null;
  const volumetricKg = shipment.mode === "AIR" ? volumeM3 * (1_000_000 / shipment.factor) : null;
  const preRoundKg = volumetricKg === null ? null : Math.max(grossKg ?? 0, volumetricKg);
  const chargeableKg = preRoundKg === null || shipment.roundKg === 0
    ? preRoundKg
    : roundUpUnits(preRoundKg / shipment.roundKg) * shipment.roundKg;
  const cwtWeightKg = chargeableKg ?? grossKg ?? estimatedKg;
  return {
    volumeM3,
    volumeFt3,
    grossKg,
    estimatedKg,
    volumetricKg,
    chargeableKg,
    cwt: cwtWeightKg === null ? null : cwtWeightKg / KG_PER_CWT,
    cwtBasis: chargeableKg !== null ? "CHARGEABLE" : grossKg !== null ? "GROSS" : estimatedKg !== null ? "ESTIMATED" : null,
  };
}

export function packageQuantity(component, measures) {
  const bases = {
    FIXED: 1,
    M3: measures.volumeM3,
    FT3: measures.volumeFt3,
    CWT: measures.cwt,
    CHARGEABLE_KG: measures.chargeableKg,
    CAPACITY: measures.volumeM3,
  };
  const base = bases[component.basis];
  if (base == null) return null;
  const quantity = component.basis === "CAPACITY" ? base / component.factor : base * component.factor;
  const withMinimum = Math.max(quantity, component.minimumQuantity);
  const billable = component.roundUp || component.basis === "CAPACITY"
    ? roundUpUnits(withMinimum)
    : Number(withMinimum.toFixed(4));
  return Number.isFinite(billable) && billable > 0 && billable <= 1_000_000 ? String(billable) : null;
}
