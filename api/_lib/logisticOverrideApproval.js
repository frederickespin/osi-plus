import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { appendCommercialAudit, sanitizeCommercialAuditJson } from "./commercialAuditLog.js";
import {
  APPROVAL_PERMISSIONS,
  createApprovalRequestInTransaction,
  decideApprovalRequestInTransaction,
  transitionApprovalRequestInTransaction,
  unwrapApprovalRequestTransactionResult,
} from "./approvalRequest.js";

export const LOGISTIC_OVERRIDE_PERMISSIONS = Object.freeze({
  REQUEST: "risk:override:request",
  DECIDE: "risk:override:decide",
  VIEW: "risk:override:view",
  CANCEL: "risk:override:cancel",
  EXPIRE: "risk:override:expire",
});

export class LogisticOverrideError extends Error {
  constructor(message, { code = "LOGISTIC_OVERRIDE_ERROR", status = 500, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "LogisticOverrideError";
    this.code = code;
    this.status = status;
  }
}

function requiredText(value, field, maxLength = 191) {
  const text = String(value ?? "").trim();
  if (!text || text.length > maxLength) {
    throw new LogisticOverrideError(`${field} es obligatorio.`, { code: "LOGISTIC_OVERRIDE_INPUT_INVALID", status: 400 });
  }
  return text;
}

function optionalText(value, field, maxLength = 191) {
  if (value == null || String(value).trim() === "") return null;
  return requiredText(value, field, maxLength);
}

function asDate(value, field) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new LogisticOverrideError(`${field} no es válida.`, { code: "LOGISTIC_OVERRIDE_INPUT_INVALID", status: 400 });
  return date;
}

function canonicalJson(value) {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function sha256(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function jsonParameter(value) {
  return JSON.stringify(value ?? null);
}

function auditContext(actor) {
  return actor.actorKind === "SYSTEM"
    ? { tenantId: actor.tenantId, actorKind: "SYSTEM" }
    : { tenantId: actor.tenantId, actorKind: "MEMBERSHIP", actorMembershipId: actor.membershipId };
}

async function resolveActor(db, context, permission, { allowSystem = false } = {}) {
  const tenantId = requiredText(context?.tenantId, "context.tenantId");
  if (String(context?.actorKind || "MEMBERSHIP").toUpperCase() === "SYSTEM") {
    if (!allowSystem) throw new LogisticOverrideError("La operación requiere membresía.", { code: "LOGISTIC_OVERRIDE_FORBIDDEN", status: 403 });
    return { tenantId, actorKind: "SYSTEM", userId: null, membershipId: null };
  }
  const membershipId = requiredText(context?.actorMembershipId, "context.actorMembershipId");
  const rows = await db.$queryRaw(Prisma.sql`
    SELECT m."id", m."tenant_id", m."user_id", m."status"::text AS "membership_status",
      m."granted_permissions", m."denied_permissions", u."status" AS "user_status"
    FROM "osi"."tenant_memberships" m
    JOIN "osi"."osi_users" u ON u."id" = m."user_id"
    WHERE m."tenant_id" = ${tenantId} AND m."id" = ${membershipId} LIMIT 1
  `);
  const row = rows[0];
  if (!row) throw new LogisticOverrideError("Recurso no encontrado.", { code: "LOGISTIC_OVERRIDE_NOT_FOUND", status: 404 });
  if (String(row.membership_status).toUpperCase() !== "ACTIVE" || String(row.user_status).toUpperCase() !== "ACTIVE") {
    throw new LogisticOverrideError("Actor inactivo.", { code: "LOGISTIC_OVERRIDE_FORBIDDEN", status: 403 });
  }
  const granted = new Set([...(context?.permissions || []), ...(row.granted_permissions || [])].map(String));
  const denied = new Set([...(context?.deniedPermissions || []), ...(row.denied_permissions || [])].map(String));
  if (!granted.has(permission) || denied.has(permission)) {
    throw new LogisticOverrideError("No tiene permiso para esta excepción.", { code: "LOGISTIC_OVERRIDE_FORBIDDEN", status: 403 });
  }
  return { tenantId, actorKind: "MEMBERSHIP", userId: row.user_id, membershipId: row.id };
}

function mapOverride(row) {
  if (!row) return null;
  return {
    id: row.id, tenantId: row.tenant_id, approvalRequestId: row.approval_request_id,
    riskEvaluationId: row.risk_evaluation_id, blockingRuleId: row.blocking_rule_id,
    entity: row.entity, entityId: row.entity_id, caseId: row.case_id, quoteId: row.quote_id,
    quoteVersion: row.quote_version, materialHash: row.material_hash,
    businessReason: row.business_reason, scope: row.scope_json, scopeHash: row.scope_hash,
    originalValue: row.original_value_json, authorizedValue: row.authorized_value_json,
    validFrom: row.valid_from, validTo: row.valid_to, conditions: row.conditions_json,
    evidence: row.evidence_json, references: row.references_json, decisionHash: row.decision_hash,
    approvalStatus: row.approval_status, decisionReason: row.decision_reason,
    deciderMembershipId: row.decider_membership_id, decidedAt: row.decided_at,
    approvalVersion: row.approval_version,
  };
}

async function findOverride(db, tenantId, id) {
  const rows = await db.$queryRaw(Prisma.sql`
    SELECT o.*, a."status"::text AS "approval_status", a."decision_reason",
      a."decider_membership_id", a."decided_at", a."version" AS "approval_version"
    FROM "osi"."logistic_override_approvals" o
    JOIN "osi"."approval_requests" a ON a."tenant_id" = o."tenant_id" AND a."id" = o."approval_request_id"
    WHERE o."tenant_id" = ${tenantId} AND o."id" = ${id} LIMIT 1
  `);
  return rows[0] || null;
}

export async function createLogisticOverrideRequest(prisma, context, input) {
  const riskEvaluationId = requiredText(input?.riskEvaluationId, "riskEvaluationId");
  const blockingRuleId = requiredText(input?.blockingRuleId, "blockingRuleId");
  const businessReason = requiredText(input?.businessReason, "businessReason", 10_000);
  const requestId = requiredText(input?.requestId, "requestId");
  const validFrom = asDate(input?.validFrom || new Date(), "validFrom");
  const validTo = asDate(input?.validTo, "validTo");
  if (validTo <= validFrom) throw new LogisticOverrideError("La vigencia es inválida.", { code: "LOGISTIC_OVERRIDE_INPUT_INVALID", status: 400 });
  const originalValue = sanitizeCommercialAuditJson(input?.originalValue || {});
  const authorizedValue = sanitizeCommercialAuditJson(input?.authorizedValue || {});
  const conditions = sanitizeCommercialAuditJson(input?.conditions || []);
  const evidence = sanitizeCommercialAuditJson(input?.evidence || []);
  const references = sanitizeCommercialAuditJson(input?.references || []);
  const requestedScope = sanitizeCommercialAuditJson(input?.scope || {});

  const result = await prisma.$transaction(async (tx) => {
    const actor = await resolveActor(tx, context, LOGISTIC_OVERRIDE_PERMISSIONS.REQUEST);
    const evaluations = await tx.$queryRaw(Prisma.sql`
      SELECT * FROM "osi"."risk_evaluations" WHERE "tenant_id" = ${actor.tenantId} AND "id" = ${riskEvaluationId} LIMIT 1
    `);
    const evaluation = evaluations[0];
    if (!evaluation) throw new LogisticOverrideError("Evaluación no encontrada.", { code: "LOGISTIC_OVERRIDE_NOT_FOUND", status: 404 });
    if (!new Set(["BLOCKED", "REVIEW_REQUIRED"]).has(String(evaluation.result))) {
      throw new LogisticOverrideError("Solo una evaluación bloqueada o en revisión admite excepción.", { code: "LOGISTIC_OVERRIDE_EVALUATION_INVALID", status: 409 });
    }
    const matches = await tx.$queryRaw(Prisma.sql`
      SELECT er.*, r."state"::text AS "rule_state" FROM "osi"."risk_evaluation_rules" er
      JOIN "osi"."risk_engine_rules" r ON r."tenant_id" = er."tenant_id" AND r."id" = er."rule_id"
      WHERE er."tenant_id" = ${actor.tenantId} AND er."evaluation_id" = ${riskEvaluationId}
        AND er."rule_id" = ${blockingRuleId} AND er."matched" = true AND er."result" IN ('BLOCKED', 'REVIEW_REQUIRED') LIMIT 1
    `);
    if (!matches[0]) throw new LogisticOverrideError("La regla no causó esta evaluación.", { code: "LOGISTIC_OVERRIDE_RULE_INVALID", status: 409 });
    const scope = {
      ...requestedScope,
      tenantId: actor.tenantId,
      entity: evaluation.entity,
      entityId: evaluation.entity_id,
      caseId: evaluation.case_id,
      quoteId: evaluation.quote_id,
      quoteVersion: evaluation.quote_version,
      materialHash: evaluation.material_hash,
      riskEvaluationId,
      blockingRuleId,
      factors: evaluation.factors_json,
    };
    const scopeHash = sha256(canonicalJson(scope));
    const approvalResult = await createApprovalRequestInTransaction(tx, context, {
      approvalType: "LOGISTIC_OVERRIDE",
      entity: evaluation.entity,
      entityId: evaluation.entity_id,
      requestReason: businessReason,
      evaluationSnapshot: { riskEvaluationId, result: evaluation.result, scopeHash },
      requestId,
      dueAt: validTo,
    }, {
      assignedApproverMembershipId: input?.assignedApproverMembershipId,
      separationOfDutiesRequired: true,
      policySnapshot: { source: "DB01F", exactScopeRequired: true },
    });
    if (approvalResult?.rejected) return approvalResult;
    const existing = await tx.$queryRaw(Prisma.sql`
      SELECT * FROM "osi"."logistic_override_approvals"
      WHERE "tenant_id" = ${actor.tenantId} AND "approval_request_id" = ${approvalResult.approval.id} LIMIT 1
    `);
    if (existing[0]) return { override: mapOverride(existing[0]), approval: approvalResult.approval, idempotent: true };
    const id = randomUUID();
    const rows = await tx.$queryRaw(Prisma.sql`
      INSERT INTO "osi"."logistic_override_approvals" (
        "id", "tenant_id", "approval_request_id", "risk_evaluation_id", "blocking_rule_id",
        "entity", "entity_id", "case_id", "quote_id", "quote_version", "material_hash", "business_reason",
        "scope_json", "scope_hash", "original_value_json", "authorized_value_json", "valid_from", "valid_to",
        "conditions_json", "evidence_json", "references_json"
      ) VALUES (
        ${id}, ${actor.tenantId}, ${approvalResult.approval.id}, ${riskEvaluationId}, ${blockingRuleId},
        ${evaluation.entity}, ${evaluation.entity_id}, ${evaluation.case_id}, ${evaluation.quote_id}, ${evaluation.quote_version},
        ${evaluation.material_hash}, ${businessReason}, CAST(${jsonParameter(scope)} AS jsonb), ${scopeHash},
        CAST(${jsonParameter(originalValue)} AS jsonb), CAST(${jsonParameter(authorizedValue)} AS jsonb),
        ${validFrom}, ${validTo}, CAST(${jsonParameter(conditions)} AS jsonb), CAST(${jsonParameter(evidence)} AS jsonb),
        CAST(${jsonParameter(references)} AS jsonb)
      ) RETURNING *
    `);
    await appendCommercialAudit(tx, auditContext(actor), {
      action: "LOGISTIC_OVERRIDE_REQUEST_CREATED", entity: "LOGISTIC_OVERRIDE_APPROVAL", entityId: id,
      source: "DB01F_LOGISTIC_OVERRIDE", requestId, critical: true,
      afterJson: { approvalRequestId: approvalResult.approval.id, riskEvaluationId, blockingRuleId, scopeHash },
    });
    return { override: mapOverride(rows[0]), approval: approvalResult.approval, idempotent: false };
  }, { isolationLevel: "Serializable" });
  return unwrapApprovalRequestTransactionResult(result);
}

export async function decideLogisticOverride(prisma, context, input) {
  const id = requiredText(input?.id, "id");
  const decision = requiredText(input?.decision, "decision", 20).toUpperCase();
  if (!new Set(["APPROVED", "REJECTED"]).has(decision)) throw new LogisticOverrideError("Decisión inválida.", { code: "LOGISTIC_OVERRIDE_INPUT_INVALID", status: 400 });
  const requestId = requiredText(input?.requestId, "requestId");
  const result = await prisma.$transaction(async (tx) => {
    const actor = await resolveActor(tx, context, LOGISTIC_OVERRIDE_PERMISSIONS.DECIDE);
    const current = await findOverride(tx, actor.tenantId, id);
    if (!current) throw new LogisticOverrideError("Excepción no encontrada.", { code: "LOGISTIC_OVERRIDE_NOT_FOUND", status: 404 });
    const approvalResult = await decideApprovalRequestInTransaction(tx, context, {
      id: current.approval_request_id,
      decision,
      reason: input?.reason,
      requestId,
      expectedVersion: input?.expectedVersion,
    });
    if (approvalResult?.rejected) return approvalResult;
    if (approvalResult.idempotent) {
      return { override: mapOverride(await findOverride(tx, actor.tenantId, id)), approval: approvalResult.approval, idempotent: true };
    }
    const decisionHash = sha256(canonicalJson({
      approvalRequestId: current.approval_request_id,
      decision,
      reason: input?.reason,
      scopeHash: current.scope_hash,
      materialHash: current.material_hash,
      deciderMembershipId: actor.membershipId,
    }));
    await tx.$executeRaw(Prisma.sql`
      UPDATE "osi"."logistic_override_approvals" SET "decision_hash" = COALESCE("decision_hash", ${decisionHash}),
        "updated_at" = CURRENT_TIMESTAMP WHERE "tenant_id" = ${actor.tenantId} AND "id" = ${id}
    `);
    await appendCommercialAudit(tx, auditContext(actor), {
      action: decision === "APPROVED" ? "LOGISTIC_OVERRIDE_APPROVED" : "LOGISTIC_OVERRIDE_REJECTED",
      entity: "LOGISTIC_OVERRIDE_APPROVAL", entityId: id, source: "DB01F_LOGISTIC_OVERRIDE",
      requestId, critical: true, beforeJson: { status: current.approval_status },
      afterJson: { status: decision, decisionHash },
    });
    return { override: mapOverride(await findOverride(tx, actor.tenantId, id)), approval: approvalResult.approval, idempotent: approvalResult.idempotent };
  }, { isolationLevel: "Serializable" });
  return unwrapApprovalRequestTransactionResult(result);
}

export async function transitionLogisticOverride(prisma, context, input, targetStatus) {
  const status = requiredText(targetStatus, "targetStatus", 20).toUpperCase();
  const configByStatus = {
    CANCELLED: { overridePermission: LOGISTIC_OVERRIDE_PERMISSIONS.CANCEL, approvalPermission: APPROVAL_PERMISSIONS.CANCEL, auditAction: "APPROVAL_REQUEST_CANCELLED" },
    EXPIRED: { overridePermission: LOGISTIC_OVERRIDE_PERMISSIONS.EXPIRE, approvalPermission: APPROVAL_PERMISSIONS.EXPIRE, auditAction: "APPROVAL_REQUEST_EXPIRED", allowSystem: true },
  };
  const config = configByStatus[status];
  if (!config) throw new LogisticOverrideError("Transición no soportada.", { code: "LOGISTIC_OVERRIDE_INPUT_INVALID", status: 400 });
  const result = await prisma.$transaction(async (tx) => {
    const actor = await resolveActor(tx, context, config.overridePermission, { allowSystem: config.allowSystem });
    const id = requiredText(input?.id, "id");
    const current = await findOverride(tx, actor.tenantId, id);
    if (!current) throw new LogisticOverrideError("Excepción no encontrada.", { code: "LOGISTIC_OVERRIDE_NOT_FOUND", status: 404 });
    const approvalResult = await transitionApprovalRequestInTransaction(tx, context, {
      id: current.approval_request_id, requestId: input?.requestId, reason: input?.reason,
      expectedVersion: input?.expectedVersion,
    }, {
      permission: config.approvalPermission, allowSystem: config.allowSystem, status,
      auditAction: config.auditAction, defaultReason: status === "EXPIRED" ? "Vencimiento programado" : undefined,
    });
    if (approvalResult?.rejected) return approvalResult;
    await appendCommercialAudit(tx, auditContext(actor), {
      action: `LOGISTIC_OVERRIDE_${status}`, entity: "LOGISTIC_OVERRIDE_APPROVAL", entityId: id,
      source: "DB01F_LOGISTIC_OVERRIDE", requestId: input?.requestId, critical: true,
      beforeJson: { status: current.approval_status }, afterJson: { status },
    });
    return { override: mapOverride(await findOverride(tx, actor.tenantId, id)), approval: approvalResult.approval };
  }, { isolationLevel: "Serializable" });
  return unwrapApprovalRequestTransactionResult(result);
}

export async function validateLogisticOverride(prisma, context, input) {
  const id = requiredText(input?.id, "id");
  const result = await prisma.$transaction(async (tx) => {
    const actor = await resolveActor(tx, context, LOGISTIC_OVERRIDE_PERMISSIONS.VIEW, { allowSystem: true });
    const row = await findOverride(tx, actor.tenantId, id);
    if (!row) throw new LogisticOverrideError("Excepción no encontrada.", { code: "LOGISTIC_OVERRIDE_NOT_FOUND", status: 404 });
    const expected = {
      entity: requiredText(input?.entity, "entity", 120).toUpperCase(),
      entityId: requiredText(input?.entityId, "entityId"),
      caseId: optionalText(input?.caseId, "caseId"),
      quoteId: optionalText(input?.quoteId, "quoteId"),
      quoteVersion: input?.quoteVersion == null ? null : Number(input.quoteVersion),
      materialHash: requiredText(input?.materialHash, "materialHash", 64),
    };
    const mismatch = row.entity !== expected.entity || row.entity_id !== expected.entityId ||
      row.case_id !== expected.caseId || row.quote_id !== expected.quoteId ||
      Number(row.quote_version ?? 0) !== Number(expected.quoteVersion ?? 0) || row.material_hash !== expected.materialHash;
    const expired = new Date(row.valid_to) <= new Date() || new Date(row.valid_from) > new Date();
    const valid = !mismatch && !expired && row.approval_status === "APPROVED" && Boolean(row.decision_hash);
    if (mismatch) {
      await appendCommercialAudit(tx, auditContext(actor), {
        action: "LOGISTIC_OVERRIDE_REUSE_ATTEMPT", entity: "LOGISTIC_OVERRIDE_APPROVAL", entityId: id,
        source: "DB01F_LOGISTIC_OVERRIDE", requestId: input?.requestId || randomUUID(), critical: true,
        metadataJson: { expected, stored: { entity: row.entity, entityId: row.entity_id, caseId: row.case_id, quoteId: row.quote_id, quoteVersion: row.quote_version, materialHash: row.material_hash } },
      });
    }
    return { valid, reason: mismatch ? "SCOPE_MISMATCH" : expired ? "EXPIRED" : row.approval_status !== "APPROVED" ? `STATUS_${row.approval_status}` : !row.decision_hash ? "DECISION_HASH_MISSING" : null, override: mapOverride(row) };
  });
  return result;
}
