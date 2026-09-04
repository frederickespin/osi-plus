import { prisma } from "../_lib/db.js";
import { methodNotAllowed, readJsonBody, withPrivateApiHeaders } from "../_lib/http.js";
import { requirePermission } from "../_lib/authContextMiddleware.js";
import { PERMS } from "../_lib/rbac.js";

export default withPrivateApiHeaders(async (req, res) => {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const actor = await requirePermission(req, res, PERMS.TEMPLATES_PUBLISH, { prisma });
  if (!actor) return;

  const body = await readJsonBody(req);
  const versionId = String(body.versionId || "").trim();
  if (!versionId) return res.status(400).json({ ok: false, error: "versionId requerido" });

  const v = await prisma.templateVersion.findUnique({
    where: { id: versionId },
    include: { template: true },
  });
  if (!v) return res.status(404).json({ ok: false, error: "Versión no encontrada" });
  if (v.status !== "APPROVED") return res.status(400).json({ ok: false, error: "Solo APPROVED puede publicarse" });

  // Archivar versión publicada anterior (si existe)
  const template = v.template;
  if (template.publishedVersionId && template.publishedVersionId !== v.id) {
    await prisma.templateVersion.updateMany({
      where: { id: template.publishedVersionId, status: "PUBLISHED" },
      data: { status: "ARCHIVED" },
    });
  }

  const now = new Date();
  const published = await prisma.templateVersion.update({
    where: { id: v.id },
    data: { status: "PUBLISHED", publishedAt: now },
  });

  await prisma.template.update({
    where: { id: template.id },
    data: { publishedVersionId: v.id },
  });

  return res.status(200).json({ ok: true, data: published });
});

