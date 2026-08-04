import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { performance } from "node:perf_hooks";
import { Prisma } from "@prisma/client";
import { signMembershipAccessToken } from "./auth.js";
import { Mt01bAuthError, assertMt01bV2Enabled, requireRefreshPepper } from "./authPolicy.js";
import { appendCommercialAudit } from "./commercialAuditLog.js";

function hmacHex(namespace, value, env = process.env) {
  return createHmac("sha256", requireRefreshPepper(env))
    .update(`${namespace}:v1:${String(value || "")}`, "utf8")
    .digest("hex");
}

function sameHash(left, right) {
  const a = Buffer.from(String(left || ""), "utf8");
  const b = Buffer.from(String(right || ""), "utf8");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function upper(value) {
  return String(value || "").trim().toUpperCase();
}

function activeGlobalUser(value) {
  return upper(value) === "ACTIVE";
}

function opaqueRefreshToken() {
  const id = randomUUID();
  const secret = randomBytes(32).toString("base64url");
  return { id, secret, value: `${id}.${secret}` };
}

function parseRefreshToken(value) {
  const match = String(value || "").match(/^([0-9a-f]{8}-[0-9a-f-]{27})\.([A-Za-z0-9_-]{40,})$/i);
  if (!match) throw new Mt01bAuthError("Refresh token inválido.", { code: "MT01B_REFRESH_INVALID" });
  return { id: match[1], value: String(value) };
}

function identityFromRow(row) {
  return {
    sessionId: row.id,
    tenantId: row.tenant_id,
    membershipId: row.membership_id,
    userId: row.user_id,
    role: row.membership_role,
    authorizationVersion: Number(row.membership_authorization_version),
  };
}

function fingerprintSource(req) {
  const userAgent = String(req?.headers?.["user-agent"] || "").trim().slice(0, 1_000);
  const clientId = String(req?.headers?.["x-osi-client-id"] || "").trim().slice(0, 191);
  return `${clientId}\n${userAgent}`;
}

export function deriveClientFingerprint(req, env = process.env) {
  return hmacHex("fingerprint", fingerprintSource(req), env);
}

export function hashRefreshToken(value, env = process.env) {
  return hmacHex("refresh", value, env);
}

function requirePrisma(prisma) {
  if (!prisma?.$transaction || !prisma?.$queryRaw) {
    throw new Mt01bAuthError("Cliente Prisma inválido.", { code: "MT01B_DATABASE_INVALID", status: 500 });
  }
}

function elapsed(startedAt) {
  return Number((performance.now() - startedAt).toFixed(2));
}

function emitTiming(observer, timing) {
  if (typeof observer !== "function") return;
  try { observer(Object.freeze({ ...timing })); } catch { /* La telemetría nunca altera autenticación. */ }
}

function retryAfterMs(policy) {
  return policy.refreshRetryBaseMs + (policy.refreshRetryJitterMs > 0 ? randomInt(policy.refreshRetryJitterMs + 1) : 0);
}

export async function configureAuthTransaction(tx, policy) {
  await tx.$queryRaw(Prisma.sql`
    SELECT
      set_config('lock_timeout', ${`${policy.lockTimeoutMs}ms`}, true),
      set_config('statement_timeout', ${`${policy.statementTimeoutMs}ms`}, true)
  `);
}

export async function trySessionFamilyLock(tx, tenantId, sessionId) {
  const namespace = `${tenantId}:mt01b-auth-session:${sessionId}`;
  const rows = await tx.$queryRaw(Prisma.sql`
    SELECT pg_try_advisory_xact_lock(hashtextextended(${namespace}, 0)) AS "acquired"
  `);
  return rows[0]?.acquired === true;
}

export function controlledAuthPersistenceError(error, policy) {
  if (error instanceof Mt01bAuthError) return error;
  const code = String(error?.code || "");
  const detail = `${code}\n${String(error?.message || "")}`.toLowerCase();
  if (detail.includes("lock timeout") || detail.includes("55p03")) {
    return new Mt01bAuthError("La sesión está siendo actualizada por otra operación.", {
      code: "MT01B_AUTH_LOCK_TIMEOUT",
      status: 409,
      recoverable: true,
      retryAfterMs: retryAfterMs(policy),
      cause: error,
    });
  }
  if (detail.includes("statement timeout") || detail.includes("57014") || detail.includes("canceling statement")) {
    return new Mt01bAuthError("La operación de autenticación excedió su tiempo seguro.", {
      code: "MT01B_AUTH_STATEMENT_TIMEOUT",
      status: 503,
      recoverable: true,
      retryAfterMs: retryAfterMs(policy),
      cause: error,
    });
  }
  if (["P1001", "P1002", "P1017", "P2024", "P2028"].includes(code) ||
      /connection|server has closed|socket|econn|transaction.*closed/.test(detail)) {
    return new Mt01bAuthError("La persistencia de autenticación no está disponible temporalmente.", {
      code: "MT01B_AUTH_DATABASE_UNAVAILABLE",
      status: 503,
      recoverable: true,
      retryAfterMs: retryAfterMs(policy),
      cause: error,
    });
  }
  return error;
}

function throwOutcome(outcome) {
  if (outcome.kind === "IN_PROGRESS") {
    throw new Mt01bAuthError("Otra rotación de esta sesión está en curso.", {
      code: "MT01B_REFRESH_IN_PROGRESS",
      status: 409,
      recoverable: true,
      retryAfterMs: outcome.retryAfterMs,
    });
  }
  if (outcome.kind === "RECOVERABLE_CONFLICT") {
    throw new Mt01bAuthError("El refresh ya fue rotado por otra solicitud legítima.", {
      code: "MT01B_REFRESH_ALREADY_ROTATED",
      status: 409,
      recoverable: true,
      retryAfterMs: outcome.retryAfterMs,
    });
  }
  if (outcome.kind === "COMPROMISED") {
    throw new Mt01bAuthError("Se detectó reutilización del refresh token. Inicie sesión nuevamente.", {
      code: "MT01B_REFRESH_REUSE_DETECTED",
      status: 401,
    });
  }
  if (outcome.kind === "SESSION_INVALID") {
    throw new Mt01bAuthError("La sesión empresarial ya no es válida.", {
      code: outcome.code || "MT01B_SESSION_INVALID",
      status: 401,
    });
  }
}

export async function createMembershipAuthSession(prisma, identity, { req, env = process.env, now = new Date() } = {}) {
  requirePrisma(prisma);
  const policy = assertMt01bV2Enabled(env, now);
  const fingerprintHash = deriveClientFingerprint(req, env);
  const refresh = opaqueRefreshToken();
  const refreshHash = hashRefreshToken(refresh.value, env);
  const sessionId = randomUUID();
  const sessionExpiresAt = new Date(now.getTime() + policy.sessionTtlSeconds * 1_000);
  const refreshExpiresAt = new Date(Math.min(
    sessionExpiresAt.getTime(),
    now.getTime() + policy.refreshTokenTtlSeconds * 1_000,
  ));

  const committed = await prisma.$transaction(async (tx) => {
    await configureAuthTransaction(tx, policy);
    const rows = await tx.$queryRaw(Prisma.sql`
      SELECT tm."id", tm."tenant_id", tm."user_id", tm."role"::text AS "membership_role",
             tm."status"::text AS "membership_status", tm."authorization_version",
             u."status" AS "user_status", t."status"::text AS "tenant_status"
      FROM "osi"."tenant_memberships" tm
      JOIN "osi"."osi_users" u ON u."id" = tm."user_id"
      JOIN "osi"."tenants" t ON t."id" = tm."tenant_id"
      WHERE tm."tenant_id" = ${String(identity?.tenantId || "")}
        AND tm."id" = ${String(identity?.membershipId || "")}
        AND tm."user_id" = ${String(identity?.userId || "")}
      FOR SHARE OF tm, u, t
    `);
    const member = rows[0];
    if (!member || upper(member.membership_status) !== "ACTIVE" || upper(member.tenant_status) !== "ACTIVE" || !activeGlobalUser(member.user_status)) {
      throw new Mt01bAuthError("Identidad empresarial inactiva o incompatible.", {
        code: "MT01B_IDENTITY_INACTIVE",
        status: 403,
      });
    }

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "osi"."auth_sessions" (
        "id", "tenant_id", "membership_id", "user_id", "status",
        "authorization_version_snapshot", "current_refresh_version", "fingerprint_hash", "expires_at", "updated_at"
      ) VALUES (
        ${sessionId}, ${member.tenant_id}, ${member.id}, ${member.user_id}, 'ACTIVE',
        ${Number(member.authorization_version)}, 0, ${fingerprintHash}, ${sessionExpiresAt}, ${now}
      )
    `);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "osi"."auth_refresh_tokens" (
        "id", "tenant_id", "session_id", "version", "token_hash", "fingerprint_hash", "status", "expires_at"
      ) VALUES (
        ${refresh.id}, ${member.tenant_id}, ${sessionId}, 0, ${refreshHash}, ${fingerprintHash}, 'ACTIVE', ${refreshExpiresAt}
      )
    `);
    return {
      sessionId,
      tenantId: member.tenant_id,
      membershipId: member.id,
      userId: member.user_id,
      role: String(member.membership_role),
      authorizationVersion: Number(member.authorization_version),
    };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    maxWait: policy.transactionMaxWaitMs,
    timeout: policy.transactionTimeoutMs,
  });

  return {
    identity: committed,
    accessToken: signMembershipAccessToken(committed, { env }),
    refreshToken: refresh.value,
    refreshMaxAgeSeconds: Math.max(1, Math.floor((refreshExpiresAt.getTime() - now.getTime()) / 1_000)),
  };
}

async function compromiseFamily(tx, session, token, reason, now) {
  await tx.$executeRaw(Prisma.sql`
    UPDATE "osi"."auth_sessions"
    SET "status" = 'COMPROMISED', "compromised_at" = ${now}, "revocation_reason" = ${reason}, "updated_at" = ${now}
    WHERE "tenant_id" = ${session.tenant_id} AND "id" = ${session.id}
  `);
  await tx.$executeRaw(Prisma.sql`
    UPDATE "osi"."auth_refresh_tokens"
    SET "status" = 'COMPROMISED', "revoked_at" = COALESCE("revoked_at", ${now}),
        "reuse_detected_at" = CASE WHEN "id" = ${token.id} THEN ${now} ELSE "reuse_detected_at" END
    WHERE "tenant_id" = ${session.tenant_id} AND "session_id" = ${session.id}
      AND "status" IN ('ACTIVE', 'ROTATED')
  `);
}

async function invalidateFamily(tx, session, code, now) {
  await tx.$executeRaw(Prisma.sql`
    UPDATE "osi"."auth_sessions"
    SET "status" = 'REVOKED', "revoked_at" = ${now}, "revocation_reason" = ${code}, "updated_at" = ${now}
    WHERE "tenant_id" = ${session.tenant_id} AND "id" = ${session.id} AND "status" = 'ACTIVE'
  `);
  await tx.$executeRaw(Prisma.sql`
    UPDATE "osi"."auth_refresh_tokens"
    SET "status" = 'REVOKED', "revoked_at" = COALESCE("revoked_at", ${now})
    WHERE "tenant_id" = ${session.tenant_id} AND "session_id" = ${session.id} AND "status" = 'ACTIVE'
  `);
}

export async function rotateMembershipRefreshToken(prisma, rawToken, {
  req,
  env = process.env,
  now = new Date(),
  timingObserver,
  auditWriter = appendCommercialAudit,
  accessTokenSigner = signMembershipAccessToken,
} = {}) {
  requirePrisma(prisma);
  const totalStartedAt = performance.now();
  const timing = {
    outcome: "ERROR",
    locatorRoundTripMs: 0,
    transactionAcquireMs: 0,
    advisoryLockMs: 0,
    queryAndAuditMs: 0,
    auditMs: 0,
    commitRoundTripMs: 0,
    totalMs: 0,
  };
  const policy = assertMt01bV2Enabled(env, now);
  const parsed = parseRefreshToken(rawToken);
  const suppliedHash = hashRefreshToken(rawToken, env);
  const fingerprintHash = deriveClientFingerprint(req, env);

  const locatorStartedAt = performance.now();
  const locator = await prisma.$queryRaw(Prisma.sql`
    SELECT "tenant_id", "session_id" FROM "osi"."auth_refresh_tokens" WHERE "id" = ${parsed.id} LIMIT 1
  `);
  timing.locatorRoundTripMs = elapsed(locatorStartedAt);
  if (!locator[0]) {
    timing.outcome = "INVALID";
    timing.totalMs = elapsed(totalStartedAt);
    emitTiming(timingObserver, timing);
    throw new Mt01bAuthError("Refresh token inválido.", { code: "MT01B_REFRESH_INVALID" });
  }

  const nextRefresh = opaqueRefreshToken();
  const nextHash = hashRefreshToken(nextRefresh.value, env);
  const transactionRequestedAt = performance.now();
  let callbackCompletedAt = transactionRequestedAt;
  let outcome;
  try {
    outcome = await prisma.$transaction(async (tx) => {
    timing.transactionAcquireMs = elapsed(transactionRequestedAt);
    await configureAuthTransaction(tx, policy);
    const advisoryStartedAt = performance.now();
    const acquired = await trySessionFamilyLock(tx, locator[0].tenant_id, locator[0].session_id);
    timing.advisoryLockMs = elapsed(advisoryStartedAt);
    if (!acquired) {
      timing.outcome = "IN_PROGRESS";
      callbackCompletedAt = performance.now();
      return { kind: "IN_PROGRESS", retryAfterMs: retryAfterMs(policy) };
    }

    const workStartedAt = performance.now();
    try {
      // Toda lectura autoritativa ocurre después del advisory lock. Una colisión
      // sólo produce un 409 adicional; tenant, sesión y token nunca se mezclan.
      const sessions = await tx.$queryRaw(Prisma.sql`
      SELECT s.*, tm."role"::text AS "membership_role", tm."status"::text AS "membership_status",
             tm."authorization_version" AS "membership_authorization_version",
             u."status" AS "user_status", t."status"::text AS "tenant_status"
      FROM "osi"."auth_sessions" s
      JOIN "osi"."tenant_memberships" tm
        ON tm."tenant_id" = s."tenant_id" AND tm."id" = s."membership_id" AND tm."user_id" = s."user_id"
      JOIN "osi"."osi_users" u ON u."id" = s."user_id"
      JOIN "osi"."tenants" t ON t."id" = s."tenant_id"
      WHERE s."tenant_id" = ${locator[0].tenant_id} AND s."id" = ${locator[0].session_id}
      FOR UPDATE OF s
    `);
      const session = sessions[0];
      if (!session) return { kind: "SESSION_INVALID" };

      const tokens = await tx.$queryRaw(Prisma.sql`
      SELECT * FROM "osi"."auth_refresh_tokens"
      WHERE "tenant_id" = ${session.tenant_id} AND "session_id" = ${session.id} AND "id" = ${parsed.id}
      FOR UPDATE
    `);
      const token = tokens[0];
      if (!token || !sameHash(token.token_hash, suppliedHash)) {
        return { kind: "SESSION_INVALID", code: "MT01B_REFRESH_INVALID" };
      }

      if (upper(token.status) === "ROTATED") {
      const age = now.getTime() - new Date(token.rotated_at).getTime();
      if (sameHash(token.fingerprint_hash, fingerprintHash) && age >= 0 && age <= policy.refreshConcurrencyToleranceMs) {
        timing.outcome = "ALREADY_ROTATED";
        return { kind: "RECOVERABLE_CONFLICT", retryAfterMs: retryAfterMs(policy) };
      }
      await compromiseFamily(tx, session, token, "REFRESH_TOKEN_REUSE", now);
      return { kind: "COMPROMISED" };
      }
      if (upper(session.status) !== "ACTIVE" || upper(token.status) !== "ACTIVE") {
        return { kind: "SESSION_INVALID" };
      }
      if (!sameHash(session.fingerprint_hash, fingerprintHash) || !sameHash(token.fingerprint_hash, fingerprintHash)) {
      await compromiseFamily(tx, session, token, "REFRESH_FINGERPRINT_MISMATCH", now);
      return { kind: "COMPROMISED" };
      }
      if (new Date(session.expires_at) <= now || new Date(token.expires_at) <= now) {
      await invalidateFamily(tx, session, "SESSION_EXPIRED", now);
      return { kind: "SESSION_INVALID", code: "MT01B_SESSION_EXPIRED" };
      }
      if (upper(session.membership_status) !== "ACTIVE" || upper(session.tenant_status) !== "ACTIVE" || !activeGlobalUser(session.user_status) ||
        Number(session.authorization_version_snapshot) !== Number(session.membership_authorization_version)) {
      await invalidateFamily(tx, session, "AUTHORIZATION_CHANGED", now);
      return { kind: "SESSION_INVALID", code: "MT01B_AUTHORIZATION_CHANGED" };
      }
      if (Number(token.version) !== Number(session.current_refresh_version)) {
      await compromiseFamily(tx, session, token, "REFRESH_VERSION_MISMATCH", now);
      return { kind: "COMPROMISED" };
      }

      const nextVersion = Number(session.current_refresh_version) + 1;
      const nextExpiresAt = new Date(Math.min(
      new Date(session.expires_at).getTime(),
      now.getTime() + policy.refreshTokenTtlSeconds * 1_000,
      ));

    // Orden obligatorio por el índice parcial: el ACTIVE anterior se rota antes de insertar el nuevo.
      await tx.$executeRaw(Prisma.sql`
      UPDATE "osi"."auth_refresh_tokens"
      SET "status" = 'ROTATED', "rotated_at" = ${now}
      WHERE "tenant_id" = ${session.tenant_id} AND "session_id" = ${session.id}
        AND "id" = ${token.id} AND "status" = 'ACTIVE'
    `);
      await tx.$executeRaw(Prisma.sql`
      INSERT INTO "osi"."auth_refresh_tokens" (
        "id", "tenant_id", "session_id", "version", "token_hash", "fingerprint_hash", "status", "expires_at"
      ) VALUES (
        ${nextRefresh.id}, ${session.tenant_id}, ${session.id}, ${nextVersion}, ${nextHash}, ${fingerprintHash}, 'ACTIVE', ${nextExpiresAt}
      )
    `);
      await tx.$executeRaw(Prisma.sql`
      UPDATE "osi"."auth_refresh_tokens" SET "replaced_by_token_id" = ${nextRefresh.id}
      WHERE "tenant_id" = ${session.tenant_id} AND "session_id" = ${session.id} AND "id" = ${token.id}
    `);
      await tx.$executeRaw(Prisma.sql`
      UPDATE "osi"."auth_sessions"
      SET "current_refresh_version" = ${nextVersion}, "last_refreshed_at" = ${now}, "updated_at" = ${now}
      WHERE "tenant_id" = ${session.tenant_id} AND "id" = ${session.id}
    `);

      const auditStartedAt = performance.now();
      await auditWriter(tx, {
      tenantId: session.tenant_id,
      actorKind: "MEMBERSHIP",
      actorMembershipId: session.membership_id,
    }, {
      action: "AUTH_SESSION_REFRESH_ROTATED",
      entity: "AUTH_SESSION",
      entityId: session.id,
      source: "MT01B_AUTH",
      requestId: parsed.id,
      correlationId: parsed.id,
      critical: true,
      beforeJson: { status: session.status, refreshVersion: Number(session.current_refresh_version) },
      afterJson: { status: session.status, refreshVersion: nextVersion },
      metadataJson: { concurrencyControl: "PG_TRY_ADVISORY_XACT_LOCK" },
    });
      timing.auditMs = elapsed(auditStartedAt);
      timing.outcome = "ROTATED";

      return {
        kind: "ROTATED",
        identity: identityFromRow(session),
        refreshExpiresAt: nextExpiresAt,
      };
    } finally {
      timing.queryAndAuditMs = elapsed(workStartedAt);
      callbackCompletedAt = performance.now();
    }
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    maxWait: policy.transactionMaxWaitMs,
    timeout: policy.transactionTimeoutMs,
  });
    timing.commitRoundTripMs = elapsed(callbackCompletedAt);
  } catch (error) {
    timing.totalMs = elapsed(totalStartedAt);
    emitTiming(timingObserver, timing);
    throw controlledAuthPersistenceError(error, policy);
  }

  timing.totalMs = elapsed(totalStartedAt);
  emitTiming(timingObserver, timing);
  if (outcome.kind !== "ROTATED") throwOutcome(outcome);
  return {
    identity: outcome.identity,
    accessToken: accessTokenSigner(outcome.identity, { env }),
    refreshToken: nextRefresh.value,
    refreshMaxAgeSeconds: Math.max(1, Math.floor((outcome.refreshExpiresAt.getTime() - now.getTime()) / 1_000)),
  };
}

export async function revokeMembershipAuthSession(prisma, rawToken, { env = process.env, now = new Date(), reason = "LOGOUT" } = {}) {
  requirePrisma(prisma);
  const policy = assertMt01bV2Enabled(env, now);
  const parsed = parseRefreshToken(rawToken);
  const suppliedHash = hashRefreshToken(rawToken, env);
  const locator = await prisma.$queryRaw(Prisma.sql`
    SELECT "tenant_id", "session_id" FROM "osi"."auth_refresh_tokens" WHERE "id" = ${parsed.id} LIMIT 1
  `);
  if (!locator[0]) return { revoked: false };
  try {
    return await prisma.$transaction(async (tx) => {
    await configureAuthTransaction(tx, policy);
    const acquired = await trySessionFamilyLock(tx, locator[0].tenant_id, locator[0].session_id);
    if (!acquired) {
      throw new Mt01bAuthError("Otra operación de esta sesión está en curso.", {
        code: "MT01B_SESSION_OPERATION_IN_PROGRESS",
        status: 409,
        recoverable: true,
        retryAfterMs: retryAfterMs(policy),
      });
    }
    const sessions = await tx.$queryRaw(Prisma.sql`
      SELECT * FROM "osi"."auth_sessions"
      WHERE "tenant_id" = ${locator[0].tenant_id} AND "id" = ${locator[0].session_id} FOR UPDATE
    `);
    if (!sessions[0]) return { revoked: false };
    const tokens = await tx.$queryRaw(Prisma.sql`
      SELECT * FROM "osi"."auth_refresh_tokens"
      WHERE "tenant_id" = ${sessions[0].tenant_id} AND "session_id" = ${sessions[0].id} AND "id" = ${parsed.id}
      FOR UPDATE
    `);
    const token = tokens[0];
    if (!token || !sameHash(token.token_hash, suppliedHash)) return { revoked: false };
    await invalidateFamily(tx, sessions[0], reason, now);
    return { revoked: true, sessionId: sessions[0].id };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: policy.transactionMaxWaitMs,
      timeout: policy.transactionTimeoutMs,
    });
  } catch (error) {
    throw controlledAuthPersistenceError(error, policy);
  }
}
