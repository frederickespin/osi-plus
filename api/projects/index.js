import { prisma } from "../_lib/db.js";
import { methodNotAllowed, readJsonBody, withCommonHeaders } from "../_lib/http.js";
import { requirePilotAuth, requirePilotPermission } from "../_lib/authContextPilot.js";
import { PERMS } from "../_lib/rbac.js";

export default withCommonHeaders(async (req, res) => {
  const permission = req.method === "GET" ? PERMS.PROJECTS_VIEW : req.method === "POST" ? PERMS.PROJECTS_CREATE : null;
  const auth = permission
    ? await requirePilotPermission(req, res, permission, { prisma })
    : await requirePilotAuth(req, res, { prisma });
  if (!auth) return;

  if (req.method === "GET") {
    const query = String(req.query?.q || "").toLowerCase().trim();
    const projects = await prisma.project.findMany({
      orderBy: { startDate: "desc" },
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
    const body = await readJsonBody(req);
    const created = await prisma.project.create({
      data: {
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
      },
    });

    return res.status(201).json({
      ok: true,
      data: created,
    });
  }

  return methodNotAllowed(res, ["GET", "POST"]);
});
