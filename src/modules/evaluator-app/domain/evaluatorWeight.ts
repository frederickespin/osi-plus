import type {
  InventoryItem,
  InventoryShipmentMode,
  InventoryWeightSource,
} from "@/modules/evaluator-app/domain/evaluatorVisitDraft";
import {
  AIR_SURVEY_DENSITY_KG_M3,
  STANDARD_SURVEY_DENSITY_KG_M3,
  calculateSurveyVolumeFromDimensionsCm,
  calculateSurveyVolumeFromWeight,
  calculateSurveyWeightFromVolume,
  resolveSurveyDensityKgM3,
  resolveSurveyShipmentMode,
  roundSurveyMeasurement,
} from "@/lib/surveyMeasurements";

export const AIR_EVALUATOR_DENSITY_KG_M3 = AIR_SURVEY_DENSITY_KG_M3;
export const STANDARD_EVALUATOR_DENSITY_KG_M3 = STANDARD_SURVEY_DENSITY_KG_M3;
export const DEFAULT_EVALUATOR_DENSITY_KG_M3 = STANDARD_EVALUATOR_DENSITY_KG_M3;

type DensityTaskContext = {
  serviceType?: string;
  mode?: string;
  modeLabel?: string;
};

function hasOwn<T extends object, K extends PropertyKey>(value: T, key: K): value is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function resolveEvaluatorShipmentMode(task?: DensityTaskContext): InventoryShipmentMode {
  return resolveSurveyShipmentMode(task?.serviceType, task?.mode, task?.modeLabel);
}

export function resolveShipmentDensityKgM3(shipmentMode?: InventoryShipmentMode) {
  return resolveSurveyDensityKgM3(shipmentMode);
}

export function resolveEvaluatorDensityKgM3(task?: DensityTaskContext) {
  return resolveShipmentDensityKgM3(resolveEvaluatorShipmentMode(task));
}

export function resolveInventoryItemDensityKgM3(
  item: Pick<InventoryItem, "shipmentMode">,
  task?: DensityTaskContext,
) {
  return resolveShipmentDensityKgM3(item.shipmentMode || resolveEvaluatorShipmentMode(task));
}

export function deriveInventoryVolumeM3(item: Pick<InventoryItem, "estimatedVolumeM3" | "lengthCm" | "widthCm" | "heightCm">) {
  const lengthCm = Number(item.lengthCm || 0);
  const widthCm = Number(item.widthCm || 0);
  const heightCm = Number(item.heightCm || 0);
  if (lengthCm > 0 && widthCm > 0 && heightCm > 0) {
    return calculateSurveyVolumeFromDimensionsCm(lengthCm, widthCm, heightCm);
  }

  const directVolume = Number(item.estimatedVolumeM3 || 0);
  if (directVolume > 0) {
    return roundSurveyMeasurement(directVolume, 3);
  }

  return 0;
}

export function deriveWeightFromDensity(
  item: Pick<InventoryItem, "estimatedVolumeM3" | "lengthCm" | "widthCm" | "heightCm">,
  densityKgM3 = DEFAULT_EVALUATOR_DENSITY_KG_M3,
) {
  const volumeM3 = deriveInventoryVolumeM3(item);
  return calculateSurveyWeightFromVolume(volumeM3, densityKgM3);
}

export function resolveInventoryItemWeight(
  current: InventoryItem,
  patch: Partial<InventoryItem>,
  densityKgM3 = DEFAULT_EVALUATOR_DENSITY_KG_M3,
): InventoryItem {
  const next = { ...current, ...patch };
  const nextWeightSource = (patch.weightSource ?? next.weightSource ?? "DENSITY") as InventoryWeightSource;
  const dimensionsPatched =
    hasOwn(patch, "lengthCm") ||
    hasOwn(patch, "widthCm") ||
    hasOwn(patch, "heightCm");
  const volumePatched = hasOwn(patch, "estimatedVolumeM3");
  const isWeightPatched = hasOwn(patch, "estimatedWeightKg");
  const isCatalogPatched = hasOwn(patch, "catalogArticleId");
  const shipmentModePatched = hasOwn(patch, "shipmentMode");

  if (isCatalogPatched && patch.catalogArticleId) {
    const catalogVolumeM3 = Math.max(0, Number(next.estimatedVolumeM3 || 0));
    const catalogWeightKg = Math.max(0, Number(next.catalogWeightKg || next.estimatedWeightKg || 0));
    next.estimatedVolumeM3 = roundSurveyMeasurement(catalogVolumeM3, 3);
    next.catalogWeightKg = catalogWeightKg > 0 ? catalogWeightKg : undefined;
    next.estimatedWeightKg =
      next.catalogWeightKg ?? calculateSurveyWeightFromVolume(catalogVolumeM3, densityKgM3);
    next.calculatedWeightKg = calculateSurveyWeightFromVolume(catalogVolumeM3, densityKgM3) || undefined;
    next.weightSource = next.catalogWeightKg ? "CATALOG" : "DENSITY";
    next.lengthCm = undefined;
    next.widthCm = undefined;
    next.heightCm = undefined;
    return next;
  }

  if (isWeightPatched) {
    const manualWeightKg = Math.max(0, Number(next.estimatedWeightKg || 0));
    const calculatedVolumeM3 = calculateSurveyVolumeFromWeight(manualWeightKg, densityKgM3);
    next.weightSource = "MANUAL";
    next.estimatedWeightKg = manualWeightKg;
    next.estimatedVolumeM3 = calculatedVolumeM3;
    next.calculatedWeightKg = manualWeightKg || undefined;
    next.lengthCm = undefined;
    next.widthCm = undefined;
    next.heightCm = undefined;
    return next;
  }

  if (volumePatched && !dimensionsPatched) {
    const manualVolumeM3 = Math.max(0, Number(next.estimatedVolumeM3 || 0));
    const calculatedWeightKg = calculateSurveyWeightFromVolume(manualVolumeM3, densityKgM3);
    next.estimatedVolumeM3 = roundSurveyMeasurement(manualVolumeM3, 3);
    next.estimatedWeightKg = calculatedWeightKg;
    next.calculatedWeightKg = calculatedWeightKg || undefined;
    next.weightSource = "DENSITY";
    next.lengthCm = undefined;
    next.widthCm = undefined;
    next.heightCm = undefined;
    return next;
  }

  if (dimensionsPatched) {
    const measuredVolumeM3 = calculateSurveyVolumeFromDimensionsCm(
      next.lengthCm,
      next.widthCm,
      next.heightCm,
    );
    if (measuredVolumeM3 > 0) {
      const calculatedWeightKg = calculateSurveyWeightFromVolume(measuredVolumeM3, densityKgM3);
      next.estimatedVolumeM3 = measuredVolumeM3;
      next.estimatedWeightKg = calculatedWeightKg;
      next.calculatedWeightKg = calculatedWeightKg || undefined;
      next.weightSource = "DENSITY";
    }
    return next;
  }

  if (isCatalogPatched && patch.catalogArticleId === undefined) {
    next.catalogWeightKg = undefined;
    next.weightSource = "DENSITY";
  }

  if (shipmentModePatched && nextWeightSource === "MANUAL") {
    next.estimatedVolumeM3 = calculateSurveyVolumeFromWeight(next.estimatedWeightKg, densityKgM3);
    next.calculatedWeightKg = Number(next.estimatedWeightKg || 0) || undefined;
    return next;
  }

  if (nextWeightSource === "MANUAL") {
    next.weightSource = "MANUAL";
    next.estimatedWeightKg = Math.max(0, Number(next.estimatedWeightKg || 0));
    next.calculatedWeightKg = next.estimatedWeightKg || undefined;
    return next;
  }

  if (nextWeightSource === "CATALOG" && next.catalogWeightKg) {
    next.estimatedWeightKg = next.catalogWeightKg;
    next.weightSource = "CATALOG";
    next.calculatedWeightKg =
      calculateSurveyWeightFromVolume(deriveInventoryVolumeM3(next), densityKgM3) || undefined;
    return next;
  }

  const densityWeightKg = deriveWeightFromDensity(next, densityKgM3);
  next.estimatedWeightKg = densityWeightKg;
  next.calculatedWeightKg = densityWeightKg > 0 ? densityWeightKg : undefined;
  next.weightSource = "DENSITY";
  return next;
}
