import assert from "node:assert/strict";
import {
  createPersonnelPoliciesHandler,
  resolvePersonnelPoliciesApiMode,
} from "../api/_lib/personnelPoliciesHttp.js";

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
    end() {
      return this;
    },
  };
}
const request = (method = "GET", origin) => ({
  method,
  headers: { host: "127.0.0.1:4173", ...(origin ? { origin } : {}) },
  socket: { localAddress: "127.0.0.1", remoteAddress: "127.0.0.1" },
  [Symbol.asyncIterator]: async function* () {
    yield Buffer.from('{"operation":"ATTEMPT"}');
  },
});
let checks = 0;
const pass = (condition, message) => {
  assert.ok(condition, message);
  checks += 1;
};
let auth = 0;
let prisma = 0;
let execute = 0;
const disabled = createPersonnelPoliciesHandler({
  env: { PERSONNEL_POLICIES_API_MODE: "DISABLED" },
  prismaClient: new Proxy(
    {},
    {
      get() {
        prisma += 1;
      },
    },
  ),
  resolveContext: async () => {
    auth += 1;
  },
  execute: async () => {
    execute += 1;
  },
});
const blocked = response();
await disabled(request("POST"), blocked);
pass(
  blocked.statusCode === 409 &&
    blocked.body.error === "PERSONNEL_POLICIES_DISABLED",
  "gate estable",
);
pass(
  auth === 0 && prisma === 0 && execute === 0,
  "gate antes de auth, body y Prisma",
);
pass(
  blocked.headers["Cache-Control"] === "private, no-store" &&
    /Authorization/.test(blocked.headers.Vary) &&
    /Origin/.test(blocked.headers.Vary),
  "headers privados",
);
assert.throws(
  () =>
    resolvePersonnelPoliciesApiMode(
      { PERSONNEL_POLICIES_API_MODE: "LOCAL_ONLY", VERCEL: "1" },
      request(),
    ),
  /CONFIGURATION_INVALID/,
);
checks += 1;
assert.throws(
  () =>
    resolvePersonnelPoliciesApiMode(
      { PERSONNEL_POLICIES_API_MODE: "local_only" },
      request(),
    ),
  /CONFIGURATION_INVALID/,
);
checks += 1;
assert.throws(
  () =>
    resolvePersonnelPoliciesApiMode(
      { PERSONNEL_POLICIES_API_MODE: "LOCAL_ONLY" },
      {
        ...request(),
        socket: { localAddress: "10.0.0.2", remoteAddress: "10.0.0.3" },
      },
    ),
  /CONFIGURATION_INVALID/,
);
checks += 1;
const local = createPersonnelPoliciesHandler({
  env: { PERSONNEL_POLICIES_API_MODE: "LOCAL_ONLY" },
  prismaClient: {},
  resolveContext: async () => ({
    tenantId: "t",
    membershipId: "m",
    userId: "u",
  }),
  execute: async ({ method }) => ({ method }),
});
const external = response();
await local(request("GET", "https://example.invalid"), external);
pass(
  external.statusCode === 403 &&
    !Object.keys(external.headers).some(
      (key) => key.toLowerCase() === "access-control-allow-origin",
    ),
  "origen externo cerrado",
);
const sameOrigin = response();
await local(request("GET", "http://127.0.0.1:4173"), sameOrigin);
pass(
  sameOrigin.statusCode === 200 && sameOrigin.body.data.method === "GET",
  "same-origin permitido",
);
const head = response();
await local(request("HEAD"), head);
pass(head.statusCode === 200 && head.body === null, "HEAD sin body");
const options = response();
await local(request("OPTIONS", "http://127.0.0.1:4173"), options);
pass(
  options.statusCode === 204 &&
    !("Access-Control-Allow-Origin" in options.headers),
  "OPTIONS privado",
);
console.log(`V17-PERSONNEL-POLICIES-HTTP ${checks}/${checks}`);
