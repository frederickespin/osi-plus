import { randomUUID } from "node:crypto";
import { createMembershipAuthSession, rotateMembershipRefreshToken } from "../api/_lib/authSession.js";
import { createIdentity, createTestPrisma, syntheticRequest } from "./mt-01b1-test-helpers.mjs";

process.env.MT01B_AUTH_MODE = "HYBRID";
process.env.MT01B_TENANT_SWITCH_ENABLED = "false";
process.env.MT01B_LEGACY_TOKEN_ACCEPT_UNTIL = new Date(Date.now() + 24 * 3600 * 1_000).toISOString();
process.env.MT01B_REFRESH_TOKEN_PEPPER = "mt01b-ci-only-refresh-pepper-32-characters-minimum";
process.env.MT01B_ALLOWED_ORIGINS = "http://localhost:5173";

const prisma = createTestPrisma();
const results = [];
try {
  const identity = await createIdentity(prisma, `race-${randomUUID().slice(0, 6)}`);
  const request = syntheticRequest({ clientId: `race-${randomUUID()}` });
  for (let round = 1; round <= 20; round += 1) {
    const now = new Date(Date.now() + round * 10);
    const session = await createMembershipAuthSession(prisma, identity, { req: request, now });
    const attempts = await Promise.allSettled(Array.from({ length: 20 }, () =>
      rotateMembershipRefreshToken(prisma, session.refreshToken, { req: request, now: new Date(now.getTime() + 1) })));
    const winners = attempts.filter((item) => item.status === "fulfilled").length;
    const recoverable = attempts.filter((item) => item.status === "rejected" && item.reason?.code === "MT01B_REFRESH_ALREADY_ROTATED" && item.reason?.recoverable === true).length;
    const active = await prisma.authRefreshToken.count({ where: { sessionId: session.identity.sessionId, status: "ACTIVE" } });
    const compromised = await prisma.authSession.count({ where: { id: session.identity.sessionId, status: "COMPROMISED" } });
    const auditRows = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::integer AS count FROM "osi"."commercial_audit_logs" WHERE entity='AUTH_SESSION' AND entity_id=$1`,
      session.identity.sessionId,
    );
    const auditCount = auditRows[0]?.count || 0;
    const passed = winners === 1 && recoverable === 19 && active === 1 && compromised === 0 && auditCount === 0;
    results.push({ name: `ronda concurrente ${round}`, passed, winners, recoverable, active, compromised, auditCount });
    if (!passed) throw new Error(`Ronda ${round} no fue determinista`);
  }
  const duplicateSessions = await prisma.$queryRawUnsafe(`
    SELECT session_id, COUNT(*)::integer AS count
    FROM "osi"."auth_refresh_tokens" WHERE status = 'ACTIVE'
    GROUP BY session_id HAVING COUNT(*) > 1
  `);
  const passed = duplicateSessions.length === 0;
  results.push({ name: "cero sesiones con dos refresh ACTIVE", passed });
  if (!passed) throw new Error("Se detectaron cadenas duplicadas");
  process.stdout.write(`${JSON.stringify({ ok: true, passed: results.length, failed: 0, rounds: 20, concurrentRequestsPerRound: 20, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, passed: results.filter((item) => item.passed).length, failed: 1, results, error: { name: error.name, code: error.code, message: error.message, stack: error.stack } }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
