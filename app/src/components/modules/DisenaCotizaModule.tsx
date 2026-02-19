import { useState } from 'react';
import {
  Box,
  Package,
  Calculator,
  TrendingUp,
  DollarSign,
  Hammer,
  Warehouse,
  FileText,
  RefreshCw,
  Printer,
  Send,
  Save,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import type { BundleV2 } from '@/types/nestingV2.types';
import type { DisenaCotizaResult, ResultadoIngenieria, CostoCaja, CotizacionResult } from '@/types/disenacotiza.types';
import { DEFAULT_COSTOS_CONFIG } from '@/types/disenacotiza.types';
import { ejecutarDisenaCotiza } from '@/lib/disenacotiza';
import { formatCurrency } from '@/lib/formatters';

// ==================== DATOS DE EJEMPLO (de Nesting V2) ====================
const EXAMPLE_BUNDLES: BundleV2[] = [
  {
    bundle_id: 'BUNDLE-1',
    ref_item_id: 'refe-001',
    items: [
      { item: { item_id: 'refe-001', nombre: 'La Noche', W_in: 36, H_in: 24, T_in: 2, weight: 5, allow_rotation: true, needs_wood_crate: true }, rotated: false, W_oriented: 36, H_oriented: 24, T_packed: 3.25 },
      { item: { item_id: 'refe-002', nombre: 'El Recuerdo', W_in: 35, H_in: 23, T_in: 1.5, weight: 4, allow_rotation: true, needs_wood_crate: true }, rotated: false, W_oriented: 35, H_oriented: 23, T_packed: 2.75 },
      { item: { item_id: 'refe-003', nombre: 'Amanecer', W_in: 36.5, H_in: 24.5, T_in: 2.2, weight: 5.5, allow_rotation: true, needs_wood_crate: true }, rotated: false, W_oriented: 36.5, H_oriented: 24.5, T_packed: 3.45 },
    ],
    tipo: 'CONSOLIDADA',
    dims: { W_in: 37.5, H_in: 25.5, T_in: 11.5 },
    item_count: 3,
  },
  {
    bundle_id: 'BUNDLE-2',
    ref_item_id: 'refe-004',
    items: [
      { item: { item_id: 'refe-004', nombre: 'Florero Grande', W_in: 18, H_in: 18, T_in: 12, weight: 8, allow_rotation: false, needs_wood_crate: true }, rotated: false, W_oriented: 18, H_oriented: 18, T_packed: 13.25 },
    ],
    tipo: 'INDIVIDUAL',
    dims: { W_in: 19, H_in: 19, T_in: 14.25 },
    item_count: 1,
  },
  {
    bundle_id: 'BUNDLE-3',
    ref_item_id: 'refe-005',
    items: [
      { item: { item_id: 'refe-005', nombre: 'Cuadro Pequeño', W_in: 20, H_in: 16, T_in: 1.8, weight: 2, allow_rotation: true, needs_wood_crate: true }, rotated: false, W_oriented: 20, H_oriented: 16, T_packed: 3.05 },
      { item: { item_id: 'refe-006', nombre: 'Espejo Oval', W_in: 30, H_in: 20, T_in: 1.2, weight: 6, allow_rotation: true, needs_wood_crate: true }, rotated: true, W_oriented: 20, H_oriented: 30, T_packed: 2.45 },
    ],
    tipo: 'CONSOLIDADA',
    dims: { W_in: 21, H_in: 31, T_in: 7 },
    item_count: 2,
  },
  {
    bundle_id: 'BUNDLE-IND-1',
    ref_item_id: 'refe-007',
    items: [
      { item: { item_id: 'refe-007', nombre: 'Escultura', W_in: 15, H_in: 15, T_in: 15, weight: 20, allow_rotation: false, needs_wood_crate: true }, rotated: false, W_oriented: 15, H_oriented: 15, T_packed: 16.25 },
    ],
    tipo: 'INDIVIDUAL',
    dims: { W_in: 16, H_in: 16, T_in: 17.25 },
    item_count: 1,
  },
];

const money = (value: number) => formatCurrency(value);

// ==================== COMPONENTE PRINCIPAL ====================
export function DisenaCotizaModule() {
  const [activeTab, setActiveTab] = useState('input');
  // Intentar cargar bundles desde localStorage (enviados desde NestingV2)
  const [bundles] = useState<BundleV2[]>(() => {
    const saved = localStorage.getItem('nestingBundles');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return EXAMPLE_BUNDLES;
      }
    }
    return EXAMPLE_BUNDLES;
  });
  const [result, setResult] = useState<DisenaCotizaResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cliente, setCliente] = useState('');
  const [proyecto, setProyecto] = useState('');
  
  // Dialogs
  const [showCotizacionDialog, setShowCotizacionDialog] = useState(false);

  const handleProcesar = () => {
    setIsProcessing(true);
    
    setTimeout(() => {
      const disenaResult = ejecutarDisenaCotiza(bundles, [], cliente, proyecto);
      setResult(disenaResult);
      setActiveTab('ingenieria');
      toast.success('Procesamiento completado: Ingeniería, Costos, Inventario y Producción');
      setIsProcessing(false);
    }, 1000);
  };

  // Actualizar costo de una caja y recalcular totales
  const handleUpdateCosto = (boxId: string, field: 'costoManoObra' | 'costoEmpaque', value: number) => {
    if (!result) return;
    
    const updatedCostos = result.costos.map(c => {
      if (c.boxId === boxId) {
        const newCosto = { ...c, [field]: value };
        // Recalcular subtotal directos
        newCosto.subtotalDirectos = newCosto.costoMadera + newCosto.costoPlywood + newCosto.costoHardware + newCosto.costoDesperdicio + newCosto.costoManoObra + newCosto.costoEmpaque;
        return newCosto;
      }
      return c;
    });
    
    // Recalcular cotización con nuevos costos
    const configCostos = { 
      laborHours: { ligera: 1.5, estandar: 2.5, pesada: 4.0 },
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
    
    const numCajas = updatedCostos.length;
    const subtotalDirectos = updatedCostos.reduce((sum, c) => sum + c.subtotalDirectos, 0);
    
    // Prorratear indirectos
    const prorrateoTransporte = configCostos.transporteTotal / numCajas;
    const prorrateoFumigacion = configCostos.fumigacionTotal / numCajas;
    const prorrateoLogistica = configCostos.logisticaTotal / numCajas;
    
    // Gastos generales y administración
    const gastosGenerales = subtotalDirectos * (configCostos.gastosGeneralesPercent / 100);
    const administracion = subtotalDirectos * (configCostos.administracionPercent / 100);
    const comisionVenta = subtotalDirectos * (configCostos.comisionVentaPercent / 100);
    
    // Subtotal antes de margen
    const subtotalAntesMargen = subtotalDirectos + (prorrateoTransporte + prorrateoFumigacion + prorrateoLogistica) * numCajas + gastosGenerales + administracion + comisionVenta;
    
    // Margen de beneficio
    const margenBeneficio = subtotalAntesMargen * (configCostos.margenBeneficioPercent / 100);
    
    // Subtotal
    const subtotal = subtotalAntesMargen + margenBeneficio;
    
    // ITBIS
    const itbis = subtotal * (configCostos.itbisPercent / 100);
    
    // Total final
    const totalFinal = subtotal + itbis;
    
    // Actualizar costos individuales con prorrateos
    const costosActualizados = updatedCostos.map(c => {
      const prorrateoIndirectos = prorrateoTransporte + prorrateoFumigacion + prorrateoLogistica +
                                   (c.subtotalDirectos * (configCostos.gastosGeneralesPercent + configCostos.administracionPercent + configCostos.comisionVentaPercent) / 100);
      const costoConMargen = c.subtotalDirectos + prorrateoIndirectos + 
                             (c.subtotalDirectos * configCostos.margenBeneficioPercent / 100);
      const totalConItbis = costoConMargen * (1 + configCostos.itbisPercent / 100);
      
      return {
        ...c,
        prorrateoIndirectos: Math.round(prorrateoIndirectos * 100) / 100,
        costoConMargen: Math.round(costoConMargen * 100) / 100,
        totalConItbis: Math.round(totalConItbis * 100) / 100,
      };
    });
    
    setResult({
      ...result,
      costos: costosActualizados,
      cotizacion: {
        ...result.cotizacion,
        costosCajas: costosActualizados,
        subtotal: Math.round(subtotal * 100) / 100,
        itbis: Math.round(itbis * 100) / 100,
        totalFinal: Math.round(totalFinal * 100) / 100,
      },
    });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Box className="h-6 w-6" />
            Diseña y Cotiza
          </h1>
          <p className="text-slate-500">Ingeniería → Costos → Inventario → Producción</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setActiveTab('input')}>
            <Package className="h-4 w-4 mr-2" />
            Ver Listado
          </Button>
          <Button onClick={handleProcesar} disabled={isProcessing || bundles.length === 0}>
            {isProcessing ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Calculator className="h-4 w-4 mr-2" />
            )}
            Procesar Todo
          </Button>
        </div>
      </div>

      {/* Info Cliente/Proyecto */}
      <Card className="bg-slate-50">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cliente</Label>
              <Input 
                placeholder="Nombre del cliente"
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Proyecto</Label>
              <Input 
                placeholder="Nombre del proyecto"
                value={proyecto}
                onChange={(e) => setProyecto(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats si hay resultado */}
      {result && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-slate-900">{result.bundles.length}</p>
              <p className="text-sm text-slate-500">Cajas</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-blue-600">{money(result.cotizacion.subtotal)}</p>
              <p className="text-sm text-slate-500">Subtotal</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{money(result.cotizacion.totalFinal)}</p>
              <p className="text-sm text-slate-500">Total Final</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-purple-600">
                {result.inventario.filter(i => i.status === 'REUTILIZABLE').length}
              </p>
              <p className="text-sm text-slate-500">Reutilizables</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-orange-600">
                {result.inventario.filter(i => i.status === 'NO_COMPATIBLE').length}
              </p>
              <p className="text-sm text-slate-500">A Fabricar</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="input">
            <Package className="h-4 w-4 mr-2" />
            Listado
          </TabsTrigger>
          <TabsTrigger value="ingenieria" disabled={!result}>
            <Hammer className="h-4 w-4 mr-2" />
            Ingeniería
          </TabsTrigger>
          <TabsTrigger value="costos" disabled={!result}>
            <DollarSign className="h-4 w-4 mr-2" />
            Costos
          </TabsTrigger>
          <TabsTrigger value="inventario" disabled={!result}>
            <Warehouse className="h-4 w-4 mr-2" />
            Inventario
          </TabsTrigger>
          <TabsTrigger value="produccion" disabled={!result}>
            <FileText className="h-4 w-4 mr-2" />
            Producción
          </TabsTrigger>
        </TabsList>

        {/* Tab: Input */}
        <TabsContent value="input" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Bundles desde Nesting</h3>
            <Badge variant="outline">{bundles.length} cajas</Badge>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bundle ID</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Dimensiones (in)</TableHead>
                    <TableHead>Artículos</TableHead>
                    <TableHead>Contenido</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bundles.map((bundle) => (
                    <TableRow key={bundle.bundle_id}>
                      <TableCell className="font-mono">{bundle.bundle_id}</TableCell>
                      <TableCell>
                        <Badge variant={bundle.tipo === 'CONSOLIDADA' ? 'default' : 'secondary'}>
                          {bundle.tipo}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono">
                        {bundle.dims.W_in.toFixed(1)} × {bundle.dims.H_in.toFixed(1)} × {bundle.dims.T_in.toFixed(1)}
                      </TableCell>
                      <TableCell>{bundle.item_count}</TableCell>
                      <TableCell className="max-w-xs truncate">
                        {bundle.items.map(i => i.item.nombre).join(', ')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Ingeniería */}
        <TabsContent value="ingenieria" className="space-y-4">
          {result && (
            <>
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Hammer className="h-5 w-5" />
                Ingeniería de cajas
              </h3>
              
              {result.ingenieria.map((ing) => (
                <IngenieriaCard 
                  key={ing.boxId} 
                  ing={ing}
                  bundle={result.bundles.find(b => b.bundle_id === ing.boxId)}
                />
              ))}
            </>
          )}
        </TabsContent>

        {/* Tab: Costos */}
        <TabsContent value="costos" className="space-y-4">
          {result && (
            <>
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  ROL B: Costos y Cotización
                </h3>
                <Button onClick={() => setShowCotizacionDialog(true)}>
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Ver Cotización Completa
                </Button>
              </div>

              {result.costos.map((costo) => (
                <CostoCard 
                  key={costo.boxId} 
                  costo={costo} 
                  ingenieria={result.ingenieria.find(i => i.boxId === costo.boxId)!}
                  onUpdate={handleUpdateCosto}
                />
              ))}
            </>
          )}
        </TabsContent>

        {/* Tab: Inventario */}
        <TabsContent value="inventario" className="space-y-4">
          {result && (
            <>
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Warehouse className="h-5 w-5" />
                ROL C: Consulta de Inventario
              </h3>

              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Caja</TableHead>
                        <TableHead>Dimensiones Requeridas</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Caja Origen</TableHead>
                        <TableHead>Diferencias</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.inventario.map((inv, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono">{result.bundles[idx]?.bundle_id}</TableCell>
                          <TableCell className="font-mono">
                            {result.bundles[idx]?.dims.W_in.toFixed(1)} × {result.bundles[idx]?.dims.H_in.toFixed(1)} × {result.bundles[idx]?.dims.T_in.toFixed(1)}
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={
                                inv.status === 'REUTILIZABLE' ? 'default' :
                                inv.status === 'REUTILIZABLE_CON_AJUSTE' ? 'secondary' :
                                'destructive'
                              }
                            >
                              {inv.status.replace(/_/g, ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell>{inv.cajaOrigen?.codigo || '-'}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {inv.diferenciaW !== undefined && (
                              <>W: {inv.diferenciaW.toFixed(2)}"</>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Tab: Producción */}
        <TabsContent value="produccion" className="space-y-4">
          {result && (
            <>
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  ROL D: Producción (previa verificación ROL C)
                </h3>
                <div className="flex gap-2">
                  <Button variant="outline">
                    <Printer className="h-4 w-4 mr-2" />
                    Imprimir Órden (post verificación almacén)
                  </Button>
                  <Button>
                    <Send className="h-4 w-4 mr-2" />
                    Enviar a Taller
                  </Button>
                </div>
              </div>

              {result.ordenProduccion.cajas.map((caja, idx) => (
                <ProduccionCard key={idx} caja={caja} />
              ))}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog: Cotización Completa */}
      <Dialog open={showCotizacionDialog} onOpenChange={setShowCotizacionDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Cotización Completa
            </DialogTitle>
          </DialogHeader>
          
          {result && (
            <CotizacionCompleta cotizacion={result.cotizacion} />
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCotizacionDialog(false)}>Cerrar</Button>
            <Button>
              <Save className="h-4 w-4 mr-2" />
              Guardar Cotización
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== SUB-COMPONENTES ====================

function IngenieriaCard({ ing, bundle }: { ing: ResultadoIngenieria; bundle?: BundleV2 }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [descripcion, setDescripcion] = useState(bundle?.items[0]?.item.nombre || '');
  const [largo, setLargo] = useState(ing.dimsInternas.W_in.toFixed(0));
  const [ancho, setAncho] = useState(ing.dimsInternas.H_in.toFixed(0));
  const [alto, setAlto] = useState(ing.dimsInternas.T_in.toFixed(0));
  const [peso, setPeso] = useState(ing.pesoTotal.toFixed(0));
  const [tipoCarga, setTipoCarga] = useState('obra_arte');
  const [requireISPM, setRequireISPM] = useState(false);
  const [cargaFragil, setCargaFragil] = useState(true);

  // Helper para mostrar badge de refuerzo
  const RefuerzoBadge = ({ active, label }: { active: boolean; label: string }) => (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${active ? 'bg-slate-100' : 'bg-slate-50 opacity-50'}`}>
      <span className={`text-sm ${active ? 'text-slate-700' : 'text-slate-400'}`}>{label}</span>
    </div>
  );

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3 bg-slate-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Badge className={
              ing.tipoCaja === 'LIGERA' ? 'bg-green-600' :
              ing.tipoCaja === 'ESTANDAR' ? 'bg-blue-600' :
              'bg-red-600'
            }>
              {ing.tipoCaja}
            </Badge>
            <CardTitle className="text-lg font-mono">{ing.boxId}</CardTitle>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? 'Colapsar' : 'Expandir'}
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        {/* Layout de dos columnas como en la referencia */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
          {/* Panel Izquierdo - Detalles del Artículo */}
          <div className="p-6 border-r border-slate-200">
            <h3 className="text-lg font-semibold mb-6 text-slate-800">Detalles del Artículo</h3>
            
            <div className="space-y-4">
              <div>
                <Label className="text-slate-600">Descripción:</Label>
                <Input 
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  className="mt-1"
                  placeholder="Nombre del artículo"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-600">Largo (in):</Label>
                  <Input 
                    type="number"
                    value={largo}
                    onChange={(e) => setLargo(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-slate-600">Ancho (in):</Label>
                  <Input 
                    type="number"
                    value={ancho}
                    onChange={(e) => setAncho(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-600">Alto (in):</Label>
                  <Input 
                    type="number"
                    value={alto}
                    onChange={(e) => setAlto(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-slate-600">Peso (lbs):</Label>
                  <Input 
                    type="number"
                    value={peso}
                    onChange={(e) => setPeso(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
              
              <div>
                <Label className="text-slate-600">Tipo de Carga:</Label>
                <select 
                  value={tipoCarga}
                  onChange={(e) => setTipoCarga(e.target.value)}
                  className="w-full mt-1 p-2 border rounded-lg bg-white"
                >
                  <option value="obra_arte">Obra de Arte</option>
                  <option value="maquinaria">Maquinaria</option>
                  <option value="electronica">Electrónica</option>
                  <option value="mueble">Mueble</option>
                  <option value="otros">Otros</option>
                </select>
              </div>
              
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-600">🪵</span>
                    <Label className="text-slate-600">Require ISPM-15</Label>
                  </div>
                  <Switch checked={requireISPM} onCheckedChange={setRequireISPM} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-red-500">⚠️</span>
                    <Label className="text-slate-600">Carga Frágil</Label>
                  </div>
                  <Switch checked={cargaFragil} onCheckedChange={setCargaFragil} />
                </div>
              </div>
            </div>
          </div>
          
          {/* Panel Derecho - Especificaciones de la Caja */}
          <div className="p-6 bg-slate-50/50">
            <h3 className="text-lg font-semibold mb-4 text-slate-800">Especificaciones de la Caja</h3>
            
            {/* Imagen de caja */}
            <div className="flex justify-center mb-6">
              <div className="w-32 h-32 bg-gradient-to-br from-amber-100 to-amber-200 rounded-xl flex items-center justify-center shadow-inner">
                <svg viewBox="0 0 100 100" className="w-24 h-24">
                  {/* Caja de madera estilizada */}
                  <rect x="20" y="30" width="60" height="50" fill="#D4A574" stroke="#8B6914" strokeWidth="2"/>
                  <rect x="15" y="25" width="70" height="10" fill="#C49A6C" stroke="#8B6914" strokeWidth="2"/>
                  <line x1="20" y1="30" x2="80" y2="80" stroke="#8B6914" strokeWidth="2"/>
                  <line x1="80" y1="30" x2="20" y2="80" stroke="#8B6914" strokeWidth="2"/>
                  <rect x="35" y="45" width="30" height="20" fill="#E8D4B8" stroke="#8B6914" strokeWidth="1"/>
                </svg>
              </div>
            </div>
            
            {/* Tipo de Caja */}
            <div className="text-center mb-6">
              <p className="text-sm text-slate-500">Tipo de Caja:</p>
              <p className="text-2xl font-bold text-slate-800">{ing.tipoCaja}</p>
              <p className="text-xs text-slate-500 mt-1">
                Basado en Peso ({ing.pesoTotal} lbs) y Dimensiones ({ing.dimsInternas.W_in.toFixed(0)} in)
              </p>
            </div>
            
            {/* Especificaciones */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Plywood:</span>
                <Badge variant="secondary" className="font-mono">{ing.plywood.thicknessDisplay}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Estructura:</span>
                <Badge variant="secondary" className="font-mono">{ing.lumber.profile} Pino</Badge>
              </div>
              
              <div className="pt-2">
                <span className="text-slate-600 text-sm">Refuerzos:</span>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <RefuerzoBadge active={ing.refuerzosIntermedios} label="Cruicetos Intermedios" />
                  <RefuerzoBadge active={ing.patines} label="Base con Patines (Skids)" />
                </div>
              </div>
            </div>
            
            {/* Medidas Finales */}
            <div className="mt-6 pt-4 border-t border-slate-200">
              <p className="text-sm font-medium text-slate-700 mb-3">Medidas Finales (Externas)</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Largo:</span>
                  <span className="font-mono">{ing.dimsExternas.W_in.toFixed(0)} in</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Ancho:</span>
                  <span className="font-mono">{ing.dimsExternas.H_in.toFixed(0)} in</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Alto:</span>
                  <span className="font-mono">{ing.dimsExternas.T_in.toFixed(0)} in</span>
                </div>
              </div>
            </div>
            
            {/* Botón Calcular */}
            <Button 
              className="w-full mt-6 bg-orange-500 hover:bg-orange-600 text-white"
              onClick={() => toast.success('Materiales calculados')}
            >
              <Calculator className="h-4 w-4 mr-2" />
              CALCULAR MATERIALES
            </Button>
          </div>
        </div>
        
        {/* Sección expandible con detalles adicionales */}
        {isExpanded && (
          <div className="p-6 border-t border-slate-200 bg-slate-50">
            <Separator className="mb-4" />
            
            <div className="grid grid-cols-3 gap-4">
              <div className="p-3 bg-white rounded-lg shadow-sm">
                <p className="text-xs text-slate-500">Plywood</p>
                <p className="font-medium">{ing.plywood.thicknessDisplay}</p>
                <p className="text-xs text-slate-500">
                  {(() => {
                    const areaPorPlancha = 32;
                    const planchasCompletas = Math.floor(ing.areaPlywoodTotal / areaPorPlancha);
                    const resto = ing.areaPlywoodTotal % areaPorPlancha;
                    const mediaPlancha = resto > 0 ? 0.5 : 0;
                    const totalPlanchas = planchasCompletas + mediaPlancha;
                    return `${totalPlanchas} plancha${totalPlanchas !== 1 ? 's' : ''} (4x8)`;
                  })()}
                </p>
              </div>
              <div className="p-3 bg-white rounded-lg shadow-sm">
                <p className="text-xs text-slate-500">Madera</p>
                <p className="font-medium">{ing.lumber.profile}</p>
                <p className="text-xs text-slate-500">
                  {(() => {
                    const piesPorEnlate = 16;
                    const enlates = Math.ceil(ing.piesLinealesTotal / piesPorEnlate);
                    return `${enlates} enlate${enlates !== 1 ? 's' : ''}`;
                  })()}
                </p>
              </div>
              <div className="p-3 bg-white rounded-lg shadow-sm">
                <p className="text-xs text-slate-500">Peso Total</p>
                <p className="font-medium">{ing.pesoTotal} lb</p>
                <p className="text-xs text-slate-500">Cont: {ing.pesoContenido} | Est: {ing.pesoEstructura}</p>
              </div>
            </div>

            {ing.observaciones.length > 0 && (
              <div className="p-3 bg-amber-50 rounded-lg mt-4">
                <p className="text-xs text-amber-700 font-medium mb-1">Observaciones:</p>
                <ul className="text-sm text-amber-700 list-disc list-inside">
                  {ing.observaciones.map((obs, i) => <li key={i}>{obs}</li>)}
                </ul>
              </div>
            )}

            <div className="mt-4">
              <p className="text-sm font-medium mb-2">Cortes de Madera:</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Perfil</TableHead>
                    <TableHead>Largo</TableHead>
                    <TableHead>Cant.</TableHead>
                    <TableHead>Propósito</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ing.cortesMadera.map((corte, i) => (
                    <TableRow key={i}>
                      <TableCell>{corte.perfil}</TableCell>
                      <TableCell className="font-mono">{corte.largo.toFixed(1)}"</TableCell>
                      <TableCell>{corte.cantidad}</TableCell>
                      <TableCell className="capitalize">{corte.proposito.replace(/_/g, ' ')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CostoCard({ costo, ingenieria, onUpdate }: { costo: CostoCaja; ingenieria: ResultadoIngenieria; onUpdate?: (boxId: string, field: 'costoManoObra' | 'costoEmpaque', value: number) => void }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="font-mono">{costo.boxId}</Badge>
            <div>
              <p className="text-sm text-slate-500">{ingenieria.tipoCaja} | {ingenieria.plywood.thicknessDisplay} + {ingenieria.lumber.profile}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-green-600">{money(costo.totalConItbis)}</p>
            <p className="text-xs text-slate-500">Total con ITBIS</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-3 bg-slate-50 rounded-lg">
            <p className="text-xs text-slate-500">Madera</p>
            <p className="font-mono font-medium">{money(costo.costoMadera)}</p>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg">
            <p className="text-xs text-slate-500">Plywood</p>
            <p className="font-mono font-medium">{money(costo.costoPlywood)}</p>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg">
            <p className="text-xs text-slate-500">Mano de Obra</p>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={costo.costoManoObra}
              onChange={(e) => onUpdate?.(costo.boxId, 'costoManoObra', parseFloat(e.target.value) || 0)}
              className="font-mono font-medium h-8 mt-1"
            />
          </div>
          <div className="p-3 bg-slate-50 rounded-lg">
            <p className="text-xs text-slate-500">Empaque</p>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={costo.costoEmpaque}
              onChange={(e) => onUpdate?.(costo.boxId, 'costoEmpaque', parseFloat(e.target.value) || 0)}
              className="font-mono font-medium h-8 mt-1"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CotizacionCompleta({ cotizacion }: { cotizacion: CotizacionResult }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-slate-500">Cotización ID</p>
          <p className="font-mono">{cotizacion.cotizacionId}</p>
        </div>
        <div>
          <p className="text-sm text-slate-500">Fecha</p>
          <p>{new Date(cotizacion.fecha).toLocaleString()}</p>
        </div>
      </div>

      <Separator />

      <h4 className="font-medium">Costos Directos por Caja</h4>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Caja</TableHead>
            <TableHead className="text-right">Materiales</TableHead>
            <TableHead className="text-right">M.O.</TableHead>
            <TableHead className="text-right">Empaque</TableHead>
            <TableHead className="text-right">Subtotal</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cotizacion.costosCajas.map((c) => (
            <TableRow key={c.boxId}>
              <TableCell className="font-mono">{c.boxId}</TableCell>
              <TableCell className="text-right font-mono">{money(c.costoMadera + c.costoPlywood + c.costoHardware)}</TableCell>
              <TableCell className="text-right font-mono">{money(c.costoManoObra)}</TableCell>
              <TableCell className="text-right font-mono">{money(c.costoEmpaque)}</TableCell>
              <TableCell className="text-right font-mono">{money(c.subtotalDirectos)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Separator />

      <h4 className="font-medium">Costos Indirectos</h4>
      <div className="space-y-2">
        <div className="flex justify-between">
          <span className="text-slate-500">Transporte</span>
          <span className="font-mono">{money(cotizacion.transporte)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Fumigación</span>
          <span className="font-mono">{money(cotizacion.fumigacion)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Logística</span>
          <span className="font-mono">{money(cotizacion.logistica)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Gastos Generales ({DEFAULT_COSTOS_CONFIG.gastosGeneralesPercent}%)</span>
          <span className="font-mono">{money(cotizacion.gastosGenerales)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Administración ({DEFAULT_COSTOS_CONFIG.administracionPercent}%)</span>
          <span className="font-mono">{money(cotizacion.administracion)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Comisión Venta ({DEFAULT_COSTOS_CONFIG.comisionVentaPercent}%)</span>
          <span className="font-mono">{money(cotizacion.comisionVenta)}</span>
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <div className="flex justify-between">
          <span className="text-slate-500">Subtotal</span>
          <span className="font-mono">{money(cotizacion.subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">ITBIS ({DEFAULT_COSTOS_CONFIG.itbisPercent}%)</span>
          <span className="font-mono">{money(cotizacion.itbis)}</span>
        </div>
        <div className="flex justify-between text-xl font-bold pt-2 border-t">
          <span>TOTAL FINAL</span>
          <span className="text-green-600">{money(cotizacion.totalFinal)}</span>
        </div>
      </div>
    </div>
  );
}

function ProduccionCard({ caja }: { caja: { boxId: string; plano: any; cutList: any; materiales: ResultadoIngenieria } }) {
  const [expanded, setExpanded] = useState(false);

  // Helper to get panel label
  const getPanelLabel = (tipo: string, index: number) => {
    const labels: Record<string, string> = {
      'lateral': index === 0 ? 'Lateral 1' : 'Lateral 2',
      'tapa': index <= 1 ? 'Base' : 'Tapa',
      'frente': index <= 1 ? 'Frente' : 'Tracero',
    };
    return labels[tipo] || tipo;
  };

  // Get article names from materiales
  const articleNames = caja.materiales?.hardware?.length > 0 
    ? 'Artículos incluidos'
    : (caja.materiales?.paneles ? 'Caja personalizada' : 'Sin artículos');

  return (
    <Card>
      <CardHeader className="pb-3">
        <div 
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-blue-600" />
            <div>
              <CardTitle className="text-lg font-mono">CAJA - {caja.boxId.replace('BUNDLE-', '').replace('IND-', '')}</CardTitle>
              <p className="text-sm text-slate-500">{caja.plano.tipoCaja} | {caja.plano.tipoBase} | {articleNames}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Printer className="h-4 w-4 mr-2" />
              Ver Diseño
            </Button>
            <Button variant="outline" size="sm">
              <Printer className="h-4 w-4 mr-2" />
              Cut List
            </Button>
          </div>
        </div>
      </CardHeader>
      
      {expanded && (
        <CardContent className="pt-0 space-y-4">
          <Separator />
          
          <div>
            <p className="text-sm font-medium mb-2">Notas de Fabricación:</p>
            <ul className="text-sm text-slate-600 list-disc list-inside space-y-1">
              {caja.plano.notasFabricacion.map((nota: string, i: number) => (
                <li key={i}>{nota}</li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Cut List - Plywood {caja.cutList.plywoodCuts[0]?.espesor}:</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pieza</TableHead>
                  <TableHead>Dimensiones</TableHead>
                  <TableHead>Cant.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {caja.cutList.plywoodCuts[0]?.cortes.map((corte: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell>{getPanelLabel(corte.tipo, i)}</TableCell>
                    <TableCell className="font-mono">{corte.w}" × {corte.h}"</TableCell>
                    <TableCell>{corte.qty}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Cut List - Madera:</p>
            {caja.cutList.lumberCuts.map((lumber: any, idx: number) => (
              <div key={idx} className="mb-2">
                <p className="text-xs text-slate-500">{lumber.perfil} - {lumber.piesLinealesTotal.toFixed(1)} ft</p>
                <div className="flex flex-wrap gap-2">
                  {lumber.cortes.map((corte: any, i: number) => (
                    <Badge key={i} variant="outline" className="font-mono">
                      {corte.largo}" × {corte.qty}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
