import { prisma as defaultPrisma } from "./db.js";
import { JsonBodyError, readJsonObject, withPrivateApiHeaders } from "./http.js";
import { setCrmPrivateHeaders } from "./crmHttpHeaders.js";
import { resolveCrmPipelineContext } from "./crmPipelineAccess.js";
import { CommercialTenancyError } from "./commercialTenancyWrite.js";
import { Mt01bAuthError } from "./authPolicy.js";
import { AdminMembershipError } from "./adminMembershipDomain.js";
import { AdminFleetError, fleetFail } from "./adminFleetContract.js";
import { assertAdminFleetDatabase, requireAdminFleetAccess, requireAdminFleetContext } from "./adminFleetAccess.js";
import { createAdminFleetVehicle, getAdminFleetVehicle, listAdminFleetVehicles, updateAdminFleetVehicle } from "./adminFleetDomain.js";

function header(req, name) { const value = req.headers?.[name]; return Array.isArray(value) ? null : value; }
function sameOrigin(req) {
  const origin = header(req, "origin");
  if (origin === undefined) return;
  const protocol = header(req, "x-forwarded-proto") ?? (req.socket?.encrypted ? "https" : "http");
  if (origin !== `${protocol}://${header(req, "host")}`) fleetFail("ORIGIN_FORBIDDEN", 403);
}
function privateHeaders(res) {
  setCrmPrivateHeaders(res);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
}
function sendError(res, error, head) {
  const controlled = error instanceof AdminFleetError || error instanceof AdminMembershipError || error instanceof JsonBodyError
    || error instanceof CommercialTenancyError || error instanceof Mt01bAuthError;
  const status = controlled && Number.isInteger(error.status) ? error.status : 503;
  const code = error instanceof AdminMembershipError ? "ADMIN_FLEET_FORBIDDEN" : controlled ? error.code : "ADMIN_FLEET_UNAVAILABLE";
  return head ? res.status(status).end() : res.status(status).json({ ok: false, error: code });
}
function queryParams(req, accepted) {
  const params = new URL(req.url || "/", "http://admin.local").searchParams;
  for (const key of params.keys()) if (!accepted.includes(key) || params.getAll(key).length !== 1) fleetFail("INPUT_INVALID");
  return Object.fromEntries(params.entries());
}
function protectedHandler(options, allowed, run) {
  const { env = process.env, prisma = defaultPrisma, resolveContext = resolveCrmPipelineContext, checkDatabase = assertAdminFleetDatabase } = options;
  return withPrivateApiHeaders(async (req, res) => {
    privateHeaders(res);
    const head = req.method === "HEAD";
    try {
      const mode = requireAdminFleetAccess(req, env);
      if (!allowed.includes(req.method)) {
        res.setHeader("Allow", allowed.join(", "));
        return head ? res.status(405).end() : res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
      }
      sameOrigin(req);
      await checkDatabase(prisma, mode, env);
      const context = await resolveContext(req, { prisma, env });
      requireAdminFleetContext(env, mode, context);
      return await run(req, res, context, prisma, head);
    } catch (error) { return sendError(res, error, head); }
  }, { handleOptions: false });
}
export function createAdminFleetCollectionHandler(options = {}) {
  const list = options.list ?? listAdminFleetVehicles;
  const create = options.create ?? createAdminFleetVehicle;
  return protectedHandler(options, ["GET", "HEAD", "POST"], async (req, res, context, prisma, head) => {
    if (req.method === "POST") {
      queryParams(req, []);
      const body = await readJsonObject(req, { required: true, requireNonEmptyObject: true, maxBytes: 16 * 1024 });
      const result = await create(prisma, context, body);
      return res.status(result.created ? 201 : 200).json({ ok: true, ...result });
    }
    const result = await list(prisma, context, queryParams(req, ["search", "operationalStatus", "vehicleType", "page", "pageSize"]));
    return head ? res.status(200).end() : res.status(200).json({ ok: true, ...result });
  });
}
export function createAdminFleetDetailHandler(options = {}) {
  const get = options.get ?? getAdminFleetVehicle;
  const update = options.update ?? updateAdminFleetVehicle;
  return protectedHandler(options, ["GET", "HEAD", "PATCH"], async (req, res, context, prisma, head) => {
    queryParams(req, []);
    const ref = Array.isArray(req.query?.vehicleRef) ? null : req.query?.vehicleRef;
    const vehicle = req.method === "PATCH"
      ? await update(prisma, context, ref, await readJsonObject(req, { required: true, requireNonEmptyObject: true, maxBytes: 16 * 1024 }))
      : await get(prisma, context, ref);
    return head ? res.status(200).end() : res.status(200).json({ ok: true, vehicle });
  });
}
