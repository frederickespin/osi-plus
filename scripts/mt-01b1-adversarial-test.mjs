import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  createMembershipAuthSession,
  controlledAuthPersistenceError,
  revokeMembershipAuthSession,
  rotateMembershipRefreshToken,
} from "../api/_lib/authSession.js";
import { withMt01bAuthHeaders } from "../api/_lib/authOrigin.js";
import { resolveMt01bAuthPolicy } from "../api/_lib/authPolicy.js";
import { updateMembershipAuthorization } from "../api/_lib/membershipAuthorization.js";
import { createIdentity, createTestPrisma, mockResponse, syntheticRequest } from "./mt-01b1-test-helpers.mjs";

process.env.MT01B_AUTH_MODE = "HYBRID";
process.env.MT01B_TENANT_SWITCH_ENABLED = "false";
process.env.MT01B_LEGACY_TOKEN_ACCEPT_UNTIL = new Date(Date.now() + 24 * 3600 * 1_000).toISOString();
process.env.MT01B_REFRESH_TOKEN_PEPPER = "mt01b-ci-only-refresh-pepper-32-characters-minimum";
process.env.MT01B_ALLOWED_ORIGINS = "http://localhost:5173";

const prisma = createTestPrisma();
const control = createTestPrisma();
const request = syntheticRequest({ clientId: `adversarial-${randomUUID()}` });
const results = [];

function check(name, condition, detail = null) {
  results.push({ name, passed: Boolean(condition), ...(detail ? { detail } : {}) });
  if (!condition) throw new Error(name);
}

async function capture(operation) {
  try { return { ok: true, value: await operation() }; }
  catch (error) { return { ok: false, error }; }
}

async function familyState(sessionId) {
  const session = await prisma.authSession.findUnique({ where: { id: sessionId } });
  const tokens = await prisma.authRefreshToken.findMany({ where: { sessionId }, orderBy: { version: "asc" } });
  return { session, tokens, active: tokens.filter((token) => token.status === "ACTIVE") };
}

function actorContext(identity) {
  return { tenantId: identity.tenantId, membershipId: identity.membershipId, role: "A", permissions: ["membership:update:permissions"], deniedPermissions: [] };
}

async function retryMembershipUpdate(actor, target, input) {
  const result = await capture(() => updateMembershipAuthorization(prisma, actorContext(actor), {
    membershipId: target.membershipId,
    requestId: `retry-${randomUUID()}`,
    ...input,
  }));
  if (!result.ok && result.error?.code === "MT01B_SESSION_OPERATION_IN_PROGRESS") {
    return updateMembershipAuthorization(prisma, actorContext(actor), {
      membershipId: target.membershipId,
      requestId: `retry-final-${randomUUID()}`,
      ...input,
    });
  }
  if (!result.ok) throw result.error;
  return result.value;
}

try {
  const actor = await createIdentity(prisma, `adv-actor-${randomUUID().slice(0, 6)}`);
  await prisma.tenantMembership.update({ where: { id: actor.membershipId }, data: { grantedPermissions: ["membership:update:permissions"] } });
  const target = await createIdentity(prisma, `adv-target-${randomUUID().slice(0, 6)}`, {
    tenantId: actor.tenantId,
    role: "V",
    isDefault: false,
  });

  // Un token ACTIVE y el ROTATED anterior deben competir por la misma familia.
  const sameFamily = await createMembershipAuthSession(prisma, target, { req: request });
  const firstRotation = await rotateMembershipRefreshToken(prisma, sameFamily.refreshToken, { req: request });
  const compatibleRace = await Promise.all([
    capture(() => rotateMembershipRefreshToken(prisma, sameFamily.refreshToken, { req: request })),
    capture(() => rotateMembershipRefreshToken(prisma, firstRotation.refreshToken, { req: request })),
  ]);
  const compatibleState = await familyState(sameFamily.identity.sessionId);
  const compatibleSuccesses = compatibleRace.filter((item) => item.ok).length;
  const compatibleConflicts = compatibleRace.filter((item) => !item.ok && ["MT01B_REFRESH_IN_PROGRESS", "MT01B_REFRESH_ALREADY_ROTATED"].includes(item.error?.code)).length;
  check("ACTIVE y ROTATED anterior comparten exclusión de familia",
    compatibleSuccesses <= 1 && compatibleConflicts >= 1 && compatibleSuccesses + compatibleConflicts === 2 &&
    compatibleState.active.length === 1 && compatibleState.session.status === "ACTIVE");

  const malicious = await createMembershipAuthSession(prisma, target, { req: request });
  const maliciousFirst = await rotateMembershipRefreshToken(prisma, malicious.refreshToken, { req: request });
  const maliciousNow = new Date(Date.now() + 6_000);
  const maliciousRace = await Promise.all([
    capture(() => rotateMembershipRefreshToken(prisma, malicious.refreshToken, { req: request, now: maliciousNow })),
    capture(() => rotateMembershipRefreshToken(prisma, maliciousFirst.refreshToken, { req: request, now: maliciousNow })),
  ]);
  let maliciousRetry = null;
  let maliciousState = await familyState(malicious.identity.sessionId);
  if (maliciousState.session.status === "ACTIVE") {
    maliciousRetry = await capture(() => rotateMembershipRefreshToken(prisma, malicious.refreshToken, {
      req: request,
      now: new Date(maliciousNow.getTime() + 1),
    }));
    maliciousState = await familyState(malicious.identity.sessionId);
  }
  check("refresh válido frente a reutilización maliciosa termina comprometido",
    maliciousState.session.status === "COMPROMISED" && maliciousState.active.length === 0 &&
    [...maliciousRace, maliciousRetry].filter(Boolean).some((item) => !item.ok && ["MT01B_REFRESH_REUSE_DETECTED", "MT01B_SESSION_INVALID"].includes(item.error?.code)));

  // Logout y refresh usan el mismo lock; un conflicto se reintenta con el token vigente.
  const logoutSession = await createMembershipAuthSession(prisma, target, { req: request });
  const logoutRace = await Promise.all([
    capture(() => rotateMembershipRefreshToken(prisma, logoutSession.refreshToken, { req: request })),
    capture(() => revokeMembershipAuthSession(prisma, logoutSession.refreshToken)),
  ]);
  let logoutState = await familyState(logoutSession.identity.sessionId);
  if (logoutState.session.status === "ACTIVE") {
    const refreshWinner = logoutRace.find((item) => item.ok && item.value?.refreshToken);
    const retryToken = refreshWinner?.value.refreshToken || logoutSession.refreshToken;
    await revokeMembershipAuthSession(prisma, retryToken);
    logoutState = await familyState(logoutSession.identity.sessionId);
  }
  check("refresh frente a logout finaliza revocado y sin ACTIVE",
    logoutState.session.status === "REVOKED" && logoutState.active.length === 0 &&
    logoutRace.every((item) => item.ok || ["MT01B_REFRESH_IN_PROGRESS", "MT01B_SESSION_OPERATION_IN_PROGRESS", "MT01B_SESSION_INVALID"].includes(item.error?.code)));

  // Cambios de membresía coordinan todas las sesiones de esa membresía.
  const revocationSession = await createMembershipAuthSession(prisma, target, { req: request });
  const revocationRace = await Promise.all([
    capture(() => rotateMembershipRefreshToken(prisma, revocationSession.refreshToken, { req: request })),
    capture(() => updateMembershipAuthorization(prisma, actorContext(actor), {
      membershipId: target.membershipId,
      status: "SUSPENDED",
      requestId: `suspend-${randomUUID()}`,
    })),
  ]);
  await retryMembershipUpdate(actor, target, { status: "SUSPENDED" });
  const revocationState = await familyState(revocationSession.identity.sessionId);
  check("refresh frente a revocación de membresía no deja sesión activa",
    revocationState.session.status === "REVOKED" && revocationState.active.length === 0 &&
    revocationRace.every((item) => item.ok || ["MT01B_REFRESH_IN_PROGRESS", "MT01B_SESSION_OPERATION_IN_PROGRESS", "MT01B_AUTHORIZATION_CHANGED", "MT01B_SESSION_INVALID"].includes(item.error?.code)));

  await retryMembershipUpdate(actor, target, { status: "ACTIVE" });
  const versionSession = await createMembershipAuthSession(prisma, target, { req: request });
  const versionRace = await Promise.all([
    capture(() => rotateMembershipRefreshToken(prisma, versionSession.refreshToken, { req: request })),
    capture(() => updateMembershipAuthorization(prisma, actorContext(actor), {
      membershipId: target.membershipId,
      role: "C",
      requestId: `version-${randomUUID()}`,
    })),
  ]);
  await retryMembershipUpdate(actor, target, { role: "C" });
  const versionState = await familyState(versionSession.identity.sessionId);
  check("refresh frente a authorizationVersion no deja sesión activa",
    versionState.session.status === "REVOKED" && versionState.active.length === 0 &&
    versionRace.every((item) => item.ok || ["MT01B_REFRESH_IN_PROGRESS", "MT01B_SESSION_OPERATION_IN_PROGRESS", "MT01B_AUTHORIZATION_CHANGED", "MT01B_SESSION_INVALID"].includes(item.error?.code)));

  // Dos sesiones y dos tenants no comparten lock.
  const sessionA = await createMembershipAuthSession(prisma, target, { req: request });
  const sessionB = await createMembershipAuthSession(prisma, target, { req: request });
  const independentSessions = await Promise.all([
    rotateMembershipRefreshToken(prisma, sessionA.refreshToken, { req: request }),
    rotateMembershipRefreshToken(prisma, sessionB.refreshToken, { req: request }),
  ]);
  check("dos sesiones del mismo usuario rotan independientemente",
    independentSessions.length === 2 && (await familyState(sessionA.identity.sessionId)).active.length === 1 &&
    (await familyState(sessionB.identity.sessionId)).active.length === 1);

  const otherTenant = await createIdentity(prisma, `adv-tenant-${randomUUID().slice(0, 6)}`);
  const tenantSessionA = await createMembershipAuthSession(prisma, actor, { req: request });
  const tenantSessionB = await createMembershipAuthSession(prisma, otherTenant, { req: request });
  const tenants = await Promise.all([
    rotateMembershipRefreshToken(prisma, tenantSessionA.refreshToken, { req: request }),
    rotateMembershipRefreshToken(prisma, tenantSessionB.refreshToken, { req: request }),
  ]);
  check("tenants diferentes no interfieren", tenants.length === 2);

  // Forzar lock_timeout mediante un row lock ajeno al advisory lock.
  const lockTimeoutSession = await createMembershipAuthSession(prisma, actor, { req: request });
  let releaseRowLock;
  let rowLocked;
  const rowLockReady = new Promise((resolve) => { rowLocked = resolve; });
  const releaseRow = new Promise((resolve) => { releaseRowLock = resolve; });
  const blocker = control.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "osi"."auth_sessions" WHERE "id" = ${lockTimeoutSession.identity.sessionId} FOR UPDATE`);
    rowLocked();
    await releaseRow;
  }, { timeout: 5_000 });
  await rowLockReady;
  const lockTimeout = await capture(() => rotateMembershipRefreshToken(prisma, lockTimeoutSession.refreshToken, { req: request }));
  releaseRowLock();
  await blocker;
  check("lock_timeout se convierte en conflicto recuperable sanitizado",
    !lockTimeout.ok && lockTimeout.error?.code === "MT01B_AUTH_LOCK_TIMEOUT" && lockTimeout.error?.recoverable === true &&
    !/sql|postgres|database_url|pepper|token_hash/i.test(lockTimeout.error.message));

  // Forzar statement_timeout dentro de auditoría y verificar rollback.
  const statementSession = await createMembershipAuthSession(prisma, actor, { req: request });
  const shortStatementEnv = { ...process.env, MT01B_AUTH_STATEMENT_TIMEOUT_MS: "250" };
  const statementTimeout = await capture(() => rotateMembershipRefreshToken(prisma, statementSession.refreshToken, {
    req: request,
    env: shortStatementEnv,
    auditWriter: async (tx) => { await tx.$queryRawUnsafe("SELECT pg_sleep(1)"); },
  }));
  check("statement_timeout se convierte en indisponibilidad recuperable sanitizada",
    !statementTimeout.ok && statementTimeout.error?.code === "MT01B_AUTH_STATEMENT_TIMEOUT" && statementTimeout.error?.recoverable === true &&
    (await familyState(statementSession.identity.sessionId)).active.length === 1);

  const wrappedError = controlledAuthPersistenceError(Object.assign(
    new Error("statement timeout with internal persistence detail token_hash=[synthetic]"),
    { code: "P2010" },
  ), resolveMt01bAuthPolicy(process.env));
  const wrappedHandler = withMt01bAuthHeaders(async () => { throw wrappedError; });
  const wrappedResponse = mockResponse();
  await wrappedHandler(request, wrappedResponse);
  check("respuesta HTTP temporal conserva código y oculta diagnóstico interno",
    wrappedResponse.statusCode === 503 && wrappedResponse.body?.error === "MT01B_AUTH_STATEMENT_TIMEOUT" &&
    wrappedResponse.body?.recoverable === true && wrappedResponse.body?.message === "Autenticación temporalmente no disponible" &&
    !/postgres|secret|token_hash/i.test(JSON.stringify(wrappedResponse.body)));

  const auditSession = await createMembershipAuthSession(prisma, actor, { req: request });
  const auditFailure = await capture(() => rotateMembershipRefreshToken(prisma, auditSession.refreshToken, {
    req: request,
    auditWriter: async () => { throw new Error("synthetic audit failure"); },
  }));
  check("falla de auditoría revierte totalmente",
    !auditFailure.ok && auditFailure.error.message === "synthetic audit failure" &&
    (await familyState(auditSession.identity.sessionId)).active.length === 1);

  // Cierre real de la conexión backend antes del commit (PostgreSQL local).
  const connectionSession = await createMembershipAuthSession(prisma, actor, { req: request });
  const lostConnection = await capture(() => rotateMembershipRefreshToken(prisma, connectionSession.refreshToken, {
    req: request,
    auditWriter: async (tx) => { await tx.$queryRawUnsafe("SELECT pg_terminate_backend(pg_backend_pid())"); },
  }));
  check("pérdida de conexión antes del commit es recuperable y no filtra detalles",
    !lostConnection.ok && lostConnection.error?.code === "MT01B_AUTH_DATABASE_UNAVAILABLE" && lostConnection.error?.recoverable === true &&
    !/postgres|database_url|pepper|token_hash/i.test(lostConnection.error.message));
  const retryConnection = await rotateMembershipRefreshToken(prisma, connectionSession.refreshToken, { req: request });
  check("reintento después de pérdida de conexión tiene una sola cadena", Boolean(retryConnection.refreshToken) &&
    (await familyState(connectionSession.identity.sessionId)).active.length === 1);

  // La transacción puede confirmar aunque falle la firma posterior. El token
  // anterior sólo produce conflicto recuperable y nunca una segunda cadena.
  const postCommitSession = await createMembershipAuthSession(prisma, actor, { req: request });
  const postCommitFailure = await capture(() => rotateMembershipRefreshToken(prisma, postCommitSession.refreshToken, {
    req: request,
    accessTokenSigner: () => { throw new Error("synthetic post-commit response failure"); },
  }));
  const responseRetry = await capture(() => rotateMembershipRefreshToken(prisma, postCommitSession.refreshToken, { req: request }));
  const postCommitState = await familyState(postCommitSession.identity.sessionId);
  check("fallo post-commit no duplica cadena y el reintento es seguro",
    !postCommitFailure.ok && postCommitFailure.error.message === "synthetic post-commit response failure" &&
    !responseRetry.ok && responseRetry.error?.code === "MT01B_REFRESH_ALREADY_ROTATED" &&
    postCommitState.active.length === 1 && postCommitState.tokens.length === 2);

  const duplicateActive = await prisma.$queryRawUnsafe(`
    SELECT session_id FROM "osi"."auth_refresh_tokens" WHERE status='ACTIVE'
    GROUP BY session_id HAVING COUNT(*) > 1
  `);
  check("ninguna familia termina con dos refresh ACTIVE", duplicateActive.length === 0);

  process.stdout.write(`${JSON.stringify({ ok: true, passed: results.length, failed: 0, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({
    ok: false,
    passed: results.filter((item) => item.passed).length,
    failed: 1,
    results,
    error: { name: error.name, code: error.code, message: error.message, stack: error.stack },
  }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  await Promise.allSettled([prisma.$disconnect(), control.$disconnect()]);
}
