import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createFleetDriversPg17LocalPrisma, validateFleetDriversPg17DatabaseIdentity, validateFleetDriversPg17LocalUrl,
} from "./v17-fleet-drivers-pg17-local-target.mjs";

const local = "postgresql://postgres:postgres@127.0.0.1:55433/osi_fleet_17_compat?schema=osi";
const rejected = /FLEET_DRIVERS_PG17_LOCAL_TARGET_REJECTED/;
const target = validateFleetDriversPg17LocalUrl(local);
const identity = { database: "osi_fleet_17_compat", schema: "osi", address: "127.0.0.1", port: 55433,
  neon_branch_id: null, server_version_num: "170006" };

test("PG17 URL permits only the exact local and CI destination", () => {
  assert.deepEqual(validateFleetDriversPg17LocalUrl(local), { raw: local, host: "127.0.0.1", port: 55433, database: "osi_fleet_17_compat", schema: "osi" });
  assert.equal(validateFleetDriversPg17LocalUrl(local.replace("postgresql:", "postgres:")).port, 55433);
  for (const limit of [1, 10, 100]) assert.equal(validateFleetDriversPg17LocalUrl(`${local}&connection_limit=${limit}`).port, 55433);
  assert.ok(Object.isFrozen(target));
});

for (const [name, raw] of [
  ["absent URL", undefined], ["null URL", null], ["empty URL", ""], ["nonstring URL", new URL(local)],
  ["malformed URL", "not a URL"], ["surrounding whitespace", ` ${local}`], ["hidden control", local.replace("127.0.0.1", "127.0.\n0.1")],
  ["non-PostgreSQL protocol", local.replace("postgresql:", "https:")],
  ["ambiguous localhost", local.replace("127.0.0.1", "localhost")],
  ["external address", local.replace("127.0.0.1", "192.0.2.1")],
  ["IPv6 address", local.replace("127.0.0.1", "[::1]")],
  ["managed database marker", local.replace("127.0.0.1", "ep-test.neon.invalid")],
  ["pooler", local.replace("127.0.0.1", "synthetic-pooler.example.invalid")],
  ["canonical PG18 port", local.replace(":55433/", ":55432/")],
  ["default PostgreSQL port", local.replace(":55433/", ":5432/")],
  ["implicit port", local.replace(":55433/", "/")],
  ["different database", local.replace("osi_fleet_17_compat", "osi_db01n_ci")],
  ["extra database path", local.replace("osi_fleet_17_compat", "osi_fleet_17_compat/other")],
  ["different schema", local.replace("schema=osi", "schema=wrong_schema")],
  ["missing schema", local.replace("?schema=osi", "")],
  ["duplicate schema", `${local}&schema=osi`],
  ["encoded duplicate schema", `${local}&sche%6da=osi`],
  ["missing credentials", local.replace("postgres:postgres@", "")],
  ["missing password", local.replace("postgres:postgres@", "postgres@")],
  ["missing username", local.replace("postgres:postgres@", ":postgres@")],
  ["malformed encoded credential", local.replace("postgres:postgres@", "postgres:%ZZ@")],
  ["credential control", local.replace("postgres:postgres@", "postgres:%00@")],
  ["fragment", `${local}#anything`], ["empty fragment", `${local}#`],
  ["duplicate connection limit", `${local}&connection_limit=1&connection_limit=1`],
]) test(`PG17 URL rejects ${name}`, () => assert.throws(() => validateFleetDriversPg17LocalUrl(raw), rejected));

for (const [name, value] of [["host", "192.0.2.1"], ["hostaddr", "192.0.2.1"], ["port", "5432"], ["dbname", "another"], ["options", "-chost=192.0.2.1"], ["sslmode", "disable"]]) {
  test(`PG17 URL rejects unapproved parameter ${name}`, () => assert.throws(() => validateFleetDriversPg17LocalUrl(`${local}&${name}=${encodeURIComponent(value)}`), rejected));
}
for (const limit of ["", "0", "-1", "101", "1.5", "1e1", "01", "NaN"]) {
  test(`PG17 URL rejects invalid connection_limit ${JSON.stringify(limit)}`, () => assert.throws(() => validateFleetDriversPg17LocalUrl(`${local}&connection_limit=${limit}`), rejected));
}

test("PG17 identity matches the exact database, schema, address, port and major", () => {
  assert.deepEqual(validateFleetDriversPg17DatabaseIdentity(identity, target), {
    database: "osi_fleet_17_compat", schema: "osi", address: "127.0.0.1", port: 55433, serverVersion: 170006,
  });
});
for (const [name, override] of [
  ["database", { database: "osi_db01n_ci" }], ["schema", { schema: "wrong_schema" }],
  ["address", { address: "192.0.2.1" }], ["address alias", { address: "localhost" }],
  ["port mismatch", { port: 5432 }], ["missing port", { port: null }],
  ["Neon branch", { neon_branch_id: "br-unexpected" }], ["empty branch", { neon_branch_id: "" }], ["missing branch field", { neon_branch_id: undefined }],
  ["PG16", { server_version_num: "160006" }], ["PG18", { server_version_num: "180006" }],
  ["version absent", { server_version_num: null }], ["version invalid", { server_version_num: "invalid" }], ["fractional version", { server_version_num: 170006.5 }],
]) test(`PG17 identity rejects ${name}`, () => assert.throws(() => validateFleetDriversPg17DatabaseIdentity({ ...identity, ...override }, target), rejected));

test("PG17 identity rejects missing rows and forged local targets", () => {
  assert.throws(() => validateFleetDriversPg17DatabaseIdentity(undefined, target), rejected);
  for (const invalid of [undefined, { ...target, database: "other" }, { ...target, schema: "wrong_schema" }, { ...target, host: "192.0.2.1" }, { ...target, port: 55432 }, { ...target, port: 5432 }]) {
    assert.throws(() => validateFleetDriversPg17DatabaseIdentity(identity, invalid), rejected);
  }
});
test("PG17 factory rejects absent or incorrect mode before validating a URL or connecting", async () => {
  for (const env of [{}, { V17_FLEET_DRIVERS_LOCAL_COMPAT: "" }, { V17_FLEET_DRIVERS_LOCAL_COMPAT: "PG18" }, { V17_FLEET_DRIVERS_LOCAL_COMPAT: "pg17" }]) {
    await assert.rejects(() => createFleetDriversPg17LocalPrisma(local, { env }), /modo PG17 explícito obligatorio/);
  }
  await assert.rejects(() => createFleetDriversPg17LocalPrisma(undefined, { env: {} }), /modo PG17 explícito obligatorio/);
});
test("PG17 factory never falls back to application, direct or canonical URLs", async () => {
  const env = { V17_FLEET_DRIVERS_LOCAL_COMPAT: "PG17", DATABASE_URL: local, DIRECT_URL: local, CRM01B1_TEST_DATABASE_URL: local };
  await assert.rejects(() => createFleetDriversPg17LocalPrisma(undefined, { env }), /URL local explícita obligatoria/);
  await assert.rejects(() => createFleetDriversPg17LocalPrisma(local.replace("osi_fleet_17_compat", "osi_db01n_ci"), { env }), /base fuera del runner PG17 local/);
});
test("PG17 rejection messages never include a supplied credential or URL", () => {
  const raw = local.replace("postgres:postgres@", "synthetic-user:synthetic-private-value@").replace("schema=osi", "schema=wrong_schema");
  assert.throws(() => validateFleetDriversPg17LocalUrl(raw), (error) => rejected.test(error.message)
    && !error.message.includes(raw) && !error.message.includes("synthetic-private-value"));
});
