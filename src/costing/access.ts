export type CostingUiAccess = Readonly<{
  canView: boolean;
  canCalculate: boolean;
  canPublish: boolean;
  canOverride: boolean;
  canAuthorizeMargin: boolean;
  canResolve: boolean;
  canRulesView: boolean;
  canRulesManage: boolean;
}>;

export const NO_COSTING_ACCESS: CostingUiAccess = Object.freeze({ canView: false, canCalculate: false, canPublish: false, canOverride: false, canAuthorizeMargin: false, canResolve: false, canRulesView: false, canRulesManage: false });

export function resolveCostingUiAccess(effective: readonly string[] | null, denied: readonly string[] = []): CostingUiAccess {
  const grants = new Set(effective || []);
  const denies = new Set(denied);
  const can = (permission: string) => grants.has(permission) && !denies.has(permission);
  return Object.freeze({ canView: can("costing:view"), canCalculate: can("costing:calculate"), canPublish: can("costing:publish"), canOverride: can("costing:override"), canAuthorizeMargin: can("costing:authorize-margin"), canResolve: can("costing:resolve"), canRulesView: can("costing:rules:view"), canRulesManage: can("costing:rules:manage") });
}
