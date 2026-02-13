import type { 
  Warehouse, Zone, Aisle, Rack, Level, Bin, 
  InventoryMove, Handshake, PickingTask, 
  SpecialLocation, QREntity 
} from '@/types/wms.types';

// ============================================
// ALMACÉN PRINCIPAL
// ============================================

export const warehouses: Warehouse[] = [
  {
    id: 'WH-001',
    code: 'MAIN',
    name: 'Bodega Central International Packers',
    address: 'Av. Industrial 123, Ciudad de México',
    isActive: true,
    zones: []
  }
];

// ============================================
// ZONAS DEL ALMACÉN
// ============================================

export const zones: Zone[] = [
  {
    id: 'ZONE-A',
    warehouseId: 'WH-001',
    code: 'A',
    name: 'Materiales y Consumibles',
    type: 'MATERIALES',
    aisles: []
  },
  {
    id: 'ZONE-B',
    warehouseId: 'WH-001',
    code: 'B',
    name: 'Herramientas y Activos',
    type: 'HERRAMIENTAS',
    aisles: []
  },
  {
    id: 'ZONE-W',
    warehouseId: 'WH-001',
    code: 'W',
    name: 'Cajas de Madera',
    type: 'MADERA',
    aisles: []
  },
  {
    id: 'ZONE-LK',
    warehouseId: 'WH-001',
    code: 'LOCKER',
    name: 'Casilleros de Despacho Rápido',
    type: 'LOCKER',
    aisles: []
  },
  {
    id: 'ZONE-RX',
    warehouseId: 'WH-001',
    code: 'RECEPCION',
    name: 'Zona de Recepción',
    type: 'RECEPCION',
    aisles: []
  }
];

// ============================================
// PASILLOS
// ============================================

export const aisles: Aisle[] = [
  // Zona A - Materiales
  { id: 'AISLE-A01', zoneId: 'ZONE-A', code: '01', name: 'Pasillo 01', racks: [] },
  { id: 'AISLE-A02', zoneId: 'ZONE-A', code: '02', name: 'Pasillo 02', racks: [] },
  { id: 'AISLE-A03', zoneId: 'ZONE-A', code: '03', name: 'Pasillo 03', racks: [] },
  { id: 'AISLE-A04', zoneId: 'ZONE-A', code: '04', name: 'Pasillo 04', racks: [] },
  { id: 'AISLE-A05', zoneId: 'ZONE-A', code: '05', name: 'Pasillo 05', racks: [] },
  
  // Zona B - Herramientas
  { id: 'AISLE-B01', zoneId: 'ZONE-B', code: '01', name: 'Pasillo 01', racks: [] },
  { id: 'AISLE-B02', zoneId: 'ZONE-B', code: '02', name: 'Pasillo 02', racks: [] },
  
  // Zona W - Madera
  { id: 'AISLE-W01', zoneId: 'ZONE-W', code: '01', name: 'Pasillo Taller', racks: [] },
];

// ============================================
// ANAQUELES (RACKS)
// ============================================

export const racks: Rack[] = [
  // Pasillo A01
  { id: 'RACK-A01-R1', aisleId: 'AISLE-A01', code: 'R1', name: 'Anaquel 1', levels: [] },
  { id: 'RACK-A01-R2', aisleId: 'AISLE-A01', code: 'R2', name: 'Anaquel 2', levels: [] },
  { id: 'RACK-A01-R3', aisleId: 'AISLE-A01', code: 'R3', name: 'Anaquel 3', levels: [] },
  
  // Pasillo A05 (ejemplo del prompt)
  { id: 'RACK-A05-R1', aisleId: 'AISLE-A05', code: 'R1', name: 'Anaquel 1', levels: [] },
  { id: 'RACK-A05-R2', aisleId: 'AISLE-A05', code: 'R2', name: 'Anaquel 2', levels: [] },
  
  // Pasillo B01
  { id: 'RACK-B01-R1', aisleId: 'AISLE-B01', code: 'R1', name: 'Anaquel 1', levels: [] },
  { id: 'RACK-B01-R2', aisleId: 'AISLE-B01', code: 'R2', name: 'Anaquel 2', levels: [] },
  
  // Taller
  { id: 'RACK-W01-R1', aisleId: 'AISLE-W01', code: 'R1', name: 'Anaquel Madera', levels: [] },
];

// ============================================
// NIVELES
// ============================================

export const levels: Level[] = [
  // RACK-A05-R2 (ejemplo del prompt: Nivel 3)
  { id: 'LEVEL-A05-R2-N1', rackId: 'RACK-A05-R2', code: 'N1', name: 'Nivel 1 (Suelo)', height: 0, bins: [] },
  { id: 'LEVEL-A05-R2-N2', rackId: 'RACK-A05-R2', code: 'N2', name: 'Nivel 2', height: 50, bins: [] },
  { id: 'LEVEL-A05-R2-N3', rackId: 'RACK-A05-R2', code: 'N3', name: 'Nivel 3', height: 100, bins: [] },
  { id: 'LEVEL-A05-R2-N4', rackId: 'RACK-A05-R2', code: 'N4', name: 'Nivel 4 (Alto)', height: 150, bins: [] },
  
  // RACK-A01-R1
  { id: 'LEVEL-A01-R1-N1', rackId: 'RACK-A01-R1', code: 'N1', name: 'Nivel 1', height: 0, bins: [] },
  { id: 'LEVEL-A01-R1-N2', rackId: 'RACK-A01-R1', code: 'N2', name: 'Nivel 2', height: 50, bins: [] },
  
  // RACK-B01-R1
  { id: 'LEVEL-B01-R1-N1', rackId: 'RACK-B01-R1', code: 'N1', name: 'Nivel 1', height: 0, bins: [] },
  
  // RACK-W01-R1
  { id: 'LEVEL-W01-R1-N1', rackId: 'RACK-W01-R1', code: 'N1', name: 'Nivel Suelo', height: 0, bins: [] },
];

// ============================================
// BANDEJAS (BINS) - UBICACIONES FINALES
// ============================================

export const bins: Bin[] = [
  // LOC|MAIN-A-05-R2-N3-B12 (ejemplo del prompt)
  {
    id: 'BIN-A05-R2-N3-B12',
    levelId: 'LEVEL-A05-R2-N3',
    code: 'B12',
    name: 'Bandeja 12',
    capacity: { maxWeight: 50, maxVolume: 100000 },
    status: 'PARTIAL',
    currentItem: 'M001',
    currentQuantity: 25,
    qrCode: 'LOC|MAIN-A-05-R2-N3-B12'
  },
  
  // Más ubicaciones
  {
    id: 'BIN-A01-R1-N1-B01',
    levelId: 'LEVEL-A01-R1-N1',
    code: 'B01',
    name: 'Bandeja 01',
    capacity: { maxWeight: 100, maxVolume: 500000 },
    status: 'FULL',
    currentItem: 'M002',
    currentQuantity: 200,
    qrCode: 'LOC|MAIN-A-01-R1-N1-B01'
  },
  {
    id: 'BIN-A01-R1-N1-B02',
    levelId: 'LEVEL-A01-R1-N1',
    code: 'B02',
    name: 'Bandeja 02',
    capacity: { maxWeight: 100, maxVolume: 500000 },
    status: 'PARTIAL',
    currentItem: 'M003',
    currentQuantity: 150,
    qrCode: 'LOC|MAIN-A-01-R1-N1-B02'
  },
  {
    id: 'BIN-A01-R1-N2-B05',
    levelId: 'LEVEL-A01-R1-N2',
    code: 'B05',
    name: 'Bandeja 05',
    capacity: { maxWeight: 50, maxVolume: 200000 },
    status: 'EMPTY',
    qrCode: 'LOC|MAIN-A-01-R1-N2-B05'
  },
  
  // Zona B - Herramientas (LOCKER)
  {
    id: 'BIN-LK-01',
    levelId: 'LEVEL-B01-R1-N1',
    code: 'LK01',
    name: 'Locker 01',
    capacity: { maxWeight: 20, maxVolume: 50000 },
    status: 'FULL',
    currentItem: 'A001',
    currentQuantity: 1,
    qrCode: 'LOC|LOCKER-01'
  },
  {
    id: 'BIN-LK-02',
    levelId: 'LEVEL-B01-R1-N1',
    code: 'LK02',
    name: 'Locker 02',
    capacity: { maxWeight: 20, maxVolume: 50000 },
    status: 'FULL',
    currentItem: 'A002',
    currentQuantity: 1,
    qrCode: 'LOC|LOCKER-02'
  },
  
  // Zona W - Madera
  {
    id: 'BIN-W01-R1-N1-B01',
    levelId: 'LEVEL-W01-R1-N1',
    code: 'B01',
    name: 'Espacio Madera 01',
    capacity: { maxWeight: 500, maxVolume: 2000000 },
    status: 'FULL',
    currentItem: 'BOX|WB-900',
    currentQuantity: 1,
    qrCode: 'LOC|MAIN-W-01-R1-N1-B01'
  },
  
  // Recepción
  {
    id: 'BIN-RX-01',
    levelId: 'LEVEL-A01-R1-N1',
    code: 'RX01',
    name: 'Recepción 01',
    capacity: { maxWeight: 200, maxVolume: 1000000 },
    status: 'PARTIAL',
    currentItem: 'ECO-001',
    currentQuantity: 25,
    qrCode: 'LOC|RECEPCION-01'
  },
];

// ============================================
// UBICACIONES ESPECIALES
// ============================================

export const specialLocations: SpecialLocation[] = [
  {
    id: 'SPEC-RX',
    type: 'RECEPCION',
    code: 'LOC|RECEPCION',
    name: 'Zona de Recepción',
    description: 'Zona de cuarentena para entradas y retornos'
  },
  {
    id: 'SPEC-LK-01',
    type: 'LOCKER',
    code: 'LOC|LOCKER-01',
    name: 'Locker 01',
    description: 'Casillero de despacho rápido'
  },
  {
    id: 'SPEC-LK-02',
    type: 'LOCKER',
    code: 'LOC|LOCKER-02',
    name: 'Locker 02',
    description: 'Casillero de despacho rápido'
  },
  {
    id: 'SPEC-VEH-001',
    type: 'VEHICULO',
    code: 'LOC|VEHICULO-ABC123',
    name: 'Camión ABC-123',
    description: 'Ubicación móvil - Camión de 5 toneladas'
  },
  {
    id: 'SPEC-DESPACHO',
    type: 'DESPACHO',
    code: 'LOC|DESPACHO',
    name: 'Zona de Despacho',
    description: 'Área de carga para handshakes'
  }
];

// ============================================
// ETIQUETAS QR GENERADAS
// ============================================

export const qrEntities: QREntity[] = [
  // Ubicaciones
  { id: 'QR-001', type: 'LOCATION', code: 'LOC|MAIN-A-05-R2-N3-B12', labelText: 'A-05 | R2 | N3 | B12' },
  { id: 'QR-002', type: 'LOCATION', code: 'LOC|MAIN-A-01-R1-N1-B01', labelText: 'A-01 | R1 | N1 | B01' },
  { id: 'QR-003', type: 'LOCATION', code: 'LOC|LOCKER-01', labelText: 'LOCKER 01' },
  { id: 'QR-004', type: 'LOCATION', code: 'LOC|RECEPCION', labelText: 'RECEPCIÓN' },
  
  // Activos
  { id: 'QR-ASSET-001', type: 'ASSET', code: 'ASSET|Taladro-05', labelText: 'Taladro #05' },
  { id: 'QR-ASSET-002', type: 'ASSET', code: 'ASSET|Taladro-06', labelText: 'Taladro #06' },
  { id: 'QR-ASSET-003', type: 'ASSET', code: 'ASSET|Camion-01', labelText: 'Camión #01' },
  
  // Cajas
  { id: 'QR-BOX-001', type: 'BOX', code: 'BOX|WB-900', labelText: 'Caja WB-900' },
  
  // Usuarios
  { id: 'QR-USER-001', type: 'USER', code: 'USR|C1-005', labelText: 'Luis Torres (C1)' },
  { id: 'QR-USER-002', type: 'USER', code: 'USR|E-007', labelText: 'Roberto Díaz (E)' },
];

// ============================================
// MOVIMIENTOS DE INVENTARIO
// ============================================

export const inventoryMoves: InventoryMove[] = [
  {
    id: 'MOVE-001',
    timestamp: new Date('2024-01-20T08:00:00'),
    actorId: 'U005',
    actorName: 'Luis Torres',
    itemType: 'ASSET',
    itemId: 'A001',
    itemName: 'Taladro Inalámbrico DeWalt',
    itemQrCode: 'ASSET|Taladro-05',
    origin: { type: 'LOCATION', id: 'LOC|LOCKER-01', name: 'Locker 01' },
    destination: { type: 'USER', id: 'USR|E-007', name: 'Roberto Díaz' },
    quantity: 1,
    reason: 'HANDSHAKE',
    osiId: 'OSI-500',
    notes: 'Entrega a chofer para OSI #500',
    validated: true
  },
  {
    id: 'MOVE-002',
    timestamp: new Date('2024-01-20T07:30:00'),
    actorId: 'U005',
    actorName: 'Luis Torres',
    itemType: 'LOT',
    itemId: 'M001',
    itemName: 'Caja Mediana',
    itemQrCode: 'LOT|CAJA-MED-20240115',
    origin: { type: 'LOCATION', id: 'LOC|MAIN-A-01-R1-N1-B01', name: 'A-01 | R1 | N1 | B01' },
    destination: { type: 'LOCATION', id: 'LOC|DESPACHO', name: 'Zona de Despacho' },
    quantity: 30,
    reason: 'SALIDA_OSI',
    osiId: 'OSI-500',
    notes: 'Picking para OSI #500',
    validated: true
  },
  {
    id: 'MOVE-003',
    timestamp: new Date('2024-01-19T16:45:00'),
    actorId: 'U005',
    actorName: 'Luis Torres',
    itemType: 'LOT',
    itemId: 'ECO-001',
    itemName: 'Cajas de Cartón (Reutilizadas)',
    itemQrCode: 'LOT|ECO-20240112',
    origin: { type: 'LOCATION', id: 'LOC|VEHICULO-ABC123', name: 'Camión ABC-123' },
    destination: { type: 'LOCATION', id: 'LOC|RECEPCION', name: 'Zona de Recepción' },
    quantity: 25,
    reason: 'ENTRADA_RETORNO',
    notes: 'Retorno de OSI #498 - Material reutilizable',
    validated: true
  },
  {
    id: 'MOVE-004',
    timestamp: new Date('2024-01-18T09:15:00'),
    actorId: 'U005',
    actorName: 'Luis Torres',
    itemType: 'ASSET',
    itemId: 'A003',
    itemName: 'Carrito de Carga',
    itemQrCode: 'ASSET|Carrito-03',
    origin: { type: 'LOCATION', id: 'LOC|MAIN-B-01-R1-N1-B01', name: 'B-01 | R1 | N1 | B01' },
    destination: { type: 'LOCATION', id: 'LOC|MAIN-B-02-R1-N1-B03', name: 'B-02 | R1 | N1 | B03' },
    quantity: 1,
    reason: 'REUBICACION',
    notes: 'Movimiento interno por reorganización',
    validated: true
  }
];

// ============================================
// HANDSHAKES (CADENA DE CUSTODIA)
// ============================================

export const handshakes: Handshake[] = [
  {
    id: 'HS-001',
    timestamp: new Date('2024-01-20T08:00:00'),
    from: { type: 'C1', userId: 'U005', userName: 'Luis Torres', qrCode: 'USR|C1-005' },
    to: { type: 'E', userId: 'U007', userName: 'Roberto Díaz', qrCode: 'USR|E-007' },
    items: [
      { itemId: 'A001', itemName: 'Taladro Inalámbrico DeWalt', itemQrCode: 'ASSET|Taladro-05', quantity: 1, condition: 'good' },
      { itemId: 'A002', itemName: 'Taladro Inalámbrico Makita', itemQrCode: 'ASSET|Taladro-06', quantity: 1, condition: 'good' }
    ],
    osiId: 'OSI-500',
    qrValidated: true,
    location: 'LOC|DESPACHO'
  },
  {
    id: 'HS-002',
    timestamp: new Date('2024-01-20T08:05:00'),
    from: { type: 'C1', userId: 'U005', userName: 'Luis Torres', qrCode: 'USR|C1-005' },
    to: { type: 'D', userId: 'U006', userName: 'Pedro Sánchez', qrCode: 'USR|D-006' },
    items: [
      { itemId: 'MAT-001', itemName: 'Cajas Medianas', itemQrCode: 'LOT|CAJA-MED', quantity: 30, condition: 'good' },
      { itemId: 'MAT-002', itemName: 'Cinta de Empaque', itemQrCode: 'LOT|CINTA-EMP', quantity: 10, condition: 'good' }
    ],
    osiId: 'OSI-500',
    qrValidated: true,
    location: 'LOC|DESPACHO'
  }
];

// ============================================
// TAREAS DE PICKING (PARA C1)
// ============================================

export const pickingTasks: PickingTask[] = [
  {
    id: 'PICK-001',
    osiId: 'OSI-500',
    status: 'COMPLETED',
    assignedTo: 'U005',
    createdAt: new Date('2024-01-19T18:00:00'),
    startedAt: new Date('2024-01-20T07:00:00'),
    completedAt: new Date('2024-01-20T07:45:00'),
    items: [
      {
        id: 'PICK-001-1',
        itemId: 'M001',
        itemName: 'Caja Mediana',
        quantity: 30,
        location: 'LOC|MAIN-A-01-R1-N1-B01',
        locationHint: 'Pasillo 1, Nivel 1',
        picked: true,
        pickedAt: new Date('2024-01-20T07:15:00'),
        pickedQuantity: 30
      },
      {
        id: 'PICK-001-2',
        itemId: 'M002',
        itemName: 'Cinta de Empaque',
        quantity: 10,
        location: 'LOC|MAIN-A-01-R1-N1-B02',
        locationHint: 'Pasillo 1, Nivel 1',
        picked: true,
        pickedAt: new Date('2024-01-20T07:25:00'),
        pickedQuantity: 10
      },
      {
        id: 'PICK-001-3',
        itemId: 'M003',
        itemName: 'Plástico de Burbuja',
        quantity: 5,
        location: 'LOC|MAIN-A-01-R1-N2-B05',
        locationHint: 'Pasillo 1, Nivel 2',
        picked: true,
        pickedAt: new Date('2024-01-20T07:35:00'),
        pickedQuantity: 5
      }
    ]
  },
  {
    id: 'PICK-002',
    osiId: 'OSI-501',
    status: 'PENDING',
    createdAt: new Date('2024-01-21T18:00:00'),
    items: [
      {
        id: 'PICK-002-1',
        itemId: 'M001',
        itemName: 'Caja Mediana',
        quantity: 25,
        location: 'LOC|MAIN-A-01-R1-N1-B01',
        locationHint: 'Pasillo 1, Nivel 1',
        picked: false
      },
      {
        id: 'PICK-002-2',
        itemId: 'M002',
        itemName: 'Cinta de Empaque',
        quantity: 8,
        location: 'LOC|MAIN-A-01-R1-N1-B02',
        locationHint: 'Pasillo 1, Nivel 1',
        picked: false
      }
    ]
  }
];

// ============================================
// CONFIGURACIÓN DE ALMACÉN
// ============================================

export const warehouseConfig = {
  id: 'CONFIG-001',
  warehouseId: 'WH-001',
  aisles: 10,
  racksPerAisle: 5,
  levelsPerRack: 4,
  binsPerLevel: 20,
  namingConvention: {
    aislePrefix: '',
    rackPrefix: 'R',
    levelPrefix: 'N',
    binPrefix: 'B'
  },
  totalLocations: 4000 // 10 * 5 * 4 * 20
};

// ============================================
// ESTADÍSTICAS WMS
// ============================================

export const wmsStats = {
  totalLocations: bins.length,
  occupiedLocations: bins.filter(b => b.status !== 'EMPTY').length,
  emptyLocations: bins.filter(b => b.status === 'EMPTY').length,
  totalMovesToday: inventoryMoves.filter(m => 
    m.timestamp.toDateString() === new Date().toDateString()
  ).length,
  pendingPickingTasks: pickingTasks.filter(t => t.status === 'PENDING').length,
  completedHandshakesToday: handshakes.filter(h => 
    h.timestamp.toDateString() === new Date().toDateString()
  ).length,
  itemsInRecepcion: bins.filter(b => b.qrCode.includes('RECEPCION')).length
};
