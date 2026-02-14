function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function withCommonHeaders(handler) {
  return async (req, res) => {
    setCors(res);

    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return handler(req, res);
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

export {
  withCommonHeaders,
  methodNotAllowed,
  readJsonBody,
  unauthorized,
};
