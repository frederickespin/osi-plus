export type SurveySchedulingUiAccess = Readonly<{
  canView: boolean;
  canManage: boolean;
  canAssign: boolean;
  canReschedule: boolean;
  canViewFee: boolean;
  canApproveFee: boolean;
}>;

export function resolveSurveySchedulingUiAccess(effectivePermissions: readonly string[] | null, deniedPermissions: readonly string[]): SurveySchedulingUiAccess {
  const effective = new Set(effectivePermissions || []);
  const denied = new Set(deniedPermissions);
  const can = (permission: string) => effective.has(permission) && !denied.has(permission);
  return Object.freeze({
    canView: can("survey:schedule:view") || can("survey:schedule:manage"),
    canManage: can("survey:schedule:manage"),
    canAssign: can("survey:schedule:assign"),
    canReschedule: can("survey:schedule:reschedule"),
    canViewFee: can("survey:visit-fee:view") || can("survey:visit-fee:approve"),
    canApproveFee: can("survey:visit-fee:approve"),
  });
}
