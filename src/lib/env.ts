/**
 * Detecta el ambiente actual sin convertir una configuración desconocida en Production.
 * - production: VITE_APP_ENV=production (Vercel prod)
 * - preview: VITE_APP_ENV=preview (Vercel PR/preview)
 * - development: localhost o VITE_APP_ENV=development
 */
export type AppEnvironment = "production" | "preview" | "development" | "unknown";

export function resolveAppEnvironment(env: string, hostname: string): AppEnvironment {
  if (env === "production") return "production";
  if (env === "preview") return "preview";
  if (env === "development") return "development";
  if (env !== "") return "unknown";
  if (["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname)) {
    return "development";
  }
  return "unknown";
}

export function getAppEnv(): AppEnvironment {
  const env = import.meta.env.VITE_APP_ENV || import.meta.env.VERCEL_ENV || "";
  const hostname = typeof window === "undefined" ? "" : window.location.hostname;
  return resolveAppEnvironment(env, hostname);
}

export const ENV_LABELS: Record<AppEnvironment, string> = {
  production: "Producción",
  preview: "Preview",
  development: "Desarrollo local",
  unknown: "Ambiente desconocido",
};
