import { getAppEnv, ENV_LABELS } from "@/lib/env";

const BANNER_STYLES = {
  development: "bg-sky-600/95 text-white",
  preview: "bg-amber-500/95 text-amber-950",
  production: "bg-emerald-700/95 text-white",
} as const;

export function EnvBanner() {
  const env = getAppEnv();
  const label = ENV_LABELS[env];

  return (
    <div
      className={`${BANNER_STYLES[env]} text-center py-1.5 text-sm font-medium shadow-sm shrink-0`}
      role="status"
      aria-label={`Ambiente: ${label}`}
    >
      {env === "production"
        ? `${label} — Datos reales`
        : `${label} — Los datos aquí no son de producción`}
    </div>
  );
}
