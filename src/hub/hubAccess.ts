import type { UserRole } from "@/types/osi.types";
import type { HubApplication, HubSuite } from "./appCatalog";

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
  if (application.denyScope !== "PERMISSION" && application.requiredPermissions.some((permission) => denied.has(permission))) {
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
  const can = (permission: string) => effective.has(permission) && !denied.has(permission);
  const permissionAllowed = application.permissionMode === "ALL"
    ? application.requiredPermissions.every(can)
    : application.requiredPermissions.some(can);
  return Object.freeze({
    allowed: permissionAllowed,
    reason: permissionAllowed ? "ALLOWED" : application.requiredPermissions.some((permission) => denied.has(permission)) ? "PERMISSION_DENIED" : "PERMISSION_MISSING",
  });
}
export function visibleHubApplications(applications: readonly HubApplication[], context: HubAccessContext) {
  return applications.filter((application) => evaluateHubAccess(application, context).allowed);
}

export function evaluateHubSuiteAccess(suite: HubSuite, applications: readonly HubApplication[], context: HubAccessContext) {
  const allowed = applications.some((application) => application.suiteId === suite.suiteId && evaluateHubAccess(application, context).allowed);
  return Object.freeze({
    allowed,
    reason: allowed ? "APPLICATION_ALLOWED" : "ACCESS_DENIED",
  } as const);
}
