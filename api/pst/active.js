import { prisma } from "../_lib/db.js";
import { methodNotAllowed, withCommonHeaders } from "../_lib/http.js";
import { PERMS, requirePermFromHeaders } from "../_lib/rbac.js";

function toObject(value) {
  if (value && typeof value === "object") return value;
  return {};
}

export default withCommonHeaders(async (req, res) => {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  const actor = requirePermFromHeaders(req, res, PERMS.TEMPLATES_VIEW);
  if (!actor) return;

  const tenantId = req.query?.tenantId ? String(req.query.tenantId) : null;

  const templates = await prisma.template.findMany({
    where: {
      type: "PST",
      isActive: true,
      ...(tenantId ? { tenantId } : {}),
    },
    include: {
      publishedVersion: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  const data = templates
    .map((t) => {
      const v = t.publishedVersion;
      if (!v || v.status !== "PUBLISHED") return null;
      const c = toObject(v.contentJson);
      return {
        templateId: t.id,
        templateName: t.name,
        serviceCode: String(c.serviceCode || ""),
        serviceName: String(c.serviceName || ""),
        versionId: v.id,
        version: v.version,
        status: v.status,
        publishedAt: v.publishedAt,
        content: c,
      };
    })
    .filter(Boolean);

  return res.status(200).json({ ok: true, total: data.length, data });
});
