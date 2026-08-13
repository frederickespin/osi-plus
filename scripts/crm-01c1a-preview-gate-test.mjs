import {
  CRM01C1A_PREVIEW_BATCH,
  CRM01C1A_PREVIEW_BRANCH_ID,
  CRM01C1A_PREVIEW_DATABASE,
  CRM01C1A_PREVIEW_GIT_REF,
  crm01c1aPreviewOrigin,
  isCrm01c1aPreviewDatabaseUrl,
  isCrm01c1aPreviewRehearsal,
} from "../api/_lib/crmPreviewRehearsal.js";
import { resolveCommercialTenancyModes } from "../api/_lib/commercialTenancyWrite.js";
import { resolveCrmPipelineModes } from "../api/_lib/crmPipelineAccess.js";

const sha = "a".repeat(40);
const valid = Object.freeze({
  VERCEL: "1",
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: CRM01C1A_PREVIEW_GIT_REF,
  VERCEL_GIT_COMMIT_SHA: sha,
  VERCEL_URL: "crm01c1a-example.vercel.app",
  CRM01C1A_EXPECTED_GIT_SHA: sha,
  CRM01C1A_DATABASE_NAME: CRM01C1A_PREVIEW_DATABASE,
  CRM01C1A_NEON_BRANCH_ID: CRM01C1A_PREVIEW_BRANCH_ID,
  CRM_PIPELINE_RUNTIME_MODE: "PREVIEW_READ",
  CRM_PIPELINE_MUTATION_MODE: "PREVIEW_WRITE",
  CRM_PIPELINE_ACTIVATION_BATCH: CRM01C1A_PREVIEW_BATCH,
  CRM_PIPELINE_OWNER_REF_SECRET: "A".repeat(64),
  COMMERCIAL_TENANCY_READ_MODE: "TENANT_READ",
  COMMERCIAL_TENANCY_WRITE_MODE: "TENANT_WRITE",
  COMMERCIAL_TENANCY_ACTIVATION_BATCH: "MT-01C2B2-IPACKERS-DO-V1",
  MT01B_AUTH_MODE: "LEGACY",
  MT01B_TENANT_SWITCH_ENABLED: "false",
  VITE_MT01B2_CLIENT_ENABLED: "false",
});
const results = [];
function check(name, condition) {
  results.push({ name, passed: Boolean(condition) });
  if (!condition) throw new Error(name);
}
function rejected(name, env) {
  let crmError;
  let commercialError;
  try { resolveCrmPipelineModes(env); } catch (error) { crmError = error; }
  try { resolveCommercialTenancyModes(env); } catch (error) { commercialError = error; }
  check(name, crmError?.status === 503 || commercialError?.status === 503);
}

try {
  check("matriz Preview exacta", isCrm01c1aPreviewRehearsal(valid));
  check("modos CRM Preview coordinados", resolveCrmPipelineModes(valid).preview === true);
  check("tenancy comercial Preview coordinada", resolveCommercialTenancyModes(valid).tenantMode === true);
  check("origen directo exacto", crm01c1aPreviewOrigin(valid) === `https://${valid.VERCEL_URL}`);
  const localUrl = new URL(`postgresql:${"/".repeat(2)}u:p@127.0.0.1:55432/${CRM01C1A_PREVIEW_DATABASE}`);
  localUrl.searchParams.set("schema", "osi");
  check("URL pooled exige base y schema", isCrm01c1aPreviewDatabaseUrl(localUrl.toString(), valid));
  check("sin variables permanece desactivado", resolveCrmPipelineModes({}).readMode === "DISABLED");

  const mutations = [
    ["Production", { VERCEL_ENV: "production" }],
    ["Development", { VERCEL_ENV: "development" }],
    ["rama", { VERCEL_GIT_COMMIT_REF: "main" }],
    ["SHA runtime", { VERCEL_GIT_COMMIT_SHA: "b".repeat(40) }],
    ["SHA esperado", { CRM01C1A_EXPECTED_GIT_SHA: "b".repeat(40) }],
    ["batch CRM", { CRM_PIPELINE_ACTIVATION_BATCH: `${CRM01C1A_PREVIEW_BATCH}x` }],
    ["database", { CRM01C1A_DATABASE_NAME: "neondb" }],
    ["branch ID", { CRM01C1A_NEON_BRANCH_ID: "br-wrong" }],
    ["batch C2B2", { COMMERCIAL_TENANCY_ACTIVATION_BATCH: "wrong" }],
    ["lectura comercial", { COMMERCIAL_TENANCY_READ_MODE: "LEGACY_ONLY" }],
    ["escritura comercial", { COMMERCIAL_TENANCY_WRITE_MODE: "LEGACY_ONLY" }],
    ["HYBRID", { MT01B_AUTH_MODE: "HYBRID" }],
    ["tenant switch", { MT01B_TENANT_SWITCH_ENABLED: "true" }],
    ["cliente V2", { VITE_MT01B2_CLIENT_ENABLED: "true" }],
    ["host ausente", { VERCEL_URL: undefined }],
  ];
  for (const [name, replacement] of mutations) rejected(`rechaza ${name}`, { ...valid, ...replacement });
  for (const suffix of [" ", "\n", "\r\n", "\uFEFF", '"']) {
    rejected(`rechaza representación ${JSON.stringify(suffix)}`, { ...valid, CRM01C1A_DATABASE_NAME: `${CRM01C1A_PREVIEW_DATABASE}${suffix}` });
  }
  const wrongDatabase = new URL(localUrl); wrongDatabase.pathname = "/neondb";
  const wrongSchema = new URL(localUrl); wrongSchema.searchParams.set("schema", "public");
  check("rechaza URL neondb", !isCrm01c1aPreviewDatabaseUrl(wrongDatabase.toString(), valid));
  check("rechaza schema distinto", !isCrm01c1aPreviewDatabaseUrl(wrongSchema.toString(), valid));
  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, assertions: results.filter((item) => item.passed).length, error: error.message, results }, null, 2)}\n`);
  process.exitCode = 1;
}
