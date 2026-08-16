import { randomUUID } from "node:crypto";
import { createCrm01b2LocalPrisma } from "./crm-01b2-local-target.mjs";

const results = [];
const originalConsoleError = console.error;
console.error = () => {};
function check(name, condition) {
  results.push({ name, passed: Boolean(condition) });
  if (!condition) throw new Error(name);
}
async function expectCode(name, operation, code) {
  let caught;
  try { await operation(); } catch (error) { caught = error; }
  check(name, caught?.code === code && caught?.cause === undefined && !String(caught?.message || "").includes("postgresql://"));
  return caught;
}

const local = await createCrm01b2LocalPrisma();
const { prisma, target } = local;
process.env.DATABASE_URL = process.env.CRM01B2_TEST_DATABASE_URL;
process.env.DIRECT_URL = process.env.CRM01B2_TEST_DATABASE_URL;
const domain = await import("../api/_lib/pipelineCaseDomain.js");
const appPrisma = (await import("../api/_lib/db.js")).prisma;
const run = `crm01b2-${randomUUID()}`;
const prefix = run.toUpperCase();
const ids = [];

function userData(id, role = "V", status = "active") {
  return { id, code: id.toUpperCase(), name: `Synthetic ${role}`, email: `${id}@example.test`, phone: "0000000000", role, status, joinDate: "2026-08-12", passwordHash: "not-a-login-hash" };
}
function caseData(id, tenantId, status = "NEW_INBOX", owner = null, ownerId = null) {
  return {
    id, tenantId, caseCode: id.toUpperCase(), clientName: "Synthetic", mode: "LOCAL", serviceType: "MOVING",
    customerType: "L4_PERSONAL", status, ownerName: owner ? "Synthetic seller" : "Unassigned",
    ownerMembershipId: owner?.membershipId || owner?.id || null, ownerUserId: owner?.userId || null, ownerId,
    originLocation: "Origin", destinationLocation: "Destination",
  };
}
function request(label) { return `${run}.${label}`; }
function context(tenantId, membershipId) { return Object.freeze({ tenantId, membershipId, role: "FORGED", permissions: ["*"] }); }

try {
  const tenantOne = await prisma.tenant.create({ data: { id: `${run}-tenant-1`, code: `${prefix}-T1`, name: "CRM01B2 tenant one" } });
  const tenantTwo = await prisma.tenant.create({ data: { id: `${run}-tenant-2`, code: `${prefix}-T2`, name: "CRM01B2 tenant two" } });
  ids.push(tenantOne.id, tenantTwo.id);
  const adminOneUser = await prisma.user.create({ data: userData(`${run}-admin-1`, "A") });
  const sellerOneUser = await prisma.user.create({ data: userData(`${run}-seller-1`) });
  const sellerTwoUser = await prisma.user.create({ data: userData(`${run}-seller-2`) });
  const inactiveUser = await prisma.user.create({ data: userData(`${run}-seller-inactive`, "V", "inactive") });
  const suspendedMembershipUser = await prisma.user.create({ data: userData(`${run}-seller-suspended`) });
  const adminTwoUser = await prisma.user.create({ data: userData(`${run}-admin-2`, "A") });
  const sellerOtherTenantUser = await prisma.user.create({ data: userData(`${run}-seller-other`) });
  const adminOne = await prisma.tenantMembership.create({ data: { id: `${run}-membership-admin-1`, tenantId: tenantOne.id, userId: adminOneUser.id, role: "A" } });
  const sellerOne = await prisma.tenantMembership.create({ data: { id: `${run}-membership-seller-1`, tenantId: tenantOne.id, userId: sellerOneUser.id, role: "V" } });
  const sellerTwo = await prisma.tenantMembership.create({ data: { id: `${run}-membership-seller-2`, tenantId: tenantOne.id, userId: sellerTwoUser.id, role: "V" } });
  const inactiveSeller = await prisma.tenantMembership.create({ data: { id: `${run}-membership-inactive-user`, tenantId: tenantOne.id, userId: inactiveUser.id, role: "V" } });
  const suspendedSeller = await prisma.tenantMembership.create({ data: { id: `${run}-membership-suspended`, tenantId: tenantOne.id, userId: suspendedMembershipUser.id, role: "V", status: "SUSPENDED" } });
  const deniedSeller = await prisma.tenantMembership.create({ data: { id: `${run}-membership-denied`, tenantId: tenantOne.id, userId: await prisma.user.create({ data: userData(`${run}-seller-denied`) }).then((row) => row.id), role: "V", deniedPermissions: ["pipeline:transition"] } });
  const adminTwo = await prisma.tenantMembership.create({ data: { id: `${run}-membership-admin-2`, tenantId: tenantTwo.id, userId: adminTwoUser.id, role: "A" } });
  const sellerOther = await prisma.tenantMembership.create({ data: { id: `${run}-membership-seller-other`, tenantId: tenantTwo.id, userId: sellerOtherTenantUser.id, role: "V" } });
  const ctxA = context(tenantOne.id, adminOne.id);
  const ctxV1 = context(tenantOne.id, sellerOne.id);
  const ctxV2 = context(tenantOne.id, sellerTwo.id);

  const basic = await prisma.pipelineCase.create({ data: caseData(`${run}-case-basic`, tenantOne.id, "NEW_INBOX", sellerOne, sellerOneUser.id) });
  const first = await domain.transitionPipelineCase(ctxV1, { caseId: basic.id, expectedVersion: 1, requestId: request("transition-basic"), toStatus: "AWAITING_ICP" });
  check("V transiciona exclusivamente su caso asignado", first.resultingVersion === 2 && first.previousStatus === "NEW_INBOX" && first.resultingStatus === "AWAITING_ICP" && first.replayed === false);
  const basicAfter = await prisma.pipelineCase.findUnique({ where: { id: basic.id } });
  check("caso y reloj PostgreSQL se actualizan atómicamente", basicAfter.version === 2 && basicAfter.status === "AWAITING_ICP" && basicAfter.statusChangedAt instanceof Date);
  check("ownerId heredado permanece intacto", basicAfter.ownerId === sellerOneUser.id);
  check("journal único creado", await prisma.pipelineCaseCommand.count({ where: { tenantId: tenantOne.id, requestId: request("transition-basic") } }) === 1);
  check("auditoría crítica creada", await prisma.commercialAuditLog.count({ where: { tenant_id: tenantOne.id, request_id: request("transition-basic"), critical: true } }) === 1);
  const replay = await domain.transitionPipelineCase(ctxV1, { caseId: basic.id, expectedVersion: 1, requestId: request("transition-basic"), toStatus: "AWAITING_ICP" });
  check("reintento idéntico devuelve receipt histórico", replay.commandId === first.commandId && replay.replayed === true && replay.resultingVersion === 2);
  check("reintento idéntico no duplica journal ni auditoría", await prisma.pipelineCaseCommand.count({ where: { requestId: request("transition-basic") } }) === 1 && await prisma.commercialAuditLog.count({ where: { request_id: request("transition-basic") } }) === 1);
  await expectCode("otro actor no puede adoptar el mismo requestId", () => domain.transitionPipelineCase(ctxA, { caseId: basic.id, expectedVersion: 1, requestId: request("transition-basic"), toStatus: "AWAITING_ICP" }), "CRM_PIPELINE_IDEMPOTENCY_CONFLICT");
  await expectCode("requestId con payload diferente entra en conflicto", () => domain.transitionPipelineCase(ctxV1, { caseId: basic.id, expectedVersion: 1, requestId: request("transition-basic"), toStatus: "GOVERNANCE_CONFIRMED" }), "CRM_PIPELINE_IDEMPOTENCY_CONFLICT");
  await domain.transitionPipelineCase(ctxV1, { caseId: basic.id, expectedVersion: 2, requestId: request("advance-after-replay"), toStatus: "GOVERNANCE_CONFIRMED" });
  const historicalReplay = await domain.transitionPipelineCase(ctxV1, { caseId: basic.id, expectedVersion: 1, requestId: request("transition-basic"), toStatus: "AWAITING_ICP" });
  check("replay tras avance devuelve sólo receipt histórico", historicalReplay.replayed === true && historicalReplay.resultingVersion === 2 && (await prisma.pipelineCase.findUnique({ where: { id: basic.id } })).version === 3);
  const versionError = await expectCode("versión obsoleta entra en conflicto", () => domain.transitionPipelineCase(ctxV1, { caseId: basic.id, expectedVersion: 1, requestId: request("stale"), toStatus: "GOVERNANCE_CONFIRMED" }), "CRM_PIPELINE_VERSION_CONFLICT");
  check("conflicto de versión es recuperable", versionError.recoverable === true);
  await expectCode("otro V no puede mutar caso ajeno", () => domain.transitionPipelineCase(ctxV2, { caseId: basic.id, expectedVersion: 3, requestId: request("other-v"), toStatus: "REQUIREMENTS_CONFIRMED" }), "CRM_PIPELINE_PERMISSION_FORBIDDEN");
  const noOwnerForV = await prisma.pipelineCase.create({ data: caseData(`${run}-case-no-owner-v`, tenantOne.id) });
  await expectCode("V no puede mutar caso sin owner", () => domain.transitionPipelineCase(ctxV1, { caseId: noOwnerForV.id, expectedVersion: 1, requestId: request("no-owner-v"), toStatus: "AWAITING_ICP" }), "CRM_PIPELINE_PERMISSION_FORBIDDEN");
  const adminTransition = await domain.transitionPipelineCase(ctxA, { caseId: noOwnerForV.id, expectedVersion: 1, requestId: request("admin-any-case"), toStatus: "AWAITING_ICP" });
  check("A puede transicionar cualquier caso del tenant", adminTransition.resultingStatus === "AWAITING_ICP");
  await expectCode("campos de autoridad del navegador se rechazan", () => domain.transitionPipelineCase(ctxV1, { caseId: basic.id, expectedVersion: 2, requestId: request("forged"), toStatus: "GOVERNANCE_CONFIRMED", tenantId: tenantTwo.id }), "CRM_PIPELINE_COMMAND_INVALID");

  const deniedCase = await prisma.pipelineCase.create({ data: caseData(`${run}-case-denied`, tenantOne.id, "NEW_INBOX", deniedSeller) });
  await expectCode("deniedPermissions prevalece", () => domain.transitionPipelineCase(context(tenantOne.id, deniedSeller.id), { caseId: deniedCase.id, expectedVersion: 1, requestId: request("denied"), toStatus: "AWAITING_ICP" }), "CRM_PIPELINE_PERMISSION_FORBIDDEN");
  await expectCode("usuario global inactivo se rechaza", () => domain.transitionPipelineCase(context(tenantOne.id, inactiveSeller.id), { caseId: deniedCase.id, expectedVersion: 1, requestId: request("inactive"), toStatus: "AWAITING_ICP" }), "CRM_PIPELINE_PERMISSION_FORBIDDEN");
  await expectCode("membresía suspendida se rechaza", () => domain.transitionPipelineCase(context(tenantOne.id, suspendedSeller.id), { caseId: deniedCase.id, expectedVersion: 1, requestId: request("suspended"), toStatus: "AWAITING_ICP" }), "CRM_PIPELINE_PERMISSION_FORBIDDEN");
  await expectCode("tenant cruzado queda oculto", () => domain.transitionPipelineCase(context(tenantTwo.id, adminTwo.id), { caseId: basic.id, expectedVersion: 2, requestId: request("cross-tenant"), toStatus: "GOVERNANCE_CONFIRMED" }), "CRM_PIPELINE_RESOURCE_NOT_FOUND");

  const legacyOwnerId = sellerOneUser.id;
  const unassigned = await prisma.pipelineCase.create({ data: caseData(`${run}-case-owner`, tenantOne.id, "NEW_INBOX", null, legacyOwnerId) });
  const assigned = await domain.assignPipelineCaseOwner(ctxA, { caseId: unassigned.id, expectedVersion: 1, requestId: request("assign"), ownerMembershipId: sellerOne.id });
  check("A asigna owner V elegible", assigned.commandType === "ASSIGN_OWNER" && assigned.resultingOwnerMembershipId === sellerOne.id);
  await expectCode("V no administra owners", () => domain.assignPipelineCaseOwner(ctxV1, { caseId: unassigned.id, expectedVersion: 2, requestId: request("v-assign"), ownerMembershipId: sellerTwo.id }), "CRM_PIPELINE_PERMISSION_FORBIDDEN");
  await expectCode("owner igual al actual se rechaza", () => domain.assignPipelineCaseOwner(ctxA, { caseId: unassigned.id, expectedVersion: 2, requestId: request("same-owner"), ownerMembershipId: sellerOne.id }), "CRM_PIPELINE_OWNER_INELIGIBLE");
  await expectCode("owner de otro tenant se rechaza", () => domain.assignPipelineCaseOwner(ctxA, { caseId: unassigned.id, expectedVersion: 2, requestId: request("cross-owner"), ownerMembershipId: sellerOther.id }), "CRM_PIPELINE_OWNER_INELIGIBLE");
  await expectCode("owner con User inactivo se rechaza", () => domain.assignPipelineCaseOwner(ctxA, { caseId: unassigned.id, expectedVersion: 2, requestId: request("inactive-owner"), ownerMembershipId: inactiveSeller.id }), "CRM_PIPELINE_OWNER_INELIGIBLE");
  await expectCode("owner con Membership suspendida se rechaza", () => domain.assignPipelineCaseOwner(ctxA, { caseId: unassigned.id, expectedVersion: 2, requestId: request("suspended-owner"), ownerMembershipId: suspendedSeller.id }), "CRM_PIPELINE_OWNER_INELIGIBLE");
  await expectCode("owner rol A se rechaza", () => domain.assignPipelineCaseOwner(ctxA, { caseId: unassigned.id, expectedVersion: 2, requestId: request("admin-owner"), ownerMembershipId: adminOne.id }), "CRM_PIPELINE_OWNER_INELIGIBLE");
  const reassigned = await domain.assignPipelineCaseOwner(ctxA, { caseId: unassigned.id, expectedVersion: 2, requestId: request("reassign"), ownerMembershipId: sellerTwo.id });
  check("reasignación conserva tipo journal y nuevo owner", reassigned.commandType === "ASSIGN_OWNER" && reassigned.resultingOwnerMembershipId === sellerTwo.id);
  const unassignedReceipt = await domain.unassignPipelineCaseOwner(ctxA, { caseId: unassigned.id, expectedVersion: 3, requestId: request("unassign") });
  check("desasignación borra pareja empresarial", unassignedReceipt.commandType === "UNASSIGN_OWNER" && unassignedReceipt.resultingOwnerMembershipId === null);
  const unassignedAfter = await prisma.pipelineCase.findUnique({ where: { id: unassigned.id } });
  check("desasignación deja ambos campos NULL", unassignedAfter.ownerMembershipId === null && unassignedAfter.ownerUserId === null && unassignedAfter.version === 4);
  check("asignar y desasignar preserva ownerId heredado byte por byte", unassignedAfter.ownerId === legacyOwnerId);

  const approved = await prisma.pipelineCase.create({ data: caseData(`${run}-case-approved`, tenantOne.id, "APPROVED", sellerOne) });
  await expectCode("APPROVED no transiciona", () => domain.transitionPipelineCase(ctxA, { caseId: approved.id, expectedVersion: 1, requestId: request("approved-transition"), toStatus: "OPS_HANDOFF", evidence: { type: "PROJECT", id: `${run}-missing` } }), "CRM_PIPELINE_STATE_INVALID");
  await expectCode("APPROVED no cambia owner", () => domain.unassignPipelineCaseOwner(ctxA, { caseId: approved.id, expectedVersion: 1, requestId: request("approved-owner") }), "CRM_PIPELINE_STATE_INVALID");
  const allowedApproved = await domain.getAllowedPipelineTransitions(ctxA, approved.id);
  check("APPROVED publica cero transiciones", allowedApproved.transitions.length === 0);

  const invalidGraph = await prisma.pipelineCase.create({ data: caseData(`${run}-case-invalid-graph`, tenantOne.id, "NEW_INBOX", sellerOne) });
  await expectCode("arista fuera del grafo se rechaza", () => domain.transitionPipelineCase(ctxV1, { caseId: invalidGraph.id, expectedVersion: 1, requestId: request("invalid-edge"), toStatus: "WON" }), "CRM_PIPELINE_STATE_INVALID");
  const evidenceFreeEdges = [
    ["AWAITING_ICP", "GOVERNANCE_CONFIRMED"], ["GOVERNANCE_CONFIRMED", "REQUIREMENTS_CONFIRMED"],
    ["REQUIREMENTS_CONFIRMED", "SURVEY_PLANNING"], ["REQUIREMENTS_CONFIRMED", "CRATING_ESTIMATE_PENDING"],
    ["REQUIREMENTS_CONFIRMED", "PRICING_IN_PROGRESS"], ["SURVEY_COMPLETED", "CRATING_ESTIMATE_PENDING"],
    ["SURVEY_COMPLETED", "PRICING_IN_PROGRESS"], ["CRATING_ESTIMATE_PENDING", "PRICING_IN_PROGRESS"],
    ["QUOTE_DRAFT", "INTERNAL_REVIEW"], ["QUOTE_SENT", "NEGOTIATION"],
    ["NEGOTIATION", "CHANGE_CONTROL"], ["CHANGE_CONTROL", "NEGOTIATION"],
  ];
  for (const [index, [fromStatus, toStatus]] of evidenceFreeEdges.entries()) {
    const edgeCase = await prisma.pipelineCase.create({ data: caseData(`${run}-case-edge-${index}`, tenantOne.id, fromStatus, sellerOne) });
    const edge = await domain.transitionPipelineCase(ctxV1, { caseId: edgeCase.id, expectedVersion: 1, requestId: request(`edge-${index}`), toStatus });
    check(`arista autorizada ${fromStatus} -> ${toStatus}`, edge.previousStatus === fromStatus && edge.resultingStatus === toStatus && edge.resultingVersion === 2);
  }
  const surveyPlanning = await prisma.pipelineCase.create({ data: caseData(`${run}-case-survey-planning`, tenantOne.id, "SURVEY_PLANNING", sellerOne) });
  await expectCode("SURVEY_SCHEDULED bloqueado sin evidencia temporal inequívoca", () => domain.transitionPipelineCase(ctxV1, { caseId: surveyPlanning.id, expectedVersion: 1, requestId: request("survey-scheduled"), toStatus: "SURVEY_SCHEDULED", evidence: { type: "SURVEY", id: `${run}-survey` } }), "CRM_PIPELINE_EVIDENCE_REQUIRED");
  check("transiciones permitidas omiten SURVEY_SCHEDULED bloqueado", !(await domain.getAllowedPipelineTransitions(ctxV1, surveyPlanning.id)).transitions.some((item) => item.toStatus === "SURVEY_SCHEDULED"));
  const wonBlocked = await prisma.pipelineCase.create({ data: caseData(`${run}-case-won-blocked`, tenantOne.id, "QUOTE_SENT", sellerOne) });
  await expectCode("WON bloqueado sin aprobación inequívoca", () => domain.transitionPipelineCase(ctxV1, { caseId: wonBlocked.id, expectedVersion: 1, requestId: request("won"), toStatus: "WON", evidence: { type: "APPROVAL", id: `${run}-approval` } }), "CRM_PIPELINE_EVIDENCE_REQUIRED");
  check("transiciones permitidas omiten WON desde QUOTE_SENT", !(await domain.getAllowedPipelineTransitions(ctxV1, wonBlocked.id)).transitions.some((item) => item.toStatus === "WON"));
  const negotiationWonBlocked = await prisma.pipelineCase.create({ data: caseData(`${run}-case-negotiation-won-blocked`, tenantOne.id, "NEGOTIATION", sellerOne) });
  check("transiciones permitidas omiten WON desde NEGOTIATION", !(await domain.getAllowedPipelineTransitions(ctxV1, negotiationWonBlocked.id)).transitions.some((item) => item.toStatus === "WON"));

  const quoteCase = await prisma.pipelineCase.create({ data: caseData(`${run}-case-quote`, tenantOne.id, "PRICING_IN_PROGRESS", sellerOne) });
  const quote = await prisma.pipelineCaseQuote.create({ data: { id: `${run}-quote`, caseId: quoteCase.id, level: "BASIC", status: "DRAFT" } });
  await expectCode("evidencia obligatoria ausente", () => domain.transitionPipelineCase(ctxV1, { caseId: quoteCase.id, expectedVersion: 1, requestId: request("quote-missing"), toStatus: "QUOTE_DRAFT" }), "CRM_PIPELINE_EVIDENCE_REQUIRED");
  const foreignQuoteCase = await prisma.pipelineCase.create({ data: caseData(`${run}-case-foreign-quote`, tenantOne.id, "PRICING_IN_PROGRESS", sellerOne) });
  const foreignQuote = await prisma.pipelineCaseQuote.create({ data: { id: `${run}-quote-foreign`, caseId: foreignQuoteCase.id, level: "BASIC", status: "DRAFT" } });
  await expectCode("evidencia de otro caso se rechaza", () => domain.transitionPipelineCase(ctxV1, { caseId: quoteCase.id, expectedVersion: 1, requestId: request("quote-foreign"), toStatus: "QUOTE_DRAFT", evidence: { type: "QUOTE", id: foreignQuote.id } }), "CRM_PIPELINE_EVIDENCE_INVALID");
  const quoteTransition = await domain.transitionPipelineCase(ctxV1, { caseId: quoteCase.id, expectedVersion: 1, requestId: request("quote-valid"), toStatus: "QUOTE_DRAFT", evidence: { type: "QUOTE", id: quote.id } });
  check("evidencia QUOTE válida queda en journal", quoteTransition.evidence?.type === "QUOTE" && quoteTransition.evidence?.id === quote.id);
  const allowedQuote = await domain.getAllowedPipelineTransitions(ctxV1, quoteCase.id);
  check("consulta de transiciones devuelve grafo efectivo", allowedQuote.status === "QUOTE_DRAFT" && allowedQuote.transitions.some((item) => item.toStatus === "INTERNAL_REVIEW"));

  const quoteSentCase = await prisma.pipelineCase.create({ data: caseData(`${run}-case-quote-sent`, tenantOne.id, "INTERNAL_REVIEW", sellerOne) });
  const sentQuote = await prisma.pipelineCaseQuote.create({ data: { id: `${run}-quote-sent`, caseId: quoteSentCase.id, level: "STANDARD", status: "SENT", sentAt: new Date() } });
  const quoteSent = await domain.transitionPipelineCase(ctxV1, { caseId: quoteSentCase.id, expectedVersion: 1, requestId: request("quote-sent"), toStatus: "QUOTE_SENT", evidence: { type: "QUOTE", id: sentQuote.id } });
  check("envío de Quote prueba QUOTE_SENT", quoteSent.resultingStatus === "QUOTE_SENT" && quoteSent.evidence?.id === sentQuote.id);
  const changeCase = await prisma.pipelineCase.create({ data: caseData(`${run}-case-change-quote`, tenantOne.id, "CHANGE_CONTROL", sellerOne) });
  const changeQuote = await prisma.pipelineCaseQuote.create({ data: { id: `${run}-quote-change`, caseId: changeCase.id, level: "PREMIUM", status: "DRAFT" } });
  const changeToDraft = await domain.transitionPipelineCase(ctxV1, { caseId: changeCase.id, expectedVersion: 1, requestId: request("change-quote"), toStatus: "QUOTE_DRAFT", evidence: { type: "QUOTE", id: changeQuote.id } });
  check("CHANGE_CONTROL vuelve a QUOTE_DRAFT con Quote compatible", changeToDraft.resultingStatus === "QUOTE_DRAFT");

  const client = await prisma.client.create({ data: { id: `${run}-client`, tenantId: tenantOne.id, code: `${prefix}-CLIENT`, name: "Synthetic client", email: `${run}-client@example.test`, phone: "0", address: "Synthetic", type: "PERSON", status: "active", createdAt: "2026-08-12" } });
  const surveyCase = await prisma.pipelineCase.create({ data: { ...caseData(`${run}-case-survey-completed`, tenantOne.id, "SURVEY_SCHEDULED", sellerOne), clientId: client.id } });
  const surveyProject = await prisma.project.create({ data: { id: `${run}-survey-project`, tenantId: tenantOne.id, pipelineCaseId: surveyCase.id, code: `${prefix}-SURVEY-PROJECT`, name: "Synthetic survey project", clientId: client.id, clientName: client.name, status: "active", startDate: "2026-08-12" } });
  const lead = await prisma.lead.create({ data: { id: `${run}-lead`, tenantId: tenantOne.id, code: `${prefix}-LEAD`, status: "active", clientName: "Synthetic" } });
  const survey = await prisma.survey.create({ data: { id: `${run}-survey-complete`, leadId: lead.id, projectId: surveyProject.id, status: "SUBMITTED", submittedAt: new Date() } });
  const surveyCompleted = await domain.transitionPipelineCase(ctxV1, { caseId: surveyCase.id, expectedVersion: 1, requestId: request("survey-completed"), toStatus: "SURVEY_COMPLETED", evidence: { type: "SURVEY", id: survey.id } });
  check("Survey enviado prueba SURVEY_COMPLETED", surveyCompleted.resultingStatus === "SURVEY_COMPLETED" && surveyCompleted.evidence?.id === survey.id);
  const wonCase = await prisma.pipelineCase.create({ data: { ...caseData(`${run}-case-won`, tenantOne.id, "WON", sellerOne), clientId: client.id } });
  const project = await prisma.project.create({ data: { id: `${run}-project`, tenantId: tenantOne.id, pipelineCaseId: wonCase.id, code: `${prefix}-PROJECT`, name: "Synthetic project", clientId: client.id, clientName: client.name, status: "active", startDate: "2026-08-12" } });
  const projectBefore = await prisma.project.findUnique({ where: { id: project.id } });
  const ops = await domain.transitionPipelineCase(ctxV1, { caseId: wonCase.id, expectedVersion: 1, requestId: request("ops"), toStatus: "OPS_HANDOFF", evidence: { type: "PROJECT", id: project.id } });
  check("Project enlazado prueba OPS_HANDOFF", ops.resultingStatus === "OPS_HANDOFF" && ops.evidence?.id === project.id);
  check("OPS_HANDOFF es terminal", (await domain.getAllowedPipelineTransitions(ctxV1, wonCase.id)).transitions.length === 0);
  const projectAfter = await prisma.project.findUnique({ where: { id: project.id } });
  check("Project de evidencia no se modifica", projectAfter.status === projectBefore.status && projectAfter.name === projectBefore.name && projectAfter.clientId === projectBefore.clientId && projectAfter.pipelineCaseId === projectBefore.pipelineCaseId);

  for (const [index, reasonCode] of ["PRICE", "COMPETITOR", "NO_RESPONSE", "CLIENT_CANCELLED", "TIMING", "SERVICE_UNAVAILABLE", "DUPLICATE", "OTHER"].entries()) {
    const lossCase = await prisma.pipelineCase.create({ data: caseData(`${run}-case-loss-${index}`, tenantOne.id, "NEGOTIATION", sellerOne) });
    const loss = await domain.transitionPipelineCase(ctxV1, { caseId: lossCase.id, expectedVersion: 1, requestId: request(`loss-${index}`), toStatus: "LOST", reasonCode });
    check(`motivo LOST permitido ${reasonCode}`, loss.resultingStatus === "LOST" && loss.reasonCode === reasonCode);
    if (index === 0) {
      await expectCode("V no reabre LOST", () => domain.transitionPipelineCase(ctxV1, { caseId: lossCase.id, expectedVersion: 2, requestId: request("reopen-v"), toStatus: "NEW_INBOX", reasonCode: "MANUAL_REVIEW" }), "CRM_PIPELINE_PERMISSION_FORBIDDEN");
      const reopened = await domain.transitionPipelineCase(ctxA, { caseId: lossCase.id, expectedVersion: 2, requestId: request("reopen-a"), toStatus: "NEW_INBOX", reasonCode: "MANUAL_REVIEW" });
      check("A reabre LOST con motivo allowlist", reopened.commandType === "REOPEN" && reopened.resultingStatus === "NEW_INBOX");
    }
  }
  const invalidLoss = await prisma.pipelineCase.create({ data: caseData(`${run}-case-loss-invalid`, tenantOne.id, "NEGOTIATION", sellerOne) });
  await expectCode("motivo LOST libre se rechaza", () => domain.transitionPipelineCase(ctxV1, { caseId: invalidLoss.id, expectedVersion: 1, requestId: request("loss-invalid"), toStatus: "LOST", reasonCode: "NOT_IN_ALLOWLIST" }), "CRM_PIPELINE_COMMAND_INVALID");

  const auditFailureCase = await prisma.pipelineCase.create({ data: caseData(`${run}-case-audit-failure`, tenantOne.id, "NEW_INBOX", sellerOne) });
  const auditFailureRequest = request("audit-failure");
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "crm01b2_test_fail_audit_trigger" ON "osi"."commercial_audit_logs"`);
  await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "osi"."crm01b2_test_fail_audit"()`);
  await prisma.$executeRawUnsafe(`CREATE FUNCTION "osi"."crm01b2_test_fail_audit"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."request_id" = '${auditFailureRequest}' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER "crm01b2_test_fail_audit_trigger" BEFORE INSERT ON "osi"."commercial_audit_logs" FOR EACH ROW EXECUTE FUNCTION "osi"."crm01b2_test_fail_audit"()`);
  await expectCode("fallo de auditoría produce error sanitizado", () => domain.transitionPipelineCase(ctxV1, { caseId: auditFailureCase.id, expectedVersion: 1, requestId: auditFailureRequest, toStatus: "AWAITING_ICP" }), "CRM_PIPELINE_STATE_INVALID");
  const afterAuditFailure = await prisma.pipelineCase.findUnique({ where: { id: auditFailureCase.id } });
  check("fallo de auditoría revierte caso", afterAuditFailure.version === 1 && afterAuditFailure.status === "NEW_INBOX");
  check("fallo de auditoría revierte journal", await prisma.pipelineCaseCommand.count({ where: { requestId: auditFailureRequest } }) === 0);
  await prisma.$executeRawUnsafe(`DROP TRIGGER "crm01b2_test_fail_audit_trigger" ON "osi"."commercial_audit_logs"`);
  await prisma.$executeRawUnsafe(`DROP FUNCTION "osi"."crm01b2_test_fail_audit"()`);

  const journalFailureCase = await prisma.pipelineCase.create({ data: caseData(`${run}-case-journal-failure`, tenantOne.id, "NEW_INBOX", sellerOne) });
  const journalFailureRequest = request("journal-failure");
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "crm01b2_test_fail_journal_trigger" ON "osi"."pipeline_case_commands"`);
  await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "osi"."crm01b2_test_fail_journal"()`);
  await prisma.$executeRawUnsafe(`CREATE FUNCTION "osi"."crm01b2_test_fail_journal"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."request_id" = '${journalFailureRequest}' THEN RAISE EXCEPTION 'synthetic journal failure'; END IF; RETURN NEW; END $$`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER "crm01b2_test_fail_journal_trigger" BEFORE INSERT ON "osi"."pipeline_case_commands" FOR EACH ROW EXECUTE FUNCTION "osi"."crm01b2_test_fail_journal"()`);
  await expectCode("fallo de journal produce error sanitizado", () => domain.transitionPipelineCase(ctxV1, { caseId: journalFailureCase.id, expectedVersion: 1, requestId: journalFailureRequest, toStatus: "AWAITING_ICP" }), "CRM_PIPELINE_STATE_INVALID");
  const afterJournalFailure = await prisma.pipelineCase.findUnique({ where: { id: journalFailureCase.id } });
  check("fallo de journal revierte caso y auditoría", afterJournalFailure.version === 1 && afterJournalFailure.status === "NEW_INBOX" && await prisma.commercialAuditLog.count({ where: { request_id: journalFailureRequest } }) === 0);
  await prisma.$executeRawUnsafe(`DROP TRIGGER "crm01b2_test_fail_journal_trigger" ON "osi"."pipeline_case_commands"`);
  await prisma.$executeRawUnsafe(`DROP FUNCTION "osi"."crm01b2_test_fail_journal"()`);

  const originalTransaction = appPrisma.$transaction.bind(appPrisma);
  appPrisma.$transaction = async () => { throw new Error("synthetic unavailable"); };
  await expectCode("Prisma no disponible devuelve 503 sanitizado", () => domain.getAllowedPipelineTransitions(ctxA, basic.id), "CRM_PIPELINE_DATABASE_UNAVAILABLE");
  appPrisma.$transaction = originalTransaction;

  const crossTenantCount = await prisma.pipelineCaseCommand.count({ where: { tenantId: tenantTwo.id } });
  check("operaciones tenant uno no contaminan tenant dos", crossTenantCount === 0);
  check("destino de prueba es PostgreSQL local validado", target.address === "127.0.0.1" && target.port === 55432 && target.schema === "osi");
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, assertions: results.filter((item) => item.passed).length, results, error: { name: error.name, code: error.code || null, message: error.message } })}\n`);
  process.exitCode = 1;
} finally {
  try {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "crm01b2_test_fail_audit_trigger" ON "osi"."commercial_audit_logs"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "osi"."crm01b2_test_fail_audit"()`);
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "crm01b2_test_fail_journal_trigger" ON "osi"."pipeline_case_commands"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "osi"."crm01b2_test_fail_journal"()`);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`LOCK TABLE "osi"."commercial_audit_logs", "osi"."pipeline_case_commands" IN ACCESS EXCLUSIVE MODE`);
      await tx.$executeRawUnsafe(`ALTER TABLE "osi"."commercial_audit_logs" DISABLE TRIGGER "commercial_audit_logs_append_only"`);
      await tx.$executeRawUnsafe(`ALTER TABLE "osi"."pipeline_case_commands" DISABLE TRIGGER "pipeline_case_commands_append_only"`);
      await tx.commercialAuditLog.deleteMany({ where: { source: "CRM_PIPELINE_DOMAIN", entityId: { startsWith: run } } });
      await tx.pipelineCaseCommand.deleteMany({ where: { pipelineCaseId: { startsWith: run } } });
      await tx.pipelineCaseQuote.deleteMany({ where: { caseId: { startsWith: run } } });
      await tx.survey.deleteMany({ where: { id: { startsWith: run } } });
      await tx.project.deleteMany({ where: { id: { startsWith: run } } });
      await tx.lead.deleteMany({ where: { id: { startsWith: run } } });
      await tx.pipelineCase.deleteMany({ where: { id: { startsWith: run } } });
      await tx.client.deleteMany({ where: { id: { startsWith: run } } });
      await tx.tenantMembership.deleteMany({ where: { id: { startsWith: run } } });
      await tx.user.deleteMany({ where: { id: { startsWith: run } } });
      await tx.tenant.deleteMany({ where: { id: { startsWith: run } } });
      await tx.$executeRawUnsafe(`ALTER TABLE "osi"."pipeline_case_commands" ENABLE TRIGGER "pipeline_case_commands_append_only"`);
      await tx.$executeRawUnsafe(`ALTER TABLE "osi"."commercial_audit_logs" ENABLE TRIGGER "commercial_audit_logs_append_only"`);
    });
  } catch (cleanupError) {
    process.stderr.write(`${JSON.stringify({ cleanup: "failed", code: cleanupError.code || null, message: cleanupError.message })}\n`);
    process.exitCode = 1;
  }
  await Promise.allSettled([prisma.$disconnect(), appPrisma.$disconnect()]);
  console.error = originalConsoleError;
}

if (!process.exitCode) process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, passed: results.length, failed: 0, results })}\n`);
