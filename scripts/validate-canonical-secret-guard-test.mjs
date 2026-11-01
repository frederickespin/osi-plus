import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { validateTrackedSecrets } from "./validate-canonical-ci.mjs";

const root = mkdtempSync(join(tmpdir(), "canonical-secret-guard-"));
after(() => rmSync(root, { recursive: true, force: true }));
const fixtures = [
  { name: "fleet", port: "55433", database: "osi_fleet_17_compat", files: [".github/workflows/fleet-preview-pg17.yml", "scripts/v17-fleet-drivers-pg17-local-target-test.mjs"] },
  { name: "warehouse", port: "55434", database: "osi_warehouse_17_compat", files: [".github/workflows/warehouse-preview-pg17.yml", "scripts/v17-warehouse-configuration-pg17-local-target-test.mjs"] },
].map((fixture) => {
  // Exercise the actual synthetic fixtures without copying credential URLs
  // into another source file or broadening the scanner's exact exceptions.
  const source = readFileSync(new URL(`../${fixture.files[1]}`, import.meta.url), "utf8");
  const local = source.match(/const local = "([^"]+)";/)?.[1];
  assert.ok(local, `${fixture.name} PG17 fixture must declare its synthetic URL`);
  return { ...fixture, local };
});

function scan(file, contents) {
  const path = join(root, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
  return validateTrackedSecrets(root, [file]);
}

function rejected(file, contents) {
  assert.throws(() => scan(file, contents), (error) =>
    error.message.includes("Posibles secretos o conexiones externas")
    && error.message.includes(file) && !error.message.includes(contents));
}

for (const fixture of fixtures) {
  const { local } = fixture;
  for (const file of fixture.files) {
  test(`PG17 synthetic URL is allowed only with exact fields in ${file}`, () => {
    assert.equal(scan(file, `connection: ${local}\n`), 1);
  });
  for (const [name, value] of [
    ["external host", local.replace("127.0.0.1", "192.0.2.1")],
    ["host alias", local.replace("127.0.0.1", "localhost")],
    ["username", local.replace("postgres:postgres@", "different:postgres@")],
    ["password", local.replace("postgres:postgres@", "postgres:different@")],
    ["protocol alias", local.replace("postgresql:", "postgres:")],
    ["port", local.replace(`:${fixture.port}/`, ":55432/")],
    ["database", local.replace(fixture.database, "other_database")],
    ["schema", local.replace("schema=osi", "schema=other_schema")],
    ["missing schema", local.replace("?schema=osi", "")],
    ["extra parameter", `${local}&host=192.0.2.1`],
    ["duplicate schema", `${local}&schema=osi`],
    ["fragment", `${local}#example`],
    ["empty fragment", `${local}#`],
  ]) test(`PG17 synthetic allowlist rejects changed ${name} in ${file}`, () => rejected(file, value));

  test(`PG17 file still rejects other connections, private keys and managed hosts in ${file}`, () => {
    rejected(file, `${local}\n${local.replace("127.0.0.1", "192.0.2.1")}`);
    rejected(file, `${local}\n${["-----BEGIN ", "PRIVATE KEY-----"].join("")}`);
    rejected(file, `${local}\n${["ep-example", "neon", "tech"].join(".")}`);
  });
  test(`PG17 file rejects the other approved fixture in ${file}`, () => {
    for (const other of fixtures.filter((candidate) => candidate.name !== fixture.name)) rejected(file, other.local);
  });
  }
}

test("PG17 fixture remains rejected outside its exact source files", () => {
  for (const { local } of fixtures) {
    for (const file of ["api/example.js", ".github/workflows/other.yml", "scripts/other-test.mjs"]) rejected(file, local);
  }
});

test("canonical workflow retains its local allowance and rejects external connections", () => {
  const file = ".github/workflows/ci.yml";
  const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const canonical = workflow.match(/^\s+DATABASE_URL: (\S+)$/m)?.[1];
  assert.ok(canonical);
  assert.equal(scan(file, canonical), 1);
  const external = new URL(canonical);
  external.hostname = "192.0.2.1";
  rejected(file, external.href);
});

test("environment and binary-secret file prohibitions remain enforced", () => {
  assert.throws(() => scan(".env.local", "SYNTHETIC=true"), /Archivos de entorno versionados/);
  assert.throws(() => scan("fixture.pem", "synthetic"), /Artefactos sensibles versionados/);
});
