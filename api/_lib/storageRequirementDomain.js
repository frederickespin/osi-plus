import { Prisma } from "@prisma/client";
import { custodyFail } from "./customerCustodyContract.js";
import { hasStorageService } from "./storageServiceSelection.js";

function mapRequirement(row, serviceSelectionRef = null) {
  if (!row) return null;
  return {
    requirementRef: row.requirementRef,
    revision: row.revision,
    serviceSelectionRef,
    storageType: row.storageType,
    capacityBasis: row.capacityBasis,
    capacityQuantity: Number(row.capacityQuantity),
    estimatedDurationMonths: row.estimatedDurationMonths,
    plannedEntryDate: row.plannedEntryDate?.toISOString().slice(0, 10) ?? null,
    dataSource: row.dataSource,
    visitDecision: row.visitDecision,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

async function replay(tx, context, input) {
  const prior = await tx.customerCustodyCommand.findUnique({ where: { tenantId_requestId: { tenantId: context.tenantId, requestId: input.requestId } } });
  if (!prior) return null;
  if (prior.payloadHash !== input.payloadHash || prior.operation !== input.operation) custodyFail("CUSTOMER_CUSTODY_IDEMPOTENCY_CONFLICT", 409);
  return prior.resultJson;
}

async function loadCase(prisma, context, caseRef) {
  const pipelineCase = await prisma.pipelineCase.findFirst({
    where: { tenantId: context.tenantId, publicRef: caseRef },
    include: { serviceRevisions: { include: { items: { orderBy: { position: "asc" } } }, orderBy: { revision: "desc" }, take: 1 } },
  });
  if (!pipelineCase) custodyFail("CUSTOMER_CUSTODY_RESOURCE_NOT_FOUND", 404);
  return pipelineCase;
}

export async function getStorageRequirementWorkspace(prisma, context, query = {}) {
  const caseRef = typeof query.caseRef === "string" ? query.caseRef : "";
  if (!caseRef) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  const pipelineCase = await loadCase(prisma, context, caseRef);
  const serviceRevision = pipelineCase.serviceRevisions[0] ?? null;
  const rows = await prisma.customerStorageRequirementRevision.findMany({
    where: { tenantId: context.tenantId, pipelineCaseId: pipelineCase.id },
    orderBy: { revision: "desc" },
    take: 20,
  });
  return {
    caseRef: pipelineCase.publicRef,
    serviceSelectionRef: serviceRevision?.selectionRef ?? null,
    storageServiceSelected: hasStorageService(serviceRevision),
    current: mapRequirement(rows[0] ?? null, serviceRevision?.selectionRef ?? null),
    historyCount: rows.length,
  };
}

export async function saveStorageRequirement(prisma, context, input) {
  return prisma.$transaction(async (tx) => {
    const prior = await replay(tx, context, input);
    if (prior) return prior;
    const [pipelineCase, serviceRevision] = await Promise.all([
      tx.pipelineCase.findFirst({ where: { tenantId: context.tenantId, publicRef: input.caseRef } }),
      tx.pipelineCaseServiceRevision.findFirst({ where: { tenantId: context.tenantId, selectionRef: input.serviceSelectionRef }, include: { items: { orderBy: { position: "asc" } } } }),
    ]);
    if (!pipelineCase || !serviceRevision || serviceRevision.pipelineCaseId !== pipelineCase.id) custodyFail("CUSTOMER_CUSTODY_RESOURCE_NOT_FOUND", 404);
    if (!hasStorageService(serviceRevision)) custodyFail("CUSTOMER_CUSTODY_STORAGE_SERVICE_REQUIRED", 409);
    const latest = await tx.customerStorageRequirementRevision.findFirst({ where: { tenantId: context.tenantId, pipelineCaseId: pipelineCase.id }, orderBy: { revision: "desc" } });
    const latestRevision = latest?.revision ?? 0;
    if (latestRevision !== input.expectedRevision) custodyFail("CUSTOMER_CUSTODY_VERSION_CONFLICT", 409);
    const row = await tx.customerStorageRequirementRevision.create({
      data: {
        tenantId: context.tenantId,
        pipelineCaseId: pipelineCase.id,
        serviceRevisionId: serviceRevision.id,
        revision: latestRevision + 1,
        storageType: input.storageType,
        capacityBasis: input.capacityBasis,
        capacityQuantity: new Prisma.Decimal(input.capacityQuantity),
        estimatedDurationMonths: input.estimatedDurationMonths,
        plannedEntryDate: input.plannedEntryDate ? new Date(`${input.plannedEntryDate}T00:00:00.000Z`) : null,
        dataSource: input.dataSource,
        visitDecision: input.visitDecision,
        notes: input.notes,
        createdByMembershipId: context.membershipId,
        createdByUserId: context.userId,
      },
    });
    const result = mapRequirement(row, serviceRevision.selectionRef);
    await tx.customerCustodyCommand.create({ data: { tenantId: context.tenantId, requestId: input.requestId, operation: input.operation, payloadHash: input.payloadHash, targetRef: row.requirementRef, resultJson: result, actorMembershipId: context.membershipId, actorUserId: context.userId } });
    return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
