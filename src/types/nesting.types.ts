// ============================================
// NESTING + HUACALES/CAJAS DE MADERA - TIPOS
// OSi-plus V7 - International Packers SRL
// ============================================

// ==================== UNIDADES Y CONVERSIONES ====================
export type UnitSystem = 'metric' | 'imperial';
export type LengthUnit = 'cm' | 'm' | 'in' | 'ft';
export type WeightUnit = 'kg' | 'lb';

// ==================== ÍTEMS A EMPACAR ====================
export interface NestingItem {
  id: string;
  description: string;
  // Dimensiones en cm (entrada)
  dimensions: {
    length: number;  // L
    width: number;   // W
    height: number;  // H
  };
  // Dimensiones en pulgadas (calculado)
  dimensionsIn?: {
    length: number;
    width: number;
    height: number;
  };
  weight: {
    value: number;
    unit: WeightUnit;
  };
  weightLb?: number; // Peso en libras (calculado)
  quantity: number;
  fragilityTier: 'BAJA' | 'MEDIA' | 'ALTA';
  allowRotation: boolean;
  stackable: boolean;
  maxStackLoad?: number; // lb opcional
  notes?: string;
}

// ==================== PARÁMETROS DE EMPAQUE ====================
export interface PackingParameters {
  // Padding mínimo por fragilidad (en pulgadas)
  paddingByFragility: {
    BAJA: number;
    MEDIA: number;
    ALTA: number;
  };
  // Tolerancias
  kerfTolerance: number;      // Holgura por corte (pulgadas)
  assemblyTolerance: number;  // Holgura de ensamblaje (pulgadas)
  // Merma
  plywoodWastePercent: number;
  lumberWastePercent: number;
  // Mano de obra
  laborCostPerHour: number;
  laborHoursPerBox: {
    small: number;   // < 2 ft³
    medium: number;  // 2-8 ft³
    large: number;   // > 8 ft³
  };
  // Overhead
  overheadPercent: number;
  // Límites de caja
  maxExternalDimension: number; // pulgadas
  maxBoxWeight: number; // lb
  // Fracciones estándar para redondeo
  standardFraction: 8; // 1/8"
}

// ==================== MATERIALES ====================
export interface LumberProfile {
  id: string;
  profile: string;        // "1x4", "2x4", etc.
  displayName: string;
  nominalSize: string;    // "1x4"
  actualThicknessIn: number;  // Espesor real en pulgadas
  actualWidthIn: number;      // Ancho real en pulgadas
  lengthIn: number;       // 192" (16 ft) estándar
  costPerPiece: number;
  provider?: string;
  lastUpdated?: string;
}

export interface PlywoodSheet {
  id: string;
  thicknessIn: number;    // 0.25, 0.375, 0.5, 0.75
  thicknessDisplay: string; // "1/4", "3/8", "1/2", "3/4"
  sheetWidthIn: number;   // 48"
  sheetLengthIn: number;  // 96"
  costPerSheet: number;
  provider?: string;
  lastUpdated?: string;
}

export interface ConsumableItem {
  id: string;
  name: string;
  unit: string;
  costPerUnit: number;
  quantityPerBox: number; // Cantidad usada por caja
}

// ==================== CATÁLOGO DE MATERIALES ====================
export interface MaterialCatalog {
  lumber: LumberProfile[];
  plywood: PlywoodSheet[];
  consumables: ConsumableItem[];
}

// ==================== REGLAS DE SELECCIÓN INTELIGENTE ====================
export interface MaterialSelectionRule {
  id: string;
  name: string;
  // Condiciones
  maxWeight: number;      // lb, hasta este peso
  minWeight?: number;     // lb, desde este peso (opcional)
  fragilityTiers: ('BAJA' | 'MEDIA' | 'ALTA')[];
  stackable: 'any' | 'yes' | 'no';
  // Materiales requeridos
  minPlywoodThickness: number;  // pulgadas
  frameProfile: string;         // "1x4", "2x4", "none"
  frameLocation: 'base' | 'all' | 'none';
  // Prioridad (menor = más prioritario)
  priority: number;
  // Notas
  description: string;
}

// ==================== TIPOS DE CAJA/ESTILOS ====================
export type BoxStyle = 'closed' | 'crate' | 'open-frame';

export interface BoxStyleConfig {
  style: BoxStyle;
  name: string;
  description: string;
  // Paneles requeridos
  panels: {
    base: boolean;
    lid: boolean;
    front: boolean;
    back: boolean;
    left: boolean;
    right: boolean;
  };
  // Frame requerido
  frameRequired: boolean;
  frameLocation: 'base-only' | 'full-perimeter' | 'corners-only';
}

// ==================== RESULTADO DE NESTING 3D ====================
export interface PackedItem {
  itemId: string;
  item: NestingItem;
  // Posición en la caja (esquina inferior izquierda trasera)
  position: {
    x: number;  // pulgadas desde origen
    y: number;
    z: number;
  };
  // Orientación aplicada (rotación)
  orientation: {
    length: number;  // dimensión que quedó en X
    width: number;   // dimensión que quedó en Y
    height: number;  // dimensión que quedó en Z
  };
  // Rotación aplicada (0, 90, 180, 270 en cada eje)
  rotation: {
    x: number;
    y: number;
    z: number;
  };
}

export interface NestingBox {
  id: string;
  boxNumber: number;
  // Dimensiones
  internalDims: {
    length: number;
    width: number;
    height: number;
  };
  externalDims: {
    length: number;
    width: number;
    height: number;
  };
  // Ítems empacados
  packedItems: PackedItem[];
  // Métricas
  totalWeight: number;      // lb (ítems + estimado madera)
  itemsWeight: number;      // lb (solo ítems)
  woodWeight: number;       // lb (estimado madera)
  volumeUtilization: number; // % del volumen usado
  // Materiales seleccionados
  selectedMaterials: {
    plywoodThickness: number;
    frameProfile: string;
    boxStyle: BoxStyle;
  };
  // Padding aplicado
  paddingApplied: number;
  // Fragilidad máxima en la caja
  maxFragility: 'BAJA' | 'MEDIA' | 'ALTA';
}

// ==================== BOM (LISTA DE MATERIALES) ====================
export interface PlywoodBOMItem {
  thicknessIn: number;
  thicknessDisplay: string;
  sheetCount: number;
  totalAreaSqFt: number;
  cost: number;
  wastePercent: number;
  wasteCost: number;
}

export interface LumberBOMItem {
  profile: string;
  pieces192Count: number;
  totalLengthIn: number;
  cuts: LumberCut[];
  cost: number;
  wastePercent: number;
  wasteCost: number;
}

export interface ConsumableBOMItem {
  itemId: string;
  name: string;
  quantity: number;
  unit: string;
  cost: number;
}

export interface BoxBOM {
  boxId: string;
  plywood: PlywoodBOMItem[];
  lumber: LumberBOMItem[];
  consumables: ConsumableBOMItem[];
  // Costos
  materialsCost: number;
  laborCost: number;
  overheadCost: number;
  totalCost: number;
}

// ==================== CUT LISTS ====================
export interface PlywoodCut {
  id: string;
  panelType: 'base' | 'lid' | 'front' | 'back' | 'left' | 'right';
  width: number;    // pulgadas
  length: number;   // pulgadas
  quantity: number;
  sheetIndex?: number;  // Asignado a qué plancha
  positionInSheet?: { x: number; y: number }; // Posición en la plancha
}

export interface PlywoodSheetCuts {
  sheetIndex: number;
  sheetDimensions: { width: number; length: number };
  cuts: PlywoodCut[];
  usedArea: number;
  wasteArea: number;
  wastePercent: number;
}

export interface LumberCut {
  id: string;
  length: number;     // pulgadas
  pieceIndex: number; // Asignado a qué pieza de 192"
  profile: string;
  purpose: string;    // "frame-base", "frame-vertical", "brace", etc.
}

export interface LumberPieceCuts {
  pieceIndex: number;
  profile: string;
  originalLength: number; // 192"
  cuts: LumberCut[];
  remainingWaste: number;
  usedLength: number;
}

export interface CutLists {
  boxId: string;
  plywood: PlywoodSheetCuts[];
  lumber: LumberPieceCuts[];
}

// ==================== VERSIÓN DE NESTING ====================
export interface NestingVersion {
  id: string;
  projectId?: string;
  versionName: string;  // "A", "B", "C", etc.
  versionNumber: number;
  createdAt: string;
  createdBy: string;
  status: 'draft' | 'review' | 'approved' | 'frozen';
  // Entradas
  items: NestingItem[];
  parameters: PackingParameters;
  // Resultados
  boxes: NestingBox[];
  boms: BoxBOM[];
  cutLists: CutLists[];
  // Costos totales
  totalCost: number;
  totalBoxes: number;
  // Métricas agregadas
  metrics: {
    totalPlywoodWaste: number;
    totalLumberWaste: number;
    averageBoxVolume: number;
    averageCostPerBox: number;
  };
  // Notas
  notes?: string;
}

// ==================== RESULTADO DEL ALGORITMO ====================
export interface NestingResult {
  success: boolean;
  error?: string;
  version: NestingVersion;
  // Estadísticas del algoritmo
  algorithmStats: {
    iterations: number;
    timeMs: number;
    solutionsEvaluated: number;
  };
}

// ==================== CONFIGURACIÓN DEL SISTEMA ====================
export interface NestingSystemConfig {
  // Materiales disponibles
  materialCatalog: MaterialCatalog;
  // Reglas de selección
  selectionRules: MaterialSelectionRule[];
  // Estilos de caja disponibles
  boxStyles: BoxStyleConfig[];
  // Parámetros por defecto
  defaultParameters: PackingParameters;
  // Conversión
  conversion: {
    cmToInches: number;  // 0.393701
    kgToLb: number;      // 2.20462
  };
}

// ==================== PANEL PARA CORTE 2D ====================
export interface Panel2D {
  id: string;
  width: number;   // pulgadas
  height: number;  // pulgadas
  panelType: string;
  required: boolean;
}

// ==================== RECTÁNGULO PARA BIN PACKING ====================
export interface Rectangle2D {
  id: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
  rotated?: boolean;
  placed?: boolean;
}

// ==================== HOJA DE PLYWOOD PARA 2D PACKING ====================
export interface Sheet2D {
  width: number;   // 48
  height: number;  // 96
  placements: Rectangle2D[];
  freeRectangles: Rectangle2D[];
}
