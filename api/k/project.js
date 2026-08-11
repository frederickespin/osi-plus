import { prisma } from "../_lib/db.js";
import { methodNotAllowed, setPrivateNoStore, withCommonHeaders } from "../_lib/http.js";
import { ensureActorUserId, PERMS, requireRoleFromHeaders } from "../_lib/rbac.js";
import {
  COMMERCIAL_TENANCY_READ_MODES,
  requireCommercialPermission,
  resolveCommercialTenancyModes,
  sendCommercialTenancyError,
} from "../_lib/commercialTenancyWrite.js";
import { findTenantProject } from "../_lib/commercialTenancyRead.js";
import {
  computePgdBlockingColor,
  computeSignalColor,
  effectiveSignalMap,
  ensureDefaultSignals,
  pgdBlockingSummary,
} from "./_lib.js";

export default withCommonHeaders(async (req, res) => {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  let modes;
  try {
    modes = resolveCommercialTenancyModes();
  } catch (error) {
    setPrivateNoStore(res);
    return sendCommercialTenancyError(res, error);
  }
  if (modes.tenantMode) setPrivateNoStore(res);
  const tenantRead = modes.readMode === COMMERCIAL_TENANCY_READ_MODES.TENANT_READ;
  let actor;
  if (tenantRead) {
    actor = await requireCommercialPermission(req, res, PERMS.PROJECTS_VIEW, { prisma });
    if (!actor) return;
    if (!["K", "A"].includes(actor.role)) {
      return res.status(403).json({ ok: false, error: "COMMERCIAL_PERMISSION_FORBIDDEN" });
    }
  } else {
    actor = requireRoleFromHeaders(req, res, ["K", "A"]);
    if (!actor?.role) return;
    await ensureActorUserId(prisma, actor);
  }

  const id = String(req.query?.id || "").trim();
  if (!id) return res.status(400).json({ ok: false, error: "Missing id" });

  const include = {
    signals: true,
    pgd: { include: { items: { orderBy: { createdAt: "asc" } } } },
    osis: true,
  };
  let project;
  try {
    project = tenantRead
      ? await findTenantProject(prisma, { tenantId: actor.tenantId, projectId: id, include })
      : await prisma.project.findUnique({ where: { id }, omit: { tenantId: true }, include });
  } catch (error) {
    if (!tenantRead) throw error;
    return sendCommercialTenancyError(res, error);
  }
  if (!project) return res.status(404).json({ ok: false, error: "Not Found" });

  let refreshed = project;
  if (!tenantRead) {
    await ensureDefaultSignals(prisma, project.id, project.startDate);
    refreshed = await prisma.project.findUnique({ where: { id }, omit: { tenantId: true }, include });
  }

  const now = new Date();
  const byKind = effectiveSignalMap(refreshed.signals, refreshed.startDate);
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

