import { createHash, randomInt, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { appendCommercialAudit } from "./commercialAuditLog.js";
import { PERMS, permsForRole } from "./rbac.js";

const SOURCE = "CRM_PIPELINE_DOMAIN";
const ENTITY = "PIPELINE_CASE";
const MAX_WAIT_MS = 3_000;
const TRANSACTION_TIMEOUT_MS = 10_000;
const LOCK_TIMEOUT_MS = 250;
const STATEMENT_TIMEOUT_MS = 3_000;
const RETRY_AFTER_MIN_MS = 75;
const RETRY_AFTER_MAX_MS = 175;
const TIME_POLICY = Object.freeze({
  maxWaitMs: MAX_WAIT_MS,
  transactionTimeoutMs: TRANSACTION_TIMEOUT_MS,
  lockTimeoutMs: LOCK_TIMEOUT_MS,
  statementTimeoutMs: STATEMENT_TIMEOUT_MS,
  retryAfterMinMs: RETRY_AFTER_MIN_MS,
  retryAfterMaxMs: RETRY_AFTER_MAX_MS,
});

for (const [name, value] of Object.entries(TIME_POLICY)) {
  if (!Number.isSafeInteger(value) || value < 1 || value >= 60_000) throw new Error(`CRM_PIPELINE_TIME_POLICY_INVALID:${name}`);
}
if (LOCK_TIMEOUT_MS >= STATEMENT_TIMEOUT_MS || STATEMENT_TIMEOUT_MS >= TRANSACTION_TIMEOUT_MS || RETRY_AFTER_MIN_MS > RETRY_AFTER_MAX_MS) {
  throw new Error("CRM_PIPELINE_TIME_POLICY_INVALID:ordering");
}

const STATUS = Object.freeze([
  "NEW_INBOX", "AWAITING_ICP", "GOVERNANCE_CONFIRMED", "REQUIREMENTS_CONFIRMED",
  "SURVEY_PLANNING", "SURVEY_SCHEDULED", "SURVEY_COMPLETED", "CRATING_ESTIMATE_PENDING",
  "PRICING_IN_PROGRESS", "QUOTE_DRAFT", "INTERNAL_REVIEW", "QUOTE_SENT", "NEGOTIATION",
  "CHANGE_CONTROL", "WON", "LOST", "APPROVED", "OPS_HANDOFF",
]);
const TRANSITIONS = Object.freeze({
  NEW_INBOX: Object.freeze(["AWAITING_ICP"]),
  AWAITING_ICP: Object.freeze(["GOVERNANCE_CONFIRMED"]),
  GOVERNANCE_CONFIRMED: Object.freeze(["REQUIREMENTS_CONFIRMED"]),
  REQUIREMENTS_CONFIRMED: Object.freeze(["SURVEY_PLANNING", "CRATING_ESTIMATE_PENDING", "PRICING_IN_PROGRESS"]),
  SURVEY_PLANNING: Object.freeze(["SURVEY_SCHEDULED"]),
  SURVEY_SCHEDULED: Object.freeze(["SURVEY_COMPLETED"]),
  SURVEY_COMPLETED: Object.freeze(["CRATING_ESTIMATE_PENDING", "PRICING_IN_PROGRESS"]),
  CRATING_ESTIMATE_PENDING: Object.freeze(["PRICING_IN_PROGRESS"]),
  PRICING_IN_PROGRESS: Object.freeze(["QUOTE_DRAFT"]),
  QUOTE_DRAFT: Object.freeze(["INTERNAL_REVIEW"]),
  INTERNAL_REVIEW: Object.freeze(["QUOTE_SENT"]),
  QUOTE_SENT: Object.freeze(["NEGOTIATION", "WON", "LOST"]),
  NEGOTIATION: Object.freeze(["CHANGE_CONTROL", "WON", "LOST"]),
  CHANGE_CONTROL: Object.freeze(["QUOTE_DRAFT", "NEGOTIATION"]),
  WON: Object.freeze(["OPS_HANDOFF"]),
  LOST: Object.freeze(["NEW_INBOX"]),
  APPROVED: Object.freeze([]),
  OPS_HANDOFF: Object.freeze([]),
});
const LOSS_REASONS = new Set(["PRICE", "COMPETITOR", "NO_RESPONSE", "CLIENT_CANCELLED", "TIMING", "SERVICE_UNAVAILABLE", "DUPLICATE", "OTHER"]);
const REOPEN_REASONS = new Set(["MANUAL_REVIEW", "CLIENT_REENGAGED", "DATA_CORRECTION", "OTHER"]);
const AUTHORITY_FIELDS = new Set(["tenantId", "ownerUserId", "actorUserId", "role", "permissions", "resultingVersion", "payloadHash", "createdAt", "updatedAt", "statusChangedAt"]);
const EVIDENCE_POLICY = Object.freeze({
  SURVEY_SCHEDULED: Object.freeze({ type: "SURVEY", supported: false }),
  SURVEY_COMPLETED: Object.freeze({ type: "SURVEY", supported: true }),
  QUOTE_DRAFT: Object.freeze({ type: "QUOTE", supported: true }),
  QUOTE_SENT: Object.freeze({ type: "QUOTE", supported: true }),
  WON: Object.freeze({ type: "APPROVAL", supported: false }),
  OPS_HANDOFF: Object.freeze({ type: "PROJECT", supported: true }),
});

class PipelineCaseDomainError extends Error {
  constructor(code, status, message = "La operación CRM no pudo completarse.", { recoverable = false, retryAfterMs } = {}) {
    super(message);
    this.name = "PipelineCaseDomainError";
    this.code = code;
    this.status = status;
    this.recoverable = recoverable;
    if (Number.isSafeInteger(retryAfterMs)) this.retryAfterMs = retryAfterMs;
  }
}
function fail(code, status, message, options) { throw new PipelineCaseDomainError(code, status, message, options); }
function requiredText(value, field, max = 191) {
  if (typeof value !== "string" || value.length < 1 || value.length > max || value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value)) {
    fail("CRM_PIPELINE_COMMAND_INVALID", 400, `${field} no es válido.`);
  }
  return value;
}
function normalizedRequestId(value) {
  const result = requiredText(value, "requestId", 191);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,190}$/.test(result)) fail("CRM_PIPELINE_COMMAND_INVALID", 400, "requestId no es canónico.");
  return result;
}
function expectedVersion(value) {
  if (!Number.isSafeInteger(value) || value < 1) fail("CRM_PIPELINE_COMMAND_INVALID", 400, "expectedVersion no es válido.");
  return value;
}
function exactKeys(input, allowed) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("CRM_PIPELINE_COMMAND_INVALID", 400, "El comando debe ser un objeto.");
  for (const key of Object.keys(input)) {
    if (AUTHORITY_FIELDS.has(key) || !allowed.has(key)) fail("CRM_PIPELINE_COMMAND_INVALID", 400, "El comando contiene campos no autorizados.");
  }
}
function normalizeEvidence(value) {
  if (value == null) return null;
  exactKeys(value, new Set(["type", "id"]));
  const type = requiredText(value.type, "evidence.type", 32);
  if (!["SURVEY", "QUOTE", "PROJECT", "APPROVAL", "ADDENDUM"].includes(type)) fail("CRM_PIPELINE_COMMAND_INVALID", 400, "El tipo de evidencia no es válido.");
  return Object.freeze({ type, id: requiredText(value.id, "evidence.id") });
}
function normalizeTransition(input) {
  exactKeys(input, new Set(["caseId", "expectedVersion", "requestId", "toStatus", "reasonCode", "evidence"]));
  const toStatus = requiredText(input.toStatus, "toStatus", 64);
  if (!STATUS.includes(toStatus)) fail("CRM_PIPELINE_COMMAND_INVALID", 400, "toStatus no es válido.");
  const reasonCode = input.reasonCode == null ? null : requiredText(input.reasonCode, "reasonCode", 64);
  if (reasonCode && !/^[A-Z][A-Z0-9_]{1,63}$/.test(reasonCode)) fail("CRM_PIPELINE_COMMAND_INVALID", 400, "reasonCode no es canónico.");
  return Object.freeze({ operation: "TRANSITION", caseId: requiredText(input.caseId, "caseId"), expectedVersion: expectedVersion(input.expectedVersion), requestId: normalizedRequestId(input.requestId), toStatus, reasonCode, evidence: normalizeEvidence(input.evidence) });
}
function normalizeAssignment(input) {
  exactKeys(input, new Set(["caseId", "expectedVersion", "requestId", "ownerMembershipId"]));
  return Object.freeze({ operation: "ASSIGN_OWNER", caseId: requiredText(input.caseId, "caseId"), expectedVersion: expectedVersion(input.expectedVersion), requestId: normalizedRequestId(input.requestId), ownerMembershipId: requiredText(input.ownerMembershipId, "ownerMembershipId") });
}
function normalizeUnassignment(input) {
  exactKeys(input, new Set(["caseId", "expectedVersion", "requestId"]));
  return Object.freeze({ operation: "UNASSIGN_OWNER", caseId: requiredText(input.caseId, "caseId"), expectedVersion: expectedVersion(input.expectedVersion), requestId: normalizedRequestId(input.requestId) });
}
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}
function payloadShape(command) {
  if (command.operation === "TRANSITION") return { caseId: command.caseId, expectedVersion: command.expectedVersion, requestId: command.requestId, toStatus: command.toStatus, reasonCode: command.reasonCode, evidence: command.evidence && { type: command.evidence.type, id: command.evidence.id } };
  if (command.operation === "ASSIGN_OWNER") return { caseId: command.caseId, expectedVersion: command.expectedVersion, requestId: command.requestId, ownerMembershipId: command.ownerMembershipId };
  return { caseId: command.caseId, expectedVersion: command.expectedVersion, requestId: command.requestId };
}
function payloadHash(command) { return createHash("sha256").update(canonical(payloadShape(command)), "utf8").digest("hex"); }
function contextTenantId(context) { return requiredText(context?.tenantId, "context.tenantId"); }
function contextMembershipId(context) { return requiredText(context?.membershipId || context?.actorMembershipId, "context.membershipId"); }

function retryAfterMs() { return randomInt(RETRY_AFTER_MIN_MS, RETRY_AFTER_MAX_MS + 1); }
async function setTransactionLimits(tx) {
  await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT_MS}ms'`);
  await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT_MS}ms'`);
}
async function advisoryLock(tx, namespace, tenantId, value) {
  const key = `CRM-01B2:${namespace}:${tenantId}:${value}`;
  const rows = await tx.$queryRaw(Prisma.sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${key}, 0)) AS "locked"`);
  if (rows[0]?.locked !== true) {
    fail("CRM_PIPELINE_COMMAND_IN_PROGRESS", 409, "Otro comando CRM está en curso.", { recoverable: true, retryAfterMs: retryAfterMs() });
  }
}
async function resolveActor(tx, context, requiredPermission) {
  const tenantId = contextTenantId(context);
  const membershipId = contextMembershipId(context);
  const rows = await tx.$queryRaw(Prisma.sql`
    SELECT m."id", m."tenant_id", m."user_id", m."role"::text AS "role", m."status"::text AS "membership_status",
      m."granted_permissions", m."denied_permissions", u."status" AS "user_status", t."status"::text AS "tenant_status"
    FROM "osi"."tenant_memberships" m JOIN "osi"."osi_users" u ON u."id"=m."user_id"
    JOIN "osi"."tenants" t ON t."id"=m."tenant_id"
    WHERE m."tenant_id"=${tenantId} AND m."id"=${membershipId} LIMIT 1
  `);
  const row = rows[0];
  if (!row) fail("CRM_PIPELINE_RESOURCE_NOT_FOUND", 404, "Recurso no encontrado.");
  if (String(row.user_status).toLowerCase() !== "active" || row.membership_status !== "ACTIVE" || row.tenant_status !== "ACTIVE") fail("CRM_PIPELINE_PERMISSION_FORBIDDEN", 403, "La identidad empresarial no está activa.");
  const role = String(row.role).toUpperCase();
  const denied = new Set((row.denied_permissions || []).map(String));
  const effective = new Set([...permsForRole(role), ...(row.granted_permissions || []).map(String)].filter((permission) => !denied.has(permission)));
  if (denied.has(requiredPermission) || !effective.has(requiredPermission)) fail("CRM_PIPELINE_PERMISSION_FORBIDDEN", 403, "Permiso empresarial insuficiente.");
  return Object.freeze({ tenantId, membershipId: row.id, userId: row.user_id, role });
}
async function findPriorCommand(tx, tenantId, requestId) {
  const rows = await tx.$queryRaw(Prisma.sql`SELECT * FROM "osi"."pipeline_case_commands" WHERE "tenant_id"=${tenantId} AND "request_id"=${requestId} LIMIT 1`);
  return rows[0] || null;
}
async function findCase(tx, tenantId, caseId, forUpdate = true) {
  const suffix = forUpdate ? Prisma.sql`FOR UPDATE` : Prisma.empty;
  const rows = await tx.$queryRaw(Prisma.sql`
    SELECT "id", "tenant_id", "status"::text AS "status", "version", "status_changed_at", "loss_reason_code",
      "owner_membership_id", "owner_user_id", "ownerId"
    FROM "osi"."osi_pipeline_cases" WHERE "tenant_id"=${tenantId} AND "id"=${caseId} LIMIT 1 ${suffix}
  `);
  return rows[0] || null;
}
function evidencePolicy(fromStatus, toStatus) {
  return EVIDENCE_POLICY[toStatus] || null;
}
async function evidenceRow(tx, tenantId, caseId, evidence, fromStatus, targetStatus) {
  const policy = evidencePolicy(fromStatus, targetStatus);
  if (!policy?.supported) return null;
  if (policy.type === "SURVEY") {
    const rows = await tx.$queryRaw(Prisma.sql`
      SELECT s."id" FROM "osi"."osi_surveys" s JOIN "osi"."osi_projects" p ON p."id"=s."projectId"
      WHERE p."tenant_id"=${tenantId} AND p."pipeline_case_id"=${caseId} AND s."status"='SUBMITTED'
        AND s."submittedAt" IS NOT NULL AND (${evidence?.id || null}::text IS NULL OR s."id"=${evidence?.id || null}) LIMIT 1
    `);
    return rows[0] || null;
  }
  if (policy.type === "QUOTE") {
    const quoteStatus = targetStatus === "QUOTE_SENT" ? "SENT" : "DRAFT";
    const rows = await tx.$queryRaw(Prisma.sql`
      SELECT e."id" FROM "osi"."osi_pipeline_case_quotes" e JOIN "osi"."osi_pipeline_cases" c ON c."id"=e."caseId"
      WHERE c."tenant_id"=${tenantId} AND c."id"=${caseId} AND e."status"=${quoteStatus}
        AND (${targetStatus} <> 'QUOTE_SENT' OR e."sentAt" IS NOT NULL)
        AND (${evidence?.id || null}::text IS NULL OR e."id"=${evidence?.id || null}) LIMIT 1
    `);
    return rows[0] || null;
  }
  if (policy.type === "PROJECT") {
    const rows = await tx.$queryRaw(Prisma.sql`SELECT e."id" FROM "osi"."osi_projects" e WHERE e."tenant_id"=${tenantId} AND e."pipeline_case_id"=${caseId} AND (${evidence?.id || null}::text IS NULL OR e."id"=${evidence?.id || null}) LIMIT 1`);
    return rows[0] || null;
  }
  if (policy.type === "ADDENDUM") {
    const rows = await tx.$queryRaw(Prisma.sql`SELECT e."id" FROM "osi"."quote_change_orders" e WHERE e."tenant_id"=${tenantId} AND e."pipeline_case_id"=${caseId} AND e."status" IN ('APPROVED','ACCEPTED','EXECUTED') AND (${evidence?.id || null}::text IS NULL OR e."id"=${evidence?.id || null}) LIMIT 1`);
    return rows[0] || null;
  }
  return null;
}
async function validateEvidence(tx, pipelineCase, command) {
  const policy = evidencePolicy(pipelineCase.status, command.toStatus);
  if (!policy) {
    if (command.evidence) fail("CRM_PIPELINE_COMMAND_INVALID", 400, "La transición no admite evidencia.");
    return;
  }
  if (!policy.supported) fail("CRM_PIPELINE_EVIDENCE_REQUIRED", 409, "La evidencia requerida aún no puede demostrarse.");
  if (!command.evidence) fail("CRM_PIPELINE_EVIDENCE_REQUIRED", 409, "La transición requiere evidencia.");
  if (command.evidence.type !== policy.type) fail("CRM_PIPELINE_EVIDENCE_INVALID", 409, "Tipo de evidencia incompatible.");
  if (!(await evidenceRow(tx, pipelineCase.tenant_id, pipelineCase.id, command.evidence, pipelineCase.status, command.toStatus))) fail("CRM_PIPELINE_EVIDENCE_INVALID", 409, "La evidencia no pertenece al caso y tenant requeridos.");
}
function requireOwnedCase(actor, pipelineCase) {
  if (actor.role === "A") return;
  if (actor.role !== "V" || pipelineCase.owner_membership_id !== actor.membershipId || pipelineCase.owner_user_id !== actor.userId) fail("CRM_PIPELINE_PERMISSION_FORBIDDEN", 403, "El caso no está asignado al actor.");
}
function typedCommandMatches(row, actor, command, hash) {
  if (row.tenant_id !== actor.tenantId || row.actor_membership_id !== actor.membershipId || row.actor_user_id !== actor.userId || row.actor_role !== actor.role
    || row.pipeline_case_id !== command.caseId || Number(row.expected_version) !== command.expectedVersion
    || Number(row.resulting_version) !== command.expectedVersion + 1 || row.payload_hash !== hash) return false;
  if (command.operation === "TRANSITION") {
    const expectedType = row.previous_status === "LOST" && command.toStatus === "NEW_INBOX" ? "REOPEN" : "TRANSITION";
    return row.command_type === expectedType && row.resulting_status === command.toStatus && (row.reason_code || null) === command.reasonCode
      && row.previous_owner_membership_id === row.resulting_owner_membership_id
      && row.previous_owner_user_id === row.resulting_owner_user_id
      && (row.evidence_type || null) === (command.evidence?.type || null) && (row.evidence_id || null) === (command.evidence?.id || null);
  }
  if (command.operation === "ASSIGN_OWNER") {
    return row.command_type === "ASSIGN_OWNER" && row.previous_status === row.resulting_status
      && row.resulting_owner_membership_id === command.ownerMembershipId && typeof row.resulting_owner_user_id === "string";
  }
  return row.command_type === "UNASSIGN_OWNER" && row.previous_status === row.resulting_status
    && typeof row.previous_owner_membership_id === "string" && typeof row.previous_owner_user_id === "string"
    && row.resulting_owner_membership_id === null && row.resulting_owner_user_id === null;
}
function receipt(row, replayed) {
  return Object.freeze({ commandId: row.id, requestId: row.request_id, caseId: row.pipeline_case_id, commandType: row.command_type,
    previousVersion: Number(row.expected_version), resultingVersion: Number(row.resulting_version), previousStatus: row.previous_status,
    resultingStatus: row.resulting_status, previousOwnerMembershipId: row.previous_owner_membership_id,
    resultingOwnerMembershipId: row.resulting_owner_membership_id, reasonCode: row.reason_code,
    evidence: row.evidence_type ? Object.freeze({ type: row.evidence_type, id: row.evidence_id }) : null,
    committedAt: row.created_at, replayed });
}
async function resolveIdempotency(tx, actor, command, hash) {
  const prior = await findPriorCommand(tx, actor.tenantId, command.requestId);
  if (!prior) return null;
  if (!typedCommandMatches(prior, actor, command, hash)) fail("CRM_PIPELINE_IDEMPOTENCY_CONFLICT", 409, "requestId ya fue usado con otro comando.");
  return receipt(prior, true);
}

function postgresCode(error) {
  return [error?.meta?.code, error?.cause?.code, error?.code].find((value) => typeof value === "string") || null;
}
function sanitizedDatabaseError(error) {
  const code = postgresCode(error);
  if (code === "55P03") return new PipelineCaseDomainError("CRM_PIPELINE_COMMAND_IN_PROGRESS", 409, "Otro comando CRM está en curso.", { recoverable: true, retryAfterMs: retryAfterMs() });
  if (code === "57014") return new PipelineCaseDomainError("CRM_PIPELINE_DATABASE_UNAVAILABLE", 503, "Servicio CRM temporalmente no disponible.", { recoverable: true });
  if (["23503", "23505", "23514", "23P01", "P0001"].includes(code)) return new PipelineCaseDomainError("CRM_PIPELINE_STATE_INVALID", 409, "El estado CRM no es coherente.");
  return new PipelineCaseDomainError("CRM_PIPELINE_DATABASE_UNAVAILABLE", 503, "Servicio CRM temporalmente no disponible.", { recoverable: true });
}
function assertTransition(actor, pipelineCase, command) {
  requireOwnedCase(actor, pipelineCase);
  if (pipelineCase.status === "APPROVED" || pipelineCase.status === "OPS_HANDOFF") fail("CRM_PIPELINE_STATE_INVALID", 409, "El estado actual está congelado.");
  if (!(TRANSITIONS[pipelineCase.status] || []).includes(command.toStatus)) fail("CRM_PIPELINE_STATE_INVALID", 409, "La transición no pertenece al grafo autorizado.");
  if (pipelineCase.status === "LOST") {
    if (actor.role !== "A") fail("CRM_PIPELINE_PERMISSION_FORBIDDEN", 403, "Sólo A puede reabrir LOST.");
    if (!REOPEN_REASONS.has(command.reasonCode)) fail("CRM_PIPELINE_COMMAND_INVALID", 400, "Motivo de reapertura inválido.");
  } else if (command.toStatus === "LOST") {
    if (!LOSS_REASONS.has(command.reasonCode)) fail("CRM_PIPELINE_COMMAND_INVALID", 400, "Motivo de pérdida inválido.");
  } else if (command.reasonCode !== null) fail("CRM_PIPELINE_COMMAND_INVALID", 400, "La transición no admite reasonCode.");
}
async function resolveOwner(tx, actor, membershipId) {
  const rows = await tx.$queryRaw(Prisma.sql`
    SELECT m."id", m."user_id", m."role"::text AS "role", m."status"::text AS "membership_status", u."status" AS "user_status"
    FROM "osi"."tenant_memberships" m JOIN "osi"."osi_users" u ON u."id"=m."user_id"
    WHERE m."tenant_id"=${actor.tenantId} AND m."id"=${membershipId} LIMIT 1 FOR KEY SHARE OF m, u
  `);
  const row = rows[0];
  if (!row || row.role !== "V" || row.membership_status !== "ACTIVE" || String(row.user_status).toLowerCase() !== "active") fail("CRM_PIPELINE_OWNER_INELIGIBLE", 409, "El owner no es elegible.");
  return Object.freeze({ membershipId: row.id, userId: row.user_id });
}
function auditAction(commandType, previousOwner) {
  if (commandType === "REOPEN") return "CRM_PIPELINE_REOPENED";
  if (commandType === "TRANSITION") return "CRM_PIPELINE_TRANSITIONED";
  if (commandType === "UNASSIGN_OWNER") return "CRM_PIPELINE_OWNER_UNASSIGNED";
  return previousOwner ? "CRM_PIPELINE_OWNER_REASSIGNED" : "CRM_PIPELINE_OWNER_ASSIGNED";
}
async function appendAudit(tx, actor, row) {
  await appendCommercialAudit(tx, { tenantId: actor.tenantId, actorKind: "MEMBERSHIP", actorMembershipId: actor.membershipId }, {
    source: SOURCE, critical: true, action: auditAction(row.command_type, row.previous_owner_membership_id), entity: ENTITY,
    entityId: row.pipeline_case_id, requestId: row.request_id, correlationId: row.request_id,
    beforeJson: { version: Number(row.expected_version), status: row.previous_status, ownerMembershipId: row.previous_owner_membership_id },
    afterJson: { version: Number(row.resulting_version), status: row.resulting_status, ownerMembershipId: row.resulting_owner_membership_id },
    metadataJson: { commandType: row.command_type, actorMembershipId: row.actor_membership_id, evidenceType: row.evidence_type, evidenceId: row.evidence_id, reasonCode: row.reason_code },
  });
}
async function insertJournal(tx, actor, pipelineCase, command, commandType, hash, owner, now) {
  const resultingStatus = command.operation === "TRANSITION" ? command.toStatus : pipelineCase.status;
  const resultingOwner = commandType === "UNASSIGN_OWNER" ? { membershipId: null, userId: null } : owner || { membershipId: pipelineCase.owner_membership_id, userId: pipelineCase.owner_user_id };
  const rows = await tx.$queryRaw(Prisma.sql`
    INSERT INTO "osi"."pipeline_case_commands" ("id","tenant_id","pipeline_case_id","request_id","command_type","payload_hash","expected_version","resulting_version","previous_status","resulting_status","previous_owner_membership_id","previous_owner_user_id","resulting_owner_membership_id","resulting_owner_user_id","actor_membership_id","actor_user_id","actor_role","reason_code","evidence_type","evidence_id","created_at")
    VALUES (${randomUUID()},${actor.tenantId},${pipelineCase.id},${command.requestId},CAST(${commandType} AS "osi"."PipelineCaseCommandType"),${hash},${command.expectedVersion},${command.expectedVersion + 1},CAST(${pipelineCase.status} AS "osi"."PipelineCaseStatus"),CAST(${resultingStatus} AS "osi"."PipelineCaseStatus"),${pipelineCase.owner_membership_id},${pipelineCase.owner_user_id},${resultingOwner.membershipId},${resultingOwner.userId},${actor.membershipId},${actor.userId},${actor.role},${command.reasonCode || null},CAST(${command.evidence?.type || null} AS "osi"."PipelineCaseEvidenceType"),${command.evidence?.id || null},${now}) RETURNING *
  `);
  return rows[0];
}
async function execute(context, input, permission) {
  const tenantId = contextTenantId(context);
  const hash = payloadHash(input);
  try {
    return await prisma.$transaction(async (tx) => {
      await setTransactionLimits(tx);
      await advisoryLock(tx, "REQUEST", tenantId, input.requestId);
      await advisoryLock(tx, "CASE", tenantId, input.caseId);
      const actor = await resolveActor(tx, context, permission);
      const replay = await resolveIdempotency(tx, actor, input, hash);
      if (replay) return replay;
      const pipelineCase = await findCase(tx, actor.tenantId, input.caseId, true);
      if (!pipelineCase) fail("CRM_PIPELINE_RESOURCE_NOT_FOUND", 404, "Recurso no encontrado.");
      if (Number(pipelineCase.version) !== input.expectedVersion) fail("CRM_PIPELINE_VERSION_CONFLICT", 409, "La versión esperada ya no está vigente.", { recoverable: true });
      let commandType = input.operation;
      let owner = null;
      if (input.operation === "TRANSITION") {
        assertTransition(actor, pipelineCase, input);
        await validateEvidence(tx, pipelineCase, input);
        if (pipelineCase.status === "LOST") commandType = "REOPEN";
      } else {
        if (actor.role !== "A") fail("CRM_PIPELINE_PERMISSION_FORBIDDEN", 403, "Sólo A puede administrar owners.");
        if (["APPROVED", "OPS_HANDOFF"].includes(pipelineCase.status)) fail("CRM_PIPELINE_STATE_INVALID", 409, "El caso no admite cambios de owner.");
        if (input.operation === "ASSIGN_OWNER") {
          owner = await resolveOwner(tx, actor, input.ownerMembershipId);
          if (owner.membershipId === pipelineCase.owner_membership_id) fail("CRM_PIPELINE_OWNER_INELIGIBLE", 409, "El owner nuevo debe ser diferente.");
        } else if (!pipelineCase.owner_membership_id || !pipelineCase.owner_user_id) fail("CRM_PIPELINE_OWNER_INELIGIBLE", 409, "El caso no tiene owner completo.");
      }
      const [clock] = await tx.$queryRaw(Prisma.sql`SELECT transaction_timestamp() AS "now"`);
      const now = clock.now;
      const resultingOwner = commandType === "UNASSIGN_OWNER" ? { membershipId: null, userId: null } : owner || { membershipId: pipelineCase.owner_membership_id, userId: pipelineCase.owner_user_id };
      const resultingStatus = input.operation === "TRANSITION" ? input.toStatus : pipelineCase.status;
      const changedAt = input.operation === "TRANSITION" ? now : pipelineCase.status_changed_at;
      const lossReason = resultingStatus === "LOST" ? input.reasonCode : null;
      const updated = await tx.$queryRaw(Prisma.sql`
        UPDATE "osi"."osi_pipeline_cases" SET "version"="version"+1,"status"=CAST(${resultingStatus} AS "osi"."PipelineCaseStatus"),"status_changed_at"=${changedAt},"loss_reason_code"=${lossReason},"owner_membership_id"=${resultingOwner.membershipId},"owner_user_id"=${resultingOwner.userId},"updatedAt"=${now}
        WHERE "tenant_id"=${actor.tenantId} AND "id"=${pipelineCase.id} AND "version"=${input.expectedVersion} RETURNING "id"
      `);
      if (updated.length !== 1) fail("CRM_PIPELINE_VERSION_CONFLICT", 409, "La versión esperada ya no está vigente.", { recoverable: true });
      const journal = await insertJournal(tx, actor, pipelineCase, input, commandType, hash, owner, now);
      await appendAudit(tx, actor, journal);
      return receipt(journal, false);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: MAX_WAIT_MS, timeout: TRANSACTION_TIMEOUT_MS });
  } catch (error) {
    if (error instanceof PipelineCaseDomainError) throw error;
    throw sanitizedDatabaseError(error);
  }
}

export async function transitionPipelineCase(context, command) { return execute(context, normalizeTransition(command), PERMS.PIPELINE_TRANSITION); }
export async function assignPipelineCaseOwner(context, command) { return execute(context, normalizeAssignment(command), PERMS.PIPELINE_ASSIGN); }
export async function unassignPipelineCaseOwner(context, command) { return execute(context, normalizeUnassignment(command), PERMS.PIPELINE_ASSIGN); }
export async function getAllowedPipelineTransitions(context, caseId) {
  const normalizedCaseId = requiredText(caseId, "caseId");
  try {
    return await prisma.$transaction(async (tx) => {
      await setTransactionLimits(tx);
      const actor = await resolveActor(tx, context, PERMS.PIPELINE_TRANSITION);
      const pipelineCase = await findCase(tx, actor.tenantId, normalizedCaseId, false);
      if (!pipelineCase) fail("CRM_PIPELINE_RESOURCE_NOT_FOUND", 404, "Recurso no encontrado.");
      requireOwnedCase(actor, pipelineCase);
      if (["APPROVED", "OPS_HANDOFF"].includes(pipelineCase.status)) return Object.freeze({ caseId: pipelineCase.id, version: Number(pipelineCase.version), status: pipelineCase.status, transitions: Object.freeze([]) });
      const transitions = [];
      for (const toStatus of TRANSITIONS[pipelineCase.status] || []) {
        if (pipelineCase.status === "LOST" && actor.role !== "A") continue;
        const policy = evidencePolicy(pipelineCase.status, toStatus);
        if (policy && (!policy.supported || !(await evidenceRow(tx, actor.tenantId, pipelineCase.id, null, pipelineCase.status, toStatus)))) continue;
        transitions.push(Object.freeze({ toStatus, evidenceType: policy?.type || null }));
      }
      return Object.freeze({ caseId: pipelineCase.id, version: Number(pipelineCase.version), status: pipelineCase.status, transitions: Object.freeze(transitions) });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: MAX_WAIT_MS, timeout: TRANSACTION_TIMEOUT_MS });
  } catch (error) {
    if (error instanceof PipelineCaseDomainError) throw error;
    throw sanitizedDatabaseError(error);
  }
}
