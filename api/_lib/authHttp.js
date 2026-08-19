const AUTH_CORS_HEADERS = Object.freeze([
  "Access-Control-Allow-Origin",
  "Access-Control-Allow-Credentials",
  "Access-Control-Allow-Methods",
  "Access-Control-Allow-Headers",
]);

function appendVary(res, field) {
  const current = typeof res.getHeader === "function" ? res.getHeader("Vary") : undefined;
  const values = String(current || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!values.some((value) => value.toLowerCase() === field.toLowerCase())) values.push(field);
  res.setHeader("Vary", values.join(", "));
}

/**
 * Auth se consume exclusivamente en mismo origen. No refleja Origin ni emite
 * credenciales CORS: el navegador aplica su política de mismo origen.
 */
export function setAuthPrivateHeaders(res) {
  for (const header of AUTH_CORS_HEADERS) {
    if (typeof res.removeHeader === "function") res.removeHeader(header);
  }
  res.setHeader("Cache-Control", "private, no-store");
  appendVary(res, "Authorization");
  appendVary(res, "Origin");
}

function rawHeaderCount(req, headerName) {
  const rawHeaders = Array.isArray(req?.rawHeaders) ? req.rawHeaders : [];
  let count = 0;
  for (let index = 0; index < rawHeaders.length; index += 2) {
    if (String(rawHeaders[index] || "").toLowerCase() === headerName.toLowerCase()) count += 1;
  }
  return count;
}

function hasAmbiguousAuthorization(req) {
  const value = req?.headers?.authorization ?? req?.headers?.Authorization;
  if (Array.isArray(value)) return true;
  if (rawHeaderCount(req, "authorization") > 1) return true;
  return typeof value === "string" && value.includes(",");
}

function sendMethodNotAllowed(res, allowed, { head = false } = {}) {
  res.setHeader("Allow", allowed.join(", "));
  res.status(405);
  if (head) return res.end();
  return res.json({ ok: false, error: "Method Not Allowed", allowed });
}

async function invokeHead(handler, req, res) {
  const originalMethod = req.method;
  const originalJson = res.json;
  const originalSend = res.send;
  req.method = "GET";
  res.json = function headJson() { return this.end(); };
  if (typeof originalSend === "function") res.send = function headSend() { return this.end(); };
  try {
    return await handler(req, res);
  } finally {
    req.method = originalMethod;
    res.json = originalJson;
    if (typeof originalSend === "function") res.send = originalSend;
  }
}

/**
 * Wrapper exclusivo para login/me LEGACY. OPTIONS y métodos no declarados se
 * resuelven antes de body, autenticación o Prisma. HEAD sólo representa GET.
 */
export function withLegacyAuthHeaders(handler, { methods }) {
  const allowed = Object.freeze([...methods]);
  return async (req, res) => {
    setAuthPrivateHeaders(res);
    res.setHeader("Content-Type", "application/json; charset=utf-8");

    if (req.method === "OPTIONS") return sendMethodNotAllowed(res, allowed);
    if (req.method === "HEAD") {
      if (!allowed.includes("GET")) return sendMethodNotAllowed(res, allowed, { head: true });
      if (hasAmbiguousAuthorization(req)) return res.status(401).end();
      return invokeHead(handler, req, res);
    }
    if (!allowed.includes(req.method)) return sendMethodNotAllowed(res, allowed);
    if (hasAmbiguousAuthorization(req)) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    return handler(req, res);
  };
}

