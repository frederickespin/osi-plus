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

process.stdout.write(`${JSON.stringify({ ok: true, passed: cases.length })}\n`);
