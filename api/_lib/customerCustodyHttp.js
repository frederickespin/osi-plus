import { resolveCrmPipelineContext } from "./crmPipelineAccess.js";
import { setCrmPrivateHeaders } from "./crmHttpHeaders.js";
import { methodNotAllowed, readJsonObject, withPrivateApiHeaders } from "./http.js";
import { CustomerCustodyError } from "./customerCustodyContract.js";
import { resolveCustomerCustodyMode } from "./customerCustodyMode.js";

function fail(code, status) { throw new CustomerCustodyError(code, status); }
export function sendCustomerCustodyError(res, error, head = false) { const known = error instanceof CustomerCustodyError || (typeof error?.code === "string" && Number.isInteger(error?.status)); const status = known ? error.status : 503; const code = known ? error.code : "CUSTOMER_CUSTODY_DATABASE_UNAVAILABLE"; return head ? res.status(status).end() : res.status(status).json({ ok: false, error: code }); }
export function createCustomerCustodyHandler({ env = process.env, prismaClient, methods, permission, normalize, execute, resolveContext = resolveCrmPipelineContext }) {
  return withPrivateApiHeaders(async (req, res) => {
    setCrmPrivateHeaders(res);
    try { resolveCustomerCustodyMode(env, req); } catch (error) { return sendCustomerCustodyError(res, error, req.method === "HEAD"); }
    if (req.method === "OPTIONS") return res.status(204).end();
    const allowed = methods.includes("GET") ? [...new Set([...methods, "HEAD"])] : methods; if (!allowed.includes(req.method)) return methodNotAllowed(res, allowed);
    try {
      const context = await resolveContext(req, { env, prisma: prismaClient });
      const required = typeof permission === "function" ? permission(req.method === "HEAD" ? "GET" : req.method) : permission;
      if (!context.effectivePermissions?.includes(required) || context.deniedPermissions?.includes(required)) fail("CUSTOMER_CUSTODY_FORBIDDEN", 403);
      const method = req.method === "HEAD" ? "GET" : req.method; const raw = method === "GET" ? undefined : await readJsonObject(req, { required: true, requireNonEmptyObject: true, maxBytes: 128 * 1024 }); const input = normalize && raw ? normalize(raw, req) : raw;
      const value = await execute({ req, context, input, prisma: prismaClient, method }); if (req.method === "HEAD") return res.status(200).end(); return res.status(method === "POST" ? 201 : 200).json({ ok: true, data: value });
    } catch (error) { return sendCustomerCustodyError(res, error, req.method === "HEAD"); }
  }, { handleOptions: false });
}
