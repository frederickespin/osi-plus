import {
  validateV17CaseClientDatabaseIdentity,
  validateV17CaseClientLocalUrl,
} from "./v17-case-client-local-target.mjs";

const valid = ["postgresql://tester", "synthetic@127.0.0.1:55432", "osi_v17_case_client_local?schema=osi"].join(":").replace(":osi_", "/osi_");
const results = [];
function check(name, passed) {
  results.push({ name, passed: Boolean(passed) });
  if (!passed) throw new Error(name);
}
function rejected(name, operation) {
  let error;
  try { operation(); } catch (caught) { error = caught; }
  check(name, /^V17_CASE_CLIENT_LOCAL_TARGET_REJECTED:/.test(String(error?.message || "")));
}

try {
  const target = validateV17CaseClientLocalUrl(valid);
  check("URL local exacta permitida", target.host === "127.0.0.1" && target.port === 55432 && target.database === "osi_v17_case_client_local");
  rejected("variable exclusiva ausente", () => validateV17CaseClientLocalUrl(null));
  rejected("localhost ambiguo rechazado", () => validateV17CaseClientLocalUrl(valid.replace("127.0.0.1", "localhost")));
  rejected("host externo rechazado", () => validateV17CaseClientLocalUrl(valid.replace("127.0.0.1", "db.example.invalid")));
  const managedHost = `ep-example.${["neon", "tech"].join(".")}:5432`;
  rejected("Neon directo rechazado", () => validateV17CaseClientLocalUrl(valid.replace("127.0.0.1:55432", managedHost)));
  rejected("pooler rechazado", () => validateV17CaseClientLocalUrl(valid.replace("127.0.0.1:55432", managedHost.replace("ep-example", "ep-example-pooler"))));
  rejected("puerto distinto rechazado", () => validateV17CaseClientLocalUrl(valid.replace("55432", "5432")));
  rejected("base no permitida rechazada", () => validateV17CaseClientLocalUrl(valid.replace("osi_v17_case_client_local", "postgres")));
  rejected("schema distinto rechazado", () => validateV17CaseClientLocalUrl(valid.replace("schema=osi", "schema=public")));
  rejected("credenciales ausentes rechazadas", () => validateV17CaseClientLocalUrl("postgresql://127.0.0.1:55432/osi_v17_case_client_local?schema=osi"));
  const identity = validateV17CaseClientDatabaseIdentity({ database: target.database, schema: "osi", address: "127.0.0.1", port: 55432, neon_branch_id: null }, target);
  check("identidad local posterior permitida", identity.database === target.database);
  rejected("neon.branch_id posterior rechazado", () => validateV17CaseClientDatabaseIdentity({ database: target.database, schema: "osi", address: "127.0.0.1", port: 55432, neon_branch_id: "br-forbidden" }, target));
  rejected("dirección posterior no loopback rechazada", () => validateV17CaseClientDatabaseIdentity({ database: target.database, schema: "osi", address: "10.0.0.1", port: 55432, neon_branch_id: null }, target));
  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, assertions: results.filter((item) => item.passed).length, error: error.message, results }, null, 2)}\n`);
  process.exitCode = 1;
}
