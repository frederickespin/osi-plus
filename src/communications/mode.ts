export type CommunicationsUiMode = "DISABLED" | "LOCAL_ONLY";
export function resolveCommunicationsUiMode(environment: Readonly<Record<string, unknown>> = import.meta.env, hostname = window.location.hostname): CommunicationsUiMode {
  const mode = environment.VITE_COMMUNICATIONS_MODE ?? "DISABLED";
  if (mode !== "DISABLED" && mode !== "LOCAL_ONLY") return "DISABLED";
  if (mode === "LOCAL_ONLY" && (["localhost", "127.0.0.1", "[::1]"].includes(hostname)) && !Object.keys(environment).some((key) => key.toUpperCase().startsWith("VERCEL"))) return mode;
  return "DISABLED";
}
export function isCommunicationsUiEnabled(environment?: Readonly<Record<string, unknown>>, hostname?: string) { return resolveCommunicationsUiMode(environment, hostname) === "LOCAL_ONLY"; }
