import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { createCrm01aLocalPrisma } from "./crm-01a-local-target.mjs";

const { prisma, target } = await createCrm01aLocalPrisma();
process.env.DATABASE_URL = process.env.CRM01A_TEST_DATABASE_URL;
process.env.DIRECT_URL = process.env.CRM01A_TEST_DATABASE_URL;
process.env.JWT_SECRET = "crm01a-local-jwt-secret-not-for-runtime";
process.env.MT01B_AUTH_MODE = "LEGACY";
process.env.MT01B_TENANT_SWITCH_ENABLED = "false";
process.env.VITE_MT01B2_CLIENT_ENABLED = "false";
process.env.CRM_PIPELINE_RUNTIME_MODE = "READ_ONLY";

const [
  crm,
  { signAccessToken },
  { createIdentity, mockResponse, syntheticRequest },
  { default: listHandler },
  { default: detailHandler },
  { default: summaryHandler },
] = await Promise.all([
  import("../api/_lib/crmPipelineRead.js"),
  import("../api/_lib/auth.js"),
  import("./mt-01b1-test-helpers.mjs"),
  import("../api/crm/pipeline-cases/index.js"),
  import("../api/crm/pipeline-cases/[id].js"),
  import("../api/crm/pipeline-summary.js"),
]);

const run = `crm01a-${randomUUID().slice(0, 8)}`;
const results = [];
const created = { cases: [], memberships: [], users: [], tenants: [] };

function check(name, condition, detail) {
  results.push({ name, passed: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
  if (!condition) throw new Error(name);
}

function tokenFor(identity) {
  return signAccessToken({ sub: identity.userId, email: `${identity.userId}@example.invalid`, role: identity.role });
}

async function identity(label, options = {}) {
  const value = await createIdentity(prisma, `${run}-${label}`, options);
  if (!options.tenantId) created.tenants.push(value.tenantId);
  if (!options.userId) created.users.push(value.userId);
  created.memberships.push(value.membershipId);
  return value;
}

function request(token, method = "GET", query = {}, extraHeaders = {}) {
  const base = syntheticRequest({ authorization: token ? `Bearer ${token}` : undefined });
  return {
    ...base,
    method,
    query,
    headers: { ...base.headers, ...extraHeaders },
  };
}

async function invoke(handler, req) {
  const res = mockResponse();
  await handler(req, res);
  return res;
}

async function expectError(name, promise, status, code) {
  const response = await promise;
  check(name, response.statusCode === status && response.body?.error === code, {
    status: response.statusCode,
    code: response.body?.error,
  });
  check(`${name}: no expone datos`, response.body?.data === undefined && response.body?.total === undefined);
  check(`${name}: cache privada`, response.getHeader("cache-control") === "private, no-store" && /authorization/i.test(String(response.getHeader("vary"))));
  return response;
}

function caseData(label, index, tenantId, owner) {
  const assigned = Boolean(owner);
  return {
    id: `${run}-case-${label}-${index}`,
    tenantId,
    caseCode: `${run}-CASE-${label}-${String(index).padStart(3, "0")}`.toUpperCase(),
    clientName: `Cliente ${index % 7}`,
    mode: index % 3 === 0 ? "EXPORT" : index % 3 === 1 ? "LOCAL" : "IMPORT",
    serviceType: index % 2 === 0 ? "MOVING" : "STORAGE",
    customerType: "L4_PERSONAL",
    status: crm.CRM_PIPELINE_STATUS_VALUES[index % crm.CRM_PIPELINE_STATUS_VALUES.length],
    ownerName: assigned ? "Owner histórico" : "Sin asignar",
    ownerMembershipId: owner?.membershipId || null,
    ownerUserId: owner?.userId || null,
    estimatedCbm: index + 0.5,
    requiresSurvey: index % 2 === 0,
    surveyMethod: index % 2 === 0 ? "PRESENCIAL" : "NO_APLICA",
    originLocation: `Origen ${index % 4}`,
    destinationLocation: `Destino ${index % 5}`,
  };
}

async function snapshot() {
  return prisma.pipelineCase.findMany({
    where: { id: { in: created.cases } },
    select: { id: true, tenantId: true, ownerMembershipId: true, ownerUserId: true, status: true, updatedAt: true },
    orderBy: { id: "asc" },
  });
}

async function cleanup() {
  await prisma.pipelineCase.deleteMany({ where: { id: { in: created.cases } } });
  await prisma.tenantMembership.deleteMany({ where: { id: { in: created.memberships } } });
  await prisma.user.deleteMany({ where: { id: { in: created.users } } });
  await prisma.tenant.deleteMany({ where: { id: { in: created.tenants } } });
}

try {
  check("destino local validado", target.address === "127.0.0.1" && target.port === 55432 && target.schema === "osi");
  check("modo ausente es DISABLED", crm.resolveCrmPipelineRuntimeMode({}) === "DISABLED");
  check("READ_ONLY local permitido", crm.resolveCrmPipelineRuntimeMode({ CRM_PIPELINE_RUNTIME_MODE: "READ_ONLY" }) === "READ_ONLY");
  for (const [name, value] of [
    ["desconocido", "ACTIVE"], ["BOM", "\uFEFFREAD_ONLY"], ["espacio", "READ_ONLY "],
    ["comillas", '"READ_ONLY"'], ["casing", "read_only"], ["newline", "READ_ONLY\n"],
  ]) {
    let error;
    try { crm.resolveCrmPipelineRuntimeMode({ CRM_PIPELINE_RUNTIME_MODE: value }); } catch (caught) { error = caught; }
    check(`modo ${name} rechazado`, error?.status === 503 && error?.code === "CRM_PIPELINE_CONFIGURATION_INVALID");
  }
  for (const env of [
    { CRM_PIPELINE_RUNTIME_MODE: "READ_ONLY", VERCEL: "1" },
    { CRM_PIPELINE_RUNTIME_MODE: "READ_ONLY", VERCEL_ENV: "preview" },
    { CRM_PIPELINE_RUNTIME_MODE: "READ_ONLY", VERCEL_ENV: "production" },
  ]) {
    let error;
    try { crm.resolveCrmPipelineRuntimeMode(env); } catch (caught) { error = caught; }
    check("READ_ONLY bloqueado en Vercel", error?.code === "CRM_PIPELINE_CONFIGURATION_INVALID");
  }

  const disabledBefore = await prisma.pipelineCase.count({ where: { id: { startsWith: run } } });
  process.env.CRM_PIPELINE_RUNTIME_MODE = "DISABLED";
  await expectError("endpoint desactivado controlado", invoke(listHandler, request(null)), 409, "CRM_PIPELINE_DISABLED");
  const disabledAfter = await prisma.pipelineCase.count({ where: { id: { startsWith: run } } });
  check("DISABLED no cambió filas", disabledBefore === disabledAfter);
  process.env.CRM_PIPELINE_RUNTIME_MODE = "READ_ONLY";

  const tenantOne = await identity("tenant-one", { role: "V" });
  const ownerOne = await identity("owner-one", { tenantId: tenantOne.tenantId, role: "V", isDefault: true });
  const deniedOne = await identity("denied-one", { tenantId: tenantOne.tenantId, role: "V", isDefault: true });
  await prisma.tenantMembership.update({ where: { id: deniedOne.membershipId }, data: { deniedPermissions: [crm.CRM_PIPELINE_PERMISSION] } });
  const suspendedMembership = await identity("suspended-membership", { tenantId: tenantOne.tenantId, role: "V", isDefault: true });
  await prisma.tenantMembership.update({ where: { id: suspendedMembership.membershipId }, data: { status: "SUSPENDED" } });
  const tenantTwo = await identity("tenant-two", { role: "V" });
  const ownerTwo = await identity("owner-two", { tenantId: tenantTwo.tenantId, role: "V", isDefault: true });
  const suspendedTenant = await identity("suspended-tenant", { role: "V" });
  await prisma.tenant.update({ where: { id: suspendedTenant.tenantId }, data: { status: "SUSPENDED" } });

  const casesOne = Array.from({ length: 51 }, (_, index) => caseData("one", index, tenantOne.tenantId, index < 39 ? ownerOne : null));
  const casesTwo = Array.from({ length: 4 }, (_, index) => caseData("two", index, tenantTwo.tenantId, ownerTwo));
  await prisma.pipelineCase.createMany({ data: [...casesOne, ...casesTwo] });
  created.cases.push(...casesOne.map((item) => item.id), ...casesTwo.map((item) => item.id));

  let crossOwnerError;
  try {
    await prisma.pipelineCase.create({ data: caseData("cross-owner", 0, tenantOne.tenantId, ownerTwo) });
  } catch (error) { crossOwnerError = error; }
  check("FK rechaza owner de otro tenant", crossOwnerError?.code === "P2003");

  const tokenOne = tokenFor(tenantOne);
  const list = await invoke(listHandler, request(tokenOne, "GET", { page: "1", pageSize: "20" }));
  check("lista tenantizada 51", list.statusCode === 200 && list.body.total === 51 && list.body.data.length === 20);
  check("lista usa cache privada", list.getHeader("cache-control") === "private, no-store" && /authorization/i.test(String(list.getHeader("vary"))));
  check("owner es vista segura", list.body.data.filter((item) => item.owner).every((item) => item.owner.membershipId === ownerOne.membershipId && item.owner.displayName && item.owner.role === "V"));
  const forbiddenFields = ["tenantId", "ownerId", "ownerUserId", "grantedPermissions", "deniedPermissions", "milestonesJson", "flags"];
  check("campos internos ausentes", list.body.data.every((item) => forbiddenFields.every((field) => !(field in item))));
  check("paginación contractual", list.body.page === 1 && list.body.pageSize === 20);
  const tenantTwoList = await invoke(listHandler, request(tokenFor(tenantTwo), "GET", { pageSize: "100" }));
  check("segundo tenant sólo ve sus cuatro casos", tenantTwoList.statusCode === 200 && tenantTwoList.body.total === 4 && tenantTwoList.body.data.every((item) => item.id.includes("-two-")));

  const allIds = [];
  for (let page = 1; page <= 6; page += 1) {
    const response = await invoke(listHandler, request(tokenOne, "GET", { page: String(page), pageSize: "10" }));
    allIds.push(...response.body.data.map((item) => item.id));
  }
  check("paginación estable sin duplicados", allIds.length === 51 && new Set(allIds).size === 51);

  const unassigned = await invoke(listHandler, request(tokenOne, "GET", { unassigned: "true", pageSize: "100" }));
  check("12 sin owner", unassigned.statusCode === 200 && unassigned.body.total === 12 && unassigned.body.data.every((item) => item.owner === null));
  const assigned = await invoke(listHandler, request(tokenOne, "GET", { unassigned: "false", pageSize: "100" }));
  check("39 asignados", assigned.body.total === 39 && assigned.body.data.every((item) => item.owner?.membershipId === ownerOne.membershipId));
  const byOwner = await invoke(listHandler, request(tokenOne, "GET", { ownerMembershipId: ownerOne.membershipId, pageSize: "100" }));
  check("filtro owner relacional", byOwner.body.total === 39);
  const byStatus = await invoke(listHandler, request(tokenOne, "GET", { status: casesOne[0].status, pageSize: "100" }));
  check("filtro estado tenantizado", byStatus.body.data.every((item) => item.status === casesOne[0].status));
  const bySearch = await invoke(listHandler, request(tokenOne, "GET", { q: "Origen 2", pageSize: "100" }));
  check("búsqueda allowlist tenantizada", bySearch.body.total > 0 && bySearch.body.data.every((item) => item.originLocation === "Origen 2"));

  const detail = await invoke(detailHandler, request(tokenOne, "GET", { id: casesOne[0].id }));
  check("detalle mismo tenant", detail.statusCode === 200 && detail.body.data.id === casesOne[0].id);
  await expectError("cross-tenant indistinguible", invoke(detailHandler, request(tokenOne, "GET", { id: casesTwo[0].id })), 404, "CRM_PIPELINE_RESOURCE_NOT_FOUND");
  await prisma.tenantMembership.update({ where: { id: ownerOne.membershipId }, data: { status: "SUSPENDED" } });
  const historical = await invoke(detailHandler, request(tokenOne, "GET", { id: casesOne[0].id }));
  check("owner suspendido se muestra histórico", historical.body.data.owner.membershipStatus === "SUSPENDED");
  await prisma.tenantMembership.update({ where: { id: ownerOne.membershipId }, data: { status: "ACTIVE" } });

  const summary = await invoke(summaryHandler, request(tokenOne));
  check("resumen por tenant", summary.statusCode === 200 && summary.body.data.total === 51 && summary.body.data.assigned === 39 && summary.body.data.unassigned === 12);
  check("SLA no inventado", summary.body.data.sla.overdue === null && summary.body.data.sla.basis === "UNAVAILABLE");
  check("todos los estados presentes", Object.keys(summary.body.data.byStatus).length === crm.CRM_PIPELINE_STATUS_VALUES.length);

  await expectError("permiso denegado prevalece", invoke(listHandler, request(tokenFor(deniedOne))), 403, "COMMERCIAL_PERMISSION_FORBIDDEN");
  await expectError("membresía suspendida", invoke(listHandler, request(tokenFor(suspendedMembership))), 403, "COMMERCIAL_MEMBERSHIP_INACTIVE");
  await expectError("tenant suspendido", invoke(listHandler, request(tokenFor(suspendedTenant))), 403, "COMMERCIAL_TENANT_INACTIVE");
  await expectError("headers falsificados no autorizan", invoke(listHandler, request(null, "GET", {}, { "x-osi-role": "A", "x-osi-userid": tenantOne.userId })), 401, "COMMERCIAL_AUTH_REQUIRED");
  await expectError("dos Authorization rechazados", invoke(listHandler, request(null, "GET", {}, { authorization: ["Bearer x", `Bearer ${tokenOne}`] })), 401, "COMMERCIAL_AUTH_REQUIRED");
  const invalidV2 = jwt.sign({ ver: 2, typ: "access", membershipId: ownerOne.membershipId, tenantId: tenantOne.tenantId }, "wrong-secret");
  const v2Response = await invoke(listHandler, request(invalidV2));
  check("V2 inválido no degrada a LEGACY", v2Response.statusCode === 401 && /^MT01B_/.test(String(v2Response.body?.error || "")));

  await expectError("filtro desconocido", invoke(listHandler, request(tokenOne, "GET", { tenantId: tenantTwo.tenantId })), 400, "CRM_PIPELINE_FILTER_INVALID");
  await expectError("pageSize mayor a 100", invoke(listHandler, request(tokenOne, "GET", { pageSize: "101" })), 400, "CRM_PIPELINE_FILTER_INVALID");
  await expectError("POST inexistente", invoke(listHandler, request(tokenOne, "POST")), 405, "Method Not Allowed");

  const before = await snapshot();
  await invoke(listHandler, request(tokenOne, "GET", { pageSize: "100" }));
  await invoke(listHandler, request(tokenOne, "GET", { pageSize: "100" }));
  const after = await snapshot();
  check("dos GET no escriben", JSON.stringify(before) === JSON.stringify(after));

  const failurePrisma = {
    pipelineCase: {
      count: () => Promise.reject(new Error("secret database URL")),
      findMany: () => Promise.resolve([]),
    },
    $transaction: (operations) => Promise.all(operations),
  };
  let failure;
  try {
    await crm.listCrmPipelineCases(failurePrisma, { tenantId: tenantOne.tenantId, filters: crm.parsePipelineListQuery({}) });
  } catch (error) { failure = error; }
  check("falla Prisma sanitizada", failure?.status === 503 && failure?.code === "COMMERCIAL_CONTEXT_DATABASE_UNAVAILABLE" && !String(failure.message).includes("secret"));

  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, target, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, assertions: results.filter((item) => item.passed).length, error: error.message, results }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  try { await cleanup(); } catch {}
  await prisma.$disconnect();
}
