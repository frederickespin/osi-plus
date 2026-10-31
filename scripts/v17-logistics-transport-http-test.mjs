import assert from "node:assert/strict";
import { createLogisticsTransportHandler } from "../api/_lib/logisticsTransportHttp.js";

const results = [];
function check(name, value) { assert.ok(value, name); results.push(name); }
function request(method = "POST") { return { method, headers: { host: "127.0.0.1:5173", origin: "http://127.0.0.1:5173" },
  socket: { localAddress: "127.0.0.1", remoteAddress: "127.0.0.1" }, body: { synthetic: true }, query: {} }; }
function response() { return { statusCode: 0, headers: {}, payload: null, ended: false,
  setHeader(key, value) { this.headers[key] = value; }, getHeader(key) { return this.headers[key]; }, removeHeader(key) { delete this.headers[key]; },
  status(value) { this.statusCode = value; return this; }, json(value) { this.payload = value; return this; }, end() { this.ended = true; return this; } }; }
const required = { GET: ["logistics:rules:view", "costing:rules:view"], POST: ["logistics:rules:manage", "costing:rules:manage"] };
const all = [...required.GET, ...required.POST];
function fixture({ env = { LOGISTICS_ENGINE_API_MODE: "LOCAL_ONLY", COSTING_ENGINE_API_MODE: "LOCAL_ONLY" }, permissions = all, denied = [], executeError = null } = {}) {
  let auth = 0; let executes = 0;
  const handler = createLogisticsTransportHandler({ env, methods: ["GET", "POST"], permissions: (method) => required[method],
    status: (method) => method === "POST" ? 201 : 200,
    resolveContext: async () => { auth += 1; return { tenantId: "synthetic-tenant", membershipId: "synthetic-member", userId: "synthetic-user", effectivePermissions: permissions, deniedPermissions: denied }; },
    execute: async ({ input, method }) => { executes += 1; if (executeError) throw executeError; return { method, input }; } });
  return { handler, auth: () => auth, executes: () => executes };
}
for (const env of [{}, { LOGISTICS_ENGINE_API_MODE: "PREVIEW_REHEARSAL", VERCEL: "1", VERCEL_ENV: "production" }, { LOGISTICS_ENGINE_API_MODE: "LOCAL_ONLY", VERCEL: "1" },
  { LOGISTICS_ENGINE_API_MODE: "LOCAL_ONLY" }, { LOGISTICS_ENGINE_API_MODE: "LOCAL_ONLY", COSTING_ENGINE_API_MODE: "DISABLED" },
  { LOGISTICS_ENGINE_API_MODE: "LOCAL_ONLY", COSTING_ENGINE_API_MODE: "local_only" }]) {
  const f = fixture({ env }); const req = request(); Object.defineProperty(req, "body", { get() { throw new Error("body must remain unread"); } }); const res = response();
  await f.handler(req, res);
  check("disabled or invalid deployment gates precede auth body and execution", [409, 503].includes(res.statusCode) && f.auth() === 0 && f.executes() === 0);
  check("gated responses are private and do not emit wildcard CORS", res.headers["Cache-Control"] === "private, no-store" && /Authorization/.test(res.headers.Vary) && /Origin/.test(res.headers.Vary) && !res.headers["Access-Control-Allow-Origin"]);
}
{
  const f = fixture({ env: { LOGISTICS_ENGINE_API_MODE: "LOCAL_ONLY" } }); const res = response(); await f.handler(request(), res);
  check("active logistics cannot bypass disabled monetary authority", res.statusCode === 409 && res.payload.error === "COSTING_DISABLED" && f.auth() === 0 && f.executes() === 0);
}
for (const method of ["GET", "HEAD", "POST"]) for (const missing of required[method === "HEAD" ? "GET" : method]) {
  const f = fixture({ permissions: all.filter((permission) => permission !== missing) }); const req = request(method);
  Object.defineProperty(req, "body", { get() { throw new Error("forbidden body must remain unread"); } }); const res = response();
  await f.handler(req, res);
  check(`${method} requires both authorities before body and execution`, res.statusCode === 403 && f.auth() === 1 && f.executes() === 0);
  if (method === "HEAD") check("HEAD permission denial has no body", res.payload === null && res.ended);
}
{
  const f = fixture({ denied: ["costing:rules:manage"] }); const res = response(); await f.handler(request(), res);
  check("explicit deny overrides apparently effective write grant", res.statusCode === 403 && f.executes() === 0);
}
for (const origin of ["https://outside.invalid", ["http://127.0.0.1:5173"], " http://127.0.0.1:5173"]) {
  const f = fixture(); const req = request(); req.headers.origin = origin; const res = response(); await f.handler(req, res);
  check("foreign or ambiguous origin fails before auth", res.statusCode === 403 && f.auth() === 0 && f.executes() === 0);
}
{
  const f = fixture(); const res = response(); await f.handler(request(), res);
  check("authorized creation returns canonical private envelope", res.statusCode === 201 && res.payload.ok && res.payload.data.input.synthetic && f.executes() === 1);
  const head = response(); await f.handler(request("HEAD"), head);
  check("authorized HEAD checks the GET domain but never emits its body", head.statusCode === 200 && head.ended && head.payload === null && f.executes() === 2);
  const options = response(); await f.handler(request("OPTIONS"), options);
  check("same-origin OPTIONS is private and does not authorize or execute", options.statusCode === 204 && f.auth() === 2 && f.executes() === 2);
  const unsupported = response(); await f.handler(request("DELETE"), unsupported);
  check("unsupported mutation is rejected before auth", unsupported.statusCode === 405 && /HEAD/.test(unsupported.headers.Allow) && f.auth() === 2);
}
{
  const f = fixture(); const req = request(); req.body = { huge: "x".repeat(129 * 1024) }; const res = response(); await f.handler(req, res);
  check("oversized authenticated input never reaches the domain", res.statusCode === 413 && f.executes() === 0);
}
for (const error of [Object.assign(new Error("synthetic request conflict"), { code: "LOGISTICS_TRANSPORT_VERSION_CONFLICT", status: 409 }), new Error("synthetic private database connection information")]) {
  const f = fixture({ executeError: error }); const res = response(); await f.handler(request(), res);
  check("controlled errors are mapped without leaking raw database messages", [409, 503].includes(res.statusCode) && !JSON.stringify(res.payload).includes("private database connection"));
}
process.stdout.write(JSON.stringify({ ok: true, assertions: results.length, results, productionApiEnabled: false, remoteDatabaseAccess: false }, null, 2) + "\n");
