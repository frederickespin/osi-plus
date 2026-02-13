// src/lib/crateSettingsStore.ts
import { z } from "zod";

const LS_CURRENT = "osi-plus.crateSettings";
const LS_HISTORY = "osi-plus.crateSettingsHistory";

const nowIso = () => new Date().toISOString();
const uuid = () => (crypto?.randomUUID ? crypto.randomUUID() : `id_${Date.now()}_${Math.random().toString(16).slice(2)}`);

export type CrateProfileKey =
  | "STANDARD_LOCAL"
  | "EXPORT_ISPM15"
  | "PREMIUM_ART_IT"
  | "MACHINERY_ISPM15";

export type FastenersMode = "FIXED_PER_BOX" | "PER_SHEET";
export type FumigationMode = "FIXED" | "PER_M3" | "PER_BOX";
export type RoundingMode = "UP";
export type HoursRoundingRule = "HALF_HOUR_UP";

export type CrateSettings = {
  meta: {
    versionId: string;
    updatedAt: string;
    updatedBy?: string;
  };

  materials: {
    lumber: {
      lengthsIn: number[]; // e.g. [192]
      types: Array<"1x4" | "2x4">;
    };
    plywood: {
      sheetSizeIn: { w: number; h: number }; // 48 x 96
      thicknessOptionsIn: number[]; // 0.25, 0.375, 0.5
    };
    foam: {
      sheetSizeIn: { w: number; h: number };
      thicknessOptionsIn: number[]; // 0.75,1,1.5
    };
    cardboard: {
      thicknessIn: number; // 0.25
    };
  };

  nesting: {
    maxDepthForNestingCm: number;     // 15
    maxItemsPerBox: number;           // 5
    similarityTolerancePct: number;   // 10
    allowRotationDefault: boolean;    // true
  };

  protectionByFragility: Array<{
    fragility: 1 | 2 | 3 | 4 | 5;
    perimeterFoamIn: number;     // 0, 0.75, 1, 1.5
    betweenItemsFoamIn: number;  // 0..1.5
    cardboardIn: number;         // 0.25
    doublePerimeter: boolean;    // true en frag=5 (si quieres)
  }>;

  engineering: {
    thresholds: {
      use2x4IfWeightLbAbove: number;       // 120
      use2x4IfLongestSideInAbove: number;  // 72
      skidIfWeightLbAbove: number;         // 200
      skidIfLongestSideInAbove: number;    // 60
      addRibsIfLongestSideInAbove: number; // 72
      addXBracingIfAspectRatioAbove: number; // 2.2
    };

    plywoodThicknessByProfileIn: Record<CrateProfileKey, number>;

    // Reglas extra por perfil (MVP)
    profileDefaults: Record<CrateProfileKey, {
      minFragility: 1 | 2 | 3 | 4 | 5;
      ispm15Required: boolean;
      defaultLumber: "1x4" | "2x4";
      skidPreferred: boolean;
    }>;
  };

  pricing: {
    rounding: {
      stepUnits: number;   // 0.5
      mode: RoundingMode;  // UP
      hoursRule: HoursRoundingRule; // HALF_HOUR_UP
    };

    wastePctByMaterial: {
      plywood: number; // 0.10
      lumber: number;  // 0.10
      foam: number;    // 0.15
    };

    labor: {
      enabled: boolean;
      ratePerHour: number; // RD$
    };

    unitCosts: {
      currency: "RD$";
      lumberPerStick: Record<"1x4" | "2x4", number>;
      plywoodPerSheetByThicknessIn: Record<string, number>;
      foamPerSheetByThicknessIn: Record<string, number>;
      cardboardPerSheet: number;
    };

    markupPctByProfile: Record<CrateProfileKey, number>; // 0.25 etc
  };

  adders: {
    fumigation: {
      enabled: boolean;
      mode: FumigationMode;
      rate: number; // RD$ (según mode)
      transportToPlantEnabled: boolean;
      transportToPlantRate: number; // RD$ fijo (MVP)
      markingIppcEnabled: boolean;
      markingIppcRatePerBox: number; // RD$
    };

    fasteners: {
      enabled: boolean;
      mode: FastenersMode;
      // umbrales por volumen externo estimado (in^3) para clasificar caja
      boxVolumeThresholdsIn3: { smallMax: number; mediumMax: number };
      rateBySize: { small: number; medium: number; large: number }; // RD$ por caja
      ratePerSheet: number; // si mode PER_SHEET
    };

    cornerProtectors: {
      enabled: boolean;
      ratePerBox: number;
    };
  };
};

// -------------------- Zod (validación) --------------------
const Num = z.number().finite();

export const CrateSettingsSchema: z.ZodType<CrateSettings> = z.object({
  meta: z.object({
    versionId: z.string().min(1),
    updatedAt: z.string().min(1),
    updatedBy: z.string().optional(),
  }),

  materials: z.object({
    lumber: z.object({
      lengthsIn: z.array(Num.positive()).min(1),
      types: z.array(z.enum(["1x4", "2x4"])).min(1),
    }),
    plywood: z.object({
      sheetSizeIn: z.object({ w: Num.positive(), h: Num.positive() }),
      thicknessOptionsIn: z.array(Num.positive()).min(1),
    }),
    foam: z.object({
      sheetSizeIn: z.object({ w: Num.positive(), h: Num.positive() }),
      thicknessOptionsIn: z.array(Num.positive()).min(1),
    }),
    cardboard: z.object({
      thicknessIn: Num.nonnegative(),
    }),
  }),

  nesting: z.object({
    maxDepthForNestingCm: Num.positive(),
    maxItemsPerBox: Num.int().positive(),
    similarityTolerancePct: Num.min(0).max(100),
    allowRotationDefault: z.boolean(),
  }),

  protectionByFragility: z.array(
    z.object({
      fragility: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
      perimeterFoamIn: Num.nonnegative(),
      betweenItemsFoamIn: Num.nonnegative(),
      cardboardIn: Num.nonnegative(),
      doublePerimeter: z.boolean(),
    })
  ).length(5),

  engineering: z.object({
    thresholds: z.object({
      use2x4IfWeightLbAbove: Num.nonnegative(),
      use2x4IfLongestSideInAbove: Num.nonnegative(),
      skidIfWeightLbAbove: Num.nonnegative(),
      skidIfLongestSideInAbove: Num.nonnegative(),
      addRibsIfLongestSideInAbove: Num.nonnegative(),
      addXBracingIfAspectRatioAbove: Num.positive(),
    }),
    plywoodThicknessByProfileIn: z.record(z.string(), Num.positive()),
    profileDefaults: z.record(z.string(), z.object({
      minFragility: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
      ispm15Required: z.boolean(),
      defaultLumber: z.enum(["1x4", "2x4"]),
      skidPreferred: z.boolean(),
    })),
  }),

  pricing: z.object({
    rounding: z.object({
      stepUnits: Num.positive(),
      mode: z.literal("UP"),
      hoursRule: z.literal("HALF_HOUR_UP"),
    }),
    wastePctByMaterial: z.object({
      plywood: Num.min(0).max(1),
      lumber: Num.min(0).max(1),
      foam: Num.min(0).max(1),
    }),
    labor: z.object({
      enabled: z.boolean(),
      ratePerHour: Num.nonnegative(),
    }),
    unitCosts: z.object({
      currency: z.literal("RD$"),
      lumberPerStick: z.object({
        "1x4": Num.nonnegative(),
        "2x4": Num.nonnegative(),
      }),
      plywoodPerSheetByThicknessIn: z.record(z.string(), Num.nonnegative()),
      foamPerSheetByThicknessIn: z.record(z.string(), Num.nonnegative()),
      cardboardPerSheet: Num.nonnegative(),
    }),
    markupPctByProfile: z.record(z.string(), Num.min(0).max(5)),
  }),

  adders: z.object({
    fumigation: z.object({
      enabled: z.boolean(),
      mode: z.enum(["FIXED", "PER_M3", "PER_BOX"]),
      rate: Num.nonnegative(),
      transportToPlantEnabled: z.boolean(),
      transportToPlantRate: Num.nonnegative(),
      markingIppcEnabled: z.boolean(),
      markingIppcRatePerBox: Num.nonnegative(),
    }),
    fasteners: z.object({
      enabled: z.boolean(),
      mode: z.enum(["FIXED_PER_BOX", "PER_SHEET"]),
      boxVolumeThresholdsIn3: z.object({
        smallMax: Num.positive(),
        mediumMax: Num.positive(),
      }),
      rateBySize: z.object({
        small: Num.nonnegative(),
        medium: Num.nonnegative(),
        large: Num.nonnegative(),
      }),
      ratePerSheet: Num.nonnegative(),
    }),
    cornerProtectors: z.object({
      enabled: z.boolean(),
      ratePerBox: Num.nonnegative(),
    }),
  }),
});

// -------------------- Defaults --------------------
export function getDefaultCrateSettings(): CrateSettings {
  const versionId = uuid();
  return {
    meta: { versionId, updatedAt: nowIso(), updatedBy: "system" },

    materials: {
      lumber: { lengthsIn: [192], types: ["1x4", "2x4"] },
      plywood: { sheetSizeIn: { w: 48, h: 96 }, thicknessOptionsIn: [0.25, 0.375, 0.5] },
      foam: { sheetSizeIn: { w: 48, h: 96 }, thicknessOptionsIn: [0.75, 1.0, 1.5] },
      cardboard: { thicknessIn: 0.25 },
    },

    nesting: {
      maxDepthForNestingCm: 15,
      maxItemsPerBox: 5,
      similarityTolerancePct: 10,
      allowRotationDefault: true,
    },

    protectionByFragility: [
      { fragility: 1, perimeterFoamIn: 0,    betweenItemsFoamIn: 0,    cardboardIn: 0.25, doublePerimeter: false },
      { fragility: 2, perimeterFoamIn: 0.75, betweenItemsFoamIn: 0.75, cardboardIn: 0.25, doublePerimeter: false },
      { fragility: 3, perimeterFoamIn: 1.0,  betweenItemsFoamIn: 1.0,  cardboardIn: 0.25, doublePerimeter: false },
      { fragility: 4, perimeterFoamIn: 1.5,  betweenItemsFoamIn: 1.5,  cardboardIn: 0.25, doublePerimeter: false },
      { fragility: 5, perimeterFoamIn: 1.5,  betweenItemsFoamIn: 1.5,  cardboardIn: 0.25, doublePerimeter: true  },
    ],

    engineering: {
      thresholds: {
        use2x4IfWeightLbAbove: 120,
        use2x4IfLongestSideInAbove: 72,
        skidIfWeightLbAbove: 200,
        skidIfLongestSideInAbove: 60,
        addRibsIfLongestSideInAbove: 72,
        addXBracingIfAspectRatioAbove: 2.2,
      },

      plywoodThicknessByProfileIn: {
        STANDARD_LOCAL: 0.375,
        EXPORT_ISPM15: 0.5,
        PREMIUM_ART_IT: 0.5,
        MACHINERY_ISPM15: 0.5,
      },

      profileDefaults: {
        STANDARD_LOCAL:   { minFragility: 1, ispm15Required: false, defaultLumber: "1x4", skidPreferred: false },
        EXPORT_ISPM15:    { minFragility: 2, ispm15Required: true,  defaultLumber: "1x4", skidPreferred: false },
        PREMIUM_ART_IT:   { minFragility: 3, ispm15Required: false, defaultLumber: "1x4", skidPreferred: false },
        MACHINERY_ISPM15: { minFragility: 2, ispm15Required: true,  defaultLumber: "2x4", skidPreferred: true  },
      },
    },

    pricing: {
      rounding: { stepUnits: 0.5, mode: "UP", hoursRule: "HALF_HOUR_UP" },
      wastePctByMaterial: { plywood: 0.10, lumber: 0.10, foam: 0.15 },
      labor: { enabled: true, ratePerHour: 0 }, // RD$ (ponlo en config)
      unitCosts: {
        currency: "RD$",
        lumberPerStick: { "1x4": 0, "2x4": 0 },
        plywoodPerSheetByThicknessIn: { "0.25": 0, "0.375": 0, "0.5": 0 },
        foamPerSheetByThicknessIn: { "0.75": 0, "1": 0, "1.5": 0 },
        cardboardPerSheet: 0,
      },
      markupPctByProfile: {
        STANDARD_LOCAL: 0.25,
        EXPORT_ISPM15: 0.30,
        PREMIUM_ART_IT: 0.35,
        MACHINERY_ISPM15: 0.35,
      },
    },

    adders: {
      fumigation: {
        enabled: true,
        mode: "PER_M3",
        rate: 0,
        transportToPlantEnabled: true,
        transportToPlantRate: 0,
        markingIppcEnabled: true,
        markingIppcRatePerBox: 0,
      },
      fasteners: {
        enabled: true,
        mode: "FIXED_PER_BOX",
        boxVolumeThresholdsIn3: { smallMax: 12000, mediumMax: 32000 },
        rateBySize: { small: 0, medium: 0, large: 0 },
        ratePerSheet: 0,
      },
      cornerProtectors: {
        enabled: true,
        ratePerBox: 0,
      },
    },
  };
}

// -------------------- Storage API --------------------
function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export function loadCrateSettings(): CrateSettings {
  const raw = localStorage.getItem(LS_CURRENT);
  const parsed = safeParse<CrateSettings | null>(raw, null);
  if (!parsed) {
    const def = getDefaultCrateSettings();
    saveCrateSettings(def, "system");
    return def;
  }
  const res = CrateSettingsSchema.safeParse(parsed);
  if (!res.success) {
    const def = getDefaultCrateSettings();
    saveCrateSettings(def, "system");
    return def;
  }
  return res.data;
}

export function loadCrateSettingsHistory(): CrateSettings[] {
  return safeParse<CrateSettings[]>(localStorage.getItem(LS_HISTORY), []);
}

export function saveCrateSettings(next: CrateSettings, updatedBy?: string): CrateSettings {
  // versionado: nuevo versionId en cada guardado
  const withMeta: CrateSettings = {
    ...next,
    meta: {
      versionId: uuid(),
      updatedAt: nowIso(),
      updatedBy,
    },
  };

  const parsed = CrateSettingsSchema.safeParse(withMeta);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map(i => i.message).join(" | "));
  }

  localStorage.setItem(LS_CURRENT, JSON.stringify(parsed.data));

  const history = loadCrateSettingsHistory();
  localStorage.setItem(LS_HISTORY, JSON.stringify([parsed.data, ...history].slice(0, 30)));

  return parsed.data;
}

export function resetCrateSettings(updatedBy?: string): CrateSettings {
  const def = getDefaultCrateSettings();
  return saveCrateSettings(def, updatedBy ?? "system");
}
