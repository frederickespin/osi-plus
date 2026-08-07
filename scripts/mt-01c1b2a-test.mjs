import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import loginHandler from "../api/auth/login.js";
import meHandler from "../api/auth/me.js";
import usersHandler from "../api/users/index.js";
import clientsHandler from "../api/clients/index.js";
import projectsHandler from "../api/projects/index.js";
import { isGloballyActiveUser } from "../api/_lib/userStatus.js";
import { requireAuth } from "../api/_lib/requireAuth.js";
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

const suffix = randomUUID().slice(0, 8);
const userId = randomUUID();
const email = `mt01c1b2a-${suffix}@example.invalid`;
const password = `Synthetic-${suffix}-Password`;
let token;
let initialSessionCount = 0;
let initialRefreshCount = 0;

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
      passwordHash: await bcrypt.hash(password, 4),
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

  await prisma.user.update({ where: { id: userId }, data: { status: "inactive" } });
  check("JWT previo queda rechazado tras inactivar", (await invoke(clientsHandler, authorized(token))).statusCode === 401);

  await prisma.user.update({ where: { id: userId }, data: { status: "active" } });
  check("reactivación vuelve a aceptar JWT LEGACY vigente", (await invoke(clientsHandler, authorized(token))).statusCode === 200);
  check("/auth/me activo conserva contrato", JSON.stringify(Object.keys((await invoke(meHandler, authorized(token))).body?.user || {}).sort()) === JSON.stringify(["code", "department", "email", "id", "joinDate", "name", "phone", "points", "rating", "role", "status"]));

  let statusQueries = 0;
  const cachedRequest = authorized(token);
  const fakePrisma = { user: { findUnique: async () => { statusQueries += 1; return { status: "active" }; } } };
  check("requireAuth acepta usuario activo", (await requireAuth(cachedRequest, mockResponse(), { prisma: fakePrisma }))?.id === userId);
  check("requireAuth reutiliza estado en la misma solicitud", (await requireAuth(cachedRequest, mockResponse(), { prisma: fakePrisma }))?.id === userId && statusQueries === 1);

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

  process.stdout.write(`${JSON.stringify({ ok: true, passed: results.length, failed: 0, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, passed: results.filter((item) => item.passed).length, failed: 1, results, error: { name: error.name, message: error.message, stack: error.stack } }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
}
