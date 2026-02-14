import { prisma } from "../_lib/db.js";
import { methodNotAllowed, readJsonBody, withCommonHeaders } from "../_lib/http.js";
import { PERMS, ensureActorUserId, requirePermFromHeaders } from "../_lib/rbac.js";

export default withCommonHeaders(async (req, res) => {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const actor = requirePermFromHeaders(req, res, PERMS.TEMPLATES_APPROVE);
  if (!actor) return;

  const body = await readJsonBody(req);
  const versionId = String(body.versionId || "").trim();
  if (!versionId) return res.status(400).json({ ok: false, error: "versionId requerido" });

  const v = await prisma.templateVersion.findUnique({ where: { id: versionId } });
  if (!v) return res.status(404).json({ ok: false, error: "Versión no encontrada" });
  if (v.status !== "PENDING_APPROVAL") {
    return res.status(400).json({ ok: false, error: "Solo PENDING_APPROVAL se aprueba" });
  }

  const approvedById = (await ensureActorUserId(prisma, actor)) || actor.userId || null;

  const updated = await prisma.templateVersion.update({
    where: { id: versionId },
    data: { status: "APPROVED", approvedAt: new Date(), approvedById },
  });

  return res.status(200).json({ ok: true, data: updated });
});

