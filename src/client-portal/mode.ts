export type ClientTemporaryPortalMode = "DISABLED" | "LOCAL_ONLY";

export function resolveClientTemporaryPortalMode(env: Record<string, string | boolean | undefined> = import.meta.env): Readonly<{ mode: ClientTemporaryPortalMode; enabled: boolean; valid: boolean }> {
  const raw = env.VITE_CLIENT_TEMPORARY_ACCESS_MODE ?? "DISABLED";
  if (raw === "DISABLED") return Object.freeze({ mode: "DISABLED", enabled: false, valid: true });
  const vercel = Object.keys(env).some((key) => key.toUpperCase().startsWith("VERCEL"));
  if (raw === "LOCAL_ONLY" && !vercel && typeof window !== "undefined" && ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)) return Object.freeze({ mode: "LOCAL_ONLY", enabled: true, valid: true });
  return Object.freeze({ mode: "DISABLED", enabled: false, valid: false });
}

export function isClientTemporaryPortalRoute(pathname = window.location.pathname) {
  return /^\/client-access\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(pathname);
}
