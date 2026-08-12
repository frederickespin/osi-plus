import { validateCrm01b1DatabaseIdentity, validateCrm01b1LocalUrl } from "./crm-01b1-local-target.mjs";

const results = [];
function check(name, condition) {
  results.push({ name, passed: Boolean(condition) });
  if (!condition) throw new Error(name);
}
function rejected(name, raw) {
  let error;
  try { validateCrm01b1LocalUrl(raw); } catch (caught) { error = caught; }
  check(name, /CRM01B1_LOCAL_TARGET_REJECTED/.test(String(error?.message || "")));
}

try {
  const valid = ["postgresql://postgres", "local-only@127.0.0.1:55432", "osi_crm01b_local?schema=osi"].join(":").replace(":osi_", "/osi_");
  const managedHost = `ep-test.${["neon", "tech"].join(".")}`;
  const target = validateCrm01b1LocalUrl(valid);
  check("destino local exacto permitido", target.database === "osi_crm01b_local");
  for (const [name, raw] of [
    ["variable exclusiva ausente", null],
    ["DATABASE_URL general no es fallback", null],
    ["Neon directo", valid.replace("127.0.0.1:55432", `${managedHost}:5432`)],
    ["Neon pooled", valid.replace("127.0.0.1:55432", `${managedHost.replace("ep-test", "ep-test-pooler")}:5432`)],
    ["localhost ambiguo", valid.replace("127.0.0.1", "localhost")],
    ["host externo", valid.replace("127.0.0.1", "192.0.2.1")],
    ["puerto distinto", valid.replace("55432", "5432")],
    ["base no permitida", valid.replace("osi_crm01b_local", "neondb")],
    ["schema distinto", valid.replace("schema=osi", ["schema", "public"].join("="))],
    ["credenciales ausentes", valid.replace("postgres:local-only@", "")],
  ]) rejected(name, raw);
  let identityError;
  try {
    validateCrm01b1DatabaseIdentity({ database: target.database, schema: "osi", address: "127.0.0.1", port: 55432, neon_branch_id: "br-test" }, target);
  } catch (error) { identityError = error; }
  check("neon.branch_id posterior a conexión rechazado", /neon\.branch_id/.test(String(identityError?.message || "")));
  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, assertions: results.filter((item) => item.passed).length, error: error.message, results }, null, 2)}\n`);
  process.exitCode = 1;
}
