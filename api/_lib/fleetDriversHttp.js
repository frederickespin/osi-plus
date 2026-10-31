import { prisma as defaultPrisma } from "./db.js";
import { JsonBodyError, readJsonObject, withPrivateApiHeaders } from "./http.js";
import { setCrmPrivateHeaders } from "./crmHttpHeaders.js";
import { resolveCrmPipelineContext } from "./crmPipelineAccess.js";
import { CommercialTenancyError } from "./commercialTenancyWrite.js";
import { Mt01bAuthError } from "./authPolicy.js";
import { AdminMembershipError } from "./adminMembershipDomain.js";
import { AdminFleetError } from "./adminFleetContract.js";
import { ApprovalRequestError } from "./approvalRequest.js";
import { authorizeFleetContext } from "./fleetActor.js";
import { FleetDriversError, fleetDriverFail, fleetDriverReference, fleetDriverVehicleRef } from "./fleetDriversContract.js";
import { assertFleetDriversDatabase, requireFleetDriversAccess, requireFleetDriversContext } from "./fleetDriversAccess.js";
import { listFleetDriverOptions, getFleetDrivers, setFleetPrimaryDriver, requestFleetDriverAuthorization, decideFleetDriverAuthorization } from "./fleetDriversDomain.js";

function header(req, name) { const value = req.headers?.[name]; return Array.isArray(value) ? null : value; }
function sameOrigin(req) {
  const origin = header(req, "origin");
  if (origin === undefined) return;
  const protocol = header(req, "x-forwarded-proto") ?? (req.socket?.encrypted ? "https" : "http");
  if (origin !== `${protocol}://${header(req, "host")}`) fleetDriverFail("ORIGIN_FORBIDDEN", 403);
}
function query(req, accepted) {
  const params = new URL(req.url || "/", "http://fleet.local").searchParams;
  for (const key of params.keys()) if (!accepted.includes(key) || params.getAll(key).length !== 1) fleetDriverFail("INPUT_INVALID");
  return Object.fromEntries(params.entries());
}
function path(req, key) { const value = req.query?.[key]; return key === "vehicleRef" ? fleetDriverVehicleRef(value) : fleetDriverReference(value); }
function body(req) { return readJsonObject(req, { required: true, requireNonEmptyObject: true, maxBytes: 8 * 1024 }); }
function handler(options, allowed, permission, run) {
  const { env = process.env, prisma = defaultPrisma, resolveContext = resolveCrmPipelineContext, checkDatabase = assertFleetDriversDatabase } = options;
  return withPrivateApiHeaders(async (req, res) => {
    setCrmPrivateHeaders(res); res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("Referrer-Policy", "no-referrer");
    const head = req.method === "HEAD";
    try {
      const mode = requireFleetDriversAccess(req, env);
      if (!allowed.includes(req.method)) {
        res.setHeader("Allow", allowed.join(", "));
        return head ? res.status(405).end() : res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
      }
      sameOrigin(req);
      const context = await resolveContext(req, { prisma, env });
      requireFleetDriversContext(env, mode, context);
      authorizeFleetContext(context, { permission });
      await checkDatabase(prisma, mode, env);
      const result = await run(req, context, prisma, options);
      return head ? res.status(200).end() : res.status(200).json({ ok: true, ...result });
    } catch (error) {
      const controlled = error instanceof FleetDriversError || error instanceof AdminFleetError || error instanceof AdminMembershipError
        || error instanceof JsonBodyError || error instanceof CommercialTenancyError || error instanceof Mt01bAuthError || error instanceof ApprovalRequestError;
      const status = controlled && Number.isInteger(error.status) ? error.status : 503;
      const code = error instanceof AdminMembershipError || error?.code === "ADMIN_FLEET_FORBIDDEN" || error?.code === "APPROVAL_FORBIDDEN"
        ? "FLEET_DRIVERS_FORBIDDEN" : controlled ? error.code : "FLEET_DRIVERS_UNAVAILABLE";
      return head ? res.status(status).end() : res.status(status).json({ ok: false, error: code });
    }
  }, { handleOptions: false });
}
export function createFleetDriverOptionsHandler(options = {}) {
  return handler(options, ["GET", "HEAD"], null, (req, context, prisma) =>
    (options.list ?? listFleetDriverOptions)(prisma, context, query(req, ["search", "page", "pageSize"])));
}
export function createFleetDriversHandler(options = {}) {
  return handler(options, ["GET", "HEAD"], null, (req, context, prisma) =>
    (options.get ?? getFleetDrivers)(prisma, context, path(req, "vehicleRef"), query(req, ["historyKind", "page", "pageSize"])));
}
export function createFleetPrimaryDriverHandler(options = {}) {
  return handler(options, ["PUT"], "fleet:drivers:assign", async (req, context, prisma) => {
    query(req, []); return (options.setPrimary ?? setFleetPrimaryDriver)(prisma, context, path(req, "vehicleRef"), await body(req));
  });
}
export function createFleetDriverAuthorizationHandler(options = {}) {
  return handler(options, ["POST"], "fleet:drivers:request", async (req, context, prisma) => {
    query(req, []); return (options.request ?? requestFleetDriverAuthorization)(prisma, context, path(req, "vehicleRef"), await body(req));
  });
}
export function createFleetDriverDecisionHandler(options = {}) {
  return handler(options, ["PATCH"], "fleet:drivers:authorize", async (req, context, prisma) => {
    query(req, []); return (options.decide ?? decideFleetDriverAuthorization)(prisma, context, path(req, "vehicleRef"), path(req, "authorizationRef"), await body(req));
  });
}
