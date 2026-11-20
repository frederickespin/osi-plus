import { isPackagePricingRule, minimumForPackage, packageMeasures, packageQuantity } from "../../shared/servicePackagePricing.js";
import { costingFail, isProtectedTransportCostingRule } from "./costingContract.js";

export function isPackageComponentRule(rule) {
  return typeof rule.conditions?.packageComponentCode === "string";
}

export function canUsePackageComponent(rule) {
  return rule.unitCost != null && rule.family !== "CURRENCY_COMPENSATION"
    && !isPackagePricingRule(rule) && !isProtectedTransportCostingRule(rule);
}

export function toQuoteCatalogItem(rule) {
  if (!isPackageComponentRule(rule) || rule.unitCost == null || typeof rule.result?.saleUnitPrice !== "string") return null;
  return {
    ruleRef: rule.ruleRef, version: rule.version, name: rule.name, family: rule.family,
    unit: rule.result.unit, currency: rule.currency, unitPrice: rule.result.saleUnitPrice,
    classification: rule.classification,
  };
}

export async function assertPackagePricingRule(tx, tenantId, input, current, rules) {
  const isPricing = isPackagePricingRule(input);
  if (current && (isPricing !== isPackagePricingRule(current)
    || isPackageComponentRule(input) !== isPackageComponentRule(current)
    || (isPackageComponentRule(input) && current.result?.unit !== input.result.unit)
    || (isPricing && current.conditions.packageVersionRef !== input.conditions.packageVersionRef))) {
    costingFail("COSTING_PACKAGE_RULE_SCOPE_INVALID", 409);
  }
  if (!isPricing) return;
  const versionRef = input.conditions.packageVersionRef;
  const related = await tx.servicePackageVersion.findFirst({
    where: { tenantId, versionRef, state: "PUBLISHED" },
    select: { id: true },
  });
  if (!related) costingFail("COSTING_PACKAGE_NOT_AVAILABLE", 409);
  if (rules.some((rule) => isPackagePricingRule(rule)
    && rule.conditions.packageVersionRef === versionRef && rule.seriesRef !== input.seriesRef)) {
    costingFail("COSTING_PACKAGE_RULE_CONFLICT", 409);
  }
  const components = new Map(rules.filter(canUsePackageComponent).map((rule) => [rule.seriesRef, rule]));
  for (const { ruleSeriesRef } of input.result.components) {
    const component = components.get(ruleSeriesRef);
    if (!component) costingFail("COSTING_PACKAGE_COMPONENT_MISSING", 409);
    if (input.result.includeRouteTransport && component.family === "TRANSPORT") {
      costingFail("COSTING_PACKAGE_TRANSPORT_DUPLICATE", 409);
    }
  }
}

export async function eligiblePackagePricing(tx, tenantId, pipelineCase, rules, versionRef = null) {
  const selection = await tx.pipelineCaseServiceRevision.findFirst({
    where: { tenantId, pipelineCaseId: pipelineCase.id },
    orderBy: { revision: "desc" },
    select: {
      selectionRef: true, revision: true, modeSnapshot: true,
      items: { orderBy: { position: "asc" }, select: { serviceId: true, kind: true, codeSnapshot: true } },
    },
  });
  const serviceId = selection?.modeSnapshot === pipelineCase.mode ? selection.items.find((item) => item.kind === "PRIMARY")?.serviceId : null;
  const pricingRules = rules.filter((rule) => isPackagePricingRule(rule)
    && (!versionRef || rule.conditions.packageVersionRef === versionRef));
  const byRef = new Map(pricingRules.map((rule) => [rule.conditions.packageVersionRef, rule]));
  if (!serviceId || !byRef.size) return { selection, hasService: Boolean(serviceId), packages: [] };

  const at = new Date();
  const packages = await tx.servicePackageVersion.findMany({
    where: {
      tenantId, state: "PUBLISHED", versionRef: { in: [...byRef.keys()] },
      AND: [
        { OR: [{ validFrom: null }, { validFrom: { lte: at } }] },
        { OR: [{ validTo: null }, { validTo: { gt: at } }] },
      ],
      modes: { some: { mode: { code: pipelineCase.mode } } },
      services: { some: { kind: "PRIMARY", serviceId, service: { status: "ACTIVE" } } },
    },
    orderBy: [{ name: "asc" }, { version: "desc" }],
    select: { versionRef: true, name: true, version: true },
  });
  return {
    selection,
    hasService: true,
    packages: packages.map((pkg) => {
      const matching = pricingRules.filter((rule) => rule.conditions.packageVersionRef === pkg.versionRef);
      if (matching.length !== 1) costingFail("COSTING_PACKAGE_RULE_CONFLICT", 409);
      return { ...pkg, rule: matching[0] };
    }),
  };
}

export function resolvePackageMeasures(estimate, pkg) {
  const { rule } = pkg;
  const measures = packageMeasures(Number(estimate.volumeM3), estimate.grossKg == null ? null : Number(estimate.grossKg), rule.result.shipment);
  const tier = minimumForPackage(rule.result, measures.volumeM3);
  if (!tier) costingFail("COSTING_PACKAGE_VOLUME_UNSUPPORTED", 409);
  return {
    versionRef: pkg.versionRef, name: pkg.name, version: pkg.version,
    pricingRuleRef: rule.ruleRef, pricingVersion: rule.version,
    minimumSale: tier.minimumSale, afterM3: tier.afterM3, maxM3: tier.maxM3, allowEdits: rule.result.allowEdits !== false,
    minimumMarginBps: rule.minimumMarginBps, recommendedMarginBps: rule.recommendedMarginBps,
    includeRouteTransport: rule.result.includeRouteTransport, shipment: rule.result.shipment,
    measures,
  };
}

export function packagePricingIssues(code, message, snapshot = {}) {
  return {
    code, severity: "BLOCKER", family: "ADDITIONAL", message,
    source: "COMBO", sourceSnapshot: snapshot, status: "OPEN", version: 1,
  };
}

export function packageResourceLines(pkg, pricing, rules, caseMode, serviceCodes) {
  const bySeries = new Map(rules.filter(canUsePackageComponent).map((rule) => [rule.seriesRef, rule]));
  const items = [];
  const issues = [];
  for (const component of pkg.rule.result.components) {
    const rule = bySeries.get(component.ruleSeriesRef);
    const conditions = rule?.conditions;
    if (!rule || (conditions?.modes && !conditions.modes.includes(caseMode))
      || (conditions?.serviceCodes && !conditions.serviceCodes.every((code) => serviceCodes.includes(code)))) {
      issues.push(packagePricingIssues("COSTING_PACKAGE_COMPONENT_MISSING", `Revise el costo vigente de «${component.concept}».`, { ruleSeriesRef: component.ruleSeriesRef }));
      continue;
    }
    if (pricing.includeRouteTransport && rule.family === "TRANSPORT") {
      issues.push(packagePricingIssues("COSTING_PACKAGE_TRANSPORT_DUPLICATE", `«${component.concept}» se superpone con el transporte calculado.`));
      continue;
    }
    const quantity = packageQuantity(component, pricing.measures);
    if (quantity === null) {
      issues.push(packagePricingIssues("COSTING_PACKAGE_QUANTITY_REQUIRED", `Complete los datos de peso o revise la cantidad de «${component.concept}».`));
      continue;
    }
    items.push({
      itemRef: rule.ruleRef, family: rule.family, label: component.concept,
      quantity, unit: component.unit, packageComponent: true,
      source: "PACKAGE_RECIPE", sourceRef: pkg.versionRef, sourceVersion: pkg.version,
      snapshot: { basis: component.basis, factor: component.factor, minimumQuantity: component.minimumQuantity, roundUp: component.roundUp },
      rule,
    });
  }
  return { items, issues };
}

export function applyPackageMargin(authority, pkg) {
  if (!pkg || authority.classification !== "PR") return authority;
  const minimum = Math.max(pkg.rule.minimumMarginBps, authority.minimumMarginBps ?? 0);
  return {
    ...authority,
    minimumMarginBps: minimum,
    recommendedMarginBps: Math.max(minimum, pkg.rule.recommendedMarginBps),
  };
}
