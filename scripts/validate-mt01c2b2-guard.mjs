import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

function invariant(condition, message) {
  if (!condition) throw new Error(`MT01C2B2_GUARD_REJECTED: ${message}`);
}

function filesBelow(root) {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else found.push(full);
    }
  };
  walk(root);
  return found;
}

export function validateMt01c2b2Guard(root = process.cwd()) {
  const read = (path) => readFileSync(resolve(root, path), "utf8");
  const migrations = readdirSync(resolve(root, "prisma/migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory());
  invariant(migrations.length === 19, "deben existir exactamente 19 migraciones");
  invariant(migrations.some((entry) => entry.name === "20260801015000_crm01b_pipeline_mutation_authority"), "falta migración 16 CRM-01B1");
  invariant(migrations.some((entry) => entry.name === "20260801020000_v17_pipeline_case_client_authority"), "falta migración 17 V17-CASE-CLIENT");
  invariant(migrations.some((entry) => entry.name === "20260821010000_v17_pipeline_case_public_ref"), "falta migración 18 V17-CASE-PUBLIC-REF");

  const target = read("scripts/mt-01c2b2-local-target.mjs");
  invariant(target.includes("MT01C2B2_TEST_DATABASE_URL"), "falta variable exclusiva");
  invariant(!/process\.env\.(?:DATABASE_URL|DIRECT_URL)/.test(target), "fallback externo prohibido");
  invariant(target.includes('url.hostname === "127.0.0.1"') && target.includes('url.port === "55432"'), "destino local exacto ausente");
  invariant(target.includes("neon.branch_id"), "falta rechazo de Neon");
  invariant(!/^import .*@prisma\/client/m.test(target), "Prisma se importa antes de validar el destino");
  invariant(target.indexOf("validateMt01c2b2LocalUrl()") < target.indexOf('import("@prisma/client")'), "la URL debe validarse antes de importar Prisma");
  invariant(/OVERRIDE\|SKIP\|UNSAFE\|ALLOW_EXTERNAL/.test(target), "faltan bloqueos de override");

  const lib = read("scripts/mt-01c2b2-lib.mjs");
  for (const literal of ["clients: 7", "projects: 2", "leads: 0", "pipelineCases: 51", "mappedOwners: 39", "unassigned: 12"]) {
    invariant(lib.includes(literal), `decisión ausente: ${literal}`);
  }
  invariant(lib.includes("active.length === 1") && lib.includes("active[0].tenant_id === tenant.id"), "owner no exige membresía activa única compatible");
  invariant(!/ownerName\s*(?:===|\.includes|\.match)/.test(lib), "ownerName no puede ser evidencia");
  invariant(lib.includes("MT01C2B2_LEAD_NOT_EMPTY"), "Lead no está congelado vacío");
  invariant(lib.includes("SET TRANSACTION READ ONLY"), "dry-run no fuerza READ ONLY");
  invariant(lib.includes("isolationLevel: \"ReadCommitted\""), "falta READ COMMITTED explícito");
  invariant(lib.includes("pg_advisory_xact_lock"), "falta serialización del lote");
  invariant(lib.includes("FOR UPDATE") && lib.includes("FOR SHARE OF m,u"), "faltan locks de filas y membresías");
  invariant(lib.includes("MT01C2B2_PARTIAL_STATE"), "el estado parcial no está bloqueado");
  invariant(lib.includes("MT01C2B2_MANIFEST_CHANGED"), "falta revalidación del manifest");
  invariant(!/UPDATE osi\.[^\n]+SET(?! tenant_id| owner_membership_id)/i.test(lib), "UPDATE fuera de campos empresariales");
  for (const sql of lib.matchAll(/UPDATE\s+osi\.(osi_clients|osi_projects|osi_pipeline_cases)\s+SET\s+([^\n;]+)/gi)) {
    const assignments = sql[2].split("WHERE")[0];
    invariant(!/(?:updatedAt|status|code|amount|date|milestone|ownerId|clientId)/i.test(assignments), `UPDATE no autorizado en ${sql[1]}`);
  }
  const applyStart = lib.indexOf("export async function applyMt01c2b2");
  const applyEnd = lib.indexOf("export async function rollbackMt01c2b2");
  const apply = lib.slice(applyStart, applyEnd);
  const ordered = [
    "pg_advisory_xact_lock", "selectClients(tx, true)", "UPDATE osi.osi_clients",
    "selectProjects(tx, true)", "UPDATE osi.osi_projects", "selectCases(tx, true)",
    "selectActiveMemberships(tx, true)", "UPDATE osi.osi_pipeline_cases", "const final = analyzeRows",
  ].map((needle) => apply.indexOf(needle));
  invariant(ordered.every((position) => position >= 0) && ordered.every((position, index) => index === 0 || position > ordered[index - 1]), "orden transaccional C2B2 inválido");

  const rollback = lib.slice(applyEnd);
  invariant(rollback.indexOf("selectClients(tx, true)") < rollback.indexOf("UPDATE osi.osi_pipeline_cases"), "rollback escribe antes de bloquear Client");
  invariant(rollback.indexOf("selectProjects(tx, true)") < rollback.indexOf("UPDATE osi.osi_pipeline_cases"), "rollback escribe antes de bloquear Project");
  invariant(rollback.indexOf("selectCases(tx, true)") < rollback.indexOf("UPDATE osi.osi_pipeline_cases"), "rollback escribe antes de bloquear PipelineCase");
  invariant(rollback.includes('current.state === "LEGACY"'), "segundo rollback no es idempotente");

  const manifest = read("scripts/mt-01c2b2-manifest.mjs");
  for (const token of ["openSync", "fsyncSync", "renameSync", "wx", ".mt01c2b2-"]) invariant(manifest.includes(token), `manifest no es atómico/estable: ${token}`);
  invariant(manifest.includes("assertMt01c2b2Manifest"), "manifest no valida hash y contenido");
  invariant(lib.includes("beforeHash") && lib.includes("expectedAfterHash") && lib.includes("manifestHash"), "manifest no contiene hashes requeridos");

  const runtimeFiles = [];
  for (const runtimeRoot of ["api", "src"]) {
    for (const full of filesBelow(resolve(root, runtimeRoot))) {
      if (/\.[cm]?[jt]sx?$/.test(full) && /mt-01c2b2|MT01C2B2/.test(readFileSync(full, "utf8"))) runtimeFiles.push(full);
    }
  }
  invariant(runtimeFiles.length === 0, `consumidores runtime: ${runtimeFiles.join(",")}`);

  const activationFiles = ["package.json", "vercel.json", "prisma/schema.prisma", ...filesBelow(resolve(root, ".github/workflows"))];
  for (const full of activationFiles) {
    const content = readFileSync(resolve(root, full), "utf8");
    invariant(!/mt-01c2b2-(?:backfill|rollback|dry-run)\.mjs/i.test(content), `hook automático C2B2 en ${full}`);
  }
  for (const endpoint of ["api/clients/index.js", "api/projects/index.js"]) {
    const source = read(endpoint);
    invariant(/COMMERCIAL_TENANCY_WRITE_MODES\.TENANT_WRITE/.test(source), `${endpoint} no declara el puente C2B3 preparado`);
    invariant(/tenantId:\s*auth\.tenantId/.test(source), `${endpoint} no deriva tenantId del contexto servidor`);
    invariant(!/tenantId:\s*(?:body|req\.body|auth\.context)/.test(source), `${endpoint} dejó de evidenciar el bloqueo C2B3`);
  }
  const envExample = read(".env.example");
  invariant(/COMMERCIAL_TENANCY_WRITE_MODE=["']?LEGACY_ONLY["']?/.test(envExample), "el puente C2B3 dejó de estar bloqueado en LEGACY_ONLY");

  for (const [name, value] of Object.entries({ MT01B_AUTH_MODE: "LEGACY", MT01B_TENANT_SWITCH_ENABLED: "false", VITE_MT01B2_CLIENT_ENABLED: "false" })) {
    if (process.env[name] !== undefined) invariant(process.env[name] === value, `${name} inseguro`);
  }
  return { ok: true, migrations: 19, runtimeConsumers: 0, automaticHooks: 0, c2b3Blocked: true, expected: { ...{ clients: 7, projects: 2, leads: 0, pipelineCases: 51, mappedOwners: 39, unassigned: 12 } }, modes: { legacy: true, hybrid: false, tenantSwitch: false, clientV2: false } };
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(validateMt01c2b2Guard(), null, 2)}\n`);
}
