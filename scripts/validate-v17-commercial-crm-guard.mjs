import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const BASE = "ab224a79e4deafa6882e353b1025720058630ca2";
const read = (path) => readFileSync(path, "utf8");
const invariant = (condition, message) => { if (!condition) throw new Error(`V17_COMMERCIAL_CRM_GUARD:${message}`); };

const migrations = readdirSync(join("prisma", "migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory() && /^\d/.test(entry.name));
invariant(migrations.length === 17, `se esperaban 17 migraciones, existen ${migrations.length}`);
const changed = execFileSync("git", ["diff", "--name-only", BASE, "--"], { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean);
invariant(!changed.some((path) => path.startsWith("api/") || path.startsWith("prisma/") || path.startsWith("src/data/")), "backend, Prisma, migraciones o fixtures canónicos modificados");

const catalog = read("src/hub/appCatalog.ts");
invariant(/appId: "commercial-crm"[\s\S]{0,350}route: "\/commercial"[\s\S]{0,150}routeAliases: \["\/crm", "\/sales\/pipeline"\]/.test(catalog), "rutas canónicas/aliases ausentes");
invariant(/appId: "commercial-crm"[\s\S]{0,500}requiredPermissions: \["pipeline:view"\][\s\S]{0,100}permissionMode: "ALL"[\s\S]{0,100}requiresExplicitPermissions: true[\s\S]{0,100}baselineRoles: \["A", "V"\]/.test(catalog), "autoridad explícita A/V + pipeline:view ausente");

const access = read("src/hub/hubAccess.ts");
invariant(/application\.requiresExplicitPermissions[\s\S]{0,150}PERMISSION_MISSING/.test(access), "rol baseline no puede sustituir permiso explícito");

const hub = read("src/hub/HubWorkspace.tsx");
invariant(/lazy\(\(\) => import\("@\/commercial-crm\/CommercialInboxModule"\)\)/.test(hub), "Inbox no es lazy");
invariant(/!decision\?\.allowed[\s\S]*commercial-crm" && crmReadEnabled/.test(hub), "guardia de ruta no precede carga CRM");

const mode = read("src/crm-relational/clientMode.ts");
for (const signature of ['LOCAL_ONLY: "LOCAL_ONLY"', 'READ_ONLY: "READ_ONLY"', "VITE_CRM_PIPELINE_CLIENT_MODE", "VITE_CRM_PIPELINE_READ_MODE", "isRelationalCrmReadEnabled"]) invariant(mode.includes(signature), `compuerta incompleta: ${signature}`);
invariant(!/(?:trim|toUpperCase|toLowerCase)\s*\(/.test(mode), "compuertas normalizan valores inválidos");
invariant(/vercelMarker \|\| !isLoopback/.test(mode), "compuerta no rechaza Vercel/remoto");

const adapter = read("src/crm-relational/readApi.ts");
for (const endpoint of ["/pipeline-cases?", "/pipeline-cases/", "/pipeline-summary"]) invariant(adapter.includes(endpoint), `contrato GET ausente: ${endpoint}`);
invariant(/method: "GET"/.test(adapter) && !/method: "(?:POST|PATCH|PUT|DELETE)"/.test(adapter), "adaptador no es exclusivamente GET");
invariant(/AbortController/.test(adapter) && /cache: "no-store"/.test(adapter), "cancelación/no-store ausentes");
invariant(/cacheControl\.includes\("private"\)[\s\S]*cacheControl\.includes\("no-store"\)[\s\S]*vary\.includes\("authorization"\)/.test(adapter), "headers privados no se validan");
invariant(/response\.status !== 200/.test(adapter) && /MAX_RESPONSE_BYTES/.test(adapter) && /credentials: "omit"/.test(adapter), "status/tamaño/cookies no fallan cerrado");
invariant(!/getToken|sessionStore|localStorage|sessionStorage|indexedDB|Idempotency-Key/.test(adapter), "adaptador obtiene autoridad desde storage o prepara mutación");

const inbox = read("src/commercial-crm/CommercialInboxModule.tsx");
invariant(/Inbox Comercial/.test(inbox) && /Disponible en una fase posterior/.test(inbox), "presentación read-only incompleta");
invariant(/APPROVED[\s\S]*legacy congelado/.test(inbox) && /OPS_HANDOFF[\s\S]*terminal/.test(inbox), "semántica terminal/legacy ausente");
invariant(!/localStorage|sessionStorage|indexedDB|useCasesStore|caseBridge|LeadLite|offline.?queue/i.test(inbox), "autoridad local o prototipo importado");
invariant(!/assign-owner|unassign-owner|allowed-transitions|\/transition|method:\s*"POST"/i.test(inbox), "mutación conectada al Inbox");
invariant(!/\bclientId\b|\btenantId\b|\bownerId\b|\bownerUserId\b|\bmembershipId\b/.test(inbox), "ID interno expuesto en presentación");
invariant(!/dangerouslySetInnerHTML/.test(inbox), "HTML editable inseguro");

const packageJson = JSON.parse(read("package.json"));
invariant(packageJson.scripts?.["test:v17-commercial-crm:browser"] === "playwright test -c playwright.v17-commercial-crm.config.ts", "suite browser no está congelada");
invariant(packageJson.scripts?.["typecheck:v17-commercial-crm"] === "tsc -p tsconfig.v17-commercial-crm.json --pretty false", "typecheck focalizado ausente");
const ci = read(".github/workflows/ci.yml");
for (const command of ["npm run typecheck:v17-commercial-crm", "npm run test:v17-commercial-crm:browser", "node scripts/validate-v17-commercial-crm-guard.mjs"]) {
  invariant(ci.includes(command), `CI no exige: ${command}`);
}
console.log(JSON.stringify({ ok: true, migrations: 17, routes: 3, methods: ["GET"], changedFiles: changed.length }));
