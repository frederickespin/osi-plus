import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { hashPassword } from "./auth.js";
import { appendCommercialAudit } from "./commercialAuditLog.js";
import {
  ADMIN_MEMBERSHIP_PERMISSIONS,
  AdminMembershipError,
  assertAdminActorPermission,
  requireAdminPermission,
  requiredAdminText,
  revalidateAdminActor,
} from "./adminMembershipDomain.js";
import { PERMS } from "./rbac.js";
import { isCanonicalLegacyPassword } from "./passwordPolicy.js";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const EMAIL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,63}$/;
const TOKEN = /^ai1\.[A-Za-z0-9_-]{43}$/;
const INVITE_PERMISSION_SET = Object.freeze([
  PERMS.MEMBERSHIP_VIEW,
  PERMS.MEMBERSHIP_UPDATE_ROLE,
  PERMS.MEMBERSHIP_UPDATE_PERMISSIONS,
  PERMS.MEMBERSHIP_UPDATE_STATUS,
]);

export const ADMIN_IDENTITY_ACTIVATION_MODES = Object.freeze({
  NEW_IDENTITY: "NEW_IDENTITY",
  EXISTING_IDENTITY: "EXISTING_IDENTITY",
});

export class AdminIdentityInvitationError extends Error {
  constructor(code, status) {
    super(code);
    this.name = "AdminIdentityInvitationError";
    this.code = code;
    this.status = status;
  }
}

function invalid(status = 400) {
  throw new AdminIdentityInvitationError("ADMIN_IDENTITY_INVITATION_INVALID", status);
}

export function normalizeAdminInvitationEmail(value) {
  const normalized = String(value ?? "").toLowerCase().trim();
  if (normalized.length < 3 || normalized.length > 320 || !EMAIL.test(normalized) || /[^\x20-\x7e]/.test(normalized)) invalid();
  return normalized;
}

export function validateEnrollmentPassword(value) {
  if (!isCanonicalLegacyPassword(value)) {
    throw new AdminIdentityInvitationError("ADMIN_IDENTITY_PASSWORD_POLICY_INVALID", 400);
  }
  return value;
}

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

function sha256(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

export function hashAdminInvitationToken(value) {
  if (!TOKEN.test(String(value || ""))) invalid(404);
  return sha256(value);
}

export function createAdminInvitationToken() {
  return `ai1.${randomBytes(32).toString("base64url")}`;
}

function canonicalRef(value) {
  const ref = String(value || "").trim();
  if (!UUID_V4.test(ref)) throw new AdminIdentityInvitationError("ADMIN_IDENTITY_INVITATION_NOT_FOUND", 404);
  return ref;
}

function statusOf(row, now) {
  if (String(row.status) === "PENDING" && new Date(row.expires_at) <= now) return "EXPIRED";
  return String(row.status);
}

function invitationDto(row, now = new Date()) {
  return Object.freeze({
    invitationRef: String(row.public_ref),
    email: String(row.normalized_email),
    role: "A",
    grantedPermissions: Object.freeze([...(row.granted_permissions || [])].map(String)),
    status: statusOf(row, now),
    expiresAt: new Date(row.expires_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
  });
}

function requireInvitationPermissions(context) {
  for (const permission of INVITE_PERMISSION_SET) requireAdminPermission(context, permission);
}

function assertInvitationActor(actor) {
  for (const permission of INVITE_PERMISSION_SET) assertAdminActorPermission(actor, permission);
}

function controlledConflict(error) {
  if (error instanceof AdminIdentityInvitationError || error instanceof AdminMembershipError) return error;
  const detail = `${String(error?.code || "")} ${String(error?.message || "")}`;
  if (/admin_identity_invitations_one_pending_email_key|P2002/.test(detail)) {
    return new AdminIdentityInvitationError("ADMIN_IDENTITY_INVITATION_PENDING", 409);
  }
  return error;
}

export async function listAdminIdentityInvitations(prisma, context, { now = new Date() } = {}) {
  requireInvitationPermissions(context);
  const actor = await revalidateAdminActor(prisma, context);
  assertInvitationActor(actor);
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT "public_ref", "normalized_email", "granted_permissions", "status"::text AS "status", "expires_at", "created_at"
    FROM "osi"."admin_identity_invitations"
    WHERE "tenant_id"=${actor.tenantId}
    ORDER BY "created_at" DESC, "public_ref" DESC
    LIMIT 100
  `);
  return Object.freeze(rows.map((row) => invitationDto(row, now)));
}

export async function issueAdminIdentityInvitation(prisma, context, input, {
  now = new Date(), tokenFactory = createAdminInvitationToken, auditWriter = appendCommercialAudit,
} = {}) {
  requireInvitationPermissions(context);
  const email = normalizeAdminInvitationEmail(input?.email);
  const requestId = requiredAdminText(input?.requestId, "requestId");
  const payloadHash = sha256(canonical({ email, role: "A", grantedPermissions: ADMIN_MEMBERSHIP_PERMISSIONS }));
  const token = tokenFactory();
  const tokenHash = hashAdminInvitationToken(token);
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1_000);
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "osi"."tenants" WHERE "id"=${String(context?.tenantId || "")} FOR UPDATE`);
      const actor = await revalidateAdminActor(tx, context);
      assertInvitationActor(actor);
      const existingRequest = await tx.$queryRaw(Prisma.sql`
        SELECT "public_ref", "normalized_email", "granted_permissions", "status"::text AS "status", "expires_at", "created_at", "payload_hash"
        FROM "osi"."admin_identity_invitations"
        WHERE "tenant_id"=${actor.tenantId} AND "request_id"=${requestId}
        LIMIT 1
      `);
      if (existingRequest[0]) {
        if (String(existingRequest[0].payload_hash) !== payloadHash) {
          throw new AdminIdentityInvitationError("ADMIN_IDENTITY_INVITATION_IDEMPOTENCY_CONFLICT", 409);
        }
        return { invitation: invitationDto(existingRequest[0], now), token: null, created: false };
      }
      const pending = await tx.$queryRaw(Prisma.sql`
        SELECT "public_ref" FROM "osi"."admin_identity_invitations"
        WHERE "tenant_id"=${actor.tenantId} AND "normalized_email"=${email} AND "status"='PENDING' AND "expires_at">${now}
        LIMIT 1
      `);
      if (pending[0]) throw new AdminIdentityInvitationError("ADMIN_IDENTITY_INVITATION_PENDING", 409);
      await tx.$executeRaw(Prisma.sql`
        UPDATE "osi"."admin_identity_invitations"
        SET "status"='REVOKED', "revoked_at"=${now}, "updated_at"=${now}
        WHERE "tenant_id"=${actor.tenantId} AND "normalized_email"=${email} AND "status"='PENDING' AND "expires_at"<=${now}
      `);
      const rows = await tx.$queryRaw(Prisma.sql`
        INSERT INTO "osi"."admin_identity_invitations" (
          "tenant_id", "normalized_email", "intended_role", "granted_permissions", "token_hash", "expires_at",
          "issued_by_membership_id", "issued_by_user_id", "request_id", "payload_hash", "created_at", "updated_at"
        ) VALUES (
          ${actor.tenantId}, ${email}, 'A', ${ADMIN_MEMBERSHIP_PERMISSIONS}, ${tokenHash}, ${expiresAt},
          ${actor.membershipId}, ${actor.userId}, ${requestId}, ${payloadHash}, ${now}, ${now}
        ) RETURNING "id", "public_ref", "normalized_email", "granted_permissions", "status"::text AS "status", "expires_at", "created_at"
      `);
      const row = rows[0];
      await auditWriter(tx, { tenantId: actor.tenantId, actorKind: "MEMBERSHIP", actorMembershipId: actor.membershipId }, {
        action: "ADMIN_IDENTITY_INVITATION_ISSUED", entity: "ADMIN_IDENTITY_INVITATION", entityId: String(row.id),
        source: "V17_ADMIN_IDENTITY", requestId, correlationId: requestId, critical: true,
        afterJson: { invitationRef: row.public_ref, role: "A", status: "PENDING", expiresAt },
        metadataJson: { tokenStored: false, delivery: "MANUAL_SECURE_CHANNEL" },
      });
      return { invitation: invitationDto(row, now), token, created: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 3_000, timeout: 10_000 });
    return Object.freeze({
      invitation: result.invitation,
      activationPath: result.token ? `/activate-admin#token=${result.token}` : null,
      shownOnce: result.created,
    });
  } catch (error) {
    throw controlledConflict(error);
  }
}

export async function revokeAdminIdentityInvitation(prisma, context, invitationRef, input, {
  now = new Date(), auditWriter = appendCommercialAudit,
} = {}) {
  requireInvitationPermissions(context);
  const ref = canonicalRef(invitationRef);
  const requestId = requiredAdminText(input?.requestId, "requestId");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "osi"."tenants" WHERE "id"=${String(context?.tenantId || "")} FOR UPDATE`);
    const actor = await revalidateAdminActor(tx, context);
    assertInvitationActor(actor);
    const rows = await tx.$queryRaw(Prisma.sql`
      SELECT "id", "public_ref", "normalized_email", "granted_permissions", "status"::text AS "status", "expires_at", "created_at"
      FROM "osi"."admin_identity_invitations"
      WHERE "tenant_id"=${actor.tenantId} AND "public_ref"=CAST(${ref} AS uuid)
      FOR UPDATE
    `);
    const before = rows[0];
    if (!before) throw new AdminIdentityInvitationError("ADMIN_IDENTITY_INVITATION_NOT_FOUND", 404);
    if (String(before.status) !== "PENDING") throw new AdminIdentityInvitationError("ADMIN_IDENTITY_INVITATION_NOT_PENDING", 409);
    const updated = await tx.$queryRaw(Prisma.sql`
      UPDATE "osi"."admin_identity_invitations"
      SET "status"='REVOKED', "revoked_at"=${now}, "updated_at"=${now}
      WHERE "tenant_id"=${actor.tenantId} AND "id"=CAST(${before.id} AS uuid) AND "status"='PENDING'
      RETURNING "public_ref", "normalized_email", "granted_permissions", "status"::text AS "status", "expires_at", "created_at"
    `);
    if (!updated[0]) throw new AdminIdentityInvitationError("ADMIN_IDENTITY_INVITATION_NOT_PENDING", 409);
    await auditWriter(tx, { tenantId: actor.tenantId, actorKind: "MEMBERSHIP", actorMembershipId: actor.membershipId }, {
      action: "ADMIN_IDENTITY_INVITATION_REVOKED", entity: "ADMIN_IDENTITY_INVITATION", entityId: String(before.id),
      source: "V17_ADMIN_IDENTITY", requestId, correlationId: requestId, critical: true,
      beforeJson: invitationDto(before, now), afterJson: invitationDto(updated[0], now),
    });
    return invitationDto(updated[0], now);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 3_000, timeout: 10_000 });
}

function publicActivationError() {
  return new AdminIdentityInvitationError("ADMIN_IDENTITY_ACTIVATION_INVALID", 400);
}

function requireExpectedRecipient(invitation, expectedRecipientEmail) {
  if (expectedRecipientEmail === undefined) return;
  let expected;
  try { expected = normalizeAdminInvitationEmail(expectedRecipientEmail); } catch { throw publicActivationError(); }
  if (String(invitation?.normalized_email || "") !== expected) throw publicActivationError();
}

function userCode() {
  return `ADM-${randomUUID().replaceAll("-", "").slice(0, 20).toUpperCase()}`;
}

async function lockInvitationByToken(tx, tokenHash) {
  const rows = await tx.$queryRaw(Prisma.sql`
    SELECT * FROM "osi"."admin_identity_invitations"
    WHERE "token_hash"=${tokenHash}
    FOR UPDATE
  `);
  return rows[0] || null;
}

export async function resolveAdminIdentityActivation(prisma, input, {
  now = new Date(), expectedRecipientEmail,
} = {}) {
  const tokenHash = hashAdminInvitationToken(input?.token);
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT invitation."normalized_email", invitation."status"::text AS "status", invitation."expires_at",
           tenant."code" AS "tenant_code", tenant."status"::text AS "tenant_status",
           existing_user."id" AS "existing_user_id"
    FROM "osi"."admin_identity_invitations" invitation
    JOIN "osi"."tenants" tenant ON tenant."id"=invitation."tenant_id"
    LEFT JOIN "osi"."osi_users" existing_user
      ON lower(btrim(existing_user."email"))=invitation."normalized_email"
    WHERE invitation."token_hash"=${tokenHash}
    LIMIT 2
  `);
  if (rows.length !== 1 || String(rows[0].status) !== "PENDING"
    || new Date(rows[0].expires_at) <= now || String(rows[0].tenant_status) !== "ACTIVE") {
    throw publicActivationError();
  }
  requireExpectedRecipient(rows[0], expectedRecipientEmail);
  return Object.freeze({
    mode: rows[0].existing_user_id
      ? ADMIN_IDENTITY_ACTIVATION_MODES.EXISTING_IDENTITY
      : ADMIN_IDENTITY_ACTIVATION_MODES.NEW_IDENTITY,
    tenantCode: String(rows[0].tenant_code),
  });
}

async function consumeInvitation(tx, invitation, user, membership, now, auditWriter) {
  const updated = await tx.$executeRaw(Prisma.sql`
    UPDATE "osi"."admin_identity_invitations"
    SET "status"='CONSUMED', "activated_user_id"=${user.id}, "activated_membership_id"=${membership.id},
        "consumed_at"=${now}, "updated_at"=${now}
    WHERE "id"=CAST(${invitation.id} AS uuid) AND "tenant_id"=${invitation.tenant_id} AND "status"='PENDING'
  `);
  if (updated !== 1) throw publicActivationError();
  await auditWriter(tx, { tenantId: invitation.tenant_id, actorKind: "MEMBERSHIP", actorMembershipId: membership.id }, {
    action: "ADMIN_IDENTITY_ACTIVATED", entity: "TENANT_MEMBERSHIP", entityId: membership.id,
    source: "V17_ADMIN_IDENTITY", requestId: String(invitation.request_id), correlationId: String(invitation.request_id), critical: true,
    afterJson: { membershipRef: membership.public_ref, role: "A", status: "ACTIVE" },
    metadataJson: { invitationRef: invitation.public_ref, automaticLogin: false },
  });
}

export async function activateNewAdminIdentity(prisma, input, {
  now = new Date(), passwordHasher = hashPassword, auditWriter = appendCommercialAudit, expectedRecipientEmail,
} = {}) {
  const tokenHash = hashAdminInvitationToken(input?.token);
  const name = String(input?.name || "").trim();
  if (name.length < 2 || name.length > 160 || /[\u0000-\u001f\u007f]/.test(name)) invalid();
  const password = validateEnrollmentPassword(input?.password);
  const locator = await prisma.$queryRaw(Prisma.sql`
    SELECT "id", "normalized_email", "status"::text AS "status", "expires_at"
    FROM "osi"."admin_identity_invitations" WHERE "token_hash"=${tokenHash} LIMIT 1
  `);
  if (!locator[0] || String(locator[0].status) !== "PENDING" || new Date(locator[0].expires_at) <= now) throw publicActivationError();
  requireExpectedRecipient(locator[0], expectedRecipientEmail);
  const passwordHash = await passwordHasher(password);
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`v17-admin-identity:${locator[0].normalized_email}`}, 0))::text AS "lock"`);
      const invitation = await lockInvitationByToken(tx, tokenHash);
      if (!invitation || String(invitation.status) !== "PENDING" || new Date(invitation.expires_at) <= now) throw publicActivationError();
      requireExpectedRecipient(invitation, expectedRecipientEmail);
      const tenants = await tx.$queryRaw(Prisma.sql`SELECT "id", "status"::text AS "status" FROM "osi"."tenants" WHERE "id"=${invitation.tenant_id} FOR SHARE`);
      if (String(tenants[0]?.status) !== "ACTIVE") throw publicActivationError();
      const existing = await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "osi"."osi_users" WHERE lower(btrim("email"))=${invitation.normalized_email} LIMIT 1 FOR UPDATE
      `);
      if (existing[0]) throw publicActivationError();
      const userId = `usr_${randomUUID().replaceAll("-", "")}`;
      const users = await tx.$queryRaw(Prisma.sql`
        INSERT INTO "osi"."osi_users" (
          "id", "code", "name", "email", "normalized_email", "phone", "role", "status", "joinDate", "passwordHash", "updatedAt"
        ) VALUES (
          ${userId}, ${userCode()}, ${name}, ${invitation.normalized_email}, ${invitation.normalized_email}, '', 'A', 'active',
          ${now.toISOString().slice(0, 10)}, ${passwordHash}, ${now}
        ) RETURNING "id"
      `);
      const membershipId = `tmem_${randomUUID().replaceAll("-", "")}`;
      const memberships = await tx.$queryRaw(Prisma.sql`
        INSERT INTO "osi"."tenant_memberships" (
          "id", "tenant_id", "user_id", "role", "status", "granted_permissions", "denied_permissions", "is_default", "authorization_version", "updated_at"
        ) VALUES (
          ${membershipId}, ${invitation.tenant_id}, ${users[0].id}, 'A', 'ACTIVE', ${ADMIN_MEMBERSHIP_PERMISSIONS}, ARRAY[]::TEXT[], true, 1, ${now}
        ) RETURNING "id", "public_ref"
      `);
      await consumeInvitation(tx, invitation, users[0], memberships[0], now, auditWriter);
      return Object.freeze({ activated: true, loginRequired: true });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 3_000, timeout: 15_000 });
  } catch (error) {
    if (error instanceof AdminIdentityInvitationError) throw error;
    throw publicActivationError();
  }
}

export async function acceptExistingAdminIdentity(prisma, input, legacyIdentity, {
  now = new Date(), auditWriter = appendCommercialAudit, expectedRecipientEmail,
} = {}) {
  const tokenHash = hashAdminInvitationToken(input?.token);
  const userId = String(legacyIdentity?.sub || "").trim();
  const email = normalizeAdminInvitationEmail(legacyIdentity?.email);
  if (!userId) throw publicActivationError();
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`v17-admin-identity:${email}`}, 0))::text AS "lock"`);
      const invitation = await lockInvitationByToken(tx, tokenHash);
      if (!invitation || String(invitation.status) !== "PENDING" || new Date(invitation.expires_at) <= now
        || String(invitation.normalized_email) !== email) throw publicActivationError();
      requireExpectedRecipient(invitation, expectedRecipientEmail);
      const tenants = await tx.$queryRaw(Prisma.sql`
        SELECT "id", "status"::text AS "status" FROM "osi"."tenants" WHERE "id"=${invitation.tenant_id} FOR SHARE
      `);
      if (String(tenants[0]?.status) !== "ACTIVE") throw publicActivationError();
      const users = await tx.$queryRaw(Prisma.sql`
        SELECT "id", "status" FROM "osi"."osi_users"
        WHERE "id"=${userId} AND lower(btrim("email"))=${email}
        FOR UPDATE
      `);
      if (!users[0] || String(users[0].status).toUpperCase() !== "ACTIVE") throw publicActivationError();
      const duplicate = await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "osi"."tenant_memberships" WHERE "tenant_id"=${invitation.tenant_id} AND "user_id"=${userId} LIMIT 1
      `);
      if (duplicate[0]) throw publicActivationError();
      const priorMemberships = await tx.$queryRaw(Prisma.sql`
        SELECT COUNT(*)::integer AS "count" FROM "osi"."tenant_memberships" WHERE "user_id"=${userId}
      `);
      const isDefault = Number(priorMemberships[0]?.count || 0) === 0;
      const membershipId = `tmem_${randomUUID().replaceAll("-", "")}`;
      const memberships = await tx.$queryRaw(Prisma.sql`
        INSERT INTO "osi"."tenant_memberships" (
          "id", "tenant_id", "user_id", "role", "status", "granted_permissions", "denied_permissions", "is_default", "authorization_version", "updated_at"
        ) VALUES (
          ${membershipId}, ${invitation.tenant_id}, ${userId}, 'A', 'ACTIVE', ${ADMIN_MEMBERSHIP_PERMISSIONS}, ARRAY[]::TEXT[], ${isDefault}, 1, ${now}
        ) RETURNING "id", "public_ref"
      `);
      await consumeInvitation(tx, invitation, users[0], memberships[0], now, auditWriter);
      return Object.freeze({ activated: true, loginRequired: true });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 3_000, timeout: 10_000 });
  } catch (error) {
    if (error instanceof AdminIdentityInvitationError) throw error;
    throw publicActivationError();
  }
}
