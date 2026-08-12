import { readFileSync } from "node:fs";
import { validateCrm01b3aGuard } from "./validate-crm-01b3a-guard.mjs";

const results = [];
function check(name, condition) { results.push({ name, passed: Boolean(condition) }); if (!condition) throw new Error(name); }
function rejected(name, options, pattern) {
  let error; try { validateCrm01b3aGuard(options); } catch (caught) { error = caught; }
  check(name, pattern.test(error?.message || ""));
}
const adapter = readFileSync("api/_lib/pipelineCaseMutationHttp.js", "utf8");
const transition = readFileSync("api/crm/pipeline-cases/[id]/transition.js", "utf8");
check("baseline CRM-01B3A", validateCrm01b3aGuard().ok);
rejected("LOCAL_ONLY en CI rechazado", { env: { CRM_PIPELINE_MUTATION_MODE: "LOCAL_ONLY" } }, /LOCAL_ONLY/);
rejected("variable en workflow rechazada", { overrides: { ".github/workflows/ci.yml": `${readFileSync(".github/workflows/ci.yml", "utf8")}\nenv: CRM_PIPELINE_MUTATION_MODE=LOCAL_ONLY` } }, /configura/);
rejected("default activo rechazado", { overrides: { "api/_lib/pipelineCaseMutationHttp.js": adapter.replace("CRM_PIPELINE_MUTATION_MODES.DISABLED : configured", "CRM_PIPELINE_MUTATION_MODES.LOCAL_ONLY : configured") } }, /predeterminado/);
rejected("normalización de modo rechazada", { overrides: { "api/_lib/pipelineCaseMutationHttp.js": adapter.replace("const configured = env.CRM_PIPELINE_MUTATION_MODE;", "const configured = env.CRM_PIPELINE_MUTATION_MODE?.trim();") } }, /normalizarse/);
rejected("Vercel bypass rechazado", { overrides: { "api/_lib/pipelineCaseMutationHttp.js": adapter.replace('key === "VERCEL" || key.startsWith("VERCEL_")', 'key === "NOT_VERCEL"') } }, /Vercel/);
rejected("lectura coordinada obligatoria", { overrides: { "api/_lib/pipelineCaseMutationHttp.js": adapter.replace("const readMode = resolveCrmPipelineRuntimeMode(env);", "const readMode = CRM_PIPELINE_RUNTIME_MODES.READ_ONLY;") } }, /resolveCrmPipelineRuntimeMode/);
rejected("CORS wildcard rechazado", { overrides: { "api/_lib/pipelineCaseMutationHttp.js": `${adapter}\nres.setHeader("Access-Control-Allow-Origin", "*");` } }, /wildcard/);
rejected("header x-osi rechazado", { overrides: { "api/_lib/pipelineCaseMutationHttp.js": adapter.replace('"Authorization", "Content-Type", "Idempotency-Key"', '"Authorization", "Content-Type", "Idempotency-Key", "x-osi-role"') } }, /x-osi/);
rejected("detección raw idempotency obligatoria", { overrides: { "api/_lib/pipelineCaseMutationHttp.js": adapter.replace('rawHeaderCount(req, "idempotency-key")', 'null /* duplicate guard removed */') } }, /rawHeaders/);
rejected("auth antes de gate rechazado", { overrides: { "api/_lib/pipelineCaseMutationHttp.js": adapter.replace("requireCrmPipelineMutationsLocal(env);", "resolveContext(req); requireCrmPipelineMutationsLocal(env);") } }, /orden/);
rejected("SQL en handler rechazado", { overrides: { "api/crm/pipeline-cases/[id]/transition.js": `${transition}\nawait prisma.pipelineCase.update({});` } }, /SQL|escritura/);
rejected("autoasignación rechazada", { overrides: { "api/_lib/pipelineCaseMutationHttp.js": `${adapter}\nconst ownerMembershipId = context.membershipId; // autoAssign` } }, /autoasignación/);
rejected("PATCH rechazado", { overrides: { "api/crm/pipeline-cases/[id]/transition.js": `${transition}\nif (req.method === "PATCH") {}` } }, /alternativo/);
rejected("endpoint nuevo rechazado", { extraSources: { "api/crm/pipeline-cases/[id]/mutate.js": "export default async function handler() {}" } }, /endpoints no autorizados/);
rejected("frontend consumidor rechazado", { extraSources: { "src/fake-crm-mutation.ts": 'fetch("/api/crm/pipeline-cases/x/assign-owner")' } }, /frontend/);
rejected("HYBRID rechazado", { env: { MT01B_AUTH_MODE: "HYBRID" } }, /HYBRID/);
rejected("tenant switch rechazado", { env: { MT01B_TENANT_SWITCH_ENABLED: "true" } }, /tenant switch/);
rejected("cliente V2 rechazado", { env: { VITE_MT01B2_CLIENT_ENABLED: "true" } }, /cliente V2/);
process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
