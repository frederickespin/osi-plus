import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import ts from "typescript";

const root = process.cwd();
const roots = [".github", "prisma", "scripts"];
const allowedExtensions = new Set([".js", ".mjs", ".cjs", ".ts", ".json", ".yml", ".yaml", ".toml", ".prisma"]);
const excludedPrefixes = [
  "prisma/db01/",
  "prisma/migration-archive/",
  "prisma/migrations/",
];

// This one negative HTTP test must keep its invalid value visible. Do not exempt
// the file (or even its line): only the literal consumed by the verified rejection
// assertion is allowed. All other matches, including other tests, remain errors.
const negativeTestPath = "scripts/v17-client-temporary-access-http-test.mjs";
const negativeMutation = `["DIRECT_URL", (value) => ({ ...value, DIRECT_URL: value.DIRECT_URL.replace("schema=osi", "schema=public") })]`;
const rejectionHelper = `const rejects = (env, request, code, status) => { assert.throws(() => resolveClientTemporaryApiMode(env, request), (error) => error instanceof ClientTemporaryAccessError && error.code === code && error.status === status); assertions += 1; };`;
const rejectionBody = `{ rejects(mutate(preview), remote, "CLIENT_TEMPORARY_CONFIGURATION_INVALID", 503); void name; }`;

function tokens(text) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, text);
  const result = [];
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    result.push([kind, kind === ts.SyntaxKind.StringLiteral ? scanner.getTokenValue() : scanner.getTokenText()]);
  }
  return JSON.stringify(result);
}

function sameCode(node, source, expected) {
  return tokens(node.getText(source)) === tokens(expected);
}

function hasNamedImport(source, name, module) {
  return source.statements.some((statement) => ts.isImportDeclaration(statement)
    && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === module
    && statement.importClause && !statement.importClause.isTypeOnly
    && statement.importClause.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)
    && statement.importClause.namedBindings.elements.some((element) => !element.isTypeOnly
      && element.name.text === name && (element.propertyName?.text ?? element.name.text) === name));
}

function allowedNegativeLiteralRanges(path, content) {
  if (path !== negativeTestPath) return [];
  const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  if (source.parseDiagnostics.length > 0) return [];
  const strictAssertImport = source.statements.some((statement) => ts.isImportDeclaration(statement)
    && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === "node:assert/strict"
    && !statement.importClause?.isTypeOnly && statement.importClause?.name?.text === "assert");
  const helpers = source.statements.filter((statement) => ts.isVariableStatement(statement)
    && sameCode(statement, source, rejectionHelper));
  if (!strictAssertImport || helpers.length !== 1
    || !hasNamedImport(source, "resolveClientTemporaryApiMode", "../api/_lib/clientTemporaryAccessHttp.js")
    || !hasNamedImport(source, "ClientTemporaryAccessError", "../api/_lib/clientTemporaryAccessContract.js")) return [];

  const ranges = [];
  for (const statement of source.statements) {
    if (!ts.isForOfStatement(statement) || statement.awaitModifier
      || !sameCode(statement.initializer, source, "const [name, mutate]")
      || !ts.isArrayLiteralExpression(statement.expression)
      || !sameCode(statement.statement, source, rejectionBody)) continue;
    for (const entry of statement.expression.elements) {
      if (!sameCode(entry, source, negativeMutation)) continue;
      function visit(node) {
        if (ts.isStringLiteral(node) && node.text === "schema=public") {
          ranges.push({ start: node.getStart(source), end: node.getEnd() });
        }
        ts.forEachChild(node, visit);
      }
      visit(entry);
    }
  }
  // Duplicating the exception is not an authorization for a second fixture.
  return ranges.length === 1 ? ranges : [];
}

function walk(directory) {
  if (!statSync(directory).isDirectory()) return [directory];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const candidates = roots
  .flatMap((directory) => walk(join(root, directory)))
  .filter((path) => allowedExtensions.has(extname(path).toLowerCase()))
  .filter((path) => relative(root, path).replaceAll("\\", "/") !== "scripts/validate-prisma-schema-target.mjs")
  .filter((path) => !excludedPrefixes.some((prefix) => relative(root, path).replaceAll("\\", "/").startsWith(prefix)));

const violations = new Set();
for (const path of candidates) {
  const rel = relative(root, path).replaceAll("\\", "/");
  const content = readFileSync(path, "utf8");
  const allowedRanges = allowedNegativeLiteralRanges(rel, content);
  for (const match of content.matchAll(/schema=public\b|search_path\s*(?:=|to)\s*["']?public\b/gi)) {
    if (allowedRanges.some(({ start, end }) => match.index >= start && match.index + match[0].length <= end)) continue;
    const line = content.slice(0, match.index).split(/\r?\n/).length;
    violations.add(`${rel}:${line}`);
  }
}

if (violations.size > 0) {
  console.error(`Configuración Prisma inválida: schema=public o search_path public detectado en ${[...violations].join(", ")}`);
  process.exit(1);
}

console.warn(`Configuración Prisma validada: ${candidates.length} archivos activos sin configuración pública; sólo se permite el literal de la prueba negativa verificada.`);
