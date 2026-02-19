import { prisma } from "../_lib/db.js";
import { methodNotAllowed, readJsonBody, withCommonHeaders } from "../_lib/http.js";
import { requireAuth } from "../_lib/requireAuth.js";
import { PERMS, requirePerm } from "../_lib/rbac.js";

export default withCommonHeaders(async (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;

  if (req.method === "GET") {
    if (!requirePerm(req, res, PERMS.OSI_VIEW)) return;
    const status = String(req.query?.status || "").trim();
    const query = String(req.query?.q || "").toLowerCase().trim();

    const osis = await prisma.osi.findMany({
      orderBy: { scheduledDate: "desc" },
    });

    const filtered = osis.filter((osi) => {
      const statusMatch = status ? osi.status === status : true;
      const queryMatch = query
        ? osi.code.toLowerCase().includes(query) ||
          osi.clientName.toLowerCase().includes(query) ||
          osi.origin.toLowerCase().includes(query) ||
          osi.destination.toLowerCase().includes(query)
        : true;
      return statusMatch && queryMatch;
    });

    return res.status(200).json({
      ok: true,
      total: filtered.length,
      data: filtered,
    });
  }

  if (req.method === "POST") {
    if (!requirePerm(req, res, PERMS.OSI_CREATE)) return;
    const body = await readJsonBody(req);
    const created = await prisma.osi.create({
      data: {
        code: String(body.code || `OSI-${Date.now()}`),
        projectId: String(body.projectId || ""),
        projectCode: String(body.projectCode || ""),
        clientId: String(body.clientId || ""),
        clientName: String(body.clientName || ""),
        status: String(body.status || "draft"),
        type: String(body.type || "local"),
        origin: String(body.origin || ""),
        destination: String(body.destination || ""),
        scheduledDate: String(body.scheduledDate || new Date().toISOString().slice(0, 10)),
        createdAt: String(body.createdAt || new Date().toISOString().slice(0, 10)),
        assignedTo: body.assignedTo ? String(body.assignedTo) : null,
        team: Array.isArray(body.team) ? body.team.map(String) : [],
        vehicles: Array.isArray(body.vehicles) ? body.vehicles.map(String) : [],
        value: Number(body.value || 0),
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

