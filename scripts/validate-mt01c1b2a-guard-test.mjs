import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { validateMt01c1b2aGuard } from "./validate-mt01c1b2a-guard.mjs";

const root = mkdtempSync(join(tmpdir(), "mt01c1b2a-guard-"));
const results = [];
const files = [".env.example", "api/_lib/requireAuth.js", "api/_lib/authContextPilot.js", "api/_lib/http.js", "api/clients/index.js", "api/projects/index.js", "api/users/index.js", "api/auth/login.js", "api/auth/me.js"];
const originals = new Map(files.map((path) => [path, readFileSync(path, "utf8")]));
function restore() {
  for (const [path, contents] of originals) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), contents);
  }
}
function reject(name, path, mutate, pattern) {
  restore();
  const before = originals.get(path);
  const after = mutate(before);
  assert.notEqual(after, before, `${name}: mutation must change the fixture`);
  writeFileSync(join(root, path), after);
  assert.throws(() => validateMt01c1b2aGuard(root), pattern);
  results.push({ name, passed: true });
}
try {
  mkdirSync(join(root, "prisma"));
  cpSync(resolve("prisma/migrations"), join(root, "prisma/migrations"), { recursive: true });
  restore();
  const baseline = validateMt01c1b2aGuard(root);
  assert.equal(baseline.migrations, 35);
  assert.deepEqual(baseline.retiredRoutes, ["api/users/index.js"]);
  results.push({ name: "canonical auth and retired users baseline", passed: true });
  reject("JWT status cannot replace current DB status", "api/_lib/requireAuth.js", (s) => `${s}\nconst unsafe = payload.status;`, /status del JWT/);
  reject("DB status lookup cannot disappear", "api/_lib/requireAuth.js", (s) => s.replace("select: { status: true }", "select: { id: true }"), /consultar el estado vigente/);
  reject("database error must remain controlled 503", "api/_lib/requireAuth.js", (s) => s.replace("res.status(503)", "res.status(500)"), /503 controlado/);
  reject("pilot cannot bypass canonical context", "api/_lib/authContextPilot.js", (s) => s.replaceAll("requireAuthContext(", "requireAuth("), /AuthorizationContext canónico/);
  reject("pilot cannot use a forged context implementation", "api/_lib/authContextPilot.js", (s) => s.replace("./authContextMiddleware.js", "./fakeContext.js"), /AuthorizationContext canónico/);
  reject("pilot cannot restore parallel header authority", "api/_lib/authContextPilot.js", (s) => `${s}\nconst role = req.headers["x-osi-role"];`, /autoridad heredada paralela/);
  reject("pilot must check effective permissions", "api/_lib/authContextPilot.js", (s) => s.replace("context.effectivePermissions.includes(String(permission))", "true"), /permiso efectivo/);
  reject("retired users cannot return 200", "api/users/index.js", (s) => s.replace("status(410)", "status(200)"), /permanecer retirado/);
  reject("retired users cannot recreate identities", "api/users/index.js", (s) => `${s}\nawait prisma.user.create({ data: body });`, /alta con password/);
  reject("retired users cannot restore global user listing", "api/users/index.js", (s) => `${s}\nawait prisma.user.findMany();`, /listado global/);
  reject("clients must preserve strict nonempty JSON", "api/clients/index.js", (s) => s.replace("requireNonEmptyObject: true", "requireNonEmptyObject: false"), /body HTTP vacío/);
  reject("projects must preserve strict nonempty JSON", "api/projects/index.js", (s) => s.replace("requireNonEmptyObject: true", "requireNonEmptyObject: false"), /body HTTP vacío/);
  reject("login retains dummy bcrypt for missing users", "api/auth/login.js", (s) => s.replaceAll("UNKNOWN_IDENTITY_PASSWORD_HASH", "UNSAFE"), /bcrypt/);
  reject("login retains sanitized DB error", "api/auth/login.js", (s) => s.replaceAll("AUTH_DATABASE_UNAVAILABLE", "UNSAFE"), /sanitizar/);
  reject("me retains active-user check", "api/auth/me.js", (s) => s.replaceAll("isGloballyActiveUser", "unsafeActiveUser"), /revalidar estado/);
  reject("UTF-8 decoder remains fatal", "api/_lib/http.js", (s) => s.replace('TextDecoder("utf-8", { fatal: true })', 'TextDecoder("utf-8", { fatal: false })'), /UTF-8/);
  reject("JSON error code remains stable", "api/_lib/http.js", (s) => s.replaceAll("REQUEST_JSON_UNSAFE_KEYS", "UNSAFE"), /falta contrato/);
  reject("LEGACY remains default", ".env.example", (s) => s.replace('MT01B_AUTH_MODE="LEGACY"', 'MT01B_AUTH_MODE="HYBRID"'), /LEGACY/);
  reject("tenant switch remains off", ".env.example", (s) => s.replace('MT01B_TENANT_SWITCH_ENABLED="false"', 'MT01B_TENANT_SWITCH_ENABLED="true"'), /tenant switch/);
  reject("client V2 remains off", ".env.example", (s) => s.replace('VITE_MT01B2_CLIENT_ENABLED="false"', 'VITE_MT01B2_CLIENT_ENABLED="true"'), /cliente V2/);
  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
} finally {
  rmSync(root, { recursive: true, force: true });
}
