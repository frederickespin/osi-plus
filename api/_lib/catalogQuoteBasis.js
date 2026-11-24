import { Prisma } from "@prisma/client";
import { costingHash } from "./costingContract.js";
import { CATALOG_QUOTE_BASIS, ensureCatalogLogisticsBasis } from "./packageQuoteBasis.js";
import { calculateQuoteTotals } from "./quoteContract.js";

const Decimal = Prisma.Decimal.clone({ precision: 40 });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const details = { lines: { orderBy: { position: "asc" } }, issues: true, overrides: { include: { authorizations: true } } };

export function currentCatalogSelection(tx, tenantId, pipelineCaseId) {
  return tx.pipelineCaseServiceRevision.findFirst({
    where: { tenantId, pipelineCaseId },
    orderBy: { revision: "desc" },
    select: { selectionRef: true, revision: true, items: { orderBy: { position: "asc" }, select: { codeSnapshot: true } } },
  });
}

function costingLine(line) {
  const unitCost = line.snapshot.valuation?.unitCost ?? new Decimal(line.capturedCost).div(line.quantity).toDecimalPlaces(6).toString();
  return {
    logisticsItemRef: null,
    family: line.snapshot.valuation?.family ?? "ADDITIONAL",
    concept: line.concept,
    classification: line.economicClass,
    source: "ADMIN",
    sourceRef: UUID.test(line.sourceRef) ? line.sourceRef : null,
    sourceVersion: line.sourceVersion,
    quantity: line.quantity,
    unit: line.unit,
    originalCurrency: line.currency,
    originalUnitCost: unitCost,
    exchangeRateRef: null,
    exchangeRateVersion: null,
    exchangeRate: "1",
    baseCurrency: line.currency,
    baseUnitCost: unitCost,
    totalCost: line.capturedCost,
    minimumMarginBps: line.snapshot.valuation?.minimumMarginBps ?? null,
    recommendedMarginBps: line.snapshot.valuation?.recommendedMarginBps ?? null,
    suggestedPrice: line.suggestedPrice,
    priceStatus: line.economicClass === "PR" ? "RECOMMENDED" : "NO_MARGIN",
    snapshot: line.snapshot,
    position: line.position,
  };
}

export async function ensureCatalogQuoteBasis(tx, context, pipelineCase, input, lines) {
  const tenantId = context.tenantId;
  const selection = await currentCatalogSelection(tx, tenantId, pipelineCase.id);
  const logistics = await ensureCatalogLogisticsBasis(tx, context, pipelineCase, selection);
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${pipelineCase.id}:costing-revision`}, 0))`);

  const caseFacts = {
    caseRef: pipelineCase.publicRef,
    routeRevision: pipelineCase.routeRevision,
    mode: pipelineCase.mode,
    serviceType: pipelineCase.serviceType,
    selectionRef: selection?.selectionRef ?? null,
  };
  const costLines = lines.map(costingLine);
  const amounts = lines.map((line) => ({
    sourceRef: line.sourceRef,
    sourceVersion: line.sourceVersion,
    quantity: line.quantity,
    quotedPrice: line.quotedPrice,
  }));
  const totals = calculateQuoteTotals(lines, input.discount);
  const resultSnapshot = { lines: costLines, issues: [], totals };
  const facts = {
    kind: CATALOG_QUOTE_BASIS, transportContext: null, baseCurrency: input.currency,
    caseFacts, logisticsBasisHash: logistics.inputSnapshot.basisHash, amounts, discount: input.discount,
  };
  const basisHash = costingHash({ facts, resultSnapshot });
  const inputSnapshot = { ...facts, basisHash };
  const where = { tenantId, pipelineCaseId: pipelineCase.id };
  const prior = await tx.costingRevision.findFirst({
    where: { ...where, status: "PUBLISHED", inputSnapshot: { path: ["basisHash"], equals: basisHash } },
    include: details,
  });
  if (prior) return { ...prior, logisticsRevision: logistics };
  const latest = await tx.costingRevision.findFirst({ where, orderBy: { revision: "desc" }, select: { revision: true } });
  const common = { ...where, logisticsRevisionId: logistics.id, baseCurrency: input.currency, inputSnapshot, rulesSnapshot: [], ratesSnapshot: [] };
  const calculation = await tx.costingCalculation.create({ data: {
    ...common, resultSnapshot, inputHash: costingHash(inputSnapshot), resultHash: costingHash(resultSnapshot),
    requestId: `catalog-quote:${basisHash}`, payloadHash: basisHash,
    actorMembershipId: context.membershipId, actorUserId: context.userId,
  } });
  const row = await tx.costingRevision.create({
    data: {
      ...common, calculationId: calculation.id, revision: (latest?.revision ?? 0) + 1,
      logicalSha256: basisHash, totalsSnapshot: totals,
      publishedByMembershipId: context.membershipId, publishedByUserId: context.userId,
      lines: { create: costLines },
    },
    include: details,
  });
  return { ...row, logisticsRevision: logistics };
}
