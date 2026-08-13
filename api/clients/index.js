import { prisma } from "../_lib/db.js";
import { methodNotAllowed, readJsonObject, setPrivateNoStore, withCommonHeaders } from "../_lib/http.js";
import { requirePilotAuth, requirePilotPermission } from "../_lib/authContextPilot.js";
import {
  assertNoBrowserCommercialAuthority,
  assertCommercialDatabaseIdentity,
  COMMERCIAL_TENANCY_READ_MODES,
  COMMERCIAL_TENANCY_WRITE_MODES,
  createTenantClient,
  requireCommercialPermission,
  resolveCommercialTenancyModes,
  sendCommercialTenancyError,
} from "../_lib/commercialTenancyWrite.js";
import { commercialPagination, listTenantClients } from "../_lib/commercialTenancyRead.js";
import { PERMS } from "../_lib/rbac.js";
import { isCrm01c1aPreviewRehearsal } from "../_lib/crmPreviewRehearsal.js";

export default withCommonHeaders(async (req, res) => {
  const permission = req.method === "GET" ? PERMS.CLIENTS_VIEW : req.method === "POST" ? PERMS.CLIENTS_CREATE : null;
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
        const result = await listTenantClients(prisma, {
          tenantId: auth.tenantId,
          query,
          ...commercialPagination(req.query),
        });
        return res.status(200).json({ ok: true, total: result.total, data: result.data });
      } catch (error) {
        return sendCommercialTenancyError(res, error);
      }
    }
    const clients = await prisma.client.findMany({
      orderBy: { createdAt: "desc" },
      omit: { tenantId: true },
    });

    const filtered = query
      ? clients.filter(
          (c) =>
            c.name.toLowerCase().includes(query) ||
            c.code.toLowerCase().includes(query),
        )
      : clients;

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
      code: String(body.code || `CLI${Date.now()}`),
      name: String(body.name || "Cliente"),
      email: String(body.email || ""),
      phone: String(body.phone || ""),
      address: String(body.address || ""),
      type: String(body.type || "corporate"),
      status: String(body.status || "active"),
      totalServices: Number(body.totalServices || 0),
      lastService: body.lastService ? String(body.lastService) : null,
      createdAt: String(body.createdAt || new Date().toISOString().slice(0, 10)),
    };
    let created;
    if (tenantWrite) {
      try {
        created = await createTenantClient(prisma, { tenantId: auth.tenantId, data });
      } catch (error) {
        return sendCommercialTenancyError(res, error);
      }
    } else {
      created = await prisma.client.create({ data: { ...data }, omit: { tenantId: true } });
    }

    return res.status(201).json({
      ok: true,
      data: created,
    });
  }

  return methodNotAllowed(res, ["GET", "POST"]);
});

