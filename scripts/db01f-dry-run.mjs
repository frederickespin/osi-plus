import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const DEFAULTS = Object.freeze({
  maxAutomaticDistanceKm: 120,
  autoExtendedSla: true,
  highRiskZones: ["STI", "PUNTA_CANA"],
  requireApprovalOverKm: 80,
});

function normalizedRiskRules(value) {
  return {
    maxAutomaticDistanceKm: Number(value?.maxAutomaticDistanceKm || 0),
    autoExtendedSla: value?.autoExtendedSla === true,
    highRiskZones: [...new Set((value?.highRiskZones || []).map((item) => String(item).trim().toUpperCase()).filter(Boolean))],
    requireApprovalOverKm: Number(value?.requireApprovalOverKm || 0),
  };
}

function candidateRules(rules) {
  const candidates = [];
  if (rules.requireApprovalOverKm > 0) candidates.push({
    code: "LEGACY_DISTANCE_REVIEW", conditionType: "DISTANCE_OVER_KM",
    config: { field: "hubDistanceKm", thresholdKm: rules.requireApprovalOverKm }, result: "REVIEW_REQUIRED",
    source: "riskRules.requireApprovalOverKm",
  });
  if (rules.maxAutomaticDistanceKm > 0) candidates.push({
    code: "LEGACY_DISTANCE_BLOCK", conditionType: "DISTANCE_OVER_KM",
    config: { field: "hubDistanceKm", thresholdKm: rules.maxAutomaticDistanceKm }, result: "BLOCKED",
    source: "riskRules.maxAutomaticDistanceKm",
  });
  if (rules.highRiskZones.length) candidates.push({
    code: "LEGACY_HIGH_RISK_REGION", conditionType: "REGION_IN_SET",
    config: { fields: ["originRegionCode", "destinationRegionCode"], regionCodes: rules.highRiskZones },
    result: "REVIEW_REQUIRED", source: "riskRules.highRiskZones",
  });
  return candidates;
}

function legacyFlags(rules, sample) {
  const flags = [];
  if (rules.highRiskZones.includes(sample.originRegionCode) || rules.highRiskZones.includes(sample.destinationRegionCode)) flags.push("HIGH_RISK_ZONE");
  if (sample.hubDistanceKm > rules.requireApprovalOverKm && rules.requireApprovalOverKm > 0) flags.push("DISTANCE_REQUIRES_APPROVAL");
  if (sample.hubDistanceKm > rules.maxAutomaticDistanceKm && rules.maxAutomaticDistanceKm > 0) flags.push("DISTANCE_OVER_AUTOMATIC_LIMIT");
  return flags;
}

function candidateMatches(candidates, sample) {
  return candidates.filter((rule) => {
    if (rule.conditionType === "DISTANCE_OVER_KM") return sample[rule.config.field] > rule.config.thresholdKm;
    return rule.config.fields.some((field) => rule.config.regionCodes.includes(sample[field]));
  }).map((rule) => rule.code);
}

export async function analyzeLegacyRiskRules({ dataPath = "data/logistic-engine-admin.json" } = {}) {
  const parsed = JSON.parse(await readFile(dataPath, "utf8"));
  const configured = normalizedRiskRules(parsed?.riskRules || {});
  const defaults = normalizedRiskRules(DEFAULTS);
  const candidates = candidateRules(configured);
  const possibleTypos = configured.highRiskZones.filter((code) => code === "COSNTANZA").map((code) => ({ code, suggestion: "CONSTANZA" }));
  const unconvertible = [{
    source: "riskRules.autoExtendedSla",
    value: configured.autoExtendedSla,
    reason: "Se almacena y se edita, pero no existe consumidor que modifique el SLA en el motor actual.",
  }];
  const duplicateSources = candidates
    .filter((candidate, index) => candidates.findIndex((item) => JSON.stringify(item.config) === JSON.stringify(candidate.config) && item.result === candidate.result) !== index)
    .map((item) => item.source);
  const contradictions = [];
  if (configured.requireApprovalOverKm > configured.maxAutomaticDistanceKm && configured.maxAutomaticDistanceKm > 0) {
    contradictions.push("El umbral de revisión es mayor que el umbral de bloqueo.");
  }
  const samples = [
    { name: "below-review", hubDistanceKm: 79, originRegionCode: "DN", destinationRegionCode: "SDE" },
    { name: "review-distance", hubDistanceKm: 81, originRegionCode: "DN", destinationRegionCode: "SDE" },
    { name: "blocked-distance", hubDistanceKm: 121, originRegionCode: "DN", destinationRegionCode: "SDE" },
    { name: "risk-region", hubDistanceKm: 20, originRegionCode: configured.highRiskZones[0] || "STI", destinationRegionCode: "DN" },
  ];
  const comparison = samples.map((sample) => ({ sample: sample.name, legacyFlags: legacyFlags(configured, sample), candidateMatches: candidateMatches(candidates, sample) }));
  return {
    mode: "DRY_RUN_ONLY",
    source: dataPath,
    detected: { defaults, configured },
    candidateRules: candidates,
    thresholds: { reviewKm: configured.requireApprovalOverKm, blockKm: configured.maxAutomaticDistanceKm },
    duplicates: duplicateSources,
    contradictions,
    possibleTypos,
    unconvertible,
    comparison,
    importPerformed: false,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(JSON.stringify(await analyzeLegacyRiskRules(), null, 2));
}
