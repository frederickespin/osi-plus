import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
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
const EVIDENCE_SCHEMA = "MT01B_REFRESH_RACE_EVIDENCE_V1";
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

function syntheticRequestId(index) {
  return `refresh-race-request-${String(index + 1).padStart(2, "0")}`;
}

function truncatedDigest(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 12);
}

export function explicitConcurrencyBarrier(expected) {
  let arrivals = 0;
  let release;
  const opened = new Promise((resolvePromise) => { release = resolvePromise; });
  return async function enterBarrier() {
    arrivals += 1;
    if (arrivals === expected) release();
    await opened;
  };
}

export function classifySetCookie(value) {
  const values = value == null ? [] : Array.isArray(value) ? value : [value];
  if (values.length === 0) return "NONE";
  if (values.some((item) => /(?:Max-Age=0|Expires=Thu, 01 Jan 1970)/i.test(String(item)))) return "CLEAR";
  return "AUTH";
}

function responseContainsTokenHeader(headers) {
  return [...headers.keys()].some((name) => /(?:authorization|token)/i.test(name));
}

function responseEvidence(res, { index, requestId, captureId, startOrder, resolveOrder, durationMs }) {
  const functionalResult = res.statusCode === 200 ? "WINNER" : res.statusCode === 409 ? "LOSER" : "UNEXPECTED";
  return {
    requestId,
    requestHash: truncatedDigest(requestId),
    index,
    captureId,
    status: res.statusCode,
    functionalResult,
    cookie: classifySetCookie(res.getHeader("set-cookie")),
    tokenBody: Boolean(res.body?.token || res.body?.accessToken || res.body?.refreshToken),
    tokenHeader: responseContainsTokenHeader(res.headers),
    startOrder,
    resolveOrder,
    durationMs: Number(durationMs.toFixed(3)),
    errorCode: typeof res.body?.error === "string" ? res.body.error.slice(0, 80) : null,
  };
}

function assertion(code, message, passed) {
  return { code, message, passed: Boolean(passed) };
}

export function evaluateEndpointEvidence(requests, database, expectedConcurrency) {
  const winners = requests.filter((item) => item.status === 200);
  const losers = requests.filter((item) => item.status !== 200);
  const conflictLosers = requests.filter((item) => item.status === 409);
  return [
    assertion("MT01B_RACE_WINNER_COUNT", "exactamente una respuesta ganadora 200", winners.length === 1),
    assertion("MT01B_RACE_LOSER_STATUS_COUNT", `exactamente ${expectedConcurrency - 1} respuestas perdedoras 409`, conflictLosers.length === expectedConcurrency - 1 && losers.length === conflictLosers.length),
    assertion("MT01B_RACE_LOSER_AUTH_COOKIE", "ningún perdedor recibe cookie AUTH", losers.every((item) => item.cookie !== "AUTH")),
    assertion("MT01B_RACE_LOSER_CLEAR_COOKIE", "ningún perdedor recibe cookie CLEAR", losers.every((item) => item.cookie !== "CLEAR")),
    assertion("MT01B_RACE_LOSER_COOKIE_NONE", "cada perdedor tiene cookie NONE", losers.every((item) => item.cookie === "NONE")),
    assertion("MT01B_RACE_LOSER_BODY_TOKEN", "cada perdedor carece de token en body", losers.every((item) => item.tokenBody === false)),
    assertion("MT01B_RACE_LOSER_HEADER_TOKEN", "cada perdedor carece de token en headers", losers.every((item) => item.tokenHeader === false)),
    assertion("MT01B_RACE_ACTIVE_SUCCESSOR_COUNT", "existe un único sucesor ACTIVE", database.active === 1 && database.successors === 1),
    assertion("MT01B_RACE_ROTATED_PREDECESSOR_COUNT", "existe un único token anterior ROTATED", database.rotated === 1),
    assertion("MT01B_RACE_REPLACEMENT_LINK_COUNT", "existe un único enlace de reemplazo", database.replacementLinks === 1),
    assertion("MT01B_RACE_AUDIT_COUNT", "existe una única auditoría", database.audits === 1),
    assertion("MT01B_RACE_SHARED_CAPTURE", "cada request conserva una captura independiente", new Set(requests.map((item) => item.captureId)).size === requests.length),
  ];
}

export function requireEndpointEvidence(assertions) {
  const failed = assertions.find((item) => !item.passed);
  if (!failed) return;
  const error = new Error(failed.message);
  error.code = failed.code;
  throw error;
}

function sanitizedError(error) {
  let message = String(error?.message || "Fallo sin mensaje");
  message = message
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "[DATABASE_URL]")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, "[ID]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]")
    .replace(/(?:eyJ[A-Za-z0-9_-]+\.){2}[A-Za-z0-9_-]+/g, "[TOKEN]")
    .replace(/__Host-osi_refresh=[^;\s]+/gi, "__Host-osi_refresh=[COOKIE]");
  return { code: String(error?.code || "MT01B_REFRESH_RACE_FAILED").slice(0, 100), message: message.slice(0, 240) };
}

export function writeFailureEvidence(evidence, error) {
  const target = String(process.env.MT01B_REFRESH_RACE_ARTIFACT_PATH || "").trim();
  if (!target) return null;
  const payload = {
    schema: EVIDENCE_SCHEMA,
    ok: false,
    concurrency: CONCURRENCY,
    rounds: ROUNDS,
    failure: sanitizedError(error),
    requests: Array.isArray(evidence?.requests) ? evidence.requests : [],
    database: evidence?.database || null,
    assertions: Array.isArray(evidence?.assertions) ? evidence.assertions : [],
  };
  const resolved = resolve(target);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", flag: "w" });
  return { schema: EVIDENCE_SCHEMA, written: true };
}

async function measureRoundTrip(prisma, samples = 10) {
  const values = [];
  for (let index = 0; index < samples; index += 1) {
    const started = performance.now();
    await prisma.$queryRawUnsafe("SELECT 1");
    values.push(performance.now() - started);
  }
  return metric(values);
}

async function connectionCount(prisma) {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::integer AS count
    FROM pg_stat_activity
    WHERE datname = current_database()
  `);
  return rows[0]?.count || 0;
}

async function endpointDatabaseEvidence(prisma, sessionId) {
  const tokens = await prisma.authRefreshToken.findMany({
    where: { sessionId },
    select: { status: true, version: true, replacedByTokenId: true },
    orderBy: { version: "asc" },
  });
  const audits = await prisma.commercialAuditLog.count({
    where: { entityId: sessionId, action: "AUTH_SESSION_REFRESH_ROTATED" },
  });
  const locks = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) FILTER (WHERE NOT granted)::integer AS waiting
    FROM pg_locks
    WHERE database = (SELECT oid FROM pg_database WHERE datname = current_database())
  `);
  return {
    active: tokens.filter((item) => item.status === "ACTIVE").length,
    rotated: tokens.filter((item) => item.status === "ROTATED").length,
    revoked: tokens.filter((item) => ["REVOKED", "COMPROMISED"].includes(item.status)).length,
    successors: tokens.filter((item) => Number(item.version) > 0).length,
    replacementLinks: tokens.filter((item) => item.replacedByTokenId != null).length,
    audits,
    waitingLocks: Number(locks[0]?.waiting || 0),
  };
}

export async function runRefreshRaceTest() {
  const prisma = createTestPrisma();
  let failureEvidence = null;
  try {
    const identity = await createIdentity(prisma, `race-${randomUUID().slice(0, 6)}`);
    const request = syntheticRequest({ clientId: `race-${randomUUID()}` });
    const networkRoundTrip = await measureRoundTrip(prisma);
    const connectionsBefore = await connectionCount(prisma);
    let maximumObservedConnections = connectionsBefore;

    for (let round = 1; round <= ROUNDS; round += 1) {
      const now = new Date(Date.now() + round * 10);
      const session = await createMembershipAuthSession(prisma, identity, { req: request, now });
      const enterBarrier = explicitConcurrencyBarrier(CONCURRENCY);
      const attempts = await Promise.allSettled(Array.from({ length: CONCURRENCY }, async () => {
        await enterBarrier();
        return rotateMembershipRefreshToken(prisma, session.refreshToken, {
          req: request,
          now: new Date(now.getTime() + 1),
          timingObserver: (sample) => timings.push(sample),
        });
      }));
      maximumObservedConnections = Math.max(maximumObservedConnections, await connectionCount(prisma));

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
    const enterEndpointBarrier = explicitConcurrencyBarrier(CONCURRENCY);
    let startSequence = 0;
    let resolveSequence = 0;
    const endpointAttempts = await Promise.all(Array.from({ length: CONCURRENCY }, async (_, index) => {
      const req = syntheticRequest({ clientId: request.headers["x-osi-client-id"], cookie: `__Host-osi_refresh=${endpointSession.refreshToken}` });
      const res = mockResponse();
      const requestId = syntheticRequestId(index);
      const captureId = `capture-${String(index + 1).padStart(2, "0")}`;
      await enterEndpointBarrier();
      const startOrder = ++startSequence;
      const started = performance.now();
      await refreshHandler(req, res);
      const resolveOrder = ++resolveSequence;
      return responseEvidence(res, { index, requestId, captureId, startOrder, resolveOrder, durationMs: performance.now() - started });
    }));
    failureEvidence = { requests: endpointAttempts, database: null, assertions: [] };
    const endpointDatabase = await endpointDatabaseEvidence(prisma, endpointSession.identity.sessionId);
    const endpointAssertions = evaluateEndpointEvidence(endpointAttempts, endpointDatabase, CONCURRENCY);
    failureEvidence = { requests: endpointAttempts, database: endpointDatabase, assertions: endpointAssertions };
    requireEndpointEvidence(endpointAssertions);
    const responseAssertions = endpointAssertions.filter((item) => /WINNER|LOSER/.test(item.code));
    const databaseAssertions = endpointAssertions.filter((item) => /COUNT/.test(item.code) && !/WINNER|LOSER/.test(item.code));
    results.push({ name: "endpoint separa ganador, perdedores, cookies y tokens", passed: responseAssertions.every((item) => item.passed), assertions: responseAssertions });
    results.push({ name: "endpoint conserva un único sucesor y auditoría", passed: databaseAssertions.every((item) => item.passed), assertions: databaseAssertions });
    check("409 expone contrato recuperable acotado", endpointAttempts.filter((item) => item.status === 409).every((item) =>
      ["MT01B_REFRESH_IN_PROGRESS", "MT01B_REFRESH_ALREADY_ROTATED"].includes(item.errorCode)));

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
    const logoutBarrier = explicitConcurrencyBarrier(2);
    const simultaneous = await Promise.allSettled([
      (async () => { await logoutBarrier(); return rotateMembershipRefreshToken(prisma, logoutSession.refreshToken, { req: request, now: new Date(logoutNow.getTime() + 1) }); })(),
      (async () => { await logoutBarrier(); return revokeMembershipAuthSession(prisma, logoutSession.refreshToken, { now: new Date(logoutNow.getTime() + 2) }); })(),
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

    const connectionsAfter = await connectionCount(prisma);
    const timeoutCount = [...codeCounts.entries()].filter(([code]) => /TIMEOUT|P2028/i.test(code)).reduce((sum, [, count]) => sum + count, 0);
    check("cero timeouts y transacciones agotadas", timeoutCount === 0, { timeoutCount });

    const timingFields = ["locatorRoundTripMs", "transactionAcquireMs", "advisoryLockMs", "queryAndAuditMs", "auditMs", "commitRoundTripMs", "totalMs"];
    const timingMetrics = Object.fromEntries(timingFields.map((field) => [field, metric(timings.map((sample) => Number(sample[field] || 0)))]));
    const timingMetricsByOutcome = Object.fromEntries([...new Set(timings.map((sample) => sample.outcome))].map((outcome) => [
      outcome,
      Object.fromEntries(timingFields.map((field) => [field, metric(timings.filter((sample) => sample.outcome === outcome).map((sample) => Number(sample[field] || 0)))])),
    ]));
    process.stdout.write(`${JSON.stringify({
      ok: true,
      passed: results.filter((item) => item.passed).length,
      failed: 0,
      rounds: ROUNDS,
      concurrentRequestsPerRound: CONCURRENCY,
      endpointAssertions,
      codeCounts: Object.fromEntries(codeCounts),
      metricsMs: { networkRoundTrip, ...timingMetrics },
      metricsByOutcomeMs: timingMetricsByOutcome,
      connections: { before: connectionsBefore, maximumObserved: maximumObservedConnections, after: connectionsAfter },
      results,
    }, null, 2)}\n`);
  } catch (error) {
    const artifact = writeFailureEvidence(failureEvidence, error);
    process.stdout.write(`${JSON.stringify({
      ok: false,
      passed: results.filter((item) => item.passed).length,
      failed: 1,
      results,
      error: sanitizedError(error),
      artifact,
    }, null, 2)}\n`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
    await endpointPrisma.$disconnect();
  }
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectExecution) await runRefreshRaceTest();
