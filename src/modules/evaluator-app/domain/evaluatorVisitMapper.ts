import type {
  AllowanceVarianceAlert,
  CratingItem,
  EvaluatorVisitDraft,
  EvaluatorVisitOutput,
  EvaluatorVisitTask,
  InventoryItem,
  PackingMaterial,
} from "@/modules/evaluator-app/domain/evaluatorVisitDraft";
import { deriveInventoryVolumeM3, resolveInventoryItemDensityKgM3 } from "@/modules/evaluator-app/domain/evaluatorWeight";

function roundTo(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeText(value: string) {
  return String(value || "").trim().toLowerCase();
}

function buildCratingIdentity(item: Pick<CratingItem, "itemName" | "quantity">) {
  return `${normalizeText(item.itemName)}::${Math.max(1, Number(item.quantity || 0))}`;
}

export function buildDerivedCratingItemsFromInventory(inventoryItems: InventoryItem[]): CratingItem[] {
  return inventoryItems
    .filter((item) => item.itemName.trim().length > 0 && item.needsCrating)
    .map((item) => ({
      id: `crate-from-${item.id}`,
      roomName: item.roomName || undefined,
      itemName: item.itemName,
      quantity: Math.max(1, Number(item.quantity || 0)),
      lengthCm: item.lengthCm,
      widthCm: item.widthCm,
      heightCm: item.heightCm,
      notes: item.notes,
    }));
}

export function hasCompleteCratingDimensions(item: {
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
}) {
  return Number(item.lengthCm || 0) > 0 && Number(item.widthCm || 0) > 0 && Number(item.heightCm || 0) > 0;
}

export function getPendingCratingDimensionItems(inventoryItems: InventoryItem[]) {
  return inventoryItems.filter(
    (item) => item.itemName.trim().length > 0 && item.needsCrating && !hasCompleteCratingDimensions(item),
  );
}

export function buildOutputPackingMaterials(
  inventoryItems: InventoryItem[],
  packingMaterials: PackingMaterial[],
): PackingMaterial[] {
  const materialMap = new Map<
    string,
    { id: string; materialName: string; quantity: number; notes: string[] }
  >();

  const upsertMaterial = (materialName: string, quantity: number, notes?: string) => {
    const normalized = normalizeText(materialName);
    if (!normalized) return;

    const existing = materialMap.get(normalized);
    if (existing) {
      existing.quantity += Math.max(0, Number(quantity || 0));
      if (notes?.trim()) {
        existing.notes.push(notes.trim());
      }
      return;
    }

    materialMap.set(normalized, {
      id: `pack-derived-${normalized.replace(/[^a-z0-9]+/g, "-")}`,
      materialName: materialName.trim(),
      quantity: Math.max(0, Number(quantity || 0)),
      notes: notes?.trim() ? [notes.trim()] : [],
    });
  };

  inventoryItems.forEach((item) => {
    if (!item.itemName.trim() || !item.suggestedPackingMaterial?.trim()) {
      return;
    }
    upsertMaterial(item.suggestedPackingMaterial, Math.max(1, Number(item.quantity || 0)));
  });

  packingMaterials.forEach((item) => {
    if (!item.materialName.trim()) {
      return;
    }
    upsertMaterial(item.materialName, item.quantity, item.notes);
  });

  return Array.from(materialMap.values())
    .map((item) => ({
      id: item.id,
      materialName: item.materialName,
      quantity: item.quantity,
      notes: item.notes.join(" | "),
    }))
    .filter((item) => item.quantity > 0 || item.notes.trim().length > 0);
}

export function buildEvaluatorVisitOutput(
  task: EvaluatorVisitTask,
  draft: EvaluatorVisitDraft,
): EvaluatorVisitOutput {
  const filteredInventoryItems = draft.inventoryItems.filter((item) => item.itemName.trim().length > 0);
  const derivedCratingItems = buildDerivedCratingItemsFromInventory(filteredInventoryItems);
  const derivedCratingIdentities = new Set(derivedCratingItems.map((item) => buildCratingIdentity(item)));
  const manualCratingItems = draft.cratingItems.filter(
    (item) => item.itemName.trim().length > 0 && !derivedCratingIdentities.has(buildCratingIdentity(item)),
  );
  const outputCratingItems = [...derivedCratingItems, ...manualCratingItems];
  const outputPackingMaterials = buildOutputPackingMaterials(filteredInventoryItems, draft.packingMaterials);

  const accessNoteParts = [
    draft.accessConditions.accessNotes,
    draft.accessConditions.longCarryNotes
      ? `Long Carry: ${draft.accessConditions.longCarryNotes}`
      : "",
    draft.accessConditions.stairsNotes
      ? `Escalera: ${draft.accessConditions.stairsNotes}`
      : "",
    draft.accessConditions.additionalStopRequired && draft.accessConditions.additionalStopNotes
      ? `Parada adicional: ${draft.accessConditions.additionalStopNotes}`
      : draft.accessConditions.additionalStopRequired
      ? "Parada adicional requerida"
      : "",
  ].filter(Boolean);
  const totalVolume = roundTo(
    filteredInventoryItems.reduce((sum, item) => sum + deriveInventoryVolumeM3(item) * item.quantity, 0),
  );
  const totalWeight = roundTo(
    filteredInventoryItems.reduce((sum, item) => sum + item.estimatedWeightKg * item.quantity, 0),
  );
  const volumetricWeight = roundTo(
    filteredInventoryItems.reduce(
      (sum, item) => sum + deriveInventoryVolumeM3(item) * item.quantity * resolveInventoryItemDensityKgM3(item, task),
      0,
    ),
  );

  const allowanceAlerts: AllowanceVarianceAlert[] = [];

  if (typeof task.allowanceSnapshot?.volumeM3 === "number" && totalVolume > task.allowanceSnapshot.volumeM3) {
    allowanceAlerts.push({
      code: "ALLOWANCE_VOLUME_EXCEEDED",
      severity: "warning",
      message: `El volumen de visita (${totalVolume} m3) supera el allowance (${task.allowanceSnapshot.volumeM3} m3).`,
    });
  }

  if (typeof task.allowanceSnapshot?.weightKg === "number" && totalWeight > task.allowanceSnapshot.weightKg) {
    allowanceAlerts.push({
      code: "ALLOWANCE_WEIGHT_EXCEEDED",
      severity: "warning",
      message: `El peso de visita (${totalWeight} kg) supera el allowance (${task.allowanceSnapshot.weightKg} kg).`,
    });
  }

  return {
    visitId: task.visitId,
    caseId: task.caseId,
    caseCode: task.caseCode,
    surveyMethod: task.surveyMethod,
    captureChannel: task.captureChannel,
    verificationLevel: task.verificationLevel,
    inventoryItems: filteredInventoryItems,
    cratingItems: outputCratingItems,
    scopeVolumeSummary: {
      estimatedTotalVolumeM3: totalVolume,
      estimatedTotalWeightKg: totalWeight,
      estimatedVolumetricWeightKg: volumetricWeight,
    },
    packingMaterials: outputPackingMaterials,
    permitRequirements: draft.permitRequirements.filter((item) => item.required || item.notes.trim().length > 0),
    thirdPartyRequirements: draft.thirdPartyRequirements.filter((item) => item.required || item.notes.trim().length > 0),
    accessConditions: {
      ...draft.accessConditions,
      accessNotes: accessNoteParts.join(" | "),
    },
    surveyObservations: draft.surveyObservations,
    allowanceVarianceAlerts: allowanceAlerts,
    generatedAt: new Date().toISOString(),
  };
}
