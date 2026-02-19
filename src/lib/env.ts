/**
 * Detecta el ambiente actual: production | preview | development
 * - production: VITE_APP_ENV=production (Vercel prod)
 * - preview: VITE_APP_ENV=preview (Vercel PR/preview)
 * - development: localhost o VITE_APP_ENV=development
 */
export function getAppEnv(): "production" | "preview" | "development" {
  const env = import.meta.env.VITE_APP_ENV || "";
  if (env === "production") return "production";
  if (env === "preview") return "preview";
  if (env === "development") return "development";
  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    return "development";
  }
  return "production";
}

export const ENV_LABELS: Record<"production" | "preview" | "development", string> = {
  production: "Producción",
  preview: "Pruebas (Preview)",
  development: "Desarrollo local",
};
