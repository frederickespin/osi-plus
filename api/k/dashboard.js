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

  const projects = await prisma.project.findMany({
    orderBy: { startDate: "desc" },
    take: 50,
    include: {
      signals: true,
      pgd: { include: { items: true } },
    },
  });

  // MVP: ensure default signals exist for each project (idempotent).
  // Note: This adds DB writes on first dashboard load, acceptable for MVP.
  for (const p of projects) {
    await ensureDefaultSignals(prisma, p.id, p.startDate);
  }

  const fresh = await prisma.project.findMany({
    orderBy: { startDate: "desc" },
    take: 50,
    include: {
      signals: true,
      pgd: { include: { items: true } },
    },
  });

  const now = new Date();
  const data = fresh.map((p) => {
    const byKind = new Map(p.signals.map((s) => [s.kind, s]));
    const payment = computeSignalColor(byKind.get("PAYMENT"), now);
    const permits = computeSignalColor(byKind.get("PERMITS_PARKING"), now);
    const crates = computeSignalColor(byKind.get("CRATES"), now);
    const thirdParties = computeSignalColor(byKind.get("THIRD_PARTIES"), now);
    const pgd = computePgdBlockingColor(p.pgd);

    return {
      ...p,
      semaphores: {
        payment,
        permits,
        pgd,
        crates,
        thirdParties,
        pgdSummary: pgdBlockingSummary(p.pgd),
      },
    };
  });

  const counts = data.reduce(
    (acc, p) => {
      acc.total += 1;
      acc.byKState[p.kState] = (acc.byKState[p.kState] || 0) + 1;
      return acc;
    },
    { total: 0, byKState: {} },
  );

  return res.status(200).json({ ok: true, counts, data });
});

