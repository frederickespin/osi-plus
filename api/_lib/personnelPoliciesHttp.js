import { createHash } from "node:crypto";
import { isRealLoopbackRequest } from "./commercialTenancyMutation.js";
import { resolveCrmPipelineContext } from "./crmPipelineAccess.js";
import { setCrmPrivateHeaders } from "./crmHttpHeaders.js";
import {
  methodNotAllowed,
  readJsonObject,
  withPrivateApiHeaders,
} from "./http.js";
import { PersonnelPoliciesError } from "./personnelPoliciesContract.js";
import { isV17ConsolidatedPreviewBranch } from "../../shared/v17ConsolidatedPreview.js";

export const productionApiEnabled = false;
export const PERSONNEL_POLICIES_API_MODES = Object.freeze({
  DISABLED: "DISABLED",
  LOCAL_ONLY: "LOCAL_ONLY",
  PREVIEW_REHEARSAL: "PREVIEW_REHEARSAL",
});
export const PERSONNEL_POLICIES_PREVIEW_BATCH =
  "V17-PERSONNEL-POLICIES-PREVIEW-14B";
export const PERSONNEL_POLICIES_PREVIEW_DATABASE =
  "v17_consolidated_preview_10b";
export const PERSONNEL_POLICIES_PREVIEW_NEON_BRANCH = "br-mute-credit-ahxnvfx0";

const PREVIEW_MANIFEST = Object.freeze({
  batch: PERSONNEL_POLICIES_PREVIEW_BATCH,
  branch: "feature/v17-consolidated-preview",
  database: PERSONNEL_POLICIES_PREVIEW_DATABASE,
  neonBranch: PERSONNEL_POLICIES_PREVIEW_NEON_BRANCH,
  productionApiEnabled: false,
  transport: "DISABLED",
  version: 1,
});

function fail(code, status) {
  throw new PersonnelPoliciesError(code, status);
}
function hasVercel(env) {
  return Object.keys(env || {}).some((key) =>
    key.toUpperCase().startsWith("VERCEL"),
  );
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export function personnelPoliciesPreviewManifest() {
  const raw = canonical(PREVIEW_MANIFEST);
  return Object.freeze({
    raw,
    sha256: createHash("sha256").update(raw, "utf8").digest("hex"),
  });
}
function previewUrlAuthorized(raw) {
  try {
    const url = new URL(raw);
    return (
      ["postgres:", "postgresql:"].includes(url.protocol) &&
      decodeURIComponent(url.pathname.slice(1)) ===
        PERSONNEL_POLICIES_PREVIEW_DATABASE &&
      url.searchParams.get("schema") === "osi" &&
      !/fragrant-night|bitter-bush/i.test(url.hostname)
    );
  } catch {
    return false;
  }
}

export function resolvePersonnelPoliciesApiMode(env = process.env, req) {
  const mode =
    env.PERSONNEL_POLICIES_API_MODE ?? PERSONNEL_POLICIES_API_MODES.DISABLED;
  if (!Object.values(PERSONNEL_POLICIES_API_MODES).includes(mode))
    fail("PERSONNEL_POLICIES_CONFIGURATION_INVALID", 503);
  if (mode === PERSONNEL_POLICIES_API_MODES.DISABLED)
    fail("PERSONNEL_POLICIES_DISABLED", 409);
  if (mode === PERSONNEL_POLICIES_API_MODES.LOCAL_ONLY) {
    if (
      productionApiEnabled !== false ||
      hasVercel(env) ||
      !isRealLoopbackRequest(req)
    )
      fail("PERSONNEL_POLICIES_CONFIGURATION_INVALID", 503);
    return mode;
  }
  const manifest = personnelPoliciesPreviewManifest();
  const checks = Object.freeze({
    PRODUCTION_API_DISABLED: productionApiEnabled === false,
    VERCEL_PREVIEW: env.VERCEL === "1" && env.VERCEL_ENV === "preview",
    PREVIEW_BRANCH: isV17ConsolidatedPreviewBranch(env.VERCEL_GIT_COMMIT_REF),
    PREVIEW_BATCH:
      env.PERSONNEL_POLICIES_PREVIEW_BATCH === PERSONNEL_POLICIES_PREVIEW_BATCH,
    PREVIEW_MANIFEST: env.PERSONNEL_POLICIES_PREVIEW_MANIFEST === manifest.raw,
    PREVIEW_MANIFEST_SHA256:
      env.PERSONNEL_POLICIES_PREVIEW_MANIFEST_SHA256 === manifest.sha256,
    PREVIEW_NEON_BRANCH:
      env.PERSONNEL_POLICIES_PREVIEW_NEON_BRANCH_ID ===
      PERSONNEL_POLICIES_PREVIEW_NEON_BRANCH,
    DATABASE_URL: previewUrlAuthorized(env.DATABASE_URL),
    DIRECT_URL: previewUrlAuthorized(env.DIRECT_URL),
    AUTH_LEGACY: env.MT01B_AUTH_MODE === "LEGACY",
    TENANT_SWITCH_DISABLED: env.MT01B_TENANT_SWITCH_ENABLED === "false",
    AUTH_V2_DISABLED: env.VITE_MT01B2_CLIENT_ENABLED === "false",
    CRM_RUNTIME_PREVIEW: env.CRM_PIPELINE_RUNTIME_MODE === "PREVIEW_REHEARSAL",
    HUB_PREVIEW: env.VITE_OSI_HUB_MODE === "PREVIEW_REHEARSAL",
    CRM_CLIENT_PREVIEW:
      env.VITE_CRM_PIPELINE_CLIENT_MODE === "PREVIEW_REHEARSAL",
    CRM_READ_PREVIEW: env.VITE_CRM_PIPELINE_READ_MODE === "PREVIEW_REHEARSAL",
    EXTERNAL_TRANSPORT_DISABLED:
      env.COMMUNICATIONS_EXTERNAL_TRANSPORT_MODE === "DISABLED",
    EXTERNAL_WEBHOOK_DISABLED:
      env.COMMUNICATIONS_EXTERNAL_WEBHOOK_MODE === "DISABLED",
  });
  const failures = Object.entries(checks)
    .filter(([, valid]) => !valid)
    .map(([name]) => name);
  if (failures.length) {
    if (env.VERCEL === "1")
      console.error("PERSONNEL_POLICIES_PREVIEW_CONFIGURATION_REJECTED", {
        failures,
      });
    fail("PERSONNEL_POLICIES_CONFIGURATION_INVALID", 503);
  }
  return mode;
}

export async function assertPersonnelPoliciesPreviewDatabase(prisma, mode) {
  if (mode !== PERSONNEL_POLICIES_API_MODES.PREVIEW_REHEARSAL) return;
  const [identity] = await prisma.$queryRawUnsafe(
    "SELECT current_database() AS database, current_setting('neon.branch_id', true) AS branch",
  );
  if (
    identity?.database !== PERSONNEL_POLICIES_PREVIEW_DATABASE ||
    identity?.branch !== PERSONNEL_POLICIES_PREVIEW_NEON_BRANCH
  )
    fail("PERSONNEL_POLICIES_CONFIGURATION_INVALID", 503);
}
function header(req, name) {
  const value =
    req?.headers?.[name] ??
    req?.headers?.[
      name.replace(
        /(^|-)([a-z])/g,
        (_match, dash, letter) => `${dash}${letter.toUpperCase()}`,
      )
    ];
  return Array.isArray(value) ? null : value;
}
function assertSameOrigin(req) {
  const origin = header(req, "origin");
  if (origin === undefined) return;
  const host = header(req, "host");
  const protocol =
    header(req, "x-forwarded-proto") ??
    (req?.socket?.encrypted ? "https" : "http");
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    fail("PERSONNEL_POLICIES_ORIGIN_FORBIDDEN", 403);
  }
  if (
    typeof host !== "string" ||
    origin !== origin.trim() ||
    host !== host.trim() ||
    parsed.origin !== origin ||
    origin !== `${protocol}://${host}`
  )
    fail("PERSONNEL_POLICIES_ORIGIN_FORBIDDEN", 403);
}
export function sendPersonnelPoliciesError(res, cause, head = false) {
  const known =
    cause instanceof PersonnelPoliciesError ||
    (typeof cause?.code === "string" && Number.isInteger(cause?.status));
  const status = known ? cause.status : 503;
  const error = known ? cause.code : "PERSONNEL_POLICIES_DATABASE_UNAVAILABLE";
  return head
    ? res.status(status).end()
    : res.status(status).json({ ok: false, error });
}
export function preparePersonnelPoliciesRequest(req, res, env = process.env) {
  setCrmPrivateHeaders(res);
  try {
    const mode = resolvePersonnelPoliciesApiMode(env, req);
    assertSameOrigin(req);
    return mode;
  } catch (error) {
    sendPersonnelPoliciesError(res, error, req.method === "HEAD");
    return false;
  }
}
export function createPersonnelPoliciesHandler({
  env = process.env,
  prismaClient,
  execute,
  resolveContext = resolveCrmPipelineContext,
} = {}) {
  return withPrivateApiHeaders(
    async (req, res) => {
      const mode = preparePersonnelPoliciesRequest(req, res, env);
      if (!mode) return;
      if (req.method === "OPTIONS") return res.status(204).end();
      if (!["GET", "HEAD", "POST"].includes(req.method))
        return methodNotAllowed(res, ["GET", "HEAD", "POST"]);
      try {
        await assertPersonnelPoliciesPreviewDatabase(prismaClient, mode);
        const context = await resolveContext(req, {
          env,
          prisma: prismaClient,
        });
        const method = req.method === "HEAD" ? "GET" : req.method;
        const input =
          method === "POST"
            ? await readJsonObject(req, {
                required: true,
                requireNonEmptyObject: true,
                maxBytes: 64 * 1024,
              })
            : undefined;
        const value = await execute({
          req,
          context,
          input,
          prisma: prismaClient,
          method,
        });
        if (req.method === "HEAD") return res.status(200).end();
        return res
          .status(method === "POST" ? 201 : 200)
          .json({ ok: true, data: value });
      } catch (error) {
        return sendPersonnelPoliciesError(res, error, req.method === "HEAD");
      }
    },
    { handleOptions: false },
  );
}
