import { prisma } from "../_lib/db.js";
import { methodNotAllowed, readJsonBody, withCommonHeaders } from "../_lib/http.js";
import { PERMS, requirePermFromHeaders } from "../_lib/rbac.js";
import { validateAndNormalizePstContent } from "./_pst.js";

export default withCommonHeaders(async (req, res) => {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const actor = requirePermFromHeaders(req, res, PERMS.TEMPLATES_SUBMIT);
  if (!actor) return;

  const body = await readJsonBody(req);
  const versionId = String(body.versionId || "").trim();
  if (!versionId) return res.status(400).json({ ok: false, error: "versionId requerido" });

  const v = await prisma.templateVersion.findUnique({
    where: { id: versionId },
    include: { template: true },
  });
  if (!v) return res.status(404).json({ ok: false, error: "Versión no encontrada" });
  if (v.status !== "DRAFT") return res.status(400).json({ ok: false, error: "Solo DRAFT puede enviarse" });
  if (actor.role === "V" && v.template?.type !== "PST") {
    return res.status(403).json({ ok: false, error: "Ventas solo puede enviar PST a aprobación." });
  }

  if (v.template?.type === "PST") {
    const validated = await validateAndNormalizePstContent({
      prisma,
      templateId: v.templateId,
      contentJson: v.contentJson,
    });
    if (!validated.ok) {
      return res.status(400).json({ ok: false, error: validated.errors.join(" ") });
    }

    await prisma.templateVersion.update({
      where: { id: versionId },
      data: { contentJson: validated.normalized },
    });
  }

  const updated = await prisma.templateVersion.update({
    where: { id: versionId },
    data: { status: "PENDING_APPROVAL", requestedAt: new Date() },
  });

  return res.status(200).json({ ok: true, data: updated });
});

