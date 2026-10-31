import { resolveCrmPipelineContext } from "./crmPipelineAccess.js";
import { prepareCostingRequest } from "./costingHttp.js";
import { methodNotAllowed, readJsonObject, withPrivateApiHeaders } from "./http.js";
import { LogisticsEngineError } from "./logisticsEngineContract.js";
import { prepareLogisticsRequest, sendLogisticsError } from "./logisticsEngineHttp.js";

function requiredPermissions(value, method) {
  const selected = typeof value === "function" ? value(method) : value;
  const permissions = Array.isArray(selected) ? selected : [selected];
  if (!permissions.length || permissions.some((permission) => typeof permission !== "string" || !permission)) {
    throw new LogisticsEngineError("LOGISTICS_TRANSPORT_CONFIGURATION_INVALID", 503);
  }
  return permissions;
}

// Transport administration joins operational rules and monetary authority. Every
// required permission must pass before a body is read or domain work begins.
export function createLogisticsTransportHandler({
  env = process.env, prismaClient, methods, permissions, permission, execute,
  status = 200, resolveContext = resolveCrmPipelineContext,
} = {}) {
  return withPrivateApiHeaders(async (req, res) => {
    if (!prepareLogisticsRequest(req, res, env)) return;
    if (!prepareCostingRequest(req, res, env)) return;
    if (req.method === "OPTIONS") return res.status(204).end();
    const allowed = methods.includes("GET") ? [...new Set([...methods, "HEAD"])] : methods;
    if (!allowed.includes(req.method)) return methodNotAllowed(res, allowed);
    try {
      const method = req.method === "HEAD" ? "GET" : req.method;
      const context = await resolveContext(req, { env, prisma: prismaClient });
      const required = requiredPermissions(permissions ?? permission, method);
      if (required.some((item) => !context?.effectivePermissions?.includes(item) || context.deniedPermissions?.includes(item))) {
        throw new LogisticsEngineError("LOGISTICS_TRANSPORT_FORBIDDEN", 403);
      }
      const input = method === "GET" ? undefined : await readJsonObject(req, {
        required: true, requireNonEmptyObject: true, maxBytes: 128 * 1024,
      });
      const value = await execute({ req, context, input, prisma: prismaClient, method });
      if (req.method === "HEAD") return res.status(200).end();
      return res.status(typeof status === "function" ? status(method) : status).json({ ok: true, data: value });
    } catch (error) {
      return sendLogisticsError(res, error, req.method === "HEAD");
    }
  }, { handleOptions: false });
}
