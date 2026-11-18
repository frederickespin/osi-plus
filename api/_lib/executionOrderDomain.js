import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { appendCommercialAudit } from "./commercialAuditLog.js";
import { CrmServicesError, serviceFail, serviceRef } from "./crmServicesContract.js";
import { normalizeExecutionOrderCommand } from "./executionOrderContract.js";

const SOURCE = "V17_COMMON_EXECUTION_ORDER";
const REQUIRED_VIEW = ["services:case:view", "projects:view"];
const REQUIRED_WRITE = ["services:case:update", "projects:create"];

function has(context, permission) {
  return context?.effectivePermissions?.includes(permission) && !context?.deniedPermissions?.includes(permission);
}

function requirePermissions(context, permissions) {
  if (!context?.tenantId || !context?.membershipId || !context?.userId || permissions.some((permission) => !has(context, permission))) {
    serviceFail("EXECUTION_ORDER_FORBIDDEN", 403);
  }
}

function caseScope(context) {
  return context.role === "V" ? { ownerMembershipId: context.membershipId, ownerUserId: context.userId } : {};
}

function currentRoute(pipelineCase) {
  return pipelineCase.routeSnapshots
    .filter((item) => item.routeVersion === pipelineCase.routeRevision)
    .map((item) => ({
      role: item.role,
      stopOrder: item.stopOrder,
      countryCode: item.countryCode,
      provinceState: item.provinceState,
      cityMunicipality: item.cityMunicipality,
      sector: item.sector,
      streetAndNumber: item.streetAndNumber,
      buildingResidential: item.buildingResidential,
      floorUnit: item.floorUnit,
      arrivalReference: item.arrivalReference,
      locationContactName: item.locationContactName,
      locationContactPhone: item.locationContactPhone,
    }));
}

function serviceSnapshot(revision) {
  if (!revision) return null;
  const items = revision.items.map((item) => ({
    kind: item.kind,
    code: item.codeSnapshot,
    name: item.nameSnapshot,
    category: item.categorySnapshot,
    position: item.position,
  }));
  return {
    selectionRef: revision.selectionRef,
    revision: revision.revision,
    mode: revision.modeSnapshot,
    primary: items.find((item) => item.kind === "PRIMARY") || null,
    associated: items.filter((item) => item.kind !== "PRIMARY"),
  };
}

function proposalSnapshot(proposal) {
  const revision = proposal?.revisions?.[0];
  if (!proposal || !revision) return null;
  return {
    proposalRef: proposal.proposalRef,
    reference: proposal.reference,
    revisionRef: revision.revisionRef,
    revision: revision.revision,
    name: revision.proposalName,
    currency: revision.currency,
    totals: revision.totalsSnapshot,
    logicalSha256: revision.logicalSha256,
    acceptedAt: proposal.decisions?.[0]?.decidedAt?.toISOString() || proposal.updatedAt.toISOString(),
    lines: revision.lines.map((line) => ({
      concept: line.concept,
      quantity: String(line.quantity),
      unit: line.unit,
      quotedPrice: line.quotedPrice === null ? null : String(line.quotedPrice),
      currency: line.currency,
      position: line.position,
    })),
  };
}

function executionOrderOf(project) {
  const requirements = project?.coordination?.requirementsJson;
  if (!requirements || typeof requirements !== "object" || Array.isArray(requirements)) return null;
  const order = requirements.executionOrder;
  return order && typeof order === "object" && !Array.isArray(order) ? order : null;
}

function mapOrder(project) {
  const order = executionOrderOf(project);
  if (!order) return null;
  return Object.freeze({
    orderRef: project.id,
    orderCode: project.code,
    version: Number(order.version || 0),
    state: String(order.state || "DRAFT"),
    kind: String(order.kind || "MOVING"),
    plannedStart: String(order.planning?.plannedStart || project.startDate),
    plannedEnd: String(order.planning?.plannedEnd || project.endDate || ""),
    contractEvidenceRef: order.contract?.evidenceRef ? String(order.contract.evidenceRef) : null,
    coordinatorName: order.planning?.coordinatorName ? String(order.planning.coordinatorName) : null,
    crewLeadName: order.resources?.crewLeadName ? String(order.resources.crewLeadName) : null,
    driverName: order.resources?.driverName ? String(order.resources.driverName) : null,
    vehicleName: order.resources?.vehicleName ? String(order.resources.vehicleName) : null,
    instructions: order.instructions ? String(order.instructions) : null,
    issuedAt: order.issuedAt ? String(order.issuedAt) : null,
    updatedAt: project.coordination.updatedAt.toISOString(),
  });
}

async function loadCase(tx, context, caseRef) {
  const pipelineCase = await tx.pipelineCase.findFirst({
    where: { tenantId: context.tenantId, publicRef: serviceRef(caseRef), ...caseScope(context) },
    include: {
      client: true,
      routeSnapshots: { orderBy: [{ routeVersion: "desc" }, { role: "asc" }, { stopOrder: "asc" }] },
      serviceRevisions: { orderBy: { revision: "desc" }, take: 1, include: { items: { orderBy: { position: "asc" } } } },
      quoteProposals: {
        where: { state: "ACCEPTED" },
        orderBy: { updatedAt: "desc" },
        take: 1,
        include: {
          revisions: { orderBy: { revision: "desc" }, take: 1, include: { lines: { orderBy: { position: "asc" } } } },
          decisions: { where: { decision: "ACCEPTED" }, orderBy: { decidedAt: "desc" }, take: 1 },
        },
      },
      projects: { include: { coordination: true } },
    },
  });
  if (!pipelineCase) serviceFail("EXECUTION_ORDER_NOT_FOUND", 404);
  return pipelineCase;
}

function authorityOf(pipelineCase) {
  const services = serviceSnapshot(pipelineCase.serviceRevisions[0]);
  const proposal = proposalSnapshot(pipelineCase.quoteProposals[0]);
  const route = currentRoute(pipelineCase);
  const blockers = [];
  if (!pipelineCase.clientId || !pipelineCase.client) blockers.push({ code: "CLIENT_REQUIRED", label: "Cliente genuino vinculado" });
  if (!services?.primary) blockers.push({ code: "SERVICE_PLAN_REQUIRED", label: "Plan de servicios definido" });
  if (!proposal) blockers.push({ code: "ACCEPTED_PROPOSAL_REQUIRED", label: "Propuesta aceptada" });
  if (!route.some((item) => item.role === "ORIGIN")) blockers.push({ code: "ORIGIN_REQUIRED", label: "Origen confirmado" });
  if (pipelineCase.destinationContracted && !route.some((item) => item.role === "DESTINATION")) blockers.push({ code: "DESTINATION_REQUIRED", label: "Destino confirmado" });
  return {
    case: {
      caseRef: pipelineCase.publicRef,
      caseCode: pipelineCase.caseCode,
      clientName: pipelineCase.client?.name || pipelineCase.clientName || "Cliente pendiente",
      mode: pipelineCase.mode,
    },
    services,
    proposal,
    route,
    blockers,
  };
}

function orderProject(pipelineCase) {
  return pipelineCase.projects.find((project) => executionOrderOf(project)) || null;
}

function publicWorkspace(pipelineCase) {
  const authority = authorityOf(pipelineCase);
  return Object.freeze({ ...authority, order: mapOrder(orderProject(pipelineCase)) });
}

function databaseError(error) {
  if (error instanceof CrmServicesError) return error;
  if (["P2002", "P2034"].includes(error?.code)) return new CrmServicesError("EXECUTION_ORDER_CONFLICT", 409, { cause: error });
  if (["P2003", "P2025"].includes(error?.code)) return new CrmServicesError("EXECUTION_ORDER_STATE_INVALID", 409, { cause: error });
  return new CrmServicesError("EXECUTION_ORDER_DATABASE_UNAVAILABLE", 503, { cause: error });
}

export async function getExecutionOrderWorkspace(database, context, caseRef) {
  requirePermissions(context, REQUIRED_VIEW);
  try {
    return await database.$transaction(async (tx) => publicWorkspace(await loadCase(tx, context, caseRef)));
  } catch (error) { throw databaseError(error); }
}

export async function saveExecutionOrder(database, context, caseRef, raw) {
  requirePermissions(context, REQUIRED_WRITE);
  const input = normalizeExecutionOrderCommand(raw);
  try {
    return await database.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:${caseRef}:execution-order`}, 0))`);
      const pipelineCase = await loadCase(tx, context, caseRef);
      const replay = await tx.serviceMutationCommand.findUnique({ where: { tenantId_requestId: { tenantId: context.tenantId, requestId: input.requestId } } });
      if (replay) {
        const belongsToCase = pipelineCase.projects.some((project) => project.id === replay.targetRef && executionOrderOf(project));
        if (!belongsToCase || replay.operation !== input.operation || replay.payloadHash !== input.payloadHash) serviceFail("CRM_SERVICES_IDEMPOTENCY_CONFLICT", 409);
        return Object.freeze({ ...publicWorkspace(pipelineCase), replayed: true });
      }

      const authority = authorityOf(pipelineCase);
      if (authority.blockers.length) serviceFail("EXECUTION_ORDER_AUTHORITY_INCOMPLETE", 409);
      const existingProject = orderProject(pipelineCase);
      const existingOrder = executionOrderOf(existingProject);
      const version = Number(existingOrder?.version || 0);
      if (input.expectedVersion !== version) serviceFail("EXECUTION_ORDER_VERSION_CONFLICT", 409);
      if (existingOrder?.state === "ISSUED") serviceFail("EXECUTION_ORDER_ALREADY_ISSUED", 409);

      const now = new Date().toISOString();
      const primaryText = `${authority.services.primary.code} ${authority.services.primary.name}`.toUpperCase();
      const kind = primaryText.includes("TRANSPORT") ? "TRANSPORT" : "MOVING";
      const nextOrder = {
        version: version + 1,
        state: input.action === "ISSUE" ? "ISSUED" : "DRAFT",
        kind,
        contract: { evidenceRef: input.contractEvidenceRef },
        planning: { plannedStart: input.plannedStart, plannedEnd: input.plannedEnd, coordinatorName: input.coordinatorName },
        resources: { crewLeadName: input.crewLeadName, driverName: input.driverName, vehicleName: input.vehicleName },
        instructions: input.instructions,
        source: {
          case: authority.case,
          proposal: authority.proposal,
          services: authority.services,
          route: authority.route,
        },
        issuedAt: input.action === "ISSUE" ? now : null,
        lastSavedAt: now,
      };
      const totalValue = Number(authority.proposal.totals?.totalQuotedPrice || authority.proposal.totals?.payablePrice || 0);
      const projectData = {
        tenantId: context.tenantId,
        pipelineCaseId: pipelineCase.id,
        code: `EO-${pipelineCase.caseCode}-${pipelineCase.id.slice(-6).toUpperCase()}`,
        name: `${authority.services.primary.name} · ${authority.case.clientName}`,
        clientId: pipelineCase.clientId,
        clientName: authority.case.clientName,
        status: input.action === "ISSUE" ? "EXECUTION_ORDER_ISSUED" : "EXECUTION_ORDER_DRAFT",
        startDate: input.plannedStart,
        endDate: input.plannedEnd,
        totalValue: Number.isFinite(totalValue) ? totalValue : 0,
        assignedTo: input.coordinatorName,
        notes: input.instructions,
        quoteId: authority.proposal.revisionRef,
        kState: "PENDING_VALIDATION",
      };
      let project;
      if (existingProject) {
        const { code: _unchangedCode, ...updateData } = projectData;
        project = await tx.project.update({ where: { id: existingProject.id }, data: updateData });
        await tx.projectCoordination.upsert({
          where: { projectId: project.id },
          create: { projectId: project.id, status: nextOrder.state, requirementsJson: { executionOrder: nextOrder } },
          update: { status: nextOrder.state, requirementsJson: { executionOrder: nextOrder } },
        });
      } else {
        project = await tx.project.create({ data: { ...projectData, id: randomUUID() } });
        await tx.projectCoordination.create({ data: { projectId: project.id, status: nextOrder.state, requirementsJson: { executionOrder: nextOrder } } });
      }
      await tx.serviceMutationCommand.create({ data: {
        tenantId: context.tenantId,
        requestId: input.requestId,
        operation: input.operation,
        payloadHash: input.payloadHash,
        targetRef: project.id,
        resultingVersion: nextOrder.version,
        actorMembershipId: context.membershipId,
        actorUserId: context.userId,
      } });
      await appendCommercialAudit(tx, { tenantId: context.tenantId, actorKind: "MEMBERSHIP", actorMembershipId: context.membershipId }, {
        source: SOURCE,
        action: input.action === "ISSUE" ? "EXECUTION_ORDER_ISSUED" : "EXECUTION_ORDER_DRAFT_SAVED",
        entity: "EXECUTION_ORDER",
        entityId: project.id,
        requestId: input.requestId,
        correlationId: input.requestId,
        critical: input.action === "ISSUE",
        beforeJson: existingOrder,
        afterJson: nextOrder,
        metadataJson: { caseRef: pipelineCase.publicRef, proposalRevisionRef: authority.proposal.revisionRef, servicesRevision: authority.services.revision },
      });
      return Object.freeze({ ...(publicWorkspace(await loadCase(tx, context, caseRef))), replayed: false });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 3_000, timeout: 20_000 });
  } catch (error) { throw databaseError(error); }
}

