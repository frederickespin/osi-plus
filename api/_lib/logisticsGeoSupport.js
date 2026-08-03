import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { appendCommercialAudit, sanitizeCommercialAuditJson } from "./commercialAuditLog.js";
import { canonicalJson, normalizeGeoToken, sha256 } from "./geoNormalization.js";

export const LOGISTICS_GEO_PERMISSIONS = Object.freeze({
  VIEW: "logistics_geo:view",
  MANAGE: "logistics_geo:manage",
  APPROVE: "logistics_geo:approve",
  ACTIVATE: "logistics_geo:activate",
  RETIRE: "logistics_geo:retire",
  MODE_CHANGE: "logistics_geo:mode:change",
  IMPORT: "logistics_geo:import",
  SHADOW_COMPARE: "logistics_geo:shadow:compare",
});

export class LogisticsGeoError extends Error {
  constructor(message, { code = "LOGISTICS_GEO_ERROR", status = 500, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "LogisticsGeoError";
    this.code = code;
    this.status = status;
  }
}

export function requiredText(value, field, maxLength = 191) {
  const text = String(value ?? "").trim();
  if (!text || text.length > maxLength) throw new LogisticsGeoError(`${field} es obligatorio.`, { code: "LOGISTICS_GEO_INPUT_INVALID", status: 400 });
  return text;
}

export function optionalText(value, maxLength = 191) {
  if (value == null || String(value).trim() === "") return null;
  const text = String(value).trim();
  if (text.length > maxLength) throw new LogisticsGeoError("Texto demasiado largo.", { code: "LOGISTICS_GEO_INPUT_INVALID", status: 400 });
  return text;
}

export function normalizedCode(value, field, maxLength = 120) {
  const result = normalizeGeoToken(requiredText(value, field, maxLength));
  if (!result) throw new LogisticsGeoError(`${field} no es válido.`, { code: "LOGISTICS_GEO_INPUT_INVALID", status: 400 });
  return result;
}

export function asDate(value, field) {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new LogisticsGeoError(`${field} no es una fecha válida.`, { code: "LOGISTICS_GEO_INPUT_INVALID", status: 400 });
  return date;
}

export function asNumber(value, field, { nullable = true, min = -Infinity, max = Infinity } = {}) {
  if (nullable && (value == null || value === "")) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new LogisticsGeoError(`${field} no es válido.`, { code: "LOGISTICS_GEO_INPUT_INVALID", status: 400 });
  return number;
}

export function json(value) {
  return JSON.stringify(value ?? null);
}

export function payloadHashes(value) {
  const sanitized = sanitizeCommercialAuditJson(value);
  const payloadHash = sha256(canonicalJson(sanitized));
  return { sanitized, payloadHash };
}

export async function resolveLogisticsActor(db, context, permission, { allowSystem = false } = {}) {
  const tenantId = requiredText(context?.tenantId, "context.tenantId");
  const tenants = await db.$queryRaw(Prisma.sql`SELECT "id","status"::text AS "status" FROM "osi"."tenants" WHERE "id"=${tenantId} LIMIT 1`);
  if (!tenants[0] || tenants[0].status !== "ACTIVE") throw new LogisticsGeoError("Empresa activa no disponible.", { code: "LOGISTICS_GEO_TENANT_NOT_FOUND", status: 403 });
  if (String(context?.actorKind || "MEMBERSHIP").toUpperCase() === "SYSTEM") {
    if (!allowSystem) throw new LogisticsGeoError("Se requiere membresía activa.", { code: "LOGISTICS_GEO_FORBIDDEN", status: 403 });
    return { tenantId, kind: "SYSTEM", userId: null, membershipId: null, role: "SYSTEM", permissions: new Set() };
  }
  const membershipId = requiredText(context?.actorMembershipId, "context.actorMembershipId");
  const rows = await db.$queryRaw(Prisma.sql`
    SELECT m."id",m."tenant_id",m."user_id",m."role"::text AS "role",m."status"::text AS "membership_status",
      m."granted_permissions",m."denied_permissions",u."status" AS "user_status"
    FROM "osi"."tenant_memberships" m JOIN "osi"."osi_users" u ON u."id"=m."user_id"
    WHERE m."tenant_id"=${tenantId} AND m."id"=${membershipId} LIMIT 1
  `);
  const row = rows[0];
  if (!row) throw new LogisticsGeoError("Recurso no encontrado.", { code: "LOGISTICS_GEO_NOT_FOUND", status: 404 });
  if (String(row.membership_status).toUpperCase() !== "ACTIVE" || String(row.user_status).toUpperCase() !== "ACTIVE") {
    throw new LogisticsGeoError("Identidad empresarial inactiva.", { code: "LOGISTICS_GEO_ACTOR_INACTIVE", status: 403 });
  }
  const denied = new Set((row.denied_permissions || []).map(String));
  const permissions = new Set((row.granted_permissions || []).map(String).filter((item) => !denied.has(item)));
  if (permission && !permissions.has(permission)) throw new LogisticsGeoError(`Permiso requerido: ${permission}.`, { code: "LOGISTICS_GEO_FORBIDDEN", status: 403 });
  return { tenantId, kind: "MEMBERSHIP", userId: row.user_id, membershipId: row.id, role: String(row.role), permissions };
}

export function auditContext(actor) {
  return actor.kind === "SYSTEM"
    ? { tenantId: actor.tenantId, actorKind: "SYSTEM" }
    : { tenantId: actor.tenantId, actorKind: "MEMBERSHIP", actorMembershipId: actor.membershipId };
}

export async function auditLogistics(tx, actor, input, writer = appendCommercialAudit) {
  return writer(tx, auditContext(actor), {
    source: "DB01H_LOGISTICS_GEOGRAPHY",
    critical: true,
    ...input,
  });
}

export async function serializable(prisma, work) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      const sqlState = String(error?.meta?.code || error?.cause?.code || "");
      const requestIdRace = sqlState === "23505" && String(error?.meta?.message || error?.message || "").includes("request_id");
      const retryable = error?.code === "P2034" || sqlState === "40001" || sqlState === "40P01" || requestIdRace;
      if (!retryable || attempt === 2) throw error;
    }
  }
  throw new LogisticsGeoError("No se pudo serializar la operación.");
}

export function assertExpectedVersion(row, expectedVersion) {
  if (!row) throw new LogisticsGeoError("Recurso no encontrado.", { code: "LOGISTICS_GEO_NOT_FOUND", status: 404 });
  if (!Number.isInteger(Number(expectedVersion)) || Number(row.row_version) !== Number(expectedVersion)) {
    throw new LogisticsGeoError("La versión cambió; vuelva a cargar.", { code: "LOGISTICS_GEO_VERSION_CONFLICT", status: 409 });
  }
}

export function newId() {
  return randomUUID();
}

export function unwrapRejected(result) {
  if (result?.rejected) throw result.rejected;
  return result;
}
