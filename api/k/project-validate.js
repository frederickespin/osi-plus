import { prisma } from "../_lib/db.js";
import { methodNotAllowed, readJsonBody, withCommonHeaders } from "../_lib/http.js";
import { requireRoleFromHeaders } from "../_lib/rbac.js";
import { computeSignalColor, computePgdBlockingColor, ensureDefaultSignals } from "./_lib.js";

function buildBlockers(project) {
  const now = new Date();
  const byKind = new Map((project.signals || []).map((s) => [s.kind, s]));
  const signals = project.signals || [];

  const hardRed = signals
    .filter((s) => s.policy === "HARD_BLOCK" && computeSignalColor(s, now) === "RED")
    .map((s) => ({ kind: s.kind, policy: s.policy, dueAt: s.dueAt, warnAt: s.warnAt }));

  const softNeedsAck = signals
    .filter(
      (s) =>
        s.policy === "SOFT_ALERT" &&
        computeSignalColor(s, now) === "RED" &&
        !s.ackAt,
    )
    .map((s) => ({ kind: s.kind, policy: s.policy, dueAt: s.dueAt, warnAt: s.warnAt }));

  const pgdColor = computePgdBlockingColor(project.pgd);
  const pgdHardBlock =
    !project.pgd
      ? [{ kind: "PGD_BLOCKING_DOCS", reason: "PGD no aplicada" }]
      : pgdColor === "RED"
        ? [{ kind: "PGD_BLOCKING_DOCS", reason: "Documentos bloqueantes pendientes" }]
        : [];

  // For convenience in UI.
  const semaphores = {
    payment: computeSignalColor(byKind.get("PAYMENT"), now),
    permits: computeSignalColor(byKind.get("PERMITS_PARKING"), now),
    crates: computeSignalColor(byKind.get("CRATES"), now),
    thirdParties: computeSignalColor(byKind.get("THIRD_PARTIES"), now),
    pgd: pgdColor,
  };

  return { hardRed, softNeedsAck, pgdHardBlock, semaphores };
}

export default withCommonHeaders(async (req, res) => {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const actor = requireRoleFromHeaders(req, res, ["K", "A"]);
  if (!actor?.role) return;

  const body = await readJsonBody(req);
  const projectId = String(body.projectId || "").trim();
  if (!projectId) return res.status(400).json({ ok: false, error: "Missing projectId" });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      signals: true,
      pgd: { include: { items: true } },
    },
  });
  if (!project) return res.status(404).json({ ok: false, error: "Not Found" });

  await ensureDefaultSignals(prisma, project.id, project.startDate);

  const refreshed = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      signals: true,
      pgd: { include: { items: true } },
    },
  });

  const blockers = buildBlockers(refreshed);
  const hardBlocks = [...blockers.hardRed, ...blockers.pgdHardBlock];

  if (hardBlocks.length > 0 || blockers.softNeedsAck.length > 0) {
    return res.status(409).json({
      ok: false,
      error: "Blocked",
      semaphores: blockers.semaphores,
      hardBlocks,
      needsAck: blockers.softNeedsAck,
    });
  }

  const updated = await prisma.project.update({
    where: { id: projectId },
    data: { kState: "VALIDATED", kValidatedAt: new Date() },
  });

  return res.status(200).json({ ok: true, data: updated });
});

