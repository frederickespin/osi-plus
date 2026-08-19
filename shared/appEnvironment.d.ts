export type AppEnvironment = "production" | "preview" | "development" | "unknown";

export const APP_ENVIRONMENTS: Readonly<{
  PRODUCTION: "production";
  PREVIEW: "preview";
  DEVELOPMENT: "development";
  UNKNOWN: "unknown";
}>;

export function resolveAppEnvironment(configuration?: Readonly<{
  appEnvironment?: unknown;
  vercelEnvironment?: unknown;
  hostname?: unknown;
}>): AppEnvironment;
