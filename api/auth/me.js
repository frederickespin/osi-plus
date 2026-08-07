import { prisma } from "../_lib/db.js";
import { getBearerToken, verifyAccessToken } from "../_lib/auth.js";
import { MT01B_AUTH_MODES, resolveMt01bAuthPolicy } from "../_lib/authPolicy.js";
import { methodNotAllowed, unauthorized, withCommonHeaders } from "../_lib/http.js";
import { requireAuthContext } from "../_lib/authContextMiddleware.js";

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
    if (!legacyUser) return unauthorized(res);
    return res.status(200).json({ ok: true, user: legacyUserDto(legacyUser) });
  }

  const context = await requireAuthContext(req, res, { prisma });
  if (!context) return;

  const user = await prisma.user.findUnique({
    where: { id: context.userId },
  });

  if (!user) return unauthorized(res);

  const legacyUser = legacyUserDto(user);

  if (context.authType === "LEGACY") {
    return res.status(200).json({ ok: true, user: legacyUser });
  }

  const [tenant, membership] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: context.tenantId } }),
    prisma.tenantMembership.findUnique({ where: { id: context.membershipId } }),
  ]);
  if (!tenant || !membership || membership.tenantId !== context.tenantId || membership.userId !== context.userId) {
    return unauthorized(res);
  }

  return res.status(200).json({
    ok: true,
    user: { ...legacyUser, role: context.role },
    tenant: {
      id: tenant.id,
      code: tenant.code,
      name: tenant.name,
      status: tenant.status,
    },
    membership: {
      id: membership.id,
      role: context.role,
      status: context.membershipStatus,
      effectivePermissions: context.effectivePermissions,
      authorizationVersion: context.authorizationVersion,
    },
    sessionId: context.sessionId,
  });
});

