import { resolveCrmPipelineContext } from "./crmPipelineAccess.js";
import { methodNotAllowed, readJsonObject, withPrivateApiHeaders } from "./http.js";
import { prepareMaterialsRequest, sendMaterialsError } from "./materialsInventoryHttp.js";
import { resolveWarehouseConfigurationApiMode } from "./warehouseConfigurationMode.js";
import { warehouseConfigurationFail } from "./warehouseConfigurationContract.js";

export function createWarehouseConfigurationHandler({ env = process.env, prismaClient, methods, execute, resolveContext = resolveCrmPipelineContext } = {}) {
  return withPrivateApiHeaders(async (req, res) => {
    if (!prepareMaterialsRequest(req, res, env)) return;
    try { resolveWarehouseConfigurationApiMode(env, req); }
    catch (error) { return sendMaterialsError(res, error, req.method === "HEAD"); }
    if (req.method === "OPTIONS") return res.status(204).end();
    const allowed = methods.includes("GET") ? [...new Set([...methods, "HEAD"])] : methods;
    if (!allowed.includes(req.method)) return methodNotAllowed(res, allowed);
    try {
      const context = await resolveContext(req, { env, prisma: prismaClient });
      const method = req.method === "HEAD" ? "GET" : req.method;
      const required = method === "GET" ? ["inventory:stock:view"] : ["inventory:stock:view", "inventory:catalog:manage"];
      if (required.some((permission) => !context.effectivePermissions?.includes(permission) || context.deniedPermissions?.includes(permission))) warehouseConfigurationFail("WAREHOUSE_CONFIGURATION_FORBIDDEN", 403);
      const input = method === "GET" ? undefined : await readJsonObject(req, { required: true, requireNonEmptyObject: true, maxBytes: 16 * 1024 });
      const value = await execute({ req, context, input, prisma: prismaClient, method });
      if (req.method === "HEAD") return res.status(200).end();
      return res.status(method === "POST" ? 201 : 200).json({ ok: true, data: value });
    } catch (error) { return sendMaterialsError(res, error, req.method === "HEAD"); }
  }, { handleOptions: false });
}
