import { prisma } from "../../_lib/db.js";
import { getBearerToken } from "../../_lib/auth.js";
import { resolveLegacyUpgradeIdentity } from "../../_lib/authContext.js";
import { setRefreshCookie } from "../../_lib/authCookies.js";
import { validateMt01bMutationOrigin, withMt01bAuthHeaders } from "../../_lib/authOrigin.js";
import { Mt01bAuthError } from "../../_lib/authPolicy.js";
import { createMembershipAuthSession } from "../../_lib/authSession.js";

export default withMt01bAuthHeaders(async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed", allowed: ["POST"] });
  validateMt01bMutationOrigin(req);
  const legacyToken = getBearerToken(req);
  if (!legacyToken) throw new Mt01bAuthError("Bearer token legacy requerido.", { code: "MT01B_LEGACY_TOKEN_REQUIRED" });
  const identity = await resolveLegacyUpgradeIdentity(prisma, legacyToken);
  const result = await createMembershipAuthSession(prisma, identity, { req });
  const user = await prisma.user.findUnique({ where: { id: identity.userId } });
  setRefreshCookie(res, result.refreshToken, result.refreshMaxAgeSeconds);
  return res.status(200).json({
    ok: true,
    token: result.accessToken,
    user: user ? {
      id: user.id,
      code: user.code,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: result.identity.role,
      status: user.status,
      department: user.department,
      joinDate: user.joinDate,
      points: user.points,
      rating: user.rating,
    } : null,
    session: {
      tenantId: result.identity.tenantId,
      membershipId: result.identity.membershipId,
      role: result.identity.role,
      authorizationVersion: result.identity.authorizationVersion,
    },
  });
});
