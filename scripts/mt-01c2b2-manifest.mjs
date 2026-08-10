import { closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { assertMt01c2b2Manifest } from "./mt-01c2b2-lib.mjs";

function fail(code, message) { const error = new Error(message); error.code = code; throw error; }

export function resolveMt01c2b2ManifestPath(raw = process.env.MT01C2B2_MANIFEST_PATH) {
  if (!raw) fail("MT01C2B2_MANIFEST_PATH_REQUIRED", "MT01C2B2_MANIFEST_PATH es obligatorio");
  const path = resolve(raw);
  const root = resolve(process.cwd());
  if (dirname(path) !== root || !/^\.mt01c2b2-[a-z0-9-]+\.json$/i.test(basename(path))) {
    fail("MT01C2B2_MANIFEST_PATH_UNSAFE", "El manifest debe usar .mt01c2b2-*.json en la raíz del worktree");
  }
  if (!relative(resolve(tmpdir()), path).startsWith("..")) fail("MT01C2B2_MANIFEST_PATH_TEMP", "El manifest no puede depender del directorio temporal");
  return path;
}

export function readMt01c2b2Envelope(path) {
  let envelope;
  try { envelope = JSON.parse(readFileSync(path, "utf8")); }
  catch { fail("MT01C2B2_MANIFEST_FILE_INVALID", "El archivo manifest no es JSON válido"); }
  if (!envelope || !["PENDING", "APPLIED", "ROLLED_BACK"].includes(envelope.phase)) fail("MT01C2B2_MANIFEST_PHASE_INVALID", "Fase de manifest inválida");
  assertMt01c2b2Manifest(envelope.manifest);
  return envelope;
}

export function writeMt01c2b2EnvelopeAtomic(path, envelope, { exclusive = false } = {}) {
  assertMt01c2b2Manifest(envelope?.manifest);
  if (exclusive && existsSync(path)) fail("MT01C2B2_MANIFEST_EXISTS", "El manifest ya existe");
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  let descriptor;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeFileSync(descriptor, `${JSON.stringify(envelope, null, 2)}\n`, { encoding: "utf8" });
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    if (exclusive && existsSync(path)) fail("MT01C2B2_MANIFEST_EXISTS", "El manifest apareció durante la escritura");
    renameSync(temporary, path);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}
