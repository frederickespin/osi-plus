import { prisma } from "../_lib/db.js";
import { methodNotAllowed, withPrivateApiHeaders } from "../_lib/http.js";
import { requirePermission } from "../_lib/authContextMiddleware.js";
import { PERMS } from "../_lib/rbac.js";

export default withPrivateApiHeaders(async (req, res) => {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  const context = await requirePermission(req, res, PERMS.TEMPLATES_APPROVE, { prisma });
  if (!context) return;

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

