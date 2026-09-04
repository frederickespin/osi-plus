export const TOOLS_EQUIPMENT_UI_MODES = Object.freeze({ DISABLED: "DISABLED", LOCAL_ONLY: "LOCAL_ONLY", PREVIEW_REHEARSAL: "PREVIEW_REHEARSAL" } as const);
export type ToolsEquipmentUiMode = typeof TOOLS_EQUIPMENT_UI_MODES[keyof typeof TOOLS_EQUIPMENT_UI_MODES];
export function resolveToolsEquipmentUiMode(environment: Readonly<Record<string, unknown>> = import.meta.env, hostname = window.location.hostname): ToolsEquipmentUiMode {
  const value = environment.VITE_TOOLS_EQUIPMENT_UI_MODE;
  if (value === undefined || value === "DISABLED") return "DISABLED";
  if (value === "LOCAL_ONLY") { const vercel = Object.keys(environment).some((key) => key === "VERCEL" || key.startsWith("VERCEL_") || key === "VITE_VERCEL_ENV"); return !vercel && ["localhost", "127.0.0.1", "[::1]"].includes(hostname) ? value : "DISABLED"; }
  const preview = value === "PREVIEW_REHEARSAL" && environment.VITE_TOOLS_EQUIPMENT_UI_BATCH === "V17-TOOLS-EQUIPMENT-06A-PREVIEW" && environment.VITE_VERCEL_ENV === "preview" && environment.VITE_VERCEL_GIT_COMMIT_REF === "feature/v17-tools-equipment";
  return preview ? value : "DISABLED";
}
export function isToolsEquipmentUiEnabled(environment?: Readonly<Record<string, unknown>>, hostname?: string) { return resolveToolsEquipmentUiMode(environment, hostname) !== "DISABLED"; }
