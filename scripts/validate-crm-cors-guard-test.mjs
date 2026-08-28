import { readFileSync } from "node:fs";
import { validateCrmCorsGuard } from "./validate-crm-cors-guard.mjs";

const read = (path) => readFileSync(path, "utf8");
const baseline = new Map([
  ["vercel.json", read("vercel.json")], ["api/_lib/http.js", read("api/_lib/http.js")],
  ["api/_lib/adminMembershipHttp.js", read("api/_lib/adminMembershipHttp.js")], ["api/_lib/authHttp.js", read("api/_lib/authHttp.js")],
  ["api/_lib/authOrigin.js", read("api/_lib/authOrigin.js")], ["api/_lib/crmCaseMutationHttp.js", read("api/_lib/crmCaseMutationHttp.js")],
  ["api/_lib/crmOwnerCatalogHttp.js", read("api/_lib/crmOwnerCatalogHttp.js")], ["api/_lib/crmPipelineReadHttp.js", read("api/_lib/crmPipelineReadHttp.js")],
  ["api/_lib/pipelineCaseMutationHttp.js", read("api/_lib/pipelineCaseMutationHttp.js")],
  ["api/clients/index.js", read("api/clients/index.js")], ["api/projects/index.js", read("api/projects/index.js")],
]);
const results = [];
function check(name, condition) { results.push({ name, passed: Boolean(condition) }); if (!condition) throw new Error(name); }
function rejected(name, relativePath, mutate, pattern = /PROTECTED_CORS_GUARD/u) {
  const overrides = new Map(baseline); overrides.set(relativePath, mutate(overrides.get(relativePath)));
  let error; try { validateCrmCorsGuard({ overrides }); } catch (caught) { error = caught; }
  check(name, pattern.test(error?.message || ""));
}

const current = validateCrmCorsGuard({ overrides: baseline });
check("inventario completo 52/52", current.ok && current.routes === 52);
check("25 rutas same-origin", current.protectedSameOrigin === 25);
check("allowlist pública 2/2", current.publicDeliberate === 2 && current.webhookOwnAuth === 0);
check("25 rutas legacy cerradas", current.legacyPending === 25);
check("sin headers API de plataforma", current.platformApiHeaderRules === 0);
rejected("wildcard Clients", "api/clients/index.js", (value) => `${value}\nres.setHeader("Access-Control-Allow-Origin", "*");`);
rejected("wildcard Projects con casing", "api/projects/index.js", (value) => `${value}\nres.setHeader("aCcEsS-CoNtRoL-AlLoW-OrIgIn", "*");`);
rejected("wildcard Admin", "api/_lib/adminMembershipHttp.js", (value) => `${value}\nres.setHeader("Access-Control-Allow-Origin", "*");`);
rejected("wildcard CRM", "api/_lib/crmPipelineReadHttp.js", (value) => `${value}\nres.setHeader("Access-Control-Allow-Origin", "*");`);
rejected("wildcard wrapper compartido", "api/_lib/http.js", (value) => value.replace("applyHeaders: setPrivateNoStore", "applyHeaders: setPublicReadCors"));
rejected("credentials sin wildcard", "api/_lib/http.js", (value) => `${value}\nres.setHeader("Access-Control-Allow-Credentials", "true");`);
rejected("reflejo de Origin", "api/clients/index.js", (value) => `${value}\nres.setHeader("Access-Control-Allow-Origin", req.headers.origin);`);
rejected("booleano CORS ambiguo", "api/_lib/http.js", (value) => value.replace("{ handleOptions = false }", "{ handleOptions = false, cors = false }"));
rejected("OPTIONS privado permisivo", "api/_lib/http.js", (value) => value.replace("{ handleOptions = false }", "{ handleOptions = true }"));
rejected("catch-all Vercel", "vercel.json", (value) => value.replace('"headers": []', '"headers": [{"source":"/api/(.*)","headers":[{"key":"Access-Control-Allow-Origin","value":"*"}]}]'));
rejected("public wrapper fuera de allowlist", "api/clients/index.js", (value) => value.replaceAll("withPrivateApiHeaders", "withPublicReadCorsHeaders"));
let newRouteError;
try { validateCrmCorsGuard({ overrides: baseline, extraRoutes: [{ path: "/api/admin/future", relativePath: "api/admin/future.js", source: "export default withPrivateApiHeaders(async () => {});" }] }); } catch (error) { newRouteError = error; }
check("ruta protegida nueva no inventariada", /clasificación incompleta/u.test(newRouteError?.message || ""));
process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
