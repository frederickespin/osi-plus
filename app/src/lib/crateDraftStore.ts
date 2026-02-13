import { z } from "zod";

const LS_DRAFTS = "osi-plus.crateDrafts";
const LS_ACTIVE = "osi-plus.crateDraftActiveId";

const nowIso = () => new Date().toISOString();
const uuid = () => (crypto?.randomUUID ? crypto.randomUUID() : `id_${Date.now()}_${Math.random().toString(16).slice(2)}`);

export const CrateItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  qty: z.number().int().min(1),
  lengthCm: z.number().positive(),
  widthCm: z.number().positive(),
  heightCm: z.number().positive(),
  weightKg: z.number().nonnegative(),
  fragility: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  allowRotation: z.boolean(),
  stackable: z.boolean(),
  notes: z.string().optional(),
});

export type CrateItemInput = z.infer<typeof CrateItemSchema>;

const NestBoxSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["CONSOLIDATED", "INDIVIDUAL"]),
  itemCount: z.number().int().min(1),
  totalWeightKg: z.number().min(0),
  maxFragility: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  faceACm: z.number().positive(),
  faceBCm: z.number().positive(),
  depthCm: z.number().positive(),
  items: z.array(z.object({
    sourceItemId: z.string().min(1),
    name: z.string().min(1),
    weightKg: z.number().min(0),
    fragility: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    dimsCm: z.object({
      lengthCm: z.number().positive(),
      widthCm: z.number().positive(),
      heightCm: z.number().positive(),
    }),
    faceACm: z.number().positive(),
    faceBCm: z.number().positive(),
    depthCm: z.number().positive(),
  })),
});

const EngBoxSchema = NestBoxSchema.extend({
  profile: z.enum(["STANDARD_LOCAL", "EXPORT_ISPM15", "PREMIUM_ART_IT", "MACHINERY_ISPM15"]),
  paddingPerimeterCm: z.number().min(0),
  paddingBetweenCm: z.number().min(0),
  internalFinalCm: z.object({
    faceACm: z.number().positive(),
    faceBCm: z.number().positive(),
    depthCm: z.number().positive(),
  }),
  plywoodThicknessIn: z.number().positive(),
  lumberType: z.enum(["1x4", "2x4"]),
  skid: z.boolean(),
  ribs: z.boolean(),
  xBracing: z.boolean(),
  bomRaw: z.object({
    plywoodSheets: z.number().min(0),
    lumberSticks: z.number().min(0),
    foamSheets: z.number().min(0),
    cardboardSheets: z.number().min(0),
  }),
});

const CostBoxSchema = EngBoxSchema.extend({
  rounded: z.object({
    plywoodSheets: z.number().min(0),
    lumberSticks: z.number().min(0),
    foamSheets: z.number().min(0),
    cardboardSheets: z.number().min(0),
  }),
  costs: z.object({
    materials: z.number().min(0),
    labor: z.number().min(0),
    adders: z.number().min(0),
    totalCost: z.number().min(0),
    sellPrice: z.number().min(0),
  }),
  costBreakdown: z.record(z.string(), z.number().min(0)),
});

const CratePlanSchema = z.object({
  settingsVersionId: z.string().min(1),
  nesting: z.object({ boxes: z.array(NestBoxSchema) }).optional(),
  engineering: z.object({ boxes: z.array(EngBoxSchema) }).optional(),
  costing: z.object({
    boxes: z.array(CostBoxSchema),
    totals: z.object({
      materials: z.number().min(0),
      labor: z.number().min(0),
      adders: z.number().min(0),
      totalCost: z.number().min(0),
      sellPrice: z.number().min(0),
    }),
  }).optional(),
  overrides: z.object({
    profileByBoxId: z.record(z.string(), z.string()).optional(),
  }).optional(),
});

export const CrateDraftSchema = z.object({
  id: z.string().min(1),
  clientName: z.string().min(1),
  customerName: z.string().optional(),
  customerId: z.string().optional(),
  quoteId: z.string().optional(),
  proposalNumber: z.string().optional(),
  leadId: z.string().optional(),
  serviceType: z.string().optional(),
  origin: z.string().optional(),
  destination: z.string().optional(),
  items: z.array(CrateItemSchema),
  plan: CratePlanSchema.optional(),
  updatedAt: z.string().min(1),
});

export type CrateDraft = z.infer<typeof CrateDraftSchema>;

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export function loadCrateDrafts(): CrateDraft[] {
  const drafts = safeParse<CrateDraft[]>(localStorage.getItem(LS_DRAFTS), []);
  // filtra basura si algo viejo rompió el schema
  return drafts.filter(d => CrateDraftSchema.safeParse(d).success);
}

export function saveCrateDrafts(next: CrateDraft[]) {
  localStorage.setItem(LS_DRAFTS, JSON.stringify(next));
}

export function getActiveDraftId(): string | null {
  return localStorage.getItem(LS_ACTIVE);
}

export function setActiveDraftId(id: string) {
  localStorage.setItem(LS_ACTIVE, id);
}

export function createNewDraft(seed?: Partial<CrateDraft>): CrateDraft {
  const draft: CrateDraft = {
    id: uuid(),
    clientName: seed?.clientName || "",
    customerName: seed?.customerName,
    customerId: seed?.customerId,
    quoteId: seed?.quoteId,
    proposalNumber: seed?.proposalNumber,
    leadId: seed?.leadId,
    serviceType: seed?.serviceType,
    origin: seed?.origin,
    destination: seed?.destination,
    items: seed?.items || [],
    updatedAt: nowIso(),
  };

  const drafts = loadCrateDrafts();
  saveCrateDrafts([draft, ...drafts]);
  setActiveDraftId(draft.id);
  return draft;
}

export function loadActiveDraft(): CrateDraft {
  const drafts = loadCrateDrafts();
  const activeId = getActiveDraftId();
  const found = activeId ? drafts.find(d => d.id === activeId) : undefined;
  if (found) return found;

  // si no hay activo, crea uno vacío
  return createNewDraft({ clientName: "" });
}

export function upsertDraft(updated: CrateDraft): CrateDraft {
  const drafts = loadCrateDrafts();
  const next: CrateDraft[] = [
    { ...updated, updatedAt: nowIso() },
    ...drafts.filter(d => d.id !== updated.id),
  ];
  saveCrateDrafts(next);
  setActiveDraftId(updated.id);
  return next[0];
}

export function deleteDraft(id: string) {
  const drafts = loadCrateDrafts().filter(d => d.id !== id);
  saveCrateDrafts(drafts);
  const activeId = getActiveDraftId();
  if (activeId === id) {
    localStorage.removeItem(LS_ACTIVE);
    if (drafts[0]) setActiveDraftId(drafts[0].id);
  }
}

export function findDraftByProposal(proposalNumber: string): CrateDraft | undefined {
  return loadCrateDrafts().find((d) => d.proposalNumber === proposalNumber);
}

export function createDraftFromContext(ctx: {
  customerId?: string;
  customerName?: string;
  proposalNumber?: string;
  quoteId?: string;
  leadId?: string;
}) {
  const existing = ctx.proposalNumber ? findDraftByProposal(ctx.proposalNumber) : undefined;
  if (existing) {
    setActiveDraftId(existing.id);
    return existing;
  }
  return createNewDraft({
    clientName: ctx.customerName || "",
    customerName: ctx.customerName,
    customerId: ctx.customerId,
    quoteId: ctx.quoteId,
    proposalNumber: ctx.proposalNumber,
    leadId: ctx.leadId,
  });
}
