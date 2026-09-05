import crypto from "node:crypto";

export class LogisticsEngineError extends Error { constructor(code, status = 400) { super(code); this.code = code; this.status = status; } }
export function logisticsFail(code, status = 400) { throw new LogisticsEngineError(code, status); }
export function canonicalJson(value) { if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`; return JSON.stringify(value); }
export function canonicalHash(value) { return crypto.createHash("sha256").update(canonicalJson(value)).digest("hex"); }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function object(value) { if (!value || typeof value !== "object" || Array.isArray(value)) logisticsFail("LOGISTICS_PAYLOAD_INVALID"); return value; }
function exact(value, keys) { const allowed = new Set(keys); if (Object.keys(value).some((key) => !allowed.has(key))) logisticsFail("LOGISTICS_PAYLOAD_INVALID"); }
function text(value, max = 500, nullable = false) { if (nullable && (value === null || value === undefined)) return null; if (typeof value !== "string" || value !== value.trim() || !value || value.length > max) logisticsFail("LOGISTICS_PAYLOAD_INVALID"); return value; }
function uuid(value) { const result = text(value, 36); if (!UUID.test(result)) logisticsFail("LOGISTICS_REFERENCE_INVALID"); return result; }
function integer(value, min = 0) { if (!Number.isInteger(value) || value < min) logisticsFail("LOGISTICS_PAYLOAD_INVALID"); return value; }
function timestamp(value) { const parsed = Date.parse(text(value, 40)); if (!Number.isFinite(parsed)) logisticsFail("LOGISTICS_PAYLOAD_INVALID"); return new Date(parsed).toISOString(); }
function enumValue(value, allowed) { const result = text(value, 40); if (!allowed.includes(result)) logisticsFail("LOGISTICS_PAYLOAD_INVALID"); return result; }
function operationalObject(value) { const result = object(value); const visit = (node) => { if (!node || typeof node !== "object") return; for (const [key, child] of Object.entries(node)) { if (/^(?:cost|costAmount|margin|markup|salePrice|quote|quotedAmount|providerPrice)$/i.test(key)) logisticsFail("LOGISTICS_COMMERCIAL_VALUE_FORBIDDEN"); visit(child); } }; visit(result); return result; }
function command(raw, operation, payload) { const value = object(raw); const requestId = uuid(value.requestId); const payloadHash = text(value.payloadHash, 64); const calculated = canonicalHash({ operation, requestId, ...payload }); if (payloadHash !== calculated) logisticsFail("LOGISTICS_PAYLOAD_HASH_MISMATCH"); return Object.freeze({ operation, requestId, payloadHash, ...payload }); }

export function normalizeCalculate(raw) { const value = object(raw); exact(value, ["requestId", "payloadHash", "caseRef", "intervalStart", "intervalEnd"]); const payload = { caseRef: uuid(value.caseRef), intervalStart: timestamp(value.intervalStart), intervalEnd: timestamp(value.intervalEnd) }; if (payload.intervalEnd <= payload.intervalStart) logisticsFail("LOGISTICS_INTERVAL_INVALID"); return command(value, "LOGISTICS_CALCULATE", payload); }
export function normalizePublish(raw) { const value = object(raw); exact(value, ["requestId", "payloadHash", "calculationRef"]); return command(value, "LOGISTICS_PUBLISH", { calculationRef: uuid(value.calculationRef) }); }
export function normalizeRuleCreate(raw) { const value = object(raw); exact(value, ["requestId", "payloadHash", "seriesRef", "family", "code", "name", "priority", "specificity", "conditions", "result", "state", "validFrom", "validTo"]); const payload = { seriesRef: value.seriesRef ? uuid(value.seriesRef) : null, family: enumValue(value.family, ["LABOR", "TIME", "TRANSPORT", "MATERIAL", "ASSET", "EXTERNAL", "PER_DIEM", "LODGING", "TOLL", "PARKING", "PERMIT", "ZONE", "CRATING"]), code: text(value.code, 80), name: text(value.name, 180), priority: integer(value.priority), specificity: integer(value.specificity), conditions: operationalObject(value.conditions), result: operationalObject(value.result), state: enumValue(value.state, ["DRAFT", "ACTIVE", "INACTIVE"]), validFrom: value.validFrom ? timestamp(value.validFrom) : null, validTo: value.validTo ? timestamp(value.validTo) : null }; if (payload.validFrom && payload.validTo && payload.validTo <= payload.validFrom) logisticsFail("LOGISTICS_RULE_PERIOD_INVALID"); return command(value, "LOGISTICS_RULE_VERSION", payload); }
export function normalizeOverride(raw) { const value = object(raw); exact(value, ["requestId", "payloadHash", "revisionRef", "itemRef", "expectedSuggested", "finalValue", "reason"]); return command(value, "LOGISTICS_OVERRIDE", { revisionRef: uuid(value.revisionRef), itemRef: uuid(value.itemRef), expectedSuggested: operationalObject(value.expectedSuggested), finalValue: operationalObject(value.finalValue), reason: text(value.reason, 1000) }); }
export function normalizeIssueResolution(raw) { const value = object(raw); exact(value, ["requestId", "payloadHash", "revisionRef", "issueRef", "expectedVersion", "reason"]); return command(value, "LOGISTICS_ISSUE_RESOLVE", { revisionRef: uuid(value.revisionRef), issueRef: uuid(value.issueRef), expectedVersion: integer(value.expectedVersion, 1), reason: text(value.reason, 1000) }); }

function includesAll(actual = [], required = []) { const set = new Set(actual); return required.every((value) => set.has(value)); }
export function ruleMatches(rule, facts) {
  const c = rule.conditions || {};
  if (c.modes && !c.modes.includes(facts.mode)) return false;
  if (c.serviceCodes && !includesAll(facts.services.codes, c.serviceCodes)) return false;
  if (c.accessFlags && !includesAll(facts.survey.accessFlags, c.accessFlags)) return false;
  if (c.minVolumeM3 != null && facts.survey.volumeM3 < c.minVolumeM3) return false;
  if (c.maxVolumeM3 != null && facts.survey.volumeM3 > c.maxVolumeM3) return false;
  if (c.minWeightKg != null && facts.survey.weightKg < c.minWeightKg) return false;
  if (c.distanceStatus && c.distanceStatus !== facts.route.distanceStatus) return false;
  if (c.minDistanceKm != null && (facts.route.distanceKm == null || facts.route.distanceKm < c.minDistanceKm)) return false;
  if (c.destinationStatuses && !c.destinationStatuses.includes(facts.route.destinationStatus)) return false;
  return true;
}
function formula(value, facts) { if (value == null) return null; if (typeof value === "number") return value; const f = object(value); const base = f.basis === "VOLUME_M3" ? facts.survey.volumeM3 : f.basis === "WEIGHT_KG" ? facts.survey.weightKg : f.basis === "ITEM_COUNT" ? facts.survey.itemCount : f.basis === "DISTANCE_KM" ? facts.route.distanceKm : 1; if (base == null) return null; return Math.max(f.minimum || 0, Math.ceil((base * (f.multiplier ?? 1)) / (f.divisor ?? 1)) + (f.offset || 0)); }
function availability(required, available, reserved = 0) { if (available == null) return { status: "PENDING_CONFIRMATION", shortage: null }; const free = Math.max(0, available - reserved); const shortage = Math.max(0, required - free); return { status: shortage === 0 ? "AVAILABLE" : free > 0 ? "PARTIAL" : "UNAVAILABLE", shortage }; }
const ITEM_FAMILY_BY_RULE = Object.freeze({ LABOR: "LABOR", TIME: "TIME", TRANSPORT: "TRANSPORT", MATERIAL: "MATERIAL", ASSET: "ASSET", EXTERNAL: "EXTERNAL", PER_DIEM: "TRAVEL", LODGING: "TRAVEL", TOLL: "TRAVEL", PARKING: "TRAVEL", PERMIT: "PERMIT", ZONE: "TRANSPORT", CRATING: "CRATING" });
function itemFamily(rule, result) { const family = result.family || ITEM_FAMILY_BY_RULE[rule.family]; if (!Object.values(ITEM_FAMILY_BY_RULE).includes(family)) logisticsFail("LOGISTICS_RULE_RESULT_INVALID", 409); return family; }
export function calculateLogisticsPlan(facts, rules) {
  const active = rules.filter((rule) => rule.state === "ACTIVE" && ruleMatches(rule, facts)).sort((a, b) => b.priority - a.priority || b.specificity - a.specificity || b.version - a.version || a.ruleRef.localeCompare(b.ruleRef));
  const exclusive = new Map();
  for (const rule of active) { const key = rule.result?.exclusiveKey; if (!key) continue; const prior = exclusive.get(key); if (prior && prior.priority === rule.priority && prior.specificity === rule.specificity) logisticsFail("LOGISTICS_RULE_CONFLICT", 409); if (!prior) exclusive.set(key, rule); }
  const selected = active.filter((rule) => !rule.result?.exclusiveKey || exclusive.get(rule.result.exclusiveKey) === rule);
  const items = [];
  const issues = [];
  for (const rule of selected) {
    const r = rule.result; const family = itemFamily(rule, r); const required = formula(r.quantity, facts);
    const asset = r.availabilitySource === "ASSET" ? facts.assets.find((row) => row.modelRef === r.sourceRef) : null;
    const vehicle = r.availabilitySource === "VEHICLE" ? facts.vehicles.find((row) => row.vehicleType === r.sourceCode) : null;
    const provider = r.availabilitySource === "PROVIDER" ? facts.externalOffers.find((row) => row.offerRef === r.sourceRef || row.kind === r.sourceCode) : null;
    const available = asset?.available ?? vehicle?.available ?? provider?.availableQuantity;
    const reserved = provider?.reservedQuantity || 0; const observed = required == null ? { status: "PENDING_CONFIRMATION", shortage: null } : availability(required, available, reserved);
    const source = r.availabilitySource === "ASSET" ? "ASSET" : r.availabilitySource === "VEHICLE" ? "VEHICLE" : r.availabilitySource === "PROVIDER" ? "PROVIDER" : "ADMIN_RULE";
    items.push({ family, kind: r.kind, label: r.label, quantity: required, unit: r.unit || null, estimatedHours: formula(r.hours, facts), trips: formula(r.trips, facts), requiredQuantity: required, availableQuantity: available, reservedQuantity: reserved, shortageQuantity: observed.shortage, availability: r.availabilitySource ? observed.status : "NOT_APPLICABLE", priceStatus: provider?.priceStatus || r.priceStatus || "NOT_APPLICABLE", source, sourceRef: provider?.offerRef || (source === "ADMIN_RULE" ? rule.ruleRef : r.sourceRef || null), sourceVersion: provider?.version || asset?.version || vehicle?.sourceVersion || rule.version, snapshot: { ruleCode: rule.code, ruleHash: rule.conditionHash, providerName: provider?.providerName || null, observedAt: r.availabilitySource ? facts.availabilityObservedAt : null } });
    if (observed.shortage > 0) issues.push({ code: source === "ASSET" ? "RESOURCE_UNAVAILABLE" : source === "VEHICLE" ? "VEHICLE_UNAVAILABLE" : source === "PROVIDER" ? "RESOURCE_UNAVAILABLE" : "RESOURCE_UNAVAILABLE", severity: r.shortageSeverity || "WARNING", family, message: "La disponibilidad observada no cubre la necesidad calculada.", source, sourceSnapshot: { observedAt: facts.availabilityObservedAt } });
    if (source === "PROVIDER" && (provider?.priceStatus || "PENDING") === "PENDING") issues.push({ code: "EXTERNAL_PRICE_PENDING", severity: "BLOCKER", family: "EXTERNAL", message: "El precio del recurso externo requiere confirmación.", source: "PROVIDER", sourceSnapshot: { offerRef: provider?.offerRef || null } });
  }
  for (const line of facts.materials.lines) { const observed = availability(line.required, line.available, line.reserved); items.push({ family: "MATERIAL", kind: "MATERIAL_REQUIREMENT", label: line.name, quantity: line.required, unit: line.unit, estimatedHours: null, trips: null, requiredQuantity: line.required, availableQuantity: line.available, reservedQuantity: line.reserved, shortageQuantity: observed.shortage, availability: observed.status, priceStatus: "REFERENCED", source: "INVENTORY", sourceRef: line.materialRef, sourceVersion: line.costVersion || null, snapshot: { requirementRef: facts.materials.requirementRef, observedAt: facts.availabilityObservedAt } }); if (observed.shortage > 0) issues.push({ code: "MATERIAL_SHORTAGE", severity: "WARNING", family: "MATERIAL", message: "El inventario disponible no cubre el material requerido.", source: "INVENTORY", sourceSnapshot: { materialRef: line.materialRef, observedAt: facts.availabilityObservedAt } }); }
  if (facts.route.destinationStatus === "PENDING") issues.push({ code: "DESTINATION_PENDING", severity: "BLOCKER", family: "TRANSPORT", message: "El destino debe confirmarse antes de aprobar el plan.", source: "ROUTE", sourceSnapshot: { routeVersion: facts.route.version } });
  if (facts.route.distanceStatus === "PENDING") issues.push({ code: "DISTANCE_PENDING", severity: "WARNING", family: "TRANSPORT", message: "La distancia continúa pendiente de una fuente autorizada.", source: "ROUTE", sourceSnapshot: { routeVersion: facts.route.version } });
  return Object.freeze({ items: items.map((item, position) => ({ ...item, position })), issues, rules: selected.map(({ ruleRef, seriesRef, family, code, priority, specificity, version, conditionHash }) => ({ ruleRef, seriesRef, family, code, priority, specificity, version, conditionHash })) });
}
