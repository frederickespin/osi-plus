import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { V17_CRM_VARY_ROUTES } from "./validate-v17-crm-vary-guard.mjs";
import {
  mergeCrmVaryTokens,
  setCrmPrivateHeaders,
} from "../api/_lib/crmHttpHeaders.js";

const results = [];
let routeResponseCases = 0;
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
    statusCode: 200,
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; this.finished = true; return this; },
    end() { this.finished = true; return this; },
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

  // Exercise every inventoried CRM route, including new Services endpoints and
  // POST/PATCH dispatchers. Both gates must answer before auth/body/database work.
  const modeKeys = ["CRM_PIPELINE_RUNTIME_MODE", "CRM_PIPELINE_MUTATION_MODE", "CRM_ICP_V2_API_MODE", "CRM_SERVICES_API_MODE", "CRM_SURVEY_API_MODE"];
  const overrideKeys = [...modeKeys, "CRM_PIPELINE_ACTIVATION_BATCH", "MT01B_AUTH_MODE", "MT01B_TENANT_SWITCH_ENABLED", "VITE_MT01B2_CLIENT_ENABLED"];
  const saved = new Map(overrideKeys.map((key) => [key, process.env[key]]));
  try {
    delete process.env.CRM_PIPELINE_ACTIVATION_BATCH;
    process.env.MT01B_AUTH_MODE = "LEGACY";
    process.env.MT01B_TENANT_SWITCH_ENABLED = "false";
    process.env.VITE_MT01B2_CLIENT_ENABLED = "false";
    for (const mode of ["DISABLED", "INVALID_VARY_TEST_MODE"]) {
      for (const key of modeKeys) process.env[key] = mode;
      for (const route of V17_CRM_VARY_ROUTES) {
        const { default: handler } = await import(pathToFileURL(resolve(route)).href);
        assert.equal(typeof handler, "function", route);
        for (const method of ["GET", "HEAD", "OPTIONS", "POST", "PATCH"]) {
          let sensitiveReads = 0;
          const headers = { host: "127.0.0.1:55432" };
          Object.defineProperty(headers, "authorization", { get() { sensitiveReads += 1; throw new Error("auth before gate"); } });
          const req = { method, headers, query: {}, socket: { remoteAddress: "127.0.0.1" } };
          Object.defineProperty(req, "body", { get() { sensitiveReads += 1; throw new Error("body before gate"); } });
          const actual = response({ Vary: "Accept-Encoding, AUTHORIZATION, Origin", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Credentials": "true" });
          await handler(req, actual);
          const label = `${route} ${method} ${mode}`;
          assert.equal(actual.statusCode, mode === "DISABLED" ? 409 : 503, label);
          assert.equal(actual.finished, true, label);
          assert.equal(sensitiveReads, 0, `${label}: gate before credentials/body`);
          assert.equal(exactRequired(actual.getHeader("vary")), true, `${label}: Vary`);
          assert.equal(tokens(actual.getHeader("vary")).includes("Accept-Encoding"), true, `${label}: preserved Vary`);
          assert.equal(actual.getHeader("cache-control"), "private, no-store", `${label}: cache`);
          assert.equal(actual.getHeader("access-control-allow-origin"), undefined, `${label}: wildcard`);
          assert.equal(actual.getHeader("access-control-allow-credentials"), undefined, `${label}: credentials`);
          if (method !== "HEAD") assert.match(String(actual.body?.error), mode === "DISABLED" ? /DISABLED$/ : /CONFIGURATION_INVALID$/, `${label}: controlled gate error`);
          routeResponseCases += 1;
        }
      }
    }
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, routes: V17_CRM_VARY_ROUTES.length, routeResponseCases, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, assertions: results.filter((entry) => entry.passed).length, error: error.message, results }, null, 2)}\n`);
  process.exitCode = 1;
}
