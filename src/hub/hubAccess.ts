import type { UserRole } from "@/types/osi.types";
import type { HubApplication } from "./appCatalog";

export type HubAccessContext = Readonly<{
  role: UserRole;
  effectivePermissions: readonly string[] | null;
  deniedPermissions: readonly string[];
  source: "SERVER_VALIDATED_ROLE" | "SERVER_EFFECTIVE_PERMISSIONS";
}>;

export type HubAccessDecision = Readonly<{
  allowed: boolean;
  reason: "ALLOWED" | "ROLE_NOT_ELIGIBLE" | "PERMISSION_MISSING" | "PERMISSION_DENIED";
}>;

export function evaluateHubAccess(application: HubApplication, context: HubAccessContext): HubAccessDecision {
  const denied = new Set(context.deniedPermissions);
  if (application.requiredPermissions.some((permission) => denied.has(permission))) {
    return Object.freeze({ allowed: false, reason: "PERMISSION_DENIED" });
  }

  const roleEligible = application.baselineRoles.includes(context.role);
  const requiresExplicitAuthorization = application.baselineRoles.length === 0;
  if (!roleEligible && !requiresExplicitAuthorization) {
    return Object.freeze({ allowed: false, reason: "ROLE_NOT_ELIGIBLE" });
  }

  if (context.effectivePermissions === null) {
    if (application.requiresExplicitPermissions) {
      return Object.freeze({ allowed: false, reason: "PERMISSION_MISSING" });
    }
    return Object.freeze({
      allowed: roleEligible,
      reason: roleEligible ? "ALLOWED" : "PERMISSION_MISSING",
    });
  }

  const effective = new Set(context.effectivePermissions);
  const permissionAllowed = application.permissionMode === "ALL"
    ? application.requiredPermissions.every((permission) => effective.has(permission))
    : application.requiredPermissions.some((permission) => effective.has(permission));
  return Object.freeze({
    allowed: permissionAllowed,
    reason: permissionAllowed ? "ALLOWED" : "PERMISSION_MISSING",
  });
}
export function visibleHubApplications(applications: readonly HubApplication[], context: HubAccessContext) {
  return applications.filter((application) => evaluateHubAccess(application, context).allowed);
}
