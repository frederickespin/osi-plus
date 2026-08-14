import { assertCommercialDatabaseIdentity, CommercialTenancyError } from "./commercialTenancyWrite.js";
import {
  applyLocalCors,
  requireCrmPipelineMutationsLocal,
  sendPipelineMutationError,
} from "./pipelineCaseMutationHttp.js";
import { assertCrmAuthorizationHeader, resolveCrmPipelineContext } from "./crmPipelineAccess.js";
import { listCrmPipelineOwnerOptions } from "./crmOwnerCatalog.js";
import { methodNotAllowed, setPrivateNoStore, withCommonHeaders } from "./http.js";

export function createCrmOwnerCatalogHandler({
  env = process.env,
  prismaClient,
  resolveContext = resolveCrmPipelineContext,
  listOptions = listCrmPipelineOwnerOptions,
} = {}) {
  return withCommonHeaders(async (req, res) => {
    setPrivateNoStore(res);
    try {
      requireCrmPipelineMutationsLocal(env);
    } catch (error) {
      return sendPipelineMutationError(res, error, { head: req.method === "HEAD" });
    }
    try {
      await assertCommercialDatabaseIdentity(req, prismaClient, env);
    } catch (error) {
      return sendPipelineMutationError(res, error, { head: req.method === "HEAD" });
    }
    try {
      if (req.method === "OPTIONS") {
        applyLocalCors(req, res, env, ["GET", "HEAD", "OPTIONS"], { preflight: true });
        return res.status(204).end();
      }
      applyLocalCors(req, res, env, ["GET", "HEAD", "OPTIONS"]);
    } catch (error) {
      return sendPipelineMutationError(res, error, { head: req.method === "HEAD" });
    }
    if (!["GET", "HEAD"].includes(req.method)) return methodNotAllowed(res, ["GET", "HEAD", "OPTIONS"]);
    try {
      assertCrmAuthorizationHeader(req);
      const context = await resolveContext(req, { prisma: prismaClient, env });
      const result = await listOptions(context, req.query || {}, { prisma: prismaClient, env });
      if (req.method === "HEAD") return res.status(200).end();
      return res.status(200).json({ ok: true, ...result });
    } catch (error) {
      if (error instanceof CommercialTenancyError) return sendPipelineMutationError(res, error, { head: req.method === "HEAD" });
      return sendPipelineMutationError(res, error, { head: req.method === "HEAD" });
    }
  }, { handleOptions: false, cors: false });
}
