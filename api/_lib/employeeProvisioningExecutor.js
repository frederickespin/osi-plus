import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { appendCommercialAudit } from "./commercialAuditLog.js";
import { EmployeeProvisioningError } from "./employeeProvisioningDomain.js";
import { EMPLOYEE_PROVISIONING_PERMISSIONS as P, NEVER_DELEGABLE } from "./employeeProvisioningPolicy.js";
import { permsForRole } from "./rbac.js";

const SOURCE = "MT01C1B3A_EXECUTOR";
const ENTITY = "EMPLOYEE_PROVISIONING_REQUEST";
const ACTION = "EMPLOYEE_PROVISIONING_MATERIALIZED";
const NO_CREDENTIAL = "!MT01C1B3A-CREDENTIAL-NOT-PROVISIONED!";
const PROVISIONING_BATCH_PREFIX = "MT-01C1B3A";

function required(value, field, max = 191) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.length > max) {
    throw new EmployeeProvisioningError(`${field} inválido.`, {
      code: "EMPLOYEE_PROVISIONING_INPUT_INVALID",
      status: 400,
    });
  }
  return normalized;
}

function canonicalJson(value) {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function upper(value) {
  return String(value ?? "").trim().toUpperCase();
}

function sameStrings(left, right) {
  return canonicalJson([...(left || [])].map(String).sort()) === canonicalJson([...(right || [])].map(String).sort());
}

function subsetStrings(subset, superset) {
  const allowed = new Set((superset || []).map(String));
  return (subset || []).map(String).every((value) => allowed.has(value));
}

function assertDatabase(db) {
  if (!db?.$queryRaw || !db?.$executeRaw || !db?.$transaction) {
    throw new EmployeeProvisioningError("Cliente Prisma requerido.", {
      code: "EMPLOYEE_PROVISIONING_DATABASE_INVALID",
      status: 500,
    });
  }
}

function normalizeCommand(input) {
  const expectedLifecycleVersion = Number(input?.expectedLifecycleVersion);
  if (expectedLifecycleVersion !== 0) {
    throw new EmployeeProvisioningError("expectedLifecycleVersion inválida.", {
      code: "EMPLOYEE_PROVISIONING_INPUT_INVALID",
      status: 400,
    });
  }
  const command = {
    provisioningRequestId: required(input?.provisioningRequestId, "provisioningRequestId"),
    requestId: required(input?.requestId, "requestId"),
    expectedLifecycleVersion,
  };
  return Object.freeze(command);
}

function contextMembershipId(context) {
  if (upper(context?.actorKind || "MEMBERSHIP") === "SYSTEM") {
    throw new EmployeeProvisioningError("Actor de sistema no habilitado para materialización.", {
      code: "EMPLOYEE_PROVISIONING_SYSTEM_ACTOR_UNSUPPORTED",
      status: 403,
    });
  }
  return required(context?.membershipId || context?.actorMembershipId, "context.membershipId");
}

async function resolveActor(tx, context) {
  const tenantId = required(context?.tenantId, "context.tenantId");
  const membershipId = contextMembershipId(context);
  const rows = await tx.$queryRaw(Prisma.sql`
    SELECT m."id", m."tenant_id", m."user_id", m."role"::text AS "role",
      m."status"::text AS "membership_status", m."granted_permissions", m."denied_permissions",
      u."status" AS "user_status", t."status"::text AS "tenant_status", t."code" AS "tenant_code"
    FROM "osi"."tenant_memberships" m
    JOIN "osi"."osi_users" u ON u."id"=m."user_id"
    JOIN "osi"."tenants" t ON t."id"=m."tenant_id"
    WHERE m."tenant_id"=${tenantId} AND m."id"=${membershipId}
    LIMIT 1
  `);
  const row = rows[0];
  if (!row) throw new EmployeeProvisioningError("Recurso no encontrado.", { code: "EMPLOYEE_PROVISIONING_NOT_FOUND", status: 404 });
  if (upper(row.user_status) !== "ACTIVE" || upper(row.membership_status) !== "ACTIVE" || upper(row.tenant_status) !== "ACTIVE") {
    throw new EmployeeProvisioningError("Identidad empresarial inactiva.", { code: "EMPLOYEE_PROVISIONING_ACTOR_INACTIVE", status: 403 });
  }
  const denied = new Set((row.denied_permissions || []).map(String));
  const effective = new Set([...permsForRole(row.role), ...(row.granted_permissions || []).map(String)].filter((permission) => !denied.has(permission)));
  return {
    tenantId,
    membershipId: row.id,
    userId: row.user_id,
    role: upper(row.role),
    tenantCode: row.tenant_code,
    allowed: effective.has(P.MATERIALIZE),
  };
}

async function advisoryLock(tx, key, options) {
  const mapped = typeof options?.advisoryLockKeyMapper === "function"
    ? required(options.advisoryLockKeyMapper(key), "advisoryLockKey", 500)
    : key;
  await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${mapped}, 0))::text AS "locked"`);
}

async function findCommandAudit(tx, tenantId, requestId) {
  const rows = await tx.$queryRaw(Prisma.sql`
    SELECT "entity_id", "metadata_json"
    FROM "osi"."commercial_audit_logs"
    WHERE "tenant_id"=${tenantId} AND "request_id"=${requestId}
      AND "action"=${ACTION} AND "entity"=${ENTITY}
    ORDER BY "created_at" ASC, "id" ASC
    LIMIT 1
  `);
  return rows[0] || null;
}

async function findRequest(tx, tenantId, provisioningRequestId, lock = false) {
  const lockSql = lock ? Prisma.sql`FOR UPDATE OF p` : Prisma.empty;
  const rows = await tx.$queryRaw(Prisma.sql`
    SELECT p.*, a."approval_type", a."entity" AS "approval_entity", a."entity_id" AS "approval_entity_id",
      a."status"::text AS "approval_status", a."version" AS "approval_version",
      a."requester_user_id", a."requester_membership_id", a."decider_user_id", a."decider_membership_id",
      a."decision_request_id", a."evaluation_snapshot_json"
    FROM "osi"."employee_provisioning_requests" p
    JOIN "osi"."approval_requests" a ON a."tenant_id"=p."tenant_id" AND a."id"=p."approval_request_id"
    WHERE p."tenant_id"=${tenantId} AND p."id"=${provisioningRequestId}
    LIMIT 1 ${lockSql}
  `);
  return rows[0] || null;
}

function assertCanonicalRequest(row) {
  const email = String(row.normalized_email || "");
  const code = String(row.normalized_employee_code || "");
  if (email !== email.trim().toLowerCase() || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,63}$/.test(email) || /[^\x20-\x7e]/.test(email)) {
    throw new EmployeeProvisioningError("Correo de provisión no canónico.", { code: "EMPLOYEE_PROVISIONING_EMAIL_INVALID", status: 409 });
  }
  if (code !== code.trim().toUpperCase() || !code || /\s/.test(code)) {
    throw new EmployeeProvisioningError("Código laboral no canónico.", { code: "EMPLOYEE_PROVISIONING_CODE_INVALID", status: 409 });
  }
  if (!row.employment_status || !row.availability_status) {
    throw new EmployeeProvisioningError("Datos laborales incompletos.", { code: "EMPLOYEE_PROVISIONING_LABOR_DATA_REQUIRED", status: 409 });
  }
  if (row.employment_status === "TERMINATED") {
    throw new EmployeeProvisioningError("Una relación terminada no puede iniciar en PROVISIONED_INACTIVE.", {
      code: "EMPLOYEE_PROVISIONING_LABOR_STATE_INVALID",
      status: 409,
    });
  }
}

async function findApprovalEvidence(tx, row) {
  const audits = await tx.$queryRaw(Prisma.sql`
    SELECT "after_json", "metadata_json", "request_id"
    FROM "osi"."commercial_audit_logs"
    WHERE "tenant_id"=${row.tenant_id} AND "entity"=${ENTITY} AND "entity_id"=${row.id}
      AND "action"='EMPLOYEE_PROVISIONING_APPROVED'
      AND "request_id"=${row.decision_request_id}
    ORDER BY "created_at" DESC, "id" DESC
    LIMIT 1
  `);
  const evidence = audits[0];
  if (!evidence || evidence.after_json?.requestedRole !== row.requested_role
    || !sameStrings(evidence.after_json?.grantedPermissions, row.granted_permissions)
    || !sameStrings(evidence.after_json?.deniedPermissions, row.denied_permissions)
    || (row.granted_permissions || []).some((permission) => (row.denied_permissions || []).includes(permission) || NEVER_DELEGABLE.has(permission))) {
    throw new EmployeeProvisioningError("La decisión aprobada no coincide con la provisión.", {
      code: "EMPLOYEE_PROVISIONING_APPROVAL_EVIDENCE_INVALID",
      status: 409,
    });
  }
  return evidence;
}

async function assertRoleA(tx, row, evidence) {
  if (row.requested_role !== "A") return null;
  const proposalId = required(evidence.metadata_json?.proposalId, "approval.proposalId");
  const proposals = await tx.$queryRaw(Prisma.sql`
    SELECT * FROM "osi"."employee_admin_role_proposals"
    WHERE "tenant_id"=${row.tenant_id} AND "id"=${proposalId}
      AND "provisioning_request_id"=${row.id} AND "proposed_role"='A'
    LIMIT 1
  `);
  const proposal = proposals[0];
  const actors = [row.requester_membership_id, proposal?.proposer_membership_id, row.decider_membership_id];
  const targetUserId = row.evaluation_snapshot_json?.targetUserId || null;
  if (!proposal || new Set(actors).size !== 3
    || (targetUserId && [row.requester_user_id, proposal.proposer_user_id, row.decider_user_id].includes(targetUserId))
    || !subsetStrings(row.granted_permissions, proposal.granted_permissions)
    || !sameStrings(proposal.denied_permissions, row.denied_permissions)) {
    throw new EmployeeProvisioningError("La aprobación de rol A no cumple cuatro ojos.", {
      code: "EMPLOYEE_PROVISIONING_FOUR_EYES_REQUIRED",
      status: 409,
    });
  }
  return proposalId;
}

async function resolveIdentity(tx, row, ids, now) {
  const matches = await tx.$queryRaw(Prisma.sql`
    SELECT "id", "email", "normalized_email", "status"
    FROM "osi"."osi_users"
    WHERE "normalized_email"=${row.normalized_email}
       OR LOWER(BTRIM("email"))=${row.normalized_email}
    ORDER BY "id"
    FOR UPDATE
  `);
  const targetUserId = row.evaluation_snapshot_json?.targetUserId || null;
  if (row.identity_mode === "EXISTING_GLOBAL_USER") {
    if (!targetUserId) throw new EmployeeProvisioningError("Identidad global objetivo requerida.", { code: "EMPLOYEE_PROVISIONING_TARGET_REQUIRED", status: 409 });
    const target = matches.find((candidate) => candidate.id === targetUserId);
    if (!target || matches.some((candidate) => candidate.id !== targetUserId)) {
      throw new EmployeeProvisioningError("La identidad global no coincide con la solicitud aprobada.", { code: "EMPLOYEE_PROVISIONING_EMAIL_CONFLICT", status: 409 });
    }
    return { userId: target.id, created: false };
  }
  if (row.identity_mode !== "NEW_GLOBAL_USER" || targetUserId) {
    throw new EmployeeProvisioningError("Modo de identidad inconsistente.", { code: "EMPLOYEE_PROVISIONING_IDENTITY_MODE_INVALID", status: 409 });
  }
  if (matches.length) throw new EmployeeProvisioningError("La identidad global ya está reservada.", { code: "EMPLOYEE_PROVISIONING_EMAIL_CONFLICT", status: 409 });
  const joinDate = (row.contract_starts_at || row.hired_at || now).toISOString().slice(0, 10);
  const code = `PENDING-${ids.userId}`;
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "osi"."osi_users" (
      "id","code","name","email","normalized_email","phone","role","status","department","joinDate","passwordHash","updatedAt"
    ) VALUES (
      ${ids.userId},${code},'Identidad pendiente de activación',${row.normalized_email},${row.normalized_email},'',${row.requested_role},'inactive',
      ${row.department_code},${joinDate},${NO_CREDENTIAL},${now}
    )
  `);
  return { userId: ids.userId, created: true };
}

function publicResult(row, ids, idempotent) {
  return Object.freeze({
    provisioningRequestId: row.id,
    lifecycleStatus: "PROVISIONED_INACTIVE",
    lifecycleVersion: 1,
    userId: ids.userId,
    membershipId: ids.membershipId,
    employeeProfileId: ids.profileId,
    accessEnabled: false,
    credentialProvisioned: false,
    idempotent,
  });
}

async function idempotentResult(tx, actor, command, audit) {
  if (audit.entity_id !== command.provisioningRequestId) {
    throw new EmployeeProvisioningError("requestId fue usado con otro payload.", {
      code: "EMPLOYEE_PROVISIONING_IDEMPOTENCY_CONFLICT",
      status: 409,
    });
  }
  const row = await findRequest(tx, actor.tenantId, command.provisioningRequestId, false);
  if (!row || row.lifecycle_status !== "PROVISIONED_INACTIVE" || !row.provisioned_user_id || !row.provisioned_membership_id) {
    throw new EmployeeProvisioningError("Materialización idempotente inconsistente.", { code: "EMPLOYEE_PROVISIONING_INCONSISTENT", status: 409 });
  }
  const profiles = await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "osi"."employee_profiles"
    WHERE "tenant_id"=${actor.tenantId} AND "membership_id"=${row.provisioned_membership_id}
      AND "user_id"=${row.provisioned_user_id}
    LIMIT 1
  `);
  if (!profiles[0]) throw new EmployeeProvisioningError("Perfil materializado no encontrado.", { code: "EMPLOYEE_PROVISIONING_INCONSISTENT", status: 409 });
  return publicResult(row, { userId: row.provisioned_user_id, membershipId: row.provisioned_membership_id, profileId: profiles[0].id }, true);
}

async function appendMaterializationAudit(tx, actor, command, result, proposalId, auditWriter) {
  return (auditWriter || appendCommercialAudit)(tx, {
    tenantId: actor.tenantId,
    actorKind: "MEMBERSHIP",
    actorMembershipId: actor.membershipId,
  }, {
    source: SOURCE,
    critical: true,
    action: ACTION,
    entity: ENTITY,
    entityId: command.provisioningRequestId,
    requestId: command.requestId,
    correlationId: command.requestId,
    afterJson: {
      provisioningRequestId: command.provisioningRequestId,
      lifecycleStatus: result.lifecycleStatus,
      lifecycleVersion: result.lifecycleVersion,
      userId: result.userId,
      membershipId: result.membershipId,
      employeeProfileId: result.employeeProfileId,
      accessEnabled: false,
    },
    metadataJson: {
      credentialState: "NOT_PROVISIONED",
      membershipState: "INACTIVE",
      roleAProposalId: proposalId,
    },
  });
}

export async function materializeApprovedEmployeeProvisioning(prisma, context, input, options = {}) {
  assertDatabase(prisma);
  const command = normalizeCommand(input);
  const result = await prisma.$transaction(async (tx) => {
    const actor = await resolveActor(tx, context);
    await advisoryLock(tx, `requestId:${actor.tenantId}:${command.requestId}`, options);
    if (!actor.allowed) {
      throw new EmployeeProvisioningError("No tiene permiso para materializar provisiones.", { code: "EMPLOYEE_PROVISIONING_FORBIDDEN", status: 403 });
    }
    const priorAudit = await findCommandAudit(tx, actor.tenantId, command.requestId);
    if (priorAudit) return idempotentResult(tx, actor, command, priorAudit);

    const keyRow = await findRequest(tx, actor.tenantId, command.provisioningRequestId, false);
    if (!keyRow) throw new EmployeeProvisioningError("Solicitud no encontrada.", { code: "EMPLOYEE_PROVISIONING_NOT_FOUND", status: 404 });
    assertCanonicalRequest(keyRow);
    await advisoryLock(tx, `normalizedEmail:${keyRow.normalized_email}`, options);
    await advisoryLock(tx, `employeeCode:${actor.tenantId}:${keyRow.normalized_employee_code}`, options);

    const row = await findRequest(tx, actor.tenantId, command.provisioningRequestId, true);
    if (!row) throw new EmployeeProvisioningError("Solicitud no encontrada.", { code: "EMPLOYEE_PROVISIONING_NOT_FOUND", status: 404 });
    assertCanonicalRequest(row);
    if (row.approval_type !== "EMPLOYEE_PROVISIONING" || row.approval_entity !== ENTITY || row.approval_entity_id !== row.id || row.approval_status !== "APPROVED") {
      throw new EmployeeProvisioningError("La solicitud no tiene una aprobación válida.", { code: "EMPLOYEE_PROVISIONING_NOT_APPROVED", status: 409 });
    }
    if (row.lifecycle_status !== null || row.lifecycle_version !== command.expectedLifecycleVersion || row.provisioned_user_id || row.provisioned_membership_id) {
      throw new EmployeeProvisioningError("La solicitud ya fue materializada.", { code: "EMPLOYEE_PROVISIONING_ALREADY_MATERIALIZED", status: 409 });
    }
    const evidence = await findApprovalEvidence(tx, row);
    const proposalId = await assertRoleA(tx, row, evidence);

    const competingReservations = await tx.$queryRaw(Prisma.sql`
      SELECT p."id"
      FROM "osi"."employee_provisioning_requests" p
      JOIN "osi"."approval_requests" a ON a."tenant_id"=p."tenant_id" AND a."id"=p."approval_request_id"
      WHERE p."tenant_id"=${actor.tenantId} AND p."id"<>${row.id}
        AND a."status" IN ('PENDING','APPROVED')
        AND (p."normalized_email"=${row.normalized_email} OR p."normalized_employee_code"=${row.normalized_employee_code})
        AND (p."created_at" < ${row.created_at} OR (p."created_at" = ${row.created_at} AND p."id" < ${row.id}))
      UNION ALL
      SELECT e."id" FROM "osi"."employee_profiles" e
      WHERE e."tenant_id"=${actor.tenantId} AND e."normalized_employee_code"=${row.normalized_employee_code}
      LIMIT 1
    `);
    if (competingReservations[0]) throw new EmployeeProvisioningError("Correo o código laboral reservado.", { code: "EMPLOYEE_PROVISIONING_RESERVATION_CONFLICT", status: 409 });

    const now = options.now instanceof Date ? options.now : new Date();
    const ids = {
      userId: options.ids?.userId || randomUUID(),
      membershipId: options.ids?.membershipId || randomUUID(),
      profileId: options.ids?.profileId || randomUUID(),
    };
    const identity = await resolveIdentity(tx, row, ids, now);
    ids.userId = identity.userId;
    if (actor.userId === ids.userId) {
      throw new EmployeeProvisioningError("No puede materializar su propia identidad empresarial.", {
        code: "EMPLOYEE_PROVISIONING_SELF_ASSIGNMENT_FORBIDDEN",
        status: 403,
      });
    }
    const existingMemberships = await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "osi"."tenant_memberships"
      WHERE "tenant_id"=${actor.tenantId} AND "user_id"=${ids.userId}
      LIMIT 1 FOR UPDATE
    `);
    if (row.supervisor_user_id && row.supervisor_user_id === ids.userId) {
      throw new EmployeeProvisioningError("La autosupervisión no está permitida.", { code: "EMPLOYEE_PROVISIONING_SELF_SUPERVISION_FORBIDDEN", status: 409 });
    }
    if (existingMemberships[0]) throw new EmployeeProvisioningError("La identidad ya pertenece a la empresa.", { code: "EMPLOYEE_PROVISIONING_MEMBERSHIP_CONFLICT", status: 409 });
    if (row.supervisor_membership_id) {
      const supervisors = await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "osi"."tenant_memberships"
        WHERE "tenant_id"=${actor.tenantId} AND "id"=${row.supervisor_membership_id}
          AND "user_id"=${row.supervisor_user_id} AND "status"='ACTIVE'
        LIMIT 1
      `);
      if (!supervisors[0]) throw new EmployeeProvisioningError("Supervisor empresarial inválido.", { code: "EMPLOYEE_PROVISIONING_SUPERVISOR_INVALID", status: 409 });
    }

    const batchId = `${PROVISIONING_BATCH_PREFIX}:${command.requestId}`.slice(0, 128);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "osi"."tenant_memberships" (
        "id","tenant_id","user_id","role","status","granted_permissions","denied_permissions","is_default",
        "authorization_version","provisioning_source","provisioning_batch_id","updated_at"
      ) VALUES (
        ${ids.membershipId},${actor.tenantId},${ids.userId},CAST(${row.requested_role} AS "osi"."TenantMembershipRole"),'INACTIVE',
        ${row.granted_permissions || []},${row.denied_permissions || []},false,1,'MANUAL',${batchId},${now}
      )
    `);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "osi"."employee_profiles" (
        "id","tenant_id","membership_id","user_id","employee_code","normalized_employee_code","job_title","department_code",
        "employment_status","contract_type","availability_status","supervisor_membership_id","supervisor_user_id",
        "hired_at","contract_starts_at","contract_ends_at","terminated_at","provisioning_source","provisioning_batch_id","updated_at"
      ) VALUES (
        ${ids.profileId},${actor.tenantId},${ids.membershipId},${ids.userId},${row.normalized_employee_code},${row.normalized_employee_code},
        ${row.job_title},${row.department_code},CAST(${row.employment_status} AS "osi"."EmployeeEmploymentStatus"),
        CAST(${row.contract_type} AS "osi"."EmployeeContractType"),CAST(${row.availability_status} AS "osi"."EmployeeAvailabilityStatus"),
        ${row.supervisor_membership_id},${row.supervisor_user_id},${row.hired_at},${row.contract_starts_at},${row.contract_ends_at},${row.terminated_at},
        'MANUAL',${batchId},${now}
      )
    `);
    if (typeof options.beforeLifecycle === "function") await options.beforeLifecycle(tx, row);
    const updated = await tx.$queryRaw(Prisma.sql`
      UPDATE "osi"."employee_provisioning_requests"
      SET "lifecycle_status"='PROVISIONED_INACTIVE', "lifecycle_version"=1,
        "provisioned_user_id"=${ids.userId}, "provisioned_membership_id"=${ids.membershipId},
        "provisioned_at"=${now}, "updated_at"=${now}
      WHERE "tenant_id"=${actor.tenantId} AND "id"=${row.id}
        AND "lifecycle_status" IS NULL AND "lifecycle_version"=0
      RETURNING *
    `);
    if (updated.length !== 1) throw new EmployeeProvisioningError("Conflicto de materialización.", { code: "EMPLOYEE_PROVISIONING_CONCURRENCY_CONFLICT", status: 409 });
    const materialized = publicResult(updated[0], ids, false);
    await appendMaterializationAudit(tx, actor, command, materialized, proposalId, options.auditWriter);
    return materialized;
  }, {
    maxWait: options.maxWaitMs || 3_000,
    timeout: options.timeoutMs || 10_000,
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  });
  return result;
}

export const MT01C1B3A_EXECUTOR_POLICY = Object.freeze({
  source: SOURCE,
  action: ACTION,
  initialUserStatus: "inactive",
  initialMembershipStatus: "INACTIVE",
  lifecycleStatus: "PROVISIONED_INACTIVE",
  credentialProvisioned: false,
  runtimeEnabled: false,
  lockOrder: Object.freeze(["requestId", "normalizedEmail", "employeeCode"]),
});
