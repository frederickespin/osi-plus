import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const guard = resolve(repoRoot, "scripts/validate-prisma-schema-target.mjs");
const portalPath = "scripts/v17-client-temporary-access-http-test.mjs";
const portalSource = readFileSync(resolve(repoRoot, portalPath), "utf8");
const mutation = `["DIRECT_URL", (value) => ({ ...value, DIRECT_URL: value.DIRECT_URL.replace("schema=osi", "schema=public") })]`;
const rejection = `rejects(mutate(preview), remote, "CLIENT_TEMPORARY_CONFIGURATION_INVALID", 503);`;
const publicConfig = `const DATABASE_URL = "postgresql://127.0.0.1:1/schema_target_fixture?schema=public";\n`;

function run(root) {
  const result = spawnSync(process.execPath, [guard], { cwd: root, encoding: "utf8", timeout: 10_000 });
  assert.equal(result.error, undefined, result.error?.message);
  return result;
}

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), "prisma-schema-target-"));
  try {
    for (const directory of [".github", "prisma", "scripts"]) mkdirSync(join(root, directory));
    for (const [path, contents] of Object.entries(files)) {
      const target = join(root, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, contents);
    }
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, `La mutación debe encontrar exactamente una coincidencia: ${before}`);
  return source.replace(before, after);
}

function passes(files) {
  const result = fixture(files);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Configuración Prisma validada/);
}

function rejects(files, path) {
  const result = fixture(files);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Configuración Prisma inválida/);
  assert.ok(result.stderr.includes(`${path}:`), result.stderr);
}

test("el repositorio real conserva la prueba negativa del Portal y pasa el guard", () => {
  assert.ok(portalSource.includes(mutation), "La prueba negativa real no debe borrarse ni ocultar el literal");
  const result = run(repoRoot);
  assert.equal(result.status, 0, result.stderr);
});

test("las configuraciones osi y los sufijos distintos de public siguen permitidos", () => {
  passes({
    ".github/workflows/db.yml": "env:\n  DIRECT_URL: postgresql://127.0.0.1:1/fixture?schema=osi\n",
    "scripts/config.mjs": 'const sql = "SET search_path TO osi"; const suffix = "schema=public_fixture";\n',
    "prisma/schema.prisma": 'datasource db { provider = "postgresql" url = env("DATABASE_URL") }\n',
  });
});

test("el único literal autorizado admite formato, comillas y comentarios equivalentes", () => {
  const formatted = replaceOnce(portalSource, mutation, `[
    'DIRECT_URL',
    (value) => ({ ...value, DIRECT_URL: value.DIRECT_URL.replace(
      'schema=osi', /* escenario negativo */ 'schema=public'
    ) })
  ]`);
  passes({ [portalPath]: `\n\n${formatted}`.replaceAll("\n", "\r\n") });
});

const realConfigurations = [
  ["URL DATABASE_URL de un script activo", "scripts/runtime.mjs", publicConfig],
  ["URL DIRECT_URL de un workflow", ".github/workflows/db.yml", "env:\n  DIRECT_URL: postgresql://127.0.0.1:1/fixture?schema=public\n"],
  ["URL de un datasource Prisma", "prisma/schema.prisma", 'datasource db { provider = "postgresql" url = "postgresql://127.0.0.1:1/fixture?schema=public" }\n'],
  ["literal público en otro test", "scripts/another-test.mjs", publicConfig],
  ["schema público sin depender de mayúsculas", "scripts/runtime.mjs", publicConfig.replace("schema=public", "SCHEMA=PUBLIC")],
  ["search_path con asignación", "scripts/runtime.mjs", 'const sql = "SET search_path = public";\n'],
  ["search_path TO entre comillas", "scripts/runtime.mjs", `const sql = 'SET search_path TO "public"';\n`],
  ["search_path multilínea", "scripts/runtime.mjs", 'const sql = `SET search_path\n TO public`;\n'],
];
for (const [name, path, content] of realConfigurations) {
  test(`rechaza ${name} aunque exista el caso negativo autorizado`, () => {
    rejects({ [portalPath]: portalSource, [path]: content }, path);
  });
}

test("una copia íntegra de la prueba fuera de la ruta autorizada no recibe la excepción", () => {
  const path = "scripts/copied-http-test.mjs";
  rejects({ [path]: portalSource }, path);
});

test("una configuración real añadida al mismo archivo no recibe la excepción", () => {
  rejects({ [portalPath]: `${portalSource}\n${publicConfig}` }, portalPath);
});

test("otra coincidencia en la misma línea del literal autorizado sigue rechazada", () => {
  const another = `, ["runtime", () => ({ DIRECT_URL: "postgresql://127.0.0.1:1/fixture?schema=public" })]`;
  const source = replaceOnce(portalSource, mutation, `${mutation}${another}`);
  const result = fixture({ [portalPath]: source });
  const line = source.slice(0, source.indexOf(mutation)).split(/\r?\n/).length;
  assert.equal(result.status, 1, result.stderr);
  assert.ok(result.stderr.includes(`${portalPath}:${line}`), result.stderr);
});

test("search_path público en el archivo autorizado también sigue rechazado", () => {
  rejects({ [portalPath]: `${portalSource}\nconst sql = "SET search_path = public";\n` }, portalPath);
});

const invalidContexts = [
  ["helper sin aserción de rechazo", (source) => replaceOnce(source, "assert.throws(", "assert.doesNotThrow(")],
  ["helper que sólo verifica el tipo de error", (source) => replaceOnce(source, " && error.code === code && error.status === status", "")],
  ["código esperado distinto", (source) => replaceOnce(source, rejection, 'rejects(mutate(preview), remote, "CLIENT_TEMPORARY_DISABLED", 503);')],
  ["status esperado distinto", (source) => replaceOnce(source, rejection, 'rejects(mutate(preview), remote, "CLIENT_TEMPORARY_CONFIGURATION_INVALID", 200);')],
  ["valor utilizado como configuración real antes de verificarlo", (source) => replaceOnce(source, rejection, `process.env.DIRECT_URL = mutate(preview).DIRECT_URL; ${rejection}`)],
  ["helper omitido al consumir el valor", (source) => replaceOnce(source, rejection, "resolveClientTemporaryApiMode(mutate(preview), remote);")],
  ["mutación de otra propiedad", (source) => replaceOnce(source, mutation, mutation.replaceAll("DIRECT_URL", "DATABASE_URL"))],
  ["assert importado desde otro módulo", (source) => replaceOnce(source, 'from "node:assert/strict"', 'from "./fake-assert.mjs"')],
  ["resolver importado desde otro módulo", (source) => replaceOnce(source, 'from "../api/_lib/clientTemporaryAccessHttp.js"', 'from "./fake-http.mjs"')],
  ["tipo de error importado desde otro módulo", (source) => replaceOnce(source, 'from "../api/_lib/clientTemporaryAccessContract.js"', 'from "./fake-contract.mjs"')],
  ["caso permitido duplicado", (source) => replaceOnce(source, mutation, `${mutation}, ${mutation}`)],
  ["iterador reasignable", (source) => replaceOnce(source, "for (const [name, mutate] of [", "for (let [name, mutate] of [")],
  ["prueba negativa comentada", (source) => replaceOnce(source, `  ${mutation},`, `  // ${mutation},`)],
  ["prueba con sintaxis inválida", (source) => `${source}\nconst = ;\n`],
];
for (const [name, change] of invalidContexts) {
  test(`no aplica la excepción con ${name}`, () => {
    rejects({ [portalPath]: change(portalSource) }, portalPath);
  });
}

test("una fila parecida fuera del for/of verificado no es una prueba autorizada", () => {
  const withoutCase = replaceOnce(portalSource, `  ${mutation},\n`, "");
  rejects({ [portalPath]: `${withoutCase}\nconst runtimeMutation = ${mutation};\n` }, portalPath);
});
