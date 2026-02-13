// ============================================
// DISEÑA Y COTIZA - SISTEMA DE 4 ROLES
// OSi-plus V7 - International Packers SRL
// ============================================

import type { BundleV2 } from './nestingV2.types';

// ==================== MATERIALES ====================

export interface LumberMaterial {
  id: string;
  profile: string;           // "1x4", "2x4", "2x6"
  displayName: string;
  actualWidthIn: number;
  actualHeightIn: number;
  weightPerFt: number;       // lb/pie lineal
  costPerFt: number;         // costo por pie lineal
}

export interface PlywoodMaterial {
  id: string;
  thicknessIn: number;       // 0.25, 0.375, 0.5, 0.75
  thicknessDisplay: string;  // "1/4", "3/8", "1/2", "3/4"
  sheetWidthIn: number;      // 48
  sheetLengthIn: number;     // 96
  weightPerSqFt: number;     // lb/pie cuadrado
  costPerSheet: number;      // costo por plancha
  wastePercent: number;      // % desperdicio estimado
}

export interface HardwareMaterial {
  id: string;
  name: string;
  unit: string;
  costPerUnit: number;
  qtyPerBox: number;         // cantidad usada por caja
}

// ==================== CONFIGURACIÓN DE COSTOS ====================

export interface CostosConfig {
  // Mano de obra (horas por tipo de caja)
  laborHours: {
    ligera: number;
    estandar: number;
    pesada: number;
  };
  laborCostPerHour: number;  // BOB/hora
  
  // Empaque por artículo
  empaqueCartonIn: number;
  empaqueBurbujaIn: number;
  empaqueFoamIn: number;
  
  // Indirectos (distribuidos entre todas las cajas)
  transporteTotal: number;
  fumigacionTotal: number;
  logisticaTotal: number;
  gastosGeneralesPercent: number;
  administracionPercent: number;
  comisionVentaPercent: number;
  margenBeneficioPercent: number;
  
  // Impuestos
  itbisPercent: number;
  
  // Desperdicio
  desperdicioMaderaPercent: number;
  desperdicioPlywoodPercent: number;
}

// ==================== REGLAS DE INGENIERÍA ====================

export interface ReglasIngenieria {
  // Límites para tipo de caja
  pesoLimiteLigera: number;      // lb
  pesoLimiteEstandar: number;    // lb
  
  // Refuerzos
  refuerzoInternoMinT: number;   // T_in > este valor
  refuerzosIntermediosMinDim: number; // W o H > este valor
  
  // Materiales por tipo
  ligera: {
    plywoodThickness: number;
    lumberProfile: string;
    baseSimple: boolean;
  };
  estandar: {
    plywoodThickness: number;
    lumberProfile: string;
    baseReforzada: boolean;
  };
  pesada: {
    plywoodThickness: number;
    lumberProfile: string;
    patines: boolean;
    refuerzosCruzados: boolean;
    refuerzosVerticales: boolean;
  };
}

// ==================== INVENTARIO ====================

export interface CajaInventario {
  id: string;
  codigo: string;
  W_in: number;
  H_in: number;
  T_in: number;
  tipoCaja: string;
  estado: 'disponible' | 'reservada' | 'usada';
  ubicacion?: string;
}

export interface InventarioResult {
  status: 'REUTILIZABLE' | 'REUTILIZABLE_CON_AJUSTE' | 'NO_COMPATIBLE';
  cajaOrigen?: CajaInventario;
  diferenciaW?: number;
  diferenciaH?: number;
  diferenciaT?: number;
}

// ==================== RESULTADO DE INGENIERÍA (ROL A) ====================

export type TipoCaja = 'LIGERA' | 'ESTANDAR' | 'PESADA';

export interface PanelCorte {
  tipo: 'lateral' | 'tapa' | 'frente' | 'base';
  width: number;     // pulgadas
  height: number;    // pulgadas
  area: number;      // pies cuadrados
}

export interface CorteMadera {
  perfil: string;
  largo: number;     // pulgadas
  cantidad: number;
  proposito: string; // "marco", "refuerzo", "base", "patin"
}

export interface ResultadoIngenieria {
  boxId: string;
  tipoCaja: TipoCaja;
  
  // Dimensiones
  dimsInternas: { W_in: number; H_in: number; T_in: number };
  dimsExternas: { W_in: number; H_in: number; T_in: number };
  
  // Materiales seleccionados
  plywood: PlywoodMaterial;
  lumber: LumberMaterial;
  
  // Paneles necesarios
  paneles: PanelCorte[];
  areaPlywoodTotal: number;    // pies cuadrados
  
  // Madera necesaria
  cortesMadera: CorteMadera[];
  piesLinealesTotal: number;
  
  // Hardware
  hardware: { item: HardwareMaterial; cantidad: number }[];
  
  // Pesos
  pesoContenido: number;       // lb
  pesoEstructura: number;      // lb
  pesoTotal: number;           // lb
  
  // Observaciones
  refuerzosInternos: boolean;
  refuerzosIntermedios: boolean;
  patines: boolean;
  observaciones: string[];
}

// ==================== RESULTADO DE COSTOS (ROL B) ====================

export interface CostoCaja {
  boxId: string;
  
  // Costos directos
  costoMadera: number;
  costoPlywood: number;
  costoHardware: number;
  costoDesperdicio: number;
  costoManoObra: number;
  costoEmpaque: number;        // por artículo
  subtotalDirectos: number;
  
  // Prorrateo de indirectos (calculado después)
  prorrateoIndirectos: number;
  
  // Margen y total
  costoConMargen: number;
  totalConItbis: number;
}

export interface CotizacionResult {
  cotizacionId: string;
  fecha: string;
  cliente?: string;
  proyecto?: string;
  
  // Resumen
  totalCajas: number;
  cajasConsolidadas: number;
  cajasIndividuales: number;
  
  // Costos
  costosCajas: CostoCaja[];
  
  // Indirectos totales
  transporte: number;
  fumigacion: number;
  logistica: number;
  gastosGenerales: number;
  administracion: number;
  comisionVenta: number;
  margenBeneficio: number;
  
  // Totales
  subtotal: number;
  itbis: number;
  totalFinal: number;
}

// ==================== RESULTADO DE PRODUCCIÓN (ROL D) ====================

export interface PlanoTecnico {
  boxId: string;
  tipoCaja: TipoCaja;
  
  // Medidas
  internas: { W: number; H: number; T: number };
  externas: { W: number; H: number; T: number };
  
  // Espesores
  espesorPlywood: number;
  espesorLumber: number;
  
  // Refuerzos
  ubicacionRefuerzos: string[];
  tipoBase: string;
  
  // Observaciones
  notasFabricacion: string[];
}

export interface CutListProduccion {
  boxId: string;
  
  // Plywood
  plywoodCuts: {
    espesor: string;
    cortes: { tipo: string; w: number; h: number; qty: number }[];
    planchasNecesarias: number;
  }[];
  
  // Madera
  lumberCuts: {
    perfil: string;
    cortes: { largo: number; qty: number; proposito: string }[];
    piesLinealesTotal: number;
  }[];
}

export interface OrdenProduccion {
  ordenId: string;
  cotizacionId: string;
  fechaEmision: string;
  
  cajas: {
    boxId: string;
    plano: PlanoTecnico;
    cutList: CutListProduccion;
    materiales: ResultadoIngenieria;
  }[];
  
  estado: 'pendiente' | 'en_produccion' | 'completada';
}

// ==================== RESULTADO COMPLETO ====================

export interface DisenaCotizaResult {
  // Input
  bundles: BundleV2[];
  
  // Por cada caja
  ingenieria: ResultadoIngenieria[];
  inventario: InventarioResult[];
  costos: CostoCaja[];
  produccion: {
    plano: PlanoTecnico;
    cutList: CutListProduccion;
  }[];
  
  // Cotización final
  cotizacion: CotizacionResult;
  
  // Orden de producción
  ordenProduccion: OrdenProduccion;
}

// ==================== CONFIGURACIÓN POR DEFECTO ====================

export const DEFAULT_MATERIALES: {
  lumber: LumberMaterial[];
  plywood: PlywoodMaterial[];
  hardware: HardwareMaterial[];
} = {
  lumber: [
    {
      id: 'LUM-1x4',
      profile: '1x4',
      displayName: '1x4 (3/4" x 3-1/2")',
      actualWidthIn: 3.5,
      actualHeightIn: 0.75,
      weightPerFt: 0.5,
      costPerFt: 0.65,
    },
    {
      id: 'LUM-2x4',
      profile: '2x4',
      displayName: '2x4 (1-1/2" x 3-1/2")',
      actualWidthIn: 3.5,
      actualHeightIn: 1.5,
      weightPerFt: 1.2,
      costPerFt: 1.10,
    },
    {
      id: 'LUM-2x6',
      profile: '2x6',
      displayName: '2x6 (1-1/2" x 5-1/2")',
      actualWidthIn: 5.5,
      actualHeightIn: 1.5,
      weightPerFt: 1.8,
      costPerFt: 1.65,
    },
  ],
  plywood: [
    {
      id: 'PLY-1/4',
      thicknessIn: 0.25,
      thicknessDisplay: '1/4"',
      sheetWidthIn: 48,
      sheetLengthIn: 96,
      weightPerSqFt: 0.8,
      costPerSheet: 35.00,
      wastePercent: 15,
    },
    {
      id: 'PLY-3/8',
      thicknessIn: 0.375,
      thicknessDisplay: '3/8"',
      sheetWidthIn: 48,
      sheetLengthIn: 96,
      weightPerSqFt: 1.1,
      costPerSheet: 48.50,
      wastePercent: 15,
    },
    {
      id: 'PLY-1/2',
      thicknessIn: 0.5,
      thicknessDisplay: '1/2"',
      sheetWidthIn: 48,
      sheetLengthIn: 96,
      weightPerSqFt: 1.5,
      costPerSheet: 62.00,
      wastePercent: 12,
    },
    {
      id: 'PLY-3/4',
      thicknessIn: 0.75,
      thicknessDisplay: '3/4"',
      sheetWidthIn: 48,
      sheetLengthIn: 96,
      weightPerSqFt: 2.2,
      costPerSheet: 85.00,
      wastePercent: 10,
    },
  ],
  hardware: [
    { id: 'HW-SCREW', name: 'Tornillo #8 x 2"', unit: 'unidad', costPerUnit: 0.15, qtyPerBox: 24 },
    { id: 'HW-STAPLE', name: 'Grapa 1/2"', unit: 'unidad', costPerUnit: 0.03, qtyPerBox: 50 },
    { id: 'HW-NAIL', name: 'Clavo 2-1/2"', unit: 'unidad', costPerUnit: 0.08, qtyPerBox: 16 },
    { id: 'HW-BRACE', name: 'Escuadra metálica', unit: 'unidad', costPerUnit: 1.25, qtyPerBox: 4 },
  ],
};

export const DEFAULT_COSTOS_CONFIG: CostosConfig = {
  laborHours: {
    ligera: 1.5,
    estandar: 2.5,
    pesada: 4.0,
  },
  laborCostPerHour: 15.00,
  
  empaqueCartonIn: 0.125,
  empaqueBurbujaIn: 0.25,
  empaqueFoamIn: 0.25,
  
  transporteTotal: 150.00,
  fumigacionTotal: 75.00,
  logisticaTotal: 100.00,
  gastosGeneralesPercent: 8,
  administracionPercent: 5,
  comisionVentaPercent: 3,
  margenBeneficioPercent: 20,
  
  itbisPercent: 18,
  
  desperdicioMaderaPercent: 8,
  desperdicioPlywoodPercent: 12,
};

export const DEFAULT_REGLAS_INGENIERIA: ReglasIngenieria = {
  pesoLimiteLigera: 50,
  pesoLimiteEstandar: 200,
  
  refuerzoInternoMinT: 24,
  refuerzosIntermediosMinDim: 48,
  
  ligera: {
    plywoodThickness: 0.375, // 3/8"
    lumberProfile: '1x4',
    baseSimple: true,
  },
  estandar: {
    plywoodThickness: 0.5, // 1/2"
    lumberProfile: '2x4',
    baseReforzada: true,
  },
  pesada: {
    plywoodThickness: 0.75, // 3/4"
    lumberProfile: '2x4',
    patines: true,
    refuerzosCruzados: true,
    refuerzosVerticales: true,
  },
};
