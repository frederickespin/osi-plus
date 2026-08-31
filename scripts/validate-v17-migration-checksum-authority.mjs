import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const MIGRATION_SQL_ATTRIBUTE = "prisma/migrations/**/*.sql text eol=lf";
export const CANONICAL_MIGRATION_CHECKSUMS = Object.freeze({
  "prisma/migrations/20260824010000_v17_client_public_ref_case_mutations/migration.sql": "dbb093f15eb2ee708328518dcf19e52fd8b0623fbc893cec1a001cf819a6da70",
  "prisma/migrations/20260827010000_v17_tenant_membership_public_ref/migration.sql": "b1284e443778ad1c7336d7703c9478ac09215b81a00f6b09bad48ceba6d5051c",
  "prisma/migrations/20260827020000_v17_admin_identity_invitation/migration.sql": "9ee56aaee53d5629db8dada22bcf86511d10c837c4ad61fb37fbd0b4caf53808",
  "prisma/migrations/20260831010000_v17_crm_icp_foundation/migration.sql": "d085a74f4be3bd7be727d182993598008f53f019c8f1d626863b987be6726f37",
});

export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function inspectSqlBytes(buffer) {
  let crlf = 0;
  let lf = 0;
  let loneCr = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] === 13 && buffer[index + 1] === 10) { crlf += 1; index += 1; }
    else if (buffer[index] === 10) lf += 1;
    else if (buffer[index] === 13) loneCr += 1;
  }
  return Object.freeze({
    sha256: sha256(buffer),
    bytes: buffer.length,
    eol: crlf === 0 && loneCr === 0 ? "LF" : lf === 0 && loneCr === 0 ? "CRLF" : "MIXED",
    crlf,
    lf,
    loneCr,
    bom: buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf,
  });
}

export function validateAttributes(text) {
  const rules = String(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (rules.filter((line) => line === MIGRATION_SQL_ATTRIBUTE).length !== 1) {
    throw new Error("MIGRATION_SQL_LF_ATTRIBUTE_REQUIRED");
  }
  return true;
}

export function validateMigrationBytes({ path, working, blob, expected }) {
  const details = inspectSqlBytes(working);
  if (details.bom) throw new Error(`MIGRATION_SQL_BOM_FORBIDDEN:${path}`);
  if (details.crlf !== 0 || details.loneCr !== 0) throw new Error(`MIGRATION_SQL_LF_REQUIRED:${path}`);
  if (!working.equals(blob)) throw new Error(`MIGRATION_SQL_WORKTREE_BLOB_MISMATCH:${path}`);
  if (expected && details.sha256 !== expected) throw new Error(`MIGRATION_SQL_CANONICAL_CHECKSUM_MISMATCH:${path}`);
  return details;
}

function migrationFiles(root) {
  const directory = resolve(root, "prisma/migrations");
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(directory, entry.name, "migration.sql"))
    .filter((path) => {
      try { readFileSync(path); return true; } catch { return false; }
    })
    .sort();
}

function gitBlob(root, path) {
  const result = spawnSync("git", ["show", `HEAD:${path}`], { cwd: root, encoding: null, maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`MIGRATION_SQL_GIT_BLOB_UNAVAILABLE:${path}`);
  return result.stdout;
}

export function validateRepository(root = process.cwd()) {
  validateAttributes(readFileSync(resolve(root, ".gitattributes"), "utf8"));
  const results = [];
  for (const absolute of migrationFiles(root)) {
    const path = relative(root, absolute).split(sep).join("/");
    const working = readFileSync(absolute);
    results.push({ path, ...validateMigrationBytes({ path, working, blob: gitBlob(root, path), expected: CANONICAL_MIGRATION_CHECKSUMS[path] }) });
  }
  return Object.freeze({
    ok: true,
    migrations: results.length,
    canonical: results.filter((entry) => Object.hasOwn(CANONICAL_MIGRATION_CHECKSUMS, entry.path)),
  });
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) process.stdout.write(`${JSON.stringify(validateRepository(), null, 2)}\n`);
