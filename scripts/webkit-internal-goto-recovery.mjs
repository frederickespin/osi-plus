export const WEBKIT_INTERNAL_GOTO_ERROR = "page.goto: WebKit encountered an internal error";

function firstErrorLine(error) {
  if (!(error instanceof Error)) return "";
  return error.message.split(/\r?\n/u, 1)[0];
}

export function isRecoverableWebKitGotoError({
  browserName,
  error,
  responseReceived,
  functionalAssertionsStarted,
}) {
  return browserName === "webkit"
    && responseReceived === false
    && functionalAssertionsStarted === false
    && firstErrorLine(error) === WEBKIT_INTERNAL_GOTO_ERROR;
}

export async function navigateWithWebKitInternalRecovery({
  browserName,
  navigate,
  recoverAndNavigate,
  responseReceived,
  functionalAssertionsStarted,
  log = (message) => process.stdout.write(`${message}\n`),
}) {
  try {
    return { response: await navigate(), recovered: false };
  } catch (error) {
    if (!isRecoverableWebKitGotoError({
      browserName,
      error,
      responseReceived: responseReceived(),
      functionalAssertionsStarted: functionalAssertionsStarted(),
    })) {
      throw error;
    }

    log("WEBKIT_INTERNAL_RECOVERY=1");
    return { response: await recoverAndNavigate(), recovered: true };
  }
}
