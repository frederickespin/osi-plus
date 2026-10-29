import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { readFrozenCatalog, validateCommercialCatalog, validateHubCatalog } from "./hub-catalog-contract.mjs";
import { validateV17HubGuard } from "./validate-v17-hub-guard.mjs";
import { validateV17CommercialCrmGuard } from "./validate-v17-commercial-crm-guard.mjs";
import { validatePilotFrontendAuthority } from "./validate-v17-production-pilot-gates.mjs";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const catalog = read("src/hub/appCatalog.ts");
const results = [];
function replace(source, before, after) {
  assert.ok(source.includes(before), `mutación vacía: ${before}`);
  const changed = source.replaceAll(before, after);
  assert.ok(changed !== source, "la mutación debe modificar el contrato");
  return changed;
}
function positive(name, action) { action(); results.push({ name, kind: "positive" }); }
function negative(name, action, expected) { assert.throws(action, expected, name); results.push({ name, kind: "negative" }); }
function sourceNegative(name, guard, path, before, after, expected) {
  negative(name, () => guard({ root, overrides: new Map([[path, replace(read(path), before, after)]]) }), expected);
}

positive("catálogo completo vigente", () => {
  const actual = validateHubCatalog(catalog);
  assert.equal(actual.applications.length, 10);
  assert.equal(actual.suites.length, 1);
  assert.equal(actual.routes.length, 15);
  assert.equal(validateCommercialCatalog(catalog).appId, "commercial-crm");
});
positive("formato del catálogo no concede autoridad", () => {
  const parsed = ts.createSourceFile("appCatalog.ts", catalog, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const formatted = ts.createPrinter({ newLine: ts.NewLineKind.CarriageReturnLineFeed }).printFile(parsed);
  assert.deepEqual(validateHubCatalog(formatted), validateHubCatalog(catalog));
});
positive("Hub actual", () => assert.equal(validateV17HubGuard({ root }).ok, true));
positive("Comercial actual y cinco pestañas consolidadas", () => assert.equal(validateV17CommercialCrmGuard({ root }).functionalTabs, 5));

for (const [name, before, after, expected] of [
  ["aplicación no clasificada", 'appId: "coordination"', 'appId: "unknown-application"', /inventario de aplicaciones/],
  ["aplicación duplicada", 'appId: "coordination"', 'appId: "commercial-crm"', /inventario de aplicaciones/],
  ["propiedad duplicada", 'appId: "coordination"', 'appId: "coordination", appId: "operations"', /propiedad duplicada/],
  ["spread dinámico", 'appId: "coordination"', '...untrusted, appId: "coordination"', /dinámica o spread/],
  ["propiedad calculada", 'appId: "coordination"', '["appId"]: "coordination"', /dinámica o spread/],
  ["autoridad dinámica", 'requiredPermissions: ["pipeline:view"]', 'requiredPermissions: injectedPermissions', /dinámica o spread/],
  ["alias comercial omitido", '"/crm", "/sales/pipeline", "/commercial/relationships"', '"/crm", "/sales/pipeline"', /rutas o alias alterados/],
  ["alias externo", 'routeAliases: ["/survey"]', 'routeAliases: ["https://example.test/survey"]', /rutas o alias alterados/],
  ["capacidad Survey incorrecta", 'requiredPermissions: ["survey:assignment:view"]', 'requiredPermissions: ["pipeline:view"]', /autoridad alterada:osi-survey/],
  ["permiso explícito eliminado", 'requiresExplicitPermissions: true', 'requiresExplicitPermissions: false', /autoridad alterada:commercial-crm/],
  ["rol comercial ampliado", 'baselineRoles: ["A", "V"]', 'baselineRoles: ["A", "V", "N"]', /autoridad alterada:commercial-crm/],
  ["Mobile sin suite canónica", 'route: "/mobile"', 'route: "/mobile-unsafe"', /suite Mobile no canónica/],
  ["calculadora con destino alterado", 'externalHref: "https://ip-suite-inventario-empaquee.vercel.app/empaque/index.html"', 'externalHref: "https://example.test/collect"', /destino externo alterado/],
  ["carga eager", 'lazy: true,', 'lazy: false,', /contrato lazy/],
]) negative(name, () => validateHubCatalog(replace(catalog, before, after)), expected);
negative("declaración duplicada no se decide por primera coincidencia", () => readFrozenCatalog(`${catalog}\nconst HUB_APPLICATIONS = Object.freeze([]);`, "HUB_APPLICATIONS"), /declarativo y único/);
negative("comentario no sustituye catálogo", () => readFrozenCatalog("// const HUB_APPLICATIONS = Object.freeze([]);", "HUB_APPLICATIONS"), /declarativo y único/);
negative("Comercial mantiene los alias incluso en validación focal", () => validateCommercialCatalog(replace(catalog, '"/crm", "/sales/pipeline", "/commercial/relationships"', '"/crm"')), /rutas CRM equivalentes/);

for (const args of [
  ["DISABLED sigue siendo predeterminado", "src/hub/hubMode.ts", 'raw === undefined || raw === OSI_HUB_MODES.DISABLED', 'raw === OSI_HUB_MODES.DISABLED', /DISABLED is not the default/],
  ["gate local excluye Vercel", "src/hub/hubMode.ts", 'key.startsWith("VERCEL")', 'false', /every VERCEL/],
  ["Hub sigue lazy", "src/App.tsx", "const HubWorkspace = lazy(() => import('@/hub/HubWorkspace'))", "const HubWorkspace = unsafeEagerHub", /Hub is not lazy/],
  ["autorización precede Hub", "src/App.tsx", "routeState.status === 'DENIED' || !routeDecision.allowed", "false", /before route authorization/],
  ["Production mantiene mutaciones deshabilitadas", "api/_lib/v17CommercialCrmProductionAuth.js", "CRM_PIPELINE_MUTATION_MODES.DISABLED", "CRM_PIPELINE_MUTATION_MODES.LOCAL_ONLY", /CRM mutations disabled/],
  ["disponibilidad sólo restringe catálogo autorizado", "src/hub/hubAvailability.ts", "authorizedApplications.filter((application) => availability[application.appId] === true)", "HUB_APPLICATIONS", /only narrow the authorized catalog/],
  ["menú ERP usa catálogo disponible", "src/hub/HubWorkspace.tsx", "navigationApplications={rootAvailable}", "navigationApplications={HUB_APPLICATIONS}", /available authorized catalog/],
  ["la calculadora aísla opener", "src/hub/ExternalApplication.tsx", 'rel="noopener noreferrer"', 'rel="external"', /external application isolation/],
  ["la calculadora no envía referente", "src/hub/ExternalApplication.tsx", 'referrerPolicy="no-referrer"', 'referrerPolicy="unsafe-url"', /external application isolation/],
]) sourceNegative(args[0], validateV17HubGuard, ...args.slice(1));
for (const [name, extra, expected] of [
  ["Hub no lee autoridad del navegador", '\nlocalStorage.getItem("role");', /browser authority/],
  ["Hub no llama APIs", '\nfetch("/api/users");', /calls an API/],
  ["Hub no introduce HTML inseguro", '\nconst invalid = { dangerouslySetInnerHTML: value };', /unsafe rendering/],
]) negative(name, () => validateV17HubGuard({ root, overrides: new Map([["src/hub/OsiPlusMobileHub.tsx", read("src/hub/OsiPlusMobileHub.tsx") + extra]]) }), expected);

for (const args of [
  ["permisos explícitos no se sustituyen por rol", "src/hub/hubAccess.ts", "application.requiresExplicitPermissions", "false", /rol baseline no puede sustituir/],
  ["cambio de navegación cancela solicitud anterior", "src/App.tsx", "activeNavigation.current?.controller.abort()", "activeNavigation.current?.controller", /abort o fencing/],
  ["adaptador sigue GET", "src/crm-relational/readApi.ts", 'method: "GET"', 'method: "POST"', /exclusivamente GET/],
  ["respuesta de lectura privada", "src/crm-relational/readApi.ts", 'cacheControl.includes("private")', 'true', /headers privados/],
  ["respuesta de lectura no se almacena", "src/crm-relational/readApi.ts", 'cache: "no-store"', 'cache: "force-cache"', /no-store ausentes/],
  ["tenant-first no busca sólo por referencia", "api/_lib/crmPipelineRead.js", "where: { ...scope, publicRef }", "where: { publicRef }", /tenant-first relacional/],
  ["Ficha permanece lazy", "src/commercial-crm/CommercialInboxModule.tsx", 'lazy(() => import("./CommercialCaseDetail"))', 'loadImmediately("./CommercialCaseDetail")', /Ficha no está separada/],
  ["pestañas mantienen orden canónico", "src/commercial-crm/CommercialCaseDetail.tsx", '["SURVEY", "Survey", ClipboardCheck]', '["ACTIVITY", "Actividad", ClipboardCheck]', /orden de tabs/],
  ["cambio de tenant limpia estado", "src/App.tsx", "clearTenantScopedState", "keepTenantScopedState", /cambio de tenant/],
  ["menú ERP conserva navegación canónica", "src/commercial-crm/AdvancedErpShell.tsx", "onNavigate(application.route)", 'onNavigate("/unknown")', /menú ERP no usa/],
  ["menú ERP conserva entrada Mobile", "src/commercial-crm/AdvancedErpShell.tsx", 'onNavigate("/mobile")', 'onNavigate("/unknown")', /acceso autorizado a Mobile/],
]) sourceNegative(args[0], validateV17CommercialCrmGuard, ...args.slice(1));
for (const [name, extra, expected] of [
  ["Inbox no expone identificador interno", '\nconst tenantId = "internal";', /ID interno expuesto/],
  ["Inbox no llama transición histórica", '\nfetch("/transition", { method: "POST" });', /mutación conectada/],
]) negative(name, () => validateV17CommercialCrmGuard({ root, overrides: new Map([["src/commercial-crm/CommercialInboxModule.tsx", read("src/commercial-crm/CommercialInboxModule.tsx") + extra]]) }), expected);

const mutationPath = "src/crm-relational/mutationApi.ts";
const mutationSource = read(mutationPath);
positive("selector público sigue separado de autoridad del piloto", () => {
  validatePilotFrontendAuthority(mutationPath, mutationSource);
  validatePilotFrontendAuthority("src/admin-tenant/adminApi.ts", read("src/admin-tenant/adminApi.ts"));
});
for (const [name, before, after, expected] of [
  ["header no puede elegir tenant", '"X-OSI-Membership-Ref": membershipRef', '"X-OSI-Tenant": membershipRef', /headers de autoridad no canónicos/],
  ["header no puede elegir rol", '"X-OSI-Membership-Ref": membershipRef', '"X-OSI-Role": "A"', /headers de autoridad no canónicos/],
  ["selector no admite referencia inyectada", '"X-OSI-Membership-Ref": membershipRef', '"X-OSI-Membership-Ref": "injected"', /autoridad frontend falsificable/],
  ["selector no admite propiedad calculada", '"X-OSI-Membership-Ref": membershipRef', '["X-OSI-Membership-Ref"]: membershipRef', /headers de autoridad no canónicos/],
  ["selector exige proveedor canónico", "const membershipRef = this.membershipRefProvider()", 'const membershipRef = "injected"', /no usa proveedor canónico/],
  ["selector vacío sigue siendo error", "if (!membershipRef) throw", "if (false) throw", /no falla cerrado/],
  ["default del selector no se inyecta", "membershipRefProvider: () => string | null = getMembershipRef", 'membershipRefProvider: () => string | null = () => "injected"', /no usa proveedor canónico/],
  ["constructor conserva proveedor", "this.membershipRefProvider = membershipRefProvider", 'this.membershipRefProvider = () => "injected"', /constructor no conserva proveedor canónico/],
  ["selección no sustituye bearer", 'Authorization: `Bearer ${token}`, ', '', /sin bearer en el mismo objeto/],
  ["constructor rechaza escritura anidada", "this.membershipRefProvider = membershipRefProvider;", 'this.membershipRefProvider = membershipRefProvider; if (true) this.membershipRefProvider = () => "injected";', /constructor contiene escrituras/],
  ["constructor rechaza escritura calculada", "this.membershipRefProvider = membershipRefProvider;", 'this.membershipRefProvider = membershipRefProvider; this["membershipRefProvider"] = () => "injected";', /constructor contiene escrituras/],
  ["spread no reemplaza headers validados", "body: JSON.stringify(body),", "body: JSON.stringify(body), ...overrideOptions,", /opciones de fetch dinámicas/],
  ["header duplicado no reemplaza bearer", "body: JSON.stringify(body),", "body: JSON.stringify(body), headers: {},", /opciones de fetch dinámicas/],
  ["header calculado no reemplaza bearer", "body: JSON.stringify(body),", 'body: JSON.stringify(body), ["headers"]: {},', /opciones de fetch dinámicas/],
  ["fetch permanece en destino interno", "this.fetchImpl(`${API}${path}`", 'this.fetchImpl("https://example.invalid/collect"', /destino fetch no canónico/],
  ["constante API permanece interna", 'const API = "/api/crm";', 'const API = "https://example.invalid/collect";', /destino API no canónico/],
]) negative(name, () => validatePilotFrontendAuthority(mutationPath, replace(mutationSource, before, after)), expected);
negative("selector no autoriza header en UI", () => validatePilotFrontendAuthority("src/hub/HubWorkspace.tsx", mutationSource), /autoridad frontend falsificable/);
negative("objeto extra no amplía excepción", () => validatePilotFrontendAuthority(mutationPath, `${mutationSource}\nconst injected = { "X-OSI-Membership-Ref": membershipRef };`), /autoridad frontend falsificable/);
negative("manifiesto permanece servidor", () => validatePilotFrontendAuthority(mutationPath, `${mutationSource}\nconst unsafe = "V17_PRODUCTION_PILOT_ACTIVATION_MANIFEST";`), /server-only/);

console.log(JSON.stringify({ ok: true, assertions: results.length, positive: results.filter(({ kind }) => kind === "positive").length, negative: results.filter(({ kind }) => kind === "negative").length, results }, null, 2));
