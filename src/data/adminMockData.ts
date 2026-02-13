import type { 
  SecurityAlert, 
  HRRiskUser, 
  FinancialNOTA, 
  LiveTruck,
  BillingRate,
  PayrollCutoff,
  Vehicle,
  MaintenanceAlert,
  SystemConfig,
  KPIDailyRecord,
  NOTAEntry,
  Badge,
  UserBadge,
  CustodyHandshake
} from '@/types/admin.types';

// ============================================
// ALERTAS DE SEGURIDAD
// ============================================

export const securityAlerts: SecurityAlert[] = [
  {
    id: 'SEC-001',
    type: 'SEAL_BROKEN',
    severity: 'critical',
    status: 'investigating',
    reportedAt: new Date('2024-01-20T14:30:00'),
    reportedBy: 'U010', // Portero G
    blockedUsers: ['U006', 'U007'], // Supervisor D y Chofer E
    evidence: {
      photos: ['/evidence/seal_1.jpg', '/evidence/seal_2.jpg'],
      description: 'Sello de seguridad violado durante retorno de servicio. El número de precinto no coincide con el registrado en salida.'
    },
    investigationReport: 'Investigación en curso. Se revisarán las cámaras de seguridad.'
  },
  {
    id: 'SEC-002',
    type: 'ACCIDENT',
    severity: 'high',
    status: 'resolved',
    reportedAt: new Date('2024-01-18T09:15:00'),
    reportedBy: 'U010',
    blockedUsers: ['U008'],
    evidence: {
      photos: ['/evidence/accident_1.jpg'],
      description: 'Daño menor en parachoques trasero durante maniobra de reversa.'
    },
    investigationReport: 'Accidente menor, sin lesiones. Reparación programada.',
    resolvedAt: new Date('2024-01-19T10:00:00'),
    resolvedBy: 'U001'
  }
];

// ============================================
// USUARIOS EN RIESGO (ZONA DE PELIGRO)
// ============================================

export const hrRiskUsers: HRRiskUser[] = [
  {
    userId: 'U015',
    userName: 'Luis Hernández',
    role: 'N',
    kpi: 52,
    riskFactors: ['Bajo KPI mensual', '2 quejas de cliente', 'Retardos frecuentes'],
    lastIncident: new Date('2024-01-19'),
    consecutiveAbsences: 0,
    status: 'suspended'
  },
  {
    userId: 'U016',
    userName: 'Miguel Torres',
    role: 'N',
    kpi: 58,
    riskFactors: ['KPI descendente', 'Uniforme incompleto'],
    consecutiveAbsences: 2,
    status: 'probation'
  },
  {
    userId: 'U017',
    userName: 'Carlos Ruiz',
    role: 'PA',
    kpi: 45,
    riskFactors: ['Bajo rendimiento', '3 inasistencias consecutivas'],
    lastIncident: new Date('2024-01-15'),
    consecutiveAbsences: 3,
    status: 'suspended'
  }
];

// ============================================
// FINANZAS NOTA
// ============================================

export const financialNOTAs: FinancialNOTA[] = [
  {
    id: 'NOTA-ENE-2024',
    month: 1,
    year: 2024,
    totalAmount: 45800,
    breakdown: {
      carpentry: 18500,
      mechanics: 12000,
      incentives: 9800,
      extraHours: 5500
    },
    status: 'pending'
  }
];

// ============================================
// CAMIONES EN VIVO
// ============================================

export const liveTrucks: LiveTruck[] = [
  {
    osiId: 'OSI-500',
    truckId: 'V-001',
    driverId: 'U007',
    driverName: 'Roberto Díaz',
    status: 'on_time',
    location: { lat: 19.4326, lng: -99.1332 },
    eta: new Date('2024-01-20T16:00:00'),
    departureTime: new Date('2024-01-20T08:00:00')
  },
  {
    osiId: 'OSI-501',
    truckId: 'V-002',
    driverId: 'U018',
    driverName: 'Fernando López',
    status: 'delayed',
    location: { lat: 19.3500, lng: -99.1800 },
    eta: new Date('2024-01-20T17:30:00'),
    departureTime: new Date('2024-01-20T08:30:00')
  }
];

// ============================================
// TARIFAS DE FACTURACIÓN (NOTA)
// ============================================

export const billingRates: BillingRate[] = [
  {
    id: 'RATE-001',
    roleTarget: 'PA',
    concept: 'Fabricación Huacal Grande',
    price: 500,
    unit: 'UNIT',
    frequency: 'PER_OSI',
    isActive: true,
    effectiveDate: new Date('2024-01-01'),
    createdBy: 'U001'
  },
  {
    id: 'RATE-002',
    roleTarget: 'PA',
    concept: 'Fabricación Huacal Mediano',
    price: 350,
    unit: 'UNIT',
    frequency: 'PER_OSI',
    isActive: true,
    effectiveDate: new Date('2024-01-01'),
    createdBy: 'U001'
  },
  {
    id: 'RATE-003',
    roleTarget: 'PB',
    concept: 'Reparación Mecánica Menor',
    price: 400,
    unit: 'SERVICE',
    frequency: 'PER_OSI',
    isActive: true,
    effectiveDate: new Date('2024-01-01'),
    createdBy: 'U001'
  },
  {
    id: 'RATE-004',
    roleTarget: 'PB',
    concept: 'Mantenimiento Preventivo',
    price: 800,
    unit: 'SERVICE',
    frequency: 'PER_PROJECT',
    isActive: true,
    effectiveDate: new Date('2024-01-01'),
    createdBy: 'U001'
  },
  {
    id: 'RATE-005',
    roleTarget: 'PE',
    concept: 'Supervisión Suplente',
    price: 600,
    unit: 'HOUR',
    frequency: 'PER_OSI',
    isActive: true,
    effectiveDate: new Date('2024-01-01'),
    createdBy: 'U001'
  }
];

// ============================================
// CORTES DE NÓMINA
// ============================================

export const payrollCutoffs: PayrollCutoff[] = [
  {
    id: 'CUTOFF-1',
    dayOfMonth: 15,
    name: 'Quincena 1',
    isActive: true
  },
  {
    id: 'CUTOFF-2',
    dayOfMonth: 30,
    name: 'Quincena 2',
    isActive: true
  }
];

// ============================================
// FLOTA DE VEHÍCULOS
// ============================================

export const vehicles: Vehicle[] = [
  {
    id: 'V-001',
    plate: 'ABC-1234',
    brand: 'Ford',
    model: 'F-350',
    capacity: 3500,
    year: 2022,
    odometer: 45230,
    initialOdometer: 15000,
    defaultDriverId: 'U007',
    status: 'in_use',
    lastMaintenanceOdometer: 40000,
    maintenanceInterval: 5000,
    nextMaintenanceDue: 45000
  },
  {
    id: 'V-002',
    plate: 'XYZ-5678',
    brand: 'Mercedes-Benz',
    model: 'Sprinter',
    capacity: 2500,
    year: 2023,
    odometer: 28500,
    initialOdometer: 5000,
    defaultDriverId: 'U018',
    status: 'in_use',
    lastMaintenanceOdometer: 25000,
    maintenanceInterval: 5000,
    nextMaintenanceDue: 30000
  },
  {
    id: 'V-003',
    plate: 'DEF-9012',
    brand: 'Isuzu',
    model: 'Elf',
    capacity: 4000,
    year: 2021,
    odometer: 67800,
    initialOdometer: 20000,
    defaultDriverId: 'U019',
    status: 'maintenance',
    lastMaintenanceOdometer: 65000,
    maintenanceInterval: 5000,
    nextMaintenanceDue: 70000
  }
];

// ============================================
// ALERTAS DE MANTENIMIENTO
// ============================================

export const maintenanceAlerts: MaintenanceAlert[] = [
  {
    id: 'MAINT-001',
    vehicleId: 'V-001',
    type: 'ROUTINE',
    description: 'Cambio de aceite y filtros próximos (500 km restantes)',
    reportedBy: 'U007',
    reportedAt: new Date('2024-01-19'),
    status: 'pending'
  },
  {
    id: 'MAINT-002',
    vehicleId: 'V-002',
    type: 'REPAIR',
    description: 'Frenos traseros presentan desgaste. Recomendado cambio de balatas.',
    reportedBy: 'U018',
    reportedAt: new Date('2024-01-18'),
    status: 'in_progress',
    assignedTo: 'U020' // Mecánico PB
  }
];

// ============================================
// CONFIGURACIÓN DEL SISTEMA
// ============================================

export const systemConfig: SystemConfig = {
  kpiThreshold: 60,
  autoSuspendEnabled: true,
  maxConsecutiveAbsences: 3,
  probationDays: 30
};

// ============================================
// REGISTROS KPI DIARIOS
// ============================================

export const kpiDailyRecords: KPIDailyRecord[] = [
  {
    id: 'KPI-20240120-U006',
    userId: 'U006',
    date: new Date('2024-01-20'),
    baseScore: 100,
    deductions: {
      lateMinutes: 0,
      latePenalty: 0,
      uniformFailure: false,
      uniformPenalty: 0,
      clientComplaint: false,
      complaintPenalty: 0,
      assetDamage: false,
      damagePenalty: 0
    },
    bonuses: {
      extraHours: true,
      extraHoursBonus: 10
    },
    finalScore: 110
  },
  {
    id: 'KPI-20240120-U015',
    userId: 'U015',
    date: new Date('2024-01-20'),
    baseScore: 100,
    deductions: {
      lateMinutes: 15,
      latePenalty: 7.5,
      uniformFailure: true,
      uniformPenalty: 10,
      clientComplaint: true,
      complaintPenalty: 20,
      assetDamage: false,
      damagePenalty: 0
    },
    bonuses: {
      extraHours: false,
      extraHoursBonus: 0
    },
    finalScore: 62.5
  }
];

// ============================================
// ENTRADAS NOTA
// ============================================

export const notaEntries: NOTAEntry[] = [
  {
    id: 'NOTA-001',
    userId: 'U011', // Carpintero
    osiId: 'OSI-500',
    taskType: 'PA',
    description: 'Fabricación 3 Huacales Grandes',
    quantity: 3,
    unitPrice: 500,
    totalAmount: 1500,
    validatedBy: 'U006',
    validatedAt: new Date('2024-01-20T12:00:00'),
    status: 'approved'
  },
  {
    id: 'NOTA-002',
    userId: 'U011',
    osiId: 'OSI-501',
    taskType: 'PA',
    description: 'Fabricación 2 Huacales Medianos',
    quantity: 2,
    unitPrice: 350,
    totalAmount: 700,
    validatedBy: 'U006',
    validatedAt: new Date('2024-01-21T10:00:00'),
    status: 'pending'
  },
  {
    id: 'NOTA-003',
    userId: 'U020', // Mecánico
    osiId: 'OSI-502',
    taskType: 'PB',
    description: 'Reparación Frenos V-002',
    quantity: 1,
    unitPrice: 400,
    totalAmount: 400,
    validatedBy: 'U003',
    validatedAt: new Date('2024-01-19T16:00:00'),
    status: 'paid',
    paidAt: new Date('2024-01-20')
  }
];

// ============================================
// INSIGNIAS
// ============================================

export const badges: Badge[] = [
  {
    id: 'BADGE-001',
    code: 'PERFECT_MOVE',
    name: 'Mudanza Perfecta',
    description: '5/5 estrellas en NPS',
    icon: 'star',
    color: '#fbbf24',
    criteria: 'Obtener calificación perfecta del cliente'
  },
  {
    id: 'BADGE-002',
    code: 'GREEN_GUARDIAN',
    name: 'Guardián Verde',
    description: '>100 lbs de reciclaje en un mes',
    icon: 'leaf',
    color: '#10b981',
    criteria: 'Reciclar más de 100 lbs de material'
  },
  {
    id: 'BADGE-003',
    code: 'IRON_MAN',
    name: 'Iron Man',
    description: '100% asistencia y puntualidad en el trimestre',
    icon: 'shield',
    color: '#6366f1',
    criteria: 'Sin faltas ni retardos en 90 días'
  },
  {
    id: 'BADGE-004',
    code: 'MASTER_CARPENTER',
    name: 'Maestro Carpintero',
    description: '50 cajas fabricadas sin defectos',
    icon: 'hammer',
    color: '#92400e',
    criteria: 'Fabricar 50 cajas con calidad perfecta'
  }
];

// ============================================
// INSIGNIAS DE USUARIOS
// ============================================

export const userBadges: UserBadge[] = [
  {
    id: 'UB-001',
    userId: 'U006',
    badgeId: 'BADGE-001',
    earnedAt: new Date('2024-01-15'),
    osiId: 'OSI-498'
  },
  {
    id: 'UB-002',
    userId: 'U006',
    badgeId: 'BADGE-003',
    earnedAt: new Date('2024-01-01')
  },
  {
    id: 'UB-003',
    userId: 'U011',
    badgeId: 'BADGE-004',
    earnedAt: new Date('2024-01-10')
  }
];

// ============================================
// CADENA DE CUSTODIA (HANDSHAKES)
// ============================================

export const custodyHandshakes: CustodyHandshake[] = [
  {
    id: 'HS-001',
    osiId: 'OSI-500',
    phase: 'PICKUP',
    fromUserId: 'U005', // C1
    toUserId: 'U007', // E
    fromRole: 'C1',
    toRole: 'E',
    items: [
      { type: 'material', id: 'MAT-001', name: 'Cinta adhesiva', quantity: 10, condition: 'good' },
      { type: 'asset', id: 'ASSET-001', name: 'Taladro', quantity: 2, condition: 'good' }
    ],
    qrCode: 'HS|PICKUP|OSI-500|20240120',
    scannedAt: new Date('2024-01-20T08:00:00'),
    status: 'completed'
  },
  {
    id: 'HS-002',
    osiId: 'OSI-500',
    phase: 'DELIVERY',
    fromUserId: 'U007', // E
    toUserId: 'U006', // D
    fromRole: 'E',
    toRole: 'D',
    items: [
      { type: 'material', id: 'MAT-001', name: 'Cinta adhesiva', quantity: 10, condition: 'good' },
      { type: 'asset', id: 'ASSET-001', name: 'Taladro', quantity: 2, condition: 'good' }
    ],
    qrCode: 'HS|DELIVERY|OSI-500|20240120',
    scannedAt: new Date('2024-01-20T08:45:00'),
    status: 'completed'
  }
];

// ============================================
// ESTADÍSTICAS DEL ADMIN
// ============================================

export const adminStats = {
  activeIncidents: securityAlerts.filter(a => a.status === 'active' || a.status === 'investigating').length,
  usersAtRisk: hrRiskUsers.length,
  pendingNOTA: financialNOTAs.filter(n => n.status === 'pending').reduce((sum, n) => sum + n.totalAmount, 0),
  trucksOnRoute: liveTrucks.length,
  vehiclesInMaintenance: vehicles.filter(v => v.status === 'maintenance').length,
  pendingMaintenance: maintenanceAlerts.filter(m => m.status === 'pending').length,
  totalNOTAPending: notaEntries.filter(n => n.status === 'pending').reduce((sum, n) => sum + n.totalAmount, 0),
  totalNOTAApproved: notaEntries.filter(n => n.status === 'approved').reduce((sum, n) => sum + n.totalAmount, 0)
};
