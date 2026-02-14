import { prisma } from "../_lib/db.js";
import { hashPassword } from "../_lib/auth.js";
import { methodNotAllowed, readJsonBody, withCommonHeaders } from "../_lib/http.js";

export default withCommonHeaders(async (req, res) => {
  if (req.method === "GET") {
    const query = String(req.query?.q || "").toLowerCase().trim();
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
    });

    const filtered = query
      ? users.filter(
          (u) =>
            u.name.toLowerCase().includes(query) ||
            u.email.toLowerCase().includes(query) ||
            u.code.toLowerCase().includes(query),
        )
      : users;

    return res.status(200).json({
      ok: true,
      total: filtered.length,
      data: filtered.map((user) => ({
        id: user.id,
        code: user.code,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: user.status,
        department: user.department,
        joinDate: user.joinDate,
        points: user.points,
        rating: user.rating,
      })),
    });
  }

  if (req.method === "POST") {
    const body = await readJsonBody(req);
    const password = String(body.password || "ChangeMe123*");
    const created = await prisma.user.create({
      data: {
        code: String(body.code || `EMP${Date.now()}`),
        name: String(body.name || "Usuario"),
        email: String(body.email || "").toLowerCase().trim(),
        phone: String(body.phone || ""),
        role: String(body.role || "B"),
        status: String(body.status || "active"),
        department: body.department ? String(body.department) : null,
        joinDate: String(body.joinDate || new Date().toISOString().slice(0, 10)),
        points: Number(body.points || 0),
        rating: Number(body.rating || 0),
        passwordHash: await hashPassword(password),
      },
    });

    return res.status(201).json({
      ok: true,
      data: created,
    });
  }

  return methodNotAllowed(res, ["GET", "POST"]);
});

