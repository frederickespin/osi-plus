export const ROUTE_ACCESS_LABELS: Readonly<Record<string, string>>;
export function knownAccessFlags(value: unknown): string[];
export function clientRouteAccessFlags(conditions: unknown, routeRevision: number | null): string[];
