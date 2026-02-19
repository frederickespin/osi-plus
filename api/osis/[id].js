import { prisma } from "../_lib/db.js";
import { badRequest, methodNotAllowed, readJsonBody, withCommonHeaders } from "../_lib/http.js";
import { requireRoleFromHeaders } from "../_lib/rbac.js";
import { appendOsiChangeLogs, diffPlainObjects, suggestPtfPetByPstCode } from "./_helpers.js";

const OPS_ALLOWED_ROLES = ["A", "B", "K", "V", "D", "E", "C1"];

function asString(v, fallback = "") {
  const value = typeof v === "string" ? v : v == null ? "" : String(v);
  return value.trim() || fallback;
}

function toOptionalString(v) {
  const s = asString(v, "");
  return s || null;
}

function toStringArray(v) {
  return Array.isArray(v) ? v.map((x) => asString(x, "")).filter(Boolean) : [];
}

function isExternalKind(kind) {
  return String(kind || "EXTERNAL").toUpperCase() === "EXTERNAL";
}

function validateRequiredRolesForExternal(input) {
  if (!isExternalKind(input.kind)) return null;
  if (!input.supervisorId) return "Supervisor (D) es obligatorio para OSI Externa.";
  if (!input.driverId) return "Chofer (E) es obligatorio para OSI Externa.";
  return null;
}

export default withCommonHeaders(async (req, res) => {
  const osiId = asString(req.query?.id || "");
  if (!osiId) return badRequest(res, "id es obligatorio");

  if (req.method === "GET") {
    const osi = await prisma.osi.findUnique({
      where: { id: osiId },
      include: {
        changeLogs: { orderBy: { createdAt: "desc" }, take: 50 },
        handshakes: { orderBy: { createdAt: "desc" }, take: 20 },
        materialReturns: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
    if (!osi) return res.status(404).json({ ok: false, error: "OSI no encontrada" });
    return res.status(200).json({ ok: true, data: osi });
  }

  if (req.method === "PATCH") {
    const actor = requireRoleFromHeaders(req, res, OPS_ALLOWED_ROLES);
    if (!actor) return;

    const before = await prisma.osi.findUnique({ where: { id: osiId } });
    if (!before) return res.status(404).json({ ok: false, error: "OSI no encontrada" });

    const body = await readJsonBody(req);
    const patch = {
      status: body.status ? asString(body.status) : before.status,
      kind: body.kind ? asString(body.kind).toUpperCase() : before.kind,
      type: body.type ? asString(body.type) : before.type,
      origin: body.origin != null ? asString(body.origin) : before.origin,
      destination: body.destination != null ? asString(body.destination) : before.destination,
      scheduledDate: body.scheduledDate ? asString(body.scheduledDate) : before.scheduledDate,
      scheduledStartAt: body.scheduledStartAt != null ? toOptionalString(body.scheduledStartAt) : before.scheduledStartAt,
      scheduledEndAt: body.scheduledEndAt != null ? toOptionalString(body.scheduledEndAt) : before.scheduledEndAt,
      supervisorId: body.supervisorId != null ? toOptionalString(body.supervisorId) : before.supervisorId,
      driverId: body.driverId != null ? toOptionalString(body.driverId) : before.driverId,
      pstCode: body.pstCode != null ? toOptionalString(body.pstCode) : before.pstCode,
      pstTemplateVersionId:
        body.pstTemplateVersionId != null ? toOptionalString(body.pstTemplateVersionId) : before.pstTemplateVersionId,
      ptfCode: body.ptfCode != null ? toOptionalString(body.ptfCode) : before.ptfCode,
      petCode: body.petCode != null ? toOptionalString(body.petCode) : before.petCode,
      ptfMaterialPlan: body.ptfMaterialPlan ?? before.ptfMaterialPlan,
      petPlan: body.petPlan ?? before.petPlan,
      ptfEditedManually: body.ptfEditedManually != null ? Boolean(body.ptfEditedManually) : before.ptfEditedManually,
      petEditedManually: body.petEditedManually != null ? Boolean(body.petEditedManually) : before.petEditedManually,
      assignedTo: body.assignedTo != null ? toOptionalString(body.assignedTo) : before.assignedTo,
      team: body.team != null ? toStringArray(body.team) : before.team,
      vehicles: body.vehicles != null ? toStringArray(body.vehicles) : before.vehicles,
      value: body.value != null ? Number(body.value || 0) : before.value,
      notes: body.notes != null ? toOptionalString(body.notes) : before.notes,
      startedAt: body.startedAt != null ? (body.startedAt ? new Date(body.startedAt) : null) : before.startedAt,
      endedAt: body.endedAt != null ? (body.endedAt ? new Date(body.endedAt) : null) : before.endedAt,
      npsScore: body.npsScore != null ? Number(body.npsScore || 0) : before.npsScore,
      supervisorNotes: body.supervisorNotes != null ? toOptionalString(body.supervisorNotes) : before.supervisorNotes,
      ecoPoints: body.ecoPoints != null ? Number(body.ecoPoints || 0) : before.ecoPoints,
    };

    if (body.applySuggestedPtfPet === true && patch.pstCode) {
      const suggested = suggestPtfPetByPstCode(patch.pstCode);
      patch.ptfCode = suggested.ptfCode;
      patch.petCode = suggested.petCode;
      patch.ptfMaterialPlan = suggested.ptfMaterialPlan;
      patch.petPlan = suggested.petPlan;
      patch.ptfEditedManually = false;
      patch.petEditedManually = false;
    }

    const validationError = validateRequiredRolesForExternal(patch);
    if (validationError) return res.status(400).json({ ok: false, error: validationError });

    const after = await prisma.osi.update({
      where: { id: osiId },
      data: patch,
    });

    const trackedFields = [
      "status",
      "kind",
      "type",
      "origin",
      "destination",
      "scheduledDate",
      "scheduledStartAt",
      "scheduledEndAt",
      "supervisorId",
      "driverId",
      "pstCode",
      "ptfCode",
      "petCode",
      "ptfMaterialPlan",
      "petPlan",
      "team",
      "vehicles",
      "value",
      "notes",
      "startedAt",
      "endedAt",
      "npsScore",
      "supervisorNotes",
      "ecoPoints",
    ];
    const beforeTracked = Object.fromEntries(trackedFields.map((k) => [k, before[k]]));
    const afterTracked = Object.fromEntries(trackedFields.map((k) => [k, after[k]]));
    const changes = diffPlainObjects(beforeTracked, afterTracked);

    await appendOsiChangeLogs(prisma, {
      osiId: osiId,
      actorUserId: actor.userId,
      actorRole: actor.role,
      action: "UPDATE",
      reason: asString(body.changeReason || body.reason || "", "") || null,
      changes,
    });

    return res.status(200).json({ ok: true, data: after, meta: { changes: changes.length } });
  }

  return methodNotAllowed(res, ["GET", "PATCH"]);
});

