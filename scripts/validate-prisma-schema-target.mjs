import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const roots = [".github", "prisma", "scripts"];
const allowedExtensions = new Set([".js", ".mjs", ".cjs", ".ts", ".json", ".yml", ".yaml", ".toml", ".prisma"]);
const excludedPrefixes = [
  "prisma/db01/",
  "prisma/migration-archive/",
  "prisma/migrations/",
];

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

const violations = [];
for (const path of candidates) {
  const rel = relative(root, path).replaceAll("\\", "/");
  const content = readFileSync(path, "utf8");
  content.split(/\r?\n/).forEach((line, index) => {
    if (/schema=public\b/i.test(line) || /search_path\s*(?:=|to)\s*["']?public\b/i.test(line)) {
      violations.push(`${rel}:${index + 1}`);
    }
  });
}

if (violations.length > 0) {
  console.error(`Configuración Prisma inválida: schema=public detectado en ${violations.join(", ")}`);
  process.exit(1);
}

console.warn(`Configuración Prisma validada: ${candidates.length} archivos activos sin schema=public.`);
