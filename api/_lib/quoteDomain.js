import { Prisma } from "@prisma/client";
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
      return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout });
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
  if (row.operation !== input.operation || row.payloadHash !== input.payloadHash) quoteFail("QUOTE_IDEMPOTENCY_CONFLICT", 409);
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

function buildLines(input, costing) {
  const costingByRef = new Map(costing.lines.map((line) => [line.lineRef, line]));
  return input.lines.map((line) => {
    if (line.sourceKind === "COSTING") {
      const source = costingByRef.get(line.costingLineRef);
      if (!source) quoteFail("QUOTE_COSTING_LINE_NOT_FOUND", 404);
      if (source.suggestedPrice == null || line.quotedPrice == null) quoteFail("QUOTE_COSTING_LINE_PENDING", 409);
      if (line.concept !== source.concept || line.quantity !== String(source.quantity) || line.unit !== source.unit || line.economicClass !== source.classification) quoteFail("QUOTE_COSTING_LINE_TAMPERED", 409);
      return {
        ...line,
        sourceRef: String(source.sourceRef || source.lineRef),
        sourceVersion: source.sourceVersion || costing.revision,
        capturedCost: String(source.totalCost),
        suggestedPrice: String(source.suggestedPrice),
        priceStatus: "CONFIRMED",
        snapshot: { costingLineRef: source.lineRef, family: source.family, source: source.source, sourceRef: source.sourceRef, sourceVersion: source.sourceVersion, costingRevisionRef: costing.revisionRef },
      };
    }
    const authority = line.manualAuthority;
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
  if (totals.totalQuotedPrice < totals.suggestedPrice && !authorization) issues.push({ code: "MARGIN_AUTHORIZATION_REQUIRED", severity: "BLOCKER", message: "El precio cotizado inferior al sugerido requiere autorización.", status: "OPEN", sourceSnapshot: { comparison: "BELOW_SUGGESTED" } });
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
  return {
    costingRevisionRef: costing.revisionRef,
    logisticsPlanRevisionRef: costing.logisticsRevision.revisionRef,
    surveyPublicationRef: costing.logisticsRevision.inputSnapshot?.survey?.publicationRef || null,
    servicesRevisionRef: costing.logisticsRevision.inputSnapshot?.services?.selectionRef || null,
    caseRef: client.caseRef,
  };
}

async function createRevision(tx, context, proposal, input, costing, pipelineCase, state, supersedes = null) {
  const lines = buildLines(input, costing);
  const totals = calculateQuoteTotals(lines, input.discount);
  const authorization = findAuthorization(costing, input.marginAuthorizationRef);
  const issues = buildIssues(pipelineCase, costing, lines, totals, authorization);
  const client = clientSnapshot(pipelineCase);
  const revision = proposal.currentRevision + 1;
  const logicalSha256 = revisionLogical(input, costing, lines, totals, client);
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
      internalSnapshot: { costingRevisionRef: costing.revisionRef, costingPublishedAt: costing.publishedAt.toISOString(), sourceReferences: outputReferences(costing, client) },
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

function publicLine(line, internal) {
  const base = { lineRef: line.lineRef, sourceKind: line.sourceKind, concept: line.concept, quantity: String(line.quantity), unit: line.unit, economicClass: line.economicClass, quotedPrice: line.quotedPrice == null ? null : String(line.quotedPrice), currency: line.currency, priceStatus: line.priceStatus, position: line.position };
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
    costingRevisionRef: row.internalSnapshot?.costingRevisionRef,
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
    lines: row.lines.map((line) => publicLine(line, internal)),
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

export async function createQuoteProposal(prisma, context, raw) {
  requirePermission(context, QUOTE_PERMISSIONS.CREATE);
  const input = normalizeQuoteCreate(raw);
  return serializable(prisma, async (tx) => {
    const prior = await replay(tx, context, input);
    if (prior) return prior;
    const pipelineCase = await resolveCase(tx, context, input.caseRef);
    const costing = await resolvePublishedCosting(tx, context, pipelineCase.id, input.costingRevisionRef);
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:${pipelineCase.id}:quote-cycle`}, 0))`);
    let quote = await tx.pipelineCaseQuote.findFirst({ where: { tenantId: context.tenantId, caseId: pipelineCase.id, contractVersion: 2, costingRevisionId: costing.id }, orderBy: { cycleNumber: "desc" } });
    if (!quote) {
      const latest = await tx.pipelineCaseQuote.findFirst({ where: { tenantId: context.tenantId, caseId: pipelineCase.id }, orderBy: { cycleNumber: "desc" }, select: { cycleNumber: true } });
      quote = await tx.pipelineCaseQuote.create({ data: { tenantId: context.tenantId, caseId: pipelineCase.id, costingRevisionId: costing.id, cycleNumber: (latest?.cycleNumber || 0) + 1, contractVersion: 2, level: "STANDARD", version: 1, status: "DRAFT" } });
    }
    const count = await tx.quoteProposal.count({ where: { tenantId: context.tenantId, quoteId: quote.id } });
    if (count >= 3) quoteFail("QUOTE_PROPOSAL_LIMIT_REACHED", 409);
    const reference = await nextReference(tx, context.tenantId, input.position);
    const proposal = await tx.quoteProposal.create({ data: { tenantId: context.tenantId, quoteId: quote.id, pipelineCaseId: pipelineCase.id, position: input.position, reference } });
    const revision = await createRevision(tx, context, proposal, input, costing, pipelineCase, "DRAFT");
    const result = mapRevision(revision, context, { ...proposal, state: "DRAFT" });
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
    const costing = await resolvePublishedCosting(tx, context, proposal.pipelineCaseId, input.costingRevisionRef);
    if (costing.id !== proposal.quote.costingRevisionId) quoteFail("QUOTE_COSTING_SELECTION_IMMUTABLE", 409);
    const revision = await createRevision(tx, context, proposal, input, costing, proposal.pipelineCase, "DRAFT", current);
    const result = mapRevision(revision, context, { ...proposal, state: "DRAFT" });
    return persist(tx, context, input, proposal.quoteId, proposal.proposalRef, result, "QUOTE_PROPOSAL_REVISE");
  });
}

async function cloneStateRevision(tx, context, proposal, current, state) {
  return tx.quoteProposalRevision.create({
    data: {
      tenantId: context.tenantId, proposalId: proposal.id, costingRevisionId: current.costingRevisionId, revision: current.revision + 1, state,
      proposalName: current.proposalName, costingLogicalSha256: current.costingLogicalSha256, currency: current.currency, issueDate: current.issueDate, validUntil: current.validUntil,
      commercialContextSnapshot: current.commercialContextSnapshot, payerSnapshot: current.payerSnapshot, termsSnapshot: current.termsSnapshot, exchangeSnapshot: current.exchangeSnapshot,
      discountSnapshot: current.discountSnapshot, totalsSnapshot: current.totalsSnapshot, marginAuthorizationSnapshot: current.marginAuthorizationSnapshot, internalSnapshot: current.internalSnapshot,
      clientSnapshot: current.clientSnapshot, logicalSha256: quoteHash({ source: current.logicalSha256, revision: current.revision + 1, state }), supersedesRevisionId: current.id,
      createdByMembershipId: context.membershipId, createdByUserId: context.userId,
      lines: { create: current.lines.map(({ sourceKind, costingLineRef, sourceRef, sourceVersion, concept, quantity, unit, economicClass, priceStatus, capturedCost, suggestedPrice, quotedPrice, currency, reason, position, snapshot }) => ({ sourceKind, costingLineRef, sourceRef, sourceVersion, concept, quantity, unit, economicClass, priceStatus, capturedCost, suggestedPrice, quotedPrice, currency, reason, position, snapshot })) },
      issues: { create: current.issues.map(({ code, severity, message, status, sourceSnapshot }) => ({ code, severity, message, status, sourceSnapshot })) },
    },
    include: { lines: { orderBy: { position: "asc" } }, issues: true },
  });
}

async function assertReadyForExternal(tx, context, proposal, revision, { acceptance = false } = {}) {
  if (proposal.pipelineCase.destinationStatus === "PENDING") quoteFail("QUOTE_DESTINATION_PENDING", 409);
  if (revision.validUntil < new Date(new Date().toISOString().slice(0, 10))) quoteFail("QUOTE_EXPIRED", 409);
  const costing = await resolvePublishedCosting(tx, context, proposal.pipelineCaseId, revision.internalSnapshot.costingRevisionRef);
  if (costing.logicalSha256 !== revision.costingLogicalSha256) quoteFail("QUOTE_COSTING_INPUT_STALE", 409);
  if (costing.issues.some((issue) => issue.severity === "BLOCKER" && issue.status === "OPEN")) quoteFail("QUOTE_COSTING_BLOCKERS_PRESENT", 409);
  if (revision.issues.some((issue) => issue.severity === "BLOCKER" && issue.status === "OPEN")) quoteFail("QUOTE_BLOCKERS_PRESENT", 409);
  if (acceptance) {
    const accepted = await tx.quoteProposal.findFirst({ where: { tenantId: context.tenantId, pipelineCaseId: proposal.pipelineCaseId, state: "ACCEPTED", id: { not: proposal.id } }, select: { proposalRef: true } });
    if (accepted) quoteFail("QUOTE_ALREADY_ACCEPTED", 409);
  } else {
    const latest = await tx.costingRevision.findFirst({ where: { tenantId: context.tenantId, pipelineCaseId: proposal.pipelineCaseId, status: "PUBLISHED" }, orderBy: { revision: "desc" }, select: { id: true } });
    if (latest?.id !== costing.id) quoteFail("QUOTE_COSTING_INPUT_STALE", 409);
  }
  return costing;
}

export async function publishQuoteProposal(prisma, context, raw) {
  requirePermission(context, QUOTE_PERMISSIONS.PUBLISH);
  const input = normalizeQuotePublish(raw);
  return serializable(prisma, async (tx) => {
    const prior = await replay(tx, context, input); if (prior) return prior;
    const { proposal, revision: current } = await loadProposal(tx, context, input.proposalRef);
    if (proposal.state !== "DRAFT" || current.revision !== input.expectedRevision) quoteFail("QUOTE_VERSION_CONFLICT", 409);
    await assertReadyForExternal(tx, context, proposal, current);
    const revision = await cloneStateRevision(tx, context, proposal, current, "READY");
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
    include: { revisions: { orderBy: { revision: "desc" }, take: 1, include: { lines: { orderBy: { position: "asc" } }, issues: true } } },
  });
  return { caseRef: pipelineCase.publicRef, caseCode: pipelineCase.caseCode, destinationStatus: pipelineCase.destinationStatus, proposals: proposals.filter((proposal) => proposal.revisions[0]).map((proposal) => mapRevision(proposal.revisions[0], context, proposal)) };
}

export function getQuoteClientProjection(internal) {
  return {
    proposalRef: internal.proposalRef,
    reference: internal.reference,
    revisionRef: internal.revisionRef,
    revision: internal.revision,
    state: internal.state,
    proposalName: internal.proposalName,
    currency: internal.currency,
    issueDate: internal.issueDate,
    validUntil: internal.validUntil,
    client: internal.client,
    commercialContext: internal.commercialContext,
    payer: internal.payer,
    terms: internal.terms,
    exchange: internal.exchange,
    discount: internal.discount,
    totals: { grossQuotedPrice: internal.totals.grossQuotedPrice, discountAmount: internal.totals.discountAmount, totalQuotedPrice: internal.totals.totalQuotedPrice },
    lines: internal.lines.map(({ lineRef, sourceKind, concept, quantity, unit, economicClass, quotedPrice, currency, priceStatus, position }) => ({ lineRef, sourceKind, concept, quantity, unit, economicClass, quotedPrice, currency, priceStatus, position })),
    logicalSha256: internal.logicalSha256,
  };
}

export async function getQuoteClientProposal(prisma, context, proposalRefRaw) {
  requirePermission(context, QUOTE_PERMISSIONS.VIEW);
  const proposalRef = normalizeQuoteCaseRef(proposalRefRaw);
  const { proposal, revision } = await loadProposal(prisma, context, proposalRef);
  return getQuoteClientProjection(mapRevision(revision, context, proposal));
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

export const quoteContractInternals = Object.freeze({ canonicalQuoteJson });
