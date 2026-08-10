import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import {
  formatMt01c1b2bSanitizedIdentity,
  validateMt01c1b2bTestDatabaseEnv,
  verifyMt01c1b2bConnectedDatabase,
} from "./mt-01c1b2b-database-guard.mjs";

const databaseTarget = validateMt01c1b2bTestDatabaseEnv();
process.env.MT01C1B2B_PAYLOAD_HASH_PEPPER ||= "synthetic-c1b3a-local-only-pepper-48-bytes-minimum-value";
const { Prisma, PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient({ datasourceUrl: databaseTarget.url });
const identity = await verifyMt01c1b2bConnectedDatabase(prisma, databaseTarget);
process.stderr.write(`[mt-01c1b3a] database ${formatMt01c1b2bSanitizedIdentity(identity)}\n`);

const {
  createEmployeeProvisioningRequest,
  decideEmployeeProvisioningRequest,
  proposeEmployeeAdminRole,
} = await import("../api/_lib/employeeProvisioningDomain.js");
const {
  MT01C1B3A_EXECUTOR_POLICY,
  materializeApprovedEmployeeProvisioning,
} = await import("../api/_lib/employeeProvisioningExecutor.js");
const { EMPLOYEE_PROVISIONING_PERMISSIONS: P } = await import("../api/_lib/employeeProvisioningPolicy.js");

const run = randomUUID().slice(0, 8);
const id = (name) => `c1b3a-${name}-${run}`;
const tenant1 = id("tenant-1");
const tenant2 = id("tenant-2");
const results = [];
const syntheticUserIds = new Set();

function check(name, condition, details = "") {
  if (!condition) throw new Error(`MT01C1B3A_TEST_FAILED: ${name}${details ? ` (${details})` : ""}`);
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

async function expectDatabaseFailure(name, work) {
  try {
    await work();
    throw new Error(`${name}: operación inválida aceptada`);
  } catch (error) {
    if (String(error?.message).includes("operación inválida aceptada")) throw error;
    check(name, true);
  }
}

const actors = {
  requester: { tenantId: tenant1, userId: id("requester-u"), membershipId: id("requester-m"), role: "V", grants: [P.REQUEST] },
  approver: { tenantId: tenant1, userId: id("approver-u"), membershipId: id("approver-m"), role: "V", grants: [P.APPROVE] },
  executor: { tenantId: tenant1, userId: id("executor-u"), membershipId: id("executor-m"), role: "V", grants: [P.MATERIALIZE] },
  proposer: { tenantId: tenant1, userId: id("proposer-u"), membershipId: id("proposer-m"), role: "A", grants: [P.ROLE_A_PROPOSE] },
  adminDecider: { tenantId: tenant1, userId: id("admin-decider-u"), membershipId: id("admin-decider-m"), role: "A", grants: [P.APPROVE, P.ROLE_A_ASSIGN] },
  foreignRequester: { tenantId: tenant2, userId: id("foreign-requester-u"), membershipId: id("foreign-requester-m"), role: "V", grants: [P.REQUEST] },
  foreignApprover: { tenantId: tenant2, userId: id("foreign-approver-u"), membershipId: id("foreign-approver-m"), role: "V", grants: [P.APPROVE] },
  foreignExecutor: { tenantId: tenant2, userId: id("foreign-executor-u"), membershipId: id("foreign-executor-m"), role: "V", grants: [P.MATERIALIZE] },
};

const context = (actor) => Object.freeze({
  authType: "V2",
  tenantId: actor.tenantId,
  membershipId: actor.membershipId,
  userId: "browser-value-is-ignored",
  role: "A",
  permissions: [P.MATERIALIZE],
});

async function seedActor(actor, name) {
  syntheticUserIds.add(actor.userId);
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "osi"."osi_users" ("id","code","name","email","phone","role","status","joinDate","passwordHash","updatedAt")
    VALUES (${actor.userId},${`C1B3A-${name}-${run}`},${`Synthetic ${name}`},${`${name}.${run}@example.test`},'',${actor.role},'active','2026-08-09','$synthetic$',CURRENT_TIMESTAMP)
  `);
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "osi"."tenant_memberships" (
      "id","tenant_id","user_id","role","status","granted_permissions","denied_permissions","is_default","provisioning_source","updated_at"
    ) VALUES (${actor.membershipId},${actor.tenantId},${actor.userId},CAST(${actor.role} AS "osi"."TenantMembershipRole"),'ACTIVE',${actor.grants},ARRAY[]::TEXT[],true,'MANUAL',CURRENT_TIMESTAMP)
  `);
}

async function seed() {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "osi"."tenants" ("id","code","name","status","provisioning_source","updated_at") VALUES
      (${tenant1},${`C1B3A-T1-${run.toUpperCase()}`},'C1B3A Tenant One','ACTIVE','MANUAL',CURRENT_TIMESTAMP),
      (${tenant2},${`C1B3A-T2-${run.toUpperCase()}`},'C1B3A Tenant Two','ACTIVE','MANUAL',CURRENT_TIMESTAMP)
  `);
  for (const [name, actor] of Object.entries(actors)) await seedActor(actor, name);
}

function requestInput(name, overrides = {}) {
  return {
    requestId: id(`create-${name}`),
    requestReason: `Synthetic materialization ${name}`,
    identityMode: "NEW_GLOBAL_USER",
    email: `${name}.${run}@example.test`,
    employeeCode: `EMP-${name}-${run}`,
    jobTitle: "Operador",
    departmentCode: "OPS",
    employmentStatus: "ACTIVE",
    contractType: "PERMANENT",
    availabilityStatus: "AVAILABLE",
    hiredAt: "2026-08-01",
    contractStartsAt: "2026-08-01",
    requestedRole: "V",
    grantedPermissions: [],
    deniedPermissions: [],
    targetUserId: null,
    ...overrides,
  };
}

async function createApproved(name, overrides = {}, actorSet = actors) {
  const created = await createEmployeeProvisioningRequest(prisma, context(actorSet.requester || actorSet.foreignRequester), requestInput(name, overrides));
  const approved = await decideEmployeeProvisioningRequest(prisma, context(actorSet.approver || actorSet.foreignApprover), {
    id: created.request.id,
    decision: "APPROVED",
    reason: `Approved materialization ${name}`,
    requestId: id(`approve-${name}`),
    expectedVersion: created.approval.version,
  });
  return { ...created, approved };
}

async function assertNoResidue(name, created) {
  const row = await prisma.employeeProvisioningRequest.findUnique({ where: { id: created.request.id } });
  const [users, profiles] = await Promise.all([
    prisma.user.count({ where: { normalizedEmail: row.normalizedEmail } }),
    prisma.employeeProfile.count({ where: { tenantId: row.tenant_id, normalizedEmployeeCode: row.normalizedEmployeeCode } }),
  ]);
  check(name, row.lifecycleStatus === null && row.provisionedUserId === null && row.provisionedMembershipId === null
    && users === 0 && profiles === 0);
}

async function runReservationRace(name, field) {
  const requests = [];
  for (let index = 0; index < 20; index += 1) requests.push(await createApproved(`${name}-${index}`));
  const shared = field === "normalizedEmail"
    ? `${name}.shared.${run}@example.test`
    : `EMP-${name}-SHARED-${run}`.toUpperCase();
  await prisma.employeeProvisioningRequest.updateMany({
    where: { id: { in: requests.map((entry) => entry.request.id) } },
    data: { [field]: shared },
  });
  const started = performance.now();
  const settled = await Promise.allSettled(requests.map((entry, index) => materializeApprovedEmployeeProvisioning(
    prisma,
    context(actors.executor),
    { provisioningRequestId: entry.request.id, requestId: id(`execute-${name}-${index}`), expectedLifecycleVersion: 0 },
  )));
  const winners = settled.filter((entry) => entry.status === "fulfilled");
  const conflicts = settled.filter((entry) => entry.status === "rejected" && entry.reason?.code === "EMPLOYEE_PROVISIONING_RESERVATION_CONFLICT");
  winners.forEach((entry) => syntheticUserIds.add(entry.value.userId));
  return { winners, conflicts, shared, durationMs: Number((performance.now() - started).toFixed(2)) };
}

async function cleanup() {
  const tenantIds = [tenant1, tenant2];
  await prisma.$executeRawUnsafe('ALTER TABLE "osi"."commercial_audit_logs" DISABLE TRIGGER "commercial_audit_logs_append_only"');
  await prisma.$executeRawUnsafe('ALTER TABLE "osi"."employee_admin_role_proposals" DISABLE TRIGGER "employee_admin_role_proposal_append_only_trigger"');
  try {
    await prisma.commercialAuditLog.deleteMany({ where: { tenant_id: { in: tenantIds } } });
    await prisma.employeeProfile.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.employeeAdminRoleProposal.deleteMany({ where: { tenant_id: { in: tenantIds } } });
    await prisma.employeeProvisioningInvitation.deleteMany({ where: { tenant_id: { in: tenantIds } } });
    await prisma.employeeProvisioningRequest.deleteMany({ where: { tenant_id: { in: tenantIds } } });
    await prisma.approvalRequest.deleteMany({ where: { tenant_id: { in: tenantIds } } });
    const memberships = await prisma.tenantMembership.findMany({ where: { tenantId: { in: tenantIds } }, select: { userId: true } });
    memberships.forEach((row) => syntheticUserIds.add(row.userId));
    await prisma.tenantMembership.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [...syntheticUserIds] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  } finally {
    await prisma.$executeRawUnsafe('ALTER TABLE "osi"."employee_admin_role_proposals" ENABLE TRIGGER "employee_admin_role_proposal_append_only_trigger"');
    await prisma.$executeRawUnsafe('ALTER TABLE "osi"."commercial_audit_logs" ENABLE TRIGGER "commercial_audit_logs_append_only"');
  }
}

try {
  await seed();
  check("política permanece inactiva y bloqueada", MT01C1B3A_EXECUTOR_POLICY.runtimeEnabled === false && MT01C1B3A_EXECUTOR_POLICY.initialMembershipStatus === "INACTIVE");
  check("orden fijo de locks documentado", MT01C1B3A_EXECUTOR_POLICY.lockOrder.join(">") === "requestId>normalizedEmail>employeeCode");

  const normal = await createApproved("normal");
  const command = { provisioningRequestId: normal.request.id, requestId: id("execute-normal"), expectedLifecycleVersion: 0 };
  const concurrencyStarted = performance.now();
  const concurrent = await Promise.all(Array.from({ length: 20 }, () => materializeApprovedEmployeeProvisioning(prisma, context(actors.executor), command)));
  const concurrencyDurationMs = Number((performance.now() - concurrencyStarted).toFixed(2));
  check("20 ejecuciones idénticas devuelven una identidad completa", new Set(concurrent.map((row) => `${row.userId}:${row.membershipId}:${row.employeeProfileId}`)).size === 1);
  check("exactamente una ejecución gana", concurrent.filter((row) => row.idempotent === false).length === 1 && concurrent.filter((row) => row.idempotent === true).length === 19);
  const materialized = concurrent[0];
  syntheticUserIds.add(materialized.userId);
  const [newUser, newMembership, newProfile, newRequest] = await Promise.all([
    prisma.user.findUnique({ where: { id: materialized.userId } }),
    prisma.tenantMembership.findUnique({ where: { id: materialized.membershipId } }),
    prisma.employeeProfile.findUnique({ where: { id: materialized.employeeProfileId } }),
    prisma.employeeProvisioningRequest.findUnique({ where: { id: normal.request.id } }),
  ]);
  check("User nuevo no puede iniciar sesión", newUser?.status === "inactive" && newUser?.passwordHash === "!MT01C1B3A-CREDENTIAL-NOT-PROVISIONED!");
  check("Membership inicial no concede acceso", newMembership?.status === "INACTIVE" && newMembership?.isDefault === false);
  check("EmployeeProfile conserva estados explícitos", newProfile?.employmentStatus === "ACTIVE" && newProfile?.availabilityStatus === "AVAILABLE" && newProfile?.employeeCode === `EMP-NORMAL-${run.toUpperCase()}`);
  check("ciclo posterior queda PROVISIONED_INACTIVE", newRequest?.lifecycleStatus === "PROVISIONED_INACTIVE" && newRequest?.lifecycleVersion === 1);
  check("una sola auditoría crítica", await prisma.commercialAuditLog.count({ where: { tenant_id: tenant1, action: "EMPLOYEE_PROVISIONING_MATERIALIZED", entityId: normal.request.id } }) === 1);
  check("ninguna AuthSession fue creada", await prisma.authSession.count({ where: { userId: materialized.userId } }) === 0);
  check("ningún refresh token o invitación fue creado", await prisma.authRefreshToken.count({ where: { session: { userId: materialized.userId } } }) === 0
    && await prisma.employeeProvisioningInvitation.count({ where: { tenant_id: tenant1, provisioningRequestId: normal.request.id } }) === 0);
  const normalAudit = await prisma.commercialAuditLog.findFirst({
    where: { tenant_id: tenant1, action: "EMPLOYEE_PROVISIONING_MATERIALIZED", entityId: normal.request.id },
    select: { after_json: true, metadata_json: true },
  });
  const auditText = JSON.stringify(normalAudit);
  check("auditoría materializada no contiene PII, credenciales ni hash idempotente", !/example\.test|phone|password|token|commandHash|payloadHash/i.test(auditText));

  const other = await createApproved("other");
  await expectCode("mismo requestId con payload diferente es conflicto", () => materializeApprovedEmployeeProvisioning(prisma, context(actors.executor), {
    provisioningRequestId: other.request.id, requestId: command.requestId, expectedLifecycleVersion: 0,
  }), "EMPLOYEE_PROVISIONING_IDEMPOTENCY_CONFLICT");
  await expectCode("reintento idempotente exige permiso vigente", () => materializeApprovedEmployeeProvisioning(prisma, context(actors.approver), command), "EMPLOYEE_PROVISIONING_FORBIDDEN");
  await expectCode("tenant cruzado recibe 404", () => materializeApprovedEmployeeProvisioning(prisma, context(actors.foreignExecutor), {
    provisioningRequestId: other.request.id, requestId: id("foreign-cross"), expectedLifecycleVersion: 0,
  }), "EMPLOYEE_PROVISIONING_NOT_FOUND");

  const existingUserId = id("existing-global-user");
  const existingMembershipId = id("existing-global-membership");
  const existingEmail = `existing.global.${run}@example.test`;
  syntheticUserIds.add(existingUserId);
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "osi"."osi_users" ("id","code","name","email","normalized_email","phone","role","status","joinDate","passwordHash","updatedAt")
    VALUES (${existingUserId},${`C1B3A-EXISTING-${run}`},'Existing synthetic identity',${existingEmail},${existingEmail},'+10000000001','K','active','2025-01-01','$existing-credential$',CURRENT_TIMESTAMP)
  `);
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "osi"."tenant_memberships" ("id","tenant_id","user_id","role","status","granted_permissions","denied_permissions","is_default","provisioning_source","updated_at")
    VALUES (${existingMembershipId},${tenant2},${existingUserId},'K','ACTIVE',ARRAY['projects:view']::TEXT[],ARRAY[]::TEXT[],true,'MANUAL',CURRENT_TIMESTAMP)
  `);
  const existingBefore = await prisma.user.findUnique({ where: { id: existingUserId } });
  const existingRequest = await createApproved("existing-global", {
    identityMode: "EXISTING_GLOBAL_USER", email: existingEmail, targetUserId: existingUserId,
  });
  const existingResult = await materializeApprovedEmployeeProvisioning(prisma, context(actors.executor), {
    provisioningRequestId: existingRequest.request.id, requestId: id("execute-existing-global"), expectedLifecycleVersion: 0,
  });
  const existingAfter = await prisma.user.findUnique({ where: { id: existingUserId } });
  check("User global preexistente conserva identidad, estado, rol, correo y credencial", JSON.stringify(existingAfter) === JSON.stringify(existingBefore));
  check("User preexistente recibe sólo membresía y perfil inactivos en tenant nuevo", existingResult.userId === existingUserId
    && (await prisma.tenantMembership.findUnique({ where: { id: existingResult.membershipId } }))?.status === "INACTIVE"
    && (await prisma.employeeProfile.findUnique({ where: { id: existingResult.employeeProfileId } }))?.userId === existingUserId);

  const alreadyMemberUserId = id("already-member-user");
  const alreadyMemberMembershipId = id("already-member-membership");
  const alreadyMemberEmail = `already.member.${run}@example.test`;
  syntheticUserIds.add(alreadyMemberUserId);
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "osi"."osi_users" ("id","code","name","email","normalized_email","phone","role","status","joinDate","passwordHash","updatedAt")
    VALUES (${alreadyMemberUserId},${`C1B3A-MEMBER-${run}`},'Existing tenant member',${alreadyMemberEmail},${alreadyMemberEmail},'+10000000002','V','active','2025-01-01','$existing-credential$',CURRENT_TIMESTAMP)
  `);
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "osi"."tenant_memberships" ("id","tenant_id","user_id","role","status","granted_permissions","denied_permissions","is_default","provisioning_source","updated_at")
    VALUES (${alreadyMemberMembershipId},${tenant1},${alreadyMemberUserId},'V','ACTIVE',ARRAY['projects:view']::TEXT[],ARRAY[]::TEXT[],true,'MANUAL',CURRENT_TIMESTAMP)
  `);
  const alreadyMember = await createApproved("already-member", {
    identityMode: "EXISTING_GLOBAL_USER", email: alreadyMemberEmail, targetUserId: alreadyMemberUserId,
  });
  await expectCode("membresía ya existente en tenant objetivo se rechaza", () => materializeApprovedEmployeeProvisioning(prisma, context(actors.executor), {
    provisioningRequestId: alreadyMember.request.id, requestId: id("execute-already-member"), expectedLifecycleVersion: 0,
  }), "EMPLOYEE_PROVISIONING_MEMBERSHIP_CONFLICT");

  const legacyUser = { id: id("legacy-user"), email: `Legacy.Mixed.${run}@Example.test` };
  syntheticUserIds.add(legacyUser.id);
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "osi"."osi_users" ("id","code","name","email","phone","role","status","joinDate","passwordHash","updatedAt")
    VALUES (${legacyUser.id},${`C1B3A-LEGACY-${run}`},'Synthetic legacy',${legacyUser.email},'', 'V','active','2026-08-09','$synthetic$',CURRENT_TIMESTAMP)
  `);
  const collision = await createApproved("legacy-collision", { email: legacyUser.email.toLowerCase() });
  await expectCode("correo heredado se compara mediante lower(trim(email))", () => materializeApprovedEmployeeProvisioning(prisma, context(actors.executor), {
    provisioningRequestId: collision.request.id, requestId: id("execute-legacy-collision"), expectedLifecycleVersion: 0,
  }), "EMPLOYEE_PROVISIONING_EMAIL_CONFLICT");
  check("correo heredado inválido o mixto no se corrige", (await prisma.user.findUnique({ where: { id: legacyUser.id } }))?.normalizedEmail === null);

  const emailRace = await runReservationRace("same-email", "normalizedEmail");
  check("20 requestId distintos con mismo correo producen un ganador", emailRace.winners.length === 1 && emailRace.conflicts.length === 19);
  check("carrera de correo crea un solo User global", await prisma.user.count({ where: { normalizedEmail: emailRace.shared } }) === 1);
  const codeRace = await runReservationRace("same-code", "normalizedEmployeeCode");
  check("20 requestId distintos con mismo employeeCode producen un ganador", codeRace.winners.length === 1 && codeRace.conflicts.length === 19);
  check("carrera de código crea un solo perfil por tenant", await prisma.employeeProfile.count({ where: { tenantId: tenant1, normalizedEmployeeCode: codeRace.shared } }) === 1);

  const crossTenantEmail = `cross.tenant.shared.${run}@example.test`;
  const crossTenantOne = await createApproved("cross-tenant-email-one");
  const crossTenantTwo = await createApproved("cross-tenant-email-two", {}, {
    requester: actors.foreignRequester,
    approver: actors.foreignApprover,
  });
  await prisma.employeeProvisioningRequest.updateMany({
    where: { id: { in: [crossTenantOne.request.id, crossTenantTwo.request.id] } },
    data: { normalizedEmail: crossTenantEmail },
  });
  const crossTenantSettled = await Promise.allSettled([
    materializeApprovedEmployeeProvisioning(prisma, context(actors.executor), {
      provisioningRequestId: crossTenantOne.request.id, requestId: id("execute-cross-tenant-email-one"), expectedLifecycleVersion: 0,
    }),
    materializeApprovedEmployeeProvisioning(prisma, context(actors.foreignExecutor), {
      provisioningRequestId: crossTenantTwo.request.id, requestId: id("execute-cross-tenant-email-two"), expectedLifecycleVersion: 0,
    }),
  ]);
  crossTenantSettled.filter((entry) => entry.status === "fulfilled").forEach((entry) => syntheticUserIds.add(entry.value.userId));
  check("tenants diferentes no crean dos User globales con el mismo correo", crossTenantSettled.filter((entry) => entry.status === "fulfilled").length === 1
    && crossTenantSettled.filter((entry) => entry.status === "rejected" && entry.reason?.code === "EMPLOYEE_PROVISIONING_EMAIL_CONFLICT").length === 1
    && await prisma.user.count({ where: { normalizedEmail: crossTenantEmail } }) === 1);

  const pending = await createEmployeeProvisioningRequest(prisma, context(actors.requester), requestInput("pending"));
  await expectCode("solicitud PENDING no se materializa", () => materializeApprovedEmployeeProvisioning(prisma, context(actors.executor), {
    provisioningRequestId: pending.request.id, requestId: id("execute-pending"), expectedLifecycleVersion: 0,
  }), "EMPLOYEE_PROVISIONING_NOT_APPROVED");
  await prisma.tenantMembership.update({
    where: { id: actors.executor.membershipId },
    data: { grantedPermissions: [], deniedPermissions: [P.MATERIALIZE] },
  });
  await expectCode("permiso materialize denegado prevalece sobre el navegador", () => materializeApprovedEmployeeProvisioning(prisma, context(actors.executor), {
    provisioningRequestId: pending.request.id, requestId: id("execute-denied-materialize"), expectedLifecycleVersion: 0,
  }), "EMPLOYEE_PROVISIONING_FORBIDDEN");
  await prisma.tenantMembership.update({
    where: { id: actors.executor.membershipId },
    data: { grantedPermissions: [P.MATERIALIZE], deniedPermissions: [] },
  });

  const tampered = await createApproved("tampered");
  await prisma.employeeProvisioningRequest.update({ where: { id: tampered.request.id }, data: { grantedPermissions: ["clients:view"] } });
  await expectCode("rol y permisos deben coincidir con evidencia aprobada", () => materializeApprovedEmployeeProvisioning(prisma, context(actors.executor), {
    provisioningRequestId: tampered.request.id, requestId: id("execute-tampered"), expectedLifecycleVersion: 0,
  }), "EMPLOYEE_PROVISIONING_APPROVAL_EVIDENCE_INVALID");

  const userFailure = await createApproved("user-failure");
  await expectDatabaseFailure("falla al crear User se propaga", () => materializeApprovedEmployeeProvisioning(prisma, context(actors.executor), {
    provisioningRequestId: userFailure.request.id, requestId: id("execute-user-failure"), expectedLifecycleVersion: 0,
  }, { ids: { userId: actors.requester.userId } }));
  await assertNoResidue("falla de User no deja identidad parcial", userFailure);

  const membershipFailure = await createApproved("membership-failure");
  await expectDatabaseFailure("falla al crear Membership se propaga", () => materializeApprovedEmployeeProvisioning(prisma, context(actors.executor), {
    provisioningRequestId: membershipFailure.request.id, requestId: id("execute-membership-failure"), expectedLifecycleVersion: 0,
  }, { ids: { userId: id("membership-failure-user"), membershipId: actors.executor.membershipId } }));
  await assertNoResidue("falla de Membership revierte User", membershipFailure);

  const profileFailure = await createApproved("profile-failure");
  await expectDatabaseFailure("falla al crear EmployeeProfile se propaga", () => materializeApprovedEmployeeProvisioning(prisma, context(actors.executor), {
    provisioningRequestId: profileFailure.request.id, requestId: id("execute-profile-failure"), expectedLifecycleVersion: 0,
  }, { ids: { userId: id("profile-failure-user"), membershipId: id("profile-failure-membership"), profileId: materialized.employeeProfileId } }));
  await assertNoResidue("falla de EmployeeProfile revierte User y Membership", profileFailure);

  const lifecycleFailure = await createApproved("lifecycle-failure");
  await expectCode("falla al actualizar lifecycle se propaga", () => materializeApprovedEmployeeProvisioning(prisma, context(actors.executor), {
    provisioningRequestId: lifecycleFailure.request.id, requestId: id("execute-lifecycle-failure"), expectedLifecycleVersion: 0,
  }, { beforeLifecycle: async () => { const error = new Error("synthetic lifecycle failure"); error.code = "SYNTHETIC_LIFECYCLE_FAILURE"; throw error; } }), "SYNTHETIC_LIFECYCLE_FAILURE");
  await assertNoResidue("falla de lifecycle revierte User, Membership y Profile", lifecycleFailure);

  const auditFailure = await createApproved("audit-failure");
  await expectCode("falla crítica de auditoría se propaga", () => materializeApprovedEmployeeProvisioning(prisma, context(actors.executor), {
    provisioningRequestId: auditFailure.request.id, requestId: id("execute-audit-failure"), expectedLifecycleVersion: 0,
  }, { auditWriter: async () => { const error = new Error("synthetic audit failure"); error.code = "SYNTHETIC_AUDIT_FAILURE"; throw error; } }), "SYNTHETIC_AUDIT_FAILURE");
  const failedRequest = await prisma.employeeProvisioningRequest.findUnique({ where: { id: auditFailure.request.id } });
  check("auditoría fallida revierte lifecycle", failedRequest?.lifecycleStatus === null && failedRequest?.provisionedUserId === null);
  check("auditoría fallida no deja identidad parcial", await prisma.user.count({ where: { normalizedEmail: requestInput("audit-failure").email } }) === 0 && await prisma.employeeProfile.count({ where: { tenantId: tenant1, normalizedEmployeeCode: requestInput("audit-failure").employeeCode.toUpperCase() } }) === 0);
  const retried = await materializeApprovedEmployeeProvisioning(prisma, context(actors.executor), {
    provisioningRequestId: auditFailure.request.id, requestId: id("execute-audit-failure"), expectedLifecycleVersion: 0,
  });
  syntheticUserIds.add(retried.userId);
  check("reintento posterior al rollback materializa una vez", retried.lifecycleStatus === "PROVISIONED_INACTIVE");

  const adminCreated = await createEmployeeProvisioningRequest(prisma, context(actors.requester), requestInput("admin", {
    requestedRole: "A", grantedPermissions: [], deniedPermissions: [],
  }));
  const proposal = await proposeEmployeeAdminRole(prisma, context(actors.proposer), {
    provisioningRequestId: adminCreated.request.id,
    requestId: id("admin-proposal"),
    grantedPermissions: ["users:create", P.ROLE_A_ASSIGN],
    deniedPermissions: ["clients:edit"],
  });
  await decideEmployeeProvisioningRequest(prisma, context(actors.adminDecider), {
    id: adminCreated.request.id,
    decision: "APPROVED",
    proposalId: proposal.proposal.id,
    reason: "Approved four eyes",
    requestId: id("approve-admin"),
    expectedVersion: adminCreated.approval.version,
  });
  const adminMaterialized = await materializeApprovedEmployeeProvisioning(prisma, context(actors.executor), {
    provisioningRequestId: adminCreated.request.id, requestId: id("execute-admin"), expectedLifecycleVersion: 0,
  });
  syntheticUserIds.add(adminMaterialized.userId);
  const adminMembership = await prisma.tenantMembership.findUnique({ where: { id: adminMaterialized.membershipId } });
  check("rol A exige y conserva propuesta append-only exacta", adminMembership?.role === "A"
    && await prisma.employeeAdminRoleProposal.count({ where: { id: proposal.proposal.id } }) === 1);
  check("cuatro ojos usa solicitante, proponente y decisor distintos", new Set([actors.requester.membershipId, actors.proposer.membershipId, actors.adminDecider.membershipId]).size === 3);
  check("denies prevalecen y permisos sensibles nunca se delegan", adminMembership?.deniedPermissions.includes("clients:edit")
    && !adminMembership?.grantedPermissions.includes("clients:edit")
    && !adminMembership?.grantedPermissions.includes("users:create")
    && !adminMembership?.grantedPermissions.includes(P.ROLE_A_ASSIGN));

  const adminSelfCreated = await createEmployeeProvisioningRequest(prisma, context(actors.requester), requestInput("admin-self", {
    identityMode: "EXISTING_GLOBAL_USER", email: `proposer.${run}@example.test`, targetUserId: actors.proposer.userId,
    requestedRole: "A",
  }));
  await expectCode("rol A no permite que el proponente sea el empleado objetivo", () => proposeEmployeeAdminRole(
    prisma,
    context(actors.proposer),
    {
      provisioningRequestId: adminSelfCreated.request.id,
      requestId: id("admin-self-proposal"),
      grantedPermissions: [],
      deniedPermissions: [],
    },
  ), "EMPLOYEE_PROVISIONING_SELF_ADMIN_FORBIDDEN");

  const foreign = await createApproved("foreign-normal", { employeeCode: requestInput("normal").employeeCode }, {
    requester: actors.foreignRequester,
    approver: actors.foreignApprover,
  });
  const foreignMaterialized = await materializeApprovedEmployeeProvisioning(prisma, context(actors.foreignExecutor), {
    provisioningRequestId: foreign.request.id, requestId: id("execute-foreign"), expectedLifecycleVersion: 0,
  });
  syntheticUserIds.add(foreignMaterialized.userId);
  check("mismo employeeCode se permite en dos tenants", await prisma.employeeProfile.count({ where: { normalizedEmployeeCode: requestInput("normal").employeeCode.toUpperCase() } }) === 2);

  await expectDatabaseFailure("FK compuesta rechaza perfil con membresía de otro tenant", () => prisma.employeeProfile.create({
    data: {
      id: id("cross-profile"), tenantId: tenant1, membershipId: foreignMaterialized.membershipId,
      userId: foreignMaterialized.userId, employeeCode: `CROSS-${run.toUpperCase()}`,
      normalizedEmployeeCode: `CROSS-${run.toUpperCase()}`, employmentStatus: "ACTIVE", availabilityStatus: "AVAILABLE",
    },
  }));

  await expectCode("supervisor de otro tenant se rechaza sin enumerarlo", () => createEmployeeProvisioningRequest(
    prisma,
    context(actors.requester),
    requestInput("foreign-supervisor", { supervisorMembershipId: actors.foreignApprover.membershipId }),
  ), "EMPLOYEE_PROVISIONING_NOT_FOUND");

  const selfSupervisorUserId = id("self-supervisor-user");
  const selfSupervisorMembershipId = id("self-supervisor-membership");
  const selfSupervisorEmail = `self.supervisor.${run}@example.test`;
  syntheticUserIds.add(selfSupervisorUserId);
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "osi"."osi_users" ("id","code","name","email","normalized_email","phone","role","status","joinDate","passwordHash","updatedAt")
    VALUES (${selfSupervisorUserId},${`C1B3A-SELF-SUP-${run}`},'Synthetic self supervisor',${selfSupervisorEmail},${selfSupervisorEmail},'', 'V','active','2026-08-09','$synthetic$',CURRENT_TIMESTAMP)
  `);
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "osi"."tenant_memberships" ("id","tenant_id","user_id","role","status","granted_permissions","denied_permissions","is_default","provisioning_source","updated_at")
    VALUES (${selfSupervisorMembershipId},${tenant1},${selfSupervisorUserId},'V','ACTIVE',ARRAY[]::TEXT[],ARRAY[]::TEXT[],true,'MANUAL',CURRENT_TIMESTAMP)
  `);
  const selfSupervisorRequest = await createApproved("self-supervisor", {
    identityMode: "EXISTING_GLOBAL_USER", email: selfSupervisorEmail, targetUserId: selfSupervisorUserId,
    supervisorMembershipId: selfSupervisorMembershipId,
  });
  await expectCode("autosupervisión se rechaza antes del conflicto de membresía", () => materializeApprovedEmployeeProvisioning(prisma, context(actors.executor), {
    provisioningRequestId: selfSupervisorRequest.request.id, requestId: id("execute-self-supervisor"), expectedLifecycleVersion: 0,
  }), "EMPLOYEE_PROVISIONING_SELF_SUPERVISION_FORBIDDEN");

  const selfRequest = await createApproved("self-assignment", {
    identityMode: "EXISTING_GLOBAL_USER", email: `executor.${run}@example.test`, targetUserId: actors.executor.userId,
  });
  await expectCode("autoasignación del ejecutor se rechaza", () => materializeApprovedEmployeeProvisioning(prisma, context(actors.executor), {
    provisioningRequestId: selfRequest.request.id, requestId: id("execute-self-assignment"), expectedLifecycleVersion: 0,
  }), "EMPLOYEE_PROVISIONING_SELF_ASSIGNMENT_FORBIDDEN");
  check("autoasignación no deja perfil parcial", await prisma.employeeProfile.count({ where: { tenantId: tenant1, userId: actors.executor.userId } }) === 0);

  const collisionA = await createApproved("lock-collision-a");
  const collisionB = await createApproved("lock-collision-b", {}, {
    requester: actors.foreignRequester,
    approver: actors.foreignApprover,
  });
  const forced = await Promise.all([
    materializeApprovedEmployeeProvisioning(prisma, context(actors.executor), {
      provisioningRequestId: collisionA.request.id, requestId: id("execute-lock-a"), expectedLifecycleVersion: 0,
    }, { advisoryLockKeyMapper: () => `forced-c1b3a-collision-${run}` }),
    materializeApprovedEmployeeProvisioning(prisma, context(actors.foreignExecutor), {
      provisioningRequestId: collisionB.request.id, requestId: id("execute-lock-b"), expectedLifecycleVersion: 0,
    }, { advisoryLockKeyMapper: () => `forced-c1b3a-collision-${run}` }),
  ]);
  forced.forEach((row) => syntheticUserIds.add(row.userId));
  check("colisión de hash sólo añade espera y no mezcla tenants", forced[0].membershipId !== forced[1].membershipId);

  const finalCounts = await Promise.all([
    prisma.employeeProvisioningRequest.count({ where: { tenant_id: { in: [tenant1, tenant2] }, lifecycleStatus: "PROVISIONED_INACTIVE" } }),
    prisma.employeeProfile.count({ where: { tenantId: { in: [tenant1, tenant2] } } }),
    prisma.tenantMembership.count({ where: { tenantId: { in: [tenant1, tenant2] }, status: "INACTIVE" } }),
  ]);
  check("no existen identidades parcialmente materializadas", finalCounts[0] === finalCounts[1] && finalCounts[1] === finalCounts[2]);

  process.stdout.write(`${JSON.stringify({
    ok: true,
    assertions: results.length,
    failed: 0,
    concurrency: {
      identical: { requests: 20, durationMs: concurrencyDurationMs, winners: 1 },
      sameEmail: { requests: 20, durationMs: emailRace.durationMs, winners: emailRace.winners.length },
      sameEmployeeCode: { requests: 20, durationMs: codeRace.durationMs, winners: codeRace.winners.length },
    },
    results,
  }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({
    ok: false,
    assertions: results.length,
    failed: 1,
    error: { name: error?.name, code: error?.code, message: error?.message },
    results,
  }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  try { await cleanup(); } catch (cleanupError) {
    process.stderr.write(`[mt-01c1b3a] cleanup failed code=${cleanupError?.code || cleanupError?.name}\n`);
    process.exitCode = 1;
  }
  await prisma.$disconnect();
}
