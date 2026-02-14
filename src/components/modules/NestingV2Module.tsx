import { useState, useMemo } from 'react';
import {
  Box,
  Package,
  Plus,
  Calculator,
  Save,
  Layers,
  Settings,
  Trash2,
  Edit,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Grid3x3,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import type {
  NestingItemV2,
  NestingConfigV2,
  NestingResultV2,
  BundleV2,
} from '@/types/nestingV2.types';
import { DEFAULT_NESTING_CONFIG_V2 } from '@/types/nestingV2.types';
import {
  runNestingV2,
  validateItem,
  validateConfig,
  calcPackSideIn,
  isEligible,
} from '@/lib/nestingV2';

// ==================== DATOS DE EJEMPLO ====================
const EXAMPLE_ITEMS: NestingItemV2[] = [
  { item_id: 'refe-001', nombre: 'La Noche', W_in: 36, H_in: 24, T_in: 2, weight: 5, allow_rotation: true, needs_wood_crate: true },
  { item_id: 'refe-002', nombre: 'El Recuerdo', W_in: 35, H_in: 23, T_in: 1.5, weight: 4, allow_rotation: true, needs_wood_crate: true },
  { item_id: 'refe-003', nombre: 'Amanecer', W_in: 36.5, H_in: 24.5, T_in: 2.2, weight: 5.5, allow_rotation: true, needs_wood_crate: true },
  { item_id: 'refe-004', nombre: 'Florero Grande', W_in: 18, H_in: 18, T_in: 12, weight: 8, allow_rotation: false, needs_wood_crate: true },
  { item_id: 'refe-005', nombre: 'Cuadro Pequeño', W_in: 20, H_in: 16, T_in: 1.8, weight: 2, allow_rotation: true, needs_wood_crate: true },
  { item_id: 'refe-006', nombre: 'Espejo Oval', W_in: 30, H_in: 20, T_in: 1.2, weight: 6, allow_rotation: true, needs_wood_crate: true },
  { item_id: 'refe-007', nombre: 'Escultura', W_in: 15, H_in: 15, T_in: 15, weight: 20, allow_rotation: false, needs_wood_crate: true },
];

// ==================== COMPONENTE PRINCIPAL ====================
export function NestingV2Module() {
  const [activeTab, setActiveTab] = useState('items');
  const [items, setItems] = useState<NestingItemV2[]>([...EXAMPLE_ITEMS]);
  const [config, setConfig] = useState<NestingConfigV2>(DEFAULT_NESTING_CONFIG_V2);
  const [result, setResult] = useState<NestingResultV2 | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  
  // Dialogs
  const [isItemDialogOpen, setIsItemDialogOpen] = useState(false);
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<NestingItemV2 | null>(null);
  
  // Form
  const [itemForm, setItemForm] = useState<Partial<NestingItemV2>>({
    item_id: '',
    nombre: '',
    W_in: 0,
    H_in: 0,
    T_in: 0,
    weight: 0,
    allow_rotation: true,
    needs_wood_crate: true,
  });

  // Stats
  const stats = useMemo(() => {
    const elegibles = items.filter(i => isEligible(i, config));
    return {
      total: items.filter(i => i.needs_wood_crate).length,
      elegibles: elegibles.length,
      noElegibles: items.filter(i => i.needs_wood_crate && !isEligible(i, config)).length,
    };
  }, [items, config]);

  // Handlers
  const handleAddItem = () => {
    setEditingItem(null);
    setItemForm({
      item_id: `refe-${String(items.length + 1).padStart(3, '0')}`,
      nombre: '',
      W_in: 0,
      H_in: 0,
      T_in: 0,
      weight: 0,
      allow_rotation: true,
      needs_wood_crate: true,
    });
    setIsItemDialogOpen(true);
  };

  const handleEditItem = (item: NestingItemV2) => {
    setEditingItem(item);
    setItemForm({ ...item });
    setIsItemDialogOpen(true);
  };

  const handleDeleteItem = (id: string) => {
    setItems(items.filter(i => i.item_id !== id));
    toast.success('Artículo eliminado');
  };

  const handleSaveItem = () => {
    const validation = validateItem(itemForm as NestingItemV2);
    if (validation) {
      toast.error(validation);
      return;
    }
    
    const newItem = itemForm as NestingItemV2;
    
    if (editingItem) {
      setItems(items.map(i => i.item_id === editingItem.item_id ? newItem : i));
      toast.success('Artículo actualizado');
    } else {
      setItems([...items, newItem]);
      toast.success('Artículo agregado');
    }
    setIsItemDialogOpen(false);
  };

  const handleCalculate = () => {
    const configError = validateConfig(config);
    if (configError) {
      toast.error(configError);
      return;
    }
    
    setIsCalculating(true);
    
    // Simular delay
    setTimeout(() => {
      const nestingResult = runNestingV2(items, config);
      setResult(nestingResult);
      setActiveTab('results');
      toast.success(`Cálculo completado: ${nestingResult.stats.cajas_consolidadas} cajas consolidadas, ${nestingResult.stats.cajas_individuales} individuales`);
      setIsCalculating(false);
    }, 500);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Box className="h-6 w-6" />
            Nesting / Consolidado V2
          </h1>
          <p className="text-slate-500">Agrupación de artículos planos por similitud W/H</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsConfigDialogOpen(true)}>
            <Settings className="h-4 w-4 mr-2" />
            Configuración
          </Button>
          <Button onClick={handleCalculate} disabled={isCalculating}>
            {isCalculating ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Calculator className="h-4 w-4 mr-2" />
            )}
            Calcular
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
            <p className="text-sm text-slate-500">Total Artículos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{stats.elegibles}</p>
            <p className="text-sm text-slate-500">Elegibles</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-orange-600">{stats.noElegibles}</p>
            <p className="text-sm text-slate-500">No Elegibles</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{result?.stats.total_cajas || 0}</p>
            <p className="text-sm text-slate-500">Cajas Resultantes</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="items">
            <Package className="h-4 w-4 mr-2" />
            Artículos
          </TabsTrigger>
          <TabsTrigger value="results" disabled={!result}>
            <Layers className="h-4 w-4 mr-2" />
            Resultados
          </TabsTrigger>
          <TabsTrigger value="report" disabled={!result}>
            <Grid3x3 className="h-4 w-4 mr-2" />
            Reporte
          </TabsTrigger>
        </TabsList>

        {/* Tab: Items */}
        <TabsContent value="items" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Artículos a Procesar</h3>
            <Button onClick={handleAddItem}>
              <Plus className="h-4 w-4 mr-2" />
              Agregar
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>W × H × T (in)</TableHead>
                    <TableHead>Elegible</TableHead>
                    <TableHead>Props</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const elegible = isEligible(item, config);
                    return (
                      <TableRow key={item.item_id} className={!item.needs_wood_crate ? 'opacity-50' : ''}>
                        <TableCell className="font-mono text-sm">{item.item_id}</TableCell>
                        <TableCell>{item.nombre}</TableCell>
                        <TableCell className="font-mono">
                          {item.W_in} × {item.H_in} × {item.T_in}
                        </TableCell>
                        <TableCell>
                          {item.needs_wood_crate ? (
                            elegible ? (
                              <Badge className="bg-green-100 text-green-700">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Sí
                              </Badge>
                            ) : (
                              <Badge variant="secondary">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                No
                              </Badge>
                            )
                          ) : (
                            <Badge variant="outline">Ignorado</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {item.allow_rotation && <Badge variant="outline" className="text-xs">R</Badge>}
                            {!elegible && item.needs_wood_crate && (
                              <Badge variant="outline" className="text-xs text-orange-600">1×1</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => handleEditItem(item)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteItem(item.item_id)}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Config Summary */}
          <Card className="bg-slate-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-500">Configuración Actual</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-slate-500">Tolerancia:</span>
                  <span className="ml-2 font-mono">{(config.tol_pct * 100).toFixed(0)}%</span>
                </div>
                <div>
                  <span className="text-slate-500">Máx. por caja:</span>
                  <span className="ml-2 font-mono">{config.max_count}</span>
                </div>
                <div>
                  <span className="text-slate-500">Espesor plano:</span>
                  <span className="ml-2 font-mono">≤{config.flat_max_T_in}"</span>
                </div>
                <div>
                  <span className="text-slate-500">Empaque:</span>
                  <span className="ml-2 font-mono">{calcPackSideIn(config).toFixed(2)}"</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Results */}
        <TabsContent value="results" className="space-y-4">
          {result && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold text-green-600">{result.stats.cajas_consolidadas}</p>
                    <p className="text-sm text-slate-500">Cajas Consolidadas</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold text-orange-600">{result.stats.cajas_individuales}</p>
                    <p className="text-sm text-slate-500">Cajas Individuales</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold text-blue-600">{result.stats.items_consolidados}</p>
                    <p className="text-sm text-slate-500">Ítems Consolidados</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold text-purple-600">{result.stats.items_individuales}</p>
                    <p className="text-sm text-slate-500">Ítems Individuales</p>
                  </CardContent>
                </Card>
              </div>

              <h3 className="text-lg font-semibold">Bundles Resultantes</h3>
              
              {result.bundles.map((bundle) => (
                <BundleCard key={bundle.bundle_id} bundle={bundle} />
              ))}
            </>
          )}
        </TabsContent>

        {/* Tab: Report */}
        <TabsContent value="report" className="space-y-4">
          {result && (
            <>
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Reporte de Cajas</h3>
                <Button 
                  variant="default" 
                  className="bg-[#003366] hover:bg-[#002244]"
                  onClick={() => {
                    // Guardar bundles en localStorage para que DisenaCotiza los reciba
                    localStorage.setItem('nestingBundles', JSON.stringify(result?.bundles || []));
                    // Cambiar al módulo disenacotiza
                    window.dispatchEvent(new CustomEvent('changeModule', { detail: 'disenacotiza' }));
                  }}
                >
                  <Calculator className="h-4 w-4 mr-2" />
                  Diseña Y Cotiza
                </Button>
              </div>

              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ref. Bundle</TableHead>
                        <TableHead>Cant.</TableHead>
                        <TableHead>Dimensiones (in)</TableHead>
                        <TableHead>Contenido</TableHead>
                        <TableHead>Tipo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.rows.map((row, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono">{row.ref_bundle}</TableCell>
                          <TableCell>{row.qty}</TableCell>
                          <TableCell className="font-mono">{row.dims_in}</TableCell>
                          <TableCell className="max-w-md truncate" title={row.contenido}>
                            {row.contenido}
                          </TableCell>
                          <TableCell>
                            <Badge variant={row.tipo === 'CONSOLIDADA' ? 'default' : 'secondary'}>
                              {row.tipo}
                            </Badge>
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
      </Tabs>

      {/* Dialog: Add/Edit Item */}
      <Dialog open={isItemDialogOpen} onOpenChange={setIsItemDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Editar Artículo' : 'Agregar Artículo'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>ID</Label>
                <Input 
                  value={itemForm.item_id}
                  onChange={(e) => setItemForm({ ...itemForm, item_id: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input 
                  value={itemForm.nombre}
                  onChange={(e) => setItemForm({ ...itemForm, nombre: e.target.value })}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-2">
                <Label>W (in)</Label>
                <Input 
                  type="number"
                  step="0.125"
                  value={itemForm.W_in}
                  onChange={(e) => setItemForm({ ...itemForm, W_in: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>H (in)</Label>
                <Input 
                  type="number"
                  step="0.125"
                  value={itemForm.H_in}
                  onChange={(e) => setItemForm({ ...itemForm, H_in: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>T (in)</Label>
                <Input 
                  type="number"
                  step="0.125"
                  value={itemForm.T_in}
                  onChange={(e) => setItemForm({ ...itemForm, T_in: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox 
                  checked={itemForm.allow_rotation}
                  onCheckedChange={(c) => setItemForm({ ...itemForm, allow_rotation: c as boolean })}
                />
                <span className="text-sm">Permitir rotación</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox 
                  checked={itemForm.needs_wood_crate}
                  onCheckedChange={(c) => setItemForm({ ...itemForm, needs_wood_crate: c as boolean })}
                />
                <span className="text-sm">Requiere caja de madera</span>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsItemDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveItem}>
              <Save className="h-4 w-4 mr-2" />
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Config */}
      <Dialog open={isConfigDialogOpen} onOpenChange={setIsConfigDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Configuración del Nesting
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tolerancia (%)</Label>
                <Input 
                  type="number"
                  step="1"
                  value={(config.tol_pct * 100).toFixed(0)}
                  onChange={(e) => setConfig({ ...config, tol_pct: parseFloat(e.target.value) / 100 })}
                />
                <p className="text-xs text-slate-500">Diferencia permitida en W/H</p>
              </div>
              <div className="space-y-2">
                <Label>Máx. artículos por caja</Label>
                <Input 
                  type="number"
                  value={config.max_count}
                  onChange={(e) => setConfig({ ...config, max_count: parseInt(e.target.value) || 1 })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Espesor mínimo (in)</Label>
                <Input 
                  type="number"
                  step="0.125"
                  value={config.min_T_in}
                  onChange={(e) => setConfig({ ...config, min_T_in: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Espesor máximo (in)</Label>
                <Input 
                  type="number"
                  step="0.125"
                  value={config.max_T_in}
                  onChange={(e) => setConfig({ ...config, max_T_in: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Espesor máximo para "plano" (in)</Label>
              <Input 
                type="number"
                step="0.125"
                value={config.flat_max_T_in}
                onChange={(e) => setConfig({ ...config, flat_max_T_in: parseFloat(e.target.value) || 0 })}
              />
              <p className="text-xs text-slate-500">Artículos con T ≤ este valor son considerados "planos"</p>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">Espesores de Empaque (por lado)</h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Cartón (in)</Label>
                  <Input 
                    type="number"
                    step="0.0625"
                    value={config.pack_carton_in}
                    onChange={(e) => setConfig({ ...config, pack_carton_in: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Burbuja (in)</Label>
                  <Input 
                    type="number"
                    step="0.0625"
                    value={config.pack_bubble_in}
                    onChange={(e) => setConfig({ ...config, pack_bubble_in: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Foam (in)</Label>
                  <Input 
                    type="number"
                    step="0.0625"
                    value={config.pack_foam_in}
                    onChange={(e) => setConfig({ ...config, pack_foam_in: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <p className="text-sm text-slate-500 mt-2">
                Empaque total por lado: <span className="font-mono font-medium">{calcPackSideIn(config).toFixed(3)}"</span>
              </p>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">Holguras</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Entre artículos (in)</Label>
                  <Input 
                    type="number"
                    step="0.0625"
                    value={config.inter_item_gap_in}
                    onChange={(e) => setConfig({ ...config, inter_item_gap_in: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Holgura interna W (in)</Label>
                  <Input 
                    type="number"
                    step="0.0625"
                    value={config.outer_clearance_W_in}
                    onChange={(e) => setConfig({ ...config, outer_clearance_W_in: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Holgura interna H (in)</Label>
                  <Input 
                    type="number"
                    step="0.0625"
                    value={config.outer_clearance_H_in}
                    onChange={(e) => setConfig({ ...config, outer_clearance_H_in: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Holgura interna T (in)</Label>
                  <Input 
                    type="number"
                    step="0.0625"
                    value={config.outer_clearance_T_in}
                    onChange={(e) => setConfig({ ...config, outer_clearance_T_in: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfigDialogOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== SUB-COMPONENTES ====================

function BundleCard({ bundle }: { bundle: BundleV2 }) {
  const [expanded, setExpanded] = useState(false);
  const isConsolidada = bundle.tipo === 'CONSOLIDADA';

  return (
    <Card className={isConsolidada ? 'border-green-300' : 'border-orange-300'}>
      <CardHeader className="pb-3">
        <div 
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-3">
            <Badge className={isConsolidada ? 'bg-green-600' : 'bg-orange-600'}>
              {bundle.tipo}
            </Badge>
            <div>
              <CardTitle className="text-lg font-mono">{bundle.bundle_id}</CardTitle>
              <p className="text-sm text-slate-500">
                {bundle.item_count} artículo{bundle.item_count > 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm text-slate-500">Dimensiones (W × H × T)</p>
              <p className="font-mono font-medium">
                {bundle.dims.W_in.toFixed(2)} × {bundle.dims.H_in.toFixed(2)} × {bundle.dims.T_in.toFixed(2)} in
              </p>
            </div>
            {expanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          </div>
        </div>
      </CardHeader>
      
      {expanded && (
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Artículo</TableHead>
                <TableHead>Original</TableHead>
                <TableHead>Orientado</TableHead>
                <TableHead>T + Empaque</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bundle.items.map((item, idx) => (
                <TableRow key={idx}>
                  <TableCell>{item.item.nombre}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {item.item.W_in} × {item.item.H_in} × {item.item.T_in}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {item.W_oriented} × {item.H_oriented}
                    {item.rotated && <Badge variant="outline" className="ml-2 text-xs">90°</Badge>}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {item.T_packed.toFixed(2)} in
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      )}
    </Card>
  );
}
