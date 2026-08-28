import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { authenticateLegacyCredentials } from "../api/auth/login.js";
import { ADMIN_MEMBERSHIP_PERMISSIONS } from "../api/_lib/adminMembershipDomain.js";
import {
  acceptExistingAdminIdentity,
  activateNewAdminIdentity,
  hashAdminInvitationToken,
  issueAdminIdentityInvitation,
  listAdminIdentityInvitations,
  revokeAdminIdentityInvitation,
} from "../api/_lib/adminIdentityInvitationDomain.js";

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const suffix = randomUUID().slice(0, 8);
const assertions = [];
function check(name, condition, detail) { assertions.push({ name, passed: Boolean(condition), ...(detail ? { detail } : {}) }); if (!condition) throw new Error(name); }
async function expectCode(name, fn, code) { try { await fn(); check(name, false, "no error"); } catch (error) { check(name, error?.code === code, `expected ${code}; got ${error?.code || error?.message}`); } }
async function user(label, email, role = "A", password = "Synthetic-Existing-1!") {
  return prisma.user.create({ data: { id: randomUUID(), code: `AI-${suffix}-${label}`.toUpperCase(), name: `Persona ${label}`, email, normalizedEmail: email, phone: "", role, status: "active", joinDate: "2026-08-27", passwordHash: await bcrypt.hash(password, 10) } });
}
async function membership(tenantId, userId, grants = ADMIN_MEMBERSHIP_PERMISSIONS) {
  return prisma.tenantMembership.create({ data: { id: randomUUID(), tenantId, userId, role: "A", status: "ACTIVE", grantedPermissions: [...grants], deniedPermissions: [], isDefault: true } });
}

try {
  const tenant = await prisma.tenant.create({ data: { id: randomUUID(), code: `AI-${suffix}`.toUpperCase(), name: `Identity ${suffix}` } });
  const foreignTenant = await prisma.tenant.create({ data: { id: randomUUID(), code: `AIX-${suffix}`.toUpperCase(), name: `Foreign ${suffix}` } });
  const actorUser = await user("actor", `${suffix}-actor@example.invalid`);
  const actor = await membership(tenant.id, actorUser.id);
  const foreignUser = await user("foreign", `${suffix}-foreign@example.invalid`);
  const foreignActor = await membership(foreignTenant.id, foreignUser.id);
  const context = { tenantId: tenant.id, membershipId: actor.id, userId: actorUser.id, role: "A", permissions: [...ADMIN_MEMBERSHIP_PERMISSIONS], effectivePermissions: [...ADMIN_MEMBERSHIP_PERMISSIONS], deniedPermissions: [] };
  const foreignContext = { ...context, tenantId: foreignTenant.id, membershipId: foreignActor.id, userId: foreignUser.id };

  const token = `ai1.${Buffer.alloc(32, 1).toString("base64url")}`;
  const email = `${suffix}-NEW@Example.Invalid`;
  const issued = await issueAdminIdentityInvitation(prisma, context, { requestId: `issue-${suffix}`, email }, { tokenFactory: () => token });
  check("token shown once", issued.shownOnce && issued.activationPath?.endsWith(`#token=${token}`));
  check("email normalized", issued.invitation.email === email.toLowerCase());
  check("DTO has no internal ids", !["id", "tenantId", "userId", "membershipId", "tokenHash"].some((key) => Object.hasOwn(issued.invitation, key)));
  const stored = await prisma.adminIdentityInvitation.findFirst({ where: { tenantId: tenant.id, normalizedEmail: email.toLowerCase() } });
  check("only token hash stored", stored?.tokenHash === hashAdminInvitationToken(token) && !JSON.stringify(stored).includes(token));
  const retried = await issueAdminIdentityInvitation(prisma, context, { requestId: `issue-${suffix}`, email }, { tokenFactory: () => `ai1.${Buffer.alloc(32, 2).toString("base64url")}` });
  check("idempotent issue never recovers token", !retried.shownOnce && retried.activationPath === null && retried.invitation.invitationRef === issued.invitation.invitationRef);
  await expectCode("second pending invitation blocked", () => issueAdminIdentityInvitation(prisma, context, { requestId: `issue-other-${suffix}`, email }), "ADMIN_IDENTITY_INVITATION_PENDING");
  check("list tenant-first", (await listAdminIdentityInvitations(prisma, context)).length === 1 && (await listAdminIdentityInvitations(prisma, foreignContext)).length === 0);
  await expectCode("cross tenant revoke is 404", () => revokeAdminIdentityInvitation(prisma, foreignContext, issued.invitation.invitationRef, { requestId: `cross-${suffix}` }), "ADMIN_IDENTITY_INVITATION_NOT_FOUND");
  await expectCode("manipulated token generic", () => activateNewAdminIdentity(prisma, { token: `${token}x`, name: "Persona", password: "Valid-Synthetic-Password-1!" }), "ADMIN_IDENTITY_INVITATION_INVALID");
  const activated = await activateNewAdminIdentity(prisma, { token, name: "Nueva Administradora", password: "Valid-Synthetic-Password-1!" });
  check("activation requires normal login", activated.activated && activated.loginRequired);
  const createdUser = await prisma.user.findFirst({ where: { normalizedEmail: email.toLowerCase() } });
  const createdMembership = await prisma.tenantMembership.findFirst({ where: { tenantId: tenant.id, userId: createdUser.id } });
  check("new identity active with explicit A grants", createdUser?.status === "active" && createdMembership?.role === "A" && createdMembership?.status === "ACTIVE" && ADMIN_MEMBERSHIP_PERMISSIONS.every((permission) => createdMembership.grantedPermissions.includes(permission)));
  check("bcrypt legacy login succeeds", (await authenticateLegacyCredentials({ email: email.toLowerCase(), password: "Valid-Synthetic-Password-1!", prismaClient: prisma })).outcome === "AUTHENTICATED");
  check("no automatic session", await prisma.authSession.count({ where: { userId: createdUser.id } }) === 0);
  await expectCode("used token rejected", () => activateNewAdminIdentity(prisma, { token, name: "Otra", password: "Valid-Synthetic-Password-1!" }), "ADMIN_IDENTITY_ACTIVATION_INVALID");
  check("issue and activation audit 1:1", await prisma.commercialAuditLog.count({ where: { tenant_id: tenant.id, source: "V17_ADMIN_IDENTITY" } }) === 2);

  const revokeToken = `ai1.${Buffer.alloc(32, 3).toString("base64url")}`;
  const revokeIssued = await issueAdminIdentityInvitation(prisma, context, { requestId: `revoke-issue-${suffix}`, email: `${suffix}-revoke@example.invalid` }, { tokenFactory: () => revokeToken });
  const revoked = await revokeAdminIdentityInvitation(prisma, context, revokeIssued.invitation.invitationRef, { requestId: `revoke-${suffix}` });
  check("revocation state", revoked.status === "REVOKED");
  await expectCode("revoked token rejected", () => activateNewAdminIdentity(prisma, { token: revokeToken, name: "Revoked", password: "Valid-Synthetic-Password-1!" }), "ADMIN_IDENTITY_ACTIVATION_INVALID");

  const expiredToken = `ai1.${Buffer.alloc(32, 4).toString("base64url")}`;
  await issueAdminIdentityInvitation(prisma, context, { requestId: `expired-${suffix}`, email: `${suffix}-expired@example.invalid` }, { tokenFactory: () => expiredToken, now: new Date("2026-08-20T00:00:00Z") });
  await expectCode("expired token rejected", () => activateNewAdminIdentity(prisma, { token: expiredToken, name: "Expired", password: "Valid-Synthetic-Password-1!" }, { now: new Date("2026-08-22T00:00:00Z") }), "ADMIN_IDENTITY_ACTIVATION_INVALID");

  const existingPassword = "Existing-Synthetic-Password-1!";
  const existing = await user("existing", `${suffix}-existing@example.invalid`, "V", existingPassword);
  const existingTenant = await prisma.tenant.create({ data: { id: randomUUID(), code: `AIE-${suffix}`.toUpperCase(), name: `Existing tenant ${suffix}` } });
  await membership(existingTenant.id, existing.id, ["pipeline:view"]);
  const existingToken = `ai1.${Buffer.alloc(32, 5).toString("base64url")}`;
  await issueAdminIdentityInvitation(prisma, context, { requestId: `existing-${suffix}`, email: existing.email }, { tokenFactory: () => existingToken });
  await expectCode("existing User password never replaced", () => activateNewAdminIdentity(prisma, { token: existingToken, name: "Existing", password: "Replacement-Forbidden-1!" }), "ADMIN_IDENTITY_ACTIVATION_INVALID");
  check("existing password intact", (await authenticateLegacyCredentials({ email: existing.email, password: existingPassword, prismaClient: prisma })).outcome === "AUTHENTICATED");
  const accepted = await acceptExistingAdminIdentity(prisma, { token: existingToken }, { sub: existing.id, email: existing.email });
  check("authenticated existing identity accepted", accepted.activated && await prisma.tenantMembership.count({ where: { tenantId: tenant.id, userId: existing.id } }) === 1);

  const raceToken = `ai1.${Buffer.alloc(32, 6).toString("base64url")}`;
  await issueAdminIdentityInvitation(prisma, context, { requestId: `race-${suffix}`, email: `${suffix}-race@example.invalid` }, { tokenFactory: () => raceToken });
  const race = await Promise.allSettled(Array.from({ length: 8 }, () => activateNewAdminIdentity(prisma, { token: raceToken, name: "Race Admin", password: "Race-Synthetic-Password-1!" })));
  check("concurrent token single-use", race.filter((item) => item.status === "fulfilled").length === 1 && race.filter((item) => item.status === "rejected").length === 7);

  const deniedContext = { ...context, effectivePermissions: [], permissions: [], deniedPermissions: ["membership:update:permissions"] };
  await expectCode("deny prevails", () => issueAdminIdentityInvitation(prisma, deniedContext, { requestId: `deny-${suffix}`, email: `${suffix}-deny@example.invalid` }), "ADMIN_MEMBERSHIP_FORBIDDEN");
  const failed = assertions.filter((entry) => !entry.passed);
  process.stdout.write(`${JSON.stringify({ ok: failed.length === 0, assertions: assertions.length, failed: failed.length, results: assertions }, null, 2)}\n`);
  if (failed.length) process.exitCode = 1;
} finally { await prisma.$disconnect(); }
