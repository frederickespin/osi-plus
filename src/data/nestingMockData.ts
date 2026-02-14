// ============================================
// MOCK DATA - NESTING + HUACALES/CAJAS DE MADERA
// OSi-plus V7 - International Packers SRL
// ============================================

import type {
  MaterialCatalog,
  MaterialSelectionRule,
  PackingParameters,
  NestingItem,
  NestingVersion,
  BoxStyleConfig,
} from '@/types/nesting.types';

// ==================== CATÁLOGO DE MATERIALES ====================
export const defaultMaterialCatalog: MaterialCatalog = {
  lumber: [
    {
      id: 'LUM-1x4',
      profile: '1x4',
      displayName: '1x4 (3/4" x 3-1/2")',
      nominalSize: '1x4',
      actualThicknessIn: 0.75,
      actualWidthIn: 3.5,
      lengthIn: 192, // 16 ft
      costPerPiece: 12.50,
      provider: 'Maderas del Sur',
      lastUpdated: '2024-01-15',
    },
    {
      id: 'LUM-2x4',
      profile: '2x4',
      displayName: '2x4 (1-1/2" x 3-1/2")',
      nominalSize: '2x4',
      actualThicknessIn: 1.5,
      actualWidthIn: 3.5,
      lengthIn: 192, // 16 ft
      costPerPiece: 18.75,
      provider: 'Maderas del Sur',
      lastUpdated: '2024-01-15',
    },
    {
      id: 'LUM-2x6',
      profile: '2x6',
      displayName: '2x6 (1-1/2" x 5-1/2")',
      nominalSize: '2x6',
      actualThicknessIn: 1.5,
      actualWidthIn: 5.5,
      lengthIn: 192, // 16 ft
      costPerPiece: 28.00,
      provider: 'Maderas del Sur',
      lastUpdated: '2024-01-15',
    },
  ],
  plywood: [
    {
      id: 'PLY-1/4',
      thicknessIn: 0.25,
      thicknessDisplay: '1/4"',
      sheetWidthIn: 48,
      sheetLengthIn: 96,
      costPerSheet: 35.00,
      provider: 'Plywood Bolivia',
      lastUpdated: '2024-01-15',
    },
    {
      id: 'PLY-3/8',
      thicknessIn: 0.375,
      thicknessDisplay: '3/8"',
      sheetWidthIn: 48,
      sheetLengthIn: 96,
      costPerSheet: 48.50,
      provider: 'Plywood Bolivia',
      lastUpdated: '2024-01-15',
    },
    {
      id: 'PLY-1/2',
      thicknessIn: 0.5,
      thicknessDisplay: '1/2"',
      sheetWidthIn: 48,
      sheetLengthIn: 96,
      costPerSheet: 62.00,
      provider: 'Plywood Bolivia',
      lastUpdated: '2024-01-15',
    },
    {
      id: 'PLY-3/4',
      thicknessIn: 0.75,
      thicknessDisplay: '3/4"',
      sheetWidthIn: 48,
      sheetLengthIn: 96,
      costPerSheet: 85.00,
      provider: 'Plywood Bolivia',
      lastUpdated: '2024-01-15',
    },
  ],
  consumables: [
    {
      id: 'CONS-SCREWS',
      name: 'Tornillos para madera #8 x 2"',
      unit: 'unidades',
      costPerUnit: 0.15,
      quantityPerBox: 24,
    },
    {
      id: 'CONS-STAPLES',
      name: 'Grapas 1/2"',
      unit: 'unidades',
      costPerUnit: 0.03,
      quantityPerBox: 100,
    },
    {
      id: 'CONS-FOAM',
      name: 'Foam protectora 1/4"',
      unit: 'm²',
      costPerUnit: 8.50,
      quantityPerBox: 2,
    },
    {
      id: 'CONS-PLASTIC',
      name: 'Plástico de burbujas',
      unit: 'm²',
      costPerUnit: 5.25,
      quantityPerBox: 3,
    },
    {
      id: 'CONS-CORNER',
      name: 'Protectores de esquina',
      unit: 'unidades',
      costPerUnit: 1.20,
      quantityPerBox: 8,
    },
  ],
};

// ==================== REGLAS DE SELECCIÓN INTELIGENTE ====================
export const defaultSelectionRules: MaterialSelectionRule[] = [
  {
    id: 'RULE-001',
    name: 'Carga Ligera - Estándar',
    maxWeight: 80,
    minWeight: 0,
    fragilityTiers: ['BAJA', 'MEDIA'],
    stackable: 'any',
    minPlywoodThickness: 0.375, // 3/8"
    frameProfile: '1x4',
    frameLocation: 'base',
    priority: 1,
    description: 'Para cargas ligeras hasta 80 lb con fragilidad baja a media',
  },
  {
    id: 'RULE-002',
    name: 'Carga Ligera - Frágil',
    maxWeight: 80,
    minWeight: 0,
    fragilityTiers: ['ALTA'],
    stackable: 'any',
    minPlywoodThickness: 0.5, // 1/2"
    frameProfile: '1x4',
    frameLocation: 'base',
    priority: 2,
    description: 'Para cargas ligeras frágiles (alta protección)',
  },
  {
    id: 'RULE-003',
    name: 'Carga Media - Estándar',
    maxWeight: 200,
    minWeight: 80,
    fragilityTiers: ['BAJA', 'MEDIA'],
    stackable: 'any',
    minPlywoodThickness: 0.5, // 1/2"
    frameProfile: '2x4',
    frameLocation: 'base',
    priority: 3,
    description: 'Para cargas medias de 80-200 lb',
  },
  {
    id: 'RULE-004',
    name: 'Carga Media - Frágil',
    maxWeight: 200,
    minWeight: 80,
    fragilityTiers: ['ALTA'],
    stackable: 'any',
    minPlywoodThickness: 0.5, // 1/2"
    frameProfile: '2x4',
    frameLocation: 'base',
    priority: 4,
    description: 'Para cargas medias frágiles',
  },
  {
    id: 'RULE-005',
    name: 'Carga Pesada - Estándar',
    maxWeight: 500,
    minWeight: 200,
    fragilityTiers: ['BAJA', 'MEDIA', 'ALTA'],
    stackable: 'any',
    minPlywoodThickness: 0.75, // 3/4"
    frameProfile: '2x4',
    frameLocation: 'all',
    priority: 5,
    description: 'Para cargas pesadas > 200 lb (base reforzada)',
  },
  {
    id: 'RULE-006',
    name: 'Carga Pesada - Apilable',
    maxWeight: 1000,
    minWeight: 200,
    fragilityTiers: ['BAJA', 'MEDIA', 'ALTA'],
    stackable: 'yes',
    minPlywoodThickness: 0.75, // 3/4"
    frameProfile: '2x4',
    frameLocation: 'all',
    priority: 6,
    description: 'Para cargas pesadas que serán apiladas (máxima resistencia)',
  },
  {
    id: 'RULE-007',
    name: 'Carga Extra Pesada',
    maxWeight: 999999,
    minWeight: 500,
    fragilityTiers: ['BAJA', 'MEDIA', 'ALTA'],
    stackable: 'any',
    minPlywoodThickness: 0.75, // 3/4"
    frameProfile: '2x6',
    frameLocation: 'all',
    priority: 7,
    description: 'Para cargas extra pesadas > 500 lb (máxima resistencia)',
  },
];

// ==================== PARÁMETROS DE EMPAQUE POR DEFECTO ====================
export const defaultPackingParameters: PackingParameters = {
  paddingByFragility: {
    BAJA: 0.5,   // 1/2 pulgada
    MEDIA: 1.0,  // 1 pulgada
    ALTA: 2.0,   // 2 pulgadas
  },
  kerfTolerance: 0.125,      // 1/8 pulgada
  assemblyTolerance: 0.25,   // 1/4 pulgada
  plywoodWastePercent: 10,
  lumberWastePercent: 8,
  laborCostPerHour: 15.00,   // BOB
  laborHoursPerBox: {
    small: 1.5,   // < 2 ft³
    medium: 2.5,  // 2-8 ft³
    large: 4.0,   // > 8 ft³
  },
  overheadPercent: 15,
  maxExternalDimension: 96,  // 8 ft
  maxBoxWeight: 500,         // lb
  standardFraction: 8,       // 1/8"
};

// ==================== CONFIGURACIÓN DE ESTILOS DE CAJA ====================
export const boxStyleConfigs: BoxStyleConfig[] = [
  {
    style: 'closed',
    name: 'Caja Cerrada',
    description: 'Caja completamente cerrada con 6 paneles de plywood',
    panels: {
      base: true,
      lid: true,
      front: true,
      back: true,
      left: true,
      right: true,
    },
    frameRequired: true,
    frameLocation: 'full-perimeter',
  },
  {
    style: 'crate',
    name: 'Huacal',
    description: 'Estructura con base y marco, laterales de plywood sin tapa',
    panels: {
      base: true,
      lid: false,
      front: true,
      back: true,
      left: true,
      right: true,
    },
    frameRequired: true,
    frameLocation: 'full-perimeter',
  },
  {
    style: 'open-frame',
    name: 'Base con Frame',
    description: 'Solo base de plywood con marco de refuerzo',
    panels: {
      base: true,
      lid: false,
      front: false,
      back: false,
      left: false,
      right: false,
    },
    frameRequired: true,
    frameLocation: 'base-only',
  },
];

// ==================== ÍTEMS DE EJEMPLO ====================
export const exampleNestingItems: NestingItem[] = [
  {
    id: 'ITEM-001',
    description: 'Computadora de escritorio',
    dimensions: { length: 45, width: 20, height: 50 },
    weight: { value: 12, unit: 'kg' },
    quantity: 1,
    fragilityTier: 'ALTA',
    allowRotation: true,
    stackable: false,
    maxStackLoad: 50,
    notes: 'Equipo electrónico sensible',
  },
  {
    id: 'ITEM-002',
    description: 'Monitor 27 pulgadas',
    dimensions: { length: 65, width: 15, height: 45 },
    weight: { value: 6, unit: 'kg' },
    quantity: 2,
    fragilityTier: 'ALTA',
    allowRotation: true,
    stackable: false,
    notes: 'Pantalla frágil',
  },
  {
    id: 'ITEM-003',
    description: 'Archivero metálico',
    dimensions: { length: 50, width: 40, height: 130 },
    weight: { value: 35, unit: 'kg' },
    quantity: 1,
    fragilityTier: 'BAJA',
    allowRotation: false,
    stackable: true,
    maxStackLoad: 200,
    notes: 'Peso concentrado en base',
  },
  {
    id: 'ITEM-004',
    description: 'Silla de oficina',
    dimensions: { length: 60, width: 60, height: 100 },
    weight: { value: 15, unit: 'kg' },
    quantity: 4,
    fragilityTier: 'MEDIA',
    allowRotation: true,
    stackable: true,
    maxStackLoad: 100,
    notes: 'Puede desarmarse parcialmente',
  },
  {
    id: 'ITEM-005',
    description: 'Caja de documentos',
    dimensions: { length: 40, width: 30, height: 25 },
    weight: { value: 20, unit: 'kg' },
    quantity: 6,
    fragilityTier: 'BAJA',
    allowRotation: true,
    stackable: true,
    maxStackLoad: 150,
    notes: 'Cajas de cartón llenas',
  },
];

// ==================== VERSIÓN DE EJEMPLO ====================
export const exampleNestingVersion: NestingVersion = {
  id: 'NEST-EXAMPLE-001',
  projectId: 'P001',
  versionName: 'A',
  versionNumber: 1,
  createdAt: '2024-01-20T10:00:00Z',
  createdBy: 'U002',
  status: 'draft',
  items: exampleNestingItems,
  parameters: defaultPackingParameters,
  boxes: [
    {
      id: 'BOX-1',
      boxNumber: 1,
      internalDims: { length: 52, width: 48, height: 42 },
      externalDims: { length: 54, width: 50, height: 44 },
      packedItems: [],
      totalWeight: 85,
      itemsWeight: 85,
      woodWeight: 15,
      volumeUtilization: 78,
      selectedMaterials: {
        plywoodThickness: 0.5,
        frameProfile: '2x4',
        boxStyle: 'crate',
      },
      paddingApplied: 2,
      maxFragility: 'ALTA',
    },
  ],
  boms: [],
  cutLists: [],
  totalCost: 0,
  totalBoxes: 1,
  metrics: {
    totalPlywoodWaste: 12,
    totalLumberWaste: 8,
    averageBoxVolume: 105,
    averageCostPerBox: 0,
  },
  notes: 'Ejemplo de versión de nesting',
};

// ==================== PROYECTOS CON NESTING ====================
export const projectsWithNesting = [
  { id: 'P001', name: 'Relocalización Oficinas Corporativas', client: 'Minera Los Andes S.A.', nestingVersions: 2 },
  { id: 'P002', name: 'Renovación Sucursales Banco', client: 'Banco Nacional', nestingVersions: 1 },
  { id: 'P003', name: 'Mudanza Residencial', client: 'Juan Carlos Méndez', nestingVersions: 0 },
  { id: 'P004', name: 'Traslado Archivos Históricos', client: 'Embajada de EE.UU.', nestingVersions: 3 },
];
