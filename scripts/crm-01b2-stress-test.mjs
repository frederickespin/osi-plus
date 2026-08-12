import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { createCrm01b2LocalPrisma } from "./crm-01b2-local-target.mjs";

const ROUNDS = 50;
const REQUESTS_PER_ROUND = 20;
const results = [];
function check(name, condition) {
  results.push({ name, passed: Boolean(condition) });
  if (!condition) throw new Error(name);
}
function percentile(values, fraction) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)].toFixed(2));
}
function latency(values) {
  return Object.freeze({ count: values.length, p50: percentile(values, 0.50), p95: percentile(values, 0.95), max: values.length ? Number(Math.max(...values).toFixed(2)) : null });
}
async function runRace(operations) {
  return Promise.all(operations.map(async (operation) => {
    const started = performance.now();
    try { return { ok: true, value: await operation(), durationMs: performance.now() - started }; }
    catch (error) {
      return { ok: false, code: error.code || error.name, status: error.status, recoverable: error.recoverable,
        retryAfterMs: error.retryAfterMs, durationMs: performance.now() - started };
    }
  }));
}
function aggregate(rounds) {
  const items = rounds.flat();
  const winners = items.filter((item) => item.ok && item.value.replayed === false);
  const replays = items.filter((item) => item.ok && item.value.replayed === true);
  const conflicts = items.filter((item) => !item.ok);
  return Object.freeze({
    rounds: rounds.length,
    requests: items.length,
    winners: winners.length,
    commandInProgress: conflicts.filter((item) => item.code === "CRM_PIPELINE_COMMAND_IN_PROGRESS").length,
    versionConflicts: conflicts.filter((item) => item.code === "CRM_PIPELINE_VERSION_CONFLICT").length,
    replays: replays.length,
    timeouts: conflicts.filter((item) => item.code === "CRM_PIPELINE_DATABASE_UNAVAILABLE").length,
    unexpected: conflicts.filter((item) => !["CRM_PIPELINE_COMMAND_IN_PROGRESS", "CRM_PIPELINE_VERSION_CONFLICT"].includes(item.code)).length,
    latencyMs: Object.freeze({ winners: latency(winners.map((item) => item.durationMs)), conflicts: latency(conflicts.map((item) => item.durationMs)), replays: latency(replays.map((item) => item.durationMs)) }),
  });
}

const { prisma, target } = await createCrm01b2LocalPrisma();
process.env.DATABASE_URL = process.env.CRM01B2_TEST_DATABASE_URL;
process.env.DIRECT_URL = process.env.CRM01B2_TEST_DATABASE_URL;
const domain = await import("../api/_lib/pipelineCaseDomain.js");
const appPrisma = (await import("../api/_lib/db.js")).prisma;
const run = `crm01b2-stress-${randomUUID()}`;
const prefix = run.toUpperCase();
const metrics = {};

function userData(id, role) { return { id, code: id.toUpperCase(), name: `Synthetic ${role}`, email: `${id}@example.test`, phone: "0", role, status: "active", joinDate: "2026-08-12", passwordHash: "not-a-login-hash" }; }
function caseData(id, tenantId, owner = null) { return { id, tenantId, caseCode: id.toUpperCase(), clientName: "Synthetic", mode: "LOCAL", serviceType: "MOVING", customerType: "L4_PERSONAL", status: "NEW_INBOX", ownerName: owner ? "Synthetic V" : "Unassigned", ownerMembershipId: owner?.id || null, ownerUserId: owner?.userId || null, originLocation: "Origin", destinationLocation: "Destination" }; }
function context(tenantId, membershipId) { return Object.freeze({ tenantId, membershipId }); }
function request(scenario, round, index) { return `${run}.${scenario}.${round}.${index}`; }

try {
  const tenant = await prisma.tenant.create({ data: { id: `${run}-tenant`, code: `${prefix}-T`, name: "CRM01B2 stress tenant" } });
  const adminUser = await prisma.user.create({ data: userData(`${run}-admin`, "A") });
  const sellerOneUser = await prisma.user.create({ data: userData(`${run}-seller-1`, "V") });
  const sellerTwoUser = await prisma.user.create({ data: userData(`${run}-seller-2`, "V") });
  const admin = await prisma.tenantMembership.create({ data: { id: `${run}-membership-admin`, tenantId: tenant.id, userId: adminUser.id, role: "A" } });
  const sellerOne = await prisma.tenantMembership.create({ data: { id: `${run}-membership-seller-1`, tenantId: tenant.id, userId: sellerOneUser.id, role: "V" } });
  const sellerTwo = await prisma.tenantMembership.create({ data: { id: `${run}-membership-seller-2`, tenantId: tenant.id, userId: sellerTwoUser.id, role: "V" } });
  const ctxA = context(tenant.id, admin.id);
  const ctxV = context(tenant.id, sellerOne.id);
  const scenarioRounds = { transition: [], assignment: [], identicalReplay: [], mixed: [] };
  const postContentionReplays = [];

  for (let round = 0; round < ROUNDS; round += 1) {
    const transitionCase = await prisma.pipelineCase.create({ data: caseData(`${run}-transition-${round}`, tenant.id, sellerOne) });
    scenarioRounds.transition.push(await runRace(Array.from({ length: REQUESTS_PER_ROUND }, (_, index) => () => domain.transitionPipelineCase(ctxV, {
      caseId: transitionCase.id, expectedVersion: 1, requestId: request("transition", round, index), toStatus: "AWAITING_ICP",
    }))));

    const assignmentCase = await prisma.pipelineCase.create({ data: caseData(`${run}-assignment-${round}`, tenant.id) });
    scenarioRounds.assignment.push(await runRace(Array.from({ length: REQUESTS_PER_ROUND }, (_, index) => () => domain.assignPipelineCaseOwner(ctxA, {
      caseId: assignmentCase.id, expectedVersion: 1, requestId: request("assignment", round, index), ownerMembershipId: index % 2 === 0 ? sellerOne.id : sellerTwo.id,
    }))));

    const replayCase = await prisma.pipelineCase.create({ data: caseData(`${run}-replay-${round}`, tenant.id, sellerOne) });
    const replayRequest = request("replay", round, 0);
    scenarioRounds.identicalReplay.push(await runRace(Array.from({ length: REQUESTS_PER_ROUND }, () => () => domain.transitionPipelineCase(ctxV, {
      caseId: replayCase.id, expectedVersion: 1, requestId: replayRequest, toStatus: "AWAITING_ICP",
    }))));
    postContentionReplays.push((await runRace([() => domain.transitionPipelineCase(ctxV, {
      caseId: replayCase.id, expectedVersion: 1, requestId: replayRequest, toStatus: "AWAITING_ICP",
    })]))[0]);

    const mixedCase = await prisma.pipelineCase.create({ data: caseData(`${run}-mixed-${round}`, tenant.id, sellerOne) });
    scenarioRounds.mixed.push(await runRace(Array.from({ length: REQUESTS_PER_ROUND }, (_, index) => index % 2 === 0
      ? () => domain.transitionPipelineCase(ctxA, { caseId: mixedCase.id, expectedVersion: 1, requestId: request("mixed-transition", round, index), toStatus: "AWAITING_ICP" })
      : () => domain.assignPipelineCaseOwner(ctxA, { caseId: mixedCase.id, expectedVersion: 1, requestId: request("mixed-assignment", round, index), ownerMembershipId: sellerTwo.id }))));
  }

  for (const [scenario, rounds] of Object.entries(scenarioRounds)) {
    metrics[scenario] = aggregate(rounds);
    check(`${scenario}: 50 rondas por 20 solicitudes`, rounds.length === ROUNDS && rounds.every((items) => items.length === REQUESTS_PER_ROUND));
    check(`${scenario}: un ganador real exacto por ronda`, rounds.every((items) => items.filter((item) => item.ok && item.value.replayed === false).length === 1));
    check(`${scenario}: cero timeouts, deadlocks y errores inesperados`, metrics[scenario].timeouts === 0 && metrics[scenario].unexpected === 0);
    check(`${scenario}: perdedores en progreso tienen contrato recuperable`, rounds.flat().filter((item) => item.code === "CRM_PIPELINE_COMMAND_IN_PROGRESS").every((item) => item.status === 409 && item.recoverable === true && item.retryAfterMs >= 75 && item.retryAfterMs <= 175));
  }
  metrics.identicalReplay = Object.freeze({ ...metrics.identicalReplay, postContentionReplays: latency(postContentionReplays.map((item) => item.durationMs)) });
  check("reintento post-commit devuelve 50 receipts históricos", postContentionReplays.length === ROUNDS
    && postContentionReplays.every((item) => item.ok && item.value.replayed === true));
  check("replay simultáneo nunca emite receipt de otra cadena", scenarioRounds.identicalReplay.every((items) => {
    const commandIds = new Set(items.filter((item) => item.ok).map((item) => item.value.commandId));
    return commandIds.size === 1;
  }));
  check("200 casos terminan en versión dos", await prisma.pipelineCase.count({ where: { id: { startsWith: run }, version: 2 } }) === ROUNDS * 4);
  check("un journal exacto por caso", await prisma.pipelineCaseCommand.count({ where: { pipelineCaseId: { startsWith: run } } }) === ROUNDS * 4);
  check("una auditoría exacta por caso", await prisma.commercialAuditLog.count({ where: { source: "CRM_PIPELINE_DOMAIN", entityId: { startsWith: run } } }) === ROUNDS * 4);
  check("cero estados parciales", await prisma.pipelineCase.count({ where: { id: { startsWith: run }, version: { not: 2 } } }) === 0);
  check("destino local validado", target.address === "127.0.0.1" && target.port === 55432 && ["osi_crm01b2_local", "osi_db01n_ci"].includes(target.database));
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, assertions: results.filter((item) => item.passed).length, results, metrics, error: { name: error.name, code: error.code || null, message: error.message } }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`LOCK TABLE "osi"."commercial_audit_logs", "osi"."pipeline_case_commands" IN ACCESS EXCLUSIVE MODE`);
      await tx.$executeRawUnsafe(`ALTER TABLE "osi"."commercial_audit_logs" DISABLE TRIGGER "commercial_audit_logs_append_only"`);
      await tx.$executeRawUnsafe(`ALTER TABLE "osi"."pipeline_case_commands" DISABLE TRIGGER "pipeline_case_commands_append_only"`);
      await tx.commercialAuditLog.deleteMany({ where: { source: "CRM_PIPELINE_DOMAIN", entityId: { startsWith: run } } });
      await tx.pipelineCaseCommand.deleteMany({ where: { pipelineCaseId: { startsWith: run } } });
      await tx.pipelineCase.deleteMany({ where: { id: { startsWith: run } } });
      await tx.tenantMembership.deleteMany({ where: { id: { startsWith: run } } });
      await tx.user.deleteMany({ where: { id: { startsWith: run } } });
      await tx.tenant.deleteMany({ where: { id: { startsWith: run } } });
      await tx.$executeRawUnsafe(`ALTER TABLE "osi"."pipeline_case_commands" ENABLE TRIGGER "pipeline_case_commands_append_only"`);
      await tx.$executeRawUnsafe(`ALTER TABLE "osi"."commercial_audit_logs" ENABLE TRIGGER "commercial_audit_logs_append_only"`);
    });
  } catch (cleanupError) {
    process.stderr.write(`${JSON.stringify({ cleanup: "failed", code: cleanupError.code || null, message: cleanupError.message })}\n`);
    process.exitCode = 1;
  }
  await Promise.allSettled([prisma.$disconnect(), appPrisma.$disconnect()]);
}

if (!process.exitCode) process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, passed: results.length, failed: 0, rounds: ROUNDS, requestsPerRound: REQUESTS_PER_ROUND, metrics, results }, null, 2)}\n`);
