import { readFileSync } from "node:fs";
import { unsafeCrmRouteMatches, validateCrmCorsGuard } from "./validate-crm-cors-guard.mjs";

const baseline = readFileSync("vercel.json", "utf8");
const results = [];

function check(name, condition) {
  results.push({ name, passed: Boolean(condition) });
  if (!condition) throw new Error(name);
}

function rejected(name, vercelText, pattern, routes) {
  let error;
  try { validateCrmCorsGuard({ vercelText, ...(routes ? { routes } : {}) }); }
  catch (caught) { error = caught; }
  check(name, pattern.test(error?.message || ""));
}

const current = validateCrmCorsGuard();
check("namespace CRM completo excluido", current.ok && current.crmRoutes === 7 && current.matchedCrmRoutes === 0);
check("rutas no CRM conservan la regla heredada", current.nonCrmCompatibilityRoutes === 4);

const rejectedDeploymentConfig = baseline.replace(
  "(?!crm/)",
  "(?!crm/pipeline-cases/[^/]+/(?:transition|assign-owner|unassign-owner|allowed-transitions)/?$)",
);
check(
  "semántica anterior cubría exactamente lista, detalle y resumen",
  JSON.stringify(unsafeCrmRouteMatches({ vercelText: rejectedDeploymentConfig })) === JSON.stringify([
    "/api/crm/pipeline-cases",
    `/api/crm/pipeline-cases/${"crm-cors-guard-id"}`,
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
