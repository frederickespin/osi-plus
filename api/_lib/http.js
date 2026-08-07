function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-osi-role, x-osi-userid",
  );
}

const DEFAULT_JSON_BODY_MAX_BYTES = 256 * 1024;
const DEFAULT_JSON_MAX_DEPTH = 64;

const JSON_BODY_ERROR_MESSAGES = Object.freeze({
  REQUEST_JSON_INVALID: "Solicitud JSON inválida",
  REQUEST_JSON_REQUIRED: "Se requiere una solicitud JSON",
  REQUEST_JSON_OBJECT_REQUIRED: "La solicitud JSON debe ser un objeto",
  REQUEST_CONTENT_TYPE_INVALID: "Content-Type debe ser application/json",
  REQUEST_BODY_TOO_LARGE: "La solicitud JSON excede el tamaño permitido",
  REQUEST_CONTENT_LENGTH_INVALID: "Content-Length inválido",
  REQUEST_JSON_TOO_DEEP: "La solicitud JSON excede la profundidad permitida",
  REQUEST_JSON_UNSAFE_KEYS: "La solicitud JSON contiene claves no permitidas",
});

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
        return res.status(err.status).json({
          ok: false,
          code: err.code,
          error: JSON_BODY_ERROR_MESSAGES[err.code] || "Solicitud JSON inválida",
        });
      }
      // Never include the exception message or stack: either may contain request
      // data, credentials or connection details supplied by a dependency.
      console.error("handler_error", {
        category: "UNEXPECTED_HANDLER_ERROR",
        name: err instanceof Error ? err.name : "UnknownError",
      });
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

function contentLengthHeader(req) {
  const value = req?.headers?.["content-length"] ?? req?.headers?.["Content-Length"];
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

function assertDeclaredBodySize(req, maxBytes) {
  const value = contentLengthHeader(req);
  if (value == null || value === "") return;
  if (!/^\d+$/.test(String(value).trim())) {
    throw new JsonBodyError("REQUEST_CONTENT_LENGTH_INVALID", 400);
  }
  if (Number(value) > maxBytes) throw new JsonBodyError("REQUEST_BODY_TOO_LARGE", 413);
}

function decodeUtf8(buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new JsonBodyError("REQUEST_JSON_INVALID", 400);
  }
}

function assertSafeJsonObject(root, maxDepth = DEFAULT_JSON_MAX_DEPTH) {
  const queue = [{ value: root, depth: 1 }];
  while (queue.length) {
    const { value, depth } = queue.pop();
    if (depth > maxDepth) throw new JsonBodyError("REQUEST_JSON_TOO_DEEP", 400);
    for (const key of Object.keys(value)) {
      if (key === "__proto__" || key === "prototype" || key === "constructor") {
        throw new JsonBodyError("REQUEST_JSON_UNSAFE_KEYS", 400);
      }
      const child = value[key];
      if (child && typeof child === "object") queue.push({ value: child, depth: depth + 1 });
    }
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
  assertSafeJsonObject(value);
  return value;
}

function isMalformedPlatformJsonError(error) {
  if (!error || typeof error !== "object") return false;
  if (error instanceof SyntaxError || error.name === "SyntaxError") return true;
  // Vercel's Node runtime currently throws this generic error from the
  // IncomingMessage.body getter when its platform parser rejects malformed JSON.
  // This exact match is intentionally scoped to the getter access below; other
  // handler/dependency errors must continue through the sanitized 500 path.
  return error.name === "Error" && error.message === "Invalid JSON";
}

function readPlatformBodyOnce(req) {
  try {
    return req?.body;
  } catch (error) {
    if (isMalformedPlatformJsonError(error)) {
      throw new JsonBodyError("REQUEST_JSON_INVALID", 400);
    }
    throw error;
  }
}

/**
 * Lector estricto para endpoints migrados de forma explícita. Los objetos ya
 * parseados por la plataforma se aceptan sin volver a consumir el stream; un
 * Content-Type explícito e incompatible siempre se rechaza.
 */
async function readJsonObject(req, {
  required = true,
  maxBytes = DEFAULT_JSON_BODY_MAX_BYTES,
  requireNonEmptyObject = false,
} = {}) {
  const contentType = contentTypeHeader(req);
  if (contentType != null && !isJsonContentType(contentType)) {
    throw new JsonBodyError("REQUEST_CONTENT_TYPE_INVALID", 415);
  }
  assertDeclaredBodySize(req, maxBytes);

  const requestBody = readPlatformBodyOnce(req);

  // Vercel may expose an HTTP-empty JSON body as an already parsed `{}`.
  // Preserve the platform getter as the first protected body access, then use
  // the transport metadata to distinguish that case from an explicit `{}`.
  const declaredLength = contentLengthHeader(req);
  if (required && declaredLength != null && String(declaredLength).trim() === "0") {
    throw new JsonBodyError("REQUEST_JSON_REQUIRED", 400);
  }

  if (requestBody !== undefined) {
    if (Buffer.isBuffer(requestBody)) {
      if (contentType == null) throw new JsonBodyError("REQUEST_CONTENT_TYPE_INVALID", 415);
      if (requestBody.length > maxBytes) throw new JsonBodyError("REQUEST_BODY_TOO_LARGE", 413);
      return parseJsonObject(decodeUtf8(requestBody), { required, maxBytes });
    }
    if (typeof requestBody === "string") {
      if (contentType == null) throw new JsonBodyError("REQUEST_CONTENT_TYPE_INVALID", 415);
      return parseJsonObject(requestBody, { required, maxBytes });
    }
    if (requestBody === null || Array.isArray(requestBody) || typeof requestBody !== "object") {
      throw new JsonBodyError("REQUEST_JSON_OBJECT_REQUIRED", 400);
    }
    assertBodySize(JSON.stringify(requestBody), maxBytes);
    assertSafeJsonObject(requestBody);
    if (requireNonEmptyObject && declaredLength == null && Object.keys(requestBody).length === 0) {
      throw new JsonBodyError("REQUEST_JSON_REQUIRED", 400);
    }
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
    return parseJsonObject(decodeUtf8(Buffer.concat(chunks)), { required, maxBytes });
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
  isMalformedPlatformJsonError,
  unauthorized,
  badRequest,
};
