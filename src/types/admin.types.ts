// ============================================
// MÓDULO DE ADMINISTRACIÓN CENTRAL (ROL A)
// Torre de Control - Dashboard de Comando
// ============================================

// ============================================
// WIDGETS DE ALERTA
// ============================================

export interface SecurityAlert {
  id: string;
  type: 'SEAL_BROKEN' | 'THEFT' | 'ACCIDENT' | 'OTHER';
  severity: 'critical' | 'high' | 'medium';
  status: 'active' | 'investigating' | 'resolved';
  reportedAt: Date;
  reportedBy: string; // G
  blockedUsers: string[]; // User IDs
  evidence: {
    photos: string[];
    description: string;
  };
  investigationReport?: string;
  resolvedAt?: Date;
  resolvedBy?: string; // A
}

export interface HRRiskUser {
  userId: string;
  userName: string;
  role: string;
  kpi: number;
  riskFactors: string[];
  lastIncident?: Date;
  consecutiveAbsences: number;
  status: 'active' | 'suspended' | 'probation';
}

export interface FinancialNOTA {
  id: string;
  month: number;
  year: number;
  totalAmount: number;
  breakdown: {
    carpentry: number;
    mechanics: number;
    incentives: number;
    extraHours: number;
  };
  status: 'pending' | 'processed' | 'paid';
  processedAt?: Date;
}

export interface LiveTruck {
  osiId: string;
  truckId: string;
  driverId: string;
  driverName: string;
  status: 'on_time' | 'delayed' | 'early';
  location?: {
    lat: number;
    lng: number;
  };
  eta?: Date;
  departureTime: Date;
}

// ============================================
// CONFIGURACIÓN DE TARIFAS (NOTA)
// ============================================

export interface BillingRate {
  id: string;
  roleTarget: string; // PA, PB, PE, etc.
  concept: string;
  price: number;
  unit: 'UNIT' | 'LINEAR_METER' | 'SERVICE' | 'HOUR';
  frequency: 'PER_OSI' | 'PER_PROJECT';
  isActive: boolean;
  effectiveDate: Date;
  createdBy: string; // A
}

export interface PayrollCutoff {
  id: string;
  dayOfMonth: number;
  name: string; // "Quincena 1", "Quincena 2"
  isActive: boolean;
}

// ============================================
// GESTIÓN DE FLOTA
// ============================================

export interface Vehicle {
  id: string;
  plate: string;
  brand: string;
  model: string;
  capacity: number; // kg
  year: number;
  odometer: number;
  initialOdometer: number;
  defaultDriverId?: string;
  status: 'available' | 'in_use' | 'maintenance' | 'out_of_service';
  lastMaintenanceOdometer: number;
  maintenanceInterval: number; // km
  nextMaintenanceDue: number; // km
}

export interface MaintenanceAlert {
  id: string;
  vehicleId: string;
  type: 'ROUTINE' | 'REPAIR' | 'EMERGENCY';
  description: string;
  reportedBy: string; // E o PB
  reportedAt: Date;
  status: 'pending' | 'in_progress' | 'completed';
  assignedTo?: string; // PB
}

// ============================================
// CONFIGURACIÓN DEL SISTEMA
// ============================================

export interface SystemConfig {
  kpiThreshold: number; // Umbral de bajo rendimiento (default: 60)
  autoSuspendEnabled: boolean;
  maxConsecutiveAbsences: number;
  probationDays: number;
}

export interface SystemLog {
  id: string;
  action: string;
  userId: string;
  userName: string;
  timestamp: Date;
  ip: string;
  details: string;
}

// ============================================
// KPIs Y RENDIMIENTO
// ============================================

export interface KPIDailyRecord {
  id: string;
  userId: string;
  date: Date;
  baseScore: number;
  deductions: {
    lateMinutes: number;
    latePenalty: number;
    uniformFailure: boolean;
    uniformPenalty: number;
    clientComplaint: boolean;
    complaintPenalty: number;
    assetDamage: boolean;
    damagePenalty: number;
  };
  bonuses: {
    extraHours: boolean;
    extraHoursBonus: number;
  };
  finalScore: number;
}

export interface KPISummary {
  userId: string;
  weekly: number;
  monthly: number;
  quarterly: number;
  yearly: number;
  trend: 'up' | 'down' | 'stable';
}

// ============================================
// NÓMINA NOTA (SHAB)
// ============================================

export interface NOTAEntry {
  id: string;
  userId: string;
  osiId: string;
  taskType: string; // PA, PB, PE
  description: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  validatedBy: string; // D
  validatedAt: Date;
  status: 'pending' | 'approved' | 'paid';
  paidAt?: Date;
  cutoffId?: string;
}

export interface NOTASummary {
  userId: string;
  userName: string;
  pendingAmount: number;
  approvedAmount: number;
  paidAmount: number;
  entries: NOTAEntry[];
}

// ============================================
// INSIGNIAS Y RECONOCIMIENTOS
// ============================================

export interface Badge {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  criteria: string;
}

export interface UserBadge {
  id: string;
  userId: string;
  badgeId: string;
  earnedAt: Date;
  osiId?: string;
}

// ============================================
// CADENA DE CUSTODIA (HANDSHAKE)
// ============================================

export interface CustodyHandshake {
  id: string;
  osiId: string;
  phase: 'PICKUP' | 'DELIVERY' | 'RETURN';
  fromUserId: string;
  toUserId: string;
  fromRole: string;
  toRole: string;
  items: CustodyItem[];
  qrCode: string;
  scannedAt: Date;
  location?: {
    lat: number;
    lng: number;
  };
  status: 'pending' | 'completed' | 'disputed';
}

export interface CustodyItem {
  type: 'asset' | 'material' | 'wood_box';
  id: string;
  name: string;
  quantity: number;
  condition: 'good' | 'damaged' | 'missing';
}
