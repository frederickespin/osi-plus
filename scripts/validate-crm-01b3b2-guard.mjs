import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const read = (path) => readFileSync(path, "utf8");
const invariant = (condition, message) => { if (!condition) throw new Error(`CRM01B3B2_GUARD:${message}`); };
function files(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
    ? files(join(root, entry.name)) : [join(root, entry.name)]);
}

const migrationNames = readdirSync("prisma/migrations", { withFileTypes: true }).filter((item) => item.isDirectory()).map((item) => item.name);
invariant(migrationNames.length === 16, "se exigen exactamente 16 migraciones");
invariant(!migrationNames.some((name) => /^20260801016000|migration.?17/i.test(name)), "migración 17 prohibida");

const clientRoot = "src/crm-relational";
const clientFiles = files(clientRoot).filter((path) => /\.(?:ts|tsx)$/.test(path));
const sources = new Map(clientFiles.map((path) => [relative(".", path).replaceAll("\\", "/"), read(path)]));
const negativeCase = process.env.CRM01B3B2_GUARD_NEGATIVE_CASE;
if (negativeCase === "direct-env") sources.set("src/crm-relational/RelationalPipelineModule.tsx", `${sources.get("src/crm-relational/RelationalPipelineModule.tsx")}\nconst unsafe = import.meta.env.VITE_CRM_PIPELINE_CLIENT_MODE;`);
if (negativeCase === "storage") sources.set("src/crm-relational/RelationalPipelineModule.tsx", `${sources.get("src/crm-relational/RelationalPipelineModule.tsx")}\nlocalStorage.setItem("crm", "unsafe");`);
if (negativeCase === "owner-field") sources.set("src/crm-relational/RelationalPipelineModule.tsx", `${sources.get("src/crm-relational/RelationalPipelineModule.tsx")}\nconst ownerMembershipId = "free-input";`);
if (negativeCase === "cors") sources.set("src/crm-relational/api.ts", `${sources.get("src/crm-relational/api.ts")}\nconst cors = "Access-Control-Allow-Origin: *";`);
const modeReaders = [...sources.entries()].filter(([, source]) => /VITE_CRM_PIPELINE_CLIENT_MODE/.test(source));
invariant(modeReaders.length === 1 && modeReaders[0][0] === "src/crm-relational/clientMode.ts", "la variable sólo puede leerse en el resolver");
const gate = sources.get("src/crm-relational/clientMode.ts") || "";
invariant(/raw === undefined[\s\S]*DISABLED/.test(gate), "DISABLED debe ser predeterminado");
invariant(!/(?:trim|toUpperCase|toLowerCase)\s*\(/.test(gate), "la compuerta no puede normalizar valores inválidos");
invariant(!/PRODUCTION_(?:READ|WRITE)|TENANT_(?:READ|WRITE)/.test(gate), "modo productivo frontend prohibido");

for (const [path, source] of sources) {
  invariant(!/localStorage|sessionStorage|indexedDB/.test(source), `${path} no puede persistir CRM relacional`);
  invariant(!/\bownerId\b|\btenantId\b|\bownerUserId\b|\buserId\b/.test(source), `${path} no puede usar autoridad interna`);
  invariant(!/CRM_PIPELINE_ACTIVATION_BATCH|COMMERCIAL_TENANCY_ACTIVATION_BATCH/.test(source), `${path} no puede incluir batches backend`);
  invariant(!/(?:from\s+["'][^"']*sales\.types|\b(?:loadLeads|saveLeads|upsertLead)\s*\(|osi-plus\.leads)/.test(source), `${path} no puede mapear el prototipo`);
  invariant(!/dangerouslySetInnerHTML/.test(source), `${path} no puede renderizar HTML editable`);
  invariant(!/Access-Control-Allow-Origin/.test(source), `${path} no puede introducir CORS global`);
}

const api = sources.get("src/crm-relational/api.ts") || "";
invariant(/crypto\.randomUUID\(\)/.test(api), "Idempotency-Key debe usar randomUUID");
invariant(/CRM_PIPELINE_COMMAND_IN_PROGRESS/.test(api) && /automaticRetryUsed/.test(api), "falta retry único de contención");
invariant(!/CRM_PIPELINE_VERSION_CONFLICT[\s\S]{0,200}(?:setTimeout|mutate\()/.test(api), "version conflict no puede reintentarse automáticamente");
invariant(!/CRM_PIPELINE_IDEMPOTENCY_CONFLICT[\s\S]{0,200}(?:setTimeout|mutate\()/.test(api), "idempotency conflict no puede reintentarse automáticamente");
invariant(/credentials:\s*"same-origin"/.test(api), "contrato de credenciales no congelado");
invariant(/AbortController/.test(api) && /cache:\s*"no-store"/.test(api), "cancelación/no-store obligatorios");
invariant(/assertJsonResponse\(response\)/.test(api), "Content-Type JSON debe validarse antes de parsear");
invariant(/SAFE_RETRY_AFTER_MS/.test(api), "retryAfterMs inválido debe usar fallback seguro");
const module = sources.get("src/crm-relational/RelationalPipelineModule.tsx") || "";
invariant(/commandInFlight\.current/.test(module), "las mutaciones deben bloquear doble envío sin depender del render");
invariant(/activeIntent\.current\?\.cancel\(\)/.test(module), "la intención activa debe cancelarse al cerrar o desmontar");
invariant(/AlertDialogTitle>Confirmar cambio de estado/.test(module), "las mutaciones requieren confirmación accesible");
invariant(!/ownerMembershipId|ownerUserId|tenantId/.test(module), "la UI no puede aceptar IDs internos libres");

const app = read("src/App.tsx");
invariant(/lazy\(\(\)\s*=>\s*\n?\s*import\('@\/crm-relational\/RelationalPipelineModule'\)/.test(app), "el módulo debe ser dinámico");
invariant(/isRelationalCrmClientEnabled/.test(app), "App debe respetar la compuerta");
invariant(!/const\s+CRM_PIPELINE_CLIENT\s*=/.test(app), "la compuerta no puede congelarse en caché global");
const salesStore = read("src/lib/salesStore.ts");
invariant(/const LS_LEADS = "osi-plus\.leads"/.test(salesStore), "LeadLite debe permanecer intacto");

console.log(`CRM-01B3B2 guard: PASS (${clientFiles.length} archivos, ${migrationNames.length} migraciones)`);
