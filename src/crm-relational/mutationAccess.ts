import type { HubAccessContext } from "@/hub/hubAccess";

export type CrmCaseMutationUiAccess = Readonly<{
  canCreate: boolean;
  canCreatePendingDestination: boolean;
  canUpdateOwn: boolean;
  canUpdateAny: boolean;
}>;

const CREATE = "pipeline:create";
const CREATE_PENDING_DESTINATION = "pipeline:create:pending-destination";
const UPDATE_OWN = "pipeline:update:own";
const UPDATE_ANY = "pipeline:update:any";

export function resolveCrmCaseMutationUiAccess(context: HubAccessContext): CrmCaseMutationUiAccess {
  const effective = new Set(context.effectivePermissions ?? []);
  const denied = new Set(context.deniedPermissions);
  const allowed = (permission: string) => effective.has(permission) && !denied.has(permission);
  return Object.freeze({
    canCreate: allowed(CREATE),
    canCreatePendingDestination: allowed(CREATE_PENDING_DESTINATION),
    canUpdateOwn: allowed(UPDATE_OWN),
    canUpdateAny: allowed(UPDATE_ANY),
  });
}

export const NO_CRM_CASE_MUTATION_UI_ACCESS: CrmCaseMutationUiAccess = Object.freeze({
  canCreate: false,
  canCreatePendingDestination: false,
  canUpdateOwn: false,
  canUpdateAny: false,
});
