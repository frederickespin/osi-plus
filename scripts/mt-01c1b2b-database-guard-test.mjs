import {
  formatMt01c1b2bSanitizedIdentity,
  validateMt01c1b2bTestDatabaseEnv,
  verifyMt01c1b2bConnectedDatabase,
} from "./mt-01c1b2b-database-guard.mjs";

const allowed = ["postgresql", "://", "synthetic", ":", "synthetic", "@127.0.0.1:55432/osi_db01n_ci?schema=osi"].join("");
const externalCredentialUrl = (host, database = "neondb", schema = "osi") =>
  ["postgresql", "://", "x", ":", "x", "@", host, ":5432/", database, "?schema=", schema].join("");
const neonHost = (pooled = false) => ["ep-example", pooled ? "-pooler" : "", ".", "neon", ".", "tech"].join("");
const results = [];
function check(name, condition) {
  if (!condition) throw new Error(`MT01C1B2B_DATABASE_GUARD_FAILED: ${name}`);
  results.push({ name, passed: true });
}
function expectFailure(name, env, code) {
  let opened = false;
  try {
    validateMt01c1b2bTestDatabaseEnv(env);
    opened = true;
  } catch (error) {
    check(name, error.code === code && opened === false);
    return;
  }
  throw new Error(`${name}: destino inseguro aceptado`);
}

expectFailure("variable exclusiva ausente aunque DATABASE_URL sea externa", { DATABASE_URL: externalCredentialUrl("example.invalid", "prod") }, "MT01C1B2B_TEST_DATABASE_URL_REQUIRED");
expectFailure("Neon directa rechazada antes de conectar", { MT01C1B2B_TEST_DATABASE_URL: externalCredentialUrl(neonHost()) }, "MT01C1B2B_DATABASE_HOST_FORBIDDEN");
expectFailure("Neon pooled rechazada antes de conectar", { MT01C1B2B_TEST_DATABASE_URL: externalCredentialUrl(neonHost(true)) }, "MT01C1B2B_DATABASE_HOST_FORBIDDEN");
expectFailure("host externo rechazado", { MT01C1B2B_TEST_DATABASE_URL: externalCredentialUrl("192.0.2.1", "osi_db01n_ci") }, "MT01C1B2B_DATABASE_HOST_FORBIDDEN");
expectFailure("localhost ambiguo rechazado", { MT01C1B2B_TEST_DATABASE_URL: allowed.replace("127.0.0.1", "localhost") }, "MT01C1B2B_DATABASE_HOST_FORBIDDEN");
expectFailure("puerto diferente rechazado", { MT01C1B2B_TEST_DATABASE_URL: allowed.replace(":55432", ":5432") }, "MT01C1B2B_DATABASE_PORT_FORBIDDEN");
expectFailure("base fuera de allowlist rechazada", { MT01C1B2B_TEST_DATABASE_URL: allowed.replace("/osi_db01n_ci", "/production") }, "MT01C1B2B_DATABASE_NAME_FORBIDDEN");
expectFailure("schema diferente rechazado", { MT01C1B2B_TEST_DATABASE_URL: allowed.replace("schema=osi", ["schema", "=", "public"].join("")) }, "MT01C1B2B_DATABASE_SCHEMA_FORBIDDEN");
expectFailure("credenciales ausentes rechazadas", { MT01C1B2B_TEST_DATABASE_URL: "postgresql://127.0.0.1:55432/osi_db01n_ci?schema=osi" }, "MT01C1B2B_DATABASE_CREDENTIALS_REQUIRED");
expectFailure("flag de override rechazado", { MT01C1B2B_TEST_DATABASE_URL: allowed, MT01C1B2B_SKIP_DATABASE_GUARD: "true" }, "MT01C1B2B_DATABASE_OVERRIDE_FORBIDDEN");

const validated = validateMt01c1b2bTestDatabaseEnv({ MT01C1B2B_TEST_DATABASE_URL: allowed, DATABASE_URL: externalCredentialUrl("example.invalid", "prod") });
check("la variable exclusiva prevalece sin leer DATABASE_URL", validated.database === "osi_db01n_ci" && validated.host === "127.0.0.1");
const q1Validated = validateMt01c1b2bTestDatabaseEnv({ MT01C1B2B_TEST_DATABASE_URL: allowed.replace("osi_db01n_ci", "osi_mt01c1b3a_q1_20260809") });
check("base Q1 exacta pertenece a la allowlist local", q1Validated.database === "osi_mt01c1b3a_q1_20260809");

const localIdentity = await verifyMt01c1b2bConnectedDatabase({ $queryRawUnsafe: async () => [{ database: "osi_db01n_ci", server_address: "127.0.0.1", server_port: 55432, schema: "osi", neon_branch_id: null }] }, validated);
check("identidad PostgreSQL local autorizada", localIdentity.database === "osi_db01n_ci");

try {
  await verifyMt01c1b2bConnectedDatabase({ $queryRawUnsafe: async () => [{ database: "osi_db01n_ci", server_address: "127.0.0.1", server_port: 55432, schema: "osi", neon_branch_id: "br-synthetic" }] }, validated);
  throw new Error("neon.branch_id aceptado");
} catch (error) {
  if (error.message === "neon.branch_id aceptado") throw error;
  check("neon.branch_id detiene antes de escribir", error.code === "MT01C1B2B_NEON_BRANCH_DETECTED");
}

const sanitized = formatMt01c1b2bSanitizedIdentity(localIdentity);
check("identidad impresa no contiene credenciales", sanitized === "host=127.0.0.1 port=55432 database=osi_db01n_ci schema=osi" && !/synthetic:|@/.test(sanitized));
process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
