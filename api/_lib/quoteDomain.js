import { Prisma } from "@prisma/client";
import { latestCostingRevision, QUOTE_TRANSPORT_CONTEXT, sameTransportContext, transportContextOf } from "./logisticsTransportContext.js";
import { resolveCommercialQuoteAuthority } from "./commercialRelationshipsDomain.js";
import { toQuoteCatalogItem } from "./costingPackages.js";
import { currentCatalogSelection, ensureCatalogQuoteBasis } from "./catalogQuoteBasis.js";
import { isCatalogQuoteBasis, isPackageQuoteBasis } from "./packageQuoteBasis.js";
import { isPackageMinimumLine } from "../../shared/servicePackagePricing.js";
import {
  QuoteError,
  calculateQuoteTotals,
  canonicalQuoteJson,
  normalizeQuoteCancel,
  normalizeQuoteCaseRef,
  normalizeQuoteCreate,
  normalizeQuoteDecision,
  normalizeQuotePublish,
  normalizeQuoteRevise,
  normalizeQuoteSend,
  quoteFail,
  quoteHash,
  quoteMoney,
} from "./quoteContract.js";

export const QUOTE_PERMISSIONS = Object.freeze({
  VIEW: "quote:view",
  CREATE: "quote:create",
  UPDATE: "quote:update",
  PUBLISH: "quote:publish",
  SEND: "quote:send",
  DECIDE: "quote:record-client-decision",
  OVERRIDE_PRICE: "quote:override-price",
  INTERNAL_COST: "quote:internal-cost:view",
  TENANT: "quote:tenant",
});

function requirePermission(context, permission) {
  if (!context?.tenantId || !context?.membershipId || !context?.userId || !context.effectivePermissions?.includes(permission) || context.deniedPermissions?.includes(permission)) quoteFail("QUOTE_FORBIDDEN", 403);
}

function has(context, permission) {
  return context?.effectivePermissions?.includes(permission) && !context?.deniedPermissions?.includes(permission);
}

function scope(context) {
  return has(context, QUOTE_PERMISSIONS.TENANT) ? {} : { ownerMembershipId: context.membershipId, ownerUserId: context.userId };
}

function actor(context) {
  return { actorMembershipId: context.membershipId, actorUserId: context.userId };
}

function audit(context, action, entity, entityId, requestId, after) {
  return {
    tenant_id: context.tenantId,
    actor_user_id: context.userId,
    actor_membership_id: context.membershipId,
    role_snapshot: context.role,
    action,
    entity,
    entityId: String(entityId),
    after_json: after,
    source: "V17_QUOTE",
    request_id: requestId,
    correlation_id: requestId,
    critical: true,
  };
}

async function serializable(prisma, work, timeout = 30_000) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        // Quote migration guards use unqualified tenant tables; pin the canonical schemas
        // for every mutation transaction instead of depending on a connection default.
        await tx.$executeRaw(Prisma.sql`SET LOCAL search_path = osi, public`);
        return work(tx);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout });
    } catch (error) {
      if (error?.code !== "P2034" || attempt === 3) throw error;
    }
  }
  quoteFail("QUOTE_CONCURRENCY_CONFLICT", 409);
}

async function replay(tx, context, input) {
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:${input.requestId}:quote-command`}, 0))`);
  const row = await tx.quoteMutationCommand.findUnique({ where: { tenantId_requestId: { tenantId: context.tenantId, requestId: input.requestId } } });
  if (!row) return null;
  if (row.operation !== input.operation || row.payloadHash !== input.payloadHash ||
    row.actorMembershipId !== context.membershipId || row.actorUserId !== context.userId) quoteFail("QUOTE_IDEMPOTENCY_CONFLICT", 409);
  return Object.freeze(row.resultJson);
}

async function persist(tx, context, input, quoteId, targetRef, result, action, entity = "QuoteProposal") {
  await tx.quoteMutationCommand.create({ data: { tenantId: context.tenantId, quoteId, requestId: input.requestId, operation: input.operation, payloadHash: input.payloadHash, targetRef: String(targetRef), resultJson: result, ...actor(context) } });
  await tx.commercialAuditLog.create({ data: audit(context, action, entity, targetRef, input.requestId, result) });
  return Object.freeze(result);
}

async function resolveCase(tx, context, caseRef) {
  const row = await tx.pipelineCase.findFirst({
    where: { tenantId: context.tenantId, publicRef: caseRef, ...scope(context) },
    select: {
      id: true,
      publicRef: true,
      caseCode: true,
      mode: true,
      serviceType: true,
      destinationStatus: true,
      routeRevision: true,
      client: { select: { publicRef: true, name: true, type: true, status: true } },
      routeSnapshots: { orderBy: [{ routeVersion: "desc" }, { role: "asc" }, { stopOrder: "asc" }] },
    },
  });
  if (!row) quoteFail("QUOTE_NOT_FOUND", 404);
  return row;
}

async function resolvePublishedCosting(tx, context, pipelineCaseId, revisionRef) {
  const row = await tx.costingRevision.findFirst({
    where: { tenantId: context.tenantId, pipelineCaseId, revisionRef, status: "PUBLISHED" },
    include: {
      lines: { orderBy: { position: "asc" } },
      issues: true,
      logisticsRevision: { select: { revisionRef: true, inputSnapshot: true, logicalSha256: true } },
      overrides: { include: { authorizations: true } },
    },
  });
  if (!row) quoteFail("QUOTE_COSTING_REVISION_NOT_FOUND", 404);
  if (isCatalogQuoteBasis(row.inputSnapshot) && isCatalogQuoteBasis(row.logisticsRevision?.inputSnapshot)) return row;
  const packageBasis = row.inputSnapshot?.packagePricing && isPackageQuoteBasis(row.logisticsRevision?.inputSnapshot);
  if ((!packageBasis && !sameTransportContext(transportContextOf(row.logisticsRevision?.inputSnapshot), QUOTE_TRANSPORT_CONTEXT))
    || !sameTransportContext(transportContextOf(row.inputSnapshot), QUOTE_TRANSPORT_CONTEXT)) quoteFail("QUOTE_COSTING_CONTEXT_INVALID", 409);
  return row;
}

function routeForCurrentVersion(pipelineCase) {
  return pipelineCase.routeSnapshots.filter((row) => row.routeVersion === pipelineCase.routeRevision).map((row) => ({
    role: row.role,
    stopOrder: row.stopOrder,
    countryCode: row.countryCode,
    provinceState: row.provinceState,
    cityMunicipality: row.cityMunicipality,
    sector: row.sector,
    streetAndNumber: row.streetAndNumber,
    buildingResidential: row.buildingResidential,
    floorUnit: row.floorUnit,
  }));
}

function clientSnapshot(pipelineCase) {
  return {
    caseRef: pipelineCase.publicRef,
    caseCode: pipelineCase.caseCode,
    client: pipelineCase.client ? { clientRef: pipelineCase.client.publicRef, displayName: pipelineCase.client.name, type: pipelineCase.client.type, status: pipelineCase.client.status } : null,
    service: { mode: pipelineCase.mode, serviceType: pipelineCase.serviceType },
    routeVersion: pipelineCase.routeRevision,
    destinationStatus: pipelineCase.destinationStatus,
    route: routeForCurrentVersion(pipelineCase),
  };
}

function findAuthorization(costing, authorizationRef) {
  if (!authorizationRef) return null;
  for (const override of costing.overrides) {
    const authorization = override.authorizations.find((row) => row.authorizationRef === authorizationRef && row.decision === "AUTHORIZED");
    if (authorization) return {
      authorizationRef: authorization.authorizationRef,
      overrideRef: override.overrideRef,
      decision: authorization.decision,
      createdAt: authorization.createdAt.toISOString(),
    };
  }
  return null;
}

const Decimal = Prisma.Decimal.clone({ precision: 40 });

function carryQuoteLine(line, prior, context) {
  if (!prior || isPackageMinimumLine(prior) || prior.sourceKind !== "MANUAL" || line.sourceKind !== prior.sourceKind ||
    line.concept !== prior.concept || line.unit !== prior.unit ||
    line.economicClass !== prior.economicClass || line.currency !== prior.currency) {
    quoteFail("QUOTE_LINE_SOURCE_INVALID", 409);
  }
  const unchangedQuantity = new Decimal(line.quantity).equals(String(prior.quantity));
  if (prior.priceStatus !== "CONFIRMED") {
    if (line.quotedPrice !== null || !unchangedQuantity) quoteFail("QUOTE_LINE_SOURCE_INVALID", 409);
    return { ...line, sourceRef: prior.sourceRef, sourceVersion: prior.sourceVersion, priceStatus: prior.priceStatus,
      capturedCost: null, suggestedPrice: null, snapshot: prior.snapshot };
  }
  if (line.quotedPrice === null) quoteFail("QUOTE_MANUAL_AUTHORITY_INVALID");
  const scale = new Decimal(line.quantity).div(String(prior.quantity));
  const expected = prior.snapshot?.catalog
    ? new Decimal(prior.snapshot.catalog.unitPrice).times(line.quantity)
    : new Decimal(String(prior.suggestedPrice)).times(scale);
  const quotedPrice = new Decimal(line.quotedPrice);
  const priorFormattedPrice = new Decimal(String(prior.quotedPrice)).toDecimalPlaces(2);
  const unchangedPrice = quotedPrice.equals(String(prior.quotedPrice)) || quotedPrice.equals(priorFormattedPrice);
  if ((!unchangedQuantity || !unchangedPrice) && !quotedPrice.equals(expected.toDecimalPlaces(2))) {
    requirePermission(context, QUOTE_PERMISSIONS.OVERRIDE_PRICE);
  }
  const catalogUnitCost = prior.snapshot?.valuation?.unitCost;
  const capturedCost = catalogUnitCost == null
    ? new Decimal(String(prior.capturedCost)).times(scale)
    : new Decimal(catalogUnitCost).times(line.quantity);
  return {
    ...line, sourceRef: prior.sourceRef, sourceVersion: prior.sourceVersion, priceStatus: prior.priceStatus,
    capturedCost: capturedCost.toDecimalPlaces(6).toString(),
    suggestedPrice: unchangedQuantity ? String(prior.suggestedPrice) : expected.toDecimalPlaces(prior.snapshot?.catalog ? 2 : 6).toString(),
    snapshot: prior.snapshot,
  };
}

function packageEdit(context, pricing, input) {
  requirePermission(context, QUOTE_PERMISSIONS.OVERRIDE_PRICE);
  if (pricing.allowEdits === false) quoteFail("QUOTE_PACKAGE_EDIT_NOT_ALLOWED", 409);
  if (!input.packageAdjustmentReason) quoteFail("QUOTE_PACKAGE_ADJUSTMENT_REASON_REQUIRED");
}

async function buildLines(tx, input, costing, context, supersedes = null) {
  const costingByRef = new Map(costing.lines.map((line) => [line.lineRef, line]));
  const carriedRefs = input.lines.flatMap((line) => line.lineRef ? [line.lineRef] : []);
  if (new Set(carriedRefs).size !== carriedRefs.length) quoteFail("QUOTE_LINE_SOURCE_INVALID");
  const priorByRef = new Map((supersedes?.lines ?? []).map((line) => [line.lineRef, line]));
  const pricing = costing.inputSnapshot?.packagePricing;
  const included = input.lines.filter((line) => line.sourceKind === "COSTING");
  const includedRefs = new Set(included.map((line) => line.costingLineRef));
  if (pricing) {
    const available = costing.lines.filter((line) => Number(line.quantity) > 0 && line.suggestedPrice != null && !isPackageMinimumLine(line));
    if (input.currency !== costing.baseCurrency) quoteFail("QUOTE_PACKAGE_CURRENCY_INVALID", 409);
    if (includedRefs.size !== included.length || !included.length) quoteFail("QUOTE_PACKAGE_LINES_REQUIRED", 409);
    if (available.some((line) => !includedRefs.has(line.lineRef))) packageEdit(context, pricing, input);
  }
  const catalogRefs = [...new Set(input.lines.filter((line) => line.manualAuthority?.kind === "QUOTE_CATALOG_COMPONENT").map((line) => line.manualAuthority.reference))];
  const at = new Date();
  const catalogRules = catalogRefs.length ? await tx.costingRule.findMany({ where: {
    tenantId: context.tenantId, ruleRef: { in: catalogRefs }, state: "ACTIVE", currency: input.currency,
    AND: [{ OR: [{ validFrom: null }, { validFrom: { lte: at } }] }, { OR: [{ validTo: null }, { validTo: { gt: at } }] }],
  } }) : [];
  const catalogByRef = new Map(catalogRules.map((rule) => [rule.ruleRef, rule]));
  const lines = input.lines.flatMap((line) => {
    if (line.sourceKind === "COSTING") {
      const source = costingByRef.get(line.costingLineRef);
      if (!source) quoteFail("QUOTE_COSTING_LINE_NOT_FOUND", 404);
      if (source.suggestedPrice == null || line.quotedPrice == null) quoteFail("QUOTE_COSTING_LINE_PENDING", 409);
      // Clients on the earlier package editor may still send its suggested adjustment.
      if (pricing && isPackageMinimumLine(source)) return [];
      const quantityChanged = !new Decimal(line.quantity).equals(String(source.quantity));
      if (line.concept !== source.concept || line.unit !== source.unit || line.economicClass !== source.classification
        || !pricing && line.quantity !== String(source.quantity)) quoteFail("QUOTE_COSTING_LINE_TAMPERED", 409);
      const capturedCost = quantityChanged ? new Decimal(String(source.baseUnitCost)).times(line.quantity).toDecimalPlaces(6).toString() : String(source.totalCost);
      const suggestedPrice = quantityChanged ? new Decimal(String(source.suggestedPrice)).times(line.quantity).div(String(source.quantity)).toDecimalPlaces(6).toString() : String(source.suggestedPrice);
      // Two-place display may round a six-place recommendation by half a cent.
      const priceChanged = !new Decimal(line.quotedPrice).equals(suggestedPrice)
        && !new Decimal(line.quotedPrice).equals(new Decimal(suggestedPrice).toDecimalPlaces(2));
      if (pricing && (quantityChanged || priceChanged)) packageEdit(context, pricing, input);
      return {
        ...line,
        sourceRef: String(source.sourceRef || source.lineRef),
        sourceVersion: source.sourceVersion || costing.revision,
        capturedCost, suggestedPrice,
        priceStatus: "CONFIRMED",
        snapshot: { costingLineRef: source.lineRef, family: source.family, source: source.source, sourceRef: source.sourceRef,
          sourceVersion: source.sourceVersion, costingRevisionRef: costing.revisionRef,
          ...(pricing && { originalQuantity: String(source.quantity), adjustmentReason: input.packageAdjustmentReason ?? null }) },
      };
    }
    if (line.lineRef) return carryQuoteLine(line, priorByRef.get(line.lineRef), context);
    const authority = line.manualAuthority;
    if (authority.kind === "QUOTE_CATALOG_COMPONENT") {
      const rule = catalogByRef.get(authority.reference);
      const item = rule && toQuoteCatalogItem(rule);
      if (!item || item.version !== authority.version || item.name !== line.concept || item.unit !== line.unit
        || item.classification !== line.economicClass) quoteFail("QUOTE_CATALOG_PRICE_STALE", 409);
      const amount = new Decimal(item.unitPrice).times(line.quantity).toDecimalPlaces(2);
      if (!amount.equals(line.quotedPrice)) requirePermission(context, QUOTE_PERMISSIONS.OVERRIDE_PRICE);
      return {
        ...line, sourceRef: item.ruleRef, sourceVersion: item.version,
        capturedCost: new Decimal(String(rule.unitCost)).times(line.quantity).toDecimalPlaces(6).toString(),
        suggestedPrice: amount.toFixed(2), priceStatus: "CONFIRMED",
        snapshot: { catalog: { ruleRef: item.ruleRef, version: item.version, unitPrice: item.unitPrice }, reason: line.reason,
          valuation: { family: rule.family, unitCost: String(rule.unitCost), minimumMarginBps: rule.minimumMarginBps ?? null, recommendedMarginBps: rule.recommendedMarginBps ?? null } },
      };
    }
    if ((costing.inputSnapshot?.packagePricing || authority.kind === "QUOTE_ADDITIONAL_CHARGE") && authority.status === "CONFIRMED") {
      requirePermission(context, QUOTE_PERMISSIONS.OVERRIDE_PRICE);
      if (line.quotedPrice == null) quoteFail("QUOTE_MANUAL_AUTHORITY_INVALID");
    }
    return {
      ...line,
      sourceRef: authority.reference,
      sourceVersion: authority.version,
      capturedCost: authority.capturedCost,
      suggestedPrice: authority.suggestedPrice,
      quotedPrice: authority.status === "PENDING" ? null : line.quotedPrice,
      priceStatus: authority.status,
      snapshot: { authority: { kind: authority.kind, reference: authority.reference, version: authority.version, status: authority.status }, reason: line.reason },
    };
  });
  if (!pricing) return lines;
  const base = lines.filter((line) => line.sourceKind === "COSTING");
  if (!base.length) quoteFail("QUOTE_PACKAGE_LINES_REQUIRED", 409);
  const packageFloor = (field) => Math.max(0, quoteMoney(Number(pricing.minimumSale) - base.reduce((sum, line) => sum + Number(line[field]), 0)));
  const adjustment = packageFloor("quotedPrice");
  const suggestedAdjustment = packageFloor("suggestedPrice");
  if (adjustment > 0 || suggestedAdjustment > 0) {
    const floorSource = costing.lines.find(isPackageMinimumLine);
    const adjustmentLine = {
      sourceKind: floorSource ? "COSTING" : "MANUAL", costingLineRef: floorSource?.lineRef ?? null,
      sourceRef: pricing.pricingRuleRef, sourceVersion: pricing.pricingVersion,
      concept: "Ajuste al mínimo del paquete", quantity: "1", unit: "servicio", economicClass: "PR",
      capturedCost: "0", suggestedPrice: String(suggestedAdjustment), quotedPrice: String(adjustment), currency: input.currency,
      priceStatus: "CONFIRMED", reason: floorSource ? null : "Aplicación del mínimo de la tarifa",
      snapshot: { packageMinimum: true, minimumSale: pricing.minimumSale },
    };
    lines.splice(base.length, 0, adjustmentLine);
  }
  return lines.map((line, index) => ({ ...line, position: index + 1 }));
}

function buildIssues(pipelineCase, costing, lines, totals, authorization) {
  const issues = [];
  if (pipelineCase.destinationStatus === "PENDING") issues.push({ code: "DESTINATION_PENDING", severity: "BLOCKER", message: "El destino continúa pendiente.", status: "OPEN", sourceSnapshot: { destinationStatus: "PENDING", routeVersion: pipelineCase.routeRevision } });
  for (const issue of costing.issues.filter((row) => row.severity === "BLOCKER" && row.status === "OPEN")) {
    issues.push({ code: "COSTING_BLOCKER_PRESENT", severity: "BLOCKER", message: "La revisión económica contiene un bloqueo abierto.", status: "OPEN", sourceSnapshot: { costingIssueRef: issue.issueRef, costingIssueCode: issue.code } });
  }
  for (const line of lines.filter((row) => row.priceStatus === "PENDING")) {
    issues.push({ code: "MANUAL_PRICE_PENDING", severity: "BLOCKER", message: "Un concepto manual continúa pendiente de autoridad económica.", status: "OPEN", sourceSnapshot: { position: line.position, sourceKind: line.sourceKind } });
  }
  const needsMinimumApproval = costing.inputSnapshot?.packagePricing && totals.discountAmount > 0
    && totals.packageSubtotal - totals.discountAmount < Number(costing.inputSnapshot.packagePricing.minimumSale);
  const needsCatalogApproval = isCatalogQuoteBasis(costing.inputSnapshot) && (totals.discountAmount > 0 || lines.some((line) => {
    const quotedPrice = new Decimal(line.quotedPrice);
    const cost = new Decimal(line.capturedCost);
    const floor = line.economicClass === "PR" ? line.snapshot?.valuation?.minimumMarginBps ?? 0 : 0;
    return quotedPrice.lt(line.suggestedPrice) || quotedPrice.times(10_000 - floor).lt(cost.times(10_000));
  }));
  if ((totals.foregoneRevenue > 0 || needsMinimumApproval || needsCatalogApproval) && !authorization) issues.push({ code: "MARGIN_AUTHORIZATION_REQUIRED", severity: "BLOCKER", message: "Todo descuento o exoneración de un servicio operativo requiere autorización de Administración.", status: "OPEN", sourceSnapshot: { comparison: needsMinimumApproval ? "BELOW_PACKAGE_MINIMUM" : "BELOW_SUGGESTED", regularPrice: totals.regularPrice, payablePrice: totals.payablePrice, foregoneRevenue: totals.foregoneRevenue } });
  return issues;
}

function lineCreate(line) {
  return {
    sourceKind: line.sourceKind,
    costingLineRef: line.costingLineRef,
    sourceRef: line.sourceRef,
    sourceVersion: line.sourceVersion,
    concept: line.concept,
    quantity: line.quantity,
    unit: line.unit,
    economicClass: line.economicClass,
    priceStatus: line.priceStatus,
    capturedCost: line.capturedCost,
    suggestedPrice: line.suggestedPrice,
    quotedPrice: line.quotedPrice,
    currency: line.currency,
    reason: line.reason,
    position: line.position,
    snapshot: line.snapshot,
  };
}

function revisionLogical(input, costing, lines, totals, client) {
  return quoteHash({
    costingRevisionRef: costing.revisionRef,
    costingLogicalSha256: costing.logicalSha256,
    proposalName: input.proposalName,
    currency: input.currency,
    issueDate: input.issueDate,
    validUntil: input.validUntil,
    commercialContext: input.commercialContext,
    payer: input.payer,
    terms: input.terms,
    exchange: input.exchange,
    discount: input.discount,
    lines: lines.map(({ sourceKind, costingLineRef, sourceRef, sourceVersion, concept, quantity, unit, economicClass, priceStatus, capturedCost, suggestedPrice, quotedPrice, currency, reason, position, snapshot }) => ({ sourceKind, costingLineRef, sourceRef, sourceVersion, concept, quantity, unit, economicClass, priceStatus, capturedCost, suggestedPrice, quotedPrice, currency, reason, position, snapshot })),
    totals,
    client,
  });
}

function outputReferences(costing, client) {
  const logistics = costing.logisticsRevision;
  return {
    costingRevisionRef: costing.revisionRef,
    logisticsPlanRevisionRef: isPackageQuoteBasis(logistics.inputSnapshot) || isCatalogQuoteBasis(logistics.inputSnapshot) ? null : logistics.revisionRef,
    surveyPublicationRef: logistics.inputSnapshot?.survey?.publicationRef || null,
    servicesRevisionRef: logistics.inputSnapshot?.services?.selectionRef || null,
    caseRef: client.caseRef,
  };
}

async function createRevision(tx, context, proposal, input, costing, lines, pipelineCase, state, supersedes = null) {
  const totals = calculateQuoteTotals(lines, input.discount);
  if (costing.inputSnapshot?.packagePricing) {
    totals.packageSubtotal = quoteMoney(lines.filter((line) => line.sourceKind === "COSTING" || line.snapshot?.packageMinimum).reduce((sum, line) => sum + Number(line.quotedPrice), 0));
  }
  const authorization = isCatalogQuoteBasis(costing.inputSnapshot) ? null : findAuthorization(costing, input.marginAuthorizationRef);
  const issues = buildIssues(pipelineCase, costing, lines, totals, authorization);
  const client = clientSnapshot(pipelineCase);
  const revision = proposal.currentRevision + 1;
  const logicalSha256 = revisionLogical(input, costing, lines, totals, client);
  const packagePricing = costing.inputSnapshot?.packagePricing;
  const packageScope = packagePricing ? {
    name: packagePricing.name, version: packagePricing.version, pricingVersion: packagePricing.pricingVersion,
    volumeM3: packagePricing.measures.volumeM3, minimumSale: packagePricing.minimumSale,
    afterM3: packagePricing.afterM3 ?? null, maxM3: packagePricing.maxM3 ?? null,
    adjustmentReason: input.packageAdjustmentReason ?? null,
  } : null;
  const row = await tx.quoteProposalRevision.create({
    data: {
      tenantId: context.tenantId,
      proposalId: proposal.id,
      costingRevisionId: costing.id,
      revision,
      state,
      proposalName: input.proposalName,
      costingLogicalSha256: costing.logicalSha256,
      currency: input.currency,
      issueDate: new Date(`${input.issueDate}T00:00:00.000Z`),
      validUntil: new Date(`${input.validUntil}T00:00:00.000Z`),
      commercialContextSnapshot: input.commercialContext,
      payerSnapshot: input.payer,
      termsSnapshot: input.terms,
      exchangeSnapshot: input.exchange,
      discountSnapshot: input.discount,
      totalsSnapshot: totals,
      marginAuthorizationSnapshot: authorization,
      internalSnapshot: {
        costingRevisionRef: costing.revisionRef, costingPublishedAt: costing.publishedAt.toISOString(),
        sourceReferences: outputReferences(costing, client), ...(packageScope && { packageScope }),
        sourceMode: isCatalogQuoteBasis(costing.inputSnapshot) ? "CATALOG" : packageScope ? "PACKAGE" : "COSTING",
      },
      clientSnapshot: client,
      logicalSha256,
      supersedesRevisionId: supersedes?.id || null,
      createdByMembershipId: context.membershipId,
      createdByUserId: context.userId,
      lines: { create: lines.map(lineCreate) },
      issues: { create: issues },
    },
    include: { lines: { orderBy: { position: "asc" } }, issues: true },
  });
  await tx.quoteProposal.update({ where: { id: proposal.id }, data: { currentRevision: revision, state } });
  return row;
}

function publicLine(line, internal, editing) {
  const base = { lineRef: line.lineRef, sourceKind: line.sourceKind, concept: line.concept, quantity: String(line.quantity), unit: line.unit, economicClass: line.economicClass, quotedPrice: line.quotedPrice == null ? null : String(line.quotedPrice), currency: line.currency, priceStatus: line.priceStatus, position: line.position };
  if (isPackageMinimumLine(line)) base.packageMinimum = true;
  if (editing) {
    base.costingLineRef = line.costingLineRef;
    base.reason = line.reason;
    if (line.snapshot?.catalog) base.catalog = line.snapshot.catalog;
  }
  return internal ? { ...base, costingLineRef: line.costingLineRef, sourceRef: line.sourceRef, sourceVersion: line.sourceVersion, capturedCost: line.capturedCost == null ? null : String(line.capturedCost), suggestedPrice: line.suggestedPrice == null ? null : String(line.suggestedPrice), reason: line.reason } : base;
}

function mapRevision(row, context, proposal) {
  const internal = has(context, QUOTE_PERMISSIONS.INTERNAL_COST);
  return {
    proposalRef: proposal.proposalRef,
    reference: proposal.reference,
    position: proposal.position,
    state: proposal.state,
    revisionRef: row.revisionRef,
    revision: row.revision,
    proposalName: row.proposalName,
    groupName: row.termsSnapshot?.groupName ?? null,
    sourceMode: row.internalSnapshot?.sourceMode ?? (row.internalSnapshot?.packageScope ? "PACKAGE" : "COSTING"),
    flexibleBasis: proposal.quote?.costingRevisionId === null,
    costingRevisionRef: row.internalSnapshot?.costingRevisionRef,
    ...(row.internalSnapshot?.packageScope && { packageScope: row.internalSnapshot.packageScope }),
    costingLogicalSha256: row.costingLogicalSha256,
    currency: row.currency,
    issueDate: row.issueDate.toISOString().slice(0, 10),
    validUntil: row.validUntil.toISOString().slice(0, 10),
    commercialContext: row.commercialContextSnapshot,
    payer: row.payerSnapshot,
    terms: row.termsSnapshot,
    exchange: row.exchangeSnapshot,
    discount: row.discountSnapshot,
    totals: internal ? row.totalsSnapshot : { grossQuotedPrice: row.totalsSnapshot.grossQuotedPrice, discountAmount: row.totalsSnapshot.discountAmount, totalQuotedPrice: row.totalsSnapshot.totalQuotedPrice },
    marginAuthorization: internal ? row.marginAuthorizationSnapshot : undefined,
    client: row.clientSnapshot,
    lines: row.lines.map((line) => publicLine(line, internal, has(context, QUOTE_PERMISSIONS.UPDATE))),
    issues: internal ? row.issues.map(({ issueRef, code, severity, message, status }) => ({ issueRef, code, severity, message, status })) : row.issues.filter((issue) => issue.status === "OPEN" && issue.severity === "BLOCKER").map(({ code, message }) => ({ code, message })),
    logicalSha256: row.logicalSha256,
  };
}

async function loadProposal(tx, context, proposalRef) {
  const proposal = await tx.quoteProposal.findFirst({ where: { tenantId: context.tenantId, proposalRef, pipelineCase: scope(context) }, include: { quote: true, pipelineCase: { include: { client: true, routeSnapshots: true } }, revisions: { orderBy: { revision: "desc" }, take: 1, include: { lines: { orderBy: { position: "asc" } }, issues: true } } } });
  if (!proposal || !proposal.revisions[0]) quoteFail("QUOTE_NOT_FOUND", 404);
  return { proposal, revision: proposal.revisions[0] };
}

async function nextReference(tx, tenantId, position) {
  const year = new Date().getUTCFullYear();
  const counter = await tx.quoteReferenceCounter.upsert({ where: { tenantId_year: { tenantId, year } }, create: { tenantId, year, value: 1 }, update: { value: { increment: 1 } } });
  return `Q-${year}-${String(counter.value).padStart(6, "0")}-${String.fromCharCode(64 + position)}`;
}

async function resolveQuoteBasis(tx, context, pipelineCase, input, supersedes = null) {
  if (input.costingRevisionRef === null) {
    if (input.discount) requirePermission(context, QUOTE_PERMISSIONS.OVERRIDE_PRICE);
    const lines = await buildLines(tx, input, { lines: [] }, context, supersedes);
    const costing = await ensureCatalogQuoteBasis(tx, context, pipelineCase, input, lines);
    return { costing, lines };
  }
  const costing = await resolvePublishedCosting(tx, context, pipelineCase.id, input.costingRevisionRef);
  if (isCatalogQuoteBasis(costing.inputSnapshot)) quoteFail("QUOTE_COSTING_CONTEXT_INVALID", 409);
  await assertPackageCaseCurrent(tx, context, pipelineCase, costing);
  return { costing, lines: await buildLines(tx, input, costing, context, supersedes) };
}

export async function createQuoteProposal(prisma, context, raw) {
  requirePermission(context, QUOTE_PERMISSIONS.CREATE);
  const input = normalizeQuoteCreate(raw);
  return serializable(prisma, async (tx) => {
    const prior = await replay(tx, context, input);
    if (prior) return prior;
    const pipelineCase = await resolveCase(tx, context, input.caseRef);
    let commercialAuthority;
    try {
      commercialAuthority = await resolveCommercialQuoteAuthority(tx, context, pipelineCase.id);
    } catch (error) {
      if (error?.code === "COMMERCIAL_PAYER_REQUIRED") quoteFail("QUOTE_PAYER_REQUIRED", 409);
      throw error;
    }
    const revisionInput = commercialAuthority ? { ...input, commercialContext: commercialAuthority.commercialContext, payer: commercialAuthority.payer } : input;
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:${pipelineCase.id}:quote-cycle`}, 0))`);
    const { costing, lines } = await resolveQuoteBasis(tx, context, pipelineCase, revisionInput);
    const costingRevisionId = input.costingRevisionRef === null ? null : costing.id;
    let quote = await tx.pipelineCaseQuote.findFirst({ where: { tenantId: context.tenantId, caseId: pipelineCase.id, contractVersion: 2, costingRevisionId }, orderBy: { cycleNumber: "desc" } });
    if (!quote) {
      const latest = await tx.pipelineCaseQuote.findFirst({ where: { tenantId: context.tenantId, caseId: pipelineCase.id }, orderBy: { cycleNumber: "desc" }, select: { cycleNumber: true } });
      quote = await tx.pipelineCaseQuote.create({ data: { tenantId: context.tenantId, caseId: pipelineCase.id, costingRevisionId, cycleNumber: (latest?.cycleNumber || 0) + 1, contractVersion: 2, level: "STANDARD", version: 1, status: "DRAFT" } });
    }
    const count = await tx.quoteProposal.count({ where: { tenantId: context.tenantId, quoteId: quote.id } });
    if (count >= 3) quoteFail("QUOTE_PROPOSAL_LIMIT_REACHED", 409);
    const reference = await nextReference(tx, context.tenantId, input.position);
    const proposal = await tx.quoteProposal.create({ data: { tenantId: context.tenantId, quoteId: quote.id, pipelineCaseId: pipelineCase.id, position: input.position, reference } });
    const revision = await createRevision(tx, context, proposal, revisionInput, costing, lines, pipelineCase, "DRAFT");
    const result = mapRevision(revision, context, { ...proposal, quote, state: "DRAFT" });
    return persist(tx, context, input, quote.id, proposal.proposalRef, result, "QUOTE_PROPOSAL_CREATE");
  });
}

export async function reviseQuoteProposal(prisma, context, raw) {
  requirePermission(context, QUOTE_PERMISSIONS.UPDATE);
  const input = normalizeQuoteRevise(raw);
  return serializable(prisma, async (tx) => {
    const prior = await replay(tx, context, input);
    if (prior) return prior;
    const { proposal, revision: current } = await loadProposal(tx, context, input.proposalRef);
    if (proposal.currentRevision !== input.expectedRevision || current.revision !== input.expectedRevision) quoteFail("QUOTE_VERSION_CONFLICT", 409);
    if (["ACCEPTED", "REJECTED", "CANCELLED", "EXPIRED"].includes(proposal.state)) quoteFail("QUOTE_STATE_CONFLICT", 409);
    if (input.caseRef !== proposal.pipelineCase.publicRef || input.position !== proposal.position) quoteFail("QUOTE_IDENTITY_IMMUTABLE", 409);
    let commercialAuthority;
    try {
      commercialAuthority = await resolveCommercialQuoteAuthority(tx, context, proposal.pipelineCaseId);
    } catch (error) {
      if (error?.code === "COMMERCIAL_PAYER_REQUIRED") quoteFail("QUOTE_PAYER_REQUIRED", 409);
      throw error;
    }
    const revisionInput = commercialAuthority ? { ...input, commercialContext: commercialAuthority.commercialContext, payer: commercialAuthority.payer } : input;
    const flexible = proposal.quote.costingRevisionId === null;
    if (!flexible && input.costingRevisionRef === null) quoteFail("QUOTE_COSTING_SELECTION_IMMUTABLE", 409);
    const { costing, lines } = await resolveQuoteBasis(tx, context, proposal.pipelineCase, revisionInput, current);
    if (!flexible && costing.id !== proposal.quote.costingRevisionId ||
      flexible && input.costingRevisionRef !== null && !costing.inputSnapshot?.packagePricing) quoteFail("QUOTE_COSTING_SELECTION_IMMUTABLE", 409);
    const revision = await createRevision(tx, context, proposal, revisionInput, costing, lines, proposal.pipelineCase, "DRAFT", current);
    const result = mapRevision(revision, context, { ...proposal, state: "DRAFT" });
    return persist(tx, context, input, proposal.quoteId, proposal.proposalRef, result, "QUOTE_PROPOSAL_REVISE");
  });
}

async function cloneStateRevision(tx, context, proposal, current, state, approval = null) {
  const approvalSnapshot = approval ?? current.marginAuthorizationSnapshot;
  return tx.quoteProposalRevision.create({
    data: {
      tenantId: context.tenantId, proposalId: proposal.id, costingRevisionId: current.costingRevisionId, revision: current.revision + 1, state,
      proposalName: current.proposalName, costingLogicalSha256: current.costingLogicalSha256, currency: current.currency, issueDate: current.issueDate, validUntil: current.validUntil,
      commercialContextSnapshot: current.commercialContextSnapshot, payerSnapshot: current.payerSnapshot, termsSnapshot: current.termsSnapshot, exchangeSnapshot: current.exchangeSnapshot,
      discountSnapshot: current.discountSnapshot, totalsSnapshot: current.totalsSnapshot, marginAuthorizationSnapshot: approvalSnapshot, internalSnapshot: current.internalSnapshot,
      clientSnapshot: current.clientSnapshot, logicalSha256: quoteHash({ source: current.logicalSha256, revision: current.revision + 1, state, ...(approval && { approval }) }), supersedesRevisionId: current.id,
      createdByMembershipId: context.membershipId, createdByUserId: context.userId,
      lines: { create: current.lines.map(({ sourceKind, costingLineRef, sourceRef, sourceVersion, concept, quantity, unit, economicClass, priceStatus, capturedCost, suggestedPrice, quotedPrice, currency, reason, position, snapshot }) => ({ sourceKind, costingLineRef, sourceRef, sourceVersion, concept, quantity, unit, economicClass, priceStatus, capturedCost, suggestedPrice, quotedPrice, currency, reason, position, snapshot })) },
      issues: { create: current.issues.map(({ code, severity, message, status, sourceSnapshot }) =>
        approval && code === "MARGIN_AUTHORIZATION_REQUIRED"
          ? { code, severity, message, status: "RESOLVED", sourceSnapshot: { ...sourceSnapshot, authorizationRef: approval.authorizationRef } }
          : { code, severity, message, status, sourceSnapshot }) },
    },
    include: { lines: { orderBy: { position: "asc" } }, issues: true },
  });
}

async function assertReadyForExternal(tx, context, proposal, revision, { acceptance = false, marginApproval = false } = {}) {
  if (proposal.pipelineCase.destinationStatus === "PENDING") quoteFail("QUOTE_DESTINATION_PENDING", 409);
  if (revision.validUntil < new Date(new Date().toISOString().slice(0, 10))) quoteFail("QUOTE_EXPIRED", 409);
  const costing = await resolvePublishedCosting(tx, context, proposal.pipelineCaseId, revision.internalSnapshot.costingRevisionRef);
  const catalog = isCatalogQuoteBasis(costing.inputSnapshot);
  if (costing.logicalSha256 !== revision.costingLogicalSha256) quoteFail("QUOTE_COSTING_INPUT_STALE", 409);
  if (marginApproval && (!catalog || !revision.issues.some((issue) => issue.code === "MARGIN_AUTHORIZATION_REQUIRED" && issue.status === "OPEN"))) {
    quoteFail("QUOTE_MARGIN_APPROVAL_INVALID", 409);
  }
  if (costing.issues.some((issue) => issue.severity === "BLOCKER" && issue.status === "OPEN")) quoteFail("QUOTE_COSTING_BLOCKERS_PRESENT", 409);
  if (revision.issues.some((issue) => issue.severity === "BLOCKER" && issue.status === "OPEN" &&
    (!marginApproval || issue.code !== "MARGIN_AUTHORIZATION_REQUIRED"))) quoteFail("QUOTE_BLOCKERS_PRESENT", 409);
  if (acceptance) {
    const accepted = await tx.quoteProposal.findFirst({ where: { tenantId: context.tenantId, pipelineCaseId: proposal.pipelineCaseId, state: "ACCEPTED", id: { not: proposal.id } }, select: { proposalRef: true } });
    if (accepted) quoteFail("QUOTE_ALREADY_ACCEPTED", 409);
  } else if (catalog) {
    const facts = costing.inputSnapshot.caseFacts;
    const current = await currentCatalogSelection(tx, context.tenantId, proposal.pipelineCaseId);
    if (facts?.caseRef !== proposal.pipelineCase.publicRef || facts.routeRevision !== proposal.pipelineCase.routeRevision ||
      facts.mode !== proposal.pipelineCase.mode || facts.serviceType !== proposal.pipelineCase.serviceType ||
      facts.selectionRef !== (current?.selectionRef ?? null)) quoteFail("QUOTE_COSTING_INPUT_STALE", 409);
  } else if (costing.inputSnapshot?.packagePricing) {
    await assertPackageCaseCurrent(tx, context, proposal.pipelineCase, costing);
  } else {
    const latest = await latestCostingRevision(tx, { where: { tenantId: context.tenantId, pipelineCaseId: proposal.pipelineCaseId }, context: QUOTE_TRANSPORT_CONTEXT, select: { id: true } });
    if (latest?.id !== costing.id) quoteFail("QUOTE_COSTING_INPUT_STALE", 409);
  }
  return costing;
}

async function approveCatalogQuoteMargin(tx, context, costing, revision, reason) {
  const { regularPrice, payablePrice, capturedCost, foregoneRevenue } = revision.totalsSnapshot;
  const override = await tx.costingOverride.create({
    data: {
      tenantId: context.tenantId, revisionId: costing.id, kind: "MARGIN", status: "AUTHORIZATION_REQUIRED", reason,
      suggestedValue: { quoteRevisionRef: revision.revisionRef, regularPrice, capturedCost },
      finalValue: { quoteRevisionRef: revision.revisionRef, payablePrice, foregoneRevenue },
      ...actor(context),
    },
  });
  const authorization = await tx.costingMarginAuthorization.create({
    data: {
      tenantId: context.tenantId, overrideId: override.id, decision: "AUTHORIZED", reason,
      ...actor(context),
    },
  });
  return { authorizationRef: authorization.authorizationRef, overrideRef: override.overrideRef, decision: "AUTHORIZED",
    quoteRevisionRef: revision.revisionRef, createdAt: authorization.createdAt.toISOString() };
}

async function assertPackageCaseCurrent(tx, context, pipelineCase, costing) {
  if (!costing.inputSnapshot?.packagePricing) return;
  const facts = costing.inputSnapshot.logistics;
  const current = await tx.pipelineCaseServiceRevision.findFirst({
    where: { tenantId: context.tenantId, pipelineCaseId: pipelineCase.id },
    orderBy: { revision: "desc" }, select: { selectionRef: true, modeSnapshot: true },
  });
  if (facts?.routeRevision !== pipelineCase.routeRevision || current?.selectionRef !== facts?.serviceSelectionRef
    || current?.modeSnapshot !== pipelineCase.mode) quoteFail("QUOTE_COSTING_INPUT_STALE", 409);
}

export async function publishQuoteProposal(prisma, context, raw) {
  requirePermission(context, QUOTE_PERMISSIONS.PUBLISH);
  const input = normalizeQuotePublish(raw);
  if (input.marginApprovalReason) requirePermission(context, "costing:authorize-margin");
  return serializable(prisma, async (tx) => {
    const prior = await replay(tx, context, input); if (prior) return prior;
    const { proposal, revision: current } = await loadProposal(tx, context, input.proposalRef);
    if (proposal.state !== "DRAFT" || current.revision !== input.expectedRevision) quoteFail("QUOTE_VERSION_CONFLICT", 409);
    const costing = await assertReadyForExternal(tx, context, proposal, current, { marginApproval: Boolean(input.marginApprovalReason) });
    const approval = input.marginApprovalReason ? await approveCatalogQuoteMargin(tx, context, costing, current, input.marginApprovalReason) : null;
    const revision = await cloneStateRevision(tx, context, proposal, current, "READY", approval);
    await tx.quoteProposal.update({ where: { id: proposal.id }, data: { currentRevision: revision.revision, state: "READY" } });
    const result = mapRevision(revision, context, { ...proposal, state: "READY" });
    return persist(tx, context, input, proposal.quoteId, proposal.proposalRef, result, "QUOTE_PROPOSAL_PUBLISH");
  });
}

export async function sendQuoteProposal(prisma, context, raw) {
  requirePermission(context, QUOTE_PERMISSIONS.SEND);
  const input = normalizeQuoteSend(raw);
  return serializable(prisma, async (tx) => {
    const prior = await replay(tx, context, input); if (prior) return prior;
    const { proposal, revision: current } = await loadProposal(tx, context, input.proposalRef);
    if (proposal.state !== "READY" || current.revision !== input.expectedRevision) quoteFail("QUOTE_VERSION_CONFLICT", 409);
    await assertReadyForExternal(tx, context, proposal, current);
    const revision = await cloneStateRevision(tx, context, proposal, current, "SENT");
    const dispatch = await tx.quoteDispatch.create({ data: { tenantId: context.tenantId, revisionId: revision.id, channel: input.channel, recipientSnapshot: input.recipient, evidenceRef: input.evidenceRef, ...actor(context) } });
    await tx.quoteProposal.update({ where: { id: proposal.id }, data: { currentRevision: revision.revision, state: "SENT" } });
    const result = { ...mapRevision(revision, context, { ...proposal, state: "SENT" }), dispatchRef: dispatch.dispatchRef, sentAt: dispatch.sentAt.toISOString() };
    return persist(tx, context, input, proposal.quoteId, proposal.proposalRef, result, "QUOTE_PROPOSAL_SEND");
  });
}

export async function recordQuoteDecision(prisma, context, raw) {
  requirePermission(context, QUOTE_PERMISSIONS.DECIDE);
  const input = normalizeQuoteDecision(raw);
  return serializable(prisma, async (tx) => {
    const prior = await replay(tx, context, input); if (prior) return prior;
    const { proposal, revision: current } = await loadProposal(tx, context, input.proposalRef);
    if (proposal.state !== "SENT" || current.revision !== input.expectedRevision) quoteFail("QUOTE_VERSION_CONFLICT", 409);
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:${proposal.pipelineCaseId}:quote-acceptance`}, 0))`);
    if (input.decision === "ACCEPTED") await assertReadyForExternal(tx, context, proposal, current, { acceptance: true });
    const decision = await tx.quoteClientDecision.create({ data: { tenantId: context.tenantId, proposalId: proposal.id, revisionId: current.id, decision: input.decision, method: input.method, decidedBySnapshot: input.decidedBy, evidenceRef: input.evidenceRef, reason: input.reason, ...actor(context) } });
    await tx.quoteProposal.update({ where: { id: proposal.id }, data: { state: input.decision } });
    const result = { proposalRef: proposal.proposalRef, revisionRef: current.revisionRef, state: input.decision, decisionRef: decision.decisionRef, decidedAt: decision.decidedAt.toISOString(), operationalHandoff: input.decision === "ACCEPTED" ? { proposalRevisionRef: current.revisionRef, ...current.internalSnapshot.sourceReferences } : null };
    return persist(tx, context, input, proposal.quoteId, proposal.proposalRef, result, `QUOTE_CLIENT_${input.decision}`);
  });
}

export async function cancelQuoteProposal(prisma, context, raw) {
  requirePermission(context, QUOTE_PERMISSIONS.UPDATE);
  const input = normalizeQuoteCancel(raw);
  return serializable(prisma, async (tx) => {
    const prior = await replay(tx, context, input); if (prior) return prior;
    const { proposal, revision } = await loadProposal(tx, context, input.proposalRef);
    if (proposal.currentRevision !== input.expectedRevision || ["ACCEPTED", "REJECTED", "CANCELLED"].includes(proposal.state)) quoteFail("QUOTE_VERSION_CONFLICT", 409);
    await tx.quoteProposal.update({ where: { id: proposal.id }, data: { state: "CANCELLED" } });
    const result = { proposalRef: proposal.proposalRef, revisionRef: revision.revisionRef, state: "CANCELLED", reason: input.reason, cancelledAt: new Date().toISOString() };
    return persist(tx, context, input, proposal.quoteId, proposal.proposalRef, result, "QUOTE_PROPOSAL_CANCEL");
  });
}

export async function getQuoteCase(prisma, context, caseRefRaw) {
  requirePermission(context, QUOTE_PERMISSIONS.VIEW);
  const caseRef = normalizeQuoteCaseRef(caseRefRaw);
  const pipelineCase = await resolveCase(prisma, context, caseRef);
  const proposals = await prisma.quoteProposal.findMany({
    where: { tenantId: context.tenantId, pipelineCaseId: pipelineCase.id },
    orderBy: { position: "asc" },
    include: { quote: { select: { costingRevisionId: true } }, revisions: { orderBy: { revision: "desc" }, take: 1, include: { lines: { orderBy: { position: "asc" } }, issues: true } } },
  });
  const previousVersions = proposals.filter((proposal) => proposal.currentRevision > 1);
  const history = previousVersions.length ? await prisma.quoteProposalRevision.findMany({
    where: {
      tenantId: context.tenantId,
      OR: previousVersions.map((proposal) => ({ proposalId: proposal.id, revision: { lt: proposal.currentRevision } })),
    },
    select: { proposalId: true, revisionRef: true, revision: true, state: true, createdAt: true },
    orderBy: { revision: "desc" },
  }) : [];
  return {
    caseRef: pipelineCase.publicRef, caseCode: pipelineCase.caseCode, destinationStatus: pipelineCase.destinationStatus,
    proposals: proposals.filter((proposal) => proposal.revisions[0]).map((proposal) => {
      const current = proposal.revisions[0];
      const versions = [{ revisionRef: current.revisionRef, revision: current.revision, state: proposal.state, createdAt: current.createdAt },
        ...history.filter((row) => row.proposalId === proposal.id).map(({ revisionRef, revision, state, createdAt }) => ({ revisionRef, revision, state, createdAt }))];
      return { ...mapRevision(current, context, proposal), versions };
    }),
  };
}

export function getQuoteClientProjection(internal) {
  return {
    proposalRef: internal.proposalRef,
    reference: internal.reference,
    revisionRef: internal.revisionRef,
    revision: internal.revision,
    state: internal.state,
    proposalName: internal.proposalName,
    groupName: internal.groupName ?? null,
    currency: internal.currency,
    issueDate: internal.issueDate,
    validUntil: internal.validUntil,
    client: internal.client,
    payer: { displayName: internal.payer.displayName },
    terms: internal.terms && {
      scope: internal.terms.scope, paymentTerms: internal.terms.paymentTerms, exclusions: internal.terms.exclusions,
      specialConditions: internal.terms.specialConditions, clientNotes: internal.terms.clientNotes,
    },
    exchange: internal.exchange && {
      sourceCurrency: internal.exchange.sourceCurrency, targetCurrency: internal.exchange.targetCurrency, rate: internal.exchange.rate,
    },
    ...(internal.packageScope && { packageScope: { name: internal.packageScope.name, volumeM3: internal.packageScope.volumeM3 } }),
    totals: { grossQuotedPrice: internal.totals.grossQuotedPrice, discountAmount: internal.totals.discountAmount, totalQuotedPrice: internal.totals.totalQuotedPrice },
    lines: internal.lines.map(({ lineRef, concept, quantity, unit, quotedPrice, currency, position }) => ({ lineRef, concept, quantity, unit, quotedPrice, currency, position })),
    logicalSha256: internal.logicalSha256,
  };
}

export async function getQuoteClientProposal(prisma, context, proposalRefRaw, revisionRefRaw) {
  requirePermission(context, QUOTE_PERMISSIONS.VIEW);
  const proposalRef = normalizeQuoteCaseRef(proposalRefRaw);
  const revisionRef = revisionRefRaw === undefined ? undefined : normalizeQuoteCaseRef(revisionRefRaw);
  const proposal = await prisma.quoteProposal.findFirst({
    where: { tenantId: context.tenantId, proposalRef, pipelineCase: scope(context) },
    select: {
      proposalRef: true, reference: true, currentRevision: true, state: true,
      revisions: { where: { tenantId: context.tenantId, revisionRef }, orderBy: { revision: "desc" }, take: 1,
        include: { lines: { orderBy: { position: "asc" } }, issues: true } },
    },
  });
  const revision = proposal?.revisions[0];
  if (!revision) quoteFail("QUOTE_NOT_FOUND", 404);
  const state = revision.revision === proposal.currentRevision ? proposal.state : revision.state;
  return getQuoteClientProjection(mapRevision(revision, context, { ...proposal, state }));
}

export function mapQuoteDatabaseError(error) {
  if (error instanceof QuoteError) return error;
  if (error?.code === "P2002") {
    const target = Array.isArray(error.meta?.target) ? error.meta.target.join(",") : String(error.meta?.target || "");
    if (target.includes("one_accepted") || target.includes("pipeline_case_id")) return new QuoteError("QUOTE_ALREADY_ACCEPTED", 409);
    if (target.includes("position")) return new QuoteError("QUOTE_POSITION_CONFLICT", 409);
    if (target.includes("request")) return new QuoteError("QUOTE_IDEMPOTENCY_CONFLICT", 409);
    if (target.includes("reference")) return new QuoteError("QUOTE_REFERENCE_CONFLICT", 409);
    return new QuoteError("QUOTE_CONCURRENCY_CONFLICT", 409);
  }
  if (error?.code === "P2034") return new QuoteError("QUOTE_CONCURRENCY_CONFLICT", 409);
  if (String(error?.message || "").includes("QUOTE_")) return new QuoteError(String(error.message).match(/QUOTE_[A-Z_]+/)?.[0] || "QUOTE_DATABASE_CONSTRAINT", 409);
  return error;
}

export const quoteContractInternals = Object.freeze({ canonicalQuoteJson, buildLines });
