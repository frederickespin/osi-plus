import { prisma } from "../_lib/db.js";
import { methodNotAllowed, readJsonBody, withCommonHeaders } from "../_lib/http.js";
import { PERMS, ensureActorUserId, requirePermFromHeaders } from "../_lib/rbac.js";

export default withCommonHeaders(async (req, res) => {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const actor = requirePermFromHeaders(req, res, PERMS.TEMPLATES_EDIT_DRAFT);
  if (!actor) return;

  const input = await readJsonBody(req);
  const templateType = String(input.templateType || "").toUpperCase().trim();
  const templateName = String(input.templateName || "").trim();
  const tenantId = input.tenantId ? String(input.tenantId) : null;
  const versionId = input.versionId ? String(input.versionId) : null;

  if (!templateType || !templateName) {
    return res.status(400).json({ ok: false, error: "templateType y templateName requeridos" });
  }

  // (1) Asegurar cabecera Template
  let template = await prisma.template.findFirst({
    where: { type: templateType, name: templateName, tenantId },
  });

  if (!template) {
    template = await prisma.template.create({
      data: {
        type: templateType,
        name: templateName,
        tenantId,
        scope: tenantId ? "TENANT" : "GLOBAL",
      },
    });
  }

  // (2) Actualizar draft existente
  if (versionId) {
    const v = await prisma.templateVersion.findUnique({ where: { id: versionId } });
    if (!v || v.templateId !== template.id) {
      return res.status(404).json({ ok: false, error: "Draft no encontrado" });
    }
    if (v.status !== "DRAFT") {
      return res.status(400).json({ ok: false, error: "Solo se puede editar un DRAFT" });
    }

    const updated = await prisma.templateVersion.update({
      where: { id: v.id },
      data: {
        contentJson: input.contentJson ?? v.contentJson,
        contentHtml: input.contentHtml ?? v.contentHtml,
        changeSummary: input.changeSummary ?? v.changeSummary,
      },
    });

    return res.status(200).json({ ok: true, data: updated });
  }

  // (3) Crear nueva versión draft = last+1
  const last = await prisma.templateVersion.findFirst({
    where: { templateId: template.id },
    orderBy: { version: "desc" },
  });

  const nextVersion = (last?.version ?? 0) + 1;

  const createdById = (await ensureActorUserId(prisma, actor)) || "unknown";

  const created = await prisma.templateVersion.create({
    data: {
      templateId: template.id,
      version: nextVersion,
      status: "DRAFT",
      contentJson: input.contentJson ?? undefined,
      contentHtml: input.contentHtml ?? undefined,
      changeSummary: input.changeSummary ?? undefined,
      createdById,
      baseVersionId: last?.id ?? null,
    },
  });

  return res.status(201).json({ ok: true, data: created });
});
