import { methodNotAllowed, withPrivateApiHeaders } from "../_lib/http.js";

export default withPrivateApiHeaders(async (req, res) => {
  if (req.method === "GET" || req.method === "POST") {
    return res.status(410).json({
      ok: false,
      error: "USERS_ADMINISTRATION_MOVED_TO_MEMBERSHIPS",
      replacement: "/api/admin/memberships",
      identityCreation: "ADMIN_IDENTITY_INVITATION",
    });
  }

  return methodNotAllowed(res, ["GET", "POST"]);
});

