import { pointInTransportPolygon } from "../../shared/transportGeometry.js";

export function logisticsLocalityKey(value) {
  return typeof value === "string"
    ? value.toLocaleLowerCase("es").normalize("NFD").replace(/n\u0303/gu, "ñ").replace(/\p{M}/gu, "").trim().replace(/\s+/gu, " ")
    : "";
}

export function classifyLogisticsMetro(metro, address, point) {
  if (!metro || address?.countryCode && address.countryCode !== "DO") return null;
  const city = logisticsLocalityKey(address?.cityMunicipality);
  const sector = logisticsLocalityKey(address?.sector);
  if (city) {
    const entries = metro.localities.filter((row) => logisticsLocalityKey(row.city) === city);
    const match = (sector && entries.find((row) => logisticsLocalityKey(row.sector) === sector))
      || entries.find((row) => !logisticsLocalityKey(row.sector));
    if (match) return match.classification ?? "METRO";
  }
  if (!Array.isArray(point) || point.length !== 2 || point.some((value) => !Number.isFinite(value))) return null;
  const ring = Array.isArray(metro.geometry) ? metro.geometry : metro.geometry?.coordinates?.[0];
  if (!Array.isArray(ring) || ring.length < 3) return null;
  const first = ring[0];
  const last = ring.at(-1);
  const closed = first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
  const polygon = { type: "Polygon", coordinates: [closed] };
  return pointInTransportPolygon(point, polygon) ? "METRO" : "INTERIOR";
}

export function logisticsVisitReferenceKm(zones, address, bases) {
  const city = logisticsLocalityKey(address?.cityMunicipality);
  const sector = logisticsLocalityKey(address?.sector);
  const activeAddresses = new Set(bases.filter((base) => base.active).map((base) => base.address));
  const profiles = zones.filter((zone) => city && zone.purposes.includes("VISIT")
    && logisticsLocalityKey(zone.city) === city && (!activeAddresses.size || activeAddresses.has(zone.baseAddress))
    && zone.zoneType === "INTERIOR" && zone.referenceDistanceKm != null && zone.referenceDistanceSource);
  const exact = profiles.filter((zone) => sector && zone.locationType === "SECTOR" && logisticsLocalityKey(zone.sector) === sector);
  const matches = exact.length > 0 ? exact : profiles.filter((zone) => zone.locationType === "CITY");
  const distances = [...new Set(matches.map((zone) => Number(zone.referenceDistanceKm)))];
  return distances.length === 1 && Number.isFinite(distances[0]) ? distances[0] : null;
}
