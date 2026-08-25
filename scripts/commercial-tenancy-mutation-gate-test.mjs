import assert from "node:assert/strict";
import clientsHandler from "../api/clients/index.js";
import projectsHandler from "../api/projects/index.js";
import validateHandler from "../api/k/project-validate.js";
import releaseHandler from "../api/k/project-release.js";
import {
  COMMERCIAL_TENANCY_MUTATION_MODES,
  mergeCommercialMutationVaryTokens,
  resolveCommercialTenancyMutationMode,
} from "../api/_lib/commercialTenancyMutation.js";

const routes = Object.freeze([
  ["clients", clientsHandler],
  ["projects", projectsHandler],
  ["project-validate", validateHandler],
  ["project-release", releaseHandler],
]);
const loopbackSocket = Object.freeze({ localAddress: "127.0.0.1", remoteAddress: "::1" });
let assertions = 0;

function check(label, operation) {
  operation();
  assertions += 1;
  process.stdout.write(`ok ${assertions} - ${label}\n`);
}

function response() {
  const headers = new Map();
  return {
    statusCode: 200,
    body: undefined,
    setHeader(name, value) { headers.set(String(name).toLowerCase(), value); },
    getHeader(name) { return headers.get(String(name).toLowerCase()); },
    removeHeader(name) { headers.delete(String(name).toLowerCase()); },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
    headers,
  };
}

function request({ socket = loopbackSocket, bodyRead } = {}) {
  const req = {
    method: "POST",
    headers: {
      host: "localhost:5173",
      origin: "http://localhost:5173",
      authorization: "Bearer must-not-be-parsed",
      "content-type": "application/json",
    },
    query: {},
    socket,
  };
  Object.defineProperty(req, "body", {
    configurable: true,
    get() {
      bodyRead.count += 1;
      throw new Error("body must not be read while mutations are disabled");
    },
  });
  return req;
}

async function invoke(handler, options = {}) {
  const bodyRead = { count: 0 };
  const res = response();
  await handler(request({ ...options, bodyRead }), res);
  return { res, bodyRead: bodyRead.count };
}

const previous = Object.fromEntries(Object.keys(process.env)
  .filter((name) => name === "COMMERCIAL_TENANCY_MUTATION_MODE" || name.toUpperCase().startsWith("VERCEL"))
  .map((name) => [name, process.env[name]]));

try {
  for (const name of Object.keys(process.env)) {
    if (name.toUpperCase().startsWith("VERCEL")) delete process.env[name];
  }

  for (const [label, env, expected] of [
    ["ausente", {}, { enabled: false, valid: true, reason: "DEFAULT_DISABLED" }],
    ["DISABLED exacto", { COMMERCIAL_TENANCY_MUTATION_MODE: "DISABLED" }, { enabled: false, valid: true, reason: "EXPLICIT_DISABLED" }],
    ["LOCAL_ONLY loopback", { COMMERCIAL_TENANCY_MUTATION_MODE: "LOCAL_ONLY" }, { enabled: true, valid: true, reason: "AUTHORIZED_LOCAL_ONLY" }],
    ["desconocido", { COMMERCIAL_TENANCY_MUTATION_MODE: "FUTURE" }, { enabled: false, valid: false, reason: "UNKNOWN_MODE" }],
  ]) {
    check(`resolver ${label}`, () => {
      const value = resolveCommercialTenancyMutationMode(env, { socket: loopbackSocket });
      assert.equal(value.enabled, expected.enabled);
      assert.equal(value.valid, expected.valid);
      assert.equal(value.reason, expected.reason);
    });
  }

  for (const value of ["local_only", "LOCAL_ONLY ", " LOCAL_ONLY", '"LOCAL_ONLY"', "\uFEFFLOCAL_ONLY", "LOCAL_ONLY\n", "LOCAL_ONLY\r\n"] ) {
    check(`valor alterado falla cerrado: ${JSON.stringify(value)}`, () => {
      const result = resolveCommercialTenancyMutationMode({ COMMERCIAL_TENANCY_MUTATION_MODE: value }, { socket: loopbackSocket });
      assert.deepEqual([result.enabled, result.valid, result.mode], [false, false, COMMERCIAL_TENANCY_MUTATION_MODES.DISABLED]);
    });
  }

  for (const marker of ["VERCEL", "VERCEL_ENV", "VERCEL_GIT_COMMIT_REF", "VERCEL_URL", "VERCELX"]) {
    check(`${marker} impide LOCAL_ONLY`, () => {
      const result = resolveCommercialTenancyMutationMode({ COMMERCIAL_TENANCY_MUTATION_MODE: "LOCAL_ONLY", [marker]: "1" }, { socket: loopbackSocket });
      assert.deepEqual([result.enabled, result.valid, result.reason], [false, false, "VERCEL_FORBIDDEN"]);
    });
  }

  for (const [label, socket] of [
    ["sin socket", undefined],
    ["cliente externo", { localAddress: "127.0.0.1", remoteAddress: "203.0.113.7" }],
    ["servidor externo", { localAddress: "10.0.0.4", remoteAddress: "127.0.0.1" }],
    ["sufijo IP", { localAddress: "127.0.0.1.example", remoteAddress: "127.0.0.1" }],
  ]) {
    check(`loopback real requerido: ${label}`, () => {
      const result = resolveCommercialTenancyMutationMode({ COMMERCIAL_TENANCY_MUTATION_MODE: "LOCAL_ONLY" }, socket ? { socket } : {});
      assert.equal(result.enabled, false);
      assert.equal(result.valid, false);
    });
  }

  check("Vary privado conserva tokens ajenos sin duplicar ni propagar wildcard", () => {
    assert.equal(mergeCommercialMutationVaryTokens("Accept-Encoding, origin, ORIGIN, *"), "Accept-Encoding, origin, Authorization");
  });

  for (const mode of [undefined, "DISABLED", "LOCAL_ONLY "]) {
    if (mode === undefined) delete process.env.COMMERCIAL_TENANCY_MUTATION_MODE;
    else process.env.COMMERCIAL_TENANCY_MUTATION_MODE = mode;
    for (const [route, handler] of routes) {
      const { res, bodyRead } = await invoke(handler);
      check(`${route} ${mode ?? "ausente"}: 409 antes de body`, () => {
        assert.equal(res.statusCode, 409);
        assert.deepEqual(res.body, { ok: false, error: "COMMERCIAL_TENANCY_MUTATIONS_DISABLED" });
        assert.equal(bodyRead, 0);
      });
      check(`${route} ${mode ?? "ausente"}: headers privados`, () => {
        assert.equal(res.getHeader("cache-control"), "private, no-store");
        assert.equal(res.getHeader("vary"), "Authorization, Origin");
        assert.equal(res.getHeader("access-control-allow-origin"), undefined);
        assert.equal(res.getHeader("access-control-allow-credentials"), undefined);
        assert.equal(res.getHeader("set-cookie"), undefined);
      });
    }
  }

  process.env.COMMERCIAL_TENANCY_MUTATION_MODE = "LOCAL_ONLY";
  for (const [route, handler] of routes) {
    const { res, bodyRead } = await invoke(handler);
    check(`${route}: LOCAL_ONLY loopback supera únicamente la compuerta`, () => {
      assert.notEqual(res.body?.error, "COMMERCIAL_TENANCY_MUTATIONS_DISABLED");
      assert.equal(res.statusCode === 401 || res.statusCode === 403, true);
      assert.equal(bodyRead, 0);
    });
  }

  process.env.VERCEL_ENV = "preview";
  for (const [route, handler] of routes) {
    const { res, bodyRead } = await invoke(handler);
    check(`${route}: Vercel rechaza LOCAL_ONLY antes de auth/body`, () => {
      assert.equal(res.statusCode, 409);
      assert.equal(res.body?.error, "COMMERCIAL_TENANCY_MUTATIONS_DISABLED");
      assert.equal(bodyRead, 0);
    });
  }

  process.stdout.write(`${JSON.stringify({ ok: true, assertions, routes: routes.length, modes: ["DISABLED", "LOCAL_ONLY"] })}\n`);
} finally {
  delete process.env.COMMERCIAL_TENANCY_MUTATION_MODE;
  for (const name of Object.keys(process.env)) {
    if (name.toUpperCase().startsWith("VERCEL")) delete process.env[name];
  }
  for (const [name, value] of Object.entries(previous)) process.env[name] = value;
}
