function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-osi-role, x-osi-userid",
  );
}

function withCommonHeaders(handler) {
  return async (req, res) => {
    setCors(res);

    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    try {
      return await handler(req, res);
    } catch (err) {
      // Ensure we always get a visible stack trace in Vercel logs.
      const message =
        err instanceof Error ? err.stack || err.message : String(err);
      console.error("handler_error:", message);
      return res.status(500).json({ ok: false, error: "Internal Server Error" });
    }
  };
}

function methodNotAllowed(res, allowed = ["GET"]) {
  res.setHeader("Allow", allowed.join(", "));
  return res.status(405).json({
    ok: false,
    error: "Method Not Allowed",
    allowed,
  });
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  return {};
}

function unauthorized(res) {
  return res.status(401).json({
    ok: false,
    error: "Unauthorized",
  });
}

function badRequest(res, error = "Bad Request", detail = null) {
  return res.status(400).json({
    ok: false,
    error,
    ...(detail ? { detail } : {}),
  });
}

export {
  withCommonHeaders,
  methodNotAllowed,
  readJsonBody,
  unauthorized,
  badRequest,
};
