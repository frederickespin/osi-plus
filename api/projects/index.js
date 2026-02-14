import { prisma } from "../_lib/db.js";
import { methodNotAllowed, readJsonBody, withCommonHeaders } from "../_lib/http.js";

export default withCommonHeaders(async (req, res) => {
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

