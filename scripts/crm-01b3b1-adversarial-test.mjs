import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import jwt from "jsonwebtoken";
import { createCrm01b2LocalPrisma } from "./crm-01b2-local-target.mjs";
import { mockResponse, syntheticRequest } from "./mt-01b1-test-helpers.mjs";

const { prisma, target } = await createCrm01b2LocalPrisma();
process.env.DATABASE_URL = process.env.CRM01B2_TEST_DATABASE_URL;
process.env.DIRECT_URL = process.env.CRM01B2_TEST_DATABASE_URL;
process.env.JWT_SECRET = "crm01b3b1-adversarial-local-secret";
process.env.MT01B_AUTH_MODE = "LEGACY";
process.env.MT01B_TENANT_SWITCH_ENABLED = "false";
process.env.VITE_MT01B2_CLIENT_ENABLED = "false";

const [
  auth,
  access,
  read,
  { PERMS },
  { createPipelineCasesListHandler },
  { createPipelineCaseDetailHandler },
  { createPipelineSummaryHandler },
  { createPipelineAllowedTransitionsHandler },
  { createPipelineTransitionHandler },
  domain,
] = await Promise.all([
  import("../api/_lib/auth.js"),
  import("../api/_lib/crmPipelineAccess.js"),
  import("../api/_lib/crmPipelineRead.js"),
  import("../api/_lib/rbac.js"),
  import("../api/crm/pipeline-cases/index.js"),
  import("../api/crm/pipeline-cases/[caseKey]/index.js"),
  import("../api/crm/pipeline-summary.js"),
  import("../api/crm/pipeline-cases/[caseKey]/allowed-transitions.js"),
  import("../api/crm/pipeline-cases/[caseKey]/transition.js"),
  import("../api/_lib/pipelineCaseDomain.js"),
]);

const run = `crm01b3b1-${randomUUID().slice(0, 8)}`;
const prefix = run.replace(/[^a-z0-9]/gi, "").slice(0, 18).toUpperCase();
const results = [];
const timings = {};
const productionRead = Object.freeze({
  VERCEL: "1",
  VERCEL_ENV: "production",
  VERCEL_GIT_COMMIT_REF: "main",
  CRM_PIPELINE_RUNTIME_MODE: "PRODUCTION_READ",
  CRM_PIPELINE_MUTATION_MODE: "DISABLED",
  CRM_PIPELINE_ACTIVATION_BATCH: access.CRM_PIPELINE_ACTIVATION_BATCH,
  COMMERCIAL_TENANCY_WRITE_MODE: "TENANT_WRITE",
  COMMERCIAL_TENANCY_READ_MODE: "TENANT_READ",
  COMMERCIAL_TENANCY_ACTIVATION_BATCH: "MT-01C2B2-IPACKERS-DO-V1",
  MT01B_AUTH_MODE: "LEGACY",
  MT01B_TENANT_SWITCH_ENABLED: "false",
  VITE_MT01B2_CLIENT_ENABLED: "false",
  MT01B_ALLOWED_ORIGINS: "http://localhost:5173",
});
const productionWrite = Object.freeze({ ...productionRead, CRM_PIPELINE_MUTATION_MODE: "PRODUCTION_WRITE", CRM_PIPELINE_OWNER_REF_SECRET: "A".repeat(64) });

function check(name, condition, detail) {
  results.push({ name, passed: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
  if (!condition) throw new Error(name);
}

function userData(id, role = "V", status = "active") {
  return { id, code: id.toUpperCase(), name: `Synthetic ${role}`, email: `${id}@example.invalid`, phone: "0", joinDate: "2026-08-12", passwordHash: "local-only", role, status };
}

function caseData(id, tenantId, owner) {
  return {
    id,
    tenantId,
    caseCode: id.toUpperCase(),
    clientName: "Synthetic",
    mode: "LOCAL",
    serviceType: "MOVING",
    customerType: "L4_PERSONAL",
    status: "NEW_INBOX",
    ownerName: "Synthetic V",
    ownerMembershipId: owner.id,
    ownerUserId: owner.userId,
    originLocation: "Origin",
    destinationLocation: "Destination",
  };
}

function request(token, { method = "GET", id, caseRef, body, idempotencyKey, headers = {}, url } = {}) {
  const base = syntheticRequest({ authorization: token ? `Bearer ${token}` : undefined });
  const nextHeaders = { ...base.headers, ...headers };
  if (body !== undefined) nextHeaders["content-type"] = "application/json";
  if (idempotencyKey) nextHeaders["idempotency-key"] = idempotencyKey;
  return {
    ...base,
    method,
    url: url || (caseRef ? `/api/crm/pipeline-cases/${caseRef}` : id ? `/api/crm/pipeline-cases/${id}` : "/api/crm/pipeline-cases"),
    query: caseRef ? { caseKey: caseRef } : id ? { id } : {},
    headers: nextHeaders,
    rawHeaders: Object.entries(nextHeaders).flat(),
    ...(body === undefined ? {} : { body }),
  };
}

async function invoke(handler, req) {
  const res = mockResponse();
  await handler(req, res);
  return res;
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

async function benchmark(name, operation, queries) {
  for (let index = 0; index < 10; index += 1) await operation();
  const values = [];
  for (let index = 0; index < 100; index += 1) {
    const started = performance.now();
    await operation();
    values.push(performance.now() - started);
  }
  timings[name] = Object.freeze({
    requests: 100,
    queries,
    p50Ms: Number(percentile(values, 0.5).toFixed(3)),
    p95Ms: Number(percentile(values, 0.95).toFixed(3)),
    maxMs: Number(Math.max(...values).toFixed(3)),
  });
}

async function cleanup() {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`LOCK TABLE "osi"."commercial_audit_logs", "osi"."pipeline_case_commands" IN ACCESS EXCLUSIVE MODE`);
    await tx.$executeRawUnsafe(`ALTER TABLE "osi"."commercial_audit_logs" DISABLE TRIGGER "commercial_audit_logs_append_only"`);
    await tx.$executeRawUnsafe(`ALTER TABLE "osi"."pipeline_case_commands" DISABLE TRIGGER "pipeline_case_commands_append_only"`);
    await tx.commercialAuditLog.deleteMany({ where: { entityId: { startsWith: run } } });
    await tx.pipelineCaseCommand.deleteMany({ where: { pipelineCaseId: { startsWith: run } } });
    await tx.$executeRawUnsafe(`ALTER TABLE "osi"."pipeline_case_commands" ENABLE TRIGGER "pipeline_case_commands_append_only"`);
    await tx.$executeRawUnsafe(`ALTER TABLE "osi"."commercial_audit_logs" ENABLE TRIGGER "commercial_audit_logs_append_only"`);
    await tx.authRefreshToken.deleteMany({ where: { session: { id: { startsWith: run } } } });
    await tx.authSession.deleteMany({ where: { id: { startsWith: run } } });
    await tx.pipelineCase.deleteMany({ where: { id: { startsWith: run } } });
    await tx.tenantMembership.deleteMany({ where: { id: { startsWith: run } } });
    await tx.user.deleteMany({ where: { id: { startsWith: run } } });
    await tx.tenant.deleteMany({ where: { id: { startsWith: run } } });
  });
}

try {
  check("destino PostgreSQL local exacto", target.address === "127.0.0.1" && target.port === 55432);
  const tenant = await prisma.tenant.create({ data: { id: `${run}-tenant`, code: `${prefix}-T`, name: "Synthetic" } });
  const tenantTwo = await prisma.tenant.create({ data: { id: `${run}-tenant-2`, code: `${prefix}-T2`, name: "Synthetic 2" } });
  const sellerUser = await prisma.user.create({ data: userData(`${run}-seller`) });
  const sellerTwoUser = await prisma.user.create({ data: userData(`${run}-seller-2`) });
  const roleKUser = await prisma.user.create({ data: userData(`${run}-role-k`, "K") });
  const seller = await prisma.tenantMembership.create({ data: { id: `${run}-membership`, tenantId: tenant.id, userId: sellerUser.id, role: "V", isDefault: true } });
  const sellerTwo = await prisma.tenantMembership.create({ data: { id: `${run}-membership-2`, tenantId: tenantTwo.id, userId: sellerTwoUser.id, role: "V", isDefault: true } });
  const roleK = await prisma.tenantMembership.create({ data: { id: `${run}-membership-k`, tenantId: tenant.id, userId: roleKUser.id, role: "K", isDefault: true, grantedPermissions: [PERMS.PIPELINE_VIEW, PERMS.PIPELINE_TRANSITION] } });
  const pipelineCase = await prisma.pipelineCase.create({ data: caseData(`${run}-case`, tenant.id, { id: seller.id, userId: sellerUser.id }) });
  await prisma.pipelineCase.create({ data: caseData(`${run}-case-2`, tenantTwo.id, { id: sellerTwo.id, userId: sellerTwoUser.id }) });
  const session = await prisma.authSession.create({ data: { id: `${run}-session`, tenantId: tenant.id, membershipId: seller.id, userId: sellerUser.id, status: "ACTIVE", authorizationVersionSnapshot: 1, fingerprintHash: "a".repeat(64), expiresAt: new Date(Date.now() + 3600_000) } });

  const legacyToken = auth.signAccessToken({ sub: sellerUser.id, email: sellerUser.email, role: "A" });
  const legacyTokenTwo = auth.signAccessToken({ sub: sellerTwoUser.id, email: sellerTwoUser.email, role: "A" });
  const roleKToken = auth.signAccessToken({ sub: roleKUser.id, email: roleKUser.email, role: "A" });
  const v2Token = auth.signMembershipAccessToken({ userId: sellerUser.id, membershipId: seller.id, tenantId: tenant.id, role: "V", authorizationVersion: 1, sessionId: session.id });

  const list = createPipelineCasesListHandler({ prismaClient: prisma, env: productionRead });
  const detail = createPipelineCaseDetailHandler({ prismaClient: prisma, env: productionRead });
  const summary = createPipelineSummaryHandler({ prismaClient: prisma, env: productionRead });
  const allowedReadBlocked = createPipelineAllowedTransitionsHandler({ env: productionRead });
  const allowed = createPipelineAllowedTransitionsHandler({ env: productionWrite });
  const transition = createPipelineTransitionHandler({ env: productionWrite });

  check("PRODUCTION_READ lista activa", (await invoke(list, request(legacyToken))).statusCode === 200);
  check("PRODUCTION_READ detalle aislado", (await invoke(detail, request(legacyToken, { caseRef: pipelineCase.publicRef }))).statusCode === 200);
  check("PRODUCTION_READ resumen activo", (await invoke(summary, request(legacyToken))).statusCode === 200);
  const crossTenant = await invoke(detail, request(legacyTokenTwo, { caseRef: pipelineCase.publicRef }));
  check("cross-tenant indistinguible", crossTenant.statusCode === 404 && crossTenant.body?.error === "CRM_PIPELINE_RESOURCE_NOT_FOUND");
  check("PRODUCTION_READ mantiene mutaciones bloqueadas", (await invoke(allowedReadBlocked, request(legacyToken, { id: pipelineCase.id, url: `/api/crm/pipeline-cases/${pipelineCase.id}/allowed-transitions` }))).statusCode === 409);

  const kDenied = await invoke(list, request(roleKToken));
  check("grant no amplía roles fuera de A/V", kDenied.statusCode === 403 && kDenied.body?.error === "COMMERCIAL_PERMISSION_FORBIDDEN");

  const v2Disabled = await invoke(list, request(v2Token));
  check("V2 válido se rechaza con LEGACY", v2Disabled.statusCode === 401 && v2Disabled.body?.error === "COMMERCIAL_AUTH_INVALID");
  const membershipOnlyList = createPipelineCasesListHandler({ prismaClient: prisma, env: { CRM_PIPELINE_RUNTIME_MODE: "READ_ONLY", MT01B_AUTH_MODE: "MEMBERSHIP_ONLY", MT01B_TENANT_SWITCH_ENABLED: "false", VITE_MT01B2_CLIENT_ENABLED: "false" } });
  check("V2 válido sólo en contexto soportado", (await invoke(membershipOnlyList, request(v2Token))).statusCode === 200);
  const badSignature = v2Token.split(".");
  badSignature[2] = `${badSignature[2][0] === "a" ? "b" : "a"}${badSignature[2].slice(1)}`;
  const badV2 = await invoke(membershipOnlyList, request(badSignature.join(".")));
  check("V2 mal firmado no degrada", badV2.statusCode === 401 && badV2.body?.error === "COMMERCIAL_AUTH_INVALID");
  const expiredLegacy = jwt.sign({ sub: sellerUser.id, email: sellerUser.email, role: "V" }, process.env.JWT_SECRET, { algorithm: "HS256", expiresIn: -1 });
  check("LEGACY expirado rechazado", (await invoke(list, request(expiredLegacy))).statusCode === 401);
  const ambiguous = jwt.sign({ sub: sellerUser.id, email: sellerUser.email, role: "V", ver: 2, typ: "access" }, process.env.JWT_SECRET, { algorithm: "HS256", expiresIn: 60 });
  check("contrato ambiguo rechazado", (await invoke(list, request(ambiguous))).statusCode === 401);
  const parts = v2Token.split(".");
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  for (const key of ["ver", "typ", "membershipId", "tenantId", "authorizationVersion", "sid", "jti", "iss", "aud"]) delete payload[key];
  parts[1] = Buffer.from(JSON.stringify(payload)).toString("base64url");
  check("V2 manipulado para parecer LEGACY rechazado", (await invoke(list, request(parts.join(".")))).statusCode === 401);

  const firstRequest = request(legacyToken);
  const first = await access.resolveCrmPipelineContext(firstRequest, { prisma, env: productionRead });
  const firstAgain = await access.resolveCrmPipelineContext(firstRequest, { prisma, env: productionRead });
  const second = await access.resolveCrmPipelineContext(request(legacyTokenTwo), { prisma, env: productionRead });
  check("caché vive sólo en request", first === firstAgain && first.userId !== second.userId && first.tenantId !== second.tenantId);

  await prisma.tenantMembership.update({ where: { id: seller.id }, data: { isDefault: false } });
  const noDefault = await invoke(list, request(legacyToken));
  check("membresía default ausente devuelve 409", noDefault.statusCode === 409 && noDefault.body?.error === "COMMERCIAL_DEFAULT_MEMBERSHIP_REQUIRED");
  await prisma.tenantMembership.update({ where: { id: seller.id }, data: { isDefault: true } });
  await prisma.user.update({ where: { id: sellerUser.id }, data: { status: "unknown" } });
  check("estado global desconocido devuelve 401", (await invoke(list, request(legacyToken))).statusCode === 401);
  await prisma.user.update({ where: { id: sellerUser.id }, data: { status: "active" } });
  await prisma.authSession.update({ where: { id: session.id }, data: { status: "REVOKED" } });
  check("V2 revocado devuelve 401", (await invoke(membershipOnlyList, request(v2Token))).statusCode === 401);
  await prisma.authSession.update({ where: { id: session.id }, data: { status: "ACTIVE" } });

  const legacyRow = {
    tenant_id: tenant.id,
    membership_id: seller.id,
    user_id: sellerUser.id,
    membership_role: "V",
    membership_status: "ACTIVE",
    granted_permissions: [],
    denied_permissions: [],
    authorization_version: 1,
    tenant_status: "ACTIVE",
    user_status: "active",
  };
  let ambiguousError;
  try {
    await access.resolveCrmPipelineContext(request(legacyToken), { prisma: { $queryRaw: async () => [legacyRow, legacyRow] }, env: productionRead });
  } catch (error) { ambiguousError = error; }
  check("membresía default ambigua devuelve 409", ambiguousError?.status === 409 && ambiguousError?.code === "COMMERCIAL_DEFAULT_MEMBERSHIP_AMBIGUOUS");
  let databaseError;
  try {
    await access.resolveCrmPipelineContext(request(legacyToken), { prisma: { $queryRaw: async () => { throw new Error("synthetic database failure"); } }, env: productionRead });
  } catch (error) { databaseError = error; }
  check("fallo Prisma devuelve 503 sanitizado", databaseError?.status === 503 && databaseError?.code === "COMMERCIAL_CONTEXT_DATABASE_UNAVAILABLE" && !String(databaseError.message).includes("synthetic"));

  const allowedResult = await invoke(allowed, request(legacyToken, { id: pipelineCase.id, url: `/api/crm/pipeline-cases/${pipelineCase.id}/allowed-transitions` }));
  check("PRODUCTION_WRITE activa lectura de dominio", allowedResult.statusCode === 200 && Array.isArray(allowedResult.body?.case?.transitions), { status: allowedResult.statusCode, code: allowedResult.body?.code || allowedResult.body?.error });
  const commandBody = { expectedVersion: 1, toStatus: "AWAITING_ICP", reasonCode: null, evidence: null };
  const commandRequest = (body = commandBody) => request(legacyToken, {
    method: "POST",
    id: pipelineCase.id,
    url: `/api/crm/pipeline-cases/${pipelineCase.id}/transition`,
    body,
    idempotencyKey: `${run}.transition`,
  });
  const changed = await invoke(transition, commandRequest());
  const replay = await invoke(transition, commandRequest());
  const conflict = await invoke(transition, commandRequest({ ...commandBody, toStatus: "LOST", reasonCode: "OTHER" }));
  check("PRODUCTION_WRITE preserva transición", changed.statusCode === 200 && changed.body?.command?.resultingVersion === 2);
  check("PRODUCTION_WRITE preserva idempotencia", replay.statusCode === 200 && replay.body?.command?.replayed === true);
  check("PRODUCTION_WRITE preserva conflicto", conflict.statusCode === 409 && conflict.body?.code === "CRM_PIPELINE_IDEMPOTENCY_CONFLICT");

  const perfCase = await prisma.pipelineCase.create({ data: caseData(`${run}-case-perf`, tenant.id, { id: seller.id, userId: sellerUser.id }) });
  const perfContext = Object.freeze({ tenantId: tenant.id, membershipId: seller.id, userId: sellerUser.id });
  await benchmark("authContext", () => access.resolveCrmPipelineContext(request(legacyToken), { prisma, env: productionRead }), 1);
  await benchmark("list", () => read.listCrmPipelineCases(prisma, { tenantId: tenant.id, filters: read.parsePipelineListQuery({ page: "1", pageSize: "50" }) }), 2);
  await benchmark("detail", () => read.findCrmPipelineCase(prisma, { tenantId: tenant.id, caseRef: perfCase.publicRef }), 1);
  await benchmark("summary", () => read.summarizeCrmPipelineCases(prisma, { tenantId: tenant.id }), 3);
  await benchmark("allowedTransitions", () => domain.getAllowedPipelineTransitions(perfContext, perfCase.id), 4);
  check("100 requests cálidos por operación", Object.values(timings).every((entry) => entry.requests === 100));
  check("sin N+1 y presupuesto fijo", timings.list.queries === 2 && timings.detail.queries === 1 && timings.summary.queries === 3 && timings.allowedTransitions.queries === 4);

  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results, performance: timings, target: { host: target.address, port: target.port, database: target.database } }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, assertions: results.filter((entry) => entry.passed).length, error: { name: error.name, code: error.code || null, message: error.message }, results, performance: timings }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  try { await cleanup(); } catch (error) { process.stderr.write(`cleanup_failed:${error.name}\n`); process.exitCode = 1; }
  await prisma.$disconnect();
}
