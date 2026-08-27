export const V17_PRODUCTION_PILOT_MODE: "PRODUCTION_PILOT";
export function isV17ProductionPilotClientEnvironment(runtime?: Readonly<{
  hostname?: string;
  vercelEnvironment?: string | null;
  gitBranch?: string | null;
}>): boolean;
