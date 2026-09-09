export type ClientTemporaryAccessUi = Readonly<{ canView: boolean; canCreate: boolean; canRevoke: boolean; canManage: boolean }>;
export function resolveClientTemporaryAccessUi(effective: readonly string[] | null, denied: readonly string[]): ClientTemporaryAccessUi {
  const grants = new Set(effective || []); const blocks = new Set(denied); const can = (permission: string) => grants.has(permission) && !blocks.has(permission);
  return Object.freeze({ canView: can("client-access:view"), canCreate: can("client-access:create"), canRevoke: can("client-access:revoke"), canManage: can("client-access:manage") });
}
