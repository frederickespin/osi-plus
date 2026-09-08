import { isRealLoopbackRequest } from "./commercialTenancyMutation.js";
import { resolveCrmPipelineContext } from "./crmPipelineAccess.js";
import { setCrmPrivateHeaders } from "./crmHttpHeaders.js";
import {
  methodNotAllowed,
  readJsonObject,
  withPrivateApiHeaders,
} from "./http.js";
import { PersonnelPoliciesError } from "./personnelPoliciesContract.js";

export const productionApiEnabled = false;
export const PERSONNEL_POLICIES_API_MODES = Object.freeze({
  DISABLED: "DISABLED",
  LOCAL_ONLY: "LOCAL_ONLY",
});

function fail(code, status) {
  throw new PersonnelPoliciesError(code, status);
}
function hasVercel(env) {
  return Object.keys(env || {}).some((key) =>
    key.toUpperCase().startsWith("VERCEL"),
  );
}

export function resolvePersonnelPoliciesApiMode(env = process.env, req) {
  const mode =
    env.PERSONNEL_POLICIES_API_MODE ?? PERSONNEL_POLICIES_API_MODES.DISABLED;
  if (!Object.values(PERSONNEL_POLICIES_API_MODES).includes(mode))
    fail("PERSONNEL_POLICIES_CONFIGURATION_INVALID", 503);
  if (mode === PERSONNEL_POLICIES_API_MODES.DISABLED)
    fail("PERSONNEL_POLICIES_DISABLED", 409);
  if (
    productionApiEnabled !== false ||
    hasVercel(env) ||
    !isRealLoopbackRequest(req)
  )
    fail("PERSONNEL_POLICIES_CONFIGURATION_INVALID", 503);
  return mode;
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
    resolvePersonnelPoliciesApiMode(env, req);
    assertSameOrigin(req);
    return true;
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
      if (!preparePersonnelPoliciesRequest(req, res, env)) return;
      if (req.method === "OPTIONS") return res.status(204).end();
      if (!["GET", "HEAD", "POST"].includes(req.method))
        return methodNotAllowed(res, ["GET", "HEAD", "POST"]);
      try {
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
