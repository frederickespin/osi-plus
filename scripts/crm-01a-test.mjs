import { createHash, randomUUID } from "node:crypto";
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
process.env.MT01B_REFRESH_TOKEN_PEPPER = "crm01a-local-refresh-pepper-with-at-least-32-characters";
process.env.MT01B_ALLOWED_ORIGINS = "http://localhost:5173";
process.env.MT01B_LEGACY_TOKEN_ACCEPT_UNTIL = new Date(Date.now() + 24 * 3600_000).toISOString();
for (const key of Object.keys(process.env)) {
  if (key === "VERCEL" || key.startsWith("VERCEL_")) delete process.env[key];
}

const [
  crm,
  { signAccessToken },
  { createMembershipAuthSession },
  { PERMS, permsForRole },
  { createIdentity, mockResponse, syntheticRequest },
  { default: listHandler, createPipelineCasesListHandler },
  { default: detailHandler },
  { default: summaryHandler },
] = await Promise.all([
  import("../api/_lib/crmPipelineRead.js"),
  import("../api/_lib/auth.js"),
  import("../api/_lib/authSession.js"),
  import("../api/_lib/rbac.js"),
  import("./mt-01b1-test-helpers.mjs"),
  import("../api/crm/pipeline-cases/index.js"),
  import("../api/crm/pipeline-cases/[caseRef].js"),
  import("../api/crm/pipeline-summary.js"),
]);

const run = `crm01a-${randomUUID().slice(0, 8)}`;
const results = [];
const created = { cases: [], clients: [], memberships: [], users: [], tenants: [], sessions: [] };

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

async function assignOwnerFixture(pipelineCaseId, tenantId, nextOwner, actor, requestLabel) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.pipelineCase.findUniqueOrThrow({ where: { id: pipelineCaseId } });
    const resultingVersion = current.version + 1;
    await tx.pipelineCase.update({
      where: { id: pipelineCaseId },
      data: {
        version: resultingVersion,
        ownerMembershipId: nextOwner.membershipId,
        ownerUserId: nextOwner.userId,
      },
    });
    await tx.pipelineCaseCommand.create({ data: {
      id: `${run}-read-race-command-${requestLabel}`,
      tenantId,
      pipelineCaseId,
      requestId: `${run}.read-race.${requestLabel}`,
      commandType: "ASSIGN_OWNER",
      payloadHash: createHash("sha256").update(`${pipelineCaseId}:${requestLabel}`).digest("hex"),
      expectedVersion: current.version,
      resultingVersion,
      previousStatus: current.status,
      resultingStatus: current.status,
      previousOwnerMembershipId: current.ownerMembershipId,
      previousOwnerUserId: current.ownerUserId,
      resultingOwnerMembershipId: nextOwner.membershipId,
      resultingOwnerUserId: nextOwner.userId,
      actorMembershipId: actor.membershipId,
      actorUserId: actor.userId,
      actorRole: actor.role,
    } });
  });
}

function checkJsonSnapshot(name, actual, expected) {
  check(name, JSON.stringify(actual) === JSON.stringify(expected), {
    actual: JSON.stringify(actual),
    expected: JSON.stringify(expected),
  });
}

function normalizeSuccessContract(value) {
  return JSON.parse(JSON.stringify(value, (key, item) => {
    if (key === "id") return "<id>";
    if (key === "caseRef") return "<caseRef>";
    if (key === "caseNumber") return "<caseNumber>";
    if (key === "caseCode") return "<caseCode>";
    if (key === "displayName") return "<displayName>";
    if (key === "createdAt" || key === "updatedAt") return "<timestamp>";
    return item;
  }));
}

function caseData(label, index, tenantId, owner) {
  const assigned = Boolean(owner);
  const status = crm.CRM_PIPELINE_STATUS_VALUES[index % crm.CRM_PIPELINE_STATUS_VALUES.length];
  return {
    id: `${run}-case-${label}-${index}`,
    publicRef: randomUUID(),
    tenantId,
    caseCode: `${run}-CASE-${label}-${String(index).padStart(3, "0")}`.toUpperCase(),
    clientName: `Cliente ${index % 7}`,
    mode: index % 3 === 0 ? "EXPORT" : index % 3 === 1 ? "LOCAL" : "IMPORT",
    serviceType: index % 2 === 0 ? "MOVING" : "STORAGE",
    customerType: "L4_PERSONAL",
    status,
    lossReasonCode: status === "LOST" ? "OTHER" : null,
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
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`LOCK TABLE "osi"."pipeline_case_commands" IN ACCESS EXCLUSIVE MODE`);
    await tx.$executeRawUnsafe(`ALTER TABLE "osi"."pipeline_case_commands" DISABLE TRIGGER "pipeline_case_commands_append_only"`);
    await tx.pipelineCaseCommand.deleteMany({ where: { pipelineCaseId: { in: created.cases } } });
    await tx.$executeRawUnsafe(`ALTER TABLE "osi"."pipeline_case_commands" ENABLE TRIGGER "pipeline_case_commands_append_only"`);
  });
  await prisma.pipelineCase.deleteMany({ where: { id: { in: created.cases } } });
  await prisma.client.deleteMany({ where: { id: { in: created.clients } } });
  await prisma.authRefreshToken.deleteMany({ where: { sessionId: { in: created.sessions } } });
  await prisma.authSession.deleteMany({ where: { id: { in: created.sessions } } });
  await prisma.tenantMembership.deleteMany({ where: { id: { in: created.memberships } } });
  await prisma.user.deleteMany({ where: { id: { in: created.users } } });
  await prisma.tenant.deleteMany({ where: { id: { in: created.tenants } } });
}

try {
  check("destino local validado", target.address === "127.0.0.1" && target.port === 55432 && target.schema === "osi");
  check("modo ausente es DISABLED", crm.resolveCrmPipelineRuntimeMode({}) === "DISABLED");
  check("READ_ONLY local permitido", crm.resolveCrmPipelineRuntimeMode({ CRM_PIPELINE_RUNTIME_MODE: "READ_ONLY" }) === "READ_ONLY");
  check("permiso dedicado exacto", crm.CRM_PIPELINE_PERMISSION === PERMS.PIPELINE_VIEW && PERMS.PIPELINE_VIEW === "pipeline:view");
  check("matriz base A/V", ["A", "V"].every((role) => permsForRole(role).includes(PERMS.PIPELINE_VIEW)));
  check("matriz excluye K/B/I/operaciones", ["K", "B", "I", "C", "D", "E"].every((role) => !permsForRole(role).includes(PERMS.PIPELINE_VIEW)));
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
  check("resolver no conserva caché global", crm.resolveCrmPipelineRuntimeMode({ CRM_PIPELINE_RUNTIME_MODE: "READ_ONLY" }) === "READ_ONLY"
    && crm.resolveCrmPipelineRuntimeMode({}) === "DISABLED");

  let preGateCalls = 0;
  const preGateHandler = createPipelineCasesListHandler({
    prismaClient: {},
    requirePermission: async () => { preGateCalls += 1; return null; },
  });
  process.env.CRM_PIPELINE_RUNTIME_MODE = "\uFEFFREAD_ONLY";
  const invalidConfiguration = await invoke(preGateHandler, request(null));
  checkJsonSnapshot("snapshot 503 configuración", invalidConfiguration.body, { ok: false, error: "CRM_PIPELINE_CONFIGURATION_INVALID" });
  check("configuración inválida no autentica ni consulta", invalidConfiguration.statusCode === 503 && preGateCalls === 0);

  process.env.CRM_PIPELINE_RUNTIME_MODE = "DISABLED";
  const disabled = await expectError("endpoint desactivado controlado", invoke(preGateHandler, request(null)), 409, "CRM_PIPELINE_DISABLED");
  checkJsonSnapshot("snapshot 409 DISABLED", disabled.body, { ok: false, error: "CRM_PIPELINE_DISABLED" });
  check("DISABLED no autentica ni consulta", preGateCalls === 0);
  check("lista CRM desactivada sin CORS permisivo", disabled.getHeader("access-control-allow-origin") === undefined
    && disabled.getHeader("access-control-allow-credentials") === undefined);
  process.env.CRM_PIPELINE_RUNTIME_MODE = "READ_ONLY";

  const tenantOne = await identity("tenant-one", { role: "V" });
  const ownerOne = await identity("owner-one", { tenantId: tenantOne.tenantId, role: "V", isDefault: true });
  const alternateOwner = await identity("owner-alternate", { tenantId: tenantOne.tenantId, role: "V", isDefault: true });
  const adminOne = await identity("admin-one", { tenantId: tenantOne.tenantId, role: "A", isDefault: true });
  const clientsOnly = await identity("clients-only", { tenantId: tenantOne.tenantId, role: "K", isDefault: true });
  const explicitGrant = await identity("explicit-grant", { tenantId: tenantOne.tenantId, role: "K", isDefault: true });
  await prisma.tenantMembership.update({ where: { id: explicitGrant.membershipId }, data: { grantedPermissions: [PERMS.PIPELINE_VIEW] } });
  const deniedOne = await identity("denied-one", { tenantId: tenantOne.tenantId, role: "V", isDefault: true });
  await prisma.tenantMembership.update({ where: { id: deniedOne.membershipId }, data: { deniedPermissions: [crm.CRM_PIPELINE_PERMISSION] } });
  const suspendedMembership = await identity("suspended-membership", { tenantId: tenantOne.tenantId, role: "V", isDefault: true });
  await prisma.tenantMembership.update({ where: { id: suspendedMembership.membershipId }, data: { status: "SUSPENDED" } });
  const tenantTwo = await identity("tenant-two", { role: "V" });
  const ownerTwo = await identity("owner-two", { tenantId: tenantTwo.tenantId, role: "V", isDefault: true });
  const suspendedTenant = await identity("suspended-tenant", { role: "V" });
  await prisma.tenant.update({ where: { id: suspendedTenant.tenantId }, data: { status: "SUSPENDED" } });

  const serviceClientOne = await prisma.client.create({ data: {
    id: `${run}-client-one`, tenantId: tenantOne.tenantId, code: `${run}-CLIENT-ONE`.toUpperCase(),
    name: "Receptor relacional confirmado", email: "receiver-one@example.invalid", phone: "0000000000",
    address: "Dirección sintética", type: "PERSON", status: "active", createdAt: "2026-08-21",
  } });
  const serviceClientTwo = await prisma.client.create({ data: {
    id: `${run}-client-two`, tenantId: tenantTwo.tenantId, code: `${run}-CLIENT-TWO`.toUpperCase(),
    name: "Receptor de otro tenant", email: "receiver-two@example.invalid", phone: "0000000000",
    address: "Dirección sintética", type: "ORGANIZATION", status: "inactive", createdAt: "2026-08-21",
  } });
  created.clients.push(serviceClientOne.id, serviceClientTwo.id);

  const casesOne = Array.from({ length: 51 }, (_, index) => caseData("one", index, tenantOne.tenantId, index < 39 ? ownerOne : null));
  const casesTwo = Array.from({ length: 4 }, (_, index) => caseData("two", index, tenantTwo.tenantId, ownerTwo));
  casesOne[0].clientId = serviceClientOne.id;
  casesOne[0].clientName = "<img src=x onerror=legacy-authority>";
  casesTwo[0].clientId = serviceClientTwo.id;
  await prisma.pipelineCase.createMany({ data: [...casesOne, ...casesTwo] });
  created.cases.push(...casesOne.map((item) => item.id), ...casesTwo.map((item) => item.id));

  let duplicateCodeError;
  try {
    await prisma.pipelineCase.create({ data: { ...caseData("duplicate-code", 0, tenantTwo.tenantId, ownerTwo), caseCode: casesOne[0].caseCode } });
  } catch (error) { duplicateCodeError = error; }
  check("caseCode continúa globalmente único entre tenants", duplicateCodeError?.code === "P2002");

  let crossOwnerError;
  try {
    await prisma.pipelineCase.create({ data: caseData("cross-owner", 0, tenantOne.tenantId, ownerTwo) });
  } catch (error) { crossOwnerError = error; }
  check("FK rechaza owner de otro tenant", crossOwnerError?.code === "P2003");

  let crossClientError;
  try {
    await prisma.pipelineCase.create({ data: { ...caseData("cross-client", 0, tenantOne.tenantId, ownerOne), clientId: serviceClientTwo.id } });
  } catch (error) { crossClientError = error; }
  check("FK tenant-first rechaza Client de otro tenant", crossClientError?.code === "P2003");

  const tokenOne = tokenFor(tenantOne);
  const list = await invoke(listHandler, request(tokenOne, "GET", { page: "1", pageSize: "20" }));
  check("lista tenantizada 51", list.statusCode === 200 && list.body.total === 51 && list.body.data.length === 20);
  check("lista publica sólo caseRef UUID v4", list.body.data.every((item) => (
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(item.caseRef)
    && !Object.hasOwn(item, "id")
    && !Object.hasOwn(item, "publicRef")
  )));
  check("lista usa cache privada", list.getHeader("cache-control") === "private, no-store" && /authorization/i.test(String(list.getHeader("vary"))));
  check("owner es vista histórica mínima", list.body.data.filter((item) => item.owner).every((item) => item.owner.displayName && item.owner.role === "V" && item.owner.membershipStatus === "ACTIVE"));
  const forbiddenFields = ["tenantId", "ownerId", "ownerUserId", "membershipId", "userId", "userStatus", "email", "phone", "grantedPermissions", "deniedPermissions", "milestonesJson", "flags"];
  check("campos internos ausentes", list.body.data.every((item) => forbiddenFields.every((field) => !(field in item))));
  check("campos internos ausentes del owner", list.body.data.filter((item) => item.owner).every((item) => forbiddenFields.every((field) => !(field in item.owner))));
  check("paginación contractual", list.body.page === 1 && list.body.pageSize === 20);
  const tenantTwoList = await invoke(listHandler, request(tokenFor(tenantTwo), "GET", { pageSize: "100" }));
  check("segundo tenant sólo ve sus cuatro casos", tenantTwoList.statusCode === 200 && tenantTwoList.body.total === 4 && tenantTwoList.body.data.every((item) => item.caseCode.includes("-TWO-")));

  const allRefs = [];
  for (let page = 1; page <= 6; page += 1) {
    const response = await invoke(listHandler, request(tokenOne, "GET", { page: String(page), pageSize: "10" }));
    allRefs.push(...response.body.data.map((item) => item.caseRef));
  }
  check("paginación estable sin duplicados", allRefs.length === 51 && new Set(allRefs).size === 51);

  const unassigned = await invoke(listHandler, request(tokenOne, "GET", { unassigned: "true", pageSize: "100" }));
  check("12 sin owner", unassigned.statusCode === 200 && unassigned.body.total === 12 && unassigned.body.data.every((item) => item.owner === null));
  const assigned = await invoke(listHandler, request(tokenOne, "GET", { unassigned: "false", pageSize: "100" }));
  check("39 asignados", assigned.body.total === 39 && assigned.body.data.every((item) => item.owner?.displayName && item.owner.role === "V"));
  const byOwner = await invoke(listHandler, request(tokenOne, "GET", { ownerMembershipId: ownerOne.membershipId, pageSize: "100" }));
  check("filtro de ID interno rechazado", byOwner.statusCode === 400 && byOwner.body.error === "CRM_PIPELINE_FILTER_INVALID");
  const byStatus = await invoke(listHandler, request(tokenOne, "GET", { status: casesOne[0].status, pageSize: "100" }));
  check("filtro estado tenantizado", byStatus.body.data.every((item) => item.status === casesOne[0].status));
  const bySearch = await invoke(listHandler, request(tokenOne, "GET", { q: "Origen 2", pageSize: "100" }));
  check("búsqueda allowlist tenantizada", bySearch.body.total > 0 && bySearch.body.data.every((item) => item.originLocation === "Origen 2"));

  const detail = await invoke(detailHandler, request(tokenOne, "GET", { caseRef: casesOne[0].publicRef }));
  check("detalle mismo tenant", detail.statusCode === 200 && detail.body.data.caseRef === casesOne[0].publicRef);
  check("Client relacional prevalece sobre clientName legacy", detail.body.data.client?.displayName === serviceClientOne.name
    && !JSON.stringify(detail.body.data).includes(casesOne[0].clientName));
  check("detalle no expone clientId", !Object.hasOwn(detail.body.data, "clientId") && !Object.hasOwn(detail.body.data, "id"));
  check("detalle CRM sin CORS permisivo", detail.getHeader("access-control-allow-origin") === undefined
    && detail.getHeader("access-control-allow-credentials") === undefined);
  const snapshotList = await invoke(listHandler, request(tokenOne, "GET", { q: casesOne[0].caseCode, pageSize: "1" }));
  const expectedCaseContract = {
    caseRef: "<caseRef>", caseCode: "<caseCode>", clientName: "<img src=x onerror=legacy-authority>", mode: "EXPORT", serviceType: "MOVING",
    customerType: "L4_PERSONAL", status: "NEW_INBOX", estimatedCbm: 0.5, requiresSurvey: true,
    surveyMethod: "PRESENCIAL", originLocation: "Origen 0", destinationLocation: "Destino 0",
    destinationContracted: true, assetsCount: 0,
    owner: { displayName: "<displayName>", role: "V", membershipStatus: "ACTIVE" },
    quoteCount: 0, eventCount: 0, createdAt: "<timestamp>", updatedAt: "<timestamp>",
  };
  checkJsonSnapshot("snapshot lista", normalizeSuccessContract(snapshotList.body), { ok: true, total: 1, page: 1, pageSize: 1, data: [expectedCaseContract] });
  checkJsonSnapshot("snapshot detalle", normalizeSuccessContract(detail.body), { ok: true, data: {
    caseRef: "<caseRef>", caseNumber: "<caseNumber>", status: "NEW_INBOX", mode: "EXPORT", serviceType: "MOVING",
    client: { displayName: "<displayName>", type: "PERSON", status: "active" },
    owner: { displayName: "<displayName>" }, createdAt: "<timestamp>", updatedAt: "<timestamp>",
  } });
  const noClient = await invoke(detailHandler, request(tokenOne, "GET", { caseRef: casesOne[1].publicRef }));
  check("clientId NULL produce client null sin inferencia", noClient.statusCode === 200 && noClient.body.data.client === null
    && !JSON.stringify(noClient.body.data).includes(casesOne[1].clientName));
  const crossTenant = await expectError("cross-tenant indistinguible", invoke(detailHandler, request(tokenOne, "GET", { caseRef: casesTwo[0].publicRef })), 404, "CRM_PIPELINE_RESOURCE_NOT_FOUND");
  checkJsonSnapshot("snapshot 404", crossTenant.body, { ok: false, error: "CRM_PIPELINE_RESOURCE_NOT_FOUND" });
  const inactiveClient = await invoke(detailHandler, request(tokenFor(tenantTwo), "GET", { caseRef: casesTwo[0].publicRef }));
  check("Client inactivo conserva estado explícito sin fallback", inactiveClient.statusCode === 200
    && inactiveClient.body.data.client?.displayName === serviceClientTwo.name
    && inactiveClient.body.data.client?.status === "inactive");
  await expectError("referencia repetida rechazada como recurso ausente", invoke(detailHandler, request(tokenOne, "GET", { caseRef: [casesOne[0].publicRef, casesOne[1].publicRef] })), 404, "CRM_PIPELINE_RESOURCE_NOT_FOUND");
  await prisma.tenantMembership.update({ where: { id: ownerOne.membershipId }, data: { status: "SUSPENDED" } });
  const historical = await invoke(detailHandler, request(tokenOne, "GET", { caseRef: casesOne[0].publicRef }));
  check("owner se publica con presentación mínima", Object.keys(historical.body.data.owner).length === 1
    && historical.body.data.owner.displayName && !Object.hasOwn(historical.body.data.owner, "membershipId"));
  await prisma.tenantMembership.update({ where: { id: ownerOne.membershipId }, data: { status: "ACTIVE" } });
  const [ownerRace] = await Promise.all([
    invoke(listHandler, request(tokenOne, "GET", { q: casesOne[1].caseCode, pageSize: "1" })),
    assignOwnerFixture(casesOne[1].id, tenantOne.tenantId, alternateOwner, adminOne, "assign"),
  ]);
  const allowedOwnerNames = new Set([`Usuario sintético ${run}-owner-one`, `Usuario sintético ${run}-owner-alternate`]);
  check("cambio concurrente de owner no fuga tenant", ownerRace.statusCode === 200 && ownerRace.body.total === 1
    && allowedOwnerNames.has(ownerRace.body.data[0]?.owner?.displayName));
  await assignOwnerFixture(casesOne[1].id, tenantOne.tenantId, ownerOne, adminOne, "restore");

  const summary = await invoke(summaryHandler, request(tokenOne));
  check("resumen por tenant", summary.statusCode === 200 && summary.body.data.total === 51 && summary.body.data.assigned === 39 && summary.body.data.unassigned === 12);
  check("resumen CRM sin CORS permisivo", summary.getHeader("access-control-allow-origin") === undefined
    && summary.getHeader("access-control-allow-credentials") === undefined);
  check("SLA no inventado", summary.body.data.sla.overdue === null && summary.body.data.sla.basis === "UNAVAILABLE");
  check("todos los estados presentes", Object.keys(summary.body.data.byStatus).length === crm.CRM_PIPELINE_STATUS_VALUES.length);
  const expectedByStatus = Object.fromEntries(crm.CRM_PIPELINE_STATUS_VALUES.map((status) => [status, casesOne.filter((item) => item.status === status).length]));
  checkJsonSnapshot("snapshot resumen", summary.body, {
    ok: true,
    data: { total: 51, assigned: 39, unassigned: 12, byStatus: expectedByStatus, sla: { overdue: null, basis: "UNAVAILABLE" } },
  });

  check("rol A accede", (await invoke(listHandler, request(tokenFor(adminOne)))).statusCode === 200);
  const clientsOnlyDenied = await expectError("clients:view solo no permite Pipeline", invoke(listHandler, request(tokenFor(clientsOnly))), 403, "COMMERCIAL_PERMISSION_FORBIDDEN");
  checkJsonSnapshot("snapshot 403", clientsOnlyDenied.body, { ok: false, error: "COMMERCIAL_PERMISSION_FORBIDDEN" });
  await expectError("grant explícito no amplía CRM fuera de A/V", invoke(listHandler, request(tokenFor(explicitGrant))), 403, "COMMERCIAL_PERMISSION_FORBIDDEN");
  await expectError("deniedPermissions prevalece", invoke(listHandler, request(tokenFor(deniedOne))), 403, "COMMERCIAL_PERMISSION_FORBIDDEN");
  await expectError("membresía suspendida", invoke(listHandler, request(tokenFor(suspendedMembership))), 403, "COMMERCIAL_MEMBERSHIP_INACTIVE");
  await expectError("tenant suspendido", invoke(listHandler, request(tokenFor(suspendedTenant))), 403, "COMMERCIAL_TENANT_INACTIVE");
  const anonymous = await expectError("anónimo rechazado", invoke(listHandler, request(null)), 401, "COMMERCIAL_AUTH_REQUIRED");
  checkJsonSnapshot("snapshot 401", anonymous.body, { ok: false, error: "COMMERCIAL_AUTH_REQUIRED" });
  await expectError("headers falsificados no autorizan", invoke(listHandler, request(null, "GET", {}, { "x-osi-role": "A", "x-osi-userid": tenantOne.userId })), 401, "COMMERCIAL_AUTH_REQUIRED");
  await expectError("dos Authorization rechazados", invoke(listHandler, request(null, "GET", {}, { authorization: ["Bearer x", `Bearer ${tokenOne}`] })), 401, "COMMERCIAL_AUTH_INVALID");
  await expectError("Bearer malformado rechazado", invoke(listHandler, request("not-a-jwt")), 401, "COMMERCIAL_AUTH_REQUIRED");
  const expiredLegacy = jwt.sign({ sub: tenantOne.userId, email: "expired@example.invalid", role: "V" }, process.env.JWT_SECRET, { expiresIn: -1 });
  await expectError("JWT expirado rechazado", invoke(listHandler, request(expiredLegacy)), 401, "COMMERCIAL_AUTH_INVALID");
  const wrongSignature = jwt.sign({ sub: tenantOne.userId, email: "invalid@example.invalid", role: "V" }, "wrong-secret", { expiresIn: 60 });
  await expectError("firma inválida rechazada", invoke(listHandler, request(wrongSignature)), 401, "COMMERCIAL_AUTH_INVALID");
  const invalidV2 = jwt.sign({ ver: 2, typ: "access", membershipId: ownerOne.membershipId, tenantId: tenantOne.tenantId }, "wrong-secret");
  const v2Response = await invoke(listHandler, request(invalidV2));
  check("V2 inválido no degrada a LEGACY", v2Response.statusCode === 401 && v2Response.body?.error === "COMMERCIAL_AUTH_INVALID");

  const inactiveUser = await identity("inactive-user", { tenantId: tenantOne.tenantId, role: "V", isDefault: true });
  const inactiveToken = tokenFor(inactiveUser);
  await prisma.user.update({ where: { id: inactiveUser.userId }, data: { status: "inactive" } });
  await expectError("User inactivo rechazado", invoke(listHandler, request(inactiveToken)), 401, "COMMERCIAL_AUTH_INVALID");
  const deletedUser = await identity("deleted-user", { tenantId: tenantOne.tenantId, role: "V", isDefault: true });
  const deletedToken = tokenFor(deletedUser);
  await prisma.tenantMembership.delete({ where: { id: deletedUser.membershipId } });
  await prisma.user.delete({ where: { id: deletedUser.userId } });
  await expectError("User eliminado rechazado", invoke(listHandler, request(deletedToken)), 401, "COMMERCIAL_AUTH_INVALID");

  const v2Identity = await identity("v2-version", { tenantId: tenantOne.tenantId, role: "V", isDefault: true });
  process.env.MT01B_AUTH_MODE = "MEMBERSHIP_ONLY";
  const v2Session = await createMembershipAuthSession(prisma, v2Identity, { req: syntheticRequest(), now: new Date() });
  created.sessions.push(v2Session.identity.sessionId);
  check("JWT V2 válido usa pipeline:view del servidor", (await invoke(listHandler, request(v2Session.accessToken))).statusCode === 200);
  await prisma.tenantMembership.update({ where: { id: v2Identity.membershipId }, data: { authorizationVersion: { increment: 1 } } });
  const staleVersion = await invoke(listHandler, request(v2Session.accessToken));
  check("authorizationVersion obsoleta rechazada", staleVersion.statusCode === 401 && staleVersion.body?.error === "MT01B_AUTHORIZATION_INVALID");
  process.env.MT01B_AUTH_MODE = "LEGACY";

  const forgedAuthorityRequest = request(tokenOne);
  forgedAuthorityRequest.body = { tenantId: tenantTwo.tenantId, membershipId: ownerTwo.membershipId, role: "A", permissions: [PERMS.PIPELINE_VIEW] };
  const forgedAuthority = await invoke(listHandler, forgedAuthorityRequest);
  check("body y headers no seleccionan autoridad", forgedAuthority.statusCode === 200 && forgedAuthority.body.total === 51);

  for (const [name, query] of [
    ["tenantId del navegador", { tenantId: tenantTwo.tenantId }],
    ["membershipId del navegador", { membershipId: ownerTwo.membershipId }],
    ["role del navegador", { role: "A" }],
    ["permissions del navegador", { permissions: PERMS.PIPELINE_VIEW }],
    ["parámetro repetido", { status: [casesOne[0].status, casesOne[1].status] }],
    ["límite negativo", { pageSize: "-1" }],
    ["límite NaN", { pageSize: "NaN" }],
    ["límite flotante", { pageSize: "2.5" }],
    ["límite mayor a 100", { pageSize: "101" }],
    ["búsqueda excesiva", { q: "x".repeat(101) }],
    ["filtro desconocido", { unknown: "value" }],
  ]) {
    await expectError(name, invoke(listHandler, request(tokenOne, "GET", query)), 400, "CRM_PIPELINE_FILTER_INVALID");
  }
  const unicodeWildcard = await invoke(listHandler, request(tokenOne, "GET", { q: "ñ_%", pageSize: "10" }));
  check("Unicode y wildcard se parametrizan sin error", unicodeWildcard.statusCode === 200 && unicodeWildcard.body.total === 0);
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
  const failureHandler = createPipelineCasesListHandler({
    prismaClient: failurePrisma,
    requirePermission: async () => Object.freeze({ tenantId: tenantOne.tenantId }),
  });
  const failureResponse = await invoke(failureHandler, request(tokenOne));
  checkJsonSnapshot("snapshot 503 base", failureResponse.body, { ok: false, error: "COMMERCIAL_CONTEXT_DATABASE_UNAVAILABLE" });
  check("503 base sanitizado", failureResponse.statusCode === 503 && !JSON.stringify(failureResponse.body).includes("secret"));

  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, target, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, assertions: results.filter((item) => item.passed).length, error: error.message, results }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  try { await cleanup(); } catch {}
  await prisma.$disconnect();
}
