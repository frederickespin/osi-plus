import { NotaStatus, UnitType, gradeToValue } from '@/types/hr-nota-v2.types';
import type {
  EmployeeBaseQualification,
  EmployeeMetrics,
  NotaEvent,
  NotaEventType,
  OsiNotaPlan,
} from '@/types/hr-nota-v2.types';
import type { User } from '@/types/osi.types';
import type { HrNotaCatalogs } from '@/lib/hrNotaStorage';

export const isEligibleForEvent = (
  user: User,
  eventType: NotaEventType,
  _catalogs: HrNotaCatalogs
): boolean => {
  const baseQualifications: EmployeeBaseQualification[] = user.baseQualifications || [];
  const shab = user.shab || [];

  if (eventType.requiredCbTypeId) {
    const cb = baseQualifications.find((bq) => bq.baseTypeId === eventType.requiredCbTypeId);
    if (!cb) return false;
    const gradeValue = gradeToValue(cb.grade);
    if ((eventType.minGradeValue ?? 0) > gradeValue) return false;
  }

  if (eventType.requiredShabCode) {
    const hasShab = shab.some((s) => s.shabCode === eventType.requiredShabCode && s.active);
    if (!hasShab) return false;
  }

  return true;
};

export const calcAmount = (
  eventType: NotaEventType,
  qty: number,
  options?: { size?: number; weight?: number }
): number => {
  const base = eventType.baseRate * qty;
  if (!options) return base;
  const sizeFactor = options.size ? Math.max(1, options.size) : 1;
  const weightFactor = options.weight ? Math.max(1, options.weight) : 1;
  return Math.round(base * sizeFactor * weightFactor * 100) / 100;
};

export const buildScore = (
  _user: User,
  requirements: { minGradeValue?: number },
  metrics?: EmployeeMetrics
) => {
  const base = requirements.minGradeValue ?? 0;
  const attendance = metrics?.attendanceScore ?? 0;
  const punctuality = metrics?.punctualityScore ?? 0;
  const experience = metrics?.experienceRecentScore ?? 0;
  const risk = metrics?.riskScore ?? 0;
  const score = base * 10 + attendance + punctuality + experience - risk;
  return Math.max(0, Math.round(score));
};

export const registerPlannedEvent = (
  osiId: string,
  planItem: OsiNotaPlan['items'][number],
  eventType: NotaEventType,
  employeeId: string,
  qtyActual: number,
  registeredBy: string
): NotaEvent => {
  const qty = qtyActual > 0 ? qtyActual : planItem.qtyEstimated;
  const amountCalculated = calcAmount(eventType, qty);
  const now = new Date().toISOString();
  return {
    id: `NE-${Date.now()}`,
    osiId,
    eventTypeId: planItem.eventTypeId,
    employeeId,
    createdBy: registeredBy,
    createdAt: now,
    registeredAt: now,
    qtyActual: qty,
    unit: planItem.unit as UnitType,
    amountCalculated,
    status: NotaStatus.REGISTRADO,
    isExtra: false,
    effectiveDate: now,
  };
};

export const registerExtraEvent = (
  osiId: string,
  eventType: NotaEventType,
  employeeId: string,
  qty: number,
  registeredBy: string,
  reason: string,
  evidenceUrl?: string
): NotaEvent => {
  if (!reason) {
    throw new Error('Motivo requerido');
  }
  if (eventType.requiresEvidence && !evidenceUrl) {
    throw new Error('Evidencia requerida');
  }
  const amountCalculated = calcAmount(eventType, qty);
  const now = new Date().toISOString();
  return {
    id: `NE-${Date.now()}`,
    osiId,
    eventTypeId: eventType.id,
    employeeId,
    createdBy: registeredBy,
    createdAt: now,
    registeredAt: now,
    qtyActual: qty,
    unit: eventType.unit as UnitType,
    amountCalculated,
    status: NotaStatus.PENDIENTE_V,
    isExtra: true,
    reason,
    evidenceUrl,
    effectiveDate: now,
  };
};

export const approveEvent = (event: NotaEvent, approvedBy: string, note?: string): NotaEvent => ({
  ...event,
  status: NotaStatus.APROBADO,
  approvedBy,
  approvedAt: new Date().toISOString(),
  reason: note || event.reason,
});

export const rejectEvent = (event: NotaEvent, rejectedBy: string, note?: string): NotaEvent => ({
  ...event,
  status: NotaStatus.RECHAZADO,
  approvedBy: rejectedBy,
  approvedAt: new Date().toISOString(),
  reason: note || event.reason,
});
