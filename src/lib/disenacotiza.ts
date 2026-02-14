// ============================================
// DISEÑA Y COTIZA - ALGORITMOS DE 4 ROLES
// OSi-plus V7 - International Packers SRL
// ============================================

import type {
  BundleV2,
} from '@/types/nestingV2.types';
import type {
  LumberMaterial,
  PlywoodMaterial,
  CostosConfig,
  ReglasIngenieria,
  CajaInventario,
  InventarioResult,
  TipoCaja,
  PanelCorte,
  CorteMadera,
  ResultadoIngenieria,
  CostoCaja,
  CotizacionResult,
  PlanoTecnico,
  CutListProduccion,
  OrdenProduccion,
  DisenaCotizaResult,
} from '@/types/disenacotiza.types';
import {
  DEFAULT_MATERIALES,
  DEFAULT_COSTOS_CONFIG,
  DEFAULT_REGLAS_INGENIERIA,
} from '@/types/disenacotiza.types';

// ==================== ROL A: INGENIERÍA DE CAJAS ====================

/**
 * Calcula el peso del contenido de un bundle
 */
function calcularPesoContenido(bundle: BundleV2): number {
  // Si los items tienen peso, sumarlos
  // Si no, estimar 2 lb por pie cúbico de contenido
  let peso = 0;
  for (const item of bundle.items) {
    if (item.item.weight && item.item.weight > 0) {
      peso += item.item.weight;
    } else {
      // Estimación: volumen * densidad típica (0.03 lb/pulgada cúbica)
      const volumen = item.W_oriented * item.H_oriented * item.T_packed;
      peso += volumen * 0.03;
    }
  }
  return Math.round(peso * 100) / 100;
}

/**
 * Decide el tipo de caja según peso y dimensiones
 */
function decidirTipoCaja(
  pesoTotal: number,
  _dims: { W_in: number; H_in: number; T_in: number },
  reglas: ReglasIngenieria
): TipoCaja {
  if (pesoTotal > reglas.pesoLimiteEstandar) {
    return 'PESADA';
  }
  if (pesoTotal > reglas.pesoLimiteLigera) {
    return 'ESTANDAR';
  }
  return 'LIGERA';
}

/**
 * Selecciona materiales según tipo de caja
 */
function seleccionarMateriales(
  tipoCaja: TipoCaja,
  materiales: typeof DEFAULT_MATERIALES
): { plywood: PlywoodMaterial; lumber: LumberMaterial } {
  const config = DEFAULT_REGLAS_INGENIERIA[tipoCaja.toLowerCase() as 'ligera' | 'estandar' | 'pesada'];
  
  const plywood = materiales.plywood.find(p => p.thicknessIn === config.plywoodThickness)!;
  const lumber = materiales.lumber.find(l => l.profile === config.lumberProfile)!;
  
  return { plywood, lumber };
}

/**
 * Calcula paneles necesarios para una caja
 */
function calcularPaneles(
  dims: { W_in: number; H_in: number; T_in: number },
  _espesorPlywood: number
): { paneles: PanelCorte[]; areaTotal: number } {
  const W = dims.W_in;
  const H = dims.H_in;
  const T = dims.T_in;
  
  const paneles: PanelCorte[] = [
    // Laterales (2)
    { tipo: 'lateral', width: T, height: H, area: (T * H) / 144 },
    { tipo: 'lateral', width: T, height: H, area: (T * H) / 144 },
    // Tapas (2)
    { tipo: 'tapa', width: W, height: T, area: (W * T) / 144 },
    { tipo: 'tapa', width: W, height: T, area: (W * T) / 144 },
    // Frente y trasera (2)
    { tipo: 'frente', width: W, height: H, area: (W * H) / 144 },
    { tipo: 'frente', width: W, height: H, area: (W * H) / 144 },
  ];
  
  const areaTotal = paneles.reduce((sum, p) => sum + p.area, 0);
  
  return { paneles, areaTotal };
}

/**
 * Calcula cortes de madera necesarios
 */
function calcularCortesMadera(
  dims: { W_in: number; H_in: number; T_in: number },
  tipoCaja: TipoCaja,
  lumber: LumberMaterial
): { cortes: CorteMadera[]; piesLineales: number } {
  const W = dims.W_in;
  const H = dims.H_in;
  const T = dims.T_in;
  
  const cortes: CorteMadera[] = [];
  
  // Marco perimetral superior e inferior
  cortes.push({ perfil: lumber.profile, largo: W, cantidad: 4, proposito: 'marco' });
  cortes.push({ perfil: lumber.profile, largo: H, cantidad: 4, proposito: 'marco' });
  
  // Refuerzos verticales (esquinas)
  cortes.push({ perfil: lumber.profile, largo: T, cantidad: 4, proposito: 'refuerzo' });
  
  // Base (siempre para ligera y estandar)
  if (tipoCaja === 'LIGERA' || tipoCaja === 'ESTANDAR') {
    cortes.push({ perfil: lumber.profile, largo: W, cantidad: 2, proposito: 'base' });
    cortes.push({ perfil: lumber.profile, largo: H, cantidad: 2, proposito: 'base' });
  }
  
  // Patines (solo caja pesada)
  if (tipoCaja === 'PESADA') {
    cortes.push({ perfil: lumber.profile, largo: W, cantidad: 2, proposito: 'patin' });
  }
  
  // Refuerzos intermedios (si dimensiones grandes)
  const refuerzosIntermediosMinDim = DEFAULT_REGLAS_INGENIERIA.refuerzosIntermediosMinDim;
  if (W > refuerzosIntermediosMinDim || H > refuerzosIntermediosMinDim) {
    cortes.push({ perfil: lumber.profile, largo: Math.min(W, H), cantidad: 2, proposito: 'refuerzo_intermedio' });
  }
  
  // Refuerzos cruzados (solo caja pesada)
  if (tipoCaja === 'PESADA') {
    const diagonal = Math.sqrt(W * W + H * H);
    cortes.push({ perfil: lumber.profile, largo: diagonal, cantidad: 2, proposito: 'refuerzo_cruzado' });
  }
  
  // Calcular pies lineales totales
  const piesLineales = cortes.reduce((sum, c) => sum + (c.largo * c.cantidad / 12), 0);
  
  return { cortes, piesLineales };
}

/**
 * Calcula peso de la estructura
 */
function calcularPesoEstructura(
  areaPlywood: number,
  plywood: PlywoodMaterial,
  piesLineales: number,
  lumber: LumberMaterial
): number {
  const pesoPlywood = areaPlywood * plywood.weightPerSqFt;
  const pesoMadera = piesLineales * lumber.weightPerFt;
  const pesoHardware = 2; // Estimación 2 lb por caja
  
  return Math.round((pesoPlywood + pesoMadera + pesoHardware) * 100) / 100;
}

/**
 * ROL A: Ejecuta ingeniería de caja
 */
export function ejecutarIngenieria(
  bundle: BundleV2,
  materiales: typeof DEFAULT_MATERIALES
): ResultadoIngenieria {
  const dims = bundle.dims;
  
  // 1. Calcular peso del contenido
  const pesoContenido = calcularPesoContenido(bundle);
  
  // 2. Decidir tipo de caja (usando peso estimado inicial)
  const tipoCaja = decidirTipoCaja(pesoContenido, dims, DEFAULT_REGLAS_INGENIERIA);
  
  // 3. Seleccionar materiales
  const { plywood, lumber } = seleccionarMateriales(tipoCaja, materiales);
  
  // 4. Calcular paneles
  const { paneles, areaTotal } = calcularPaneles(dims, plywood.thicknessIn);
  
  // 5. Calcular cortes de madera
  const { cortes, piesLineales } = calcularCortesMadera(dims, tipoCaja, lumber);
  
  // 6. Calcular peso de estructura
  const pesoEstructura = calcularPesoEstructura(areaTotal, plywood, piesLineales, lumber);
  
  // 7. Calcular peso total
  const pesoTotal = pesoContenido + pesoEstructura;
  
  // 8. Verificar si necesita refuerzos adicionales
  const refuerzosInternos = dims.T_in > DEFAULT_REGLAS_INGENIERIA.refuerzoInternoMinT;
  const refuerzosIntermedios = dims.W_in > DEFAULT_REGLAS_INGENIERIA.refuerzosIntermediosMinDim || 
                                dims.H_in > DEFAULT_REGLAS_INGENIERIA.refuerzosIntermediosMinDim;
  
  // 9. Dimensiones externas
  const espesorTotal = plywood.thicknessIn + lumber.actualHeightIn;
  const dimsExternas = {
    W_in: dims.W_in + 2 * espesorTotal,
    H_in: dims.H_in + 2 * espesorTotal,
    T_in: dims.T_in + 2 * espesorTotal,
  };
  
  // 10. Observaciones
  const observaciones: string[] = [];
  if (refuerzosInternos) observaciones.push('Requiere refuerzos internos por profundidad');
  if (refuerzosIntermedios) observaciones.push('Requiere refuerzos intermedios por dimensiones');
  if (tipoCaja === 'PESADA') observaciones.push('Incluye patines para manipulación');
  
  // 11. Hardware
  const hardware = materiales.hardware.map(h => ({
    item: h,
    cantidad: h.qtyPerBox,
  }));
  
  return {
    boxId: bundle.bundle_id,
    tipoCaja,
    dimsInternas: dims,
    dimsExternas: dimsExternas,
    plywood,
    lumber,
    paneles,
    areaPlywoodTotal: Math.round(areaTotal * 100) / 100,
    cortesMadera: cortes,
    piesLinealesTotal: Math.round(piesLineales * 100) / 100,
    hardware,
    pesoContenido,
    pesoEstructura,
    pesoTotal,
    refuerzosInternos,
    refuerzosIntermedios,
    patines: tipoCaja === 'PESADA',
    observaciones,
  };
}

// ==================== ROL B: COSTOS Y COTIZACIÓN ====================

/**
 * Calcula costo de empaque por artículo
 */
function calcularCostoEmpaque(
  numArticulos: number,
  config: CostosConfig
): number {
  const empaquePorArticulo = config.empaqueCartonIn + config.empaqueBurbujaIn + config.empaqueFoamIn;
  // Costo estimado: $2 por cada pulgada de empaque por artículo
  return numArticulos * empaquePorArticulo * 2;
}

/**
 * Calcula costos directos de una caja
 */
export function calcularCostosCaja(
  ingenieria: ResultadoIngenieria,
  config: CostosConfig
): CostoCaja {
  // 1. Costo madera
  const piesLineales = ingenieria.piesLinealesTotal;
  const costoMadera = piesLineales * ingenieria.lumber.costPerFt;
  const desperdicioMadera = costoMadera * (config.desperdicioMaderaPercent / 100);
  
  // 2. Costo plywood
  const areaPlywood = ingenieria.areaPlywoodTotal;
  const areaConDesperdicio = areaPlywood * (1 + ingenieria.plywood.wastePercent / 100);
  const sheetsNecesarias = Math.ceil(areaConDesperdicio / 32); // 32 ft2 por plancha
  const costoPlywood = sheetsNecesarias * ingenieria.plywood.costPerSheet;
  
  // 3. Costo hardware
  const costoHardware = ingenieria.hardware.reduce((sum, h) => sum + (h.item.costPerUnit * h.cantidad), 0);
  
  // 4. Costo desperdicio total
  const costoDesperdicio = desperdicioMadera;
  
  // 5. Costo mano de obra
  const horas = config.laborHours[ingenieria.tipoCaja.toLowerCase() as 'ligera' | 'estandar' | 'pesada'];
  const costoManoObra = horas * config.laborCostPerHour;
  
  // 6. Costo empaque
  const numArticulos = parseInt(ingenieria.boxId.split('-').pop() || '1'); // Estimación
  const costoEmpaque = calcularCostoEmpaque(numArticulos, config);
  
  // Subtotal directos
  const subtotalDirectos = costoMadera + costoPlywood + costoHardware + costoDesperdicio + costoManoObra + costoEmpaque;
  
  return {
    boxId: ingenieria.boxId,
    costoMadera: Math.round(costoMadera * 100) / 100,
    costoPlywood: Math.round(costoPlywood * 100) / 100,
    costoHardware: Math.round(costoHardware * 100) / 100,
    costoDesperdicio: Math.round(costoDesperdicio * 100) / 100,
    costoManoObra: Math.round(costoManoObra * 100) / 100,
    costoEmpaque: Math.round(costoEmpaque * 100) / 100,
    subtotalDirectos: Math.round(subtotalDirectos * 100) / 100,
    prorrateoIndirectos: 0, // Se calcula después
    costoConMargen: 0,      // Se calcula después
    totalConItbis: 0,       // Se calcula después
  };
}

/**
 * Calcula cotización completa con prorrateos
 */
export function calcularCotizacion(
  costosCajas: CostoCaja[],
  config: CostosConfig,
  cliente?: string,
  proyecto?: string
): CotizacionResult {
  const numCajas = costosCajas.length;
  
  // Subtotal directos
  const subtotalDirectos = costosCajas.reduce((sum, c) => sum + c.subtotalDirectos, 0);
  
  // Prorratear indirectos
  const prorrateoTransporte = config.transporteTotal / numCajas;
  const prorrateoFumigacion = config.fumigacionTotal / numCajas;
  const prorrateoLogistica = config.logisticaTotal / numCajas;
  
  const totalIndirectos = prorrateoTransporte + prorrateoFumigacion + prorrateoLogistica;
  
  // Gastos generales y administración
  const gastosGenerales = subtotalDirectos * (config.gastosGeneralesPercent / 100);
  const administracion = subtotalDirectos * (config.administracionPercent / 100);
  const comisionVenta = subtotalDirectos * (config.comisionVentaPercent / 100);
  
  // Subtotal antes de margen
  const subtotalAntesMargen = subtotalDirectos + totalIndirectos + gastosGenerales + administracion + comisionVenta;
  
  // Margen de beneficio
  const margenBeneficio = subtotalAntesMargen * (config.margenBeneficioPercent / 100);
  
  // Subtotal
  const subtotal = subtotalAntesMargen + margenBeneficio;
  
  // ITBIS
  const itbis = subtotal * (config.itbisPercent / 100);
  
  // Total final
  const totalFinal = subtotal + itbis;
  
  // Actualizar costos de cada caja con prorrateos
  const costosActualizados = costosCajas.map(c => {
    const prorrateoIndirectos = prorrateoTransporte + prorrateoFumigacion + prorrateoLogistica +
                                 (c.subtotalDirectos * (config.gastosGeneralesPercent + config.administracionPercent + config.comisionVentaPercent) / 100);
    const costoConMargen = c.subtotalDirectos + prorrateoIndirectos + 
                           (c.subtotalDirectos * config.margenBeneficioPercent / 100);
    const totalConItbis = costoConMargen * (1 + config.itbisPercent / 100);
    
    return {
      ...c,
      prorrateoIndirectos: Math.round(prorrateoIndirectos * 100) / 100,
      costoConMargen: Math.round(costoConMargen * 100) / 100,
      totalConItbis: Math.round(totalConItbis * 100) / 100,
    };
  });
  
  return {
    cotizacionId: `COT-${Date.now()}`,
    fecha: new Date().toISOString(),
    cliente,
    proyecto,
    totalCajas: numCajas,
    cajasConsolidadas: 0, // Se actualiza después
    cajasIndividuales: 0,
    costosCajas: costosActualizados,
    transporte: config.transporteTotal,
    fumigacion: config.fumigacionTotal,
    logistica: config.logisticaTotal,
    gastosGenerales: Math.round(gastosGenerales * 100) / 100,
    administracion: Math.round(administracion * 100) / 100,
    comisionVenta: Math.round(comisionVenta * 100) / 100,
    margenBeneficio: Math.round(margenBeneficio * 100) / 100,
    subtotal: Math.round(subtotal * 100) / 100,
    itbis: Math.round(itbis * 100) / 100,
    totalFinal: Math.round(totalFinal * 100) / 100,
  };
}

// ==================== ROL C: INVENTARIO ====================

/**
 * Busca caja compatible en inventario
 */
export function consultarInventario(
  dims: { W_in: number; H_in: number; T_in: number },
  inventario: CajaInventario[],
  toleranciaPct: number = 0.05
): InventarioResult {
  for (const caja of inventario) {
    if (caja.estado !== 'disponible') continue;
    
    const diffW = Math.abs(dims.W_in - caja.W_in);
    const diffH = Math.abs(dims.H_in - caja.H_in);
    const diffT = Math.abs(dims.T_in - caja.T_in);
    
    const tolW = toleranciaPct * Math.max(dims.W_in, caja.W_in);
    const tolH = toleranciaPct * Math.max(dims.H_in, caja.H_in);
    const tolT = toleranciaPct * Math.max(dims.T_in, caja.T_in);
    
    // Verificar si es reutilizable exacto
    if (diffW <= tolW && diffH <= tolH && diffT <= tolT) {
      return {
        status: 'REUTILIZABLE',
        cajaOrigen: caja,
        diferenciaW: Math.round(diffW * 100) / 100,
        diferenciaH: Math.round(diffH * 100) / 100,
        diferenciaT: Math.round(diffT * 100) / 100,
      };
    }
    
    // Verificar si es reutilizable con ajuste (solo W/H, T debe ser >=)
    if (diffW <= tolW * 2 && diffH <= tolH * 2 && dims.T_in <= caja.T_in * 1.1) {
      return {
        status: 'REUTILIZABLE_CON_AJUSTE',
        cajaOrigen: caja,
        diferenciaW: Math.round(diffW * 100) / 100,
        diferenciaH: Math.round(diffH * 100) / 100,
        diferenciaT: Math.round(diffT * 100) / 100,
      };
    }
  }
  
  return { status: 'NO_COMPATIBLE' };
}

// ==================== ROL D: PRODUCCIÓN ====================

/**
 * Genera plano técnico
 */
export function generarPlano(
  ingenieria: ResultadoIngenieria
): PlanoTecnico {
  const ubicacionRefuerzos: string[] = [];
  
  if (ingenieria.refuerzosInternos) {
    ubicacionRefuerzos.push('Refuerzos internos en profundidad');
  }
  if (ingenieria.refuerzosIntermedios) {
    ubicacionRefuerzos.push('Refuerzos intermedios en W/H');
  }
  if (ingenieria.patines) {
    ubicacionRefuerzos.push('Patines en base');
  }
  
  const tipoBase = ingenieria.tipoCaja === 'LIGERA' ? 'Base simple' :
                   ingenieria.tipoCaja === 'ESTANDAR' ? 'Base reforzada con listones' :
                   'Base con patines y refuerzos cruzados';
  
  const notasFabricacion: string[] = [
    `Tipo de caja: ${ingenieria.tipoCaja}`,
    `Plywood: ${ingenieria.plywood.thicknessDisplay}`,
    `Estructura: ${ingenieria.lumber.profile}`,
    `Peso estimado: ${ingenieria.pesoTotal} lb`,
    ...ingenieria.observaciones,
  ];
  
  return {
    boxId: ingenieria.boxId,
    tipoCaja: ingenieria.tipoCaja,
    internas: {
      W: Math.round(ingenieria.dimsInternas.W_in * 100) / 100,
      H: Math.round(ingenieria.dimsInternas.H_in * 100) / 100,
      T: Math.round(ingenieria.dimsInternas.T_in * 100) / 100,
    },
    externas: {
      W: Math.round(ingenieria.dimsExternas.W_in * 100) / 100,
      H: Math.round(ingenieria.dimsExternas.H_in * 100) / 100,
      T: Math.round(ingenieria.dimsExternas.T_in * 100) / 100,
    },
    espesorPlywood: ingenieria.plywood.thicknessIn,
    espesorLumber: ingenieria.lumber.actualHeightIn,
    ubicacionRefuerzos,
    tipoBase,
    notasFabricacion,
  };
}

/**
 * Genera cut list para producción
 */
export function generarCutList(
  ingenieria: ResultadoIngenieria
): CutListProduccion {
  // Agrupar cortes de plywood por tipo
  const plywoodCuts = [{
    espesor: ingenieria.plywood.thicknessDisplay,
    cortes: ingenieria.paneles.map(p => ({
      tipo: p.tipo,
      w: Math.round(p.width * 100) / 100,
      h: Math.round(p.height * 100) / 100,
      qty: 1,
    })),
    planchasNecesarias: Math.ceil(ingenieria.areaPlywoodTotal / 32 * 1.15), // 15% desperdicio
  }];
  
  // Agrupar cortes de madera por perfil
  const cortesPorPerfil = new Map<string, typeof ingenieria.cortesMadera>();
  for (const corte of ingenieria.cortesMadera) {
    if (!cortesPorPerfil.has(corte.perfil)) {
      cortesPorPerfil.set(corte.perfil, []);
    }
    cortesPorPerfil.get(corte.perfil)!.push(corte);
  }
  
  const lumberCuts = Array.from(cortesPorPerfil.entries()).map(([perfil, cortes]) => ({
    perfil,
    cortes: cortes.map(c => ({
      largo: Math.round(c.largo * 100) / 100,
      qty: c.cantidad,
      proposito: c.proposito,
    })),
    piesLinealesTotal: Math.round(cortes.reduce((sum, c) => sum + (c.largo * c.cantidad / 12), 0) * 100) / 100,
  }));
  
  return {
    boxId: ingenieria.boxId,
    plywoodCuts,
    lumberCuts,
  };
}

/**
 * Genera orden de producción
 */
export function generarOrdenProduccion(
  cotizacionId: string,
  ingenierias: ResultadoIngenieria[]
): OrdenProduccion {
  const cajas = ingenierias.map(ing => ({
    boxId: ing.boxId,
    plano: generarPlano(ing),
    cutList: generarCutList(ing),
    materiales: ing,
  }));
  
  return {
    ordenId: `OP-${Date.now()}`,
    cotizacionId,
    fechaEmision: new Date().toISOString(),
    cajas,
    estado: 'pendiente',
  };
}

// ==================== FLUJO COMPLETO ====================

/**
 * Ejecuta el flujo completo: Nesting → Ingeniería → Costos → Inventario → Producción
 */
export function ejecutarDisenaCotiza(
  bundles: BundleV2[],
  inventario: CajaInventario[] = [],
  cliente?: string,
  proyecto?: string
): DisenaCotizaResult {
  const materiales = DEFAULT_MATERIALES;
  const configCostos = DEFAULT_COSTOS_CONFIG;
  
  // ROL A: Ingeniería
  const ingenieria = bundles.map(b => ejecutarIngenieria(b, materiales));
  
  // ROL C: Inventario
  const resultadosInventario = ingenieria.map(ing => 
    consultarInventario(ing.dimsInternas, inventario)
  );
  
  // ROL B: Costos (solo para cajas no reutilizables)
  const costos = ingenieria.map((ing, idx) => {
    if (resultadosInventario[idx].status === 'REUTILIZABLE') {
      // Caja reutilizable: costo = 0 (o costo de recuperación)
      return {
        boxId: ing.boxId,
        costoMadera: 0,
        costoPlywood: 0,
        costoHardware: 0,
        costoDesperdicio: 0,
        costoManoObra: 0,
        costoEmpaque: 0,
        subtotalDirectos: 0,
        prorrateoIndirectos: 0,
        costoConMargen: 0,
        totalConItbis: 0,
      };
    }
    return calcularCostosCaja(ing, configCostos);
  });
  
  // Calcular cotización
  const cotizacion = calcularCotizacion(costos, configCostos, cliente, proyecto);
  
  // Contar tipos de cajas
  cotizacion.cajasConsolidadas = bundles.filter(b => b.tipo === 'CONSOLIDADA').length;
  cotizacion.cajasIndividuales = bundles.filter(b => b.tipo === 'INDIVIDUAL').length;
  
  // ROL D: Producción
  const produccion = ingenieria.map(ing => ({
    plano: generarPlano(ing),
    cutList: generarCutList(ing),
  }));
  
  // Generar orden de producción
  const ordenProduccion = generarOrdenProduccion(cotizacion.cotizacionId, ingenieria);
  
  return {
    bundles,
    ingenieria,
    inventario: resultadosInventario,
    costos,
    produccion,
    cotizacion,
    ordenProduccion,
  };
}

// ==================== EXPORT ====================

export default {
  ejecutarIngenieria,
  calcularCostosCaja,
  calcularCotizacion,
  consultarInventario,
  generarPlano,
  generarCutList,
  generarOrdenProduccion,
  ejecutarDisenaCotiza,
};
