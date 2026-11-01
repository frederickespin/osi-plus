import { resolveCrmPipelineContext } from "./crmPipelineAccess.js";
import { methodNotAllowed, readJsonObject, withPrivateApiHeaders } from "./http.js";
import { prepareMaterialsRequest, sendMaterialsError } from "./materialsInventoryHttp.js";
import { resolveWarehouseSheetApiMode } from "./warehouseSheetMode.js";
import { WAREHOUSE_SHEET_MAX_BYTES, warehouseSheetFail } from "./warehouseSheetContract.js";

export function createWarehouseSheetHandler({ env = process.env, prismaClient, methods, managerOptions = false, execute, resolveContext = resolveCrmPipelineContext } = {}) {
  return withPrivateApiHeaders(async (req, res) => {
    if (!prepareMaterialsRequest(req, res, env)) return;
    try { resolveWarehouseSheetApiMode(env, req); }
    catch (error) { return sendMaterialsError(res, error, req.method === "HEAD"); }
    if (req.method === "OPTIONS") return res.status(204).end();
    const allowed = methods.includes("GET") ? [...new Set([...methods, "HEAD"])] : methods;
    if (!allowed.includes(req.method)) return methodNotAllowed(res, allowed);
    try {
      const context = await resolveContext(req, { env, prisma: prismaClient });
      const method = req.method === "HEAD" ? "GET" : req.method;
      const required = method === "GET" && !managerOptions ? ["inventory:stock:view"] : ["inventory:stock:view", "inventory:catalog:manage"];
      if (required.some((permission) => !context.effectivePermissions?.includes(permission) || context.deniedPermissions?.includes(permission))) warehouseSheetFail("WAREHOUSE_SHEET_FORBIDDEN", 403);
      const input = method === "GET" ? undefined : await readJsonObject(req, { required: true, requireNonEmptyObject: true, maxBytes: WAREHOUSE_SHEET_MAX_BYTES });
      const value = await execute({ req, context, input, prisma: prismaClient, method });
      if (req.method === "HEAD") return res.status(200).end();
      return res.status(200).json({ ok: true, data: value });
    } catch (error) { return sendMaterialsError(res, error, req.method === "HEAD"); }
  }, { handleOptions: false });
}
