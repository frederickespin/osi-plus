import assert from "node:assert/strict";
import {
  WEBKIT_INTERNAL_GOTO_ERROR,
  navigateWithWebKitInternalRecovery,
} from "./webkit-internal-goto-recovery.mjs";

const internalError = () => new Error(WEBKIT_INTERNAL_GOTO_ERROR);

async function expectNotRecovered(label, {
  browserName = "webkit",
  error,
  responseReceived = false,
  functionalAssertionsStarted = false,
}) {
  let recoveries = 0;
  await assert.rejects(
    navigateWithWebKitInternalRecovery({
      browserName,
      navigate: async () => { throw error; },
      recoverAndNavigate: async () => { recoveries += 1; },
      responseReceived: () => responseReceived,
      functionalAssertionsStarted: () => functionalAssertionsStarted,
      log: () => {},
    }),
    (caught) => caught === error,
    label,
  );
  assert.equal(recoveries, 0, `${label}: no debe recuperar`);
}

{
  let recoveries = 0;
  const logs = [];
  const lifecycle = [];
  const result = await navigateWithWebKitInternalRecovery({
    browserName: "webkit",
    navigate: async () => {
      lifecycle.push("page.goto:first");
      throw internalError();
    },
    recoverAndNavigate: async () => {
      recoveries += 1;
      lifecycle.push("page.close", "context.close", "context.new", "page.new", "page.goto:second");
      return { status: () => 200 };
    },
    responseReceived: () => false,
    functionalAssertionsStarted: () => false,
    log: (message) => logs.push(message),
  });
  assert.equal(recoveries, 1);
  assert.equal(result.recovered, true);
  assert.deepEqual(logs, ["WEBKIT_INTERNAL_RECOVERY=1"]);
  assert.deepEqual(lifecycle, [
    "page.goto:first",
    "page.close",
    "context.close",
    "context.new",
    "page.new",
    "page.goto:second",
  ]);
}

await expectNotRecovered("assertion", { error: new Error("expect(received).toBe(expected)") });
await expectNotRecovered("HTTP 500", { error: new Error("Unexpected navigation HTTP status 500") });
await expectNotRecovered("timeout", { error: new Error("page.goto: Timeout 45000ms exceeded") });
await expectNotRecovered("console", { error: new Error("console.error: fallo funcional") });
await expectNotRecovered("pageerror", { error: new Error("pageerror: fallo funcional") });
await expectNotRecovered("fuera de page.goto", {
  error: new Error("page.evaluate: WebKit encountered an internal error"),
});
await expectNotRecovered("respuesta HTTP observada", {
  error: internalError(),
  responseReceived: true,
});
await expectNotRecovered("aserción funcional iniciada", {
  error: internalError(),
  functionalAssertionsStarted: true,
});
await expectNotRecovered("Chromium", { browserName: "chromium", error: internalError() });
await expectNotRecovered("Firefox", { browserName: "firefox", error: internalError() });

{
  let recoveries = 0;
  await assert.rejects(
    navigateWithWebKitInternalRecovery({
      browserName: "webkit",
      navigate: async () => { throw internalError(); },
      recoverAndNavigate: async () => {
        recoveries += 1;
        throw internalError();
      },
      responseReceived: () => false,
      functionalAssertionsStarted: () => false,
      log: () => {},
    }),
    (caught) => caught instanceof Error && caught.message === WEBKIT_INTERNAL_GOTO_ERROR,
    "el segundo error interno debe fallar",
  );
  assert.equal(recoveries, 1, "nunca debe haber una segunda recuperación");
}

process.stdout.write("[webkit-internal-recovery] PASS: recuperación única y fallos negativos preservados\n");
