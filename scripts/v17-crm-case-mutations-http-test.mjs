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
    method: options.method || "POST", headers: options.headers || {}, rawHeaders: [],
    socket: { localAddress: options.localAddress || "127.0.0.1", remoteAddress: options.remoteAddress || "127.0.0.1" }, query: {},
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
  const proxyLoopback = await invoke(local, { remoteAddress: "203.0.113.20", headers: { host: "127.0.0.1", "x-forwarded-for": "127.0.0.1" } });
  check("LOCAL_ONLY exige socket loopback real", proxyLoopback.res.statusCode === 503 && proxyLoopback.res.body?.error === "CRM_PIPELINE_CONFIGURATION_INVALID" && proxyLoopback.bodyReads === 0);

  const preview = {
    VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature/v17-commercial-crm-preview",
    CRM_PIPELINE_RUNTIME_MODE: "PREVIEW_REHEARSAL", CRM_PIPELINE_MUTATION_MODE: "PREVIEW_REHEARSAL",
    CRM_PIPELINE_ACTIVATION_BATCH: "V17-COMMERCIAL-CRM-PREVIEW-01",
    VITE_OSI_HUB_MODE: "PREVIEW_REHEARSAL", VITE_CRM_PIPELINE_CLIENT_MODE: "PREVIEW_REHEARSAL",
    VITE_CRM_PIPELINE_READ_MODE: "PREVIEW_REHEARSAL", VITE_V17_COMMERCIAL_CRM_PREVIEW_BATCH: "V17-COMMERCIAL-CRM-PREVIEW-01",
    MT01B_AUTH_MODE: "LEGACY", MT01B_TENANT_SWITCH_ENABLED: "false", VITE_MT01B2_CLIENT_ENABLED: "false",
    COMMERCIAL_TENANCY_WRITE_MODE: "TENANT_WRITE", COMMERCIAL_TENANCY_READ_MODE: "TENANT_READ",
    COMMERCIAL_TENANCY_MUTATION_MODE: "DISABLED", COMMERCIAL_TENANCY_ACTIVATION_BATCH: "MT-01C2B2-IPACKERS-DO-V1",
  };
  const previewUnauthorized = await invoke(preview, { remoteAddress: "203.0.113.20", localAddress: "10.0.0.5" });
  check("PREVIEW_REHEARSAL exacto alcanza auth sin exigir loopback", previewUnauthorized.res.statusCode === 401 && previewUnauthorized.bodyReads === 0);
  for (const [name, overrides] of [
    ["rama", { VERCEL_GIT_COMMIT_REF: "main" }],
    ["batch", { CRM_PIPELINE_ACTIVATION_BATCH: "OTHER" }],
    ["read frontend", { VITE_CRM_PIPELINE_READ_MODE: "DISABLED" }],
    ["mutación comercial", { COMMERCIAL_TENANCY_MUTATION_MODE: "LOCAL_ONLY" }],
  ]) {
    const invalid = await invoke({ ...preview, ...overrides }, { remoteAddress: "203.0.113.20", localAddress: "10.0.0.5" });
    check(`Preview alterado en ${name} falla antes de auth/body/Prisma`, invalid.res.statusCode === 503 && invalid.res.body?.error === "CRM_PIPELINE_CONFIGURATION_INVALID" && invalid.bodyReads === 0);
  }
  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, assertions: results.length, error: error.message, results }, null, 2)}\n`);
  process.exitCode = 1;
}
