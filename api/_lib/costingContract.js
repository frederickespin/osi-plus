import crypto from "node:crypto";

export class CostingError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export function costingFail(code, status = 400) {
  throw new CostingError(code, status);
}

export function canonicalCostingJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalCostingJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalCostingJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function costingHash(value) {
  return crypto.createHash("sha256").update(canonicalCostingJson(value)).digest("hex");
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CURRENCY = /^[A-Z]{3}$/;
const FAMILIES = Object.freeze(["LABOR", "TRANSPORT", "MATERIAL", "CRATING", "ASSET", "TRAVEL", "THIRD_PARTY", "FREIGHT", "CUSTOMS", "PERMIT", "ADDITIONAL", "RISK", "CURRENCY_COMPENSATION"]);
const SOURCES = Object.freeze(["SURVEY", "SERVICE", "COMBO", "ADMIN", "MOTOR", "PROVIDER", "MATERIAL_COST", "ASSET_COST", "VEHICLE_COST", "EXCHANGE_RATE"]);
const CLASSES = Object.freeze(["PR", "EX", "DE"]);

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) costingFail("COSTING_PAYLOAD_INVALID");
  return value;
}

function exactKeys(value, keys) {
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key))) costingFail("COSTING_PAYLOAD_INVALID");
}

function asText(value, max = 500, nullable = false) {
  if (nullable && (value === null || value === undefined)) return null;
  if (typeof value !== "string" || value !== value.trim() || !value || value.length > max) costingFail("COSTING_PAYLOAD_INVALID");
  return value;
}

function asUuid(value) {
  const result = asText(value, 36);
  if (!UUID_V4.test(result)) costingFail("COSTING_REFERENCE_INVALID");
  return result;
}

function asCurrency(value) {
  const result = asText(value, 3);
  if (!CURRENCY.test(result)) costingFail("COSTING_CURRENCY_INVALID");
  return result;
}

function asInteger(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isInteger(value) || value < min || value > max) costingFail("COSTING_PAYLOAD_INVALID");
  return value;
}

function asDecimal(value, { positive = false, nullable = false } = {}) {
  if (nullable && (value === null || value === undefined)) return null;
  if ((typeof value !== "string" && typeof value !== "number") || !/^(?:0|[1-9]\d*)(?:\.\d{1,10})?$/.test(String(value))) costingFail("COSTING_PAYLOAD_INVALID");
  if (positive ? Number(value) <= 0 : Number(value) < 0) costingFail("COSTING_PAYLOAD_INVALID");
  return String(value);
}

function asTimestamp(value, nullable = false) {
  if (nullable && (value === null || value === undefined)) return null;
  const parsed = Date.parse(asText(value, 40));
  if (!Number.isFinite(parsed)) costingFail("COSTING_PAYLOAD_INVALID");
  return new Date(parsed).toISOString();
}

function asEnum(value, allowed) {
  const result = asText(value, 48);
  if (!allowed.includes(result)) costingFail("COSTING_PAYLOAD_INVALID");
  return result;
}

function asJsonObject(value) {
  return asObject(value);
}

function command(raw, operation, payload) {
  const value = asObject(raw);
  const requestId = asUuid(value.requestId);
  const payloadHash = asText(value.payloadHash, 64);
  const expected = costingHash({ operation, requestId, ...payload });
  if (payloadHash !== expected) costingFail("COSTING_PAYLOAD_HASH_MISMATCH");
  return Object.freeze({ operation, requestId, payloadHash, ...payload });
}

export function normalizeCostingCalculate(raw) {
  const value = asObject(raw);
  exactKeys(value, ["requestId", "payloadHash", "caseRef", "logisticsPlanRevisionRef", "baseCurrency"]);
  return command(value, "COSTING_CALCULATE", {
    caseRef: asUuid(value.caseRef),
    logisticsPlanRevisionRef: asUuid(value.logisticsPlanRevisionRef),
    baseCurrency: asCurrency(value.baseCurrency),
  });
}

export function normalizeCostingPublish(raw) {
  const value = asObject(raw);
  exactKeys(value, ["requestId", "payloadHash", "calculationRef"]);
  return command(value, "COSTING_PUBLISH", { calculationRef: asUuid(value.calculationRef) });
}

export function normalizeCostingOverride(raw) {
  const value = asObject(raw);
  exactKeys(value, ["requestId", "payloadHash", "revisionRef", "lineRef", "kind", "expectedSuggested", "finalValue", "reason"]);
  return command(value, "COSTING_OVERRIDE", {
    revisionRef: asUuid(value.revisionRef),
    lineRef: value.lineRef ? asUuid(value.lineRef) : null,
    kind: asEnum(value.kind, ["COST", "EXCHANGE_RATE", "MARGIN", "SUGGESTED_PRICE", "CLASSIFICATION"]),
    expectedSuggested: asJsonObject(value.expectedSuggested),
    finalValue: asJsonObject(value.finalValue),
    reason: asText(value.reason, 1000),
  });
}

export function normalizeCostingAuthorization(raw) {
  const value = asObject(raw);
  exactKeys(value, ["requestId", "payloadHash", "overrideRef", "decision", "reason"]);
  return command(value, "COSTING_MARGIN_AUTHORIZE", {
    overrideRef: asUuid(value.overrideRef),
    decision: asEnum(value.decision, ["AUTHORIZED", "REJECTED"]),
    reason: asText(value.reason, 1000),
  });
}

export function normalizeCostingIssueResolution(raw) {
  const value = asObject(raw);
  exactKeys(value, ["requestId", "payloadHash", "revisionRef", "issueRef", "expectedVersion", "reason"]);
  return command(value, "COSTING_ISSUE_RESOLVE", {
    revisionRef: asUuid(value.revisionRef),
    issueRef: asUuid(value.issueRef),
    expectedVersion: asInteger(value.expectedVersion, 1),
    reason: asText(value.reason, 1000),
  });
}

export function normalizeCostingRule(raw) {
  const value = asObject(raw);
  exactKeys(value, ["requestId", "payloadHash", "seriesRef", "family", "code", "name", "classification", "source", "priority", "specificity", "conditions", "unitCost", "currency", "minimumMarginBps", "recommendedMarginBps", "result", "state", "validFrom", "validTo"]);
  const payload = {
    seriesRef: value.seriesRef ? asUuid(value.seriesRef) : null,
    family: asEnum(value.family, FAMILIES),
    code: asText(value.code, 80),
    name: asText(value.name, 180),
    classification: asEnum(value.classification, CLASSES),
    source: asEnum(value.source, SOURCES),
    priority: asInteger(value.priority, 0),
    specificity: asInteger(value.specificity, 0),
    conditions: asJsonObject(value.conditions),
    unitCost: asDecimal(value.unitCost, { nullable: true }),
    currency: asCurrency(value.currency),
    minimumMarginBps: value.minimumMarginBps == null ? null : asInteger(value.minimumMarginBps, 0, 9999),
    recommendedMarginBps: value.recommendedMarginBps == null ? null : asInteger(value.recommendedMarginBps, 0, 9999),
    result: asJsonObject(value.result),
    state: asEnum(value.state, ["DRAFT", "ACTIVE", "INACTIVE"]),
    validFrom: asTimestamp(value.validFrom, true),
    validTo: asTimestamp(value.validTo, true),
  };
  if (payload.minimumMarginBps != null && payload.recommendedMarginBps != null && payload.minimumMarginBps > payload.recommendedMarginBps) costingFail("COSTING_MARGIN_POLICY_INVALID");
  if (payload.validFrom && payload.validTo && payload.validTo <= payload.validFrom) costingFail("COSTING_RULE_PERIOD_INVALID");
  return command(value, "COSTING_RULE_VERSION", payload);
}

export function normalizeCostingExchangeRate(raw) {
  const value = asObject(raw);
  exactKeys(value, ["requestId", "payloadHash", "seriesRef", "baseCurrency", "quoteCurrency", "rate", "source", "state", "effectiveAt", "validTo"]);
  const payload = {
    seriesRef: value.seriesRef ? asUuid(value.seriesRef) : null,
    baseCurrency: asCurrency(value.baseCurrency),
    quoteCurrency: asCurrency(value.quoteCurrency),
    rate: asDecimal(value.rate, { positive: true }),
    source: asText(value.source, 120),
    state: asEnum(value.state, ["DRAFT", "ACTIVE", "INACTIVE"]),
    effectiveAt: asTimestamp(value.effectiveAt),
    validTo: asTimestamp(value.validTo, true),
  };
  if (payload.baseCurrency === payload.quoteCurrency || (payload.validTo && payload.validTo <= payload.effectiveAt)) costingFail("COSTING_EXCHANGE_RATE_INVALID");
  return command(value, "COSTING_EXCHANGE_RATE_VERSION", payload);
}

function scaled(value, digits) {
  const [whole, fraction = ""] = String(value).split(".");
  const padded = `${fraction}${"0".repeat(digits)}`.slice(0, digits);
  return BigInt(whole) * 10n ** BigInt(digits) + BigInt(padded || "0");
}

function divideRounded(numerator, denominator) {
  return (numerator + denominator / 2n) / denominator;
}

function decimal(value, digits = 6) {
  const base = 10n ** BigInt(digits);
  const whole = value / base;
  const fraction = (value % base).toString().padStart(digits, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}

function convertUnitCost(unitCost, rate) {
  return divideRounded(scaled(unitCost, 6) * scaled(rate, 10), 10n ** 10n);
}

function totalFor(unitCostMicros, quantity) {
  return divideRounded(unitCostMicros * scaled(quantity, 4), 10n ** 4n);
}

function suggestedFor(totalMicros, marginBps) {
  return divideRounded(totalMicros * 10000n, BigInt(10000 - marginBps));
}

function resolveRate(baseCurrency, originalCurrency, rates) {
  if (baseCurrency === originalCurrency) return { rate: "1", rateRef: null, version: null, source: "IDENTITY" };
  const direct = rates.find((item) => item.baseCurrency === originalCurrency && item.quoteCurrency === baseCurrency);
  if (direct) return { rate: String(direct.rate), rateRef: direct.rateRef, version: direct.version, source: direct.source };
  const inverse = rates.find((item) => item.baseCurrency === baseCurrency && item.quoteCurrency === originalCurrency);
  if (!inverse) return null;
  const inverseScaled = scaled(inverse.rate, 10);
  const resolved = divideRounded(10n ** 20n, inverseScaled);
  return { rate: decimal(resolved, 10), rateRef: inverse.rateRef, version: inverse.version, source: inverse.source, inverse: true };
}

function issue(code, family, message, source = "MOTOR", snapshot = {}) {
  return { code, severity: "BLOCKER", family, message, source, sourceSnapshot: snapshot, status: "OPEN", version: 1 };
}

export function calculateCostingSnapshot({ baseCurrency, logisticsRevision, authorities = [], rates = [], compensationRules = [] }) {
  if (!logisticsRevision || logisticsRevision.status !== "PUBLISHED") costingFail("COSTING_LOGISTICS_REVISION_REQUIRED", 409);
  const authorityByItem = new Map(authorities.map((authority) => [authority.logisticsItemRef, authority]));
  const lines = [];
  const issues = [];

  for (const sourceIssue of logisticsRevision.issues || []) {
    if (sourceIssue.status === "OPEN" && sourceIssue.severity === "BLOCKER") {
      issues.push(issue("LOGISTICS_BLOCKER_PRESENT", sourceIssue.family || null, "El plan logístico publicado contiene un bloqueo pendiente.", "MOTOR", { logisticsIssueRef: sourceIssue.issueRef, logisticsIssueCode: sourceIssue.code }));
    }
  }

  for (const item of logisticsRevision.items || []) {
    const authority = authorityByItem.get(item.itemRef);
    const family = authority?.family || ({ LABOR: "LABOR", TRANSPORT: "TRANSPORT", MATERIAL: "MATERIAL", CRATING: "CRATING", ASSET: "ASSET", EXTERNAL: "THIRD_PARTY", TRAVEL: "TRAVEL", PERMIT: "PERMIT" }[item.family]);
    if (item.source === "PROVIDER" && item.priceStatus === "PENDING") {
      issues.push(issue("PROVIDER_PRICE_PENDING", family, "El precio del proveedor continúa pendiente.", "PROVIDER", { logisticsItemRef: item.itemRef }));
    }
    if (!authority || authority.unitCost == null || !authority.sourceRef || !authority.sourceVersion) {
      issues.push(issue(item.source === "PROVIDER" ? "EXTERNAL_REFERENCE_MISSING" : "COST_VERSION_MISSING", family, "No existe una fuente de costo versionada para el concepto.", item.source === "PROVIDER" ? "PROVIDER" : "ADMIN", { logisticsItemRef: item.itemRef }));
      continue;
    }
    const conversion = resolveRate(baseCurrency, authority.currency, rates);
    if (!conversion) {
      issues.push(issue("CURRENCY_RATE_MISSING", family, "No existe una tasa versionada para convertir el costo.", "EXCHANGE_RATE", { sourceCurrency: authority.currency, baseCurrency }));
      continue;
    }
    const quantity = String(item.quantity ?? item.requiredQuantity ?? 0);
    const baseUnitCost = convertUnitCost(authority.unitCost, conversion.rate);
    const totalCost = totalFor(baseUnitCost, quantity);
    const classification = authority.classification;
    const minimumMarginBps = classification === "PR" ? authority.minimumMarginBps : null;
    const recommendedMarginBps = classification === "PR" ? authority.recommendedMarginBps : null;
    if (classification === "PR" && (minimumMarginBps == null || recommendedMarginBps == null)) {
      issues.push(issue("MARGIN_POLICY_MISSING", family, "El costo propio no tiene una política de margen completa.", "ADMIN", { sourceRef: authority.sourceRef, sourceVersion: authority.sourceVersion }));
    }
    const suggested = classification === "PR" && recommendedMarginBps != null ? suggestedFor(totalCost, recommendedMarginBps) : totalCost;
    lines.push({
      logisticsItemRef: item.itemRef,
      family,
      concept: item.label,
      classification,
      source: authority.source,
      sourceRef: authority.sourceRef,
      sourceVersion: authority.sourceVersion,
      quantity,
      unit: item.unit || authority.unit || "UNIT",
      originalCurrency: authority.currency,
      originalUnitCost: String(authority.unitCost),
      exchangeRateRef: conversion.rateRef,
      exchangeRateVersion: conversion.version,
      exchangeRate: conversion.rate,
      exchangeRateSource: conversion.source,
      baseCurrency,
      baseUnitCost: decimal(baseUnitCost),
      totalCost: decimal(totalCost),
      minimumMarginBps,
      recommendedMarginBps,
      suggestedPrice: decimal(suggested),
      priceStatus: classification === "PR" ? "RECOMMENDED" : "NO_MARGIN",
      snapshot: {
        logisticsSource: item.source,
        logisticsSourceRef: item.sourceRef || null,
        logisticsSourceVersion: item.sourceVersion || null,
        logisticsSnapshot: item.snapshot || {},
        costAuthority: authority.authoritySnapshot || {},
        costAuthorityHash: authority.logicalSha256 || null,
      },
    });
  }

  for (const compensation of compensationRules) {
    const basis = lines.filter((line) => compensation.appliesTo?.includes(line.classification)).reduce((sum, line) => sum + scaled(line.totalCost, 6), 0n);
    const totalCost = divideRounded(basis * BigInt(compensation.basisPoints), 10000n);
    if (totalCost === 0n) continue;
    lines.push({ logisticsItemRef: null, family: "CURRENCY_COMPENSATION", concept: compensation.name, classification: compensation.classification, source: "ADMIN", sourceRef: compensation.ruleRef, sourceVersion: compensation.version, quantity: "1", unit: "UNIT", originalCurrency: baseCurrency, originalUnitCost: decimal(totalCost), exchangeRateRef: null, exchangeRateVersion: null, exchangeRate: "1", exchangeRateSource: "IDENTITY", baseCurrency, baseUnitCost: decimal(totalCost), totalCost: decimal(totalCost), minimumMarginBps: compensation.classification === "PR" ? compensation.minimumMarginBps : null, recommendedMarginBps: compensation.classification === "PR" ? compensation.recommendedMarginBps : null, suggestedPrice: decimal(compensation.classification === "PR" && compensation.recommendedMarginBps != null ? suggestedFor(totalCost, compensation.recommendedMarginBps) : totalCost), priceStatus: compensation.classification === "PR" ? "RECOMMENDED" : "NO_MARGIN", snapshot: { basisPoints: compensation.basisPoints, appliesTo: compensation.appliesTo } });
  }

  const sum = (predicate, field = "totalCost") => decimal(lines.filter(predicate).reduce((total, line) => total + scaled(line[field], 6), 0n));
  const ownCost = lines.filter((line) => line.classification === "PR").reduce((total, line) => total + scaled(line.totalCost, 6), 0n);
  const ownSuggested = lines.filter((line) => line.classification === "PR").reduce((total, line) => total + scaled(line.suggestedPrice, 6), 0n);
  const expectedMarginBps = ownSuggested === 0n ? null : Number(divideRounded((ownSuggested - ownCost) * 10000n, ownSuggested));
  return Object.freeze({
    lines: lines.map((line, position) => ({ ...line, position })),
    issues,
    totals: {
      ownCosts: decimal(ownCost),
      externalCosts: sum((line) => line.classification === "EX"),
      disbursements: sum((line) => line.classification === "DE"),
      risks: sum((line) => line.family === "RISK"),
      currencyCompensation: sum((line) => line.family === "CURRENCY_COMPENSATION"),
      totalCost: sum(() => true),
      suggestedPrice: sum(() => true, "suggestedPrice"),
      expectedMarginBps,
    },
  });
}

export const COSTING_FAMILIES = FAMILIES;
export const COSTING_SOURCES = SOURCES;
export const COSTING_CLASSES = CLASSES;
