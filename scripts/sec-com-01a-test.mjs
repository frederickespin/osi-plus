import { createHash, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function validateTarget() {
  const raw = String(process.env.SECCOM01A_TEST_DATABASE_URL || "").trim();
  if (!raw) fail("SECCOM01A_DATABASE_REQUIRED", "SECCOM01A_TEST_DATABASE_URL es obligatoria");
  let url;
  try { url = new URL(raw); } catch { fail("SECCOM01A_DATABASE_INVALID", "La URL local no es válida"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || url.hostname !== "127.0.0.1") {
    fail("SECCOM01A_DATABASE_EXTERNAL", "La suite exige PostgreSQL local en 127.0.0.1");
  }
  const database = decodeURIComponent(url.pathname.slice(1));
  const allowed = (url.port === "55433" && database === "osi_sec_com_01a") ||
    (url.port === "55432" && new Set(["osi_sec_com_01a", "osi_db01n_ci", "osi_mt01c1b3a_q1_20260809", "osi_db01n_mt01c2b1_local", "osi_db01n_mt01c2b2_local"]).has(database));
  if (!allowed || url.searchParams.get("schema") !== "osi") {
    fail("SECCOM01A_DATABASE_SCOPE_INVALID", "La suite exige la base y schema aislados de SEC-COM-01A");
  }
  if (/neon|pooler/i.test(raw)) fail("SECCOM01A_DATABASE_EXTERNAL", "Se rechazó una conexión externa");
  return { raw, database, port: Number(url.port) };
}

const target = validateTarget();
process.env.DATABASE_URL = target.raw;
process.env.DIRECT_URL = target.raw;
process.env.JWT_SECRET = "sec-com-01a-local-jwt-secret-not-for-runtime";
process.env.MT01B_AUTH_MODE = "LEGACY";
process.env.MT01B_TENANT_SWITCH_ENABLED = "false";
process.env.VITE_MT01B2_CLIENT_ENABLED = "false";

const [{ PrismaClient }, { signAccessToken, signMembershipAccessToken }, { PERMS }, { requirePilotPermission }, { mockResponse }, { prisma: appPrisma }, { default: osiIndex }, { default: osiDetail }, { default: dashboard }] = await Promise.all([
  import("@prisma/client"),
  import("../api/_lib/auth.js"),
  import("../api/_lib/rbac.js"),
  import("../api/_lib/authContextPilot.js"),
  import("./mt-01b1-test-helpers.mjs"),
  import("../api/_lib/db.js"),
  import("../api/osis/index.js"),
  import("../api/osis/[id].js"),
  import("../api/k/dashboard.js"),
]);

const prisma = new PrismaClient({ datasourceUrl: target.raw });
const results = [];
const observedStatuses = [];
function check(name, condition, detail) {
  results.push({ name, passed: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
  if (!condition) throw new Error(name);
}
function request(method, { token, query = {}, headers = {} } = {}) {
  return {
    method,
    query,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  };
}
async function invoke(handler, req) {
  const res = mockResponse();
  await handler(req, res);
  observedStatuses.push(res.statusCode);
  return res;
}
function stable(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  }
  return value;
}
function fingerprint(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}
function hasPrivateNoStore(res) {
  const cacheControl = String(res.getHeader("cache-control") || "").toLowerCase();
  const vary = String(res.getHeader("vary") || "").toLowerCase().split(",").map((value) => value.trim());
  return cacheControl === "private, no-store" && vary.includes("authorization");
}

const suffix = randomUUID().slice(0, 8);
const ids = {
  client: `sec-client-${suffix}`,
  project: `sec-project-${suffix}`,
  osi: `sec-osi-${suffix}`,
  authorized: `sec-user-a-${suffix}`,
  denied: `sec-user-x-${suffix}`,
  inactive: `sec-user-i-${suffix}`,
  suspended: `sec-user-s-${suffix}`,
  coordinator: `sec-user-k-${suffix}`,
  projectViewer: `sec-user-v-${suffix}`,
  deleted: `sec-user-deleted-${suffix}`,
  tenant: `sec-tenant-${suffix}`,
  membership: `sec-membership-${suffix}`,
  session: `sec-session-${suffix}`,
};
const tokenFor = (id, role) => signAccessToken({ sub: id, email: `${id}@example.invalid`, role });
let identityBefore;

try {
  const identity = await prisma.$queryRaw`
    SELECT current_database() AS database,
           inet_server_addr()::text AS address,
           inet_server_port() AS port,
           current_schema() AS schema,
           current_setting('neon.branch_id', true) AS neon_branch
  `;
  const db = identity[0];
  check("destino PostgreSQL local verificado después de conectar", db.database === target.database && ["127.0.0.1", "127.0.0.1/32"].includes(db.address) && db.port === target.port && db.schema === "osi" && !db.neon_branch);

  await prisma.user.createMany({
    data: [
      [ids.authorized, "A", "active"],
      [ids.denied, "X", "active"],
      [ids.inactive, "A", "inactive"],
      [ids.suspended, "A", "suspended"],
      [ids.coordinator, "K", "active"],
      [ids.projectViewer, "V", "active"],
    ].map(([id, role, status]) => ({
      id,
      code: id.toUpperCase(),
      name: "Actor sintético SEC-COM-01A",
      email: `${id}@example.invalid`,
      phone: "0000000000",
      role,
      status,
      department: "QA",
      joinDate: "2026-08-09",
      passwordHash: "not-used",
    })),
  });
  await prisma.client.create({
    data: {
      id: ids.client,
      code: `SEC-CLIENT-${suffix}`,
      name: "Cliente sintético SEC-COM-01A",
      email: `client-${suffix}@example.invalid`,
      phone: "0000000000",
      address: "Synthetic",
      type: "individual",
      status: "active",
      createdAt: "2026-08-09",
    },
  });
  await prisma.project.create({
    data: {
      id: ids.project,
      code: `SEC-PROJECT-${suffix}`,
      name: "Proyecto sintético SEC-COM-01A",
      clientId: ids.client,
      clientName: "Cliente sintético SEC-COM-01A",
      status: "active",
      startDate: "2099-01-15",
    },
  });
  await prisma.osi.create({
    data: {
      id: ids.osi,
      code: `SEC-OSI-${suffix}`,
      projectId: ids.project,
      projectCode: `SEC-PROJECT-${suffix}`,
      clientId: ids.client,
      clientName: "Cliente sintético SEC-COM-01A",
      status: "draft",
      type: "local",
      origin: "Origen sintético",
      destination: "Destino sintético",
      scheduledDate: "2099-01-15",
      createdAt: "2026-08-09",
      team: [],
      vehicles: [],
      value: 321.5,
      notes: "nota protegida",
      supervisorNotes: "supervisión protegida",
      ptfMaterialPlan: { source: "SYNTHETIC", items: [] },
      petPlan: { source: "SYNTHETIC", slots: 0 },
    },
  });
  await prisma.osiChangeLog.create({
    data: { osiId: ids.osi, actorUserId: ids.authorized, actorRole: "A", action: "CREATE", fieldPath: "notes", afterJson: "nota protegida", reason: "evidencia sintética" },
  });
  await prisma.osiHandshake.create({
    data: { osiId: ids.osi, fromRole: "D", fromUserId: ids.authorized, toRole: "E", toUserId: ids.denied, notes: "custodia sintética" },
  });
  await prisma.osiMaterialReturn.create({
    data: { osiId: ids.osi, dispatchedJson: [], returnedJson: [], deviationJson: {}, recordedById: ids.authorized, recordedByRole: "A" },
  });
  await prisma.tenant.create({
    data: { id: ids.tenant, code: `SEC-${suffix}`.toUpperCase(), name: "Tenant sintético SEC-COM-01A" },
  });
  await prisma.tenantMembership.create({
    data: {
      id: ids.membership,
      tenantId: ids.tenant,
      userId: ids.authorized,
      role: "A",
      status: "ACTIVE",
      deniedPermissions: [PERMS.OSI_VIEW],
      authorizationVersion: 1,
    },
  });
  await prisma.authSession.create({
    data: {
      id: ids.session,
      tenantId: ids.tenant,
      membershipId: ids.membership,
      userId: ids.authorized,
      status: "ACTIVE",
      authorizationVersionSnapshot: 1,
      fingerprintHash: "a".repeat(64),
      expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
    },
  });

  const authorizedToken = tokenFor(ids.authorized, "A");
  const deniedToken = tokenFor(ids.denied, "X");
  const inactiveToken = tokenFor(ids.inactive, "A");
  const suspendedToken = tokenFor(ids.suspended, "A");
  const coordinatorToken = tokenFor(ids.coordinator, "K");
  const projectViewerToken = tokenFor(ids.projectViewer, "V");
  const deletedToken = tokenFor(ids.deleted, "A");
  const expiredToken = jwt.sign(
    { sub: ids.authorized, email: `${ids.authorized}@example.invalid`, role: "A" },
    process.env.JWT_SECRET,
    { expiresIn: -1 },
  );

  const anonymous = await invoke(osiIndex, request("GET"));
  check("GET /api/osis anónimo devuelve 401 sin cache", anonymous.statusCode === 401 && hasPrivateNoStore(anonymous));
  const anonymousDetail = await invoke(osiDetail, request("GET", { query: { id: ids.osi } }));
  check("GET /api/osis/:id anónimo devuelve 401 sin cache", anonymousDetail.statusCode === 401 && hasPrivateNoStore(anonymousDetail));
  const malformed = await invoke(osiIndex, request("GET", { headers: { authorization: "Bearer malformed" } }));
  check("JWT malformado devuelve 401", malformed.statusCode === 401 && hasPrivateNoStore(malformed));
  check("JWT expirado devuelve 401", (await invoke(osiIndex, request("GET", { token: expiredToken }))).statusCode === 401);
  check("JWT con firma inválida devuelve 401", (await invoke(osiIndex, request("GET", { token: `${authorizedToken.slice(0, -1)}x` }))).statusCode === 401);
  check("usuario eliminado después de emitir JWT devuelve 401", (await invoke(osiIndex, request("GET", { token: deletedToken }))).statusCode === 401);
  check("usuario inactive devuelve 401", (await invoke(osiIndex, request("GET", { token: inactiveToken }))).statusCode === 401);
  check("usuario suspended devuelve 401", (await invoke(osiDetail, request("GET", { token: suspendedToken, query: { id: ids.osi } }))).statusCode === 401);
  check("dos Authorization ambiguos se rechazan", (await invoke(osiIndex, request("GET", { headers: { authorization: `Bearer ${authorizedToken}, Bearer ${authorizedToken}` } }))).statusCode === 401);

  const denied = await invoke(osiIndex, request("GET", { token: deniedToken }));
  check("usuario sin osi:view devuelve 403 sin cache", denied.statusCode === 403 && denied.body?.perm === PERMS.OSI_VIEW && hasPrivateNoStore(denied));
  const forged = await invoke(osiIndex, request("GET", { token: deniedToken, headers: { "x-osi-role": "A", "x-osi-userid": ids.authorized } }));
  check("headers falsificados no conceden osi:view", forged.statusCode === 403);

  const list = await invoke(osiIndex, request("GET", { token: authorizedToken, query: { q: suffix, status: "draft" } }));
  check("usuario autorizado conserva listado funcional sin cache", list.statusCode === 200 && list.body?.ok === true && list.body?.total === 1 && list.body?.data?.[0]?.id === ids.osi && hasPrivateNoStore(list));
  const detail = await invoke(osiDetail, request("GET", { token: authorizedToken, query: { id: ids.osi } }));
  check("usuario autorizado conserva detalle y bitácoras sin cache", detail.statusCode === 200 && detail.body?.data?.changeLogs?.length === 1 && detail.body?.data?.handshakes?.length === 1 && detail.body?.data?.materialReturns?.length === 1 && hasPrivateNoStore(detail));
  check("dos usuarios no comparten respuesta protegida", list.statusCode === 200 && denied.statusCode === 403 && hasPrivateNoStore(list) && hasPrivateNoStore(denied) && denied.body?.data === undefined);
  check("método OSI no permitido conserva 405", (await invoke(osiIndex, request("PUT", { token: authorizedToken }))).statusCode === 405);
  const optionsResponse = await invoke(osiIndex, request("OPTIONS"));
  check("OPTIONS/CORS conserva preflight", optionsResponse.statusCode === 204 && String(optionsResponse.getHeader("access-control-allow-headers") || "").includes("Authorization"));

  const originalOsiFindMany = appPrisma.osi.findMany;
  appPrisma.osi.findMany = async () => { throw new Error("sensitive query detail"); };
  const osiDatabaseFailure = await invoke(osiIndex, request("GET", { token: authorizedToken }));
  appPrisma.osi.findMany = originalOsiFindMany;
  check("falla Prisma de lectura OSI devuelve 503 sanitizado sin cache", osiDatabaseFailure.statusCode === 503 && osiDatabaseFailure.body?.error === "DATABASE_UNAVAILABLE" && hasPrivateNoStore(osiDatabaseFailure) && !JSON.stringify(osiDatabaseFailure.body).includes("sensitive"));

  const unavailableReq = request("GET", { token: authorizedToken });
  const unavailableRes = mockResponse();
  const unavailable = await requirePilotPermission(unavailableReq, unavailableRes, PERMS.OSI_VIEW, { prisma: { user: { findUnique: async () => { throw new Error("sensitive database detail"); } } } });
  check("falla de autenticación en base devuelve 503 sanitizado", unavailable === null && unavailableRes.statusCode === 503 && unavailableRes.body?.error === "AUTH_DATABASE_UNAVAILABLE" && !JSON.stringify(unavailableRes.body).includes("sensitive"));

  process.env.MT01B_AUTH_MODE = "HYBRID";
  process.env.MT01B_LEGACY_TOKEN_ACCEPT_UNTIL = new Date(Date.now() + 60 * 60 * 1_000).toISOString();
  const candidate = signMembershipAccessToken({ userId: ids.authorized, membershipId: "missing-membership", tenantId: "missing-tenant", role: "A", authorizationVersion: 1, sessionId: "missing-session" });
  const invalidV2 = `${candidate.slice(0, -1)}${candidate.endsWith("a") ? "b" : "a"}`;
  const invalidV2Response = await invoke(osiIndex, request("GET", { token: invalidV2, headers: { "x-osi-role": "A" } }));
  check("JWT V2 inválido no degrada a LEGACY", invalidV2Response.statusCode === 401 && invalidV2Response.body?.error === "MT01B_TOKEN_INVALID");
  const explicitlyDeniedV2 = signMembershipAccessToken({ userId: ids.authorized, membershipId: ids.membership, tenantId: ids.tenant, role: "A", authorizationVersion: 1, sessionId: ids.session });
  const explicitDeniedResponse = await invoke(osiIndex, request("GET", { token: explicitlyDeniedV2 }));
  check("deniedPermissions prevalece en V2", explicitDeniedResponse.statusCode === 403 && explicitDeniedResponse.body?.error === "MT01B_PERMISSION_FORBIDDEN" && hasPrivateNoStore(explicitDeniedResponse));
  process.env.MT01B_AUTH_MODE = "LEGACY";
  delete process.env.MT01B_LEGACY_TOKEN_ACCEPT_UNTIL;

  identityBefore = {
    projects: await prisma.project.findMany({ where: { id: ids.project }, orderBy: { id: "asc" } }),
    signals: await prisma.projectSignal.findMany({ where: { projectId: ids.project }, orderBy: { id: "asc" } }),
    pgds: await prisma.projectPgd.findMany({ where: { projectId: ids.project }, orderBy: { id: "asc" } }),
  };
  const beforeHash = fingerprint(identityBefore);
  const anonymousDashboard = await invoke(dashboard, request("GET"));
  check("dashboard anónimo devuelve 401 sin cache", anonymousDashboard.statusCode === 401 && hasPrivateNoStore(anonymousDashboard));
  const forgedDashboard = await invoke(dashboard, request("GET", { token: deniedToken, headers: { "x-osi-role": "A", "x-osi-userid": ids.authorized } }));
  check("dashboard ignora headers falsificados", forgedDashboard.statusCode === 403 && hasPrivateNoStore(forgedDashboard));
  const nonCoordinatorDashboard = await invoke(dashboard, request("GET", { token: projectViewerToken }));
  check("projects:view sin rol A/K no amplía acceso histórico", nonCoordinatorDashboard.statusCode === 403);
  const firstDashboard = await invoke(dashboard, request("GET", { token: authorizedToken }));
  const secondDashboard = await invoke(dashboard, request("GET", { token: coordinatorToken }));
  const originalProjectFindMany = appPrisma.project.findMany;
  appPrisma.project.findMany = async () => { throw new Error("sensitive dashboard query detail"); };
  const dashboardDatabaseFailure = await invoke(dashboard, request("GET", { token: authorizedToken }));
  appPrisma.project.findMany = originalProjectFindMany;
  check("falla Prisma de dashboard devuelve 503 sanitizado sin cache", dashboardDatabaseFailure.statusCode === 503 && dashboardDatabaseFailure.body?.error === "DATABASE_UNAVAILABLE" && hasPrivateNoStore(dashboardDatabaseFailure) && !JSON.stringify(dashboardDatabaseFailure.body).includes("sensitive"));
  const identityAfter = {
    projects: await prisma.project.findMany({ where: { id: ids.project }, orderBy: { id: "asc" } }),
    signals: await prisma.projectSignal.findMany({ where: { projectId: ids.project }, orderBy: { id: "asc" } }),
    pgds: await prisma.projectPgd.findMany({ where: { projectId: ids.project }, orderBy: { id: "asc" } }),
  };
  check("dos GET dashboard autorizados conservan la misma respuesta sin cache", firstDashboard.statusCode === 200 && secondDashboard.statusCode === 200 && fingerprint(firstDashboard.body) === fingerprint(secondDashboard.body) && hasPrivateNoStore(firstDashboard) && hasPrivateNoStore(secondDashboard));
  check("GET dashboard no crea señales predeterminadas", identityAfter.signals.length === 0);
  check("GET dashboard no cambia filas, hashes ni timestamps", fingerprint(identityAfter) === beforeHash);
  const projectResult = firstDashboard.body?.data?.find((project) => project.id === ids.project);
  check("dashboard calcula fallback de señales en memoria", projectResult?.semaphores?.payment === "GREEN" && projectResult?.semaphores?.permits === "GREEN" && projectResult?.semaphores?.crates === "GREEN" && projectResult?.semaphores?.thirdParties === "GREEN");
  check("fallos controlados evaluados sin respuestas 500", !observedStatuses.includes(500));

  process.stdout.write(`${JSON.stringify({ ok: true, passed: results.length, writesFromDashboardGet: 0, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, passed: results.filter((item) => item.passed).length, failed: 1, results, error: { name: error.name, code: error.code, message: error.message } }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  process.env.MT01B_AUTH_MODE = "LEGACY";
  delete process.env.MT01B_LEGACY_TOKEN_ACCEPT_UNTIL;
  await prisma.osiMaterialReturn.deleteMany({ where: { osiId: ids.osi } }).catch(() => {});
  await prisma.osiHandshake.deleteMany({ where: { osiId: ids.osi } }).catch(() => {});
  await prisma.osiChangeLog.deleteMany({ where: { osiId: ids.osi } }).catch(() => {});
  await prisma.authSession.deleteMany({ where: { id: ids.session } }).catch(() => {});
  await prisma.tenantMembership.deleteMany({ where: { id: ids.membership } }).catch(() => {});
  await prisma.tenant.deleteMany({ where: { id: ids.tenant } }).catch(() => {});
  await prisma.projectSignal.deleteMany({ where: { projectId: ids.project } }).catch(() => {});
  await prisma.osi.deleteMany({ where: { id: ids.osi } }).catch(() => {});
  await prisma.project.deleteMany({ where: { id: ids.project } }).catch(() => {});
  await prisma.client.deleteMany({ where: { id: ids.client } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [ids.authorized, ids.denied, ids.inactive, ids.suspended, ids.coordinator, ids.projectViewer] } } }).catch(() => {});
  await prisma.$disconnect();
  await appPrisma.$disconnect();
}
