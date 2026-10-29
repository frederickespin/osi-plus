import assert from "node:assert/strict";
import { validateV17QuoteDatabaseIdentity, validateV17QuoteTestUrl } from "./v17-quote-local-target.mjs";

const results = [];
const env = { CANONICAL_DB_VALIDATION: "true" };
const fixtureUrl = new URL("postgresql://127.0.0.1:55432/osi_db01n_ci?schema=osi");
fixtureUrl.username = "postgres";
fixtureUrl.password = "quote-fixture-only";
const valid = fixtureUrl.href;
const mutate = (action) => { const url = new URL(valid); action(url); return url.href; };
function check(name, action) { action(); results.push({ name, passed: true }); }
function rejected(name, raw, configured = env) {
  check(name, () => assert.throws(() => validateV17QuoteTestUrl(raw, configured), /V17_QUOTE_LOCAL_TARGET_REJECTED/));
}

try {
  const target = validateV17QuoteTestUrl(valid, env);
  check("destino canónico cerrado aceptado", () => {
    assert.equal(target.database, "osi_db01n_ci");
    assert.equal(target.canonicalCi, true);
  });
  for (const database of ["v17_quote_test", "v17_quote_replay", "v17_quote_empty"]) {
    check(`fixture histórico exacto aceptado: ${database}`, () => {
      const local = validateV17QuoteTestUrl(mutate((url) => { url.pathname = `/${database}`; }), {});
      assert.equal(local.canonicalCi, false);
      assert.equal(local.database, database);
    });
  }
  rejected("variable exclusiva obligatoria sin fallback", "", { DATABASE_URL: valid, DIRECT_URL: valid });
  rejected("canónico exige flag explícito", valid, {});
  rejected("flag desconocido rechazado", valid, { CANONICAL_DB_VALIDATION: "TRUE" });
  for (const [name, raw] of [
    ["URL inválida", "not-a-url"],
    ["protocolo distinto", valid.replace("postgresql:", "https:")],
    ["host externo", mutate((url) => { url.hostname = "192.0.2.10"; })],
    ["localhost ambiguo", mutate((url) => { url.hostname = "localhost"; })],
    ["puerto diferente", mutate((url) => { url.port = "5432"; })],
    ["base no aprobada", mutate((url) => { url.pathname = "/production"; })],
    ["prefijo de base no es autorización", mutate((url) => { url.pathname = "/v17_quote_test_extra"; })],
    ["schema distinto", mutate((url) => { url.searchParams.set("schema", "public"); })],
    ["schema ausente", mutate((url) => { url.searchParams.delete("schema"); })],
    ["schema duplicado", mutate((url) => { url.searchParams.append("schema", "osi"); })],
    ["parámetro host alternativo", mutate((url) => { url.searchParams.set("host", "192.0.2.10"); })],
    ["parámetro options alternativo", mutate((url) => { url.searchParams.set("options", "unexpected"); })],
    ["fragmento", mutate((url) => { url.hash = "unexpected"; })],
    ["usuario ausente", mutate((url) => { url.username = ""; })],
    ["contraseña ausente", mutate((url) => { url.password = ""; })],
    ["marca Neon en destino loopback", mutate((url) => { url.username = "neon"; })],
    ["pooler", mutate((url) => { url.username = "pooler"; })],
  ]) rejected(name, raw);

  const identity = { database: "osi_db01n_ci", schema: "osi", address: "127.0.0.1/32", port: 55432, neon_branch_id: null, version_number: "180006" };
  check("identidad real local PostgreSQL18 aceptada", () => {
    assert.deepEqual(validateV17QuoteDatabaseIdentity(identity, target), { database: "osi_db01n_ci", schema: "osi", address: "127.0.0.1", port: 55432 });
  });
  for (const [property, value] of [
    ["database", "another_database"], ["schema", "public"], ["address", "192.0.2.10"], ["port", 5432],
    ["neon_branch_id", "branch-test"], ["version_number", "170010"], ["version_number", "190001"],
  ]) check(`identidad inesperada rechazada: ${property}=${value}`, () => {
    assert.throws(() => validateV17QuoteDatabaseIdentity({ ...identity, [property]: value }, target), /V17_QUOTE_LOCAL_TARGET_REJECTED/);
  });
  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, assertions: results.length, error: error.message, results }, null, 2)}\n`);
  process.exitCode = 1;
}
