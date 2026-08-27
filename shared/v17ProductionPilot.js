import { isLoopbackHostname } from "./v17CommercialCrmPreview.js";

export const V17_PRODUCTION_PILOT_MODE = "PRODUCTION_PILOT";

export function isV17ProductionPilotClientEnvironment(runtime = {}) {
  return runtime.vercelEnvironment === "production"
    && runtime.gitBranch === "main"
    && !isLoopbackHostname(runtime.hostname);
}
