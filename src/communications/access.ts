export type CommunicationsAccess = Readonly<{ canTemplatesView: boolean; canTemplatesManage: boolean; canPrepare: boolean; canSend: boolean; canView: boolean; tenantWide: boolean }>;
export function resolveCommunicationsAccess(effective: readonly string[] | null | undefined, denied: readonly string[] = []): CommunicationsAccess {
  const allowed = new Set(effective || []); const blocked = new Set(denied); const can = (permission: string) => allowed.has(permission) && !blocked.has(permission);
  return Object.freeze({ canTemplatesView: can("communications:templates:view"), canTemplatesManage: can("communications:templates:manage"), canPrepare: can("communications:prepare"), canSend: can("communications:send"), canView: can("communications:view"), tenantWide: can("communications:tenant") });
}
