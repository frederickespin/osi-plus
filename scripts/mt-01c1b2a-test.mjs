import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import loginHandler, { authenticateLegacyCredentials } from "../api/auth/login.js";
import meHandler from "../api/auth/me.js";
import usersHandler from "../api/users/index.js";
import clientsHandler from "../api/clients/index.js";
import projectsHandler from "../api/projects/index.js";
import { isGloballyActiveUser } from "../api/_lib/userStatus.js";
import { requireAuth } from "../api/_lib/requireAuth.js";
import { readJsonObject } from "../api/_lib/http.js";
import { createTestPrisma, mockResponse } from "./mt-01b1-test-helpers.mjs";

process.env.MT01B_AUTH_MODE = "LEGACY";
process.env.MT01B_TENANT_SWITCH_ENABLED = "false";
process.env.VITE_MT01B2_CLIENT_ENABLED = "false";

const prisma = createTestPrisma();
const results = [];
function check(name, condition, detail) {
  results.push({ name, passed: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
  if (!condition) throw new Error(name);
}
async function invoke(handler, req) {
  const res = mockResponse();
  await handler(req, res);
  return res;
}
function post(body, headers = {}) {
  return { method: "POST", headers, body };
}
function authorized(token, method = "GET", body) {
  return {
    method,
    query: {},
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body }),
  };
}
function safeBody(res) {
  return JSON.stringify(res.body || {});
}
function asyncBodyRequest(chunks, headers = { "content-type": "application/json" }) {
  return {
    headers,
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk;
    },
  };
}

const suffix = randomUUID().slice(0, 8);
const userId = randomUUID();
const email = `mt01c1b2a-${suffix}@example.invalid`;
const password = `Synthetic-${suffix}-Password`;
let token;
let initialSessionCount = 0;
let initialRefreshCount = 0;
let loginTiming = {};
let requireAuthTiming = {};

try {
  initialSessionCount = await prisma.authSession.count();
  initialRefreshCount = await prisma.authRefreshToken.count();
  await prisma.user.create({
    data: {
      id: userId,
      code: `C1B2A-${suffix}`,
      name: "Usuario sintético C1B2A",
      email,
      phone: "0000000000",
      role: "A",
      status: "active",
      department: "QA",
      joinDate: "2026-08-07",
      passwordHash: await bcrypt.hash(password, 10),
    },
  });

  const activeLogin = await invoke(loginHandler, post({ email, password }, { "content-type": "application/json" }));
  check("login activo conserva 200", activeLogin.statusCode === 200 && activeLogin.body?.ok === true);
  check("login activo conserva contrato LEGACY", JSON.stringify(Object.keys(activeLogin.body).sort()) === JSON.stringify(["ok", "token", "user"]));
  token = activeLogin.body.token;
  const decoded = jwt.decode(token);
  check("JWT LEGACY conserva claims", JSON.stringify(Object.keys(decoded).sort()) === JSON.stringify(["email", "exp", "iat", "role", "sub"].sort()));
  check("login no emite cookie V2", activeLogin.getHeader("set-cookie") == null);

  const wrongPassword = await invoke(loginHandler, post({ email, password: "incorrecta" }, { "content-type": "application/json" }));
  check("contraseña incorrecta usa error genérico", wrongPassword.statusCode === 401 && wrongPassword.body?.error === "Credenciales inválidas");

  for (const candidate of [
    { name: "identidad inexistente", user: null },
    { name: "usuario ACTIVE", user: { passwordHash: "hash", status: "active" } },
    { name: "usuario INACTIVE", user: { passwordHash: "hash", status: "inactive" } },
    { name: "usuario SUSPENDED", user: { passwordHash: "hash", status: "suspended" } },
  ]) {
    let comparisons = 0;
    await authenticateLegacyCredentials({
      email: "timing@example.invalid",
      password: "not-logged",
      prismaClient: { user: { findUnique: async () => candidate.user } },
      compare: async () => { comparisons += 1; return candidate.user?.status === "active"; },
    });
    check(`${candidate.name} ejecuta una comparación bcrypt`, comparisons === 1);
  }
  const unavailableLogin = await authenticateLegacyCredentials({
    email,
    password,
    prismaClient: { user: { findUnique: async () => { throw new Error("database-url-secret"); } } },
    compare: async () => { throw new Error("no debe comparar sin base"); },
  });
  check("falla de base en login se clasifica sin detalles", unavailableLogin.outcome === "DATABASE_UNAVAILABLE");

  const measuredHash = await bcrypt.hash("timing-reference-password", 10);
  for (const [label, measuredUser] of [
    ["missing", null],
    ["wrongPassword", { passwordHash: measuredHash, status: "active" }],
    ["inactive", { passwordHash: measuredHash, status: "inactive" }],
    ["suspended", { passwordHash: measuredHash, status: "suspended" }],
  ]) {
    const samples = [];
    for (let round = 0; round < 5; round += 1) {
      const started = performance.now();
      await authenticateLegacyCredentials({
        email: "timing@example.invalid",
        password: "wrong-reference-password",
        prismaClient: { user: { findUnique: async () => measuredUser } },
      });
      samples.push(performance.now() - started);
    }
    const sorted = [...samples].sort((a, b) => a - b);
    loginTiming[label] = {
      averageMs: Number((samples.reduce((sum, value) => sum + value, 0) / samples.length).toFixed(2)),
      p95Ms: Number(sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(2)),
      maximumMs: Number(Math.max(...samples).toFixed(2)),
    };
  }

  for (const status of ["inactive", "suspended", "unknown", "", "   "]) {
    await prisma.user.update({ where: { id: userId }, data: { status } });
    const denied = await invoke(loginHandler, post({ email, password }, { "content-type": "application/json" }));
    check(`login rechaza estado ${JSON.stringify(status)}`, denied.statusCode === 401 && denied.body?.error === "Credenciales inválidas");
  }
  check("normalización rechaza null", !isGloballyActiveUser(null));
  check("normalización acepta active canónico", isGloballyActiveUser("active"));

  await prisma.user.update({ where: { id: userId }, data: { status: "suspended" } });
  const suspendedMe = await invoke(meHandler, authorized(token));
  const suspendedRoute = await invoke(clientsHandler, authorized(token));
  check("JWT previo queda rechazado por /auth/me tras suspensión", suspendedMe.statusCode === 401);
  check("JWT previo queda rechazado por requireAuth tras suspensión", suspendedRoute.statusCode === 401);
  for (const [name, handler] of [["users", usersHandler], ["clients", clientsHandler], ["projects", projectsHandler]]) {
    check(`${name} GET rechaza usuario SUSPENDED`, (await invoke(handler, authorized(token))).statusCode === 401);
    check(`${name} POST rechaza usuario SUSPENDED antes del body`, (await invoke(handler, authorized(token, "POST", "{"))).statusCode === 401);
  }

  await prisma.user.update({ where: { id: userId }, data: { status: "inactive" } });
  for (const [name, handler] of [["users", usersHandler], ["clients", clientsHandler], ["projects", projectsHandler]]) {
    check(`${name} GET rechaza usuario INACTIVE`, (await invoke(handler, authorized(token))).statusCode === 401);
    check(`${name} POST rechaza usuario INACTIVE antes del body`, (await invoke(handler, authorized(token, "POST", "{"))).statusCode === 401);
  }

  await prisma.user.update({ where: { id: userId }, data: { status: "active" } });
  for (const [name, handler] of [["users", usersHandler], ["clients", clientsHandler], ["projects", projectsHandler]]) {
    check(`${name} GET conserva acceso ACTIVE`, (await invoke(handler, authorized(token))).statusCode === 200);
    check(`${name} POST ACTIVE alcanza parser`, (await invoke(handler, authorized(token, "POST", "{"))).statusCode === 400);
  }
  check("/auth/me activo conserva contrato", JSON.stringify(Object.keys((await invoke(meHandler, authorized(token))).body?.user || {}).sort()) === JSON.stringify(["code", "department", "email", "id", "joinDate", "name", "phone", "points", "rating", "role", "status"]));

  let statusQueries = 0;
  const cachedRequest = authorized(token);
  const fakePrisma = { user: { findUnique: async () => { statusQueries += 1; return { status: "active" }; } } };
  check("requireAuth acepta usuario activo", (await requireAuth(cachedRequest, mockResponse(), { prisma: fakePrisma }))?.id === userId);
  check("requireAuth reutiliza estado en la misma solicitud", (await requireAuth(cachedRequest, mockResponse(), { prisma: fakePrisma }))?.id === userId && statusQueries === 1);
  const secondRequest = authorized(token);
  await requireAuth(secondRequest, mockResponse(), { prisma: fakePrisma });
  check("caché no cruza solicitudes", statusQueries === 2);

  const deletedResponse = mockResponse();
  check("usuario eliminado tras emitir JWT recibe 401", await requireAuth(authorized(token), deletedResponse, { prisma: { user: { findUnique: async () => null } } }) === null && deletedResponse.statusCode === 401);
  let failedQueries = 0;
  const failedRequest = authorized(token);
  const failingPrisma = { user: { findUnique: async () => { failedQueries += 1; throw new Error("postgresql://secret-host"); } } };
  const failedResponse = mockResponse();
  await requireAuth(failedRequest, failedResponse, { prisma: failingPrisma });
  check("falla Prisma devuelve 503 sanitizado", failedResponse.statusCode === 503 && failedResponse.body?.error === "AUTH_DATABASE_UNAVAILABLE" && !safeBody(failedResponse).includes("postgresql"));
  await requireAuth(failedRequest, mockResponse(), { prisma: failingPrisma });
  check("falla Prisma se consulta una vez dentro de la solicitud", failedQueries === 1);
  const notFoundResponse = mockResponse();
  const notFoundRequest = authorized(token);
  const current = await requireAuth(notFoundRequest, notFoundResponse, { prisma: fakePrisma });
  if (current) notFoundResponse.status(404).json({ ok: false, error: "RESOURCE_NOT_FOUND" });
  check("404 empresarial no cambia a 401", notFoundResponse.statusCode === 404 && notFoundResponse.body?.error === "RESOURCE_NOT_FOUND");
  let measuredStatusQueries = 0;
  const authSamples = [];
  const measuredPrisma = { user: { findUnique: async () => { measuredStatusQueries += 1; return { status: "active" }; } } };
  for (let round = 0; round < 100; round += 1) {
    const started = performance.now();
    await requireAuth(authorized(token), mockResponse(), { prisma: measuredPrisma });
    authSamples.push(performance.now() - started);
  }
  const sortedAuthSamples = [...authSamples].sort((a, b) => a - b);
  requireAuthTiming = {
    requests: authSamples.length,
    statusQueries: measuredStatusQueries,
    averageMs: Number((authSamples.reduce((sum, value) => sum + value, 0) / authSamples.length).toFixed(3)),
    p95Ms: Number(sortedAuthSamples[Math.ceil(sortedAuthSamples.length * 0.95) - 1].toFixed(3)),
    maximumMs: Number(Math.max(...authSamples).toFixed(3)),
  };
  check("requireAuth ejecuta exactamente una consulta por solicitud", measuredStatusQueries === authSamples.length);

  const jsonCases = [
    ["JSON truncado", "{\"email\":", 400, "REQUEST_JSON_INVALID", { "content-type": "application/json" }],
    ["JSON vacío", "", 400, "REQUEST_JSON_REQUIRED", { "content-type": "application/json" }],
    ["null", "null", 400, "REQUEST_JSON_OBJECT_REQUIRED", { "content-type": "application/json" }],
    ["array", "[]", 400, "REQUEST_JSON_OBJECT_REQUIRED", { "content-type": "application/json" }],
    ["string", "\"secreto-no-filtrar\"", 400, "REQUEST_JSON_OBJECT_REQUIRED", { "content-type": "application/json" }],
    ["número", "7", 400, "REQUEST_JSON_OBJECT_REQUIRED", { "content-type": "application/json" }],
    ["Content-Type incorrecto", "{}", 415, "REQUEST_CONTENT_TYPE_INVALID", { "content-type": "text/plain" }],
    ["payload excesivo", JSON.stringify({ password: "sensitive-value-" + "x".repeat(17 * 1024) }), 413, "REQUEST_BODY_TOO_LARGE", { "content-type": "application/json" }],
  ];
  for (const [name, body, status, code, headers] of jsonCases) {
    const response = await invoke(loginHandler, post(body, headers));
    check(`${name} devuelve ${status}`, response.statusCode === status && response.body?.error === code, response.body);
    check(`${name} no filtra payload`, !safeBody(response).includes("secreto-no-filtrar") && !safeBody(response).includes("sensitive-value"));
  }
  for (const contentType of ["application/json", "application/json; charset=utf-8", "Application/JSON; Charset=UTF-8", "application/problem+json"]) {
    const value = await readJsonObject({ headers: { "content-type": contentType }, body: "{\"ok\":true}" });
    check(`Content-Type JSON aceptado: ${contentType}`, value.ok === true);
  }
  try {
    await readJsonObject({ headers: { "content-type": "application/json", "content-length": "999999" }, body: "{}" }, { maxBytes: 32 });
    check("Content-Length excesivo se rechaza antes de leer", false);
  } catch (error) {
    check("Content-Length excesivo devuelve 413", error.status === 413 && error.code === "REQUEST_BODY_TOO_LARGE");
  }
  let oversizedRead = false;
  const oversizedStream = {
    headers: { "content-type": "application/json" },
    async *[Symbol.asyncIterator]() {
      oversizedRead = true;
      yield Buffer.from(`{\"x\":\"${"a".repeat(64)}\"}`);
    },
  };
  try {
    await readJsonObject(oversizedStream, { maxBytes: 16 });
    check("stream chunked excesivo se rechaza", false);
  } catch (error) {
    check("stream chunked se limita durante lectura", oversizedRead && error.status === 413);
  }
  try {
    await readJsonObject(asyncBodyRequest([Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0xc3, 0x28, 0x7d])]));
    check("UTF-8 inválido se rechaza", false);
  } catch (error) {
    check("UTF-8 inválido devuelve 400", error.status === 400 && error.code === "REQUEST_JSON_INVALID");
  }
  const deep = `${"{\"x\":".repeat(66)}1${"}".repeat(66)}`;
  try {
    await readJsonObject({ headers: { "content-type": "application/json" }, body: deep });
    check("JSON profundo se rechaza", false);
  } catch (error) {
    check("JSON profundo devuelve 400", error.status === 400 && error.code === "REQUEST_JSON_TOO_DEEP");
  }
  for (const key of ["__proto__", "constructor", "prototype"]) {
    try {
      await readJsonObject({ headers: { "content-type": "application/json" }, body: `{\"${key}\":{\"polluted\":true}}` });
      check(`clave ${key} se rechaza`, false);
    } catch (error) {
      check(`clave ${key} no contamina prototipo`, error.status === 400 && error.code === "REQUEST_JSON_UNSAFE_KEYS" && ({}).polluted === undefined);
    }
  }
  const parserGetterRequest = { method: "POST", headers: { "content-type": "application/json" } };
  Object.defineProperty(parserGetterRequest, "body", { get() { throw new SyntaxError("secret-parser-stack"); } });
  const parserGetterResponse = await invoke(loginHandler, parserGetterRequest);
  check("SyntaxError de parser de plataforma devuelve 400", parserGetterResponse.statusCode === 400 && parserGetterResponse.body?.error === "REQUEST_JSON_INVALID");
  check("SyntaxError de plataforma queda sanitizado", !safeBody(parserGetterResponse).includes("secret-parser-stack"));

  for (const [name, handler] of [["users", usersHandler], ["clients", clientsHandler], ["projects", projectsHandler]]) {
    const response = await invoke(handler, authorized(token, "POST", "{\"password\":\"never-log\""));
    check(`${name} convierte SyntaxError en 400`, response.statusCode === 400 && response.body?.error === "REQUEST_JSON_INVALID");
    check(`${name} sanitiza parser`, !safeBody(response).includes("never-log") && !safeBody(response).includes("SyntaxError"));
  }

  check("LEGACY no crea AuthSession", await prisma.authSession.count() === initialSessionCount);
  check("LEGACY no crea refresh token", await prisma.authRefreshToken.count() === initialRefreshCount);
  check("normalizedEmail permanece null", (await prisma.user.findUnique({ where: { id: userId }, select: { normalizedEmail: true } })).normalizedEmail === null);

  process.stdout.write(`${JSON.stringify({ ok: true, passed: results.length, failed: 0, loginTiming, requireAuthTiming, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, passed: results.filter((item) => item.passed).length, failed: 1, results, error: { name: error.name, message: error.message, stack: error.stack } }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
}
