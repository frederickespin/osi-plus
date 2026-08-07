import { prisma } from "../_lib/db.js";
import { getBearerToken, verifyAccessToken } from "../_lib/auth.js";
import { MT01B_AUTH_MODES, resolveMt01bAuthPolicy } from "../_lib/authPolicy.js";
import { methodNotAllowed, unauthorized, withCommonHeaders } from "../_lib/http.js";
import { requireAuthContext } from "../_lib/authContextMiddleware.js";
import { isGloballyActiveUser } from "../_lib/userStatus.js";

function legacyUserDto(user) {
  return {
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
  };
}

export default withCommonHeaders(async (req, res) => {
  if (req.method !== "GET") {
    return methodNotAllowed(res, ["GET"]);
  }

  const policy = resolveMt01bAuthPolicy();
  if (policy.mode === MT01B_AUTH_MODES.LEGACY) {
    const token = getBearerToken(req);
    if (!token) return unauthorized(res);
    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      return unauthorized(res);
    }
    const legacyUser = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!legacyUser || !isGloballyActiveUser(legacyUser.status)) return unauthorized(res);
    return res.status(200).json({ ok: true, user: legacyUserDto(legacyUser) });
  }

  const context = await requireAuthContext(req, res, { prisma });
  if (!context) return;

  if (context.authType === "LEGACY") {
    const user = await prisma.user.findUnique({ where: { id: context.userId } });
    if (!user || !isGloballyActiveUser(user.status)) return unauthorized(res);
    const legacyUser = legacyUserDto(user);
    return res.status(200).json({ ok: true, user: legacyUser });
  }

  return res.status(200).json({
    ok: true,
    auth: {
      authVersion: context.authVersion,
      userId: context.userId,
      email: context.email,
      tenantId: context.tenantId,
      tenantCode: context.tenantCode,
      membershipId: context.membershipId,
      role: context.role,
      authorizationVersion: context.authorizationVersion,
      permissions: context.effectivePermissions,
      sessionId: context.sessionId,
    },
  });
});

