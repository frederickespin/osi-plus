import { createCrmCaseMutationHandler } from "../api/_lib/crmCaseMutationHttp.js";

const results = [];
function check(name, condition, detail) { results.push({ name, passed: Boolean(condition), detail }); if (!condition) throw new Error(name); }
function response() {
  const headers = new Map();
  return { statusCode: 200, body: null, setHeader(k, v) { headers.set(k.toLowerCase(), v); }, getHeader(k) { return headers.get(k.toLowerCase()); }, removeHeader(k) { headers.delete(k.toLowerCase()); }, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, end() { return this; }, headers };
}
async function invoke(env, options = {}) {
  let bodyReads = 0;
  const req = {
    method: options.method || "POST", headers: options.headers || {}, rawHeaders: [], socket: { remoteAddress: "127.0.0.1" }, query: {},
    get body() { bodyReads += 1; throw new Error("BODY_MUST_NOT_BE_READ"); },
  };
  const res = response();
  const prisma = new Proxy({}, { get() { throw new Error("PRISMA_MUST_NOT_BE_READ"); } });
  const handler = createCrmCaseMutationHandler({ env, prismaClient: prisma, method: "POST", execute: async () => { throw new Error("DOMAIN_MUST_NOT_RUN"); } });
  await handler(req, res);
  return { res, bodyReads };
}

try {
  for (const [name, env, status, code] of [
    ["ausente", {}, 409, "CRM_PIPELINE_MUTATIONS_DISABLED"],
    ["DISABLED", { CRM_PIPELINE_RUNTIME_MODE: "DISABLED", CRM_PIPELINE_MUTATION_MODE: "DISABLED" }, 409, "CRM_PIPELINE_MUTATIONS_DISABLED"],
    ["espacio", { CRM_PIPELINE_RUNTIME_MODE: "READ_ONLY", CRM_PIPELINE_MUTATION_MODE: "LOCAL_ONLY " }, 503, "CRM_PIPELINE_CONFIGURATION_INVALID"],
    ["BOM", { CRM_PIPELINE_RUNTIME_MODE: "READ_ONLY", CRM_PIPELINE_MUTATION_MODE: "\ufeffLOCAL_ONLY" }, 503, "CRM_PIPELINE_CONFIGURATION_INVALID"],
    ["casing", { CRM_PIPELINE_RUNTIME_MODE: "READ_ONLY", CRM_PIPELINE_MUTATION_MODE: "local_only" }, 503, "CRM_PIPELINE_CONFIGURATION_INVALID"],
    ["parcial", { CRM_PIPELINE_MUTATION_MODE: "LOCAL_ONLY" }, 503, "CRM_PIPELINE_CONFIGURATION_INVALID"],
    ["Vercel", { CRM_PIPELINE_RUNTIME_MODE: "READ_ONLY", CRM_PIPELINE_MUTATION_MODE: "LOCAL_ONLY", VERCEL_ANY: "1" }, 503, "CRM_PIPELINE_CONFIGURATION_INVALID"],
  ]) {
    const { res, bodyReads } = await invoke(env);
    check(`${name} falla cerrado antes de body/Prisma`, res.statusCode === status && res.body?.error === code && bodyReads === 0);
    const vary = String(res.getHeader("vary"));
    check(`${name} conserva headers privados`, String(res.getHeader("cache-control")) === "private, no-store" && /Authorization/i.test(vary) && /Origin/i.test(vary) && !res.getHeader("access-control-allow-origin"));
  }
  const local = { CRM_PIPELINE_RUNTIME_MODE: "READ_ONLY", CRM_PIPELINE_MUTATION_MODE: "LOCAL_ONLY", CRM_PIPELINE_OWNER_REF_SECRET: "A".repeat(64) };
  const unauthorized = await invoke(local);
  check("LOCAL_ONLY alcanza auth pero no body sin Bearer", unauthorized.res.statusCode === 401 && unauthorized.bodyReads === 0);
  const external = await invoke(local, { headers: { origin: "https://example.invalid", host: "127.0.0.1", "x-forwarded-proto": "http" } });
  check("origen externo se rechaza antes de auth/body", external.res.statusCode === 403 && external.bodyReads === 0);
  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, assertions: results.length, error: error.message, results }, null, 2)}\n`);
  process.exitCode = 1;
}
