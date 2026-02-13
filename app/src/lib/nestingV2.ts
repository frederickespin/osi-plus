// ============================================
// NESTING / CONSOLIDADO V2 - ALGORITMOS
// OSi-plus V7 - International Packers SRL
// ============================================

import type {
  NestingItemV2,
  NestingConfigV2,
  SimilarityResult,
  BundleV2,
  BundleItemV2,
  NestingResultV2,
  ReportRowV2,
} from '@/types/nestingV2.types';

// ==================== 1. FUNCIONES AUXILIARES ====================

/**
 * Calcula el espesor de empaque por lado
 * pack_side_in = pack_carton_in + pack_bubble_in + pack_foam_in
 */
export function calcPackSideIn(cfg: NestingConfigV2): number {
  return cfg.pack_carton_in + cfg.pack_bubble_in + cfg.pack_foam_in;
}

/**
 * Verifica si un artículo es "plano" según configuración
 * is_flat = (T_in <= flat_max_T_in)
 */
export function isFlat(item: NestingItemV2, cfg: NestingConfigV2): boolean {
  return item.T_in <= cfg.flat_max_T_in;
}

/**
 * Verifica elegibilidad para nesting:
 * - needs_wood_crate == true
 * - is_flat == true
 * - T_in en rango [min_T_in, max_T_in]
 */
export function isEligible(item: NestingItemV2, cfg: NestingConfigV2): boolean {
  if (!item.needs_wood_crate) return false;
  if (!isFlat(item, cfg)) return false;
  if (item.T_in < cfg.min_T_in || item.T_in > cfg.max_T_in) return false;
  return true;
}

/**
 * Compara dos valores con tolerancia porcentual
 * |a - b| <= tol * max(a, b)
 */
function withinTolerance(a: number, b: number, tol_pct: number): boolean {
  const maxVal = Math.max(a, b);
  if (maxVal === 0) return a === b;
  return Math.abs(a - b) <= tol_pct * maxVal;
}

/**
 * Calcula el error porcentual entre dos valores
 */
function calcErrorPct(a: number, b: number): number {
  const maxVal = Math.max(a, b);
  if (maxVal === 0) return 0;
  return Math.abs(a - b) / maxVal;
}

// ==================== 2. SIMILITUD W/H ====================

/**
 * Verifica si dos artículos son similares en W/H
 * 
 * Sin rotar:
 *   |A.W - B.W| <= tol * max(A.W, B.W)
 *   Y
 *   |A.H - B.H| <= tol * max(A.H, B.H)
 * 
 * Con rotación 90° (si allow_rotation):
 *   |A.W - B.H| <= tol * max(A.W, B.H)
 *   Y
 *   |A.H - B.W| <= tol * max(A.H, B.W)
 * 
 * Retorna: similar (bool), rotated (bool), errores
 */
export function isSimilar(
  base: NestingItemV2,
  candidate: NestingItemV2,
  cfg: NestingConfigV2
): SimilarityResult {
  const tol = cfg.tol_pct;
  
  // Intentar sin rotar
  const wOkNormal = withinTolerance(base.W_in, candidate.W_in, tol);
  const hOkNormal = withinTolerance(base.H_in, candidate.H_in, tol);
  
  if (wOkNormal && hOkNormal) {
    return {
      similar: true,
      rotated: false,
      error_W: calcErrorPct(base.W_in, candidate.W_in),
      error_H: calcErrorPct(base.H_in, candidate.H_in),
      max_error_pct: Math.max(
        calcErrorPct(base.W_in, candidate.W_in),
        calcErrorPct(base.H_in, candidate.H_in)
      ),
    };
  }
  
  // Intentar con rotación 90° (si el candidato permite)
  if (candidate.allow_rotation) {
    const wOkRot = withinTolerance(base.W_in, candidate.H_in, tol);
    const hOkRot = withinTolerance(base.H_in, candidate.W_in, tol);
    
    if (wOkRot && hOkRot) {
      return {
        similar: true,
        rotated: true,
        error_W: calcErrorPct(base.W_in, candidate.H_in),
        error_H: calcErrorPct(base.H_in, candidate.W_in),
        max_error_pct: Math.max(
          calcErrorPct(base.W_in, candidate.H_in),
          calcErrorPct(base.H_in, candidate.W_in)
        ),
      };
    }
  }
  
  // No son similares
  return {
    similar: false,
    rotated: false,
    error_W: Math.min(
      calcErrorPct(base.W_in, candidate.W_in),
      candidate.allow_rotation ? calcErrorPct(base.W_in, candidate.H_in) : 1
    ),
    error_H: Math.min(
      calcErrorPct(base.H_in, candidate.H_in),
      candidate.allow_rotation ? calcErrorPct(base.H_in, candidate.W_in) : 1
    ),
    max_error_pct: 1,
  };
}

// ==================== 3. CONSTRUCCIÓN DE BUNDLES (GREEDY) ====================

interface BuildBundlesResult {
  bundles: BundleV2[];
  singles: NestingItemV2[];
}

/**
 * Construye bundles usando algoritmo greedy
 * 
 * Paso 1: Ordenar candidatos desc por max(W, H)
 * Paso 2: Para cada candidato no asignado, crear bundle
 * Paso 3: Agregar candidatos similares hasta max_count
 * Paso 4: Bundles con 1 solo item van a singles
 */
export function buildBundles(
  candidates: NestingItemV2[],
  cfg: NestingConfigV2
): BuildBundlesResult {
  const bundles: BundleV2[] = [];
  const assigned = new Set<string>();
  
  // Ordenar candidatos: desc por max(W, H), luego por W desc
  const sorted = [...candidates].sort((a, b) => {
    const maxA = Math.max(a.W_in, a.H_in);
    const maxB = Math.max(b.W_in, b.H_in);
    if (maxB !== maxA) return maxB - maxA;
    return b.W_in - a.W_in;
  });
  
  for (const baseItem of sorted) {
    if (assigned.has(baseItem.item_id)) continue;
    
    // Crear nuevo bundle con el artículo base
    const bundleItems: BundleItemV2[] = [{
      item: baseItem,
      rotated: false,
      W_oriented: baseItem.W_in,
      H_oriented: baseItem.H_in,
      T_packed: baseItem.T_in + 2 * calcPackSideIn(cfg),
    }];
    
    assigned.add(baseItem.item_id);
    
    // Buscar candidatos similares
    while (bundleItems.length < cfg.max_count) {
      let bestMatch: { item: NestingItemV2; result: SimilarityResult } | null = null;
      
      for (const candidate of sorted) {
        if (assigned.has(candidate.item_id)) continue;
        
        const simResult = isSimilar(baseItem, candidate, cfg);
        
        if (simResult.similar) {
          // Criterio: elegir el de menor error máximo
          if (!bestMatch || simResult.max_error_pct < bestMatch.result.max_error_pct) {
            bestMatch = { item: candidate, result: simResult };
          }
        }
      }
      
      if (!bestMatch) break; // No hay más candidatos similares
      
      // Agregar al bundle
      const orientedW = bestMatch.result.rotated ? bestMatch.item.H_in : bestMatch.item.W_in;
      const orientedH = bestMatch.result.rotated ? bestMatch.item.W_in : bestMatch.item.H_in;
      
      bundleItems.push({
        item: bestMatch.item,
        rotated: bestMatch.result.rotated,
        W_oriented: orientedW,
        H_oriented: orientedH,
        T_packed: bestMatch.item.T_in + 2 * calcPackSideIn(cfg),
      });
      
      assigned.add(bestMatch.item.item_id);
    }
    
    // Solo bundles con >= 2 items son consolidados
    if (bundleItems.length >= 2) {
      const bundle: BundleV2 = {
        bundle_id: `BUNDLE-${bundles.length + 1}`,
        ref_item_id: baseItem.item_id,
        items: bundleItems,
        tipo: 'CONSOLIDADA',
        dims: { W_in: 0, H_in: 0, T_in: 0 }, // Se calcula después
        item_count: bundleItems.length,
      };
      bundles.push(bundle);
    }
  }
  
  // Los candidatos no asignados van a singles
  const singles: NestingItemV2[] = [];
  for (const item of sorted) {
    if (!assigned.has(item.item_id)) {
      singles.push(item);
    }
  }
  
  return { bundles, singles };
}

// ==================== 4. CÁLCULO DE DIMENSIONES ====================

/**
 * Calcula las dimensiones de un bundle consolidado
 * 
 * Para bundle S con N artículos:
 * - bundle_W = max(W_oriented_i)
 * - bundle_H = max(H_oriented_i)
 * - bundle_T_stack = Σ(T_i + 2*pack_side_in) + (N-1)*inter_item_gap_in
 * 
 * Con holguras internas:
 * - bundle_W_in = bundle_W + outer_clearance_W_in
 * - bundle_H_in = bundle_H + outer_clearance_H_in
 * - bundle_T_in = bundle_T_stack + outer_clearance_T_in
 */
export function computeBundleDims(
  bundle: BundleV2,
  cfg: NestingConfigV2
): { W_in: number; H_in: number; T_in: number } {
  const items = bundle.items;
  const N = items.length;
  
  // W y H: máximos de los artículos orientados
  const bundle_W = Math.max(...items.map(i => i.W_oriented));
  const bundle_H = Math.max(...items.map(i => i.H_oriented));
  
  // T: suma de espesores empaquetados + holguras entre artículos
  const sumT = items.reduce((sum, i) => sum + i.T_packed, 0);
  const interGap = (N - 1) * cfg.inter_item_gap_in;
  const bundle_T_stack = sumT + interGap;
  
  // Aplicar holguras internas de la caja
  return {
    W_in: bundle_W + cfg.outer_clearance_W_in,
    H_in: bundle_H + cfg.outer_clearance_H_in,
    T_in: bundle_T_stack + cfg.outer_clearance_T_in,
  };
}

/**
 * Crea un bundle individual para un artículo
 */
export function createIndividualBundle(
  item: NestingItemV2,
  bundleIndex: number,
  cfg: NestingConfigV2
): BundleV2 {
  // Para individuales, permitir rotación para optimizar W/H si aplica
  let rotated = false;
  let W = item.W_in;
  let H = item.H_in;
  
  // Si permite rotación y H < W, rotar para que W <= H (opcional, para consistencia)
  if (item.allow_rotation && item.H_in < item.W_in) {
    rotated = true;
    W = item.H_in;
    H = item.W_in;
  }
  
  const packSide = calcPackSideIn(cfg);
  
  return {
    bundle_id: `BUNDLE-IND-${bundleIndex + 1}`,
    ref_item_id: item.item_id,
    items: [{
      item,
      rotated,
      W_oriented: W,
      H_oriented: H,
      T_packed: item.T_in + 2 * packSide,
    }],
    tipo: 'INDIVIDUAL',
    dims: {
      W_in: W + cfg.outer_clearance_W_in,
      H_in: H + cfg.outer_clearance_H_in,
      T_in: (item.T_in + 2 * packSide) + cfg.outer_clearance_T_in,
    },
    item_count: 1,
  };
}

// ==================== 5. ALGORITMO PRINCIPAL ====================

/**
 * Algoritmo principal de nesting consolidado
 * 
 * Step A: Filtrar elegibles vs no elegibles
 * Step B: Construir bundles consolidados
 * Step C: Crear bundles individuales
 * Step D: Calcular dimensiones para todos
 * Step E: Generar reportes
 */
export function runNestingV2(
  items: NestingItemV2[],
  cfg: NestingConfigV2
): NestingResultV2 {
  // Validación: max_count < 2 => todo individual
  if (cfg.max_count < 2) {
    const individuales = items
      .filter(i => i.needs_wood_crate)
      .map((item, idx) => createIndividualBundle(item, idx, cfg));
    
    return {
      bundles: individuales,
      consolidados: [],
      individuales,
      stats: {
        total_items: items.length,
        items_consolidados: 0,
        items_individuales: items.length,
        total_cajas: individuales.length,
        cajas_consolidadas: 0,
        cajas_individuales: individuales.length,
      },
      rows: buildReportRows([], individuales),
    };
  }
  
  // Step A: Filtrar
  const itemsCrate = items.filter(i => i.needs_wood_crate);
  const candidates: NestingItemV2[] = [];
  const nonEligible: NestingItemV2[] = [];
  
  for (const item of itemsCrate) {
    if (isEligible(item, cfg)) {
      candidates.push(item);
    } else {
      nonEligible.push(item);
    }
  }
  
  // Step B: Construir bundles consolidados
  const { bundles: consolidadosRaw, singles } = buildBundles(candidates, cfg);
  
  // Step C: Crear bundles individuales (singles + nonEligible)
  const allSingles = [...singles, ...nonEligible];
  const individuales = allSingles.map((item, idx) => 
    createIndividualBundle(item, idx, cfg)
  );
  
  // Step D: Calcular dimensiones para consolidados
  const consolidados = consolidadosRaw.map(bundle => ({
    ...bundle,
    dims: computeBundleDims(bundle, cfg),
  }));
  
  // Combinar todos los bundles
  const allBundles = [...consolidados, ...individuales];
  
  // Step E: Generar estadísticas y reportes
  const stats = {
    total_items: itemsCrate.length,
    items_consolidados: consolidados.reduce((sum, b) => sum + b.item_count, 0),
    items_individuales: individuales.length,
    total_cajas: allBundles.length,
    cajas_consolidadas: consolidados.length,
    cajas_individuales: individuales.length,
  };
  
  return {
    bundles: allBundles,
    consolidados,
    individuales,
    stats,
    rows: buildReportRows(consolidados, individuales),
  };
}

// ==================== 6. GENERACIÓN DE REPORTES ====================

/**
 * Genera filas de reporte para visualización
 */
export function buildReportRows(
  consolidados: BundleV2[],
  individuales: BundleV2[]
): ReportRowV2[] {
  const rows: ReportRowV2[] = [];
  
  // Bundles consolidados
  for (const bundle of consolidados) {
    const itemNames = bundle.items.map(i => i.item.nombre);
    const itemIds = bundle.items.map(i => i.item.item_id);
    
    rows.push({
      ref_bundle: bundle.bundle_id,
      qty: 1,
      dims_in: `${bundle.dims.W_in.toFixed(2)} x ${bundle.dims.H_in.toFixed(2)} x ${bundle.dims.T_in.toFixed(2)}`,
      dims_raw: bundle.dims,
      contenido: `contiene ${bundle.item_count} artículos: ${itemNames.join(', ')}`,
      tipo: 'CONSOLIDADA',
      item_count: bundle.item_count,
      items_ids: itemIds,
      items_names: itemNames,
    });
  }
  
  // Bundles individuales
  for (const bundle of individuales) {
    const item = bundle.items[0].item;
    
    rows.push({
      ref_bundle: bundle.bundle_id,
      qty: 1,
      dims_in: `${bundle.dims.W_in.toFixed(2)} x ${bundle.dims.H_in.toFixed(2)} x ${bundle.dims.T_in.toFixed(2)}`,
      dims_raw: bundle.dims,
      contenido: `contiene 1 artículo: ${item.nombre}`,
      tipo: 'INDIVIDUAL',
      item_count: 1,
      items_ids: [item.item_id],
      items_names: [item.nombre],
    });
  }
  
  return rows;
}

// ==================== 7. VALIDACIONES ====================

/**
 * Valida un artículo antes de procesar
 * Retorna null si es válido, o mensaje de error
 */
export function validateItem(item: NestingItemV2): string | null {
  if (!item.item_id || item.item_id.trim() === '') {
    return 'item_id es requerido';
  }
  if (!item.nombre || item.nombre.trim() === '') {
    return 'nombre es requerido';
  }
  if (item.W_in <= 0 || isNaN(item.W_in)) {
    return `W_in inválido: ${item.W_in}`;
  }
  if (item.H_in <= 0 || isNaN(item.H_in)) {
    return `H_in inválido: ${item.H_in}`;
  }
  if (item.T_in <= 0 || isNaN(item.T_in)) {
    return `T_in inválido: ${item.T_in}`;
  }
  return null;
}

/**
 * Valida configuración
 */
export function validateConfig(cfg: NestingConfigV2): string | null {
  if (cfg.tol_pct < 0 || cfg.tol_pct > 1) {
    return 'tol_pct debe estar entre 0 y 1';
  }
  if (cfg.min_T_in >= cfg.max_T_in) {
    return 'min_T_in debe ser menor que max_T_in';
  }
  if (cfg.max_count < 1) {
    return 'max_count debe ser >= 1';
  }
  if (cfg.flat_max_T_in < cfg.min_T_in) {
    return 'flat_max_T_in debe ser >= min_T_in';
  }
  return null;
}

// ==================== 8. EXPORT ====================

export default {
  calcPackSideIn,
  isFlat,
  isEligible,
  isSimilar,
  buildBundles,
  computeBundleDims,
  createIndividualBundle,
  runNestingV2,
  buildReportRows,
  validateItem,
  validateConfig,
};
