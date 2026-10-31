import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { createCrm01b1LocalPrisma, validateCrm01b1LocalUrl } from "./crm-01b1-local-target.mjs";
import { ADMIN_MEMBERSHIP_PERMISSIONS } from "../api/_lib/adminMembershipDomain.js";
import {
  getUserIdentity, getUserIdentityPhoto, listUserIdentityDirectory, listUserIdentitySummaries, updateUserIdentity,
} from "../api/_lib/adminUserIdentityDomain.js";
import {
  activateUserEnrollment, hashUserEnrollmentToken, issueUserEnrollment, listUserEnrollments,
  resolveUserEnrollment, revokeUserEnrollment,
} from "../api/_lib/adminUserEnrollmentDomain.js";
import { syntheticPng } from "./fixtures/v17-user-identity-photo.mjs";

// No fallback to DATABASE_URL, .env, a Preview, a pooler, or any real tenant.
assert.equal(process.env.CANONICAL_DB_VALIDATION, "true", "19C DB suite requires disposable canonical CI");
assert.equal(validateCrm01b1LocalUrl(process.env.CRM01B1_TEST_DATABASE_URL).database, "osi_db01n_ci");
const { prisma } = await createCrm01b1LocalPrisma(process.env.CRM01B1_TEST_DATABASE_URL);
const suffix = randomUUID().slice(0, 8);
const results = [];
const permissions = [...ADMIN_MEMBERSHIP_PERMISSIONS, "users:view", "users:edit", "users:create"];
const photo = syntheticPng().toString("base64");
const password = "Synthetic-19C-Password-123!";
function check(name, condition) { assert.ok(condition, name); results.push({ name, passed: true }); }
async function rejects(name, fn, codes) {
  await assert.rejects(fn, (error) => (Array.isArray(codes) ? codes : [codes]).includes(error.code), name);
  results.push({ name, passed: true });
}
async function user(label, role = "V") {
  const email = `${suffix}-${label}@example.invalid`;
  return prisma.user.create({ data: { id: randomUUID(), code: `ID19C-${suffix}-${label}`.toUpperCase(), name: `Global ${label}`, email, normalizedEmail: email,
    phone: "+18095550000", role, status: "active", joinDate: "2026-10-30", passwordHash: await bcrypt.hash(password, 4) } });
}
async function member(tenantId, userId, role = "V", grants = [], isDefault = true) {
  return prisma.tenantMembership.create({ data: { id: randomUUID(), tenantId, userId, role, status: "ACTIVE", grantedPermissions: grants, deniedPermissions: [], isDefault } });
}
function context(tenant, actor, actorUser) {
  return { tenantId: tenant.id, membershipId: actor.id, userId: actorUser.id, role: "A", permissions, effectivePermissions: permissions, deniedPermissions: [] };
}
const inputFor = (label, extra = {}) => ({ requestId: randomUUID(), name: `Persona ${label}`, email: `${suffix}-${label}@example.invalid`, phone: "+18095550123", documentType: "CEDULA", documentNumber: null, role: "V", ...extra });
const tokenFrom = (issued) => issued.activationPath.split("#token=")[1];
const countsForEmail = async (email) => prisma.user.count({ where: { normalizedEmail: email } });

try {
  const tenant = await prisma.tenant.create({ data: { id: randomUUID(), code: `ID19C-${suffix}`.toUpperCase(), name: `Identity QA ${suffix}` } });
  const foreignTenant = await prisma.tenant.create({ data: { id: randomUUID(), code: `ID19CX-${suffix}`.toUpperCase(), name: `Identity foreign QA ${suffix}` } });
  const actorUser = await user("actor", "A"); const foreignActorUser = await user("foreignactor", "A");
  const actor = await member(tenant.id, actorUser.id, "A", permissions);
  const foreignActor = await member(foreignTenant.id, foreignActorUser.id, "A", permissions);
  const ctx = context(tenant, actor, actorUser); const foreignCtx = context(foreignTenant, foreignActor, foreignActorUser);
  const sharedUser = await user("shared"); const secondUser = await user("second");
  const sharedMember = await member(tenant.id, sharedUser.id);
  const foreignSharedMember = await member(foreignTenant.id, sharedUser.id, "K", [], false);
  const secondMember = await member(tenant.id, secondUser.id);

  const original = await getUserIdentity(prisma, ctx, sharedMember.publicRef);
  check("legacy account has a lazy company profile with version zero", original.version === 0 && original.name === sharedUser.name && original.email === sharedUser.email && original.documentNumber === null);
  check("identity detail does not expose database ids or photo bytes", !["id", "userId", "tenantId", "membershipId", "photoBase64", "passwordHash"].some((key) => Object.hasOwn(original, key)));
  const sessionsBefore = await prisma.authSession.count({ where: { userId: sharedUser.id } });
  const authBefore = await prisma.tenantMembership.findUnique({ where: { id: sharedMember.id } });
  const profileRequest = randomUUID();
  let saved = await updateUserIdentity(prisma, ctx, sharedMember.publicRef, { requestId: profileRequest, expectedVersion: 0, name: "Nombre en empresa A", phone: "+1 (809) 555-0181", contactEmail: "contact@example.invalid", documentType: "CEDULA", documentNumber: "000-0000000-1", photoBase64: photo });
  check("company identity persists normalized fields and independent version", saved.version === 1 && saved.name === "Nombre en empresa A" && saved.phone === "+18095550181" && saved.documentNumber === "00000000001" && saved.hasPhoto && saved.photoVersion === 1);
  const userAfter = await prisma.user.findUnique({ where: { id: sharedUser.id } });
  check("editing company identity leaves the global login account intact", userAfter.name === sharedUser.name && userAfter.email === sharedUser.email && userAfter.phone === sharedUser.phone && userAfter.passwordHash === sharedUser.passwordHash);
  const foreignProfile = await getUserIdentity(prisma, foreignCtx, foreignSharedMember.publicRef);
  check("same global user has isolated company identity", foreignProfile.version === 0 && foreignProfile.name === sharedUser.name && !foreignProfile.hasPhoto && foreignProfile.documentNumber === null);
  const authAfter = await prisma.tenantMembership.findUnique({ where: { id: sharedMember.id } });
  check("identity edit does not modify authorization or sessions", authAfter.authorizationVersion === authBefore.authorizationVersion && authAfter.role === authBefore.role && await prisma.authSession.count({ where: { userId: sharedUser.id } }) === sessionsBefore);
  const image = await getUserIdentityPhoto(prisma, ctx, sharedMember.publicRef);
  check("photo loads privately from persistent database bytes", image.mimeType === "image/png" && Buffer.from(image.bytes).equals(Buffer.from(photo, "base64")));
  await assert.rejects(() => prisma.$executeRaw(Prisma.sql`UPDATE "osi"."tenant_user_identities" SET "photo_sha256"=NULL WHERE "tenant_id"=${tenant.id} AND "membership_id"=${sharedMember.id}`), (error) => error.code === "P2010" && error.meta?.code === "23514");
  results.push({ name: "database rejects profile bytes with a NULL hash", passed: true });
  await assert.rejects(() => prisma.$executeRaw(Prisma.sql`UPDATE "osi"."tenant_user_identities" SET "user_id"=${actorUser.id} WHERE "tenant_id"=${tenant.id} AND "membership_id"=${sharedMember.id}`), (error) => error.code === "P2010" && error.meta?.code === "23503");
  results.push({ name: "database identity binding cannot target another global user", passed: true });
  await rejects("cross-tenant detail is indistinguishable from missing", () => getUserIdentity(prisma, foreignCtx, sharedMember.publicRef), "ADMIN_USER_IDENTITY_NOT_FOUND");
  await rejects("cross-tenant private photo is inaccessible", () => getUserIdentityPhoto(prisma, foreignCtx, sharedMember.publicRef), "ADMIN_USER_IDENTITY_NOT_FOUND");
  const summaries = await listUserIdentitySummaries(prisma, ctx, [sharedMember.publicRef, foreignSharedMember.publicRef]);
  check("list summary is tenant scoped and omits contact/document/photo data", summaries.length === 1 && summaries[0].name === saved.name && !["documentNumber", "phone", "contactEmail", "photoBytes"].some((key) => Object.hasOwn(summaries[0], key)));
  const directory = await listUserIdentityDirectory(prisma, ctx, { search: "Nombre en empresa A", role: "V", page: 1, pageSize: 10 });
  check("directory searches the company name and preserves membership DTO", directory.total === 1 && directory.data[0].membershipRef === sharedMember.publicRef && directory.data[0].name === saved.name && directory.identities[0].identityVersion === 1);

  const noOpRequest = randomUUID();
  const noOp = await updateUserIdentity(prisma, ctx, sharedMember.publicRef, { requestId: noOpRequest, expectedVersion: 1, name: saved.name, phone: saved.phone, photoBase64: photo });
  check("no-op leaves version/date/photo version unchanged", noOp.version === 1 && noOp.updatedAt === saved.updatedAt && noOp.photoVersion === 1);
  check("no-op does not create a misleading audit event", await prisma.commercialAuditLog.count({ where: { tenant_id: tenant.id, request_id: noOpRequest } }) === 0);
  await rejects("stale profile version cannot overwrite", () => updateUserIdentity(prisma, ctx, sharedMember.publicRef, { requestId: randomUUID(), expectedVersion: 0, name: "Stale write" }), "ADMIN_USER_IDENTITY_VERSION_CONFLICT");
  await rejects("replayed original update cannot increment again", () => updateUserIdentity(prisma, ctx, sharedMember.publicRef, { requestId: profileRequest, expectedVersion: 0, name: "Replay write" }), "ADMIN_USER_IDENTITY_VERSION_CONFLICT");
  await rejects("reused request id with a new version cannot hide another mutation", () => updateUserIdentity(prisma, ctx, sharedMember.publicRef, { requestId: profileRequest, expectedVersion: 1, phone: "+18095550182" }), "AUDIT_IDEMPOTENCY_CONFLICT");
  check("conflicting audit replay rolls back profile", (await getUserIdentity(prisma, ctx, sharedMember.publicRef)).phone === saved.phone);
  await rejects("duplicate company document on another member rejected", () => updateUserIdentity(prisma, ctx, secondMember.publicRef, { requestId: randomUUID(), expectedVersion: 0, documentType: "CEDULA", documentNumber: "00000000001" }), "ADMIN_USER_IDENTITY_DOCUMENT_DUPLICATE");
  check("document can exist independently in another tenant", (await updateUserIdentity(prisma, foreignCtx, foreignSharedMember.publicRef, { requestId: randomUUID(), expectedVersion: 0, documentType: "CEDULA", documentNumber: "00000000001" })).version === 1);
  await assert.rejects(() => updateUserIdentity(prisma, ctx, sharedMember.publicRef, { requestId: randomUUID(), expectedVersion: 1, name: "Must roll back" }, { auditWriter: async () => { throw new Error("synthetic audit failure"); } }));
  check("failed audit rolls back identity and version", (await getUserIdentity(prisma, ctx, sharedMember.publicRef)).name === saved.name && (await getUserIdentity(prisma, ctx, sharedMember.publicRef)).version === 1);
  const concurrentWrites = await Promise.allSettled([
    updateUserIdentity(prisma, ctx, sharedMember.publicRef, { requestId: randomUUID(), expectedVersion: 1, name: "Concurrent A" }),
    updateUserIdentity(prisma, ctx, sharedMember.publicRef, { requestId: randomUUID(), expectedVersion: 1, name: "Concurrent B" }),
  ]);
  check("concurrent same-version updates produce one committed write", concurrentWrites.filter((result) => result.status === "fulfilled").length === 1 && (await getUserIdentity(prisma, ctx, sharedMember.publicRef)).version === 2);
  saved = await updateUserIdentity(prisma, ctx, sharedMember.publicRef, { requestId: randomUUID(), expectedVersion: 2, photoBase64: null });
  check("photo removal persists without replacing identity reference", !saved.hasPhoto && saved.photoVersion === 2 && saved.membershipRef === sharedMember.publicRef);
  await rejects("removed photo no longer retrievable", () => getUserIdentityPhoto(prisma, ctx, sharedMember.publicRef), "ADMIN_USER_IDENTITY_NOT_FOUND");

  await rejects("role A cannot bypass the established administrator approval flow", () => issueUserEnrollment(prisma, ctx, inputFor("noadmin", { role: "A" })), "ADMIN_USER_IDENTITY_ADMIN_ENROLLMENT_REQUIRED");
  await rejects("member email cannot be enrolled twice", () => issueUserEnrollment(prisma, ctx, inputFor("existingmember", { email: sharedUser.email })), "ADMIN_USER_IDENTITY_EMAIL_CONFLICT");
  await rejects("pending enrollment cannot reuse a registered profile document", () => issueUserEnrollment(prisma, ctx, inputFor("duplicateprofiledoc", { documentNumber: "00000000001" })), "ADMIN_USER_IDENTITY_DOCUMENT_DUPLICATE");
  const enrollmentInput = inputFor("new", { documentNumber: "00000000002", photoBase64: photo });
  const issued = await issueUserEnrollment(prisma, ctx, enrollmentInput);
  const token = tokenFrom(issued);
  check("enrollment exposes its token exactly once in a fragment", issued.shownOnce && issued.activationPath.startsWith("/activate-user#token=ui1.") && !issued.activationPath.includes("?token="));
  check("issuing enrollment creates no global user or access", await countsForEmail(enrollmentInput.email) === 0 && issued.enrollment.status === "PENDING");
  const [stored] = await prisma.$queryRaw(Prisma.sql`SELECT "token_hash", "photo_bytes" FROM "osi"."user_enrollments" WHERE "tenant_id"=${tenant.id} AND "enrollment_ref"=${issued.enrollment.enrollmentRef}::uuid`);
  check("only a token hash is stored and staged photo is durable", stored.token_hash === hashUserEnrollmentToken(token) && stored.photo_bytes.length > 0 && !JSON.stringify(stored).includes(token));
  await assert.rejects(() => prisma.$executeRaw(Prisma.sql`UPDATE "osi"."user_enrollments" SET "photo_sha256"=NULL WHERE "tenant_id"=${tenant.id} AND "enrollment_ref"=${issued.enrollment.enrollmentRef}::uuid`), (error) => error.code === "P2010" && error.meta?.code === "23514");
  results.push({ name: "database rejects staged enrollment bytes with a NULL hash", passed: true });
  await assert.rejects(() => prisma.$executeRaw(Prisma.sql`UPDATE "osi"."user_enrollments" SET "intended_role"='A' WHERE "tenant_id"=${tenant.id} AND "enrollment_ref"=${issued.enrollment.enrollmentRef}::uuid`), (error) => error.code === "P2010" && error.meta?.code === "23514");
  results.push({ name: "database constraint rejects administrator enrollment bypass", passed: true });
  const repeat = await issueUserEnrollment(prisma, ctx, enrollmentInput);
  check("idempotent issue never reveals the previous token", repeat.enrollment.enrollmentRef === issued.enrollment.enrollmentRef && repeat.shownOnce === false && repeat.activationPath === null);
  await rejects("request-id replay with changed role is a conflict", () => issueUserEnrollment(prisma, ctx, { ...enrollmentInput, role: "K" }), "ADMIN_USER_IDENTITY_IDEMPOTENCY_CONFLICT");
  await rejects("a second pending enrollment for email is rejected", () => issueUserEnrollment(prisma, ctx, { ...enrollmentInput, requestId: randomUUID() }), "ADMIN_USER_IDENTITY_ENROLLMENT_PENDING");
  await rejects("profile cannot take a pending enrollment document", () => updateUserIdentity(prisma, ctx, secondMember.publicRef, { requestId: randomUUID(), expectedVersion: 0, documentType: "CEDULA", documentNumber: "00000000002" }), "ADMIN_USER_IDENTITY_DOCUMENT_DUPLICATE");
  await rejects("two pending enrollments cannot share a document", () => issueUserEnrollment(prisma, ctx, inputFor("duplicatedoc", { documentNumber: "00000000002" })), "ADMIN_USER_IDENTITY_DOCUMENT_DUPLICATE");
  const listed = await listUserEnrollments(prisma, ctx);
  check("enrollment list omits token/photo/document data", listed.length === 1 && !["token", "tokenHash", "photoBase64", "documentNumber", "phone"].some((key) => Object.hasOwn(listed[0], key)));
  check("enrollment list is tenant scoped", (await listUserEnrollments(prisma, foreignCtx)).length === 0);
  await rejects("cross-tenant enrollment revoke is 404", () => revokeUserEnrollment(prisma, foreignCtx, issued.enrollment.enrollmentRef, { requestId: randomUUID(), action: "REVOKE" }), "ADMIN_USER_IDENTITY_NOT_FOUND");
  check("recipient resolves as a new login identity", (await resolveUserEnrollment(prisma, token)).mode === "NEW_IDENTITY");
  await rejects("malformed activation token has a generic error", () => resolveUserEnrollment(prisma, `${token}x`), "ADMIN_USER_IDENTITY_ACTIVATION_INVALID");
  await rejects("wrong frozen tenant rejects activation", () => resolveUserEnrollment(prisma, token, { expectedTenantCode: foreignTenant.code }), "ADMIN_USER_IDENTITY_ACTIVATION_INVALID");
  await rejects("recipient must choose a valid password", () => activateUserEnrollment(prisma, { token, password: "x" }), "ADMIN_USER_IDENTITY_PASSWORD_POLICY_INVALID");
  await assert.rejects(() => activateUserEnrollment(prisma, { token, password }, null, { auditWriter: async () => { throw new Error("synthetic audit failure"); } }));
  check("activation audit failure leaves the token pending and creates no user", await countsForEmail(enrollmentInput.email) === 0 && (await resolveUserEnrollment(prisma, token)).mode === "NEW_IDENTITY");
  const activated = await activateUserEnrollment(prisma, { token, password }, null, { expectedTenantCode: tenant.code });
  check("activation requires normal login and issues no bearer/session", activated.activated && activated.loginRequired && !Object.hasOwn(activated, "token") && !Object.hasOwn(activated, "session"));
  const newUser = await prisma.user.findUnique({ where: { email: enrollmentInput.email } });
  const newMembership = await prisma.tenantMembership.findFirst({ where: { tenantId: tenant.id, userId: newUser.id } });
  check("activation creates only the chosen non-admin membership", newMembership.role === "V" && newMembership.status === "ACTIVE" && newMembership.grantedPermissions.length === 0 && newMembership.deniedPermissions.length === 0);
  check("password belongs to recipient and is hashed", newUser.passwordHash !== password && await bcrypt.compare(password, newUser.passwordHash));
  check("activation creates no auth sessions", await prisma.authSession.count({ where: { userId: newUser.id } }) === 0);
  check("activation materializes photo and document in company profile", (await getUserIdentity(prisma, ctx, newMembership.publicRef)).documentNumber === "00000000002" && (await getUserIdentityPhoto(prisma, ctx, newMembership.publicRef)).bytes.length > 0);
  const [consumed] = await prisma.$queryRaw(Prisma.sql`SELECT "status","photo_bytes","photo_sha256" FROM "osi"."user_enrollments" WHERE "tenant_id"=${tenant.id} AND "enrollment_ref"=${issued.enrollment.enrollmentRef}::uuid`);
  check("activated enrollment no longer holds a duplicate private image", consumed.status === "ACTIVATED" && consumed.photo_bytes === null && consumed.photo_sha256 === null);
  await rejects("token is single use after activation", () => activateUserEnrollment(prisma, { token, password }), "ADMIN_USER_IDENTITY_ACTIVATION_INVALID");

  const existingUser = await user("existingglobal", "K");
  const existingForeign = await member(foreignTenant.id, existingUser.id, "K");
  const existingIssued = await issueUserEnrollment(prisma, ctx, inputFor("existing-global", { email: existingUser.email, role: "PC", name: "Company specific existing name" }));
  const existingToken = tokenFrom(existingIssued);
  check("existing account activation resolves to sign-in flow", (await resolveUserEnrollment(prisma, existingToken)).mode === "EXISTING_IDENTITY");
  await rejects("existing account cannot be claimed with a new password", () => activateUserEnrollment(prisma, { token: existingToken, password }), "ADMIN_USER_IDENTITY_AUTH_REQUIRED");
  await rejects("a different authenticated account cannot accept", () => activateUserEnrollment(prisma, { token: existingToken }, { sub: actorUser.id, email: actorUser.email }), "ADMIN_USER_IDENTITY_AUTH_REQUIRED");
  await rejects("matching email without matching subject cannot accept", () => activateUserEnrollment(prisma, { token: existingToken }, { sub: actorUser.id, email: existingUser.email }), "ADMIN_USER_IDENTITY_AUTH_REQUIRED");
  await activateUserEnrollment(prisma, { token: existingToken }, { sub: existingUser.id, email: existingUser.email });
  const unchangedExisting = await prisma.user.findUnique({ where: { id: existingUser.id } });
  check("existing account keeps password, name, email and global role", unchangedExisting.passwordHash === existingUser.passwordHash && unchangedExisting.name === existingUser.name && unchangedExisting.email === existingUser.email && unchangedExisting.role === existingUser.role);
  const acceptedMembership = await prisma.tenantMembership.findFirst({ where: { tenantId: tenant.id, userId: existingUser.id } });
  check("existing account keeps its former default and receives the selected company role", !acceptedMembership.isDefault && acceptedMembership.role === "PC" && (await prisma.tenantMembership.findUnique({ where: { id: existingForeign.id } })).isDefault);
  check("company name is materialized without global account mutation", (await getUserIdentity(prisma, ctx, acceptedMembership.publicRef)).name === "Company specific existing name");

  const staleEmailUser = await user("staleemail");
  await assert.rejects(() => prisma.$executeRaw(Prisma.sql`
    UPDATE "osi"."osi_users" SET "email"=${`${suffix}-changed-email@example.invalid`} WHERE "id"=${staleEmailUser.id}
  `), (error) => error.code === "P2010" && error.meta?.code === "23514");
  results.push({ name: "canonical database rejects a login email inconsistent with normalized identity", passed: true });
  check("rejected inconsistent rename leaves the global account unchanged", (await prisma.user.findUnique({ where: { id: staleEmailUser.id } })).email === staleEmailUser.email);

  const issuanceRaceInput = inputFor("issuerace");
  const issuanceRace = await Promise.all(Array.from({ length: 3 }, () => issueUserEnrollment(prisma, ctx, issuanceRaceInput)));
  check("concurrent same-request issuance returns one enrollment and one visible token", new Set(issuanceRace.map((row) => row.enrollment.enrollmentRef)).size === 1 && issuanceRace.filter((row) => row.shownOnce && row.activationPath).length === 1 && issuanceRace.filter((row) => !row.shownOnce && row.activationPath === null).length === 2);

  const revokeIssued = await issueUserEnrollment(prisma, ctx, inputFor("revoke", { photoBase64: photo }));
  const revoked = await revokeUserEnrollment(prisma, ctx, revokeIssued.enrollment.enrollmentRef, { requestId: randomUUID(), action: "REVOKE" });
  check("pending enrollment can be revoked", revoked.status === "REVOKED");
  await rejects("revoked link cannot activate", () => activateUserEnrollment(prisma, { token: tokenFrom(revokeIssued), password }), "ADMIN_USER_IDENTITY_ACTIVATION_INVALID");
  const expiredIssued = await issueUserEnrollment(prisma, ctx, inputFor("expiry"));
  const afterExpiry = new Date(Date.now() + 25 * 60 * 60 * 1000);
  await rejects("expired link cannot activate", () => activateUserEnrollment(prisma, { token: tokenFrom(expiredIssued), password }, null, { now: afterExpiry }), "ADMIN_USER_IDENTITY_ACTIVATION_INVALID");
  check("list reports expiry without issuing another token", (await listUserEnrollments(prisma, ctx, { now: afterExpiry })).some((row) => row.enrollmentRef === expiredIssued.enrollment.enrollmentRef && row.status === "EXPIRED"));
  const raceIssued = await issueUserEnrollment(prisma, ctx, inputFor("activationrace"));
  const activationRace = await Promise.allSettled(Array.from({ length: 3 }, () => activateUserEnrollment(prisma, { token: tokenFrom(raceIssued), password })));
  check("concurrent activations consume the link once", activationRace.filter((row) => row.status === "fulfilled").length === 1 && await countsForEmail(`${suffix}-activationrace@example.invalid`) === 1);
  const crossTableRace = await Promise.allSettled([
    updateUserIdentity(prisma, ctx, secondMember.publicRef, { requestId: randomUUID(), expectedVersion: 0, documentType: "CEDULA", documentNumber: "00000000004" }),
    issueUserEnrollment(prisma, ctx, inputFor("documentrace", { documentNumber: "00000000004" })),
  ]);
  const [documentOwners] = await prisma.$queryRaw(Prisma.sql`
    SELECT (SELECT count(*) FROM "osi"."tenant_user_identities" WHERE "tenant_id"=${tenant.id} AND "document_number"='00000000004') +
           (SELECT count(*) FROM "osi"."user_enrollments" WHERE "tenant_id"=${tenant.id} AND "document_number"='00000000004' AND "status"='PENDING') AS "total"
  `);
  check("concurrent profile/enrollment share one document reservation", crossTableRace.filter((row) => row.status === "fulfilled").length === 1 && Number(documentOwners.total) === 1);

  const blockedIssued = await issueUserEnrollment(prisma, ctx, inputFor("blockedissuer"));
  await prisma.tenantMembership.update({ where: { id: actor.id }, data: { grantedPermissions: permissions.filter((permission) => permission !== "users:create"), deniedPermissions: ["users:create"] } });
  await rejects("issuer privilege revocation invalidates outstanding activation", () => activateUserEnrollment(prisma, { token: tokenFrom(blockedIssued), password }), "ADMIN_MEMBERSHIP_FORBIDDEN");
  await rejects("creation revalidates issuer permissions in DB", () => issueUserEnrollment(prisma, ctx, inputFor("revokedcreate")), "ADMIN_MEMBERSHIP_FORBIDDEN");
  await prisma.tenantMembership.update({ where: { id: actor.id }, data: { grantedPermissions: permissions.filter((permission) => permission !== "users:edit"), deniedPermissions: ["users:edit"] } });
  await rejects("editing revalidates revoked actor permission", () => updateUserIdentity(prisma, ctx, sharedMember.publicRef, { requestId: randomUUID(), expectedVersion: saved.version, name: "Denied write" }), "ADMIN_MEMBERSHIP_FORBIDDEN");
  await prisma.tenantMembership.update({ where: { id: actor.id }, data: { grantedPermissions: permissions, deniedPermissions: [] } });
  await rejects("effective deny blocks reading personal data", () => getUserIdentity(prisma, { ...ctx, deniedPermissions: ["users:view"] }, sharedMember.publicRef), "ADMIN_MEMBERSHIP_FORBIDDEN");
  const viewerCtx = { tenantId: tenant.id, membershipId: secondMember.id, userId: secondUser.id, role: "V", effectivePermissions: permissions, deniedPermissions: [] };
  await rejects("a non-administrator cannot read identity even with supplied grants", () => getUserIdentity(prisma, viewerCtx, sharedMember.publicRef), "ADMIN_MEMBERSHIP_FORBIDDEN");

  const audits = await prisma.commercialAuditLog.findMany({ where: { tenant_id: tenant.id, source: "V17_USER_IDENTITY_19C" } });
  const auditText = JSON.stringify(audits);
  check("audits contain no names, emails, phone, cedula, photo or raw token", !["Nombre en empresa A", enrollmentInput.name, enrollmentInput.email, "+18095550181", "00000000001", "00000000002", photo, token, password].some((value) => auditText.includes(value)));
  check("one issuance and activation event for a consumed enrollment", audits.filter((row) => row.entityId === issued.enrollment.enrollmentRef && row.action === "USER_ENROLLMENT_ISSUED").length === 1 && audits.filter((row) => row.entityId === issued.enrollment.enrollmentRef && row.action === "USER_ENROLLMENT_ACTIVATED").length === 1);
  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
} finally {
  await prisma.$disconnect();
}
