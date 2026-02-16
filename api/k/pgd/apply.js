import { prisma } from "../../_lib/db.js";
import { methodNotAllowed, readJsonBody, withCommonHeaders } from "../../_lib/http.js";
import { ensureActorUserId, requireRoleFromHeaders } from "../../_lib/rbac.js";

function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return [];
}

export default withCommonHeaders(async (req, res) => {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const actor = requireRoleFromHeaders(req, res, ["K", "A"]);
  if (!actor?.role) return;
  const actorUserId = await ensureActorUserId(prisma, actor);

  const body = await readJsonBody(req);
  const projectId = String(body.projectId || "").trim();
  const templateId = String(body.templateId || "").trim();
  if (!projectId) return res.status(400).json({ ok: false, error: "Missing projectId" });
  if (!templateId) return res.status(400).json({ ok: false, error: "Missing templateId" });

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return res.status(404).json({ ok: false, error: "Project not found" });

  const template = await prisma.template.findUnique({
    where: { id: templateId },
    include: { publishedVersion: true },
  });
  if (!template) return res.status(404).json({ ok: false, error: "Template not found" });
  if (template.type !== "PGD") return res.status(400).json({ ok: false, error: "Template must be PGD" });
  if (!template.publishedVersionId || !template.publishedVersion) {
    return res.status(409).json({ ok: false, error: "Template not published" });
  }
  if (template.publishedVersion.status !== "PUBLISHED") {
    return res.status(409).json({ ok: false, error: "Published version is not PUBLISHED" });
  }

  const content = template.publishedVersion.contentJson || null;
  const docs = Array.isArray(content?.documents) ? content.documents : [];
  if (docs.length === 0) {
    return res.status(409).json({ ok: false, error: "PGD has no documents" });
  }

  const upserted = await prisma.projectPgd.upsert({
    where: { projectId },
    create: {
      projectId,
      templateId,
      templateVersionId: template.publishedVersionId,
      appliedById: actorUserId,
      items: {
        create: docs.map((d) => ({
          name: String(d?.name || "Documento"),
          visibility: String(d?.visibility || "INTERNAL_VIEW"),
          responsible: String(d?.responsible || "INTERNAL"),
          isBlocking: Boolean(d?.isBlocking),
          expectedFileType: String(d?.expectedFileType || "OTHER"),
          serviceTags: toArray(d?.serviceTags),
          status: "MISSING",
        })),
      },
    },
    update: {
      templateId,
      templateVersionId: template.publishedVersionId,
      appliedAt: new Date(),
      appliedById: actorUserId,
      items: {
        deleteMany: {},
        create: docs.map((d) => ({
          name: String(d?.name || "Documento"),
          visibility: String(d?.visibility || "INTERNAL_VIEW"),
          responsible: String(d?.responsible || "INTERNAL"),
          isBlocking: Boolean(d?.isBlocking),
          expectedFileType: String(d?.expectedFileType || "OTHER"),
          serviceTags: toArray(d?.serviceTags),
          status: "MISSING",
        })),
      },
    },
    include: { items: { orderBy: { createdAt: "asc" } }, template: true, templateVersion: true },
  });

  return res.status(200).json({ ok: true, data: upserted });
});

