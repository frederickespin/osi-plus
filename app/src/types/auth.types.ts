// ============================================
// SISTEMA DE AUTENTICACIÓN Y ROLES (RBAC)
// ============================================

import type { Role } from './osi.types';

// ============================================
// USUARIO AUTENTICADO
// ============================================

export interface AuthUser {
  uid: string;
  email: string;
  name: string;
  role: Role;
  roleName: string;
  avatar?: string;
  isActive: boolean;
  permissions: Permission[];
  lastLoginAt?: Date;
  createdAt: Date;
  tenantId: string;
  shab?: string[]; // Habilidades especiales
}

// ============================================
// PERMISOS DEL SISTEMA
// ============================================

export type Permission =
  // Admin (A)
  | 'admin:full_access'
  | 'admin:users:create'
  | 'admin:users:edit'
  | 'admin:users:delete'
  | 'admin:config:system'
  | 'admin:config:billing'
  | 'admin:security:incidents'
  | 'admin:audit:logs'
  
  // Coordinador (K)
  | 'k:projects:create'
  | 'k:projects:edit'
  | 'k:clients:manage'
  | 'k:planning:nesting'
  | 'k:templates:pgd'
  | 'k:templates:pic'
  
  // Operaciones (B)
  | 'b:osi:create'
  | 'b:osi:edit'
  | 'b:osi:close'
  | 'b:resources:assign'
  | 'b:wall:view'
  | 'b:documents:validate'
  
  // Materiales (C)
  | 'c:inventory:view'
  | 'c:inventory:edit'
  | 'c:purchases:approve'
  | 'c:ptf:manage'
  | 'c:smartmatch:validate'
  
  // Despachador (C1)
  | 'c1:handshake:execute'
  | 'c1:quarantine:manage'
  | 'c1:audit:returns'
  
  // Supervisor (D)
  | 'd:team:evaluate'
  | 'd:checkin:client'
  | 'd:checkout:client'
  | 'd:documents:collect'
  | 'd:eco:register'
  
  // Chofer (E)
  | 'e:route:view'
  | 'e:custody:handover'
  | 'e:vehicle:report'
  | 'e:documents:receive'
  
  // Portero (G)
  | 'g:gate:validate'
  | 'g:incident:report'
  | 'g:seal:verify'
  
  // RRHH (I)
  | 'i:kpi:view'
  | 'i:kpi:edit'
  | 'i:nota:process'
  | 'i:badges:assign'
  | 'i:users:reactivate'
  
  // Carpintero (PA)
  | 'pa:crating:execute'
  | 'pa:labels:generate'
  | 'pa:fumigation:request'
  
  // Mecánico (PB)
  | 'pb:maintenance:execute'
  | 'pb:parts:request'
  | 'pb:vehicle:diagnose'
  
  // Personal de Campo (N)
  | 'n:profile:view'
  | 'n:tasks:view';

// ============================================
// CONFIGURACIÓN DE RUTAS POR ROL
// ============================================

export interface RoleRoute {
  path: string;
  label: string;
  icon: string;
  default?: boolean;
}

export const ROLE_ROUTES: Record<Role, RoleRoute[]> = {
  'A': [
    { path: '/admin/dashboard', label: 'Torre de Control', icon: 'layout-dashboard', default: true },
    { path: '/admin/users', label: 'Usuarios', icon: 'users' },
    { path: '/admin/billing', label: 'Tarifas NOTA', icon: 'dollar-sign' },
    { path: '/admin/fleet', label: 'Flota', icon: 'truck' },
    { path: '/admin/security', label: 'Seguridad', icon: 'shield' },
    { path: '/admin/audit', label: 'Auditoría', icon: 'file-text' },
  ],
  'V': [
    { path: '/planning/clients', label: 'Clientes', icon: 'users', default: true },
    { path: '/planning/projects', label: 'Proyectos', icon: 'folder' },
    { path: '/planning/templates', label: 'Plantillas', icon: 'file-text' },
  ],
  'K': [
    { path: '/planning/projects', label: 'Proyectos', icon: 'folder', default: true },
    { path: '/planning/clients', label: 'Clientes', icon: 'users' },
    { path: '/planning/nesting', label: 'Nesting', icon: 'box' },
    { path: '/planning/templates', label: 'Plantillas', icon: 'file-text' },
  ],
  'B': [
    { path: '/operations/wall', label: 'Muro de Liquidación', icon: 'layout', default: true },
    { path: '/operations/osis', label: 'Órdenes OSI', icon: 'clipboard-list' },
    { path: '/operations/calendar', label: 'Calendario', icon: 'calendar' },
    { path: '/operations/resources', label: 'Recursos', icon: 'users' },
  ],
  'C': [
    { path: '/inventory/materials', label: 'Materiales', icon: 'package', default: true },
    { path: '/inventory/assets', label: 'Activos', icon: 'wrench' },
    { path: '/inventory/wood', label: 'Cajas Madera', icon: 'box' },
    { path: '/inventory/purchases', label: 'Compras', icon: 'shopping-cart' },
  ],
  'C1': [
    { path: '/dispatch/handshake', label: 'Handshake', icon: 'scan', default: true },
    { path: '/dispatch/quarantine', label: 'Cuarentena', icon: 'alert-triangle' },
    { path: '/dispatch/returns', label: 'Retornos', icon: 'arrow-left' },
  ],
  'D': [
    { path: '/supervisor/dashboard', label: 'Servicio Actual', icon: 'clipboard', default: true },
    { path: '/supervisor/team', label: 'Mi Equipo', icon: 'users' },
    { path: '/supervisor/documents', label: 'Documentos', icon: 'file-text' },
    { path: '/supervisor/eco', label: 'Ecológico', icon: 'leaf' },
  ],
  'E': [
    { path: '/driver/route', label: 'Mi Ruta', icon: 'navigation', default: true },
    { path: '/driver/custody', label: 'Custodia', icon: 'shield' },
    { path: '/driver/vehicle', label: 'Mi Camión', icon: 'truck' },
    { path: '/driver/report', label: 'Reportar Falla', icon: 'alert-triangle' },
  ],
  'G': [
    { path: '/security/scan', label: 'Escanear', icon: 'scan', default: true },
    { path: '/security/incidents', label: 'Incidentes', icon: 'alert-triangle' },
    { path: '/security/history', label: 'Historial', icon: 'history' },
  ],
  'N': [
    { path: '/field/profile', label: 'Mi Perfil', icon: 'user', default: true },
    { path: '/field/tasks', label: 'Mis Tareas', icon: 'clipboard-list' },
    { path: '/field/points', label: 'Puntos', icon: 'award' },
  ],
  'PA': [
    { path: '/crating/orders', label: 'Órdenes', icon: 'hammer', default: true },
    { path: '/crating/cutlist', label: 'Planos', icon: 'ruler' },
    { path: '/crating/labels', label: 'Etiquetas', icon: 'qr-code' },
  ],
  'PB': [
    { path: '/mechanic/dashboard', label: 'Dashboard', icon: 'wrench', default: true },
    { path: '/mechanic/tickets', label: 'Tickets', icon: 'clipboard-list' },
    { path: '/mechanic/fleet', label: 'Flota', icon: 'truck' },
    { path: '/mechanic/parts', label: 'Repuestos', icon: 'package' },
  ],
  'PC': [
    { path: '/field/tasks', label: 'Mis Tareas', icon: 'clipboard-list', default: true },
    { path: '/field/profile', label: 'Mi Perfil', icon: 'user' },
  ],
  'PD': [
    { path: '/maintenance/dashboard', label: 'Dashboard', icon: 'wrench', default: true },
    { path: '/maintenance/tickets', label: 'Tickets', icon: 'clipboard-list' },
  ],
  'PF': [
    { path: '/field/tasks', label: 'Mis Tareas', icon: 'clipboard-list', default: true },
    { path: '/field/profile', label: 'Mi Perfil', icon: 'user' },
  ],
  'I': [
    { path: '/hr/dashboard', label: 'Dashboard', icon: 'users', default: true },
    { path: '/hr/kpi', label: 'KPIs', icon: 'trending-up' },
    { path: '/hr/nota', label: 'NOTA', icon: 'dollar-sign' },
    { path: '/hr/badges', label: 'Insignias', icon: 'award' },
  ],
  'PE': [
    { path: '/supervisor/dashboard', label: 'Servicio (Suplente)', icon: 'clipboard', default: true },
    { path: '/supervisor/team', label: 'Mi Equipo', icon: 'users' },
  ],
  'RB': [
    { path: '/review/dashboard', label: 'Evaluaciones', icon: 'clipboard-check', default: true },
    { path: '/review/reviews', label: 'Revisiones', icon: 'star' },
  ],
};

// ============================================
// TEMAS POR ROL
// ============================================

export interface RoleTheme {
  mode: 'light' | 'high-contrast';
  primaryColor: string;
  accentColor: string;
  alertColor: string;
  successColor: string;
  backgroundColor: string;
  textColor: string;
}

export const ROLE_THEMES: Record<Role, RoleTheme> = {
  'A': {
    mode: 'light',
    primaryColor: '#003366',
    accentColor: '#D4AF37',
    alertColor: '#D32F2F',
    successColor: '#388E3C',
    backgroundColor: '#FFFFFF',
    textColor: '#1f2937',
  },
  'B': {
    mode: 'light',
    primaryColor: '#003366',
    accentColor: '#D4AF37',
    alertColor: '#D32F2F',
    successColor: '#388E3C',
    backgroundColor: '#FFFFFF',
    textColor: '#1f2937',
  },
  'V': {
    mode: 'light',
    primaryColor: '#1d4ed8',
    accentColor: '#EFB810',
    alertColor: '#D32F2F',
    successColor: '#388E3C',
    backgroundColor: '#FFFFFF',
    textColor: '#1f2937',
  },
  'K': {
    mode: 'light',
    primaryColor: '#7c3aed',
    accentColor: '#EFB810',
    alertColor: '#D32F2F',
    successColor: '#388E3C',
    backgroundColor: '#FFFFFF',
    textColor: '#1f2937',
  },
  'C': {
    mode: 'light',
    primaryColor: '#0891b2',
    accentColor: '#EFB810',
    alertColor: '#D32F2F',
    successColor: '#388E3C',
    backgroundColor: '#FFFFFF',
    textColor: '#1f2937',
  },
  'C1': {
    mode: 'high-contrast',
    primaryColor: '#059669',
    accentColor: '#EFB810',
    alertColor: '#D32F2F',
    successColor: '#388E3C',
    backgroundColor: '#FFFFFF',
    textColor: '#000000',
  },
  'D': {
    mode: 'high-contrast',
    primaryColor: '#ea580c',
    accentColor: '#EFB810',
    alertColor: '#D32F2F',
    successColor: '#388E3C',
    backgroundColor: '#FFFFFF',
    textColor: '#000000',
  },
  'E': {
    mode: 'high-contrast',
    primaryColor: '#ca8a04',
    accentColor: '#EFB810',
    alertColor: '#D32F2F',
    successColor: '#388E3C',
    backgroundColor: '#FFFFFF',
    textColor: '#000000',
  },
  'G': {
    mode: 'high-contrast',
    primaryColor: '#65a30d',
    accentColor: '#EFB810',
    alertColor: '#D32F2F',
    successColor: '#388E3C',
    backgroundColor: '#FFFFFF',
    textColor: '#000000',
  },
  'N': {
    mode: 'high-contrast',
    primaryColor: '#6b7280',
    accentColor: '#EFB810',
    alertColor: '#D32F2F',
    successColor: '#388E3C',
    backgroundColor: '#FFFFFF',
    textColor: '#000000',
  },
  'PA': {
    mode: 'high-contrast',
    primaryColor: '#92400e',
    accentColor: '#EFB810',
    alertColor: '#D32F2F',
    successColor: '#388E3C',
    backgroundColor: '#FFFFFF',
    textColor: '#000000',
  },
  'PB': {
    mode: 'high-contrast',
    primaryColor: '#dc2626',
    accentColor: '#EFB810',
    alertColor: '#991b1b',
    successColor: '#388E3C',
    backgroundColor: '#FFFFFF',
    textColor: '#000000',
  },
  'PC': {
    mode: 'high-contrast',
    primaryColor: '#0f766e',
    accentColor: '#EFB810',
    alertColor: '#D32F2F',
    successColor: '#388E3C',
    backgroundColor: '#FFFFFF',
    textColor: '#000000',
  },
  'PD': {
    mode: 'high-contrast',
    primaryColor: '#b45309',
    accentColor: '#EFB810',
    alertColor: '#D32F2F',
    successColor: '#388E3C',
    backgroundColor: '#FFFFFF',
    textColor: '#000000',
  },
  'PF': {
    mode: 'high-contrast',
    primaryColor: '#2563eb',
    accentColor: '#EFB810',
    alertColor: '#D32F2F',
    successColor: '#388E3C',
    backgroundColor: '#FFFFFF',
    textColor: '#000000',
  },
  'I': {
    mode: 'light',
    primaryColor: '#0891b2',
    accentColor: '#EFB810',
    alertColor: '#D32F2F',
    successColor: '#388E3C',
    backgroundColor: '#FFFFFF',
    textColor: '#1f2937',
  },
  'PE': {
    mode: 'high-contrast',
    primaryColor: '#ea580c',
    accentColor: '#EFB810',
    alertColor: '#D32F2F',
    successColor: '#388E3C',
    backgroundColor: '#FFFFFF',
    textColor: '#000000',
  },
  'RB': {
    mode: 'light',
    primaryColor: '#6366f1',
    accentColor: '#EFB810',
    alertColor: '#D32F2F',
    successColor: '#388E3C',
    backgroundColor: '#FFFFFF',
    textColor: '#1f2937',
  },
};

// ============================================
// HANDSHAKE DIGITAL
// ============================================

export interface HandshakePayload {
  type: 'TRANS';
  osiId: string;
  senderId: string;
  senderRole: string;
  receiverId?: string;
  timestamp: number;
  itemsHash: string;
  items: HandshakeItem[];
}

export interface HandshakeItem {
  type: 'asset' | 'material' | 'wood_box';
  id: string;
  name: string;
  quantity: number;
  condition: 'good' | 'damaged' | 'missing';
}

// ============================================
// SESIÓN Y ESTADO DE AUTENTICACIÓN
// ============================================

export interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  user?: AuthUser;
  error?: string;
  redirectTo?: string;
}
