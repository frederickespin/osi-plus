import { prisma } from "../../_lib/db.js";
import { methodNotAllowed, readJsonBody, withCommonHeaders } from "../../_lib/http.js";
import { ensureActorUserId, requireRoleFromHeaders } from "../../_lib/rbac.js";

export default withCommonHeaders(async (req, res) => {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const actor = requireRoleFromHeaders(req, res, ["A"]);
  if (!actor?.role) return;
  const actorUserId = await ensureActorUserId(prisma, actor);

  const body = await readJsonBody(req);
  const itemId = String(body.itemId || "").trim();
  const status = String(body.status || "").toUpperCase().trim();
  const note = body.note ? String(body.note).slice(0, 500) : null;

  if (!itemId) return res.status(400).json({ ok: false, error: "Missing itemId" });
  if (!["MISSING", "SUBMITTED", "VALIDATED", "REJECTED"].includes(status)) {
    return res.status(400).json({ ok: false, error: "Invalid status" });
  }

  const item = await prisma.projectPgdItem.findUnique({ where: { id: itemId } });
  if (!item) return res.status(404).json({ ok: false, error: "Not Found" });

  const updated = await prisma.projectPgdItem.update({
    where: { id: itemId },
    data: {
      status,
      note,
      validatedAt: status === "VALIDATED" ? new Date() : null,
      validatedById: status === "VALIDATED" ? actorUserId : null,
    },
  });

  return res.status(200).json({ ok: true, data: updated });
});

