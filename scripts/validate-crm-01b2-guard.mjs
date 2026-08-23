import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const DOMAIN = "api/_lib/pipelineCaseDomain.js";
const AUTHORIZED_CONSUMERS = Object.freeze([
  "api/crm/pipeline-cases/[id]/allowed-transitions.js",
  "api/crm/pipeline-cases/[id]/assign-owner.js",
  "api/crm/pipeline-cases/[id]/transition.js",
  "api/crm/pipeline-cases/[id]/unassign-owner.js",
]);
const MIGRATION = "20260801015000_crm01b_pipeline_mutation_authority";
const MIGRATION_HASH = "77db8b909def5731693d1c8b8e2fbe020ff31f0322b2c8a57a1e18d79fc685f8";

function invariant(condition, message) { if (!condition) throw new Error(`CRM01B2_GUARD: ${message}`); }
function files(root) {
  const result = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  invariant(result.status === 0, "no se pudo inventariar el repositorio");
  return result.stdout.split("\0")
    .filter(Boolean)
    .map((entry) => entry.replaceAll("\\", "/"))
    .filter((entry) => existsSync(resolve(root, entry)));
}

export function validateCrm01b2Guard({ root = process.cwd(), overrides = {}, extraSources = {}, env = process.env } = {}) {
  const read = (path) => overrides[path] ?? readFileSync(resolve(root, path), "utf8");
  const migrations = readdirSync(resolve(root, "prisma/migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  invariant(migrations.length === 18 && migrations.includes(MIGRATION), "se requieren exactamente 18 migraciones");
  invariant(migrations.includes("20260801020000_v17_pipeline_case_client_authority"), "falta migración 17 V17-CASE-CLIENT autorizada");
  invariant(migrations.includes("20260821010000_v17_pipeline_case_public_ref"), "falta migración 18 V17-CASE-PUBLIC-REF autorizada");
  invariant(createHash("sha256").update(read(`prisma/migrations/${MIGRATION}/migration.sql`).replace(/\r\n/g, "\n")).digest("hex") === MIGRATION_HASH, "migration.sql CRM-01B1 fue modificada");

  const domain = read(DOMAIN);
  const exports = [...domain.matchAll(/export async function\s+(\w+)/g)].map((match) => match[1]).sort();
  invariant(JSON.stringify(exports) === JSON.stringify(["assignPipelineCaseOwner", "getAllowedPipelineTransitions", "transitionPipelineCase", "unassignPipelineCaseOwner"]), "exports públicos del dominio no coinciden");
  for (const signature of [
    "pg_try_advisory_xact_lock", "CRM-01B2:${namespace}", "resolveActor", "resolveIdempotency",
    "transaction_timestamp()", "UPDATE \"osi\".\"osi_pipeline_cases\"", "pipeline_case_commands", "appendCommercialAudit",
    "ReadCommitted", "MAX_WAIT_MS", "TRANSACTION_TIMEOUT_MS", "LOCK_TIMEOUT_MS", "STATEMENT_TIMEOUT_MS",
    "RETRY_AFTER_MIN_MS", "RETRY_AFTER_MAX_MS", "CRM_PIPELINE_COMMAND_IN_PROGRESS", "CRM_PIPELINE_DATABASE_UNAVAILABLE",
  ]) invariant(domain.includes(signature), `falta control obligatorio: ${signature}`);
  invariant(!/\bpg_advisory_xact_lock\s*\(/.test(domain), "lock advisory bloqueante no autorizado");
  invariant(/setTransactionLimits\(tx\)[\s\S]{0,200}advisoryLock\(tx, "REQUEST"[\s\S]{0,300}advisoryLock\(tx, "CASE"[\s\S]{0,300}resolveActor\(tx[\s\S]{0,300}resolveIdempotency\(tx/.test(domain), "orden de locks/actor/idempotencia incorrecto");
  invariant(/const key = `CRM-01B2:\$\{namespace\}:\$\{tenantId\}:\$\{value\}`/.test(domain), "clave advisory no separa namespace, tenant e identidad");
  invariant(/SET LOCAL lock_timeout/.test(domain) && /SET LOCAL statement_timeout/.test(domain), "timeouts SQL locales ausentes");
  invariant(/recoverable: true, retryAfterMs: retryAfterMs\(\)/.test(domain), "contrato de contención recuperable ausente");
  invariant(/row\.actor_membership_id !== actor\.membershipId/.test(domain) && /row\.actor_user_id !== actor\.userId/.test(domain), "replay no está ligado al actor original");
  invariant(/const updated = await tx\.\$queryRaw[\s\S]{0,1800}insertJournal\(tx[\s\S]{0,300}appendAudit\(tx/.test(domain), "orden update/journal/auditoría incorrecto");
  invariant(!/Date\.now\s*\(|new Date\s*\(/.test(domain), "reloj Node no puede ser autoridad");
  invariant(/pipelineCase\.status === "APPROVED"/.test(domain) && /\["APPROVED", "OPS_HANDOFF"\]/.test(domain), "APPROVED no está congelado completamente");
  invariant(/actor\.role !== "A"[\s\S]{0,180}Sólo A puede administrar owners/.test(domain), "V podría administrar owners");
  invariant(/pipelineCase\.owner_membership_id !== actor\.membershipId/.test(domain), "V no está limitado al caso propio");
  invariant(/WON: Object\.freeze\(\{ type: "APPROVAL", supported: false/.test(domain), "WON debe permanecer bloqueado");
  invariant(/SURVEY_SCHEDULED: Object\.freeze\(\{ type: "SURVEY", supported: false/.test(domain), "SURVEY_SCHEDULED debe permanecer bloqueado");
  invariant(!/ownerId"\s*=|"ownerId"\s*,?\s*\}/.test(domain), "ownerId heredado no puede escribirse");
  for (const action of ["CRM_PIPELINE_TRANSITIONED", "CRM_PIPELINE_REOPENED", "CRM_PIPELINE_OWNER_ASSIGNED", "CRM_PIPELINE_OWNER_REASSIGNED", "CRM_PIPELINE_OWNER_UNASSIGNED"]) {
    invariant(domain.includes(`"${action}"`), `falta auditoría crítica ${action}`);
  }
  const auditBody = domain.match(/async function appendAudit\([\s\S]*?\n\}/)?.[0] || "";
  invariant(auditBody && !/(?:payload_hash|email|phone|password|token|notes)/i.test(auditBody), "auditoría contiene campos prohibidos");
  invariant(/const MAX_WAIT_MS = 3_000/.test(domain) && /const TRANSACTION_TIMEOUT_MS = 10_000/.test(domain)
    && /const LOCK_TIMEOUT_MS = 250/.test(domain) && /const STATEMENT_TIMEOUT_MS = 3_000/.test(domain)
    && /const RETRY_AFTER_MIN_MS = 75/.test(domain) && /const RETRY_AFTER_MAX_MS = 175/.test(domain), "presupuesto transaccional no autorizado");
  const graph = Object.freeze({
    NEW_INBOX: ["AWAITING_ICP"], AWAITING_ICP: ["GOVERNANCE_CONFIRMED"], GOVERNANCE_CONFIRMED: ["REQUIREMENTS_CONFIRMED"],
    REQUIREMENTS_CONFIRMED: ["SURVEY_PLANNING", "CRATING_ESTIMATE_PENDING", "PRICING_IN_PROGRESS"], SURVEY_PLANNING: ["SURVEY_SCHEDULED"],
    SURVEY_SCHEDULED: ["SURVEY_COMPLETED"], SURVEY_COMPLETED: ["CRATING_ESTIMATE_PENDING", "PRICING_IN_PROGRESS"],
    CRATING_ESTIMATE_PENDING: ["PRICING_IN_PROGRESS"], PRICING_IN_PROGRESS: ["QUOTE_DRAFT"], QUOTE_DRAFT: ["INTERNAL_REVIEW"],
    INTERNAL_REVIEW: ["QUOTE_SENT"], QUOTE_SENT: ["NEGOTIATION", "WON", "LOST"], NEGOTIATION: ["CHANGE_CONTROL", "WON", "LOST"],
    CHANGE_CONTROL: ["QUOTE_DRAFT", "NEGOTIATION"], WON: ["OPS_HANDOFF"], LOST: ["NEW_INBOX"], APPROVED: [], OPS_HANDOFF: [],
  });
  for (const [status, targets] of Object.entries(graph)) {
    const escaped = targets.map((target) => `"${target}"`).join(", ").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    invariant(new RegExp(`${status}: Object\\.freeze\\(\\[${escaped}\\]\\)`).test(domain), `grafo alterado para ${status}`);
  }
  invariant(/const LOSS_REASONS = new Set\(\["PRICE", "COMPETITOR", "NO_RESPONSE", "CLIENT_CANCELLED", "TIMING", "SERVICE_UNAVAILABLE", "DUPLICATE", "OTHER"\]\)/.test(domain), "allowlist LOST alterada");

  const rbac = read("api/_lib/rbac.js");
  for (const permission of ["pipeline:update", "pipeline:transition", "pipeline:assign"]) invariant(rbac.includes(`"${permission}"`), `falta permiso ${permission}`);
  const roleCatalog = rbac.match(/const ROLE_PERMS\s*=\s*\{([\s\S]*?)\n\};/)?.[1] || "";
  const v = roleCatalog.match(/V:\s*\[([\s\S]*?)\n\s*\],/)?.[1] || "";
  invariant(v.includes("PERMS.PIPELINE_UPDATE") && v.includes("PERMS.PIPELINE_TRANSITION") && !v.includes("PERMS.PIPELINE_ASSIGN"), "matriz V incorrecta");

  const allFiles = files(root);
  const consumers = [];
  const mutations = [];
  const journalBypasses = [];
  for (const path of allFiles.filter((path) => /^(?:api|src)\/.+\.(?:[cm]?[jt]sx?)$/.test(path))) {
    const source = extraSources[path] ?? read(path);
    if (path !== DOMAIN && /(?:from|import\s*\()\s*["'][^"']*pipelineCaseDomain\.js/.test(source)) consumers.push(path);
    if (path !== DOMAIN && /pipelineCase\s*\.\s*(?:update|updateMany|upsert|delete|deleteMany)\s*\(|UPDATE\s+"osi"\."osi_pipeline_cases"/i.test(source)) mutations.push(path);
    if (path !== DOMAIN && /pipelineCaseCommand\s*\.\s*create\s*\(|INSERT\s+INTO\s+"osi"\."pipeline_case_commands"/i.test(source)) journalBypasses.push(path);
    if (path.startsWith("src/") && /pipeline:(?:update|transition|assign)|PipelineCaseCommand/.test(source)) mutations.push(path);
  }
  for (const [path, source] of Object.entries(extraSources)) {
    if (!/^(?:api|src)\//.test(path) || path === DOMAIN || allFiles.includes(path)) continue;
    if (/(?:from|import\s*\()\s*["'][^"']*pipelineCaseDomain\.js/.test(source)) consumers.push(path);
    if (/pipelineCase\s*\.\s*(?:update|updateMany|upsert|delete|deleteMany)\s*\(|UPDATE\s+"osi"\."osi_pipeline_cases"/i.test(source)) mutations.push(path);
    if (/pipelineCaseCommand\s*\.\s*create\s*\(|INSERT\s+INTO\s+"osi"\."pipeline_case_commands"/i.test(source)) journalBypasses.push(path);
  }
  invariant(JSON.stringify([...new Set(consumers)].sort()) === JSON.stringify([...AUTHORIZED_CONSUMERS]), `consumidores runtime: ${consumers.join(", ")}`);
  invariant(mutations.length === 0, `bypass de mutación: ${mutations.join(", ")}`);
  invariant(journalBypasses.length === 0, `bypass de journal: ${journalBypasses.join(", ")}`);
  invariant(!allFiles.some((path) => /^api\/crm\/.+(?:create|update|transition|assign|command).+\.js$/i.test(path) && !AUTHORIZED_CONSUMERS.includes(path)), "endpoint de mutación no autorizado");
  invariant(env.CRM_PIPELINE_RUNTIME_MODE === undefined || env.CRM_PIPELINE_RUNTIME_MODE === "DISABLED", "CRM debe permanecer DISABLED");
  invariant(String(env.MT01B_AUTH_MODE || "LEGACY").toUpperCase() !== "HYBRID", "HYBRID no autorizado");
  invariant(String(env.MT01B_TENANT_SWITCH_ENABLED || "false").toLowerCase() !== "true", "tenant switch no autorizado");
  invariant(String(env.VITE_MT01B2_CLIENT_ENABLED || "false").toLowerCase() !== "true", "cliente V2 no autorizado");
  const canonical = read("scripts/run-canonical-db-tests.mjs");
  for (const suite of ["crm-01b2-test.mjs", "crm-01b2-concurrency-test.mjs", "crm-01b2-adversarial-test.mjs", "crm-01b2-stress-test.mjs", "crm-01b2-local-target-test.mjs", "validate-crm-01b2-guard-test.mjs"]) invariant(canonical.includes(suite), `runner canónico no exige ${suite}`);
  invariant(canonical.includes("process.env.CRM01B2_TEST_DATABASE_URL = process.env.DATABASE_URL"), "runner canónico no transfiere URL local CRM-01B2");
  const target = read("scripts/crm-01b2-local-target.mjs");
  for (const required of ["127.0.0.1", "55432", "osi_crm01b2_local", "neon.branch_id", "no existe fallback"]) invariant(target.includes(required), `guardia local incompleta: ${required}`);
  return Object.freeze({ ok: true, migrations: 18, runtimeConsumers: AUTHORIZED_CONSUMERS.length, mutationBypasses: 0, crmMode: "DISABLED", advisoryLock: "TRY", lockOrder: Object.freeze(["REQUEST", "CASE"]), blockedTransitions: Object.freeze(["SURVEY_SCHEDULED", "WON"]), approved: "FROZEN" });
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(validateCrm01b2Guard(), null, 2)}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`); process.exitCode = 1; }
}
