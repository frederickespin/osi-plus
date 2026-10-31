import { HUB_APPLICATIONS, findHubApplicationByRoute, findHubSuiteByRoute } from "./appCatalog";
import { evaluateHubAccess, evaluateHubSuiteAccess, visibleHubApplications, type HubAccessContext } from "./hubAccess";
import { administrationSectionFromRoute } from "@/administration/administrationSections";
import { resolveFleetAccess } from "@/admin-fleet/access";

export type HubRouteAccessDecision = Readonly<{
  allowed: boolean;
  hasAuthorizedApplication: boolean;
  reason: "APPLICATION_ALLOWED" | "HUB_ALLOWED" | "ROUTE_NOT_REGISTERED" | "ACCESS_DENIED";
}>;

export function evaluateHubRouteAccess(pathname: string, context: HubAccessContext): HubRouteAccessDecision {
  const authorizedApplications = visibleHubApplications(HUB_APPLICATIONS, context);
  const hasAuthorizedApplication = authorizedApplications.length > 0;
  const normalizedPath = pathname === "/" ? "/hub" : pathname;

  if (normalizedPath === "/hub") {
    return Object.freeze({
      allowed: hasAuthorizedApplication,
      hasAuthorizedApplication,
      reason: hasAuthorizedApplication ? "HUB_ALLOWED" : "ACCESS_DENIED",
    });
  }

  const application = findHubApplicationByRoute(normalizedPath);
  if (application) {
    const section = application.appId === "administration" ? administrationSectionFromRoute(normalizedPath) : null;
    const applicationDecision = evaluateHubAccess(application, context);
    const decision = applicationDecision.allowed && section
      ? section.id === "fleet"
        ? { allowed: resolveFleetAccess(context.role, context.effectivePermissions, context.deniedPermissions).canView }
        : evaluateHubAccess({ ...application, requiredPermissions: section.permissions, ...(section.id === "access" ? { baselineRoles: ["A"] as const } : {}) }, context)
      : applicationDecision;
    return Object.freeze({
      allowed: decision.allowed,
      hasAuthorizedApplication,
      reason: decision.allowed ? "APPLICATION_ALLOWED" : "ACCESS_DENIED",
    });
  }

  const suite = findHubSuiteByRoute(normalizedPath);
  if (suite) {
    const decision = evaluateHubSuiteAccess(suite, HUB_APPLICATIONS, context);
    return Object.freeze({
      allowed: decision.allowed,
      hasAuthorizedApplication,
      reason: decision.allowed ? "APPLICATION_ALLOWED" : "ACCESS_DENIED",
    });
  }

  return Object.freeze({
    allowed: hasAuthorizedApplication,
    hasAuthorizedApplication,
    reason: hasAuthorizedApplication ? "ROUTE_NOT_REGISTERED" : "ACCESS_DENIED",
  });
}
