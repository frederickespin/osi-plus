import { readFileSync } from "node:fs";
import {
  expectedCrmCorsInventoryReport,
  loadProtectedCorsInventory,
  validateCrmCorsGuard,
  validateCrmCorsInventoryReport,
} from "./validate-crm-cors-guard.mjs";

const read = (path) => readFileSync(path, "utf8");
const baseline = new Map([
  ["vercel.json", read("vercel.json")], ["api/_lib/http.js", read("api/_lib/http.js")],
  ["scripts/protected-cors-route-inventory.json", read("scripts/protected-cors-route-inventory.json")],
  ["api/_lib/adminIdentityInvitationHttp.js", read("api/_lib/adminIdentityInvitationHttp.js")],
  ["api/_lib/adminMembershipHttp.js", read("api/_lib/adminMembershipHttp.js")], ["api/_lib/authHttp.js", read("api/_lib/authHttp.js")],
  ["api/_lib/authOrigin.js", read("api/_lib/authOrigin.js")], ["api/_lib/crmCaseMutationHttp.js", read("api/_lib/crmCaseMutationHttp.js")],
  ["api/_lib/crmIcpV2ApiHttp.js", read("api/_lib/crmIcpV2ApiHttp.js")],
  ["api/_lib/crmOwnerCatalogHttp.js", read("api/_lib/crmOwnerCatalogHttp.js")], ["api/_lib/crmPipelineReadHttp.js", read("api/_lib/crmPipelineReadHttp.js")],
  ["api/_lib/materialsInventoryHttp.js", read("api/_lib/materialsInventoryHttp.js")],
  ["api/_lib/toolsEquipmentHttp.js", read("api/_lib/toolsEquipmentHttp.js")],
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
function reportRejected(name, report, pattern = /PROTECTED_CORS_GUARD/u) {
  let error; try { validateCrmCorsInventoryReport(report, expectedCrmCorsInventoryReport({ overrides: baseline })); } catch (caught) { error = caught; }
  check(name, pattern.test(error?.message || ""));
}
function mutateManifest(mutator) {
  return (text) => {
    const manifest = JSON.parse(text);
    mutator(manifest.categories);
    return `${JSON.stringify(manifest, null, 2)}\n`;
  };
}

const current = validateCrmCorsGuard({ overrides: baseline });
const inventory = loadProtectedCorsInventory({ overrides: baseline });
check("inventario completo 99/99", current.ok && current.routes === 99 && current.classifiedRoutes === 99);
check("72 rutas same-origin", current.protectedSameOrigin === 72);
check("allowlist pública 2/2", current.publicDeliberate === 2 && current.webhookOwnAuth === 0);
check("25 rutas legacy cerradas", current.legacyPending === 25);
check("categorías exactas sin solapamientos", current.duplicates === 0 && current.unclassified === 0 && current.overlaps === 0);
check("tres rutas Identity protegidas", [
  "/api/admin/identity-invitations",
  "/api/admin/identity-invitations/[invitationRef]",
  "/api/auth/admin-invitations/activate",
].every((route) => inventory.categories.protectedSameOrigin.includes(route)));
check("resumen coincide con manifiesto", validateCrmCorsInventoryReport(current, expectedCrmCorsInventoryReport({ overrides: baseline })));
check("sin headers API de plataforma", current.platformApiHeaderRules === 0);
rejected("ruta Identity ausente", "scripts/protected-cors-route-inventory.json", mutateManifest((categories) => {
  categories.protectedSameOrigin = categories.protectedSameOrigin.filter((route) => route !== "/api/auth/admin-invitations/activate");
}));
rejected("ruta protegida reclasificada como pública", "scripts/protected-cors-route-inventory.json", mutateManifest((categories) => {
  const route = "/api/admin/identity-invitations";
  categories.protectedSameOrigin = categories.protectedSameOrigin.filter((value) => value !== route);
  categories.publicDeliberate.push(route);
}));
rejected("ruta duplicada en manifiesto", "scripts/protected-cors-route-inventory.json", mutateManifest((categories) => {
  categories.protectedSameOrigin.push("/api/admin/memberships");
}), /duplicadas/);
rejected("ruta en dos categorías", "scripts/protected-cors-route-inventory.json", mutateManifest((categories) => {
  categories.publicDeliberate.push("/api/admin/memberships");
}), /superpuestas/);
reportRejected("resumen alterado no coincide con manifiesto", { ...current, protectedSameOrigin: 34 }, /protectedSameOrigin/);
reportRejected("éxito incompleto no engaña al agregador", { ...current, routes: 61, classifiedRoutes: 61 }, /routes/);
rejected("wildcard Clients", "api/clients/index.js", (value) => `${value}\nres.setHeader("Access-Control-Allow-Origin", "*");`);
rejected("wildcard Projects con casing", "api/projects/index.js", (value) => `${value}\nres.setHeader("aCcEsS-CoNtRoL-AlLoW-OrIgIn", "*");`);
rejected("wildcard Admin", "api/_lib/adminMembershipHttp.js", (value) => `${value}\nres.setHeader("Access-Control-Allow-Origin", "*");`);
rejected("wildcard CRM", "api/_lib/crmPipelineReadHttp.js", (value) => `${value}\nres.setHeader("Access-Control-Allow-Origin", "*");`);
rejected("wildcard wrapper compartido", "api/_lib/http.js", (value) => value.replace("applyHeaders: setPrivateNoStore", "applyHeaders: setPublicReadCors"));
rejected("wildcard wrapper activos", "api/_lib/toolsEquipmentHttp.js", (value) => `${value}\nres.setHeader("Access-Control-Allow-Origin", "*");`);
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
