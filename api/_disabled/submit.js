import { prisma } from "../_lib/db.js";
import { methodNotAllowed, readJsonBody, withCommonHeaders } from "../_lib/http.js";
import { PERMS, requirePermFromHeaders } from "../_lib/rbac.js";

export default withCommonHeaders(async (req, res) => {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const actor = requirePermFromHeaders(req, res, PERMS.TEMPLATES_SUBMIT);
  if (!actor) return;

  const body = await readJsonBody(req);
  const versionId = String(body.versionId || "").trim();
  if (!versionId) return res.status(400).json({ ok: false, error: "versionId requerido" });

  const v = await prisma.templateVersion.findUnique({ where: { id: versionId } });
  if (!v) return res.status(404).json({ ok: false, error: "Versión no encontrada" });
  if (v.status !== "DRAFT") return res.status(400).json({ ok: false, error: "Solo DRAFT puede enviarse" });

  const updated = await prisma.templateVersion.update({
    where: { id: versionId },
    data: { status: "PENDING_APPROVAL", requestedAt: new Date() },
  });

  return res.status(200).json({ ok: true, data: updated });
});

