import type {
  AccessConditions,
  InventoryItem,
  ItemAccessHandling,
  StairCarryScope,
  ThirdPartyRequirement,
} from "@/modules/evaluator-app/domain/evaluatorVisitDraft";
import {
  calculateStairCarryChargeableFloors,
  MAX_FULL_MOVE_STAIRS_FLOORS,
  STAIR_CARRY_INCLUDED_FLOORS,
} from "@/lib/stairCarryPolicy";

export { MAX_FULL_MOVE_STAIRS_FLOORS, STAIR_CARRY_INCLUDED_FLOORS };

function positiveInteger(value: unknown) {
  const parsed = Math.floor(Number(value || 0));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function includesCrane(value: unknown) {
  return /gr[uú]a/i.test(String(value || ""));
}

function normalizeHandling(value: unknown): ItemAccessHandling {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "STAIRS" || normalized === "ROPE" || normalized === "CRANE") {
    return normalized;
  }
  return "STANDARD";
}

export function resolveStairCarryScope(access: AccessConditions): StairCarryScope {
  const originFloors = positiveInteger(access.originFloorLevel || access.floorLevel || access.stairsFloors);
  const destinationFloors = positiveInteger(access.destinationFloorLevel);
  const originElevator = access.originElevatorAvailable ?? access.elevatorAvailable;
  const destinationElevator = access.destinationElevatorAvailable ?? access.elevatorAvailable;
  return (originFloors > 0 && !originElevator) || (destinationFloors > 0 && !destinationElevator)
    ? "FULL_MOVE"
    : "NONE";
}

export type EvaluatorAccessPlan = {
  stairCarryScope: StairCarryScope;
  stairsFloors: number;
  stairCarryChargeableFloors: number;
  originStairsFloors: number;
  destinationStairsFloors: number;
  originStairCarryChargeableFloors: number;
  destinationStairCarryChargeableFloors: number;
  elevatorFloors: number;
  elevatorChargeableFloors: number;
  originElevatorFloors: number;
  destinationElevatorFloors: number;
  originElevatorChargeableFloors: number;
  destinationElevatorChargeableFloors: number;
  originElevatorAvailable: boolean;
  destinationElevatorAvailable: boolean;
  stairCarryItemCount: number;
  ropeHandlingItemCount: number;
  craneHandlingItemCount: number;
  craneRequired: boolean;
  validationErrors: string[];
};

export function deriveEvaluatorAccessPlan(
  access: AccessConditions,
  inventoryItems: InventoryItem[],
  thirdPartyRequirements: ThirdPartyRequirement[],
): EvaluatorAccessPlan {
  const scope = resolveStairCarryScope(access);
  const originFloors = positiveInteger(
    access.originFloorLevel || access.floorLevel || access.stairsFloors,
  );
  const destinationPresent = Boolean(
    access.destinationAddress.trim() ||
      access.destinationResidenceType.trim() ||
      access.destinationFloorLevel.trim(),
  );
  const destinationFloors = destinationPresent
    ? positiveInteger(access.destinationFloorLevel)
    : 0;
  const originElevator = access.originElevatorAvailable ?? access.elevatorAvailable;
  const destinationElevator =
    destinationPresent &&
    (access.destinationElevatorAvailable ?? access.elevatorAvailable);
  const originStairsFloors = originElevator ? 0 : originFloors;
  const destinationStairsFloors = destinationElevator ? 0 : destinationFloors;
  const originElevatorFloors = originElevator ? originFloors : 0;
  const destinationElevatorFloors = destinationElevator ? destinationFloors : 0;
  const originElevatorChargeableFloors =
    calculateStairCarryChargeableFloors(originElevatorFloors);
  const destinationElevatorChargeableFloors =
    calculateStairCarryChargeableFloors(destinationElevatorFloors);
  const originAboveLimit = originStairsFloors > MAX_FULL_MOVE_STAIRS_FLOORS;
  const destinationAboveLimit = destinationStairsFloors > MAX_FULL_MOVE_STAIRS_FLOORS;
  const activeItems = inventoryItems.filter((item) => item.itemName.trim().length > 0);
  const ropeItems = activeItems.filter((item) => normalizeHandling(item.accessHandling) === "ROPE");
  const craneItems = activeItems.filter((item) => normalizeHandling(item.accessHandling) === "CRANE");
  const quantityFor = (item: InventoryItem) =>
    Math.min(
      positiveInteger(item.quantity) || 1,
      positiveInteger(item.accessHandlingQuantity) || positiveInteger(item.quantity) || 1,
    );
  const fullMoveAboveLimit = originAboveLimit || destinationAboveLimit;
  const craneConfigured = thirdPartyRequirements.some(
    (item) => item.required && includesCrane(item.serviceName),
  );
  const validationErrors: string[] = [];

  if (originAboveLimit && !craneConfigured) {
    validationErrors.push(
      `El origen solo admite mudanza por escalera hasta ${MAX_FULL_MOVE_STAIRS_FLOORS} pisos; solicita uso de grúa.`,
    );
  }
  if (destinationAboveLimit && !craneConfigured) {
    validationErrors.push(
      `El destino solo admite mudanza por escalera hasta ${MAX_FULL_MOVE_STAIRS_FLOORS} pisos; solicita uso de grúa.`,
    );
  }

  if (craneItems.length > 0 && !craneConfigured) {
    validationErrors.push("Marca «Uso de grúa» en terceros para los artículos asignados a grúa.");
  }

  return {
    stairCarryScope: scope,
    stairsFloors: Math.max(originStairsFloors, destinationStairsFloors),
    stairCarryChargeableFloors:
      (originAboveLimit ? 0 : calculateStairCarryChargeableFloors(originStairsFloors)) +
      (destinationAboveLimit ? 0 : calculateStairCarryChargeableFloors(destinationStairsFloors)),
    originStairsFloors,
    destinationStairsFloors,
    originStairCarryChargeableFloors:
      originAboveLimit ? 0 : calculateStairCarryChargeableFloors(originStairsFloors),
    destinationStairCarryChargeableFloors:
      destinationAboveLimit ? 0 : calculateStairCarryChargeableFloors(destinationStairsFloors),
    elevatorFloors: Math.max(originElevatorFloors, destinationElevatorFloors),
    elevatorChargeableFloors:
      originElevatorChargeableFloors + destinationElevatorChargeableFloors,
    originElevatorFloors,
    destinationElevatorFloors,
    originElevatorChargeableFloors,
    destinationElevatorChargeableFloors,
    originElevatorAvailable: originElevator,
    destinationElevatorAvailable: destinationElevator,
    stairCarryItemCount: 0,
    ropeHandlingItemCount: ropeItems.reduce((sum, item) => sum + quantityFor(item), 0),
    craneHandlingItemCount: craneItems.reduce((sum, item) => sum + quantityFor(item), 0),
    craneRequired: fullMoveAboveLimit || craneItems.length > 0 || craneConfigured,
    validationErrors: Array.from(new Set(validationErrors)),
  };
}
