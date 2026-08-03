import { prisma } from "../_lib/db.js";
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from "../_lib/authCookies.js";
import { validateMt01bMutationOrigin, withMt01bAuthHeaders } from "../_lib/authOrigin.js";
import { Mt01bAuthError } from "../_lib/authPolicy.js";
import { rotateMembershipRefreshToken } from "../_lib/authSession.js";

export default withMt01bAuthHeaders(async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed", allowed: ["POST"] });
  validateMt01bMutationOrigin(req);
  const refreshToken = readRefreshCookie(req);
  if (!refreshToken) throw new Mt01bAuthError("Refresh cookie requerida.", { code: "MT01B_REFRESH_REQUIRED" });
  try {
    const result = await rotateMembershipRefreshToken(prisma, refreshToken, { req });
    setRefreshCookie(res, result.refreshToken, result.refreshMaxAgeSeconds);
    return res.status(200).json({
      ok: true,
      token: result.accessToken,
      session: {
        tenantId: result.identity.tenantId,
        membershipId: result.identity.membershipId,
        role: result.identity.role,
        authorizationVersion: result.identity.authorizationVersion,
      },
    });
  } catch (error) {
    if (Number(error?.status) === 401) clearRefreshCookie(res);
    throw error;
  }
});
