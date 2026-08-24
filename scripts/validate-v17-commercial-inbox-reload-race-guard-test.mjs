import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const guard = resolve("scripts/validate-v17-commercial-inbox-reload-race-guard.mjs");
const files = [
  "tests/v17-commercial-crm/commercial-inbox.spec.ts",
  "tests/v17-commercial-crm/commercialTestHarness.mjs",
  "scripts/validate-v17-commercial-test-harness.mjs",
  ".github/workflows/ci.yml",
  "package.json",
];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "v17-commercial-reload-guard-"));
  for (const path of files) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(path, "utf8"));
  }
  return root;
}

function run(root) {
  return spawnSync(process.execPath, [guard], {
    encoding: "utf8",
    env: { ...process.env, V17_COMMERCIAL_RELOAD_GUARD_ROOT: root },
  });
}

function negative(name, path, transform, expected) {
  const root = fixture();
  try {
    const target = join(root, path);
    writeFileSync(target, transform(readFileSync(target, "utf8")));
    const result = run(root);
    assert.notEqual(result.status, 0, name);
    assert.match(`${result.stdout}\n${result.stderr}`, expected, name);
    return name;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const positive = run(process.cwd());
assert.equal(positive.status, 0, positive.stderr);
const negatives = [
  negative("reload inmediato", "tests/v17-commercial-crm/commercial-inbox.spec.ts", (s) => s.replace("await preReloadDetail.completion;", "void preReloadDetail.completion;"), /orden de barrera incompleto/),
  negative("sin señal UI", "tests/v17-commercial-crm/commercial-inbox.spec.ts", (s) => s.replace('detailBarrier.markUiStable(preReloadDetail, "verified-receiver-rendered");', "void preReloadDetail.uiStable;"), /orden de barrera incompleto/),
  negative("sin cero pendientes", "tests/v17-commercial-crm/commercial-inbox.spec.ts", (s) => s.replace("expect(detailBarrier.pendingCount).toBe(0)", "void detailBarrier.pendingCount"), /orden de barrera incompleto/),
  negative("sleep añadido", "tests/v17-commercial-crm/commercial-inbox.spec.ts", (s) => s.replace("controlledGate.release();", "await page.waitForTimeout(100); controlledGate.release();"), /espera, retry o filtro/),
  negative("filtro WebKit", "tests/v17-commercial-crm/commercial-inbox.spec.ts", (s) => s.replace("controlledGate.release();", "if (browserName === 'webkit') controlledGate.release();"), /espera, retry o filtro/),
  negative("silencia texto", "tests/v17-commercial-crm/commercial-inbox.spec.ts", (s) => s.replace("controlledGate.release();", "if (!message.includes('access control checks')) controlledGate.release();"), /espera, retry o filtro/),
  negative("elimina pageerror", "tests/v17-commercial-crm/commercial-inbox.spec.ts", (s) => s.replace("expect(pageErrors).toEqual([]);", "void pageErrors;"), /aserción pageerror fue eliminada/),
  negative("limpia pageerror", "tests/v17-commercial-crm/commercial-inbox.spec.ts", (s) => s.replace("expect(pageErrors).toEqual([]);", "pageErrors.splice(0); expect(pageErrors).toEqual([]);"), /pageErrors se limpia/),
  negative("captura headers", "tests/v17-commercial-crm/commercialTestHarness.mjs", (s) => s.replace("method: request.method(),", "headers: request.headers(), method: request.method(),"), /captura headers/),
  negative("sin fulfill done", "tests/v17-commercial-crm/commercialTestHarness.mjs", (s) => s.replaceAll("detail:fulfill:done", "detail:complete"), /diagnóstico incompleto/),
  negative("upload siempre", ".github/workflows/ci.yml", (s) => s.replace(/Upload Commercial Inbox failure diagnostics\r?\n        if: failure\(\)/, "Upload Commercial Inbox failure diagnostics\n        if: always()"), /upload sanitizado/),
];

console.log(JSON.stringify({ ok: true, positive: 1, negative: negatives.length, assertions: negatives.length + 1, negatives }));
