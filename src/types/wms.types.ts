// ============================================
// WMS - SISTEMA DE GESTIÓN DE ALMACENES
// Jerarquía: Warehouse > Zone > Aisle > Rack > Level > Bin
// ============================================

// ============================================
// JERARQUÍA DE UBICACIONES
// ============================================

export interface Warehouse {
  id: string;
  code: string; // ej. "MAIN", "SUCURSAL_NORTE"
  name: string;
  address: string;
  zones: Zone[];
  isActive: boolean;
}

export interface Zone {
  id: string;
  warehouseId: string;
  code: string; // ej. "A", "B", "W", "LOCKER", "RECEPCION"
  name: string;
  type: ZoneType;
  aisles: Aisle[];
}

export type ZoneType = 
  | 'MATERIALES'      // Zona A - Consumibles
  | 'HERRAMIENTAS'    // Zona B - Activos
  | 'MADERA'          // Zona W - Cajas de madera
  | 'LOCKER'          // Casilleros de despacho rápido
  | 'RECEPCION'       // Zona de cuarentena/entrada
  | 'VEHICULO'        // Ubicación móvil (camiones)
  | 'TALLER';         // Taller de carpintería

export interface Aisle {
  id: string;
  zoneId: string;
  code: string; // ej. "01", "02", "05"
  name: string;
  racks: Rack[];
}

export interface Rack {
  id: string;
  aisleId: string;
  code: string; // ej. "R1", "R2", "R10"
  name: string;
  levels: Level[];
}

export interface Level {
  id: string;
  rackId: string;
  code: string; // ej. "N1" (suelo), "N2", "N3", "N4" (alto)
  name: string;
  height: number; // cm desde el suelo
  bins: Bin[];
}

export interface Bin {
  id: string;
  levelId: string;
  code: string; // ej. "B01", "B02", "B12"
  name: string;
  capacity: BinCapacity;
  currentItem?: string; // ID del item actual
  currentQuantity?: number;
  status: BinStatus;
  qrCode: string; // LOC|{Warehouse}-{Zone}-{Aisle}-{Rack}-{Level}-{Bin}
}

export interface BinCapacity {
  maxWeight: number; // kg
  maxVolume: number; // cm³
  maxUnits?: number;
}

export type BinStatus = 'EMPTY' | 'PARTIAL' | 'FULL' | 'BLOCKED' | 'RESERVED';

// ============================================
// UBICACIONES ESPECIALES (STAGING AREAS)
// ============================================

export interface SpecialLocation {
  id: string;
  type: SpecialLocationType;
  code: string;
  name: string;
  description?: string;
}

export type SpecialLocationType = 
  | 'RECEPCION'       // LOC|RECEPCION
  | 'LOCKER'          // LOC|LOCKER-{XX}
  | 'VEHICULO'        // LOC|VEHICULO-{Placa}
  | 'CUARENTENA'      // LOC|CUARENTENA
  | 'DESPACHO';       // LOC|DESPACHO

// ============================================
// ETIQUETAS QR
// ============================================

export interface QREntity {
  id: string;
  type: QRType;
  code: string; // Payload del QR
  labelText: string; // Texto legible para humanos
  printDate?: Date;
  printedBy?: string;
}

export type QRType = 
  | 'LOCATION'    // LOC|...
  | 'LOT'         // LOT|{Sku}-{Fecha}
  | 'ASSET'       // ASSET|{Serial_ID}
  | 'BOX'         // BOX|{Box_ID}
  | 'USER';       // USR|{User_ID}

// ============================================
// MOVIMIENTOS DE INVENTARIO
// ============================================

export interface InventoryMove {
  id: string;
  timestamp: Date;
  actorId: string; // User ID (C1)
  actorName: string;
  itemType: 'LOT' | 'ASSET' | 'BOX';
  itemId: string;
  itemName: string;
  itemQrCode: string;
  origin: MoveLocation;
  destination: MoveLocation;
  quantity: number;
  reason: MoveReason;
  osiId?: string; // Si es despacho a OSI
  notes?: string;
  validated: boolean;
}

export interface MoveLocation {
  type: 'LOCATION' | 'USER' | 'VEHICULO';
  id: string; // LOC|... o USR|... o VEHICULO|...
  name: string;
}

export type MoveReason = 
  | 'ENTRADA_COMPRA'
  | 'ENTRADA_RETORNO'
  | 'SALIDA_OSI'
  | 'TRANSFERENCIA_INTERNA'
  | 'REABASTECIMIENTO'
  | 'AJUSTE_INVENTARIO'
  | 'REUBICACION'
  | 'HANDSHAKE';

// ============================================
// FLUJOS OPERATIVOS C1
// ============================================

export interface C1Operation {
  id: string;
  type: C1OperationType;
  status: C1OperationStatus;
  createdAt: Date;
  completedAt?: Date;
  createdBy: string; // C1
  items: C1OperationItem[];
  osiId?: string;
  notes?: string;
}

export type C1OperationType = 
  | 'ENTRADA'
  | 'SALIDA'
  | 'MOVIMIENTO_INTERNO'
  | 'TRANSFERENCIA'
  | 'AUDITORIA';

export type C1OperationStatus = 
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export interface C1OperationItem {
  id: string;
  itemId: string;
  itemName: string;
  itemQrCode: string;
  quantity: number;
  originLocation: string;
  destinationLocation: string;
  scanned: boolean;
  scannedAt?: Date;
}

// ============================================
// HANDSHAKE (CADENA DE CUSTODIA)
// ============================================

export interface Handshake {
  id: string;
  timestamp: Date;
  from: HandshakeParty;
  to: HandshakeParty;
  items: HandshakeItem[];
  osiId?: string;
  qrValidated: boolean;
  location: string;
}

export interface HandshakeParty {
  type: 'C1' | 'E' | 'D' | 'G';
  userId: string;
  userName: string;
  qrCode: string; // USR|{User_ID}
}

export interface HandshakeItem {
  itemId: string;
  itemName: string;
  itemQrCode: string;
  quantity: number;
  condition: 'good' | 'damaged' | 'missing';
}

// ============================================
// CONFIGURACIÓN DE ALMACÉN (ROL C)
// ============================================

export interface WarehouseConfig {
  id: string;
  warehouseId: string;
  aisles: number;
  racksPerAisle: number;
  levelsPerRack: number;
  binsPerLevel: number;
  namingConvention: {
    aislePrefix: string; // ""
    rackPrefix: string; // "R"
    levelPrefix: string; // "N"
    binPrefix: string; // "B"
  };
  specialLocations: SpecialLocation[];
}

// ============================================
// TAREAS DE PICKING (PARA C1)
// ============================================

export interface PickingTask {
  id: string;
  osiId: string;
  status: PickingStatus;
  items: PickingItem[];
  assignedTo?: string; // C1
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export type PickingStatus = 'PENDING' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED';

export interface PickingItem {
  id: string;
  itemId: string;
  itemName: string;
  quantity: number;
  location: string; // LOC|...
  locationHint?: string; // "Pasillo 5, Nivel 2"
  picked: boolean;
  pickedAt?: Date;
  pickedQuantity?: number;
}

// ============================================
// AUDITORÍA Y CONTROL
// ============================================

export interface InventoryAudit {
  id: string;
  locationId: string;
  scheduledDate: Date;
  completedDate?: Date;
  auditorId: string;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED';
  expectedItems: AuditItem[];
  actualItems: AuditItem[];
  discrepancies: AuditDiscrepancy[];
}

export interface AuditItem {
  itemId: string;
  itemName: string;
  expectedQuantity: number;
  actualQuantity: number;
}

export interface AuditDiscrepancy {
  itemId: string;
  type: 'MISSING' | 'EXTRA' | 'DAMAGED';
  quantity: number;
  notes?: string;
}
