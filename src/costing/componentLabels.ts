export const COST_FAMILY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  LABOR: "Personal", TRANSPORT: "Transporte", MATERIAL: "Materiales", CRATING: "Huacales",
  ASSET: "Equipos", TRAVEL: "Dietas y viáticos", THIRD_PARTY: "Proveedores", FREIGHT: "Flete",
  CUSTOMS: "Aduanas", PERMIT: "Permisos", ADDITIONAL: "Otros cargos", RISK: "Contingencia",
  CURRENCY_COMPENSATION: "Compensación de moneda",
});

export function filterBySearch(value: string, search: string) {
  const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es");
  return fold(value).includes(fold(search.trim()));
}
