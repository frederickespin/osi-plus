import assert from "node:assert/strict";
import { withPrivateApiHeaders, withPublicReadCorsHeaders } from "../api/_lib/http.js";

const ORIGINS = Object.freeze([
  undefined,
  "https://osi-plus-erp-v17.vercel.app",
  "https://external.example",
  "null",
  "https://preview.example",
]);

function response() {
  const headers = new Map();
  return {
    statusCode: 200,
    body: undefined,
    ended: false,
    setHeader(name, value) { headers.set(String(name).toLowerCase(), value); },
    getHeader(name) { return headers.get(String(name).toLowerCase()); },
    removeHeader(name) { headers.delete(String(name).toLowerCase()); },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; this.ended = true; return this; },
    end(value) { this.body = value; this.ended = true; return this; },
  };
}

function assertPrivateHeaders(res, label) {
  assert.equal(res.getHeader("Access-Control-Allow-Origin"), undefined, `${label}: Origin CORS`);
  assert.equal(res.getHeader("Access-Control-Allow-Credentials"), undefined, `${label}: credentials CORS`);
  assert.equal(res.getHeader("Cache-Control"), "private, no-store", `${label}: cache`);
  const vary = String(res.getHeader("Vary") || "").split(",").map((token) => token.trim().toLowerCase());
  assert.deepEqual(vary, ["authorization", "origin"], `${label}: Vary`);
  assert.equal(res.getHeader("Set-Cookie"), undefined, `${label}: cookie`);
}

const privateHandler = withPrivateApiHeaders(async (req, res) => {
  return res.status(409).json({ ok: false, code: "GATE_DISABLED" });
}, { handleOptions: false });

let assertions = 0;
for (const origin of ORIGINS) {
  for (const method of ["GET", "HEAD", "OPTIONS"]) {
    const res = response();
    await privateHandler({ method, headers: origin === undefined ? {} : { origin } }, res);
    assert.equal(res.statusCode, 409, `${method}/${origin ?? "absent"}: gate`);
    assertPrivateHeaders(res, `${method}/${origin ?? "absent"}`);
    if (method === "HEAD") assert.equal(res.body, undefined, "HEAD no debe emitir body");
    assertions += 1;
  }
}

const publicHandler = withPublicReadCorsHeaders(async (req, res) => res.status(200).json({ ok: true }));
for (const method of ["GET", "OPTIONS"]) {
  const res = response();
  await publicHandler({ method, headers: {} }, res);
  assert.equal(res.getHeader("Access-Control-Allow-Origin"), "*", `público ${method}: allow origin`);
  assert.equal(res.getHeader("Access-Control-Allow-Credentials"), undefined, `público ${method}: credentials`);
  assert.equal(res.statusCode, method === "OPTIONS" ? 204 : 200, `público ${method}: status`);
  assertions += 1;
}

process.stdout.write(`${JSON.stringify({ ok: true, protectedMatrix: "5 origins x 3 methods", publicAllowlist: 2, assertions })}\n`);
