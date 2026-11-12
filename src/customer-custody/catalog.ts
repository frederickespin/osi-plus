import type { CustomerCustodyCatalogItem, CustomerCustodyCatalogKind } from "./api";

const rows: readonly [CustomerCustodyCatalogKind, string, string, string | null][] = [
  ["DAMAGE_LOCATION", "GENERAL", "General", null], ["DAMAGE_LOCATION", "TOP", "Tope", null], ["DAMAGE_LOCATION", "BOTTOM", "Base", null], ["DAMAGE_LOCATION", "FRONT", "Frente", null], ["DAMAGE_LOCATION", "BACK", "Atrás", null], ["DAMAGE_LOCATION", "LEFT", "Lado izquierdo", null], ["DAMAGE_LOCATION", "RIGHT", "Lado derecho", null], ["DAMAGE_LOCATION", "LEGS", "Patas", null], ["DAMAGE_LOCATION", "WHEELS", "Ruedas", null],
  ["CONDITION", "NO_VISIBLE_DAMAGE", "Sin daño visible", null], ["CONDITION", "SCRATCHED", "Rayado", null], ["CONDITION", "BROKEN", "Roto", null], ["CONDITION", "DIRTY", "Sucio", null], ["CONDITION", "MOLDY", "Enmohecido", null], ["CONDITION", "DENTED", "Abollado", null], ["CONDITION", "WET", "Mojado", null], ["CONDITION", "OPEN", "Abierto", null], ["CONDITION", "CRUSHED", "Aplastado", null],
  ["PACKAGE_FORM", "BOX", "Caja", "BOX"], ["PACKAGE_FORM", "PACKAGE", "Paquete", "PACKAGE"], ["PACKAGE_FORM", "BUNDLE", "Bulto", "BUNDLE"], ["PACKAGE_FORM", "PALLET", "Pallet", "PALLET"], ["PACKAGE_FORM", "LOOSE_ITEM", "Artículo suelto", "LOOSE_ITEM"], ["PACKAGE_FORM", "CRATE", "Huacal", "CRATE"], ["PACKAGE_FORM", "OTHER", "Otro", "OTHER"],
  ["ITEM_NAME", "FURNITURE", "Mobiliario", null], ["ITEM_NAME", "SOFA", "Sofá", null], ["ITEM_NAME", "CHAIR", "Silla", null], ["ITEM_NAME", "TABLE", "Mesa", null], ["ITEM_NAME", "BED_MATTRESS", "Cama o colchón", null], ["ITEM_NAME", "CLOTHING", "Ropa", null], ["ITEM_NAME", "BOOKS_DOCUMENTS", "Libros y documentos", null], ["ITEM_NAME", "KITCHEN", "Cocina", null], ["ITEM_NAME", "APPLIANCE", "Electrodoméstico", null], ["ITEM_NAME", "ART_DECOR", "Arte y decoración", null], ["ITEM_NAME", "ELECTRONICS", "Electrónica", null], ["ITEM_NAME", "TOOLS", "Herramientas", null], ["ITEM_NAME", "COMMERCIAL_GOODS", "Mercancía comercial", null], ["ITEM_NAME", "RAW_MATERIAL", "Materia prima", null], ["ITEM_NAME", "OTHER", "Otros", null],
];

export const FALLBACK_CUSTODY_CATALOG: readonly CustomerCustodyCatalogItem[] = Object.freeze(rows.map(([kind, code, label, baseValue], index) => Object.freeze({ catalogRef: `fallback-${kind}-${code}`, kind, code, label, baseValue, status: "ACTIVE" as const, sortOrder: (index + 1) * 10, version: 1 })));

export function catalogRows(catalog: readonly CustomerCustodyCatalogItem[], kind: CustomerCustodyCatalogKind, includeInactive = false) {
  return catalog.filter((row) => row.kind === kind && (includeInactive || row.status === "ACTIVE")).sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label, "es"));
}

export function catalogLabel(catalog: readonly CustomerCustodyCatalogItem[], kind: CustomerCustodyCatalogKind, code: string) {
  return catalog.find((row) => row.kind === kind && row.code === code)?.label || code;
}

export function parseObservation(entry: string) {
  if (entry.startsWith("OBS|")) {
    const [, locationCode, conditionCode, locationLabel, conditionLabel] = entry.split("|");
    return { locationCode, conditionCode, locationLabel: decodeURIComponent(locationLabel || locationCode), conditionLabel: decodeURIComponent(conditionLabel || conditionCode) };
  }
  if (entry.startsWith("COND|")) {
    const [, locationCode, conditionCode] = entry.split("|");
    if (conditionCode) return { locationCode, conditionCode, locationLabel: locationCode, conditionLabel: conditionCode };
    return { locationCode: "GENERAL", conditionCode: locationCode, locationLabel: "General", conditionLabel: locationCode };
  }
  return null;
}

export function observationToken(location: CustomerCustodyCatalogItem, condition: CustomerCustodyCatalogItem) {
  return `OBS|${location.code}|${condition.code}|${encodeURIComponent(location.label)}|${encodeURIComponent(condition.label)}`;
}
