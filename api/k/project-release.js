import { prisma } from "../_lib/db.js";
import { methodNotAllowed, readJsonBody, setPrivateNoStore, withCommonHeaders } from "../_lib/http.js";
import { PERMS, requireRoleFromHeaders } from "../_lib/rbac.js";
import {
  assertNoBrowserCommercialAuthority,
  CommercialTenancyError,
  requireCommercialPermission,
  resolveCommercialTenancyModes,
  sendCommercialTenancyError,
} from "../_lib/commercialTenancyWrite.js";
import { findTenantProject, transitionTenantProject } from "../_lib/commercialTenancyRead.js";
import { computeSignalColor, computePgdBlockingColor, effectiveSignalMap, ensureDefaultSignals } from "./_lib.js";

function buildBlockers(project, { includeDefaults = false } = {}) {
  const now = new Date();
  const signals = includeDefaults ? [...effectiveSignalMap(project.signals, project.startDate).values()] : (project.signals || []);

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

  return { hardRed, softNeedsAck, pgdHardBlock };
}

export default withCommonHeaders(async (req, res) => {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  if (process.env.COMMERCIAL_TENANCY_READ_MODE === "TENANT_READ" || process.env.COMMERCIAL_TENANCY_WRITE_MODE === "TENANT_WRITE") setPrivateNoStore(res);
  let modes;
  try {
    modes = resolveCommercialTenancyModes();
  } catch (error) {
    return sendCommercialTenancyError(res, error);
  }
  const tenantMode = modes.tenantMode;
  let actor;
  if (tenantMode) {
    actor = await requireCommercialPermission(req, res, PERMS.PROJECTS_RELEASE, { prisma });
    if (!actor) return;
    if (!["K", "A"].includes(actor.role)) {
      return res.status(403).json({ ok: false, error: "COMMERCIAL_PERMISSION_FORBIDDEN" });
    }
  } else {
    actor = requireRoleFromHeaders(req, res, ["K", "A"]);
    if (!actor?.role) return;
  }

  const body = await readJsonBody(req);
  if (tenantMode) {
    try {
      assertNoBrowserCommercialAuthority(body);
    } catch (error) {
      return sendCommercialTenancyError(res, error);
    }
  }
  const projectId = String(body.projectId || "").trim();
  if (!projectId) return res.status(400).json({ ok: false, error: "Missing projectId" });

  const include = { signals: true, pgd: { include: { items: true } } };
  let project;
  try {
    project = tenantMode
      ? await findTenantProject(prisma, { tenantId: actor.tenantId, projectId, include })
      : await prisma.project.findUnique({ where: { id: projectId }, omit: { tenantId: true }, include });
  } catch (error) {
    if (!tenantMode) throw error;
    return sendCommercialTenancyError(res, error);
  }
  if (!project) return res.status(404).json({ ok: false, error: "Not Found" });

  if (project.kState !== "VALIDATED") {
    return res.status(409).json({ ok: false, error: "Project must be VALIDATED before RELEASED", kState: project.kState });
  }

  let refreshed = project;
  if (!tenantMode) {
    await ensureDefaultSignals(prisma, project.id, project.startDate);
    refreshed = await prisma.project.findUnique({ where: { id: projectId }, omit: { tenantId: true }, include });
  }

  const blockers = buildBlockers(refreshed, { includeDefaults: tenantMode });
  const hardBlocks = [...blockers.hardRed, ...blockers.pgdHardBlock];
  if (hardBlocks.length > 0 || blockers.softNeedsAck.length > 0) {
    return res.status(409).json({
      ok: false,
      error: "Blocked",
      hardBlocks,
      needsAck: blockers.softNeedsAck,
    });
  }

  let updated;
  try {
    updated = tenantMode
      ? await transitionTenantProject(prisma, {
          tenantId: actor.tenantId,
          projectId,
          expectedUpdatedAt: refreshed.updatedAt,
          expectedKState: "VALIDATED",
          data: { kState: "RELEASED", kReleasedAt: new Date() },
        })
      : await prisma.project.update({
          where: { id: projectId },
          data: { kState: "RELEASED", kReleasedAt: new Date() },
          omit: { tenantId: true },
        });
  } catch (error) {
    if (!tenantMode) throw error;
    const controlled = error?.code === "P2025"
      ? new CommercialTenancyError("COMMERCIAL_RESOURCE_NOT_FOUND", 404)
      : error;
    return sendCommercialTenancyError(res, controlled);
  }

  return res.status(200).json({ ok: true, data: updated });
});

