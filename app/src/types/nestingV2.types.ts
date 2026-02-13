// ============================================
// NESTING / CONSOLIDADO V2 - TIPOS
// OSi-plus V7 - International Packers SRL
// ============================================

// ==================== ARTÍCULO DE ENTRADA ====================
export interface NestingItemV2 {
  item_id: string;           // ej: "refe-001"
  nombre: string;            // ej: "la noche"
  W_in: number;              // ancho en pulgadas
  H_in: number;              // alto en pulgadas
  T_in: number;              // espesor/profundidad en pulgadas
  weight?: number;           // peso (opcional, para futuras reglas)
  allow_rotation: boolean;   // permite rotar 90°
  needs_wood_crate: boolean; // SOLO true se procesa aquí
}

// ==================== CONFIGURACIÓN DEL NESTING ====================
export interface NestingConfigV2 {
  // Tolerancia para similitud W/H
  tol_pct: number;           // ej: 0.05 = 5%
  
  // Rango de espesor permitido para nesting
  min_T_in: number;          // ej: 1"
  max_T_in: number;          // ej: 10"
  
  // Máximo artículos por caja consolidada
  max_count: number;         // ej: 3
  
  // Regla para artículo "plano"
  flat_max_T_in: number;     // ej: 4" - si T_in <= esto, es plano
  
  // Espesores de empaque (por lado)
  pack_carton_in: number;    // cartón
  pack_bubble_in: number;    // plástico burbuja
  pack_foam_in: number;      // foam
  
  // Holguras
  inter_item_gap_in: number; // entre artículos apilados
  outer_clearance_W_in: number; // holgura interna caja
  outer_clearance_H_in: number;
  outer_clearance_T_in: number;
  
  // Límites físicos (opcional)
  max_W_in?: number;
  max_H_in?: number;
  max_T_in_limit?: number;
}

// ==================== RESULTADO DE SIMILITUD ====================
export interface SimilarityResult {
  similar: boolean;          // son similares
  rotated: boolean;          // B debe rotarse 90°
  error_W: number;           // error en W (abs)
  error_H: number;           // error en H (abs)
  max_error_pct: number;     // máximo error porcentual
}

// ==================== BUNDLE (GRUPO CONSOLIDADO) ====================
export interface BundleV2 {
  bundle_id: string;         // ID del bundle (ej: "BUNDLE-001")
  ref_item_id: string;       // ID del artículo base
  items: BundleItemV2[];     // artículos en el bundle
  tipo: 'CONSOLIDADA' | 'INDIVIDUAL';
  
  // Dimensiones calculadas (internas de la caja)
  dims: {
    W_in: number;
    H_in: number;
    T_in: number;
  };
  
  // Métricas
  item_count: number;
  total_weight?: number;
}

// ==================== ARTÍCULO DENTRO DE BUNDLE ====================
export interface BundleItemV2 {
  item: NestingItemV2;
  rotated: boolean;          // orientación final
  W_oriented: number;        // W después de rotación
  H_oriented: number;        // H después de rotación
  T_packed: number;          // T + 2*pack_side_in
}

// ==================== RESULTADO DEL NESTING ====================
export interface NestingResultV2 {
  bundles: BundleV2[];       // todos los bundles (consolidados + individuales)
  consolidados: BundleV2[];  // solo los consolidados (>=2 items)
  individuales: BundleV2[];  // solo los individuales
  
  // Estadísticas
  stats: {
    total_items: number;
    items_consolidados: number;
    items_individuales: number;
    total_cajas: number;
    cajas_consolidadas: number;
    cajas_individuales: number;
  };
  
  // Para reportes
  rows: ReportRowV2[];
}

// ==================== FILA DE REPORTE ====================
export interface ReportRowV2 {
  ref_bundle: string;        // ID del bundle
  qty: number;               // siempre 1 (una caja)
  dims_in: string;           // "W x H x T"
  dims_raw: { W_in: number; H_in: number; T_in: number };
  contenido: string;         // descripción legible
  tipo: 'CONSOLIDADA' | 'INDIVIDUAL';
  item_count: number;
  items_ids: string[];
  items_names: string[];
}

// ==================== CONFIGURACIÓN POR DEFECTO ====================
export const DEFAULT_NESTING_CONFIG_V2: NestingConfigV2 = {
  tol_pct: 0.05,             // 5% tolerancia
  min_T_in: 1,               // 1 pulgada mínimo
  max_T_in: 10,              // 10 pulgadas máximo
  max_count: 3,              // máximo 3 artículos por caja
  flat_max_T_in: 4,          // artículos hasta 4" son "planos"
  pack_carton_in: 0.125,     // 1/8" cartón
  pack_bubble_in: 0.25,      // 1/4" burbuja
  pack_foam_in: 0.25,        // 1/4" foam
  inter_item_gap_in: 0.125,  // 1/8" entre artículos
  outer_clearance_W_in: 0.5, // 1/2" holgura interna
  outer_clearance_H_in: 0.5,
  outer_clearance_T_in: 0.5,
};
