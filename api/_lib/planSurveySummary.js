import { recipeAppliesToItem, surveyRecipeQuantity } from "./materialsInventoryContract.js";
import { ROUTE_ACCESS_LABELS as ACCESS_FLAGS, knownAccessFlags } from "../../shared/routeAccess.js";
const ITEM_FLAGS = {
  FRAGILE: "frágiles", OVERSIZED: "sobredimensionados", CRATING_CANDIDATE: "para evaluar huacal",
  DISASSEMBLE: "para desmontar", ASSEMBLE: "para armar", CRANE_CANDIDATE: "para evaluar grúa", VALUABLE: "de valor",
};

function accessNote(facts) {
  if (!facts) return null;
  const parts = (facts.flags || []).map((flag) => ACCESS_FLAGS[flag]).filter(Boolean);
  if (facts.floorNumber != null) parts.push(`Piso ${facts.floorNumber}`);
  if (facts.stairsFloors != null) parts.push(`${facts.stairsFloors} pisos por escalera`);
  if (typeof facts.elevatorAvailable === "boolean") parts.push(facts.elevatorAvailable ? "Con ascensor" : "Sin ascensor");
  if (facts.elevatorFloor != null) parts.push(`Ascensor hasta el piso ${facts.elevatorFloor}`);
  if (facts.parkingDistanceM != null) parts.push(`Estacionamiento a ${facts.parkingDistanceM} m`);
  if (facts.notes?.trim()) parts.push(facts.notes.trim());
  return parts.join(" · ") || null;
}

function materialText(name, quantity, unitName) {
  return `${name} (${Number(quantity).toLocaleString("es-DO", { maximumFractionDigits: 6 })} ${unitName})`;
}

function planMaterials(items, recipes, mode) {
  const totals = new Map();
  let missing = 0, overlaps = 0, unmeasured = 0, unavailable = 0;
  for (const item of items) {
    const matching = recipes.filter(({ applicability }) => (applicability?.articleCodes?.length || applicability?.flags?.length)
      && recipeAppliesToItem(applicability, item, mode));
    if (!matching.length) { missing += item.quantity; continue; }
    if (matching.length > 1) { overlaps += item.quantity; continue; }
    let missingMeasures = false, inactive = false;
    for (const line of matching[0].lines) {
      if (line.material.status !== "ACTIVE" || line.unit.status !== "ACTIVE") { inactive = true; continue; }
      const amount = surveyRecipeQuantity(line, item);
      if (amount === null) { missingMeasures = true; continue; }
      if (!amount) continue;
      const key = line.materialId + "/" + line.unitId;
      const entry = totals.get(key) ?? { name: line.material.name, unit: line.unit.name, quantity: 0 };
      entry.quantity += amount;
      totals.set(key, entry);
    }
    if (missingMeasures) unmeasured += item.quantity;
    if (inactive) unavailable += item.quantity;
  }
  const lines = [...totals.values()];
  const sample = lines.slice(0, 3).map((line) => materialText(line.name, line.quantity, line.unit));
  if (lines.length > sample.length) sample.push(`y ${lines.length - sample.length} más`);
  return [
    sample.length ? `Estimación · ${sample.join(", ")}` : "",
    missing ? `Sin receta específica: ${missing}` : "", overlaps ? `Por elegir receta: ${overlaps}` : "",
    unmeasured ? `Pendientes de medir: ${unmeasured}` : "", unavailable ? `Con material o unidad inactivos: ${unavailable}` : "",
  ].filter(Boolean).join(" · ") || null;
}

export function planSurveySummary(row, recipes = [], mode) {
  if (!row) return null;
  const quantities = new Map();
  const flags = new Map();
  let total = 0;
  let withoutVolume = 0;
  for (const item of row.items) {
    total += item.quantity;
    if (!(Number(item.unitVolumeM3) > 0)) withoutVolume += item.quantity;
    quantities.set(item.articleName, (quantities.get(item.articleName) || 0) + item.quantity);
    for (const flag of item.flags || []) {
      const count = flags.get(flag) ?? { quantity: 0, volume: 0, complete: true };
      const unitVolume = Number(item.unitVolumeM3);
      count.quantity += item.quantity;
      if (unitVolume > 0) count.volume += unitVolume * item.quantity;
      else count.complete = false;
      flags.set(flag, count);
    }
  }
  const sample = [...quantities.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, n]) => `${n} × ${name}`);
  const counts = Object.entries(ITEM_FLAGS).filter(([flag]) => flags.has(flag)).map(([flag, name]) => {
    const count = flags.get(flag);
    const volume = count.complete ? ` (${count.volume.toLocaleString("es-DO", { maximumFractionDigits: 6 })} m³)` : "";
    return `${count.quantity} ${name}${volume}`;
  });
  const contentNote = total ? [`${total} ${total === 1 ? "artículo" : "artículos"}`, sample.join(", "), counts.join(", "),
    withoutVolume ? `${withoutVolume} sin volumen registrado` : ""].filter(Boolean).join(" · ") : null;
  const requirements = row.materialRequirements[0];
  const materials = requirements?.lines.map((line) => materialText(line.material.name, line.requiredQuantity, line.unit.name)) ?? [];
  if (requirements && requirements._count.lines > materials.length) materials.push(`y ${requirements._count.lines - materials.length} más`);
  const volume = Number(row.totalsSnapshot?.volumeM3 ?? row.totalsSnapshot?.totalVolumeM3);
  const access = (side) => accessNote(row.accessSnapshots.find((entry) => entry.side === side)?.factsSnapshot);
  return {
    publicationRef: row.publicationRef, revision: row.revision, routeVersion: row.routeVersion, volumeM3: Number.isFinite(volume) && volume > 0 ? volume : null,
    contentNote, materialsNote: requirements ? materials.join(", ") || null : planMaterials(row.items, recipes, mode),
    originAccess: access("ORIGIN"), destinationAccess: access("DESTINATION"),
    accessFlags: Object.fromEntries(["ORIGIN", "DESTINATION"].map((side) => [side.toLowerCase(),
      knownAccessFlags(row.accessSnapshots.find((entry) => entry.side === side)?.factsSnapshot?.flags)])),
  };
}

export async function currentPlanSurvey(tx, where, selectionRef, mode) {
  if (!selectionRef) return null;
  const row = await tx.surveyPublication.findFirst({
    where: { ...where, serviceSelectionRef: selectionRef, status: "CURRENT" },
    orderBy: [{ publishedAt: "desc" }, { revision: "desc" }],
    select: {
      publicationRef: true, revision: true, routeVersion: true, totalsSnapshot: true,
      items: { orderBy: { position: "asc" }, select: { articleName: true, articleCode: true, quantity: true, flags: true, shipmentMode: true, measurements: true, unitVolumeM3: true } },
      accessSnapshots: { select: { side: true, factsSnapshot: true } },
      materialRequirements: { where: { status: "CURRENT" }, orderBy: { revision: "desc" }, take: 1, select: {
        _count: { select: { lines: true } },
        lines: { orderBy: { position: "asc" }, take: 3, select: {
          material: { select: { name: true } }, unit: { select: { name: true } }, requiredQuantity: true,
        } },
      } },
    },
  });
  if (!row?.items.length || row.materialRequirements.length) return planSurveySummary(row);
  const recipes = await tx.packingRecipeVersion.findMany({
    where: { tenantId: where.tenantId, status: "ACTIVE", recipe: { status: "ACTIVE" } },
    select: { applicability: true, lines: { orderBy: { position: "asc" }, select: {
      materialId: true, unitId: true, material: { select: { name: true, status: true } }, unit: { select: { name: true, status: true } },
      formulaType: true, formulaConfig: true, fixedQuantity: true, multiplier: true, wastePercent: true, roundingIncrement: true,
    } } },
  });
  return planSurveySummary(row, recipes, mode);
}
