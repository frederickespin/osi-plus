import { canonicalCostingJson, costingFail, costingHash } from "./costingContract.js";
import { sameTransportContext, TRANSPORT_CONTEXT_CONTRACT, transportContextOf } from "./logisticsTransportContext.js";
import { transportLineQuantity } from "./logisticsTransportContract.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TRANSPORT_KEYS = ["contract", "zoneRuleRef", "zoneVersion", "componentCode", "costRuleRef", "costRuleVersion", "journeyRef", "factor"];

function invalid() {
  costingFail("COSTING_TRANSPORT_AUTHORITY_INVALID", 409);
}

function fixed(value, digits, wholeDigits = 12) {
  const text = String(value);
  if (!new RegExp(`^(0|[1-9][0-9]{0,${wholeDigits - 1}})(\\.[0-9]{1,${digits}})?$`).test(text)) invalid();
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * 10n ** BigInt(digits) + BigInt(fraction.padEnd(digits, "0"));
}

function decimal(value, digits = 6) {
  const scale = 10n ** BigInt(digits);
  const fraction = (value % scale).toString().padStart(digits, "0").replace(/0+$/, "");
  return `${value / scale}${fraction ? `.${fraction}` : ""}`;
}

function sameDecimal(left, right, digits) {
  return left != null && right != null && fixed(left, digits, 14) === fixed(right, digits, 14);
}

export function hasTransportCostingAuthority(item) {
  return !!item?.snapshot && Object.hasOwn(item.snapshot, "transport");
}

export function transportCostingItemKey(item) {
  const transport = item?.snapshot?.transport;
  return transport ? `${transport.journeyRef}:${transport.zoneRuleRef}:${transport.zoneVersion}:${transport.componentCode}` : null;
}

// Operational snapshots carry references and quantities. Prices and margins are
// resolved exclusively from the linked tenant-owned, immutable CostingRule row.
export async function resolveTransportCostingAuthority(tx, context, item, revision) {
  const transport = item?.snapshot?.transport;
  if (!transport || typeof transport !== "object" || Array.isArray(transport) || Object.keys(transport).some((key) => !TRANSPORT_KEYS.includes(key))) invalid();
  if (transport.contract !== TRANSPORT_CONTEXT_CONTRACT
    || !UUID.test(transport.zoneRuleRef) || !UUID.test(transport.costRuleRef)
    || typeof transport.journeyRef !== "string" || !transport.journeyRef
    || typeof transport.componentCode !== "string" || !transport.componentCode
    || !Number.isSafeInteger(transport.zoneVersion) || transport.zoneVersion < 1
    || !Number.isSafeInteger(transport.costRuleVersion) || transport.costRuleVersion < 1
    || item.source !== "ADMIN_RULE" || item.sourceRef !== transport.zoneRuleRef || item.sourceVersion !== transport.zoneVersion) invalid();
  const contextSnapshot = transportContextOf(revision?.inputSnapshot);
  const transportInput = revision?.inputSnapshot?.transportInput;
  const result = revision?.resultSnapshot?.transport;
  if (!contextSnapshot || !sameTransportContext(result?.context, contextSnapshot) || !Array.isArray(result?.lines)
    || transportInput?.purpose !== contextSnapshot.purpose || transportInput?.contextRef !== contextSnapshot.contextRef || !Array.isArray(transportInput?.journeys)) invalid();
  const journeys = transportInput.journeys.filter((journey) => journey.journeyRef === transport.journeyRef);
  if (journeys.length !== 1) invalid();
  const journey = journeys[0];
  const matchingLines = result.lines.filter((line) => line.journeyRef === transport.journeyRef && line.zoneRuleRef === transport.zoneRuleRef && line.zoneVersion === transport.zoneVersion && line.componentCode === transport.componentCode);
  if (matchingLines.length !== 1) invalid();
  const line = matchingLines[0];
  if (line.costRuleRef !== transport.costRuleRef || line.costRuleVersion !== transport.costRuleVersion
    || line.kind !== item.kind || line.unit !== item.unit || line.factor !== transport.factor
    || !sameDecimal(line.quantity, item.quantity, 4)) invalid();
  const zone = await tx.logisticsRule.findFirst({ where: { tenantId: context.tenantId, ruleRef: transport.zoneRuleRef, version: transport.zoneVersion, family: "ZONE" } });
  if (!zone || zone.tenantId !== context.tenantId || zone.ruleRef !== transport.zoneRuleRef || zone.version !== transport.zoneVersion || zone.family !== "ZONE"
    || zone.conditions?.transportContract !== TRANSPORT_CONTEXT_CONTRACT || zone.conditions?.zoneSeriesRef !== zone.seriesRef
    || zone.conditionHash !== costingHash(zone.conditions) || zone.conditions.vehicleType != null && zone.conditions.vehicleType !== journey.vehicleType
    || zone.result?.kind !== "TRANSPORT_ZONE_POLICY" || zone.result?.contract !== TRANSPORT_CONTEXT_CONTRACT
    || !zone.result?.purposes?.includes(contextSnapshot.purpose) || !Array.isArray(zone.result.components)) invalid();
  const components = zone.result.components.filter((component) => component.code === transport.componentCode);
  if (components.length !== 1) invalid();
  const component = components[0];
  const family = ["PER_DIEM", "ALLOWANCE"].includes(component.kind) ? "TRAVEL" : "TRANSPORT";
  if (component.costRuleRef !== transport.costRuleRef || component.costRuleVersion !== transport.costRuleVersion
    || component.kind !== item.kind || component.basis !== item.unit || item.family !== family) invalid();
  let computedQuantity;
  try { computedQuantity = transportLineQuantity(component, journey, zone.result).quantity; }
  catch { invalid(); }
  if (!sameDecimal(computedQuantity, item.quantity, 4)) invalid();
  const rule = await tx.costingRule.findFirst({ where: { tenantId: context.tenantId, ruleRef: transport.costRuleRef, version: transport.costRuleVersion } });
  const namespace = { transportContract: TRANSPORT_CONTEXT_CONTRACT, zoneSeriesRef: zone.seriesRef, componentCode: component.code };
  const expectedCode = `TZ_${costingHash({ zoneSeriesRef: zone.seriesRef, componentCode: component.code }).slice(0, 40)}`;
  if (!rule || rule.tenantId !== context.tenantId || rule.ruleRef !== transport.costRuleRef || rule.version !== transport.costRuleVersion
    || rule.code !== expectedCode || rule.source !== "MOTOR" || rule.family !== family
    || canonicalCostingJson(rule.conditions) !== canonicalCostingJson(namespace) || canonicalCostingJson(rule.result) !== canonicalCostingJson(namespace)
    || rule.conditionHash !== costingHash(namespace)
    || rule.currency !== zone.result.currency || rule.currency !== line.currency || !["PR", "EX", "DE"].includes(rule.classification)) invalid();
  const factor = zone.result.mode === "FACTOR" && component.kind === "BASE" ? zone.result.factor : null;
  if (factor == null ? transport.factor !== null : !sameDecimal(factor, transport.factor, 6)) invalid();
  if (rule.unitCost == null) return null;
  let micros = fixed(rule.unitCost, 6);
  if (factor != null) {
    const factorMicros = fixed(factor, 6);
    if (factorMicros <= 0n) invalid();
    micros = (micros * factorMicros + 500_000n) / 1_000_000n;
  }
  if (micros >= 10n ** 18n) invalid();
  const unitCost = decimal(micros);
  if (!sameDecimal(unitCost, line.unitCost, 6)) invalid();
  const authoritySnapshot = {
    kind: "COSTING_RULE", ruleRef: rule.ruleRef, seriesRef: rule.seriesRef, code: rule.code, version: rule.version,
    transport: { ...transport, zoneSeriesRef: zone.seriesRef, originalUnitCost: String(rule.unitCost) },
  };
  return {
    logisticsItemRef: item.itemRef, family, classification: rule.classification, source: "MOTOR",
    sourceRef: rule.ruleRef, sourceVersion: rule.version, unitCost, currency: rule.currency, unit: component.basis,
    minimumMarginBps: rule.minimumMarginBps, recommendedMarginBps: rule.recommendedMarginBps, authoritySnapshot,
    logicalSha256: costingHash({ authoritySnapshot, conditionHash: rule.conditionHash, unitCost, currency: rule.currency, minimumMarginBps: rule.minimumMarginBps, recommendedMarginBps: rule.recommendedMarginBps }),
  };
}
