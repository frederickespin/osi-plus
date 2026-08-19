import assert from "node:assert/strict";
import {
  mergeCrmVaryTokens,
  setCrmPrivateHeaders,
} from "../api/_lib/crmHttpHeaders.js";

const results = [];
function check(name, condition, detail) {
  results.push({ name, passed: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
  assert.equal(Boolean(condition), true, name);
}

function tokens(value) {
  return String(value || "").split(",").map((token) => token.trim()).filter(Boolean);
}

function exactRequired(value) {
  const lower = tokens(value).map((token) => token.toLowerCase());
  return lower.filter((token) => token === "authorization").length === 1
    && lower.filter((token) => token === "origin").length === 1
    && !lower.includes("*");
}

function response(initial = {}) {
  const headers = new Map(Object.entries(initial).map(([name, value]) => [name.toLowerCase(), value]));
  return {
    setHeader(name, value) { headers.set(String(name).toLowerCase(), value); },
    getHeader(name) { return headers.get(String(name).toLowerCase()); },
    removeHeader(name) { headers.delete(String(name).toLowerCase()); },
    headers,
  };
}

try {
  check("faltaba Origin", mergeCrmVaryTokens("Authorization") === "Authorization, Origin");
  check("faltaba Authorization", mergeCrmVaryTokens("Origin") === "Authorization, Origin");
  check("casing se normaliza", mergeCrmVaryTokens("authorization, ORIGIN") === "Authorization, Origin");
  check("duplicados se colapsan", mergeCrmVaryTokens("Authorization, authorization, Origin, ORIGIN") === "Authorization, Origin");
  check("tokens previos se preservan", mergeCrmVaryTokens("Accept-Encoding, authorization") === "Accept-Encoding, Authorization, Origin");
  check("token previo duplicado se colapsa", mergeCrmVaryTokens("Accept-Encoding, accept-encoding") === "Accept-Encoding, Authorization, Origin");
  check("Vary wildcard se elimina", mergeCrmVaryTokens("*, Accept-Encoding") === "Accept-Encoding, Authorization, Origin");
  check("array de headers se soporta", mergeCrmVaryTokens(["Accept-Encoding", "Origin"]) === "Accept-Encoding, Authorization, Origin");

  const res = response({
    Vary: "Accept-Encoding, AUTHORIZATION, origin, Origin",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Credentials": "true",
    "Cache-Control": "public, max-age=3600",
  });
  setCrmPrivateHeaders(res);
  check("cache CRM siempre privado", res.getHeader("cache-control") === "private, no-store");
  check("Vary conserva ajenos y requeridos una vez", res.getHeader("vary") === "Accept-Encoding, Authorization, Origin");
  check("contrato Vary exacto", exactRequired(res.getHeader("vary")), res.getHeader("vary"));
  check("wildcard heredado se retira", res.getHeader("access-control-allow-origin") === undefined);
  check("credenciales CORS se retiran", res.getHeader("access-control-allow-credentials") === undefined);

  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, assertions: results.filter((entry) => entry.passed).length, error: error.message, results }, null, 2)}\n`);
  process.exitCode = 1;
}
