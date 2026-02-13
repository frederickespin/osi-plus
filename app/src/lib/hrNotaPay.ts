import { NotaStatus } from '@/types/hr-nota-v2.types';
import type {
  NotaPayConfig,
  NotaPayCycle,
  NotaPayReport,
  NotaPayReportRow,
  NotaEvent,
  NotaEventType,
} from '@/types/hr-nota-v2.types';
import type { OSI, User } from '@/types/osi.types';
import type { HrNotaCatalogs } from '@/lib/hrNotaStorage';

const pad = (value: number) => String(value).padStart(2, '0');

const toDateString = (year: number, month: number, day: number) =>
  `${year}-${pad(month)}-${pad(day)}`;

const clampDay = (day: number, lastDay: number) => Math.min(Math.max(day, 1), lastDay);

export const getEffectiveDate = (event: NotaEvent, config: NotaPayConfig): string => {
  if (config.datePolicy === 'APPROVED_AT') {
    return event.approvedAt ?? event.registeredAt;
  }
  return event.registeredAt;
};

export const generateCyclesForMonth = (
  year: number,
  month: number,
  config: NotaPayConfig
): NotaPayCycle[] => {
  const lastDay = new Date(year, month, 0).getDate();
  const createdAt = new Date().toISOString();

  if (config.frequency === 1) {
    const rules = config.cutRules as {
      cutStartDay: number;
      cutEndDay: number;
      payDay: number;
    };
    const startDay = clampDay(rules.cutStartDay, lastDay);
    const endDay = clampDay(rules.cutEndDay, lastDay);
    const payDay = clampDay(rules.payDay, lastDay);
    const periodStart = toDateString(year, month, startDay);
    const periodEnd = toDateString(year, month, endDay < startDay ? lastDay : endDay);
    const payDate = toDateString(year, month, payDay);
    return [
      {
        id: `PAY-${year}-${pad(month)}-1`,
        label: `Corte ${startDay}-${endDay}`,
        periodStart,
        periodEnd,
        payDate,
        status: 'OPEN',
        createdAt,
      },
    ];
  }

  const rules = config.cutRules as {
    cut1StartDay: number;
    cut1EndDay: number;
    pay1Day: number;
    cut2StartDay: number;
    cut2EndDay: number;
    pay2Day: number;
    carryDaysBeyondEnd?: boolean;
  };
  const cut1Start = clampDay(rules.cut1StartDay, lastDay);
  const cut1End = clampDay(rules.cut1EndDay, lastDay);
  const pay1Day = clampDay(rules.pay1Day, lastDay);
  const cut2Start = clampDay(rules.cut2StartDay, lastDay);
  const cut2End = clampDay(rules.cut2EndDay, lastDay);
  const pay2Day = clampDay(rules.pay2Day, lastDay);

  return [
    {
      id: `PAY-${year}-${pad(month)}-1`,
      label: `Corte 1 (${cut1Start}-${cut1End})`,
      periodStart: toDateString(year, month, cut1Start),
      periodEnd: toDateString(year, month, cut1End < cut1Start ? lastDay : cut1End),
      payDate: toDateString(year, month, pay1Day),
      status: 'OPEN',
      createdAt,
    },
    {
      id: `PAY-${year}-${pad(month)}-2`,
      label: `Corte 2 (${cut2Start}-${cut2End})`,
      periodStart: toDateString(year, month, cut2Start),
      periodEnd: toDateString(year, month, cut2End < cut2Start ? lastDay : cut2End),
      payDate: toDateString(year, month, pay2Day),
      status: 'OPEN',
      createdAt,
    },
  ];
};

export const ensureCyclesForMonth = (
  year: number,
  month: number,
  config: NotaPayConfig,
  existing: NotaPayCycle[]
) => {
  const generated = generateCyclesForMonth(year, month, config);
  let changed = false;
  const allCycles = [...existing];
  const cyclesForMonth: NotaPayCycle[] = [];

  generated.forEach((cycle) => {
    const idx = allCycles.findIndex((c) => c.id === cycle.id);
    if (idx >= 0) {
      const current = allCycles[idx];
      const next =
        current.status === 'PAID'
          ? current
          : { ...current, label: cycle.label, periodStart: cycle.periodStart, periodEnd: cycle.periodEnd, payDate: cycle.payDate };
      allCycles[idx] = next;
      cyclesForMonth.push(next);
      if (next !== current) changed = true;
    } else {
      allCycles.push(cycle);
      cyclesForMonth.push(cycle);
      changed = true;
    }
  });

  return { cyclesForMonth, allCycles, changed };
};

export const recomputePayAssignments = (
  config: NotaPayConfig,
  osis: OSI[],
  cyclesForMonth: NotaPayCycle[],
  year: number,
  month: number
) => {
  let changed = false;

  const updatedOsis = osis.map((osi) => {
    const events = (osi.notaEvents || []).map((event) => {
      if (event.status === NotaStatus.LIQUIDADO) return event;
      if (event.status !== NotaStatus.REGISTRADO && event.status !== NotaStatus.APROBADO) return event;

      const effectiveDate = getEffectiveDate(event, config);
      const effDate = new Date(effectiveDate);
      const effYear = effDate.getFullYear();
      const effMonth = effDate.getMonth() + 1;

      if (effYear === year && effMonth === month) {
        const cycle = cyclesForMonth.find((c) => {
          const start = new Date(c.periodStart);
          const end = new Date(c.periodEnd);
          return effDate >= start && effDate <= end;
        });
        if (cycle) {
          const nextEvent = {
            ...event,
            effectiveDate,
            payCycleId: cycle.id,
            payConfigVersionApplied: config.version,
          };
          if (
            nextEvent.payCycleId !== event.payCycleId ||
            nextEvent.effectiveDate !== event.effectiveDate ||
            nextEvent.payConfigVersionApplied !== event.payConfigVersionApplied
          ) {
            changed = true;
          }
          return nextEvent;
        }
      }

      if (event.payConfigVersionApplied !== config.version) {
        changed = true;
        return {
          ...event,
          effectiveDate,
          payCycleId: undefined,
          payConfigVersionApplied: config.version,
        };
      }

      return event;
    });

    return { ...osi, notaEvents: events };
  });

  return { updatedOsis, changed };
};

export const buildPayReport = (
  cycle: NotaPayCycle,
  osis: OSI[],
  users: User[],
  catalogs: HrNotaCatalogs,
  config: NotaPayConfig
): NotaPayReport => {
  const rows: NotaPayReportRow[] = [];
  const userMap = new Map(users.map((u) => [u.id, u]));
  const eventTypeMap = new Map(catalogs.notaEventTypes.map((t) => [t.id, t]));

  osis.forEach((osi) => {
    (osi.notaEvents || []).forEach((event) => {
      if (event.payCycleId !== cycle.id) return;
      if (event.status !== NotaStatus.REGISTRADO && event.status !== NotaStatus.APROBADO && event.status !== NotaStatus.LIQUIDADO) {
        return;
      }
      const user = userMap.get(event.employeeId);
      const eventType: NotaEventType | undefined = eventTypeMap.get(event.eventTypeId);
      const detailBase = eventType?.name || event.eventTypeId;
      const detail = event.isExtra && event.reason ? `${detailBase} - Motivo: ${event.reason}` : detailBase;
      rows.push({
        employeeCode: user?.code || event.employeeId,
        employeeName: user?.fullName || user?.name || 'Sin nombre',
        osiCode: osi.code,
        date: event.effectiveDate,
        detail,
        amount: event.amountCalculated ?? event.amount ?? 0,
      });
    });
  });

  const totalsByEmployee = Array.from(
    rows.reduce((acc, row) => {
      const key = row.employeeCode;
      const current = acc.get(key) || { employeeCode: row.employeeCode, employeeName: row.employeeName, total: 0 };
      current.total += row.amount;
      acc.set(key, current);
      return acc;
    }, new Map<string, { employeeCode: string; employeeName: string; total: number }>())
  ).map(([, value]) => value);

  const grandTotal = totalsByEmployee.reduce((sum, item) => sum + item.total, 0);

  return {
    id: `REPORT-${cycle.id}-v${config.version}`,
    cycleId: cycle.id,
    configVersion: config.version,
    createdAt: new Date().toISOString(),
    rows,
    totalsByEmployee,
    grandTotal,
  };
};
