import { ADMIN_FLEET_BATCH } from "../../shared/adminFleet.js";
import { ADMIN_MEMBERSHIP_PREVIEW_BATCH } from "../../shared/adminMembershipPreview.js";

export function isAdminFleetEnabled(
  environment: Readonly<Record<string, unknown>> = import.meta.env,
  hostname = window.location.hostname,
  runtime = {
    vercelEnvironment: typeof __V17_VERCEL_ENV__ === "undefined" ? null : __V17_VERCEL_ENV__,
    gitBranch: typeof __V17_VERCEL_GIT_COMMIT_REF__ === "undefined" ? null : __V17_VERCEL_GIT_COMMIT_REF__,
  },
) {
  const mode = environment.VITE_ADMIN_FLEET_MODE;
  if (mode === "LOCAL_ONLY") {
    return environment.VITE_ADMIN_TENANT_MEMBERSHIP_MODE === "LOCAL_ONLY"
      && !runtime.vercelEnvironment && !runtime.gitBranch
      && !Object.keys(environment).some((key) => key.toUpperCase().startsWith("VERCEL"))
      && ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
  }
  return mode === "PREVIEW_REHEARSAL"
    && environment.VITE_ADMIN_FLEET_BATCH === ADMIN_FLEET_BATCH
    && environment.VITE_ADMIN_TENANT_MEMBERSHIP_MODE === "PREVIEW_REHEARSAL"
    && environment.VITE_ADMIN_MEMBERSHIP_PREVIEW_BATCH === ADMIN_MEMBERSHIP_PREVIEW_BATCH
    && environment.VITE_MT01B2_CLIENT_ENABLED === "false"
    && runtime.vercelEnvironment === "preview"
    && ["feature/v17-administration-fleet-19d", "feature/v17-consolidated-preview"].includes(runtime.gitBranch || "")
    && /^[a-z0-9][a-z0-9.-]*\.vercel\.app$/u.test(hostname);
}
