/* eslint-disable no-console */
import { performance } from "node:perf_hooks";
import {
  APPROVAL_PERMISSIONS,
  cancelApprovalRequest,
  createApprovalRequest,
  decideApprovalRequest,
  expireApprovalRequest,
  getApprovalRequest,
  listApprovalRequests,
  reassignApprovalRequest,
} from "../api/_lib/approvalRequest.js";
import {
  APPROVAL_PERSISTENCE_MODES,
  approvalPersistenceMode,
  createApprovalWithCompatibility,
} from "../api/_lib/approvalRequestAdapter.js";
import { analyzeHistoricalApprovalRequests } from "./db01e-dry-run.mjs";
import { createDb01ePrisma } from "./db01e-lib.mjs";

const prisma = createDb01ePrisma();
const results = [];

function check(name, condition, details = undefined) {
  if (!condition) throw new Error(`Falló: ${name}${details ? ` (${details})` : ""}`);
  results.push({ name, passed: true, ...(details ? { details } : {}) });
}

async function expectError(name, work, code) {
  try {
    await work();
    throw new Error(`${name}: se aceptó una operación inválida`);
  } catch (error) {
    if (String(error?.message || "").includes("se aceptó una operación inválida")) throw error;
    check(name, !code || error?.code === code, `code=${error?.code || error?.meta?.code || "DATABASE"}`);
    return error;
  }
}

function context(tenantId, membershipId, permissions = []) {
  return { tenantId, actorKind: "MEMBERSHIP", actorMembershipId: membershipId, permissions };
}

const allPermissions = Object.values(APPROVAL_PERMISSIONS);
const tenantOne = "db01e-tenant-one";
const tenantTwo = "db01e-tenant-two";
const requester = { userId: "db01e-user-requester", membershipId: "db01e-member-requester" };
const approverOne = { userId: "db01e-user-approver-one", membershipId: "db01e-member-approver-one" };
const approverTwo = { userId: "db01e-user-approver-two", membershipId: "db01e-member-approver-two" };
const tenantTwoActor = { userId: requester.userId, membershipId: "db01e-member-tenant-two" };

async function seed() {
  await prisma.$executeRawUnsafe(`
    INSERT INTO "osi"."osi_users"
      ("id","code","name","email","phone","role","status","joinDate","passwordHash","updatedAt")
    VALUES
      ('${requester.userId}','DB01E-R','Synthetic Requester','db01e.requester@example.invalid','+10000000001','V','active','2026-01-01','$synthetic$',CURRENT_TIMESTAMP),
      ('${approverOne.userId}','DB01E-A1','Synthetic Approver One','db01e.approver1@example.invalid','+10000000002','A','active','2026-01-01','$synthetic$',CURRENT_TIMESTAMP),
      ('${approverTwo.userId}','DB01E-A2','Synthetic Approver Two','db01e.approver2@example.invalid','+10000000003','A','active','2026-01-01','$synthetic$',CURRENT_TIMESTAMP)
    ON CONFLICT ("id") DO NOTHING
  `);
  await prisma.$executeRawUnsafe(`
    INSERT INTO "osi"."tenants"
      ("id","code","name","legal_name","status","provisioning_source","updated_at")
    VALUES
      ('${tenantOne}','DB01E-ONE','DB-01E Synthetic One','DB-01E Synthetic One','ACTIVE','MANUAL',CURRENT_TIMESTAMP),
      ('${tenantTwo}','DB01E-TWO','DB-01E Synthetic Two','DB-01E Synthetic Two','ACTIVE','MANUAL',CURRENT_TIMESTAMP)
    ON CONFLICT ("id") DO NOTHING
  `);
  await prisma.$executeRawUnsafe(`
    INSERT INTO "osi"."tenant_memberships"
      ("id","tenant_id","user_id","role","status","granted_permissions","is_default","provisioning_source","updated_at")
    VALUES
      ('${requester.membershipId}','${tenantOne}','${requester.userId}','V','ACTIVE',ARRAY[${allPermissions.map((p) => `'${p}'`).join(",")}],true,'MANUAL',CURRENT_TIMESTAMP),
      ('${approverOne.membershipId}','${tenantOne}','${approverOne.userId}','A','ACTIVE',ARRAY[${allPermissions.map((p) => `'${p}'`).join(",")}],false,'MANUAL',CURRENT_TIMESTAMP),
      ('${approverTwo.membershipId}','${tenantOne}','${approverTwo.userId}','A','ACTIVE',ARRAY[${allPermissions.map((p) => `'${p}'`).join(",")}],false,'MANUAL',CURRENT_TIMESTAMP),
      ('${tenantTwoActor.membershipId}','${tenantTwo}','${tenantTwoActor.userId}','V','ACTIVE',ARRAY[${allPermissions.map((p) => `'${p}'`).join(",")}],false,'MANUAL',CURRENT_TIMESTAMP)
    ON CONFLICT ("id") DO NOTHING
  `);
}

function createInput(sequence, extra = {}) {
  return {
    approvalType: "EXCEPTIONAL_MARGIN",
    entity: "QUOTE",
    entityId: `quote-${sequence}`,
    requestReason: "Margen inferior al mínimo configurado.",
    evaluationSnapshot: { margin: 4.5, password: "never-store" },
    requestId: `create-${sequence}`,
    dueAt: new Date(Date.now() + 60 * 60 * 1000),
    ...extra,
  };
}

try {
  await seed();
  const requesterContext = context(tenantOne, requester.membershipId);
  const approverOneContext = context(tenantOne, approverOne.membershipId);
  const approverTwoContext = context(tenantOne, approverTwo.membershipId);
  const tenantTwoContext = context(tenantTwo, tenantTwoActor.membershipId);

  check("feature flag relacional desactivado por defecto", approvalPersistenceMode({}) === APPROVAL_PERSISTENCE_MODES.LEGACY_ONLY);
  const legacyOnly = await createApprovalWithCompatibility({
    mode: APPROVAL_PERSISTENCE_MODES.LEGACY_ONLY,
    legacyCreate: async () => ({ id: "legacy-only" }),
  });
  check("modo por defecto conserva autoridad heredada", legacyOnly.authority === "LEGACY" && legacyOnly.relational === null);

  const baseInput = createInput("base");
  const created = await createApprovalRequest(prisma, requesterContext, baseInput);
  check("creación multiempresa", created.approval.tenantId === tenantOne && created.approval.requesterMembershipId === requester.membershipId);
  check("snapshot sanitiza datos sensibles", created.approval.evaluationSnapshotJson.password === "[REDACTED]");
  const createAudits = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS count FROM "osi"."commercial_audit_logs" WHERE "tenant_id"=$1 AND "entity_id"=$2 AND "action"='APPROVAL_REQUEST_CREATED'`,
    tenantOne, created.approval.id,
  );
  check("creación auditada en misma transacción", createAudits[0].count === 1);

  const sameCreate = await Promise.all(Array.from({ length: 6 }, () =>
    createApprovalRequest(prisma, requesterContext, baseInput)));
  check("idempotencia concurrente de creación", new Set(sameCreate.map((item) => item.approval.id)).size === 1);
  await expectError(
    "requestId con payload distinto produce conflicto",
    () => createApprovalRequest(prisma, requesterContext, { ...baseInput, requestReason: "Otro motivo" }),
    "APPROVAL_IDEMPOTENCY_CONFLICT",
  );

  await expectError(
    "acceso cruzado devuelve 404",
    () => getApprovalRequest(prisma, tenantTwoContext, created.approval.id),
    "APPROVAL_NOT_FOUND",
  );
  await expectError(
    "FK compuesta rechaza solicitante cruzado",
    () => prisma.$executeRawUnsafe(
      `INSERT INTO "osi"."approval_requests"
       ("id","tenant_id","approval_type","entity","entity_id","requester_user_id","requester_membership_id",
        "request_reason","evaluation_snapshot_json","request_id","payload_hash")
       VALUES ('cross-direct',$1,'TEST','QUOTE','q-cross',$2,$3,'x','{}','cross-direct',repeat('a',64))`,
      tenantOne, tenantTwoActor.userId, tenantTwoActor.membershipId,
    ),
  );

  const noPermission = context(tenantOne, requester.membershipId);
  await prisma.$executeRawUnsafe(
    `UPDATE "osi"."tenant_memberships"
     SET "granted_permissions"=array_remove("granted_permissions", '${APPROVAL_PERMISSIONS.CREATE}'),
         "denied_permissions"=ARRAY['${APPROVAL_PERMISSIONS.CREATE}']
     WHERE "id"='${requester.membershipId}'`,
  );
  await expectError("RBAC deniega creación", () => createApprovalRequest(prisma, noPermission, createInput("forbidden")), "APPROVAL_FORBIDDEN");
  const forbiddenAudit = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS count FROM "osi"."commercial_audit_logs" WHERE "tenant_id"=$1 AND "action"='APPROVAL_REQUEST_CREATE_UNAUTHORIZED'`, tenantOne,
  );
  check("intento no autorizado queda auditado", forbiddenAudit[0].count === 1);
  await prisma.$executeRawUnsafe(
    `UPDATE "osi"."tenant_memberships"
     SET "denied_permissions"=ARRAY[]::text[],
         "granted_permissions"=array_append("granted_permissions", '${APPROVAL_PERMISSIONS.CREATE}')
     WHERE "id"='${requester.membershipId}'`,
  );

  const selfRequest = await createApprovalRequest(prisma, requesterContext, createInput("self"));
  await expectError(
    "FK compuesta rechaza aprobador cruzado",
    () => prisma.$executeRawUnsafe(
      `UPDATE "osi"."approval_requests"
       SET "assigned_approver_user_id"=$1, "assigned_approver_membership_id"=$2, "version"="version"+1
       WHERE "id"=$3`, tenantTwoActor.userId, tenantTwoActor.membershipId, selfRequest.approval.id,
    ),
  );
  await expectError(
    "separación de funciones",
    () => decideApprovalRequest(prisma, requesterContext, {
      id: selfRequest.approval.id, decision: "APPROVED", reason: "Yo mismo", requestId: "decision-self", expectedVersion: 1,
    }),
    "APPROVAL_SEPARATION_OF_DUTIES",
  );

  const assigned = await createApprovalRequest(prisma, requesterContext, createInput("assigned"), {
    assignedApproverMembershipId: approverOne.membershipId,
  });
  await expectError(
    "sólo decide el aprobador asignado",
    () => decideApprovalRequest(prisma, approverTwoContext, {
      id: assigned.approval.id, decision: "APPROVED", reason: "No asignado", requestId: "decision-not-assigned", expectedVersion: 1,
    }),
    "APPROVAL_NOT_ASSIGNED",
  );
  const approved = await decideApprovalRequest(prisma, approverOneContext, {
    id: assigned.approval.id, decision: "APPROVED", reason: "Validado", requestId: "decision-assigned", expectedVersion: 1,
  });
  check("transición PENDING a APPROVED", approved.approval.status === "APPROVED" && approved.approval.version === 2);
  const approvedRetry = await decideApprovalRequest(prisma, approverOneContext, {
    id: assigned.approval.id, decision: "APPROVED", reason: "Validado", requestId: "decision-assigned", expectedVersion: 1,
  });
  check("reintento de decisión devuelve resultado existente", approvedRetry.idempotent && approvedRetry.approval.id === approved.approval.id);
  const rejectedRequest = await createApprovalRequest(prisma, requesterContext, createInput("rejected"));
  const rejected = await decideApprovalRequest(prisma, approverOneContext, {
    id: rejectedRequest.approval.id, decision: "REJECTED", reason: "Evidencia insuficiente",
    requestId: "decision-rejected", expectedVersion: 1,
  });
  check("transición PENDING a REJECTED", rejected.approval.status === "REJECTED");
  const reevaluation = await createApprovalRequest(prisma, requesterContext, createInput("reevaluation", {
    previousRequestId: rejected.approval.id,
  }));
  check("reevaluación crea solicitud relacionada", reevaluation.approval.previousRequestId === rejected.approval.id);
  await expectError(
    "decisión final no se modifica",
    () => decideApprovalRequest(prisma, approverOneContext, {
      id: assigned.approval.id, decision: "REJECTED", reason: "Cambio", requestId: "decision-change", expectedVersion: 2,
    }),
    "APPROVAL_FINAL_IMMUTABLE",
  );
  await expectError(
    "trigger protege solicitud terminal",
    () => prisma.$executeRawUnsafe(`UPDATE "osi"."approval_requests" SET "request_reason"='mutated', "version"="version"+1 WHERE "id"=$1`, assigned.approval.id),
  );

  const race = await createApprovalRequest(prisma, requesterContext, createInput("race"));
  const raceResults = await Promise.allSettled([
    decideApprovalRequest(prisma, approverOneContext, {
      id: race.approval.id, decision: "APPROVED", reason: "A", requestId: "race-a", expectedVersion: 1,
    }),
    decideApprovalRequest(prisma, approverTwoContext, {
      id: race.approval.id, decision: "REJECTED", reason: "B", requestId: "race-b", expectedVersion: 1,
    }),
  ]);
  check("dos decisores producen una sola decisión", raceResults.filter((item) => item.status === "fulfilled").length === 1);
  const raceRow = await getApprovalRequest(prisma, approverOneContext, race.approval.id);
  check("concurrencia optimista incrementa una versión", raceRow.version === 2 && new Set(["APPROVED", "REJECTED"]).has(raceRow.status));
  const raceAudit = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS count FROM "osi"."commercial_audit_logs"
     WHERE "tenant_id"=$1 AND "entity_id"=$2 AND "action"='APPROVAL_REQUEST_CONCURRENCY_CONFLICT'`,
    tenantOne, race.approval.id,
  );
  check("conflicto concurrente queda auditado", raceAudit[0].count === 1);

  const expired = await createApprovalRequest(prisma, requesterContext, createInput("expired", {
    dueAt: new Date(Date.now() + 100),
  }));
  await new Promise((resolve) => setTimeout(resolve, 140));
  await expectError(
    "decisión vencida es rechazada",
    () => decideApprovalRequest(prisma, approverOneContext, {
      id: expired.approval.id, decision: "APPROVED", reason: "Tarde", requestId: "decision-expired", expectedVersion: 1,
    }),
    "APPROVAL_EXPIRED",
  );
  check("vencimiento queda persistido", (await getApprovalRequest(prisma, approverOneContext, expired.approval.id)).status === "EXPIRED");

  const blocked = await createApprovalRequest(prisma, requesterContext, createInput("blocked", {
    riskEvaluation: {
      result: "BLOCKED", rulesVersion: "risk-v1", rulesHash: "a".repeat(64),
      factors: [{ code: "ZONE", score: 90 }], reasons: ["Zona restringida"],
    },
  }));
  await expectError(
    "RiskEngine BLOCKED no se aprueba normalmente",
    () => decideApprovalRequest(prisma, approverOneContext, {
      id: blocked.approval.id, decision: "APPROVED", reason: "Sin override", requestId: "decision-blocked", expectedVersion: 1,
    }),
    "APPROVAL_RISK_BLOCKED",
  );

  const cancelled = await createApprovalRequest(prisma, requesterContext, createInput("cancel"));
  const cancelResult = await cancelApprovalRequest(prisma, requesterContext, {
    id: cancelled.approval.id, reason: "Ya no se requiere", requestId: "cancel-1", expectedVersion: 1,
  });
  check("cancelación terminal", cancelResult.approval.status === "CANCELLED");

  const reassigned = await createApprovalRequest(prisma, requesterContext, createInput("reassign"));
  const reassignResult = await reassignApprovalRequest(prisma, approverOneContext, {
    id: reassigned.approval.id, assignedApproverMembershipId: approverTwo.membershipId,
    requestId: "reassign-1", expectedVersion: 1,
  });
  check("reasignación validada por tenant", reassignResult.approval.assignedApproverMembershipId === approverTwo.membershipId && reassignResult.approval.version === 2);

  const systemExpiry = await createApprovalRequest(prisma, requesterContext, createInput("system-expiry"));
  const systemExpired = await expireApprovalRequest(prisma, { tenantId: tenantOne, actorKind: "SYSTEM" }, {
    id: systemExpiry.approval.id, requestId: "system-expiry-1", expectedVersion: 1,
  });
  check("actor del sistema puede expirar", systemExpired.approval.status === "EXPIRED");

  await prisma.$executeRawUnsafe(`CREATE TABLE "osi"."db01e_legacy_projection_probe" ("id" text PRIMARY KEY, "payload" jsonb NOT NULL)`);
  const dual = await createApprovalWithCompatibility({
    prisma,
    context: requesterContext,
    input: createInput("dual"),
    mode: APPROVAL_PERSISTENCE_MODES.DUAL_WRITE,
    legacyProjectionWriter: (tx, approval) => tx.$executeRawUnsafe(
      `INSERT INTO "osi"."db01e_legacy_projection_probe" ("id","payload") VALUES ($1,$2::jsonb)`,
      approval.id, JSON.stringify({ approval_requests: [{ id: approval.id, status: approval.status }] }),
    ),
  });
  const legacyProbe = await prisma.$queryRawUnsafe(
    `SELECT "payload" FROM "osi"."db01e_legacy_projection_probe" WHERE "id"=$1`, dual.relational.approval.id,
  );
  check(
    "escritura dual simulada",
    dual.authority === "LEGACY" && legacyProbe[0]?.payload?.approval_requests?.[0]?.id === dual.relational.approval.id,
  );
  await prisma.$executeRawUnsafe(`DROP TABLE "osi"."db01e_legacy_projection_probe"`);

  await prisma.$executeRawUnsafe(`CREATE FUNCTION "osi"."db01e_reject_created_audit"() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW."action"='APPROVAL_REQUEST_CREATED' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$;
  `);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER "db01e_reject_created_audit"
    BEFORE INSERT ON "osi"."commercial_audit_logs"
    FOR EACH ROW EXECUTE FUNCTION "osi"."db01e_reject_created_audit"()`);
  await expectError("fallo de auditoría crítica revierte operación", () =>
    createApprovalRequest(prisma, requesterContext, createInput("audit-rollback")));
  const rolledBack = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS count FROM "osi"."approval_requests" WHERE "tenant_id"=$1 AND "request_id"='create-audit-rollback'`, tenantOne,
  );
  check("solicitud ausente tras rollback crítico", rolledBack[0].count === 0);
  await prisma.$executeRawUnsafe(`DROP TRIGGER "db01e_reject_created_audit" ON "osi"."commercial_audit_logs"`);
  await prisma.$executeRawUnsafe(`DROP FUNCTION "osi"."db01e_reject_created_audit"()`);

  const dryRows = [{
    id: "legacy-case-1",
    milestonesJson: { approval_requests: [{ id: "legacy-approval-1", quote_id: "legacy-quote-1", status: "PENDING" }] },
  }];
  const unresolvedDryRun = analyzeHistoricalApprovalRequests(dryRows);
  const mappedDryRun = analyzeHistoricalApprovalRequests(dryRows, { tenantByCaseId: new Map([["legacy-case-1", tenantOne]]) });
  check("dry-run histórico no enlaza tenant implícitamente", unresolvedDryRun.convertible === 0 && unresolvedDryRun.reasons.TENANT_NOT_EXPLICITLY_MAPPED === 1);
  check("dry-run identifica registro convertible con mapa explícito", mappedDryRun.convertible === 1);

  for (let index = 0; index < 7; index += 1) {
    await createApprovalRequest(prisma, requesterContext, createInput(`page-${index}`));
  }
  const pageOne = await listApprovalRequests(prisma, approverOneContext, { approvalType: "EXCEPTIONAL_MARGIN", limit: 3 });
  const pageTwo = await listApprovalRequests(prisma, approverOneContext, { approvalType: "EXCEPTIONAL_MARGIN", limit: 3, cursor: pageOne.nextCursor });
  check("paginación y filtros", pageOne.data.length === 3 && pageTwo.data.length === 3 && Boolean(pageOne.nextCursor));
  check("páginas sin duplicados", pageOne.data.every((a) => !pageTwo.data.some((b) => a.id === b.id)));

  const perfStart = performance.now();
  await prisma.$executeRawUnsafe(`
    INSERT INTO "osi"."approval_requests"
      ("id","tenant_id","approval_type","entity","entity_id","requester_user_id","requester_membership_id",
       "request_reason","evaluation_snapshot_json","request_id","payload_hash","requested_at","created_at","updated_at")
    SELECT 'perf-'||g, '${tenantOne}', 'PERFORMANCE_PROBE', 'QUOTE', 'perf-quote-'||g,
      '${requester.userId}', '${requester.membershipId}', 'Synthetic performance probe', '{}'::jsonb,
      'perf-request-'||g, repeat('b',64), CURRENT_TIMESTAMP - (g||' milliseconds')::interval,
      CURRENT_TIMESTAMP - (g||' milliseconds')::interval, CURRENT_TIMESTAMP
    FROM generate_series(1,10000) g
  `);
  const insertMs = performance.now() - perfStart;
  const queryStart = performance.now();
  const perfPage = await listApprovalRequests(prisma, approverOneContext, { approvalType: "PERFORMANCE_PROBE", status: "PENDING", limit: 50 });
  const queryMs = performance.now() - queryStart;
  check("volumen sintético significativo", perfPage.data.length === 50, `rows=10000 insertMs=${insertMs.toFixed(1)} queryMs=${queryMs.toFixed(1)}`);

  console.log(JSON.stringify({ ok: true, tests: results.length, results }, null, 2));
} finally {
  await prisma.$disconnect();
}
