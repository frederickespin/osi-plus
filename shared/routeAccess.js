export const ROUTE_ACCESS_LABELS = Object.freeze({
  STAIRS: "Escaleras", PASSENGER_ELEVATOR: "Ascensor", FREIGHT_ELEVATOR: "Montacargas",
  ITEM_DOES_NOT_FIT_ELEVATOR: "Artículos que no caben en el ascensor", NARROW_PASSAGE: "Paso estrecho",
  LONG_CARRY: "Acarreo largo", RESTRICTED_PARKING: "Estacionamiento restringido", LOADING_DOCK: "Muelle de carga",
  RESTRICTED_HOURS: "Horario restringido", PERMIT_REQUIRED: "Requiere permiso", CRANE_OR_HOIST: "Grúa o polipasto",
  TRANSSHIPMENT: "Transbordo",
});

export function knownAccessFlags(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((flag) => typeof flag === "string" && Object.hasOwn(ROUTE_ACCESS_LABELS, flag)))].sort();
}

export function clientRouteAccessFlags(conditions, routeRevision) {
  if (!Number.isSafeInteger(routeRevision) || routeRevision < 1) return [];
  const result = new Set();
  for (const side of ["origin", "destination"]) {
    if (conditions?.[side]?.routeRevision !== routeRevision) continue;
    for (const flag of knownAccessFlags(conditions[side].flags)) {
      result.add(flag);
      result.add(side.toUpperCase() + ":" + flag);
    }
  }
  return [...result].sort();
}
