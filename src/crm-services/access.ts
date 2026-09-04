export type CrmServicesUiAccess = Readonly<{ canCatalogView: boolean; canCatalogManage: boolean; canCaseView: boolean; canCaseUpdate: boolean }>;
export function resolveCrmServicesUiAccess(effectivePermissions: readonly string[] | null, deniedPermissions: readonly string[]): CrmServicesUiAccess {
  const effective = new Set(effectivePermissions || []);
  const denied = new Set(deniedPermissions);
  const can = (permission: string) => effective.has(permission) && !denied.has(permission);
  return Object.freeze({ canCatalogView: can("services:catalog:view"), canCatalogManage: can("services:catalog:manage"), canCaseView: can("services:case:view"), canCaseUpdate: can("services:case:update") });
}
export const NO_CRM_SERVICES_ACCESS: CrmServicesUiAccess = Object.freeze({ canCatalogView: false, canCatalogManage: false, canCaseView: false, canCaseUpdate: false });
