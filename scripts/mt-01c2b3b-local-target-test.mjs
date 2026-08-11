import {
  validateMt01c2b3bDatabaseIdentity,
  validateMt01c2b3bLocalUrl,
} from "./mt-01c2b3b-local-target.mjs";

const valid = ["postgresql://tester", "synthetic@127.0.0.1:55432", "osi_db01n_mt01c2b3b_local?schema=osi"].join(":").replace(":osi_", "/osi_");
const results = [];
function check(name, passed) {
  results.push({ name, passed: Boolean(passed) });
  if (!passed) throw new Error(name);
}
function rejected(name, fn) {
  let error;
  try { fn(); } catch (caught) { error = caught; }
  check(name, /^MT01C2B3B_LOCAL_TARGET_REJECTED:/.test(String(error?.message || "")));
}

try {
  const target = validateMt01c2b3bLocalUrl(valid);
  check("URL local exacta permitida", target.host === "127.0.0.1" && target.port === 55432);
  rejected("variable exclusiva ausente", () => validateMt01c2b3bLocalUrl(undefined));
  rejected("DATABASE_URL general no es fallback", () => validateMt01c2b3bLocalUrl(undefined, "MT01C2B3B_TEST_DATABASE_URL"));
  rejected("localhost ambiguo rechazado", () => validateMt01c2b3bLocalUrl(valid.replace("127.0.0.1", "localhost")));
  rejected("host externo rechazado", () => validateMt01c2b3bLocalUrl(valid.replace("127.0.0.1", "db.example.invalid")));
  const managedHost = `ep-example.${["neon", "tech"].join(".")}:5432`;
  rejected("Neon directo rechazado", () => validateMt01c2b3bLocalUrl(valid.replace("127.0.0.1:55432", managedHost)));
  rejected("pooler rechazado", () => validateMt01c2b3bLocalUrl(valid.replace("127.0.0.1:55432", managedHost.replace("ep-example", "ep-example-pooler"))));
  rejected("puerto distinto rechazado", () => validateMt01c2b3bLocalUrl(valid.replace("55432", "5432")));
  rejected("base no permitida rechazada", () => validateMt01c2b3bLocalUrl(valid.replace("osi_db01n_mt01c2b3b_local", "postgres")));
  rejected("schema distinto rechazado", () => validateMt01c2b3bLocalUrl(valid.replace("schema=osi", "schema=public")));
  rejected("credenciales ausentes rechazadas", () => validateMt01c2b3bLocalUrl("postgresql://127.0.0.1:55432/osi_db01n_mt01c2b3b_local?schema=osi"));
  const identity = validateMt01c2b3bDatabaseIdentity({ database: target.database, schema: "osi", address: "127.0.0.1", port: 55432, neon_branch_id: null }, target);
  check("identidad local posterior permitida", identity.database === target.database);
  rejected("neon.branch_id posterior rechazado", () => validateMt01c2b3bDatabaseIdentity({ database: target.database, schema: "osi", address: "127.0.0.1", port: 55432, neon_branch_id: "br-forbidden" }, target));
  rejected("dirección posterior no loopback rechazada", () => validateMt01c2b3bDatabaseIdentity({ database: target.database, schema: "osi", address: "10.0.0.1", port: 55432, neon_branch_id: null }, target));
  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, assertions: results.filter((item) => item.passed).length, error: error.message, results }, null, 2)}\n`);
  process.exitCode = 1;
}
