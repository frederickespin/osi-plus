import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

export const COMMERCIAL_AUDIT_VIEW_PERMISSION = "commercial:audit:view";

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;
const MAX_DEPTH = 8;
const MAX_ARRAY_ITEMS = 200;
const MAX_STRING_LENGTH = 4_000;
const MAX_JSON_BYTES = 64 * 1024;

const SENSITIVE_KEY = /(?:password|passwordhash|passphrase|secret|token|authorization|cookie|api[-_]?key|private[-_]?key|signatureimage|credential)/i;

const CRITICAL_ACTION_PATTERNS = Object.freeze([
  /(?:^|_)APPROV(?:E|ED|AL)(?:_|$)/,
  /(?:^|_)REJECT(?:ED|ION)?(?:_|$)/,
  /(?:^|_)EXCEPTIONAL_DISCOUNT(?:_|$)/,
  /(?:^|_)DISCOUNT_OVERRIDE(?:_|$)/,
  /(?:^|_)ADDENDUM(?:_|$)/,
  /(?:^|_)CHANGE_ORDER(?:_|$)/,
  /(?:^|_)CONTRACT(?:_|$)/,
  /(?:^|_)REASSIGN(?:ED|MENT)?(?:_|$)/,
  /(?:^|_)PERMISSION(?:S)?(?:_|$)/,
  /(?:^|_)AUTHORIZATION(?:_|$)/,
]);

export class CommercialAuditError extends Error {
  constructor(message, { code = "COMMERCIAL_AUDIT_ERROR", status = 500, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "CommercialAuditError";
    this.code = code;
    this.status = status;
  }
}

function requiredText(value, field, maxLength) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new CommercialAuditError(`${field} es obligatorio.`, {
      code: "AUDIT_INPUT_INVALID",
      status: 400,
    });
  }
  if (normalized.length > maxLength) {
    throw new CommercialAuditError(`${field} excede ${maxLength} caracteres.`, {
      code: "AUDIT_INPUT_INVALID",
      status: 400,
    });
  }
  return normalized;
}

function optionalText(value, field, maxLength) {
  if (value == null || String(value).trim() === "") return null;
  return requiredText(value, field, maxLength);
}

function normalizedAction(value) {
  return requiredText(value, "action", 160).toUpperCase();
}

export function isCriticalCommercialAuditAction(action) {
  const normalized = normalizedAction(action);
  return CRITICAL_ACTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

function sanitizeNode(value, state, depth = 0, key = "") {
  if (SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (value == null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…[TRUNCATED]` : value;
  }
  if (value instanceof Date) return value.toISOString();
  if (depth >= MAX_DEPTH) return "[MAX_DEPTH]";
  if (typeof value !== "object") return String(value);
  if (state.seen.has(value)) return "[CIRCULAR]";
  state.seen.add(value);

  if (Array.isArray(value)) {
    const sanitized = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeNode(item, state, depth + 1, key));
    if (value.length > MAX_ARRAY_ITEMS) sanitized.push(`[${value.length - MAX_ARRAY_ITEMS} ITEMS TRUNCATED]`);
    return sanitized;
  }

  const result = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    result[childKey] = sanitizeNode(childValue, state, depth + 1, childKey);
  }
  return result;
}

export function sanitizeCommercialAuditJson(value) {
  if (value == null) return null;
  const sanitized = sanitizeNode(value, { seen: new WeakSet() });
  const serialized = JSON.stringify(sanitized);
  if (Buffer.byteLength(serialized, "utf8") > MAX_JSON_BYTES) {
    return {
      _audit_payload: "[TRUNCATED]",
      originalBytes: Buffer.byteLength(serialized, "utf8"),
      preview: serialized.slice(0, 8_000),
    };
  }
  return sanitized;
}

function jsonParameter(value) {
  return value == null ? null : JSON.stringify(value);
}

function canonicalJson(value) {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function mapAuditRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    actorUserId: row.actor_user_id,
    actorMembershipId: row.actor_membership_id,
    roleSnapshot: row.role_snapshot,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    beforeJson: row.before_json,
    afterJson: row.after_json,
    metadataJson: row.metadata_json,
    source: row.source,
    requestId: row.request_id,
    correlationId: row.correlation_id,
    critical: row.critical,
    createdAt: row.created_at,
  };
}

function assertTenantContext(context) {
  const tenantId = requiredText(context?.tenantId, "context.tenantId", 191);
  return tenantId;
}

async function resolveAuditActor(db, context) {
  const tenantId = assertTenantContext(context);
  const actorKind = String(context?.actorKind || "MEMBERSHIP").trim().toUpperCase();

  const tenants = await db.$queryRaw(Prisma.sql`
    SELECT "id", "status"::text AS "status"
    FROM "osi"."tenants"
    WHERE "id" = ${tenantId}
    LIMIT 1
  `);
  if (!tenants[0]) {
    throw new CommercialAuditError("El tenant del contexto no existe.", {
      code: "AUDIT_TENANT_NOT_FOUND",
      status: 403,
    });
  }
  if (String(tenants[0].status).toUpperCase() !== "ACTIVE") {
    throw new CommercialAuditError("La empresa del contexto no está activa.", {
      code: "AUDIT_TENANT_INACTIVE",
      status: 403,
    });
  }

  if (actorKind === "SYSTEM") {
    return {
      tenantId,
      actorUserId: null,
      actorMembershipId: null,
      roleSnapshot: "SYSTEM",
    };
  }

  if (actorKind !== "MEMBERSHIP") {
    throw new CommercialAuditError("Tipo de actor de auditoría no soportado.", {
      code: "AUDIT_ACTOR_INVALID",
      status: 400,
    });
  }

  const membershipId = requiredText(context?.actorMembershipId, "context.actorMembershipId", 191);
  const rows = await db.$queryRaw(Prisma.sql`
    SELECT
      "id",
      "tenant_id",
      "user_id",
      "role"::text AS "role",
      "status"::text AS "status"
    FROM "osi"."tenant_memberships"
    WHERE "id" = ${membershipId}
      AND "tenant_id" = ${tenantId}
    LIMIT 1
  `);
  const membership = rows[0];
  if (!membership) {
    throw new CommercialAuditError("La membresía no pertenece a la empresa activa.", {
      code: "AUDIT_CROSS_TENANT_ACTOR",
      status: 403,
    });
  }
  if (String(membership.status).toUpperCase() !== "ACTIVE") {
    throw new CommercialAuditError("La membresía del actor no está activa.", {
      code: "AUDIT_MEMBERSHIP_INACTIVE",
      status: 403,
    });
  }

  return {
    tenantId,
    actorUserId: membership.user_id,
    actorMembershipId: membership.id,
    roleSnapshot: String(membership.role),
  };
}

function assertAuditReadPermission(context) {
  const granted = new Set(Array.isArray(context?.permissions) ? context.permissions.map(String) : []);
  const denied = new Set(Array.isArray(context?.deniedPermissions) ? context.deniedPermissions.map(String) : []);
  if (denied.has(COMMERCIAL_AUDIT_VIEW_PERMISSION) || !granted.has(COMMERCIAL_AUDIT_VIEW_PERMISSION)) {
    throw new CommercialAuditError("No tiene permiso para consultar la auditoría comercial.", {
      code: "AUDIT_FORBIDDEN",
      status: 403,
    });
  }
}

export async function appendCommercialAudit(db, context, event) {
  if (!db?.$queryRaw || !db?.$executeRaw) {
    throw new CommercialAuditError("Se requiere un cliente o transacción Prisma.", {
      code: "AUDIT_DATABASE_INVALID",
    });
  }
  const actor = await resolveAuditActor(db, context);
  const action = normalizedAction(event?.action);
  const entity = requiredText(event?.entity, "entity", 120).toUpperCase();
  const entityId = requiredText(event?.entityId, "entityId", 191);
  const source = requiredText(event?.source, "source", 80).toUpperCase();
  const requestId = optionalText(event?.requestId, "requestId", 191);
  const correlationId = optionalText(event?.correlationId, "correlationId", 191) || requestId || randomUUID();
  const critical = event?.critical === true || isCriticalCommercialAuditAction(action);
  const beforeJson = sanitizeCommercialAuditJson(event?.beforeJson);
  const afterJson = sanitizeCommercialAuditJson(event?.afterJson);
  const metadataJson = sanitizeCommercialAuditJson(event?.metadataJson);
  const id = randomUUID();

  const inserted = await db.$queryRaw(Prisma.sql`
    INSERT INTO "osi"."commercial_audit_logs" (
      "id", "tenant_id", "actor_user_id", "actor_membership_id", "role_snapshot",
      "action", "entity", "entity_id", "before_json", "after_json", "metadata_json",
      "source", "request_id", "correlation_id", "critical"
    ) VALUES (
      ${id}, ${actor.tenantId}, ${actor.actorUserId}, ${actor.actorMembershipId}, ${actor.roleSnapshot},
      ${action}, ${entity}, ${entityId},
      CAST(${jsonParameter(beforeJson)} AS jsonb), CAST(${jsonParameter(afterJson)} AS jsonb),
      CAST(${jsonParameter(metadataJson)} AS jsonb),
      ${source}, ${requestId}, ${correlationId}, ${critical}
    )
    ON CONFLICT ("tenant_id", "request_id", "action", "entity", "entity_id")
      WHERE "request_id" IS NOT NULL
      DO NOTHING
    RETURNING *
  `);

  if (inserted[0]) return mapAuditRow(inserted[0]);
  if (!requestId) {
    throw new CommercialAuditError("La auditoría no fue persistida.", {
      code: "AUDIT_PERSISTENCE_FAILED",
    });
  }

  const existing = await db.$queryRaw(Prisma.sql`
    SELECT * FROM "osi"."commercial_audit_logs"
    WHERE "tenant_id" = ${actor.tenantId}
      AND "request_id" = ${requestId}
      AND "action" = ${action}
      AND "entity" = ${entity}
      AND "entity_id" = ${entityId}
    LIMIT 1
  `);
  if (!existing[0]) {
    throw new CommercialAuditError("No se pudo resolver la escritura idempotente.", {
      code: "AUDIT_IDEMPOTENCY_FAILED",
    });
  }
  const prior = mapAuditRow(existing[0]);
  const sameEvent =
    prior.actorUserId === actor.actorUserId &&
    prior.actorMembershipId === actor.actorMembershipId &&
    prior.roleSnapshot === actor.roleSnapshot &&
    prior.source === source &&
    prior.correlationId === correlationId &&
    prior.critical === critical &&
    canonicalJson(prior.beforeJson) === canonicalJson(beforeJson) &&
    canonicalJson(prior.afterJson) === canonicalJson(afterJson) &&
    canonicalJson(prior.metadataJson) === canonicalJson(metadataJson);
  if (!sameEvent) {
    throw new CommercialAuditError("El requestId ya existe con un evento de auditoría diferente.", {
      code: "AUDIT_IDEMPOTENCY_CONFLICT",
      status: 409,
    });
  }
  return prior;
}

function encodeCursor(row) {
  return Buffer.from(JSON.stringify({ createdAt: row.created_at, id: row.id }), "utf8").toString("base64url");
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(cursor), "base64url").toString("utf8"));
    const createdAt = new Date(parsed.createdAt);
    const id = requiredText(parsed.id, "cursor.id", 191);
    if (!Number.isFinite(createdAt.getTime())) throw new Error("invalid date");
    return { createdAt, id };
  } catch {
    throw new CommercialAuditError("Cursor de auditoría inválido.", {
      code: "AUDIT_CURSOR_INVALID",
      status: 400,
    });
  }
}

export async function listCommercialAudit(db, context, filters = {}) {
  assertAuditReadPermission(context);
  const actor = await resolveAuditActor(db, context);
  const takeRaw = Number(filters.limit ?? DEFAULT_PAGE_SIZE);
  const limit = Number.isFinite(takeRaw)
    ? Math.min(Math.max(Math.trunc(takeRaw), 1), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;
  const cursor = decodeCursor(filters.cursor);
  const conditions = [Prisma.sql`"tenant_id" = ${actor.tenantId}`];

  if (filters.entity) conditions.push(Prisma.sql`"entity" = ${requiredText(filters.entity, "entity", 120).toUpperCase()}`);
  if (filters.entityId) conditions.push(Prisma.sql`"entity_id" = ${requiredText(filters.entityId, "entityId", 191)}`);
  if (filters.action) conditions.push(Prisma.sql`"action" = ${normalizedAction(filters.action)}`);
  if (filters.actorUserId) conditions.push(Prisma.sql`"actor_user_id" = ${requiredText(filters.actorUserId, "actorUserId", 191)}`);
  if (filters.correlationId) conditions.push(Prisma.sql`"correlation_id" = ${requiredText(filters.correlationId, "correlationId", 191)}`);
  if (filters.from) conditions.push(Prisma.sql`"created_at" >= ${new Date(filters.from)}`);
  if (filters.to) conditions.push(Prisma.sql`"created_at" <= ${new Date(filters.to)}`);
  if (cursor) {
    conditions.push(Prisma.sql`("created_at" < ${cursor.createdAt} OR ("created_at" = ${cursor.createdAt} AND "id" < ${cursor.id}))`);
  }

  const rows = await db.$queryRaw(Prisma.sql`
    SELECT * FROM "osi"."commercial_audit_logs"
    WHERE ${Prisma.join(conditions, " AND ")}
    ORDER BY "created_at" DESC, "id" DESC
    LIMIT ${limit + 1}
  `);
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    data: page.map(mapAuditRow),
    nextCursor: hasMore ? encodeCursor(page[page.length - 1]) : null,
  };
}

export async function executeCriticalAuditedMutation(prisma, { context, event, mutate }) {
  if (typeof mutate !== "function") {
    throw new CommercialAuditError("mutate es obligatorio.", {
      code: "AUDIT_MUTATION_INVALID",
      status: 400,
    });
  }
  if (!isCriticalCommercialAuditAction(event?.action) && event?.critical !== true) {
    throw new CommercialAuditError("La operación no está clasificada como auditoría crítica.", {
      code: "AUDIT_LEVEL_INVALID",
      status: 400,
    });
  }

  return prisma.$transaction(async (tx) => {
    const result = await mutate(tx);
    const resolvedEvent = {
      ...event,
      critical: true,
      beforeJson: typeof event.beforeJson === "function" ? event.beforeJson(result) : event.beforeJson,
      afterJson: typeof event.afterJson === "function" ? event.afterJson(result) : event.afterJson,
      metadataJson: typeof event.metadataJson === "function" ? event.metadataJson(result) : event.metadataJson,
    };
    const audit = await appendCommercialAudit(tx, context, resolvedEvent);
    return { result, audit };
  }, { isolationLevel: "Serializable" });
}

export async function appendOperationalAuditWithRetry(prisma, context, event, { attempts = 3 } = {}) {
  if (isCriticalCommercialAuditAction(event?.action) || event?.critical === true) {
    throw new CommercialAuditError("Una auditoría crítica debe compartir la transacción empresarial.", {
      code: "AUDIT_CRITICAL_TRANSACTION_REQUIRED",
      status: 400,
    });
  }
  const maxAttempts = Math.min(Math.max(Math.trunc(Number(attempts) || 1), 1), 5);
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await appendCommercialAudit(prisma, context, event);
    } catch (error) {
      lastError = error;
    }
  }
  throw new CommercialAuditError(`La auditoría operativa falló después de ${maxAttempts} intento(s).`, {
    code: "AUDIT_OPERATIONAL_RETRIES_EXHAUSTED",
    cause: lastError,
  });
}
