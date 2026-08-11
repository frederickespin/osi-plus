import { Prisma } from "@prisma/client";
import {
  getBearerToken,
  isMembershipAccessTokenCandidate,
  verifyStrictLegacyAccessToken,
} from "./auth.js";
import { resolveAuthContext } from "./authContext.js";
import { Mt01bAuthError } from "./authPolicy.js";
import { permsForRole } from "./rbac.js";

export const COMMERCIAL_TENANCY_WRITE_MODES = Object.freeze({
  LEGACY_ONLY: "LEGACY_ONLY",
  TENANT_WRITE: "TENANT_WRITE",
});

export const COMMERCIAL_TENANCY_READ_MODES = Object.freeze({
  LEGACY_ONLY: "LEGACY_ONLY",
  TENANT_READ: "TENANT_READ",
});

export const COMMERCIAL_TENANCY_ACTIVATION_BATCH = "MT-01C2B2-IPACKERS-DO-V1";

export const COMMERCIAL_BROWSER_AUTHORITY_FIELDS = Object.freeze([
  "tenantId",
  "tenant_id",
  "membershipId",
  "membership_id",
  "ownerMembershipId",
  "owner_membership_id",
  "ownerUserId",
  "owner_user_id",
  "role",
  "permissions",
]);

const COMMERCIAL_CONTEXT_CACHE = Symbol("osi.commercialTenancyWriteContext");

export class CommercialTenancyError extends Error {
  constructor(code, status = 400, message = code, { cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "CommercialTenancyError";
    this.code = code;
    this.status = status;
  }
}

function upper(value) {
  return String(value || "").trim().toUpperCase();
}

function effectivePermissions(role, granted, denied) {
  const blocked = new Set((Array.isArray(denied) ? denied : []).map(String));
  return Object.freeze([...new Set([
    ...permsForRole(role),
    ...(Array.isArray(granted) ? granted.map(String) : []),
  ])].filter((permission) => !blocked.has(permission)).sort());
}

function immutableContext(value) {
  return Object.freeze({
    ...value,
    effectivePermissions: Object.freeze([...(value.effectivePermissions || [])]),
    permissions: Object.freeze([...(value.effectivePermissions || [])]),
  });
}

export function resolveCommercialTenancyModes(env = process.env) {
  const configuredWrite = env.COMMERCIAL_TENANCY_WRITE_MODE;
  const writeMode = configuredWrite === undefined
    ? COMMERCIAL_TENANCY_WRITE_MODES.LEGACY_ONLY
    : configuredWrite;
  const configuredRead = env.COMMERCIAL_TENANCY_READ_MODE;
  const readMode = configuredRead === undefined
    ? COMMERCIAL_TENANCY_READ_MODES.LEGACY_ONLY
    : configuredRead;
  if (typeof writeMode !== "string" || !Object.values(COMMERCIAL_TENANCY_WRITE_MODES).includes(writeMode)) {
    throw new CommercialTenancyError("COMMERCIAL_TENANCY_CONFIGURATION_INVALID", 503);
  }
  if (typeof readMode !== "string" || !Object.values(COMMERCIAL_TENANCY_READ_MODES).includes(readMode)) {
    throw new CommercialTenancyError("COMMERCIAL_TENANCY_CONFIGURATION_INVALID", 503);
  }
  const coordinatedLegacy = writeMode === COMMERCIAL_TENANCY_WRITE_MODES.LEGACY_ONLY
    && readMode === COMMERCIAL_TENANCY_READ_MODES.LEGACY_ONLY;
  const coordinatedTenant = writeMode === COMMERCIAL_TENANCY_WRITE_MODES.TENANT_WRITE
    && readMode === COMMERCIAL_TENANCY_READ_MODES.TENANT_READ;
  if (!coordinatedLegacy && !coordinatedTenant) {
    throw new CommercialTenancyError("COMMERCIAL_TENANCY_CONFIGURATION_INVALID", 503);
  }
  const activationBatch = env.COMMERCIAL_TENANCY_ACTIVATION_BATCH;
  if ((coordinatedLegacy && activationBatch !== undefined)
    || (coordinatedTenant && activationBatch !== COMMERCIAL_TENANCY_ACTIVATION_BATCH)) {
    throw new CommercialTenancyError("COMMERCIAL_TENANCY_CONFIGURATION_INVALID", 503);
  }
  const vercelEnvironment = env.VERCEL_ENV;
  const normalizedVercelEnvironment = upper(vercelEnvironment);
  const isVercelRuntime = String(env.VERCEL || "").trim() === "1"
    || normalizedVercelEnvironment === "PREVIEW"
    || normalizedVercelEnvironment === "PRODUCTION"
    || (vercelEnvironment !== undefined && vercelEnvironment !== "development");
  const productionActivationAllowed = coordinatedTenant
    && vercelEnvironment === "production"
    && env.VERCEL_GIT_COMMIT_REF === "main"
    && activationBatch === COMMERCIAL_TENANCY_ACTIVATION_BATCH;
  if (coordinatedTenant && isVercelRuntime && !productionActivationAllowed) {
    throw new CommercialTenancyError("COMMERCIAL_TENANCY_CONFIGURATION_INVALID", 503);
  }
  return Object.freeze({ writeMode, readMode, tenantMode: coordinatedTenant });
}

export function resolveCommercialTenancyWriteMode(env = process.env) {
  return resolveCommercialTenancyModes(env).writeMode;
}

export function resolveCommercialTenancyReadMode(env = process.env) {
  return resolveCommercialTenancyModes(env).readMode;
}

function databaseUnavailable(cause) {
  return new CommercialTenancyError("COMMERCIAL_CONTEXT_DATABASE_UNAVAILABLE", 503, undefined, { cause });
}

export function commercialDatabaseUnavailable(cause) {
  return databaseUnavailable(cause);
}

async function resolveLegacyCommercialContext(prisma, token) {
  let payload;
  try {
    payload = verifyStrictLegacyAccessToken(token);
  } catch (cause) {
    if (cause instanceof Mt01bAuthError) throw cause;
    throw new CommercialTenancyError("COMMERCIAL_AUTH_INVALID", 401, undefined, { cause });
  }

  let rows;
  try {
    rows = await prisma.$queryRaw(Prisma.sql`
      SELECT tm."tenant_id", tm."id" AS "membership_id", u."id" AS "user_id",
             tm."role"::text AS "membership_role", tm."status"::text AS "membership_status",
             tm."granted_permissions", tm."denied_permissions", tm."authorization_version",
             t."status"::text AS "tenant_status", u."status" AS "user_status"
      FROM "osi"."osi_users" u
      LEFT JOIN "osi"."tenant_memberships" tm
        ON tm."user_id" = u."id" AND tm."is_default" = true
      LEFT JOIN "osi"."tenants" t ON t."id" = tm."tenant_id"
      WHERE u."id" = ${String(payload.sub)}
      ORDER BY tm."created_at" ASC, tm."id" ASC
      LIMIT 2
    `);
  } catch (cause) {
    throw databaseUnavailable(cause);
  }

  if (rows.length === 0) {
    throw new CommercialTenancyError("COMMERCIAL_AUTH_INVALID", 401);
  }
  if (rows.length !== 1) {
    throw new CommercialTenancyError("COMMERCIAL_DEFAULT_MEMBERSHIP_AMBIGUOUS", 409);
  }
  const row = rows[0];
  if (String(row.user_id) !== String(payload.sub) || upper(row.user_status) !== "ACTIVE") {
    throw new CommercialTenancyError("COMMERCIAL_AUTH_INVALID", 401);
  }
  if (!row.membership_id) {
    throw new CommercialTenancyError("COMMERCIAL_DEFAULT_MEMBERSHIP_REQUIRED", 409);
  }
  if (upper(row.membership_status) !== "ACTIVE") {
    throw new CommercialTenancyError("COMMERCIAL_MEMBERSHIP_INACTIVE", 403);
  }
  if (upper(row.tenant_status) !== "ACTIVE") {
    throw new CommercialTenancyError("COMMERCIAL_TENANT_INACTIVE", 403);
  }

  const role = upper(row.membership_role);
  return immutableContext({
    authType: "LEGACY_TENANT_WRITE",
    userId: String(row.user_id),
    tenantId: String(row.tenant_id),
    membershipId: String(row.membership_id),
    role,
    authorizationVersion: Number(row.authorization_version),
    effectivePermissions: effectivePermissions(role, row.granted_permissions, row.denied_permissions),
  });
}

async function resolveV2CommercialContext(prisma, request, env, now) {
  try {
    const context = await resolveAuthContext(request, {
      prisma,
      now,
      env: {
        ...env,
        MT01B_AUTH_MODE: "MEMBERSHIP_ONLY",
        MT01B_TENANT_SWITCH_ENABLED: "false",
      },
    });
    return immutableContext(context);
  } catch (cause) {
    if (cause instanceof Mt01bAuthError || cause instanceof CommercialTenancyError) throw cause;
    throw databaseUnavailable(cause);
  }
}

export async function resolveCommercialContext(request, {
  prisma,
  env = process.env,
  now = new Date(),
} = {}) {
  if (!prisma) throw new CommercialTenancyError("COMMERCIAL_CONTEXT_DATABASE_UNAVAILABLE", 503);
  if (request[COMMERCIAL_CONTEXT_CACHE]) return request[COMMERCIAL_CONTEXT_CACHE];

  const pending = (async () => {
    const token = getBearerToken(request);
    if (!token) throw new CommercialTenancyError("COMMERCIAL_AUTH_REQUIRED", 401);
    if (isMembershipAccessTokenCandidate(token)) {
      return resolveV2CommercialContext(prisma, request, env, now);
    }
    return resolveLegacyCommercialContext(prisma, token);
  })();
  request[COMMERCIAL_CONTEXT_CACHE] = pending;
  try {
    return await pending;
  } catch (error) {
    delete request[COMMERCIAL_CONTEXT_CACHE];
    throw error;
  }
}

export const resolveCommercialWriteContext = resolveCommercialContext;

export async function requireCommercialPermission(request, response, permission, options = {}) {
  try {
    const context = await resolveCommercialContext(request, options);
    if (!context.effectivePermissions.includes(String(permission))) {
      throw new CommercialTenancyError("COMMERCIAL_PERMISSION_FORBIDDEN", 403);
    }
    return context;
  } catch (error) {
    sendCommercialTenancyError(response, error);
    return null;
  }
}

export const requireCommercialWritePermission = requireCommercialPermission;

export function assertNoBrowserCommercialAuthority(body) {
  const forbidden = COMMERCIAL_BROWSER_AUTHORITY_FIELDS.filter((field) => Object.hasOwn(body || {}, field));
  if (forbidden.length > 0) {
    throw new CommercialTenancyError("COMMERCIAL_AUTHORITY_FIELDS_FORBIDDEN", 400);
  }
}

export async function requireProjectClientForTenant(prisma, clientId, tenantId) {
  let clients;
  try {
    clients = await prisma.$queryRaw(Prisma.sql`
      SELECT "id", "tenant_id" AS "tenantId"
      FROM "osi"."osi_clients"
      WHERE "id" = ${String(clientId || "")}
      FOR KEY SHARE
    `);
  } catch (cause) {
    throw databaseUnavailable(cause);
  }
  const client = clients[0];
  if (!client) throw new CommercialTenancyError("COMMERCIAL_RESOURCE_NOT_FOUND", 404);
  if (client.tenantId == null) {
    throw new CommercialTenancyError("COMMERCIAL_CLIENT_TENANCY_PENDING", 409);
  }
  if (String(client.tenantId) !== String(tenantId)) {
    throw new CommercialTenancyError("COMMERCIAL_RESOURCE_NOT_FOUND", 404);
  }
  return Object.freeze({ id: String(client.id) });
}

export async function createTenantClient(prisma, { tenantId, data }) {
  try {
    return await prisma.client.create({
      data: { ...data, tenantId: String(tenantId) },
      omit: { tenantId: true },
    });
  } catch (cause) {
    throw databaseUnavailable(cause);
  }
}

function isProjectClientReferenceFailure(error) {
  return error?.code === "P2003"
    || error?.code === "P2025"
    || error?.code === "23503";
}

export async function createTenantProject(prisma, { tenantId, clientId, data }) {
  try {
    return await prisma.$transaction(async (tx) => {
      await requireProjectClientForTenant(tx, clientId, tenantId);
      return tx.project.create({
        data: { ...data, tenantId: String(tenantId) },
        omit: { tenantId: true },
      });
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 3_000,
      timeout: 5_000,
    });
  } catch (cause) {
    if (cause instanceof CommercialTenancyError) throw cause;
    if (isProjectClientReferenceFailure(cause)) {
      throw new CommercialTenancyError("COMMERCIAL_RESOURCE_NOT_FOUND", 404);
    }
    throw databaseUnavailable(cause);
  }
}

export function sendCommercialTenancyError(response, error) {
  if (error instanceof CommercialTenancyError || error instanceof Mt01bAuthError) {
    return response.status(Number.isInteger(error.status) ? error.status : 401).json({
      ok: false,
      error: String(error.code || "COMMERCIAL_AUTH_INVALID"),
    });
  }
  return response.status(503).json({ ok: false, error: "COMMERCIAL_CONTEXT_DATABASE_UNAVAILABLE" });
}
