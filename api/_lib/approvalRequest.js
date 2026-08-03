import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { appendCommercialAudit, sanitizeCommercialAuditJson } from "./commercialAuditLog.js";

export const APPROVAL_PERMISSIONS = Object.freeze({
  CREATE: "approval:request:create",
  VIEW: "approval:request:view",
  DECIDE: "approval:request:decide",
  CANCEL: "approval:request:cancel",
  REASSIGN: "approval:request:reassign",
  ASSIGN_ON_CREATE: "approval:request:assign",
  EXPIRE: "approval:request:expire",
});

export const APPROVAL_STATUSES = Object.freeze([
  "PENDING", "APPROVED", "REJECTED", "CANCELLED", "EXPIRED",
]);
export const TERMINAL_APPROVAL_STATUSES = new Set(APPROVAL_STATUSES.slice(1));
export const APPROVAL_RISK_RESULTS = Object.freeze(["PASS", "REVIEW_REQUIRED", "BLOCKED"]);

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;

export class ApprovalRequestError extends Error {
  constructor(message, { code = "APPROVAL_REQUEST_ERROR", status = 500, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "ApprovalRequestError";
    this.code = code;
    this.status = status;
  }
}

function requiredText(value, field, maxLength = 191) {
  const text = String(value ?? "").trim();
  if (!text) throw new ApprovalRequestError(`${field} es obligatorio.`, { code: "APPROVAL_INPUT_INVALID", status: 400 });
  if (text.length > maxLength) {
    throw new ApprovalRequestError(`${field} excede ${maxLength} caracteres.`, { code: "APPROVAL_INPUT_INVALID", status: 400 });
  }
  return text;
}

function optionalText(value, field, maxLength = 191) {
  if (value == null || String(value).trim() === "") return null;
  return requiredText(value, field, maxLength);
}

function canonicalJson(value) {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function jsonParameter(value) {
  return JSON.stringify(value ?? null);
}

function asDate(value, field, { optional = false } = {}) {
  if (optional && (value == null || value === "")) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new ApprovalRequestError(`${field} no es una fecha válida.`, { code: "APPROVAL_INPUT_INVALID", status: 400 });
  }
  return date;
}

function normalizeCode(value, field, maxLength) {
  return requiredText(value, field, maxLength).toUpperCase();
}

export function normalizeApprovalRiskEvaluation(input) {
  if (input == null) return {
    level: null,
    reference: null,
    result: null,
    rulesVersion: null,
    rulesHash: null,
    factors: null,
    reasons: null,
    requiresLogisticOverrideApproval: false,
  };
  const result = normalizeCode(input.result, "riskEvaluation.result", 40);
  if (!APPROVAL_RISK_RESULTS.includes(result)) {
    throw new ApprovalRequestError("Resultado de riesgo no soportado.", { code: "APPROVAL_RISK_INVALID", status: 400 });
  }
  const rulesHash = optionalText(input.rulesHash, "riskEvaluation.rulesHash", 64)?.toLowerCase() || null;
  if (rulesHash && !/^[0-9a-f]{64}$/.test(rulesHash)) {
    throw new ApprovalRequestError("riskEvaluation.rulesHash debe ser SHA-256 hexadecimal.", {
      code: "APPROVAL_RISK_INVALID", status: 400,
    });
  }
  return {
    level: optionalText(input.level, "riskEvaluation.level", 40),
    reference: optionalText(input.reference, "riskEvaluation.reference", 191),
    result,
    rulesVersion: optionalText(input.rulesVersion, "riskEvaluation.rulesVersion", 120),
    rulesHash,
    factors: sanitizeCommercialAuditJson(Array.isArray(input.factors) ? input.factors : []),
    reasons: sanitizeCommercialAuditJson(Array.isArray(input.reasons) ? input.reasons : []),
    requiresLogisticOverrideApproval: result === "BLOCKED" || input.requiresLogisticOverrideApproval === true,
  };
}

function mapApprovalRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    approvalType: row.approval_type,
    entity: row.entity,
    entityId: row.entity_id,
    requesterUserId: row.requester_user_id,
    requesterMembershipId: row.requester_membership_id,
    assignedApproverUserId: row.assigned_approver_user_id,
    assignedApproverMembershipId: row.assigned_approver_membership_id,
    status: row.status,
    requestReason: row.request_reason,
    evaluationSnapshotJson: row.evaluation_snapshot_json,
    riskLevel: row.risk_level,
    riskEvaluationRef: row.risk_evaluation_ref,
    riskResult: row.risk_result,
    riskRulesVersion: row.risk_rules_version,
    riskRulesHash: row.risk_rules_hash,
    riskFactorsJson: row.risk_factors_json,
    riskReasonsJson: row.risk_reasons_json,
    requiresLogisticOverrideApproval: row.requires_logistic_override,
    separationOfDutiesRequired: row.separation_of_duties_required,
    policySnapshotJson: row.policy_snapshot_json,
    requestedAt: row.requested_at,
    dueAt: row.due_at,
    deciderUserId: row.decider_user_id,
    deciderMembershipId: row.decider_membership_id,
    decidedAt: row.decided_at,
    decisionReason: row.decision_reason,
    requestId: row.request_id,
    previousRequestId: row.previous_request_id,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function assertDatabase(db) {
  if (!db?.$queryRaw || !db?.$executeRaw) {
    throw new ApprovalRequestError("Se requiere un cliente o transacción Prisma.", { code: "APPROVAL_DATABASE_INVALID" });
  }
}

async function resolveActor(db, context, { permission, allowSystem = false } = {}) {
  assertDatabase(db);
  const tenantId = requiredText(context?.tenantId, "context.tenantId");
  const tenantRows = await db.$queryRaw(Prisma.sql`
    SELECT "id", "status"::text AS "status" FROM "osi"."tenants"
    WHERE "id" = ${tenantId} LIMIT 1
  `);
  if (!tenantRows[0] || String(tenantRows[0].status).toUpperCase() !== "ACTIVE") {
    throw new ApprovalRequestError("Empresa activa no disponible.", { code: "APPROVAL_TENANT_NOT_FOUND", status: 403 });
  }

  if (String(context?.actorKind || "MEMBERSHIP").toUpperCase() === "SYSTEM") {
    if (!allowSystem) throw new ApprovalRequestError("Esta acción requiere una membresía.", { code: "APPROVAL_FORBIDDEN", status: 403 });
    return { tenantId, actorKind: "SYSTEM", userId: null, membershipId: null, role: "SYSTEM", permissions: new Set([permission]) };
  }

  const membershipId = requiredText(context?.actorMembershipId, "context.actorMembershipId");
  const rows = await db.$queryRaw(Prisma.sql`
    SELECT m."id", m."tenant_id", m."user_id", m."role"::text AS "role",
      m."status"::text AS "membership_status", m."granted_permissions", m."denied_permissions",
      u."status" AS "user_status"
    FROM "osi"."tenant_memberships" m
    JOIN "osi"."osi_users" u ON u."id" = m."user_id"
    WHERE m."tenant_id" = ${tenantId} AND m."id" = ${membershipId}
    LIMIT 1
  `);
  const membership = rows[0];
  if (!membership) {
    throw new ApprovalRequestError("Recurso no encontrado.", { code: "APPROVAL_NOT_FOUND", status: 404 });
  }
  if (String(membership.membership_status).toUpperCase() !== "ACTIVE" ||
      String(membership.user_status).toUpperCase() !== "ACTIVE") {
    throw new ApprovalRequestError("La identidad empresarial no está activa.", { code: "APPROVAL_ACTOR_INACTIVE", status: 403 });
  }
  const granted = new Set([
    ...(Array.isArray(context?.permissions) ? context.permissions : []),
    ...(Array.isArray(membership.granted_permissions) ? membership.granted_permissions : []),
  ].map(String));
  const denied = new Set([
    ...(Array.isArray(context?.deniedPermissions) ? context.deniedPermissions : []),
    ...(Array.isArray(membership.denied_permissions) ? membership.denied_permissions : []),
  ].map(String));
  const effective = new Set([...granted].filter((item) => !denied.has(item)));
  return {
    tenantId,
    actorKind: "MEMBERSHIP",
    userId: membership.user_id,
    membershipId: membership.id,
    role: String(membership.role),
    permissions: effective,
    hasPermission: !permission || effective.has(permission),
  };
}

function auditContext(actor, context) {
  if (actor.actorKind === "SYSTEM") return { tenantId: actor.tenantId, actorKind: "SYSTEM" };
  return {
    tenantId: actor.tenantId,
    actorKind: "MEMBERSHIP",
    actorMembershipId: actor.membershipId,
    permissions: context?.permissions,
    deniedPermissions: context?.deniedPermissions,
  };
}

async function findByTenantAndId(db, tenantId, id) {
  const rows = await db.$queryRaw(Prisma.sql`
    SELECT * FROM "osi"."approval_requests" WHERE "tenant_id" = ${tenantId} AND "id" = ${id} LIMIT 1
  `);
  return rows[0] || null;
}

async function resolveSameTenantMembership(db, tenantId, membershipId) {
  if (!membershipId) return null;
  const rows = await db.$queryRaw(Prisma.sql`
    SELECT "id", "user_id", "role"::text AS "role", "status"::text AS "status"
    FROM "osi"."tenant_memberships"
    WHERE "tenant_id" = ${tenantId} AND "id" = ${membershipId} LIMIT 1
  `);
  if (!rows[0] || String(rows[0].status).toUpperCase() !== "ACTIVE") {
    throw new ApprovalRequestError("La membresía indicada no existe en la empresa activa.", {
      code: "APPROVAL_CROSS_TENANT_ACTOR", status: 400,
    });
  }
  return rows[0];
}

function approvalSnapshot(row) {
  const mapped = mapApprovalRow(row);
  return mapped && {
    id: mapped.id,
    status: mapped.status,
    approvalType: mapped.approvalType,
    entity: mapped.entity,
    entityId: mapped.entityId,
    assignedApproverMembershipId: mapped.assignedApproverMembershipId,
    deciderMembershipId: mapped.deciderMembershipId,
    decisionReason: mapped.decisionReason,
    version: mapped.version,
  };
}

async function auditedRejection(tx, actor, context, row, { action, code, message, status = 409, requestId, metadata }) {
  await appendCommercialAudit(tx, auditContext(actor, context), {
    action,
    entity: "APPROVAL_REQUEST",
    entityId: row?.id || "UNRESOLVED",
    source: "DB01E_DOMAIN",
    requestId,
    correlationId: requestId || randomUUID(),
    critical: true,
    beforeJson: approvalSnapshot(row),
    afterJson: approvalSnapshot(row),
    metadataJson: { rejectionCode: code, ...metadata },
  });
  return { rejected: new ApprovalRequestError(message, { code, status }) };
}

export function unwrapApprovalRequestTransactionResult(result) {
  if (result?.rejected) throw result.rejected;
  return result;
}

function normalizeCreateInput(input, options) {
  const approvalType = normalizeCode(input?.approvalType, "approvalType", 120);
  const entity = normalizeCode(input?.entity, "entity", 120);
  const entityId = requiredText(input?.entityId, "entityId");
  const requestReason = requiredText(input?.requestReason, "requestReason", 10_000);
  const requestId = requiredText(input?.requestId, "requestId");
  const dueAt = asDate(input?.dueAt, "dueAt", { optional: true });
  const risk = normalizeApprovalRiskEvaluation(input?.riskEvaluation);
  const evaluationSnapshot = sanitizeCommercialAuditJson(input?.evaluationSnapshot || {});
  const policySnapshot = sanitizeCommercialAuditJson(options?.policySnapshot || {});
  const normalized = {
    approvalType, entity, entityId, requestReason, requestId, dueAt,
    previousRequestId: optionalText(input?.previousRequestId, "previousRequestId"),
    evaluationSnapshot,
    risk,
    separationOfDutiesRequired: options?.separationOfDutiesRequired !== false,
    assignedApproverMembershipId: optionalText(options?.assignedApproverMembershipId, "assignedApproverMembershipId"),
    policySnapshot,
  };
  normalized.payloadHash = sha256(canonicalJson({
    ...normalized,
    dueAt: dueAt?.toISOString() || null,
  }));
  return normalized;
}

export async function createApprovalRequestInTransaction(tx, context, input, options = {}) {
  const command = normalizeCreateInput(input, options);
  const actor = await resolveActor(tx, context, { permission: APPROVAL_PERMISSIONS.CREATE });
    if (!actor.hasPermission) {
      return auditedRejection(tx, actor, context, null, {
        action: "APPROVAL_REQUEST_CREATE_UNAUTHORIZED",
        code: "APPROVAL_FORBIDDEN", message: "No tiene permiso para crear solicitudes.", status: 403,
        requestId: command.requestId, metadata: { approvalType: command.approvalType, entity: command.entity },
      });
    }
    if (command.dueAt && command.dueAt <= new Date()) {
      throw new ApprovalRequestError("dueAt debe estar en el futuro.", { code: "APPROVAL_INPUT_INVALID", status: 400 });
    }
    if (command.previousRequestId) {
      const prior = await findByTenantAndId(tx, actor.tenantId, command.previousRequestId);
      if (!prior) throw new ApprovalRequestError("Solicitud anterior no encontrada.", { code: "APPROVAL_NOT_FOUND", status: 404 });
    }
    let assignee = null;
    if (command.assignedApproverMembershipId) {
      if (!actor.permissions.has(APPROVAL_PERMISSIONS.ASSIGN_ON_CREATE)) {
        return auditedRejection(tx, actor, context, null, {
          action: "APPROVAL_REQUEST_ASSIGN_UNAUTHORIZED",
          code: "APPROVAL_FORBIDDEN", message: "No puede asignar aprobador al crear.", status: 403,
          requestId: command.requestId, metadata: { assignedApproverMembershipId: command.assignedApproverMembershipId },
        });
      }
      assignee = await resolveSameTenantMembership(tx, actor.tenantId, command.assignedApproverMembershipId);
    }
    const id = randomUUID();
    const inserted = await tx.$queryRaw(Prisma.sql`
      INSERT INTO "osi"."approval_requests" (
        "id", "tenant_id", "approval_type", "entity", "entity_id",
        "requester_user_id", "requester_membership_id",
        "assigned_approver_user_id", "assigned_approver_membership_id",
        "request_reason", "evaluation_snapshot_json", "risk_level", "risk_evaluation_ref",
        "risk_result", "risk_rules_version", "risk_rules_hash", "risk_factors_json", "risk_reasons_json",
        "requires_logistic_override", "separation_of_duties_required", "policy_snapshot_json",
        "due_at", "request_id", "payload_hash", "previous_request_id"
      ) VALUES (
        ${id}, ${actor.tenantId}, ${command.approvalType}, ${command.entity}, ${command.entityId},
        ${actor.userId}, ${actor.membershipId}, ${assignee?.user_id || null}, ${assignee?.id || null},
        ${command.requestReason}, CAST(${jsonParameter(command.evaluationSnapshot)} AS jsonb),
        ${command.risk.level}, ${command.risk.reference}, ${command.risk.result},
        ${command.risk.rulesVersion}, ${command.risk.rulesHash},
        CAST(${jsonParameter(command.risk.factors)} AS jsonb), CAST(${jsonParameter(command.risk.reasons)} AS jsonb),
        ${command.risk.requiresLogisticOverrideApproval}, ${command.separationOfDutiesRequired},
        CAST(${jsonParameter(command.policySnapshot)} AS jsonb), ${command.dueAt},
        ${command.requestId}, ${command.payloadHash}, ${command.previousRequestId}
      )
      ON CONFLICT ("tenant_id", "request_id") DO NOTHING
      RETURNING *
    `);
    let row = inserted[0];
    if (!row) {
      const existing = await tx.$queryRaw(Prisma.sql`
        SELECT * FROM "osi"."approval_requests"
        WHERE "tenant_id" = ${actor.tenantId} AND "request_id" = ${command.requestId} LIMIT 1
      `);
      row = existing[0];
      if (!row || row.payload_hash !== command.payloadHash) {
        return auditedRejection(tx, actor, context, row, {
          action: "APPROVAL_REQUEST_IDEMPOTENCY_CONFLICT",
          code: "APPROVAL_IDEMPOTENCY_CONFLICT",
          message: "requestId ya fue utilizado con otro payload.", requestId: command.requestId,
        });
      }
      return { approval: mapApprovalRow(row), idempotent: true };
    }

    if (typeof options.legacyProjectionWriter === "function") {
      await options.legacyProjectionWriter(tx, mapApprovalRow(row));
    }
    await appendCommercialAudit(tx, auditContext(actor, context), {
      action: "APPROVAL_REQUEST_CREATED", entity: "APPROVAL_REQUEST", entityId: row.id,
      source: "DB01E_DOMAIN", requestId: command.requestId, correlationId: command.requestId,
      critical: true, afterJson: approvalSnapshot(row),
      metadataJson: { dualWrite: typeof options.legacyProjectionWriter === "function" },
    });
  return { approval: mapApprovalRow(row), idempotent: false };
}

export async function createApprovalRequest(prisma, context, input, options = {}) {
  const result = await prisma.$transaction((tx) => createApprovalRequestInTransaction(tx, context, input, options));
  return unwrapApprovalRequestTransactionResult(result);
}

export async function decideApprovalRequestInTransaction(tx, context, input) {
  const id = requiredText(input?.id, "id");
  const desiredStatus = normalizeCode(input?.decision, "decision", 20);
  if (!new Set(["APPROVED", "REJECTED"]).has(desiredStatus)) {
    throw new ApprovalRequestError("La decisión debe ser APPROVED o REJECTED.", { code: "APPROVAL_INPUT_INVALID", status: 400 });
  }
  const reason = requiredText(input?.reason, "reason", 10_000);
  const decisionRequestId = requiredText(input?.requestId, "requestId");
  const expectedVersion = Number(input?.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw new ApprovalRequestError("expectedVersion es obligatorio.", { code: "APPROVAL_INPUT_INVALID", status: 400 });
  }
  const actor = await resolveActor(tx, context, { permission: APPROVAL_PERMISSIONS.DECIDE });
  const row = await findByTenantAndId(tx, actor.tenantId, id);
  if (!row) throw new ApprovalRequestError("Solicitud no encontrada.", { code: "APPROVAL_NOT_FOUND", status: 404 });
  const decisionHash = sha256(canonicalJson({ id, desiredStatus, reason, expectedVersion }));
  if (TERMINAL_APPROVAL_STATUSES.has(String(row.status))) {
    if (row.status === desiredStatus && row.decision_request_id === decisionRequestId && row.decision_payload_hash === decisionHash) {
      return { approval: mapApprovalRow(row), idempotent: true };
    }
    return auditedRejection(tx, actor, context, row, {
      action: "APPROVAL_REQUEST_CONCURRENCY_CONFLICT", code: "APPROVAL_FINAL_IMMUTABLE",
      message: "La solicitud ya tiene una decisión final.", requestId: decisionRequestId,
      metadata: { desiredStatus, expectedVersion, actualVersion: row.version },
    });
  }
  if (!actor.hasPermission) {
    return auditedRejection(tx, actor, context, row, {
      action: "APPROVAL_REQUEST_DECISION_UNAUTHORIZED", code: "APPROVAL_FORBIDDEN",
      message: "No tiene permiso para decidir esta solicitud.", status: 403, requestId: decisionRequestId,
    });
  }
  if (row.assigned_approver_membership_id && row.assigned_approver_membership_id !== actor.membershipId) {
    return auditedRejection(tx, actor, context, row, {
      action: "APPROVAL_REQUEST_DECISION_UNAUTHORIZED", code: "APPROVAL_NOT_ASSIGNED",
      message: "La solicitud está asignada a otro aprobador.", status: 403, requestId: decisionRequestId,
    });
  }
  if (row.separation_of_duties_required && row.requester_membership_id === actor.membershipId) {
    return auditedRejection(tx, actor, context, row, {
      action: "APPROVAL_REQUEST_DECISION_UNAUTHORIZED", code: "APPROVAL_SEPARATION_OF_DUTIES",
      message: "El solicitante no puede aprobar o rechazar su propia solicitud.", status: 403, requestId: decisionRequestId,
    });
  }
  if (row.due_at && new Date(row.due_at) <= new Date()) {
    const expired = await tx.$queryRaw(Prisma.sql`
      UPDATE "osi"."approval_requests" SET "status" = 'EXPIRED', "decided_at" = CURRENT_TIMESTAMP,
        "decision_reason" = 'Vencimiento automático al intentar decidir', "version" = "version" + 1,
        "updated_at" = CURRENT_TIMESTAMP
      WHERE "tenant_id" = ${actor.tenantId} AND "id" = ${id} AND "status" = 'PENDING' AND "version" = ${row.version}
      RETURNING *
    `);
    const finalRow = expired[0] || await findByTenantAndId(tx, actor.tenantId, id);
    await appendCommercialAudit(tx, auditContext(actor, context), {
      action: "APPROVAL_REQUEST_EXPIRED", entity: "APPROVAL_REQUEST", entityId: id,
      source: "DB01E_DOMAIN", requestId: decisionRequestId, correlationId: decisionRequestId,
      critical: true, beforeJson: approvalSnapshot(row), afterJson: approvalSnapshot(finalRow),
    });
    return { rejected: new ApprovalRequestError("La solicitud está vencida.", { code: "APPROVAL_EXPIRED", status: 409 }) };
  }
  if (desiredStatus === "APPROVED" && (row.risk_result === "BLOCKED" || row.requires_logistic_override)) {
    return auditedRejection(tx, actor, context, row, {
      action: "APPROVAL_REQUEST_DECISION_BLOCKED", code: "APPROVAL_RISK_BLOCKED",
      message: "La solicitud requiere una excepción logística administrativa válida.", status: 409,
      requestId: decisionRequestId, metadata: { riskResult: row.risk_result },
    });
  }
  const updated = await tx.$queryRaw(Prisma.sql`
    UPDATE "osi"."approval_requests" SET
      "status" = CAST(${desiredStatus} AS "osi"."ApprovalRequestStatus"),
      "decider_user_id" = ${actor.userId}, "decider_membership_id" = ${actor.membershipId},
      "decided_at" = CURRENT_TIMESTAMP, "decision_reason" = ${reason},
      "decision_request_id" = ${decisionRequestId}, "decision_payload_hash" = ${decisionHash},
      "version" = "version" + 1, "updated_at" = CURRENT_TIMESTAMP
    WHERE "tenant_id" = ${actor.tenantId} AND "id" = ${id}
      AND "status" = 'PENDING' AND "version" = ${expectedVersion}
    RETURNING *
  `);
  if (!updated[0]) {
    const current = await findByTenantAndId(tx, actor.tenantId, id);
    if (current?.status === desiredStatus && current.decision_request_id === decisionRequestId && current.decision_payload_hash === decisionHash) {
      return { approval: mapApprovalRow(current), idempotent: true };
    }
    return auditedRejection(tx, actor, context, current || row, {
      action: "APPROVAL_REQUEST_CONCURRENCY_CONFLICT", code: "APPROVAL_VERSION_CONFLICT",
      message: "La solicitud cambió; vuelva a cargarla.", requestId: decisionRequestId,
      metadata: { desiredStatus, expectedVersion, actualVersion: current?.version },
    });
  }
  await appendCommercialAudit(tx, auditContext(actor, context), {
    action: desiredStatus === "APPROVED" ? "APPROVAL_REQUEST_APPROVED" : "APPROVAL_REQUEST_REJECTED",
    entity: "APPROVAL_REQUEST", entityId: id, source: "DB01E_DOMAIN",
    requestId: decisionRequestId, correlationId: decisionRequestId, critical: true,
    beforeJson: approvalSnapshot(row), afterJson: approvalSnapshot(updated[0]),
  });
  return { approval: mapApprovalRow(updated[0]), idempotent: false };
}

export async function decideApprovalRequest(prisma, context, input) {
  const result = await prisma.$transaction((tx) => decideApprovalRequestInTransaction(tx, context, input));
  return unwrapApprovalRequestTransactionResult(result);
}

export async function transitionApprovalRequestInTransaction(tx, context, input, config) {
    const actor = await resolveActor(tx, context, { permission: config.permission, allowSystem: config.allowSystem });
    const id = requiredText(input?.id, "id");
    const requestId = requiredText(input?.requestId, "requestId");
    const reason = requiredText(input?.reason || config.defaultReason, "reason", 10_000);
    const expectedVersion = Number(input?.expectedVersion);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      throw new ApprovalRequestError("expectedVersion es obligatorio.", { code: "APPROVAL_INPUT_INVALID", status: 400 });
    }
    const row = await findByTenantAndId(tx, actor.tenantId, id);
    if (!row) throw new ApprovalRequestError("Solicitud no encontrada.", { code: "APPROVAL_NOT_FOUND", status: 404 });
    if (actor.actorKind !== "SYSTEM" && !actor.hasPermission) {
      return auditedRejection(tx, actor, context, row, {
        action: `${config.auditAction}_UNAUTHORIZED`, code: "APPROVAL_FORBIDDEN",
        message: "No tiene permiso para esta transición.", status: 403, requestId,
      });
    }
    if (row.status !== "PENDING") {
      return auditedRejection(tx, actor, context, row, {
        action: "APPROVAL_REQUEST_CONCURRENCY_CONFLICT", code: "APPROVAL_FINAL_IMMUTABLE",
        message: "La solicitud ya es final.", requestId,
      });
    }
    const updated = await tx.$queryRaw(Prisma.sql`
      UPDATE "osi"."approval_requests" SET "status" = CAST(${config.status} AS "osi"."ApprovalRequestStatus"),
        "decider_user_id" = ${actor.userId}, "decider_membership_id" = ${actor.membershipId},
        "decided_at" = CURRENT_TIMESTAMP, "decision_reason" = ${reason},
        "decision_request_id" = ${requestId},
        "decision_payload_hash" = ${sha256(canonicalJson({ id, status: config.status, reason, expectedVersion }))},
        "version" = "version" + 1, "updated_at" = CURRENT_TIMESTAMP
      WHERE "tenant_id" = ${actor.tenantId} AND "id" = ${id} AND "status" = 'PENDING'
        AND "version" = ${expectedVersion}
      RETURNING *
    `);
    if (!updated[0]) {
      return auditedRejection(tx, actor, context, await findByTenantAndId(tx, actor.tenantId, id), {
        action: "APPROVAL_REQUEST_CONCURRENCY_CONFLICT", code: "APPROVAL_VERSION_CONFLICT",
        message: "La solicitud cambió; vuelva a cargarla.", requestId,
      });
    }
    await appendCommercialAudit(tx, auditContext(actor, context), {
      action: config.auditAction, entity: "APPROVAL_REQUEST", entityId: id, source: "DB01E_DOMAIN",
      requestId, correlationId: requestId, critical: true,
      beforeJson: approvalSnapshot(row), afterJson: approvalSnapshot(updated[0]),
    });
  return { approval: mapApprovalRow(updated[0]), idempotent: false };
}

async function transitionPending(prisma, context, input, config) {
  const result = await prisma.$transaction((tx) => transitionApprovalRequestInTransaction(tx, context, input, config));
  return unwrapApprovalRequestTransactionResult(result);
}

export function cancelApprovalRequest(prisma, context, input) {
  return transitionPending(prisma, context, input, {
    permission: APPROVAL_PERMISSIONS.CANCEL, status: "CANCELLED", auditAction: "APPROVAL_REQUEST_CANCELLED",
  });
}

export function expireApprovalRequest(prisma, context, input) {
  return transitionPending(prisma, context, input, {
    permission: APPROVAL_PERMISSIONS.EXPIRE, allowSystem: true, status: "EXPIRED",
    auditAction: "APPROVAL_REQUEST_EXPIRED", defaultReason: "Vencimiento programado",
  });
}

export async function reassignApprovalRequest(prisma, context, input) {
  const result = await prisma.$transaction(async (tx) => {
    const actor = await resolveActor(tx, context, { permission: APPROVAL_PERMISSIONS.REASSIGN });
    const id = requiredText(input?.id, "id");
    const requestId = requiredText(input?.requestId, "requestId");
    const expectedVersion = Number(input?.expectedVersion);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      throw new ApprovalRequestError("expectedVersion es obligatorio.", { code: "APPROVAL_INPUT_INVALID", status: 400 });
    }
    const row = await findByTenantAndId(tx, actor.tenantId, id);
    if (!row) throw new ApprovalRequestError("Solicitud no encontrada.", { code: "APPROVAL_NOT_FOUND", status: 404 });
    if (!actor.hasPermission) {
      return auditedRejection(tx, actor, context, row, {
        action: "APPROVAL_REQUEST_REASSIGN_UNAUTHORIZED", code: "APPROVAL_FORBIDDEN",
        message: "No tiene permiso para reasignar.", status: 403, requestId,
      });
    }
    if (row.status !== "PENDING") {
      return auditedRejection(tx, actor, context, row, {
        action: "APPROVAL_REQUEST_CONCURRENCY_CONFLICT", code: "APPROVAL_FINAL_IMMUTABLE",
        message: "La solicitud ya es final.", requestId,
      });
    }
    const assigneeId = optionalText(input?.assignedApproverMembershipId, "assignedApproverMembershipId");
    const assignee = await resolveSameTenantMembership(tx, actor.tenantId, assigneeId);
    const updated = await tx.$queryRaw(Prisma.sql`
      UPDATE "osi"."approval_requests" SET
        "assigned_approver_user_id" = ${assignee?.user_id || null},
        "assigned_approver_membership_id" = ${assignee?.id || null},
        "version" = "version" + 1, "updated_at" = CURRENT_TIMESTAMP
      WHERE "tenant_id" = ${actor.tenantId} AND "id" = ${id} AND "status" = 'PENDING'
        AND "version" = ${expectedVersion}
      RETURNING *
    `);
    if (!updated[0]) {
      return auditedRejection(tx, actor, context, await findByTenantAndId(tx, actor.tenantId, id), {
        action: "APPROVAL_REQUEST_CONCURRENCY_CONFLICT", code: "APPROVAL_VERSION_CONFLICT",
        message: "La solicitud cambió; vuelva a cargarla.", requestId,
      });
    }
    await appendCommercialAudit(tx, auditContext(actor, context), {
      action: "APPROVAL_REQUEST_REASSIGNED", entity: "APPROVAL_REQUEST", entityId: id,
      source: "DB01E_DOMAIN", requestId, correlationId: requestId, critical: true,
      beforeJson: approvalSnapshot(row), afterJson: approvalSnapshot(updated[0]),
    });
    return { approval: mapApprovalRow(updated[0]), idempotent: false };
  });
  return unwrapApprovalRequestTransactionResult(result);
}

export async function getApprovalRequest(db, context, id) {
  const actor = await resolveActor(db, context, { permission: APPROVAL_PERMISSIONS.VIEW });
  if (!actor.hasPermission) throw new ApprovalRequestError("No tiene permiso para consultar.", { code: "APPROVAL_FORBIDDEN", status: 403 });
  const row = await findByTenantAndId(db, actor.tenantId, requiredText(id, "id"));
  if (!row) throw new ApprovalRequestError("Solicitud no encontrada.", { code: "APPROVAL_NOT_FOUND", status: 404 });
  return mapApprovalRow(row);
}

function encodeCursor(row) {
  return Buffer.from(JSON.stringify({ createdAt: row.created_at, id: row.id }), "utf8").toString("base64url");
}

function decodeCursor(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), "base64url").toString("utf8"));
    return { createdAt: asDate(parsed.createdAt, "cursor.createdAt"), id: requiredText(parsed.id, "cursor.id") };
  } catch (cause) {
    throw new ApprovalRequestError("Cursor inválido.", { code: "APPROVAL_CURSOR_INVALID", status: 400, cause });
  }
}

export async function listApprovalRequests(db, context, filters = {}) {
  const actor = await resolveActor(db, context, { permission: APPROVAL_PERMISSIONS.VIEW });
  if (!actor.hasPermission) throw new ApprovalRequestError("No tiene permiso para consultar.", { code: "APPROVAL_FORBIDDEN", status: 403 });
  const rawLimit = Number(filters.limit ?? DEFAULT_PAGE_SIZE);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? Math.trunc(rawLimit) : DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const cursor = decodeCursor(filters.cursor);
  const conditions = [Prisma.sql`"tenant_id" = ${actor.tenantId}`];
  if (filters.status) conditions.push(Prisma.sql`"status" = CAST(${normalizeCode(filters.status, "status", 20)} AS "osi"."ApprovalRequestStatus")`);
  if (filters.approvalType) conditions.push(Prisma.sql`"approval_type" = ${normalizeCode(filters.approvalType, "approvalType", 120)}`);
  if (filters.entity) conditions.push(Prisma.sql`"entity" = ${normalizeCode(filters.entity, "entity", 120)}`);
  if (filters.entityId) conditions.push(Prisma.sql`"entity_id" = ${requiredText(filters.entityId, "entityId")}`);
  if (filters.assignedToMe === true) conditions.push(Prisma.sql`"assigned_approver_membership_id" = ${actor.membershipId}`);
  if (cursor) conditions.push(Prisma.sql`("created_at" < ${cursor.createdAt} OR ("created_at" = ${cursor.createdAt} AND "id" < ${cursor.id}))`);
  const rows = await db.$queryRaw(Prisma.sql`
    SELECT * FROM "osi"."approval_requests"
    WHERE ${Prisma.join(conditions, " AND ")}
    ORDER BY "created_at" DESC, "id" DESC LIMIT ${limit + 1}
  `);
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return { data: page.map(mapApprovalRow), nextCursor: hasMore ? encodeCursor(page.at(-1)) : null };
}
