export const GradeLetter = {
  A: 'A',
  B: 'B',
  C: 'C',
  NA: 'NA',
} as const;
export type GradeLetter = typeof GradeLetter[keyof typeof GradeLetter];

export const NotaStatus = {
  REGISTRADO: 'REGISTRADO',
  PENDIENTE_V: 'PENDIENTE_V',
  APROBADO: 'APROBADO',
  RECHAZADO: 'RECHAZADO',
  PAGADO: 'PAGADO',
  LIQUIDADO: 'LIQUIDADO',
} as const;
export type NotaStatus = typeof NotaStatus[keyof typeof NotaStatus];

export const UnitType = {
  EVENTO: 'EVENTO',
  HORA: 'HORA',
  DIA: 'DIA',
  UNIDAD: 'UNIDAD',
  KM: 'KM',
} as const;
export type UnitType = typeof UnitType[keyof typeof UnitType];

export const DefaultMode = {
  MANUAL: 'MANUAL',
  AUTO: 'AUTO',
} as const;
export type DefaultMode = typeof DefaultMode[keyof typeof DefaultMode];

export type BaseQualificationType = {
  id: string;
  code: string;
  name: string;
  description?: string;
};

export type EmployeeBaseQualification = {
  baseTypeId: string;
  grade: GradeLetter;
};

export type ShabType = {
  code: string;
  name: string;
  description?: string;
};

export type EmployeeShab = {
  shabCode: string;
  active: boolean;
  certifiedAt?: string;
};

export type NotaEventType = {
  id: string;
  code: string;
  name: string;
  unit: UnitType;
  baseRate: number;
  active: boolean;
  category?: string;
  requiredCbTypeId?: string;
  minGradeValue?: number;
  requiredShabCode?: string;
  requiresEvidence?: boolean;
  defaultMode: DefaultMode;
  meta?: Record<string, string | number | boolean>;
};

export type OsiNotaPlan = {
  osiId: string;
  createdBy: string;
  createdAt: string;
  items: {
    eventTypeId: string;
    qtyEstimated: number;
    unit: UnitType;
    baseRate: number;
    capAmount?: number;
  }[];
};

export type NotaEvent = {
  id: string;
  osiId: string;
  eventTypeId: string;
  employeeId: string;
  createdBy: string;
  createdAt: string;
  registeredAt: string;
  qtyActual: number;
  unit: UnitType;
  amountCalculated: number;
  amount?: number;
  status: NotaStatus;
  isExtra: boolean;
  reason?: string;
  evidenceUrl?: string;
  approvedBy?: string;
  approvedAt?: string;
  paidBy?: string;
  paidAt?: string;
  effectiveDate: string;
  payCycleId?: string;
  payConfigVersionApplied?: number;
};

export type AllowanceType = {
  id: string;
  code: string;
  name: string;
  unit: UnitType;
  baseRate: number;
  active: boolean;
};

export type AllowanceRecord = {
  id: string;
  osiId: string;
  allowanceTypeId: string;
  createdBy: string;
  createdAt: string;
  qty: number;
  unit: UnitType;
  amount: number;
  status: NotaStatus;
};

export type EmployeeMetrics = {
  attendanceScore: number;
  punctualityScore: number;
  experienceRecentScore: number;
  riskScore: number;
};

export type NotaPayCutRulesMonthly = {
  cutStartDay: number;
  cutEndDay: number;
  payDay: number;
};

export type NotaPayCutRulesSemiMonthly = {
  cut1StartDay: number;
  cut1EndDay: number;
  pay1Day: number;
  cut2StartDay: number;
  cut2EndDay: number;
  pay2Day: number;
  carryDaysBeyondEnd?: boolean;
};

export type NotaPayConfig = {
  id: string;
  accountingEmail: string;
  frequency: 1 | 2;
  timezone: string;
  datePolicy: 'REGISTERED_AT' | 'APPROVED_AT';
  cutRules: NotaPayCutRulesMonthly | NotaPayCutRulesSemiMonthly;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedBy?: string;
  updatedAt?: string;
};

export type NotaPayCycle = {
  id: string;
  label: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  status: 'OPEN' | 'CLOSED' | 'PAID';
  createdAt: string;
  closedBy?: string;
  closedAt?: string;
  paidBy?: string;
  paidAt?: string;
};

export type NotaPayReportRow = {
  employeeCode: string;
  employeeName: string;
  osiCode: string;
  date: string;
  detail: string;
  amount: number;
};

export type NotaPayReport = {
  id: string;
  cycleId: string;
  configVersion: number;
  createdAt: string;
  rows: NotaPayReportRow[];
  totalsByEmployee: { employeeCode: string; employeeName: string; total: number }[];
  grandTotal: number;
};

export const gradeToValue = (letter: GradeLetter): number => {
  switch (letter) {
    case GradeLetter.A:
      return 3;
    case GradeLetter.B:
      return 2;
    case GradeLetter.C:
      return 1;
    case GradeLetter.NA:
    default:
      return 0;
  }
};

export const valueToGrade = (value: number): GradeLetter => {
  if (value >= 3) return GradeLetter.A;
  if (value === 2) return GradeLetter.B;
  if (value === 1) return GradeLetter.C;
  return GradeLetter.NA;
};
