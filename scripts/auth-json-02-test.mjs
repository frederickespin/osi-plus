import assert from "node:assert/strict";
import loginHandler from "../api/auth/login.js";
import { readJsonObject } from "../api/_lib/http.js";

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; },
  };
}

async function invokeWithBodyGetter(error) {
  let reads = 0;
  const request = { method: "POST", headers: { "content-type": "application/json" } };
  Object.defineProperty(request, "body", {
    get() {
      reads += 1;
      throw error;
    },
  });
  const res = response();
  const logs = [];
  const originalError = console.error;
  console.error = (...items) => logs.push(items);
  try {
    await loginHandler(request, res);
  } finally {
    console.error = originalError;
  }
  return { reads, res, logs };
}

async function invokeWithPlatformBody(platformBody, headers) {
  let reads = 0;
  const request = { method: "POST", headers };
  Object.defineProperty(request, "body", {
    get() {
      reads += 1;
      return platformBody;
    },
  });
  const res = response();
  await loginHandler(request, res);
  return { reads, res };
}

const cases = [];
function test(name, condition) {
  assert.equal(condition, true, name);
  cases.push(name);
}

for (const malformedError of [new SyntaxError("sensitive parser detail"), new Error("Invalid JSON")]) {
  const result = await invokeWithBodyGetter(malformedError);
  test(`${malformedError.name} reconocido devuelve 400`, result.res.statusCode === 400);
  test(`${malformedError.name} incluye código estable`, result.res.body?.code === "REQUEST_JSON_INVALID");
  test(`${malformedError.name} incluye mensaje genérico`, result.res.body?.error === "Solicitud JSON inválida");
  test(`${malformedError.name} accede body una sola vez`, result.reads === 1);
  test(`${malformedError.name} no registra detalle`, result.logs.length === 0);
}

const unexpected = await invokeWithBodyGetter(new TypeError("password=never-log"));
test("excepción ajena al parser conserva 500", unexpected.res.statusCode === 500);
test("excepción inesperada conserva contrato sanitizado", unexpected.res.body?.error === "Internal Server Error" && unexpected.res.body?.code === undefined);
test("excepción inesperada accede body una sola vez", unexpected.reads === 1);
test("log inesperado no contiene secreto ni stack", !JSON.stringify(unexpected.logs).includes("never-log") && !JSON.stringify(unexpected.logs).includes("TypeError:"));

const normalizedEmpty = await invokeWithPlatformBody({}, {
  "content-type": "application/json",
  "content-length": "0",
});
test("vacío normalizado por Vercel devuelve REQUIRED", normalizedEmpty.res.statusCode === 400 && normalizedEmpty.res.body?.code === "REQUEST_JSON_REQUIRED");
test("vacío normalizado accede body una sola vez", normalizedEmpty.reads === 1);

const explicitEmpty = await invokeWithPlatformBody({}, {
  "content-type": "application/json",
  "content-length": "2",
});
test("objeto explícito vacío conserva validación de campos", explicitEmpty.res.statusCode === 400 && explicitEmpty.res.body?.code === undefined);
test("objeto explícito vacío accede body una sola vez", explicitEmpty.reads === 1);

const normalizedWithoutLength = await invokeWithPlatformBody({}, {
  "content-type": "application/json",
});
test("vacío normalizado sin Content-Length devuelve REQUIRED", normalizedWithoutLength.res.statusCode === 400 && normalizedWithoutLength.res.body?.code === "REQUEST_JSON_REQUIRED");
test("vacío sin Content-Length accede body una sola vez", normalizedWithoutLength.reads === 1);

const explicitHelperEmpty = await readJsonObject({
  headers: { "content-type": "application/json", "content-length": "2" },
  body: {},
}, { requireNonEmptyObject: true });
test("helper distingue objeto explícito vacío", Object.keys(explicitHelperEmpty).length === 0);

const defaultHelperEmpty = await readJsonObject({
  headers: { "content-type": "application/json" },
  body: {},
});
test("helper no cambia globalmente el significado de objeto vacío", Object.keys(defaultHelperEmpty).length === 0);

for (const [name, body, status, code] of [
  ["truncado", '{"email":', 400, "REQUEST_JSON_INVALID"],
  ["vacío", "", 400, "REQUEST_JSON_REQUIRED"],
  ["null", "null", 400, "REQUEST_JSON_OBJECT_REQUIRED"],
  ["array", "[]", 400, "REQUEST_JSON_OBJECT_REQUIRED"],
]) {
  const res = response();
  await loginHandler({ method: "POST", headers: { "content-type": "application/json" }, body }, res);
  test(`${name} devuelve status esperado`, res.statusCode === status);
  test(`${name} devuelve código simbólico`, res.body?.code === code);
  test(`${name} devuelve mensaje separado`, typeof res.body?.error === "string" && res.body.error !== code);
}

for (const [name, request, expectedCode, expectedStatus] of [
  ["Content-Type", { headers: { "content-type": "text/plain" }, body: "{}" }, "REQUEST_CONTENT_TYPE_INVALID", 415],
  ["body excesivo", { headers: { "content-type": "application/json" }, body: JSON.stringify({ x: "a".repeat(33) }) }, "REQUEST_BODY_TOO_LARGE", 413],
]) {
  try {
    await readJsonObject(request, name === "body excesivo" ? { maxBytes: 16 } : undefined);
    assert.fail(`${name} debió fallar`);
  } catch (error) {
    test(`${name} conserva código`, error.code === expectedCode && error.status === expectedStatus);
  }
}

const parsed = await readJsonObject({ headers: { "content-type": "application/json" }, body: { ok: true } });
test("objeto ya parseado por Vercel se acepta", parsed.ok === true);

let streamReads = 0;
const streamRequest = {
  headers: { "content-type": "application/json" },
  async *[Symbol.asyncIterator]() {
    streamReads += 1;
    yield Buffer.from('{"ok":true}');
  },
};
const streamed = await readJsonObject(streamRequest);
test("stream JSON válido se acepta", streamed.ok === true && streamReads === 1);

let emptyStreamReads = 0;
const emptyChunkedRequest = {
  headers: { "content-type": "application/json", "transfer-encoding": "chunked" },
  async *[Symbol.asyncIterator]() {
    emptyStreamReads += 1;
  },
};
try {
  await readJsonObject(emptyChunkedRequest, { requireNonEmptyObject: true });
  assert.fail("stream chunked vacío debió fallar");
} catch (error) {
  test("stream chunked vacío devuelve REQUIRED", error.code === "REQUEST_JSON_REQUIRED" && error.status === 400);
  test("stream chunked vacío se consume una vez", emptyStreamReads === 1);
}

process.stdout.write(`${JSON.stringify({ ok: true, passed: cases.length })}\n`);
