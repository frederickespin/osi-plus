// Five coherent synthetic business flows for the reviewed Preview only. The
// hook is inert unless an exact branch/commit operation is present.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { calculateLogistics, publishLogistics } from "../api/_lib/logisticsEngineDomain.js";
import { canonicalHash as logisticsHash } from "../api/_lib/logisticsEngineContract.js";
import { calculateCosting, publishCosting } from "../api/_lib/costingDomain.js";
import { costingHash } from "../api/_lib/costingContract.js";
import { createQuoteProposal, publishQuoteProposal, recordQuoteDecision, sendQuoteProposal } from "../api/_lib/quoteDomain.js";
import { quoteHash } from "../api/_lib/quoteContract.js";
import { isV17ConsolidatedPreviewBranch } from "../shared/v17ConsolidatedPreview.js";

export const OPERATIONAL_DEMO_FLOWS_SEED_OPERATION = "V17_OPERATIONAL_DEMO_FLOWS_SEED";
const DATABASE = "v17_consolidated_preview_10b";
const DATABASE_BRANCH = "br-bitter-mountain-ahs311pu";
const TENANT_CODE = "V17-CONSOLIDATED-PREVIEW-10B";
const DEMO_FLAG = "DEMO_OPERATIONAL_FLOW";
let activeStage = "BOOT";

function requireCondition(condition, code) {
  if (!condition) throw new Error(`OPERATIONAL_DEMO_FLOWS_SEED_${code}`);
}

function sha(value) {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

function stableUuid(label) {
  const bytes = createHash("sha256").update(`osi-plus-v17-operational-demo:${label}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function signed(hash, operation, payload, label) {
  const requestId = stableUuid(label);
  return { requestId, payloadHash: hash({ operation, requestId, ...payload }), ...payload };
}

function validateTargetUrls(env) {
  let direct;
  let application;
  try {
    direct = new URL(env.DIRECT_URL);
    application = new URL(env.DATABASE_URL);
  } catch {
    requireCondition(false, "TARGET_INVALID_URL");
  }
  requireCondition(["postgres:", "postgresql:"].includes(direct.protocol)
    && ["postgres:", "postgresql:"].includes(application.protocol), "TARGET_INVALID_PROTOCOL");
  requireCondition(Boolean(direct.hostname) && !direct.hostname.includes("-pooler."), "TARGET_INVALID_DIRECT_HOST");
  requireCondition(direct.hostname === application.hostname.replace(/-pooler(?=\.)/u, ""), "TARGET_INVALID_HOST_PAIR");
  requireCondition(decodeURIComponent(direct.pathname.slice(1)) === DATABASE
    && decodeURIComponent(application.pathname.slice(1)) === DATABASE, "TARGET_INVALID_DATABASE");
  requireCondition(direct.searchParams.get("schema") === "osi"
    && application.searchParams.get("schema") === "osi", "TARGET_INVALID_SCHEMA");
}

export function operationalDemoSeedOperation(env = process.env) {
  const raw = env[OPERATIONAL_DEMO_FLOWS_SEED_OPERATION];
  if (raw === undefined || raw === "DISABLED") return null;
  const match = /^APPLY:([a-f0-9]{40})$/u.exec(raw);
  requireCondition(match
    && env.VERCEL === "1"
    && env.VERCEL_ENV === "preview"
    && isV17ConsolidatedPreviewBranch(env.VERCEL_GIT_COMMIT_REF)
    && env.VERCEL_GIT_COMMIT_SHA === match[1], "OPERATION_TARGET_INVALID");
  requireCondition(env.CUSTOMER_CUSTODY_API_MODE === "PREVIEW_REHEARSAL"
    && env.CUSTOMER_CUSTODY_API_BATCH === "V17-STORAGE-COMMERCIAL-CONTRACT-22A-PREVIEW", "FEATURE_GATE_INVALID");
  validateTargetUrls(env);
  return Object.freeze({ commit: match[1] });
}

async function ensureClient(prisma, tenantId, definition) {
  const existing = await prisma.client.findUnique({ where: { code: definition.clientCode } });
  if (existing) return existing;
  return prisma.client.create({ data: {
    tenantId,
    code: definition.clientCode,
    name: definition.clientName,
    email: definition.email,
    normalizedEmail: definition.email,
    phone: definition.phone,
    normalizedPhone: definition.phone.replace(/\D/gu, ""),
    address: definition.origin.streetAndNumber,
    type: "PERSON",
    status: "ACTIVE",
    totalServices: 0,
    createdAt: "2026-11-15",
  } });
}

async function ensureAddress(prisma, tenantId, clientId, label, value) {
  const existing = await prisma.clientAddress.findFirst({ where: { tenantId, clientId, label } });
  if (existing) return existing;
  return prisma.clientAddress.create({ data: {
    tenantId, clientId, label,
    countryCode: value.countryCode,
    provinceState: value.provinceState,
    cityMunicipality: value.cityMunicipality,
    sector: value.sector,
    streetAndNumber: value.streetAndNumber,
    buildingResidential: value.buildingResidential || null,
    floorUnit: value.floorUnit || null,
    arrivalReference: value.arrivalReference || null,
    locationContactName: value.contactName,
    locationContactPhone: value.contactPhone,
  } });
}

async function ensureService(prisma, tenantId, definition) {
  const existing = await prisma.serviceCatalogItem.findFirst({ where: { tenantId, code: definition.code } });
  if (existing) return existing;
  return prisma.serviceCatalogItem.create({ data: {
    tenantId,
    code: definition.code,
    name: definition.name,
    category: definition.category,
    usage: definition.usage,
    compatibleModes: definition.modes,
    sortOrder: definition.sortOrder,
  } });
}

function routeSnapshot(tenantId, pipelineCaseId, role, address, sourceAddressRef) {
  return {
    tenantId, pipelineCaseId, routeVersion: 1, role, stopOrder: 0, sourceAddressRef,
    countryCode: address.countryCode, provinceState: address.provinceState,
    cityMunicipality: address.cityMunicipality, sector: address.sector,
    streetAndNumber: address.streetAndNumber, buildingResidential: address.buildingResidential,
    floorUnit: address.floorUnit, arrivalReference: address.arrivalReference,
    locationContactName: address.locationContactName, locationContactPhone: address.locationContactPhone,
  };
}

async function ensureCase(prisma, tenant, actor, definition, services) {
  activeStage = `${definition.caseCode}_LOOKUP`;
  let row = await prisma.pipelineCase.findFirst({ where: { tenantId: tenant.id, caseCode: definition.caseCode } });
  activeStage = `${definition.caseCode}_CLIENT`;
  const client = await ensureClient(prisma, tenant.id, definition);
  activeStage = `${definition.caseCode}_ORIGIN_ADDRESS`;
  const originAddress = await ensureAddress(prisma, tenant.id, client.id, `${definition.caseCode}-ORIGEN`, definition.origin);
  activeStage = `${definition.caseCode}_DESTINATION_ADDRESS`;
  const destinationAddress = await ensureAddress(prisma, tenant.id, client.id, `${definition.caseCode}-DESTINO`, definition.destination);
  if (!row) {
    activeStage = `${definition.caseCode}_PIPELINE_CASE`;
    row = await prisma.pipelineCase.create({ data: {
      tenantId: tenant.id, clientId: client.id, caseCode: definition.caseCode,
      clientName: definition.clientName, mode: definition.mode, serviceType: services[0].name,
      customerType: "L4_PERSONAL", status: "NEW_INBOX", ownerName: actor.user.name,
      ownerMembershipId: actor.membership.id, ownerUserId: actor.user.id,
      estimatedCbm: definition.cbm, requiresSurvey: definition.requiresSurvey,
      surveyMethod: definition.requiresSurvey ? "PRESENCIAL" : "NO_APLICA",
      flags: ["PREVIEW_SYNTHETIC", DEMO_FLAG, definition.demoFlag],
      originLocation: "SNAPSHOT_STRUCTURED", destinationLocation: "SNAPSHOT_STRUCTURED",
      destinationContracted: true,
      routeContractVersion: 1, routeRevision: 0,
      caseContactName: definition.clientName, caseContactPhone: definition.phone,
      caseContactPhoneNormalized: definition.phone,
      caseContactEmail: definition.email, caseContactEmailNormalized: definition.email,
      intakeChannel: "CALL", clientProfileType: "INDIVIDUAL",
    } });
  }
  if (await prisma.pipelineCaseRouteSnapshot.count({ where: { tenantId: tenant.id, pipelineCaseId: row.id, routeVersion: 1 } }) === 0) {
    activeStage = `${definition.caseCode}_ROUTE_SNAPSHOTS`;
    await prisma.pipelineCaseRouteSnapshot.createMany({ data: [
      routeSnapshot(tenant.id, row.id, "ORIGIN", originAddress, originAddress.addressRef),
      routeSnapshot(tenant.id, row.id, "DESTINATION", destinationAddress, destinationAddress.addressRef),
    ] });
  }
  if (row.routeRevision !== 1 || row.routeContractVersion !== 2 || row.destinationStatus !== "CONFIRMED") {
    activeStage = `${definition.caseCode}_ROUTE_ACTIVATION`;
    row = await prisma.pipelineCase.update({ where: { id: row.id }, data: {
      routeRevision: 1, routeContractVersion: 2, destinationStatus: "CONFIRMED",
    } });
  }
  let revision = await prisma.pipelineCaseServiceRevision.findFirst({
    where: { tenantId: tenant.id, pipelineCaseId: row.id, revision: 1 }, include: { items: true },
  });
  if (!revision) {
    activeStage = `${definition.caseCode}_SERVICE_REVISION`;
    revision = await prisma.pipelineCaseServiceRevision.create({ data: {
      tenantId: tenant.id, pipelineCaseId: row.id, revision: 1, modeSnapshot: definition.mode,
      source: "MANUAL", createdByMembershipId: actor.membership.id, createdByUserId: actor.user.id,
      items: { create: services.map((service, index) => ({
        serviceId: service.id, kind: index === 0 ? "PRIMARY" : "COMPLEMENTARY", source: "MANUAL",
        position: index, serviceRefSnapshot: service.serviceRef, codeSnapshot: service.code,
        nameSnapshot: service.name, categorySnapshot: service.category, catalogVersionSnapshot: service.version,
      })) },
    }, include: { items: true } });
  }
  return { ...row, client, serviceRevision: revision };
}

async function ensureScheduledSurvey(prisma, tenant, actor, evaluator, schedulePolicy, scenario, options) {
  let decision = await prisma.surveyEvaluationDecision.findFirst({ where: { tenantId: tenant.id, pipelineCaseId: scenario.id, version: 1 } });
  if (!decision) decision = await prisma.surveyEvaluationDecision.create({ data: {
    tenantId: tenant.id, pipelineCaseId: scenario.id, serviceRevisionId: scenario.serviceRevision.id,
    routeVersion: 1, version: 1, method: "IN_PERSON", commercialState: "SCHEDULED",
    informationSource: "COMMERCIAL", rationaleCode: options.outsideMetro ? "OUTSIDE_METRO_ONE_PER_DAY" : "METRO_STANDARD",
    createdByMembershipId: actor.membership.id, createdByUserId: actor.user.id,
  } });
  let assignment = await prisma.surveyAssignment.findFirst({ where: { tenantId: tenant.id, pipelineCaseId: scenario.id } });
  if (!assignment) assignment = await prisma.surveyAssignment.create({ data: {
    tenantId: tenant.id, pipelineCaseId: scenario.id, serviceRevisionId: scenario.serviceRevision.id,
    routeVersion: 1, evaluatorMembershipId: evaluator.membership.id, evaluatorUserId: evaluator.user.id,
    scheduledStart: new Date(options.start), scheduledEnd: new Date(options.end), status: "ASSIGNED",
    contextSnapshot: { synthetic: true, demo: true, outsideMetro: options.outsideMetro, distanceKm: options.distanceKm },
    instructionSnapshot: options.instructions, evaluationDecisionId: decision.id, schedulePolicyId: schedulePolicy?.id || null,
    scheduleProfile: options.outsideMetro ? "INTERIOR_LONG" : "METRO", zoneCode: options.zoneCode,
    slotKey: options.slotKey, travelBufferMinutes: options.travelBufferMinutes,
    clientConfirmation: "CONFIRMED", evaluatorConfirmation: "CONFIRMED",
    createdByMembershipId: actor.membership.id, createdByUserId: actor.user.id,
  } });
  if (!await prisma.surveyAssignmentEvent.findFirst({ where: { tenantId: tenant.id, assignmentId: assignment.id, eventType: "SCHEDULED" } })) {
    await prisma.surveyAssignmentEvent.create({ data: {
      tenantId: tenant.id, pipelineCaseId: scenario.id, evaluationDecisionId: decision.id,
      assignmentId: assignment.id, eventType: "SCHEDULED", notificationRequired: true,
      afterSnapshot: { synthetic: true, clientConfirmed: true, outsideMetro: options.outsideMetro },
      actorMembershipId: actor.membership.id, actorUserId: actor.user.id,
    } });
  }
  if (options.outsideMetro && !await prisma.surveyVisitFee.findFirst({ where: { tenantId: tenant.id, evaluationDecisionId: decision.id } })) {
    await prisma.surveyVisitFee.create({ data: {
      tenantId: tenant.id, pipelineCaseId: scenario.id, evaluationDecisionId: decision.id, assignmentId: assignment.id,
      disposition: "PENDING_CALCULATION", suggestedAmount: null, currency: null,
      communicationStatus: "NOT_COMMUNICATED", approvalStatus: "NOT_REQUIRED", paymentStatus: "NOT_REQUIRED",
    } });
  }
  return { decision, assignment };
}

async function ensureCompletedSurvey(prisma, tenant, actor, evaluator, schedulePolicy, scenario, options) {
  activeStage = "SURVEY_EXPORT_CATALOG";
  let catalog = await prisma.surveyCatalogVersion.findFirst({ where: { tenantId: tenant.id, status: "ACTIVE" }, orderBy: { version: "desc" } });
  if (!catalog) catalog = await prisma.surveyCatalogVersion.create({ data: { tenantId: tenant.id, version: 1, status: "ACTIVE", activatedAt: new Date(), createdByMembershipId: actor.membership.id, createdByUserId: actor.user.id } });
  activeStage = "SURVEY_EXPORT_AREA";
  let area = await prisma.surveyAreaCatalogItem.findFirst({ where: { tenantId: tenant.id, catalogVersionId: catalog.id, code: "DEMO-LIVING" } });
  if (!area) area = await prisma.surveyAreaCatalogItem.create({ data: { tenantId: tenant.id, catalogVersionId: catalog.id, areaRef: stableUuid("demo-area-living"), code: "DEMO-LIVING", name: "Sala", sortOrder: 20 } });
  activeStage = "SURVEY_EXPORT_ARTICLE";
  let article = await prisma.surveyArticleCatalogItem.findFirst({ where: { tenantId: tenant.id, catalogVersionId: catalog.id, code: "DEMO-HOUSEHOLD" } });
  if (!article) article = await prisma.surveyArticleCatalogItem.create({ data: { tenantId: tenant.id, catalogVersionId: catalog.id, articleRef: stableUuid("demo-household-article"), code: "DEMO-HOUSEHOLD", name: "Mobiliario y cajas", aliases: ["demo"], frequentAreaRefs: [area.areaRef], defaultVolumeM3: "1.5", defaultWeightKg: "45", weightSource: "CATALOG", sortOrder: 20 } });
  activeStage = "SURVEY_EXPORT_DECISION";
  let decision = await prisma.surveyEvaluationDecision.findFirst({ where: { tenantId: tenant.id, pipelineCaseId: scenario.id, version: 1 } });
  if (!decision) decision = await prisma.surveyEvaluationDecision.create({ data: { tenantId: tenant.id, pipelineCaseId: scenario.id, serviceRevisionId: scenario.serviceRevision.id, routeVersion: 1, version: 1, method: "IN_PERSON", commercialState: "COMPLETED", informationSource: "EVALUATOR", rationaleCode: "DEMO_COMPLETED", createdByMembershipId: evaluator.membership.id, createdByUserId: evaluator.user.id } });
  activeStage = "SURVEY_EXPORT_ASSIGNMENT";
  let assignment = await prisma.surveyAssignment.findFirst({ where: { tenantId: tenant.id, pipelineCaseId: scenario.id } });
  if (!assignment) assignment = await prisma.surveyAssignment.create({ data: { tenantId: tenant.id, pipelineCaseId: scenario.id, serviceRevisionId: scenario.serviceRevision.id, routeVersion: 1, evaluatorMembershipId: evaluator.membership.id, evaluatorUserId: evaluator.user.id, scheduledStart: new Date(options.start), scheduledEnd: new Date(options.end), status: "COMPLETED", arrivalAt: new Date(options.start), punctualityConfirmedAt: new Date(options.start), contextSnapshot: { synthetic: true, demo: true, distanceKm: options.distanceKm }, instructionSnapshot: options.instructions, evaluationDecisionId: decision.id, schedulePolicyId: schedulePolicy.id, scheduleProfile: "METRO", zoneCode: "METRO", slotKey: "MORNING", travelBufferMinutes: 45, clientConfirmation: "CONFIRMED", evaluatorConfirmation: "CONFIRMED", createdByMembershipId: actor.membership.id, createdByUserId: actor.user.id } });
  activeStage = "SURVEY_EXPORT_DRAFT";
  let draft = await prisma.surveyDraft.findFirst({ where: { tenantId: tenant.id, assignmentId: assignment.id, revision: 1 } });
  if (!draft) draft = await prisma.surveyDraft.create({ data: { tenantId: tenant.id, assignmentId: assignment.id, pipelineCaseId: scenario.id, serviceRevisionId: scenario.serviceRevision.id, catalogVersionId: catalog.id, routeVersion: 1, revision: 1, status: "PUBLISHED", notes: options.notes } });
  activeStage = "SURVEY_EXPORT_ITEM";
  if (!await prisma.surveyDraftItem.findFirst({ where: { tenantId: tenant.id, draftId: draft.id, sortOrder: 1 } })) await prisma.surveyDraftItem.create({ data: { tenantId: tenant.id, draftId: draft.id, catalogVersionId: catalog.id, catalogItemId: article.id, areaCatalogItemId: area.id, articleRefSnapshot: article.articleRef, articleCodeSnapshot: article.code, articleNameSnapshot: article.name, areaRefSnapshot: area.areaRef, areaCodeSnapshot: area.code, areaNameSnapshot: area.name, shipmentMode: options.shipmentMode, quantity: options.quantity, condition: "GOOD", flags: options.flags, unitVolumeM3: options.unitVolumeM3, unitWeightKg: options.unitWeightKg, volumeSource: "MEASURED", weightSource: "CATALOG", note: options.notes, sortOrder: 1 } });
  activeStage = "SURVEY_EXPORT_PUBLICATION";
  let publication = await prisma.surveyPublication.findFirst({ where: { tenantId: tenant.id, pipelineCaseId: scenario.id, status: "CURRENT" } });
  if (!publication) {
    const pdf = await prisma.surveyBlobObject.create({ data: { tenantId: tenant.id, provider: "PREVIEW_LOCAL_GATED", storageKey: `preview/operational-demo/${scenario.caseCode}/survey.pdf`, mimeType: "application/pdf", sizeBytes: 256, sha256: sha(`demo-survey-pdf-${scenario.caseCode}`) } });
    const totalVolumeM3 = Number(options.unitVolumeM3) * options.quantity;
    const totalWeightKg = Number(options.unitWeightKg) * options.quantity;
    publication = await prisma.surveyPublication.create({ data: { tenantId: tenant.id, draftId: draft.id, pipelineCaseId: scenario.id, serviceRevisionId: scenario.serviceRevision.id, revision: 1, routeVersion: 1, catalogVersion: catalog.version, serviceSelectionRef: scenario.serviceRevision.selectionRef, contextSnapshot: { synthetic: true, demo: true, method: "IN_PERSON", distanceKm: options.distanceKm }, totalsSnapshot: { totalVolumeM3, totalWeightKg, itemCount: options.quantity, distinctLineCount: 1 }, logicalSha256: sha(`demo-survey-${scenario.caseCode}`), pdfBlobObjectId: pdf.id, pdfSha256: pdf.sha256, publishedByMembershipId: evaluator.membership.id, publishedByUserId: evaluator.user.id } });
    await prisma.surveyPublicationItem.create({ data: { tenantId: tenant.id, publicationId: publication.id, position: 1, articleRef: article.articleRef, articleCode: article.code, articleName: article.name, areaRef: area.areaRef, areaCode: area.code, areaName: area.name, shipmentMode: options.shipmentMode, quantity: options.quantity, condition: "GOOD", flags: options.flags, measurements: {}, unitVolumeM3: options.unitVolumeM3, unitWeightKg: options.unitWeightKg, metricSources: { volume: "MEASURED", weight: "CATALOG" }, note: options.notes } });
  }
  return publication;
}

async function ensurePlansAndQuote(prisma, context, scenario, quoteState, amountLabel) {
  let logistics = await prisma.logisticsPlanRevision.findFirst({ where: { tenantId: context.tenantId, plan: { pipelineCaseId: scenario.id }, status: "PUBLISHED" }, orderBy: { revision: "desc" } });
  if (!logistics) {
    const calcPayload = { caseRef: scenario.publicRef, intervalStart: "2026-12-01T13:00:00.000Z", intervalEnd: "2026-12-02T21:00:00.000Z" };
    const calc = await calculateLogistics(prisma, context, signed(logisticsHash, "LOGISTICS_CALCULATE", calcPayload, `demo-log-calc-${scenario.caseCode}`));
    const published = await publishLogistics(prisma, context, signed(logisticsHash, "LOGISTICS_PUBLISH", { calculationRef: calc.calculationRef }, `demo-log-publish-${scenario.caseCode}`));
    logistics = await prisma.logisticsPlanRevision.findFirstOrThrow({ where: { tenantId: context.tenantId, revisionRef: published.revisionRef } });
  }
  let costing = await prisma.costingRevision.findFirst({ where: { tenantId: context.tenantId, pipelineCaseId: scenario.id, status: "PUBLISHED" }, include: { lines: true }, orderBy: { revision: "desc" } });
  if (!costing) {
    const calcPayload = { caseRef: scenario.publicRef, logisticsPlanRevisionRef: logistics.revisionRef, baseCurrency: "DOP" };
    const calc = await calculateCosting(prisma, context, signed(costingHash, "COSTING_CALCULATE", calcPayload, `demo-cost-calc-${scenario.caseCode}`));
    requireCondition(!(calc.result.issues || []).some((issue) => issue.severity === "BLOCKER"), `COSTING_BLOCKED_${scenario.caseCode}`);
    const published = await publishCosting(prisma, context, signed(costingHash, "COSTING_PUBLISH", { calculationRef: calc.calculationRef }, `demo-cost-publish-${scenario.caseCode}`));
    costing = await prisma.costingRevision.findFirstOrThrow({ where: { tenantId: context.tenantId, revisionRef: published.revisionRef }, include: { lines: true } });
  }
  let proposal = await prisma.quoteProposal.findFirst({ where: { tenantId: context.tenantId, pipelineCaseId: scenario.id, position: 1 }, include: { revisions: { orderBy: { revision: "desc" }, take: 1 } } });
  if (!proposal) {
    const first = costing.lines.find((line) => line.suggestedPrice != null);
    requireCondition(first, `QUOTE_LINE_MISSING_${scenario.caseCode}`);
    const payload = {
      caseRef: scenario.publicRef, costingRevisionRef: costing.revisionRef, position: 1,
      proposalName: amountLabel, currency: costing.baseCurrency, issueDate: "2026-11-15", validUntil: "2027-01-15",
      commercialContext: { company: null, leadAccount: null, booker: null, tariff: null, associations: [], referral: null, commissionContext: null },
      payer: { kind: "CLIENT", reference: scenario.client.code, displayName: scenario.client.name, sourceVersion: 1, validFrom: null, validUntil: null, conditions: null },
      terms: { paymentTerms: "Según propuesta demostrativa", scope: `Flujo demostrativo ${scenario.caseCode}`, exclusions: [], clientNotes: null, specialConditions: [], templateRef: null, templateVersion: null },
      exchange: null, discount: null, marginAuthorizationRef: null,
      lines: [{ sourceKind: "COSTING", costingLineRef: first.lineRef, concept: first.concept, quantity: String(first.quantity), unit: first.unit, economicClass: first.classification, quotedPrice: String(first.suggestedPrice), currency: costing.baseCurrency, reason: null, manualAuthority: null }],
    };
    await createQuoteProposal(prisma, context, signed(quoteHash, "QUOTE_PROPOSAL_CREATE", payload, `demo-quote-create-${scenario.caseCode}`));
    proposal = await prisma.quoteProposal.findFirstOrThrow({ where: { tenantId: context.tenantId, pipelineCaseId: scenario.id, position: 1 }, include: { revisions: { orderBy: { revision: "desc" }, take: 1 } } });
  }
  let state = { proposalRef: proposal.proposalRef, state: proposal.state, revision: proposal.currentRevision };
  if (["READY", "SENT", "ACCEPTED"].includes(quoteState) && state.state === "DRAFT") state = await publishQuoteProposal(prisma, context, signed(quoteHash, "QUOTE_PROPOSAL_PUBLISH", { proposalRef: state.proposalRef, expectedRevision: state.revision }, `demo-quote-publish-${scenario.caseCode}`));
  if (["SENT", "ACCEPTED"].includes(quoteState) && state.state === "READY") state = await sendQuoteProposal(prisma, context, signed(quoteHash, "QUOTE_PROPOSAL_SEND", { proposalRef: state.proposalRef, expectedRevision: state.revision, channel: "MANUAL", recipient: { kind: "RECIPIENT_ON_FILE", displayName: scenario.client.name, reference: scenario.client.code, present: true }, evidenceRef: null }, `demo-quote-send-${scenario.caseCode}`));
  if (quoteState === "ACCEPTED" && state.state === "SENT") state = await recordQuoteDecision(prisma, context, signed(quoteHash, "QUOTE_CLIENT_DECISION", { proposalRef: state.proposalRef, expectedRevision: state.revision, decision: "ACCEPTED", method: "SIGNED_DOCUMENT", decidedBy: { kind: "CLIENT_REPRESENTATIVE", displayName: scenario.client.name, reference: scenario.client.code, present: true }, evidenceRef: `DEMO-ACCEPTANCE-${scenario.caseCode}`, reason: null }, `demo-quote-accept-${scenario.caseCode}`));
  return prisma.quoteProposal.findFirstOrThrow({ where: { tenantId: context.tenantId, proposalRef: state.proposalRef }, include: { revisions: { orderBy: { revision: "desc" }, take: 1 } } });
}

async function ensureStorageReady(prisma, tenant, actor, scenario, acceptedProposal) {
  const revision = acceptedProposal.revisions[0];
  requireCondition(acceptedProposal.state === "ACCEPTED" && revision, "STORAGE_QUOTE_NOT_ACCEPTED");
  activeStage = "STORAGE_SCHEMA_PROBE";
  const [storageSchema] = await prisma.$queryRawUnsafe("SELECT to_regclass('osi.customer_storage_agreements')::text AS qualified_agreement_relation");
  requireCondition(storageSchema?.qualified_agreement_relation === "osi.customer_storage_agreements", "STORAGE_AGREEMENT_RELATION_UNRESOLVED");
  activeStage = "STORAGE_REQUIREMENT";
  if (!await prisma.customerStorageRequirementRevision.findFirst({ where: { tenantId: tenant.id, pipelineCaseId: scenario.id, revision: 1 } })) await prisma.customerStorageRequirementRevision.create({ data: {
    tenantId: tenant.id, pipelineCaseId: scenario.id, serviceRevisionId: scenario.serviceRevision.id, revision: 1,
    storageType: "PERSONAL_EFFECTS", capacityBasis: "TWENTY_FOOT_CONTAINER", capacityQuantity: "33",
    estimatedDurationMonths: 8, plannedEntryDate: new Date("2026-11-20T00:00:00Z"), dataSource: "COMMERCIAL_ESTIMATE",
    visitDecision: "REQUIRED", notes: "Ejemplo: almacenaje de efectos personales por ocho meses.",
    createdByMembershipId: actor.membership.id, createdByUserId: actor.user.id,
  } });
  activeStage = "STORAGE_WAREHOUSE";
  let warehouse = await prisma.materialWarehouse.findFirst({ where: { tenantId: tenant.id, code: "PREVIEW" } });
  if (!warehouse) warehouse = await prisma.materialWarehouse.create({ data: { tenantId: tenant.id, code: "PREVIEW", name: "Almacén Demo" } });
  activeStage = "STORAGE_AGREEMENT";
  let agreement = await prisma.customerStorageAgreement.findFirst({ where: { tenantId: tenant.id, pipelineCaseId: scenario.id, status: "ACTIVE" } });
  if (!agreement) agreement = await prisma.customerStorageAgreement.create({ data: {
    tenantId: tenant.id, clientId: scenario.client.id, pipelineCaseId: scenario.id,
    serviceRevisionId: scenario.serviceRevision.id, acceptedQuoteRevisionId: revision.id,
    agreementCode: "DEMO-ALM-8M-001", status: "ACTIVE", holderName: scenario.client.name,
    identityType: "CEDULA", identityNumberMasked: "***-*******-*", identityEvidenceRef: "DEMO-IDENTITY-EVIDENCE",
    billingPartyType: "CLIENT", billingName: scenario.client.name, billingTaxId: null,
    billingEmail: scenario.client.email, billingAddress: scenario.client.address, billingCurrency: "DOP",
    billingFrequency: "MONTHLY", invoiceDay: 20, startDate: new Date("2026-11-20T00:00:00Z"),
    estimatedDurationMonths: 8, estimatedEndDate: new Date("2027-07-20T00:00:00Z"),
    capacityBasis: "TWENTY_FOOT_CONTAINER", capacityQuantity: "33", termsVersion: "DEMO-STORAGE-8M-V1",
    acceptanceEvidenceRef: "DEMO-SIGNED-CONTRACT", acceptedAt: new Date("2026-11-15T16:00:00Z"),
    signedAt: new Date("2026-11-15T16:00:00Z"), activatedAt: new Date("2026-11-15T16:05:00Z"),
    createdByMembershipId: actor.membership.id, createdByUserId: actor.user.id,
    activatedByMembershipId: actor.membership.id, activatedByUserId: actor.user.id,
  } });
  activeStage = "STORAGE_ENTRY_AUTHORIZATION";
  let authorization = await prisma.customerStorageAuthorization.findFirst({ where: { tenantId: tenant.id, pipelineCaseId: scenario.id, movementType: "ENTRY", status: "AUTHORIZED" } });
  if (!authorization) authorization = await prisma.customerStorageAuthorization.create({ data: {
    tenantId: tenant.id, clientId: scenario.client.id, pipelineCaseId: scenario.id,
    serviceRevisionId: scenario.serviceRevision.id, warehouseId: warehouse.id, storageAgreementId: agreement.id,
    authorizationCode: "AE-DEMO-0001", movementType: "ENTRY", paymentClearance: "NOT_APPLICABLE",
    storageType: "PERSONAL_EFFECTS", intakeSource: "EXTERNAL_ORIGIN", status: "AUTHORIZED",
    plannedAt: new Date("2026-11-20T13:00:00Z"), validUntil: new Date("2026-11-20T21:00:00Z"),
    manifestCode: "MAN-DEMO-8M-001", originText: scenario.originLocation, destinationText: warehouse.name,
    instructions: "Transporte particular del cliente. Validar autorización antes de descargar.",
    authorizedByMembershipId: actor.membership.id, authorizedByUserId: actor.user.id,
  } });
  return { agreement, authorization };
}

async function ensureImportAgentContext(prisma, tenant, actor, scenario) {
  let clientEntity = await prisma.commercialEntity.findFirst({ where: { tenantId: tenant.id, clientId: scenario.client.id } });
  if (!clientEntity) clientEntity = await prisma.commercialEntity.create({ data: { tenantId: tenant.id, clientId: scenario.client.id, code: "DEMO-IMPORT-PAYER", displayName: scenario.client.name, legalName: scenario.client.name, kind: "PERSON", countryCode: "DO" } });
  let agent = await prisma.commercialEntity.findFirst({ where: { tenantId: tenant.id, code: "DEMO-AGENT-MADRID" } });
  if (!agent) agent = await prisma.commercialEntity.create({ data: { tenantId: tenant.id, code: "DEMO-AGENT-MADRID", displayName: "Iberia Relocation Partners — Agente Demo", legalName: "Iberia Relocation Partners", kind: "AGENT", countryCode: "ES" } });
  if (!await prisma.pipelineCaseCommercialContextVersion.findFirst({ where: { tenantId: tenant.id, pipelineCaseId: scenario.id, state: "PUBLISHED" } })) await prisma.pipelineCaseCommercialContextVersion.create({ data: {
    tenantId: tenant.id, pipelineCaseId: scenario.id, seriesRef: stableUuid(`commercial-context-${scenario.caseCode}`),
    version: 1, state: "PUBLISHED", associationsSnapshot: [], instructionsSnapshot: [{ category: "AGENT_ASSIGNMENT", content: "Mudanza de importación asignada por agente internacional." }],
    logicalSha256: sha(`commercial-context-${scenario.caseCode}`), publishedAt: new Date(),
    createdByMembershipId: actor.membership.id, createdByUserId: actor.user.id,
    parties: { create: [{ tenantId: tenant.id, entityId: clientEntity.id, role: "PAYER" }, { tenantId: tenant.id, entityId: agent.id, role: "AGENT" }] },
  } });
}

const scenarios = [
  {
    caseCode: "DEMO-FLUJO-01-METRO", clientCode: "DEMO-CLI-01-METRO", clientName: "Familia Medina — Demo",
    email: "familia.medina.demo@example.invalid", phone: "+18095551001", mode: "LOCAL", cbm: 12.5,
    requiresSurvey: true, demoFlag: "DEMO_LOCAL_METRO", services: ["LOCAL_SIMPLE", "DEMO_PACKING", "DEMO_TRANSPORT"],
    origin: { countryCode: "DO", provinceState: "Distrito Nacional", cityMunicipality: "Santo Domingo", sector: "Piantini", streetAndNumber: "Av. Abraham Lincoln núm. 456", buildingResidential: "Torre Demo", floorUnit: "8-B", arrivalReference: "Entrada principal", contactName: "Laura Medina", contactPhone: "+18095551001" },
    destination: { countryCode: "DO", provinceState: "Distrito Nacional", cityMunicipality: "Santo Domingo", sector: "Naco", streetAndNumber: "Calle Fantino Falco núm. 22", buildingResidential: "Residencial Demo", floorUnit: "3-A", arrivalReference: "Portón lateral", contactName: "Laura Medina", contactPhone: "+18095551001" },
  },
  {
    caseCode: "DEMO-FLUJO-02-INTERIOR", clientCode: "DEMO-CLI-02-INTERIOR", clientName: "Familia Rosario — Demo",
    email: "familia.rosario.demo@example.invalid", phone: "+18095551002", mode: "LOCAL", cbm: 18,
    requiresSurvey: true, demoFlag: "DEMO_LOCAL_OUTSIDE_METRO", services: ["LOCAL_SIMPLE", "DEMO_PACKING", "DEMO_TRANSPORT"],
    origin: { countryCode: "DO", provinceState: "Distrito Nacional", cityMunicipality: "Santo Domingo", sector: "Bella Vista", streetAndNumber: "Av. Sarasota núm. 85", buildingResidential: "Casa Demo", floorUnit: null, arrivalReference: "Frente al parque", contactName: "Manuel Rosario", contactPhone: "+18095551002" },
    destination: { countryCode: "DO", provinceState: "Santiago", cityMunicipality: "Santiago de los Caballeros", sector: "Los Jardines", streetAndNumber: "Av. Metropolitana núm. 31", buildingResidential: "Casa Demo", floorUnit: null, arrivalReference: "Próximo a la avenida principal", contactName: "Manuel Rosario", contactPhone: "+18095551002" },
  },
  {
    caseCode: "DEMO-FLUJO-03-ALMACENAJE", clientCode: "DEMO-CLI-03-ALMACENAJE", clientName: "Familia Guzmán — Demo",
    email: "familia.guzman.demo@example.invalid", phone: "+18095551003", mode: "LOCAL", cbm: 33,
    requiresSurvey: false, demoFlag: "DEMO_PERSONAL_STORAGE", services: ["ALMACENAJE", "DEMO_INVENTORY", "DEMO_PACKING", "DEMO_WAREHOUSE_ENTRY"],
    origin: { countryCode: "DO", provinceState: "Distrito Nacional", cityMunicipality: "Santo Domingo", sector: "Arroyo Hondo", streetAndNumber: "Calle Los Pinos núm. 14", buildingResidential: "Casa Demo", floorUnit: null, arrivalReference: "Portón negro", contactName: "Carolina Guzmán", contactPhone: "+18095551003" },
    destination: { countryCode: "DO", provinceState: "Santo Domingo", cityMunicipality: "Santo Domingo Oeste", sector: "Haina", streetAndNumber: "Almacén International Packers — Demo", buildingResidential: "Almacén PREVIEW", floorUnit: null, arrivalReference: "Recepción de mercancías", contactName: "Encargado de Almacén", contactPhone: "+18095551999" },
  },
  {
    caseCode: "DEMO-FLUJO-04-IMPORT", clientCode: "DEMO-CLI-04-IMPORT", clientName: "Familia Laurent — Demo",
    email: "familia.laurent.demo@example.invalid", phone: "+18095551004", mode: "IMPORT", cbm: 24,
    requiresSurvey: false, demoFlag: "DEMO_IMPORT_AGENT", services: ["DEMO_IMPORT_MOVE", "DEMO_CUSTOMS", "DEMO_TRANSPORT", "DEMO_WAREHOUSE_ENTRY"],
    origin: { countryCode: "ES", provinceState: "Madrid", cityMunicipality: "Madrid", sector: "Salamanca", streetAndNumber: "Calle Serrano núm. 120", buildingResidential: "Apartamento Demo", floorUnit: "4-A", arrivalReference: "Inventario del agente", contactName: "Iberia Relocation Partners", contactPhone: "+34910000000" },
    destination: { countryCode: "DO", provinceState: "Distrito Nacional", cityMunicipality: "Santo Domingo", sector: "Gazcue", streetAndNumber: "Calle César Nicolás Penson núm. 40", buildingResidential: "Residencial Demo", floorUnit: "2-C", arrivalReference: "Entrega coordinada", contactName: "Pierre Laurent", contactPhone: "+18095551004" },
  },
  {
    caseCode: "DEMO-FLUJO-05-EXPORT", clientCode: "DEMO-CLI-05-EXPORT", clientName: "Familia Castillo — Demo",
    email: "familia.castillo.demo@example.invalid", phone: "+18095551005", mode: "EXPORT", cbm: 20,
    requiresSurvey: true, demoFlag: "DEMO_EXPORT", services: ["EXPORT_CRATING", "DEMO_PACKING", "DEMO_CUSTOMS", "DEMO_EXPORT_FREIGHT"],
    origin: { countryCode: "DO", provinceState: "Distrito Nacional", cityMunicipality: "Santo Domingo", sector: "Los Cacicazgos", streetAndNumber: "Av. Enriquillo núm. 77", buildingResidential: "Torre Demo", floorUnit: "6-A", arrivalReference: "Acceso por lobby", contactName: "Ana Castillo", contactPhone: "+18095551005" },
    destination: { countryCode: "US", provinceState: "Florida", cityMunicipality: "Miami", sector: "Brickell", streetAndNumber: "1200 Brickell Avenue", buildingResidential: "Condo Demo", floorUnit: "12", arrivalReference: "Loading dock", contactName: "Ana Castillo", contactPhone: "+13055550105" },
  },
];

const serviceDefinitions = [
  { code: "LOCAL_SIMPLE", name: "Mudanza local / nacional", category: "MOVING", usage: "PRIMARY", modes: ["LOCAL"], sortOrder: 10 },
  { code: "ALMACENAJE", name: "Almacenaje de efectos personales", category: "STORAGE", usage: "PRIMARY", modes: ["LOCAL", "IMPORT", "EXPORT"], sortOrder: 20 },
  { code: "DEMO_IMPORT_MOVE", name: "Mudanza de importación", category: "MOVING", usage: "PRIMARY", modes: ["IMPORT"], sortOrder: 30 },
  { code: "EXPORT_CRATING", name: "Mudanza de exportación", category: "MOVING", usage: "PRIMARY", modes: ["EXPORT"], sortOrder: 40 },
  { code: "DEMO_PACKING", name: "Empaque", category: "PACKING", usage: "COMPLEMENTARY", modes: ["LOCAL", "IMPORT", "EXPORT"], sortOrder: 110 },
  { code: "DEMO_TRANSPORT", name: "Transporte terrestre", category: "TRANSPORT", usage: "COMPLEMENTARY", modes: ["LOCAL", "IMPORT", "EXPORT"], sortOrder: 120 },
  { code: "DEMO_INVENTORY", name: "Inventario y etiquetado", category: "INVENTORY", usage: "COMPLEMENTARY", modes: ["LOCAL", "IMPORT", "EXPORT"], sortOrder: 130 },
  { code: "DEMO_WAREHOUSE_ENTRY", name: "Entrada a almacén", category: "STORAGE", usage: "COMPLEMENTARY", modes: ["LOCAL", "IMPORT", "EXPORT"], sortOrder: 140 },
  { code: "DEMO_CUSTOMS", name: "Gestión documental y aduanal", category: "CUSTOMS", usage: "COMPLEMENTARY", modes: ["IMPORT", "EXPORT"], sortOrder: 150 },
  { code: "DEMO_EXPORT_FREIGHT", name: "Flete internacional", category: "FREIGHT", usage: "COMPLEMENTARY", modes: ["EXPORT"], sortOrder: 160 },
];

async function seed(prisma) {
  activeStage = "DATABASE_IDENTITY";
  const [identity] = await prisma.$queryRawUnsafe("SELECT current_database() AS database, current_setting('neon.branch_id', true) AS branch");
  requireCondition(identity?.database === DATABASE && identity.branch === DATABASE_BRANCH, "DATABASE_IDENTITY_INVALID");
  const tenant = await prisma.tenant.findUnique({ where: { code: TENANT_CODE } });
  requireCondition(tenant?.status === "ACTIVE", "TENANT_INVALID");
  const actorMembership = await prisma.tenantMembership.findFirst({ where: { tenantId: tenant.id, user: { email: "admin-preview-10b@example.invalid" }, status: "ACTIVE" }, include: { user: true } });
  const evaluatorMembership = await prisma.tenantMembership.findFirst({ where: { tenantId: tenant.id, user: { email: "evaluator-preview-10b@example.invalid" }, status: "ACTIVE" }, include: { user: true } });
  requireCondition(actorMembership && evaluatorMembership, "ACTORS_INVALID");
  const actor = { membership: actorMembership, user: actorMembership.user };
  const evaluator = { membership: evaluatorMembership, user: evaluatorMembership.user };
  const schedulePolicy = await prisma.surveySchedulePolicyVersion.findFirst({ where: { tenantId: tenant.id, state: "ACTIVE" }, orderBy: { version: "desc" } });
  const catalog = new Map();
  activeStage = "SERVICE_CATALOG";
  for (const definition of serviceDefinitions) catalog.set(definition.code, await ensureService(prisma, tenant.id, definition));
  const created = [];
  for (let index = 0; index < scenarios.length; index += 1) {
    activeStage = `CASE_${index + 1}`;
    const definition = scenarios[index];
    created.push(await ensureCase(prisma, tenant, actor, definition, definition.services.map((code) => catalog.get(code))));
  }

  activeStage = "SURVEY_METRO";
  await ensureScheduledSurvey(prisma, tenant, actor, evaluator, schedulePolicy, created[0], { start: "2026-11-17T13:00:00Z", end: "2026-11-17T13:45:00Z", outsideMetro: false, distanceKm: 8, zoneCode: "METRO-PIANTINI", slotKey: "MORNING-09", travelBufferMinutes: 45, instructions: "Confirmar accesos, volumen, peso estimado y materiales de empaque." });
  activeStage = "SURVEY_INTERIOR";
  await ensureScheduledSurvey(prisma, tenant, actor, evaluator, schedulePolicy, created[1], { start: "2026-11-18T13:00:00Z", end: "2026-11-18T14:00:00Z", outsideMetro: true, distanceKm: 155, zoneCode: "SANTIAGO-LOS-JARDINES", slotKey: "FULL-DAY", travelBufferMinutes: 180, instructions: "Visita fuera de zona metro. Un solo Survey para el evaluador durante el día." });
  activeStage = "SURVEY_EXPORT";
  requireCondition(schedulePolicy, "SURVEY_SCHEDULE_POLICY_MISSING");
  await ensureCompletedSurvey(prisma, tenant, actor, evaluator, schedulePolicy, created[4], { start: "2026-11-14T14:00:00Z", end: "2026-11-14T14:45:00Z", distanceKm: 10, shipmentMode: "SEA", quantity: 14, unitVolumeM3: "1.43", unitWeightKg: "52", flags: ["FRAGILE", "CRATING_CANDIDATE"], notes: "Survey completo para exportación a Miami." });

  const context = { tenantId: tenant.id, membershipId: actor.membership.id, userId: actor.user.id, role: actor.membership.role, effectivePermissions: actor.membership.grantedPermissions, deniedPermissions: actor.membership.deniedPermissions };
  activeStage = "QUOTE_STORAGE";
  const storageQuote = await ensurePlansAndQuote(prisma, context, created[2], "ACCEPTED", "Almacenaje 8 meses — 20 pies");
  activeStage = "QUOTE_IMPORT";
  const importQuote = await ensurePlansAndQuote(prisma, context, created[3], "ACCEPTED", "Importación puerta a puerta");
  activeStage = "QUOTE_EXPORT";
  await ensurePlansAndQuote(prisma, context, created[4], "SENT", "Exportación marítima a Miami");
  activeStage = "STORAGE_AUTHORITY";
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL search_path = osi");
    return ensureStorageReady(tx, tenant, actor, created[2], storageQuote);
  }, { maxWait: 5000, timeout: 30000 });
  activeStage = "IMPORT_AGENT";
  await ensureImportAgentContext(prisma, tenant, actor, created[3]);

  activeStage = "FINAL_STATUS";
  const desiredStatuses = ["SURVEY_SCHEDULED", "SURVEY_SCHEDULED", "OPS_HANDOFF", "OPS_HANDOFF", "QUOTE_SENT"];
  for (let index = 0; index < created.length; index += 1) await prisma.pipelineCase.update({ where: { id: created[index].id }, data: { status: desiredStatuses[index], statusChangedAt: new Date(), flags: { set: ["PREVIEW_SYNTHETIC", DEMO_FLAG, scenarios[index].demoFlag] } } });

  const demoRows = await prisma.pipelineCase.findMany({ where: { tenantId: tenant.id, flags: { has: DEMO_FLAG } }, select: { caseCode: true, status: true }, orderBy: { caseCode: "asc" } });
  assert.deepEqual(demoRows.map((row) => row.caseCode), scenarios.map((item) => item.caseCode));
  requireCondition(await prisma.customerStorageAuthorization.count({ where: { tenantId: tenant.id, pipelineCaseId: created[2].id, status: "AUTHORIZED" } }) === 1, "STORAGE_AUTHORIZATION_MISSING");
  return { cases: demoRows, storageAuthorization: "AE-DEMO-0001", syntheticOnly: true };
}

export async function runOperationalDemoFlowsPreviewSeed({ env = process.env } = {}) {
  const operation = operationalDemoSeedOperation(env);
  if (!operation) return null;
  const prisma = new PrismaClient({ datasources: { db: { url: env.DIRECT_URL } }, log: [] });
  try {
    const result = await seed(prisma);
    return { commit: operation.commit, status: "SEEDED", ...result };
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    requireCondition(process.argv.length === 3 && process.argv[2] === "--build-hook", "ARGUMENTS_INVALID");
    const result = await runOperationalDemoFlowsPreviewSeed();
    if (result) process.stdout.write(`${JSON.stringify({ operationalDemoFlows: result })}\n`);
  } catch (error) {
    const safeError = String(error?.code || error?.name || "FAILED").replace(/[^A-Z0-9_]/giu, "_").toUpperCase();
    const safeTable = typeof error?.meta?.table === "string"
      ? error.meta.table.replace(/[^A-Z0-9_.]/giu, "_").toUpperCase()
      : null;
    const code = /^OPERATIONAL_DEMO_FLOWS_SEED_[A-Z0-9_-]+$/u.test(error?.message ?? "")
      ? error.message : `OPERATIONAL_DEMO_FLOWS_SEED_${activeStage}_${safeError}${safeTable ? `_${safeTable}` : ""}`;
    process.stderr.write(`${JSON.stringify({ operationalDemoFlows: { status: "BLOCKED", code } })}\n`);
    process.exitCode = 1;
  }
}
