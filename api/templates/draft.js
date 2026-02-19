import { prisma } from "../_lib/db.js";
import { methodNotAllowed, readJsonBody, withCommonHeaders } from "../_lib/http.js";
import { PERMS, ensureActorUserId, requirePermFromHeaders } from "../_lib/rbac.js";
import { validateAndNormalizePstContent } from "./_pst.js";

const TEMPLATE_TYPES = new Set(["PIC", "PGD", "NPS", "PST"]);

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
  if (!TEMPLATE_TYPES.has(templateType)) {
    return res.status(400).json({ ok: false, error: "templateType inválido" });
  }
  if (actor.role === "V" && templateType !== "PST") {
    return res.status(403).json({ ok: false, error: "Ventas solo puede crear/editar plantillas PST." });
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
    let nextContentJson = input.contentJson ?? v.contentJson;
    if (templateType === "PST") {
      const validated = await validateAndNormalizePstContent({
        prisma,
        templateId: template.id,
        contentJson: nextContentJson,
      });
      if (!validated.ok) {
        return res.status(400).json({ ok: false, error: validated.errors.join(" ") });
      }
      nextContentJson = validated.normalized;
    }

    const updated = await prisma.templateVersion.update({
      where: { id: v.id },
      data: {
        contentJson: nextContentJson,
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
  let nextContentJson = input.contentJson ?? undefined;
  if (templateType === "PST") {
    const validated = await validateAndNormalizePstContent({
      prisma,
      templateId: template.id,
      contentJson: nextContentJson,
    });
    if (!validated.ok) {
      return res.status(400).json({ ok: false, error: validated.errors.join(" ") });
    }
    nextContentJson = validated.normalized;
  }

  const created = await prisma.templateVersion.create({
    data: {
      templateId: template.id,
      version: nextVersion,
      status: "DRAFT",
      contentJson: nextContentJson,
      contentHtml: input.contentHtml ?? undefined,
      changeSummary: input.changeSummary ?? undefined,
      createdById,
      baseVersionId: last?.id ?? null,
    },
  });

  return res.status(201).json({ ok: true, data: created });
});
