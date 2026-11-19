export const COST_FAMILY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  LABOR: "Personal", TRANSPORT: "Transporte", MATERIAL: "Materiales", CRATING: "Huacales",
  ASSET: "Equipos", TRAVEL: "Dietas y viáticos", THIRD_PARTY: "Proveedores", FREIGHT: "Flete",
  CUSTOMS: "Aduanas", PERMIT: "Permisos", ADDITIONAL: "Otros cargos", RISK: "Contingencia",
  CURRENCY_COMPENSATION: "Compensación de moneda",
});

const COST_UNITS: Readonly<Record<string, string>> = Object.freeze({
  HOUR: "hora", DAY: "día", TRIP: "viaje", UNIT: "unidad", SERVICE: "servicio", VISIT: "visita",
  MONTH: "mes", PERSON: "persona", M3: "m³", FT3: "pie³", CWT: "CWT", KG: "kg", LB: "lb", KM: "km",
});

export function costUnitLabel(unit: string | null | undefined) {
  return unit ? COST_UNITS[unit.toUpperCase()] ?? unit : "unidad";
}

export function filterBySearch(value: string, search: string) {
  const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es");
  return fold(value).includes(fold(search.trim()));
}
