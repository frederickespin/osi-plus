import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { buildEmailNormalizationReport, classifyEmail, createMt01c1b1Prisma } from "./mt-01c1b1-email-normalization.mjs";

const prisma = createMt01c1b1Prisma();
const results = [];
const run = randomUUID().slice(0, 8);
const hex = (marker) => createHash("sha256").update(`${run}:${marker}`).digest("hex");

function check(name, condition, details) {
  if (!condition) throw new Error(`MT-01C1B1_TEST_FAILED: ${name}${details ? ` (${details})` : ""}`);
  results.push({ name, passed: true });
}

async function expectDbError(name, work) {
  try {
    await work();
    throw new Error(`${name}: operación inválida aceptada`);
  } catch (error) {
    if (String(error?.message).includes("operación inválida aceptada")) throw error;
    check(name, true);
  }
}

const ids = {
  tenantOne: `c1b1-t1-${run}`,
  tenantTwo: `c1b1-t2-${run}`,
  userOne: `c1b1-u1-${run}`,
  userTwo: `c1b1-u2-${run}`,
  memberOne: `c1b1-m1-${run}`,
  memberTwo: `c1b1-m2-${run}`,
  approvalOne: `c1b1-a1-${run}`,
  approvalTwo: `c1b1-a2-${run}`,
  requestOne: `c1b1-r1-${run}`,
};

async function seed() {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "osi"."osi_users"
      ("id","code","name","email","phone","role","status","joinDate","passwordHash","updatedAt")
    VALUES
      (${ids.userOne}, ${`C1B1-U1-${run}`}, 'Synthetic One', ${`c1b1.one.${run}@example.test`}, '+10000000001', 'A', 'active', '2026-08-07', '$synthetic$', CURRENT_TIMESTAMP),
      (${ids.userTwo}, ${`C1B1-U2-${run}`}, 'Synthetic Two', ${`c1b1.two.${run}@example.test`}, '+10000000002', 'A', 'active', '2026-08-07', '$synthetic$', CURRENT_TIMESTAMP)
  `);
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "osi"."tenants" ("id","code","name","status","provisioning_source","updated_at")
    VALUES
      (${ids.tenantOne}, ${`C1B1-T1-${run.toUpperCase()}`}, 'C1B1 Tenant One', 'ACTIVE', 'MANUAL', CURRENT_TIMESTAMP),
      (${ids.tenantTwo}, ${`C1B1-T2-${run.toUpperCase()}`}, 'C1B1 Tenant Two', 'ACTIVE', 'MANUAL', CURRENT_TIMESTAMP)
  `);
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "osi"."tenant_memberships"
      ("id","tenant_id","user_id","role","status","is_default","provisioning_source","updated_at")
    VALUES
      (${ids.memberOne}, ${ids.tenantOne}, ${ids.userOne}, 'A', 'ACTIVE', true, 'MANUAL', CURRENT_TIMESTAMP),
      (${ids.memberTwo}, ${ids.tenantTwo}, ${ids.userTwo}, 'A', 'ACTIVE', true, 'MANUAL', CURRENT_TIMESTAMP)
  `);
  await approval(ids.approvalOne, ids.tenantOne, ids.memberOne, ids.userOne, "APPROVED");
  await approval(ids.approvalTwo, ids.tenantTwo, ids.memberTwo, ids.userTwo, "APPROVED");
}

async function approval(id, tenantId, membershipId, userId, status, approvalType = "EMPLOYEE_PROVISIONING") {
  const decided = status === "APPROVED";
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "osi"."approval_requests"
      ("id","tenant_id","approval_type","entity","entity_id","requester_user_id","requester_membership_id",
       "status","request_reason","evaluation_snapshot_json","decider_user_id","decider_membership_id","decided_at",
       "decision_reason","request_id","payload_hash")
    VALUES
      (${id}, ${tenantId}, ${approvalType}, ${approvalType}, ${id}, ${userId}, ${membershipId},
       ${status}::"osi"."ApprovalRequestStatus", 'Synthetic test', '{}'::jsonb,
       ${decided ? userId : null}, ${decided ? membershipId : null}, ${decided ? new Date() : null},
       ${decided ? "Approved for test" : null}, ${`approval-${id}`}, ${"a".repeat(64)})
  `);
}

function requestData(overrides = {}) {
  return {
    id: randomUUID(),
    tenant_id: ids.tenantOne,
    approval_request_id: ids.approvalOne,
    identityMode: "NEW_GLOBAL_USER",
    normalizedEmail: `new.${run}@example.test`,
    normalizedEmployeeCode: `EMP-${run.toUpperCase()}`,
    employmentStatus: "ACTIVE",
    availabilityStatus: "AVAILABLE",
    requestedRole: "V",
    ...overrides,
  };
}

try {
  await seed();
  check("two tenants seeded independently", await prisma.tenant.count({ where: { id: { in: [ids.tenantOne, ids.tenantTwo] } } }) === 2);

  const request = await prisma.employeeProvisioningRequest.create({ data: requestData({ id: ids.requestOne }) });
  check("request starts without duplicated approval state", request.lifecycleStatus === null && request.lifecycleVersion === 0);
  check("request stores canonical email and employee code", request.normalizedEmail === `new.${run}@example.test` && request.normalizedEmployeeCode === `EMP-${run.toUpperCase()}`);

  await expectDbError("one extension per ApprovalRequest", () => prisma.employeeProvisioningRequest.create({ data: requestData() }));
  await expectDbError("cross-tenant ApprovalRequest rejected", () => prisma.employeeProvisioningRequest.create({
    data: requestData({ id: randomUUID(), approval_request_id: ids.approvalTwo, normalizedEmail: `cross.${run}@example.test` }),
  }));
  const wrongTypeApproval = `c1b1-wrong-type-${run}`;
  await approval(wrongTypeApproval, ids.tenantOne, ids.memberOne, ids.userOne, "APPROVED", "LOGISTIC_OVERRIDE");
  await expectDbError("non-employee ApprovalRequest rejected", () => prisma.employeeProvisioningRequest.create({
    data: requestData({ id: randomUUID(), approval_request_id: wrongTypeApproval, normalizedEmail: `wrong-type.${run}@example.test` }),
  }));
  await expectDbError("null lifecycle requires version zero", () => prisma.employeeProvisioningRequest.create({
    data: requestData({ id: randomUUID(), approval_request_id: ids.approvalTwo, tenant_id: ids.tenantTwo, lifecycleVersion: 1, normalizedEmail: `version.${run}@example.test` }),
  }));

  const pendingApproval = `c1b1-pending-${run}`;
  await approval(pendingApproval, ids.tenantOne, ids.memberOne, ids.userOne, "PENDING");
  await expectDbError("post-approval lifecycle requires APPROVED", () => prisma.employeeProvisioningRequest.create({
    data: requestData({ id: randomUUID(), approval_request_id: pendingApproval, lifecycleStatus: "IDENTITY_PENDING", lifecycleVersion: 1, normalizedEmail: `pending.${run}@example.test` }),
  }));
  await prisma.employeeProvisioningRequest.update({
    where: { id: ids.requestOne }, data: { lifecycleStatus: "IDENTITY_PENDING", lifecycleVersion: 1 },
  });
  check("IDENTITY_PENDING requires and accepts an approved employee request", (await prisma.employeeProvisioningRequest.findUnique({ where: { id: ids.requestOne } }))?.lifecycleStatus === "IDENTITY_PENDING");
  await expectDbError("provisioned membership requires complete pair", () => prisma.$executeRaw(Prisma.sql`
    UPDATE "osi"."employee_provisioning_requests"
       SET "lifecycle_status"='PROVISIONED_INACTIVE', "lifecycle_version"=1,
           "provisioned_membership_id"=${ids.memberOne}, "provisioned_at"=CURRENT_TIMESTAMP
     WHERE "id"=${ids.requestOne}
  `));
  await prisma.employeeProvisioningRequest.update({
    where: { id: ids.requestOne },
    data: {
      lifecycleStatus: "PROVISIONED_INACTIVE",
      lifecycleVersion: 2,
      provisionedMembershipId: ids.memberOne,
      provisionedUserId: ids.userOne,
      provisionedAt: new Date(),
    },
  });
  check("same-tenant provisioned membership accepted", (await prisma.employeeProvisioningRequest.findUnique({ where: { id: ids.requestOne } }))?.provisionedMembershipId === ids.memberOne);
  await expectDbError("cross-tenant provisioned membership rejected", () => prisma.employeeProvisioningRequest.update({
    where: { id: ids.requestOne }, data: { provisionedMembershipId: ids.memberTwo, provisionedUserId: ids.userTwo },
  }));
  await expectDbError("tenant and approval identity immutable", () => prisma.employeeProvisioningRequest.update({
    where: { id: ids.requestOne }, data: { approval_request_id: pendingApproval },
  }));
  await expectDbError("contract end before start rejected", () => prisma.employeeProvisioningRequest.update({
    where: { id: ids.requestOne }, data: { contractStartsAt: new Date("2026-08-10"), contractEndsAt: new Date("2026-08-09") },
  }));
  await expectDbError("terminatedAt rejected for active employment", () => prisma.employeeProvisioningRequest.update({
    where: { id: ids.requestOne }, data: { terminatedAt: new Date("2026-08-10") },
  }));
  await expectDbError("normalized employee code must be stored uppercase", () => prisma.employeeProvisioningRequest.update({
    where: { id: ids.requestOne }, data: { normalizedEmployeeCode: `emp-${run}` },
  }));

  const invitationBase = {
    tenant_id: ids.tenantOne,
    provisioningRequestId: ids.requestOne,
    tokenHmac: hex("issued"),
    status: "ISSUED",
    expiresAt: new Date(Date.now() + 3_600_000),
    maxAttempts: 5,
    issuedByMembershipId: ids.memberOne,
    issuedByUserId: ids.userOne,
    issueRequestId: `issue-${run}`,
    issuePayloadHash: hex("issue-payload"),
  };
  const invitation = await prisma.employeeProvisioningInvitation.create({ data: invitationBase });
  check("ISSUED invitation starts coherent", invitation.status === "ISSUED" && invitation.attemptCount === 0 && invitation.acceptedAt === null);
  await expectDbError("only one ISSUED invitation per request", () => prisma.employeeProvisioningInvitation.create({
    data: { ...invitationBase, id: randomUUID(), tokenHmac: hex("second-issued"), issueRequestId: `issue-two-${run}` },
  }));
  await expectDbError("invitation rejects invalid HMAC", () => prisma.employeeProvisioningInvitation.create({
    data: { ...invitationBase, id: randomUUID(), tokenHmac: "not-a-hmac", issueRequestId: `issue-hmac-${run}`, status: "REVOKED", revokedAt: new Date() },
  }));
  await expectDbError("invitation rejects uppercase HMAC", () => prisma.employeeProvisioningInvitation.create({
    data: { ...invitationBase, id: randomUUID(), tokenHmac: "A".repeat(64), issueRequestId: `issue-uppercase-hmac-${run}`, status: "REVOKED", createdAt: new Date(Date.now() - 60_000), revokedAt: new Date() },
  }));
  await expectDbError("invitation rejects unreasonable maxAttempts", () => prisma.employeeProvisioningInvitation.create({
    data: { ...invitationBase, id: randomUUID(), tokenHmac: hex("attempt-limit"), issueRequestId: `issue-attempt-limit-${run}`, maxAttempts: 21, status: "REVOKED", createdAt: new Date(Date.now() - 60_000), revokedAt: new Date() },
  }));
  await expectDbError("invitation enforces attempt limit", () => prisma.employeeProvisioningInvitation.update({
    where: { id: invitation.id }, data: { attemptCount: 6 },
  }));
  await expectDbError("ACCEPTED invitation requires acceptance fields", () => prisma.employeeProvisioningInvitation.update({
    where: { id: invitation.id }, data: { status: "ACCEPTED" },
  }));
  await expectDbError("invitation rejects event timestamps before creation or expiry", () => prisma.employeeProvisioningInvitation.create({ data: {
    ...invitationBase, id: randomUUID(), tokenHmac: hex("expired-too-early"), issueRequestId: `issue-expired-too-early-${run}`,
    issuePayloadHash: "9".repeat(64), status: "EXPIRED", expiredAt: new Date(),
  } }));
  await expectDbError("invitation identity is immutable", () => prisma.employeeProvisioningInvitation.update({
    where: { id: invitation.id }, data: { issueRequestId: `changed-${run}` },
  }));
  await expectDbError("invitation issuer identity is immutable", () => prisma.employeeProvisioningInvitation.update({
    where: { id: invitation.id }, data: { issuedByUserId: ids.userTwo },
  }));
  await expectDbError("invitation security policy is immutable", () => prisma.employeeProvisioningInvitation.update({
    where: { id: invitation.id }, data: { expiresAt: new Date(Date.now() + 7_200_000) },
  }));
  const acceptedInvitation = await prisma.employeeProvisioningInvitation.update({
    where: { id: invitation.id },
    data: {
      status: "ACCEPTED",
      acceptanceRequestId: `accept-${run}`,
      acceptancePayloadHash: "2".repeat(64),
      acceptedUserId: ids.userOne,
      acceptedAt: new Date(),
    },
  });
  check("ACCEPTED invitation stores coherent timestamp and user", acceptedInvitation.acceptedAt instanceof Date && acceptedInvitation.acceptedUserId === ids.userOne);
  const concurrentIssued = await Promise.allSettled(Array.from({ length: 20 }, (_, index) => prisma.employeeProvisioningInvitation.create({ data: {
    ...invitationBase,
    id: randomUUID(),
    tokenHmac: hex(`concurrent-issued-${index}`),
    issueRequestId: `issue-concurrent-${run}-${index}`,
    issuePayloadHash: hex(`concurrent-payload-${index}`),
  } })));
  check("concurrent ISSUED invitations produce exactly one winner", concurrentIssued.filter((result) => result.status === "fulfilled").length === 1);
  const revokedInvitation = await prisma.employeeProvisioningInvitation.create({ data: {
    ...invitationBase, id: randomUUID(), tokenHmac: hex("revoked"), issueRequestId: `issue-revoked-${run}`,
    issuePayloadHash: "4".repeat(64), status: "REVOKED",
    createdAt: new Date(Date.now() - 60_000), revokedAt: new Date(),
  } });
  check("REVOKED invitation requires revokedAt", revokedInvitation.revokedAt instanceof Date && revokedInvitation.acceptedAt === null);
  const expiredInvitation = await prisma.employeeProvisioningInvitation.create({ data: {
    ...invitationBase, id: randomUUID(), tokenHmac: hex("expired"), issueRequestId: `issue-expired-${run}`,
    issuePayloadHash: "6".repeat(64), status: "EXPIRED",
    createdAt: new Date(Date.now() - 120_000), expiresAt: new Date(Date.now() - 60_000), expiredAt: new Date(),
  } });
  check("EXPIRED invitation requires expiredAt", expiredInvitation.expiredAt instanceof Date && expiredInvitation.revokedAt === null);
  await expectDbError("cross-tenant invitation issuer rejected", () => prisma.employeeProvisioningInvitation.create({ data: {
    ...invitationBase, id: randomUUID(), tokenHmac: hex("cross"), issueRequestId: `issue-cross-${run}`,
    issuePayloadHash: "8".repeat(64), status: "REVOKED",
    createdAt: new Date(Date.now() - 60_000), revokedAt: new Date(),
    issuedByMembershipId: ids.memberTwo, issuedByUserId: ids.userTwo,
  } }));

  const proposal = await prisma.employeeAdminRoleProposal.create({ data: {
    tenant_id: ids.tenantOne,
    provisioningRequestId: ids.requestOne,
    proposedRole: "A",
    proposerMembershipId: ids.memberOne,
    proposerUserId: ids.userOne,
    requestId: `role-a-${run}`,
    payloadHash: "e".repeat(64),
    grantedPermissions: ["employee:role:a:assign"],
  } });
  check("admin proposal accepts only explicit role A", proposal.proposedRole === "A");
  await expectDbError("admin proposal rejects non-A role", () => prisma.employeeAdminRoleProposal.create({ data: {
    tenant_id: ids.tenantOne, provisioningRequestId: ids.requestOne, proposedRole: "V",
    proposerMembershipId: ids.memberOne, proposerUserId: ids.userOne,
    requestId: `role-v-${run}`, payloadHash: "f".repeat(64),
  } }));
  await expectDbError("admin proposal rejects overlapping permissions", () => prisma.employeeAdminRoleProposal.create({ data: {
    tenant_id: ids.tenantOne, provisioningRequestId: ids.requestOne, proposedRole: "A",
    proposerMembershipId: ids.memberOne, proposerUserId: ids.userOne,
    requestId: `role-overlap-${run}`, payloadHash: "1".repeat(64),
    grantedPermissions: ["same"], deniedPermissions: ["same"],
  } }));
  await expectDbError("admin proposal requestId is idempotently unique", () => prisma.employeeAdminRoleProposal.create({ data: {
    tenant_id: ids.tenantOne, provisioningRequestId: ids.requestOne, proposedRole: "A",
    proposerMembershipId: ids.memberOne, proposerUserId: ids.userOne,
    requestId: `role-a-${run}`, payloadHash: "e".repeat(64),
  } }));
  await expectDbError("admin proposal UPDATE blocked", () => prisma.employeeAdminRoleProposal.update({
    where: { id: proposal.id }, data: { grantedPermissions: [] },
  }));
  await expectDbError("admin proposal DELETE blocked", () => prisma.employeeAdminRoleProposal.delete({ where: { id: proposal.id } }));
  await expectDbError("cross-tenant proposal author rejected", () => prisma.employeeAdminRoleProposal.create({ data: {
    tenant_id: ids.tenantOne, provisioningRequestId: ids.requestOne, proposedRole: "A",
    proposerMembershipId: ids.memberTwo, proposerUserId: ids.userTwo,
    requestId: `role-cross-${run}`, payloadHash: "9".repeat(64),
  } }));
  const concurrentProposalRequestId = `role-concurrent-${run}`;
  const concurrentProposals = await Promise.allSettled([
    prisma.employeeAdminRoleProposal.create({ data: {
      tenant_id: ids.tenantOne, provisioningRequestId: ids.requestOne, proposedRole: "A",
      proposerMembershipId: ids.memberOne, proposerUserId: ids.userOne,
      requestId: concurrentProposalRequestId, payloadHash: "2".repeat(64),
    } }),
    prisma.employeeAdminRoleProposal.create({ data: {
      tenant_id: ids.tenantOne, provisioningRequestId: ids.requestOne, proposedRole: "A",
      proposerMembershipId: ids.memberOne, proposerUserId: ids.userOne,
      requestId: concurrentProposalRequestId, payloadHash: "3".repeat(64),
    } }),
  ]);
  check("concurrent role proposals keep one exact idempotency outcome", concurrentProposals.filter((result) => result.status === "fulfilled").length === 1);

  await expectDbError("ACTIVE lifecycle requires activatedAt", () => prisma.employeeProvisioningRequest.update({
    where: { id: ids.requestOne }, data: { lifecycleStatus: "ACTIVE", lifecycleVersion: 3 },
  }));
  await prisma.employeeProvisioningRequest.update({
    where: { id: ids.requestOne }, data: { lifecycleStatus: "ACTIVE", lifecycleVersion: 3, activatedAt: new Date() },
  });
  check("ACTIVE lifecycle stores activatedAt", (await prisma.employeeProvisioningRequest.findUnique({ where: { id: ids.requestOne } }))?.activatedAt instanceof Date);
  await expectDbError("ACTIVE lifecycle rejects revokedAt", () => prisma.employeeProvisioningRequest.update({
    where: { id: ids.requestOne }, data: { revokedAt: new Date() },
  }));
  await expectDbError("REVOKED lifecycle requires revokedAt", () => prisma.employeeProvisioningRequest.update({
    where: { id: ids.requestOne }, data: { lifecycleStatus: "REVOKED", lifecycleVersion: 4 },
  }));
  await prisma.employeeProvisioningRequest.update({
    where: { id: ids.requestOne }, data: { lifecycleStatus: "REVOKED", lifecycleVersion: 4, revokedAt: new Date() },
  });
  check("REVOKED lifecycle stores revokedAt", (await prisma.employeeProvisioningRequest.findUnique({ where: { id: ids.requestOne } }))?.revokedAt instanceof Date);
  await expectDbError("TERMINATED lifecycle requires terminatedAt", () => prisma.employeeProvisioningRequest.update({
    where: { id: ids.requestOne }, data: { lifecycleStatus: "TERMINATED", lifecycleVersion: 5, employmentStatus: "TERMINATED" },
  }));
  await prisma.employeeProvisioningRequest.update({
    where: { id: ids.requestOne }, data: { lifecycleStatus: "TERMINATED", lifecycleVersion: 5, employmentStatus: "TERMINATED", terminatedAt: new Date() },
  });
  check("TERMINATED lifecycle stores terminatedAt", (await prisma.employeeProvisioningRequest.findUnique({ where: { id: ids.requestOne } }))?.terminatedAt instanceof Date);

  const originalMixedEmail = `  C1B1.ONE.${run}@EXAMPLE.TEST  `;
  await prisma.user.update({ where: { id: ids.userOne }, data: { email: originalMixedEmail } });
  await prisma.user.update({ where: { id: ids.userOne }, data: { normalizedEmail: `c1b1.one.${run}@example.test` } });
  const normalizedUser = await prisma.user.findUnique({ where: { id: ids.userOne } });
  check("canonical normalizedEmail matches lower(trim(email)) without changing email", normalizedUser?.normalizedEmail === `c1b1.one.${run}@example.test` && normalizedUser.email === originalMixedEmail);
  await expectDbError("uppercase normalizedEmail rejected", () => prisma.user.update({ where: { id: ids.userOne }, data: { normalizedEmail: `C1B1.ONE.${run}@example.test` } }));
  await expectDbError("spaced normalizedEmail rejected", () => prisma.user.update({ where: { id: ids.userOne }, data: { normalizedEmail: ` c1b1.one.${run}@example.test ` } }));
  await expectDbError("Unicode normalizedEmail rejected", () => prisma.user.update({ where: { id: ids.userOne }, data: { normalizedEmail: `josé.${run}@example.test` } }));
  await expectDbError("control characters in normalizedEmail rejected", () => prisma.user.update({ where: { id: ids.userOne }, data: { normalizedEmail: `c1b1.one.${run}@example.test\n` } }));
  await expectDbError("normalizedEmail longer than 320 rejected", () => prisma.user.update({ where: { id: ids.userOne }, data: { normalizedEmail: `${"a".repeat(310)}@example.test` } }));
  await expectDbError("normalizedEmail unrelated to User.email rejected", () => prisma.user.update({ where: { id: ids.userOne }, data: { normalizedEmail: `other.${run}@example.test` } }));
  await prisma.user.update({ where: { id: ids.userTwo }, data: { normalizedEmail: null } });
  check("normalizedEmail remains nullable", (await prisma.user.findUnique({ where: { id: ids.userTwo } }))?.normalizedEmail === null);

  check("normalizer trims and lowercases ASCII", classifyEmail("  TEST@EXAMPLE.TEST ").normalizedEmail === "test@example.test");
  check("normalizer classifies Unicode separately", classifyEmail("josé@example.test").classification === "UNICODE_OR_IDNA");
  check("normalizer classifies empty email", classifyEmail("  ").classification === "EMPTY");
  check("normalizer rejects malformed email", classifyEmail("not-an-email").classification === "INVALID_FORMAT");
  const collisionReport = buildEmailNormalizationReport([
    { id: "one", email: "Same@Example.test", normalizedEmail: null },
    { id: "two", email: "same@example.test", normalizedEmail: null },
  ]);
  check("normalized collision blocks future backfill", collisionReport.collisionsBlockBackfill && collisionReport.counts.duplicate_normalized === 2);
  const exactDuplicateReport = buildEmailNormalizationReport([
    { id: "one", email: "same@example.test", normalizedEmail: null },
    { id: "two", email: "same@example.test", normalizedEmail: null },
  ]);
  check("exact duplicate remains distinct from normalized collision", exactDuplicateReport.counts.duplicate_exact === 2 && exactDuplicateReport.counts.duplicate_normalized === 0);

  const existingDefaultIndex = await prisma.$queryRaw(Prisma.sql`
    SELECT COUNT(*)::int AS count FROM pg_indexes
     WHERE schemaname='osi' AND indexname='tenant_memberships_one_default_per_user'
  `);
  check("existing one-default-membership index preserved", existingDefaultIndex[0].count === 1);
  const forbiddenColumns = await prisma.$queryRaw(Prisma.sql`
    SELECT COUNT(*)::int AS count FROM information_schema.columns
     WHERE table_schema='osi'
       AND table_name IN ('employee_provisioning_requests','employee_provisioning_invitations','employee_admin_role_proposals')
       AND column_name IN ('password','password_hash','token','request_id_duplicate','approval_status')
  `);
  check("persistence contains no passwords or raw tokens", forbiddenColumns[0].count === 0);

  process.stdout.write(`${JSON.stringify({ ok: true, passed: results.length, results }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, passed: results.length, error: { name: error.name, code: error.code, message: error.message } }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
