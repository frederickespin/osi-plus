import { HUB_APPLICATIONS, findHubApplicationByRoute } from "./appCatalog";
import { evaluateHubAccess, visibleHubApplications, type HubAccessContext } from "./hubAccess";

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
  if (!application) {
    return Object.freeze({
      allowed: hasAuthorizedApplication,
      hasAuthorizedApplication,
      reason: hasAuthorizedApplication ? "ROUTE_NOT_REGISTERED" : "ACCESS_DENIED",
    });
  }

  const decision = evaluateHubAccess(application, context);
  return Object.freeze({
    allowed: decision.allowed,
    hasAuthorizedApplication,
    reason: decision.allowed ? "APPLICATION_ALLOWED" : "ACCESS_DENIED",
  });
}
