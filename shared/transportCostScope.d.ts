import type { TransportComponentInput, TransportComponentKind } from "./logisticsTransport";

export const ROAD_TRANSPORT_KINDS: readonly ("BASE" | "FUEL" | "TOLL" | "OTHER")[];
export function isRoadTransportComponent(component: Pick<TransportComponentInput, "kind" | "basis">): boolean;
export function includesPersonnelCosts(
  component: Pick<TransportComponentInput, "kind" | "includedConcepts">,
  baseIncludes?: readonly TransportComponentKind[],
): boolean;
