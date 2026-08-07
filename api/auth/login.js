import { prisma } from "../_lib/db.js";
import { comparePassword, signAccessToken } from "../_lib/auth.js";
import { methodNotAllowed, readJsonObject, withCommonHeaders } from "../_lib/http.js";
import { isGloballyActiveUser } from "../_lib/userStatus.js";

export default withCommonHeaders(async (req, res) => {
  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST"]);
  }

  const body = await readJsonObject(req, { maxBytes: 16 * 1024 });
  const email = String(body.email || "").toLowerCase().trim();
  const password = String(body.password || "");

  if (!email || !password) {
    return res.status(400).json({
      ok: false,
      error: "email y password son requeridos",
    });
  }

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    return res.status(401).json({ ok: false, error: "Credenciales inválidas" });
  }

  const isValid = await comparePassword(password, user.passwordHash);
  if (!isValid || !isGloballyActiveUser(user.status)) {
    return res.status(401).json({ ok: false, error: "Credenciales inválidas" });
  }

  const token = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });

  return res.status(200).json({
    ok: true,
    token,
    user: {
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
    },
  });
});

