import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import refreshHandler from "../api/auth/refresh.js";
import { prisma as endpointPrisma } from "../api/_lib/db.js";
import { createMembershipAuthSession, revokeMembershipAuthSession, rotateMembershipRefreshToken } from "../api/_lib/authSession.js";
import { createIdentity, createTestPrisma, mockResponse, syntheticRequest } from "./mt-01b1-test-helpers.mjs";

process.env.MT01B_AUTH_MODE = "HYBRID";
process.env.MT01B_TENANT_SWITCH_ENABLED = "false";
process.env.MT01B_LEGACY_TOKEN_ACCEPT_UNTIL = new Date(Date.now() + 24 * 3600 * 1_000).toISOString();
process.env.MT01B_REFRESH_TOKEN_PEPPER = "mt01b-ci-only-refresh-pepper-32-characters-minimum";
process.env.MT01B_ALLOWED_ORIGINS = "http://localhost:5173";

const ROUNDS = Number(process.env.MT01B_RACE_ROUNDS || 50);
const CONCURRENCY = Number(process.env.MT01B_RACE_CONCURRENCY || 20);
const prisma = createTestPrisma();
const results = [];
const timings = [];
const codeCounts = new Map();

function check(name, condition, detail = null) {
  results.push({ name, passed: Boolean(condition), ...(detail ? { detail } : {}) });
  if (!condition) throw new Error(name);
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  return Number(ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * ratio) - 1)].toFixed(2));
}

function metric(values) {
  return { p50: percentile(values, 0.5), p95: percentile(values, 0.95), max: percentile(values, 1) };
}

function countCode(code) {
  codeCounts.set(code, (codeCounts.get(code) || 0) + 1);
}

async function measureRoundTrip(samples = 10) {
  const values = [];
  for (let index = 0; index < samples; index += 1) {
    const started = performance.now();
    await prisma.$queryRawUnsafe("SELECT 1");
    values.push(performance.now() - started);
  }
  return metric(values);
}

async function connectionCount() {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::integer AS count
    FROM pg_stat_activity
    WHERE datname = current_database()
  `);
  return rows[0]?.count || 0;
}

try {
  const identity = await createIdentity(prisma, `race-${randomUUID().slice(0, 6)}`);
  const request = syntheticRequest({ clientId: `race-${randomUUID()}` });
  const networkRoundTrip = await measureRoundTrip();
  const connectionsBefore = await connectionCount();
  let maximumObservedConnections = connectionsBefore;

  for (let round = 1; round <= ROUNDS; round += 1) {
    const now = new Date(Date.now() + round * 10);
    const session = await createMembershipAuthSession(prisma, identity, { req: request, now });
    let monitorActive = true;
    const monitor = (async () => {
      while (monitorActive) {
        maximumObservedConnections = Math.max(maximumObservedConnections, await connectionCount());
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    })();
    const attempts = await Promise.allSettled(Array.from({ length: CONCURRENCY }, () =>
      rotateMembershipRefreshToken(prisma, session.refreshToken, {
        req: request,
        now: new Date(now.getTime() + 1),
        timingObserver: (sample) => timings.push(sample),
      })));
    monitorActive = false;
    await monitor;

    const winners = attempts.filter((item) => item.status === "fulfilled").length;
    const losers = attempts.filter((item) => item.status === "rejected");
    for (const item of losers) countCode(item.reason?.code || "UNKNOWN");
    const recoverable = losers.filter((item) =>
      ["MT01B_REFRESH_IN_PROGRESS", "MT01B_REFRESH_ALREADY_ROTATED"].includes(item.reason?.code) &&
      item.reason?.recoverable === true && Number.isInteger(item.reason?.retryAfterMs));
    const unexpected = losers.filter((item) => !recoverable.includes(item));
    const active = await prisma.authRefreshToken.count({ where: { sessionId: session.identity.sessionId, status: "ACTIVE" } });
    const compromised = await prisma.authSession.count({ where: { id: session.identity.sessionId, status: "COMPROMISED" } });
    const auditRows = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::integer AS count FROM "osi"."commercial_audit_logs" WHERE entity='AUTH_SESSION' AND entity_id=$1`,
      session.identity.sessionId,
    );
    const auditCount = auditRows[0]?.count || 0;
    const passed = winners === 1 && recoverable.length === CONCURRENCY - 1 && unexpected.length === 0 && active === 1 && compromised === 0 && auditCount === 1;
    results.push({ name: `ronda concurrente ${round}`, passed, winners, recoverable: recoverable.length, unexpected: unexpected.length, active, compromised, auditCount });
    if (!passed) throw new Error(`Ronda ${round} no fue determinista`);
  }

  const endpointNow = new Date(Date.now() + 5_000);
  const endpointSession = await createMembershipAuthSession(prisma, identity, { req: request, now: endpointNow });
  const endpointAttempts = await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    const req = syntheticRequest({ clientId: request.headers["x-osi-client-id"], cookie: `__Host-osi_refresh=${endpointSession.refreshToken}` });
    const res = mockResponse();
    await refreshHandler(req, res);
    return res;
  }));
  const endpointWinners = endpointAttempts.filter((res) => res.statusCode === 200);
  const endpointLosers = endpointAttempts.filter((res) => res.statusCode === 409);
  check("endpoint emite una sola cookie", endpointWinners.length === 1 && endpointWinners[0].getHeader("set-cookie"));
  check("perdedores no reciben cookie ni token", endpointLosers.length === CONCURRENCY - 1 && endpointLosers.every((res) => !res.getHeader("set-cookie") && !res.body?.token));
  check("409 expone contrato recuperable acotado", endpointLosers.every((res) =>
    res.body?.recoverable === true && Number.isInteger(res.body?.retryAfterMs) &&
    ["MT01B_REFRESH_IN_PROGRESS", "MT01B_REFRESH_ALREADY_ROTATED"].includes(res.body?.error)));

  const rollbackNow = new Date(Date.now() + 10_000);
  const rollbackSession = await createMembershipAuthSession(prisma, identity, { req: request, now: rollbackNow });
  let auditFailed = false;
  try {
    await rotateMembershipRefreshToken(prisma, rollbackSession.refreshToken, {
      req: request,
      now: new Date(rollbackNow.getTime() + 1),
      auditWriter: async () => { throw new Error("synthetic audit failure"); },
    });
  } catch (error) {
    auditFailed = error?.message === "synthetic audit failure";
  }
  check("falla de auditoría se propaga", auditFailed);
  check("falla de auditoría revierte rotación", await prisma.authRefreshToken.count({ where: { sessionId: rollbackSession.identity.sessionId, status: "ACTIVE" } }) === 1);
  const retryAfterRollback = await rotateMembershipRefreshToken(prisma, rollbackSession.refreshToken, { req: request, now: new Date(rollbackNow.getTime() + 2) });
  check("reintento posterior al rollback tiene éxito", Boolean(retryAfterRollback.refreshToken));
  check("rollback y reintento dejan una auditoría", await prisma.commercialAuditLog.count({ where: { entityId: rollbackSession.identity.sessionId, action: "AUTH_SESSION_REFRESH_ROTATED" } }) === 1);

  const logoutNow = new Date(Date.now() + 15_000);
  const logoutSession = await createMembershipAuthSession(prisma, identity, { req: request, now: logoutNow });
  const simultaneous = await Promise.allSettled([
    rotateMembershipRefreshToken(prisma, logoutSession.refreshToken, { req: request, now: new Date(logoutNow.getTime() + 1) }),
    revokeMembershipAuthSession(prisma, logoutSession.refreshToken, { now: new Date(logoutNow.getTime() + 2) }),
  ]);
  if ((await prisma.authSession.findUnique({ where: { id: logoutSession.identity.sessionId } }))?.status === "ACTIVE") {
    const winningToken = simultaneous[0].status === "fulfilled" ? simultaneous[0].value.refreshToken : logoutSession.refreshToken;
    await revokeMembershipAuthSession(prisma, winningToken, { now: new Date(logoutNow.getTime() + 3) });
  }
  check("logout simultáneo termina sin token ACTIVE", await prisma.authRefreshToken.count({ where: { sessionId: logoutSession.identity.sessionId, status: "ACTIVE" } }) === 0);
  check("logout simultáneo deja sesión revocada", (await prisma.authSession.findUnique({ where: { id: logoutSession.identity.sessionId } }))?.status === "REVOKED");

  const duplicateSessions = await prisma.$queryRawUnsafe(`
    SELECT session_id, COUNT(*)::integer AS count
    FROM "osi"."auth_refresh_tokens" WHERE status = 'ACTIVE'
    GROUP BY session_id HAVING COUNT(*) > 1
  `);
  check("cero sesiones con dos refresh ACTIVE", duplicateSessions.length === 0);
  const duplicateAudits = await prisma.$queryRawUnsafe(`
    SELECT entity_id, request_id, COUNT(*)::integer AS count
    FROM "osi"."commercial_audit_logs"
    WHERE action = 'AUTH_SESSION_REFRESH_ROTATED'
    GROUP BY entity_id, request_id HAVING COUNT(*) > 1
  `);
  check("cero auditorías de rotación duplicadas", duplicateAudits.length === 0);

  const connectionsAfter = await connectionCount();
  const timeoutCount = [...codeCounts.entries()].filter(([code]) => /TIMEOUT|P2028/i.test(code)).reduce((sum, [, count]) => sum + count, 0);
  check("cero timeouts y transacciones agotadas", timeoutCount === 0, { timeoutCount });

  const timingMetrics = Object.fromEntries([
    "locatorRoundTripMs", "transactionAcquireMs", "advisoryLockMs", "queryAndAuditMs", "auditMs", "commitRoundTripMs", "totalMs",
  ].map((field) => [field, metric(timings.map((sample) => Number(sample[field] || 0)))]));
  const timingMetricsByOutcome = Object.fromEntries([...new Set(timings.map((sample) => sample.outcome))].map((outcome) => [
    outcome,
    Object.fromEntries([
      "locatorRoundTripMs", "transactionAcquireMs", "advisoryLockMs", "queryAndAuditMs", "auditMs", "commitRoundTripMs", "totalMs",
    ].map((field) => [field, metric(timings.filter((sample) => sample.outcome === outcome).map((sample) => Number(sample[field] || 0)))])),
  ]));
  process.stdout.write(`${JSON.stringify({
    ok: true,
    passed: results.filter((item) => item.passed).length,
    failed: 0,
    rounds: ROUNDS,
    concurrentRequestsPerRound: CONCURRENCY,
    codeCounts: Object.fromEntries(codeCounts),
    metricsMs: { networkRoundTrip, ...timingMetrics },
    metricsByOutcomeMs: timingMetricsByOutcome,
    connections: { before: connectionsBefore, maximumObserved: maximumObservedConnections, after: connectionsAfter },
    results,
  }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, passed: results.filter((item) => item.passed).length, failed: 1, results, error: { name: error.name, code: error.code, message: error.message, stack: error.stack } }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
  await endpointPrisma.$disconnect();
}
