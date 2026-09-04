import { prisma } from "../_lib/db.js";
import { methodNotAllowed, withPrivateApiHeaders } from "../_lib/http.js";
import { requirePermission } from "../_lib/authContextMiddleware.js";
import { PERMS } from "../_lib/rbac.js";

export default withPrivateApiHeaders(async (req, res) => {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  const context = await requirePermission(req, res, PERMS.TEMPLATES_VIEW, { prisma });
  if (!context) return;

  const type = String(req.query?.type || "").toUpperCase().trim();
  const tenantId = req.query?.tenantId ? String(req.query.tenantId) : null;

  const where = {
    isActive: true,
    ...(type ? { type } : {}),
    ...(tenantId ? { tenantId } : {}),
  };

  const templates = await prisma.template.findMany({
    where,
    include: {
      versions: { orderBy: { version: "desc" }, take: 1 },
      publishedVersion: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  return res.status(200).json({ ok: true, total: templates.length, data: templates });
});

