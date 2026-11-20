import { pointInTransportPolygon, transportRingError } from "../../shared/transportGeometry.js";
import type { TransportCoordinate, TransportPolygon } from "./transportApi";

export type TransportPlace = Readonly<{
  id: string;
  point: TransportCoordinate;
  name: string;
  city: string;
  province: string;
  sector: string;
  street: string;
  municipality: boolean;
  matchType: "Ciudad / municipio" | "Sector" | "Referencia";
  boundary: TransportPolygon | null;
}>;

export type TransportBoundary = Readonly<{ label: string; points: readonly TransportCoordinate[] }>;

const PHOTON_URL = import.meta.env.VITE_OSI_GEOCODER_URL || "https://photon.komoot.io/api/";
const MUNICIPAL_WFS_URL = "https://geoportal.iderd.gob.do/geoserver/ign/wfs";
const localityTypes = new Set(["locality", "district"]);
const recentSearches = new Map<string, { places: TransportPlace[]; expires: number }>();

type MapFeature = {
  properties?: Record<string, unknown>;
  geometry?: { type?: string; coordinates?: unknown };
};

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

function coordinate(value: unknown): TransportCoordinate | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const [longitude, latitude] = value;
  if (typeof longitude !== "number" || typeof latitude !== "number" || !Number.isFinite(longitude) || !Number.isFinite(latitude)
    || Math.abs(longitude) > 180 || Math.abs(latitude) > 90) return null;
  return [longitude, latitude];
}

function polygon(geometry: MapFeature["geometry"]): TransportPolygon | null {
  const coordinates = geometry?.coordinates;
  if (!Array.isArray(coordinates)) return null;
  const rings = geometry?.type === "Polygon" ? coordinates : geometry?.type === "MultiPolygon" && coordinates.length === 1 ? coordinates[0] : null;
  if (!Array.isArray(rings) || rings.length !== 1 || !Array.isArray(rings[0])) return null;
  const ring = rings[0].map(coordinate);
  if (ring.length < 4 || ring.some((point: TransportCoordinate | null) => point === null)) return null;
  return { type: "Polygon", coordinates: [ring as TransportCoordinate[]] };
}

function place(feature: MapFeature): TransportPlace | null {
  const properties = feature?.properties;
  if (!properties || text(properties.countrycode).toUpperCase() !== "DO") return null;
  const boundary = polygon(feature.geometry);
  const point = coordinate(feature.geometry?.coordinates) || boundary?.coordinates[0][0];
  if (!point) return null;
  const type = text(properties.type);
  const municipality = type === "city";
  const streetName = text(properties.street);
  const street = [streetName || (type === "street" ? text(properties.name) : ""), text(properties.housenumber)].filter(Boolean).join(" ");
  const name = text(properties.name) || street;
  if (!name) return null;
  const city = municipality ? name : text(properties.city) || text(properties.county);
  const sector = localityTypes.has(type) ? name : text(properties.locality) || text(properties.district);
  return {
    id: [text(properties.osm_type), properties.osm_id, point.join(",")].join(":"),
    name, city, province: text(properties.state), sector, street, point, municipality,
    matchType: municipality ? "Ciudad / municipio" : localityTypes.has(type) ? "Sector" : "Referencia",
    boundary: municipality || localityTypes.has(type) ? boundary : null,
  };
}

async function features(url: URL, signal: AbortSignal): Promise<MapFeature[]> {
  const response = await fetch(url, {
    credentials: "omit",
    signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("MAP_SERVICE_UNAVAILABLE");
  const result = await response.json();
  if (!Array.isArray(result?.features)) throw new Error("MAP_RESPONSE_INVALID");
  return result.features;
}

export async function searchTransportPlaces(query: string, signal: AbortSignal): Promise<TransportPlace[]> {
  const search = query.trim().replace(/\s+/g, " ");
  if (search.length < 3) return [];
  const key = search.toLocaleLowerCase("es");
  const cached = recentSearches.get(key);
  if (cached && Date.now() < cached.expires) return cached.places;
  const url = new URL(PHOTON_URL);
  url.search = new URLSearchParams({ q: search, countrycode: "DO", limit: "6" }).toString();
  const places = (await features(url, signal)).map(place).filter((entry): entry is TransportPlace => entry !== null);
  if (recentSearches.size >= 30) recentSearches.delete(recentSearches.keys().next().value!);
  recentSearches.set(key, { places, expires: Date.now() + 5 * 60_000 });
  return places;
}

async function editableRing(shape: TransportPolygon): Promise<TransportCoordinate[] | null> {
  const ring = shape.coordinates[0];
  if (ring.length <= 201 && !transportRingError(ring)) return ring.slice(0, -1);
  // Preserve the real shape while limiting the number of editable map vertices.
  const { LineUtil, point } = await import("leaflet");
  const vertices = ring.map(([longitude, latitude]) => point(longitude, latitude));
  for (const tolerance of [0.000025, 0.00005, 0.0001, 0.0002, 0.0004, 0.0008, 0.0016, 0.0032]) {
    const simplified = LineUtil.simplify(vertices, tolerance).map(({ x, y }): TransportCoordinate => [x, y]);
    if (!transportRingError(simplified)) return simplified.slice(0, -1);
  }
  return null;
}

export async function findTransportBoundary(location: TransportPlace, signal: AbortSignal): Promise<TransportBoundary | null> {
  if (location.boundary) {
    const points = await editableRing(location.boundary);
    if (points) return { label: location.name, points };
  }
  if (!location.municipality) return null;
  const [longitude, latitude] = location.point;
  const url = new URL(MUNICIPAL_WFS_URL);
  const padding = 0.0001;
  url.search = new URLSearchParams({
    service: "WFS", request: "GetFeature", version: "2.0.0", typeNames: "ign:municipios",
    outputFormat: "application/json", srsName: "EPSG:4326", count: "3",
    cql_filter: `BBOX(geom,${longitude - padding},${latitude - padding},${longitude + padding},${latitude + padding},'EPSG:4326')`,
  }).toString();
  const candidates = (await features(url, signal)).flatMap((feature) => {
    const shape = polygon(feature.geometry);
    const municipality = text(feature.properties?.municipio);
    return shape && municipality && pointInTransportPolygon(location.point, shape) ? [{ shape, municipality }] : [];
  });
  if (candidates.length !== 1) return null;
  const [{ shape, municipality }] = candidates;
  const points = await editableRing(shape);
  return points ? { label: `Municipio ${municipality} · IGN`, points } : null;
}
