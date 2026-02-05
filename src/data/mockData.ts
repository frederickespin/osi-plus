// OSi-plus ERP - Mock Data
import type { 
  User, Client, Project, OSI, Vehicle, NOTA, CustodyHandshake,
  WarehouseLocation, InventoryItem, WoodBox, NPSSurvey, Badge,
  CalendarEvent, PurchaseRequest, Notification, RoleDefinition,
  PIC, MaintenanceRecord, InventoryMove, KPIRecord, PTF, PET, PGD
} from '@/types/osi.types';

// ==================== ROLE DEFINITIONS ====================
export const roleDefinitions: RoleDefinition[] = [
  { code: 'A', name: 'Administrador', description: 'Control total del sistema', permissions: ['all'], isMobile: false },
  { code: 'K', name: 'Key Account', description: 'Gestión comercial y clientes', permissions: ['clients', 'pics', 'quotes'], isMobile: false },
  { code: 'B', name: 'Backoffice', description: 'Logística central y planificación', permissions: ['operations', 'wall', 'fleet'], isMobile: false },
  { code: 'C', name: 'Control WMS', description: 'Gestión de inventario y almacén', permissions: ['wms', 'inventory', 'moves'], isMobile: false },
  { code: 'C1', name: 'Despachador', description: 'Despacho y handshakes', permissions: ['dispatch', 'handshakes', 'qr'], isMobile: true },
  { code: 'D', name: 'Supervisor', description: 'Supervisión de campo', permissions: ['supervise', 'tasks', 'team'], isMobile: true },
  { code: 'E', name: 'Chofer', description: 'Conducción y transporte', permissions: ['drive', 'vehicle', 'route'], isMobile: true },
  { code: 'G', name: 'Portería', description: 'Control de acceso y seguridad', permissions: ['access', 'checkin', 'checkout'], isMobile: true },
  { code: 'N', name: 'Personal de Campo', description: 'Operaciones de mudanza', permissions: ['tasks', 'profile', 'points'], isMobile: true },
  { code: 'PA', name: 'Carpintero', description: 'Embalaje y cajas de madera', permissions: ['crating', 'wood', 'nesting'], isMobile: true },
  { code: 'PB', name: 'Mecánico', description: 'Mantenimiento de flota', permissions: ['maintenance', 'vehicles', 'repairs'], isMobile: true },
  { code: 'I', name: 'RRHH', description: 'Gestión de personal', permissions: ['hr', 'kpi', 'payroll', 'badges'], isMobile: false },
  { code: 'PE', name: 'Petty Cash', description: 'Gastos menores', permissions: ['expenses', 'pettycash'], isMobile: false },
  { code: 'RB', name: 'Review Board', description: 'Evaluaciones 360°', permissions: ['evaluations', 'reviews'], isMobile: false },
];

// ==================== USERS ====================
export const mockUsers: User[] = [
  { id: 'U001', code: 'EMP001', name: 'Carlos Rodríguez', email: 'carlos@ipackers.com', phone: '+591 70000001', role: 'A', status: 'active', department: 'Administración', joinDate: '2020-01-15', points: 1250, rating: 4.8 },
  { id: 'U002', code: 'EMP002', name: 'María González', email: 'maria@ipackers.com', phone: '+591 70000002', role: 'K', status: 'active', department: 'Comercial', joinDate: '2020-03-20', points: 980, rating: 4.7 },
  { id: 'U003', code: 'EMP003', name: 'Juan Pérez', email: 'juan@ipackers.com', phone: '+591 70000003', role: 'B', status: 'active', department: 'Operaciones', joinDate: '2019-06-10', points: 1100, rating: 4.6 },
  { id: 'U004', code: 'EMP004', name: 'Ana López', email: 'ana@ipackers.com', phone: '+591 70000004', role: 'C', status: 'active', department: 'Almacén', joinDate: '2021-02-01', points: 850, rating: 4.5 },
  { id: 'U005', code: 'EMP005', name: 'Pedro Mamani', email: 'pedro@ipackers.com', phone: '+591 70000005', role: 'C1', status: 'active', department: 'Despacho', joinDate: '2021-08-15', points: 720, rating: 4.4 },
  { id: 'U006', code: 'EMP006', name: 'Luis Torres', email: 'luis@ipackers.com', phone: '+591 70000006', role: 'D', status: 'active', department: 'Campo', joinDate: '2018-11-20', points: 1350, rating: 4.9 },
  { id: 'U007', code: 'EMP007', name: 'Roberto Sánchez', email: 'roberto@ipackers.com', phone: '+591 70000007', role: 'E', status: 'active', department: 'Transporte', joinDate: '2019-04-05', points: 1050, rating: 4.6 },
  { id: 'U008', code: 'EMP008', name: 'Diego Vega', email: 'diego@ipackers.com', phone: '+591 70000008', role: 'G', status: 'active', department: 'Seguridad', joinDate: '2020-07-12', points: 680, rating: 4.3 },
  { id: 'U009', code: 'EMP009', name: 'Miguel Ángel', email: 'miguel@ipackers.com', phone: '+591 70000009', role: 'N', status: 'active', department: 'Campo', joinDate: '2022-01-10', points: 450, rating: 4.2 },
  { id: 'U010', code: 'EMP010', name: 'José Carpintero', email: 'jose@ipackers.com', phone: '+591 70000010', role: 'PA', status: 'active', department: 'Carpintería', joinDate: '2019-09-15', skills: ['PA', 'PC'], points: 1200, rating: 4.8 },
  { id: 'U011', code: 'EMP011', name: 'Fernando Mecánico', email: 'fernando@ipackers.com', phone: '+591 70000011', role: 'PB', status: 'active', department: 'Mantenimiento', joinDate: '2018-05-20', skills: ['PB', 'PF'], points: 1150, rating: 4.7 },
  { id: 'U012', code: 'EMP012', name: 'Laura HR', email: 'laura@ipackers.com', phone: '+591 70000012', role: 'I', status: 'active', department: 'RRHH', joinDate: '2020-02-28', points: 920, rating: 4.6 },
];

// ==================== CLIENTS ====================
export const mockClients: Client[] = [
  { id: 'C001', code: 'CLI001', name: 'Minera Los Andes S.A.', email: 'contacto@losandes.com', phone: '+591 2100001', address: 'Av. Arce #1234, La Paz', type: 'corporate', status: 'active', totalServices: 15, lastService: '2024-01-15', createdAt: '2020-01-10' },
  { id: 'C002', code: 'CLI002', name: 'Banco Nacional', email: 'logistica@bnacional.com', phone: '+591 2100002', address: 'Calle Comercio #567, La Paz', type: 'corporate', status: 'active', totalServices: 32, lastService: '2024-01-20', createdAt: '2019-05-15' },
  { id: 'C003', code: 'CLI003', name: 'Embajada de EE.UU.', email: 'facilities@usembassy.gov', phone: '+591 2100003', address: 'Av. Arce #9200, La Paz', type: 'government', status: 'active', totalServices: 8, lastService: '2024-01-10', createdAt: '2021-03-20' },
  { id: 'C004', code: 'CLI004', name: 'Juan Carlos Méndez', email: 'jcmendez@gmail.com', phone: '+591 7000010', address: 'Calle 21 de Calacoto #456, La Paz', type: 'individual', status: 'active', totalServices: 2, lastService: '2023-12-20', createdAt: '2023-06-15' },
  { id: 'C005', code: 'CLI005', name: 'TechBolivia S.R.L.', email: 'admin@techbolivia.com', phone: '+591 2100005', address: 'Edif. Torre Azul, Piso 12, La Paz', type: 'corporate', status: 'active', totalServices: 5, lastService: '2024-01-18', createdAt: '2022-08-10' },
];

// ==================== PICS ====================
export const mockPICs: PIC[] = [
  { id: 'PIC001', clientId: 'C001', name: 'Engineer Rodrigo Vargas', email: 'rvargas@losandes.com', phone: '+591 7100001', role: 'Gerente de Logística', isPrimary: true, preferences: { notifications: true, language: 'es' } },
  { id: 'PIC002', clientId: 'C001', name: 'Lic. Patricia Flores', email: 'pflores@losandes.com', phone: '+591 7100002', role: 'Asistente Administrativa', isPrimary: false, preferences: { notifications: true, language: 'es' } },
  { id: 'PIC003', clientId: 'C002', name: 'Dr. Carlos Montoya', email: 'cmontoya@bnacional.com', phone: '+591 7100003', role: 'Director de Operaciones', isPrimary: true, preferences: { notifications: true, language: 'es' } },
  { id: 'PIC004', clientId: 'C003', name: 'John Smith', email: 'smithj@state.gov', phone: '+591 7100004', role: 'Facilities Manager', isPrimary: true, preferences: { notifications: true, language: 'en' } },
  { id: 'PIC005', clientId: 'C004', name: 'Juan Carlos Méndez', email: 'jcmendez@gmail.com', phone: '+591 7100005', role: 'Cliente', isPrimary: true, preferences: { notifications: true, language: 'es' } },
];

// ==================== PROJECTS ====================
export const mockProjects: Project[] = [
  { id: 'P001', code: 'PRJ-2024-001', name: 'Relocalización Oficinas Corporativas', clientId: 'C001', clientName: 'Minera Los Andes S.A.', status: 'active', startDate: '2024-01-01', osiCount: 5, totalValue: 45000, assignedTo: 'U002', notes: 'Proyecto de mudanza de oficinas centrales' },
  { id: 'P002', code: 'PRJ-2024-002', name: 'Renovación Sucursales Banco', clientId: 'C002', clientName: 'Banco Nacional', status: 'active', startDate: '2024-01-15', osiCount: 12, totalValue: 120000, assignedTo: 'U002', notes: 'Renovación de 12 sucursales a nivel nacional' },
  { id: 'P003', code: 'PRJ-2024-003', name: 'Mudanza Residencial', clientId: 'C004', clientName: 'Juan Carlos Méndez', status: 'completed', startDate: '2023-12-01', endDate: '2023-12-20', osiCount: 1, totalValue: 3500, assignedTo: 'U002', notes: 'Mudanza residencial completa' },
  { id: 'P004', code: 'PRJ-2024-004', name: 'Traslado Archivos Históricos', clientId: 'C003', clientName: 'Embajada de EE.UU.', status: 'active', startDate: '2024-02-01', osiCount: 3, totalValue: 25000, assignedTo: 'U002', notes: 'Traslado de documentos clasificados' },
  { id: 'P005', code: 'PRJ-2024-005', name: 'Implementación Nuevas Oficinas', clientId: 'C005', clientName: 'TechBolivia S.R.L.', status: 'pending', startDate: '2024-03-01', osiCount: 2, totalValue: 15000, assignedTo: 'U002', notes: 'Mudanza e instalación de equipos tecnológicos' },
];

// ==================== OSIs ====================
export const mockOSIs: OSI[] = [
  { id: 'OSI001', code: 'OSI-2024-001', projectId: 'P001', projectCode: 'PRJ-2024-001', clientId: 'C001', clientName: 'Minera Los Andes S.A.', status: 'completed', type: 'local', origin: 'Av. Arce #1234, La Paz', destination: 'Calle Loayza #500, La Paz', scheduledDate: '2024-01-15', createdAt: '2024-01-05', assignedTo: 'U006', team: ['U009', 'U010'], vehicles: ['V001'], value: 8500, notes: 'Mudanza de mobiliario de oficina' },
  { id: 'OSI002', code: 'OSI-2024-002', projectId: 'P001', projectCode: 'PRJ-2024-001', clientId: 'C001', clientName: 'Minera Los Andes S.A.', status: 'in_transit', type: 'local', origin: 'Av. Arce #1234, La Paz', destination: 'Calle Loayza #500, La Paz', scheduledDate: '2024-01-20', createdAt: '2024-01-10', assignedTo: 'U006', team: ['U009', 'U010'], vehicles: ['V002'], value: 12000, notes: 'Equipos de cómputo y servidores' },
  { id: 'OSI003', code: 'OSI-2024-003', projectId: 'P002', projectCode: 'PRJ-2024-002', clientId: 'C002', clientName: 'Banco Nacional', status: 'assigned', type: 'national', origin: 'La Paz', destination: 'Santa Cruz', scheduledDate: '2024-01-25', createdAt: '2024-01-12', assignedTo: 'U006', team: ['U009'], vehicles: ['V003'], value: 15000, notes: 'Traslado de caja fuerte' },
  { id: 'OSI004', code: 'OSI-2024-004', projectId: 'P002', projectCode: 'PRJ-2024-002', clientId: 'C002', clientName: 'Banco Nacional', status: 'in_preparation', type: 'local', origin: 'Sucursal Miraflores, La Paz', destination: 'Sucursal Sopocachi, La Paz', scheduledDate: '2024-01-28', createdAt: '2024-01-15', assignedTo: 'U006', team: ['U009', 'U010'], vehicles: ['V001'], value: 8000, notes: 'Mobiliario bancario' },
  { id: 'OSI005', code: 'OSI-2024-005', projectId: 'P004', projectCode: 'PRJ-2024-004', clientId: 'C003', clientName: 'Embajada de EE.UU.', status: 'pending_assignment', type: 'local', origin: 'Av. Arce #9200, La Paz', destination: 'Zona Sur, La Paz', scheduledDate: '2024-02-05', createdAt: '2024-01-20', value: 18000, notes: 'Documentos confidenciales' },
  { id: 'OSI006', code: 'OSI-2024-006', projectId: 'P005', projectCode: 'PRJ-2024-005', clientId: 'C005', clientName: 'TechBolivia S.R.L.', status: 'draft', type: 'local', origin: 'Edif. Torre Azul, La Paz', destination: 'San Pedro, La Paz', scheduledDate: '2024-03-05', createdAt: '2024-01-22', value: 7500, notes: 'Equipos tecnológicos sensibles' },
  { id: 'OSI007', code: 'OSI-2024-007', projectId: 'P002', projectCode: 'PRJ-2024-002', clientId: 'C002', clientName: 'Banco Nacional', status: 'liquidation', type: 'local', origin: 'El Alto', destination: 'La Paz', scheduledDate: '2024-01-10', createdAt: '2024-01-02', assignedTo: 'U006', team: ['U009'], vehicles: ['V002'], value: 5000, notes: 'Archivos históricos' },
  { id: 'OSI008', code: 'OSI-2024-008', projectId: 'P002', projectCode: 'PRJ-2024-002', clientId: 'C002', clientName: 'Banco Nacional', status: 'completed', type: 'local', origin: 'Zona Sur', destination: 'Miraflores', scheduledDate: '2024-01-08', createdAt: '2024-01-01', assignedTo: 'U006', team: ['U009', 'U010'], vehicles: ['V001'], value: 6500, notes: 'Muebles de oficina' },
];

// ==================== VEHICLES ====================
export const mockVehicles: Vehicle[] = [
  { id: 'V001', code: 'VH-001', plate: 'ABC-123', type: 'Camión 5 Ton', brand: 'Mercedes-Benz', model: 'Actros', year: 2020, capacity: 5000, status: 'in_use', lastMaintenance: '2024-01-01', nextMaintenance: '2024-02-01', assignedDriver: 'U007', mileage: 45000 },
  { id: 'V002', code: 'VH-002', plate: 'DEF-456', type: 'Camión 3 Ton', brand: 'Volvo', model: 'FL', year: 2021, capacity: 3000, status: 'in_use', lastMaintenance: '2024-01-10', nextMaintenance: '2024-02-10', assignedDriver: 'U007', mileage: 32000 },
  { id: 'V003', code: 'VH-003', plate: 'GHI-789', type: 'Camión 10 Ton', brand: 'Scania', model: 'P-series', year: 2019, capacity: 10000, status: 'available', lastMaintenance: '2024-01-05', nextMaintenance: '2024-02-05', mileage: 68000 },
  { id: 'V004', code: 'VH-004', plate: 'JKL-012', type: 'Furgón', brand: 'Ford', model: 'Transit', year: 2022, capacity: 1500, status: 'available', lastMaintenance: '2024-01-15', nextMaintenance: '2024-02-15', mileage: 15000 },
  { id: 'V005', code: 'VH-005', plate: 'MNO-345', type: 'Camión 5 Ton', brand: 'Mercedes-Benz', model: 'Atego', year: 2018, capacity: 5000, status: 'maintenance', lastMaintenance: '2024-01-20', nextMaintenance: '2024-01-25', mileage: 85000 },
];

// ==================== MAINTENANCE RECORDS ====================
export const mockMaintenanceRecords: MaintenanceRecord[] = [
  { id: 'M001', vehicleId: 'V001', type: 'preventive', description: 'Cambio de aceite y filtros', cost: 450, date: '2024-01-01', performedBy: 'U011', nextDue: '2024-02-01', status: 'completed' },
  { id: 'M002', vehicleId: 'V005', type: 'corrective', description: 'Reparación de frenos', cost: 1200, date: '2024-01-20', performedBy: 'U011', status: 'in_progress' },
  { id: 'M003', vehicleId: 'V003', type: 'predictive', description: 'Análisis de vibraciones', cost: 300, date: '2024-01-05', performedBy: 'U011', nextDue: '2024-04-05', status: 'completed' },
  { id: 'M004', vehicleId: 'V002', type: 'preventive', description: 'Revisión general', cost: 600, date: '2024-01-10', performedBy: 'U011', nextDue: '2024-02-10', status: 'completed' },
];

// ==================== NOTAs ====================
export const mockNOTAs: NOTA[] = [
  { id: 'N001', code: 'NOTA-2024-001', osiId: 'OSI001', osiCode: 'OSI-2024-001', description: 'Materiales de embalaje adicionales', category: 'materials', amount: 250, currency: 'BOB', requestedBy: 'U006', approvedBy: 'U003', status: 'paid', createdAt: '2024-01-15', paidAt: '2024-01-16' },
  { id: 'N002', code: 'NOTA-2024-002', osiId: 'OSI002', osiCode: 'OSI-2024-002', description: 'Almuerzo equipo de trabajo', category: 'meals', amount: 180, currency: 'BOB', requestedBy: 'U009', approvedBy: 'U006', status: 'approved', createdAt: '2024-01-20' },
  { id: 'N003', code: 'NOTA-2024-003', osiId: 'OSI003', osiCode: 'OSI-2024-003', description: 'Peaje carretera La Paz-Santa Cruz', category: 'transport', amount: 85, currency: 'BOB', requestedBy: 'U007', status: 'pending', createdAt: '2024-01-22' },
  { id: 'N004', code: 'NOTA-2024-004', osiId: 'OSI004', osiCode: 'OSI-2024-004', description: 'Cajas de cartón extra', category: 'materials', amount: 120, currency: 'BOB', requestedBy: 'U010', status: 'pending', createdAt: '2024-01-23' },
];

// ==================== HANDSHAKES ====================
export const mockHandshakes: CustodyHandshake[] = [
  { id: 'H001', code: 'HSK-2024-001', osiId: 'OSI001', osiCode: 'OSI-2024-001', type: 'pickup', fromRole: 'G', fromUserId: 'U008', fromUserName: 'Diego Vega', toRole: 'D', toUserId: 'U006', toUserName: 'Luis Torres', status: 'completed', qrCode: 'QR-HSK-001', location: 'Portería Principal', timestamp: '2024-01-15T08:00:00Z', completedAt: '2024-01-15T08:05:00Z', notes: 'Entrega conforme' },
  { id: 'H002', code: 'HSK-2024-002', osiId: 'OSI001', osiCode: 'OSI-2024-001', type: 'delivery', fromRole: 'D', fromUserId: 'U006', fromUserName: 'Luis Torres', toRole: 'K', toUserId: 'U002', toUserName: 'María González', status: 'completed', qrCode: 'QR-HSK-002', location: 'Oficina Cliente', timestamp: '2024-01-15T14:00:00Z', completedAt: '2024-01-15T14:10:00Z', notes: 'Cliente conforme' },
  { id: 'H003', code: 'HSK-2024-003', osiId: 'OSI002', osiCode: 'OSI-2024-002', type: 'pickup', fromRole: 'G', fromUserId: 'U008', fromUserName: 'Diego Vega', toRole: 'D', toUserId: 'U006', toUserName: 'Luis Torres', status: 'completed', qrCode: 'QR-HSK-003', location: 'Portería Principal', timestamp: '2024-01-20T08:30:00Z', completedAt: '2024-01-20T08:35:00Z' },
  { id: 'H004', code: 'HSK-2024-004', osiId: 'OSI002', osiCode: 'OSI-2024-002', type: 'transfer', fromRole: 'D', fromUserId: 'U006', fromUserName: 'Luis Torres', toRole: 'E', toUserId: 'U007', toUserName: 'Roberto Sánchez', status: 'pending', qrCode: 'QR-HSK-004', location: 'Almacén Central', timestamp: '2024-01-20T10:00:00Z', notes: 'Pendiente confirmación chofer' },
];

// ==================== WAREHOUSE LOCATIONS ====================
export const mockLocations: WarehouseLocation[] = [
  { id: 'L001', code: 'W-MAIN-A-01-R-01-L-01-B-01', warehouse: 'Principal', zone: 'MAIN', aisle: 'A', rack: '01', level: '01', bin: '01', qrCode: 'QR-LOC-001', category: 'materials', capacity: 100, occupied: 75 },
  { id: 'L002', code: 'W-MAIN-A-01-R-01-L-02-B-01', warehouse: 'Principal', zone: 'MAIN', aisle: 'A', rack: '01', level: '02', bin: '01', qrCode: 'QR-LOC-002', category: 'materials', capacity: 100, occupied: 40 },
  { id: 'L003', code: 'W-LOCK-B-02-R-03-L-01-B-02', warehouse: 'Principal', zone: 'LOCKER', aisle: 'B', rack: '03', level: '01', bin: '02', qrCode: 'QR-LOC-003', category: 'assets', capacity: 50, occupied: 50 },
  { id: 'L004', code: 'W-CUAR-C-01-R-01-L-01-B-01', warehouse: 'Principal', zone: 'CUARENTENA', aisle: 'C', rack: '01', level: '01', bin: '01', qrCode: 'QR-LOC-004', category: 'materials', capacity: 30, occupied: 10 },
  { id: 'L005', code: 'W-TALL-D-01-R-02-L-01-B-03', warehouse: 'Principal', zone: 'TALLER', aisle: 'D', rack: '02', level: '01', bin: '03', qrCode: 'QR-LOC-005', category: 'woodboxes', capacity: 20, occupied: 15 },
];

// ==================== INVENTORY ITEMS ====================
export const mockInventoryItems: InventoryItem[] = [
  { id: 'I001', code: 'INV-001', name: 'Cajas de cartón (Grandes)', category: 'materials', locationId: 'L001', locationCode: 'W-MAIN-A-01-R-01-L-01-B-01', quantity: 500, unit: 'unidades', status: 'available', lastMoved: '2024-01-20' },
  { id: 'I002', code: 'INV-002', name: 'Plástico de burbujas', category: 'materials', locationId: 'L001', locationCode: 'W-MAIN-A-01-R-01-L-01-B-01', quantity: 20, unit: 'rollos', status: 'available', lastMoved: '2024-01-18' },
  { id: 'I003', code: 'INV-003', name: 'Mueble de oficina - Escritorio', category: 'assets', locationId: 'L003', locationCode: 'W-LOCK-B-02-R-03-L-01-B-02', quantity: 5, unit: 'unidades', status: 'reserved', osiId: 'OSI002', lastMoved: '2024-01-19' },
  { id: 'I004', code: 'INV-004', name: 'Caja de madera 2x1x1m', category: 'woodboxes', locationId: 'L005', locationCode: 'W-TALL-D-01-R-02-L-01-B-03', quantity: 8, unit: 'unidades', status: 'available', lastMoved: '2024-01-15' },
  { id: 'I005', code: 'INV-005', name: 'Cinta adhesiva industrial', category: 'materials', locationId: 'L002', locationCode: 'W-MAIN-A-01-R-01-L-02-B-01', quantity: 100, unit: 'rollos', status: 'available', lastMoved: '2024-01-22' },
];

// ==================== INVENTORY MOVES ====================
export const mockInventoryMoves: InventoryMove[] = [
  { id: 'MV001', itemId: 'I001', itemName: 'Cajas de cartón (Grandes)', fromLocation: 'W-MAIN-A-01-R-01-L-01-B-02', toLocation: 'W-MAIN-A-01-R-01-L-01-B-01', quantity: 200, movedBy: 'U004', movedAt: '2024-01-20T10:00:00Z', reason: 'Reorganización', type: 'transfer' },
  { id: 'MV002', itemId: 'I003', itemName: 'Mueble de oficina - Escritorio', fromLocation: 'W-MAIN-A-01-R-02-L-01-B-01', toLocation: 'W-LOCK-B-02-R-03-L-01-B-02', quantity: 5, movedBy: 'U004', movedAt: '2024-01-19T14:00:00Z', reason: 'Reserva OSI-2024-002', type: 'transfer' },
  { id: 'MV003', itemId: 'I004', itemName: 'Caja de madera 2x1x1m', fromLocation: 'Proveedor', toLocation: 'W-TALL-D-01-R-02-L-01-B-03', quantity: 10, movedBy: 'U004', movedAt: '2024-01-15T09:00:00Z', reason: 'Ingreso de nuevo stock', type: 'in' },
];

// ==================== WOOD BOXES ====================
export const mockWoodBoxes: WoodBox[] = [
  { id: 'WB001', code: 'BOX-001', dimensions: { length: 200, width: 100, height: 100 }, boardFeet: 85, status: 'available', locationId: 'L005', reuseCount: 0, createdAt: '2024-01-10' },
  { id: 'WB002', code: 'BOX-002', dimensions: { length: 150, width: 80, height: 80 }, boardFeet: 52, status: 'in_use', locationId: 'L005', osiId: 'OSI002', reuseCount: 2, createdAt: '2023-12-15', lastUsed: '2024-01-20' },
  { id: 'WB003', code: 'BOX-003', dimensions: { length: 120, width: 60, height: 60 }, boardFeet: 28, status: 'available', locationId: 'L005', reuseCount: 1, createdAt: '2023-11-20', lastUsed: '2024-01-05' },
  { id: 'WB004', code: 'BOX-004', dimensions: { length: 180, width: 90, height: 90 }, boardFeet: 62, status: 'damaged', locationId: 'L004', reuseCount: 5, createdAt: '2023-08-10', lastUsed: '2024-01-15' },
  { id: 'WB005', code: 'BOX-005', dimensions: { length: 200, width: 100, height: 100 }, boardFeet: 85, status: 'available', locationId: 'L005', reuseCount: 0, createdAt: '2024-01-18' },
];

// ==================== NPS SURVEYS ====================
export const mockNPSSurveys: NPSSurvey[] = [
  { id: 'NPS001', osiId: 'OSI001', osiCode: 'OSI-2024-001', clientId: 'C001', clientName: 'Minera Los Andes S.A.', score: 9, comment: 'Excelente servicio, muy profesionales', category: 'promoter', createdAt: '2024-01-16', respondedAt: '2024-01-16' },
  { id: 'NPS002', osiId: 'OSI008', osiCode: 'OSI-2024-008', clientId: 'C002', clientName: 'Banco Nacional', score: 8, category: 'passive', createdAt: '2024-01-09', respondedAt: '2024-01-09' },
  { id: 'NPS003', osiId: 'OSI003', osiCode: 'OSI-2024-003', clientId: 'C002', clientName: 'Banco Nacional', score: 7, comment: 'Buen servicio pero se demoró un poco', category: 'passive', createdAt: '2024-01-26', respondedAt: '2024-01-26' },
];

// ==================== BADGES ====================
export const mockBadges: Badge[] = [
  { id: 'B001', code: 'BADGE-001', name: 'Rápido y Furioso', description: 'Completar 10 OSIs en tiempo récord', icon: 'Zap', color: 'yellow', requirement: '10 OSIs < tiempo estimado', points: 100 },
  { id: 'B002', code: 'BADGE-002', name: 'Maestro del Embalaje', description: 'Crear 50 cajas de madera perfectas', icon: 'Package', color: 'brown', requirement: '50 cajas sin defectos', points: 150 },
  { id: 'B003', code: 'BADGE-003', name: 'Conductor Estrella', description: '10,000 km sin incidentes', icon: 'Truck', color: 'blue', requirement: '10000 km seguros', points: 200 },
  { id: 'B004', code: 'BADGE-004', name: 'Cliente Feliz', description: 'Recibir 5 calificaciones 5 estrellas', icon: 'Star', color: 'gold', requirement: '5 x 5 estrellas', points: 100 },
  { id: 'B005', code: 'BADGE-005', name: 'Eco-Warrior', description: 'Reutilizar 20 cajas de madera', icon: 'Recycle', color: 'green', requirement: '20 reutilizaciones', points: 75 },
];

// ==================== CALENDAR EVENTS ====================
export const mockCalendarEvents: CalendarEvent[] = [
  { id: 'E001', title: 'OSI-2024-002 - Traslado equipos', type: 'osi', startDate: '2024-01-20T08:00:00Z', endDate: '2024-01-20T16:00:00Z', assignedTo: ['U006', 'U009', 'U010'], osiId: 'OSI002', description: 'Traslado de equipos de cómputo', status: 'in_progress' },
  { id: 'E002', title: 'Mantenimiento VH-005', type: 'maintenance', startDate: '2024-01-25T09:00:00Z', endDate: '2024-01-25T12:00:00Z', assignedTo: ['U011'], description: 'Mantenimiento preventivo', status: 'scheduled' },
  { id: 'E003', title: 'OSI-2024-003 - Traslado caja fuerte', type: 'osi', startDate: '2024-01-25T06:00:00Z', endDate: '2024-01-26T18:00:00Z', assignedTo: ['U006', 'U009', 'U007'], osiId: 'OSI003', description: 'Traslado La Paz - Santa Cruz', status: 'scheduled' },
  { id: 'E004', title: 'Reunión de Planificación', type: 'meeting', startDate: '2024-01-24T10:00:00Z', endDate: '2024-01-24T11:30:00Z', assignedTo: ['U001', 'U002', 'U003'], description: 'Planificación semanal', status: 'scheduled' },
];

// ==================== PURCHASE REQUESTS ====================
export const mockPurchaseRequests: PurchaseRequest[] = [
  { id: 'PR001', code: 'PR-2024-001', description: 'Cajas de cartón tamaño grande', category: 'materials', amount: 2500, requestedBy: 'U004', approvedBy: 'U001', status: 'received', priority: 'high', createdAt: '2024-01-10', neededBy: '2024-01-20' },
  { id: 'PR002', code: 'PR-2024-002', description: 'Plástico de burbujas industrial', category: 'materials', amount: 1800, requestedBy: 'U004', status: 'approved', priority: 'medium', createdAt: '2024-01-15', neededBy: '2024-01-30' },
  { id: 'PR003', code: 'PR-2024-003', description: 'Herramientas para carpintería', category: 'equipment', amount: 3500, requestedBy: 'U010', status: 'pending', priority: 'medium', createdAt: '2024-01-22', neededBy: '2024-02-15' },
  { id: 'PR004', code: 'PR-2024-004', description: 'Repuestos para vehículos', category: 'maintenance', amount: 5200, requestedBy: 'U011', status: 'ordered', priority: 'urgent', createdAt: '2024-01-20', neededBy: '2024-01-25' },
];

// ==================== KPI RECORDS ====================
export const mockKPIRecords: KPIRecord[] = [
  { id: 'KPI001', userId: 'U006', period: '2024-01', metrics: { osisCompleted: 8, onTimeRate: 95, qualityScore: 4.8, safetyScore: 100, customerRating: 4.7 }, totalScore: 92, ranking: 1 },
  { id: 'KPI002', userId: 'U009', period: '2024-01', metrics: { osisCompleted: 12, onTimeRate: 88, qualityScore: 4.5, safetyScore: 95, customerRating: 4.4 }, totalScore: 85, ranking: 3 },
  { id: 'KPI003', userId: 'U007', period: '2024-01', metrics: { osisCompleted: 15, onTimeRate: 92, qualityScore: 4.6, safetyScore: 100, customerRating: 4.5 }, totalScore: 89, ranking: 2 },
  { id: 'KPI004', userId: 'U010', period: '2024-01', metrics: { osisCompleted: 10, onTimeRate: 90, qualityScore: 4.9, safetyScore: 98, customerRating: 4.8 }, totalScore: 91, ranking: 1 },
];

// ==================== NOTIFICATIONS ====================
export const mockNotifications: Notification[] = [
  { id: 'NOT001', type: 'info', title: 'Nueva OSI asignada', message: 'Se te ha asignado la OSI-2024-003', timestamp: '2024-01-22T10:00:00Z', read: false, action: { label: 'Ver OSI', route: '/operations' } },
  { id: 'NOT002', type: 'warning', title: 'Mantenimiento pendiente', message: 'El vehículo VH-005 requiere mantenimiento', timestamp: '2024-01-20T09:00:00Z', read: false, action: { label: 'Ver', route: '/mechanic' } },
  { id: 'NOT003', type: 'success', title: 'Handshake completado', message: 'HSK-2024-001 completado exitosamente', timestamp: '2024-01-15T08:05:00Z', read: true },
  { id: 'NOT004', type: 'error', title: 'NOTA rechazada', message: 'La NOTA-2024-003 fue rechazada', timestamp: '2024-01-23T14:00:00Z', read: false },
];

// ==================== STATS ====================
export const mockDashboardStats = {
  totalOSIs: 156,
  activeOSIs: 23,
  completedOSIs: 128,
  pendingOSIs: 5,
  totalClients: 45,
  totalProjects: 28,
  activeProjects: 12,
  fleetUtilization: 78,
  avgNPS: 8.4,
  totalRevenue: 1250000,
  monthlyRevenue: 125000,
  pendingNOTAs: 8,
  pendingHandshakes: 3,
};

// ==================== CHART DATA ====================
export const mockChartData = {
  osisByMonth: [
    { month: 'Ene', osis: 12 },
    { month: 'Feb', osis: 18 },
    { month: 'Mar', osis: 15 },
    { month: 'Abr', osis: 22 },
    { month: 'May', osis: 25 },
    { month: 'Jun', osis: 20 },
  ],
  revenueByMonth: [
    { month: 'Ene', revenue: 95000 },
    { month: 'Feb', revenue: 110000 },
    { month: 'Mar', revenue: 105000 },
    { month: 'Abr', revenue: 135000 },
    { month: 'May', revenue: 142000 },
    { month: 'Jun', revenue: 125000 },
  ],
  osisByStatus: [
    { name: 'Completadas', value: 128, color: '#22c55e' },
    { name: 'En Progreso', value: 18, color: '#3b82f6' },
    { name: 'Pendientes', value: 5, color: '#f59e0b' },
    { name: 'Canceladas', value: 5, color: '#ef4444' },
  ],
  npsDistribution: [
    { name: 'Promotores (9-10)', value: 45, color: '#22c55e' },
    { name: 'Pasivos (7-8)', value: 35, color: '#f59e0b' },
    { name: 'Detractores (0-6)', value: 8, color: '#ef4444' },
  ],
};

// ==================== TEMPLATES ====================
export const ptfs: PTF[] = [
  { id: 'PTF001', code: 'PTF-001', name: 'Mudanza Estándar', description: 'Plantilla para mudanzas residenciales estándar', items: ['Cajas de cartón', 'Plástico de burbujas', 'Cinta adhesiva', 'Marcadores'], serviceType: 'Residencial', materials: [{ materialId: 'MAT-001', quantity: 20 }, { materialId: 'MAT-002', quantity: 15 }, { materialId: 'MAT-003', quantity: 10, optional: true }], tools: [{ toolId: 'TOOL-001', quantity: 2 }, { toolId: 'TOOL-002', quantity: 1 }], createdAt: '2023-01-01' },
  { id: 'PTF002', code: 'PTF-002', name: 'Mudanza Corporativa', description: 'Plantilla para mudanzas de oficina', items: ['Cajas de archivo', 'Protectores de esquina', 'Etiquetas', 'Cajas para PCs'], serviceType: 'Corporativa', materials: [{ materialId: 'MAT-004', quantity: 50 }, { materialId: 'MAT-005', quantity: 30 }], tools: [{ toolId: 'TOOL-001', quantity: 3 }, { toolId: 'TOOL-003', quantity: 1 }], createdAt: '2023-02-15' },
];

export const pets: PET[] = [
  { id: 'PET001', code: 'PET-001', name: 'Equipo Básico', description: 'Equipo básico para mudanza', equipment: ['Carretillas', 'Rampas', 'Correas', 'Mantas'], roles: [{ role: 'N', quantity: 3 }, { role: 'E', quantity: 1 }], requirements: ['Experiencia en mudanzas', 'Capacidad física'], createdAt: '2023-01-01' },
  { id: 'PET002', code: 'PET-002', name: 'Equipo Pesado', description: 'Equipo para cargas pesadas', equipment: ['Gato hidráulico', 'Plataforma', 'Polipasto', 'Eslingas'], roles: [{ role: 'N', quantity: 4, shab: ['PA'], minRating: 4.5 }, { role: 'E', quantity: 1, minRating: 4.0 }], requirements: ['Certificación en manejo de cargas', 'Experiencia en equipos pesados'], createdAt: '2023-03-10' },
];

export const pgds: PGD[] = [
  { id: 'PGD001', code: 'PGD-001', name: 'Guía de Embalaje', description: 'Guía para embalaje seguro', guidelines: ['Envolver artículos frágiles', 'Etiquetar cajas', 'Distribuir peso uniformemente'], serviceType: 'General', documents: [{ name: 'Checklist de embalaje', required: true, clientVisible: true, officeManaged: false }, { name: 'Inventario fotográfico', required: true, clientVisible: true, officeManaged: true }], createdAt: '2023-01-01' },
  { id: 'PGD002', code: 'PGD-002', name: 'Guía de Seguridad', description: 'Protocolos de seguridad', guidelines: ['Uso de EPP', 'Levantamiento correcto', 'Comunicación constante'], serviceType: 'General', documents: [{ name: 'Checklist de seguridad', required: true, clientVisible: false, officeManaged: true }, { name: 'Reporte de incidentes', required: false, clientVisible: false, officeManaged: true }], createdAt: '2023-04-20' },
];

// PIC Templates for communication
export const pics = [
  { id: 'PIC001', clientId: 'C001', name: 'Template Bienvenida', email: 'template@ipackers.com', phone: '+591 7000000', role: 'Template', isPrimary: false, serviceType: 'Bienvenida', content: 'Estimado cliente, bienvenido a International Packers. Su servicio ha sido programado para el día [FECHA]. Nuestro equipo llegará a las [HORA] horas.', whatsappTemplate: 'Hola [NOMBRE], su mudanza está confirmada para [FECHA]. Equipo: [EQUIPO]. Saludos, IPackers.' },
  { id: 'PIC002', clientId: 'C002', name: 'Template Confirmación', email: 'template@ipackers.com', phone: '+591 7000000', role: 'Template', isPrimary: false, serviceType: 'Confirmación', content: 'Confirmamos su servicio programado. Por favor tenga listo el inventario y acceso al lugar de origen.', whatsappTemplate: 'Hola [NOMBRE], confirmamos su mudanza para mañana [FECHA]. Por favor tener todo listo. Gracias!' },
];
