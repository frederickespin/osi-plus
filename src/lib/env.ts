export type AppEnvironment = "production" | "preview" | "development" | "unknown";

type EnvironmentInput = Readonly<Record<string, unknown>>;
type RuntimeInput = Readonly<{ hostname?: string }>;
declare const __CRM_PREVIEW_BUILD__: EnvironmentInput;

function defaultEnvironment(): EnvironmentInput {
  const build = typeof __CRM_PREVIEW_BUILD__ === "undefined" ? {} : __CRM_PREVIEW_BUILD__;
  return Object.freeze({ ...import.meta.env, ...build });
}

function isLoopback(hostname: string | undefined): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]" || hostname === "::1";
}

/** Detecta el ambiente con metadatos de plataforma; una identidad incompleta nunca se presenta como Production. */
export function resolveAppEnv(
  environment: EnvironmentInput,
  runtime: RuntimeInput,
): AppEnvironment {
  if (isLoopback(runtime.hostname)) return "development";
  if (environment.VERCEL_ENV === "preview") return "preview";
  if (environment.VERCEL_ENV === "production" && environment.VERCEL_GIT_COMMIT_REF === "main") return "production";
  return "unknown";
}

export function getAppEnv(): AppEnvironment {
  return resolveAppEnv(
    defaultEnvironment(),
    { hostname: typeof window === "undefined" ? undefined : window.location.hostname },
  );
}

export const ENV_LABELS: Record<AppEnvironment, string> = {
  production: "Producción",
  preview: "Preview",
  development: "Local",
  unknown: "Entorno no identificado",
};
