export const CASE_ROUTE_MAX_STOPS = 8;

export function isRoutePoint(point) {
  return Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)
    && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90;
}

export function isRouteStopKind(kind) {
  return kind === "PICKUP" || kind === "DELIVERY";
}

// The address rows are immutable. Read their associated map points and stop types
// only when the case metadata was published for exactly those rows.
export function caseRouteDetails(item) {
  const details = item.milestonesJson?.icpV2?.routeDetails;
  return details?.revision === item.routeRevision ? details : null;
}

export function stopDetails(details, stopOrder) {
  return details?.stops?.find((stop) => stop.order === stopOrder);
}

export function makeRouteDetails(revision, origin, destination, stops) {
  return {
    revision,
    originPoint: origin?.point ?? null,
    destinationPoint: destination?.point ?? null,
    stops: stops.map((stop, index) => ({ order: index + 1, kind: stop.kind ?? null, point: stop.address?.point ?? null })),
  };
}
