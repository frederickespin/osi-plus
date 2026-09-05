export type LogisticsUiAccess = Readonly<{ canView: boolean; canCalculate: boolean; canPublish: boolean; canOverride: boolean; canResolve: boolean; canRulesView: boolean; canRulesManage: boolean }>;
export function resolveLogisticsUiAccess(effective: readonly string[] | null, denied: readonly string[] = []): LogisticsUiAccess {
  const grants = new Set(effective || []); const denies = new Set(denied); const can = (permission: string) => grants.has(permission) && !denies.has(permission);
  return Object.freeze({ canView: can("logistics:plan:view"), canCalculate: can("logistics:plan:calculate"), canPublish: can("logistics:plan:publish"), canOverride: can("logistics:plan:override"), canResolve: can("logistics:plan:resolve"), canRulesView: can("logistics:rules:view"), canRulesManage: can("logistics:rules:manage") });
}
