function toRadians(value) {
  return (Number(value || 0) * Math.PI) / 180;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = toRadians(Number(lat2 || 0) - Number(lat1 || 0));
  const dLng = toRadians(Number(lng2 || 0) - Number(lng1 || 0));
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
}

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function normalizeZoneType(value) {
  return String(value || "").trim().toUpperCase() === "METRO" ? "METRO" : "INTERIOR";
}

function resolveZoneRuleForRegion(region, zoneRule) {
  return {
    ...zoneRule,
    kmRate: Number.isFinite(Number(region?.overrideKmRate)) ? Number(region.overrideKmRate) : Number(zoneRule?.kmRate || 0),
    freeKm: Number.isFinite(Number(region?.overrideFreeKm)) ? Number(region.overrideFreeKm) : Number(zoneRule?.freeKm || 0),
    slaHours: Number.isFinite(Number(region?.overrideSlaHours)) ? Number(region.overrideSlaHours) : Number(zoneRule?.slaHours || 0),
    surchargePercent: Number.isFinite(Number(region?.overrideSurchargePercent))
      ? Number(region.overrideSurchargePercent)
      : Number(zoneRule?.surchargePercent || 0),
  };
}

function normalizeStatus(value) {
  return String(value || "").trim().toUpperCase();
}

function isVehicleAvailable(vehicle) {
  const status = normalizeStatus(vehicle?.status);
  return !status || status === "AVAILABLE" || status === "DISPONIBLE";
}

function getVehicleCapacity(vehicle) {
  const direct = Number(vehicle?.capacityCbm);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const fallback = Number(vehicle?.capacity);
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
}

function getVehicleOperationalCost(vehicle, fallbackKmRate) {
  const direct = Number(vehicle?.operationalCostPerKm);
  if (Number.isFinite(direct) && direct > 0) return direct;
  return Math.max(1, Number(fallbackKmRate || 0) * 0.45);
}

function deriveWeekend(serviceDate) {
  const date = serviceDate instanceof Date ? serviceDate : new Date(serviceDate);
  if (!Number.isFinite(date.getTime())) return false;
  const day = date.getDay();
  return day === 0 || day === 6;
}

function deriveAfterHours(serviceDate) {
  const date = serviceDate instanceof Date ? serviceDate : new Date(serviceDate);
  if (!Number.isFinite(date.getTime())) return false;
  const hour = date.getHours();
  return hour < 8 || hour >= 18;
}

export function calculateLogisticEngine(input, deps) {
  const flags = [];
  const originCode = String(input?.originRegionCode || "").trim().toUpperCase();
  const destinationCode = String(input?.destinationRegionCode || "").trim().toUpperCase();
  const originRegion = (deps?.regions || []).find((region) => String(region?.code || "").trim().toUpperCase() === originCode);
  const destinationRegion = (deps?.regions || []).find(
    (region) => String(region?.code || "").trim().toUpperCase() === destinationCode,
  );

  if (!Array.isArray(deps?.hubs) || deps.hubs.length === 0) throw new Error("NO_HUB_CONFIGURED");
  if (!originRegion) throw new Error("ORIGIN_REGION_NOT_FOUND");

  const nearestHub = deps.hubs
    .map((hub) => ({ hub, distance: haversineKm(hub.lat, hub.lng, originRegion.lat, originRegion.lng) }))
    .sort((a, b) => a.distance - b.distance)[0];
  const hubDistanceKm = round2(nearestHub.distance);
  const zoneTypeOrigin = normalizeZoneType(originRegion.zoneType);
  const zoneTypeDestination = destinationRegion ? normalizeZoneType(destinationRegion.zoneType) : undefined;
  const zoneRuleOrigin = (deps.zoneRules || []).find((rule) => normalizeZoneType(rule?.zoneType) === zoneTypeOrigin);
  if (!zoneRuleOrigin) throw new Error("ORIGIN_ZONE_RULE_MISSING");
  const effectiveZoneRuleOrigin = resolveZoneRuleForRegion(originRegion, zoneRuleOrigin);

  if (zoneTypeOrigin === "INTERIOR") flags.push("OUT_OF_METRO");
  if (zoneTypeDestination === "INTERIOR") flags.push("DESTINATION_INTERIOR");
  const chargeableKm = Math.max(0, hubDistanceKm - Number(effectiveZoneRuleOrigin.freeKm || 0));
  let visitFee = chargeableKm * Number(effectiveZoneRuleOrigin.kmRate || 0);
  const surveyMinTripFee = Number(deps?.globalSettings?.surveyMinTripFee || 0);
  if (surveyMinTripFee > 0) visitFee = Math.max(visitFee, surveyMinTripFee);

  let transportDistanceKm = 0;
  let transportCost = 0;
  let selectedVehicle;
  if (String(input?.serviceMode || "").toUpperCase() !== "INTERNACIONAL") {
    if (!destinationRegion) {
      flags.push("MISSING_DESTINATION_REGION");
    } else {
      transportDistanceKm = round2(haversineKm(originRegion.lat, originRegion.lng, destinationRegion.lat, destinationRegion.lng));
      const candidateVehicles = (deps?.vehicles || [])
        .filter((vehicle) => isVehicleAvailable(vehicle))
        .filter((vehicle) => getVehicleCapacity(vehicle) >= Math.max(0, Number(input?.estimatedVolumeCbm || 0)));
      if (!candidateVehicles.length) {
        flags.push("NO_VEHICLE_AVAILABLE");
      } else {
        selectedVehicle = [...candidateVehicles].sort((a, b) => {
          const aCost = getVehicleOperationalCost(a, deps?.globalSettings?.defaultKmRate);
          const bCost = getVehicleOperationalCost(b, deps?.globalSettings?.defaultKmRate);
          if (aCost !== bCost) return aCost - bCost;
          return getVehicleCapacity(a) - getVehicleCapacity(b);
        })[0];
      }
      if (selectedVehicle) {
        const baseCost =
          transportDistanceKm *
          getVehicleOperationalCost(selectedVehicle, deps?.globalSettings?.defaultKmRate) *
          Number(effectiveZoneRuleOrigin.kmMultiplier || 1);
        transportCost = baseCost * (1 + Number(effectiveZoneRuleOrigin.surchargePercent || 0) / 100);
      }
    }
  }

  const isWeekend = typeof input?.isWeekend === "boolean" ? input.isWeekend : deriveWeekend(input?.serviceDate);
  const isAfterHours = typeof input?.isAfterHours === "boolean" ? input.isAfterHours : deriveAfterHours(input?.serviceDate);
  let scheduleSurchargePercent = 0;
  if (isWeekend) {
    flags.push("WEEKEND_SERVICE");
    scheduleSurchargePercent += Number(
      effectiveZoneRuleOrigin.weekendSurchargePercent ?? deps?.globalSettings?.weekendSurchargePercent ?? 0,
    );
  }
  if (isAfterHours) {
    flags.push("AFTER_HOURS");
    scheduleSurchargePercent += Number(
      effectiveZoneRuleOrigin.afterHoursSurchargePercent ?? deps?.globalSettings?.afterHoursSurchargePercent ?? 0,
    );
  }

  const subtotal = round2(visitFee + transportCost);
  const totalOperationalCost = round2(subtotal * (1 + scheduleSurchargePercent / 100));
  const appliedMarginPercent = Number(deps?.minimumMarginPercent || deps?.globalSettings?.minimumMarginPercent || 0);
  const suggestedCommercialPrice = round2(totalOperationalCost * (1 + appliedMarginPercent / 100));
  if (appliedMarginPercent > 0) flags.push("MARGIN_APPLIED");
  if (hubDistanceKm > Math.max(25, Number(effectiveZoneRuleOrigin.freeKm || 0) + 10)) flags.push("LONG_DISTANCE_SERVICE");

  return {
    selectedHubId: nearestHub.hub.id,
    selectedVehicleId: selectedVehicle?.id,
    selectedVehicleLabel: selectedVehicle?.label,
    hubDistanceKm,
    transportDistanceKm,
    visitFee: round2(visitFee),
    transportCost: round2(transportCost),
    zoneTypeOrigin,
    zoneTypeDestination,
    slaHours: Number(originRegion?.overrideSlaHours || originRegion?.slaHours || effectiveZoneRuleOrigin.slaHours || 24),
    suggestedCommercialPrice,
    totalOperationalCost,
    flags,
    appliedMarginPercent,
    scheduleSurchargePercent,
  };
}
