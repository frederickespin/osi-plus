import type { TransportCoordinate, TransportPolygon } from "./logisticsTransport";

export function transportRingError(ring: readonly TransportCoordinate[]): "TRANSPORT_GEOMETRY_INVALID" | "TRANSPORT_GEOMETRY_SELF_INTERSECTION" | null;
export function pointInTransportPolygon(point: TransportCoordinate, geometry: TransportPolygon): boolean;
