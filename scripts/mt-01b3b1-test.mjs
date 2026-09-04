import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { signAccessToken, signMembershipAccessToken } from "../api/_lib/auth.js";
import { createMembershipAuthSession } from "../api/_lib/authSession.js";
import { requirePilotPermission } from "../api/_lib/authContextPilot.js";
import { PERMS } from "../api/_lib/rbac.js";
import meHandler from "../api/auth/me.js";
import usersHandler from "../api/users/index.js";
import clientsHandler from "../api/clients/index.js";
import projectsHandler from "../api/projects/index.js";
import { createIdentity, createTestPrisma, mockResponse, syntheticRequest } from "./mt-01b1-test-helpers.mjs";

const now = new Date();
process.env.MT01B_AUTH_MODE = "HYBRID";
process.env.MT01B_TENANT_SWITCH_ENABLED = "false";
process.env.MT01B_LEGACY_TOKEN_ACCEPT_UNTIL = new Date(now.getTime() + 24 * 3600_000).toISOString();
process.env.MT01B_REFRESH_TOKEN_PEPPER = "mt01b3b1-ci-refresh-pepper-with-at-least-32-characters";
process.env.MT01B_ALLOWED_ORIGINS = "http://localhost:5173";
process.env.COMMERCIAL_TENANCY_MUTATION_MODE = "LOCAL_ONLY";
for (const name of Object.keys(process.env)) {
  if (name.toUpperCase().startsWith("VERCEL")) delete process.env[name];
}

const prisma = createTestPrisma();
const results = [];
function check(name, condition, detail) {
  results.push({ name, passed: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
  if (!condition) throw new Error(name);
}
function request(token, method = "GET", extra = {}) {
  const base = syntheticRequest({ authorization: token ? `Bearer ${token}` : undefined });
  return {
    ...base,
    method,
    query: extra.query || {},
    body: extra.body || {},
    headers: { ...base.headers, ...(extra.headers || {}) },
  };
}
async function invoke(handler, req) {
  const res = mockResponse();
  await handler(req, res);
  return res;
}
async function identitySession(label, options = {}) {
  const identity = await createIdentity(prisma, `${label}-${randomUUID().slice(0, 6)}`, options);
  const session = await createMembershipAuthSession(prisma, identity, { req: syntheticRequest(), now });
  return { identity, session };
}
async function expectRouteError(name, handler, token, expectedStatus, expectedCode, headers = {}) {
  const res = await invoke(handler, request(token, "GET", { headers }));
  check(name, res.statusCode === expectedStatus && res.body?.error === expectedCode, { status: res.statusCode, error: res.body?.error });
}

async function expectMethodError(name, handler, token, method, expectedStatus, expectedCode, extra = {}) {
  const res = await invoke(handler, request(token, method, extra));
  check(name, res.statusCode === expectedStatus && res.body?.error === expectedCode, { status: res.statusCode, error: res.body?.error });
  return res;
}

try {
  const admin = await identitySession("pilot-admin", { role: "A" });
  const legacyToken = signAccessToken({ sub: admin.identity.userId, email: "legacy-pilot@example.invalid", role: "A" });

  const previousMode = process.env.MT01B_AUTH_MODE;
  process.env.MT01B_AUTH_MODE = "LEGACY";
  const legacySessionCountBefore = await prisma.authSession.count();
  const legacyMe = await invoke(meHandler, request(legacyToken));
  const legacyUsers = await invoke(usersHandler, request(legacyToken));
  const legacyClients = await invoke(clientsHandler, request(legacyToken));
  const legacyProjects = await invoke(projectsHandler, request(legacyToken));
  const legacyAnonymous = await invoke(clientsHandler, request(null));
  const forgedLegacyRoleToken = signAccessToken({ sub: admin.identity.userId, email: "legacy-denied@example.invalid", role: "N" });
  const legacyForgedRole = await invoke(clientsHandler, request(forgedLegacyRoleToken));
  await prisma.tenantMembership.update({
    where: { id: admin.identity.membershipId },
    data: { deniedPermissions: [PERMS.CLIENTS_VIEW] },
  });
  const legacyDenied = await invoke(clientsHandler, request(legacyToken));
  await prisma.tenantMembership.update({
    where: { id: admin.identity.membershipId },
    data: { deniedPermissions: [] },
  });
  const legacySessionCountAfter = await prisma.authSession.count();
  process.env.MT01B_AUTH_MODE = previousMode;

  check("LEGACY /auth/me publica capacidades revalidadas", legacyMe.statusCode === 200
    && JSON.stringify(Object.keys(legacyMe.body).sort()) === JSON.stringify(["ok", "user"])
    && Array.isArray(legacyMe.body.user.permissions)
    && Array.isArray(legacyMe.body.user.deniedPermissions)
    && legacyMe.body.user.role === "A");
  for (const [name, response] of [["Usuarios", legacyUsers], ["Clientes", legacyClients], ["Proyectos", legacyProjects]]) {
    check(`LEGACY ${name} conserva envoltura`, response.statusCode === 200 && JSON.stringify(Object.keys(response.body).sort()) === JSON.stringify(["data", "ok", "total"]));
  }
  check("LEGACY anónimo falla cerrado", legacyAnonymous.statusCode === 401 && legacyAnonymous.body?.error === "MT01B_TOKEN_REQUIRED");
  check("rol del JWT LEGACY no reemplaza Membership", legacyForgedRole.statusCode === 200 && legacyForgedRole.body?.ok === true);
  check("deny de Membership prevalece también en LEGACY", legacyDenied.statusCode === 403 && legacyDenied.body?.error === "MT01B_PERMISSION_FORBIDDEN");
  check("LEGACY no crea AuthSession", legacySessionCountAfter === legacySessionCountBefore, { before: legacySessionCountBefore, after: legacySessionCountAfter });

  const meV2 = await invoke(meHandler, request(admin.session.accessToken));
  const expectedAuthKeys = ["authVersion", "authorizationVersion", "email", "membershipId", "permissions", "role", "sessionId", "tenantCode", "tenantId", "userId"].sort();
  check("/auth/me V2 expone contrato canónico versionado", meV2.statusCode === 200 && JSON.stringify(Object.keys(meV2.body).sort()) === JSON.stringify(["auth", "ok"]) && JSON.stringify(Object.keys(meV2.body.auth).sort()) === JSON.stringify(expectedAuthKeys));
  check("/auth/me V2 usa identidad de backend", meV2.body.auth.userId === admin.identity.userId && meV2.body.auth.tenantId === admin.identity.tenantId && meV2.body.auth.membershipId === admin.identity.membershipId && meV2.body.auth.role === "A" && meV2.body.auth.sessionId === admin.session.identity.sessionId);
  check("/auth/me V2 no filtra secretos ni permisos internos", !/token|hash|cookie|granted|denied/i.test(Object.keys(meV2.body.auth).join("|")));

  for (const [name, handler] of [["Usuarios", usersHandler], ["Clientes", clientsHandler], ["Proyectos", projectsHandler]]) {
    const response = await invoke(handler, request(admin.session.accessToken, "GET", { headers: { "x-osi-role": "N", "x-osi-userid": "forged" } }));
    check(`V2 ${name} acepta contexto empresarial y omite headers`, response.statusCode === 200 && response.body?.ok === true);
  }

  const vendor = await identitySession("pilot-vendor", { role: "V" });
  await expectRouteError("headers falsificados no elevan rol V2", usersHandler, vendor.session.accessToken, 403, "MT01B_PERMISSION_FORBIDDEN", { "x-osi-role": "A", "x-osi-userid": admin.identity.userId });

  const coordinatorIdentity = await createIdentity(prisma, `pilot-read-only-${randomUUID().slice(0, 6)}`, { role: "N" });
  await prisma.tenantMembership.update({
    where: { id: coordinatorIdentity.membershipId },
    data: { grantedPermissions: [PERMS.USERS_VIEW, PERMS.CLIENTS_VIEW, PERMS.PROJECTS_VIEW] },
  });
  const coordinatorSession = await createMembershipAuthSession(prisma, coordinatorIdentity, { req: syntheticRequest(), now });
  const coordinator = { identity: coordinatorIdentity, session: coordinatorSession };
  const coordinatorGet = await invoke(clientsHandler, request(coordinator.session.accessToken, "GET"));
  check("permiso de lectura permite GET", coordinatorGet.statusCode === 200 && coordinatorGet.body?.ok === true);
  const clientCountBeforeForgedPost = await prisma.client.count();
  await expectMethodError(
    "permiso de lectura no permite POST ni campos empresariales falsificados",
    clientsHandler,
    coordinator.session.accessToken,
    "POST",
    403,
    "MT01B_PERMISSION_FORBIDDEN",
    { body: { name: "No crear", tenantId: admin.identity.tenantId, membershipId: admin.identity.membershipId, role: "A", authorizationVersion: 999 } },
  );
  check("POST denegado no crea recurso", await prisma.client.count() === clientCountBeforeForgedPost);

  for (const [name, handler] of [["Usuarios", usersHandler], ["Clientes", clientsHandler], ["Proyectos", projectsHandler]]) {
    await expectMethodError(
      `campos empresariales no elevan POST de ${name}`,
      handler,
      coordinator.session.accessToken,
      "POST",
      403,
      "MT01B_PERMISSION_FORBIDDEN",
      { body: { tenantId: admin.identity.tenantId, membershipId: admin.identity.membershipId, userId: admin.identity.userId, role: "A", permissions: ["*"], authorizationVersion: 999 } },
    );
  }

  const denied = await createIdentity(prisma, `pilot-denied-${randomUUID().slice(0, 6)}`, { role: "A" });
  let overlapRejected = false;
  try {
    await prisma.tenantMembership.update({ where: { id: denied.membershipId }, data: { grantedPermissions: [PERMS.CLIENTS_VIEW], deniedPermissions: [PERMS.CLIENTS_VIEW] } });
  } catch {
    overlapRejected = true;
  }
  check("la base rechaza grant y deny simultáneos", overlapRejected);
  await prisma.tenantMembership.update({ where: { id: denied.membershipId }, data: { grantedPermissions: [], deniedPermissions: [PERMS.CLIENTS_VIEW] } });
  const deniedSession = await createMembershipAuthSession(prisma, denied, { req: syntheticRequest(), now });
  await expectRouteError("denied prevalece sobre rol y grant", clientsHandler, deniedSession.accessToken, 403, "MT01B_PERMISSION_FORBIDDEN");

  const granted = await createIdentity(prisma, `pilot-granted-${randomUUID().slice(0, 6)}`, { role: "N" });
  await prisma.tenantMembership.update({ where: { id: granted.membershipId }, data: { grantedPermissions: [PERMS.CLIENTS_VIEW] } });
  const grantedSession = await createMembershipAuthSession(prisma, granted, { req: syntheticRequest(), now });
  const grantedResponse = await invoke(clientsHandler, request(grantedSession.accessToken));
  check("grant empresarial habilita permiso ausente del rol", grantedResponse.statusCode === 200 && grantedResponse.body?.ok === true);

  const revoked = await identitySession("pilot-revoked");
  const beforeRevocation = await invoke(clientsHandler, request(revoked.session.accessToken));
  check("sesión funciona antes de revocarse", beforeRevocation.statusCode === 200);
  await prisma.authSession.update({ where: { id: revoked.session.identity.sessionId }, data: { status: "REVOKED", revokedAt: now } });
  await expectRouteError("sesión revocada rechazada por ruta", clientsHandler, revoked.session.accessToken, 401, "MT01B_AUTHORIZATION_INVALID");
  const compromised = await identitySession("pilot-compromised");
  await prisma.authSession.update({ where: { id: compromised.session.identity.sessionId }, data: { status: "COMPROMISED", compromisedAt: now } });
  await expectRouteError("sesión comprometida rechazada por ruta", clientsHandler, compromised.session.accessToken, 401, "MT01B_AUTHORIZATION_INVALID");
  const suspendedMembership = await identitySession("pilot-membership");
  await prisma.tenantMembership.update({ where: { id: suspendedMembership.identity.membershipId }, data: { status: "SUSPENDED" } });
  await expectRouteError("membresía suspendida rechazada por ruta", clientsHandler, suspendedMembership.session.accessToken, 401, "MT01B_AUTHORIZATION_INVALID");
  const inactiveMembership = await identitySession("pilot-membership-inactive");
  await prisma.tenantMembership.update({ where: { id: inactiveMembership.identity.membershipId }, data: { status: "INACTIVE" } });
  await expectRouteError("membresía inactiva rechazada por ruta", clientsHandler, inactiveMembership.session.accessToken, 401, "MT01B_AUTHORIZATION_INVALID");
  const inactiveUser = await identitySession("pilot-user-inactive");
  await prisma.user.update({ where: { id: inactiveUser.identity.userId }, data: { status: "inactive" } });
  await expectRouteError("usuario global inactivo rechazado por ruta", clientsHandler, inactiveUser.session.accessToken, 401, "MT01B_AUTHORIZATION_INVALID");
  const suspendedTenant = await identitySession("pilot-tenant");
  await prisma.tenant.update({ where: { id: suspendedTenant.identity.tenantId }, data: { status: "SUSPENDED" } });
  await expectRouteError("tenant suspendido rechazado por ruta", clientsHandler, suspendedTenant.session.accessToken, 401, "MT01B_AUTHORIZATION_INVALID");
  const stale = await identitySession("pilot-stale");
  const beforeAuthorizationChange = await invoke(clientsHandler, request(stale.session.accessToken));
  check("sesión funciona antes de incrementar authorizationVersion", beforeAuthorizationChange.statusCode === 200);
  await prisma.tenantMembership.update({ where: { id: stale.identity.membershipId }, data: { authorizationVersion: { increment: 1 } } });
  await expectRouteError("authorizationVersion obsoleta rechazada por ruta", clientsHandler, stale.session.accessToken, 401, "MT01B_AUTHORIZATION_INVALID");
  const changedRole = await identitySession("pilot-role", { role: "V" });
  await prisma.tenantMembership.update({ where: { id: changedRole.identity.membershipId }, data: { role: "A", authorizationVersion: { increment: 1 } } });
  await expectRouteError("rol JWT distinto del actual se rechaza", clientsHandler, changedRole.session.accessToken, 401, "MT01B_AUTHORIZATION_INVALID");

  const otherTenant = await createIdentity(prisma, `pilot-cross-${randomUUID().slice(0, 6)}`);
  const crossedToken = signMembershipAccessToken({ ...admin.session.identity, tenantId: otherTenant.tenantId, membershipId: otherTenant.membershipId });
  await expectRouteError("usuario membresía tenant cruzados se rechazan", clientsHandler, crossedToken, 401, "MT01B_AUTHORIZATION_INVALID");
  await expectRouteError("Bearer malformado se rechaza", clientsHandler, `${admin.session.accessToken} extra`, 401, "MT01B_TOKEN_REQUIRED");
  const duplicatedAuthorization = request(admin.session.accessToken);
  duplicatedAuthorization.headers.authorization = [`Bearer ${admin.session.accessToken}`, `Bearer ${vendor.session.accessToken}`];
  const duplicatedAuthorizationResponse = await invoke(clientsHandler, duplicatedAuthorization);
  check("dos Authorization se rechazan como ambiguos", duplicatedAuthorizationResponse.statusCode === 401 && duplicatedAuthorizationResponse.body?.error === "MT01B_TOKEN_REQUIRED");
  const invalidV2 = `${admin.session.accessToken.slice(0, -1)}${admin.session.accessToken.endsWith("a") ? "b" : "a"}`;
  await expectRouteError("JWT V2 inválido no degrada a LEGACY", clientsHandler, invalidV2, 401, "MT01B_TOKEN_INVALID");

  const secondTenant = await identitySession("pilot-similar", { role: "A" });
  check("tenants similares conservan identidades separadas", secondTenant.identity.tenantId !== admin.identity.tenantId && secondTenant.identity.membershipId !== admin.identity.membershipId);

  const measuredPrisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL, log: [{ emit: "event", level: "query" }] });
  let queryCount = 0;
  measuredPrisma.$on("query", () => { queryCount += 1; });
  const measuredRequest = request(admin.session.accessToken);
  const measuredResponse = mockResponse();
  const started = performance.now();
  const firstContext = await requirePilotPermission(measuredRequest, measuredResponse, PERMS.CLIENTS_VIEW, { prisma: measuredPrisma, now });
  const secondContext = await requirePilotPermission(measuredRequest, measuredResponse, PERMS.CLIENTS_VIEW, { prisma: measuredPrisma, now });
  const durationMs = Number((performance.now() - started).toFixed(2));
  await measuredPrisma.$disconnect();
  check("contexto se resuelve una vez por solicitud", firstContext === secondContext && queryCount === 1, { queryCount, durationMs });

  const source = await import("node:fs/promises");
  const routeTexts = await Promise.all(["users", "clients", "projects"].map((name) => source.readFile(new URL(`../api/${name}/index.js`, import.meta.url), "utf8")));
  check("rutas piloto no usan headers heredados", routeTexts.every((text) => !/x-osi-(?:role|userid)|require(?:Perm|Role)FromHeaders/.test(text)));
  check("modelos sin tenantId quedan sin aislamiento inventado", routeTexts.every((text) => !/requireTenantResource/.test(text)), "Client, Project y User no poseen tenantId directo en el datamodel actual");

  const metrics = { authContextQueriesPerRequest: queryCount, measuredMs: durationMs };
  process.stdout.write(`${JSON.stringify({ ok: true, passed: results.length, failed: 0, metrics, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, passed: results.filter((item) => item.passed).length, failed: 1, results, error: { name: error.name, code: error.code, message: error.message, stack: error.stack } }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
