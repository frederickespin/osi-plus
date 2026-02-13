// OSi-plus ERP System - Core Types
// International Packers SRL
import type {
  AllowanceRecord,
  EmployeeBaseQualification,
  EmployeeMetrics,
  EmployeeShab,
  NotaEvent,
  OsiNotaPlan,
} from './hr-nota-v2.types';

// ==================== ROLES ====================
export type UserRole = 
  | 'A'  // Administrador
  | 'V'  // Ventas
  | 'K'  // Coordinador
  | 'B'  // Encargado de Operaciones
  | 'C'  // Encargado de Materiales
  | 'C1' // Despachador
  | 'D'  // Supervisor
  | 'E'  // Chofer
  | 'G'  // Portería/Seguridad
  | 'N'  // Personal de Campo
  | 'PA' // Carpintero
  | 'PB' // Mecánico
  | 'PC' // Instalador
  | 'PD' // Mantenimiento
  | 'PF' // Electricista
  | 'I'  // RRHH
  | 'PE' // Supervisor Suplente
  | 'RB'; // Review Board

// Alias for compatibility with auth.types.ts
export type Role = UserRole;

export interface RoleDefinition {
  code: UserRole;
  name: string;
  description: string;
  permissions: string[];
  isMobile: boolean;
}

// ==================== PROJECT HIERARCHY ====================
export interface OpsProject {
  id: string;
  code: string;
  name: string;
  clientId: string;
  clientName: string;
  status: 'active' | 'completed' | 'cancelled' | 'pending';
  startDate: string;
  endDate?: string;
  defaultStartTime?: string;
  defaultEndTime?: string;
  osiCount: number;
  totalValue: number;
  assignedTo: string;
  notes?: string;
}

// Backward compatibility alias for legacy imports
export type Project = OpsProject;

export interface OSI {
  id: string;
  code: string;
  projectId: string;
  projectCode: string;
  clientId: string;
  clientName: string;
  status: OSIStatus;
  type: 'local' | 'national' | 'international';
  origin: string;
  destination: string;
  scheduledDate: string;
  scheduledStartAt?: string;
  scheduledEndAt?: string;
  createdAt: string;
  assignedTo?: string;
  assignedDriverId?: string;
  team?: string[];
  vehicles?: string[];
  value: number;
  notes?: string;
  materialsStatus?: 'PENDIENTE' | 'PREPARANDO' | 'PREPARADO' | 'RECOGIDO';
  materialsLocation?: string;
  materialsUpdatedAt?: string;
  materialsUpdatedBy?: string;
  osiNotaPlan?: OsiNotaPlan;
  allowances?: AllowanceRecord[];
  notaEvents?: NotaEvent[];
}

export type OSIStatus = 
  | 'draft'
  | 'pending_assignment'
  | 'assigned'
  | 'in_preparation'
  | 'in_transit'
  | 'at_destination'
  | 'completed'
  | 'cancelled'
  | 'liquidation';

// ==================== CLIENTS ====================
export interface Client {
  id: string;
  code: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  type: 'corporate' | 'individual' | 'government';
  status: 'active' | 'inactive';
  picId?: string;
  totalServices: number;
  lastService?: string;
  createdAt: string;
}

export interface PIC {
  id: string;
  clientId: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  isPrimary: boolean;
  preferences?: {
    notifications: boolean;
    language: string;
  };
}

// ==================== USERS / EMPLOYEES ====================
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'INACTIVE' | 'active' | 'suspended' | 'inactive';
export type ContractType = 'Planta' | 'Personal Móvil';
export type BaseSkill = 'Empacador' | 'Estibador' | 'Cargador' | 'Desarmador' | 'Embalador';

export interface User {
  // 1. Datos de Identidad y Seguridad
  id: string;
  fullName?: string;
  profilePhotoUrl?: string;
  whatsappNumber?: string;
  email: string;
  
  // 2. Clasificación Operativa
  role: UserRole;
  passwordHash?: string;
  contractType?: ContractType;
  contractEndDate?: string; // Solo para Personal Móvil
  joinDate: string;
  department?: string;
  
  // 3. Matriz de Competencias (Solo para Rol N)
  isPolyfunctional?: boolean;
  baseSkills?: BaseSkill[];
  shabActive?: SHAB[];
  shabRatesOverride?: boolean;
  notaEnabled?: boolean;
  allowanceTypeIds?: string[];
  baseQualifications?: EmployeeBaseQualification[];
  shab?: EmployeeShab[];
  metrics?: EmployeeMetrics;
  
  // 4. Métricas de Rendimiento
  status: UserStatus;
  currentRating?: number; // 0-100
  points: number;
  badges?: Badge[];
  lastIncidentDate?: string;
  
  // Legacy fields (para compatibilidad)
  code: string;
  name: string;
  phone: string;
  avatar?: string;
  rating: number;
  skills?: SHAB[];
}

// ==================== SHAB - HABILIDADES ====================
export type SHAB = 'PA' | 'PB' | 'PC' | 'PD' | 'PF' | 'PE';

// Extended SHAB codes including PE (Supervisor Suplente)
export type ExtendedSHAB = SHAB | 'PE';

export interface SkillCertification {
  id: string;
  userId: string;
  skill: SHAB;
  certifiedAt: string;
  certifiedBy: string;
  expiresAt?: string;
  level: 'basic' | 'intermediate' | 'advanced';
}

// ==================== NOTA ====================
export interface NOTA {
  id: string;
  code: string;
  osiId: string;
  osiCode: string;
  description: string;
  category: NOTACategory;
  amount: number;
  currency: string;
  requestedBy: string;
  approvedBy?: string;
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  createdAt: string;
  paidAt?: string;
}

export type NOTACategory = 
  | 'materials'
  | 'labor'
  | 'transport'
  | 'meals'
  | 'accommodation'
  | 'other';

// ==================== VEHICLES ====================
export interface Vehicle {
  id: string;
  code: string;
  plate: string;
  type: string;
  brand: string;
  model: string;
  year: number;
  capacity: number;
  status: 'available' | 'in_use' | 'maintenance' | 'retired';
  lastMaintenance?: string;
  nextMaintenance?: string;
  assignedDriver?: string;
  mileage: number;
}

export interface MaintenanceRecord {
  id: string;
  vehicleId: string;
  type: 'preventive' | 'corrective' | 'predictive';
  description: string;
  cost: number;
  date: string;
  performedBy: string;
  nextDue?: string;
  status: 'completed' | 'scheduled' | 'in_progress';
}

// ==================== HANDSHAKE DIGITAL ====================
export interface CustodyHandshake {
  id: string;
  code: string;
  osiId: string;
  osiCode: string;
  type: 'pickup' | 'delivery' | 'transfer';
  fromRole: UserRole;
  fromUserId: string;
  fromUserName: string;
  toRole: UserRole;
  toUserId: string;
  toUserName: string;
  status: 'pending' | 'accepted' | 'rejected' | 'completed';
  qrCode: string;
  location?: string;
  timestamp: string;
  completedAt?: string;
  notes?: string;
}

// ==================== WMS ====================
export interface WarehouseLocation {
  id: string;
  code: string;
  warehouse: string;
  zone: 'MAIN' | 'LOCKER' | 'CUARENTENA' | 'TALLER';
  aisle: string;
  rack: string;
  level: string;
  bin: string;
  qrCode: string;
  category: 'materials' | 'assets' | 'woodboxes';
  capacity: number;
  occupied: number;
}

export interface InventoryItem {
  id: string;
  code: string;
  name: string;
  category: 'materials' | 'assets' | 'woodboxes';
  locationId: string;
  locationCode: string;
  quantity: number;
  unit: string;
  status: 'available' | 'reserved' | 'in_use' | 'damaged';
  osiId?: string;
  lastMoved?: string;
}

export interface InventoryMove {
  id: string;
  itemId: string;
  itemName: string;
  fromLocation: string;
  toLocation: string;
  quantity: number;
  movedBy: string;
  movedAt: string;
  reason: string;
  type: 'in' | 'out' | 'transfer';
}

// ==================== WOOD BOXES (SMART MATCH) ====================
export interface WoodBox {
  id: string;
  code: string;
  dimensions: {
    length: number;
    width: number;
    height: number;
  };
  boardFeet: number;
  status: 'available' | 'in_use' | 'damaged' | 'disposed';
  locationId?: string;
  osiId?: string;
  reuseCount: number;
  createdAt: string;
  lastUsed?: string;
}

// ==================== NPS ====================
export interface NPSSurvey {
  id: string;
  osiId: string;
  osiCode: string;
  clientId: string;
  clientName: string;
  score: number;
  comment?: string;
  category: 'detractor' | 'passive' | 'promoter';
  createdAt: string;
  respondedAt?: string;
}

// ==================== BADGES ====================
export interface Badge {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  requirement: string;
  points: number;
}

export interface UserBadge {
  id: string;
  userId: string;
  badgeId: string;
  earnedAt: string;
}

// ==================== KPIs ====================
export interface KPIRecord {
  id: string;
  userId: string;
  period: string;
  metrics: {
    osisCompleted: number;
    onTimeRate: number;
    qualityScore: number;
    safetyScore: number;
    customerRating: number;
  };
  totalScore: number;
  ranking: number;
}

// ==================== EVALUATION 360 ====================
export interface Evaluation360 {
  id: string;
  userId: string;
  evaluatorId: string;
  evaluatorRole: UserRole;
  period: string;
  categories: {
    technical: number;
    teamwork: number;
    punctuality: number;
    communication: number;
    safety: number;
  };
  comments?: string;
  createdAt: string;
}

// ==================== TRACKING ====================
export interface TrackingEvent {
  id: string;
  osiId: string;
  timestamp: string;
  status: string;
  location?: string;
  description: string;
  lat?: number;
  lng?: number;
}

// ==================== CALENDAR ====================
export interface CalendarEvent {
  id: string;
  title: string;
  type: 'osi' | 'maintenance' | 'meeting' | 'other';
  startDate: string;
  endDate: string;
  assignedTo?: string[];
  osiId?: string;
  description?: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
}

// ==================== PURCHASES ====================
export interface PurchaseRequest {
  id: string;
  code: string;
  description: string;
  category: string;
  amount: number;
  requestedBy: string;
  approvedBy?: string;
  status: 'pending' | 'approved' | 'rejected' | 'ordered' | 'received';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  createdAt: string;
  neededBy?: string;
}

// ==================== DASHBOARD WIDGETS ====================
export interface DashboardWidget {
  id: string;
  type: 'stats' | 'chart' | 'list' | 'alert' | 'map';
  title: string;
  data: any;
  position: { x: number; y: number; w: number; h: number };
}

// ==================== NOTIFICATIONS ====================
export interface Notification {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  action?: {
    label: string;
    route: string;
  };
}

// ==================== TEMPLATES ====================
export interface PTFMaterial {
  materialId: string;
  quantity: number;
  optional?: boolean;
}

export interface PTFTool {
  toolId: string;
  quantity: number;
}

export interface PTF {
  id: string;
  code: string;
  name: string;
  description: string;
  items: string[];
  serviceType: string;
  materials: PTFMaterial[];
  tools: PTFTool[];
  createdAt: string;
}

export interface PETRole {
  role: string;
  quantity: number;
  shab?: string[];
  minRating?: number;
}

export interface PET {
  id: string;
  code: string;
  name: string;
  description: string;
  equipment: string[];
  roles: PETRole[];
  requirements: string[];
  createdAt: string;
}

export interface PGDDocument {
  name: string;
  required: boolean;
  clientVisible: boolean;
  officeManaged: boolean;
}

export interface PGD {
  id: string;
  code: string;
  name: string;
  description: string;
  guidelines: string[];
  serviceType: string;
  documents: PGDDocument[];
  createdAt: string;
}

// Update PIC interface with additional properties
export interface PIC {
  id: string;
  clientId: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  isPrimary: boolean;
  preferences?: {
    notifications: boolean;
    language: string;
  };
  serviceType?: string;
  content?: string;
  whatsappTemplate?: string;
}
