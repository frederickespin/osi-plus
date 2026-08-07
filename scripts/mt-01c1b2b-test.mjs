import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  EmployeeProvisioningError,
  cancelEmployeeProvisioningRequest,
  createEmployeeProvisioningRequest,
  decideEmployeeProvisioningRequest,
  getEmployeeProvisioningRequest,
  listEmployeeProvisioningRequests,
  proposeEmployeeAdminRole,
} from "../api/_lib/employeeProvisioningDomain.js";
import { EMPLOYEE_PROVISIONING_PERMISSIONS as P } from "../api/_lib/employeeProvisioningPolicy.js";

const prisma = new PrismaClient();
const run = randomUUID().slice(0, 8);
const results = [];
const id = (name) => `c1b2b-${name}-${run}`;

function check(name, condition, details) {
  if (!condition) throw new Error(`MT01C1B2B_TEST_FAILED: ${name}${details ? ` (${details})` : ""}`);
  results.push({ name, passed: true });
}

async function expectCode(name, work, code) {
  try {
    await work();
    throw new Error(`${name}: operación inválida aceptada`);
  } catch (error) {
    if (String(error?.message).includes("operación inválida aceptada")) throw error;
    check(name, error?.code === code, `esperado=${code}, recibido=${error?.code}`);
  }
}

const tenant1 = id("tenant-1");
const tenant2 = id("tenant-2");
const actors = {
  requester: { userId: id("u-requester"), membershipId: id("m-requester"), grants: [P.REQUEST, P.VIEW] },
  approver: { userId: id("u-approver"), membershipId: id("m-approver"), grants: [P.APPROVE, P.VIEW, P.VIEW_PII], denied: ["clients:view"] },
  proposer: { userId: id("u-proposer"), membershipId: id("m-proposer"), grants: [P.ROLE_A_PROPOSE, P.VIEW] },
  admin2: { userId: id("u-admin2"), membershipId: id("m-admin2"), grants: [P.APPROVE, P.ROLE_A_ASSIGN, P.VIEW, "clients:view", "projects:view"] },
  admin3: { userId: id("u-admin3"), membershipId: id("m-admin3"), grants: [P.APPROVE, P.ROLE_A_ASSIGN, P.VIEW, "clients:view"] },
  target: { userId: id("u-target"), membershipId: id("m-target"), grants: [] },
  unauthorized: { userId: id("u-unauthorized"), membershipId: id("m-unauthorized"), grants: [] },
  foreign: { userId: id("u-foreign"), membershipId: id("m-foreign"), grants: [P.REQUEST, P.APPROVE, P.VIEW] },
};

const context = (tenantId, actor) => Object.freeze({
  authType: "V2",
  tenantId,
  membershipId: actor.membershipId,
  userId: actor.userId,
  role: "V",
});

async function seedActor(tenantId, name, actor, role = "V") {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "osi"."osi_users" ("id","code","name","email","phone","role","status","joinDate","passwordHash","updatedAt")
    VALUES (${actor.userId},${`C1B2B-${name}-${run}`},${`Synthetic ${name}`},${`${name}.${run}@example.test`},'+10000000000',${role},'active','2026-08-07','$synthetic$',CURRENT_TIMESTAMP)
  `);
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "osi"."tenant_memberships" ("id","tenant_id","user_id","role","status","is_default","granted_permissions","denied_permissions","provisioning_source","updated_at")
    VALUES (${actor.membershipId},${tenantId},${actor.userId},CAST(${role} AS "osi"."TenantMembershipRole"),'ACTIVE',true,${actor.grants},${actor.denied || []},'MANUAL',CURRENT_TIMESTAMP)
  `);
}

async function seed() {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "osi"."tenants" ("id","code","name","status","provisioning_source","updated_at") VALUES
      (${tenant1},${`C1B2B-T1-${run.toUpperCase()}`},'C1B2B Tenant One','ACTIVE','MANUAL',CURRENT_TIMESTAMP),
      (${tenant2},${`C1B2B-T2-${run.toUpperCase()}`},'C1B2B Tenant Two','ACTIVE','MANUAL',CURRENT_TIMESTAMP)
  `);
  for (const [name, actor] of Object.entries(actors)) {
    await seedActor(name === "foreign" ? tenant2 : tenant1, name, actor, name.startsWith("admin") || name === "proposer" ? "A" : "V");
  }
}

function requestInput(name, overrides = {}) {
  return {
    requestId: id(`request-${name}`),
    requestReason: `Synthetic request ${name}`,
    identityMode: "NEW_GLOBAL_USER",
    email: `${name}.${run}@example.test`,
    employeeCode: ` emp-${name}-${run} `,
    employmentStatus: "ACTIVE",
    availabilityStatus: "AVAILABLE",
    requestedRole: "V",
    grantedPermissions: ["clients:view", "projects:create", P.ROLE_A_ASSIGN],
    deniedPermissions: ["users:create"],
    targetUserId: actors.target.userId,
    ...overrides,
  };
}

try {
  await seed();
  const requesterContext = context(tenant1, actors.requester);
  const approverContext = context(tenant1, actors.approver);

  const concurrentInput = requestInput("concurrent");
  const concurrent = await Promise.all(Array.from({ length: 20 }, () => createEmployeeProvisioningRequest(prisma, requesterContext, concurrentInput)));
  check("20 creaciones idénticas devuelven una solicitud", new Set(concurrent.map((item) => item.request.id)).size === 1);
  const normalId = concurrent[0].request.id;
  check("una sola extensión y ApprovalRequest", await prisma.employeeProvisioningRequest.count({ where: { id: normalId } }) === 1 && await prisma.approvalRequest.count({ where: { tenant_id: tenant1, request_id: concurrentInput.requestId } }) === 1);
  check("normalización se almacena trim/uppercase y lowercase", (await prisma.employeeProvisioningRequest.findUnique({ where: { id: normalId } }))?.normalizedEmployeeCode === `EMP-CONCURRENT-${run.toUpperCase()}`);
  check("lifecycle permanece null antes de decisión", concurrent[0].request.lifecycleStatus === null && concurrent[0].request.lifecycleVersion === 0);

  const approvalVersion = concurrent[0].approval.version;
  const decisions = await Promise.all(Array.from({ length: 20 }, () => decideEmployeeProvisioningRequest(prisma, approverContext, {
    id: normalId, decision: "APPROVED", reason: "Approved synthetic", requestId: id("normal-decision"), expectedVersion: approvalVersion,
  })));
  check("20 aprobaciones idénticas producen una decisión", decisions.every((item) => item.approval.status === "APPROVED"));
  const fixedNormal = await prisma.employeeProvisioningRequest.findUnique({ where: { id: normalId } });
  check("concesión usa intersección y denegación prevalece", JSON.stringify(fixedNormal.grantedPermissions) === JSON.stringify(["projects:create"]) && fixedNormal.deniedPermissions.includes("users:create"));
  check("aprobación no inicia ciclo posterior", fixedNormal.lifecycleStatus === null && fixedNormal.lifecycleVersion === 0);
  check("una sola auditoría de dominio para aprobación concurrente", await prisma.commercialAuditLog.count({ where: { tenant_id: tenant1, action: "EMPLOYEE_PROVISIONING_APPROVED", entityId: normalId } }) === 1);

  const differentPayload = { ...concurrentInput, email: `different.${run}@example.test` };
  await expectCode("requestId con payload diferente entra en conflicto", () => createEmployeeProvisioningRequest(prisma, requesterContext, differentPayload), "EMPLOYEE_PROVISIONING_IDEMPOTENCY_CONFLICT");

  await expectCode("actor sin permiso es rechazado", () => createEmployeeProvisioningRequest(prisma, context(tenant1, actors.unauthorized), requestInput("forbidden")), "EMPLOYEE_PROVISIONING_FORBIDDEN");
  check("rechazo no autorizado conserva auditoría", await prisma.commercialAuditLog.count({ where: { tenant_id: tenant1, action: "EMPLOYEE_PROVISIONING_CREATE_UNAUTHORIZED" } }) === 1);

  const beforeAuditFailure = await prisma.employeeProvisioningRequest.count({ where: { tenant_id: tenant1 } });
  await expectCode("falla crítica de auditoría revierte creación", () => createEmployeeProvisioningRequest(prisma, requesterContext, requestInput("audit-failure"), {
    auditWriter: async () => { throw new EmployeeProvisioningError("synthetic audit failure", { code: "SYNTHETIC_AUDIT_FAILURE" }); },
  }), "SYNTHETIC_AUDIT_FAILURE");
  check("rollback de auditoría elimina ApprovalRequest y extensión", await prisma.employeeProvisioningRequest.count({ where: { tenant_id: tenant1 } }) === beforeAuditFailure && await prisma.approvalRequest.count({ where: { tenant_id: tenant1, request_id: id("request-audit-failure") } }) === 0);

  const cancelCreated = await createEmployeeProvisioningRequest(prisma, requesterContext, requestInput("cancel"));
  const cancelInput = { id: cancelCreated.request.id, requestId: id("cancel-command"), reason: "Cancelled synthetic", expectedVersion: cancelCreated.approval.version };
  const cancelled = await cancelEmployeeProvisioningRequest(prisma, requesterContext, cancelInput);
  const cancelledRetry = await cancelEmployeeProvisioningRequest(prisma, requesterContext, cancelInput);
  check("cancelación es final e idempotente", cancelled.approval.status === "CANCELLED" && cancelledRetry.idempotent === true);

  const rejectCreated = await createEmployeeProvisioningRequest(prisma, requesterContext, requestInput("reject"));
  const rejectInput = { id: rejectCreated.request.id, decision: "REJECTED", reason: "Rejected synthetic", requestId: id("reject-command"), expectedVersion: rejectCreated.approval.version };
  const rejected = await decideEmployeeProvisioningRequest(prisma, approverContext, rejectInput);
  const rejectedRetry = await decideEmployeeProvisioningRequest(prisma, approverContext, rejectInput);
  check("rechazo es final e idempotente", rejected.approval.status === "REJECTED" && rejectedRetry.idempotent === true && rejected.request.lifecycleStatus === null);

  const staleCreated = await createEmployeeProvisioningRequest(prisma, requesterContext, requestInput("stale"));
  await expectCode("expectedVersion obsoleta produce conflicto determinista", () => decideEmployeeProvisioningRequest(prisma, approverContext, {
    id: staleCreated.request.id, decision: "APPROVED", reason: "stale synthetic", requestId: id("stale-command"), expectedVersion: staleCreated.approval.version + 1,
  }), "APPROVAL_VERSION_CONFLICT");

  const adminCreated = await createEmployeeProvisioningRequest(prisma, requesterContext, requestInput("admin", {
    requestedRole: "A", grantedPermissions: ["clients:view", "projects:view", P.ROLE_A_ASSIGN], deniedPermissions: [],
  }));
  const proposalInput = { provisioningRequestId: adminCreated.request.id, requestId: id("admin-proposal"), grantedPermissions: ["clients:view", "projects:view", P.ROLE_A_ASSIGN], deniedPermissions: [] };
  const proposals = await Promise.all(Array.from({ length: 20 }, () => proposeEmployeeAdminRole(prisma, context(tenant1, actors.proposer), proposalInput)));
  check("20 propuestas idénticas producen una append-only", new Set(proposals.map((item) => item.proposal.id)).size === 1 && await prisma.employeeAdminRoleProposal.count({ where: { tenant_id: tenant1, requestId: proposalInput.requestId } }) === 1);
  await expectCode("proponente no puede decidir propuesta propia", () => decideEmployeeProvisioningRequest(prisma, context(tenant1, actors.proposer), {
    id: adminCreated.request.id, decision: "APPROVED", proposalId: proposals[0].proposal.id, reason: "self", requestId: id("self-admin-decision"), expectedVersion: adminCreated.approval.version,
  }), "EMPLOYEE_PROVISIONING_FORBIDDEN");

  const competingAdminDecisions = await Promise.allSettled([
    decideEmployeeProvisioningRequest(prisma, context(tenant1, actors.admin2), { id: adminCreated.request.id, decision: "APPROVED", proposalId: proposals[0].proposal.id, reason: "admin approved", requestId: id("admin-decision-1"), expectedVersion: adminCreated.approval.version }),
    decideEmployeeProvisioningRequest(prisma, context(tenant1, actors.admin3), { id: adminCreated.request.id, decision: "APPROVED", proposalId: proposals[0].proposal.id, reason: "admin approved", requestId: id("admin-decision-2"), expectedVersion: adminCreated.approval.version }),
  ]);
  check("dos decisores producen un único resultado final", competingAdminDecisions.filter((item) => item.status === "fulfilled").length === 1);
  const fixedAdmin = await prisma.employeeProvisioningRequest.findUnique({ where: { id: adminCreated.request.id } });
  check("rol A copia propuesta exacta sin autoasignar assign", fixedAdmin.requestedRole === "A" && fixedAdmin.grantedPermissions.includes("clients:view") && !fixedAdmin.grantedPermissions.includes(P.ROLE_A_ASSIGN));
  check("propuesta A permanece append-only", await prisma.employeeAdminRoleProposal.count({ where: { id: proposals[0].proposal.id } }) === 1);

  await expectCode("proposalId distinto no puede reutilizar decisión", () => decideEmployeeProvisioningRequest(prisma, context(tenant1, actors.admin2), {
    id: adminCreated.request.id, decision: "APPROVED", proposalId: randomUUID(), reason: "admin approved", requestId: id("admin-decision-1"), expectedVersion: adminCreated.approval.version,
  }), "EMPLOYEE_PROVISIONING_NOT_FOUND");

  const pii = await getEmployeeProvisioningRequest(prisma, approverContext, normalId);
  const redacted = await getEmployeeProvisioningRequest(prisma, requesterContext, normalId);
  check("PII exige permiso explícito", typeof pii.email === "string" && redacted.email === undefined);
  await expectCode("consulta cruzada responde 404", () => getEmployeeProvisioningRequest(prisma, context(tenant2, actors.foreign), normalId), "EMPLOYEE_PROVISIONING_NOT_FOUND");
  const page = await listEmployeeProvisioningRequests(prisma, requesterContext, { limit: 2 });
  check("listado exige paginación y cursor", page.data.length === 2 && typeof page.nextCursor === "string");
  check("listado no expone email sin permiso", page.data.every((item) => item.email === undefined));

  check("no se crearon usuarios, membresías, perfiles o invitaciones", await prisma.employeeProfile.count({ where: { tenantId: tenant1 } }) === 0 && await prisma.employeeProvisioningInvitation.count({ where: { tenant_id: tenant1 } }) === 0);
  check("auditorías no contienen correos completos", !(await prisma.commercialAuditLog.findMany({ where: { tenant_id: tenant1 }, select: { metadata_json: true } })).some((row) => JSON.stringify(row.metadata_json).includes("@example.test")));
  check("rol A no obtiene assign desde catálogo base", !(await import("../api/_lib/rbac.js")).permsForRole("A").includes(P.ROLE_A_ASSIGN));

  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, assertions: results.length, error: { name: error?.name, code: error?.code, message: error?.message, stack: error?.stack } }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
