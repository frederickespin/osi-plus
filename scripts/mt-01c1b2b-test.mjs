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

const prisma = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
let observedQueryCount = 0;
prisma.$on("query", () => { observedQueryCount += 1; });
process.env.MT01C1B2B_PAYLOAD_HASH_PEPPER ||= "synthetic-c1b2b-local-only-pepper-48-bytes-minimum-value";
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
  requester: { userId: id("u-requester"), membershipId: id("m-requester"), grants: [P.REQUEST, P.VIEW], role: "V" },
  approver: { userId: id("u-approver"), membershipId: id("m-approver"), grants: [P.APPROVE, P.VIEW, P.VIEW_PII], denied: ["clients:view"], role: "V" },
  proposer: { userId: id("u-proposer"), membershipId: id("m-proposer"), grants: [P.ROLE_A_PROPOSE, P.VIEW], role: "A" },
  admin2: { userId: id("u-admin2"), membershipId: id("m-admin2"), grants: [P.APPROVE, P.ROLE_A_ASSIGN, P.ROLE_A_PROPOSE, P.VIEW, "clients:view", "projects:view"], role: "A" },
  admin3: { userId: id("u-admin3"), membershipId: id("m-admin3"), grants: [P.APPROVE, P.ROLE_A_ASSIGN, P.ROLE_A_PROPOSE, P.VIEW, "clients:view"], role: "A" },
  adminDenied: { userId: id("u-admin-denied"), membershipId: id("m-admin-denied"), grants: [P.APPROVE, P.VIEW], denied: [P.ROLE_A_ASSIGN], role: "A" },
  target: { userId: id("u-target"), membershipId: id("m-target"), grants: [], role: "V" },
  targetAdmin: { userId: id("u-target-admin"), membershipId: id("m-target-admin"), grants: [P.APPROVE, P.ROLE_A_ASSIGN, P.ROLE_A_PROPOSE], role: "A" },
  unauthorized: { userId: id("u-unauthorized"), membershipId: id("m-unauthorized"), grants: [], role: "V" },
  foreign: { userId: id("u-foreign"), membershipId: id("m-foreign"), grants: [P.REQUEST, P.APPROVE, P.VIEW], role: "V" },
  foreignProposer: { userId: id("u-foreign-proposer"), membershipId: id("m-foreign-proposer"), grants: [P.ROLE_A_PROPOSE, P.VIEW], role: "A" },
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
    await seedActor(name.startsWith("foreign") ? tenant2 : tenant1, name, actor, actor.role);
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
    grantedPermissions: ["clients:view", "projects:create", P.ROLE_A_ASSIGN, "unknown:grant"],
    deniedPermissions: ["users:create"],
    targetUserId: actors.target.userId,
    ...overrides,
  };
}

try {
  await seed();
  const requesterContext = context(tenant1, actors.requester);
  const approverContext = context(tenant1, actors.approver);

  const duplicateCodeResults = await Promise.allSettled(Array.from({ length: 20 }, (_, index) => createEmployeeProvisioningRequest(prisma, requesterContext, requestInput(`code-race-${index}`, {
    employeeCode: ` shared-${run} `,
  }))));
  const duplicateCodeSuccesses = duplicateCodeResults.filter((item) => item.status === "fulfilled").length;
  check("20 requestId distintos reservan una sola vez el mismo employeeCode", duplicateCodeSuccesses === 1, `éxitos=${duplicateCodeSuccesses}, códigos=${duplicateCodeResults.filter((item) => item.status === "rejected").map((item) => item.reason?.code || item.reason?.name).join(",")}`);

  const duplicateEmailResults = await Promise.allSettled(Array.from({ length: 20 }, (_, index) => createEmployeeProvisioningRequest(prisma, requesterContext, requestInput(`email-race-${index}`, {
    email: `shared-email.${run}@example.test`,
  }))));
  check("20 requestId distintos reservan una sola vez el mismo normalizedEmail", duplicateEmailResults.filter((item) => item.status === "fulfilled").length === 1);

  const crossTenantIdentifiers = requestInput("cross-tenant-identifiers", {
    email: `shared-email.${run}@example.test`, employeeCode: `shared-${run}`, targetUserId: actors.target.userId,
  });
  const crossTenant = await createEmployeeProvisioningRequest(prisma, context(tenant2, actors.foreign), crossTenantIdentifiers);
  check("correo y código iguales se aíslan entre tenants", crossTenant.approval.status === "PENDING");

  const foreignAdminRequest = await createEmployeeProvisioningRequest(prisma, context(tenant2, actors.foreign), requestInput("foreign-admin", {
    requestedRole: "A", targetUserId: actors.target.userId, grantedPermissions: ["clients:view"], deniedPermissions: [],
  }));
  const foreignProposal = await proposeEmployeeAdminRole(prisma, context(tenant2, actors.foreignProposer), {
    provisioningRequestId: foreignAdminRequest.request.id, requestId: id("foreign-admin-proposal"), grantedPermissions: ["clients:view"], deniedPermissions: [],
  });

  const collisionResults = await Promise.all([
    createEmployeeProvisioningRequest(prisma, requesterContext, requestInput("collision-a"), { advisoryLockKeyMapper: () => `forced-collision-${run}` }),
    createEmployeeProvisioningRequest(prisma, context(tenant2, actors.foreign), requestInput("collision-b", { targetUserId: actors.target.userId }), { advisoryLockKeyMapper: () => `forced-collision-${run}` }),
  ]);
  check("colisión forzada de advisory lock sólo serializa y no mezcla tenants", collisionResults[0].request.id !== collisionResults[1].request.id);

  const concurrentInput = requestInput("concurrent");
  const concurrent = await Promise.all(Array.from({ length: 20 }, () => createEmployeeProvisioningRequest(prisma, requesterContext, concurrentInput)));
  check("20 creaciones idénticas devuelven una solicitud", new Set(concurrent.map((item) => item.request.id)).size === 1);
  const normalId = concurrent[0].request.id;
  check("una sola extensión y ApprovalRequest", await prisma.employeeProvisioningRequest.count({ where: { id: normalId } }) === 1 && await prisma.approvalRequest.count({ where: { tenant_id: tenant1, request_id: concurrentInput.requestId } }) === 1);
  check("normalización se almacena trim/uppercase y lowercase", (await prisma.employeeProvisioningRequest.findUnique({ where: { id: normalId } }))?.normalizedEmployeeCode === `EMP-CONCURRENT-${run.toUpperCase()}`);
  check("lifecycle permanece null antes de decisión", concurrent[0].request.lifecycleStatus === null && concurrent[0].request.lifecycleVersion === 0);
  check("respuesta inicial no revela identidad global ni PII", !("email" in concurrent[0].request) && !("identityMode" in concurrent[0].request) && !("targetUserId" in concurrent[0].request));
  const storedHash = (await prisma.approvalRequest.findUnique({ where: { id: concurrent[0].approval.id }, select: { evaluation_snapshot_json: true } }))?.evaluation_snapshot_json?.provisioningPayloadHash;
  check("payloadHash sensible es HMAC opaco y no contiene PII", /^[0-9a-f]{64}$/.test(storedHash) && !storedHash.includes("concurrent") && !storedHash.includes("example"));

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
  await expectCode("rol no permitido se rechaza", () => createEmployeeProvisioningRequest(prisma, requesterContext, requestInput("bad-role", { requestedRole: "ROOT" })), "EMPLOYEE_PROVISIONING_ROLE_INVALID");
  await expectCode("grant simultáneamente denegado se rechaza", () => createEmployeeProvisioningRequest(prisma, requesterContext, requestInput("overlap", { grantedPermissions: ["clients:view"], deniedPermissions: ["clients:view"] })), "EMPLOYEE_PROVISIONING_PERMISSIONS_INVALID");
  await expectCode("actor no puede autoasignarse un rol normal", () => createEmployeeProvisioningRequest(prisma, requesterContext, requestInput("self-normal", { targetUserId: actors.requester.userId })), "EMPLOYEE_PROVISIONING_SELF_ASSIGNMENT_FORBIDDEN");
  await expectCode("actor de sistema queda diferenciado y bloqueado", () => createEmployeeProvisioningRequest(prisma, { tenantId: tenant1, actorKind: "SYSTEM" }, requestInput("system")), "EMPLOYEE_PROVISIONING_SYSTEM_ACTOR_UNSUPPORTED");

  const unauthorizedAuditsBefore = await prisma.commercialAuditLog.count({ where: { tenant_id: tenant1, action: "EMPLOYEE_PROVISIONING_CREATE_UNAUTHORIZED" } });
  await expectCode("actor sin permiso es rechazado", () => createEmployeeProvisioningRequest(prisma, context(tenant1, actors.unauthorized), requestInput("forbidden")), "EMPLOYEE_PROVISIONING_FORBIDDEN");
  check("rechazo no autorizado conserva auditoría", await prisma.commercialAuditLog.count({ where: { tenant_id: tenant1, action: "EMPLOYEE_PROVISIONING_CREATE_UNAUTHORIZED" } }) === unauthorizedAuditsBefore + 1);

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
  const reopenedIdentifiers = requestInput("after-terminal", { email: requestInput("reject").email, employeeCode: requestInput("reject").employeeCode });
  check("solicitud terminal libera reservas para un requestId nuevo", (await createEmployeeProvisioningRequest(prisma, requesterContext, reopenedIdentifiers)).approval.status === "PENDING");

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
  await expectCode("solicitante no puede proponer su propia solicitud", () => proposeEmployeeAdminRole(prisma, requesterContext, {
    ...proposalInput, requestId: id("requester-proposal"),
  }), "EMPLOYEE_PROVISIONING_FOUR_EYES_REQUIRED");
  await expectCode("administrador con assign denegado no puede decidir rol A", () => decideEmployeeProvisioningRequest(prisma, context(tenant1, actors.adminDenied), {
    id: adminCreated.request.id, decision: "APPROVED", proposalId: proposals[0].proposal.id, reason: "denied", requestId: id("admin-denied"), expectedVersion: adminCreated.approval.version,
  }), "EMPLOYEE_PROVISIONING_ROLE_A_ASSIGN_REQUIRED");

  const [secondProposal, thirdProposal] = await Promise.all([
    proposeEmployeeAdminRole(prisma, context(tenant1, actors.admin3), { ...proposalInput, requestId: id("admin-proposal-second"), grantedPermissions: ["clients:view"] }),
    proposeEmployeeAdminRole(prisma, context(tenant1, actors.admin2), { ...proposalInput, requestId: id("admin-proposal-third"), grantedPermissions: ["projects:view"] }),
  ]);
  check("dos propuestas distintas concurrentes permanecen separadas", new Set([proposals[0].proposal.id, secondProposal.proposal.id, thirdProposal.proposal.id]).size === 3);

  const otherAdminRequest = await createEmployeeProvisioningRequest(prisma, requesterContext, requestInput("admin-other-request", { requestedRole: "A", grantedPermissions: ["clients:view"], deniedPermissions: [] }));
  const otherRequestProposal = await proposeEmployeeAdminRole(prisma, context(tenant1, actors.proposer), {
    provisioningRequestId: otherAdminRequest.request.id, requestId: id("other-request-proposal"), grantedPermissions: ["clients:view"], deniedPermissions: [],
  });
  await expectCode("proposalId de otra solicitud responde 404", () => decideEmployeeProvisioningRequest(prisma, context(tenant1, actors.admin2), {
    id: adminCreated.request.id, decision: "APPROVED", proposalId: otherRequestProposal.proposal.id, reason: "other", requestId: id("other-request-decision"), expectedVersion: adminCreated.approval.version,
  }), "EMPLOYEE_PROVISIONING_NOT_FOUND");

  const targetAdminRequest = await createEmployeeProvisioningRequest(prisma, requesterContext, requestInput("target-admin", { requestedRole: "A", targetUserId: actors.targetAdmin.userId, grantedPermissions: ["clients:view"], deniedPermissions: [] }));
  await expectCode("empleado objetivo no puede proponer su propio rol A", () => proposeEmployeeAdminRole(prisma, context(tenant1, actors.targetAdmin), {
    provisioningRequestId: targetAdminRequest.request.id, requestId: id("target-proposal"), grantedPermissions: ["clients:view"], deniedPermissions: [],
  }), "EMPLOYEE_PROVISIONING_SELF_ADMIN_FORBIDDEN");
  const targetDecisionProposal = await proposeEmployeeAdminRole(prisma, context(tenant1, actors.proposer), {
    provisioningRequestId: targetAdminRequest.request.id, requestId: id("target-decision-proposal"), grantedPermissions: ["clients:view"], deniedPermissions: [],
  });
  await expectCode("empleado objetivo no puede decidir su rol A", () => decideEmployeeProvisioningRequest(prisma, context(tenant1, actors.targetAdmin), {
    id: targetAdminRequest.request.id, decision: "APPROVED", proposalId: targetDecisionProposal.proposal.id, reason: "target", requestId: id("target-decision"), expectedVersion: targetAdminRequest.approval.version,
  }), "EMPLOYEE_PROVISIONING_SELF_APPROVAL_FORBIDDEN");
  await expectCode("proposalId de otro tenant responde 404", () => decideEmployeeProvisioningRequest(prisma, context(tenant1, actors.admin2), {
    id: adminCreated.request.id, decision: "APPROVED", proposalId: foreignProposal.proposal.id, reason: "foreign", requestId: id("foreign-proposal"), expectedVersion: adminCreated.approval.version,
  }), "EMPLOYEE_PROVISIONING_NOT_FOUND");

  const competingAdminDecisions = await Promise.allSettled([
    decideEmployeeProvisioningRequest(prisma, context(tenant1, actors.admin2), { id: adminCreated.request.id, decision: "APPROVED", proposalId: proposals[0].proposal.id, reason: "admin approved", requestId: id("admin-decision-1"), expectedVersion: adminCreated.approval.version }),
    decideEmployeeProvisioningRequest(prisma, context(tenant1, actors.admin3), { id: adminCreated.request.id, decision: "APPROVED", proposalId: proposals[0].proposal.id, reason: "admin approved", requestId: id("admin-decision-2"), expectedVersion: adminCreated.approval.version }),
  ]);
  check("dos decisores producen un único resultado final", competingAdminDecisions.filter((item) => item.status === "fulfilled").length === 1,
    competingAdminDecisions.map((item) => item.status === "fulfilled" ? "fulfilled" : `${item.reason?.code || "error"}:${item.reason?.message || ""}`).join(","));
  const fixedAdmin = await prisma.employeeProvisioningRequest.findUnique({ where: { id: adminCreated.request.id } });
  check("rol A copia propuesta exacta sin autoasignar assign", fixedAdmin.requestedRole === "A" && fixedAdmin.grantedPermissions.includes("clients:view") && !fixedAdmin.grantedPermissions.includes(P.ROLE_A_ASSIGN));
  check("propuesta A permanece append-only", await prisma.employeeAdminRoleProposal.count({ where: { id: proposals[0].proposal.id } }) === 1);
  const selectedDecision = await prisma.approvalRequest.findUnique({ where: { id: adminCreated.approval.id }, select: { decision_reason: true } });
  check("decisión conserva relación exacta con propuesta seleccionada", selectedDecision?.decision_reason?.includes(`[MT01C1B2B proposal=${proposals[0].proposal.id}]`));
  const winningIndex = competingAdminDecisions.findIndex((item) => item.status === "fulfilled");
  const winningActor = winningIndex === 0 ? actors.admin2 : actors.admin3;
  const winningRequestId = winningIndex === 0 ? id("admin-decision-1") : id("admin-decision-2");
  const reusedProposal = await decideEmployeeProvisioningRequest(prisma, context(tenant1, winningActor), {
    id: adminCreated.request.id, decision: "APPROVED", proposalId: proposals[0].proposal.id, reason: "admin approved", requestId: winningRequestId, expectedVersion: adminCreated.approval.version,
  });
  check("reintento idéntico de propuesta devuelve resultado existente", reusedProposal.idempotent === true);

  await expectCode("proposalId distinto no puede reutilizar decisión", () => decideEmployeeProvisioningRequest(prisma, context(tenant1, actors.admin2), {
    id: adminCreated.request.id, decision: "APPROVED", proposalId: randomUUID(), reason: "admin approved", requestId: id("admin-decision-1"), expectedVersion: adminCreated.approval.version,
  }), "APPROVAL_FINAL_IMMUTABLE");

  const pii = await getEmployeeProvisioningRequest(prisma, approverContext, normalId);
  const redacted = await getEmployeeProvisioningRequest(prisma, requesterContext, normalId);
  check("PII exige permiso explícito", typeof pii.email === "string" && redacted.email === undefined);
  await expectCode("consulta cruzada responde 404", () => getEmployeeProvisioningRequest(prisma, context(tenant2, actors.foreign), normalId), "EMPLOYEE_PROVISIONING_NOT_FOUND");
  const page = await listEmployeeProvisioningRequests(prisma, requesterContext, { limit: 2 });
  check("listado exige paginación y cursor", page.data.length === 2 && typeof page.nextCursor === "string");
  check("listado no expone email sin permiso", page.data.every((item) => item.email === undefined));
  await expectCode("filtros fuera de allowlist se rechazan", () => listEmployeeProvisioningRequests(prisma, requesterContext, { tenantId: tenant2 }), "EMPLOYEE_PROVISIONING_FILTER_INVALID");

  const queriesBeforeList = observedQueryCount;
  await listEmployeeProvisioningRequests(prisma, requesterContext, { limit: 10 });
  check("listado resuelve actor y datos con dos consultas", observedQueryCount - queriesBeforeList === 2, `consultas=${observedQueryCount - queriesBeforeList}`);

  check("no se crearon usuarios, membresías, perfiles o invitaciones", await prisma.employeeProfile.count({ where: { tenantId: tenant1 } }) === 0 && await prisma.employeeProvisioningInvitation.count({ where: { tenant_id: tenant1 } }) === 0);
  const auditRows = await prisma.commercialAuditLog.findMany({ where: { tenant_id: tenant1 }, select: { source: true, metadata_json: true, before_json: true, after_json: true, actor_user_id: true, actor_membership_id: true } });
  check("auditorías no contienen correos, teléfonos ni hashes internos", !auditRows.some((row) => /@example\.test|\+10000000000|[0-9a-f]{64}/i.test(JSON.stringify(row))));
  check("auditorías humanas identifican usuario y membresía", auditRows.every((row) => row.actor_user_id && row.actor_membership_id));
  check("auditorías del dominio distinguen actor humano", auditRows.filter((row) => row.source === "MT01C1B2B_DOMAIN").every((row) => row.metadata_json?.actorType === "HUMAN"));
  check("rol A no obtiene assign desde catálogo base", !(await import("../api/_lib/rbac.js")).permsForRole("A").includes(P.ROLE_A_ASSIGN));
  check("grants desconocidos, no delegables o no poseídos no se aprueban", !fixedNormal.grantedPermissions.includes("unknown:grant") && !fixedNormal.grantedPermissions.includes(P.ROLE_A_ASSIGN) && !fixedNormal.grantedPermissions.includes("clients:view"));

  const latencySamples = [];
  for (let index = 0; index < 30; index += 1) {
    const started = performance.now();
    await listEmployeeProvisioningRequests(prisma, requesterContext, { limit: 10 });
    latencySamples.push(performance.now() - started);
  }
  latencySamples.sort((a, b) => a - b);
  const p50 = latencySamples[Math.floor(latencySamples.length * 0.50)];
  const p95 = latencySamples[Math.floor(latencySamples.length * 0.95)];
  check("listado sintético registra p50/p95 acotados", p50 > 0 && p95 >= p50 && p95 < 5_000, `p50=${p50.toFixed(2)},p95=${p95.toFixed(2)}`);

  for (let round = 0; round < 20; round += 1) {
    const roundInput = requestInput(`deadlock-${round}`);
    const roundResults = await Promise.all(Array.from({ length: 20 }, () => createEmployeeProvisioningRequest(prisma, requesterContext, roundInput)));
    check(`ronda concurrente ${round + 1} sin deadlock`, new Set(roundResults.map((item) => item.request.id)).size === 1);
  }

  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, metrics: { listP50Ms: Number(p50.toFixed(2)), listP95Ms: Number(p95.toFixed(2)), listMaxMs: Number(latencySamples.at(-1).toFixed(2)) }, results }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, assertions: results.length, error: { name: error?.name, code: error?.code, message: error?.message, stack: error?.stack } }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
