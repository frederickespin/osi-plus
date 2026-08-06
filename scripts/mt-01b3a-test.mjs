import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { signAccessToken } from "../api/_lib/auth.js";
import { resolveAuthContext } from "../api/_lib/authContext.js";
import { requireAuthContext, requirePermission, requireRole, requireTenantResource } from "../api/_lib/authContextMiddleware.js";
import { resolveMt01bAuthPolicy } from "../api/_lib/authPolicy.js";
import meHandler from "../api/auth/me.js";
import { PERMS } from "../api/_lib/rbac.js";
import { createMembershipAuthSession } from "../api/_lib/authSession.js";
import { createIdentity, createTestPrisma, mockResponse, syntheticRequest } from "./mt-01b1-test-helpers.mjs";

const now = new Date();
process.env.MT01B_AUTH_MODE = "HYBRID";
process.env.MT01B_TENANT_SWITCH_ENABLED = "false";
process.env.MT01B_LEGACY_TOKEN_ACCEPT_UNTIL = new Date(now.getTime() + 24 * 3600_000).toISOString();
process.env.MT01B_REFRESH_TOKEN_PEPPER = "mt01b3a-ci-refresh-pepper-with-at-least-32-characters";
process.env.MT01B_ALLOWED_ORIGINS = "http://localhost:5173";

const prisma = createTestPrisma();
const results = [];
function check(name, condition, detail) {
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
async function identityWithSession(suffix, options = {}) {
  const identity = await createIdentity(prisma, `${suffix}-${randomUUID().slice(0, 6)}`, options);
  const session = await createMembershipAuthSession(prisma, identity, { req: syntheticRequest(), now });
  return { identity, session };
}
function bearer(accessToken, extra = {}) {
  return {
    ...syntheticRequest({ authorization: `Bearer ${accessToken}` }),
    method: "GET",
    query: extra.query || {},
    body: extra.body || {},
    headers: { ...syntheticRequest({ authorization: `Bearer ${accessToken}` }).headers, ...(extra.headers || {}) },
  };
}

try {
  const valid = await identityWithSession("valid", { role: "V" });
  const validRequest = bearer(valid.session.accessToken);
  const context = await resolveAuthContext(validRequest, { prisma, now });
  check("V2 válido resuelve identidad completa", context.authType === "V2" && context.userId === valid.identity.userId && context.tenantId === valid.identity.tenantId && context.membershipId === valid.identity.membershipId && context.sessionId === valid.session.identity.sessionId);
  check("contexto y permisos son inmutables", Object.isFrozen(context) && Object.isFrozen(context.effectivePermissions));
  check("rol y permisos base proceden de membership", context.role === "V" && context.effectivePermissions.includes(PERMS.CLIENTS_VIEW));

  const revoked = await identityWithSession("revoked");
  await prisma.authSession.update({ where: { id: revoked.session.identity.sessionId }, data: { status: "REVOKED", revokedAt: now } });
  await expectCode("sesión revocada rechazada", () => resolveAuthContext(bearer(revoked.session.accessToken), { prisma, now }), "MT01B_AUTHORIZATION_INVALID");

  const compromised = await identityWithSession("compromised");
  await prisma.authSession.update({ where: { id: compromised.session.identity.sessionId }, data: { status: "COMPROMISED", compromisedAt: now } });
  await expectCode("sesión comprometida rechazada", () => resolveAuthContext(bearer(compromised.session.accessToken), { prisma, now }), "MT01B_AUTHORIZATION_INVALID");

  const inactiveUser = await identityWithSession("inactive-user");
  await prisma.user.update({ where: { id: inactiveUser.identity.userId }, data: { status: "inactive" } });
  await expectCode("usuario inactivo rechazado", () => resolveAuthContext(bearer(inactiveUser.session.accessToken), { prisma, now }), "MT01B_AUTHORIZATION_INVALID");

  const suspendedMembership = await identityWithSession("suspended-member");
  await prisma.tenantMembership.update({ where: { id: suspendedMembership.identity.membershipId }, data: { status: "SUSPENDED" } });
  await expectCode("membresía suspendida rechazada", () => resolveAuthContext(bearer(suspendedMembership.session.accessToken), { prisma, now }), "MT01B_AUTHORIZATION_INVALID");

  const suspendedTenant = await identityWithSession("suspended-tenant");
  await prisma.tenant.update({ where: { id: suspendedTenant.identity.tenantId }, data: { status: "SUSPENDED" } });
  await expectCode("tenant suspendido rechazado", () => resolveAuthContext(bearer(suspendedTenant.session.accessToken), { prisma, now }), "MT01B_AUTHORIZATION_INVALID");

  const stale = await identityWithSession("stale-version");
  await prisma.tenantMembership.update({ where: { id: stale.identity.membershipId }, data: { authorizationVersion: { increment: 1 } } });
  await expectCode("authorizationVersion obsoleto rechazado", () => resolveAuthContext(bearer(stale.session.accessToken), { prisma, now }), "MT01B_AUTHORIZATION_INVALID");

  const changedRole = await identityWithSession("changed-role", { role: "V" });
  await prisma.tenantMembership.update({ where: { id: changedRole.identity.membershipId }, data: { role: "K", authorizationVersion: { increment: 1 } } });
  await expectCode("rol modificado invalida token anterior", () => resolveAuthContext(bearer(changedRole.session.accessToken), { prisma, now }), "MT01B_AUTHORIZATION_INVALID");

  const permissionsIdentity = await createIdentity(prisma, `permissions-${randomUUID().slice(0, 6)}`, { role: "V" });
  await prisma.tenantMembership.update({ where: { id: permissionsIdentity.membershipId }, data: { grantedPermissions: ["quote:special"], deniedPermissions: [PERMS.CLIENTS_VIEW] } });
  const permissionsSession = await createMembershipAuthSession(prisma, permissionsIdentity, { req: syntheticRequest(), now });
  const permissionsContext = await resolveAuthContext(bearer(permissionsSession.accessToken), { prisma, now });
  check("grants se agregan y denies prevalecen", permissionsContext.effectivePermissions.includes("quote:special") && !permissionsContext.effectivePermissions.includes(PERMS.CLIENTS_VIEW));

  const forged = await resolveAuthContext(bearer(permissionsSession.accessToken, {
    headers: { "x-osi-role": "A", "x-osi-userid": valid.identity.userId },
    body: { tenantId: valid.identity.tenantId, membershipId: valid.identity.membershipId, role: "A" },
    query: { tenantId: valid.identity.tenantId },
  }), { prisma, now });
  check("headers, body y query falsificados se ignoran", forged.role === "V" && forged.userId === permissionsIdentity.userId && forged.tenantId === permissionsIdentity.tenantId);

  let crossFkRejected = false;
  try {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "osi"."auth_sessions" ("id", "tenant_id", "membership_id", "user_id", "authorization_version_snapshot", "fingerprint_hash", "expires_at", "updated_at")
      VALUES (${randomUUID()}, ${valid.identity.tenantId}, ${valid.identity.membershipId}, ${permissionsIdentity.userId}, 1, ${"b".repeat(64)}, ${new Date(now.getTime() + 60_000)}, ${now})
    `);
  } catch (error) {
    crossFkRejected = ["P2003", "P2010"].includes(error?.code) || /foreign key|fkey/i.test(String(error?.message || ""));
  }
  check("FK compuesta impide actor cruzado", crossFkRejected);

  const otherTenant = await createIdentity(prisma, `other-tenant-${randomUUID().slice(0, 6)}`);
  const tenantReq = bearer(valid.session.accessToken);
  const tenantRes = mockResponse();
  const tenantResult = await requireTenantResource(tenantReq, tenantRes, otherTenant.tenantId, { prisma, now });
  check("recurso de otro tenant devuelve 404", tenantResult === null && tenantRes.statusCode === 404 && tenantRes.body?.error === "MT01B_RESOURCE_NOT_FOUND");

  const roleReq = bearer(valid.session.accessToken);
  const roleRes = mockResponse();
  check("requireRole usa rol membership", await requireRole(roleReq, roleRes, ["V"], { prisma, now }) !== null);
  const deniedReq = bearer(permissionsSession.accessToken);
  const deniedRes = mockResponse();
  check("requirePermission aplica denied", await requirePermission(deniedReq, deniedRes, PERMS.CLIENTS_VIEW, { prisma, now }) === null && deniedRes.statusCode === 403);
  const anonymousRes = mockResponse();
  check("autenticación ausente devuelve 401 sanitizado", await requireAuthContext({ headers: {} }, anonymousRes, { prisma, now }) === null && anonymousRes.statusCode === 401 && !JSON.stringify(anonymousRes.body).includes("sql"));

  const legacyToken = signAccessToken({ sub: valid.identity.userId, email: "legacy@example.invalid", role: "V" });
  const legacyContext = await resolveAuthContext(bearer(legacyToken), { prisma, env: { ...process.env, MT01B_AUTH_MODE: "LEGACY" }, now });
  check("LEGACY no exige tenant ni membership", legacyContext.authType === "LEGACY" && legacyContext.userId === valid.identity.userId && legacyContext.tenantId === null && legacyContext.membershipId === null && legacyContext.role === "V");

  const previousMode = process.env.MT01B_AUTH_MODE;
  process.env.MT01B_AUTH_MODE = "LEGACY";
  const meReq = bearer(legacyToken);
  const meRes = mockResponse();
  await meHandler(meReq, meRes);
  const missingMeRes = mockResponse();
  await meHandler({ method: "GET", headers: {} }, missingMeRes);
  process.env.MT01B_AUTH_MODE = previousMode;
  check("/auth/me LEGACY conserva forma exacta", meRes.statusCode === 200 && JSON.stringify(Object.keys(meRes.body).sort()) === JSON.stringify(["ok", "user"]) && JSON.stringify(Object.keys(meRes.body.user).sort()) === JSON.stringify(["code", "department", "email", "id", "joinDate", "name", "phone", "points", "rating", "role", "status"]));
  check("/auth/me LEGACY conserva error 401 exacto", missingMeRes.statusCode === 401 && JSON.stringify(missingMeRes.body) === JSON.stringify({ ok: false, error: "Unauthorized" }));

  const meV2Req = bearer(valid.session.accessToken);
  const meV2Res = mockResponse();
  await meHandler(meV2Req, meV2Res);
  check("/auth/me V2 usa backend empresarial", meV2Res.statusCode === 200 && meV2Res.body?.tenant?.id === valid.identity.tenantId && meV2Res.body?.membership?.id === valid.identity.membershipId && meV2Res.body?.membership?.role === "V" && meV2Res.body?.sessionId === valid.session.identity.sessionId);

  await expectCode("tenant switch permanece desactivado", () => Promise.resolve(resolveMt01bAuthPolicy({ ...process.env, MT01B_TENANT_SWITCH_ENABLED: "true" }, now)), "MT01B_TENANT_SWITCH_DISABLED");

  const queryPrisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL, log: [{ emit: "event", level: "query" }] });
  let queryCount = 0;
  queryPrisma.$on("query", () => { queryCount += 1; });
  const durations = [];
  for (let index = 0; index < 30; index += 1) {
    const started = performance.now();
    await resolveAuthContext(validRequest, { prisma: queryPrisma, now });
    durations.push(performance.now() - started);
  }
  await queryPrisma.$disconnect();
  durations.sort((a, b) => a - b);
  const metrics = {
    samples: durations.length,
    queries: queryCount,
    averageMs: Number((durations.reduce((sum, value) => sum + value, 0) / durations.length).toFixed(2)),
    p95Ms: Number(durations[Math.ceil(durations.length * 0.95) - 1].toFixed(2)),
    maxMs: Number(durations.at(-1).toFixed(2)),
  };
  check("resolución usa un round-trip por contexto", queryCount === durations.length, metrics);

  process.stdout.write(`${JSON.stringify({ ok: true, passed: results.length, failed: 0, metrics, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, passed: results.filter((item) => item.passed).length, failed: 1, results, error: { name: error.name, code: error.code, message: error.message, stack: error.stack } }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
