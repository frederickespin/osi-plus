import { prisma } from "../_lib/db.js";
import { methodNotAllowed, withPrivateApiHeaders } from "../_lib/http.js";
import { requirePermission } from "../_lib/authContextMiddleware.js";
import { PERMS } from "../_lib/rbac.js";

export default withPrivateApiHeaders(async (req, res) => {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  const context = await requirePermission(req, res, PERMS.TEMPLATES_VIEW, { prisma });
  if (!context) return;

  const id = String(req.query?.id || "").trim();
  if (!id) return res.status(400).json({ ok: false, error: "id requerido" });

  const v = await prisma.templateVersion.findUnique({
    where: { id },
    include: { template: true, createdBy: true, approvedBy: true, rejectedBy: true, baseVersion: true },
  });

  if (!v) return res.status(404).json({ ok: false, error: "No encontrado" });
  return res.status(200).json({ ok: true, data: v });
});

