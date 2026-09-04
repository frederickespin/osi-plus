import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const read = (path) => readFileSync(path, "utf8");
const invariant = (condition, message) => { if (!condition) throw new Error(`V17_COMMERCIAL_CRM_GUARD:${message}`); };

const migrations = readdirSync(join("prisma", "migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory() && /^\d/.test(entry.name));
invariant((migrations.length === 22 || (migrations.length === 23 && migrations.some((entry) => entry.name === "20260904010000_v17_services_tenant_first")) || (migrations.length === 24 && migrations.some((entry) => entry.name === "20260904010000_v17_services_tenant_first") && migrations.some((entry) => entry.name === "20260905010000_v17_survey_foundation"))) && migrations.some((entry) => entry.name === "20260831010000_v17_crm_icp_foundation"), `cadena canónica o extensión Servicios/Survey inválida; existen ${migrations.length}`);

const catalog = read("src/hub/appCatalog.ts");
invariant(/appId: "commercial-crm"[\s\S]{0,350}route: "\/commercial"[\s\S]{0,150}routeAliases: \["\/crm", "\/sales\/pipeline"\]/.test(catalog), "rutas canónicas/aliases ausentes");
invariant(/appId: "commercial-crm"[\s\S]{0,500}requiredPermissions: \["pipeline:view"\][\s\S]{0,100}permissionMode: "ALL"[\s\S]{0,100}requiresExplicitPermissions: true[\s\S]{0,100}baselineRoles: \["A", "V"\]/.test(catalog), "autoridad explícita A/V + pipeline:view ausente");

const access = read("src/hub/hubAccess.ts");
invariant(/application\.requiresExplicitPermissions[\s\S]{0,150}PERMISSION_MISSING/.test(access), "rol baseline no puede sustituir permiso explícito");

const app = read("src/App.tsx");
const routeAccess = read("src/hub/hubRouteAccess.ts");
const hub = read("src/hub/HubWorkspace.tsx");
invariant(/const HubWorkspace = lazy\(\(\) => import\('@\/hub\/HubWorkspace'\)\)/.test(app), "HubWorkspace no es lazy");
const routeDecisionIndex = app.indexOf("routeState.status === 'DENIED' || !routeDecision.allowed");
const hubRenderIndex = app.indexOf("<HubWorkspace");
invariant(routeDecisionIndex >= 0 && hubRenderIndex > routeDecisionIndex, "guardia de ruta no precede carga Hub/CRM");
invariant(/validateLegacySession\(session, controller\.signal\)\.then[\s\S]*decision\.allowed \? 'READY' : 'DENIED'[\s\S]*accessContext: validatedAccessContext/.test(app), "navegación no revalida autoridad abortable antes del lazy");
invariant(/activeNavigation\.current\?\.controller\.abort\(\)[\s\S]*const fence = \+\+navigationFence\.current[\s\S]*controller\.signal\.aborted \|\| fence !== navigationFence\.current/.test(app), "navegación perdió abort o fencing");
invariant(/findHubApplicationByRoute\(normalizedPath\)[\s\S]*evaluateHubAccess\(application, context\)/.test(routeAccess), "rutas y tarjetas no comparten decisión canónica");
invariant(!/evaluateHubAccess\s*\(\s*selected|!decision\?\.allowed|addEventListener\(["']popstate|history\.pushState/.test(hub), "autorización o routing regresó al chunk lazy");
invariant(/lazy\(\(\) => import\("@\/commercial-crm\/AdvancedErpShell"\)\)/.test(hub), "ERP Comercial no es lazy");
invariant(/selected\?\.appId === "commercial-crm" && crmReadEnabled/.test(hub), "compuerta CRM ausente después de autorizar la ruta");

const mode = read("src/crm-relational/clientMode.ts");
for (const signature of ['LOCAL_ONLY: "LOCAL_ONLY"', 'READ_ONLY: "READ_ONLY"', 'PREVIEW_REHEARSAL: V17_COMMERCIAL_CRM_PREVIEW_MODE', "VITE_CRM_PIPELINE_CLIENT_MODE", "VITE_CRM_PIPELINE_READ_MODE", "isRelationalCrmReadEnabled"]) invariant(mode.includes(signature), `compuerta incompleta: ${signature}`);
invariant(!/(?:trim|toUpperCase|toLowerCase)\s*\(/.test(mode), "compuertas normalizan valores inválidos");
invariant(/vercelMarker \|\| runtime\.vercelEnvironment != null \|\| runtime\.gitBranch != null \|\| !isLoopback/.test(mode), "compuerta no rechaza Vercel/remoto");

const adapter = read("src/crm-relational/readApi.ts");
for (const endpoint of ["/pipeline-cases?", "/pipeline-cases/", "/pipeline-summary"]) invariant(adapter.includes(endpoint), `contrato GET ausente: ${endpoint}`);
invariant(/method: "GET"/.test(adapter) && !/method: "(?:POST|PATCH|PUT|DELETE)"/.test(adapter), "adaptador no es exclusivamente GET");
invariant(/AbortController/.test(adapter) && /cache: "no-store"/.test(adapter), "cancelación/no-store ausentes");
invariant(/cacheControl\.includes\("private"\)[\s\S]*cacheControl\.includes\("no-store"\)[\s\S]*vary\.includes\("authorization"\)[\s\S]*vary\.includes\("origin"\)[\s\S]*vary\.includes\("\*"\)/.test(adapter), "headers privados no se validan");
invariant(/response\.status !== 200/.test(adapter) && /MAX_RESPONSE_BYTES/.test(adapter) && /credentials: "omit"/.test(adapter), "status/tamaño/cookies no fallan cerrado");
invariant(/membershipRefProvider[\s\S]*getMembershipRef[\s\S]*X-OSI-Membership-Ref/.test(adapter)
  && /MT01B_MEMBERSHIP_SELECTION_INVALID/.test(adapter), "adaptador no transporta selección pública o no falla cerrado");
invariant(!/getToken|localStorage|sessionStorage|indexedDB|Idempotency-Key/.test(adapter), "adaptador obtiene token/autoridad desde storage o prepara mutación");
invariant(!/\bclientName\b|\bcaseNumber\b/.test(adapter) && /"caseRef", "caseCode", "client"/.test(adapter),
  "DTO público debe usar caseRef, caseCode y Client relacional sin aliases legacy");

const canonicalRead = read("api/_lib/crmPipelineRead.js");
invariant(!/\bclientName\b|\bcaseNumber\b/.test(canonicalRead), "backend de lectura reintrodujo autoridad legacy");
invariant(/resolveCrmPipelineReadScope/.test(canonicalRead) && /where:\s*\{\s*\.\.\.scope,\s*publicRef\s*\}/.test(canonicalRead) && /client:\s*\{\s*is:\s*\{\s*name:/.test(canonicalRead),
  "resolución de caso o búsqueda de Client no es tenant-first relacional");

const inbox = read("src/commercial-crm/CommercialInboxModule.tsx");
const caseDetail = read("src/commercial-crm/CommercialCaseDetail.tsx");
const erpShell = read("src/commercial-crm/AdvancedErpShell.tsx");
const presentation = read("src/commercial-crm/presentation.ts");
invariant(/Inbox Comercial/.test(inbox) && /Disponible en una fase posterior/.test(caseDetail), "presentación read-only incompleta");
invariant(/APPROVED[\s\S]*legacy congelado/.test(presentation) && /OPS_HANDOFF[\s\S]*terminal/.test(presentation)
  && /Legacy congelado/.test(caseDetail) && /Estado terminal/.test(caseDetail), "semántica terminal/legacy ausente");
for (const [path, source] of [["ERP shell", erpShell], ["Inbox", inbox], ["Ficha", caseDetail]]) {
  invariant(!/localStorage|sessionStorage|indexedDB|useCasesStore|caseBridge|LeadLite|offline.?queue/i.test(source), `autoridad local o prototipo importado en ${path}`);
  invariant(!/assign-owner|unassign-owner|allowed-transitions|\/transition|method:\s*"POST"/i.test(source), `mutación conectada a ${path}`);
  invariant(!/\bclientId\b|\btenantId\b|\bownerId\b|\bownerUserId\b|\bmembershipId\b/.test(source), `ID interno expuesto en ${path}`);
  invariant(!/dangerouslySetInnerHTML/.test(source), `HTML editable inseguro en ${path}`);
}
invariant(/lazy\(\(\) => import\("\.\/CommercialCaseDetail"\)\)/.test(inbox), "Ficha no está separada en un chunk lazy");
invariant(/aria-label={`Seleccionar caso/.test(inbox) && /aria-pressed={selected}/.test(inbox)
  && /Ficha del caso/.test(inbox) && /Volver al Inbox/.test(caseDetail), "selección master-detail o navegación canónica de la Ficha ausente");
invariant(/commercial-case-summary/.test(inbox) && /commercial-full-case-workspace/.test(inbox)
  && /Sin cotización/.test(inbox) && /Sin comunicación registrada/.test(inbox) && /Pendiente de definir/.test(inbox),
  "resumen compacto inventa autoridad o no separa la Ficha completa");
invariant(!/Abrir ficha|Volver al Pipeline/.test(inbox + caseDetail), "etiquetas históricas de navegación reaparecieron");
invariant(/role="tablist"/.test(caseDetail) && /Survey en integración/.test(caseDetail) && /Cotización en integración/.test(caseDetail), "Ficha no conserva tabs avanzados como integración explícita");
invariant(!/surveyApi|quoteApi|\/api\/survey|\/api\/quote|SalesQuoteWorkspace/.test(caseDetail), "tabs futuros conectaron autoridad inexistente");
for (const section of ["General", "Administración", "Comercial", "Coordinación", "Operaciones", "Campo y Taller", "Logística", "Recursos Humanos"]) {
  invariant(erpShell.includes(section), `shell ERP avanzado omite ${section}`);
}
invariant(/functional: true/.test(erpShell) && /functional: false/.test(erpShell) && /En integración/.test(erpShell), "shell ERP avanzado no distingue Comercial de áreas en integración");

const packageJson = JSON.parse(read("package.json"));
invariant(packageJson.scripts?.["test:v17-commercial-crm:browser"] === "playwright test -c playwright.v17-commercial-crm.config.ts", "suite browser no está congelada");
invariant(packageJson.scripts?.["typecheck:v17-commercial-crm"] === "tsc -p tsconfig.v17-commercial-crm.json --pretty false", "typecheck focalizado ausente");
const ci = read(".github/workflows/ci.yml");
for (const command of ["npm run typecheck:v17-commercial-crm", "npm run test:v17-commercial-crm:browser", "node scripts/validate-v17-commercial-crm-guard.mjs"]) {
  invariant(ci.includes(command), `CI no exige: ${command}`);
}
const vite = read("vite.config.ts");
invariant(/base:\s*["']\/["']/.test(vite), "assets deben usar raíz absoluta para deep links anidados");
console.log(JSON.stringify({ ok: true, migrations: 22, routes: 3, methods: ["GET", "HEAD", "OPTIONS"], authorizationBoundary: "PRE_LAZY" }));
