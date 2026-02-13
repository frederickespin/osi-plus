import { withCommonHeaders, methodNotAllowed } from "./_lib/http.js";

export default withCommonHeaders(async (req, res) => {
  if (req.method !== "GET") {
    return methodNotAllowed(res, ["GET"]);
  }

  return res.status(200).json({
    ok: true,
    service: "osi-plus-api",
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
});
