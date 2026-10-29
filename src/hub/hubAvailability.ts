import type { HubApplication, HubAppId } from "./appCatalog";

export type HubAvailability = Readonly<Partial<Record<HubAppId, boolean>>>;

/** Availability narrows the already authorized catalog; it never grants access. */
export function availableHubApplications(
  authorizedApplications: readonly HubApplication[],
  availability: HubAvailability,
) {
  return authorizedApplications.filter((application) => availability[application.appId] === true);
}
