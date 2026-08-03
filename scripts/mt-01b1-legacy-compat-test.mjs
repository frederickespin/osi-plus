import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createTestPrisma, mockResponse } from "./mt-01b1-test-helpers.mjs";

process.env.MT01B_AUTH_MODE = "LEGACY";
process.env.MT01B_TENANT_SWITCH_ENABLED = "false";

const prisma = createTestPrisma();
const results = [];
const check = (name, condition, detail = null) => {
  results.push({ name, passed: Boolean(condition), ...(detail ? { detail } : {}) });
  if (!condition) throw new Error(name);
};
const snapshot = JSON.parse(readFileSync(resolve("scripts/fixtures/mt01b1/legacy-auth-contract.json"), "utf8"));

function normalizedResponse(res, userId) {
  const body = structuredClone(res.body);
  if (body?.token) body.token = "[JWT]";
  if (body?.user?.id === userId) body.user.id = "[USER_ID]";
  return { status: res.statusCode, body };
}

try {
  const userId = randomUUID();
  const password = "Synthetic-Legacy-Password";
  await prisma.user.create({
    data: {
      id: userId,
      code: "MT01B-LEGACY",
      name: "Usuario Legacy Sintético",
      email: "mt01b-legacy@example.invalid",
      phone: "0000000000",
      role: "A",
      status: "active",
      department: "QA",
      joinDate: "2026-08-03",
      passwordHash: await bcrypt.hash(password, 4),
    },
  });

  const { default: login } = await import("../api/auth/login.js");
  const { default: me } = await import("../api/auth/me.js");
  const { default: refresh } = await import("../api/auth/refresh.js");
  const { default: logout } = await import("../api/auth/logout.js");
  const { default: upgrade } = await import("../api/auth/session/upgrade.js");

  const missingRes = mockResponse();
  await login({ method: "POST", headers: {}, body: {} }, missingRes);
  check("snapshot login sin credenciales", JSON.stringify(normalizedResponse(missingRes, userId)) === JSON.stringify(snapshot.loginMissing));

  const invalidRes = mockResponse();
  await login({ method: "POST", headers: {}, body: { email: "mt01b-legacy@example.invalid", password: "wrong" } }, invalidRes);
  check("snapshot login inválido", JSON.stringify(normalizedResponse(invalidRes, userId)) === JSON.stringify(snapshot.loginInvalid));

  const loginRes = mockResponse();
  await login({ method: "POST", headers: {}, body: { email: "mt01b-legacy@example.invalid", password } }, loginRes);
  check("snapshot login exitoso", JSON.stringify(normalizedResponse(loginRes, userId)) === JSON.stringify(snapshot.loginSuccess));
  check("login LEGACY no emite refresh cookie", loginRes.getHeader("set-cookie") == null);
  const decoded = jwt.decode(loginRes.body.token);
  check("JWT LEGACY conserva claims exactos", JSON.stringify(Object.keys(decoded).sort()) === JSON.stringify(["email", "exp", "iat", "role", "sub"].sort()));

  const meRes = mockResponse();
  await me({ method: "GET", headers: { authorization: `Bearer ${loginRes.body.token}` } }, meRes);
  check("snapshot auth/me exitoso", JSON.stringify(normalizedResponse(meRes, userId)) === JSON.stringify(snapshot.meSuccess));

  const disabledRes = mockResponse();
  await refresh({ method: "POST", headers: { origin: "http://localhost:5173" } }, disabledRes);
  check("endpoint V2 inactivo en LEGACY", disabledRes.statusCode === 409 && disabledRes.body?.error === "MT01B_AUTH_V2_DISABLED");
  const logoutRes = mockResponse();
  await logout({ method: "POST", headers: { origin: "http://localhost:5173" } }, logoutRes);
  check("logout V2 inactivo en LEGACY", logoutRes.statusCode === 409 && logoutRes.body?.error === "MT01B_AUTH_V2_DISABLED");
  const upgradeRes = mockResponse();
  await upgrade({ method: "POST", headers: { origin: "http://localhost:5173", authorization: `Bearer ${loginRes.body.token}` } }, upgradeRes);
  check("upgrade V2 inactivo en LEGACY", upgradeRes.statusCode === 409 && upgradeRes.body?.error === "MT01B_AUTH_V2_DISABLED");
  check("LEGACY no crea AuthSession", await prisma.authSession.count({ where: { userId } }) === 0);

  process.stdout.write(`${JSON.stringify({ ok: true, passed: results.length, failed: 0, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, passed: results.filter((item) => item.passed).length, failed: 1, results, error: { name: error.name, message: error.message, stack: error.stack } }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
