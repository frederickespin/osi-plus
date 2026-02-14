import { prisma } from "../_lib/db.js";
import { getBearerToken, verifyAccessToken } from "../_lib/auth.js";
import { methodNotAllowed, unauthorized, withCommonHeaders } from "../_lib/http.js";

export default withCommonHeaders(async (req, res) => {
  if (req.method !== "GET") {
    return methodNotAllowed(res, ["GET"]);
  }

  const token = getBearerToken(req);
  if (!token) return unauthorized(res);

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return unauthorized(res);
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
  });

  if (!user) return unauthorized(res);

  return res.status(200).json({
    ok: true,
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

