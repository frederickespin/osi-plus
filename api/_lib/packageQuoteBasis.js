import { Prisma } from "@prisma/client";
import { PACKAGE_QUOTE_BASIS } from "../../shared/servicePackagePricing.js";
import { costingHash } from "./costingContract.js";

export const isPackageQuoteBasis = (snapshot) => snapshot?.kind === PACKAGE_QUOTE_BASIS && snapshot.transportContext === null;
export const CATALOG_QUOTE_BASIS = "CATALOG_QUOTE_BASIS";
export const isCatalogQuoteBasis = (snapshot) => snapshot?.kind === CATALOG_QUOTE_BASIS && snapshot.transportContext === null;

export function ensurePackageQuoteBasis(tx, context, pipelineCase, selection) {
  return ensureQuoteLogisticsBasis(tx, context, pipelineCase, selection, PACKAGE_QUOTE_BASIS, "package-quote-basis");
}

export function ensureCatalogLogisticsBasis(tx, context, pipelineCase, selection) {
  return ensureQuoteLogisticsBasis(tx, context, pipelineCase, selection, CATALOG_QUOTE_BASIS, "catalog-quote-basis");
}

async function ensureQuoteLogisticsBasis(tx, context, pipelineCase, selection, kind, namespace) {
  const tenantId = context.tenantId;
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${pipelineCase.id}:logistics-plan`}, 0))`);
  const plan = await tx.logisticsPlan.upsert({
    where: { tenantId_pipelineCaseId: { tenantId, pipelineCaseId: pipelineCase.id } },
    update: {}, create: { tenantId, pipelineCaseId: pipelineCase.id },
    select: { id: true, planRef: true },
  });
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${plan.id}:logistics-revision`}, 0))`);

  const survey = selection ? await tx.surveyPublication.findFirst({
    where: { tenantId, pipelineCaseId: pipelineCase.id, serviceSelectionRef: selection.selectionRef, status: "CURRENT" },
    select: { publicationRef: true, logicalSha256: true },
  }) : null;
  // A commercial estimate records case facts. Its explicit null transport context
  // keeps this evidence out of the route, staffing and scheduling plan readers.
  const facts = {
    kind, transportContext: null, caseRef: pipelineCase.publicRef,
    route: { version: pipelineCase.routeRevision },
    services: selection ? { selectionRef: selection.selectionRef, revision: selection.revision, mode: pipelineCase.mode, codes: selection.items.map((item) => item.codeSnapshot) } : null,
    survey,
  };
  const basisHash = costingHash(facts);
  const inputSnapshot = { ...facts, basisHash };
  const where = { tenantId, planId: plan.id, status: "PUBLISHED" };
  const prior = await tx.logisticsPlanRevision.findFirst({
    where: { ...where, inputSnapshot: { path: ["basisHash"], equals: basisHash } },
  });
  if (prior) return { ...prior, plan, items: [], issues: [] };
  const last = await tx.logisticsPlanRevision.findFirst({ where: { tenantId, planId: plan.id }, orderBy: { revision: "desc" }, select: { revision: true } });
  const observedAt = new Date();
  const resultSnapshot = { items: [], issues: [], rules: [] };
  const calculation = await tx.logisticsCalculation.create({ data: {
    tenantId, pipelineCaseId: pipelineCase.id, routeVersion: Math.max(1, pipelineCase.routeRevision),
    // Required storage headers identify the case even when this estimate predates
    // service selection. The snapshot records null and is never a transport plan.
    serviceSelectionRef: selection?.selectionRef ?? pipelineCase.publicRef, serviceRevision: selection?.revision ?? 1,
    surveyPublicationRef: survey?.publicationRef ?? null, surveyLogicalSha256: survey?.logicalSha256 ?? null,
    // This is the observation interval for the estimate, not a reservation.
    intervalStart: observedAt, intervalEnd: new Date(observedAt.getTime() + 1000), availabilityObservedAt: observedAt,
    inputSnapshot, rulesSnapshot: [], resultSnapshot, inputHash: basisHash, resultHash: costingHash(resultSnapshot),
    requestId: `${namespace}:${basisHash}`, payloadHash: basisHash,
    actorMembershipId: context.membershipId, actorUserId: context.userId,
  } });
  const row = await tx.logisticsPlanRevision.create({ data: {
    tenantId, planId: plan.id, calculationId: calculation.id, revision: (last?.revision ?? 0) + 1,
    inputSnapshot, rulesSnapshot: [], resultSnapshot, logicalSha256: costingHash({ inputSnapshot, resultSnapshot }),
    publishedByMembershipId: context.membershipId, publishedByUserId: context.userId,
  } });
  return { ...row, plan, items: [], issues: [] };
}
