import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CommercialDiagnostics,
  createControlledGate,
  DetailFulfillmentBarrier,
  safePathname,
  sanitizeDiagnosticText,
} from "../tests/v17-commercial-crm/commercialTestHarness.mjs";

const fullRef = "018f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const detailPath = `/api/crm/pipeline-cases/${fullRef}`;
const diagnostics = new CommercialDiagnostics();
const syntheticConnection = ["postgresql", "://", "user", ":", "password", "@host/db"].join("");

assert.equal(safePathname(`https://example.invalid${detailPath}?token=unsafe`), "/api/crm/pipeline-cases/:caseRef");
const sanitized = sanitizeDiagnosticText(`Bearer secret-value synthetic@example.invalid ${fullRef} ${syntheticConnection} https://example.invalid${detailPath}`);
for (const forbidden of ["secret-value", "synthetic@example.invalid", fullRef, "user:password", "https://example.invalid"]) {
  assert.equal(sanitized.includes(forbidden), false, `diagnóstico retuvo ${forbidden}`);
}

const validBarrier = new DetailFulfillmentBarrier(diagnostics);
const validTicket = validBarrier.prepare("delayed-valid", detailPath);
const validLifecycle = validBarrier.begin(detailPath);
const gate = createControlledGate();
validLifecycle.fulfillStarted();
let gateReleased = false;
void gate.promise.then(() => { gateReleased = true; });
assert.equal(validBarrier.pendingCount, 1);
assert.throws(() => validBarrier.assertReadyForReload(validTicket), /DETAIL_BARRIER_RELOAD_BLOCKED/);
gate.release();
await gate.promise;
assert.equal(gateReleased, true);
validLifecycle.fulfilled(200, "application/json");
assert.deepEqual(await validTicket.completion, { status: 200, contentType: "application/json" });
assert.throws(() => validBarrier.assertReadyForReload(validTicket), /DETAIL_BARRIER_RELOAD_BLOCKED/);
validBarrier.markUiStable(validTicket, "valid-detail-rendered");
validBarrier.assertReadyForReload(validTicket);
assert.equal(validBarrier.pendingCount, 0);

const invalidBarrier = new DetailFulfillmentBarrier(diagnostics);
const invalidTicket = invalidBarrier.prepare("invalid-contract", detailPath);
const invalidLifecycle = invalidBarrier.begin(detailPath);
invalidLifecycle.fulfillStarted();
invalidLifecycle.fulfilled(200, "application/json");
assert.deepEqual(await invalidTicket.completion, { status: 200, contentType: "application/json" });
invalidBarrier.markUiStable(invalidTicket, "invalid-contract-rendered");

const serverBarrier = new DetailFulfillmentBarrier(diagnostics);
const serverTicket = serverBarrier.prepare("http-500", detailPath);
const serverLifecycle = serverBarrier.begin(detailPath);
serverLifecycle.fulfillStarted();
serverLifecycle.fulfilled(500, "application/json");
assert.deepEqual(await serverTicket.completion, { status: 500, contentType: "application/json" });
serverBarrier.markUiStable(serverTicket, "http-500-rendered");

const abortedBarrier = new DetailFulfillmentBarrier(diagnostics);
const abortedTicket = abortedBarrier.prepare("unexpected-abort", detailPath);
const abortedLifecycle = abortedBarrier.begin(detailPath);
abortedLifecycle.fulfillStarted();
abortedLifecycle.failed(new Error("UNEXPECTED_ABORT"));
await assert.rejects(abortedTicket.completion, /UNEXPECTED_ABORT/);

const removedBarrier = new DetailFulfillmentBarrier(diagnostics);
const removedTicket = removedBarrier.prepare("interceptor-removed", detailPath);
assert.throws(() => removedBarrier.assertReadyForReload(removedTicket), /DETAIL_BARRIER_RELOAD_BLOCKED/);
removedBarrier.interceptorRemoved(removedTicket);
await assert.rejects(removedTicket.completion, /DETAIL_BARRIER_INTERCEPTOR_REMOVED/);

diagnostics.record("pageerror", { message: `Load failed: http://127.0.0.1:4185${detailPath} synthetic@example.invalid Bearer token-value` });
diagnostics.record("response", { method: "GET", pathname: detailPath, status: 500, contentType: "application/json" });
const root = await mkdtemp(join(tmpdir(), "v17-commercial-diagnostics-"));
try {
  const target = await diagnostics.writeFailureArtifact(root, {
    project: { name: "webkit-desktop" },
    title: "Ficha sintética",
    workerIndex: 0,
    retry: 0,
    status: "failed",
    expectedStatus: "passed",
  });
  const artifact = await readFile(target, "utf8");
  const parsed = JSON.parse(artifact);
  assert.equal(parsed.project, "webkit-desktop");
  assert.equal(parsed.status, "failed");
  assert.ok(parsed.events.some((event) => event.type === "detail:fulfill:done" && event.fulfillFinished === true));
  assert.ok(parsed.events.some((event) => event.type === "detail:interceptor:removed" && event.fulfillFinished === false));
  for (const forbidden of [fullRef, "synthetic@example.invalid", "token-value", "Authorization", "passwordHash", "postgresql://"]) {
    assert.equal(artifact.includes(forbidden), false, `artefacto retuvo ${forbidden}`);
  }
  assert.equal(artifact.charCodeAt(0), 0x7b);
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log(JSON.stringify({
  ok: true,
  assertions: 30,
  scenarios: ["DELAYED_FULFILL", "VALID", "INVALID", "HTTP_500", "UNEXPECTED_ABORT", "INTERCEPTOR_REMOVED", "SANITIZED_ARTIFACT"],
}));
