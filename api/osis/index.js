import { prisma } from "../_lib/db.js";
import { methodNotAllowed, readJsonBody, withCommonHeaders } from "../_lib/http.js";
import { requireRoleFromHeaders } from "../_lib/rbac.js";
import {
  appendOsiChangeLogs,
  findPstFromProjectFallback,
  suggestPtfPetByPstCode,
} from "./_helpers.js";

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
  if (req.method === "GET") {
    const status = String(req.query?.status || "").trim();
    const query = String(req.query?.q || "").toLowerCase().trim();

    const osis = await prisma.osi.findMany({
      orderBy: { scheduledDate: "desc" },
    });

    const filtered = osis.filter((osi) => {
      const statusMatch = status ? osi.status === status : true;
      const queryMatch = query
        ? osi.code.toLowerCase().includes(query) ||
          osi.clientName.toLowerCase().includes(query) ||
          osi.origin.toLowerCase().includes(query) ||
          osi.destination.toLowerCase().includes(query)
        : true;
      return statusMatch && queryMatch;
    });

    return res.status(200).json({
      ok: true,
      total: filtered.length,
      data: filtered,
    });
  }

  if (req.method === "POST") {
    const actor = requireRoleFromHeaders(req, res, OPS_ALLOWED_ROLES);
    if (!actor) return;
    const body = await readJsonBody(req);
    const kind = asString(body.kind || "EXTERNAL", "EXTERNAL").toUpperCase();
    const projectId = asString(body.projectId || "");

    let project = null;
    if (projectId) {
      project = await prisma.project.findUnique({ where: { id: projectId } });
    }

    const pstResolved = await findPstFromProjectFallback(prisma, project);
    const pstCode = asString(body.pstCode || pstResolved.pstCode || "");
    const suggested = suggestPtfPetByPstCode(pstCode);

    const payload = {
      code: asString(body.code || `OSI-${Date.now()}`),
      projectId: asString(body.projectId || project?.id || ""),
      projectCode: asString(body.projectCode || project?.code || ""),
      clientId: asString(body.clientId || project?.clientId || ""),
      clientName: asString(body.clientName || project?.clientName || ""),
      kind,
      status: asString(body.status || "draft"),
      type: asString(body.type || "local"),
      origin: asString(body.origin || ""),
      destination: asString(body.destination || ""),
      scheduledDate: asString(body.scheduledDate || new Date().toISOString().slice(0, 10)),
      scheduledStartAt: toOptionalString(body.scheduledStartAt),
      scheduledEndAt: toOptionalString(body.scheduledEndAt),
      supervisorId: toOptionalString(body.supervisorId),
      driverId: toOptionalString(body.driverId),
      pstCode: toOptionalString(pstCode),
      pstTemplateVersionId: toOptionalString(body.pstTemplateVersionId),
      ptfCode: toOptionalString(body.ptfCode || suggested.ptfCode),
      petCode: toOptionalString(body.petCode || suggested.petCode),
      ptfMaterialPlan: body.ptfMaterialPlan ?? suggested.ptfMaterialPlan,
      petPlan: body.petPlan ?? suggested.petPlan,
      ptfEditedManually: Boolean(body.ptfEditedManually),
      petEditedManually: Boolean(body.petEditedManually),
      custodyStatus: "DRIVER",
      driverAvailable: false,
      vehicleAvailable: false,
      createdAt: asString(body.createdAt || new Date().toISOString().slice(0, 10)),
      assignedTo: toOptionalString(body.assignedTo),
      team: toStringArray(body.team),
      vehicles: toStringArray(body.vehicles),
      value: Number(body.value || 0),
      notes: toOptionalString(body.notes),
      lastMaterialDeviation: null,
      startedAt: body.startedAt ? new Date(body.startedAt) : null,
      endedAt: body.endedAt ? new Date(body.endedAt) : null,
      npsScore: body.npsScore != null ? Number(body.npsScore || 0) : null,
      supervisorNotes: toOptionalString(body.supervisorNotes),
      ecoPoints: body.ecoPoints != null ? Number(body.ecoPoints || 0) : null,
    };

    const requiredErr = validateRequiredRolesForExternal(payload);
    if (requiredErr) {
      return res.status(400).json({ ok: false, error: requiredErr });
    }

    if (!payload.projectId || !payload.projectCode || !payload.clientId || !payload.clientName) {
      return res.status(400).json({
        ok: false,
        error: "projectId/projectCode/clientId/clientName son obligatorios para crear OSI.",
      });
    }

    const created = await prisma.osi.create({
      data: payload,
    });

    await appendOsiChangeLogs(prisma, {
      osiId: created.id,
      actorUserId: actor.userId,
      actorRole: actor.role,
      action: "CREATE",
      reason: "Creación de OSI externa/interna",
      changes: [{ fieldPath: "*", beforeJson: null, afterJson: created }],
    });

    return res.status(201).json({
      ok: true,
      data: created,
      meta: {
        pstMissing: !created.pstCode,
        pstSource: pstCode ? pstResolved.source : "NONE",
        ptfSuggested: created.ptfCode,
        petSuggested: created.petCode,
      },
    });
  }

  return methodNotAllowed(res, ["GET", "POST"]);
});
