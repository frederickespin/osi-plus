import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test, { after } from "node:test";
import { build } from "esbuild";
import { normalizeWarehouseAreaUseCreate, normalizeWarehouseAreaUseUpdate, normalizeWarehouseLocationConfiguration } from "../api/_lib/warehouseConfigurationContract.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundled = await build({ absWorkingDir: root, stdin: { contents: 'export * from "./src/warehouses/api.ts"; export * from "./src/warehouses/configurationMode.ts"; export * from "./src/warehouses/configurationUi.ts";', sourcefile: "warehouse-configuration-client-entry.ts", resolveDir: root, loader: "ts" }, bundle: true, platform: "node", format: "esm", target: "node20", write: false, logLevel: "silent" });
const { WarehouseApi, WarehouseApiError, isWarehouseRejectionConfirmed, resolveWarehouseConfigurationUiMode: mode, pendingWarehouseRoute } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });
const REQUEST = "81111111-1111-4111-8111-111111111111";
const REF = "82222222-2222-4222-8222-222222222222";
const create = { operation: "WAREHOUSE_AREA_USE_CREATE", name: "Uso sintético", description: null, purpose: "INTERNAL" };
const update = { ...create, operation: "WAREHOUSE_AREA_USE_UPDATE", useRef: REF, expectedVersion: 1, status: "INACTIVE" };
const configure = { operation: "WAREHOUSE_LOCATION_CONFIGURATION_UPDATE", locationRef: REF, expectedVersion: 0, areaUseRef: null, characteristics: "Área techada", notes: null, operationalStatus: "RESTRICTED", availabilityRule: "BLOCKED", changeReason: "Revisión sintética", acknowledgeImpact: true };

test("configuration UI is default OFF and LOCAL_ONLY requires a genuine local environment", () => {
  for (const env of [{}, { VITE_WAREHOUSE_CONFIGURATION_UI_MODE: "DISABLED" }, { VITE_WAREHOUSE_CONFIGURATION_UI_MODE: "unknown" }]) assert.equal(mode(env, "localhost"), "DISABLED");
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) assert.equal(mode({ VITE_WAREHOUSE_CONFIGURATION_UI_MODE: "LOCAL_ONLY" }, host), "LOCAL_ONLY");
  for (const host of ["example.test", "localhost.example.test", "127.0.0.2"]) assert.equal(mode({ VITE_WAREHOUSE_CONFIGURATION_UI_MODE: "LOCAL_ONLY" }, host), "DISABLED");
  for (const marker of ["VERCEL", "VERCEL_ENV", "VERCEL_URL", "VITE_VERCEL_ENV"]) assert.equal(mode({ VITE_WAREHOUSE_CONFIGURATION_UI_MODE: "LOCAL_ONLY", [marker]: "" }, "localhost"), "DISABLED");
});

test("Preview UI requires exact batch, approved branch and preview environment", () => {
  const preview = { VITE_WAREHOUSE_CONFIGURATION_UI_MODE: "PREVIEW_REHEARSAL", VITE_WAREHOUSE_CONFIGURATION_UI_BATCH: "V17-WAREHOUSE-CONFIGURATION-20B-PREVIEW", VITE_VERCEL_ENV: "preview", VITE_VERCEL_GIT_COMMIT_REF: "feature/v17-consolidated-preview" };
  assert.equal(mode(preview, "example.vercel.app"), "PREVIEW_REHEARSAL");
  for (const field of Object.keys(preview)) assert.equal(mode({ ...preview, [field]: "invalid" }, "example.vercel.app"), "DISABLED", field);
  for (const branch of ["main", "feature/v17-consolidated-preview-other", "feature/v17-warehouses-spaces-20a", "feature/v17-warehouses-configuration-20b"]) assert.equal(mode({ ...preview, VITE_VERCEL_GIT_COMMIT_REF: branch }, "example.vercel.app"), "DISABLED");
  assert.equal(mode({ ...preview, VITE_VERCEL_ENV: "production" }, "example.test"), "DISABLED");
});

test("all new client commands match exact server contracts and retry hashes with URL refs outside writable data", async () => {
  const requests = [];
  globalThis.fetch = async (path, options) => {
    requests.push({ path, options, body: JSON.parse(options.body) });
    return new Response(JSON.stringify({ ok: true, data: { code: "CODE-AUTO" } }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const api = new WarehouseApi("synthetic.token");
  for (const change of [create, update, configure]) {
    await api.save(change, REQUEST); await api.save(change, REQUEST);
    const last = requests.at(-1); const previous = requests.at(-2);
    assert.deepEqual(last.body, previous.body);
    assert.equal(last.options.credentials, "omit"); assert.equal(last.options.cache, "no-store");
    assert.equal(last.options.headers.Authorization, "Bearer synthetic.token");
    for (const forbidden of ["operation", "useRef", "locationRef", "code", "tenantId", "permissions", "authorization"]) assert.equal(Object.hasOwn(last.body, forbidden), false);
    const normalized = change.operation === "WAREHOUSE_AREA_USE_CREATE" ? normalizeWarehouseAreaUseCreate(last.body) : change.operation === "WAREHOUSE_AREA_USE_UPDATE" ? normalizeWarehouseAreaUseUpdate(last.body, REF) : normalizeWarehouseLocationConfiguration(last.body, REF);
    assert.equal(normalized.operation, change.operation); assert.equal(normalized.requestId, REQUEST);
  }
  assert.deepEqual(requests.map(({ path, options }) => [path, options.method]), [
    ["/api/materials/warehouse-uses", "POST"], ["/api/materials/warehouse-uses", "POST"],
    [`/api/materials/warehouse-uses/${REF}`, "PATCH"], [`/api/materials/warehouse-uses/${REF}`, "PATCH"],
    [`/api/materials/warehouses/locations/${REF}/configuration`, "PATCH"], [`/api/materials/warehouses/locations/${REF}/configuration`, "PATCH"],
  ]);
});

test("configuration read is separate from warehouses and never adds an automatic retry", async () => {
  const calls = [];
  globalThis.fetch = async (path, options) => { calls.push([path, options]); return new Response(JSON.stringify({ ok: false, error: "WAREHOUSE_CONFIGURATION_FORBIDDEN" }), { status: 403 }); };
  await assert.rejects(() => new WarehouseApi(undefined).configuration(), (error) => error instanceof WarehouseApiError && error.status === 403 && error.code === "WAREHOUSE_CONFIGURATION_FORBIDDEN");
  assert.equal(calls.length, 1); assert.equal(calls[0][0], "/api/materials/warehouse-configuration");
  assert.equal(calls[0][1].method, "GET"); assert.equal(Object.hasOwn(calls[0][1].headers, "Authorization"), false);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(() => new WarehouseApi(undefined).save(create, REQUEST, controller.signal), { name: "AbortError" });
  assert.equal(calls.length, 1);
});

test("only known post-receipt rejections can resolve an uncertain configuration intent", () => {
  for (const code of ["WAREHOUSE_CONFIGURATION_VERSION_CONFLICT", "WAREHOUSE_AREA_USE_NAME_CONFLICT", "WAREHOUSE_AREA_USE_CODE_CONFLICT", "WAREHOUSE_AREA_USE_NOT_FOUND", "WAREHOUSE_AREA_USE_INACTIVE", "WAREHOUSE_LOCATION_NOT_FOUND", "WAREHOUSE_CONFIGURATION_IMPACT_ACK_REQUIRED", "WAREHOUSE_CONFIGURATION_COMMITMENTS_ACTIVE", "WAREHOUSE_CONFIGURATION_HIERARCHY_INVALID"]) assert.equal(isWarehouseRejectionConfirmed(new WarehouseApiError(code, 409)), true, code);
  for (const code of ["WAREHOUSE_CONFIGURATION_DISABLED", "WAREHOUSE_CONFIGURATION_FORBIDDEN", "WAREHOUSE_CONFIGURATION_INPUT_INVALID", "WAREHOUSE_CONFIGURATION_PAYLOAD_HASH_MISMATCH", "WAREHOUSE_CONFIGURATION_IDEMPOTENCY_CONFLICT", "WAREHOUSE_CONFIGURATION_WRITE_CONFLICT", "UNKNOWN", "UNAUTHORIZED"]) assert.equal(isWarehouseRejectionConfirmed(new WarehouseApiError(code, 409)), false, code);
  assert.equal(isWarehouseRejectionConfirmed(new Error("network")), false);
});

test("an incomplete configuration response cannot be presented as an empty catalog", async () => {
  for (const data of [null, {}, { areaUses: [] }, { areaUses: [], locations: null }, { areaUses: {}, locations: [] }]) {
    globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, data }), { status: 200 });
    await assert.rejects(() => new WarehouseApi(undefined).configuration(), (error) => error instanceof WarehouseApiError && error.code === "MATERIALS_RESPONSE_INVALID");
  }
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, data: { areaUses: [], locations: [] } }), { status: 200 });
  assert.deepEqual(await new WarehouseApi(undefined).configuration(), { areaUses: [], locations: [] });
});

test("pending intents return to the correct implemented page without executing them", () => {
  for (const change of [create, update]) assert.equal(pendingWarehouseRoute(change), "/warehouses/configuration");
  for (const change of [configure, { operation: "WAREHOUSE_CREATE", name: "Principal" }, { operation: "WAREHOUSE_LOCATION_UPDATE", locationRef: REF, expectedVersion: 1, name: "Ubicación" }]) assert.equal(pendingWarehouseRoute(change), "/warehouses/spaces");
});
