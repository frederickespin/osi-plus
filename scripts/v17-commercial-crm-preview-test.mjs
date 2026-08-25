import assert from "node:assert/strict";
import { signAccessToken } from "../api/_lib/auth.js";
import {
  CRM_PIPELINE_READ_MODES,
  requireCrmPipelinePermission,
  resolveCrmPipelineContext,
  resolveCrmPipelineModes,
} from "../api/_lib/crmPipelineAccess.js";
import { resolveCommercialTenancyModes } from "../api/_lib/commercialTenancyWrite.js";
import { createPipelineCasesListHandler } from "../api/crm/pipeline-cases/index.js";
import { createPipelineTransitionHandler } from "../api/crm/pipeline-cases/[caseKey]/transition.js";
import { createPipelineOwnerOptionsHandler } from "../api/crm/pipeline-owner-options.js";
import {
  V17_COMMERCIAL_CRM_PREVIEW_BATCH,
  V17_COMMERCIAL_CRM_PREVIEW_BRANCH,
  V17_COMMERCIAL_CRM_PREVIEW_MODE,
  isExactV17CommercialCrmPreviewServerEnvironment,
  resolveV17CommercialCrmPreviewClientAuthority,
} from "../shared/v17CommercialCrmPreview.js";

let passed = 0;
function check(name, condition) {
  assert.equal(Boolean(condition), true, name);
  passed += 1;
}

function expectConfigurationError(name, operation) {
  let error;
  try { operation(); } catch (caught) { error = caught; }
  check(name, error?.code === "CRM_PIPELINE_CONFIGURATION_INVALID" && error?.status === 503);
}

function response() {
  return {
    statusCode: 200,
    headers: new Map(),
    body: undefined,
    setHeader(name, value) { this.headers.set(String(name).toLowerCase(), value); },
    getHeader(name) { return this.headers.get(String(name).toLowerCase()); },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}

async function invoke(handler, request) {
  const res = response();
  await handler(request, res);
  return res;
}

const exactPreview = Object.freeze({
  VERCEL: "1",
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: V17_COMMERCIAL_CRM_PREVIEW_BRANCH,
  CRM_PIPELINE_RUNTIME_MODE: V17_COMMERCIAL_CRM_PREVIEW_MODE,
  CRM_PIPELINE_MUTATION_MODE: "DISABLED",
  CRM_PIPELINE_ACTIVATION_BATCH: V17_COMMERCIAL_CRM_PREVIEW_BATCH,
  VITE_OSI_HUB_MODE: V17_COMMERCIAL_CRM_PREVIEW_MODE,
  VITE_CRM_PIPELINE_CLIENT_MODE: V17_COMMERCIAL_CRM_PREVIEW_MODE,
  VITE_CRM_PIPELINE_READ_MODE: V17_COMMERCIAL_CRM_PREVIEW_MODE,
  VITE_V17_COMMERCIAL_CRM_PREVIEW_BATCH: V17_COMMERCIAL_CRM_PREVIEW_BATCH,
  MT01B_AUTH_MODE: "LEGACY",
  MT01B_TENANT_SWITCH_ENABLED: "false",
  VITE_MT01B2_CLIENT_ENABLED: "false",
  COMMERCIAL_TENANCY_WRITE_MODE: "TENANT_WRITE",
  COMMERCIAL_TENANCY_READ_MODE: "TENANT_READ",
  COMMERCIAL_TENANCY_MUTATION_MODE: "DISABLED",
  COMMERCIAL_TENANCY_ACTIVATION_BATCH: "MT-01C2B2-IPACKERS-DO-V1",
});

check("defaults CRM disabled", resolveCrmPipelineModes({}).readMode === "DISABLED" && resolveCrmPipelineModes({}).mutationMode === "DISABLED");
check("production without variables remains fully disabled", resolveCrmPipelineModes({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }).readMode === "DISABLED"
  && resolveCrmPipelineModes({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }).mutationMode === "DISABLED");
check("local read remains available off Vercel", resolveCrmPipelineModes({ CRM_PIPELINE_RUNTIME_MODE: "READ_ONLY" }).readMode === "READ_ONLY");
check("exact preview certified", isExactV17CommercialCrmPreviewServerEnvironment(exactPreview));
check("preview read only enabled", resolveCrmPipelineModes(exactPreview).readMode === CRM_PIPELINE_READ_MODES.PREVIEW_REHEARSAL && resolveCrmPipelineModes(exactPreview).preview === true);
check("preview case mutations require the same exact authority", resolveCrmPipelineModes({ ...exactPreview, CRM_PIPELINE_MUTATION_MODE: V17_COMMERCIAL_CRM_PREVIEW_MODE }).mutationMode === V17_COMMERCIAL_CRM_PREVIEW_MODE);
const exactPreviewWrite = Object.freeze({ ...exactPreview, CRM_PIPELINE_MUTATION_MODE: V17_COMMERCIAL_CRM_PREVIEW_MODE });
check("commercial tenant authority accepts exact isolated preview", resolveCommercialTenancyModes(exactPreview).tenantMode === true);

for (const [name, overrides] of [
  ["production rejected", { VERCEL_ENV: "production" }],
  ["main rejected", { VERCEL_GIT_COMMIT_REF: "main" }],
  ["other branch rejected", { VERCEL_GIT_COMMIT_REF: "feature/other" }],
  ["batch absent rejected", { CRM_PIPELINE_ACTIVATION_BATCH: undefined }],
  ["batch mismatch rejected", { CRM_PIPELINE_ACTIVATION_BATCH: "OTHER" }],
  ["hybrid rejected", { MT01B_AUTH_MODE: "HYBRID" }],
  ["tenant switch rejected", { MT01B_TENANT_SWITCH_ENABLED: "true" }],
  ["client V2 rejected", { VITE_MT01B2_CLIENT_ENABLED: "true" }],
  ["frontend read mode rejected", { VITE_CRM_PIPELINE_READ_MODE: "DISABLED" }],
  ["commercial mutation gate rejected", { COMMERCIAL_TENANCY_MUTATION_MODE: "LOCAL_ONLY" }],
  ["mutation mode rejected", { CRM_PIPELINE_MUTATION_MODE: "LOCAL_ONLY" }],
  ["commercial legacy rejected", { COMMERCIAL_TENANCY_WRITE_MODE: "LEGACY_ONLY", COMMERCIAL_TENANCY_READ_MODE: "LEGACY_ONLY", COMMERCIAL_TENANCY_ACTIVATION_BATCH: undefined }],
]) expectConfigurationError(name, () => resolveCrmPipelineModes({ ...exactPreview, ...overrides }));

for (const value of ["preview_rehearsal", " PREVIEW_REHEARSAL", "PREVIEW_REHEARSAL ", '"PREVIEW_REHEARSAL"', "\uFEFFPREVIEW_REHEARSAL", "PREVIEW_REHEARSAL\r", "PREVIEW_REHEARSAL\n", "UNKNOWN"]) {
  expectConfigurationError(`valor exacto rechazado ${JSON.stringify(value)}`, () => resolveCrmPipelineModes({ ...exactPreview, CRM_PIPELINE_RUNTIME_MODE: value }));
}

const exactClient = Object.freeze({
  hubMode: V17_COMMERCIAL_CRM_PREVIEW_MODE,
  clientMode: V17_COMMERCIAL_CRM_PREVIEW_MODE,
  readMode: V17_COMMERCIAL_CRM_PREVIEW_MODE,
  batch: V17_COMMERCIAL_CRM_PREVIEW_BATCH,
  vercelEnvironment: "preview",
  gitBranch: V17_COMMERCIAL_CRM_PREVIEW_BRANCH,
  hostname: "preview.example.test",
});
check("frontend exact preview enabled", resolveV17CommercialCrmPreviewClientAuthority(exactClient).enabled);
for (const [name, overrides] of [
  ["frontend local simulation rejected", { hostname: "127.0.0.1" }],
  ["frontend production rejected", { vercelEnvironment: "production" }],
  ["frontend partial hub rejected", { hubMode: "DISABLED" }],
  ["frontend partial client rejected", { clientMode: "DISABLED" }],
  ["frontend partial read rejected", { readMode: "DISABLED" }],
  ["frontend batch rejected", { batch: `${V17_COMMERCIAL_CRM_PREVIEW_BATCH}\n` }],
]) check(name, !resolveV17CommercialCrmPreviewClientAuthority({ ...exactClient, ...overrides }).enabled);

let permissionCalls = 0;
let databaseCalls = 0;
const invalidHandler = createPipelineCasesListHandler({
  env: { ...exactPreview, VERCEL_GIT_COMMIT_REF: "main" },
  requirePermission: async () => { permissionCalls += 1; return null; },
  prismaClient: new Proxy({}, { get() { databaseCalls += 1; return undefined; } }),
});
const invalidResponse = await invoke(invalidHandler, {
  method: "POST",
  headers: {},
  query: {},
  get body() { throw new Error("body must not be read"); },
});
check("invalid read gate returns sanitized 503", invalidResponse.statusCode === 503 && invalidResponse.body?.error === "CRM_PIPELINE_CONFIGURATION_INVALID");
check("invalid read gate precedes auth and Prisma", permissionCalls === 0 && databaseCalls === 0);

const mutationResponse = await invoke(createPipelineTransitionHandler({
  env: exactPreviewWrite,
  resolveContext: async () => { throw new Error("auth must not run"); },
  execute: async () => { throw new Error("write must not run"); },
}), {
  method: "POST",
  headers: {},
  query: {},
  get body() { throw new Error("body must not be read"); },
});
check("preview mutation remains disabled before auth/body", mutationResponse.statusCode === 409 && mutationResponse.body?.code === "CRM_PIPELINE_MUTATIONS_DISABLED");
const ownerResponse = await invoke(createPipelineOwnerOptionsHandler({
  env: exactPreviewWrite,
  resolveContext: async () => { throw new Error("owner auth must not run"); },
  listOptions: async () => { throw new Error("owner query must not run"); },
}), { method: "GET", headers: {}, query: {} });
check("owner options remain disabled", ownerResponse.statusCode === 409 && ownerResponse.body?.code === "CRM_PIPELINE_MUTATIONS_DISABLED");

const readDatabase = {
  pipelineCase: {
    count: async () => 0,
    findMany: async () => [],
  },
  $transaction: async (operations) => Promise.all(operations),
};
const validRead = await invoke(createPipelineCasesListHandler({
  env: exactPreview,
  prismaClient: readDatabase,
  requirePermission: async () => ({ tenantId: "tenant-synthetic" }),
}), {
  method: "GET",
  headers: {
    origin: "https://preview.example.test",
    host: "preview.example.test",
    "x-forwarded-proto": "https",
  },
  query: {},
});
check("valid preview list is read only", validRead.statusCode === 200 && validRead.body?.total === 0);
check("protected cache and vary headers", validRead.getHeader("cache-control") === "private, no-store" && validRead.getHeader("vary") === "Authorization, Origin");
check("no permissive CORS or credentials", !validRead.getHeader("access-control-allow-origin") && !validRead.getHeader("access-control-allow-credentials"));

const previousSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = "v17-preview-test-secret-that-is-long-enough-000000000000";
try {
  const token = signAccessToken({ sub: "user-synthetic", email: "actor@example.invalid", role: "A" });
  let contextQueries = 0;
  const contextDatabase = {
    $queryRaw: async () => {
      contextQueries += 1;
      return [{
        tenant_id: "tenant-synthetic",
        membership_id: "membership-synthetic",
        user_id: "user-synthetic",
        membership_role: "A",
        membership_status: "ACTIVE",
        granted_permissions: [],
        denied_permissions: [],
        authorization_version: 1,
        tenant_status: "ACTIVE",
        user_status: "active",
      }];
    },
  };
  const request = () => ({ headers: { authorization: `Bearer ${token}`, "x-osi-role": "G", "x-osi-userid": "forged" }, rawHeaders: ["Authorization", `Bearer ${token}`] });
  const first = await resolveCrmPipelineContext(request(), { env: exactPreview, prisma: contextDatabase });
  const second = await resolveCrmPipelineContext(request(), { env: exactPreview, prisma: contextDatabase });
  check("authority comes from membership not forged headers", first.role === "A" && first.userId === "user-synthetic" && first.tenantId === "tenant-synthetic");
  check("each request revalidates context", second.role === "A" && contextQueries === 2);
  const deniedDatabase = { $queryRaw: async () => [{
    tenant_id: "tenant-synthetic", membership_id: "membership-synthetic", user_id: "user-synthetic",
    membership_role: "A", membership_status: "ACTIVE", granted_permissions: [], denied_permissions: ["pipeline:view"],
    authorization_version: 1, tenant_status: "ACTIVE", user_status: "active",
  }] };
  let denied;
  try { await requireCrmPipelinePermission(request(), "pipeline:view", { env: exactPreview, prisma: deniedDatabase }); } catch (error) { denied = error; }
  check("deniedPermissions prevails", denied?.status === 403 && denied?.code === "COMMERCIAL_PERMISSION_FORBIDDEN");
} finally {
  if (previousSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousSecret;
}

console.log(JSON.stringify({ ok: true, passed, previewMode: V17_COMMERCIAL_CRM_PREVIEW_MODE, writes: 0 }));
