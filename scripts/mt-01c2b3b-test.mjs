import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { createMt01c2b3bLocalPrisma } from "./mt-01c2b3b-local-target.mjs";
import { runCommercialReadiness } from "./mt-01c2b3b-readiness.mjs";

const { prisma, target } = await createMt01c2b3bLocalPrisma();
process.env.DATABASE_URL = process.env.MT01C2B3B_TEST_DATABASE_URL;
process.env.DIRECT_URL = process.env.MT01C2B3B_TEST_DATABASE_URL;
process.env.MT01C2B3B_READINESS_DATABASE_URL = process.env.MT01C2B3B_TEST_DATABASE_URL;
process.env.JWT_SECRET = "mt01c2b3b-local-jwt-secret-not-for-runtime";
process.env.MT01B_AUTH_MODE = "LEGACY";
process.env.MT01B_TENANT_SWITCH_ENABLED = "false";
process.env.VITE_MT01B2_CLIENT_ENABLED = "false";
process.env.COMMERCIAL_TENANCY_WRITE_MODE = "LEGACY_ONLY";
process.env.COMMERCIAL_TENANCY_READ_MODE = "LEGACY_ONLY";

const [
  { signAccessToken },
  { createIdentity, mockResponse, syntheticRequest },
  { setPrivateNoStore },
  commercial,
  reads,
  { default: clientsHandler },
  { default: projectsHandler },
  { default: dashboardHandler },
  { default: projectHandler },
  { default: validateHandler },
  { default: releaseHandler },
] = await Promise.all([
  import("../api/_lib/auth.js"),
  import("./mt-01b1-test-helpers.mjs"),
  import("../api/_lib/http.js"),
  import("../api/_lib/commercialTenancyWrite.js"),
  import("../api/_lib/commercialTenancyRead.js"),
  import("../api/clients/index.js"),
  import("../api/projects/index.js"),
  import("../api/k/dashboard.js"),
  import("../api/k/project.js"),
  import("../api/k/project-validate.js"),
  import("../api/k/project-release.js"),
]);

const run = `mt01c2b3b-${randomUUID().slice(0, 8)}`;
const results = [];
const created = {
  clients: [], projects: [], pipelineCases: [], leads: [], templates: [],
  memberships: [], users: [], tenants: [],
};

function check(name, condition, detail) {
  results.push({ name, passed: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
  if (!condition) throw new Error(name);
}

function request(token, method = "GET", { query = {}, body, headers = {} } = {}) {
  const base = syntheticRequest({ authorization: token ? `Bearer ${token}` : undefined });
  return {
    ...base,
    method,
    query,
    body,
    headers: { ...base.headers, ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
  };
}

async function invoke(handler, req) {
  const response = mockResponse();
  await handler(req, response);
  return response;
}

function tokenFor(identity) {
  return signAccessToken({
    sub: identity.userId,
    email: `${identity.userId}@example.invalid`,
    role: identity.role,
  });
}

async function identity(label, options = {}) {
  const value = await createIdentity(prisma, `${run}-${label}`, options);
  if (!options.tenantId) created.tenants.push(value.tenantId);
  if (!options.userId) created.users.push(value.userId);
  created.memberships.push(value.membershipId);
  return value;
}

function clientData(label, tenantId) {
  return {
    id: `${run}-client-${label}`,
    tenantId,
    code: `${run}-C-${label}`.toUpperCase(),
    name: `Cliente ${label}`,
    email: `${label}@example.invalid`,
    phone: "0000000000",
    address: "Local",
    type: "corporate",
    status: "active",
    createdAt: "2026-08-10",
  };
}

function projectData(label, tenantId, client) {
  return {
    id: `${run}-project-${label}`,
    tenantId,
    code: `${run}-P-${label}`.toUpperCase(),
    name: `Proyecto ${label}`,
    clientId: client.id,
    clientName: client.name,
    status: "active",
    startDate: "2099-12-31",
  };
}

function pipelineData(index, tenantId) {
  return {
    id: `${run}-pipeline-${index}`,
    tenantId,
    caseCode: `${run}-CASE-${index}`.toUpperCase(),
    mode: "LOCAL",
    serviceType: "MOVING",
    customerType: "L4_PERSONAL",
    ownerName: "Sin asignar",
    originLocation: "Origen",
    destinationLocation: "Destino",
  };
}

async function expectError(name, responsePromise, status, code) {
  const response = await responsePromise;
  check(name, response.statusCode === status && response.body?.error === code, {
    status: response.statusCode,
    code: response.body?.error,
  });
  check(`${name}: sin datos`, response.body?.data === undefined && response.body?.total === undefined);
  return response;
}

async function cleanup() {
  await prisma.projectSignal.deleteMany({ where: { projectId: { in: created.projects } } });
  await prisma.projectPgd.deleteMany({ where: { projectId: { in: created.projects } } });
  await prisma.templateVersion.deleteMany({ where: { templateId: { in: created.templates } } });
  await prisma.template.deleteMany({ where: { id: { in: created.templates } } });
  await prisma.lead.deleteMany({ where: { id: { in: created.leads } } });
  await prisma.pipelineCase.deleteMany({ where: { id: { in: created.pipelineCases } } });
  await prisma.project.deleteMany({ where: { id: { in: created.projects } } });
  await prisma.client.deleteMany({ where: { id: { in: created.clients } } });
  await prisma.tenantMembership.deleteMany({ where: { id: { in: created.memberships } } });
  await prisma.user.deleteMany({ where: { id: { in: created.users } } });
  await prisma.tenant.deleteMany({ where: { id: { in: created.tenants } } });
}

try {
  const absent = commercial.resolveCommercialTenancyModes({});
  check("modos ausentes equivalen a LEGACY_ONLY", absent.writeMode === "LEGACY_ONLY" && absent.readMode === "LEGACY_ONLY" && absent.tenantMode === false);
  const legacy = commercial.resolveCommercialTenancyModes({ COMMERCIAL_TENANCY_WRITE_MODE: "LEGACY_ONLY", COMMERCIAL_TENANCY_READ_MODE: "LEGACY_ONLY" });
  check("pareja LEGACY exacta permitida", legacy.tenantMode === false);
  const tenant = commercial.resolveCommercialTenancyModes({ COMMERCIAL_TENANCY_WRITE_MODE: "TENANT_WRITE", COMMERCIAL_TENANCY_READ_MODE: "TENANT_READ" });
  check("pareja tenant exacta permitida localmente", tenant.tenantMode === true);

  for (const [name, env] of [
    ["write tenant sin read", { COMMERCIAL_TENANCY_WRITE_MODE: "TENANT_WRITE", COMMERCIAL_TENANCY_READ_MODE: "LEGACY_ONLY" }],
    ["read tenant sin write", { COMMERCIAL_TENANCY_WRITE_MODE: "LEGACY_ONLY", COMMERCIAL_TENANCY_READ_MODE: "TENANT_READ" }],
    ["read con espacio", { COMMERCIAL_TENANCY_WRITE_MODE: "LEGACY_ONLY", COMMERCIAL_TENANCY_READ_MODE: "LEGACY_ONLY " }],
    ["read con newline", { COMMERCIAL_TENANCY_WRITE_MODE: "LEGACY_ONLY", COMMERCIAL_TENANCY_READ_MODE: "LEGACY_ONLY\n" }],
    ["read con BOM", { COMMERCIAL_TENANCY_WRITE_MODE: "LEGACY_ONLY", COMMERCIAL_TENANCY_READ_MODE: "\uFEFFLEGACY_ONLY" }],
    ["read con casing", { COMMERCIAL_TENANCY_WRITE_MODE: "LEGACY_ONLY", COMMERCIAL_TENANCY_READ_MODE: "tenant_read" }],
    ["read entre comillas", { COMMERCIAL_TENANCY_WRITE_MODE: "LEGACY_ONLY", COMMERCIAL_TENANCY_READ_MODE: '"LEGACY_ONLY"' }],
    ["write desconocido", { COMMERCIAL_TENANCY_WRITE_MODE: "FUTURE", COMMERCIAL_TENANCY_READ_MODE: "LEGACY_ONLY" }],
    ["tenant en Preview", { COMMERCIAL_TENANCY_WRITE_MODE: "TENANT_WRITE", COMMERCIAL_TENANCY_READ_MODE: "TENANT_READ", VERCEL_ENV: "preview" }],
  ]) {
    let error;
    try { commercial.resolveCommercialTenancyModes(env); } catch (cause) { error = cause; }
    check(`configuración rechazada: ${name}`, error?.status === 503 && error?.code === "COMMERCIAL_TENANCY_CONFIGURATION_INVALID");
  }

  const readinessBaseline = await runCommercialReadiness();

  const tenantOne = await identity("one", { role: "A" });
  const tenantTwo = await identity("two", { role: "A" });
  const denied = await identity("denied", { tenantId: tenantOne.tenantId, role: "A", isDefault: true });
  await prisma.tenantMembership.update({ where: { id: denied.membershipId }, data: { deniedPermissions: ["clients:view"] } });
  const tokenOne = tokenFor(tenantOne);
  const tokenTwo = tokenFor(tenantTwo);
  const deniedToken = tokenFor(denied);

  const clientOneA = await prisma.client.create({ data: clientData("one-a", tenantOne.tenantId) });
  const clientOneB = await prisma.client.create({ data: clientData("one-b", tenantOne.tenantId) });
  const clientTwo = await prisma.client.create({ data: clientData("two", tenantTwo.tenantId) });
  await prisma.client.update({ where: { id: clientTwo.id }, data: { name: clientOneA.name } });
  const clientLegacy = await prisma.client.create({ data: clientData("legacy", null) });
  created.clients.push(clientOneA.id, clientOneB.id, clientTwo.id, clientLegacy.id);

  const projectOne = await prisma.project.create({ data: projectData("one", tenantOne.tenantId, clientOneA) });
  const projectTwo = await prisma.project.create({ data: projectData("two", tenantTwo.tenantId, clientTwo) });
  const projectLegacy = await prisma.project.create({ data: projectData("legacy", null, clientLegacy) });
  created.projects.push(projectOne.id, projectTwo.id, projectLegacy.id);

  let crossTenantParentError;
  try {
    await prisma.project.create({ data: projectData("cross-parent", tenantOne.tenantId, clientTwo) });
  } catch (error) { crossTenantParentError = error; }
  check("FK compuesta rechaza Project con Client de otro tenant", crossTenantParentError?.code === "P2003");
  let globalCodeConstraint;
  try {
    await prisma.client.create({ data: { ...clientData("duplicate-code", tenantTwo.tenantId), code: clientOneA.code } });
  } catch (error) { globalCodeConstraint = error; }
  check("unicidad legacy global de Client.code sigue siendo bloqueo documentado", globalCodeConstraint?.code === "P2002");

  const template = await prisma.template.create({
    data: { id: `${run}-template`, type: "PGD", name: `${run}-PGD`, tenantId: tenantOne.tenantId },
  });
  created.templates.push(template.id);
  const version = await prisma.templateVersion.create({
    data: { id: `${run}-template-version`, templateId: template.id, version: 1, status: "PUBLISHED", createdById: tenantOne.userId },
  });
  await prisma.projectPgd.create({ data: { projectId: projectOne.id, templateId: template.id, templateVersionId: version.id } });

  const pipelines = Array.from({ length: 12 }, (_, index) => pipelineData(`one-${index}`, tenantOne.tenantId));
  pipelines.push(pipelineData("two", tenantTwo.tenantId), pipelineData("legacy", null));
  await prisma.pipelineCase.createMany({ data: pipelines });
  created.pipelineCases.push(...pipelines.map((item) => item.id));

  const leads = [
    { id: `${run}-lead-one`, tenantId: tenantOne.tenantId, code: `${run}-L-ONE`.toUpperCase(), status: "new", clientName: "Uno" },
    { id: `${run}-lead-two`, tenantId: tenantTwo.tenantId, code: `${run}-L-TWO`.toUpperCase(), status: "new", clientName: "Dos" },
    { id: `${run}-lead-legacy`, tenantId: null, code: `${run}-L-LEGACY`.toUpperCase(), status: "new", clientName: "Legacy" },
  ];
  for (const item of leads) await prisma.lead.create({ data: item });
  created.leads.push(...leads.map((item) => item.id));

  const legacyClients = await invoke(clientsHandler, request(tokenOne, "GET"));
  check("LEGACY_ONLY conserva lista global", legacyClients.statusCode === 200 && legacyClients.body.total === 4);
  check("LEGACY_ONLY conserva filas tenant NULL", legacyClients.body.data.some((item) => item.id === clientLegacy.id));
  check("LEGACY_ONLY no expone tenantId", legacyClients.body.data.every((item) => !("tenantId" in item)));
  const legacyProjects = await invoke(projectsHandler, request(tokenOne, "GET"));
  check("LEGACY_ONLY conserva Project global", legacyProjects.statusCode === 200 && legacyProjects.body.total === 3);
  check("LEGACY_ONLY no agrega cache headers", !legacyProjects.getHeader("cache-control") && !legacyClients.getHeader("cache-control"));

  process.env.COMMERCIAL_TENANCY_WRITE_MODE = "TENANT_WRITE";
  process.env.COMMERCIAL_TENANCY_READ_MODE = "TENANT_READ";

  const firstPage = await invoke(clientsHandler, request(tokenOne, "GET", { query: { page: "1", pageSize: "1", tenantId: tenantTwo.tenantId } }));
  const secondPage = await invoke(clientsHandler, request(tokenOne, "GET", { query: { page: "2", pageSize: "1" } }));
  check("Client pagina y cuenta dentro del tenant", firstPage.statusCode === 200 && firstPage.body.total === 2 && firstPage.body.data.length === 1);
  check("Client paginación estable", secondPage.body.total === 2 && secondPage.body.data.length === 1 && secondPage.body.data[0].id !== firstPage.body.data[0].id);
  check("tenantId falsificado no altera Client", firstPage.body.data.every((item) => [clientOneA.id, clientOneB.id].includes(item.id)));
  check("Client NULL y otro tenant invisibles", ![...firstPage.body.data, ...secondPage.body.data].some((item) => [clientTwo.id, clientLegacy.id].includes(item.id)));
  check("Client tenant no expone campos internos", [...firstPage.body.data, ...secondPage.body.data].every((item) => !("tenantId" in item) && !("ownerUserId" in item)));
  check("Client tenant usa cache privada", firstPage.getHeader("cache-control") === "private, no-store" && /authorization/i.test(String(firstPage.getHeader("vary"))));
  const cacheProbe = mockResponse();
  cacheProbe.setHeader("Vary", "Origin");
  setPrivateNoStore(cacheProbe);
  check("Vary conserva Origin y agrega Authorization", cacheProbe.getHeader("vary") === "Origin, Authorization");
  const searchedClients = await invoke(clientsHandler, request(tokenOne, "GET", { query: { q: clientOneA.name, pageSize: "100" } }));
  check("búsqueda y conteo no cruzan tenants con nombres iguales", searchedClients.body.total === 1 && searchedClients.body.data[0].id === clientOneA.id);

  const projectsOne = await invoke(projectsHandler, request(tokenOne, "GET", { query: { tenantId: tenantTwo.tenantId, pageSize: "10" } }));
  const projectsTwo = await invoke(projectsHandler, request(tokenTwo, "GET", { query: { pageSize: "10" } }));
  check("Project lista separada tenant uno", projectsOne.statusCode === 200 && projectsOne.body.total === 1 && projectsOne.body.data[0].id === projectOne.id);
  check("Project lista separada tenant dos", projectsTwo.statusCode === 200 && projectsTwo.body.total === 1 && projectsTwo.body.data[0].id === projectTwo.id);
  check("Project NULL invisible", !projectsOne.body.data.some((item) => item.id === projectLegacy.id));
  check("Project no expone tenantId", projectsOne.body.data.every((item) => !("tenantId" in item)));

  const dashboardOne = await invoke(dashboardHandler, request(tokenOne, "GET"));
  check("dashboard K cuenta sólo tenant", dashboardOne.statusCode === 200 && dashboardOne.body.counts.total === 1 && dashboardOne.body.data[0].id === projectOne.id);
  check("dashboard K no expone tenantId", dashboardOne.body.data.every((item) => !("tenantId" in item)));

  const detailOne = await invoke(projectHandler, request(tokenOne, "GET", { query: { id: projectOne.id, tenantId: tenantTwo.tenantId } }));
  check("detalle K mismo tenant permitido", detailOne.statusCode === 200 && detailOne.body.data.project.id === projectOne.id);
  const detailCross = await expectError("detalle K cruzado indistinguible", invoke(projectHandler, request(tokenOne, "GET", { query: { id: projectTwo.id } })), 404, "COMMERCIAL_RESOURCE_NOT_FOUND");
  check("404 cruzado no cacheable públicamente", detailCross.getHeader("cache-control") === "private, no-store" && /authorization/i.test(String(detailCross.getHeader("vary"))));

  const validateCross = await expectError("validate K cruzado", invoke(validateHandler, request(tokenOne, "POST", { body: { projectId: projectTwo.id } })), 404, "COMMERCIAL_RESOURCE_NOT_FOUND");
  check("validate cruzado no modificó Project", (await prisma.project.findUnique({ where: { id: projectTwo.id } })).kState === "PENDING_VALIDATION");
  await expectError("validate rechaza tenant del body", invoke(validateHandler, request(tokenOne, "POST", { body: { projectId: projectOne.id, tenantId: tenantOne.tenantId } })), 400, "COMMERCIAL_AUTHORITY_FIELDS_FORBIDDEN");
  const validated = await invoke(validateHandler, request(tokenOne, "POST", { body: { projectId: projectOne.id } }));
  check("validate K actualiza sólo campos autorizados", validated.statusCode === 200 && validated.body.data.kState === "VALIDATED" && !("tenantId" in validated.body.data));
  const released = await invoke(releaseHandler, request(tokenOne, "POST", { body: { projectId: projectOne.id } }));
  check("release K actualiza dentro del tenant", released.statusCode === 200 && released.body.data.kState === "RELEASED" && !("tenantId" in released.body.data));

  await expectError("deniedPermissions prevalece en lectura", invoke(clientsHandler, request(deniedToken, "GET")), 403, "COMMERCIAL_PERMISSION_FORBIDDEN");
  await prisma.tenantMembership.update({ where: { id: tenantTwo.membershipId }, data: { status: "SUSPENDED" } });
  await expectError("membership suspendida bloquea lectura", invoke(projectsHandler, request(tokenTwo, "GET")), 403, "COMMERCIAL_MEMBERSHIP_INACTIVE");
  await prisma.tenantMembership.update({ where: { id: tenantTwo.membershipId }, data: { status: "ACTIVE" } });
  await prisma.tenant.update({ where: { id: tenantTwo.tenantId }, data: { status: "SUSPENDED" } });
  await expectError("tenant suspendido bloquea lectura", invoke(projectsHandler, request(tokenTwo, "GET")), 403, "COMMERCIAL_TENANT_INACTIVE");
  await prisma.tenant.update({ where: { id: tenantTwo.tenantId }, data: { status: "ACTIVE" } });

  const invalidV2 = jwt.sign({ ver: 2, typ: "access", sub: tenantOne.userId, tenantId: tenantOne.tenantId, membershipId: tenantOne.membershipId }, "wrong-secret");
  const invalidV2Response = await invoke(clientsHandler, request(invalidV2, "GET"));
  check("JWT V2 inválido no degrada a LEGACY", invalidV2Response.statusCode === 401 && /^MT01B_/.test(invalidV2Response.body?.error || ""));
  const ambiguousAuthorization = await invoke(clientsHandler, request(null, "GET", {
    headers: { authorization: `Bearer ${tokenOne}, Bearer ${tokenTwo}` },
  }));
  check("dos Authorization ambiguos se rechazan", ambiguousAuthorization.statusCode === 401);

  await prisma.project.update({
    where: { id: projectOne.id },
    data: { kState: "PENDING_VALIDATION", kValidatedAt: null, kReleasedAt: null },
  });
  const validateRace = await Promise.all(Array.from({ length: 20 }, () => (
    invoke(validateHandler, request(tokenOne, "POST", { body: { projectId: projectOne.id } }))
  )));
  check("20 validaciones concurrentes tienen un único ganador", validateRace.filter((response) => response.statusCode === 200).length === 1
    && validateRace.filter((response) => response.statusCode === 409).length === 19);
  const releaseRace = await Promise.all(Array.from({ length: 20 }, () => (
    invoke(releaseHandler, request(tokenOne, "POST", { body: { projectId: projectOne.id } }))
  )));
  check("20 liberaciones concurrentes tienen un único ganador", releaseRace.filter((response) => response.statusCode === 200).length === 1
    && releaseRace.filter((response) => response.statusCode === 409).length === 19);
  check("carrera K termina en RELEASED sin error 500", (await prisma.project.findUnique({ where: { id: projectOne.id } })).kState === "RELEASED"
    && [...validateRace, ...releaseRace].every((response) => response.statusCode !== 500));

  const pagination = reads.commercialPagination({ pageSize: "20" });
  const unassigned = await reads.listTenantPipelineCases(prisma, { tenantId: tenantOne.tenantId, ...pagination });
  check("12 PipelineCase sin owner permanecen visibles", unassigned.total === 12 && unassigned.data.length === 12 && unassigned.data.every((item) => item.ownerId == null));
  check("PipelineCase no expone owners relacionales", unassigned.data.every((item) => !("tenantId" in item) && !("ownerMembershipId" in item) && !("ownerUserId" in item)));
  const tenantLeads = await reads.listTenantLeads(prisma, { tenantId: tenantOne.tenantId, ...pagination });
  check("Lead preparado filtra por tenant sin endpoint nuevo", tenantLeads.total === 1 && tenantLeads.data[0].id === leads[0].id && !("tenantId" in tenantLeads.data[0]));

  let databaseError;
  try {
    await reads.listTenantClients({
      $transaction: async () => { throw new Error("postgresql://secret.invalid"); },
      client: { count: () => null, findMany: () => null },
    }, { tenantId: tenantOne.tenantId, query: "", ...pagination });
  } catch (error) { databaseError = error; }
  check("fallo de lectura es 503 sanitizado", databaseError?.status === 503 && databaseError.code === "COMMERCIAL_CONTEXT_DATABASE_UNAVAILABLE" && !/secret|postgres/i.test(databaseError.message));

  process.env.COMMERCIAL_TENANCY_READ_MODE = "LEGACY_ONLY";
  const partialResponse = await invoke(clientsHandler, request(tokenOne, "GET"));
  check("configuración parcial HTTP es 503", partialResponse.statusCode === 503 && partialResponse.body?.error === "COMMERCIAL_TENANCY_CONFIGURATION_INVALID");
  check("configuración parcial no permite caché compartida", partialResponse.getHeader("cache-control") === "private, no-store" && /authorization/i.test(String(partialResponse.getHeader("vary"))));
  process.env.COMMERCIAL_TENANCY_WRITE_MODE = "TENANT_WRITE";
  process.env.COMMERCIAL_TENANCY_READ_MODE = "TENANT_READ";

  const notReady = await runCommercialReadiness();
  check("readiness detecta raíces NULL sin escribir", notReady.ok === false
    && notReady.counts.clientsWithoutTenant === readinessBaseline.counts.clientsWithoutTenant + 1
    && notReady.counts.projectsWithoutTenant === readinessBaseline.counts.projectsWithoutTenant + 1
    && notReady.counts.pipelineCasesWithoutTenant === readinessBaseline.counts.pipelineCasesWithoutTenant + 1
    && notReady.counts.leadsWithoutTenant === readinessBaseline.counts.leadsWithoutTenant + 1);
  await prisma.project.delete({ where: { id: projectLegacy.id } });
  await prisma.client.delete({ where: { id: clientLegacy.id } });
  await prisma.pipelineCase.delete({ where: { id: `${run}-pipeline-legacy` } });
  await prisma.lead.delete({ where: { id: `${run}-lead-legacy` } });
  created.projects = created.projects.filter((id) => id !== projectLegacy.id);
  created.clients = created.clients.filter((id) => id !== clientLegacy.id);
  created.pipelineCases = created.pipelineCases.filter((id) => id !== `${run}-pipeline-legacy`);
  created.leads = created.leads.filter((id) => id !== `${run}-lead-legacy`);
  const ready = await runCommercialReadiness();
  check("readiness restaura exactamente el estado local inicial", ready.ok === readinessBaseline.ok
    && Object.entries(ready.counts).every(([name, count]) => count === readinessBaseline.counts[name]));

  process.env.COMMERCIAL_TENANCY_WRITE_MODE = "LEGACY_ONLY";
  process.env.COMMERCIAL_TENANCY_READ_MODE = "LEGACY_ONLY";
  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, target, results }, null, 2)}\n`);
} finally {
  process.env.COMMERCIAL_TENANCY_WRITE_MODE = "LEGACY_ONLY";
  process.env.COMMERCIAL_TENANCY_READ_MODE = "LEGACY_ONLY";
  await cleanup();
  await prisma.$disconnect();
}
