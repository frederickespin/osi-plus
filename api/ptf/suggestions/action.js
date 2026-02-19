import { prisma } from "../../_lib/db.js";
import { badRequest, methodNotAllowed, readJsonBody, withCommonHeaders } from "../../_lib/http.js";
import { requireRoleFromHeaders } from "../../_lib/rbac.js";

const ALLOWED_ROLES = ["A", "C", "I", "B"];

export default withCommonHeaders(async (req, res) => {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  const actor = requireRoleFromHeaders(req, res, ALLOWED_ROLES);
  if (!actor) return;

  const body = await readJsonBody(req);
  const suggestionId = String(body?.suggestionId || "").trim();
  const action = String(body?.action || "").trim().toUpperCase();
  const note = String(body?.note || "").trim();
  if (!suggestionId) return badRequest(res, "suggestionId es obligatorio");
  if (!["APPLY", "IGNORE"].includes(action)) return badRequest(res, "action debe ser APPLY o IGNORE");

  const current = await prisma.ptfAdjustmentSuggestion.findUnique({
    where: { id: suggestionId },
  });
  if (!current) return res.status(404).json({ ok: false, error: "Sugerencia no encontrada" });

  let updated = null;
  let escalation = null;

  if (action === "APPLY") {
    updated = await prisma.ptfAdjustmentSuggestion.update({
      where: { id: suggestionId },
      data: {
        status: "APPLIED",
        ignoredCount: 0,
        lastActionById: actor.userId,
        reason: note ? `${current.reason || ""}\n[APPLIED] ${note}`.trim() : current.reason,
      },
    });
  } else {
    const ignoredCount = Number(current.ignoredCount || 0) + 1;
    const status = ignoredCount >= 3 ? "ESCALATED" : "IGNORED";
    updated = await prisma.ptfAdjustmentSuggestion.update({
      where: { id: suggestionId },
      data: {
        status,
        ignoredCount,
        lastIgnoredAt: new Date(),
        lastActionById: actor.userId,
        reason: note ? `${current.reason || ""}\n[IGNORED] ${note}`.trim() : current.reason,
      },
    });

    if (ignoredCount >= 3) {
      escalation = await prisma.escalationEvent.create({
        data: {
          type: "PTF_SUGGESTION_IGNORED_3X",
          message: `Sugerencia ${suggestionId} ignorada 3 veces. Escalar a A e I.`,
          targetRoles: ["A", "I"],
          suggestionId,
          metadataJson: {
            ignoredCount,
            pstCode: updated.pstCode,
            ptfCode: updated.ptfCode,
          },
        },
      });
    }
  }

  return res.status(200).json({
    ok: true,
    data: updated,
    escalation,
  });
});

