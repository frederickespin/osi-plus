import { readFileSync } from "node:fs";
import { inventoryCrmRouteSources, inventoryProtectedRoutes, unsafeCrmRouteMatches, validateCrmCorsGuard } from "./validate-crm-cors-guard.mjs";

const baseline = readFileSync("vercel.json", "utf8");
const results = [];

function check(name, condition) {
  results.push({ name, passed: Boolean(condition) });
  if (!condition) throw new Error(name);
}

function rejected(name, vercelText, pattern, routes, routeSources, adminHttpSource, protectedRoutes) {
  let error;
  try {
    validateCrmCorsGuard({
      vercelText,
      ...(routes ? { routes } : {}),
      ...(routeSources ? { routeSources } : {}),
      ...(adminHttpSource ? { adminHttpSource } : {}),
      ...(protectedRoutes ? { protectedRoutes } : {}),
    });
  }
  catch (caught) { error = caught; }
  check(name, pattern.test(error?.message || ""));
}

const current = validateCrmCorsGuard();
check("namespaces protegidos completos excluidos", current.ok
  && current.crmRoutes === 9
  && current.matchedCrmRoutes === 0
  && current.matchedProtectedRoutes === 0
  && current.protectedNamespaces === 6
  && current.futureProtectedRoutes === 6
  && current.handlersChecked === 9);
check("rutas ajenas conservan la regla heredada", current.nonCrmCompatibilityRoutes === 1);

const routeSources = inventoryCrmRouteSources();
const listSource = routeSources.find((route) => route.path === "/api/crm/pipeline-cases");
rejected(
  "handler de lectura no puede heredar CORS común",
  baseline,
  /hereda CORS wildcard/,
  undefined,
  routeSources.map((route) => route === listSource
    ? { ...route, source: `${route.source}\nwithCommonHeaders(async () => {}, {});` }
    : route),
);

const rejectedDeploymentConfig = baseline.replace(
  "crm(?:/|$)",
  "crm/pipeline-cases/[^/]+/(?:transition|assign-owner|unassign-owner|allowed-transitions)/?$",
);
check(
  "semántica anterior cubría exactamente lista, detalle y resumen",
  JSON.stringify(unsafeCrmRouteMatches({ vercelText: rejectedDeploymentConfig })) === JSON.stringify([
    "/api/crm/client-options",
    "/api/crm/pipeline-cases",
    `/api/crm/pipeline-cases/${"crm-cors-guard-id"}`,
    "/api/crm/pipeline-owner-options",
    "/api/crm/pipeline-summary",
  ]),
);
rejected(
  "reproduce la exclusión parcial del deployment rechazado",
  rejectedDeploymentConfig,
  /excluir todo|parcial/,
);
rejected("catch-all inseguro rechazado", baseline.replace("((?!auth(?:/|$)|crm(?:/|$)|clients(?:/|$)|projects(?:/|$)|k(?:/|$)|admin(?:/|$)).*)", "(.*)"), /excluir todo/);
rejected("allowlist de lecturas rechazada", baseline.replace("crm(?:/|$)", "crm/(?:pipeline-cases|pipeline-summary)"), /excluir todo|parcial/);
rejected("namespace Admin no puede salir de la protección", baseline.replace("|admin(?:/|$)", ""), /regla global|Admin|protegidas/);
rejected("namespace K futuro no puede salir de la protección", baseline.replace("|k(?:/|$)", ""), /regla global|protegidas/);
rejected("exclusión Admin parcial rechazada", baseline.replace("admin(?:/|$)", "admin/memberships(?:/|$)"), /regla global|protegidas/);
rejected(
  "wildcard adicional sobre CRM rechazado",
  baseline.replace('"headers": [', '"headers": [{"source":"/api/crm/(.*)","headers":[{"key":"Access-Control-Allow-Origin","value":"*"}]} ,'),
  /única regla/,
);
rejected(
  "credenciales adicionales sobre CRM rechazadas",
  baseline.replace('"headers": [', '"headers": [{"source":"/api/crm/(.*)","headers":[{"key":"Access-Control-Allow-Credentials","value":"true"}]} ,'),
  /única regla/,
);
rejected(
  "wildcard y credentials sobre Admin rechazados",
  baseline.replace('"headers": [', '"headers": [{"source":"/api/admin/(.*)","headers":[{"key":"Access-Control-Allow-Origin","value":"*"},{"key":"Access-Control-Allow-Credentials","value":"true"}]} ,'),
  /única regla|protegidas/,
);
rejected("JSON inválido rechazado", "{", /JSON válido/);
rejected(
  "ruta CRM futura permanece protegida",
  baseline.replace("crm(?:/|$)", "crm/pipeline-cases/"),
  /excluir todo|rutas CRM/,
  ["/api/crm/pipeline-cases", "/api/crm/future/report"],
);
rejected(
  "Origin externo no puede reflejarse desde Admin",
  baseline,
  /refleja Origin/,
  undefined,
  undefined,
  `${readFileSync("api/_lib/adminMembershipHttp.js", "utf8")}\nres.setHeader("Access-Control-Allow-Origin", origin);`,
);
rejected(
  "Admin debe conservar rechazo same-origin",
  baseline,
  /Origin externo/,
  undefined,
  undefined,
  readFileSync("api/_lib/adminMembershipHttp.js", "utf8").replaceAll("assertSameOrigin(req);", ""),
);
check("inventario real contiene rutas Admin", inventoryProtectedRoutes().some((path) => path.startsWith("/api/admin/")));

process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
