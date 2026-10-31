import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { appendCommercialAudit } from "./commercialAuditLog.js";
import { hashPassword } from "./auth.js";
import { isCanonicalLegacyPassword } from "./passwordPolicy.js";
import { ADMIN_MEMBERSHIP_PERMISSIONS } from "./adminMembershipDomain.js";
import { PERMS } from "./rbac.js";
import { appendIdentityAudit, assertIdentityDocumentAvailable, identityTenantLock, identityTransaction, requireIdentityActor } from "./adminUserIdentityDomain.js";
import { canonicalIdentityPayload, exactIdentityObject, identityFail, identityRef, normalizeEnrollmentInput, normalizeIdentityEmail, requestRef } from "./adminUserIdentityContract.js";

const TOKEN = /^ui1\.[A-Za-z0-9_-]{43}$/u;
const ENROLLMENT_PERMISSIONS = [PERMS.USERS_CREATE, ...ADMIN_MEMBERSHIP_PERMISSIONS];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
export function createUserEnrollmentToken() { return `ui1.${randomBytes(32).toString("base64url")}`; }
export function hashUserEnrollmentToken(value) {
  if (typeof value !== "string" || !TOKEN.test(value)) identityFail("ACTIVATION_INVALID", 400);
  return sha256(value);
}
function enrollmentDto(row, now = new Date()) {
  return Object.freeze({ enrollmentRef: String(row.enrollment_ref), name: String(row.full_name), email: String(row.normalized_email), role: String(row.intended_role),
    status: row.status === "PENDING" && new Date(row.expires_at) <= now ? "EXPIRED" : String(row.status),
    expiresAt: new Date(row.expires_at).toISOString(), createdAt: new Date(row.created_at).toISOString() });
}
export async function listUserEnrollments(prisma, context, { now = new Date() } = {}) {
  const actor = await requireIdentityActor(prisma, context, ENROLLMENT_PERMISSIONS);
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT "enrollment_ref","full_name","normalized_email","intended_role"::text,"status","expires_at","created_at"
    FROM "osi"."user_enrollments" WHERE "tenant_id"=${actor.tenantId}
    ORDER BY "created_at" DESC, "enrollment_ref" DESC LIMIT 100
  `);
  return rows.map((row) => enrollmentDto(row, now));
}
export async function issueUserEnrollment(prisma, context, raw, { now = new Date(), tokenFactory = createUserEnrollmentToken, auditWriter = appendCommercialAudit } = {}) {
  const input = normalizeEnrollmentInput(raw);
  const { photo, requestId, ...text } = input;
  const payloadHash = sha256(canonicalIdentityPayload({ ...text, photoSha256: photo?.sha256 ?? null }));
  const token = tokenFactory(); const tokenHash = hashUserEnrollmentToken(token);
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return identityTransaction(prisma, async (tx) => {
    await identityTenantLock(tx, String(context?.tenantId || ""));
    const actor = await requireIdentityActor(tx, context, ENROLLMENT_PERMISSIONS);
    const replay = await tx.$queryRaw(Prisma.sql`
      SELECT "enrollment_ref","full_name","normalized_email","intended_role"::text,"status","expires_at","created_at","payload_hash"
      FROM "osi"."user_enrollments" WHERE "tenant_id"=${actor.tenantId} AND "request_id"=${requestId}::uuid LIMIT 1
    `);
    if (replay[0]) {
      if (replay[0].payload_hash !== payloadHash) identityFail("IDEMPOTENCY_CONFLICT", 409);
      return { enrollment: enrollmentDto(replay[0], now), activationPath: null, shownOnce: false };
    }
    const existingMember = await tx.$queryRaw(Prisma.sql`
      SELECT tm."id" FROM "osi"."tenant_memberships" tm JOIN "osi"."osi_users" u ON u."id"=tm."user_id"
      WHERE tm."tenant_id"=${actor.tenantId} AND lower(btrim(u."email"))=${input.email} LIMIT 1
    `);
    if (existingMember[0]) identityFail("EMAIL_CONFLICT", 409);
    // Release expired reservations without silently extending or reissuing their tokens.
    await tx.$executeRaw(Prisma.sql`
      UPDATE "osi"."user_enrollments" SET "status"='REVOKED',"revoked_at"=${now},"updated_at"=${now},"photo_bytes"=NULL,"photo_sha256"=NULL
      WHERE "tenant_id"=${actor.tenantId} AND "status"='PENDING' AND "expires_at"<=${now}
    `);
    const pending = await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "osi"."user_enrollments" WHERE "tenant_id"=${actor.tenantId} AND "normalized_email"=${input.email} AND "status"='PENDING' LIMIT 1
    `);
    if (pending[0]) identityFail("ENROLLMENT_PENDING", 409);
    await assertIdentityDocumentAvailable(tx, actor.tenantId, input.documentType, input.documentNumber, { now });
    const rows = await tx.$queryRaw(Prisma.sql`
      INSERT INTO "osi"."user_enrollments" ("tenant_id","normalized_email","full_name","contact_phone","contact_email","document_type","document_number","intended_role","photo_bytes","photo_sha256","token_hash","expires_at","issued_by_membership_id","issued_by_user_id","request_id","payload_hash","created_at","updated_at")
      VALUES (${actor.tenantId},${input.email},${input.name},${input.phone},${input.contactEmail},${input.documentType},${input.documentNumber},${input.role}::"osi"."TenantMembershipRole",${photo?.bytes ?? null},${photo?.sha256 ?? null},${tokenHash},${expiresAt},${actor.membershipId},${actor.userId},${requestId}::uuid,${payloadHash},${now},${now})
      RETURNING "id","enrollment_ref","full_name","normalized_email","intended_role"::text,"status","expires_at","created_at"
    `);
    await appendIdentityAudit(tx, actor, { requestId, action: "USER_ENROLLMENT_ISSUED", entityId: String(rows[0].enrollment_ref),
      metadataJson: { role: input.role, status: "PENDING", expiresAt: expiresAt.toISOString(), delivery: "MANUAL_SECURE_CHANNEL", credentialProvisioned: false } }, auditWriter);
    return Object.freeze({ enrollment: enrollmentDto(rows[0], now), activationPath: `/activate-user#token=${token}`, shownOnce: true });
  });
}
export async function revokeUserEnrollment(prisma, context, enrollmentRef, input, { now = new Date(), auditWriter = appendCommercialAudit } = {}) {
  const ref = identityRef(enrollmentRef);
  exactIdentityObject(input, ["requestId", "action"]);
  const requestId = requestRef(input.requestId);
  if (input.action !== "REVOKE") identityFail("INPUT_INVALID");
  return identityTransaction(prisma, async (tx) => {
    await identityTenantLock(tx, String(context?.tenantId || ""));
    const actor = await requireIdentityActor(tx, context, ENROLLMENT_PERMISSIONS);
    const rows = await tx.$queryRaw(Prisma.sql`
      SELECT "id","enrollment_ref","full_name","normalized_email","intended_role"::text,"status","expires_at","created_at"
      FROM "osi"."user_enrollments" WHERE "tenant_id"=${actor.tenantId} AND "enrollment_ref"=${ref}::uuid FOR UPDATE
    `);
    const before = rows[0];
    if (!before) identityFail("NOT_FOUND", 404);
    if (before.status === "REVOKED") return enrollmentDto(before, now);
    if (before.status !== "PENDING") identityFail("ENROLLMENT_NOT_PENDING", 409);
    await tx.$executeRaw(Prisma.sql`
      UPDATE "osi"."user_enrollments" SET "status"='REVOKED',"revoked_at"=${now},"updated_at"=${now},"photo_bytes"=NULL,"photo_sha256"=NULL WHERE "tenant_id"=${actor.tenantId} AND "id"=${before.id}::uuid
    `);
    await appendIdentityAudit(tx, actor, { requestId, action: "USER_ENROLLMENT_REVOKED", entityId: ref, metadataJson: { status: "REVOKED" } }, auditWriter);
    return enrollmentDto({ ...before, status: "REVOKED" }, now);
  });
}
async function activationRow(db, tokenHash, { now, expectedTenantCode, lock = false }) {
  const rows = await db.$queryRaw(Prisma.sql`
    SELECT e.*,t."name" AS "tenant_name",t."code" AS "tenant_code",t."status"::text AS "tenant_status"
    FROM "osi"."user_enrollments" e JOIN "osi"."tenants" t ON t."id"=e."tenant_id"
    WHERE e."token_hash"=${tokenHash} ${lock ? Prisma.sql`FOR UPDATE OF e` : Prisma.empty}
  `);
  const row = rows[0];
  if (!row || row.status !== "PENDING" || row.tenant_status !== "ACTIVE" || new Date(row.expires_at) <= now
    || (expectedTenantCode && row.tenant_code !== expectedTenantCode)) identityFail("ACTIVATION_INVALID");
  return row;
}
async function usersByEmail(tx, email, lock = false) {
  return tx.$queryRaw(Prisma.sql`
    SELECT "id","email","status" FROM "osi"."osi_users" WHERE lower(btrim("email"))=${email} OR "normalized_email"=${email}
    ORDER BY "id" ${lock ? Prisma.sql`FOR UPDATE` : Prisma.empty}
  `);
}
function activeIdentityMatches(user, email) {
  if (!user || String(user.status).toUpperCase() !== "ACTIVE") return false;
  try { return normalizeIdentityEmail(user.email) === email; } catch { return false; }
}
export async function resolveUserEnrollment(prisma, token, { now = new Date(), expectedTenantCode } = {}) {
  const row = await activationRow(prisma, hashUserEnrollmentToken(token), { now, expectedTenantCode });
  const users = await usersByEmail(prisma, row.normalized_email);
  if (users.length > 1 || (users[0] && !activeIdentityMatches(users[0], row.normalized_email))) identityFail("ACTIVATION_INVALID");
  return Object.freeze({ mode: users.length ? "EXISTING_IDENTITY" : "NEW_IDENTITY", name: row.full_name, email: row.normalized_email,
    role: row.intended_role, tenantName: row.tenant_name, expiresAt: new Date(row.expires_at).toISOString() });
}
export async function activateUserEnrollment(prisma, input, legacyIdentity = null, { now = new Date(), auditWriter = appendCommercialAudit, expectedTenantCode } = {}) {
  exactIdentityObject(input, ["token", "password"]);
  const tokenHash = hashUserEnrollmentToken(input.token);
  const initial = await activationRow(prisma, tokenHash, { now, expectedTenantCode });
  const users = await usersByEmail(prisma, initial.normalized_email);
  if (users.length > 1) identityFail("ACTIVATION_INVALID");
  let passwordHash = null;
  if (users.length) {
    if (input.password !== undefined || !legacyIdentity?.sub) identityFail("AUTH_REQUIRED", 401);
    let email;
    try { email = normalizeIdentityEmail(legacyIdentity.email); } catch { identityFail("AUTH_REQUIRED", 401); }
    if (email !== initial.normalized_email || String(legacyIdentity.sub) !== users[0].id || !activeIdentityMatches(users[0], initial.normalized_email)) identityFail("AUTH_REQUIRED", 401);
  } else {
    if (!isCanonicalLegacyPassword(input.password)) identityFail("PASSWORD_POLICY_INVALID");
    passwordHash = await hashPassword(input.password);
  }
  return identityTransaction(prisma, async (tx) => {
    // Share the global email mutex and lock order used by administrative activation.
    // Taking the tenant lock first could deadlock with an invitation for the same email.
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`v17-admin-identity:${initial.normalized_email}`},0))::text AS "lock"`);
    await identityTenantLock(tx, initial.tenant_id);
    const row = await activationRow(tx, tokenHash, { now, expectedTenantCode, lock: true });
    const currentUsers = await usersByEmail(tx, row.normalized_email, true);
    if (currentUsers.length > 1 || Boolean(currentUsers.length) !== Boolean(users.length)) identityFail("ACTIVATION_INVALID");
    // Revoking an issuer's authorization also prevents use of outstanding enrollment links.
    const issuer = await requireIdentityActor(tx, {
      tenantId: row.tenant_id, membershipId: row.issued_by_membership_id, userId: row.issued_by_user_id,
      effectivePermissions: [PERMS.MEMBERSHIP_VIEW,PERMS.USERS_VIEW,...ENROLLMENT_PERMISSIONS], deniedPermissions: [],
    }, ENROLLMENT_PERMISSIONS);
    let userId;
    if (currentUsers.length) {
      const user = currentUsers[0];
      if (user.id !== String(legacyIdentity?.sub) || !activeIdentityMatches(user, row.normalized_email)) identityFail("AUTH_REQUIRED", 401);
      userId = user.id;
    } else {
      if (!passwordHash) identityFail("ACTIVATION_INVALID");
      userId = `usr_${randomUUID().replaceAll("-", "")}`;
      const code = `USR-${randomUUID().replaceAll("-", "").slice(0, 20).toUpperCase()}`;
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "osi"."osi_users" ("id","code","name","email","normalized_email","phone","role","status","joinDate","passwordHash","updatedAt")
        VALUES (${userId},${code},${row.full_name},${row.normalized_email},${row.normalized_email},${row.contact_phone},${row.intended_role},'active',${now.toISOString().slice(0,10)},${passwordHash},${now})
      `);
    }
    const memberships = await tx.$queryRaw(Prisma.sql`SELECT "id","tenant_id" FROM "osi"."tenant_memberships" WHERE "user_id"=${userId}`);
    if (memberships.some((membership) => membership.tenant_id === row.tenant_id)) identityFail("ACTIVATION_INVALID");
    await assertIdentityDocumentAvailable(tx, row.tenant_id, row.document_type, row.document_number, { excludeEnrollmentId: row.id, now });
    const membershipId = `tmem_${randomUUID().replaceAll("-", "")}`;
    const created = await tx.$queryRaw(Prisma.sql`
      INSERT INTO "osi"."tenant_memberships" ("id","tenant_id","user_id","role","status","granted_permissions","denied_permissions","is_default","authorization_version","updated_at")
      VALUES (${membershipId},${row.tenant_id},${userId},${row.intended_role}::"osi"."TenantMembershipRole",'ACTIVE',ARRAY[]::text[],ARRAY[]::text[],${memberships.length === 0},1,${now})
      RETURNING "public_ref"
    `);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "osi"."tenant_user_identities" ("tenant_id","membership_id","user_id","full_name","contact_phone","contact_email","document_type","document_number","photo_bytes","photo_sha256","photo_version","version","created_at","updated_at")
      VALUES (${row.tenant_id},${membershipId},${userId},${row.full_name},${row.contact_phone},${row.contact_email},${row.document_type},${row.document_number},${row.photo_bytes},${row.photo_sha256},${row.photo_bytes ? 1 : 0},1,${now},${now})
    `);
    const consumed = await tx.$executeRaw(Prisma.sql`
      UPDATE "osi"."user_enrollments" SET "status"='ACTIVATED',"activated_at"=${now},"activated_membership_id"=${membershipId},"activated_user_id"=${userId},"updated_at"=${now},"photo_bytes"=NULL,"photo_sha256"=NULL
      WHERE "tenant_id"=${row.tenant_id} AND "id"=${row.id}::uuid AND "status"='PENDING'
    `);
    if (consumed !== 1) identityFail("ACTIVATION_INVALID");
    await appendIdentityAudit(tx, issuer, { requestId: randomUUID(), action: "USER_ENROLLMENT_ACTIVATED", entityId: String(row.enrollment_ref),
      metadataJson: { membershipRef: String(created[0].public_ref), role: row.intended_role, newGlobalIdentity: !users.length, status: "ACTIVATED", additionalPermissions: 0 } }, auditWriter);
    return Object.freeze({ activated: true, loginRequired: true });
  }, { timeout: 15000 });
}
