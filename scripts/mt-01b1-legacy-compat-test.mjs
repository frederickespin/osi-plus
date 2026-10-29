import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
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
const created = { userId: null, tenantId: null, membershipId: null };

async function cleanupFixture() {
  await prisma.$transaction(async (tx) => {
    if (created.membershipId) await tx.tenantMembership.deleteMany({ where: { id: created.membershipId, tenantId: created.tenantId, userId: created.userId } });
    if (created.tenantId) await tx.tenant.deleteMany({ where: { id: created.tenantId } });
    if (created.userId) await tx.user.deleteMany({ where: { id: created.userId } });
  });
  created.membershipId = null;
  created.tenantId = null;
  created.userId = null;
}

function normalizedResponse(res, membershipRef) {
  const body = structuredClone(res.body);
  if (body?.token) body.token = "[JWT]";
  const memberships = [body?.user?.membership, ...(body?.user?.memberships || []), ...(body?.membershipSelection?.options || [])];
  for (const membership of memberships) {
    if (membershipRef && membership?.membershipRef === membershipRef) membership.membershipRef = "[MEMBERSHIP_REF]";
  }
  return { status: res.statusCode, headers: Object.fromEntries(res.headers), body };
}

try {
  const userId = randomUUID();
  const suffix = randomUUID().slice(0, 8);
  const email = `mt01b-legacy-${suffix}@example.invalid`;
  const password = "Synthetic-Legacy-Password";
  await prisma.user.create({
    data: {
      id: userId,
      code: `MT01B-LEGACY-${suffix}`,
      name: "Usuario Legacy Sintético",
      email,
      phone: "0000000000",
      role: "A",
      status: "active",
      department: "QA",
      joinDate: "2026-08-03",
      passwordHash: await bcrypt.hash(password, 4),
    },
  });
  created.userId = userId;

  const { default: login } = await import("../api/auth/login.js");
  const { default: me } = await import("../api/auth/me.js");
  const { default: refresh } = await import("../api/auth/refresh.js");
  const { default: logout } = await import("../api/auth/logout.js");
  const { default: upgrade } = await import("../api/auth/session/upgrade.js");

  const missingRes = mockResponse();
  await login({ method: "POST", headers: { "content-length": "2" }, body: {} }, missingRes);
  check("snapshot login sin credenciales", isDeepStrictEqual(normalizedResponse(missingRes), snapshot.loginMissing));

  const invalidRes = mockResponse();
  await login({ method: "POST", headers: {}, body: { email, password: "wrong" } }, invalidRes);
  check("snapshot login inválido", isDeepStrictEqual(normalizedResponse(invalidRes), snapshot.loginInvalid));

  const noMembershipRes = mockResponse();
  await login({ method: "POST", headers: {}, body: { email, password } }, noMembershipRes);
  const tenant = await prisma.tenant.create({ data: {
    code: `MT01B-LEGACY-${suffix}`.toUpperCase(), name: "Empresa Legacy Sintética", status: "ACTIVE",
  } });
  created.tenantId = tenant.id;
  const membership = await prisma.tenantMembership.create({ data: {
    tenantId: tenant.id, userId, role: "N", status: "ACTIVE", isDefault: true,
    grantedPermissions: ["pipeline:view"], deniedPermissions: ["osi:view"],
  } });
  created.membershipId = membership.id;

  const loginRes = mockResponse();
  await login({ method: "POST", headers: {}, body: { email, password } }, loginRes);
  check("snapshot login exige membresía y devuelve selección pública",
    isDeepStrictEqual(normalizedResponse(noMembershipRes), snapshot.loginMembershipMissing)
    && isDeepStrictEqual(normalizedResponse(loginRes, membership.publicRef), snapshot.loginSuccess));
  check("login LEGACY no emite refresh cookie", loginRes.getHeader("set-cookie") == null);
  const decoded = jwt.decode(loginRes.body.token);
  check("JWT LEGACY conserva claims exactos", JSON.stringify(Object.keys(decoded).sort()) === JSON.stringify(["email", "exp", "iat", "role", "sub"].sort())
    && decoded.sub === userId && decoded.email === email && decoded.role === "A");

  const meRes = mockResponse();
  await me({ method: "GET", headers: { authorization: `Bearer ${loginRes.body.token}` } }, meRes);
  check("snapshot auth/me usa membresía N y deny aunque JWT global sea A",
    isDeepStrictEqual(normalizedResponse(meRes, membership.publicRef), snapshot.meSuccess));

  const disabledRes = mockResponse();
  await refresh({ method: "POST", headers: { origin: "http://localhost:5173" } }, disabledRes);
  check("endpoint V2 inactivo en LEGACY", disabledRes.statusCode === 409 && disabledRes.body?.error === "MT01B_AUTH_V2_DISABLED"
    && isDeepStrictEqual(Object.fromEntries(disabledRes.headers), snapshot.loginMissing.headers));
  const logoutRes = mockResponse();
  await logout({ method: "POST", headers: { origin: "http://localhost:5173" } }, logoutRes);
  check("logout V2 inactivo en LEGACY", logoutRes.statusCode === 409 && logoutRes.body?.error === "MT01B_AUTH_V2_DISABLED"
    && isDeepStrictEqual(Object.fromEntries(logoutRes.headers), snapshot.loginMissing.headers));
  const upgradeRes = mockResponse();
  await upgrade({ method: "POST", headers: { origin: "http://localhost:5173", authorization: `Bearer ${loginRes.body.token}` } }, upgradeRes);
  check("upgrade V2 inactivo en LEGACY", upgradeRes.statusCode === 409 && upgradeRes.body?.error === "MT01B_AUTH_V2_DISABLED"
    && isDeepStrictEqual(Object.fromEntries(upgradeRes.headers), snapshot.loginMissing.headers));
  check("LEGACY no crea AuthSession", await prisma.authSession.count({ where: { userId } }) === 0);

  await cleanupFixture();
  process.stdout.write(`${JSON.stringify({ ok: true, passed: results.length, failed: 0, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, passed: results.filter((item) => item.passed).length, failed: 1, results, error: { name: error.name, message: error.message, stack: error.stack } }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  try {
    if (Object.values(created).some(Boolean)) await cleanupFixture();
  } finally {
    await prisma.$disconnect();
  }
}
