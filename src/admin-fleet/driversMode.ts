import { ADMIN_FLEET_DRIVERS_BATCH } from "../../shared/adminFleetDrivers.js";
import { isAdminFleetEnabled } from "./mode";

export function isFleetDriversEnabled(
  environment: Readonly<Record<string, unknown>> = import.meta.env,
  hostname = window.location.hostname,
  runtime = {
    vercelEnvironment: typeof __V17_VERCEL_ENV__ === "undefined" ? null : __V17_VERCEL_ENV__,
    gitBranch: typeof __V17_VERCEL_GIT_COMMIT_REF__ === "undefined" ? null : __V17_VERCEL_GIT_COMMIT_REF__,
  },
) {
  if (!isAdminFleetEnabled(environment, hostname, runtime)) return false;
  const mode = environment.VITE_ADMIN_FLEET_DRIVERS_MODE;
  return mode === "LOCAL_ONLY" && environment.VITE_ADMIN_FLEET_MODE === "LOCAL_ONLY"
    || mode === "PREVIEW_REHEARSAL" && environment.VITE_ADMIN_FLEET_MODE === "PREVIEW_REHEARSAL"
      && environment.VITE_ADMIN_FLEET_DRIVERS_BATCH === ADMIN_FLEET_DRIVERS_BATCH
      && runtime.gitBranch === "feature/v17-consolidated-preview";
}
