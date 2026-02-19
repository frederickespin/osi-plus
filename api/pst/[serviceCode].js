import { prisma } from "../_lib/db.js";
import { methodNotAllowed, withCommonHeaders } from "../_lib/http.js";
import { PERMS, requirePermFromHeaders } from "../_lib/rbac.js";

function toObject(value) {
  if (value && typeof value === "object") return value;
  return {};
}

function normalize(value) {
  return String(value || "").trim().toUpperCase();
}

export default withCommonHeaders(async (req, res) => {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  const actor = requirePermFromHeaders(req, res, PERMS.TEMPLATES_VIEW);
  if (!actor) return;

  const serviceCode = normalize(req.query?.serviceCode);
  const tenantId = req.query?.tenantId ? String(req.query.tenantId) : null;
  if (!serviceCode) return res.status(400).json({ ok: false, error: "serviceCode requerido" });

  const publishedPst = await prisma.templateVersion.findMany({
    where: {
      status: "PUBLISHED",
      template: {
        type: "PST",
        isActive: true,
        ...(tenantId ? { tenantId } : {}),
      },
    },
    include: {
      template: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  const found = publishedPst.find((v) => normalize(v.contentJson?.serviceCode) === serviceCode);
  if (!found) return res.status(404).json({ ok: false, error: "PST no encontrado" });

  const content = toObject(found.contentJson);
  const linkedCode = String(content.linkedPgdTemplateCode || "").trim();
  let linkedPgd = null;

  if (linkedCode) {
    const pgd = await prisma.template.findFirst({
      where: { type: "PGD", name: linkedCode, isActive: true },
      include: { publishedVersion: true },
    });
    if (pgd?.publishedVersion?.status === "PUBLISHED") {
      linkedPgd = {
        templateId: pgd.id,
        templateName: pgd.name,
        versionId: pgd.publishedVersion.id,
        version: pgd.publishedVersion.version,
      };
    }
  }

  return res.status(200).json({
    ok: true,
    data: {
      templateId: found.templateId,
      templateName: found.template?.name || "",
      serviceCode: String(content.serviceCode || ""),
      serviceName: String(content.serviceName || ""),
      versionId: found.id,
      version: found.version,
      status: found.status,
      publishedAt: found.publishedAt,
      content,
      linkedPgd,
    },
  });
});
