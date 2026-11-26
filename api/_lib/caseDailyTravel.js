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
  const router = serviceUrl(env.OSI_CASE_ROUTER_URL ?? "https://router.project-osrm.org/");
  if (!router) return null;
  async function query(url) {
    const response = await fetcher(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(3500), redirect: "error" });
    if (!response.ok) throw new Error("CASE_ROAD_SERVICE_UNAVAILABLE");
    return response.json();
  }
  return {
    async locate(address, city) {
      if (!geocoder) return null;
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
    ? classifyLogisticsMetro(geography.metro, address, address?.point)
    : uniqueValue(localityProfiles(zones, address).map((zone) => zone.zoneType));
  const area = { origin: classify(route.origin), destination: classify(route.destination) };
  const baseStop = (row) => ({ label: row.name, address: row.address + ", República Dominicana", point: row.point, local: true });
  function addressStop(label, address) {
    const local = address.countryCode === "DO";
    const addressFields = local ? fields(address) : [address.streetAndNumber, address.sector, address.cityMunicipality, address.provinceState, address.countryCode];
    return {
      label, address: addressFields.filter(Boolean).join(", "), city: address.cityMunicipality, point: local ? address.point : null, local,
      reference: local && base ? reference(localityProfiles(profiles, address), base) : null,
    };
  }
  const stopLabels = { PICKUP: "Recogida", DELIVERY: "Entrega" };
  const originStop = foreignOrigin && terminal ? baseStop(terminal) : addressStop("Origen", route.origin);
  const routeStops = [
    originStop,
    ...(route.stops ?? []).map(({ kind, address }, index) => addressStop(`${stopLabels[kind] ?? "Parada"} ${index + 1}`, address)),
  ];
  if (route.destination) routeStops.push(foreignDestination && terminal ? baseStop(terminal) : addressStop("Destino", route.destination));

  const depot = base ? baseStop(base) : null;
  const stops = depot ? [depot, ...routeStops] : routeStops;
  const lookups = new Map();
  await Promise.all(stops.map(async (stop) => {
    if (!stop.local || stop.point || !provider?.locate) return;
    const addressKey = key(stop.address);
    if (!lookups.has(addressKey)) lookups.set(addressKey, attempt(() => provider.locate(stop.address, stop.city)));
    stop.point = await lookups.get(addressKey);
  }));
  const sameStop = (a, b) => Boolean(a?.local && b?.local && (a.point && b.point
    ? a.point[0] === b.point[0] && a.point[1] === b.point[1] : key(a.address) === key(b.address)));
  const complete = Boolean(route.destination && (!(foreignOrigin || foreignDestination) || terminal));
  const circuit = depot && complete ? [depot, ...routeStops, depot] : null;
  const preparationStops = depot && originStop.local ? [depot, originStop, depot] : [];

  async function buildLegs(sequence) {
    const measurements = [];
    const requests = [];
    // Keep known adjacent legs when the map cannot locate one of the stops.
    // Each contiguous run is routed in order; never bridge over an unknown address.
    if (provider?.legs) {
      for (let start = 0; start < sequence.length;) {
        if (!sequence[start].point) { start++; continue; }
        let end = start + 1;
        while (end < sequence.length && sequence[end].point) end++;
        if (end > start + 1) {
          const offset = start;
          const points = sequence.slice(start, end).map((stop) => stop.point);
          requests.push(attempt(() => provider.legs(points)).then((result) => {
            if (Array.isArray(result) && result.length === points.length - 1) {
              result.forEach((leg, index) => { measurements[offset + index] = leg; });
            }
          }));
        }
        start = end;
      }
    }
    await Promise.all(requests);
    return sequence.slice(1).map((to, index) => {
      const from = sequence[index];
      const atBase = sameStop(to, depot);
      const fallback = atBase ? from.reference : sameStop(from, depot) ? to.reference : null;
      const distance = sameStop(from, to) ? { distanceKm: 0, durationMinutes: 0, source: "Mismo punto", estimated: false }
        : measurements[index] ?? fallback;
      return {
        from: { label: from.label, address: from.address }, to: { label: to.label, address: to.address },
        origin: from.point ?? null, destination: to.point ?? null, distanceKm: distance?.distanceKm ?? null,
        durationMinutes: distance?.durationMinutes ?? null, source: distance?.source ?? null,
        estimated: Boolean(distance?.estimated) || route.destinationStatus === "APPROXIMATE", returnToBase: atBase,
      };
    });
  }
  const [sequenceLegs, preparation] = await Promise.all([buildLegs(circuit ?? routeStops), buildLegs(preparationStops)]);
  const legs = circuit ? sequenceLegs : [];
  const routeLegs = circuit ? sequenceLegs.slice(1, -1) : sequenceLegs;
  const total = (rows, field) => rows.length && rows.every((row) => Number.isFinite(row[field]))
    ? Math.round(rows.reduce((sum, row) => sum + row[field], 0) * 100) / 100 : null;
  return {
    revision: route.revision, bases, terminals, base, terminal, foreignOrigin, foreignDestination, area,
    metroVersion: geography?.metro?.version ?? null, legs, routeLegs, preparation,
    distanceKm: total(legs, "distanceKm"), durationMinutes: total(legs, "durationMinutes"),
    routeDistanceKm: complete ? total(routeLegs, "distanceKm") : null,
    routeDurationMinutes: complete ? total(routeLegs, "durationMinutes") : null,
    estimated: legs.some((leg) => leg.estimated),
  };
}
