import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { CrmIcpV2ApiError } from "../api/_lib/crmIcpV2ApiDomain.js";
import {
  CRM_ICP_V2_API_PREVIEW_BATCH,
  CRM_ICP_V2_API_PREVIEW_BRANCH,
} from "../api/_lib/crmIcpV2ApiHttp.js";
import { createIcpV2ClientSearchHandler } from "../api/crm/icp-v2/clients/search.js";
import { createIcpV2PipelineCaseHandler } from "../api/crm/icp-v2/pipeline-cases/index.js";
import { createIcpV2PipelineCaseDetailHandler } from "../api/crm/icp-v2/pipeline-cases/[caseKey]/index.js";

const assertions = [];
function check(name, condition) {
  assert.equal(Boolean(condition), true, name);
  assertions.push({ name, passed: true });
}

function response() {
  const headers = new Map();
  return {
    statusCode: 200,
    body: null,
    headers,
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    getHeader(name) { return headers.get(name.toLowerCase()); },
    removeHeader(name) { headers.delete(name.toLowerCase()); },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; },
  };
}

function request({ method = "POST", body = {}, headers = {}, localAddress = "127.0.0.1", remoteAddress = "127.0.0.1", query = {} } = {}) {
  return {
    method,
    body,
    headers: { host: "127.0.0.1:4173", ...headers },
    rawHeaders: [],
    query,
    socket: { localAddress, remoteAddress, encrypted: false },
  };
}

async function invoke(handler, req) {
  const res = response();
  await handler(req, res);
  return res;
}

const local = { CRM_ICP_V2_API_MODE: "LOCAL_ONLY" };
const preview = {
  CRM_ICP_V2_API_MODE: "PREVIEW_REHEARSAL",
  CRM_ICP_V2_API_BATCH: CRM_ICP_V2_API_PREVIEW_BATCH,
  VERCEL: "1",
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: CRM_ICP_V2_API_PREVIEW_BRANCH,
  CRM_PIPELINE_RUNTIME_MODE: "DISABLED",
  CRM_PIPELINE_MUTATION_MODE: "DISABLED",
  COMMERCIAL_TENANCY_MUTATION_MODE: "DISABLED",
  MT01B_AUTH_MODE: "LEGACY",
  MT01B_TENANT_SWITCH_ENABLED: "false",
  VITE_MT01B2_CLIENT_ENABLED: "false",
};
const context = { tenantId: "tenant", membershipId: "membership", userId: "user", role: "V" };
const caseRef = randomUUID();
const clientRef = randomUUID();

let authCalls = 0;
let executeCalls = 0;
const disabled = createIcpV2PipelineCaseHandler({
  env: {},
  prismaClient: {},
  resolveContext: async () => { authCalls += 1; return context; },
  execute: async () => { executeCalls += 1; },
});
const disabledResponse = await invoke(disabled, request());
check("DISABLED precede auth, body y dominio", disabledResponse.statusCode === 409
  && disabledResponse.body?.error === "CRM_ICP_V2_API_DISABLED" && authCalls === 0 && executeCalls === 0);
const disabledOptions = await invoke(disabled, request({ method: "OPTIONS", body: undefined }));
check("OPTIONS no atraviesa un gate desactivado", disabledOptions.statusCode === 409 && authCalls === 0);

const external = createIcpV2PipelineCaseHandler({
  env: local,
  prismaClient: {},
  resolveContext: async () => { authCalls += 1; return context; },
  execute: async () => { executeCalls += 1; },
});
const externalResponse = await invoke(external, request({ headers: {
  origin: "https://attacker.invalid",
  host: "127.0.0.1:4173",
  "x-forwarded-proto": "http",
} }));
check("same-origin se aplica antes de auth", externalResponse.statusCode === 403
  && externalResponse.body?.error === "CRM_ICP_V2_ORIGIN_FORBIDDEN" && authCalls === 0);

const proxyLoopback = await invoke(external, request({ remoteAddress: "203.0.113.10", headers: { "x-forwarded-for": "127.0.0.1" } }));
check("LOCAL_ONLY usa sockets reales", proxyLoopback.statusCode === 503
  && proxyLoopback.body?.error === "CRM_ICP_V2_API_CONFIGURATION_INVALID" && authCalls === 0);
const productionLocal = await invoke(createIcpV2PipelineCaseHandler({ env: { ...local, VERCEL_ENV: "production" } }), request());
check("LOCAL_ONLY nunca acepta señal Production", productionLocal.statusCode === 503);

for (const [name, overrides] of [
  ["rama main", { VERCEL_GIT_COMMIT_REF: "main" }],
  ["batch distinto", { CRM_ICP_V2_API_BATCH: "OTHER" }],
  ["lectura CRM activa", { CRM_PIPELINE_RUNTIME_MODE: "PREVIEW_REHEARSAL" }],
  ["mutación CRM activa", { CRM_PIPELINE_MUTATION_MODE: "PRODUCTION_PILOT" }],
  ["mutación comercial activa", { COMMERCIAL_TENANCY_MUTATION_MODE: "LOCAL_ONLY" }],
]) {
  const result = await invoke(createIcpV2PipelineCaseHandler({ env: { ...preview, ...overrides } }), request({
    localAddress: "10.0.0.8", remoteAddress: "10.0.0.9",
  }));
  check(`Preview alterado (${name}) falla cerrado`, result.statusCode === 503
    && result.body?.error === "CRM_ICP_V2_API_CONFIGURATION_INVALID");
}

const created = createIcpV2PipelineCaseHandler({
  env: local,
  prismaClient: { marker: true },
  resolveContext: async (_req, options) => {
    check("auth recibe Prisma y env server-side", options.prisma.marker === true && options.env === local);
    return context;
  },
  execute: async ({ context: received, input, prisma }) => {
    check("dominio recibe contexto, body y Prisma", received === context && input.requestId === "request-1234" && prisma.marker === true);
    return { case: { caseRef, version: 1, route: { revision: 1 }, client: { clientRef } }, replayed: false };
  },
});
const createdResponse = await invoke(created, request({ body: { requestId: "request-1234" } }));
check("crear responde contrato público mínimo", createdResponse.statusCode === 201
  && createdResponse.body?.data?.caseRef === caseRef && createdResponse.body?.data?.clientRef === clientRef
  && createdResponse.body?.data?.routeRevision === 1 && createdResponse.body?.replayed === false);
check("respuesta es privada, sin CORS y varía por identidad/origen", createdResponse.getHeader("cache-control") === "private, no-store"
  && String(createdResponse.getHeader("vary")).includes("Authorization")
  && String(createdResponse.getHeader("vary")).includes("Origin")
  && !createdResponse.headers.has("access-control-allow-origin"));

const wrongMethod = await invoke(created, request({ method: "GET", body: undefined }));
check("método incorrecto no autentica", wrongMethod.statusCode === 405 && wrongMethod.getHeader("allow") === "POST");
const options = await invoke(created, request({ method: "OPTIONS", body: undefined }));
check("OPTIONS habilitado responde 204 sin auth", options.statusCode === 204);

const fingerprint = "a".repeat(64);
const duplicate = createIcpV2PipelineCaseHandler({
  env: local,
  prismaClient: {},
  resolveContext: async () => context,
  execute: async () => { throw new CrmIcpV2ApiError("CRM_ICP_CLIENT_DUPLICATE_CONFIRMATION_REQUIRED", 409, { matchFingerprint: fingerprint, forbidden: "PII" }); },
});
const duplicateResponse = await invoke(duplicate, request({ body: { probe: true } }));
check("conflicto parcial sólo publica fingerprint opaco", duplicateResponse.statusCode === 409
  && duplicateResponse.body?.data?.matchFingerprint === fingerprint
  && !JSON.stringify(duplicateResponse.body).includes("PII"));
const unexpected = createIcpV2PipelineCaseHandler({
  env: local,
  prismaClient: {},
  resolveContext: async () => context,
  execute: async () => { throw new Error("postgresql://secret private@example.invalid"); },
});
const unexpectedResponse = await invoke(unexpected, request({ body: { probe: true } }));
check("error inesperado no filtra mensaje", unexpectedResponse.statusCode === 503
  && unexpectedResponse.body?.error === "CRM_ICP_DATABASE_UNAVAILABLE"
  && !JSON.stringify(unexpectedResponse.body).includes("secret"));

const search = createIcpV2ClientSearchHandler({
  env: preview,
  prismaClient: {},
  resolveContext: async () => context,
  execute: async ({ input }) => ({ total: 1, page: input.page, pageSize: input.pageSize, data: [{ clientRef }] }),
});
const searchResponse = await invoke(search, request({
  body: { query: "Synthetic", page: 2, pageSize: 20 },
  localAddress: "10.0.0.8", remoteAddress: "10.0.0.9",
}));
check("búsqueda POST funciona en Preview exacto", searchResponse.statusCode === 200
  && searchResponse.body?.page === 2 && searchResponse.body?.data?.[0]?.clientRef === clientRef);

const detail = createIcpV2PipelineCaseDetailHandler({
  env: local,
  prismaClient: {},
  resolveContext: async () => context,
  execute: async ({ req }) => ({ caseRef: req.query.caseKey, route: { revision: 1 } }),
});
const head = await invoke(detail, request({ method: "HEAD", body: undefined, query: { caseKey: caseRef } }));
check("detalle admite HEAD sin body", head.statusCode === 200 && head.body === null);
const detailResponse = await invoke(detail, request({ method: "GET", body: undefined, query: { caseKey: caseRef } }));
check("detalle GET conserva referencia pública", detailResponse.statusCode === 200
  && detailResponse.body?.data?.caseRef === caseRef);

process.stdout.write(`${JSON.stringify({ ok: true, assertions: assertions.length, results: assertions }, null, 2)}\n`);
