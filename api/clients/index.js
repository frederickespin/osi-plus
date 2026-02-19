import { prisma } from "../_lib/db.js";
import { methodNotAllowed, readJsonBody, withCommonHeaders } from "../_lib/http.js";
import { requireAuth } from "../_lib/requireAuth.js";
import { PERMS, requirePerm } from "../_lib/rbac.js";

export default withCommonHeaders(async (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;

  if (req.method === "GET") {
    if (!requirePerm(req, res, PERMS.CLIENTS_VIEW)) return;
    const query = String(req.query?.q || "").toLowerCase().trim();
    const clients = await prisma.client.findMany({
      orderBy: { createdAt: "desc" },
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
    if (!requirePerm(req, res, PERMS.CLIENTS_CREATE)) return;
    const body = await readJsonBody(req);
    const created = await prisma.client.create({
      data: {
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
      },
    });

    return res.status(201).json({
      ok: true,
      data: created,
    });
  }

  return methodNotAllowed(res, ["GET", "POST"]);
});

