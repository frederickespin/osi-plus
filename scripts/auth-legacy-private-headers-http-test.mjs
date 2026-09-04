import { createServer, request as httpRequest } from "node:http";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

process.env.MT01B_AUTH_MODE = "LEGACY";
process.env.MT01B_TENANT_SWITCH_ENABLED = "false";
process.env.VITE_MT01B2_CLIENT_ENABLED = "false";

const { prisma } = await import("../api/_lib/db.js");
const { legacyJwtSecretMaterial, signAccessToken } = await import("../api/_lib/auth.js");
const { default: login } = await import("../api/auth/login.js");
const { default: me } = await import("../api/auth/me.js");
const { default: refresh } = await import("../api/auth/refresh.js");
const { default: logout } = await import("../api/auth/logout.js");
const { default: upgrade } = await import("../api/auth/session/upgrade.js");

const results = [];
function check(name, condition, detail) {
  results.push({ name, passed: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
  if (!condition) throw new Error(name);
}

const user = Object.freeze({
  id: "auth-legacy-hf1a-user",
  code: "AUTH-HF1A",
  name: "Usuario sintético Auth HF1A",
  email: "auth-hf1a@example.invalid",
  phone: "0000000000",
  role: "A",
  status: "active",
  department: "QA",
  joinDate: "2026-08-19",
  points: 0,
  rating: 0,
  passwordHash: await bcrypt.hash("Synthetic-Auth-HF1A-Password", 4),
});

const handlers = new Map([
  ["/api/auth/login", login],
  ["/api/auth/me", me],
  ["/api/auth/refresh", refresh],
  ["/api/auth/logout", logout],
  ["/api/auth/session/upgrade", upgrade],
]);

let lookupMode = "FOUND";
let lookupCount = 0;
const originalFindUnique = prisma.user.findUnique;
const originalFindMany = prisma.user.findMany;
const originalQueryRaw = prisma.$queryRaw;
prisma.user.findUnique = async () => {
  lookupCount += 1;
  if (lookupMode === "FAIL") throw new Error("postgresql://must-not-leak");
  if (lookupMode === "MISSING") return null;
  return user;
};
prisma.user.findMany = async () => {
  lookupCount += 1;
  if (lookupMode === "FAIL") throw new Error("postgresql://must-not-leak");
  if (lookupMode === "MISSING") return [];
  return [user];
};
prisma.$queryRaw = async () => {
  lookupCount += 1;
  if (lookupMode === "FAIL") throw new Error("postgresql://must-not-leak");
  if (lookupMode === "MISSING") return [];
  return [{
    user_id: user.id,
    user_email: user.email,
    user_status: user.status,
    tenant_id: "auth-hf1a-tenant",
    tenant_code: "AUTH-HF1A-TENANT",
    tenant_status: "ACTIVE",
    membership_id: "auth-hf1a-membership",
    membership_public_ref: "68fa3dc7-b461-4f6f-bb33-5d2e7ed2d21e",
    membership_role: user.role,
    membership_status: "ACTIVE",
    authorization_version: 1,
    granted_permissions: [],
    denied_permissions: [],
    is_default: true,
    tenant_name: "Tenant sintético Auth",
  }];
};

function responseAdapter(response) {
  response.status = function status(code) { this.statusCode = code; return this; };
  response.json = function json(value) {
    if (!this.headersSent) this.setHeader("Content-Type", "application/json; charset=utf-8");
    this.end(JSON.stringify(value));
    return this;
  };
  response.send = function send(value) { this.end(value); return this; };
  return response;
}

const server = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const rawBody = Buffer.concat(chunks).toString("utf8");
  request.body = rawBody;
  request.query = {};
  const handler = handlers.get(new URL(request.url, "http://127.0.0.1").pathname);
  if (!handler) {
    response.statusCode = 404;
    return response.end();
  }
  await handler(request, responseAdapter(response));
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const { port } = server.address();

async function call(path, { method = "GET", headers = {}, body, duplicateAuthorization = false } = {}) {
  return await new Promise((resolve, reject) => {
    const options = { host: "127.0.0.1", port, path, method, headers: { Connection: "close", ...headers } };
    const client = httpRequest(options, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = null; }
        resolve({ status: response.statusCode, headers: response.headers, text, json });
      });
    });
    client.once("error", reject);
    if (duplicateAuthorization) {
      client.setHeader("Authorization", ["Bearer first.invalid.token", "Bearer second.invalid.token"]);
    }
    if (body !== undefined) client.write(body);
    client.end();
  });
}

function secure(name, response) {
  const vary = String(response.headers.vary || "").toLowerCase();
  check(`${name}: cache privada`, response.headers["cache-control"] === "private, no-store");
  check(`${name}: Vary completo`, vary.includes("authorization") && vary.includes("origin"));
  check(`${name}: sin wildcard`, response.headers["access-control-allow-origin"] === undefined);
  check(`${name}: sin credenciales CORS`, response.headers["access-control-allow-credentials"] === undefined);
  check(`${name}: sin cookie`, response.headers["set-cookie"] === undefined);
  check(`${name}: respuesta sanitizada`, !response.text.match(/postgresql|passwordHash|stack|must-not-leak/i));
}

try {
  const loginOk = await call("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://external.example.invalid" },
    body: JSON.stringify({ email: user.email, password: "Synthetic-Auth-HF1A-Password" }),
  });
  check("login LEGACY válido conserva 200", loginOk.status === 200 && loginOk.json?.ok === true && typeof loginOk.json?.token === "string" && loginOk.json?.membershipSelection?.options?.length === 1);
  secure("login válido con Origin externo no concedido", loginOk);

  const invalid = await call("/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: user.email, password: "incorrecta" }),
  });
  check("login inválido conserva 401", invalid.status === 401 && invalid.json?.error === "Credenciales inválidas");
  secure("login inválido", invalid);

  for (const [name, body, contentType, expected, code] of [
    ["JSON vacío", "", "application/json", 400, "REQUEST_JSON_REQUIRED"],
    ["JSON truncado", '{"email":', "application/json", 400, "REQUEST_JSON_INVALID"],
    ["array", "[]", "application/json", 400, "REQUEST_JSON_OBJECT_REQUIRED"],
    ["formulario simple", `email=${encodeURIComponent(user.email)}&password=x`, "application/x-www-form-urlencoded", 415, "REQUEST_CONTENT_TYPE_INVALID"],
  ]) {
    const response = await call("/api/auth/login", { method: "POST", headers: { "Content-Type": contentType }, body });
    check(`${name} rechazado`, response.status === expected && response.json?.code === code);
    secure(name, response);
  }

  const extra = await call("/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: user.email, password: "x", role: "A" }),
  });
  check("campos adicionales rechazados", extra.status === 400 && extra.json?.error === "Solicitud de autenticación inválida");
  secure("campos adicionales", extra);

  for (const [name, body] of [
    ["email no string", { email: [user.email], password: "x" }],
    ["password no string", { email: user.email, password: { value: "x" } }],
  ]) {
    const response = await call("/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    check(`${name} rechazado`, response.status === 400 && response.json?.error === "Solicitud de autenticación inválida");
    secure(name, response);
  }

  const beforeDuplicateLogin = lookupCount;
  const duplicateLogin = await call("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: user.email, password: "Synthetic-Auth-HF1A-Password" }),
    duplicateAuthorization: true,
  });
  check("Authorization duplicado en login se rechaza antes de Prisma", duplicateLogin.status === 401 && lookupCount === beforeDuplicateLogin);
  secure("Authorization duplicado en login", duplicateLogin);

  const token = loginOk.json.token;
  const meOk = await call("/api/auth/me", { headers: { Authorization: `Bearer ${token}`, "X-OSI-Membership-Ref": "68fa3dc7-b461-4f6f-bb33-5d2e7ed2d21e" } });
  check("auth/me válido conserva 200", meOk.status === 200 && meOk.json?.user?.membership?.membershipRef === "68fa3dc7-b461-4f6f-bb33-5d2e7ed2d21e" && meOk.json?.user?.id === undefined);
  secure("auth/me válido", meOk);

  for (const [name, authorization, expectedCode] of [
    ["Bearer ausente", undefined, "MT01B_TOKEN_REQUIRED"],
    ["Bearer manipulado", "Bearer invalid.invalid.invalid", "MT01B_TOKEN_INVALID"],
    ["Bearer expirado", `Bearer ${jwt.sign({ sub: user.id, email: user.email, role: user.role }, legacyJwtSecretMaterial(), { expiresIn: -1 })}`, "MT01B_TOKEN_INVALID"],
  ]) {
    const response = await call("/api/auth/me", { headers: authorization ? { Authorization: authorization } : {} });
    check(`${name} devuelve 401`, response.status === 401 && response.json?.error === expectedCode);
    secure(name, response);
  }

  const beforeDuplicate = lookupCount;
  const duplicate = await call("/api/auth/me", { duplicateAuthorization: true });
  check("Authorization duplicado se rechaza antes de Prisma", duplicate.status === 401 && lookupCount === beforeDuplicate);
  secure("Authorization duplicado", duplicate);

  const loginHeadBefore = lookupCount;
  const loginHead = await call("/api/auth/login", { method: "HEAD" });
  check("HEAD login es 405 sin body ni Prisma", loginHead.status === 405 && loginHead.text === "" && lookupCount === loginHeadBefore);
  secure("HEAD login", loginHead);
  const meHead = await call("/api/auth/me", { method: "HEAD", headers: { Authorization: `Bearer ${token}` } });
  check("HEAD auth/me conserva 200 sin body", meHead.status === 200 && meHead.text === "");
  secure("HEAD auth/me", meHead);

  for (const path of ["/api/auth/login", "/api/auth/me"]) {
    const before = lookupCount;
    const options = await call(path, { method: "OPTIONS", headers: { Origin: "https://external.example.invalid" } });
    check(`OPTIONS ${path} es 405 antes de Prisma`, options.status === 405 && lookupCount === before);
    secure(`OPTIONS ${path}`, options);
  }

  const method = await call("/api/auth/me", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  check("método no permitido conserva 405", method.status === 405 && method.json?.error === "Method Not Allowed");
  secure("método 405", method);

  lookupMode = "FAIL";
  const databaseLogin = await call("/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: user.email, password: "never-log" }),
  });
  check("falla Prisma login produce 503 sanitizado", databaseLogin.status === 503 && databaseLogin.json?.error === "AUTH_DATABASE_UNAVAILABLE");
  secure("503 login", databaseLogin);
  const databaseMe = await call("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
  check("falla Prisma auth/me produce 503 sanitizado", databaseMe.status === 503 && databaseMe.json?.error === "MT01B_AUTH_DATABASE_UNAVAILABLE");
  secure("503 auth/me", databaseMe);
  lookupMode = "FOUND";

  for (const path of ["/api/auth/refresh", "/api/auth/logout", "/api/auth/session/upgrade"]) {
    const response = await call(path, { method: "POST", headers: { Origin: "https://external.example.invalid" } });
    check(`${path} permanece desactivado`, response.status === 409 && response.json?.error === "MT01B_AUTH_V2_DISABLED");
    secure(path, response);
    const options = await call(path, { method: "OPTIONS", headers: { Origin: "https://external.example.invalid" } });
    check(`OPTIONS ${path} no responde 204`, options.status === 409 && options.json?.error === "MT01B_AUTH_V2_DISABLED");
    secure(`OPTIONS ${path}`, options);
  }

  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, routes: handlers.size })}\n`);
} finally {
  prisma.user.findUnique = originalFindUnique;
  prisma.user.findMany = originalFindMany;
  prisma.$queryRaw = originalQueryRaw;
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
}
