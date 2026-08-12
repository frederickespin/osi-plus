import { readFileSync } from "node:fs";
import { validateCrm01b2Guard } from "./validate-crm-01b2-guard.mjs";

const results = [];
const check = (name, condition) => { results.push({ name, passed: Boolean(condition) }); if (!condition) throw new Error(name); };
function rejected(name, options, pattern) {
  let error;
  try { validateCrm01b2Guard(options); } catch (caught) { error = caught; }
  check(name, pattern.test(error?.message || ""));
}
const read = (path) => readFileSync(path, "utf8");
const domain = read("api/_lib/pipelineCaseDomain.js");
const rbac = read("api/_lib/rbac.js");
check("baseline CRM-01B2", validateCrm01b2Guard().ok);
rejected("endpoint consumidor rechazado", { extraSources: { "api/crm/pipeline-cases/mutate.js": 'import { transitionPipelineCase } from "../../_lib/pipelineCaseDomain.js";' } }, /consumidores runtime|endpoint/);
rejected("bypass update rechazado", { extraSources: { "api/fake.js": "await prisma.pipelineCase.update({ where, data });" } }, /bypass/);
rejected("bypass journal rechazado", { extraSources: { "api/fake-journal.js": "await prisma.pipelineCaseCommand.create({ data });" } }, /journal/);
rejected("reloj Node rechazado", { overrides: { "api/_lib/pipelineCaseDomain.js": domain.replace("const now = clock.now;", "const now = new Date();") } }, /reloj Node/);
rejected("auditoría crítica eliminada rechazada", { overrides: { "api/_lib/pipelineCaseDomain.js": domain.replace('"CRM_PIPELINE_OWNER_UNASSIGNED"', '"CRM_PIPELINE_OWNER_ASSIGNED"') } }, /auditoría crítica/);
rejected("grafo ampliado rechazado", { overrides: { "api/_lib/pipelineCaseDomain.js": domain.replace('NEW_INBOX: Object.freeze(["AWAITING_ICP"])', 'NEW_INBOX: Object.freeze(["AWAITING_ICP", "WON"])') } }, /grafo alterado/);
rejected("timeout de sesenta segundos rechazado", { overrides: { "api/_lib/pipelineCaseDomain.js": domain.replace("const TRANSACTION_TIMEOUT_MS = 10_000", "const TRANSACTION_TIMEOUT_MS = 60_000") } }, /presupuesto transaccional/);
rejected("lock advisory bloqueante rechazado", { overrides: { "api/_lib/pipelineCaseDomain.js": domain.replace("pg_try_advisory_xact_lock", "pg_advisory_xact_lock") } }, /pg_try|bloqueante/);
rejected("orden CASE antes de REQUEST rechazado", { overrides: { "api/_lib/pipelineCaseDomain.js": domain.replace('await advisoryLock(tx, "REQUEST", tenantId, input.requestId);\n      await advisoryLock(tx, "CASE", tenantId, input.caseId);', 'await advisoryLock(tx, "CASE", tenantId, input.caseId);\n      await advisoryLock(tx, "REQUEST", tenantId, input.requestId);') } }, /orden de locks/);
rejected("SET LOCAL ausente rechazado", { overrides: { "api/_lib/pipelineCaseDomain.js": domain.replace("SET LOCAL lock_timeout", "SELECT lock_timeout") } }, /timeouts SQL/);
rejected("replay sin actor rechazado", { overrides: { "api/_lib/pipelineCaseDomain.js": domain.replace("row.actor_membership_id !== actor.membershipId", "false") } }, /actor original/);
rejected("WON sin evidencia bloqueante rechazado", { overrides: { "api/_lib/pipelineCaseDomain.js": domain.replace('WON: Object.freeze({ type: "APPROVAL", supported: false', 'WON: Object.freeze({ type: "APPROVAL", supported: true') } }, /WON/);
rejected("V con assign rechazado", { overrides: { "api/_lib/rbac.js": rbac.replace("PERMS.PIPELINE_TRANSITION,", "PERMS.PIPELINE_TRANSITION,\n    PERMS.PIPELINE_ASSIGN,") } }, /matriz V/);
rejected("CRM activo rechazado", { env: { CRM_PIPELINE_RUNTIME_MODE: "READ_ONLY" } }, /DISABLED/);
rejected("HYBRID rechazado", { env: { MT01B_AUTH_MODE: "HYBRID" } }, /HYBRID/);
process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
