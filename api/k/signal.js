import { prisma } from "../_lib/db.js";
import { methodNotAllowed, readJsonBody, withCommonHeaders } from "../_lib/http.js";
import { ensureActorUserId, requireRoleFromHeaders } from "../_lib/rbac.js";

export default withCommonHeaders(async (req, res) => {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const actor = requireRoleFromHeaders(req, res, ["K", "A"]);
  if (!actor?.role) return;
  const actorUserId = await ensureActorUserId(prisma, actor);

  const body = await readJsonBody(req);
  const signalId = String(body.signalId || "").trim();
  if (!signalId) return res.status(400).json({ ok: false, error: "Missing signalId" });

  const signal = await prisma.projectSignal.findUnique({ where: { id: signalId } });
  if (!signal) return res.status(404).json({ ok: false, error: "Signal not found" });

  const patch = {};

  if (typeof body.done === "boolean") {
    patch.doneAt = body.done ? new Date() : null;
  }

  if (typeof body.ack === "boolean") {
    if (body.ack) {
      patch.ackAt = new Date();
      patch.ackById = actorUserId;
      patch.ackNote = body.ackNote ? String(body.ackNote).slice(0, 500) : null;
    } else {
      patch.ackAt = null;
      patch.ackById = null;
      patch.ackNote = null;
    }
  }

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ ok: false, error: "No changes" });
  }

  const updated = await prisma.projectSignal.update({
    where: { id: signalId },
    data: patch,
  });

  return res.status(200).json({ ok: true, data: updated });
});
