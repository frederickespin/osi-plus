import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import loginHandler from "../api/auth/login.js";
import authMeHandler from "../api/auth/me.js";
import { createPipelineCasesListHandler } from "../api/crm/pipeline-cases/index.js";
import { createPipelineCaseDetailHandler } from "../api/crm/pipeline-cases/[id].js";
import { createPipelineTransitionHandler } from "../api/crm/pipeline-cases/[id]/transition.js";
import { createPipelineOwnerOptionsHandler } from "../api/crm/pipeline-owner-options.js";
import { createPipelineSummaryHandler } from "../api/crm/pipeline-summary.js";

const exactPreview = Object.freeze({
  VERCEL: "1",
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "feature/v17-commercial-crm-preview",
  CRM_PIPELINE_RUNTIME_MODE: "PREVIEW_REHEARSAL",
  CRM_PIPELINE_MUTATION_MODE: "DISABLED",
  CRM_PIPELINE_ACTIVATION_BATCH: "V17-COMMERCIAL-CRM-PREVIEW-01",
  MT01B_AUTH_MODE: "LEGACY",
  MT01B_TENANT_SWITCH_ENABLED: "false",
  VITE_MT01B2_CLIENT_ENABLED: "false",
  COMMERCIAL_TENANCY_WRITE_MODE: "TENANT_WRITE",
  COMMERCIAL_TENANCY_READ_MODE: "TENANT_READ",
  COMMERCIAL_TENANCY_ACTIVATION_BATCH: "MT-01C2B2-IPACKERS-DO-V1",
});

let assertions = 0;
function check(name, condition) {
  assert.equal(Boolean(condition), true, name);
  assertions += 1;
}

function adaptResponse(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => {
    if (!res.headersSent && !res.hasHeader("Content-Type")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    res.end(JSON.stringify(body));
    return res;
  };
  return res;
}

let authCalls = 0;
let databaseCalls = 0;
let bodyReads = 0;
const requirePermission = async (req, res) => {
  authCalls += 1;
  if (req.headers.authorization !== "Bearer preview-valid") {
    res.status(401).json({ ok: false, error: "COMMERCIAL_AUTH_INVALID" });
    return null;
  }
  return Object.freeze({ tenantId: "tenant-preview" });
};

const listDatabase = {
  pipelineCase: {
    count: async () => { databaseCalls += 1; return 0; },
    findMany: async () => { databaseCalls += 1; return []; },
  },
  $transaction: async (operations) => Promise.all(operations),
};
const detailDatabase = {
  pipelineCase: {
    findFirst: async ({ where }) => {
      databaseCalls += 1;
      if (where.id === "cross-tenant-case") return null;
      return {
        id: "visible-case", caseCode: "DEMO-HTTP", mode: "LOCAL", serviceType: "MOVING",
        status: "NEW_INBOX", client: null, enterpriseOwner: null,
        createdAt: new Date("2026-08-18T10:00:00.000Z"), updatedAt: new Date("2026-08-18T10:00:00.000Z"),
      };
    },
  },
};
const summaryDatabase = {
  pipelineCase: {
    groupBy: async () => { databaseCalls += 1; return []; },
    count: async () => { databaseCalls += 1; return 0; },
  },
  $transaction: async (operations) => Promise.all(operations),
};

const list = createPipelineCasesListHandler({ env: exactPreview, requirePermission, prismaClient: listDatabase });
const detail = createPipelineCaseDetailHandler({ env: exactPreview, requirePermission, prismaClient: detailDatabase });
const summary = createPipelineSummaryHandler({ env: exactPreview, requirePermission, prismaClient: summaryDatabase });
const mutation = createPipelineTransitionHandler({
  env: exactPreview,
  resolveContext: async () => { authCalls += 1; throw new Error("mutation auth must not run"); },
  execute: async () => { databaseCalls += 1; throw new Error("mutation execute must not run"); },
});
const ownerOptions = createPipelineOwnerOptionsHandler({
  env: exactPreview,
  resolveContext: async () => { authCalls += 1; throw new Error("owner auth must not run"); },
  listOptions: async () => { databaseCalls += 1; throw new Error("owner query must not run"); },
});

const previousAuthMode = process.env.MT01B_AUTH_MODE;
const previousPreviewRuntimeMode = process.env.CRM_PIPELINE_RUNTIME_MODE;
process.env.MT01B_AUTH_MODE = "LEGACY";
delete process.env.CRM_PIPELINE_RUNTIME_MODE;

const server = createServer(async (req, rawResponse) => {
  const res = adaptResponse(rawResponse);
  const parsed = new URL(req.url, "http://preview.localhost");
  req.query = Object.fromEntries(parsed.searchParams.entries());
  try {
    if (parsed.pathname === "/api/crm/pipeline-cases") return await list(req, res);
    if (parsed.pathname === "/api/crm/pipeline-summary") return await summary(req, res);
    if (parsed.pathname === "/api/crm/pipeline-owner-options") return await ownerOptions(req, res);
    const transition = parsed.pathname.match(/^\/api\/crm\/pipeline-cases\/([^/]+)\/transition$/);
    if (transition) {
      req.query = { id: transition[1] };
      Object.defineProperty(req, "body", { configurable: true, get() { bodyReads += 1; throw new Error("body read before disabled gate"); } });
      return await mutation(req, res);
    }
    const caseMatch = parsed.pathname.match(/^\/api\/crm\/pipeline-cases\/([^/]+)$/);
    if (caseMatch) {
      req.query = { id: caseMatch[1] };
      return await detail(req, res);
    }
    if (parsed.pathname === "/api/auth/login") return await loginHandler(req, res);
    if (parsed.pathname === "/api/auth/me") return await authMeHandler(req, res);
    return res.status(404).json({ ok: false, error: "NOT_FOUND" });
  } catch {
    if (!res.headersSent) res.status(500).json({ ok: false, error: "TEST_SERVER_ERROR" });
    else res.end();
  }
});

server.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
const base = `http://127.0.0.1:${address.port}`;
const sameOrigin = `http://127.0.0.1:${address.port}`;

async function request(path, { method = "GET", origin, authorization, body } = {}) {
  const headers = {};
  if (origin !== undefined) headers.Origin = origin;
  if (authorization !== undefined) headers.Authorization = authorization;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = method === "HEAD" ? "" : await response.text();
  let json = null;
  if (text) {
    try { json = JSON.parse(text); } catch { json = null; }
  }
  return { response, text, json };
}

try {
  const routes = [
    "/api/crm/pipeline-cases",
    "/api/crm/pipeline-cases/visible-case",
    "/api/crm/pipeline-summary",
  ];
  for (const route of routes) {
    const get = await request(route, { origin: sameOrigin, authorization: "Bearer preview-valid" });
    check(`${route} GET same-origin`, get.response.status === 200 && get.json?.ok === true);
    check(`${route} GET cache privado`, get.response.headers.get("cache-control") === "private, no-store");
    check(`${route} GET Vary`, get.response.headers.get("vary") === "Authorization, Origin");
    check(`${route} sin CORS permisivo`, !get.response.headers.has("access-control-allow-origin") && !get.response.headers.has("access-control-allow-credentials"));

    const head = await request(route, { method: "HEAD", origin: sameOrigin, authorization: "Bearer preview-valid" });
    check(`${route} HEAD`, head.response.status === 200 && head.text === "");
    check(`${route} HEAD cache privado`, head.response.headers.get("cache-control") === "private, no-store");

    const options = await request(route, { method: "OPTIONS", origin: sameOrigin });
    check(`${route} OPTIONS same-origin`, options.response.status === 204);
    check(`${route} OPTIONS cache y Vary`, options.response.headers.get("cache-control") === "private, no-store"
      && options.response.headers.get("vary") === "Authorization, Origin");

    const beforeExternalAuth = authCalls;
    const beforeExternalDatabase = databaseCalls;
    const external = await request(route, { origin: "https://external.invalid", authorization: "Bearer preview-valid" });
    check(`${route} origin externo rechazado`, external.response.status === 403 && external.json?.error === "CRM_PIPELINE_ORIGIN_FORBIDDEN");
    check(`${route} origin externo precede auth/Prisma`, authCalls === beforeExternalAuth && databaseCalls === beforeExternalDatabase);
  }

  const invalidBearer = await request(routes[0], { authorization: "Bearer invalid" });
  check("Bearer inválido", invalidBearer.response.status === 401 && invalidBearer.json?.error === "COMMERCIAL_AUTH_INVALID");
  check("401 conserva headers privados", invalidBearer.response.headers.get("cache-control") === "private, no-store"
    && invalidBearer.response.headers.get("vary") === "Authorization, Origin");

  const crossTenant = await request("/api/crm/pipeline-cases/cross-tenant-case", { authorization: "Bearer preview-valid" });
  check("cross-tenant indistinguible", crossTenant.response.status === 404
    && crossTenant.json?.error === "CRM_PIPELINE_RESOURCE_NOT_FOUND"
    && !JSON.stringify(crossTenant.json).includes("tenant"));

  const beforeMutationAuth = authCalls;
  const beforeMutationDatabase = databaseCalls;
  const disabledMutation = await request("/api/crm/pipeline-cases/visible-case/transition", {
    method: "POST", origin: "https://external.invalid", authorization: "Bearer invalid", body: { unexpected: true },
  });
  check("mutación 409 antes de origen/auth/body/Prisma", disabledMutation.response.status === 409
    && disabledMutation.json?.code === "CRM_PIPELINE_MUTATIONS_DISABLED"
    && authCalls === beforeMutationAuth && databaseCalls === beforeMutationDatabase && bodyReads === 0);

  const beforeOwnerAuth = authCalls;
  const beforeOwnerDatabase = databaseCalls;
  const disabledOwner = await request("/api/crm/pipeline-owner-options", {
    origin: "https://external.invalid", authorization: "Bearer invalid",
  });
  check("owner options 409 antes de origen/auth/Prisma", disabledOwner.response.status === 409
    && disabledOwner.json?.code === "CRM_PIPELINE_MUTATIONS_DISABLED"
    && authCalls === beforeOwnerAuth && databaseCalls === beforeOwnerDatabase);

  const loginOptions = await request("/api/auth/login", { method: "OPTIONS", origin: "https://external.invalid" });
  check("Auth LEGACY OPTIONS falla cerrado", loginOptions.response.status === 405
    && loginOptions.response.headers.get("allow") === "POST");
  check("Auth LEGACY OPTIONS conserva contrato privado", loginOptions.response.headers.get("cache-control") === "private, no-store"
    && loginOptions.response.headers.get("vary") === "Authorization, Origin"
    && !loginOptions.response.headers.has("access-control-allow-origin")
    && !loginOptions.response.headers.has("access-control-allow-credentials")
    && !loginOptions.response.headers.has("set-cookie"));
  const loginInvalid = await request("/api/auth/login", { method: "POST", origin: "https://external.invalid", body: {} });
  check("Auth LEGACY login inválido sin DB", loginInvalid.response.status === 400);
  check("Auth LEGACY login inválido conserva contrato privado", loginInvalid.response.headers.get("cache-control") === "private, no-store"
    && loginInvalid.response.headers.get("vary") === "Authorization, Origin"
    && !loginInvalid.response.headers.has("access-control-allow-origin")
    && !loginInvalid.response.headers.has("access-control-allow-credentials")
    && !loginInvalid.response.headers.has("set-cookie"));
  const authMe = await request("/api/auth/me", { origin: "https://external.invalid" });
  check("Auth LEGACY auth/me anónimo", authMe.response.status === 401);
  check("Auth LEGACY auth/me conserva contrato privado", authMe.response.headers.get("cache-control") === "private, no-store"
    && authMe.response.headers.get("vary") === "Authorization, Origin"
    && !authMe.response.headers.has("access-control-allow-origin")
    && !authMe.response.headers.has("access-control-allow-credentials")
    && !authMe.response.headers.has("set-cookie"));

  console.log(JSON.stringify({
    ok: true,
    assertions,
    crm: { methods: ["GET", "HEAD", "OPTIONS"], sameOrigin: true, externalOriginRejected: true, privateNoStore: true },
    mutations: { disabled: true, authCalls: 0, bodyReads, prismaCalls: 0 },
    legacyAuth: { wildcardCors: false, privateNoStore: true, optionsPermissive: false },
  }));
} finally {
  server.close();
  await once(server, "close");
  if (previousAuthMode === undefined) delete process.env.MT01B_AUTH_MODE;
  else process.env.MT01B_AUTH_MODE = previousAuthMode;
  if (previousPreviewRuntimeMode === undefined) delete process.env.CRM_PIPELINE_RUNTIME_MODE;
  else process.env.CRM_PIPELINE_RUNTIME_MODE = previousPreviewRuntimeMode;
}
