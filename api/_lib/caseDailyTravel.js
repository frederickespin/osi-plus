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
      return legs.map(({ distance }) => ({ distanceKm: Math.round(distance / 10) / 100, source: "Ruta vial medida", estimated: false }));
    },
  };
}

const attempt = async (work) => { try { return await work(); } catch { return null; } };

export async function caseDailyTravel(zones, route, { baseAddress, localTerminalAddress } = {}, provider = configuredCaseRoadProvider()) {
  const profiles = roadProfiles(zones);
  const bases = [...new Map(profiles.filter((zone) => zone.baseName && zone.baseAddress)
    .map((zone) => [zone.baseAddress, { address: zone.baseAddress, name: zone.baseName }])).values()]
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  const base = bases.find((row) => row.address === baseAddress) ?? (!baseAddress && bases.length === 1 ? bases[0] : null);
  const foreignOrigin = route.origin.countryCode !== "DO";
  const foreignDestination = Boolean(route.destination && route.destination.countryCode !== "DO");
  const terminal = bases.find((row) => row.address === localTerminalAddress) ?? null;
  const originProfiles = localityProfiles(zones, route.origin);
  const destinationProfiles = localityProfiles(zones, route.destination);
  const area = { origin: uniqueValue(originProfiles.map((zone) => zone.zoneType)), destination: uniqueValue(destinationProfiles.map((zone) => zone.zoneType)) };
  const result = { revision: route.revision, bases, base, terminal, foreignOrigin, foreignDestination, area, legs: [], preparation: [], distanceKm: null, estimated: false };
  if (!base || !route.destination || ((foreignOrigin || foreignDestination) && !terminal)) return result;
  const format = (address) => fields(address).filter(Boolean).join(", ");
  const stops = [
    { label: base.name, address: base.address + ", República Dominicana" },
    foreignOrigin ? { label: terminal.name, address: terminal.address + ", República Dominicana" } : { label: "Origen", address: format(route.origin), city: route.origin.cityMunicipality },
    foreignDestination ? { label: terminal.name, address: terminal.address + ", República Dominicana" } : { label: "Destino", address: format(route.destination), city: route.destination.cityMunicipality },
  ];
  const pointAtBase = provider ? attempt(() => provider.locate(stops[0].address)) : null;
  const points = provider ? await Promise.all(stops.map((stop) => {
    if (key(stop.address) === key(stops[0].address)) return pointAtBase;
    return attempt(() => provider.locate(stop.address, stop.city));
  })) : [null, null, null];
  const loop = [0, 1, 2, 0];
  const prep = [0, 1, 0];
  const measure = (sequence) => provider && sequence.every((index) => points[index])
    ? attempt(() => provider.legs(sequence.map((index) => points[index]))) : null;
  const [measured, measuredPrep] = await Promise.all([measure(loop), measure(prep)]);
  const originReference = foreignOrigin ? null : reference(localityProfiles(profiles, route.origin), base);
  const destinationReference = foreignDestination ? null : reference(localityProfiles(profiles, route.destination), base);
  const references = [
    originReference,
    terminal?.address === base.address ? (foreignDestination ? originReference : destinationReference) : null,
    destinationReference,
  ];
  const build = (sequence, measurements, fallback) => sequence.slice(1).map((to, index) => {
    const from = sequence[index];
    const sameAddress = key(stops[from].address) === key(stops[to].address);
    const distance = sameAddress ? { distanceKm: 0, source: "Mismo punto", estimated: false }
      : measurements?.[index] ?? fallback[index];
    return { from: stops[from], to: stops[to], origin: points[from], destination: points[to],
      distanceKm: distance?.distanceKm ?? null, source: distance?.source ?? null,
      estimated: Boolean(distance?.estimated) || route.destinationStatus === "APPROXIMATE",
      returnToBase: key(stops[to].address) === key(stops[0].address) };
  });
  const legs = build(loop, measured, references);
  const preparation = build(prep, measuredPrep, [references[0], references[0]]);
  const total = legs.every(({ distanceKm }) => distanceKm !== null)
    ? Math.round(legs.reduce((sum, leg) => sum + leg.distanceKm, 0) * 100) / 100 : null;
  return { ...result, legs, preparation, distanceKm: total, estimated: legs.some((leg) => leg.estimated) };
}
