export const APP_ENVIRONMENTS = Object.freeze({
  PRODUCTION: "production",
  PREVIEW: "preview",
  DEVELOPMENT: "development",
  UNKNOWN: "unknown",
});

const LOOPBACK_HOSTNAMES = Object.freeze(["localhost", "127.0.0.1", "[::1]"]);

export function resolveAppEnvironment({ appEnvironment, vercelEnvironment, hostname } = {}) {
  if (LOOPBACK_HOSTNAMES.includes(hostname)) return APP_ENVIRONMENTS.DEVELOPMENT;

  if (vercelEnvironment !== undefined && vercelEnvironment !== null) {
    if (vercelEnvironment !== APP_ENVIRONMENTS.PRODUCTION
      && vercelEnvironment !== APP_ENVIRONMENTS.PREVIEW) return APP_ENVIRONMENTS.UNKNOWN;
    if (appEnvironment !== undefined && appEnvironment !== ""
      && appEnvironment !== vercelEnvironment) return APP_ENVIRONMENTS.UNKNOWN;
    return vercelEnvironment;
  }

  if (appEnvironment === APP_ENVIRONMENTS.PREVIEW) return APP_ENVIRONMENTS.PREVIEW;
  if (appEnvironment === APP_ENVIRONMENTS.DEVELOPMENT) return APP_ENVIRONMENTS.DEVELOPMENT;
  return APP_ENVIRONMENTS.UNKNOWN;
}
