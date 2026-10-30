import { Prisma } from "@prisma/client";
import { appendCommercialAudit } from "./commercialAuditLog.js";
import { PERMS } from "./rbac.js";
import { adminMembershipCatalog, assertAdminActorPermission, revalidateAdminActor, requireAdminPermission } from "./adminMembershipDomain.js";
import { exactIdentityObject, identityFail, identityRef, normalizeIdentityDocument, normalizeIdentityInput, requestRef } from "./adminUserIdentityContract.js";

export async function requireIdentityActor(db, context, permissions = []) {
  const required = [PERMS.MEMBERSHIP_VIEW, PERMS.USERS_VIEW, ...permissions];
  for (const permission of required) requireAdminPermission(context, permission);
  const actor = await revalidateAdminActor(db, context);
  for (const permission of required) assertAdminActorPermission(actor, permission);
  return actor;
}
export async function identityTenantLock(tx, tenantId) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "osi"."tenants" WHERE "id"=${tenantId} FOR UPDATE`);
}
/** Retry only errors that prove the whole transaction was rolled back. */
export async function identityTransaction(prisma, work, { timeout = 10000 } = {}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 3000, timeout });
    } catch (error) {
      const rolledBackConflict = error?.code === "P2034" || error?.code === "P2002"
        || (error?.code === "P2010" && ["40001", "40P01", "23505"].includes(error?.meta?.code));
      if (!rolledBackConflict) throw error;
      if (attempt === 2) identityFail("CONCURRENT_CHANGE", 409);
    }
  }
}
export async function appendIdentityAudit(tx, actor, { requestId, action, entityId, metadataJson }, auditWriter = appendCommercialAudit) {
  return auditWriter(tx, { tenantId: actor.tenantId, actorKind: "MEMBERSHIP", actorMembershipId: actor.membershipId }, {
    action, entity: "USER_IDENTITY", entityId, source: "V17_USER_IDENTITY_19C", requestId, correlationId: requestId,
    critical: true, metadataJson,
  });
}
function fallback(row) {
  return {
    name: row.full_name ?? row.user_name,
    phone: row.contact_phone ?? row.user_phone ?? "",
    contactEmail: row.contact_email ?? null,
    documentType: row.document_type ?? "CEDULA",
    documentNumber: row.document_number ?? null,
  };
}
export function userIdentityDto(row, actor) {
  return Object.freeze({
    membershipRef: String(row.public_ref), version: Number(row.version ?? 0), ...fallback(row),
    email: String(row.user_email), hasPhoto: Boolean(row.photo_sha256), photoVersion: Number(row.photo_version ?? 0),
    updatedAt: row.identity_updated_at ? new Date(row.identity_updated_at).toISOString() : null,
    canEdit: actor.effective.has(PERMS.USERS_EDIT) && !(actor.row.denied_permissions || []).includes(PERMS.USERS_EDIT),
  });
}
async function identityRow(db, tenantId, ref, { lock = false, photo = false } = {}) {
  const rows = await db.$queryRaw(Prisma.sql`
    SELECT tm."id" AS "membership_id", tm."user_id", tm."public_ref",
      u."name" AS "user_name", u."email" AS "user_email", u."phone" AS "user_phone",
      p."id" AS "identity_id", p."full_name", p."contact_phone", p."contact_email", p."document_type", p."document_number",
      p."photo_sha256", p."photo_version", p."version", p."updated_at" AS "identity_updated_at"
      ${photo ? Prisma.sql`, p."photo_bytes"` : Prisma.empty}
    FROM "osi"."tenant_memberships" tm
    JOIN "osi"."osi_users" u ON u."id"=tm."user_id"
    LEFT JOIN "osi"."tenant_user_identities" p ON p."tenant_id"=tm."tenant_id" AND p."membership_id"=tm."id" AND p."user_id"=tm."user_id"
    WHERE tm."tenant_id"=${tenantId} AND tm."public_ref"=CAST(${ref} AS uuid)
    ${lock ? Prisma.sql`FOR UPDATE OF tm` : Prisma.empty}
  `);
  if (!rows[0]) identityFail("NOT_FOUND", 404);
  return rows[0];
}
export async function getUserIdentity(prisma, context, membershipRef) {
  const ref = identityRef(membershipRef);
  const actor = await requireIdentityActor(prisma, context);
  return userIdentityDto(await identityRow(prisma, actor.tenantId, ref), actor);
}
export async function getUserIdentityPhoto(prisma, context, membershipRef) {
  const ref = identityRef(membershipRef);
  const actor = await requireIdentityActor(prisma, context);
  const row = await identityRow(prisma, actor.tenantId, ref, { photo: true });
  if (!row.photo_bytes || !row.photo_sha256) identityFail("NOT_FOUND", 404);
  return Object.freeze({ bytes: Buffer.from(row.photo_bytes), mimeType: "image/png" });
}
function identitySummary(row) {
  return Object.freeze({ membershipRef: String(row.public_ref), name: String(row.full_name ?? row.user_name), email: String(row.user_email),
    identityVersion: Number(row.version ?? 0), hasPhoto: Boolean(row.photo_sha256), photoVersion: Number(row.photo_version ?? 0) });
}
export async function listUserIdentitySummaries(prisma, context, refs) {
  if (!Array.isArray(refs) || refs.length > 50 || refs.length < 1) identityFail("INPUT_INVALID");
  const canonicalRefs = [...new Set(refs.map(identityRef))];
  const actor = await requireIdentityActor(prisma, context);
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT tm."public_ref", u."name" AS "user_name", u."email" AS "user_email", p."full_name", p."version", p."photo_sha256", p."photo_version"
    FROM "osi"."tenant_memberships" tm JOIN "osi"."osi_users" u ON u."id"=tm."user_id"
    LEFT JOIN "osi"."tenant_user_identities" p ON p."tenant_id"=tm."tenant_id" AND p."membership_id"=tm."id"
    WHERE tm."tenant_id"=${actor.tenantId} AND tm."public_ref"::text IN (${Prisma.join(canonicalRefs)})
    ORDER BY tm."public_ref" ASC
  `);
  return Object.freeze(rows.map(identitySummary));
}
export async function listUserIdentityDirectory(prisma, context, filters = {}) {
  const actor = await requireIdentityActor(prisma, context);
  const page = Math.max(1, Math.trunc(Number(filters.page) || 1));
  const pageSize = Math.min(50, Math.max(1, Math.trunc(Number(filters.pageSize) || 20)));
  const search = String(filters.search || "").trim().slice(0, 120);
  const catalog = adminMembershipCatalog();
  const role = filters.role || null;
  const status = filters.status || null;
  if (role && !catalog.roles.some((item) => item.code === role)) identityFail("INPUT_INVALID");
  if (status && !["ACTIVE", "SUSPENDED", "INACTIVE"].includes(status)) identityFail("INPUT_INVALID");
  const conditions = [Prisma.sql`tm."tenant_id"=${actor.tenantId}`];
  if (role) conditions.push(Prisma.sql`tm."role"::text=${role}`);
  if (status) conditions.push(Prisma.sql`tm."status"::text=${status}`);
  if (search) conditions.push(Prisma.sql`(COALESCE(p."full_name",u."name") ILIKE ${`%${search}%`} OR u."email" ILIKE ${`%${search}%`})`);
  const where = Prisma.join(conditions, " AND ");
  const total = await prisma.$queryRaw(Prisma.sql`
    SELECT COUNT(*)::integer AS "total" FROM "osi"."tenant_memberships" tm JOIN "osi"."osi_users" u ON u."id"=tm."user_id"
    LEFT JOIN "osi"."tenant_user_identities" p ON p."tenant_id"=tm."tenant_id" AND p."membership_id"=tm."id" WHERE ${where}
  `);
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT tm."public_ref", tm."role"::text AS "role", tm."status"::text AS "status", tm."granted_permissions", tm."denied_permissions", tm."authorization_version", tm."updated_at",
      u."name" AS "user_name", u."email" AS "user_email", p."full_name", p."version", p."photo_sha256", p."photo_version"
    FROM "osi"."tenant_memberships" tm JOIN "osi"."osi_users" u ON u."id"=tm."user_id"
    LEFT JOIN "osi"."tenant_user_identities" p ON p."tenant_id"=tm."tenant_id" AND p."membership_id"=tm."id"
    WHERE ${where} ORDER BY COALESCE(p."full_name",u."name") ASC, tm."public_ref" ASC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
  `);
  return Object.freeze({ data: rows.map((row) => ({ membershipRef: String(row.public_ref), name: String(row.full_name ?? row.user_name), email: String(row.user_email),
    role: String(row.role), status: String(row.status), grantedPermissions: row.granted_permissions || [], deniedPermissions: row.denied_permissions || [],
    authorizationVersion: Number(row.authorization_version), updatedAt: new Date(row.updated_at).toISOString() })),
  total: Number(total[0]?.total || 0), page, pageSize, catalog, identities: rows.map(identitySummary) });
}
export async function assertIdentityDocumentAvailable(tx, tenantId, documentType, documentNumber, { excludeMembershipId = null, excludeEnrollmentId = null, now = new Date() } = {}) {
  if (!documentNumber) return;
  const profile = await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "osi"."tenant_user_identities" WHERE "tenant_id"=${tenantId} AND "document_type"=${documentType}
      AND "document_number"=${documentNumber} AND (${excludeMembershipId}::text IS NULL OR "membership_id"<>${excludeMembershipId}) LIMIT 1
  `);
  const pending = await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "osi"."user_enrollments" WHERE "tenant_id"=${tenantId} AND "document_type"=${documentType}
      AND "document_number"=${documentNumber} AND "status"='PENDING' AND "expires_at">${now}
      AND (${excludeEnrollmentId}::uuid IS NULL OR "id"<>${excludeEnrollmentId}::uuid) LIMIT 1
  `);
  if (profile[0] || pending[0]) identityFail("DOCUMENT_DUPLICATE", 409);
}
export async function updateUserIdentity(prisma, context, membershipRef, input, { auditWriter = appendCommercialAudit, now = new Date() } = {}) {
  const ref = identityRef(membershipRef);
  exactIdentityObject(input, ["requestId", "expectedVersion", "name", "phone", "contactEmail", "documentType", "documentNumber", "photoBase64"]);
  const requestId = requestRef(input.requestId);
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) identityFail("INPUT_INVALID");
  const { requestId: _requestId, expectedVersion, ...fields } = input;
  const changes = normalizeIdentityInput(fields, { partial: true });
  return identityTransaction(prisma, async (tx) => {
    await identityTenantLock(tx, String(context?.tenantId || ""));
    const actor = await requireIdentityActor(tx, context, [PERMS.USERS_EDIT]);
    const before = await identityRow(tx, actor.tenantId, ref, { lock: true });
    if (Number(before.version || 0) !== expectedVersion) identityFail("VERSION_CONFLICT", 409);
    const previous = fallback(before);
    const { photo, ...textChanges } = changes;
    const next = { ...previous, ...textChanges };
    next.documentNumber = normalizeIdentityDocument(next.documentType, next.documentNumber);
    const changedFields = Object.keys(next).filter((key) => next[key] !== previous[key]);
    const photoChanged = photo !== undefined && photo.sha256 !== (before.photo_sha256 ?? null);
    if (!changedFields.length && !photoChanged) return userIdentityDto(before, actor);
    await assertIdentityDocumentAvailable(tx, actor.tenantId, next.documentType, next.documentNumber, { excludeMembershipId: before.membership_id, now });
    if (!before.identity_id) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "osi"."tenant_user_identities" ("tenant_id","membership_id","user_id","full_name","contact_phone","contact_email","document_type","document_number","photo_bytes","photo_sha256","photo_version","version","created_at","updated_at")
        VALUES (${actor.tenantId},${before.membership_id},${before.user_id},${next.name},${next.phone},${next.contactEmail},${next.documentType},${next.documentNumber},${photo?.bytes ?? null},${photo?.sha256 ?? null},${photoChanged ? 1 : 0},1,${now},${now})
      `);
    } else {
      const changed = await tx.$executeRaw(Prisma.sql`
        UPDATE "osi"."tenant_user_identities" SET "full_name"=${next.name},"contact_phone"=${next.phone},"contact_email"=${next.contactEmail},"document_type"=${next.documentType},"document_number"=${next.documentNumber},
        "photo_bytes"=CASE WHEN ${photoChanged} THEN ${photo?.bytes ?? null}::bytea ELSE "photo_bytes" END,
        "photo_sha256"=CASE WHEN ${photoChanged} THEN ${photo?.sha256 ?? null} ELSE "photo_sha256" END,
        "photo_version"="photo_version"+${photoChanged ? 1 : 0},"version"="version"+1,"updated_at"=${now}
        WHERE "tenant_id"=${actor.tenantId} AND "membership_id"=${before.membership_id} AND "version"=${expectedVersion}
      `);
      if (changed !== 1) identityFail("VERSION_CONFLICT", 409);
    }
    await appendIdentityAudit(tx, actor, { requestId, action: "USER_IDENTITY_UPDATED", entityId: ref,
      metadataJson: { changedFields: [...changedFields, ...(photoChanged ? ["photo"] : [])], previousVersion: expectedVersion, version: expectedVersion + 1, globalIdentityChanged: false } }, auditWriter);
    return userIdentityDto(await identityRow(tx, actor.tenantId, ref), actor);
  });
}

