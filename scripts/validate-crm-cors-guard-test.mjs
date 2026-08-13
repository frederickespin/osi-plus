import { readFileSync } from "node:fs";
import { inventoryCrmRouteSources, unsafeCrmRouteMatches, validateCrmCorsGuard } from "./validate-crm-cors-guard.mjs";

const baseline = readFileSync("vercel.json", "utf8");
const results = [];

function check(name, condition) {
  results.push({ name, passed: Boolean(condition) });
  if (!condition) throw new Error(name);
}

function rejected(name, vercelText, pattern, routes, routeSources) {
  let error;
  try { validateCrmCorsGuard({ vercelText, ...(routes ? { routes } : {}), ...(routeSources ? { routeSources } : {}) }); }
  catch (caught) { error = caught; }
  check(name, pattern.test(error?.message || ""));
}

const current = validateCrmCorsGuard();
check("namespace CRM completo excluido", current.ok && current.crmRoutes === 8 && current.matchedCrmRoutes === 0 && current.handlersChecked === 8);
check("rutas no CRM conservan la regla heredada", current.nonCrmCompatibilityRoutes === 4);

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
  "(?!crm/)",
  "(?!crm/pipeline-cases/[^/]+/(?:transition|assign-owner|unassign-owner|allowed-transitions)/?$)",
);
check(
  "semántica anterior cubría exactamente lista, detalle y resumen",
  JSON.stringify(unsafeCrmRouteMatches({ vercelText: rejectedDeploymentConfig })) === JSON.stringify([
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
rejected("catch-all inseguro rechazado", baseline.replace("((?!crm/).*)", "(.*)"), /excluir todo/);
rejected("allowlist de lecturas rechazada", baseline.replace("crm/", "crm/(?:pipeline-cases|pipeline-summary)"), /excluir todo|parcial/);
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
rejected("JSON inválido rechazado", "{", /JSON válido/);
rejected(
  "ruta CRM futura permanece protegida",
  baseline.replace("(?!crm/)", "(?!crm/pipeline-cases/)"),
  /excluir todo|rutas CRM/,
  ["/api/crm/pipeline-cases", "/api/crm/future/report"],
);

process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
