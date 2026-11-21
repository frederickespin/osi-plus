import { classifyLogisticsMetro } from "./logisticsMetroClassification.js";

const key = (value) => String(value || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim().replace(/\s+/g, " ");
const fields = (address) => [address.streetAndNumber, address.sector, address.cityMunicipality, address.provinceState, "República Dominicana"];
const roadProfiles = (zones) => zones.filter((zone) => zone.purposes.some((purpose) => purpose === "SERVICE" || purpose === "QUOTE"));

function localityProfiles(zones, address) {
  if (address?.countryCode !== "DO") return [];
  const city = zones.filter((zone) => key(zone.city) === key(address.cityMunicipality));
  const sector = city.filter((zone) => zone.locationType === "SECTOR" && key(zone.sector) === key(address.sector));
  return sector.length ? sector : city.filter((zone) => zone.locationType === "CITY");
}

function uniqueValue(values) {
  const distinct = [...new Set(values)];
  return distinct.length === 1 ? distinct[0] : null;
}

function reference(profiles, base) {
  const eligible = profiles.filter((zone) => zone.baseAddress === base.address && zone.referenceDistanceKm != null && zone.referenceDistanceSource);
  const distance = uniqueValue(eligible.map((zone) => Number(zone.referenceDistanceKm)));
  const source = uniqueValue(eligible.map((zone) => zone.referenceDistanceSource)) || "Referencia vial del sector o ciudad";
  return distance === null ? null : { distanceKm: distance, source, estimated: true };
}

function serviceUrl(raw) {
  if (!raw) return null;
  try {
    const url = new URL(raw.endsWith("/") ? raw : raw + "/");
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash ? url : null;
  } catch { return null; }
}

export function configuredCaseRoadProvider(env = process.env, fetcher = fetch) {
  const geocoder = serviceUrl(env.OSI_CASE_GEOCODER_URL);
  const router = serviceUrl(env.OSI_CASE_ROUTER_URL);
  if (!geocoder || !router) return null;
  async function query(url) {
    const response = await fetcher(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(3500), redirect: "error" });
    if (!response.ok) throw new Error("CASE_ROAD_SERVICE_UNAVAILABLE");
    return response.json();
  }
  return {
    async locate(address, city) {
      const url = new URL(geocoder);
      url.search = new URLSearchParams({ q: address, countrycode: "DO", limit: "1" }).toString();
      const { features } = await query(url);
      const feature = features?.[0];
      const point = feature?.geometry?.coordinates;
      const properties = feature?.properties;
      if (String(properties?.countrycode).toUpperCase() !== "DO"
        || !properties.housenumber
        || city && ![properties.city, properties.county].some((name) => key(name) === key(city))
        || !Array.isArray(point) || point.length !== 2
        || !point.every(Number.isFinite) || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) return null;
      return point;
    },
    async legs(points) {
      const url = new URL("route/v1/driving/" + points.map((point) => point.join(",")).join(";"), router);
      url.search = "alternatives=false&overview=false&steps=false";
      const { code, routes } = await query(url);
      const legs = routes?.[0]?.legs;
      if (code !== "Ok" || !Array.isArray(legs) || legs.length !== points.length - 1
        || legs.some(({ distance }) => !Number.isFinite(distance) || distance < 0 || distance > 999999999)) return null;
      return legs.map(({ distance, duration }) => ({
        distanceKm: Math.round(distance / 10) / 100,
        durationMinutes: Number.isFinite(duration) && duration >= 0 ? Math.ceil(duration / 60) : null,
        source: "Ruta vial medida",
        estimated: false,
      }));
    },
  };
}

const attempt = async (work) => { try { return await work(); } catch { return null; } };

export async function caseDailyTravel(zones, route, { baseRef, baseAddress, localTerminalRef, localTerminalAddress, geography } = {}, provider = configuredCaseRoadProvider()) {
  const profiles = roadProfiles(zones);
  const savedBases = geography?.bases ?? [];
  const availableBases = savedBases.length
    ? savedBases.filter((base) => base.active).map(({ baseRef, address, name, kind, point }) => ({ baseRef, address, name, kind, point }))
    : [...new Map(profiles.filter((zone) => zone.baseName && zone.baseAddress)
      .map((zone) => [zone.baseAddress, { address: zone.baseAddress, name: zone.baseName }])).values()];
  const bases = availableBases.sort((a, b) => a.name.localeCompare(b.name, "es") || a.address.localeCompare(b.address, "es"));
  const terminals = savedBases.length ? bases.filter((row) => row.kind === "WAREHOUSE") : bases;
  const find = (list, ref, address) => list.find((row) => ref ? row.baseRef === ref : row.address === address);
  const base = find(bases, baseRef, baseAddress) ?? (!baseRef && !baseAddress && bases.length === 1 ? bases[0] : null);
  const foreignOrigin = route.origin.countryCode !== "DO";
  const foreignDestination = Boolean(route.destination && route.destination.countryCode !== "DO");
  const terminal = find(terminals, localTerminalRef, localTerminalAddress) ?? null;
  const classify = (address) => geography?.metro
    ? classifyLogisticsMetro(geography.metro, address)
    : uniqueValue(localityProfiles(zones, address).map((zone) => zone.zoneType));
  const area = { origin: classify(route.origin), destination: classify(route.destination) };
  const result = { revision: route.revision, bases, terminals, base, terminal, foreignOrigin, foreignDestination, area,
    metroVersion: geography?.metro?.version ?? null, legs: [], preparation: [], distanceKm: null, estimated: false };
  if (!base || !route.destination || ((foreignOrigin || foreignDestination) && !terminal)) return result;
  const format = (address) => fields(address).filter(Boolean).join(", ");
  const stopAt = (base) => ({ label: base.name, address: base.address + ", República Dominicana", ...(base.point && { point: base.point }) });
  const stops = [
    stopAt(base),
    foreignOrigin ? stopAt(terminal) : { label: "Origen", address: format(route.origin), city: route.origin.cityMunicipality },
    foreignDestination ? stopAt(terminal) : { label: "Destino", address: format(route.destination), city: route.destination.cityMunicipality },
  ];
  const pointAtBase = base.point ?? (provider ? attempt(() => provider.locate(stops[0].address)) : null);
  const points = await Promise.all(stops.map((stop) => {
    if (stop.point) return stop.point;
    if (key(stop.address) === key(stops[0].address)) return pointAtBase;
    return provider ? attempt(() => provider.locate(stop.address, stop.city)) : null;
  }));
  const loop = [0, 1, 2, 0];
  const prep = [0, 1, 0];
  const measure = (sequence) => provider && sequence.every((index) => points[index])
    ? attempt(() => provider.legs(sequence.map((index) => points[index]))) : null;
  const [measured, measuredPrep] = await Promise.all([measure(loop), measure(prep)]);
  const originReference = foreignOrigin ? null : reference(localityProfiles(profiles, route.origin), base);
  const destinationReference = foreignDestination ? null : reference(localityProfiles(profiles, route.destination), base);
  const sameStop = (first, second) => points[first] && points[second]
    ? points[first][0] === points[second][0] && points[first][1] === points[second][1]
    : key(stops[first].address) === key(stops[second].address);
  const references = [
    originReference,
    terminal && sameStop(foreignOrigin ? 1 : 2, 0) ? (foreignDestination ? originReference : destinationReference) : null,
    destinationReference,
  ];
  const build = (sequence, measurements, fallback) => sequence.slice(1).map((to, index) => {
    const from = sequence[index];
    const distance = sameStop(from, to) ? { distanceKm: 0, durationMinutes: 0, source: "Mismo punto", estimated: false }
      : measurements?.[index] ?? fallback[index];
    const { label: fromLabel, address: fromAddress } = stops[from];
    const { label: toLabel, address: toAddress } = stops[to];
    return { from: { label: fromLabel, address: fromAddress }, to: { label: toLabel, address: toAddress }, origin: points[from], destination: points[to],
      distanceKm: distance?.distanceKm ?? null, source: distance?.source ?? null,
      durationMinutes: distance?.durationMinutes ?? null,
      estimated: Boolean(distance?.estimated) || route.destinationStatus === "APPROXIMATE",
      returnToBase: sameStop(to, 0) };
  });
  const legs = build(loop, measured, references);
  const preparation = build(prep, measuredPrep, [references[0], references[0]]);
  const total = legs.every(({ distanceKm }) => distanceKm !== null)
    ? Math.round(legs.reduce((sum, leg) => sum + leg.distanceKm, 0) * 100) / 100 : null;
  return { ...result, legs, preparation, distanceKm: total, estimated: legs.some((leg) => leg.estimated) };
}
