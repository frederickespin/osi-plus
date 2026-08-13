import { prisma } from "../_lib/db.js";
import { methodNotAllowed, readJsonObject, setPrivateNoStore, withCommonHeaders } from "../_lib/http.js";
import { requirePilotAuth, requirePilotPermission } from "../_lib/authContextPilot.js";
import {
  assertNoBrowserCommercialAuthority,
  assertCommercialDatabaseIdentity,
  COMMERCIAL_TENANCY_READ_MODES,
  COMMERCIAL_TENANCY_WRITE_MODES,
  createTenantProject,
  requireCommercialPermission,
  resolveCommercialTenancyModes,
  sendCommercialTenancyError,
} from "../_lib/commercialTenancyWrite.js";
import { commercialPagination, listTenantProjects } from "../_lib/commercialTenancyRead.js";
import { PERMS } from "../_lib/rbac.js";
import { isCrm01c1aPreviewRehearsal } from "../_lib/crmPreviewRehearsal.js";

export default withCommonHeaders(async (req, res) => {
  const permission = req.method === "GET" ? PERMS.PROJECTS_VIEW : req.method === "POST" ? PERMS.PROJECTS_CREATE : null;
  let modes = {
    writeMode: COMMERCIAL_TENANCY_WRITE_MODES.LEGACY_ONLY,
    readMode: COMMERCIAL_TENANCY_READ_MODES.LEGACY_ONLY,
  };
  if (["GET", "POST"].includes(req.method)) {
    try {
      modes = resolveCommercialTenancyModes();
    } catch (error) {
      setPrivateNoStore(res);
      return sendCommercialTenancyError(res, error);
    }
  }
  if (modes.tenantMode) setPrivateNoStore(res);
  if (isCrm01c1aPreviewRehearsal()) {
    try {
      await assertCommercialDatabaseIdentity(req, prisma, process.env);
    } catch (error) {
      return sendCommercialTenancyError(res, error);
    }
  }
  const tenantRead = req.method === "GET" && modes.readMode === COMMERCIAL_TENANCY_READ_MODES.TENANT_READ;
  const tenantWrite = req.method === "POST" && modes.writeMode === COMMERCIAL_TENANCY_WRITE_MODES.TENANT_WRITE;
  const auth = tenantRead || tenantWrite
    ? await requireCommercialPermission(req, res, permission, { prisma })
    : permission
      ? await requirePilotPermission(req, res, permission, { prisma })
      : await requirePilotAuth(req, res, { prisma });
  if (!auth) return;

  if (req.method === "GET") {
    const query = String(req.query?.q || "").toLowerCase().trim();
    if (tenantRead) {
      try {
        const result = await listTenantProjects(prisma, {
          tenantId: auth.tenantId,
          query,
          ...commercialPagination(req.query),
        });
        return res.status(200).json({ ok: true, total: result.total, data: result.data });
      } catch (error) {
        return sendCommercialTenancyError(res, error);
      }
    }
    const projects = await prisma.project.findMany({
      orderBy: { startDate: "desc" },
      omit: { tenantId: true },
    });

    const filtered = query
      ? projects.filter(
          (p) =>
            p.name.toLowerCase().includes(query) ||
            p.code.toLowerCase().includes(query),
        )
      : projects;

    return res.status(200).json({
      ok: true,
      total: filtered.length,
      data: filtered,
    });
  }

  if (req.method === "POST") {
    const body = await readJsonObject(req, { requireNonEmptyObject: true });
    if (tenantWrite) {
      try {
        assertNoBrowserCommercialAuthority(body);
      } catch (error) {
        return sendCommercialTenancyError(res, error);
      }
    }
    const data = {
      code: String(body.code || `PRJ-${Date.now()}`),
      name: String(body.name || "Proyecto"),
      clientId: String(body.clientId || ""),
      clientName: String(body.clientName || ""),
      quoteId: body.quoteId ? String(body.quoteId) : null,
      leadId: body.leadId ? String(body.leadId) : null,
      pstCode: body.pstCode ? String(body.pstCode) : null,
      pstServiceName: body.pstServiceName ? String(body.pstServiceName) : null,
      status: String(body.status || "active"),
      startDate: String(body.startDate || new Date().toISOString().slice(0, 10)),
      endDate: body.endDate ? String(body.endDate) : null,
      osiCount: Number(body.osiCount || 0),
      totalValue: Number(body.totalValue || 0),
      assignedTo: body.assignedTo ? String(body.assignedTo) : null,
      notes: body.notes ? String(body.notes) : null,
    };
    let created;
    if (tenantWrite) {
      try {
        created = await createTenantProject(prisma, { tenantId: auth.tenantId, clientId: body.clientId, data });
      } catch (error) {
        return sendCommercialTenancyError(res, error);
      }
    } else {
      created = await prisma.project.create({ data, omit: { tenantId: true } });
    }

    return res.status(201).json({
      ok: true,
      data: created,
    });
  }

  return methodNotAllowed(res, ["GET", "POST"]);
});
