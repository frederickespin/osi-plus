import type { CostingUiAccess } from "@/costing/access";
import type { LogisticsUiAccess } from "./access";

export type TransportUiAccess = Readonly<{
  canZonesView: boolean;
  canZonesManage: boolean;
  canView: boolean;
  canCalculate: boolean;
  canPublish: boolean;
}>;

export function resolveTransportUiAccess(logistics: LogisticsUiAccess, costing: CostingUiAccess): TransportUiAccess {
  return Object.freeze({
    canZonesView: logistics.canRulesView && costing.canRulesView,
    canZonesManage: logistics.canRulesView && logistics.canRulesManage && costing.canRulesView && costing.canRulesManage,
    canView: logistics.canView && costing.canView,
    canCalculate: logistics.canView && logistics.canCalculate && costing.canView && costing.canCalculate,
    canPublish: logistics.canView && logistics.canPublish && costing.canView && costing.canPublish,
  });
}
