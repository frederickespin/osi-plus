import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { normalizeMaterialPolicySave } from "../api/_lib/servicePackagesContract.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const membershipRef = randomUUID();
const bundle = await build({
  absWorkingDir: root, entryPoints: ["src/crm-services/api.ts"], bundle: true,
  platform: "node", format: "esm", target: "node20", write: false, logLevel: "silent",
  plugins: [{ name: "synthetic-membership", setup(builder) {
    builder.onResolve({ filter: /^@\/lib\/sessionStore$/ }, () => ({ path: "session", namespace: "synthetic" }));
    builder.onLoad({ filter: /.*/, namespace: "synthetic" }, () => ({ contents: `export const getMembershipRef = () => ${JSON.stringify(membershipRef)};` }));
  } }],
});
const { CrmServicesApi } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const api = new CrmServicesApi(() => "synthetic-not-login-capable");
const originalFetch = globalThis.fetch;
const checks = [];
function pass(name, condition) { assert.ok(condition, name); checks.push(name); }
function responses(values) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    assert.ok(values.length, "unexpected additional request");
    return new Response(JSON.stringify({ ok: true, data: values.shift() }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  return calls;
}
const resource = (code, kind = "MATERIAL") => ({ kind, resourceRef: randomUUID(), code, name: `Recurso ${code}`, family: "PACKING" });
const invalidResponse = (error) => error.code === "CRM_SERVICES_RESPONSE_INVALID" && error.status === 502;

try {
  const rules = {
    preparationRule: { applicable: true, stages: ["CLEAN", "CHECK"] },
    maintenanceRule: { periodicity: "AFTER_USE" }, deteriorationRule: { chargeable: true },
    replacementRule: { reason: "DAMAGE" }, conditions: { approvalRequired: true },
  };
  const line = { lineRef: randomUUID(), materialRef: randomUUID(), assetModelRef: null, materialClass: "NEW_CARDBOARD", disposition: "CONSUMED", proportion: 1, chargeType: "SALE", ...rules };
  const policy = { policyRef: randomUUID(), versionRef: randomUUID(), code: "EXISTING_POLICY", name: "Política sintética", version: 1, state: "PUBLISHED", packageVersionRef: null, serviceRef: randomUUID(), modeRef: null, preferenceCode: null, standardCode: "STANDARD", validFrom: null, validTo: null, lines: [line] };
  responses([[policy]]);
  const [parsed] = await api.materialPolicies();
  for (const key of Object.keys(rules)) {
    assert.deepEqual(parsed.lines[0][key], rules[key]);
  }
  pass("leer una política conserva las cinco reglas de cada línea", Object.keys(rules).every((key) => Object.isFrozen(parsed.lines[0][key])));
  const { lineRef: _lineRef, ...savedLine } = parsed.lines[0];
  const saveCalls = responses([{ policy: { ...policy, version: 2 }, replayed: false }]);
  await api.saveMaterialPolicy({ requestId: randomUUID(), policyRef: parsed.policyRef, expectedVersion: 1, code: parsed.code, name: "Política renombrada", packageVersionRef: null, serviceRef: parsed.serviceRef, modeRef: null, preferenceCode: null, standardCode: "STANDARD", state: "DRAFT", validFrom: null, validTo: null, lines: [savedLine] });
  const normalized = normalizeMaterialPolicySave(JSON.parse(saveCalls[0].init.body));
  pass("versionar con los datos leídos preserva reglas en un comando válido", Object.keys(rules).every((key) => JSON.stringify(normalized.lines[0][key]) === JSON.stringify(rules[key])));

  const first = Array.from({ length: 100 }, (_, index) => resource(`MAT_${index.toString().padStart(3, "0")}`));
  const last = resource("ASSET_LAST", "ASSET");
  const controller = new AbortController();
  const calls = responses([{ items: first, nextCursor: "opaque-page-two" }, { items: [last], nextCursor: null }]);
  const items = await api.materialResources(controller.signal);
  pass("lookup cliente carga recursos más allá de la primera página", items.length === 101 && items.at(-1).resourceRef === last.resourceRef && calls.length === 2);
  pass("cursor se reenvía sin tratarlo como autoridad", new URL(calls[1].url, "https://example.invalid").searchParams.get("cursor") === "opaque-page-two");
  pass("todas las páginas conservan sesión, cache privada y señal de cancelación", calls.every(({ init }) => init.signal === controller.signal && init.cache === "no-store" && init.credentials === "omit" && init.headers["X-OSI-Membership-Ref"] === membershipRef));

  const longCursor = "opaque".repeat(100);
  const longCursorCalls = responses([{ items: [resource("LONG_A")], nextCursor: longCursor }, { items: [resource("LONG_B")], nextCursor: null }]);
  await api.materialResources();
  pass("cursor opaco largo se conserva sin heredar el límite de campos de texto", new URL(longCursorCalls[1].url, "https://example.invalid").searchParams.get("cursor") === longCursor);
  responses([{ items: [resource("OVERSIZED")], nextCursor: "x".repeat(2049) }]);
  await assert.rejects(() => api.materialResources(), invalidResponse); checks.push("cursor mayor de2048 caracteres se rechaza");

  responses([{ items: [resource("A")], nextCursor: "repeat" }, { items: [resource("B")], nextCursor: "repeat" }]);
  await assert.rejects(() => api.materialResources(), invalidResponse); checks.push("cursor repetido falla sin bucle infinito");
  const repeated = resource("REPEATED");
  responses([{ items: [repeated], nextCursor: "next" }, { items: [repeated], nextCursor: null }]);
  await assert.rejects(() => api.materialResources(), invalidResponse); checks.push("recurso duplicado entre páginas no produce una selección ambigua");
  responses([{ items: [{ ...resource("PRIVATE"), tenantId: "not-public" }], nextCursor: null }]);
  await assert.rejects(() => api.materialResources(), invalidResponse); checks.push("DTO inesperado con identidad interna se rechaza");
  responses([{ items: [], nextCursor: "empty-loop" }]);
  await assert.rejects(() => api.materialResources(), invalidResponse); checks.push("página vacía no permite continuar indefinidamente");
  process.stdout.write(`${JSON.stringify({ ok: true, checks: checks.length, results: checks })}\n`);
} finally {
  globalThis.fetch = originalFetch;
}
