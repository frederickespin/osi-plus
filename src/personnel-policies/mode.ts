export type PersonnelPoliciesUiMode = "DISABLED" | "LOCAL_ONLY";

export const productionApiEnabled = false as const;

export function resolvePersonnelPoliciesUiMode(
  environment: Readonly<Record<string, unknown>> = import.meta.env,
  hostname = window.location.hostname,
): PersonnelPoliciesUiMode {
  const mode = environment.VITE_PERSONNEL_POLICIES_UI_MODE ?? "DISABLED";
  if (mode !== "DISABLED" && mode !== "LOCAL_ONLY") return "DISABLED";
  if (
    mode === "LOCAL_ONLY" &&
    productionApiEnabled === false &&
    ["localhost", "127.0.0.1", "[::1]"].includes(hostname) &&
    !Object.keys(environment).some((key) =>
      key.toUpperCase().startsWith("VERCEL"),
    )
  )
    return mode;
  return "DISABLED";
}

export function isPersonnelPoliciesUiEnabled(
  environment?: Readonly<Record<string, unknown>>,
  hostname?: string,
) {
  return resolvePersonnelPoliciesUiMode(environment, hostname) !== "DISABLED";
}
