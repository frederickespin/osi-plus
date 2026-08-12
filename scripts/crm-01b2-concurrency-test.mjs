import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { createCrm01b2LocalPrisma } from "./crm-01b2-local-target.mjs";

const results = [];
function check(name, condition) {
  results.push({ name, passed: Boolean(condition) });
  if (!condition) throw new Error(name);
}
function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)].toFixed(2));
}
async function race(operations) {
  const durations = [];
  const settled = await Promise.all(operations.map(async (operation) => {
    const started = performance.now();
    try { return { ok: true, value: await operation(), durationMs: performance.now() - started }; }
    catch (error) { return { ok: false, code: error.code || error.name, status: error.status, recoverable: error.recoverable, retryAfterMs: error.retryAfterMs, durationMs: performance.now() - started }; }
    finally { durations.push(performance.now() - started); }
  }));
  return { settled, metrics: { p50: percentile(durations, 0.50), p95: percentile(durations, 0.95), max: Number(Math.max(...durations).toFixed(2)) } };
}

const { prisma, target } = await createCrm01b2LocalPrisma();
process.env.DATABASE_URL = process.env.CRM01B2_TEST_DATABASE_URL;
process.env.DIRECT_URL = process.env.CRM01B2_TEST_DATABASE_URL;
const domain = await import("../api/_lib/pipelineCaseDomain.js");
const appPrisma = (await import("../api/_lib/db.js")).prisma;
const run = `crm01b2-race-${randomUUID()}`;
const prefix = run.toUpperCase();

function userData(id, role) { return { id, code: id.toUpperCase(), name: `Synthetic ${role}`, email: `${id}@example.test`, phone: "0", role, status: "active", joinDate: "2026-08-12", passwordHash: "not-a-login-hash" }; }
function caseData(id, tenantId, owner = null) { return { id, tenantId, caseCode: id.toUpperCase(), clientName: "Synthetic", mode: "LOCAL", serviceType: "MOVING", customerType: "L4_PERSONAL", status: "NEW_INBOX", ownerName: owner ? "Synthetic V" : "Unassigned", ownerMembershipId: owner?.id || null, ownerUserId: owner?.userId || null, originLocation: "Origin", destinationLocation: "Destination" }; }
function context(tenantId, membershipId) { return { tenantId, membershipId }; }
function request(label) { return `${run}.${label}`; }
function countCode(settled, code) { return settled.filter((item) => !item.ok && item.code === code).length; }

const metrics = {};
try {
  const t1 = await prisma.tenant.create({ data: { id: `${run}-tenant-1`, code: `${prefix}-T1`, name: "Concurrency tenant one" } });
  const t2 = await prisma.tenant.create({ data: { id: `${run}-tenant-2`, code: `${prefix}-T2`, name: "Concurrency tenant two" } });
  const a1u = await prisma.user.create({ data: userData(`${run}-admin-1`, "A") });
  const v1u = await prisma.user.create({ data: userData(`${run}-seller-1`, "V") });
  const v2u = await prisma.user.create({ data: userData(`${run}-seller-2`, "V") });
  const a2u = await prisma.user.create({ data: userData(`${run}-admin-2`, "A") });
  const vOtherU = await prisma.user.create({ data: userData(`${run}-seller-other`, "V") });
  const a1 = await prisma.tenantMembership.create({ data: { id: `${run}-membership-admin-1`, tenantId: t1.id, userId: a1u.id, role: "A" } });
  const v1 = await prisma.tenantMembership.create({ data: { id: `${run}-membership-seller-1`, tenantId: t1.id, userId: v1u.id, role: "V" } });
  const v2 = await prisma.tenantMembership.create({ data: { id: `${run}-membership-seller-2`, tenantId: t1.id, userId: v2u.id, role: "V" } });
  const a2 = await prisma.tenantMembership.create({ data: { id: `${run}-membership-admin-2`, tenantId: t2.id, userId: a2u.id, role: "A" } });
  const vOther = await prisma.tenantMembership.create({ data: { id: `${run}-membership-seller-other`, tenantId: t2.id, userId: vOtherU.id, role: "V" } });
  const ctxA1 = context(t1.id, a1.id);
  const ctxV1 = context(t1.id, v1.id);
  const ctxA2 = context(t2.id, a2.id);

  const transitionCase = await prisma.pipelineCase.create({ data: caseData(`${run}-transition`, t1.id, v1) });
  const transitionRace = await race(Array.from({ length: 20 }, (_, index) => () => domain.transitionPipelineCase(ctxV1, { caseId: transitionCase.id, expectedVersion: 1, requestId: request(`transition-${index}`), toStatus: "AWAITING_ICP" })));
  metrics.transition = transitionRace.metrics;
  check("20 transiciones producen un ganador", transitionRace.settled.filter((item) => item.ok).length === 1);
  check("19 transiciones pierden de forma recuperable", countCode(transitionRace.settled, "CRM_PIPELINE_VERSION_CONFLICT") + countCode(transitionRace.settled, "CRM_PIPELINE_COMMAND_IN_PROGRESS") === 19 && transitionRace.settled.filter((item) => !item.ok).every((item) => item.recoverable === true));
  check("transición concurrente crea un journal y una auditoría", await prisma.pipelineCaseCommand.count({ where: { pipelineCaseId: transitionCase.id } }) === 1 && await prisma.commercialAuditLog.count({ where: { entityId: transitionCase.id } }) === 1);
  check("transición concurrente deja versión dos", (await prisma.pipelineCase.findUnique({ where: { id: transitionCase.id } })).version === 2);

  const identicalCase = await prisma.pipelineCase.create({ data: caseData(`${run}-identical`, t1.id, v1) });
  const identicalRequest = request("identical");
  const identicalRace = await race(Array.from({ length: 20 }, () => () => domain.transitionPipelineCase(ctxV1, { caseId: identicalCase.id, expectedVersion: 1, requestId: identicalRequest, toStatus: "AWAITING_ICP" })));
  metrics.identical = identicalRace.metrics;
  check("reintentos idénticos sólo producen ganador, replay o contención", identicalRace.settled.every((item) => item.ok || item.code === "CRM_PIPELINE_COMMAND_IN_PROGRESS"));
  check("reintentos idénticos tienen un único ganador real", identicalRace.settled.filter((item) => item.ok && item.value.replayed === false).length === 1 && !identicalRace.settled.some((item) => item.ok && item.value.commandId !== identicalRace.settled.find((entry) => entry.ok)?.value.commandId));
  check("reintentos idénticos crean una sola cadena", await prisma.pipelineCaseCommand.count({ where: { requestId: identicalRequest } }) === 1 && await prisma.commercialAuditLog.count({ where: { request_id: identicalRequest } }) === 1);

  const assignCase = await prisma.pipelineCase.create({ data: caseData(`${run}-assign`, t1.id) });
  const assignmentRace = await race(Array.from({ length: 20 }, (_, index) => () => domain.assignPipelineCaseOwner(ctxA1, { caseId: assignCase.id, expectedVersion: 1, requestId: request(`assign-${index}`), ownerMembershipId: index % 2 ? v1.id : v2.id })));
  metrics.assignment = assignmentRace.metrics;
  check("20 asignaciones producen un ganador", assignmentRace.settled.filter((item) => item.ok).length === 1);
  check("19 asignaciones pierden de forma recuperable", countCode(assignmentRace.settled, "CRM_PIPELINE_VERSION_CONFLICT") + countCode(assignmentRace.settled, "CRM_PIPELINE_COMMAND_IN_PROGRESS") === 19 && assignmentRace.settled.filter((item) => !item.ok).every((item) => item.recoverable === true));
  const assignAfter = await prisma.pipelineCase.findUnique({ where: { id: assignCase.id } });
  check("asignación concurrente deja pareja coherente", assignAfter.version === 2 && ((assignAfter.ownerMembershipId === v1.id && assignAfter.ownerUserId === v1.userId) || (assignAfter.ownerMembershipId === v2.id && assignAfter.ownerUserId === v2.userId)));

  const mixedCase = await prisma.pipelineCase.create({ data: caseData(`${run}-mixed`, t1.id, v1) });
  const mixedRace = await race([
    () => domain.transitionPipelineCase(ctxA1, { caseId: mixedCase.id, expectedVersion: 1, requestId: request("mixed-transition"), toStatus: "AWAITING_ICP" }),
    () => domain.assignPipelineCaseOwner(ctxA1, { caseId: mixedCase.id, expectedVersion: 1, requestId: request("mixed-assign"), ownerMembershipId: v2.id }),
  ]);
  metrics.mixed = mixedRace.metrics;
  check("transición contra asignación produce un ganador", mixedRace.settled.filter((item) => item.ok).length === 1);
  check("operación mixta perdedora es conflicto recuperable", countCode(mixedRace.settled, "CRM_PIPELINE_VERSION_CONFLICT") + countCode(mixedRace.settled, "CRM_PIPELINE_COMMAND_IN_PROGRESS") === 1 && mixedRace.settled.find((item) => !item.ok)?.recoverable === true);
  check("operación mixta no genera estado parcial", (await prisma.pipelineCaseCommand.count({ where: { pipelineCaseId: mixedCase.id } })) === 1 && (await prisma.pipelineCase.findUnique({ where: { id: mixedCase.id } })).version === 2);

  const requestCaseOne = await prisma.pipelineCase.create({ data: caseData(`${run}-request-case-1`, t1.id, v1) });
  const requestCaseTwo = await prisma.pipelineCase.create({ data: caseData(`${run}-request-case-2`, t1.id, v1) });
  const reusedRequest = request("same-request-two-cases");
  const requestRace = await race([
    () => domain.transitionPipelineCase(ctxV1, { caseId: requestCaseOne.id, expectedVersion: 1, requestId: reusedRequest, toStatus: "AWAITING_ICP" }),
    () => domain.transitionPipelineCase(ctxV1, { caseId: requestCaseTwo.id, expectedVersion: 1, requestId: reusedRequest, toStatus: "AWAITING_ICP" }),
  ]);
  check("requestId igual para dos casos tiene un ganador", requestRace.settled.filter((item) => item.ok).length === 1);
  check("requestId igual para dos casos no crea dos comandos", countCode(requestRace.settled, "CRM_PIPELINE_IDEMPOTENCY_CONFLICT") + countCode(requestRace.settled, "CRM_PIPELINE_COMMAND_IN_PROGRESS") === 1);
  const winningRequestCase = requestRace.settled.find((item) => item.ok).value.caseId;
  const losingRequestCase = winningRequestCase === requestCaseOne.id ? requestCaseTwo : requestCaseOne;
  let reusedConflict;
  try { await domain.transitionPipelineCase(ctxV1, { caseId: losingRequestCase.id, expectedVersion: 1, requestId: reusedRequest, toStatus: "AWAITING_ICP" }); } catch (error) { reusedConflict = error; }
  check("reintento del requestId para otro caso es conflicto idempotente", reusedConflict?.code === "CRM_PIPELINE_IDEMPOTENCY_CONFLICT");

  const tenantOneCase = await prisma.pipelineCase.create({ data: caseData(`${run}-tenant-one-independent`, t1.id, v1) });
  const tenantTwoCase = await prisma.pipelineCase.create({ data: caseData(`${run}-tenant-two-independent`, t2.id, vOther) });
  const crossTenantRequest = request("cross-tenant-independent");
  const tenantRace = await race([
    () => domain.transitionPipelineCase(ctxA1, { caseId: tenantOneCase.id, expectedVersion: 1, requestId: crossTenantRequest, toStatus: "AWAITING_ICP" }),
    () => domain.transitionPipelineCase(ctxA2, { caseId: tenantTwoCase.id, expectedVersion: 1, requestId: crossTenantRequest, toStatus: "AWAITING_ICP" }),
  ]);
  metrics.twoTenants = tenantRace.metrics;
  check("dos tenants pueden usar el mismo requestId", tenantRace.settled.every((item) => item.ok));
  check("dos tenants conservan journals independientes", await prisma.pipelineCaseCommand.count({ where: { requestId: crossTenantRequest } }) === 2);

  const allSettled = [transitionRace, identicalRace, assignmentRace, mixedRace, requestRace, tenantRace].flatMap((item) => item.settled);
  check("cero deadlocks", countCode(allSettled, "P2034") === 0 && !allSettled.some((item) => /deadlock/i.test(item.code || "")));
  check("cero errores 500/503 bajo contención local", !allSettled.some((item) => ["CRM_PIPELINE_DATABASE_UNAVAILABLE", "PrismaClientKnownRequestError"].includes(item.code)));
  const busy = allSettled.filter((item) => item.code === "CRM_PIPELINE_COMMAND_IN_PROGRESS");
  check("contención devuelve 409, recoverable y jitter acotado", busy.length > 0 && busy.every((item) => item.status === 409 && item.recoverable === true && item.retryAfterMs >= 75 && item.retryAfterMs <= 175));
  check("identidad local validada antes de escribir", target.address === "127.0.0.1" && target.port === 55432 && ["osi_crm01b2_local", "osi_db01n_ci"].includes(target.database));
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

if (!process.exitCode) process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, passed: results.length, failed: 0, metrics, results }, null, 2)}\n`);
