import { prisma } from "../_lib/db.js";
import { clearRefreshCookie, readRefreshCookie } from "../_lib/authCookies.js";
import { validateMt01bMutationOrigin, withMt01bAuthHeaders } from "../_lib/authOrigin.js";
import { revokeMembershipAuthSession } from "../_lib/authSession.js";

export default withMt01bAuthHeaders(async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed", allowed: ["POST"] });
  validateMt01bMutationOrigin(req);
  const refreshToken = readRefreshCookie(req);
  if (refreshToken) await revokeMembershipAuthSession(prisma, refreshToken, { reason: "LOGOUT" });
  clearRefreshCookie(res);
  return res.status(204).end();
});
