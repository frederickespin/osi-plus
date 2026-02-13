// ============================================
// MÓDULO DE EXPERIENCIA DEL CLIENTE
// Gestión de expectativas, comunicación y evaluación
// ============================================

// ============================================
// CLIENTE
// ============================================

export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  alternatePhone?: string;
  address: string;
  company?: string;
  rfc?: string; // Registro Fiscal
  createdAt: Date;
  projects: string[]; // IDs de proyectos
  rating?: number; // Calificación promedio del cliente (puntualidad, preparación)
  notes?: string;
}

// ============================================
// PLANTILLAS DE INSTRUCCIONES AL CLIENTE (PIC)
// ============================================

export interface ClientInstructionTemplate {
  id: string;
  templateId: string; // ej. PIC-MUDANZA-INT
  name: string;
  serviceType: ServiceType;
  version: number;
  createdBy: string; // User ID (K)
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  content: PICContent;
}

export type ServiceType = 
  | 'MUDANZA_LOCAL'
  | 'MUDANZA_NACIONAL'
  | 'MUDANZA_INTERNACIONAL'
  | 'OBRAS_DE_ARTE'
  | 'EMPAQUE'
  | 'ALMACENAJE';

export interface PICContent {
  generalProcedure: string; // Procedimiento paso a paso
  rightsAndDuties: string; // Derechos y deberes del cliente
  specialCare: string; // Cuidados específicos
  preparationChecklist: ChecklistItem[]; // Lista de preparativos
  contactInfo: {
    emergencyPhone: string;
    supportEmail: string;
    coordinatorName: string;
  };
}

export interface ChecklistItem {
  id: string;
  text: string;
  required: boolean;
  category: 'ANTES' | 'DURANTE' | 'DESPUES';
}

// Historial de versiones PIC enviadas a proyectos
export interface PICProjectVersion {
  id: string;
  projectId: string;
  templateId: string;
  version: number;
  content: PICContent;
  sentAt: Date;
  sentBy: string; // K
}

// ============================================
// PAQUETE DE BIENVENIDA DIGITAL
// ============================================

export interface WelcomePackage {
  id: string;
  projectId: string;
  osiId: string;
  clientId: string;
  sentAt: Date;
  sentVia: ('WHATSAPP' | 'EMAIL')[];
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ';
  content: WelcomePackageContent;
  trackingLink: string; // https://osi-plus.com/track/[Project_Hash]
  qrSecurityToken: string; // Token único por proyecto
}

export interface WelcomePackageContent {
  blockA: PICContent; // Guía del servicio
  blockB: TeamInfoBlock; // Seguridad y control
  blockC: TrackingInfo; // Rastreo en vivo
}

export interface TeamInfoBlock {
  supervisor?: TeamMember;
  driver?: TeamMember;
  fieldWorkers: TeamMember[];
  qrSecurity: {
    token: string;
    instructions: string;
    validFrom: Date;
    validUntil: Date;
  };
}

export interface TeamMember {
  userId: string;
  name: string;
  role: string;
  roleCode: string;
  photo: string;
  rating: number;
  experience: string;
}

export interface TrackingInfo {
  link: string;
  projectHash: string;
  expiresAt: Date;
  states: TrackingState[];
}

export interface TrackingState {
  state: TrackingStateType;
  label: string;
  description: string;
  active: boolean;
  activatedAt?: Date;
  activatedBy?: string;
  location?: GeoLocation;
}

export type TrackingStateType = 
  | 'DESPACHO'      // Camión saliendo de instalaciones
  | 'EN_RUTA'       // En camino al domicilio
  | 'EN_SITIO'      // Personal trabajando
  | 'RETORNO'       // Regreso a bodega
  | 'CIERRE';       // Equipo de regreso en base

export interface GeoLocation {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: Date;
}

// ============================================
// RASTREO EN VIVO (UBERIZACIÓN)
// ============================================

export interface LiveTracking {
  id: string;
  projectId: string;
  osiId: string;
  isActive: boolean;
  currentState: TrackingStateType;
  driverLocation?: GeoLocation;
  route: GeoLocation[]; // Historial de posiciones
  estimatedArrival?: Date;
  startedAt: Date;
  endedAt?: Date;
  privacyEnabled: boolean; // Se desactiva fuera de horario
}

// ============================================
// EVALUACIÓN NPS
// ============================================

export interface ClientEvaluation {
  id: string;
  projectId: string;
  osiId: string;
  clientId: string;
  status: EvaluationStatus;
  createdAt: Date;
  sentAt?: Date;
  completedAt?: Date;
  isManualRelease: boolean; // Liberado manualmente por B
  releasedBy?: string; // User ID (B)
  releasedAt?: Date;
  ratings: EvaluationRatings;
  comments?: string;
  npsScore?: number; // 0-10 Net Promoter Score
}

export type EvaluationStatus = 
  | 'PENDING'       // Esperando liberación
  | 'SENT'          // Enviado al cliente
  | 'AVAILABLE'     // Disponible para completar
  | 'COMPLETED'     // Completado
  | 'EXPIRED';      // Expirado sin respuesta

export interface EvaluationRatings {
  overall: number; // 1-5 estrellas
  supervisor: number; // Evaluación al rol D
  fieldWorkers: number; // Evaluación al rol N
  coordination: number; // Evaluación al rol K
  punctuality: number; // Puntualidad
  care: number; // Cuidado de bienes
  communication: number; // Comunicación
}

// Impacto en RRHH
export interface EvaluationImpact {
  evaluationId: string;
  userId: string;
  userName: string;
  role: string;
  ratingReceived: number;
  bonusImpact: number; // Monto o puntos de bono
  recordedAt: Date;
}

// ============================================
// QR DE SEGURIDAD
// ============================================

export interface SecurityQR {
  id: string;
  projectId: string;
  osiId: string;
  token: string;
  type: 'ARRIVAL' | 'DEPARTURE' | 'DAILY';
  generatedAt: Date;
  validFrom: Date;
  validUntil: Date;
  scannedBy?: string; // User ID
  scannedAt?: Date;
  scanLocation?: GeoLocation;
  isValid: boolean;
}

// ============================================
// COMUNICACIONES AUTOMATIZADAS
// ============================================

export interface AutomatedCommunication {
  id: string;
  projectId: string;
  type: CommunicationType;
  trigger: CommunicationTrigger;
  status: 'PENDING' | 'SENT' | 'FAILED';
  sentAt?: Date;
  channel: ('WHATSAPP' | 'EMAIL' | 'SMS')[];
  recipient: string;
  content: string;
}

export type CommunicationType = 
  | 'WELCOME_PACKAGE'
  | 'TEAM_ASSIGNED'
  | 'ON_THE_WAY'
  | 'ARRIVED'
  | 'WORK_COMPLETED'
  | 'EVALUATION_REQUEST'
  | 'THANK_YOU';

export type CommunicationTrigger = 
  | 'OSI_ASSIGNED'           // B asigna OSI
  | 'DRIVER_DEPARTURE'       // G valida salida
  | 'SUPERVISOR_ARRIVAL'     // D escanea QR de llegada
  | 'SERVICE_COMPLETED'      // D marca fin de servicio
  | 'MANUAL_RELEASE'         // B libera evaluación
  | 'SCHEDULED';             // Programado

// ============================================
// DASHBOARD DEL CLIENTE (VISTA PÚBLICA)
// ============================================

export interface ClientDashboard {
  projectId: string;
  clientName: string;
  serviceType: ServiceType;
  scheduledDate: Date;
  team: TeamMember[];
  currentStatus: TrackingStateType;
  tracking: LiveTracking;
  instructions: PICContent;
  evaluationAvailable: boolean;
  evaluation?: ClientEvaluation;
  documents: ClientDocument[];
}

export interface ClientDocument {
  id: string;
  name: string;
  type: 'CONTRACT' | 'INVENTORY' | 'INSURANCE' | 'INVOICE' | 'OTHER';
  url: string;
  uploadedAt: Date;
  status: 'PENDING' | 'SIGNED' | 'VERIFIED';
}
