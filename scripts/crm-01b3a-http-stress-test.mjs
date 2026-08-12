import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { createCrm01b2LocalPrisma } from "./crm-01b2-local-target.mjs";
import { mockResponse } from "./mt-01b1-test-helpers.mjs";

const ROUNDS = 20;
const REQUESTS = 20;
const results = [];
function check(name, condition) {
  results.push({ name, passed: Boolean(condition) });
  if (!condition) throw new Error(name);
}
function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? Number(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)].toFixed(2)) : null;
}
function latency(values) {
  return { count: values.length, p50: percentile(values, 0.5), p95: percentile(values, 0.95), max: values.length ? Number(Math.max(...values).toFixed(2)) : null };
}

const { prisma, target } = await createCrm01b2LocalPrisma();
process.env.DATABASE_URL = process.env.CRM01B2_TEST_DATABASE_URL;
process.env.DIRECT_URL = process.env.CRM01B2_TEST_DATABASE_URL;
const [{ createPipelineTransitionHandler }, { createPipelineAssignOwnerHandler }] = await Promise.all([
  import("../api/crm/pipeline-cases/[id]/transition.js"),
  import("../api/crm/pipeline-cases/[id]/assign-owner.js"),
]);
const appPrisma = (await import("../api/_lib/db.js")).prisma;
const run = `crm01b3a-stress-${randomUUID()}`;
const prefix = run.toUpperCase();
const metrics = {};
const env = { CRM_PIPELINE_MUTATION_MODE: "LOCAL_ONLY" };

function userData(id, role) {
  return { id, code: id.toUpperCase(), name: `Synthetic ${role}`, email: `${id}@example.test`, phone: "0", role, status: "active", joinDate: "2026-08-12", passwordHash: "not-a-login-hash" };
}
function caseData(id, tenantId, owner = null) {
  return { id, tenantId, caseCode: id.toUpperCase(), clientName: "Synthetic", mode: "LOCAL", serviceType: "MOVING", customerType: "L4_PERSONAL", status: "NEW_INBOX", ownerName: owner ? "Synthetic V" : "Unassigned", ownerMembershipId: owner?.id || null, ownerUserId: owner?.userId || null, originLocation: "Origin", destinationLocation: "Destination" };
}
function context(tenantId, membershipId) { return Object.freeze({ tenantId, membershipId }); }
function key(scenario, round, index = 0) { return `${run}.${scenario}.${round}.${index}`; }
function request(caseId, requestId, body) {
  return { method: "POST", query: { id: caseId }, body, headers: { "content-type": "application/json", "idempotency-key": requestId }, rawHeaders: ["content-type", "application/json", "idempotency-key", requestId] };
}
async function invoke(handler, req) {
  const started = performance.now();
  const res = mockResponse();
  try {
    await handler(req, res);
    return { status: res.statusCode, body: res.body, setCookie: res.getHeader("set-cookie"), durationMs: performance.now() - started };
  } catch (error) {
    return { status: 500, body: { code: error.code || error.name }, durationMs: performance.now() - started };
  }
}
async function race(operations) { return Promise.all(operations.map((operation) => operation())); }
function aggregate(rounds) {
  const all = rounds.flat();
  const winners = all.filter((item) => item.status === 200 && item.body?.command?.replayed === false);
  const replays = all.filter((item) => item.status === 200 && item.body?.command?.replayed === true);
  const conflicts = all.filter((item) => item.status === 409);
  return {
    rounds: rounds.length, requests: all.length, winners: winners.length, replays: replays.length,
    commandInProgress: conflicts.filter((item) => item.body?.code === "CRM_PIPELINE_COMMAND_IN_PROGRESS").length,
    versionConflicts: conflicts.filter((item) => item.body?.code === "CRM_PIPELINE_VERSION_CONFLICT").length,
    unexpected: all.filter((item) => ![200, 409].includes(item.status)).length,
    http500: all.filter((item) => item.status === 500).length,
    latencyMs: { winners: latency(winners.map((item) => item.durationMs)), conflicts: latency(conflicts.map((item) => item.durationMs)), replays: latency(replays.map((item) => item.durationMs)) },
  };
}

try {
  const tenant = await prisma.tenant.create({ data: { id: `${run}-tenant`, code: `${prefix}-T`, name: "CRM01B3A stress tenant" } });
  const adminUser = await prisma.user.create({ data: userData(`${run}-admin`, "A") });
  const sellerOneUser = await prisma.user.create({ data: userData(`${run}-seller-1`, "V") });
  const sellerTwoUser = await prisma.user.create({ data: userData(`${run}-seller-2`, "V") });
  const admin = await prisma.tenantMembership.create({ data: { id: `${run}-membership-admin`, tenantId: tenant.id, userId: adminUser.id, role: "A" } });
  const sellerOne = await prisma.tenantMembership.create({ data: { id: `${run}-membership-seller-1`, tenantId: tenant.id, userId: sellerOneUser.id, role: "V" } });
  const sellerTwo = await prisma.tenantMembership.create({ data: { id: `${run}-membership-seller-2`, tenantId: tenant.id, userId: sellerTwoUser.id, role: "V" } });
  const transitionV = createPipelineTransitionHandler({ env, resolveContext: async () => context(tenant.id, sellerOne.id) });
  const transitionA = createPipelineTransitionHandler({ env, resolveContext: async () => context(tenant.id, admin.id) });
  const assignA = createPipelineAssignOwnerHandler({ env, resolveContext: async () => context(tenant.id, admin.id) });
  const rounds = { transition: [], assignment: [], replay: [], mixed: [] };
  const postReplays = [];

  for (let round = 0; round < ROUNDS; round += 1) {
    const transitionCase = await prisma.pipelineCase.create({ data: caseData(`${run}-transition-${round}`, tenant.id, sellerOne) });
    rounds.transition.push(await race(Array.from(
      { length: REQUESTS },
      (_, index) => () => invoke(transitionV, request(transitionCase.id, key("transition", round, index), { expectedVersion: 1, toStatus: "AWAITING_ICP", reasonCode: null, evidence: null })),
    )));

    const assignmentCase = await prisma.pipelineCase.create({ data: caseData(`${run}-assignment-${round}`, tenant.id) });
    rounds.assignment.push(await race(Array.from(
      { length: REQUESTS },
      (_, index) => () => invoke(assignA, request(assignmentCase.id, key("assignment", round, index), { expectedVersion: 1, ownerMembershipId: index % 2 ? sellerOne.id : sellerTwo.id })),
    )));

    const replayCase = await prisma.pipelineCase.create({ data: caseData(`${run}-replay-${round}`, tenant.id, sellerOne) });
    const replayKey = key("replay", round);
    rounds.replay.push(await race(Array.from(
      { length: REQUESTS },
      () => () => invoke(transitionV, request(replayCase.id, replayKey, { expectedVersion: 1, toStatus: "AWAITING_ICP", reasonCode: null, evidence: null })),
    )));
    postReplays.push(await invoke(transitionV, request(replayCase.id, replayKey, { expectedVersion: 1, toStatus: "AWAITING_ICP", reasonCode: null, evidence: null })));

    const mixedCase = await prisma.pipelineCase.create({ data: caseData(`${run}-mixed-${round}`, tenant.id, sellerOne) });
    rounds.mixed.push(await race(Array.from(
      { length: REQUESTS },
      (_, index) => index % 2
        ? () => invoke(assignA, request(mixedCase.id, key("mixed-assign", round, index), { expectedVersion: 1, ownerMembershipId: sellerTwo.id }))
        : () => invoke(transitionA, request(mixedCase.id, key("mixed-transition", round, index), { expectedVersion: 1, toStatus: "AWAITING_ICP", reasonCode: null, evidence: null })),
    )));
  }

  for (const [scenario, scenarioRounds] of Object.entries(rounds)) {
    metrics[scenario] = aggregate(scenarioRounds);
    check(`${scenario}: 20x20`, scenarioRounds.length === ROUNDS && scenarioRounds.every((items) => items.length === REQUESTS));
    check(`${scenario}: un ganador exacto`, scenarioRounds.every((items) => items.filter((item) => item.status === 200 && item.body.command.replayed === false).length === 1));
    check(`${scenario}: cero 500 y resultados inesperados`, metrics[scenario].http500 === 0 && metrics[scenario].unexpected === 0);
    check(`${scenario}: perdedores recuperables`, scenarioRounds.flat().filter((item) => item.body?.code === "CRM_PIPELINE_COMMAND_IN_PROGRESS").every((item) => item.body.recoverable === true && item.body.retryAfterMs >= 75 && item.body.retryAfterMs <= 175));
    check(`${scenario}: cero cookies`, scenarioRounds.flat().every((item) => item.setCookie === undefined));
  }
  metrics.replay.postCommit = latency(postReplays.map((item) => item.durationMs));
  check("20 receipts post-commit exactos", postReplays.every((item) => item.status === 200 && item.body.command.replayed === true));
  check("80 casos quedan en versión dos", await prisma.pipelineCase.count({ where: { id: { startsWith: run }, version: 2 } }) === ROUNDS * 4);
  check("un journal por caso", await prisma.pipelineCaseCommand.count({ where: { pipelineCaseId: { startsWith: run } } }) === ROUNDS * 4);
  check("una auditoría por caso", await prisma.commercialAuditLog.count({ where: { source: "CRM_PIPELINE_DOMAIN", entityId: { startsWith: run } } }) === ROUNDS * 4);
  check("cero estados parciales", await prisma.pipelineCase.count({ where: { id: { startsWith: run }, version: { not: 2 } } }) === 0);
  check("destino PostgreSQL local exacto", target.address === "127.0.0.1" && target.port === 55432);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, assertions: results.filter((item) => item.passed).length, metrics, error: { name: error.name, code: error.code || null, message: error.message } }, null, 2)}\n`);
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
    process.stderr.write(`${JSON.stringify({ cleanup: "failed", code: cleanupError.code || null })}\n`);
    process.exitCode = 1;
  }
  await Promise.allSettled([prisma.$disconnect(), appPrisma.$disconnect()]);
}

if (!process.exitCode) process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, rounds: ROUNDS, requestsPerRound: REQUESTS, metrics, results }, null, 2)}\n`);
