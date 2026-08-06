import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { Prisma } from "@prisma/client";
import { signAccessToken, verifyMembershipAccessToken } from "../api/_lib/auth.js";
import { resolveAuthContext, resolveLegacyUpgradeIdentity } from "../api/_lib/authContext.js";
import { clearedRefreshCookieValue, refreshCookieValue } from "../api/_lib/authCookies.js";
import { mt01bAllowedOrigins, validateMt01bMutationOrigin } from "../api/_lib/authOrigin.js";
import { resolveMt01bAuthPolicy } from "../api/_lib/authPolicy.js";
import { createMembershipAuthSession, revokeMembershipAuthSession, rotateMembershipRefreshToken } from "../api/_lib/authSession.js";
import { updateMembershipAuthorization } from "../api/_lib/membershipAuthorization.js";
import { createIdentity, createTestPrisma, syntheticRequest } from "./mt-01b1-test-helpers.mjs";

const now = new Date();
process.env.MT01B_AUTH_MODE = "HYBRID";
process.env.MT01B_TENANT_SWITCH_ENABLED = "false";
process.env.MT01B_LEGACY_TOKEN_ACCEPT_UNTIL = new Date(now.getTime() + 24 * 3600 * 1_000).toISOString();
process.env.MT01B_REFRESH_TOKEN_PEPPER = "mt01b-ci-only-refresh-pepper-32-characters-minimum";
process.env.MT01B_ALLOWED_ORIGINS = "http://localhost:5173";

const prisma = createTestPrisma();
const results = [];
function check(name, condition, detail = null) {
  results.push({ name, passed: Boolean(condition), ...(detail ? { detail } : {}) });
  if (!condition) throw new Error(name);
}
async function expectCode(name, operation, code) {
  try {
    await operation();
    check(name, false, "No lanzó error");
  } catch (error) {
    check(name, error?.code === code, `Esperado ${code}; recibido ${error?.code || error?.message}`);
  }
}

try {
  const actor = await createIdentity(prisma, `actor-${randomUUID().slice(0, 6)}`);
  const target = await createIdentity(prisma, `target-${randomUUID().slice(0, 6)}`, { tenantId: actor.tenantId, role: "V", isDefault: false });
  const other = await createIdentity(prisma, `other-${randomUUID().slice(0, 6)}`);
  const request = syntheticRequest();

  check("política HYBRID válida con corte futuro", resolveMt01bAuthPolicy(process.env, now).mode === "HYBRID");
  await expectCode("HYBRID exige fecha absoluta", () => Promise.resolve(resolveMt01bAuthPolicy({ ...process.env, MT01B_LEGACY_TOKEN_ACCEPT_UNTIL: "" }, now)), "MT01B_LEGACY_CUTOFF_REQUIRED");
  await expectCode("fecha legacy no puede superar siete días", () => Promise.resolve(resolveMt01bAuthPolicy({ ...process.env, MT01B_LEGACY_TOKEN_ACCEPT_UNTIL: new Date(now.getTime() + 8 * 24 * 3600 * 1_000).toISOString() }, now)), "MT01B_LEGACY_CUTOFF_INVALID");
  await expectCode("tenant switch permanece bloqueado", () => Promise.resolve(resolveMt01bAuthPolicy({ ...process.env, MT01B_TENANT_SWITCH_ENABLED: "true" }, now)), "MT01B_TENANT_SWITCH_DISABLED");
  await expectCode("maxWait rechaza valores inseguros", () => Promise.resolve(resolveMt01bAuthPolicy({ ...process.env, MT01B_AUTH_TRANSACTION_MAX_WAIT_MS: "6000" }, now)), "MT01B_AUTH_CONFIG_INVALID");
  await expectCode("statement_timeout debe ser menor al timeout transaccional", () => Promise.resolve(resolveMt01bAuthPolicy({ ...process.env, MT01B_AUTH_TRANSACTION_TIMEOUT_MS: "2000", MT01B_AUTH_STATEMENT_TIMEOUT_MS: "2000" }, now)), "MT01B_AUTH_CONFIG_INVALID");
  await expectCode("jitter rechaza valores inseguros", () => Promise.resolve(resolveMt01bAuthPolicy({ ...process.env, MT01B_REFRESH_RETRY_JITTER_MS: "501" }, now)), "MT01B_AUTH_CONFIG_INVALID");

  const created = await createMembershipAuthSession(prisma, actor, { req: request, now });
  const claims = verifyMembershipAccessToken(created.accessToken);
  check("JWT V2 contiene claims obligatorios", claims.ver === 2 && claims.typ === "access" && claims.sub === actor.userId && claims.membershipId === actor.membershipId && claims.tenantId === actor.tenantId && claims.role === "A" && claims.authorizationVersion === 1 && claims.jti && claims.iat && claims.exp);
  const authContext = await resolveAuthContext(syntheticRequest({ authorization: `Bearer ${created.accessToken}` }), { prisma });
  check("AuthContext valida sesión, tenant y membresía", authContext.authType === "V2" && authContext.sessionId === created.identity.sessionId && authContext.tenantId === actor.tenantId);

  const badV2 = jwt.sign({ ver: 2, typ: "access", sub: actor.userId, role: "A" }, process.env.JWT_SECRET || "dev-insecure-secret", { issuer: "osi-plus", audience: "osi-plus-api", expiresIn: 300 });
  await expectCode("V2 incompleto nunca degrada a legacy", () => resolveAuthContext(syntheticRequest({ authorization: `Bearer ${badV2}` }), { prisma }), "MT01B_TOKEN_INVALID");

  const legacy = signAccessToken({ sub: actor.userId, email: `legacy-${actor.userId}@example.invalid`, role: "V" });
  const upgradedIdentity = await resolveLegacyUpgradeIdentity(prisma, legacy, { now });
  check("legacy resuelve rol desde membresía, no desde token", upgradedIdentity.membershipId === actor.membershipId);
  await createIdentity(prisma, `second-${randomUUID().slice(0, 6)}`, { userId: actor.userId, role: "V", isDefault: false });
  await expectCode("múltiples membresías requieren administración", () => resolveLegacyUpgradeIdentity(prisma, legacy, { now }), "MULTIPLE_ACTIVE_MEMBERSHIPS_ADMIN_REQUIRED");

  let crossFkRejected = false;
  const invalidSessionId = randomUUID();
  try {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "osi"."auth_sessions" (
        "id", "tenant_id", "membership_id", "user_id", "authorization_version_snapshot", "fingerprint_hash", "expires_at", "updated_at"
      ) VALUES (${invalidSessionId}, ${actor.tenantId}, ${actor.membershipId}, ${target.userId}, 1, ${"a".repeat(64)}, ${new Date(now.getTime() + 60_000)}, ${now})
    `);
  } catch (error) {
    crossFkRejected = ["P2003", "P2010"].includes(error?.code) || /foreign key|llave foránea|fkey/i.test(String(error?.message || ""));
  }
  check("FK compuesta rechaza usuario/membresía/tenant incompatibles", crossFkRejected && await prisma.authSession.count({ where: { id: invalidSessionId } }) === 0);

  const raceSession = await createMembershipAuthSession(prisma, target, { req: request, now });
  const concurrent = await Promise.allSettled(Array.from({ length: 20 }, () => rotateMembershipRefreshToken(prisma, raceSession.refreshToken, { req: request, now: new Date(now.getTime() + 1_000) })));
  const winners = concurrent.filter((item) => item.status === "fulfilled");
  const recoverable = concurrent.filter((item) => item.status === "rejected" &&
    ["MT01B_REFRESH_IN_PROGRESS", "MT01B_REFRESH_ALREADY_ROTATED"].includes(item.reason?.code) &&
    item.reason?.recoverable === true && Number.isInteger(item.reason?.retryAfterMs));
  check("20 refresh simultáneos producen una sola cadena", winners.length === 1 && recoverable.length === 19, { winners: winners.length, recoverable: recoverable.length });
  const raceTokens = await prisma.authRefreshToken.findMany({ where: { sessionId: raceSession.identity.sessionId } });
  check("rotación conserva un solo token ACTIVE", raceTokens.length === 2 && raceTokens.filter((token) => token.status === "ACTIVE").length === 1 && raceTokens.filter((token) => token.status === "ROTATED").length === 1);
  check("token anterior referencia reemplazo", raceTokens.find((token) => token.status === "ROTATED")?.replacedByTokenId === raceTokens.find((token) => token.status === "ACTIVE")?.id);
  check("concurrencia legítima no compromete familia", (await prisma.authSession.findUnique({ where: { id: raceSession.identity.sessionId } }))?.status === "ACTIVE");
  await expectCode("reutilización dentro de tolerancia es recuperable", () => rotateMembershipRefreshToken(prisma, raceSession.refreshToken, { req: request, now: new Date(now.getTime() + 2_000) }), "MT01B_REFRESH_ALREADY_ROTATED");
  await expectCode("reutilización fuera de tolerancia compromete familia", () => rotateMembershipRefreshToken(prisma, raceSession.refreshToken, { req: request, now: new Date(now.getTime() + 7_000) }), "MT01B_REFRESH_REUSE_DETECTED");
  check("reutilización revoca token activo", await prisma.authRefreshToken.count({ where: { sessionId: raceSession.identity.sessionId, status: "ACTIVE" } }) === 0);
  check("familia queda COMPROMISED", (await prisma.authSession.findUnique({ where: { id: raceSession.identity.sessionId } }))?.status === "COMPROMISED");

  const fingerprintSession = await createMembershipAuthSession(prisma, other, { req: request, now });
  await expectCode("fingerprint incompatible compromete inmediatamente", () => rotateMembershipRefreshToken(prisma, fingerprintSession.refreshToken, { req: syntheticRequest({ clientId: "different-client" }), now: new Date(now.getTime() + 500) }), "MT01B_REFRESH_REUSE_DETECTED");

  const logoutSession = await createMembershipAuthSession(prisma, other, { req: request, now: new Date(now.getTime() + 2_000) });
  const logout = await revokeMembershipAuthSession(prisma, logoutSession.refreshToken, { now: new Date(now.getTime() + 3_000) });
  check("logout revoca familia", logout.revoked && (await prisma.authSession.findUnique({ where: { id: logoutSession.identity.sessionId } }))?.status === "REVOKED");
  check("logout elimina ACTIVE", await prisma.authRefreshToken.count({ where: { sessionId: logoutSession.identity.sessionId, status: "ACTIVE" } }) === 0);

  const targetSession = await createMembershipAuthSession(prisma, target, { req: request, now: new Date(now.getTime() + 4_000) });
  const actorContext = { tenantId: actor.tenantId, membershipId: actor.membershipId, role: "A", permissions: [], deniedPermissions: [] };
  const updated = await updateMembershipAuthorization(prisma, actorContext, {
    membershipId: target.membershipId,
    role: "C",
    grantedPermissions: ["quote:view", "quote:view"],
    deniedPermissions: ["quote:delete"],
    requestId: `membership-update-${randomUUID()}`,
  });
  check("servicio único incrementa authorizationVersion", updated.authorizationVersion === 2 && updated.role === "C");
  check("servicio normaliza permisos", JSON.stringify(updated.grantedPermissions) === JSON.stringify(["quote:view"]));
  check("cambio de autorización revoca sesiones", (await prisma.authSession.findUnique({ where: { id: targetSession.identity.sessionId } }))?.status === "REVOKED");
  await expectCode("access token anterior queda invalidado", () => resolveAuthContext(syntheticRequest({ authorization: `Bearer ${targetSession.accessToken}` }), { prisma }), "MT01B_AUTHORIZATION_INVALID");
  const auditRows = await prisma.$queryRaw(Prisma.sql`
    SELECT COUNT(*)::integer AS "count" FROM "osi"."commercial_audit_logs"
    WHERE "tenant_id" = ${actor.tenantId} AND "entity" = 'TENANT_MEMBERSHIP'
      AND "entity_id" = ${target.membershipId} AND "action" = 'MEMBERSHIP_AUTHORIZATION_CHANGED'
  `);
  check("cambio queda auditado", auditRows[0]?.count === 1);
  await expectCode("acceso cruzado se oculta como 404", () => updateMembershipAuthorization(prisma, actorContext, { membershipId: other.membershipId, role: "V", requestId: `cross-${randomUUID()}` }), "MT01B_MEMBERSHIP_NOT_FOUND");

  const rollbackRequestId = `rollback-${randomUUID()}`;
  const firstRollbackBase = await updateMembershipAuthorization(prisma, actorContext, { membershipId: target.membershipId, role: "V", requestId: rollbackRequestId });
  await expectCode("fallo de auditoría crítica revierte mutación", () => updateMembershipAuthorization(prisma, actorContext, { membershipId: target.membershipId, role: "K", requestId: rollbackRequestId }), "AUDIT_IDEMPOTENCY_CONFLICT");
  const afterRollback = await prisma.tenantMembership.findUnique({ where: { id: target.membershipId } });
  check("rollback conserva rol y versión previos", afterRollback.role === "V" && afterRollback.authorizationVersion === firstRollbackBase.authorizationVersion);

  const cookie = refreshCookieValue("token.synthetic", 60);
  const cleared = clearedRefreshCookieValue();
  check("cookie refresh usa atributos exactos seguros", cookie.includes("__Host-osi_refresh=") && cookie.includes("Path=/") && cookie.includes("HttpOnly") && cookie.includes("Secure") && cookie.includes("SameSite=Lax") && !cookie.includes("Domain="));
  check("borrado repite atributos seguros", cleared.includes("Max-Age=0") && cleared.includes("Path=/") && cleared.includes("HttpOnly") && cleared.includes("Secure") && cleared.includes("SameSite=Lax") && !cleared.includes("Domain="));
  check("CORS local contiene sólo orígenes explícitos", mt01bAllowedOrigins(process.env).has("http://localhost:5173") && !mt01bAllowedOrigins(process.env).has("*"));
  check("Origin válido aceptado", validateMt01bMutationOrigin(request) === "http://localhost:5173");
  await expectCode("Origin ausente rechazado", () => Promise.resolve(validateMt01bMutationOrigin({ headers: {} })), "MT01B_ORIGIN_FORBIDDEN");

  process.stdout.write(`${JSON.stringify({ ok: true, passed: results.length, failed: 0, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, passed: results.filter((item) => item.passed).length, failed: 1, results, error: { name: error.name, code: error.code, message: error.message, stack: error.stack } }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
