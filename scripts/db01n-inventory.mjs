import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const normalize = (value) => value.replaceAll("\\", "/").replace(/\/{2,}/g, "/");
const runGit = (args, cwd = process.cwd(), allowExitOne = false) => {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0 && !(allowExitOne && result.status === 1)) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  }
  return result.stdout;
};

function walk(root, path) {
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) return [normalize(path)];
  if (!statSync(absolute).isDirectory()) return [normalize(path)];
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) =>
    walk(root, normalize(`${path}/${entry.name}`)),
  );
}

function classify(path) {
  if (path === "prisma/schema.prisma" || path.startsWith("api/_lib/")) return "Runtime requerido";
  if (path.startsWith("prisma/migrations/") || path.startsWith("prisma/migration-archive/")) {
    return "Migración requerida";
  }
  if (path.startsWith("scripts/") && /(?:db01|mt-01a|validate-prisma)/i.test(path)) return "Prueba requerida";
  if (path.startsWith("docs/") || path.endsWith(".md") || path.endsWith(".sql")) return "Documentación operativa";
  if (/HASHES|MANIFEST|MODEL-DECISIONS|MIGRATION-NAME-MAP|schema\.production-baseline/i.test(path)) {
    return "Evidencia útil";
  }
  if ([".gitignore", ".github/workflows/ci.yml", "eslint.config.js"].includes(path)) return "Runtime requerido";
  return "Evidencia útil";
}

function exclusionReason(path) {
  if (/\/generated\//i.test(path)) return "Cliente Prisma regenerable";
  if (/prisma\/db01[LM]\/artifacts\//i.test(path)) return "Resultado local regenerable o voluminoso";
  if (/prisma\/db01\/canonical-migrations\//i.test(path)) return "Cadena experimental duplicada; sustituida por prisma/migrations";
  if (/prisma\/db01\/adoption-simulation\//i.test(path)) return "Ensayo experimental sustituido por DB-01M";
  if (/schema\.after-|schema\.pre-db01k|baseline\.candidate/i.test(path)) return "Datamodel o SQL intermedio regenerable";
  if (/DB-01[D-J]-(?:RESULTS|TEST-RESULTS|DRY-RUN)\.json/i.test(path)) return "Resultado de prueba regenerable";
  if (/scripts\/db01[CLM]-/i.test(path)) return "Herramienta experimental o específica de rama";
  return "Evidencia histórica no esencial para la cadena reproducible";
}

const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const sourceArg = process.argv.find((arg) => arg.startsWith("--source="));
if (!outputArg || !sourceArg) throw new Error("Uso: --source=<worktree original> --output=<json>");
const source = resolve(sourceArg.slice("--source=".length));
const output = resolve(outputArg.slice("--output=".length));
const current = process.cwd();

const changed = new Set();
for (const path of runGit(["diff", "--name-only", "HEAD"], current).split(/\r?\n/).filter(Boolean)) changed.add(normalize(path));
for (const path of runGit(["ls-files", "--others", "--exclude-standard"], current).split(/\r?\n/).filter(Boolean)) changed.add(normalize(path));

const included = [...changed].sort().map((path) => ({ path, classification: classify(path) }));
const readableIncluded = included.filter(({ path }) => existsSync(resolve(current, path)) && statSync(resolve(current, path)).isFile());
const scanPaths = (pattern) =>
  readableIncluded
    .filter(({ path }) => {
      const contents = readFileSync(resolve(current, path));
      if (contents.includes(0)) return false;
      return pattern.test(contents.toString("utf8"));
    })
    .map(({ path }) => path);
const credentialUrlFiles = scanPaths(/postgres(?:ql)?:\/\/[^\s]+:[^@\s]+@/i);
const neonEndpointFiles = scanPaths(/ep-[a-z0-9-]+\.neon\.tech/i);
const privateKeyFiles = scanPaths(/BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/i);
const auditPath = resolve(source, "prisma/db01m/artifacts/git-audit.json");
const audit = JSON.parse(readFileSync(auditPath, "utf8"));
const expandedSource = [...new Set(audit.db01OrMt01a.flatMap((entry) => walk(source, entry.path)))].sort();
const targetPaths = new Set(included.map((entry) => entry.path));
const originalInventory = expandedSource.map((path) => ({
  path,
  included: targetPaths.has(path),
  classification: targetPaths.has(path) ? classify(path) : "Artefacto temporal o regenerable",
  ...(targetPaths.has(path) ? {} : { exclusionReason: exclusionReason(path) }),
}));

const classificationCounts = Object.fromEntries(
  [...new Set(included.map((entry) => entry.classification))].sort().map((classification) => [
    classification,
    included.filter((entry) => entry.classification === classification).length,
  ]),
);
const report = {
  generatedAt: new Date().toISOString(),
  source: {
    branch: audit.branch,
    head: runGit(["rev-parse", "HEAD"], source).trim(),
    statusEntries: audit.summary.totalChanges,
    attributedEntries: audit.summary.db01OrMt01aChanges,
    expandedFiles: originalInventory.length,
  },
  target: {
    branch: runGit(["branch", "--show-current"], current).trim(),
    head: runGit(["rev-parse", "HEAD"], current).trim(),
    changedFiles: included.length,
    classificationCounts,
  },
  secretScan: {
    credentialUrlFiles,
    credentialUrlsAreKnownLocalCiExamples:
      credentialUrlFiles.length === 1 && credentialUrlFiles[0] === ".github/workflows/ci.yml",
    neonEndpointFiles,
    privateKeyFiles,
  },
  included,
  originalInventory,
};
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ source: report.source, target: report.target }, null, 2)}\n`);
