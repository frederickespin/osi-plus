import assert from "node:assert/strict";
import {
  V17_COMMERCIAL_CRM_PREVIEW_BATCH,
  V17_COMMERCIAL_CRM_PREVIEW_MODE,
  V17_OSI_PLUS_TOOLS_PREVIEW_BRANCH,
} from "../shared/v17CommercialCrmPreview.js";
import {
  hasV17OsiPlusToolsPreviewServerSignal,
  isExactV17OsiPlusToolsPreviewServerEnvironment,
  resolveV17OsiPlusToolsPreviewClientAuthority,
} from "../shared/v17OsiPlusToolsPreview.js";

const exact = Object.freeze({
  VERCEL: "1",
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: V17_OSI_PLUS_TOOLS_PREVIEW_BRANCH,
  VITE_OSI_HUB_MODE: V17_COMMERCIAL_CRM_PREVIEW_MODE,
  VITE_CRM_PIPELINE_CLIENT_MODE: "DISABLED",
  VITE_CRM_PIPELINE_READ_MODE: "DISABLED",
  VITE_V17_COMMERCIAL_CRM_PREVIEW_BATCH: V17_COMMERCIAL_CRM_PREVIEW_BATCH,
  CRM_PIPELINE_RUNTIME_MODE: "DISABLED",
  CRM_PIPELINE_MUTATION_MODE: "DISABLED",
  MT01B_AUTH_MODE: "LEGACY",
  MT01B_TENANT_SWITCH_ENABLED: "false",
  VITE_MT01B2_CLIENT_ENABLED: "false",
  COMMERCIAL_TENANCY_WRITE_MODE: "LEGACY_ONLY",
  COMMERCIAL_TENANCY_READ_MODE: "LEGACY_ONLY",
  COMMERCIAL_TENANCY_MUTATION_MODE: "DISABLED",
});

assert.equal(hasV17OsiPlusToolsPreviewServerSignal(exact), true);
assert.equal(isExactV17OsiPlusToolsPreviewServerEnvironment(exact), true);
assert.equal(resolveV17OsiPlusToolsPreviewClientAuthority({
  hubMode: exact.VITE_OSI_HUB_MODE,
  clientMode: exact.VITE_CRM_PIPELINE_CLIENT_MODE,
  readMode: exact.VITE_CRM_PIPELINE_READ_MODE,
  batch: exact.VITE_V17_COMMERCIAL_CRM_PREVIEW_BATCH,
  vercelEnvironment: exact.VERCEL_ENV,
  gitBranch: exact.VERCEL_GIT_COMMIT_REF,
  hostname: "preview.example.test",
}).enabled, true);

for (const overrides of [
  { VERCEL_ENV: "production" },
  { VERCEL_GIT_COMMIT_REF: "main" },
  { CRM_PIPELINE_RUNTIME_MODE: V17_COMMERCIAL_CRM_PREVIEW_MODE },
  { CRM_PIPELINE_MUTATION_MODE: V17_COMMERCIAL_CRM_PREVIEW_MODE },
  { CRM_PIPELINE_ACTIVATION_BATCH: V17_COMMERCIAL_CRM_PREVIEW_BATCH },
  { COMMERCIAL_TENANCY_WRITE_MODE: "TENANT_WRITE" },
  { COMMERCIAL_TENANCY_READ_MODE: "TENANT_READ" },
  { COMMERCIAL_TENANCY_MUTATION_MODE: "LOCAL_ONLY" },
]) assert.equal(isExactV17OsiPlusToolsPreviewServerEnvironment({ ...exact, ...overrides }), false);

console.log(JSON.stringify({ ok: true, authority: "HUB_ONLY", crmRead: false, crmWrites: false, production: false }));
