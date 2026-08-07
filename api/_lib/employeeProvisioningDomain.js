import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  APPROVAL_PERMISSIONS,
  createApprovalRequestInTransaction,
  decideApprovalRequestInTransaction,
  transitionApprovalRequestInTransaction,
  unwrapApprovalRequestTransactionResult,
} from "./approvalRequest.js";
import { appendCommercialAudit } from "./commercialAuditLog.js";
import { permsForRole } from "./rbac.js";
import {
  EMPLOYEE_PROVISIONING_PERMISSIONS as P,
  EMPLOYEE_PROVISIONING_ROLES,
  effectiveDelegatedPermissions,
} from "./employeeProvisioningPolicy.js";

const SOURCE = "MT01C1B2B_DOMAIN";
const APPROVAL_TYPE = "EMPLOYEE_PROVISIONING";
const ENTITY = "EMPLOYEE_PROVISIONING_REQUEST";
const MAX_PAGE_SIZE = 100;

export class EmployeeProvisioningError extends Error {
  constructor(message, { code = "EMPLOYEE_PROVISIONING_ERROR", status = 500, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "EmployeeProvisioningError";
    this.code = code;
    this.status = status;
  }
}

function required(value, field, max = 191) {
  const result = String(value ?? "").trim();
  if (!result || result.length > max) throw new EmployeeProvisioningError(`${field} inválido.`, { code: "EMPLOYEE_PROVISIONING_INPUT_INVALID", status: 400 });
  return result;
}

function optional(value, field, max = 191) {
  return value == null || String(value).trim() === "" ? null : required(value, field, max);
}

function canonicalJson(value) {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function payloadHash(value) { return sha256(canonicalJson(value)); }
function upper(value) { return String(value ?? "").trim().toUpperCase(); }

export function normalizeProvisioningEmail(value) {
  const email = required(value, "email", 320).toLowerCase();
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,63}$/.test(email) || /[^\x20-\x7e]/.test(email)) {
    throw new EmployeeProvisioningError("Correo empresarial inválido.", { code: "EMPLOYEE_PROVISIONING_EMAIL_INVALID", status: 400 });
  }
  return email;
}

export function normalizeEmployeeCode(value) {
  const code = required(value, "employeeCode", 64).toUpperCase();
  if (/\s/.test(code)) throw new EmployeeProvisioningError("Código de empleado inválido.", { code: "EMPLOYEE_PROVISIONING_CODE_INVALID", status: 400 });
  return code;
}

function normalizePermissions(values, field) {
  if (values == null) return [];
  if (!Array.isArray(values)) throw new EmployeeProvisioningError(`${field} inválido.`, { code: "EMPLOYEE_PROVISIONING_INPUT_INVALID", status: 400 });
  return [...new Set(values.map((value) => required(value, field, 191)))].sort();
}

function normalizeDate(value, field) {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new EmployeeProvisioningError(`${field} inválido.`, { code: "EMPLOYEE_PROVISIONING_INPUT_INVALID", status: 400 });
  return date;
}

function assertDatabase(db) {
  if (!db?.$queryRaw || !db?.$executeRaw) throw new EmployeeProvisioningError("Cliente Prisma requerido.", { code: "EMPLOYEE_PROVISIONING_DATABASE_INVALID" });
}

function contextMembershipId(context) {
  return required(context?.membershipId || context?.actorMembershipId, "context.membershipId");
}

async function resolveActor(db, context, permission) {
  assertDatabase(db);
  const tenantId = required(context?.tenantId, "context.tenantId");
  const membershipId = contextMembershipId(context);
  const rows = await db.$queryRaw(Prisma.sql`
    SELECT m."id", m."tenant_id", m."user_id", m."role"::text AS "role",
      m."status"::text AS "membership_status", m."granted_permissions", m."denied_permissions",
      u."status" AS "user_status", t."status"::text AS "tenant_status"
    FROM "osi"."tenant_memberships" m
    JOIN "osi"."osi_users" u ON u."id" = m."user_id"
    JOIN "osi"."tenants" t ON t."id" = m."tenant_id"
    WHERE m."tenant_id" = ${tenantId} AND m."id" = ${membershipId}
    LIMIT 1
  `);
  const row = rows[0];
  if (!row) throw new EmployeeProvisioningError("Recurso no encontrado.", { code: "EMPLOYEE_PROVISIONING_NOT_FOUND", status: 404 });
  if (upper(row.user_status) !== "ACTIVE" || upper(row.membership_status) !== "ACTIVE" || upper(row.tenant_status) !== "ACTIVE") {
    throw new EmployeeProvisioningError("Identidad empresarial inactiva.", { code: "EMPLOYEE_PROVISIONING_ACTOR_INACTIVE", status: 403 });
  }
  const denied = new Set((row.denied_permissions || []).map(String));
  const effective = new Set([...permsForRole(row.role), ...(row.granted_permissions || []).map(String)].filter((item) => !denied.has(item)));
  return { tenantId, membershipId: row.id, userId: row.user_id, role: upper(row.role), effective, denied, allowed: effective.has(permission) };
}

function internalApprovalContext(actor, permission) {
  return { tenantId: actor.tenantId, actorKind: "MEMBERSHIP", actorMembershipId: actor.membershipId, permissions: [permission] };
}

function auditContext(actor) {
  return { tenantId: actor.tenantId, actorKind: "MEMBERSHIP", actorMembershipId: actor.membershipId };
}

function safeSnapshot(row) {
  return row && {
    id: row.id,
    approvalRequestId: row.approval_request_id,
    requestedRole: row.requested_role,
    grantedPermissions: row.granted_permissions,
    deniedPermissions: row.denied_permissions,
    lifecycleStatus: row.lifecycle_status,
    lifecycleVersion: row.lifecycle_version,
  };
}

async function appendAudit(tx, actor, data, auditWriter = appendCommercialAudit) {
  return auditWriter(tx, auditContext(actor), {
    source: SOURCE,
    critical: true,
    correlationId: data.requestId,
    ...data,
  });
}

async function auditedFailure(tx, actor, input, details, auditWriter) {
  await appendAudit(tx, actor, {
    action: details.action,
    entity: ENTITY,
    entityId: input?.id || input?.provisioningRequestId || "UNRESOLVED",
    requestId: optional(input?.requestId, "requestId") || randomUUID(),
    metadataJson: { rejectionCode: details.code },
  }, auditWriter);
  return { rejected: new EmployeeProvisioningError(details.message, { code: details.code, status: details.status || 403 }) };
}

function unwrap(result) {
  if (result?.rejected) throw result.rejected;
  return result;
}

async function advisoryLock(tx, tenantId, key) {
  await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${key}`}, 0))::text AS "locked"`);
}

function transaction(prisma, operation) {
  return prisma.$transaction(operation, { maxWait: 3_000, timeout: 10_000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

function normalizeCreate(input) {
  const requestedRole = upper(input?.requestedRole);
  if (!EMPLOYEE_PROVISIONING_ROLES.includes(requestedRole)) throw new EmployeeProvisioningError("Rol solicitado inválido.", { code: "EMPLOYEE_PROVISIONING_ROLE_INVALID", status: 400 });
  const grantedPermissions = normalizePermissions(input?.grantedPermissions, "grantedPermissions");
  const deniedPermissions = normalizePermissions(input?.deniedPermissions, "deniedPermissions");
  if (grantedPermissions.some((item) => deniedPermissions.includes(item))) throw new EmployeeProvisioningError("Permisos concedidos y denegados se superponen.", { code: "EMPLOYEE_PROVISIONING_PERMISSIONS_INVALID", status: 400 });
  const command = {
    requestId: required(input?.requestId, "requestId"),
    requestReason: required(input?.requestReason, "requestReason", 10_000),
    identityMode: upper(input?.identityMode),
    normalizedEmail: normalizeProvisioningEmail(input?.email),
    normalizedEmployeeCode: normalizeEmployeeCode(input?.employeeCode),
    requestedRole,
    grantedPermissions,
    deniedPermissions,
    jobTitle: optional(input?.jobTitle, "jobTitle", 120),
    departmentCode: optional(input?.departmentCode, "departmentCode", 64)?.toUpperCase() || null,
    employmentStatus: upper(input?.employmentStatus),
    contractType: optional(input?.contractType, "contractType", 40)?.toUpperCase() || null,
    availabilityStatus: upper(input?.availabilityStatus),
    supervisorMembershipId: optional(input?.supervisorMembershipId, "supervisorMembershipId"),
    hiredAt: normalizeDate(input?.hiredAt, "hiredAt"),
    contractStartsAt: normalizeDate(input?.contractStartsAt, "contractStartsAt"),
    contractEndsAt: normalizeDate(input?.contractEndsAt, "contractEndsAt"),
    terminatedAt: normalizeDate(input?.terminatedAt, "terminatedAt"),
    targetUserId: optional(input?.targetUserId, "targetUserId"),
    dueAt: normalizeDate(input?.dueAt, "dueAt"),
  };
  if (!new Set(["NEW_GLOBAL_USER", "EXISTING_GLOBAL_USER"]).has(command.identityMode)) throw new EmployeeProvisioningError("identityMode inválido.", { code: "EMPLOYEE_PROVISIONING_INPUT_INVALID", status: 400 });
  if (!command.employmentStatus || !command.availabilityStatus) throw new EmployeeProvisioningError("Estados laborales explícitos requeridos.", { code: "EMPLOYEE_PROVISIONING_INPUT_INVALID", status: 400 });
  command.hash = payloadHash({ ...command, hiredAt: command.hiredAt?.toISOString() || null, contractStartsAt: command.contractStartsAt?.toISOString() || null, contractEndsAt: command.contractEndsAt?.toISOString() || null, terminatedAt: command.terminatedAt?.toISOString() || null, dueAt: command.dueAt?.toISOString() || null });
  return command;
}

async function findRequest(tx, tenantId, id) {
  const rows = await tx.$queryRaw(Prisma.sql`
    SELECT p.*, a."status"::text AS "approval_status", a."version" AS "approval_version",
      a."requester_user_id", a."requester_membership_id", a."decision_request_id", a."decision_payload_hash",
      a."evaluation_snapshot_json"
    FROM "osi"."employee_provisioning_requests" p
    JOIN "osi"."approval_requests" a ON a."tenant_id"=p."tenant_id" AND a."id"=p."approval_request_id"
    WHERE p."tenant_id"=${tenantId} AND p."id"=${id} LIMIT 1
  `);
  return rows[0] || null;
}

export async function createEmployeeProvisioningRequest(prisma, context, input, options = {}) {
  const command = normalizeCreate(input);
  const result = await transaction(prisma, async (tx) => {
    const actor = await resolveActor(tx, context, P.REQUEST);
    await advisoryLock(tx, actor.tenantId, `create:${command.requestId}`);
    if (!actor.allowed) return auditedFailure(tx, actor, input, { action: "EMPLOYEE_PROVISIONING_CREATE_UNAUTHORIZED", code: "EMPLOYEE_PROVISIONING_FORBIDDEN", message: "No tiene permiso para solicitar provisión." }, options.auditWriter);
    const priorRows = await tx.$queryRaw(Prisma.sql`
      SELECT a."id" AS "approval_id", a."status"::text AS "approval_status", a."version" AS "approval_version",
        a."evaluation_snapshot_json", p.*
      FROM "osi"."approval_requests" a
      LEFT JOIN "osi"."employee_provisioning_requests" p
        ON p."tenant_id"=a."tenant_id" AND p."approval_request_id"=a."id"
      WHERE a."tenant_id"=${actor.tenantId} AND a."request_id"=${command.requestId}
      LIMIT 1
    `);
    if (priorRows[0]) {
      const prior = priorRows[0];
      if (prior.evaluation_snapshot_json?.provisioningPayloadHash !== command.hash) {
        return auditedFailure(tx, actor, input, { action: "EMPLOYEE_PROVISIONING_IDEMPOTENCY_CONFLICT", code: "EMPLOYEE_PROVISIONING_IDEMPOTENCY_CONFLICT", message: "requestId fue usado con otro payload.", status: 409 }, options.auditWriter);
      }
      if (!prior.id) throw new EmployeeProvisioningError("Solicitud idempotente incompleta.", { code: "EMPLOYEE_PROVISIONING_INCONSISTENT", status: 409 });
      return {
        request: safeSnapshot(prior),
        approval: { id: prior.approval_id, status: prior.approval_status, version: prior.approval_version },
        idempotent: true,
      };
    }
    await advisoryLock(tx, actor.tenantId, `employee-code:${command.normalizedEmployeeCode}`);
    const duplicateCode = await tx.$queryRaw(Prisma.sql`
      SELECT p."id"
      FROM "osi"."employee_provisioning_requests" p
      JOIN "osi"."approval_requests" a ON a."tenant_id"=p."tenant_id" AND a."id"=p."approval_request_id"
      WHERE p."tenant_id"=${actor.tenantId} AND p."normalized_employee_code"=${command.normalizedEmployeeCode}
        AND a."status" IN ('PENDING','APPROVED')
      UNION ALL
      SELECT e."id" FROM "osi"."employee_profiles" e
      WHERE e."tenant_id"=${actor.tenantId} AND e."employee_code"=${command.normalizedEmployeeCode}
      LIMIT 1
    `);
    if (duplicateCode[0]) {
      return auditedFailure(tx, actor, input, {
        action: "EMPLOYEE_PROVISIONING_EMPLOYEE_CODE_CONFLICT",
        code: "EMPLOYEE_PROVISIONING_EMPLOYEE_CODE_CONFLICT",
        message: "El código de empleado ya está reservado en esta empresa.",
        status: 409,
      }, options.auditWriter);
    }
    if (command.requestedRole === "A" && actor.userId === command.targetUserId) return auditedFailure(tx, actor, input, { action: "EMPLOYEE_PROVISIONING_CREATE_UNAUTHORIZED", code: "EMPLOYEE_PROVISIONING_SELF_ADMIN_FORBIDDEN", message: "No puede solicitarse rol administrador a sí mismo." }, options.auditWriter);
    let supervisor = null;
    if (command.supervisorMembershipId) {
      const rows = await tx.$queryRaw(Prisma.sql`SELECT "id", "user_id" FROM "osi"."tenant_memberships" WHERE "tenant_id"=${actor.tenantId} AND "id"=${command.supervisorMembershipId} AND "status"='ACTIVE' LIMIT 1`);
      supervisor = rows[0];
      if (!supervisor) throw new EmployeeProvisioningError("Supervisor no encontrado.", { code: "EMPLOYEE_PROVISIONING_NOT_FOUND", status: 404 });
    }
    if (command.targetUserId) {
      const target = await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "osi"."osi_users" WHERE "id"=${command.targetUserId} LIMIT 1`);
      if (!target[0]) throw new EmployeeProvisioningError("Identidad objetivo no encontrada.", { code: "EMPLOYEE_PROVISIONING_TARGET_NOT_FOUND", status: 404 });
    }
    const id = randomUUID();
    const approvalResult = await createApprovalRequestInTransaction(tx, internalApprovalContext(actor, APPROVAL_PERMISSIONS.CREATE), {
      approvalType: APPROVAL_TYPE,
      entity: ENTITY,
      entityId: id,
      requestReason: command.requestReason,
      requestId: command.requestId,
      dueAt: command.dueAt,
      evaluationSnapshot: { provisioningPayloadHash: command.hash, requestedRole: command.requestedRole, targetUserId: command.targetUserId },
    }, { separationOfDutiesRequired: true, policySnapshot: { policy: "MT-01C1B2B", fourEyesRoleA: true } });
    if (approvalResult?.rejected) return approvalResult;
    if (approvalResult.idempotent) {
      const existing = await tx.$queryRaw(Prisma.sql`SELECT * FROM "osi"."employee_provisioning_requests" WHERE "tenant_id"=${actor.tenantId} AND "approval_request_id"=${approvalResult.approval.id} LIMIT 1`);
      if (!existing[0]) throw new EmployeeProvisioningError("Solicitud idempotente incompleta.", { code: "EMPLOYEE_PROVISIONING_INCONSISTENT", status: 409 });
      return { request: safeSnapshot(existing[0]), approval: approvalResult.approval, idempotent: true };
    }
    const rows = await tx.$queryRaw(Prisma.sql`
      INSERT INTO "osi"."employee_provisioning_requests" (
        "id","tenant_id","approval_request_id","identity_mode","normalized_email","normalized_employee_code",
        "job_title","department_code","employment_status","contract_type","availability_status",
        "supervisor_membership_id","supervisor_user_id","hired_at","contract_starts_at","contract_ends_at","terminated_at",
        "requested_role","granted_permissions","denied_permissions"
      ) VALUES (
        ${id},${actor.tenantId},${approvalResult.approval.id},CAST(${command.identityMode} AS "osi"."EmployeeProvisioningIdentityMode"),
        ${command.normalizedEmail},${command.normalizedEmployeeCode},${command.jobTitle},${command.departmentCode},
        CAST(${command.employmentStatus} AS "osi"."EmployeeEmploymentStatus"),CAST(${command.contractType} AS "osi"."EmployeeContractType"),
        CAST(${command.availabilityStatus} AS "osi"."EmployeeAvailabilityStatus"),${supervisor?.id || null},${supervisor?.user_id || null},
        ${command.hiredAt},${command.contractStartsAt},${command.contractEndsAt},${command.terminatedAt},
        CAST(${command.requestedRole} AS "osi"."TenantMembershipRole"),${command.grantedPermissions},${command.deniedPermissions}
      ) RETURNING *
    `);
    await appendAudit(tx, actor, {
      action: "EMPLOYEE_PROVISIONING_REQUEST_CREATED", entity: ENTITY, entityId: id, requestId: command.requestId,
      afterJson: safeSnapshot(rows[0]), metadataJson: { emailFingerprint: sha256(command.normalizedEmail), employeeCode: command.normalizedEmployeeCode },
    }, options.auditWriter);
    return { request: safeSnapshot(rows[0]), approval: approvalResult.approval, idempotent: false };
  });
  return unwrapApprovalRequestTransactionResult(unwrap(result));
}

export async function proposeEmployeeAdminRole(prisma, context, input, options = {}) {
  const requestId = required(input?.requestId, "requestId");
  const provisioningRequestId = required(input?.provisioningRequestId, "provisioningRequestId");
  const grantedPermissions = normalizePermissions(input?.grantedPermissions, "grantedPermissions");
  const deniedPermissions = normalizePermissions(input?.deniedPermissions, "deniedPermissions");
  if (grantedPermissions.some((item) => deniedPermissions.includes(item))) throw new EmployeeProvisioningError("Permisos superpuestos.", { code: "EMPLOYEE_PROVISIONING_PERMISSIONS_INVALID", status: 400 });
  const hash = payloadHash({ provisioningRequestId, proposedRole: "A", grantedPermissions, deniedPermissions });
  const result = await transaction(prisma, async (tx) => {
    const actor = await resolveActor(tx, context, P.ROLE_A_PROPOSE);
    await advisoryLock(tx, actor.tenantId, `proposal:${requestId}`);
    const row = await findRequest(tx, actor.tenantId, provisioningRequestId);
    if (!row) throw new EmployeeProvisioningError("Solicitud no encontrada.", { code: "EMPLOYEE_PROVISIONING_NOT_FOUND", status: 404 });
    if (!actor.allowed || actor.role !== "A" || row.requested_role !== "A" || row.approval_status !== "PENDING" || row.requester_membership_id === actor.membershipId) {
      return auditedFailure(tx, actor, input, { action: "EMPLOYEE_ADMIN_ROLE_PROPOSAL_UNAUTHORIZED", code: "EMPLOYEE_PROVISIONING_FOUR_EYES_REQUIRED", message: "La propuesta administrativa no cumple separación de funciones." }, options.auditWriter);
    }
    const targetUserId = row.evaluation_snapshot_json?.targetUserId;
    if (targetUserId && targetUserId === actor.userId) return auditedFailure(tx, actor, input, { action: "EMPLOYEE_ADMIN_ROLE_PROPOSAL_UNAUTHORIZED", code: "EMPLOYEE_PROVISIONING_SELF_ADMIN_FORBIDDEN", message: "El empleado objetivo no puede proponer su propio rol." }, options.auditWriter);
    const inserted = await tx.$queryRaw(Prisma.sql`
      INSERT INTO "osi"."employee_admin_role_proposals" (
        "id","tenant_id","provisioning_request_id","proposed_role","proposer_membership_id","proposer_user_id",
        "request_id","payload_hash","granted_permissions","denied_permissions"
      ) VALUES (${randomUUID()},${actor.tenantId},${provisioningRequestId},'A',${actor.membershipId},${actor.userId},${requestId},${hash},${grantedPermissions},${deniedPermissions})
      ON CONFLICT ("tenant_id","request_id") DO NOTHING RETURNING *
    `);
    let proposal = inserted[0];
    if (!proposal) {
      const existing = await tx.$queryRaw(Prisma.sql`SELECT * FROM "osi"."employee_admin_role_proposals" WHERE "tenant_id"=${actor.tenantId} AND "request_id"=${requestId} LIMIT 1`);
      proposal = existing[0];
      if (!proposal || proposal.payload_hash !== hash) return auditedFailure(tx, actor, input, { action: "EMPLOYEE_ADMIN_ROLE_PROPOSAL_CONFLICT", code: "EMPLOYEE_PROVISIONING_IDEMPOTENCY_CONFLICT", message: "requestId fue usado con otra propuesta.", status: 409 }, options.auditWriter);
      return { proposal: { id: proposal.id, provisioningRequestId, proposedRole: "A" }, idempotent: true };
    }
    await appendAudit(tx, actor, { action: "EMPLOYEE_ADMIN_ROLE_PROPOSED", entity: "EMPLOYEE_ADMIN_ROLE_PROPOSAL", entityId: proposal.id, requestId, afterJson: { id: proposal.id, provisioningRequestId, proposedRole: "A", grantedPermissions, deniedPermissions } }, options.auditWriter);
    return { proposal: { id: proposal.id, provisioningRequestId, proposedRole: "A" }, idempotent: false };
  });
  return unwrap(result);
}

function decisionHash({ id, decision, reason, expectedVersion }) {
  return payloadHash({ id, desiredStatus: decision, reason, expectedVersion });
}

export async function decideEmployeeProvisioningRequest(prisma, context, input, options = {}) {
  const id = required(input?.id, "id");
  const requestId = required(input?.requestId, "requestId");
  const reason = required(input?.reason, "reason", 10_000);
  const decision = upper(input?.decision);
  if (!new Set(["APPROVED", "REJECTED"]).has(decision)) throw new EmployeeProvisioningError("Decisión inválida.", { code: "EMPLOYEE_PROVISIONING_INPUT_INVALID", status: 400 });
  const expectedVersion = Number(input?.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new EmployeeProvisioningError("expectedVersion inválida.", { code: "EMPLOYEE_PROVISIONING_INPUT_INVALID", status: 400 });
  const result = await transaction(prisma, async (tx) => {
    const actor = await resolveActor(tx, context, P.APPROVE);
    await advisoryLock(tx, actor.tenantId, `decision:${id}`);
    let row = await findRequest(tx, actor.tenantId, id);
    if (!row) throw new EmployeeProvisioningError("Solicitud no encontrada.", { code: "EMPLOYEE_PROVISIONING_NOT_FOUND", status: 404 });
    const requestedProposalId = row.requested_role === "A" && decision === "APPROVED"
      ? required(input?.proposalId, "proposalId")
      : null;
    const approvalDecisionReason = requestedProposalId
      ? `${reason}\n[MT01C1B2B proposal=${requestedProposalId}]`
      : reason;
    const expectedDecisionHash = decisionHash({ id: row.approval_request_id, decision, reason: approvalDecisionReason, expectedVersion });
    if (row.approval_status !== "PENDING") {
      if (row.approval_status === decision && row.decision_request_id === requestId && row.decision_payload_hash === expectedDecisionHash) {
        return { request: safeSnapshot(row), approval: { id: row.approval_request_id, status: decision, version: row.approval_version }, idempotent: true };
      }
    }
    if (!actor.allowed || row.requester_membership_id === actor.membershipId) return auditedFailure(tx, actor, input, { action: "EMPLOYEE_PROVISIONING_DECISION_UNAUTHORIZED", code: "EMPLOYEE_PROVISIONING_FORBIDDEN", message: "No puede decidir esta solicitud." }, options.auditWriter);
    const targetUserId = row.evaluation_snapshot_json?.targetUserId;
    if (targetUserId && targetUserId === actor.userId) return auditedFailure(tx, actor, input, { action: "EMPLOYEE_PROVISIONING_DECISION_UNAUTHORIZED", code: "EMPLOYEE_PROVISIONING_SELF_APPROVAL_FORBIDDEN", message: "El empleado objetivo no puede decidir su solicitud." }, options.auditWriter);

    let fixedRole = row.requested_role;
    let fixedGranted = row.granted_permissions || [];
    let fixedDenied = row.denied_permissions || [];
    if (decision === "APPROVED" && fixedRole === "A") {
      if (actor.role !== "A" || !actor.effective.has(P.ROLE_A_ASSIGN)) return auditedFailure(tx, actor, input, { action: "EMPLOYEE_ADMIN_ROLE_DECISION_UNAUTHORIZED", code: "EMPLOYEE_PROVISIONING_ROLE_A_ASSIGN_REQUIRED", message: "Falta autorización de segundo administrador." }, options.auditWriter);
      const proposalId = requestedProposalId;
      const proposals = await tx.$queryRaw(Prisma.sql`SELECT * FROM "osi"."employee_admin_role_proposals" WHERE "tenant_id"=${actor.tenantId} AND "id"=${proposalId} AND "provisioning_request_id"=${id} LIMIT 1`);
      const proposal = proposals[0];
      if (!proposal) throw new EmployeeProvisioningError("Propuesta administrativa no encontrada.", { code: "EMPLOYEE_PROVISIONING_NOT_FOUND", status: 404 });
      if (proposal.proposer_membership_id === actor.membershipId || proposal.proposer_membership_id === row.requester_membership_id || proposal.proposer_user_id === targetUserId) {
        return auditedFailure(tx, actor, input, { action: "EMPLOYEE_ADMIN_ROLE_DECISION_UNAUTHORIZED", code: "EMPLOYEE_PROVISIONING_FOUR_EYES_REQUIRED", message: "La decisión requiere cuatro ojos independientes." }, options.auditWriter);
      }
      fixedGranted = effectiveDelegatedPermissions({ role: "A", requested: proposal.granted_permissions, deciderEffective: [...actor.effective], denied: proposal.denied_permissions });
      fixedDenied = [...proposal.denied_permissions].sort();
    } else if (decision === "APPROVED") {
      fixedGranted = effectiveDelegatedPermissions({ role: fixedRole, requested: fixedGranted, deciderEffective: [...actor.effective], denied: fixedDenied });
      fixedDenied = [...fixedDenied].sort();
    }

    const approvalResult = await decideApprovalRequestInTransaction(tx, internalApprovalContext(actor, APPROVAL_PERMISSIONS.DECIDE), {
      id: row.approval_request_id, decision, reason: approvalDecisionReason, requestId, expectedVersion,
    });
    if (approvalResult?.rejected) return approvalResult;
    if (decision === "APPROVED" && !approvalResult.idempotent) {
      await tx.$executeRaw(Prisma.sql`UPDATE "osi"."employee_provisioning_requests" SET "requested_role"=CAST(${fixedRole} AS "osi"."TenantMembershipRole"), "granted_permissions"=${fixedGranted}, "denied_permissions"=${fixedDenied}, "updated_at"=CURRENT_TIMESTAMP WHERE "tenant_id"=${actor.tenantId} AND "id"=${id}`);
    }
    row = await findRequest(tx, actor.tenantId, id);
    await appendAudit(tx, actor, { action: decision === "APPROVED" ? "EMPLOYEE_PROVISIONING_APPROVED" : "EMPLOYEE_PROVISIONING_REJECTED", entity: ENTITY, entityId: id, requestId, afterJson: safeSnapshot(row), metadataJson: { proposalId: fixedRole === "A" ? input?.proposalId : null } }, options.auditWriter);
    return { request: safeSnapshot(row), approval: approvalResult.approval, idempotent: approvalResult.idempotent };
  });
  return unwrapApprovalRequestTransactionResult(unwrap(result));
}

export async function cancelEmployeeProvisioningRequest(prisma, context, input, options = {}) {
  const id = required(input?.id, "id");
  const result = await transaction(prisma, async (tx) => {
    const actor = await resolveActor(tx, context, P.CANCEL);
    await advisoryLock(tx, actor.tenantId, `decision:${id}`);
    const row = await findRequest(tx, actor.tenantId, id);
    if (!row) throw new EmployeeProvisioningError("Solicitud no encontrada.", { code: "EMPLOYEE_PROVISIONING_NOT_FOUND", status: 404 });
    const cancellationHash = payloadHash({
      id: row.approval_request_id,
      status: "CANCELLED",
      reason: required(input?.reason, "reason", 10_000),
      expectedVersion: Number(input?.expectedVersion),
    });
    if (row.approval_status === "CANCELLED" && row.decision_request_id === input?.requestId && row.decision_payload_hash === cancellationHash) {
      return { request: safeSnapshot(row), approval: { id: row.approval_request_id, status: "CANCELLED", version: row.approval_version }, idempotent: true };
    }
    if (!actor.allowed && row.requester_membership_id !== actor.membershipId) return auditedFailure(tx, actor, input, { action: "EMPLOYEE_PROVISIONING_CANCEL_UNAUTHORIZED", code: "EMPLOYEE_PROVISIONING_FORBIDDEN", message: "No puede cancelar esta solicitud." }, options.auditWriter);
    const approvalResult = await transitionApprovalRequestInTransaction(tx, internalApprovalContext(actor, APPROVAL_PERMISSIONS.CANCEL), { id: row.approval_request_id, requestId: input?.requestId, reason: input?.reason, expectedVersion: input?.expectedVersion }, { permission: APPROVAL_PERMISSIONS.CANCEL, status: "CANCELLED", auditAction: "APPROVAL_REQUEST_CANCELLED" });
    if (approvalResult?.rejected) return approvalResult;
    await appendAudit(tx, actor, { action: "EMPLOYEE_PROVISIONING_CANCELLED", entity: ENTITY, entityId: id, requestId: required(input?.requestId, "requestId"), afterJson: safeSnapshot(await findRequest(tx, actor.tenantId, id)) }, options.auditWriter);
    return { request: safeSnapshot(await findRequest(tx, actor.tenantId, id)), approval: approvalResult.approval, idempotent: false };
  });
  return unwrapApprovalRequestTransactionResult(unwrap(result));
}

function canViewPii(actor) { return actor.effective.has(P.VIEW_PII); }

function mapQueryRow(row, actor) {
  return {
    ...safeSnapshot(row),
    approvalStatus: row.approval_status,
    approvalVersion: row.approval_version,
    employeeCode: row.normalized_employee_code,
    email: canViewPii(actor) ? row.normalized_email : undefined,
    createdAt: row.created_at,
  };
}

export async function getEmployeeProvisioningRequest(db, context, id) {
  const actor = await resolveActor(db, context, P.VIEW);
  if (!actor.allowed) throw new EmployeeProvisioningError("No tiene permiso para consultar.", { code: "EMPLOYEE_PROVISIONING_FORBIDDEN", status: 403 });
  const row = await findRequest(db, actor.tenantId, required(id, "id"));
  if (!row) throw new EmployeeProvisioningError("Solicitud no encontrada.", { code: "EMPLOYEE_PROVISIONING_NOT_FOUND", status: 404 });
  return mapQueryRow(row, actor);
}

function encodeCursor(row) { return Buffer.from(JSON.stringify({ createdAt: row.created_at, id: row.id }), "utf8").toString("base64url"); }
function decodeCursor(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), "base64url").toString("utf8"));
    const createdAt = normalizeDate(parsed.createdAt, "cursor.createdAt");
    return { createdAt, id: required(parsed.id, "cursor.id") };
  } catch (cause) { throw new EmployeeProvisioningError("Cursor inválido.", { code: "EMPLOYEE_PROVISIONING_CURSOR_INVALID", status: 400, cause }); }
}

export async function listEmployeeProvisioningRequests(db, context, filters = {}) {
  const actor = await resolveActor(db, context, P.VIEW);
  if (!actor.allowed) throw new EmployeeProvisioningError("No tiene permiso para consultar.", { code: "EMPLOYEE_PROVISIONING_FORBIDDEN", status: 403 });
  const limit = Math.min(Math.max(Number.isFinite(Number(filters.limit)) ? Math.trunc(Number(filters.limit)) : 50, 1), MAX_PAGE_SIZE);
  const cursor = decodeCursor(filters.cursor);
  const conditions = [Prisma.sql`p."tenant_id"=${actor.tenantId}`];
  if (filters.status) conditions.push(Prisma.sql`a."status"=CAST(${upper(filters.status)} AS "osi"."ApprovalRequestStatus")`);
  if (filters.requestedRole) conditions.push(Prisma.sql`p."requested_role"=CAST(${upper(filters.requestedRole)} AS "osi"."TenantMembershipRole")`);
  if (filters.employeeCode) conditions.push(Prisma.sql`p."normalized_employee_code"=${normalizeEmployeeCode(filters.employeeCode)}`);
  if (cursor) conditions.push(Prisma.sql`(p."created_at"<${cursor.createdAt} OR (p."created_at"=${cursor.createdAt} AND p."id"<${cursor.id}))`);
  const rows = await db.$queryRaw(Prisma.sql`
    SELECT p.*, a."status"::text AS "approval_status", a."version" AS "approval_version"
    FROM "osi"."employee_provisioning_requests" p JOIN "osi"."approval_requests" a ON a."tenant_id"=p."tenant_id" AND a."id"=p."approval_request_id"
    WHERE ${Prisma.join(conditions, " AND ")} ORDER BY p."created_at" DESC,p."id" DESC LIMIT ${limit + 1}
  `);
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return { data: page.map((row) => mapQueryRow(row, actor)), nextCursor: hasMore ? encodeCursor(page.at(-1)) : null };
}
