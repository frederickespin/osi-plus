import type { TransportCoordinate } from "./transportApi";

export type TransportLocation = Readonly<{
  point: TransportCoordinate;
  label: string;
  countryCode: string;
  address?: Readonly<{ city: string; province: string; sector: string; street: string }>;
}>;

export type TransportRoadRoute = Readonly<{
  distanceKm: string;
  durationMinutes: number | null;
  source: string;
}>;

type NominatimPlace = Readonly<{
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: Readonly<Record<string, string | undefined>>;
}>;

const NOMINATIM = "https://nominatim.openstreetmap.org";
const OSRM = "https://router.project-osrm.org";

function location(place: NominatimPlace): TransportLocation | null {
  const longitude = Number(place.lon);
  const latitude = Number(place.lat);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || !place.display_name) return null;
  const address = place.address;
  return { point: [longitude, latitude], label: place.display_name, countryCode: address?.country_code?.toUpperCase() || "",
    ...(address && { address: {
      city: address.city || address.town || address.village || address.municipality || address.county || "",
      province: address.state || address.province || "", sector: address.suburb || address.neighbourhood || address.city_district || "",
      street: [address.road || address.pedestrian || address.residential || "", address.house_number].filter(Boolean).join(" "),
    } }),
  };
}

async function readJson(response: Response) {
  if (!response.ok) throw new Error("MAP_SERVICE_UNAVAILABLE");
  return response.json() as Promise<unknown>;
}

export async function searchTransportLocations(query: string, signal?: AbortSignal): Promise<TransportLocation[]> {
  const value = query.trim();
  if (value.length < 3) return [];
  const params = new URLSearchParams({ q: value, format: "jsonv2", addressdetails: "1", limit: "5", "accept-language": "es" });
  const payload = await readJson(await fetch(`${NOMINATIM}/search?${params}`, { signal, headers: { Accept: "application/json" } }));
  return Array.isArray(payload) ? payload.map((place) => location(place as NominatimPlace)).filter((item): item is TransportLocation => item !== null) : [];
}

export async function reverseTransportLocation(point: TransportCoordinate, signal?: AbortSignal): Promise<TransportLocation> {
  const params = new URLSearchParams({ lon: String(point[0]), lat: String(point[1]), format: "jsonv2", addressdetails: "1", zoom: "18", "accept-language": "es" });
  const payload = await readJson(await fetch(`${NOMINATIM}/reverse?${params}`, { signal, headers: { Accept: "application/json" } }));
  const result = location(payload as NominatimPlace);
  if (!result) throw new Error("ADDRESS_NOT_FOUND");
  return result;
}

export async function calculateRoadRoute(origin: TransportCoordinate, destination: TransportCoordinate, signal?: AbortSignal): Promise<TransportRoadRoute> {
  const coordinates = `${origin[0]},${origin[1]};${destination[0]},${destination[1]}`;
  const params = new URLSearchParams({ alternatives: "false", steps: "false", overview: "false" });
  const payload = await readJson(await fetch(`${OSRM}/route/v1/driving/${coordinates}?${params}`, { signal, headers: { Accept: "application/json" } })) as { code?: string; routes?: Array<{ distance?: number; duration?: number }> };
  const route = payload.code === "Ok" ? payload.routes?.[0] : null;
  if (!route || !Number.isFinite(route.distance) || Number(route.distance) <= 0) throw new Error("ROAD_ROUTE_NOT_FOUND");
  return {
    distanceKm: (Number(route.distance) / 1000).toFixed(2),
    durationMinutes: Number.isFinite(route.duration) ? Math.round(Number(route.duration) / 60) : null,
    source: "OSRM / OpenStreetMap · ruta vial automática",
  };
}
