import { withCommonHeaders, methodNotAllowed } from "./_lib/http.js";

export default withCommonHeaders(async (req, res) => {
  if (req.method !== "GET") {
    return methodNotAllowed(res, ["GET"]);
  }

  return res.status(200).json({
    ok: true,
    app: "OSi-plus ERP v17",
    environment: process.env.VERCEL_ENV || "development",
    region: process.env.VERCEL_REGION || "local",
    commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
    branch: process.env.VERCEL_GIT_COMMIT_REF || null,
    timestamp: new Date().toISOString(),
  });
});
