import assert from "node:assert/strict";
import { resolveClientTemporaryApiMode } from "../api/_lib/clientTemporaryAccessHttp.js";
import { ClientTemporaryAccessError } from "../api/_lib/clientTemporaryAccessContract.js";

const loopback = Object.freeze({ headers: { host: "127.0.0.1:4173" }, socket: { localAddress: "127.0.0.1", remoteAddress: "127.0.0.1" } });
let assertions = 0;
const rejects = (env, request, code, status) => { assert.throws(() => resolveClientTemporaryApiMode(env, request), (error) => error instanceof ClientTemporaryAccessError && error.code === code && error.status === status); assertions += 1; };
rejects({}, loopback, "CLIENT_TEMPORARY_DISABLED", 409);
rejects({ CLIENT_TEMPORARY_ACCESS_API_MODE: "local_only" }, loopback, "CLIENT_TEMPORARY_CONFIGURATION_INVALID", 503);
rejects({ CLIENT_TEMPORARY_ACCESS_API_MODE: "LOCAL_ONLY " }, loopback, "CLIENT_TEMPORARY_CONFIGURATION_INVALID", 503);
rejects({ CLIENT_TEMPORARY_ACCESS_API_MODE: "LOCAL_ONLY", VERCEL_ENV: "preview" }, loopback, "CLIENT_TEMPORARY_CONFIGURATION_INVALID", 503);
rejects({ CLIENT_TEMPORARY_ACCESS_API_MODE: "LOCAL_ONLY" }, { headers: { host: "example.invalid" }, socket: { remoteAddress: "203.0.113.8" } }, "CLIENT_TEMPORARY_CONFIGURATION_INVALID", 503);
assert.equal(resolveClientTemporaryApiMode({ CLIENT_TEMPORARY_ACCESS_API_MODE: "LOCAL_ONLY" }, loopback), "LOCAL_ONLY"); assertions += 1;
process.stdout.write(`${JSON.stringify({ ok: true, assertions, modes: ["DISABLED", "LOCAL_ONLY"], productionApiEnabled: false })}\n`);
