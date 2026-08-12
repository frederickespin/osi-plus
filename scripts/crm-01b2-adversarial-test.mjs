import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Prisma } from "@prisma/client";
import { createCrm01b2LocalPrisma } from "./crm-01b2-local-target.mjs";

const results = [];
const originalConsoleError = console.error;
console.error = () => {};
function check(name, condition) {
  results.push({ name, passed: Boolean(condition) });
  if (!condition) throw new Error(name);
}
async function captured(operation) {
  try { return { ok: true, value: await operation() }; }
  catch (error) { return { ok: false, error }; }
}

const { prisma, target } = await createCrm01b2LocalPrisma();
process.env.DATABASE_URL = process.env.CRM01B2_TEST_DATABASE_URL;
process.env.DIRECT_URL = process.env.CRM01B2_TEST_DATABASE_URL;
globalThis.prisma = prisma;
const domain = await import("../api/_lib/pipelineCaseDomain.js");
const appPrisma = (await import("../api/_lib/db.js")).prisma;
const run = `crm01b2-adversarial-${randomUUID()}`;
const prefix = run.toUpperCase();

function userData(id, role) { return { id, code: id.toUpperCase(), name: `Synthetic ${role}`, email: `${id}@example.test`, phone: "0", role, status: "active", joinDate: "2026-08-12", passwordHash: "not-a-login-hash" }; }
function caseData(id, tenantId, owner = null) { return { id, tenantId, caseCode: id.toUpperCase(), clientName: "Synthetic", mode: "LOCAL", serviceType: "MOVING", customerType: "L4_PERSONAL", status: "NEW_INBOX", ownerName: owner ? "Synthetic V" : "Unassigned", ownerMembershipId: owner?.id || null, ownerUserId: owner?.userId || null, originLocation: "Origin", destinationLocation: "Destination" }; }
function context(tenantId, membershipId) { return Object.freeze({ tenantId, membershipId }); }
function request(label) { return `${run}.${label}`; }
function queryText(query) { return Array.isArray(query?.strings) ? query.strings.join("") : String(query?.sql || ""); }

async function withForcedAdvisoryCollision(namespace, operation) {
  const originalTransaction = appPrisma.$transaction.bind(appPrisma);
  appPrisma.$transaction = (callback, options) => originalTransaction(async (tx) => {
    const proxy = new Proxy(tx, {
      get(targetClient, property) {
        if (property === "$queryRaw") {
          return async (query) => {
            const text = queryText(query);
            const lockKey = query?.values?.[0];
            if (text.includes("pg_try_advisory_xact_lock") && typeof lockKey === "string" && lockKey.includes(`:${namespace}:`)) {
              return targetClient.$queryRaw(Prisma.sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${`CRM-01B2:FORCED:${namespace}`}, 0)) AS "locked"`);
            }
            if (text.includes("transaction_timestamp()")) await delay(250);
            return targetClient.$queryRaw(query);
          };
        }
        const value = Reflect.get(targetClient, property, targetClient);
        return typeof value === "function" ? value.bind(targetClient) : value;
      },
    });
    return callback(proxy);
  }, options);
  try { return await operation(); }
  finally { appPrisma.$transaction = originalTransaction; }
}

try {
  const tenant = await prisma.tenant.create({ data: { id: `${run}-tenant`, code: `${prefix}-T`, name: "CRM01B2 adversarial tenant" } });
  const adminUser = await prisma.user.create({ data: userData(`${run}-admin`, "A") });
  const sellerOneUser = await prisma.user.create({ data: userData(`${run}-seller-1`, "V") });
  const sellerTwoUser = await prisma.user.create({ data: userData(`${run}-seller-2`, "V") });
  const admin = await prisma.tenantMembership.create({ data: { id: `${run}-membership-admin`, tenantId: tenant.id, userId: adminUser.id, role: "A" } });
  const sellerOne = await prisma.tenantMembership.create({ data: { id: `${run}-membership-seller-1`, tenantId: tenant.id, userId: sellerOneUser.id, role: "V" } });
  const sellerTwo = await prisma.tenantMembership.create({ data: { id: `${run}-membership-seller-2`, tenantId: tenant.id, userId: sellerTwoUser.id, role: "V" } });
  const ctxA = context(tenant.id, admin.id);
  const ctxV = context(tenant.id, sellerOne.id);

  const requestCollisionOne = await prisma.pipelineCase.create({ data: caseData(`${run}-request-collision-1`, tenant.id, sellerOne) });
  const requestCollisionTwo = await prisma.pipelineCase.create({ data: caseData(`${run}-request-collision-2`, tenant.id, sellerOne) });
  const requestCollision = await withForcedAdvisoryCollision("REQUEST", () => Promise.all([
    captured(() => domain.transitionPipelineCase(ctxV, { caseId: requestCollisionOne.id, expectedVersion: 1, requestId: request("request-collision-1"), toStatus: "AWAITING_ICP" })),
    captured(() => domain.transitionPipelineCase(ctxV, { caseId: requestCollisionTwo.id, expectedVersion: 1, requestId: request("request-collision-2"), toStatus: "AWAITING_ICP" })),
  ]));
  check("colisión hash REQUEST produce un ganador y un 409 recuperable", requestCollision.filter((item) => item.ok).length === 1
    && requestCollision.filter((item) => item.error?.code === "CRM_PIPELINE_COMMAND_IN_PROGRESS" && item.error.recoverable === true).length === 1);
  check("colisión REQUEST no mezcla casos ni receipts", requestCollision.find((item) => item.ok).value.caseId
    === (requestCollision[0].ok ? requestCollisionOne.id : requestCollisionTwo.id)
    && await prisma.pipelineCaseCommand.count({ where: { pipelineCaseId: { in: [requestCollisionOne.id, requestCollisionTwo.id] } } }) === 1);

  const caseCollisionOne = await prisma.pipelineCase.create({ data: caseData(`${run}-case-collision-1`, tenant.id, sellerOne) });
  const caseCollisionTwo = await prisma.pipelineCase.create({ data: caseData(`${run}-case-collision-2`, tenant.id, sellerOne) });
  const caseCollision = await withForcedAdvisoryCollision("CASE", () => Promise.all([
    captured(() => domain.transitionPipelineCase(ctxV, { caseId: caseCollisionOne.id, expectedVersion: 1, requestId: request("case-collision-1"), toStatus: "AWAITING_ICP" })),
    captured(() => domain.transitionPipelineCase(ctxV, { caseId: caseCollisionTwo.id, expectedVersion: 1, requestId: request("case-collision-2"), toStatus: "AWAITING_ICP" })),
  ]));
  check("colisión hash CASE produce un ganador y un 409 recuperable", caseCollision.filter((item) => item.ok).length === 1
    && caseCollision.filter((item) => item.error?.code === "CRM_PIPELINE_COMMAND_IN_PROGRESS" && item.error.recoverable === true).length === 1);
  check("colisión CASE no mezcla tenants, casos o comandos", await prisma.pipelineCaseCommand.count({ where: { pipelineCaseId: { in: [caseCollisionOne.id, caseCollisionTwo.id] } } }) === 1);

  const ownerRaceCase = await prisma.pipelineCase.create({ data: caseData(`${run}-owner-race`, tenant.id, sellerOne) });
  const ownerRace = await Promise.all([
    captured(() => domain.assignPipelineCaseOwner(ctxA, { caseId: ownerRaceCase.id, expectedVersion: 1, requestId: request("owner-race-assign"), ownerMembershipId: sellerTwo.id })),
    captured(() => domain.unassignPipelineCaseOwner(ctxA, { caseId: ownerRaceCase.id, expectedVersion: 1, requestId: request("owner-race-unassign") })),
  ]);
  check("asignación frente a desasignación tiene un ganador", ownerRace.filter((item) => item.ok).length === 1
    && ownerRace.filter((item) => ["CRM_PIPELINE_COMMAND_IN_PROGRESS", "CRM_PIPELINE_VERSION_CONFLICT"].includes(item.error?.code)).length === 1);
  check("carrera de owner deja pareja completa o nula", await prisma.pipelineCase.findUnique({ where: { id: ownerRaceCase.id } }).then((row) => row.version === 2
    && ((row.ownerMembershipId === sellerTwo.id && row.ownerUserId === sellerTwo.userId) || (row.ownerMembershipId === null && row.ownerUserId === null))));

  const lockTimeoutCase = await prisma.pipelineCase.create({ data: caseData(`${run}-lock-timeout`, tenant.id, sellerOne) });
  let releaseRowLock;
  let rowLocked;
  const rowLockedPromise = new Promise((resolve) => { rowLocked = resolve; });
  const releasePromise = new Promise((resolve) => { releaseRowLock = resolve; });
  const holder = prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "osi"."osi_pipeline_cases" WHERE "id"=${lockTimeoutCase.id} FOR UPDATE`);
    rowLocked();
    await releasePromise;
  }, { timeout: 5_000 });
  await rowLockedPromise;
  const lockTimeoutResult = await captured(() => domain.transitionPipelineCase(ctxV, { caseId: lockTimeoutCase.id, expectedVersion: 1, requestId: request("lock-timeout"), toStatus: "AWAITING_ICP" }));
  releaseRowLock();
  await holder;
  check("lock_timeout se clasifica 409 recuperable", lockTimeoutResult.error?.code === "CRM_PIPELINE_COMMAND_IN_PROGRESS"
    && lockTimeoutResult.error.status === 409 && lockTimeoutResult.error.recoverable === true && lockTimeoutResult.error.retryAfterMs >= 75 && lockTimeoutResult.error.retryAfterMs <= 175);
  check("lock_timeout no deja escritura parcial", (await prisma.pipelineCase.findUnique({ where: { id: lockTimeoutCase.id } })).version === 1
    && await prisma.pipelineCaseCommand.count({ where: { pipelineCaseId: lockTimeoutCase.id } }) === 0);

  const statementTimeoutCase = await prisma.pipelineCase.create({ data: caseData(`${run}-statement-timeout`, tenant.id, sellerOne) });
  await prisma.$executeRawUnsafe(`CREATE FUNCTION "osi"."crm01b2_test_statement_timeout"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."id" = '${statementTimeoutCase.id}' THEN PERFORM pg_sleep(3.2); END IF; RETURN NEW; END $$`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER "crm01b2_test_statement_timeout_trigger" BEFORE UPDATE ON "osi"."osi_pipeline_cases" FOR EACH ROW EXECUTE FUNCTION "osi"."crm01b2_test_statement_timeout"()`);
  const statementTimeoutResult = await captured(() => domain.transitionPipelineCase(ctxV, { caseId: statementTimeoutCase.id, expectedVersion: 1, requestId: request("statement-timeout"), toStatus: "AWAITING_ICP" }));
  await prisma.$executeRawUnsafe(`DROP TRIGGER "crm01b2_test_statement_timeout_trigger" ON "osi"."osi_pipeline_cases"`);
  await prisma.$executeRawUnsafe(`DROP FUNCTION "osi"."crm01b2_test_statement_timeout"()`);
  check("statement_timeout se clasifica 503 recuperable", statementTimeoutResult.error?.code === "CRM_PIPELINE_DATABASE_UNAVAILABLE"
    && statementTimeoutResult.error.status === 503 && statementTimeoutResult.error.recoverable === true);
  check("statement_timeout revierte caso, journal y auditoría", (await prisma.pipelineCase.findUnique({ where: { id: statementTimeoutCase.id } })).version === 1
    && await prisma.pipelineCaseCommand.count({ where: { pipelineCaseId: statementTimeoutCase.id } }) === 0
    && await prisma.commercialAuditLog.count({ where: { entityId: statementTimeoutCase.id } }) === 0);

  const originalTransaction = appPrisma.$transaction;
  appPrisma.$transaction = async () => { const error = new Error("sensitive connection detail"); error.code = "P1017"; throw error; };
  const connectionLoss = await captured(() => domain.transitionPipelineCase(ctxV, { caseId: statementTimeoutCase.id, expectedVersion: 1, requestId: request("connection-loss"), toStatus: "AWAITING_ICP" }));
  appPrisma.$transaction = originalTransaction;
  check("pérdida de conexión se clasifica 503 recuperable y sanitizada", connectionLoss.error?.code === "CRM_PIPELINE_DATABASE_UNAVAILABLE"
    && connectionLoss.error.status === 503 && connectionLoss.error.recoverable === true && !connectionLoss.error.message.includes("sensitive"));
  check("identidad local validada antes de escribir", target.address === "127.0.0.1" && target.port === 55432 && ["osi_crm01b2_local", "osi_db01n_ci"].includes(target.database));
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, assertions: results.filter((item) => item.passed).length, results, error: { name: error.name, code: error.code || null, message: error.message } }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  try {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "crm01b2_test_statement_timeout_trigger" ON "osi"."osi_pipeline_cases"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "osi"."crm01b2_test_statement_timeout"()`);
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
  console.error = originalConsoleError;
}

if (!process.exitCode) process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, passed: results.length, failed: 0, results }, null, 2)}\n`);
