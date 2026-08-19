import { resolveAppEnvironment, type AppEnvironment } from "../../shared/appEnvironment.js";

export function getAppEnv(): AppEnvironment {
  return resolveAppEnvironment({
    appEnvironment: import.meta.env.VITE_APP_ENV,
    vercelEnvironment: typeof __V17_VERCEL_ENV__ === "undefined" ? null : __V17_VERCEL_ENV__,
    hostname: typeof window === "undefined" ? undefined : window.location.hostname,
  });
}

export const ENV_LABELS: Record<AppEnvironment, string> = {
  production: "Producción",
  preview: "Preview",
  development: "Desarrollo local",
  unknown: "Ambiente desconocido",
};

export const ENV_SHORT_LABELS: Record<AppEnvironment, string> = {
  production: "Prod",
  preview: "Preview",
  development: "Local",
  unknown: "Desconocido",
};
