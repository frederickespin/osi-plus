import assert from "node:assert/strict";
import {
  createPersonnelPoliciesHandler,
  PERSONNEL_POLICIES_PREVIEW_BATCH,
  PERSONNEL_POLICIES_PREVIEW_DATABASE,
  PERSONNEL_POLICIES_PREVIEW_NEON_BRANCH,
  personnelPoliciesPreviewManifest,
  resolvePersonnelPoliciesApiMode,
} from "../api/_lib/personnelPoliciesHttp.js";

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
    end() {
      return this;
    },
  };
}
const request = (method = "GET", origin) => ({
  method,
  headers: { host: "127.0.0.1:4173", ...(origin ? { origin } : {}) },
  socket: { localAddress: "127.0.0.1", remoteAddress: "127.0.0.1" },
  [Symbol.asyncIterator]: async function* () {
    yield Buffer.from('{"operation":"ATTEMPT"}');
  },
});
let checks = 0;
const pass = (condition, message) => {
  assert.ok(condition, message);
  checks += 1;
};
let auth = 0;
let prisma = 0;
let execute = 0;
const disabled = createPersonnelPoliciesHandler({
  env: { PERSONNEL_POLICIES_API_MODE: "DISABLED" },
  prismaClient: new Proxy(
    {},
    {
      get() {
        prisma += 1;
      },
    },
  ),
  resolveContext: async () => {
    auth += 1;
  },
  execute: async () => {
    execute += 1;
  },
});
const blocked = response();
await disabled(request("POST"), blocked);
pass(
  blocked.statusCode === 409 &&
    blocked.body.error === "PERSONNEL_POLICIES_DISABLED",
  "gate estable",
);
pass(
  auth === 0 && prisma === 0 && execute === 0,
  "gate antes de auth, body y Prisma",
);
pass(
  blocked.headers["Cache-Control"] === "private, no-store" &&
    /Authorization/.test(blocked.headers.Vary) &&
    /Origin/.test(blocked.headers.Vary),
  "headers privados",
);
assert.throws(
  () =>
    resolvePersonnelPoliciesApiMode(
      { PERSONNEL_POLICIES_API_MODE: "LOCAL_ONLY", VERCEL: "1" },
      request(),
    ),
  /CONFIGURATION_INVALID/,
);
checks += 1;
assert.throws(
  () =>
    resolvePersonnelPoliciesApiMode(
      { PERSONNEL_POLICIES_API_MODE: "local_only" },
      request(),
    ),
  /CONFIGURATION_INVALID/,
);
checks += 1;
assert.throws(
  () =>
    resolvePersonnelPoliciesApiMode(
      { PERSONNEL_POLICIES_API_MODE: "LOCAL_ONLY" },
      {
        ...request(),
        socket: { localAddress: "10.0.0.2", remoteAddress: "10.0.0.3" },
      },
    ),
  /CONFIGURATION_INVALID/,
);
checks += 1;
const local = createPersonnelPoliciesHandler({
  env: { PERSONNEL_POLICIES_API_MODE: "LOCAL_ONLY" },
  prismaClient: {},
  resolveContext: async () => ({
    tenantId: "t",
    membershipId: "m",
    userId: "u",
  }),
  execute: async ({ method }) => ({ method }),
});
const external = response();
await local(request("GET", "https://example.invalid"), external);
pass(
  external.statusCode === 403 &&
    !Object.keys(external.headers).some(
      (key) => key.toLowerCase() === "access-control-allow-origin",
    ),
  "origen externo cerrado",
);
const sameOrigin = response();
await local(request("GET", "http://127.0.0.1:4173"), sameOrigin);
pass(
  sameOrigin.statusCode === 200 && sameOrigin.body.data.method === "GET",
  "same-origin permitido",
);
const head = response();
await local(request("HEAD"), head);
pass(head.statusCode === 200 && head.body === null, "HEAD sin body");
const options = response();
await local(request("OPTIONS", "http://127.0.0.1:4173"), options);
pass(
  options.statusCode === 204 &&
    !("Access-Control-Allow-Origin" in options.headers),
  "OPTIONS privado",
);

const previewUrl = [
  "post",
  "gresql://preview@",
  "db.example.invalid/",
  PERSONNEL_POLICIES_PREVIEW_DATABASE,
  "?sslmode=require&schema=osi",
].join("");
const previewEnvironment = (overrides = {}) => {
  const manifest = personnelPoliciesPreviewManifest();
  return {
    PERSONNEL_POLICIES_API_MODE: "PREVIEW_REHEARSAL",
    VERCEL: "1",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "feature/v17-consolidated-preview",
    PERSONNEL_POLICIES_PREVIEW_BATCH,
    PERSONNEL_POLICIES_PREVIEW_MANIFEST: manifest.raw,
    PERSONNEL_POLICIES_PREVIEW_MANIFEST_SHA256: manifest.sha256,
    PERSONNEL_POLICIES_PREVIEW_NEON_BRANCH_ID:
      PERSONNEL_POLICIES_PREVIEW_NEON_BRANCH,
    DATABASE_URL: previewUrl,
    DIRECT_URL: previewUrl,
    MT01B_AUTH_MODE: "LEGACY",
    MT01B_TENANT_SWITCH_ENABLED: "false",
    VITE_MT01B2_CLIENT_ENABLED: "false",
    CRM_PIPELINE_RUNTIME_MODE: "PREVIEW_REHEARSAL",
    VITE_OSI_HUB_MODE: "PREVIEW_REHEARSAL",
    VITE_CRM_PIPELINE_CLIENT_MODE: "PREVIEW_REHEARSAL",
    VITE_CRM_PIPELINE_READ_MODE: "PREVIEW_REHEARSAL",
    COMMUNICATIONS_EXTERNAL_TRANSPORT_MODE: "DISABLED",
    COMMUNICATIONS_EXTERNAL_WEBHOOK_MODE: "DISABLED",
    ...overrides,
  };
};
pass(
  resolvePersonnelPoliciesApiMode(previewEnvironment(), request()) ===
    "PREVIEW_REHEARSAL",
  "Preview exacta autorizada",
);
for (const [label, mutate] of [
  ["branch", { VERCEL_GIT_COMMIT_REF: "feature/wrong" }],
  ["Production", { VERCEL_ENV: "production" }],
  ["manifest", { PERSONNEL_POLICIES_PREVIEW_MANIFEST_SHA256: "0".repeat(64) }],
  ["DB", { DATABASE_URL: previewUrl.replace("preview_10b", "wrong") }],
  ["transport", { COMMUNICATIONS_EXTERNAL_TRANSPORT_MODE: "ENABLED" }],
  ["Auth V2", { VITE_MT01B2_CLIENT_ENABLED: "true" }],
]) {
  assert.throws(
    () =>
      resolvePersonnelPoliciesApiMode(previewEnvironment(mutate), request()),
    /CONFIGURATION_INVALID/,
    label,
  );
  checks += 1;
}
let previewAuth = 0;
const previewHandler = createPersonnelPoliciesHandler({
  env: previewEnvironment(),
  prismaClient: {
    $queryRawUnsafe: async () => [
      {
        database: PERSONNEL_POLICIES_PREVIEW_DATABASE,
        branch: PERSONNEL_POLICIES_PREVIEW_NEON_BRANCH,
      },
    ],
  },
  resolveContext: async () => {
    previewAuth += 1;
    return { tenantId: "tenant", membershipId: "membership", userId: "user" };
  },
  execute: async () => ({ preview: true }),
});
const previewResponse = response();
await previewHandler(request("GET"), previewResponse);
pass(
  previewResponse.statusCode === 200 &&
    previewResponse.body.data.preview === true &&
    previewAuth === 1,
  "Preview valida DB antes de ejecutar",
);
const wrongIdentity = createPersonnelPoliciesHandler({
  env: previewEnvironment(),
  prismaClient: {
    $queryRawUnsafe: async () => [
      { database: "wrong", branch: PERSONNEL_POLICIES_PREVIEW_NEON_BRANCH },
    ],
  },
  resolveContext: async () => {
    previewAuth += 1;
    throw new Error("auth inesperada");
  },
  execute: async () => {
    throw new Error("execute inesperado");
  },
});
const wrongIdentityResponse = response();
await wrongIdentity(request("POST"), wrongIdentityResponse);
pass(
  wrongIdentityResponse.statusCode === 503 && previewAuth === 1,
  "DB Preview incorrecta falla antes de auth/body",
);
console.log(`V17-PERSONNEL-POLICIES-HTTP ${checks}/${checks}`);
