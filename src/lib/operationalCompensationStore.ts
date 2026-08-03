export type OperationalCompensationFamily = "OPERATIONAL_ASSIGNMENT" | "PAYABLE_COMPETENCY";

export type OperationalCompensationGroup =
  | "DIET"
  | "VIATICOS"
  | "LODGING"
  | "TRANSPORT"
  | "SCHEDULE"
  | "TECHNICAL_COMPETENCY"
  | "SUPERVISION";

export type OperationalCompensationProfile =
  | "ALL"
  | "SUPERVISOR"
  | "SUPERVISOR_SUBSTITUTE"
  | "DRIVER"
  | "OPERATIVE";

export type OperationalCompensationUnit = "DAY" | "EVENT" | "HOUR" | "UNIT" | "FLOOR" | "KM";
export type OperationalCompensationSettlement = "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY";
export type OperationalClientBillingMode = "NOT_APPLICABLE" | "INCLUDED" | "EXTRA";

export type OperationalCompensationGroupAdjustment = {
  group: OperationalCompensationGroup;
  label: string;
  adjustmentPct: number;
  active: boolean;
  effectiveFrom?: string;
  notes?: string;
  updatedAt: string;
};

export type OperationalCompensationRule = {
  id: string;
  active: boolean;
  code: string;
  name: string;
  family: OperationalCompensationFamily;
  group: OperationalCompensationGroup;
  profile: OperationalCompensationProfile;
  unit: OperationalCompensationUnit;
  settlement: OperationalCompensationSettlement;
  baseAmount: number;
  currency: "DOP";
  clientBillingMode: OperationalClientBillingMode;
  /** @deprecated Compatibilidad con configuraciones anteriores. */
  taxableToClient: boolean;
  requiresEmployeeAuthorization: boolean;
  deliveryPolicy: "TEAM_LEADER" | "DIRECT_EMPLOYEE" | "OPERATIONS";
  notes?: string;
  updatedAt: string;
};

export type OperationalCompensationStorePayload = {
  version: number;
  policy: OperationalCompensationPolicy;
  groupAdjustments: OperationalCompensationGroupAdjustment[];
  rules: OperationalCompensationRule[];
};

export type OperationalCompensationPolicy = {
  regularWorkdayEndHour: number;
  dinnerStartHour: number;
  transportStartHour: number;
  saturdayOvertimeStartHour: number;
  metroAdjustmentPct: number;
  interiorAdjustmentPct: number;
};

const STORAGE_KEY = "osi.logistic-engine-admin.operational-compensations.v1";
const STORAGE_VERSION = 4;

const nowIso = () => new Date().toISOString();

const GROUP_LABELS: Record<OperationalCompensationGroup, string> = {
  DIET: "Dietas",
  VIATICOS: "Viaticos",
  LODGING: "Hospedaje",
  TRANSPORT: "Transporte",
  SCHEDULE: "Horario y fines de semana",
  TECHNICAL_COMPETENCY: "Competencias tecnicas",
  SUPERVISION: "Supervision",
};

const PROFILE_LABELS: Record<OperationalCompensationProfile, string> = {
  ALL: "Todos",
  SUPERVISOR: "Supervisor",
  SUPERVISOR_SUBSTITUTE: "Suplente supervisor",
  DRIVER: "Chofer",
  OPERATIVE: "Operativo",
};

const toNumber = (value: unknown, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

const uid = (prefix: string) =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function makeAdjustment(
  group: OperationalCompensationGroup,
  patch: Partial<OperationalCompensationGroupAdjustment> = {},
): OperationalCompensationGroupAdjustment {
  return {
    group,
    label: GROUP_LABELS[group],
    adjustmentPct: toNumber(patch.adjustmentPct, 0),
    active: patch.active !== false,
    effectiveFrom: patch.effectiveFrom || "",
    notes: patch.notes || "",
    updatedAt: patch.updatedAt || nowIso(),
  };
}

function makeRule(
  rule: Omit<OperationalCompensationRule, "updatedAt" | "clientBillingMode"> & {
    updatedAt?: string;
    clientBillingMode?: OperationalClientBillingMode;
  },
): OperationalCompensationRule {
  const clientBillingMode =
    rule.clientBillingMode ||
    (rule.taxableToClient === true ? "EXTRA" : "NOT_APPLICABLE");
  return {
    ...rule,
    active: rule.active !== false,
    code: String(rule.code || "").trim().toUpperCase(),
    name: String(rule.name || "").trim(),
    baseAmount: Math.max(0, toNumber(rule.baseAmount)),
    clientBillingMode,
    taxableToClient: clientBillingMode === "EXTRA",
    requiresEmployeeAuthorization: rule.requiresEmployeeAuthorization !== false,
    updatedAt: rule.updatedAt || nowIso(),
  };
}

function makePolicy(patch: Partial<OperationalCompensationPolicy> = {}): OperationalCompensationPolicy {
  return {
    regularWorkdayEndHour: toNumber(patch.regularWorkdayEndHour, 17),
    dinnerStartHour: toNumber(patch.dinnerStartHour, 19),
    transportStartHour: toNumber(patch.transportStartHour, 20),
    saturdayOvertimeStartHour: toNumber(patch.saturdayOvertimeStartHour, 12),
    metroAdjustmentPct: toNumber(patch.metroAdjustmentPct, 0),
    interiorAdjustmentPct: toNumber(patch.interiorAdjustmentPct, 10),
  };
}

function makeDietRules(): OperationalCompensationRule[] {
  const meals = [
    { code: "DESAYUNO", name: "Desayuno", baseAmount: 8 },
    { code: "COMIDA", name: "Comida", baseAmount: 12 },
    { code: "CENA", name: "Cena", baseAmount: 12 },
  ];
  const profiles: OperationalCompensationProfile[] = ["SUPERVISOR", "SUPERVISOR_SUBSTITUTE", "DRIVER", "OPERATIVE"];

  return meals.flatMap((meal) =>
    profiles.map((profile) =>
      makeRule({
        id: `diet-${meal.code.toLowerCase()}-${profile.toLowerCase()}`,
        active: true,
        code: `DIETA_${meal.code}_${profile}`,
        name: meal.name,
        family: "OPERATIONAL_ASSIGNMENT",
        group: "DIET",
        profile,
        unit: "DAY",
        settlement: "DAILY",
        baseAmount: meal.baseAmount,
        currency: "DOP",
        taxableToClient: false,
        requiresEmployeeAuthorization: true,
        deliveryPolicy: "TEAM_LEADER",
        notes: `Dieta de ${meal.name.toLowerCase()} para ${PROFILE_LABELS[profile]}.`,
      }),
    ),
  );
}

export function createDefaultOperationalCompensationStore(): OperationalCompensationStorePayload {
  const groupAdjustments = (Object.keys(GROUP_LABELS) as OperationalCompensationGroup[]).map((group) => makeAdjustment(group));
  const rules: OperationalCompensationRule[] = [
    ...makeDietRules(),
    makeRule({
      id: "assignment-viaticos-all",
      active: true,
      code: "VIATICOS",
      name: "Viaticos",
      family: "OPERATIONAL_ASSIGNMENT",
      group: "VIATICOS",
      profile: "ALL",
      unit: "DAY",
      settlement: "DAILY",
      baseAmount: 25,
      currency: "DOP",
      taxableToClient: false,
      requiresEmployeeAuthorization: true,
      deliveryPolicy: "TEAM_LEADER",
      notes: "Asignacion especial no cubierta por dieta, hospedaje o transporte.",
    }),
    makeRule({
      id: "assignment-lodging-all",
      active: true,
      code: "HOSPEDAJE",
      name: "Hospedaje",
      family: "OPERATIONAL_ASSIGNMENT",
      group: "LODGING",
      profile: "ALL",
      unit: "DAY",
      settlement: "DAILY",
      baseAmount: 45,
      currency: "DOP",
      taxableToClient: false,
      requiresEmployeeAuthorization: true,
      deliveryPolicy: "TEAM_LEADER",
    }),
    makeRule({
      id: "assignment-transport-all",
      active: true,
      code: "TRANSPORTE_PERSONAL",
      name: "Transporte de personal",
      family: "OPERATIONAL_ASSIGNMENT",
      group: "TRANSPORT",
      profile: "ALL",
      unit: "EVENT",
      settlement: "DAILY",
      baseAmount: 15,
      currency: "DOP",
      taxableToClient: false,
      requiresEmployeeAuthorization: true,
      deliveryPolicy: "TEAM_LEADER",
    }),
    makeRule({
      id: "assignment-crate-fumigation",
      active: true,
      code: "FUMIGACION_CAJAS",
      name: "Asignación por fumigación de cajas",
      family: "OPERATIONAL_ASSIGNMENT",
      group: "TRANSPORT",
      profile: "DRIVER",
      unit: "EVENT",
      settlement: "DAILY",
      baseAmount: 0,
      currency: "DOP",
      taxableToClient: false,
      requiresEmployeeAuthorization: true,
      deliveryPolicy: "DIRECT_EMPLOYEE",
      notes: "Asignación al empleado que lleva y gestiona el lote de cajas en la planta de fumigación.",
    }),
    ...(["SUPERVISOR", "SUPERVISOR_SUBSTITUTE", "DRIVER", "OPERATIVE"] as OperationalCompensationProfile[]).map(
      (profile) =>
        makeRule({
          id: `schedule-overtime-${profile.toLowerCase()}`,
          active: true,
          code: `HORAS_EXTRA_${profile}`,
          name: "Horas extras",
          family: "OPERATIONAL_ASSIGNMENT",
          group: "SCHEDULE",
          profile,
          unit: "HOUR",
          settlement: "BIWEEKLY",
          baseAmount: 0,
          currency: "DOP",
          taxableToClient: false,
          requiresEmployeeAuthorization: true,
          deliveryPolicy: "DIRECT_EMPLOYEE",
          notes: `Monto por hora extra para ${PROFILE_LABELS[profile]}. Debe configurarse antes de usarlo.`,
        }),
    ),
    makeRule({
      id: "schedule-sunday-all",
      active: true,
      code: "DOMINGO",
      name: "Asignación de domingo",
      family: "OPERATIONAL_ASSIGNMENT",
      group: "SCHEDULE",
      profile: "ALL",
      unit: "DAY",
      settlement: "BIWEEKLY",
      baseAmount: 0,
      currency: "DOP",
      taxableToClient: false,
      requiresEmployeeAuthorization: true,
      deliveryPolicy: "DIRECT_EMPLOYEE",
      notes: "Monto específico por empleado y domingo trabajado. Debe configurarse antes de usarlo.",
    }),
    makeRule({
      id: "skill-installation",
      active: true,
      code: "INSTALADOR",
      name: "Instalador",
      family: "PAYABLE_COMPETENCY",
      group: "TECHNICAL_COMPETENCY",
      profile: "OPERATIVE",
      unit: "EVENT",
      settlement: "BIWEEKLY",
      baseAmount: 40,
      currency: "DOP",
      taxableToClient: true,
      requiresEmployeeAuthorization: true,
      deliveryPolicy: "DIRECT_EMPLOYEE",
    }),
    makeRule({
      id: "skill-crane-assistant",
      active: true,
      code: "AUXILIAR_GRUA",
      name: "Auxiliar de grua",
      family: "PAYABLE_COMPETENCY",
      group: "TECHNICAL_COMPETENCY",
      profile: "OPERATIVE",
      unit: "EVENT",
      settlement: "BIWEEKLY",
      baseAmount: 30,
      currency: "DOP",
      taxableToClient: true,
      requiresEmployeeAuthorization: true,
      deliveryPolicy: "DIRECT_EMPLOYEE",
    }),
    makeRule({
      id: "skill-heavy-stairs",
      active: true,
      code: "BAJADA_PESADA_ESCALERA",
      name: "Stair Carry — tarifa por piso",
      family: "PAYABLE_COMPETENCY",
      group: "TECHNICAL_COMPETENCY",
      profile: "OPERATIVE",
      unit: "FLOOR",
      settlement: "BIWEEKLY",
      baseAmount: 30,
      currency: "DOP",
      taxableToClient: true,
      requiresEmployeeAuthorization: true,
      deliveryPolicy: "DIRECT_EMPLOYEE",
      notes: "Aplica por cada piso utilizado después del segundo piso incluido.",
    }),
    makeRule({
      id: "skill-furniture-rigging",
      active: true,
      code: "VOLADURA_MOBILIARIO",
      name: "Voladura de mobiliario",
      family: "PAYABLE_COMPETENCY",
      group: "TECHNICAL_COMPETENCY",
      profile: "OPERATIVE",
      unit: "EVENT",
      settlement: "BIWEEKLY",
      baseAmount: 30,
      currency: "DOP",
      taxableToClient: true,
      requiresEmployeeAuthorization: true,
      deliveryPolicy: "DIRECT_EMPLOYEE",
    }),
    makeRule({
      id: "skill-carpentry",
      active: true,
      code: "CARPINTERIA",
      name: "Carpinteria",
      family: "PAYABLE_COMPETENCY",
      group: "TECHNICAL_COMPETENCY",
      profile: "OPERATIVE",
      unit: "UNIT",
      settlement: "BIWEEKLY",
      baseAmount: 25,
      currency: "DOP",
      taxableToClient: true,
      requiresEmployeeAuthorization: true,
      deliveryPolicy: "DIRECT_EMPLOYEE",
    }),
    makeRule({
      id: "skill-company-maintenance",
      active: true,
      code: "MANTENIMIENTO_EMPRESA",
      name: "Mantenimiento en empresa",
      family: "PAYABLE_COMPETENCY",
      group: "TECHNICAL_COMPETENCY",
      profile: "OPERATIVE",
      unit: "HOUR",
      settlement: "BIWEEKLY",
      baseAmount: 18,
      currency: "DOP",
      taxableToClient: false,
      requiresEmployeeAuthorization: true,
      deliveryPolicy: "DIRECT_EMPLOYEE",
    }),
    makeRule({
      id: "skill-mechanical-maintenance",
      active: true,
      code: "MANTENIMIENTO_MECANICO",
      name: "Mantenimiento mecanico",
      family: "PAYABLE_COMPETENCY",
      group: "TECHNICAL_COMPETENCY",
      profile: "OPERATIVE",
      unit: "HOUR",
      settlement: "BIWEEKLY",
      baseAmount: 45,
      currency: "DOP",
      taxableToClient: false,
      requiresEmployeeAuthorization: true,
      deliveryPolicy: "DIRECT_EMPLOYEE",
    }),
    makeRule({
      id: "supervision-substitute",
      active: true,
      code: "SUPLENTE_SUPERVISOR",
      name: "Suplente supervisor",
      family: "PAYABLE_COMPETENCY",
      group: "SUPERVISION",
      profile: "SUPERVISOR_SUBSTITUTE",
      unit: "DAY",
      settlement: "BIWEEKLY",
      baseAmount: 25,
      currency: "DOP",
      taxableToClient: false,
      requiresEmployeeAuthorization: true,
      deliveryPolicy: "DIRECT_EMPLOYEE",
    }),
  ];

  return { version: STORAGE_VERSION, policy: makePolicy(), groupAdjustments, rules };
}

export function normalizeOperationalCompensationStore(
  payload: Partial<OperationalCompensationStorePayload> | null | undefined,
): OperationalCompensationStorePayload {
  const fallback = createDefaultOperationalCompensationStore();
  const storedVersion = Math.max(0, Number(payload?.version || 0));
  const storedAdjustments = Array.isArray(payload?.groupAdjustments) ? payload.groupAdjustments : [];
  const adjustmentMap = new Map(storedAdjustments.map((item) => [item.group, item]));
  const groupAdjustments = fallback.groupAdjustments.map((item) => makeAdjustment(item.group, adjustmentMap.get(item.group) || item));

  const storedRules = Array.isArray(payload?.rules) ? payload.rules : [];
  const storedById = new Map(storedRules.map((rule) => [rule.id, rule]));
  const mergedDefaults = fallback.rules.map((rule) => {
    const storedRule = storedById.get(rule.id);
    const merged = makeRule({
      ...rule,
      ...(storedRule || {}),
      clientBillingMode:
        storedVersion < 4 && storedRule
          ? storedRule.taxableToClient === true
            ? "EXTRA"
            : "NOT_APPLICABLE"
          : storedRule?.clientBillingMode || rule.clientBillingMode,
    });
    if (storedVersion < 3 && merged.id === "skill-heavy-stairs") {
      return makeRule({
        ...merged,
        name: "Stair Carry — tarifa por piso",
        unit: "FLOOR",
        notes: merged.notes || "Aplica por cada piso utilizado después del segundo piso incluido.",
      });
    }
    return merged;
  });
  const customRules = storedRules
    .filter((rule) => !fallback.rules.some((fallbackRule) => fallbackRule.id === rule.id))
    .map((rule) => makeRule(rule));

  return {
    version: STORAGE_VERSION,
    policy: makePolicy(payload?.policy),
    groupAdjustments,
    rules: [...mergedDefaults, ...customRules],
  };
}

export function loadOperationalCompensationStore(): OperationalCompensationStorePayload {
  if (typeof window === "undefined" || !window.localStorage) return createDefaultOperationalCompensationStore();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultOperationalCompensationStore();
    return normalizeOperationalCompensationStore(JSON.parse(raw) as Partial<OperationalCompensationStorePayload>);
  } catch {
    return createDefaultOperationalCompensationStore();
  }
}

export function saveOperationalCompensationStore(
  payload: OperationalCompensationStorePayload,
): OperationalCompensationStorePayload {
  const normalized = normalizeOperationalCompensationStore({
    version: STORAGE_VERSION,
    policy: payload.policy,
    groupAdjustments: payload.groupAdjustments.map((item) => ({ ...item, updatedAt: nowIso() })),
    rules: payload.rules.map((rule) => ({ ...rule, updatedAt: nowIso() })),
  });
  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  }
  return normalized;
}

export function createOperationalCompensationRule(
  partial: Partial<OperationalCompensationRule> = {},
): OperationalCompensationRule {
  return makeRule({
    id: uid("comp"),
    active: true,
    code: partial.code || "NUEVO_CONCEPTO",
    name: partial.name || "Nuevo concepto",
    family: partial.family || "OPERATIONAL_ASSIGNMENT",
    group: partial.group || "DIET",
    profile: partial.profile || "ALL",
    unit: partial.unit || "EVENT",
    settlement: partial.settlement || "DAILY",
    baseAmount: partial.baseAmount || 0,
    currency: "DOP",
    taxableToClient: partial.taxableToClient === true,
    clientBillingMode:
      partial.clientBillingMode ||
      (partial.taxableToClient === true ? "EXTRA" : "NOT_APPLICABLE"),
    requiresEmployeeAuthorization: partial.requiresEmployeeAuthorization !== false,
    deliveryPolicy: partial.deliveryPolicy || "TEAM_LEADER",
    notes: partial.notes || "",
  });
}

export function resolveOperationalCompensationAmount(
  rule: OperationalCompensationRule,
  adjustments: OperationalCompensationGroupAdjustment[],
  zoneAdjustmentPct = 0,
) {
  const adjustment = adjustments.find((item) => item.group === rule.group && item.active);
  const pct = adjustment ? toNumber(adjustment.adjustmentPct) : 0;
  return Math.round(rule.baseAmount * (1 + pct / 100) * (1 + toNumber(zoneAdjustmentPct) / 100) * 100) / 100;
}

export function resolveOperationalClientChargeRule(
  store: OperationalCompensationStorePayload | null | undefined,
  aliases: string[],
) {
  const normalizedAliases = aliases.map((value) => String(value || "").trim().toUpperCase());
  const eligible = (store?.rules || []).filter(
    (rule) =>
      rule.active &&
      rule.clientBillingMode === "EXTRA" &&
      rule.unit === "FLOOR" &&
      resolveOperationalCompensationAmount(rule, store?.groupAdjustments || []) > 0,
  );
  const exact =
    eligible.find((rule) => normalizedAliases.includes(rule.code.toUpperCase())) ||
    eligible.find((rule) => {
      const searchable = `${rule.code} ${rule.name}`.toUpperCase();
      return normalizedAliases.some((alias) => searchable.includes(alias));
    });
  if (!exact) return null;
  return {
    rule: exact,
    rate: resolveOperationalCompensationAmount(exact, store?.groupAdjustments || []),
  };
}

export const operationalCompensationLabels = {
  family: {
    OPERATIONAL_ASSIGNMENT: "Asignacion operativa",
    PAYABLE_COMPETENCY: "Competencia pagable",
  } satisfies Record<OperationalCompensationFamily, string>,
  group: GROUP_LABELS,
  profile: PROFILE_LABELS,
  unit: {
    DAY: "Dia",
    EVENT: "Evento",
    HOUR: "Hora",
    UNIT: "Unidad",
    FLOOR: "Piso",
    KM: "Km",
  } satisfies Record<OperationalCompensationUnit, string>,
  settlement: {
    DAILY: "Diaria",
    WEEKLY: "Semanal",
    BIWEEKLY: "Quincenal",
    MONTHLY: "Mensual",
  } satisfies Record<OperationalCompensationSettlement, string>,
  deliveryPolicy: {
    TEAM_LEADER: "Lider del equipo",
    DIRECT_EMPLOYEE: "Empleado directo",
    OPERATIONS: "Operaciones",
  } satisfies Record<OperationalCompensationRule["deliveryPolicy"], string>,
  clientBillingMode: {
    NOT_APPLICABLE: "No se cobra",
    INCLUDED: "Incluido",
    EXTRA: "Extra",
  } satisfies Record<OperationalClientBillingMode, string>,
};
