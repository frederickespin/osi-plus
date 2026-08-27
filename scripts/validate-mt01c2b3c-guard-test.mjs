import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateMt01c2b3c } from "./validate-mt01c2b3c-guard.mjs";

const root = process.cwd();
const results = [];
const read = (path) => readFileSync(resolve(root, path), "utf8");

function check(name, passed) {
  results.push({ name, passed: Boolean(passed) });
  if (!passed) throw new Error(name);
}

function rejected(name, options, pattern) {
  let error;
  try { validateMt01c2b3c({ root, ...options }); } catch (caught) { error = caught; }
  check(name, pattern.test(String(error?.message || "")));
}

try {
  const baseline = validateMt01c2b3c({ root });
  check("estado inactivo actual aprobado", baseline.ok && baseline.migrations === 21 && baseline.previewBlocked);
  check("allowlist heredada continúa en 24", baseline.legacyHeaderExceptions === 24);

  const bridge = read("api/_lib/commercialTenancyWrite.js");
  rejected("batch distinto rechazado por guardia", {
    overrides: { "api/_lib/commercialTenancyWrite.js": bridge.replace("MT-01C2B2-IPACKERS-DO-V1", "MT-01C2B2-IPACKERS-DO-V2") },
  }, /lote/);
  rejected("trim implícito del batch rechazado", {
    overrides: { "api/_lib/commercialTenancyWrite.js": bridge.replace("env.COMMERCIAL_TENANCY_ACTIVATION_BATCH;", "env.COMMERCIAL_TENANCY_ACTIVATION_BATCH.trim();") },
  }, /normalizarse/);
  rejected("rama distinta de main rechazada por guardia", {
    overrides: { "api/_lib/commercialTenancyWrite.js": bridge.replace('VERCEL_GIT_COMMIT_REF === "main"', 'VERCEL_GIT_COMMIT_REF === "release"') },
  }, /main/);
  rejected("Preview autorizado accidentalmente rechazado", {
    overrides: { "api/_lib/commercialTenancyWrite.js": bridge.replace('vercelEnvironment === "production"', '["production", "preview"].includes(vercelEnvironment)') },
  }, /Production/);

  const workflow = read(".github/workflows/ci.yml");
  rejected("batch en workflow rechazado", {
    overrides: { ".github/workflows/ci.yml": `${workflow}\n# COMMERCIAL_TENANCY_ACTIVATION_BATCH` },
  }, /workflow.*lote/);
  const envExample = read(".env.example");
  rejected("modo tenant versionado rechazado", {
    overrides: { ".env.example": envExample.replace('COMMERCIAL_TENANCY_READ_MODE="LEGACY_ONLY"', 'COMMERCIAL_TENANCY_READ_MODE="TENANT_READ"') },
  }, /READ debe|activa/);
  rejected("migración 22 rechazada", {
    migrationNames: [...Array.from({ length: 21 }, (_, index) => `m${index}`), "20260828010000_unexpected"],
  }, /21 migraciones/);
  rejected("hook de backfill rechazado", {
    overrides: { "package.json": JSON.stringify({ ...JSON.parse(read("package.json")), scripts: { build: "node scripts/mt-01c2b2-backfill.mjs" } }) },
  }, /hook|automático/);
  rejected("lote expuesto al frontend rechazado", {
    extraRuntimeSources: { "src/activation.ts": "export const value = process.env.COMMERCIAL_TENANCY_ACTIVATION_BATCH;" },
  }, /expone|consume/);
  const clients = read("api/clients/index.js");
  rejected("lectura directa de modo en ruta rechazada", {
    overrides: { "api/clients/index.js": clients.replace("const permission", "const unsafe = process.env.COMMERCIAL_TENANCY_READ_MODE;\n  const permission") },
  }, /interpreta directamente/);
  rejected("ruta con autenticación antes del resolver rechazada", {
    overrides: { "api/clients/index.js": clients.replace("const permission", "await requirePilotAuth(req, res, { prisma });\n  const permission") },
  }, /antes de validar/);
  rejected("readiness conectado a endpoint rechazado", {
    extraRuntimeSources: { "api/activate.js": 'import "../scripts/mt-01c2b3b-readiness.mjs";' },
  }, /administrativa|readiness/);
  rejected("PipelineCase runtime nuevo rechazado", {
    extraRuntimeSources: { "api/pipeline/index.js": "await prisma.pipelineCase.findMany({});" },
  }, /Lead\/PipelineCase/);

  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, assertions: results.filter((entry) => entry.passed).length, error: error.message, results }, null, 2)}\n`);
  process.exitCode = 1;
}
