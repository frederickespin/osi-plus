export type CrmServicesUiAccess = Readonly<{ canCatalogView: boolean; canCatalogManage: boolean; canCaseView: boolean; canCaseUpdate: boolean; canPackagesView: boolean; canPackagesManage: boolean; canMaterialsView: boolean; canMaterialsManage: boolean; canCaseConfigView: boolean; canCaseConfigUpdate: boolean }>;
export function resolveCrmServicesUiAccess(effectivePermissions: readonly string[] | null, deniedPermissions: readonly string[]): CrmServicesUiAccess {
  const effective = new Set(effectivePermissions || []);
  const denied = new Set(deniedPermissions);
  const can = (permission: string) => effective.has(permission) && !denied.has(permission);
  return Object.freeze({ canCatalogView: can("services:catalog:view"), canCatalogManage: can("services:catalog:manage"), canCaseView: can("services:case:view"), canCaseUpdate: can("services:case:update"), canPackagesView: can("services:packages:view"), canPackagesManage: can("services:packages:manage"), canMaterialsView: can("services:materials:view"), canMaterialsManage: can("services:materials:manage"), canCaseConfigView: can("services:case-config:view"), canCaseConfigUpdate: can("services:case-config:update") });
}
export const NO_CRM_SERVICES_ACCESS: CrmServicesUiAccess = Object.freeze({ canCatalogView: false, canCatalogManage: false, canCaseView: false, canCaseUpdate: false, canPackagesView: false, canPackagesManage: false, canMaterialsView: false, canMaterialsManage: false, canCaseConfigView: false, canCaseConfigUpdate: false });
