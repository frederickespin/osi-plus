// ============================================
// ALGORITMOS DE NESTING + CUTTING STOCK
// OSi-plus V7 - International Packers SRL
// ============================================

import type {
  NestingItem,
  PackedItem,
  NestingBox,
  PackingParameters,
  MaterialCatalog,
  MaterialSelectionRule,
  BoxStyle,
  PlywoodCut,
  PlywoodSheetCuts,
  LumberPieceCuts,
  Panel2D,
  Rectangle2D,
  BoxBOM,
  CutLists,
  NestingVersion,
  NestingResult,
} from '@/types/nesting.types';

// ==================== CONSTANTES ====================
const CM_TO_INCHES = 0.393701;
const KG_TO_LB = 2.20462;
const STANDARD_LUMBER_LENGTH = 192; // 16 ft en pulgadas
const STANDARD_PLYWOOD_WIDTH = 48;  // 4 ft
const STANDARD_PLYWOOD_LENGTH = 96; // 8 ft

// ==================== 1. CONVERSIÓN Y NORMALIZACIÓN ====================

export function cmToInches(cm: number): number {
  return cm * CM_TO_INCHES;
}

export function kgToLb(kg: number): number {
  return kg * KG_TO_LB;
}

export function roundToFraction(value: number, denominator: number = 8): number {
  // Redondear a fracción estándar (1/8" por defecto)
  const multiplier = denominator;
  return Math.round(value * multiplier) / multiplier;
}

export function normalizeItems(items: NestingItem[]): NestingItem[] {
  return items.map(item => ({
    ...item,
    dimensionsIn: {
      length: roundToFraction(cmToInches(item.dimensions.length)),
      width: roundToFraction(cmToInches(item.dimensions.width)),
      height: roundToFraction(cmToInches(item.dimensions.height)),
    },
    weightLb: item.weight.unit === 'kg' ? kgToLb(item.weight.value) : item.weight.value,
  }));
}

// ==================== 2. CÁLCULO DE PADDING ====================

export function calculatePadding(
  items: NestingItem[],
  parameters: PackingParameters
): number {
  // Encontrar el padding máximo requerido entre todos los ítems
  let maxPadding = 0;
  for (const item of items) {
    const padding = parameters.paddingByFragility[item.fragilityTier];
    maxPadding = Math.max(maxPadding, padding);
  }
  return maxPadding + parameters.assemblyTolerance;
}

// ==================== 3. ALGORITMO 3D NESTING - FIRST FIT DECREASING ====================

interface Space3D {
  x: number;
  y: number;
  z: number;
  length: number;
  width: number;
  height: number;
}

// Generar todas las orientaciones posibles de un ítem
function getOrientations(item: NestingItem): Array<{ l: number; w: number; h: number }> {
  const dims = item.dimensionsIn!;
  const { length: L, width: W, height: H } = dims;
  
  if (!item.allowRotation) {
    return [{ l: L, w: W, h: H }];
  }
  
  // Todas las permutaciones posibles
  const orientations = [
    { l: L, w: W, h: H },
    { l: L, w: H, h: W },
    { l: W, w: L, h: H },
    { l: W, w: H, h: L },
    { l: H, w: L, h: W },
    { l: H, w: W, h: L },
  ];
  
  // Eliminar duplicados
  const unique = new Set<string>();
  return orientations.filter(o => {
    const key = `${o.l},${o.w},${o.h}`;
    if (unique.has(key)) return false;
    unique.add(key);
    return true;
  });
}

// Intentar colocar un ítem en un espacio
function tryPlaceItem(
  _item: NestingItem,
  space: Space3D,
  orientations: Array<{ l: number; w: number; h: number }>
): { placed: boolean; orientation?: { l: number; w: number; h: number }; position?: { x: number; y: number; z: number } } {
  for (const orient of orientations) {
    if (orient.l <= space.length && orient.w <= space.width && orient.h <= space.height) {
      return {
        placed: true,
        orientation: orient,
        position: { x: space.x, y: space.y, z: space.z },
      };
    }
  }
  return { placed: false };
}

// Dividir espacio restante después de colocar un ítem (guillotine 3D)
function splitSpace(
  space: Space3D,
  item: { l: number; w: number; h: number },
  position: { x: number; y: number; z: number }
): Space3D[] {
  const newSpaces: Space3D[] = [];
  
  // Espacio a la derecha del ítem
  if (position.x + item.l < space.x + space.length) {
    newSpaces.push({
      x: position.x + item.l,
      y: space.y,
      z: space.z,
      length: space.length - (position.x - space.x) - item.l,
      width: space.width,
      height: space.height,
    });
  }
  
  // Espacio detrás del ítem
  if (position.y + item.w < space.y + space.width) {
    newSpaces.push({
      x: space.x,
      y: position.y + item.w,
      z: space.z,
      length: item.l,
      width: space.width - (position.y - space.y) - item.w,
      height: space.height,
    });
  }
  
  // Espacio arriba del ítem
  if (position.z + item.h < space.z + space.height) {
    newSpaces.push({
      x: space.x,
      y: space.y,
      z: position.z + item.h,
      length: item.l,
      width: item.w,
      height: space.height - (position.z - space.z) - item.h,
    });
  }
  
  return newSpaces.filter(s => s.length > 0 && s.width > 0 && s.height > 0);
}

// Calcular bounding box de ítems empacados
function calculateBoundingBox(packedItems: PackedItem[]): { l: number; w: number; h: number } {
  if (packedItems.length === 0) return { l: 0, w: 0, h: 0 };
  
  let maxX = 0, maxY = 0, maxZ = 0;
  for (const pi of packedItems) {
    maxX = Math.max(maxX, pi.position.x + pi.orientation.length);
    maxY = Math.max(maxY, pi.position.y + pi.orientation.width);
    maxZ = Math.max(maxZ, pi.position.z + pi.orientation.height);
  }
  return { l: maxX, w: maxY, h: maxZ };
}

// Algoritmo FFD 3D para una caja candidata
function packItemsInBox(
  items: NestingItem[],
  initialBoxDims: { length: number; width: number; height: number }
): { success: boolean; packedItems: PackedItem[]; finalDims: { l: number; w: number; h: number } } {
  const packedItems: PackedItem[] = [];
  let spaces: Space3D[] = [{
    x: 0, y: 0, z: 0,
    length: initialBoxDims.length,
    width: initialBoxDims.width,
    height: initialBoxDims.height,
  }];
  
  for (const item of items) {
    const orientations = getOrientations(item);
    let placed = false;
    
    // Intentar en cada espacio disponible
    for (let i = 0; i < spaces.length; i++) {
      const space = spaces[i];
      const result = tryPlaceItem(item, space, orientations);
      
      if (result.placed && result.orientation && result.position) {
        packedItems.push({
          itemId: item.id,
          item,
          position: result.position,
          orientation: {
            length: result.orientation.l,
            width: result.orientation.w,
            height: result.orientation.h,
          },
          rotation: { x: 0, y: 0, z: 0 }, // Simplificado
        });
        
        // Dividir el espacio
        const newSpaces = splitSpace(space, result.orientation, result.position);
        spaces.splice(i, 1, ...newSpaces);
        placed = true;
        break;
      }
    }
    
    if (!placed) {
      return { success: false, packedItems: [], finalDims: { l: 0, w: 0, h: 0 } };
    }
  }
  
  const finalDims = calculateBoundingBox(packedItems);
  return { success: true, packedItems, finalDims };
}

// ==================== 4. SELECCIÓN INTELIGENTE DE MATERIALES ====================

export function selectMaterials(
  itemsWeight: number,
  maxFragility: 'BAJA' | 'MEDIA' | 'ALTA',
  stackable: boolean,
  _catalog: MaterialCatalog,
  rules: MaterialSelectionRule[]
): { plywoodThickness: number; frameProfile: string; boxStyle: BoxStyle } {
  // Ordenar reglas por prioridad
  const sortedRules = [...rules].sort((a, b) => a.priority - b.priority);
  
  for (const rule of sortedRules) {
    // Verificar condiciones
    const weightOk = itemsWeight <= rule.maxWeight && (!rule.minWeight || itemsWeight >= rule.minWeight);
    const fragilityOk = rule.fragilityTiers.includes(maxFragility);
    const stackableOk = rule.stackable === 'any' || 
                        (rule.stackable === 'yes' && stackable) || 
                        (rule.stackable === 'no' && !stackable);
    
    if (weightOk && fragilityOk && stackableOk) {
      return {
        plywoodThickness: rule.minPlywoodThickness,
        frameProfile: rule.frameProfile,
        boxStyle: rule.frameProfile === 'none' ? 'closed' : 'crate',
      };
    }
  }
  
  // Default: configuración más resistente
  return {
    plywoodThickness: 0.75,
    frameProfile: '2x4',
    boxStyle: 'crate',
  };
}

// ==================== 5. CÁLCULO DE DIMENSIONES EXTERNAS ====================

export function calculateExternalDimensions(
  internalDims: { length: number; width: number; height: number },
  plywoodThickness: number,
  frameProfile: string,
  catalog: MaterialCatalog
): { length: number; width: number; height: number } {
  const frameThickness = frameProfile === 'none' ? 0 : 
    catalog.lumber.find(l => l.profile === frameProfile)?.actualThicknessIn || 0;
  
  // Si hay frame, va por fuera del plywood
  const totalThickness = plywoodThickness + frameThickness;
  
  return {
    length: internalDims.length + 2 * totalThickness,
    width: internalDims.width + 2 * totalThickness,
    height: internalDims.height + 2 * totalThickness,
  };
}

// ==================== 6. ALGORITMO 2D CUTTING STOCK - MAXRECTS ====================

export function solve2DCuttingStock(
  panels: Panel2D[],
  sheetWidth: number,
  sheetHeight: number
): PlywoodSheetCuts[] {
  const sheets: PlywoodSheetCuts[] = [];
  let remainingPanels = [...panels];
  
  while (remainingPanels.length > 0) {
    const sheet: PlywoodSheetCuts = {
      sheetIndex: sheets.length,
      sheetDimensions: { width: sheetWidth, length: sheetHeight },
      cuts: [],
      usedArea: 0,
      wasteArea: 0,
      wastePercent: 0,
    };
    
    // MaxRects: mantener lista de rectángulos libres
    let freeRects: Rectangle2D[] = [{ 
      id: 'initial', 
      width: sheetWidth, 
      height: sheetHeight, 
      x: 0, 
      y: 0 
    }];
    
    const placedPanels: string[] = [];
    
    for (const panel of remainingPanels) {
      // Buscar mejor rectángulo libre (Best Short Side Fit)
      let bestRect: Rectangle2D | null = null;
      let bestScore = Infinity;
      let rotated = false;
      
      for (const rect of freeRects) {
        // Sin rotar
        if (panel.width <= rect.width && panel.height <= rect.height) {
          const score = Math.min(rect.width - panel.width, rect.height - panel.height);
          if (score < bestScore) {
            bestScore = score;
            bestRect = rect;
            rotated = false;
          }
        }
        // Rotado
        if (panel.height <= rect.width && panel.width <= rect.height) {
          const score = Math.min(rect.width - panel.height, rect.height - panel.width);
          if (score < bestScore) {
            bestScore = score;
            bestRect = rect;
            rotated = true;
          }
        }
      }
      
      if (bestRect) {
        const cut: PlywoodCut = {
          id: panel.id,
          panelType: panel.panelType as any,
          width: rotated ? panel.height : panel.width,
          length: rotated ? panel.width : panel.height,
          quantity: 1,
          sheetIndex: sheet.sheetIndex,
          positionInSheet: { x: bestRect.x!, y: bestRect.y! },
        };
        
        sheet.cuts.push(cut);
        sheet.usedArea += cut.width * cut.length;
        placedPanels.push(panel.id);
        
        // Actualizar rectángulos libres (guillotine split)
        freeRects = freeRects.filter(r => r.id !== bestRect!.id);
        
        const placedW = rotated ? panel.height : panel.width;
        const placedH = rotated ? panel.width : panel.height;
        
        // Split horizontal
        if (placedH < bestRect.height!) {
          freeRects.push({
            id: `h-${panel.id}`,
            x: bestRect.x,
            y: bestRect.y! + placedH,
            width: bestRect.width,
            height: bestRect.height! - placedH,
          });
        }
        // Split vertical
        if (placedW < bestRect.width!) {
          freeRects.push({
            id: `v-${panel.id}`,
            x: bestRect.x! + placedW,
            y: bestRect.y,
            width: bestRect.width! - placedW,
            height: placedH,
          });
        }
      }
    }
    
    // Calcular desperdicio
    const totalArea = sheetWidth * sheetHeight;
    sheet.wasteArea = totalArea - sheet.usedArea;
    sheet.wastePercent = (sheet.wasteArea / totalArea) * 100;
    
    sheets.push(sheet);
    
    // Remover paneles colocados
    remainingPanels = remainingPanels.filter(p => !placedPanels.includes(p.id));
  }
  
  return sheets;
}

// ==================== 7. ALGORITMO 1D CUTTING STOCK - FFD ====================

export function solve1DCuttingStock(
  cuts: Array<{ length: number; id: string; purpose: string }>,
  stockLength: number,
  kerf: number
): LumberPieceCuts[] {
  // Ordenar cortes de mayor a menor (FFD)
  const sortedCuts = [...cuts].sort((a, b) => b.length - a.length);
  
  const pieces: LumberPieceCuts[] = [];
  
  for (const cut of sortedCuts) {
    let placed = false;
    
    // Intentar colocar en piezas existentes
    for (const piece of pieces) {
      const usedLength = piece.cuts.reduce((sum, c) => sum + c.length + kerf, 0) - kerf;
      const remaining = piece.originalLength - usedLength - kerf;
      
      if (cut.length <= remaining) {
        piece.cuts.push({
          id: cut.id,
          length: cut.length,
          pieceIndex: piece.pieceIndex,
          profile: piece.profile,
          purpose: cut.purpose,
        });
        piece.usedLength += cut.length + kerf;
        piece.remainingWaste = piece.originalLength - piece.usedLength;
        placed = true;
        break;
      }
    }
    
    // Si no cabe, crear nueva pieza
    if (!placed) {
      const newPiece: LumberPieceCuts = {
        pieceIndex: pieces.length,
        profile: '2x4', // Default
        originalLength: stockLength,
        cuts: [{
          id: cut.id,
          length: cut.length,
          pieceIndex: pieces.length,
          profile: '2x4',
          purpose: cut.purpose,
        }],
        remainingWaste: stockLength - cut.length,
        usedLength: cut.length + kerf,
      };
      pieces.push(newPiece);
    }
  }
  
  return pieces;
}

// ==================== 8. GENERAR PANELES PARA UNA CAJA ====================

export function generateBoxPanels(
  internalDims: { length: number; width: number; height: number },
  boxStyle: BoxStyle
): Panel2D[] {
  const panels: Panel2D[] = [];
  const l = internalDims.length;
  const w = internalDims.width;
  const h = internalDims.height;
  
  // Base siempre presente
  panels.push({ id: 'base', width: w, height: l, panelType: 'base', required: true });
  
  if (boxStyle === 'closed') {
    // Caja cerrada: 6 paneles
    panels.push({ id: 'lid', width: w, height: l, panelType: 'lid', required: true });
    panels.push({ id: 'front', width: w, height: h, panelType: 'front', required: true });
    panels.push({ id: 'back', width: w, height: h, panelType: 'back', required: true });
    panels.push({ id: 'left', width: l, height: h, panelType: 'left', required: true });
    panels.push({ id: 'right', width: l, height: h, panelType: 'right', required: true });
  } else if (boxStyle === 'crate') {
    // Huacal: base + laterales (sin tapa)
    panels.push({ id: 'front', width: w, height: h, panelType: 'front', required: true });
    panels.push({ id: 'back', width: w, height: h, panelType: 'back', required: true });
    panels.push({ id: 'left', width: l, height: h, panelType: 'left', required: true });
    panels.push({ id: 'right', width: l, height: h, panelType: 'right', required: true });
  }
  // open-frame: solo base
  
  return panels;
}

// ==================== 9. GENERAR CORTES DE MADERA PARA FRAME ====================

export function generateFrameCuts(
  internalDims: { length: number; width: number; height: number },
  frameProfile: string,
  boxStyle: BoxStyle
): Array<{ length: number; id: string; purpose: string }> {
  const cuts: Array<{ length: number; id: string; purpose: string }> = [];
  const l = internalDims.length;
  const w = internalDims.width;
  const h = internalDims.height;
  
  if (frameProfile === 'none') return cuts;
  
  if (boxStyle === 'crate' || boxStyle === 'closed') {
    // Frame de base: 2 largos + 2 anchos
    cuts.push({ length: l, id: 'frame-base-l1', purpose: 'frame-base' });
    cuts.push({ length: l, id: 'frame-base-l2', purpose: 'frame-base' });
    cuts.push({ length: w, id: 'frame-base-w1', purpose: 'frame-base' });
    cuts.push({ length: w, id: 'frame-base-w2', purpose: 'frame-base' });
    
    // Postes verticales (4 esquinas)
    cuts.push({ length: h, id: 'post-1', purpose: 'frame-vertical' });
    cuts.push({ length: h, id: 'post-2', purpose: 'frame-vertical' });
    cuts.push({ length: h, id: 'post-3', purpose: 'frame-vertical' });
    cuts.push({ length: h, id: 'post-4', purpose: 'frame-vertical' });
    
    // Frame superior (si es cerrada)
    if (boxStyle === 'closed') {
      cuts.push({ length: l, id: 'frame-top-l1', purpose: 'frame-top' });
      cuts.push({ length: l, id: 'frame-top-l2', purpose: 'frame-top' });
      cuts.push({ length: w, id: 'frame-top-w1', purpose: 'frame-top' });
      cuts.push({ length: w, id: 'frame-top-w2', purpose: 'frame-top' });
    }
  }
  
  return cuts;
}

// ==================== 10. CÁLCULO DE COSTOS ====================

export function calculateBoxCost(
  plywoodSheets: PlywoodSheetCuts[],
  lumberPieces: LumberPieceCuts[],
  parameters: PackingParameters,
  catalog: MaterialCatalog
): BoxBOM {
  // Calcular plywood
  const plywoodBOM: BoxBOM['plywood'] = [];
  const plywoodByThickness = new Map<number, PlywoodSheetCuts[]>();
  
  for (const sheet of plywoodSheets) {
    // Agrupar por espesor (asumimos mismo espesor para todos los cortes de una caja)
    const thickness = 0.5; // Default
    if (!plywoodByThickness.has(thickness)) {
      plywoodByThickness.set(thickness, []);
    }
    plywoodByThickness.get(thickness)!.push(sheet);
  }
  
  for (const [thickness, sheets] of plywoodByThickness) {
    const plywoodInfo = catalog.plywood.find(p => p.thicknessIn === thickness);
    const sheetCount = sheets.length;
    const totalArea = sheets.reduce((sum, s) => sum + s.usedArea, 0) / 144; // a ft²
    const baseCost = sheetCount * (plywoodInfo?.costPerSheet || 0);
    const wasteCost = baseCost * (parameters.plywoodWastePercent / 100);
    
    plywoodBOM.push({
      thicknessIn: thickness,
      thicknessDisplay: plywoodInfo?.thicknessDisplay || `${thickness}"`,
      sheetCount,
      totalAreaSqFt: Math.round(totalArea * 100) / 100,
      cost: Math.round(baseCost * 100) / 100,
      wastePercent: parameters.plywoodWastePercent,
      wasteCost: Math.round(wasteCost * 100) / 100,
    });
  }
  
  // Calcular lumber
  const lumberBOM: BoxBOM['lumber'] = [];
  const lumberByProfile = new Map<string, LumberPieceCuts[]>();
  
  for (const piece of lumberPieces) {
    if (!lumberByProfile.has(piece.profile)) {
      lumberByProfile.set(piece.profile, []);
    }
    lumberByProfile.get(piece.profile)!.push(piece);
  }
  
  for (const [profile, pieces] of lumberByProfile) {
    const lumberInfo = catalog.lumber.find(l => l.profile === profile);
    const piecesCount = pieces.length;
    const totalLength = pieces.reduce((sum, p) => sum + p.usedLength, 0);
    const baseCost = piecesCount * (lumberInfo?.costPerPiece || 0);
    const wasteCost = baseCost * (parameters.lumberWastePercent / 100);
    
    lumberBOM.push({
      profile,
      pieces192Count: piecesCount,
      totalLengthIn: Math.round(totalLength * 100) / 100,
      cuts: pieces.flatMap(p => p.cuts),
      cost: Math.round(baseCost * 100) / 100,
      wastePercent: parameters.lumberWastePercent,
      wasteCost: Math.round(wasteCost * 100) / 100,
    });
  }
  
  // Consumibles (simplificado)
  const consumablesBOM: BoxBOM['consumables'] = [
    { itemId: 'screws', name: 'Tornillos para madera', quantity: 20, unit: 'unidades', cost: 2.5 },
    { itemId: 'staples', name: 'Grapas', quantity: 50, unit: 'unidades', cost: 1.0 },
  ];
  
  // Costos totales
  const materialsCost = plywoodBOM.reduce((sum, p) => sum + p.cost + p.wasteCost, 0) +
                        lumberBOM.reduce((sum, l) => sum + l.cost + l.wasteCost, 0) +
                        consumablesBOM.reduce((sum, c) => sum + c.cost, 0);
  
  // Mano de obra (estimado)
  const laborCost = parameters.laborCostPerHour * parameters.laborHoursPerBox.medium;
  
  // Overhead
  const overheadCost = materialsCost * (parameters.overheadPercent / 100);
  
  return {
    boxId: '',
    plywood: plywoodBOM,
    lumber: lumberBOM,
    consumables: consumablesBOM,
    materialsCost: Math.round(materialsCost * 100) / 100,
    laborCost: Math.round(laborCost * 100) / 100,
    overheadCost: Math.round(overheadCost * 100) / 100,
    totalCost: Math.round((materialsCost + laborCost + overheadCost) * 100) / 100,
  };
}

// ==================== 11. ALGORITMO PRINCIPAL DE NESTING ====================

export function runNestingAlgorithm(
  items: NestingItem[],
  parameters: PackingParameters,
  catalog: MaterialCatalog,
  rules: MaterialSelectionRule[]
): NestingResult {
  const startTime = Date.now();
  
  // Normalizar ítems
  const normalizedItems = normalizeItems(items);
  
  // Ordenar ítems para FFD
  const sortedItems = [...normalizedItems].sort((a, b) => {
    const volA = a.dimensionsIn!.length * a.dimensionsIn!.width * a.dimensionsIn!.height;
    const volB = b.dimensionsIn!.length * b.dimensionsIn!.width * b.dimensionsIn!.height;
    const weightA = a.weightLb || 0;
    const weightB = b.weightLb || 0;
    const fragilityOrder = { ALTA: 3, MEDIA: 2, BAJA: 1 };
    
    // Prioridad: volumen DESC, peso DESC, fragilidad DESC
    if (volB !== volA) return volB - volA;
    if (weightB !== weightA) return weightB - weightA;
    return fragilityOrder[b.fragilityTier] - fragilityOrder[a.fragilityTier];
  });
  
  const boxes: NestingBox[] = [];
  let remainingItems = [...sortedItems];
  let iterations = 0;
  
  // Tamaños de caja a probar
  const boxSizes = [
    { length: 48, width: 40, height: 36 },
    { length: 48, width: 48, height: 48 },
    { length: 60, width: 48, height: 48 },
    { length: 72, width: 48, height: 48 },
  ];
  
  while (remainingItems.length > 0) {
    iterations++;
    
    let bestBox: { packedItems: PackedItem[]; finalDims: { l: number; w: number; h: number } } | null = null;
    
    for (const size of boxSizes) {
      const result = packItemsInBox(remainingItems, size);
      if (result.success && result.packedItems.length > (bestBox?.packedItems.length || 0)) {
        bestBox = result;
      }
    }
    
    if (!bestBox || bestBox.packedItems.length === 0) {
      return {
        success: false,
        error: 'No se pudieron empacar todos los ítems',
        version: null as any,
        algorithmStats: { iterations, timeMs: Date.now() - startTime, solutionsEvaluated: iterations },
      };
    }
    
    // Calcular dimensiones internas con padding
    const padding = calculatePadding(
      bestBox.packedItems.map(p => p.item),
      parameters
    );
    
    const internalDims = {
      length: bestBox.finalDims.l + 2 * padding,
      width: bestBox.finalDims.w + 2 * padding,
      height: bestBox.finalDims.h + 2 * padding,
    };
    
    // Calcular peso total
    const itemsWeight = bestBox.packedItems.reduce((sum, p) => sum + (p.item.weightLb || 0), 0);
    
    // Determinar fragilidad máxima
    const maxFragility = bestBox.packedItems.reduce((max, p) => {
      const order = { ALTA: 3, MEDIA: 2, BAJA: 1 };
      return order[p.item.fragilityTier] > order[max] ? p.item.fragilityTier : max;
    }, 'BAJA' as 'BAJA' | 'MEDIA' | 'ALTA');
    
    // Verificar si hay ítems apilables
    const hasStackable = bestBox.packedItems.some(p => p.item.stackable);
    
    // Seleccionar materiales
    const materials = selectMaterials(itemsWeight, maxFragility, hasStackable, catalog, rules);
    
    // Calcular dimensiones externas
    const externalDims = calculateExternalDimensions(
      internalDims,
      materials.plywoodThickness,
      materials.frameProfile,
      catalog
    );
    
    // Crear caja
    const box: NestingBox = {
      id: `BOX-${boxes.length + 1}`,
      boxNumber: boxes.length + 1,
      internalDims,
      externalDims,
      packedItems: bestBox.packedItems,
      totalWeight: itemsWeight, // Simplificado, sin peso de madera
      itemsWeight,
      woodWeight: 0,
      volumeUtilization: 0, // Calcular
      selectedMaterials: materials,
      paddingApplied: padding,
      maxFragility,
    };
    
    boxes.push(box);
    
    // Remover ítems empacados
    const packedIds = new Set(bestBox.packedItems.map(p => p.itemId));
    remainingItems = remainingItems.filter(item => !packedIds.has(item.id));
  }
  
  const timeMs = Date.now() - startTime;
  
  // Crear versión
  const version: NestingVersion = {
    id: `NEST-${Date.now()}`,
    versionName: 'A',
    versionNumber: 1,
    createdAt: new Date().toISOString(),
    createdBy: 'system',
    status: 'draft',
    items: normalizedItems,
    parameters,
    boxes,
    boms: [], // Se calculan después
    cutLists: [], // Se calculan después
    totalCost: 0,
    totalBoxes: boxes.length,
    metrics: {
      totalPlywoodWaste: 0,
      totalLumberWaste: 0,
      averageBoxVolume: 0,
      averageCostPerBox: 0,
    },
  };
  
  return {
    success: true,
    version,
    algorithmStats: {
      iterations,
      timeMs,
      solutionsEvaluated: iterations * boxSizes.length,
    },
  };
}

// ==================== 12. GENERAR BOM Y CUT LISTS COMPLETOS ====================

export function generateCompleteBOMandCuts(
  nestingResult: NestingResult,
  catalog: MaterialCatalog,
  parameters: PackingParameters
): NestingResult {
  if (!nestingResult.success) return nestingResult;
  
  const version = nestingResult.version;
  const boms: BoxBOM[] = [];
  const cutLists: CutLists[] = [];
  
  for (const box of version.boxes) {
    // Generar paneles
    const panels = generateBoxPanels(box.internalDims, box.selectedMaterials.boxStyle);
    
    // Resolver cutting stock 2D
    const plywoodSheets = solve2DCuttingStock(
      panels,
      STANDARD_PLYWOOD_WIDTH,
      STANDARD_PLYWOOD_LENGTH
    );
    
    // Generar cortes de frame
    const frameCuts = generateFrameCuts(
      box.internalDims,
      box.selectedMaterials.frameProfile,
      box.selectedMaterials.boxStyle
    );
    
    // Resolver cutting stock 1D
    const lumberPieces = solve1DCuttingStock(
      frameCuts,
      STANDARD_LUMBER_LENGTH,
      parameters.kerfTolerance
    );
    
    // Calcular BOM
    const bom = calculateBoxCost(plywoodSheets, lumberPieces, parameters, catalog);
    bom.boxId = box.id;
    boms.push(bom);
    
    // Guardar cut lists
    cutLists.push({
      boxId: box.id,
      plywood: plywoodSheets,
      lumber: lumberPieces,
    });
  }
  
  // Actualizar versión
  version.boms = boms;
  version.cutLists = cutLists;
  version.totalCost = boms.reduce((sum, b) => sum + b.totalCost, 0);
  version.metrics.averageCostPerBox = version.totalCost / version.totalBoxes;
  
  return {
    ...nestingResult,
    version,
  };
}

export default {
  runNestingAlgorithm,
  generateCompleteBOMandCuts,
  cmToInches,
  kgToLb,
  roundToFraction,
  normalizeItems,
  selectMaterials,
  solve2DCuttingStock,
  solve1DCuttingStock,
};
