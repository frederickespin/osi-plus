import { NotaStatus, UnitType } from '@/types/hr-nota-v2.types';
import type {
  AllowanceRecord,
  AllowanceType,
  NotaPayConfig,
  NotaPayCycle,
  NotaPayReport,
  NotaEvent,
  NotaEventType,
  OsiNotaPlan,
  ShabType,
  BaseQualificationType,
} from '@/types/hr-nota-v2.types';
import type { OSI, UserRole } from '@/types/osi.types';
import { allowanceTypes, cbTypes, notaEventTypes, shabTypes } from '@/data/seeds-hr-nota-v2';
import { mockOSIs } from '@/data/mockData';

const CATALOGS_KEY = 'osi-plus.catalogs.hr-nota-v2';
const OSI_KEY = 'osi-plus.osi';
const OSI_ACTIVE_ID_KEY = 'osi-plus.osi.activeId';
const NOTA_EVENTS_KEY = 'osi-plus.notaEvents';
const ALLOWANCES_KEY = 'osi-plus.allowances';
const ALLOWANCE_ROLE_KEY = 'osi-plus.allowances.byRole';
const PAY_CONFIG_KEY = 'osi-plus.nota.payConfig';
const PAY_CYCLES_KEY = 'osi-plus.nota.payCycles';
const PAY_REPORTS_KEY = 'osi-plus.nota.payReports';

export type HrNotaCatalogs = {
  cbTypes: BaseQualificationType[];
  shabTypes: ShabType[];
  notaEventTypes: NotaEventType[];
  allowanceTypes: AllowanceType[];
};

export type AllowanceRoleConfig = Record<UserRole, Record<string, number>>;

const safeParse = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const migrateCatalogs = (stored: HrNotaCatalogs) => {
  let changed = false;
  const validCbIds = new Set(cbTypes.map((cb) => cb.id));

  const migratedEventTypes = stored.notaEventTypes.map((eventType) => {
    const legacyCategory = (eventType as NotaEventType & { categoryShab?: string }).categoryShab;
    let next: NotaEventType = eventType;

    if (!eventType.category && legacyCategory) {
      next = { ...next, category: legacyCategory };
      changed = true;
    }

    if (next.requiredCbTypeId && !validCbIds.has(next.requiredCbTypeId)) {
      next = { ...next, requiredCbTypeId: undefined, minGradeValue: undefined };
      changed = true;
    }

    return next;
  });

  const storedCb = stored.cbTypes || [];
  const cbOutdated =
    storedCb.length !== cbTypes.length ||
    storedCb.some((item, idx) => {
      const seed = cbTypes[idx];
      return (
        !seed ||
        item.id !== seed.id ||
        item.code !== seed.code ||
        item.name !== seed.name ||
        item.description !== seed.description
      );
    });

  if (cbOutdated) {
    changed = true;
  }

  return {
    catalogs: {
      ...stored,
      cbTypes: cbTypes.map((cb) => ({ ...cb })),
      notaEventTypes: migratedEventTypes,
    },
    changed,
  };
};

const mapLegacyNotaToEvents = (osi: OSI): NotaEvent[] => {
  const legacyList = (osi as unknown as { nota?: any[]; notas?: any[]; legacyNotas?: any[] }).nota ||
    (osi as unknown as { nota?: any[]; notas?: any[]; legacyNotas?: any[] }).notas ||
    (osi as unknown as { nota?: any[]; notas?: any[]; legacyNotas?: any[] }).legacyNotas ||
    [];
  if (!Array.isArray(legacyList) || legacyList.length === 0) return [];
  return legacyList.map((item, index) => ({
    id: `LEGACY-${osi.id}-${index}`,
    osiId: osi.id,
    eventTypeId: 'LEGACY_MISC',
    employeeId: item?.employeeId || 'UNKNOWN',
    createdBy: 'LEGACY',
    createdAt: new Date().toISOString(),
    registeredAt: new Date().toISOString(),
    qtyActual: Number(item?.qty || 1),
    unit: (item?.unit as UnitType) || UnitType.EVENTO,
    amountCalculated: Number(item?.amount || 0),
    amount: Number(item?.amount || 0),
    status: NotaStatus.APROBADO,
    isExtra: false,
    reason: item?.description || 'Legacy NOTA',
    effectiveDate: new Date().toISOString(),
  }));
};

export const migrateOsisToV2 = (osis: OSI[]) => {
  let changed = false;
  const migrated = osis.map((osi) => {
    let next: OSI = { ...osi };

    if (Array.isArray(next.osiNotaPlan)) {
      next.osiNotaPlan = next.osiNotaPlan[0];
      changed = true;
    }

    if (next.osiNotaPlan) {
      next.osiNotaPlan = {
        ...next.osiNotaPlan,
        items: next.osiNotaPlan.items.map((item) => ({
          ...item,
          qtyEstimated: (item as unknown as { qty?: number }).qty ?? item.qtyEstimated ?? 1,
        })),
      };
    }

    if (!Array.isArray(next.allowances)) {
      next.allowances = [];
      changed = true;
    }

    if (!Array.isArray(next.notaEvents)) {
      const mapped = mapLegacyNotaToEvents(next);
      next.notaEvents = mapped;
      if (mapped.length > 0) changed = true;
      if (mapped.length === 0) {
        changed = true;
      }
    }

    if (Array.isArray(next.notaEvents)) {
      next.notaEvents = next.notaEvents.map((event) => {
        const registeredAt = event.registeredAt || event.createdAt || new Date().toISOString();
        const amountCalculated = (event as unknown as { amountCalculated?: number }).amountCalculated ??
          (event as unknown as { amount?: number }).amount ??
          0;
        const qtyActual = (event as unknown as { qtyActual?: number }).qtyActual ??
          (event as unknown as { qty?: number }).qty ??
          1;
        const status = event.status === NotaStatus.PAGADO ? NotaStatus.LIQUIDADO : event.status;
        const normalized: NotaEvent = {
          ...event,
          employeeId: event.employeeId || 'UNKNOWN',
          registeredAt,
          qtyActual,
          amountCalculated,
          amount: (event as unknown as { amount?: number }).amount ?? amountCalculated,
          status,
          effectiveDate: event.effectiveDate || registeredAt,
          payConfigVersionApplied: event.payConfigVersionApplied,
        };
        if (
          normalized.employeeId !== event.employeeId ||
          normalized.registeredAt !== event.registeredAt ||
          normalized.qtyActual !== (event as unknown as { qtyActual?: number }).qtyActual ||
          normalized.amountCalculated !== (event as unknown as { amountCalculated?: number }).amountCalculated ||
          normalized.status !== event.status ||
          normalized.effectiveDate !== event.effectiveDate
        ) {
          changed = true;
        }
        return normalized;
      });
    }

    return next;
  });

  return { migrated, changed };
};

export const loadCatalogs = (): HrNotaCatalogs => {
  if (typeof window === 'undefined') {
    return { cbTypes, shabTypes, notaEventTypes, allowanceTypes };
  }
  const stored = safeParse<HrNotaCatalogs | null>(
    window.localStorage.getItem(CATALOGS_KEY),
    null
  );
  if (stored && stored.cbTypes && stored.shabTypes && stored.notaEventTypes && stored.allowanceTypes) {
    const { catalogs: migrated, changed } = migrateCatalogs(stored);
    if (changed) {
      window.localStorage.setItem(CATALOGS_KEY, JSON.stringify(migrated));
      return migrated;
    }
    return migrated;
  }
  const seeded = { cbTypes, shabTypes, notaEventTypes, allowanceTypes };
  window.localStorage.setItem(CATALOGS_KEY, JSON.stringify(seeded));
  return seeded;
};

export const saveCatalogs = (catalogs: HrNotaCatalogs) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CATALOGS_KEY, JSON.stringify(catalogs));
};

export const loadOsi = (): OSI[] => {
  if (typeof window === 'undefined') return mockOSIs;
  const stored = safeParse<OSI[]>(window.localStorage.getItem(OSI_KEY), []);
  const base = stored.length ? stored : mockOSIs;
  const { migrated, changed } = migrateOsisToV2(base);
  if (changed) window.localStorage.setItem(OSI_KEY, JSON.stringify(migrated));
  if (!stored.length) window.localStorage.setItem(OSI_KEY, JSON.stringify(migrated));
  return migrated;
};

export const saveOsi = (osis: OSI[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(OSI_KEY, JSON.stringify(osis));
};

export const getActiveOsiId = (): string | null => {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(OSI_ACTIVE_ID_KEY);
};

export const setActiveOsiId = (osiId: string) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(OSI_ACTIVE_ID_KEY, osiId);
};

export const loadNotaEvents = (): NotaEvent[] => {
  if (typeof window === 'undefined') return [];
  return safeParse<NotaEvent[]>(window.localStorage.getItem(NOTA_EVENTS_KEY), []);
};

export const saveNotaEvents = (events: NotaEvent[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(NOTA_EVENTS_KEY, JSON.stringify(events));
};

export const loadAllowances = (): AllowanceRecord[] => {
  if (typeof window === 'undefined') return [];
  return safeParse<AllowanceRecord[]>(window.localStorage.getItem(ALLOWANCES_KEY), []);
};

export const saveAllowances = (records: AllowanceRecord[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ALLOWANCES_KEY, JSON.stringify(records));
};

export const loadAllowanceRoleConfig = (): AllowanceRoleConfig => {
  if (typeof window === 'undefined') return {} as AllowanceRoleConfig;
  return safeParse<AllowanceRoleConfig>(window.localStorage.getItem(ALLOWANCE_ROLE_KEY), {} as AllowanceRoleConfig);
};

export const saveAllowanceRoleConfig = (config: AllowanceRoleConfig) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ALLOWANCE_ROLE_KEY, JSON.stringify(config));
};

export const loadPayConfig = (): NotaPayConfig => {
  if (typeof window === 'undefined') {
    return {
      id: 'PAYCFG-1',
      accountingEmail: '',
      frequency: 2,
      timezone: 'America/Santo_Domingo',
      datePolicy: 'REGISTERED_AT',
      cutRules: {
        cut1StartDay: 1,
        cut1EndDay: 15,
        pay1Day: 15,
        cut2StartDay: 16,
        cut2EndDay: 30,
        pay2Day: 30,
        carryDaysBeyondEnd: true,
      },
      version: 1,
      createdBy: 'A',
      createdAt: new Date().toISOString(),
    };
  }
  const stored = safeParse<NotaPayConfig | null>(window.localStorage.getItem(PAY_CONFIG_KEY), null);
  if (stored) return stored;
  const seeded: NotaPayConfig = {
    id: 'PAYCFG-1',
    accountingEmail: '',
    frequency: 2,
    timezone: 'America/Santo_Domingo',
    datePolicy: 'REGISTERED_AT',
    cutRules: {
      cut1StartDay: 1,
      cut1EndDay: 15,
      pay1Day: 15,
      cut2StartDay: 16,
      cut2EndDay: 30,
      pay2Day: 30,
      carryDaysBeyondEnd: true,
    },
    version: 1,
    createdBy: 'A',
    createdAt: new Date().toISOString(),
  };
  window.localStorage.setItem(PAY_CONFIG_KEY, JSON.stringify(seeded));
  return seeded;
};

export const savePayConfig = (config: NotaPayConfig) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PAY_CONFIG_KEY, JSON.stringify(config));
};

export const loadPayCycles = (): NotaPayCycle[] => {
  if (typeof window === 'undefined') return [];
  return safeParse<NotaPayCycle[]>(window.localStorage.getItem(PAY_CYCLES_KEY), []);
};

export const savePayCycles = (cycles: NotaPayCycle[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PAY_CYCLES_KEY, JSON.stringify(cycles));
};

export const loadPayReports = (): NotaPayReport[] => {
  if (typeof window === 'undefined') return [];
  return safeParse<NotaPayReport[]>(window.localStorage.getItem(PAY_REPORTS_KEY), []);
};

export const savePayReports = (reports: NotaPayReport[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PAY_REPORTS_KEY, JSON.stringify(reports));
};

// Helpers to embed plan data in OSI without duplicating storage
export const updateOsiNotaPlan = (osiId: string, plan: OsiNotaPlan) => {
  const osis = loadOsi().map((osi) =>
    osi.id === osiId ? { ...osi, osiNotaPlan: plan } : osi
  );
  saveOsi(osis);
};
