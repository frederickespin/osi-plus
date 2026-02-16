import { prisma } from "../_lib/db.js";
import { methodNotAllowed, withCommonHeaders } from "../_lib/http.js";
import { ensureActorUserId, requireRoleFromHeaders } from "../_lib/rbac.js";
import {
  computePgdBlockingColor,
  computeSignalColor,
  ensureDefaultSignals,
  pgdBlockingSummary,
} from "./_lib.js";

export default withCommonHeaders(async (req, res) => {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  const actor = requireRoleFromHeaders(req, res, ["K", "A"]);
  if (!actor?.role) return;
  await ensureActorUserId(prisma, actor);

  const id = String(req.query?.id || "").trim();
  if (!id) return res.status(400).json({ ok: false, error: "Missing id" });

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      signals: true,
      pgd: { include: { items: { orderBy: { createdAt: "asc" } } } },
      osis: true,
    },
  });
  if (!project) return res.status(404).json({ ok: false, error: "Not Found" });

  await ensureDefaultSignals(prisma, project.id, project.startDate);

  const refreshed = await prisma.project.findUnique({
    where: { id },
    include: {
      signals: true,
      pgd: { include: { items: { orderBy: { createdAt: "asc" } } } },
      osis: true,
    },
  });

  const now = new Date();
  const byKind = new Map(refreshed.signals.map((s) => [s.kind, s]));
  const semaphores = {
    payment: computeSignalColor(byKind.get("PAYMENT"), now),
    permits: computeSignalColor(byKind.get("PERMITS_PARKING"), now),
    crates: computeSignalColor(byKind.get("CRATES"), now),
    thirdParties: computeSignalColor(byKind.get("THIRD_PARTIES"), now),
    pgd: computePgdBlockingColor(refreshed.pgd),
    pgdSummary: pgdBlockingSummary(refreshed.pgd),
  };

  return res.status(200).json({ ok: true, data: { project: refreshed, semaphores } });
});

