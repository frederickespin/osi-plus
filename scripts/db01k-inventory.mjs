import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const migrationsRoot = join(root, "prisma", "migrations");

function git(args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

function describeFile(path) {
  const bytes = readFileSync(path);
  const rel = relative(root, path).replaceAll("\\", "/");
  const nulCount = bytes.reduce((count, value) => count + Number(value === 0), 0);
  const utf16leBom = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe;
  return {
    path: rel,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    encoding: utf16leBom ? "UTF-16LE-BOM" : nulCount > 0 ? "binary-or-UTF16" : "UTF-8-compatible",
    nulBytes: nulCount,
    gitBlob: git(["rev-parse", `HEAD:${rel}`]),
  };
}

const migrations = readdirSync(migrationsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((entry) => ({
    name: entry.name,
    files: filesUnder(join(migrationsRoot, entry.name)).map(describeFile),
  }));

const statusLines = (git(["status", "--short", "--untracked-files=all"]) || "")
  .split(/\r?\n/)
  .filter(Boolean);
const ignoredEnv = [".env", ".env.local", ".env.mt01a.local", ".env.db01e.local", ".env.db01k.local", ".env.vercel.production"]
  .map((path) => ({ path, ignoredBy: git(["check-ignore", "-v", path]) }));

const report = {
  generatedAt: new Date().toISOString(),
  head: git(["rev-parse", "HEAD"]),
  branch: git(["branch", "--show-current"]),
  workingTree: {
    totalEntries: statusLines.length,
    entries: statusLines,
  },
  ignoredEnvironmentFiles: ignoredEnv,
  activeMigrationsBeforeDb01k: migrations,
};

const output = join(root, "prisma", "db01", "DB-01K-PRECHANGE-INVENTORY.json");
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.warn(JSON.stringify({ output: relative(root, output), changes: statusLines.length, migrations: migrations.length }));
