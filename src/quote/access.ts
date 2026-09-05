export type QuoteUiAccess = Readonly<{
  canView: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canPublish: boolean;
  canSend: boolean;
  canRecordDecision: boolean;
  canOverridePrice: boolean;
  canViewInternalCost: boolean;
  canTenant: boolean;
}>;

export const NO_QUOTE_ACCESS: QuoteUiAccess = Object.freeze({ canView: false, canCreate: false, canUpdate: false, canPublish: false, canSend: false, canRecordDecision: false, canOverridePrice: false, canViewInternalCost: false, canTenant: false });

export function resolveQuoteUiAccess(effective: readonly string[] | null, denied: readonly string[] = []): QuoteUiAccess {
  const grants = new Set(effective || []);
  const denies = new Set(denied);
  const can = (permission: string) => grants.has(permission) && !denies.has(permission);
  return Object.freeze({
    canView: can("quote:view"),
    canCreate: can("quote:create"),
    canUpdate: can("quote:update"),
    canPublish: can("quote:publish"),
    canSend: can("quote:send"),
    canRecordDecision: can("quote:record-client-decision"),
    canOverridePrice: can("quote:override-price"),
    canViewInternalCost: can("quote:internal-cost:view"),
    canTenant: can("quote:tenant"),
  });
}
