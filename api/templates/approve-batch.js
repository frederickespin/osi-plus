import { prisma } from "../_lib/db.js";
import { methodNotAllowed, readJsonBody, withPrivateApiHeaders } from "../_lib/http.js";
import { requirePermission } from "../_lib/authContextMiddleware.js";
import { PERMS } from "../_lib/rbac.js";

export default withPrivateApiHeaders(async (req, res) => {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const actor = await requirePermission(req, res, PERMS.TEMPLATES_APPROVE, { prisma });
  if (!actor) return;

  const body = await readJsonBody(req);
  const versionIds = Array.isArray(body.versionIds) ? body.versionIds.map(String) : [];
  if (versionIds.length === 0) return res.status(400).json({ ok: false, error: "versionIds requerido" });

  const approvedById = actor.userId;
  const now = new Date();

  const result = await prisma.templateVersion.updateMany({
    where: { id: { in: versionIds }, status: "PENDING_APPROVAL" },
    data: { status: "APPROVED", approvedAt: now, approvedById },
  });

  return res.status(200).json({ ok: true, data: result });
});

