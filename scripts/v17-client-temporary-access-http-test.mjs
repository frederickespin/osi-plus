import assert from "node:assert/strict";
import {
  assertClientTemporaryPreviewDatabase,
  CLIENT_TEMPORARY_PREVIEW_BATCH,
  CLIENT_TEMPORARY_PREVIEW_DATABASE,
  CLIENT_TEMPORARY_PREVIEW_NEON_BRANCH,
  CLIENT_TEMPORARY_PREVIEW_STORAGE_MODE,
  CLIENT_TEMPORARY_PREVIEW_STORAGE_ROOT,
  clientTemporaryPreviewManifest,
  resolveClientTemporaryApiMode,
} from "../api/_lib/clientTemporaryAccessHttp.js";
import { ClientTemporaryAccessError } from "../api/_lib/clientTemporaryAccessContract.js";

const loopback = Object.freeze({ headers: { host: "127.0.0.1:4173" }, socket: { localAddress: "127.0.0.1", remoteAddress: "127.0.0.1" } });
const remote = Object.freeze({ headers: { host: "preview.example.test", "x-forwarded-proto": "https" }, socket: { remoteAddress: "203.0.113.8" } });
const manifest = clientTemporaryPreviewManifest();
const previewUrl = ["postgres", "ql", "://", "fixture", ":", "fixture", "@", "preview-db", ".example.invalid/", CLIENT_TEMPORARY_PREVIEW_DATABASE, "?sslmode=require&schema=osi"].join("");
const preview = Object.freeze({
  CLIENT_TEMPORARY_ACCESS_API_MODE: "PREVIEW_REHEARSAL",
  CLIENT_TEMPORARY_PREVIEW_BATCH,
  CLIENT_TEMPORARY_PREVIEW_MANIFEST: manifest.raw,
  CLIENT_TEMPORARY_PREVIEW_MANIFEST_SHA256: manifest.sha256,
  CLIENT_TEMPORARY_PREVIEW_NEON_BRANCH_ID: CLIENT_TEMPORARY_PREVIEW_NEON_BRANCH,
  CLIENT_TEMPORARY_PREVIEW_STORAGE_MODE,
  CRM_SURVEY_LOCAL_STORAGE_ROOT: CLIENT_TEMPORARY_PREVIEW_STORAGE_ROOT,
  DATABASE_URL: previewUrl,
  DIRECT_URL: previewUrl,
  VERCEL: "1",
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "feature/v17-consolidated-preview",
  MT01B_AUTH_MODE: "LEGACY",
  MT01B_TENANT_SWITCH_ENABLED: "false",
  VITE_MT01B2_CLIENT_ENABLED: "false",
  VITE_OSI_HUB_MODE: "PREVIEW_REHEARSAL",
  VITE_CRM_PIPELINE_CLIENT_MODE: "PREVIEW_REHEARSAL",
  VITE_CRM_PIPELINE_READ_MODE: "PREVIEW_REHEARSAL",
  CRM_PIPELINE_RUNTIME_MODE: "PREVIEW_REHEARSAL",
  COMMUNICATIONS_EXTERNAL_TRANSPORT_MODE: "DISABLED",
  COMMUNICATIONS_EXTERNAL_WEBHOOK_MODE: "DISABLED",
});
let assertions = 0;
const rejects = (env, request, code, status) => { assert.throws(() => resolveClientTemporaryApiMode(env, request), (error) => error instanceof ClientTemporaryAccessError && error.code === code && error.status === status); assertions += 1; };
rejects({}, loopback, "CLIENT_TEMPORARY_DISABLED", 409);
rejects({ CLIENT_TEMPORARY_ACCESS_API_MODE: "local_only" }, loopback, "CLIENT_TEMPORARY_CONFIGURATION_INVALID", 503);
rejects({ CLIENT_TEMPORARY_ACCESS_API_MODE: "LOCAL_ONLY " }, loopback, "CLIENT_TEMPORARY_CONFIGURATION_INVALID", 503);
rejects({ CLIENT_TEMPORARY_ACCESS_API_MODE: "LOCAL_ONLY", VERCEL_ENV: "preview" }, loopback, "CLIENT_TEMPORARY_CONFIGURATION_INVALID", 503);
rejects({ CLIENT_TEMPORARY_ACCESS_API_MODE: "LOCAL_ONLY" }, { headers: { host: "example.invalid" }, socket: { remoteAddress: "203.0.113.8" } }, "CLIENT_TEMPORARY_CONFIGURATION_INVALID", 503);
assert.equal(resolveClientTemporaryApiMode({ CLIENT_TEMPORARY_ACCESS_API_MODE: "LOCAL_ONLY" }, loopback), "LOCAL_ONLY"); assertions += 1;
assert.equal(resolveClientTemporaryApiMode(preview, remote), "PREVIEW_REHEARSAL"); assertions += 1;
for (const [name, mutate] of [
  ["Production", (value) => ({ ...value, VERCEL_ENV: "production" })],
  ["branch", (value) => ({ ...value, VERCEL_GIT_COMMIT_REF: "feature/other" })],
  ["batch", (value) => ({ ...value, CLIENT_TEMPORARY_PREVIEW_BATCH: `${CLIENT_TEMPORARY_PREVIEW_BATCH}-wrong` })],
  ["manifest", (value) => ({ ...value, CLIENT_TEMPORARY_PREVIEW_MANIFEST: "{}" })],
  ["hash", (value) => ({ ...value, CLIENT_TEMPORARY_PREVIEW_MANIFEST_SHA256: "0".repeat(64) })],
  ["DB", (value) => ({ ...value, DATABASE_URL: value.DATABASE_URL.replace(CLIENT_TEMPORARY_PREVIEW_DATABASE, "other_preview") })],
  ["DIRECT_URL", (value) => ({ ...value, DIRECT_URL: value.DIRECT_URL.replace("schema=osi", "schema=public") })],
  ["Auth V2", (value) => ({ ...value, VITE_MT01B2_CLIENT_ENABLED: "true" })],
  ["transport", (value) => ({ ...value, COMMUNICATIONS_EXTERNAL_TRANSPORT_MODE: "ENABLED" })],
  ["webhook", (value) => ({ ...value, COMMUNICATIONS_EXTERNAL_WEBHOOK_MODE: "ENABLED" })],
  ["storage", (value) => ({ ...value, CLIENT_TEMPORARY_PREVIEW_STORAGE_MODE: "OTHER" })],
  ["storage root", (value) => ({ ...value, CRM_SURVEY_LOCAL_STORAGE_ROOT: "/tmp/other" })],
]) {
  rejects(mutate(preview), remote, "CLIENT_TEMPORARY_CONFIGURATION_INVALID", 503); void name;
}
await assertClientTemporaryPreviewDatabase({ $queryRawUnsafe: async () => [{ database: CLIENT_TEMPORARY_PREVIEW_DATABASE, branch: CLIENT_TEMPORARY_PREVIEW_NEON_BRANCH }] }, "PREVIEW_REHEARSAL"); assertions += 1;
await assert.rejects(() => assertClientTemporaryPreviewDatabase({ $queryRawUnsafe: async () => [{ database: "wrong", branch: CLIENT_TEMPORARY_PREVIEW_NEON_BRANCH }] }, "PREVIEW_REHEARSAL"), (error) => error instanceof ClientTemporaryAccessError && error.code === "CLIENT_TEMPORARY_CONFIGURATION_INVALID"); assertions += 1;
process.stdout.write(`${JSON.stringify({ ok: true, assertions, modes: ["DISABLED", "LOCAL_ONLY", "PREVIEW_REHEARSAL"], productionApiEnabled: false })}\n`);
