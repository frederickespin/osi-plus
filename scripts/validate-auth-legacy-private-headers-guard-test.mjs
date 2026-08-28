import { readFileSync } from "node:fs";
import { inventoryAuthRoutes, validateAuthLegacyPrivateHeadersGuard } from "./validate-auth-legacy-private-headers-guard.mjs";

const baseline = readFileSync("vercel.json", "utf8");
const results = [];
function check(name, condition) {
  results.push({ name, passed: Boolean(condition) });
  if (!condition) throw new Error(name);
}
function rejected(name, options, pattern) {
  let error;
  try { validateAuthLegacyPrivateHeadersGuard(options); } catch (caught) { error = caught; }
  check(name, pattern.test(error?.message || ""));
}

const current = validateAuthLegacyPrivateHeadersGuard();
check("cinco rutas Auth protegidas recursivamente", current.ok && current.routes === 5 && current.futureRoutesProtected);
rejected("catch-all Vercel inseguro", { vercelText: baseline.replace('"headers": []', '"headers": [{"source":"/api/(.*)","headers":[{"key":"Access-Control-Allow-Origin","value":"*"}]}]') }, /vercel\.json/);
rejected("regla parcial Auth rechazada", { vercelText: baseline.replace('"headers": []', '"headers": [{"source":"/api/auth/login","headers":[{"key":"Access-Control-Allow-Origin","value":"*"}]}]') }, /vercel\.json/);
rejected("ruta futura sin wrapper rechazada", {
  routes: [...inventoryAuthRoutes(), "/api/auth/future"].sort(),
  routeSources: [],
}, /inventario/);
rejected("wildcard directo rechazado", {
  authHttpSource: `${readFileSync("api/_lib/authHttp.js", "utf8")}\nres.setHeader("Access-Control-Allow-Origin", "*");`,
}, /wrapper Auth|CORS/);
rejected("OPTIONS 204 V2 rechazado", {
  authOriginSource: readFileSync("api/_lib/authOrigin.js", "utf8").replace("return res.status(405).json", "return res.status(204).json"),
}, /OPTIONS V2/);

process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
