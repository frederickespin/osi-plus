import type { CrateDraft } from "@/lib/crateDraftStore";
import type { CrateSettings, CrateProfileKey } from "@/lib/crateSettingsStore";

const CM_PER_IN = 2.54;
const LB_PER_KG = 2.2046226218;

const cmToIn = (cm: number) => cm / CM_PER_IN;
const kgToLb = (kg: number) => kg * LB_PER_KG;

const roundUpToStep = (x: number, step: number) => {
  if (step <= 0) return x;
  return Math.ceil(x / step) * step;
};

const sheetAreaIn2 = (wIn: number, hIn: number) => wIn * hIn;

function dimsToNestingAxesCm(lengthCm: number, widthCm: number, heightCm: number) {
  const arr = [lengthCm, widthCm, heightCm].sort((a, b) => a - b);
  const depth = arr[0];
  const faceB = arr[1];
  const faceA = arr[2];
  return { faceACm: faceA, faceBCm: faceB, depthCm: depth };
}

function withinTol(base: number, value: number, tolPct: number) {
  const tol = (base * tolPct) / 100;
  return Math.abs(value - base) <= tol;
}

function compatibleFace(baseA: number, baseB: number, candA: number, candB: number, tolPct: number) {
  const direct = withinTol(baseA, candA, tolPct) && withinTol(baseB, candB, tolPct);
  const rotated = withinTol(baseA, candB, tolPct) && withinTol(baseB, candA, tolPct);
  return direct || rotated;
}

export function runNesting(draft: CrateDraft, settings: CrateSettings) {
  const tol = settings.nesting.similarityTolerancePct;
  const maxDepth = settings.nesting.maxDepthForNestingCm;
  const maxItems = settings.nesting.maxItemsPerBox;

  const units = draft.items.flatMap((it) =>
    Array.from({ length: it.qty }, () => {
      const axes = dimsToNestingAxesCm(it.lengthCm, it.widthCm, it.heightCm);
      return {
        sourceItemId: it.id,
        name: it.name,
        weightKg: it.weightKg,
        fragility: it.fragility,
        dimsCm: { lengthCm: it.lengthCm, widthCm: it.widthCm, heightCm: it.heightCm },
        ...axes,
      };
    })
  );

  const candidates = units
    .map((u, idx) => ({ ...u, idx }))
    .filter((u) => u.depthCm <= maxDepth);

  const nonCandidates = units
    .map((u, idx) => ({ ...u, idx }))
    .filter((u) => u.depthCm > maxDepth);

  candidates.sort((a, b) => b.faceACm - a.faceACm);

  const used = new Set<number>();
  const boxes: any[] = [];

  for (const base of candidates) {
    if (used.has(base.idx)) continue;

    const group = [base];
    used.add(base.idx);

    for (const cand of candidates) {
      if (group.length >= maxItems) break;
      if (used.has(cand.idx)) continue;

      if (compatibleFace(base.faceACm, base.faceBCm, cand.faceACm, cand.faceBCm, tol)) {
        group.push(cand);
        used.add(cand.idx);
      }
    }

    const faceA = Math.max(...group.map((g) => g.faceACm));
    const faceB = Math.max(...group.map((g) => g.faceBCm));
    const depthSum = group.reduce((s, g) => s + g.depthCm, 0);
    const totalWeight = group.reduce((s, g) => s + (g.weightKg ?? 0), 0);
    const maxFrag = Math.max(...group.map((g) => g.fragility));

    boxes.push({
      id: crypto?.randomUUID ? crypto.randomUUID() : `box_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      type: group.length > 1 ? "CONSOLIDATED" : "INDIVIDUAL",
      itemCount: group.length,
      totalWeightKg: totalWeight,
      maxFragility: maxFrag,
      faceACm: faceA,
      faceBCm: faceB,
      depthCm: depthSum,
      items: group.map((g) => ({
        sourceItemId: g.sourceItemId,
        name: g.name,
        weightKg: g.weightKg ?? 0,
        fragility: g.fragility,
        dimsCm: g.dimsCm,
        faceACm: g.faceACm,
        faceBCm: g.faceBCm,
        depthCm: g.depthCm,
      })),
    });
  }

  for (const u of nonCandidates) {
    boxes.push({
      id: crypto?.randomUUID ? crypto.randomUUID() : `box_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      type: "INDIVIDUAL",
      itemCount: 1,
      totalWeightKg: u.weightKg ?? 0,
      maxFragility: u.fragility,
      faceACm: u.faceACm,
      faceBCm: u.faceBCm,
      depthCm: u.depthCm,
      items: [{
        sourceItemId: u.sourceItemId,
        name: u.name,
        weightKg: u.weightKg ?? 0,
        fragility: u.fragility,
        dimsCm: u.dimsCm,
        faceACm: u.faceACm,
        faceBCm: u.faceBCm,
        depthCm: u.depthCm,
      }],
    });
  }

  boxes.sort((a, b) => (b.faceACm * b.faceBCm) - (a.faceACm * a.faceBCm));
  return { boxes };
}

function inferDefaultProfile(draft: CrateDraft): CrateProfileKey {
  const s = (draft.serviceType || "").toLowerCase();
  if (s.includes("export") || s.includes("ispm")) return "EXPORT_ISPM15";
  if (s.includes("maquin")) return "MACHINERY_ISPM15";
  if (s.includes("arte") || s.includes("it") || s.includes("premium")) return "PREMIUM_ART_IT";
  return "STANDARD_LOCAL";
}

export function runEngineering(
  draft: CrateDraft,
  settings: CrateSettings,
  nestingBoxes: any[],
  profileByBoxId?: Record<string, CrateProfileKey>
) {
  const defaultProfile = inferDefaultProfile(draft);
  const sheetW = settings.materials.plywood.sheetSizeIn.w;
  const sheetH = settings.materials.plywood.sheetSizeIn.h;
  const sheetIn2 = sheetAreaIn2(sheetW, sheetH);

  const out = nestingBoxes.map((b: any) => {
    const profile = (profileByBoxId?.[b.id] as CrateProfileKey) || defaultProfile;

    const profileDefaults = settings.engineering.profileDefaults[profile];
    const minFrag = profileDefaults?.minFragility ?? 1;
    const frag = Math.max(b.maxFragility, minFrag) as 1 | 2 | 3 | 4 | 5;

    const prot = settings.protectionByFragility.find((p) => p.fragility === frag)!;

    const foamEff = prot.perimeterFoamIn * (prot.doublePerimeter ? 2 : 1);
    const paddingPerimeterCm = (foamEff + prot.cardboardIn) * CM_PER_IN;
    const paddingBetweenCm = prot.betweenItemsFoamIn * CM_PER_IN;

    const internalFinal = {
      faceACm: b.faceACm + 2 * paddingPerimeterCm,
      faceBCm: b.faceBCm + 2 * paddingPerimeterCm,
      depthCm: b.depthCm + (b.itemCount - 1) * paddingBetweenCm + 2 * paddingPerimeterCm,
    };

    const plywoodTh = settings.engineering.plywoodThicknessByProfileIn[profile];
    const weightLb = kgToLb(b.totalWeightKg ?? 0);

    let lumber: "1x4" | "2x4" = profileDefaults?.defaultLumber ?? "1x4";
    const longestIn = Math.max(cmToIn(internalFinal.faceACm), cmToIn(internalFinal.faceBCm), cmToIn(internalFinal.depthCm));

    if (
      weightLb > settings.engineering.thresholds.use2x4IfWeightLbAbove ||
      longestIn > settings.engineering.thresholds.use2x4IfLongestSideInAbove
    ) {
      lumber = "2x4";
    }

    const skid =
      profileDefaults?.skidPreferred ||
      weightLb > settings.engineering.thresholds.skidIfWeightLbAbove ||
      longestIn > settings.engineering.thresholds.skidIfLongestSideInAbove;

    const aspect = cmToIn(internalFinal.faceACm) / Math.max(1, cmToIn(internalFinal.faceBCm));
    const ribs = longestIn > settings.engineering.thresholds.addRibsIfLongestSideInAbove;
    const xBracing = aspect > settings.engineering.thresholds.addXBracingIfAspectRatioAbove;

    const W = cmToIn(internalFinal.faceACm);
    const H = cmToIn(internalFinal.faceBCm);
    const D = cmToIn(internalFinal.depthCm);

    const surfaceIn2 = 2 * (W * H + W * D + H * D);
    const plywoodSheets = surfaceIn2 / sheetIn2;

    let lumberIn = 4 * (W + H) + 4 * D;
    if (skid) lumberIn += 2 * W + 3 * H;
    if (ribs) lumberIn += 2 * (W + H);
    if (xBracing) lumberIn += 2 * Math.sqrt(W * W + H * H);

    const lumberSticks = lumberIn / settings.materials.lumber.lengthsIn[0];

    const innerSurfaceIn2 = surfaceIn2;
    const foamSheets = innerSurfaceIn2 / sheetIn2;
    const cardboardSheets = innerSurfaceIn2 / sheetIn2;

    return {
      ...b,
      profile,
      paddingPerimeterCm,
      paddingBetweenCm,
      internalFinalCm: internalFinal,
      plywoodThicknessIn: plywoodTh,
      lumberType: lumber,
      skid,
      ribs,
      xBracing,
      bomRaw: {
        plywoodSheets,
        lumberSticks,
        foamSheets,
        cardboardSheets,
      },
    };
  });

  return { boxes: out };
}

export function runCosting(settings: CrateSettings, engBoxes: any[]) {
  const step = settings.pricing.rounding.stepUnits;
  const waste = settings.pricing.wastePctByMaterial;

  const totals = { materials: 0, labor: 0, adders: 0, totalCost: 0, sellPrice: 0 };

  const boxes = engBoxes.map((b: any) => {
    const lumberType = b.lumberType as "1x4" | "2x4";
    const profile = b.profile as CrateProfileKey;
    const plywoodThKey = String(b.plywoodThicknessIn);
    const foamThKey = String(settings.protectionByFragility.find((p) => p.fragility === b.maxFragility)?.perimeterFoamIn ?? 1);

    const rawPlywood = b.bomRaw.plywoodSheets * (1 + waste.plywood);
    const rawLumber = b.bomRaw.lumberSticks * (1 + waste.lumber);
    const rawFoam = b.bomRaw.foamSheets * (1 + waste.foam);
    const rawCard = b.bomRaw.cardboardSheets;

    const rounded = {
      plywoodSheets: roundUpToStep(rawPlywood, step),
      lumberSticks: roundUpToStep(rawLumber, step),
      foamSheets: roundUpToStep(rawFoam, step),
      cardboardSheets: roundUpToStep(rawCard, step),
    };

    const unit = settings.pricing.unitCosts;

    const plywoodUnit = unit.plywoodPerSheetByThicknessIn[plywoodThKey] ?? 0;
    const foamUnit = unit.foamPerSheetByThicknessIn[foamThKey] ?? 0;
    const cardboardUnit = unit.cardboardPerSheet ?? 0;
    const lumberUnit = unit.lumberPerStick[lumberType] ?? 0;

    const costBreakdown: Record<string, number> = {};

    const plywoodCost = rounded.plywoodSheets * plywoodUnit;
    const foamCost = rounded.foamSheets * foamUnit;
    const cardCost = rounded.cardboardSheets * cardboardUnit;
    const lumberCost = rounded.lumberSticks * lumberUnit;

    costBreakdown["Plywood"] = plywoodCost;
    costBreakdown["Foam"] = foamCost;
    costBreakdown["Cartón"] = cardCost;
    costBreakdown["Madera"] = lumberCost;

    const materials = plywoodCost + foamCost + cardCost + lumberCost;

    const labor = settings.pricing.labor.enabled ? 0 : 0;

    let adders = 0;

    const ispmRequired = settings.engineering.profileDefaults[profile]?.ispm15Required;
    if (settings.adders.fumigation.enabled && ispmRequired) {
      const mode = settings.adders.fumigation.mode;
      const rate = settings.adders.fumigation.rate;

      if (mode === "FIXED") adders += rate;
      if (mode === "PER_BOX") adders += rate;

      if (mode === "PER_M3") {
        const Wm = b.internalFinalCm.faceACm / 100;
        const Hm = b.internalFinalCm.faceBCm / 100;
        const Dm = b.internalFinalCm.depthCm / 100;
        const m3 = Wm * Hm * Dm;
        adders += m3 * rate;
      }

      if (settings.adders.fumigation.transportToPlantEnabled) adders += settings.adders.fumigation.transportToPlantRate;
      if (settings.adders.fumigation.markingIppcEnabled) adders += settings.adders.fumigation.markingIppcRatePerBox;
    }

    if (settings.adders.fasteners.enabled) {
      if (settings.adders.fasteners.mode === "PER_SHEET") {
        adders += settings.adders.fasteners.ratePerSheet * rounded.plywoodSheets;
      } else {
        const volIn3 = (b.internalFinalCm.faceACm / CM_PER_IN) * (b.internalFinalCm.faceBCm / CM_PER_IN) * (b.internalFinalCm.depthCm / CM_PER_IN);
        const { smallMax, mediumMax } = settings.adders.fasteners.boxVolumeThresholdsIn3;
        const size = volIn3 <= smallMax ? "small" : volIn3 <= mediumMax ? "medium" : "large";
        adders += settings.adders.fasteners.rateBySize[size];
      }
    }

    if (settings.adders.cornerProtectors.enabled) {
      adders += settings.adders.cornerProtectors.ratePerBox;
    }

    costBreakdown["Adicionales"] = adders;

    const totalCost = materials + labor + adders;

    const markup = settings.pricing.markupPctByProfile[profile] ?? 0;
    const sellPrice = totalCost * (1 + markup);

    totals.materials += materials;
    totals.labor += labor;
    totals.adders += adders;
    totals.totalCost += totalCost;
    totals.sellPrice += sellPrice;

    return {
      ...b,
      rounded,
      costs: { materials, labor, adders, totalCost, sellPrice },
      costBreakdown,
    };
  });

  return { boxes, totals };
}
