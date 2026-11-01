import type { WarehouseLocationRow, WarehouseRow } from "@/materials-inventory/api";

export const LOCATION_KIND_LABELS: Readonly<Record<string, string>> = Object.freeze({
  WAREHOUSE_ROOT: "Almacén principal", ZONE: "Zona", AISLE: "Pasillo", RACK: "Estante",
  LEVEL: "Nivel", BIN: "Posición", RECEIVING: "Recepción", DISPATCH: "Despacho",
  QUARANTINE: "Cuarentena", OTHER: "Otra ubicación",
});

export function locationNamePath(warehouse: WarehouseRow, location: WarehouseLocationRow) {
  const byRef = new Map(warehouse.locations.map((row) => [row.locationRef, row]));
  const parts: string[] = [];
  const seen = new Set<string>();
  let current: WarehouseLocationRow | undefined = location;
  while (current && !seen.has(current.locationRef)) {
    seen.add(current.locationRef);
    if (current.parentLocationRef !== null) parts.unshift(current.name);
    current = current.parentLocationRef ? byRef.get(current.parentLocationRef) : undefined;
  }
  return [warehouse.name, ...parts].join(" › ");
}

export function canAddInside(warehouse: WarehouseRow, location: WarehouseLocationRow) {
  if (warehouse.status !== "ACTIVE" || location.depth >= 32 || location.path.length + 21 > 600) return false;
  const byRef = new Map(warehouse.locations.map((row) => [row.locationRef, row]));
  const seen = new Set<string>();
  let current: WarehouseLocationRow | undefined = location;
  while (current) {
    if (current.status !== "ACTIVE" || seen.has(current.locationRef)) return false;
    seen.add(current.locationRef);
    if (current.parentLocationRef === null) return true;
    current = byRef.get(current.parentLocationRef);
  }
  return false;
}

export type SpaceTreeRow = Readonly<{
  key: string;
  warehouse: WarehouseRow;
  location: WarehouseLocationRow | null;
  isWarehouse: boolean;
  indent: number;
  hasChildren: boolean;
  matches: boolean;
}>;

export function spaceTreeRows(warehouses: readonly WarehouseRow[], search: string, status: string, collapsed: ReadonlySet<string>): SpaceTreeRow[] {
  const query = search.trim().toLocaleLowerCase("es");
  const filtering = Boolean(query || status);
  const result: SpaceTreeRow[] = [];
  for (const warehouse of warehouses) {
    const byRef = new Map(warehouse.locations.map((row) => [row.locationRef, row]));
    const root = warehouse.locations.find((row) => row.parentLocationRef === null) ?? null;
    const rootKey = root?.locationRef ?? warehouse.warehouseRef;
    const children = new Map<string, WarehouseLocationRow[]>();
    for (const location of warehouse.locations) {
      if (location === root) continue;
      const parent = location.parentLocationRef && byRef.has(location.parentLocationRef) ? location.parentLocationRef : rootKey;
      const siblings = children.get(parent) ?? [];
      siblings.push(location);
      children.set(parent, siblings);
    }
    for (const siblings of children.values()) siblings.sort((a, b) => a.code.localeCompare(b.code));
    const rootMatches = (!status || warehouse.status === status) && (!query || `${warehouse.name} ${warehouse.code}`.toLocaleLowerCase("es").includes(query));
    const matching = new Set(warehouse.locations.filter((location) => location !== root
      && (!status || location.status === status)
      && (!query || `${location.name} ${location.code} ${locationNamePath(warehouse, location)}`.toLocaleLowerCase("es").includes(query))).map((row) => row.locationRef));
    if (filtering && !rootMatches && matching.size === 0) continue;
    const included = new Set(matching);
    for (const ref of matching) {
      let parentRef = byRef.get(ref)?.parentLocationRef;
      const seen = new Set<string>();
      while (parentRef && !seen.has(parentRef)) {
        seen.add(parentRef); included.add(parentRef); parentRef = byRef.get(parentRef)?.parentLocationRef;
      }
    }
    result.push({ key: rootKey, warehouse, location: root, isWarehouse: true, indent: 0, hasChildren: (children.get(rootKey)?.length ?? 0) > 0, matches: rootMatches });
    const visited = new Set([rootKey]);
    const append = (parentRef: string, indent: number) => {
      if (!filtering && collapsed.has(parentRef)) return;
      for (const location of children.get(parentRef) ?? []) {
        if (visited.has(location.locationRef) || filtering && !included.has(location.locationRef)) continue;
        visited.add(location.locationRef);
        result.push({ key: location.locationRef, warehouse, location, isWarehouse: false, indent, hasChildren: (children.get(location.locationRef)?.length ?? 0) > 0, matches: matching.has(location.locationRef) });
        append(location.locationRef, indent + 1);
      }
    };
    append(rootKey, 1);
  }
  return result;
}
