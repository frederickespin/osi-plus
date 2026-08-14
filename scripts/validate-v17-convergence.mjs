import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
let assertions = 0;
function check(label, condition) {
  if (!condition) throw new Error(`V17_CONVERGENCE_GUARD_FAILED: ${label}`);
  assertions += 1;
}
const read = (path) => readFileSync(resolve(root, path), "utf8");

const app = read("src/App.tsx");
const evaluator = read("src/evaluator-canonical/EvaluatorCanonicalModule.tsx");
const evaluatorApi = read("src/evaluator-canonical/api.ts");
const crmAdapter = read("src/crm-relational/modernPipelineAdapter.ts");
const routing = read("src/lib/moduleRouting.ts");
const env = read("src/lib/env.ts");
const migrations = readdirSync(resolve(root, "prisma/migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory());
const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split(/\r?\n/).filter(Boolean);

check("exactamente 16 migraciones", migrations.length === 16);
check("Evaluador cargado dinámicamente", app.includes("import('@/evaluator-canonical/EvaluatorCanonicalModule')"));
check("Evaluador no importa adapters heredados", !/evaluatorVisit(LocalStore|Resolver|Api)|evaluatorVisitMock/.test(evaluator));
check("Evaluador declara backend no disponible", evaluator.includes("Backend del Evaluador no disponible"));
check("Evaluador declara ausencia de mocks", evaluator.includes("No se consultaron mocks ni almacenamiento local"));
check("API Evaluador usa Bearer", evaluatorApi.includes("Authorization: `Bearer ${token}`"));
check("API Evaluador no usa x-osi-role", !evaluatorApi.includes("x-osi-role"));
check("API Evaluador no usa x-osi-userid", !evaluatorApi.includes("x-osi-userid"));
check("API Evaluador usa no-store", evaluatorApi.includes('cache: "no-store"'));
check("deep link pipeline canónico", routing.includes('"/sales/pipeline": "crm-pipeline"'));
check("deep link evaluador canónico", routing.includes('"/evaluator": "evaluator-app"'));
check("127.0.0.1 es desarrollo", env.includes('window.location.hostname === "127.0.0.1"'));
check("adaptador CRM sólo usa tipos públicos", crmAdapter.includes('from "@/crm-relational/types"'));
check("adaptador CRM no importa stores locales", !/^import[^\n]*(salesStore|caseBridge|useCasesStore|localStorage|\/cases)/m.test(crmAdapter));
check("owner ausente permanece sin asignar", crmAdapter.includes('"Sin asignar"'));
check("autoridad de versión permanece servidor", crmAdapter.includes('versionAuthority: "SERVER"'));
check("dominio puro de volumen presente", existsSync(resolve(root, "src/modules/evaluator-app/domain/evaluatorWeight.ts")));
check("dominio puro de acceso presente", existsSync(resolve(root, "src/modules/evaluator-app/domain/evaluatorAccessPolicy.ts")));
check("ningún .env sensible versionado", tracked.every((path) => path.endsWith(".env.example") || !/(^|\/)\.env(?:\.|$)/.test(path)));
check("sin credenciales privadas versionadas", tracked.every((path) => !/\.(pem|key|p12|pfx)$/i.test(path)));

process.stdout.write(JSON.stringify({ ok: true, assertions }, null, 2) + "\n");
