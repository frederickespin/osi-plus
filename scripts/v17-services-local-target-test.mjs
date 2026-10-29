import assert from "node:assert/strict";
import {
  validateV17ServicesDatabaseIdentity,
  validateV17ServicesTestUrl,
  verifyV17ServicesLocalDatabase,
} from "./v17-services-local-target.mjs";

const results = [];
const env = { CANONICAL_DB_VALIDATION: "true" };
const fixtureUrl = new URL("postgresql://127.0.0.1:55432/osi_db01n_ci?schema=osi");
fixtureUrl.username = "postgres";
fixtureUrl.password = "services-fixture-only";
const valid = fixtureUrl.href;
const mutate = (action) => { const url = new URL(valid); action(url); return url.href; };
function check(name, action) { action(); results.push({ name, passed: true }); }
function rejected(name, raw, configured = env) {
  check(name, () => assert.throws(() => validateV17ServicesTestUrl(raw, configured), /V17_SERVICES_TEST_DATABASE_(?:TARGET_REJECTED|URL_REQUIRED)/));
}

try {
  const target = validateV17ServicesTestUrl(valid, env);
  check("canónico exacto requiere activación explícita", () => {
    assert.equal(target.database, "osi_db01n_ci");
    assert.equal(target.port, 55432);
    assert.equal(target.canonicalCi, true);
  });
  for (const host of ["127.0.0.1", "localhost"]) {
    check(`histórico postgres:55439 conserva ${host}`, () => {
      const historical = validateV17ServicesTestUrl(mutate((url) => { url.hostname = host; url.port = "55439"; url.pathname = "/postgres"; }), {});
      assert.equal(historical.canonicalCi, false);
      assert.equal(historical.database, "postgres");
      assert.equal(historical.port, 55439);
      for (const address of host === "localhost" ? ["127.0.0.1", "::1"] : [host]) {
        assert.equal(validateV17ServicesDatabaseIdentity({ database: "postgres", schema: "osi", address, port: 55439, neon: null, version_number: "180006" }, historical, ["osi"]).address, address);
      }
    });
  }
  rejected("URL dedicada obligatoria sin fallback", "", { DATABASE_URL: valid, DIRECT_URL: valid });
  for (const flag of [undefined, false, true, "false", "TRUE", "true "]) {
    rejected(`canónico rechaza flag no exacto: ${typeof flag} ${JSON.stringify(flag)}`, valid, { CANONICAL_DB_VALIDATION: flag });
  }
  for (const [name, raw] of [
    ["URL inválida", "not-a-url"],
    ["protocolo diferente", valid.replace("postgresql:", "https:")],
    ["host externo", mutate((url) => { url.hostname = "192.0.2.10"; })],
    ["DNS de base externa", mutate((url) => { url.hostname = "ep-fixture.example.invalid"; })],
    ["hostname engañoso", mutate((url) => { url.hostname = "127.0.0.1.example.invalid"; })],
    ["canónico exige loopback IPv4 exacto", mutate((url) => { url.hostname = "localhost"; })],
    ["puerto diferente", mutate((url) => { url.port = "5432"; })],
    ["perfil con base histórica y puerto canónico", mutate((url) => { url.pathname = "/postgres"; })],
    ["perfil con base canónica y puerto histórico", mutate((url) => { url.port = "55439"; })],
    ["otra base", mutate((url) => { url.pathname = "/production"; })],
    ["prefijo de base no autoriza", mutate((url) => { url.pathname = "/osi_db01n_ci_extra"; })],
    ["schema distinto", mutate((url) => { url.searchParams.set("schema", "public"); })],
    ["schema ausente", mutate((url) => { url.searchParams.delete("schema"); })],
    ["schema duplicado", mutate((url) => { url.searchParams.append("schema", "osi"); })],
    ["host alternativo por parámetro", mutate((url) => { url.searchParams.set("host", "192.0.2.10"); })],
    ["options alternativo", mutate((url) => { url.searchParams.set("options", "unexpected"); })],
    ["fragmento", mutate((url) => { url.hash = "unexpected"; })],
  ]) rejected(name, raw);

  const identity = { database: "osi_db01n_ci", schema: "osi", address: "127.0.0.1/32", port: 55432, neon: null, version_number: "180006" };
  check("identidad real canónica PostgreSQL18 aceptada", () => {
    assert.deepEqual(validateV17ServicesDatabaseIdentity(identity, target, ["osi"]), { database: "osi_db01n_ci", schema: "osi", address: "127.0.0.1", port: 55432 });
  });
  for (const [property, value] of [
    ["database", "postgres"], ["schema", "public"], ["address", "192.0.2.10"], ["address", null], ["address", "::1"],
    ["port", 55439], ["neon", "br-fixture"], ["version_number", "170010"], ["version_number", "190001"], ["version_number", undefined],
  ]) check(`identidad inesperada rechazada: ${property}=${String(value)}`, () => {
    assert.throws(() => validateV17ServicesDatabaseIdentity({ ...identity, [property]: value }, target, ["osi"]), /V17_SERVICES_TEST_DATABASE_TARGET_REJECTED/);
  });
  for (const schemas of [[], ["public"], ["osi", "public"], ["osi", "osi"]]) {
    check(`historial de esquema ambiguo rechazado: ${schemas.join(",") || "ausente"}`, () => {
      assert.throws(() => validateV17ServicesDatabaseIdentity(identity, target, schemas), /V17_SERVICES_TEST_DATABASE_TARGET_REJECTED/);
    });
  }

  for (const [name, observedIdentity, schemas, validIdentity] of [
    ["identidad válida", [identity], [{ table_schema: "osi" }], true],
    ["servidor externo", [{ ...identity, address: "192.0.2.10" }], [{ table_schema: "osi" }], false],
    ["identidad ausente", [], [{ table_schema: "osi" }], false],
    ["historial adicional", [identity], [{ table_schema: "osi" }, { table_schema: "public" }], false],
  ]) {
    const statements = [];
    const prisma = { $transaction: async (action) => action({
      $executeRawUnsafe: async (sql) => { statements.push(sql); assert.equal(sql, "SET TRANSACTION READ ONLY"); },
      $queryRawUnsafe: async (sql) => { statements.push(sql); return sql.includes("current_database()") ? observedIdentity : schemas; },
    }) };
    if (validIdentity) await verifyV17ServicesLocalDatabase(prisma, target);
    else await assert.rejects(verifyV17ServicesLocalDatabase(prisma, target), /V17_SERVICES_TEST_DATABASE_TARGET_REJECTED/);
    check(`preflight sólo lectura: ${name}`, () => {
      assert.equal(statements[0], "SET TRANSACTION READ ONLY");
      assert.ok(statements.slice(1).every((sql) => /^\s*SELECT\b/.test(sql)));
    });
  }
  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, assertions: results.length, error: error.message, results }, null, 2)}\n`);
  process.exitCode = 1;
}
