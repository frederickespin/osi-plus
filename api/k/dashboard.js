import { prisma } from "../_lib/db.js";
import { requirePilotPermission } from "../_lib/authContextPilot.js";
import { databaseUnavailable, methodNotAllowed, setPrivateNoStore, withCommonHeaders } from "../_lib/http.js";
import { PERMS } from "../_lib/rbac.js";
import {
  computePgdBlockingColor,
  computeSignalColor,
  effectiveSignalMap,
  pgdBlockingSummary,
} from "./_lib.js";

export default withCommonHeaders(async (req, res) => {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  setPrivateNoStore(res);
  const context = await requirePilotPermission(req, res, PERMS.PROJECTS_VIEW, { prisma });
  if (!context) return;
  if (!["A", "K"].includes(context.role)) {
    return res.status(403).json({ ok: false, error: "Forbidden", perm: PERMS.PROJECTS_VIEW });
  }

  let projects;
  try {
    projects = await prisma.project.findMany({
      orderBy: { startDate: "desc" },
      take: 50,
      include: {
        signals: true,
        pgd: { include: { items: true } },
      },
    });
  } catch {
    return databaseUnavailable(res);
  }

  const now = new Date();
  const data = projects.map((p) => {
    const byKind = effectiveSignalMap(p.signals, p.startDate);
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

