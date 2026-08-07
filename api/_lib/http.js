function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-osi-role, x-osi-userid",
  );
}

const DEFAULT_JSON_BODY_MAX_BYTES = 256 * 1024;

class JsonBodyError extends Error {
  constructor(code, status) {
    super(code);
    this.name = "JsonBodyError";
    this.code = code;
    this.status = status;
  }
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
      if (err instanceof JsonBodyError) {
        return res.status(err.status).json({ ok: false, error: err.code });
      }
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

function contentTypeHeader(req) {
  const value = req?.headers?.["content-type"] ?? req?.headers?.["Content-Type"];
  return Array.isArray(value) ? value[0] : value;
}

function isJsonContentType(value) {
  if (typeof value !== "string") return false;
  const mediaType = value.split(";", 1)[0].trim().toLowerCase();
  return mediaType === "application/json" ||
    (mediaType.startsWith("application/") && mediaType.endsWith("+json"));
}

function assertBodySize(raw, maxBytes) {
  if (Buffer.byteLength(raw, "utf8") > maxBytes) {
    throw new JsonBodyError("REQUEST_BODY_TOO_LARGE", 413);
  }
}

function parseJsonObject(raw, { required, maxBytes }) {
  assertBodySize(raw, maxBytes);
  if (!raw.trim()) {
    if (!required) return {};
    throw new JsonBodyError("REQUEST_JSON_REQUIRED", 400);
  }
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new JsonBodyError("REQUEST_JSON_INVALID", 400);
  }
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new JsonBodyError("REQUEST_JSON_OBJECT_REQUIRED", 400);
  }
  return value;
}

/**
 * Lector estricto para endpoints migrados de forma explícita. Los objetos ya
 * parseados por la plataforma se aceptan sin volver a consumir el stream; un
 * Content-Type explícito e incompatible siempre se rechaza.
 */
async function readJsonObject(req, {
  required = true,
  maxBytes = DEFAULT_JSON_BODY_MAX_BYTES,
} = {}) {
  const contentType = contentTypeHeader(req);
  if (contentType != null && !isJsonContentType(contentType)) {
    throw new JsonBodyError("REQUEST_CONTENT_TYPE_INVALID", 415);
  }

  let requestBody;
  try {
    requestBody = req?.body;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new JsonBodyError("REQUEST_JSON_INVALID", 400);
    }
    throw error;
  }

  if (requestBody !== undefined) {
    if (Buffer.isBuffer(requestBody)) {
      if (contentType == null) throw new JsonBodyError("REQUEST_CONTENT_TYPE_INVALID", 415);
      return parseJsonObject(requestBody.toString("utf8"), { required, maxBytes });
    }
    if (typeof requestBody === "string") {
      if (contentType == null) throw new JsonBodyError("REQUEST_CONTENT_TYPE_INVALID", 415);
      return parseJsonObject(requestBody, { required, maxBytes });
    }
    if (requestBody === null || Array.isArray(requestBody) || typeof requestBody !== "object") {
      throw new JsonBodyError("REQUEST_JSON_OBJECT_REQUIRED", 400);
    }
    assertBodySize(JSON.stringify(requestBody), maxBytes);
    return requestBody;
  }

  if (req && typeof req[Symbol.asyncIterator] === "function") {
    if (contentType == null) throw new JsonBodyError("REQUEST_CONTENT_TYPE_INVALID", 415);
    const chunks = [];
    let bytes = 0;
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > maxBytes) throw new JsonBodyError("REQUEST_BODY_TOO_LARGE", 413);
      chunks.push(buffer);
    }
    return parseJsonObject(Buffer.concat(chunks).toString("utf8"), { required, maxBytes });
  }

  if (!required) return {};
  throw new JsonBodyError("REQUEST_JSON_REQUIRED", 400);
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
  readJsonObject,
  JsonBodyError,
  DEFAULT_JSON_BODY_MAX_BYTES,
  unauthorized,
  badRequest,
};
