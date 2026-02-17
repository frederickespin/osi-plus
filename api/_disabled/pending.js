import { prisma } from "../_lib/db.js";
import { methodNotAllowed, withCommonHeaders } from "../_lib/http.js";
import { PERMS, requirePermFromHeaders } from "../_lib/rbac.js";

export default withCommonHeaders(async (req, res) => {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  requirePermFromHeaders(req, res, PERMS.TEMPLATES_APPROVE);

  const tenantId = req.query?.tenantId ? String(req.query.tenantId) : null;

  const versions = await prisma.templateVersion.findMany({
    where: {
      status: "PENDING_APPROVAL",
      ...(tenantId ? { template: { tenantId } } : {}),
    },
    include: { template: true, createdBy: true },
    orderBy: { requestedAt: "asc" },
  });

  return res.status(200).json({ ok: true, total: versions.length, data: versions });
});

