import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import { createMt01c2b3aLocalPrisma, validateMt01c2b3aLocalUrl } from "./mt-01c2b3a-local-target.mjs";

const target = validateMt01c2b3aLocalUrl();
process.env.DATABASE_URL = target.raw;
process.env.DIRECT_URL = target.raw;
process.env.JWT_SECRET = "mt01c2b3a-local-jwt-secret-not-for-runtime";
process.env.MT01B_AUTH_MODE = "LEGACY";
process.env.MT01B_TENANT_SWITCH_ENABLED = "false";
process.env.VITE_MT01B2_CLIENT_ENABLED = "false";
process.env.COMMERCIAL_TENANCY_WRITE_MODE = "LEGACY_ONLY";
process.env.COMMERCIAL_TENANCY_READ_MODE = "LEGACY_ONLY";
process.env.MT01B_REFRESH_TOKEN_PEPPER = "mt01c2b3a-local-refresh-pepper-at-least-32-characters";
process.env.MT01B_ALLOWED_ORIGINS = "http://localhost:5173";

const [
  { prisma, identity },
  { signAccessToken },
  { createMembershipAuthSession },
  { createIdentity, mockResponse, syntheticRequest },
  { default: clientsHandler },
  { default: projectsHandler },
  commercial,
] = await Promise.all([
  createMt01c2b3aLocalPrisma(),
  import("../api/_lib/auth.js"),
  import("../api/_lib/authSession.js"),
  import("./mt-01b1-test-helpers.mjs"),
  import("../api/clients/index.js"),
  import("../api/projects/index.js"),
  import("../api/_lib/commercialTenancyWrite.js"),
]);

const run = `mt01c2b3a-${randomUUID().slice(0, 8)}`;
const created = { projects: [], clients: [], sessions: [], memberships: [], users: [], tenants: [] };
const results = [];

function check(name, condition, detail) {
  results.push({ name, passed: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
  if (!condition) throw new Error(name);
}

function request(token, method = "POST", body = {}, headers = {}) {
  const base = syntheticRequest({ authorization: token ? `Bearer ${token}` : undefined });
  return { ...base, method, query: {}, body, headers: { ...base.headers, "content-type": "application/json", ...headers } };
}

async function invoke(handler, req) {
  const response = mockResponse();
  await handler(req, response);
  return response;
}

function userData(id, role = "A", status = "active") {
  return {
    id,
    code: id.toUpperCase().slice(0, 191),
    name: "Actor sintético MT-01C2B3A",
    email: `${id}@example.invalid`,
    phone: "0000000000",
    role,
    status,
    department: "QA",
    joinDate: "2026-08-10",
    passwordHash: "not-used",
  };
}

async function trackedIdentity(label, options = {}) {
  const item = await createIdentity(prisma, `${run}-${label}`, options);
  if (!options.tenantId) created.tenants.push(item.tenantId);
  if (!options.userId) created.users.push(item.userId);
  created.memberships.push(item.membershipId);
  return item;
}

function tokenFor(item, role = item.role) {
  return signAccessToken({ sub: item.userId, email: `${item.userId}@example.invalid`, role });
}

function clientBody(label) {
  return {
    code: `${run}-client-${label}`,
    name: `Cliente ${label}`,
    email: `${run}-${label}@example.invalid`,
    phone: "0000000000",
    address: "Local",
    type: "corporate",
    status: "active",
    totalServices: 0,
    createdAt: "2026-08-10",
  };
}

function projectBody(label, clientId) {
  return {
    code: `${run}-project-${label}`,
    name: `Proyecto ${label}`,
    clientId,
    clientName: `Cliente ${label}`,
    status: "active",
    startDate: "2026-08-10",
    osiCount: 0,
    totalValue: 0,
  };
}

function stableHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function responseHeaders(response) {
  return Object.fromEntries([...response.headers.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

async function expectError(name, responsePromise, status, code) {
  const response = await responsePromise;
  check(name, response.statusCode === status && response.body?.error === code && Object.keys(response.body || {}).every((key) => ["ok", "error"].includes(key)), {
    status: response.statusCode,
    code: response.body?.error,
  });
  return response;
}

try {
  check("destino local verificado", identity.address === "127.0.0.1" && identity.port === 55432 && identity.schema === "osi", identity);
  check("modo predeterminado es LEGACY_ONLY", commercial.resolveCommercialTenancyWriteMode({}) === "LEGACY_ONLY");
  check("LEGACY_ONLY exacto se permite", commercial.resolveCommercialTenancyWriteMode({ COMMERCIAL_TENANCY_WRITE_MODE: "LEGACY_ONLY", COMMERCIAL_TENANCY_READ_MODE: "LEGACY_ONLY" }) === "LEGACY_ONLY");
  check("TENANT_WRITE exacto se permite sólo localmente", commercial.resolveCommercialTenancyWriteMode({ COMMERCIAL_TENANCY_WRITE_MODE: "TENANT_WRITE", COMMERCIAL_TENANCY_READ_MODE: "TENANT_READ" }) === "TENANT_WRITE");
  for (const [label, value] of [
    ["espacio inicial", " LEGACY_ONLY"], ["espacio final", "LEGACY_ONLY "], ["comillas", '"LEGACY_ONLY"'],
    ["BOM", "\uFEFFLEGACY_ONLY"], ["salto", "LEGACY_ONLY\n"], ["casing", "legacy_only"],
    ["vacío", ""], ["desconocido", "ENFORCED"], ["null", null],
  ]) {
    let invalidMode = null;
    try { commercial.resolveCommercialTenancyWriteMode({ COMMERCIAL_TENANCY_WRITE_MODE: value }); } catch (error) { invalidMode = error; }
    const valueNotExposed = value == null || value === "" || !String(invalidMode?.message).includes(String(value));
    check(`configuración inválida rechazada: ${label}`, invalidMode?.code === "COMMERCIAL_TENANCY_CONFIGURATION_INVALID" && invalidMode.status === 503 && valueNotExposed);
  }
  let vercelMode = null;
  try { commercial.resolveCommercialTenancyWriteMode({ COMMERCIAL_TENANCY_WRITE_MODE: "TENANT_WRITE", COMMERCIAL_TENANCY_READ_MODE: "TENANT_READ", VERCEL_ENV: "production" }); } catch (error) { vercelMode = error; }
  check("TENANT_WRITE no puede configurarse en Vercel", vercelMode?.code === "COMMERCIAL_TENANCY_CONFIGURATION_INVALID" && vercelMode.status === 503);
  process.env.COMMERCIAL_TENANCY_WRITE_MODE = "LEGACY_ONLY ";
  await expectError("configuración HTTP inválida devuelve 503 sanitizado", invoke(clientsHandler, request(null, "POST", clientBody("invalid-mode"))), 503, "COMMERCIAL_TENANCY_CONFIGURATION_INVALID");
  process.env.COMMERCIAL_TENANCY_WRITE_MODE = "LEGACY_ONLY";

  const legacyUserId = `${run}-legacy-user`;
  await prisma.user.create({ data: userData(legacyUserId, "A") });
  created.users.push(legacyUserId);
  const legacyToken = signAccessToken({ sub: legacyUserId, email: `${legacyUserId}@example.invalid`, role: "A" });
  const legacyClientResponse = await invoke(clientsHandler, request(legacyToken, "POST", clientBody("legacy")));
  check("LEGACY_ONLY crea Client sin consultar membresía", legacyClientResponse.statusCode === 201 && legacyClientResponse.body?.ok === true);
  created.clients.push(legacyClientResponse.body.data.id);
  const legacyClient = await prisma.client.findUnique({ where: { id: legacyClientResponse.body.data.id } });
  check("LEGACY_ONLY conserva tenantId NULL", legacyClient.tenantId === null && !Object.hasOwn(legacyClientResponse.body.data, "tenantId"));
  const legacyProjectResponse = await invoke(projectsHandler, request(legacyToken, "POST", projectBody("legacy", legacyClient.id)));
  check("LEGACY_ONLY conserva creación heredada de Project", legacyProjectResponse.statusCode === 201 && legacyProjectResponse.body?.ok === true);
  created.projects.push(legacyProjectResponse.body.data.id);
  const legacyProject = await prisma.project.findUnique({ where: { id: legacyProjectResponse.body.data.id } });
  check("Project LEGACY_ONLY conserva tenantId NULL", legacyProject.tenantId === null && !Object.hasOwn(legacyProjectResponse.body.data, "tenantId"));
  const legacySnapshot = {
    clientStatus: legacyClientResponse.statusCode,
    clientEnvelope: Object.keys(legacyClientResponse.body).sort(),
    projectStatus: legacyProjectResponse.statusCode,
    projectEnvelope: Object.keys(legacyProjectResponse.body).sort(),
    clientTenant: legacyClient.tenantId,
    projectTenant: legacyProject.tenantId,
    clientHeaders: responseHeaders(legacyClientResponse),
    projectHeaders: responseHeaders(legacyProjectResponse),
  };
  check("snapshot LEGACY_ONLY coincide con main", JSON.stringify(legacySnapshot) === JSON.stringify({
    clientStatus: 201,
    clientEnvelope: ["data", "ok"],
    projectStatus: 201,
    projectEnvelope: ["data", "ok"],
    clientTenant: null,
    projectTenant: null,
    clientHeaders: {
      "access-control-allow-headers": "Content-Type, Authorization, x-osi-role, x-osi-userid",
      "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
      "access-control-allow-origin": "*",
      "content-type": "application/json; charset=utf-8",
    },
    projectHeaders: {
      "access-control-allow-headers": "Content-Type, Authorization, x-osi-role, x-osi-userid",
      "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
      "access-control-allow-origin": "*",
      "content-type": "application/json; charset=utf-8",
    },
  }));
  const legacyAuthorityBody = {
    ...clientBody("legacy-authority-fields"),
    tenantId: "ignored", membershipId: "ignored", ownerMembershipId: "ignored",
    ownerUserId: "ignored", role: "N", permissions: ["ignored"],
  };
  const legacyAuthorityResponse = await invoke(clientsHandler, request(legacyToken, "POST", legacyAuthorityBody));
  check("LEGACY_ONLY conserva campos aceptados e ignora autoridad adicional como Base", legacyAuthorityResponse.statusCode === 201 && responseHeaders(legacyAuthorityResponse)["content-type"] === "application/json; charset=utf-8");
  created.clients.push(legacyAuthorityResponse.body.data.id);
  check("LEGACY_ONLY no persiste autoridad empresarial", (await prisma.client.findUnique({ where: { id: legacyAuthorityResponse.body.data.id } })).tenantId === null);
  const legacyInvalidResponse = await invoke(clientsHandler, request("invalid.invalid.invalid", "POST", clientBody("legacy-invalid")));
  check("LEGACY_ONLY conserva error de JWT inválido", legacyInvalidResponse.statusCode === 401 && JSON.stringify(legacyInvalidResponse.body) === JSON.stringify({ ok: false, error: "Unauthorized" }));
  const clientRouteSource = readFileSync(new URL("../api/clients/index.js", import.meta.url), "utf8");
  const projectRouteSource = readFileSync(new URL("../api/projects/index.js", import.meta.url), "utf8");
  check("LEGACY_ONLY no contiene consulta TenantMembership en rutas", !/tenantMembership|tenant_memberships/.test(clientRouteSource) && !/tenantMembership|tenant_memberships/.test(projectRouteSource));
  const legacyBefore = stableHash({ client: legacyClient, project: legacyProject });

  process.env.COMMERCIAL_TENANCY_WRITE_MODE = "TENANT_WRITE";
  process.env.COMMERCIAL_TENANCY_READ_MODE = "TENANT_READ";
  await expectError("escritura tenantizada anónima se rechaza", invoke(clientsHandler, request(null, "POST", clientBody("anonymous"))), 401, "COMMERCIAL_AUTH_REQUIRED");
  const tenantOne = await trackedIdentity("tenant-one", { role: "V" });
  const tenantTwo = await trackedIdentity("tenant-two", { role: "V" });
  const tenantOneToken = tokenFor(tenantOne, "N");
  const tenantTwoToken = tokenFor(tenantTwo, "A");
  const expiredLegacyToken = jwt.sign({ sub: tenantOne.userId, email: "synthetic@example.invalid", role: "V" }, process.env.JWT_SECRET, { expiresIn: -1 });
  await expectError("JWT LEGACY expirado se rechaza", invoke(clientsHandler, request(expiredLegacyToken, "POST", clientBody("expired"))), 401, "MT01B_LEGACY_TOKEN_INVALID");
  const invalidLegacyToken = `${tenantOneToken.slice(0, -1)}${tenantOneToken.endsWith("a") ? "b" : "a"}`;
  await expectError("JWT LEGACY con firma inválida se rechaza", invoke(clientsHandler, request(invalidLegacyToken, "POST", clientBody("bad-signature"))), 401, "MT01B_LEGACY_TOKEN_INVALID");
  const duplicateAuthorization = request(tenantOneToken, "POST", clientBody("duplicate-authorization"));
  duplicateAuthorization.headers.authorization = [`Bearer ${tenantOneToken}`, `Bearer ${tenantTwoToken}`];
  await expectError("dos Authorization se rechazan", invoke(clientsHandler, duplicateAuthorization), 401, "COMMERCIAL_AUTH_REQUIRED");
  const tenantClientResponse = await invoke(clientsHandler, request(tenantOneToken, "POST", clientBody("tenant-one"), {
    "x-osi-role": "N",
    "x-osi-userid": tenantTwo.userId,
  }));
  check("Client deriva tenant y rol desde base", tenantClientResponse.statusCode === 201 && tenantClientResponse.body?.ok === true);
  created.clients.push(tenantClientResponse.body.data.id);
  const tenantClient = await prisma.client.findUnique({ where: { id: tenantClientResponse.body.data.id } });
  check("Client queda en tenant correcto sin exponerlo", tenantClient.tenantId === tenantOne.tenantId && !Object.hasOwn(tenantClientResponse.body.data, "tenantId"));
  const tenantProjectResponse = await invoke(projectsHandler, request(tenantOneToken, "POST", projectBody("tenant-one", tenantClient.id)));
  check("Project acepta Client del mismo tenant", tenantProjectResponse.statusCode === 201 && tenantProjectResponse.body?.ok === true);
  created.projects.push(tenantProjectResponse.body.data.id);
  const tenantProject = await prisma.project.findUnique({ where: { id: tenantProjectResponse.body.data.id } });
  check("Project deriva tenant del servidor", tenantProject.tenantId === tenantOne.tenantId && !Object.hasOwn(tenantProjectResponse.body.data, "tenantId"));

  let clientPersistenceError;
  try {
    await commercial.createTenantClient({ client: { create: async () => { throw new Error("sensitive synthetic detail"); } } }, {
      tenantId: tenantOne.tenantId,
      data: clientBody("database-failure"),
    });
  } catch (error) { clientPersistenceError = error; }
  check("fallo de persistencia Client es 503 sin PII", clientPersistenceError?.code === "COMMERCIAL_CONTEXT_DATABASE_UNAVAILABLE" && clientPersistenceError.status === 503 && !/sensitive|example\.invalid/i.test(clientPersistenceError.message));

  const concurrentClientResponses = await Promise.all(Array.from({ length: 20 }, (_, index) => (
    invoke(clientsHandler, request(tenantOneToken, "POST", clientBody(`concurrent-${index}`)))
  )));
  const concurrentClientIds = concurrentClientResponses.filter((response) => response.statusCode === 201).map((response) => response.body.data.id);
  created.clients.push(...concurrentClientIds);
  const concurrentClients = await prisma.client.findMany({ where: { id: { in: concurrentClientIds } } });
  check("20 Clients concurrentes quedan completos y sin parciales", concurrentClientIds.length === 20 && concurrentClients.length === 20 && concurrentClients.every((client) => client.tenantId === tenantOne.tenantId && client.code && client.name));

  const concurrentProjectResponses = await Promise.all(Array.from({ length: 20 }, (_, index) => (
    invoke(projectsHandler, request(tenantOneToken, "POST", projectBody(`concurrent-${index}`, tenantClient.id)))
  )));
  const concurrentProjectIds = concurrentProjectResponses.filter((response) => response.statusCode === 201).map((response) => response.body.data.id);
  created.projects.push(...concurrentProjectIds);
  const concurrentProjects = await prisma.project.findMany({ where: { id: { in: concurrentProjectIds } } });
  check("20 Projects concurrentes validan y crean atómicamente", concurrentProjectIds.length === 20 && concurrentProjects.length === 20 && concurrentProjects.every((project) => project.tenantId === tenantOne.tenantId && project.clientId === tenantClient.id));

  await expectError("Client legacy NULL bloquea Project", invoke(projectsHandler, request(tenantOneToken, "POST", projectBody("legacy-blocked", legacyClient.id))), 409, "COMMERCIAL_CLIENT_TENANCY_PENDING");
  await expectError("Client inexistente devuelve 404", invoke(projectsHandler, request(tenantOneToken, "POST", projectBody("missing", `${run}-missing-client`))), 404, "COMMERCIAL_RESOURCE_NOT_FOUND");
  await expectError("Client de otro tenant devuelve 404", invoke(projectsHandler, request(tenantTwoToken, "POST", projectBody("cross", tenantClient.id))), 404, "COMMERCIAL_RESOURCE_NOT_FOUND");

  let foreignKeyError;
  try {
    await commercial.createTenantProject({
      $transaction: async (operation) => operation({
        $queryRaw: async () => [{ id: "synthetic-client", tenantId: tenantOne.tenantId }],
        project: { create: async () => { throw Object.assign(new Error("internal foreign key detail"), { code: "P2003" }); } },
      }),
    }, { tenantId: tenantOne.tenantId, clientId: "synthetic-client", data: projectBody("fk", "synthetic-client") });
  } catch (error) { foreignKeyError = error; }
  check("FK concurrente se traduce a 404 sin error Prisma", foreignKeyError?.code === "COMMERCIAL_RESOURCE_NOT_FOUND" && foreignKeyError.status === 404 && !/P2003|foreign key/i.test(foreignKeyError.message));

  const raceClientResponse = await invoke(clientsHandler, request(tenantOneToken, "POST", clientBody("delete-race")));
  check("Client de carrera creado", raceClientResponse.statusCode === 201);
  const raceClientId = raceClientResponse.body.data.id;
  created.clients.push(raceClientId);
  const raceRequests = Promise.all(Array.from({ length: 20 }, (_, index) => (
    invoke(projectsHandler, request(tenantOneToken, "POST", projectBody(`delete-race-${index}`, raceClientId)))
  )));
  const raceDelete = new Promise((resolveDelete) => setImmediate(() => {
    prisma.client.delete({ where: { id: raceClientId } }).then(() => resolveDelete(true)).catch(() => resolveDelete(false));
  }));
  const [raceResponses, raceClientDeleted] = await Promise.all([raceRequests, raceDelete]);
  const raceSuccessIds = raceResponses.filter((response) => response.statusCode === 201).map((response) => response.body.data.id);
  created.projects.push(...raceSuccessIds);
  const raceStoredProjects = await prisma.project.findMany({ where: { id: { in: raceSuccessIds } } });
  check("eliminación concurrente de Client no causa 500 ni Project parcial", raceResponses.every((response) => [201, 404].includes(response.statusCode)) && (raceClientDeleted ? raceSuccessIds.length === 0 : raceStoredProjects.length === raceSuccessIds.length));

  for (const field of ["tenantId", "membershipId", "ownerMembershipId", "ownerUserId", "role", "permissions"]) {
    const forged = { ...clientBody(`forged-${field}`), [field]: "forged" };
    await expectError(`campo ${field} rechazado`, invoke(clientsHandler, request(tenantOneToken, "POST", forged)), 400, "COMMERCIAL_AUTHORITY_FIELDS_FORBIDDEN");
  }
  await expectError("Project rechaza autoridad empresarial del body", invoke(projectsHandler, request(tenantOneToken, "POST", {
    ...projectBody("forged-project", tenantClient.id),
    ownerMembershipId: tenantOne.membershipId,
  })), 400, "COMMERCIAL_AUTHORITY_FIELDS_FORBIDDEN");
  const noDefault = await trackedIdentity("no-default", { role: "V", isDefault: false });
  await expectError("usuario sin default queda bloqueado", invoke(clientsHandler, request(tokenFor(noDefault), "POST", clientBody("no-default"))), 409, "COMMERCIAL_DEFAULT_MEMBERSHIP_REQUIRED");

  const inactiveMembership = await trackedIdentity("inactive-membership", { role: "V" });
  await prisma.tenantMembership.update({ where: { id: inactiveMembership.membershipId }, data: { status: "INACTIVE" } });
  await expectError("membership inactive queda bloqueada", invoke(clientsHandler, request(tokenFor(inactiveMembership), "POST", clientBody("inactive-membership"))), 403, "COMMERCIAL_MEMBERSHIP_INACTIVE");
  const suspendedMembership = await trackedIdentity("suspended-membership", { role: "V" });
  await prisma.tenantMembership.update({ where: { id: suspendedMembership.membershipId }, data: { status: "SUSPENDED" } });
  await expectError("membership suspended queda bloqueada", invoke(clientsHandler, request(tokenFor(suspendedMembership), "POST", clientBody("suspended-membership"))), 403, "COMMERCIAL_MEMBERSHIP_INACTIVE");
  const inactiveTenant = await trackedIdentity("inactive-tenant", { role: "V" });
  await prisma.tenant.update({ where: { id: inactiveTenant.tenantId }, data: { status: "INACTIVE" } });
  await expectError("tenant inactive queda bloqueado", invoke(clientsHandler, request(tokenFor(inactiveTenant), "POST", clientBody("inactive-tenant"))), 403, "COMMERCIAL_TENANT_INACTIVE");
  const suspendedTenant = await trackedIdentity("suspended-tenant", { role: "V" });
  await prisma.tenant.update({ where: { id: suspendedTenant.tenantId }, data: { status: "SUSPENDED" } });
  await expectError("tenant suspended queda bloqueado", invoke(clientsHandler, request(tokenFor(suspendedTenant), "POST", clientBody("suspended-tenant"))), 403, "COMMERCIAL_TENANT_INACTIVE");
  const inactiveUser = await trackedIdentity("inactive-user", { role: "V" });
  await prisma.user.update({ where: { id: inactiveUser.userId }, data: { status: "inactive" } });
  await expectError("User global inactive queda bloqueado", invoke(clientsHandler, request(tokenFor(inactiveUser), "POST", clientBody("inactive-user"))), 401, "COMMERCIAL_AUTH_INVALID");
  const suspendedUser = await trackedIdentity("suspended-user", { role: "V" });
  await prisma.user.update({ where: { id: suspendedUser.userId }, data: { status: "suspended" } });
  await expectError("User global suspended queda bloqueado", invoke(clientsHandler, request(tokenFor(suspendedUser), "POST", clientBody("suspended-user"))), 401, "COMMERCIAL_AUTH_INVALID");
  const deletedUserId = `${run}-deleted-user`;
  await prisma.user.create({ data: userData(deletedUserId, "V") });
  const deletedUserToken = signAccessToken({ sub: deletedUserId, email: `${deletedUserId}@example.invalid`, role: "V" });
  await prisma.user.delete({ where: { id: deletedUserId } });
  await expectError("User eliminado queda bloqueado", invoke(clientsHandler, request(deletedUserToken, "POST", clientBody("deleted-user"))), 401, "COMMERCIAL_AUTH_INVALID");

  const denied = await trackedIdentity("denied", { role: "A" });
  await prisma.tenantMembership.update({ where: { id: denied.membershipId }, data: { deniedPermissions: ["clients:create"] } });
  await expectError("deniedPermissions prevalece", invoke(clientsHandler, request(tokenFor(denied), "POST", clientBody("denied"))), 403, "COMMERCIAL_PERMISSION_FORBIDDEN");
  const noPermission = await trackedIdentity("no-permission", { role: "N" });
  await expectError("headers falsificados no elevan permisos", invoke(clientsHandler, request(tokenFor(noPermission), "POST", clientBody("headers"), { "x-osi-role": "A", "x-osi-userid": tenantOne.userId })), 403, "COMMERCIAL_PERMISSION_FORBIDDEN");

  const ambiguousRows = [{
    tenant_id: "tenant-a", membership_id: "member-a", user_id: tenantOne.userId, membership_role: "V",
    membership_status: "ACTIVE", tenant_status: "ACTIVE", user_status: "active", granted_permissions: [], denied_permissions: [], authorization_version: 1,
  }, {
    tenant_id: "tenant-b", membership_id: "member-b", user_id: tenantOne.userId, membership_role: "V",
    membership_status: "ACTIVE", tenant_status: "ACTIVE", user_status: "active", granted_permissions: [], denied_permissions: [], authorization_version: 1,
  }];
  let ambiguousError;
  try { await commercial.resolveCommercialWriteContext(request(tenantOneToken), { prisma: { $queryRaw: async () => ambiguousRows } }); } catch (error) { ambiguousError = error; }
  check("dos defaults anómalos se rechazan", ambiguousError?.code === "COMMERCIAL_DEFAULT_MEMBERSHIP_AMBIGUOUS" && ambiguousError.status === 409);
  let incompatibleError;
  try { await commercial.resolveCommercialWriteContext(request(tenantOneToken), { prisma: { $queryRaw: async () => [{ ...ambiguousRows[0], user_id: "other-user" }] } }); } catch (error) { incompatibleError = error; }
  check("usuario incompatible se rechaza", incompatibleError?.code === "COMMERCIAL_AUTH_INVALID" && incompatibleError.status === 401);
  const overlapContext = await commercial.resolveCommercialWriteContext(request(tenantOneToken), { prisma: { $queryRaw: async () => [{
    ...ambiguousRows[0],
    tenant_id: tenantOne.tenantId,
    membership_id: tenantOne.membershipId,
    user_id: tenantOne.userId,
    granted_permissions: ["clients:create"],
    denied_permissions: ["clients:create"],
  }] } });
  check("permiso concedido y denegado se resuelve como denegado", !overlapContext.effectivePermissions.includes("clients:create"));
  let databaseError;
  try { await commercial.resolveCommercialWriteContext(request(tenantOneToken), { prisma: { $queryRaw: async () => { throw new Error("synthetic database failure"); } } }); } catch (error) { databaseError = error; }
  check("fallo de base es 503 sanitizado", databaseError?.code === "COMMERCIAL_CONTEXT_DATABASE_UNAVAILABLE" && databaseError.status === 503 && !/synthetic|database failure/i.test(databaseError.message));

  process.env.MT01B_AUTH_MODE = "HYBRID";
  process.env.MT01B_LEGACY_TOKEN_ACCEPT_UNTIL = new Date(Date.now() + 3_600_000).toISOString();
  const v2Session = await createMembershipAuthSession(prisma, tenantOne, { req: syntheticRequest(), now: new Date() });
  created.sessions.push(v2Session.identity.sessionId);
  process.env.MT01B_AUTH_MODE = "LEGACY";
  const v2ClientResponse = await invoke(clientsHandler, request(v2Session.accessToken, "POST", clientBody("v2")));
  check("JWT V2 válido reutiliza resolveAuthContext", v2ClientResponse.statusCode === 201 && v2ClientResponse.body?.ok === true);
  created.clients.push(v2ClientResponse.body.data.id);
  check("JWT V2 crea en tenant de sesión", (await prisma.client.findUnique({ where: { id: v2ClientResponse.body.data.id } })).tenantId === tenantOne.tenantId);
  const invalidV2 = `${v2Session.accessToken.slice(0, -1)}${v2Session.accessToken.endsWith("a") ? "b" : "a"}`;
  const invalidV2Response = await invoke(clientsHandler, request(invalidV2, "POST", clientBody("invalid-v2")));
  check("JWT V2 inválido no degrada a LEGACY", invalidV2Response.statusCode === 401 && /^MT01B_/.test(invalidV2Response.body?.error || ""));

  const legacyAfter = {
    client: await prisma.client.findUnique({ where: { id: legacyClient.id } }),
    project: await prisma.project.findUnique({ where: { id: legacyProject.id } }),
  };
  check("registros existentes no se modifican", stableHash(legacyAfter) === legacyBefore);
  check("cero creación de Lead o PipelineCase", await prisma.lead.count({ where: { tenantId: { not: null } } }) === 0 && await prisma.pipelineCase.count({ where: { id: { startsWith: run } } }) === 0);

  const measuredPrisma = new PrismaClient({ datasourceUrl: target.raw, log: [{ emit: "event", level: "query" }] });
  let contextQueries = 0;
  measuredPrisma.$on("query", () => { contextQueries += 1; });
  const coldStarted = performance.now();
  await commercial.resolveCommercialWriteContext(request(tenantOneToken), { prisma: measuredPrisma });
  const coldMaximumMs = Number((performance.now() - coldStarted).toFixed(2));
  check("resolución fría ejecuta una consulta", contextQueries === 1, { contextQueries, coldMaximumMs });
  contextQueries = 0;
  const contextDurations = [];
  for (let index = 0; index < 100; index += 1) {
    const started = performance.now();
    await commercial.resolveCommercialWriteContext(request(tenantOneToken), { prisma: measuredPrisma });
    contextDurations.push(Number((performance.now() - started).toFixed(2)));
  }
  const resolutionMetrics = {
    samples: contextDurations.length,
    queries: contextQueries,
    queriesPerRequest: contextQueries / contextDurations.length,
    p50Ms: percentile(contextDurations, 0.5),
    p95Ms: percentile(contextDurations, 0.95),
    maximumMs: Math.max(...contextDurations),
    coldMaximumMs,
  };
  check("100 resoluciones usan exactamente una consulta por request", contextQueries === 100, resolutionMetrics);
  contextQueries = 0;
  const measuredRequest = request(tenantOneToken);
  const firstContext = await commercial.resolveCommercialWriteContext(measuredRequest, { prisma: measuredPrisma });
  const secondContext = await commercial.resolveCommercialWriteContext(measuredRequest, { prisma: measuredPrisma });
  const otherRequestContext = await commercial.resolveCommercialWriteContext(request(tenantOneToken), { prisma: measuredPrisma });
  await measuredPrisma.$disconnect();
  check("caché vive sólo dentro del request", firstContext === secondContext && firstContext !== otherRequestContext && contextQueries === 2, { contextQueries });

  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, target: identity, modes: ["LEGACY_ONLY", "TENANT_WRITE"], metrics: { legacyOnlyAdditionalTenantQueries: 0, enterpriseContext: resolutionMetrics }, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, assertions: results.filter((item) => item.passed).length, error: { name: error.name, code: error.code, message: error.message }, results }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  process.env.COMMERCIAL_TENANCY_WRITE_MODE = "LEGACY_ONLY";
  process.env.COMMERCIAL_TENANCY_READ_MODE = "LEGACY_ONLY";
  await prisma.project.deleteMany({ where: { id: { in: created.projects } } }).catch(() => {});
  await prisma.client.deleteMany({ where: { id: { in: created.clients } } }).catch(() => {});
  await prisma.authRefreshToken.deleteMany({ where: { sessionId: { in: created.sessions } } }).catch(() => {});
  await prisma.authSession.deleteMany({ where: { id: { in: created.sessions } } }).catch(() => {});
  await prisma.tenantMembership.deleteMany({ where: { id: { in: created.memberships } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: created.users } } }).catch(() => {});
  await prisma.tenant.deleteMany({ where: { id: { in: created.tenants } } }).catch(() => {});
  await prisma.$disconnect();
}
