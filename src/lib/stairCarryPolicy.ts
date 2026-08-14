export const MAX_FULL_MOVE_STAIRS_FLOORS = 4;
export const STAIR_CARRY_INCLUDED_FLOORS = 2;

export function calculateStairCarryChargeableFloors(
  actualFloors: number,
  includedFloors = STAIR_CARRY_INCLUDED_FLOORS,
) {
  return Math.max(0, Math.floor(Number(actualFloors || 0)) - Math.max(0, Math.floor(includedFloors)));
}
