import { prisma } from "../../../_lib/db.js";
import { createCrmServicesHandler } from "../../../_lib/crmServicesHttp.js";
import { listMaterialPolicies, saveMaterialPolicy } from "../../../_lib/servicePackagesDomain.js";
import { listServiceMaterialResources, normalizeMaterialPoliciesQuery } from "../../../_lib/serviceMaterialResources.js";
import { CrmServicesError } from "../../../_lib/crmServicesContract.js";

export function executeMaterialPoliciesRequest({ req, context, input, prisma: database, method }) {
  const query = normalizeMaterialPoliciesQuery(req.query || {});
  if (method === "GET") return query.view === "resources"
    ? listServiceMaterialResources(context, req.query, database)
    : listMaterialPolicies(context, database);
  if (query.view !== "policies") throw new CrmServicesError("SERVICE_PACKAGES_QUERY_INVALID", 400);
  return saveMaterialPolicy(context, input, database);
}

export default createCrmServicesHandler({
  prismaClient: prisma,
  methods: ["GET", "POST"],
  execute: executeMaterialPoliciesRequest,
});
