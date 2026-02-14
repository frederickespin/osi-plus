import {
  DefaultMode,
  UnitType,
} from '@/types/hr-nota-v2.types';
import type {
  AllowanceType,
  BaseQualificationType,
  NotaEventType,
  ShabType,
} from '@/types/hr-nota-v2.types';

export const cbTypes: BaseQualificationType[] = [
  { id: 'CB01', code: 'CB01', name: 'Empacador basico', description: 'Empaque basico' },
  { id: 'CB02', code: 'CB02', name: 'Empacador cristaleria', description: 'Empaque de cristaleria' },
  { id: 'CB03', code: 'CB03', name: 'Empacador arte', description: 'Empaque de arte' },
  { id: 'CB04', code: 'CB04', name: 'Empacador tecnologia', description: 'Empaque de tecnologia' },
  { id: 'CB05', code: 'CB05', name: 'Cargador / Descarga', description: 'Carga y descarga' },
  { id: 'CB06', code: 'CB06', name: 'Estibador', description: 'Estibado de unidades' },
  { id: 'CB07', code: 'CB07', name: 'Desarmador / instalador', description: 'Desarme e instalacion' },
];

export const shabTypes: ShabType[] = [
  { code: 'PA', name: 'Carpintero', description: 'Cajas y embalajes de madera' },
  { code: 'PB', name: 'Mecánico', description: 'Mantenimiento de flota' },
  { code: 'PC', name: 'Instalador', description: 'Instalación de equipos y mobiliario' },
  { code: 'PD', name: 'Mantenimiento', description: 'Mantenimiento general' },
  { code: 'PF', name: 'Electricista', description: 'Trabajos eléctricos' },
  { code: 'PE', name: 'Supervisor Suplente', description: 'Apoyo de supervisión' },
];

export const notaEventTypes: NotaEventType[] = [
  { id: 'NOTA01', code: 'NOTA01', name: 'Embalaje Especial', unit: UnitType.EVENTO, baseRate: 40, active: true, category: 'GENERAL', requiredCbTypeId: 'CB03', minGradeValue: 2, defaultMode: DefaultMode.MANUAL },
  { id: 'NOTA02', code: 'NOTA02', name: 'Carga Pesada', unit: UnitType.HORA, baseRate: 15, active: true, category: 'GENERAL', requiredCbTypeId: 'CB02', minGradeValue: 2, defaultMode: DefaultMode.MANUAL },
  { id: 'NOTA03', code: 'NOTA03', name: 'Desmontaje Complejo', unit: UnitType.EVENTO, baseRate: 30, active: true, category: 'GENERAL', requiredCbTypeId: 'CB04', minGradeValue: 1, defaultMode: DefaultMode.MANUAL },
  { id: 'NOTA04', code: 'NOTA04', name: 'Montaje Especial', unit: UnitType.EVENTO, baseRate: 35, active: true, category: 'GENERAL', requiredCbTypeId: 'CB04', minGradeValue: 2, defaultMode: DefaultMode.MANUAL },
  { id: 'NOTA05', code: 'NOTA05', name: 'Custodia Especial', unit: UnitType.DIA, baseRate: 20, active: true, category: 'GENERAL', requiredCbTypeId: 'CB06', minGradeValue: 2, defaultMode: DefaultMode.MANUAL },
  { id: 'NOTA06', code: 'NOTA06', name: 'Carpintería SHAB', unit: UnitType.UNIDAD, baseRate: 25, active: true, category: 'PA', requiredShabCode: 'PA', defaultMode: DefaultMode.MANUAL },
  { id: 'NOTA07', code: 'NOTA07', name: 'Mecánica SHAB', unit: UnitType.EVENTO, baseRate: 45, active: true, category: 'PB', requiredShabCode: 'PB', defaultMode: DefaultMode.MANUAL },
  { id: 'NOTA08', code: 'NOTA08', name: 'Instalación SHAB', unit: UnitType.EVENTO, baseRate: 40, active: true, category: 'PC', requiredShabCode: 'PC', defaultMode: DefaultMode.MANUAL },
  { id: 'NOTA09', code: 'NOTA09', name: 'Mantenimiento SHAB', unit: UnitType.HORA, baseRate: 18, active: true, category: 'PD', requiredShabCode: 'PD', defaultMode: DefaultMode.MANUAL },
  { id: 'NOTA10', code: 'NOTA10', name: 'Electricidad SHAB', unit: UnitType.EVENTO, baseRate: 50, active: true, category: 'PF', requiredShabCode: 'PF', defaultMode: DefaultMode.MANUAL },
  { id: 'NOTA11', code: 'NOTA11', name: 'Supervisor Suplente', unit: UnitType.DIA, baseRate: 25, active: true, category: 'PE', requiredShabCode: 'PE', defaultMode: DefaultMode.MANUAL },
  { id: 'NOTA12', code: 'NOTA12', name: 'Extra Nocturno', unit: UnitType.HORA, baseRate: 20, active: true, category: 'GENERAL', requiredCbTypeId: 'CB06', minGradeValue: 1, requiresEvidence: true, defaultMode: DefaultMode.MANUAL },
  { id: 'NOTA13', code: 'NOTA13', name: 'Desplazamiento Especial', unit: UnitType.KM, baseRate: 1, active: true, category: 'GENERAL', defaultMode: DefaultMode.MANUAL },
  { id: 'NOTA14', code: 'NOTA14', name: 'Maniobra Especial', unit: UnitType.EVENTO, baseRate: 30, active: true, category: 'GENERAL', requiredCbTypeId: 'CB05', minGradeValue: 2, defaultMode: DefaultMode.MANUAL },
  { id: 'NOTA15', code: 'NOTA15', name: 'Equipo Adicional', unit: UnitType.UNIDAD, baseRate: 10, active: true, category: 'GENERAL', defaultMode: DefaultMode.MANUAL },
  { id: 'LEGACY_MISC', code: 'LEGACY_MISC', name: 'Legacy NOTA', unit: UnitType.EVENTO, baseRate: 0, active: false, category: 'GENERAL', defaultMode: DefaultMode.MANUAL },
];

export const allowanceTypes: AllowanceType[] = [
  { id: 'ALW01', code: 'DIETA_OP', name: 'Dieta (Operativo)', unit: UnitType.DIA, baseRate: 12, active: true },
  { id: 'ALW05', code: 'DIETA_SUP', name: 'Dieta (Supervisor)', unit: UnitType.DIA, baseRate: 25, active: true },
  { id: 'ALW02', code: 'VIATICO', name: 'Viático', unit: UnitType.DIA, baseRate: 25, active: true },
  { id: 'ALW03', code: 'HOSPEDAJE', name: 'Hospedaje', unit: UnitType.DIA, baseRate: 45, active: true },
  { id: 'ALW04', code: 'TRANSPORTE', name: 'Transporte', unit: UnitType.EVENTO, baseRate: 15, active: true },
];
