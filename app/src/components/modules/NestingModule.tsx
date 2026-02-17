import { useState, useMemo } from 'react';
import {
  Box,
  Package,
  Plus,
  Calculator,
  Save,
  FileText,
  Layers,
  Trash2,
  Edit,
  ChevronRight,
  ChevronDown,
  Copy,
  Settings,
  Download,
  RefreshCw,
  Grid3x3,
  Hammer,
  Scissors,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import type {
  NestingItem,
  NestingVersion,
  NestingBox,
  BoxBOM,
  MaterialCatalog,
  PackingParameters,
} from '@/types/nesting.types';
import {
  defaultMaterialCatalog,
  defaultPackingParameters,
  defaultSelectionRules,
  exampleNestingItems,
} from '@/data/nestingMockData';
import {
  runNestingAlgorithm,
  generateCompleteBOMandCuts,
  cmToInches,
  kgToLb,
  roundToFraction,
} from '@/lib/nestingAlgorithms';
import { formatCurrency } from '@/lib/formatters';

const money = (value: number) => formatCurrency(value, "$");

// ==================== COMPONENTE PRINCIPAL ====================
export function NestingModule() {
  // Estados
  const [activeTab, setActiveTab] = useState('items');
  const [items, setItems] = useState<NestingItem[]>([...exampleNestingItems]);
  const [versions, setVersions] = useState<NestingVersion[]>([]);
  const [currentVersion, setCurrentVersion] = useState<NestingVersion | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [parameters, setParameters] = useState<PackingParameters>(defaultPackingParameters);
  const [catalog] = useState<MaterialCatalog>(defaultMaterialCatalog);
  
  // Dialogs
  const [isItemDialogOpen, setIsItemDialogOpen] = useState(false);
  const [isParamDialogOpen, setIsParamDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<NestingItem | null>(null);
  
  // Formulario de ítem
  const [itemForm, setItemForm] = useState<Partial<NestingItem>>({
    id: '',
    description: '',
    dimensions: { length: 0, width: 0, height: 0 },
    weight: { value: 0, unit: 'kg' },
    quantity: 1,
    fragilityTier: 'MEDIA',
    allowRotation: true,
    stackable: true,
  });

  // Stats
  const stats = useMemo(() => {
    const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
    const totalVolume = items.reduce((sum, i) => {
      const vol = (i.dimensions.length * i.dimensions.width * i.dimensions.height * i.quantity) / 1000000;
      return sum + vol;
    }, 0);
    const totalWeight = items.reduce((sum, i) => {
      const w = i.weight.unit === 'kg' ? i.weight.value : kgToLb(i.weight.value);
      return sum + (w * i.quantity);
    }, 0);
    return { totalItems, totalVolume, totalWeight };
  }, [items]);

  // Handlers
  const handleAddItem = () => {
    setEditingItem(null);
    setItemForm({
      id: `ITEM-${Date.now()}`,
      description: '',
      dimensions: { length: 0, width: 0, height: 0 },
      weight: { value: 0, unit: 'kg' },
      quantity: 1,
      fragilityTier: 'MEDIA',
      allowRotation: true,
      stackable: true,
    });
    setIsItemDialogOpen(true);
  };

  const handleEditItem = (item: NestingItem) => {
    setEditingItem(item);
    setItemForm({ ...item });
    setIsItemDialogOpen(true);
  };

  const handleDeleteItem = (id: string) => {
    setItems(items.filter(i => i.id !== id));
    toast.success('Ítem eliminado');
  };

  const handleSaveItem = () => {
    if (!itemForm.description || !itemForm.dimensions?.length) {
      toast.error('Complete los campos obligatorios');
      return;
    }
    
    const newItem = itemForm as NestingItem;
    
    if (editingItem) {
      setItems(items.map(i => i.id === editingItem.id ? newItem : i));
      toast.success('Ítem actualizado');
    } else {
      setItems([...items, newItem]);
      toast.success('Ítem agregado');
    }
    setIsItemDialogOpen(false);
  };

  const handleCalculateNesting = async () => {
    if (items.length === 0) {
      toast.error('Agregue al menos un ítem');
      return;
    }
    
    setIsCalculating(true);
    
    // Simular delay para UX
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Ejecutar algoritmo
    const result = runNestingAlgorithm(items, parameters, catalog, defaultSelectionRules);
    
    if (result.success) {
      // Generar BOM y cuts
      const completeResult = generateCompleteBOMandCuts(result, catalog, parameters);
      
      // Crear nueva versión
      const newVersion: NestingVersion = {
        ...completeResult.version,
        versionName: String.fromCharCode(65 + versions.length), // A, B, C...
        versionNumber: versions.length + 1,
      };
      
      setVersions([...versions, newVersion]);
      setCurrentVersion(newVersion);
      setActiveTab('results');
      toast.success(`Nesting calculado: ${newVersion.totalBoxes} caja(s) propuesta(s)`);
    } else {
      toast.error(result.error || 'Error en el cálculo');
    }
    
    setIsCalculating(false);
  };

  const handleDuplicateVersion = (version: NestingVersion) => {
    const newVersion: NestingVersion = {
      ...version,
      id: `NEST-${Date.now()}`,
      versionName: String.fromCharCode(65 + versions.length),
      versionNumber: versions.length + 1,
      status: 'draft',
      createdAt: new Date().toISOString(),
    };
    setVersions([...versions, newVersion]);
    toast.success('Versión duplicada');
  };

  // Render
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Box className="h-6 w-6" />
            Nesting + Huacales/Cajas
          </h1>
          <p className="text-slate-500">Cálculo de dimensiones, materiales y costos de empaque</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsParamDialogOpen(true)}>
            <Settings className="h-4 w-4 mr-2" />
            Parámetros
          </Button>
          <Button onClick={handleCalculateNesting} disabled={isCalculating || items.length === 0}>
            {isCalculating ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Calculator className="h-4 w-4 mr-2" />
            )}
            Calcular Nesting
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{stats.totalItems}</p>
            <p className="text-sm text-slate-500">Ítems Totales</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{stats.totalVolume.toFixed(2)}</p>
            <p className="text-sm text-slate-500">Volumen (m³)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{stats.totalWeight.toFixed(1)}</p>
            <p className="text-sm text-slate-500">Peso (lb)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-purple-600">{versions.length}</p>
            <p className="text-sm text-slate-500">Versiones</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="items">
            <Package className="h-4 w-4 mr-2" />
            Ítems
          </TabsTrigger>
          <TabsTrigger value="results" disabled={versions.length === 0}>
            <Layers className="h-4 w-4 mr-2" />
            Resultados
          </TabsTrigger>
          <TabsTrigger value="bom" disabled={versions.length === 0}>
            <FileText className="h-4 w-4 mr-2" />
            BOM
          </TabsTrigger>
          <TabsTrigger value="cuts" disabled={versions.length === 0}>
            <Scissors className="h-4 w-4 mr-2" />
            Cut Lists
          </TabsTrigger>
        </TabsList>

        {/* Tab: Items */}
        <TabsContent value="items" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Ítems a Empacar</h3>
            <Button onClick={handleAddItem}>
              <Plus className="h-4 w-4 mr-2" />
              Agregar Ítem
            </Button>
          </div>

          {items.length === 0 ? (
            <Card className="p-8 text-center">
              <Package className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">No hay ítems. Agregue ítems para calcular el nesting.</p>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ítem</TableHead>
                      <TableHead>Dimensiones (cm)</TableHead>
                      <TableHead>Peso</TableHead>
                      <TableHead>Cant.</TableHead>
                      <TableHead>Fragilidad</TableHead>
                      <TableHead>Props</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{item.description}</p>
                            <p className="text-xs text-slate-500">{item.id}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {item.dimensions.length} × {item.dimensions.width} × {item.dimensions.height}
                          <p className="text-xs text-slate-500">
                            {roundToFraction(cmToInches(item.dimensions.length)).toFixed(2)}" × 
                            {roundToFraction(cmToInches(item.dimensions.width)).toFixed(2)}" × 
                            {roundToFraction(cmToInches(item.dimensions.height)).toFixed(2)}"
                          </p>
                        </TableCell>
                        <TableCell>
                          {item.weight.value} {item.weight.unit}
                          <p className="text-xs text-slate-500">
                            {item.weight.unit === 'kg' ? kgToLb(item.weight.value).toFixed(1) : item.weight.value} lb
                          </p>
                        </TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>
                          <Badge variant={
                            item.fragilityTier === 'ALTA' ? 'destructive' :
                            item.fragilityTier === 'MEDIA' ? 'default' : 'secondary'
                          }>
                            {item.fragilityTier}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {item.allowRotation && <Badge variant="outline" className="text-xs">R</Badge>}
                            {item.stackable && <Badge variant="outline" className="text-xs">S</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => handleEditItem(item)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteItem(item.id)}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Versiones */}
          {versions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Layers className="h-5 w-5" />
                  Versiones Calculadas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {versions.map((version) => (
                    <div 
                      key={version.id}
                      className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                        currentVersion?.id === version.id 
                          ? 'bg-blue-50 border-blue-300' 
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                      onClick={() => setCurrentVersion(version)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Badge className="text-lg px-3 py-1">{version.versionName}</Badge>
                          <div>
                            <p className="font-medium">{version.totalBoxes} caja(s)</p>
                            <p className="text-sm text-slate-500">
                              {new Date(version.createdAt).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="font-bold text-lg">{money(version.totalCost)}</p>
                            <p className="text-sm text-slate-500">costo total</p>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDuplicateVersion(version);
                            }}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tab: Results */}
        <TabsContent value="results" className="space-y-4">
          {currentVersion && (
            <>
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Badge className="text-lg px-3 py-1">{currentVersion.versionName}</Badge>
                  Resultados del Nesting
                </h3>
                <div className="flex gap-2">
                  <Button variant="outline">
                    <Download className="h-4 w-4 mr-2" />
                    Exportar
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-3xl font-bold text-slate-900">{currentVersion.totalBoxes}</p>
                    <p className="text-sm text-slate-500">Cajas Propuestas</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-3xl font-bold text-green-600">{money(currentVersion.totalCost)}</p>
                    <p className="text-sm text-slate-500">Costo Total</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-3xl font-bold text-blue-600">{currentVersion.metrics.totalPlywoodWaste}%</p>
                    <p className="text-sm text-slate-500">Desperdicio Plywood</p>
                  </CardContent>
                </Card>
              </div>

              {currentVersion.boxes.map((box) => (
                <BoxResultCard key={box.id} box={box} />
              ))}
            </>
          )}
        </TabsContent>

        {/* Tab: BOM */}
        <TabsContent value="bom" className="space-y-4">
          {currentVersion && currentVersion.boms.map((bom, index) => (
            <BOMCard key={bom.boxId} bom={bom} boxNumber={index + 1} />
          ))}
        </TabsContent>

        {/* Tab: Cut Lists */}
        <TabsContent value="cuts" className="space-y-4">
          {currentVersion && currentVersion.cutLists.map((cuts, index) => (
            <CutListCard key={cuts.boxId} cuts={cuts} boxNumber={index + 1} />
          ))}
        </TabsContent>
      </Tabs>

      {/* Dialog: Add/Edit Item */}
      <Dialog open={isItemDialogOpen} onOpenChange={setIsItemDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Editar Ítem' : 'Agregar Ítem'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Input 
                value={itemForm.description}
                onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                placeholder="Ej: Computadora de escritorio"
              />
            </div>
            
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-2">
                <Label>Largo (cm)</Label>
                <Input 
                  type="number"
                  value={itemForm.dimensions?.length}
                  onChange={(e) => setItemForm({ 
                    ...itemForm, 
                    dimensions: { ...itemForm.dimensions!, length: parseFloat(e.target.value) || 0 }
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label>Ancho (cm)</Label>
                <Input 
                  type="number"
                  value={itemForm.dimensions?.width}
                  onChange={(e) => setItemForm({ 
                    ...itemForm, 
                    dimensions: { ...itemForm.dimensions!, width: parseFloat(e.target.value) || 0 }
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label>Alto (cm)</Label>
                <Input 
                  type="number"
                  value={itemForm.dimensions?.height}
                  onChange={(e) => setItemForm({ 
                    ...itemForm, 
                    dimensions: { ...itemForm.dimensions!, height: parseFloat(e.target.value) || 0 }
                  })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Peso</Label>
                <div className="flex gap-2">
                  <Input 
                    type="number"
                    value={itemForm.weight?.value}
                    onChange={(e) => setItemForm({ 
                      ...itemForm, 
                      weight: { ...itemForm.weight!, value: parseFloat(e.target.value) || 0 }
                    })}
                  />
                  <Select 
                    value={itemForm.weight?.unit}
                    onValueChange={(v) => setItemForm({ 
                      ...itemForm, 
                      weight: { ...itemForm.weight!, unit: v as 'kg' | 'lb' }
                    })}
                  >
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kg">kg</SelectItem>
                      <SelectItem value="lb">lb</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Cantidad</Label>
                <Input 
                  type="number"
                  min={1}
                  value={itemForm.quantity}
                  onChange={(e) => setItemForm({ ...itemForm, quantity: parseInt(e.target.value) || 1 })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Fragilidad</Label>
              <Select 
                value={itemForm.fragilityTier}
                onValueChange={(v) => setItemForm({ ...itemForm, fragilityTier: v as any })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BAJA">Baja</SelectItem>
                  <SelectItem value="MEDIA">Media</SelectItem>
                  <SelectItem value="ALTA">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox 
                  checked={itemForm.allowRotation}
                  onCheckedChange={(c) => setItemForm({ ...itemForm, allowRotation: c as boolean })}
                />
                <span className="text-sm">Permitir rotación</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox 
                  checked={itemForm.stackable}
                  onCheckedChange={(c) => setItemForm({ ...itemForm, stackable: c as boolean })}
                />
                <span className="text-sm">Apilable</span>
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

      {/* Dialog: Parameters */}
      <Dialog open={isParamDialogOpen} onOpenChange={setIsParamDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Parámetros de Empaque
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div>
              <h4 className="font-medium mb-3">Padding por Fragilidad (pulgadas)</h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Baja</Label>
                  <Input 
                    type="number"
                    step="0.125"
                    value={parameters.paddingByFragility.BAJA}
                    onChange={(e) => setParameters({
                      ...parameters,
                      paddingByFragility: { ...parameters.paddingByFragility, BAJA: parseFloat(e.target.value) }
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Media</Label>
                  <Input 
                    type="number"
                    step="0.125"
                    value={parameters.paddingByFragility.MEDIA}
                    onChange={(e) => setParameters({
                      ...parameters,
                      paddingByFragility: { ...parameters.paddingByFragility, MEDIA: parseFloat(e.target.value) }
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Alta</Label>
                  <Input 
                    type="number"
                    step="0.125"
                    value={parameters.paddingByFragility.ALTA}
                    onChange={(e) => setParameters({
                      ...parameters,
                      paddingByFragility: { ...parameters.paddingByFragility, ALTA: parseFloat(e.target.value) }
                    })}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Merma Plywood (%)</Label>
                <Input 
                  type="number"
                  value={parameters.plywoodWastePercent}
                  onChange={(e) => setParameters({ ...parameters, plywoodWastePercent: parseFloat(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Merma Madera (%)</Label>
                <Input 
                  type="number"
                  value={parameters.lumberWastePercent}
                  onChange={(e) => setParameters({ ...parameters, lumberWastePercent: parseFloat(e.target.value) })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Costo Mano de Obra (BOB/hora)</Label>
              <Input 
                type="number"
                value={parameters.laborCostPerHour}
                onChange={(e) => setParameters({ ...parameters, laborCostPerHour: parseFloat(e.target.value) })}
              />
            </div>

            <div className="space-y-2">
              <Label>Overhead (%)</Label>
              <Input 
                type="number"
                value={parameters.overheadPercent}
                onChange={(e) => setParameters({ ...parameters, overheadPercent: parseFloat(e.target.value) })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsParamDialogOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== SUB-COMPONENTES ====================

function BoxResultCard({ box }: { box: NestingBox }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div 
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-3">
            <Box className="h-6 w-6 text-blue-600" />
            <div>
              <CardTitle className="text-lg">Caja {box.boxNumber}</CardTitle>
              <p className="text-sm text-slate-500">{box.packedItems.length} ítems empacados</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm text-slate-500">Dimensiones Externas</p>
              <p className="font-mono font-medium">
                {box.externalDims.length.toFixed(1)}" × {box.externalDims.width.toFixed(1)}" × {box.externalDims.height.toFixed(1)}"
              </p>
            </div>
            {expanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          </div>
        </div>
      </CardHeader>
      
      {expanded && (
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500">Internas</p>
              <p className="font-mono text-sm">
                {box.internalDims.length.toFixed(1)}" × {box.internalDims.width.toFixed(1)}" × {box.internalDims.height.toFixed(1)}"
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500">Peso Ítems</p>
              <p className="font-mono text-sm">{box.itemsWeight.toFixed(1)} lb</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500">Padding</p>
              <p className="font-mono text-sm">{box.paddingApplied.toFixed(2)}"</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500">Materiales</p>
              <p className="font-mono text-sm">
                {box.selectedMaterials.plywoodThickness}" + {box.selectedMaterials.frameProfile}
              </p>
            </div>
          </div>

          <h4 className="font-medium mb-2">Ítems Empacados</h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ítem</TableHead>
                <TableHead>Posición</TableHead>
                <TableHead>Orientación</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {box.packedItems.map((packed, i) => (
                <TableRow key={i}>
                  <TableCell>{packed.item.description}</TableCell>
                  <TableCell className="font-mono text-xs">
                    ({packed.position.x.toFixed(1)}, {packed.position.y.toFixed(1)}, {packed.position.z.toFixed(1)})
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {packed.orientation.length.toFixed(1)}" × {packed.orientation.width.toFixed(1)}" × {packed.orientation.height.toFixed(1)}"
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

function BOMCard({ bom, boxNumber }: { bom: BoxBOM; boxNumber: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Box className="h-5 w-5" />
          BOM - Caja {boxNumber}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Plywood */}
        {bom.plywood.length > 0 && (
          <div>
            <h4 className="font-medium text-sm text-slate-500 mb-2 flex items-center gap-2">
              <Grid3x3 className="h-4 w-4" />
              Plywood
            </h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Espesor</TableHead>
                  <TableHead>Planchas</TableHead>
                  <TableHead>Área (ft²)</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bom.plywood.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell>{p.thicknessDisplay}</TableCell>
                    <TableCell>{p.sheetCount}</TableCell>
                    <TableCell>{p.totalAreaSqFt.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{money(p.cost + p.wasteCost)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Lumber */}
        {bom.lumber.length > 0 && (
          <div>
            <h4 className="font-medium text-sm text-slate-500 mb-2 flex items-center gap-2">
              <Hammer className="h-4 w-4" />
              Madera (Lumber)
            </h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Piezas 192"</TableHead>
                  <TableHead>Cortes</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bom.lumber.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell>{l.profile}</TableCell>
                    <TableCell>{l.pieces192Count}</TableCell>
                    <TableCell>{l.cuts.length}</TableCell>
                    <TableCell className="text-right">{money(l.cost + l.wasteCost)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Consumibles */}
        {bom.consumables.length > 0 && (
          <div>
            <h4 className="font-medium text-sm text-slate-500 mb-2 flex items-center gap-2">
              <Package className="h-4 w-4" />
              Consumibles
            </h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ítem</TableHead>
                  <TableHead>Cantidad</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bom.consumables.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell>{c.name}</TableCell>
                    <TableCell>{c.quantity} {c.unit}</TableCell>
                    <TableCell className="text-right">{money(c.cost)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Totales */}
        <div className="border-t pt-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Materiales</span>
            <span className="font-mono">{money(bom.materialsCost)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Mano de Obra</span>
            <span className="font-mono">{money(bom.laborCost)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Overhead</span>
            <span className="font-mono">{money(bom.overheadCost)}</span>
          </div>
          <div className="flex justify-between text-lg font-bold border-t pt-2">
            <span>Total Caja</span>
            <span className="text-green-600">{money(bom.totalCost)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CutListCard({ cuts, boxNumber }: { cuts: import('@/types/nesting.types').CutLists; boxNumber: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Scissors className="h-5 w-5" />
          Cut List - Caja {boxNumber}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Plywood Cuts */}
        <div>
          <h4 className="font-medium mb-3 flex items-center gap-2">
            <Grid3x3 className="h-4 w-4" />
            Cortes de Plywood (48" × 96")
          </h4>
          {cuts.plywood.map((sheet) => (
            <div key={sheet.sheetIndex} className="mb-4 p-4 bg-slate-50 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium">Plancha {sheet.sheetIndex + 1}</span>
                <Badge variant="outline">
                  {sheet.wastePercent.toFixed(1)}% desperdicio
                </Badge>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Panel</TableHead>
                    <TableHead>Dimensiones</TableHead>
                    <TableHead>Posición</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sheet.cuts.map((cut, i) => (
                    <TableRow key={i}>
                      <TableCell className="capitalize">{cut.panelType}</TableCell>
                      <TableCell className="font-mono">
                        {cut.width.toFixed(2)}" × {cut.length.toFixed(2)}"
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        ({cut.positionInSheet?.x.toFixed(1)}, {cut.positionInSheet?.y.toFixed(1)})
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}
        </div>

        {/* Lumber Cuts */}
        <div>
          <h4 className="font-medium mb-3 flex items-center gap-2">
            <Hammer className="h-4 w-4" />
            Cortes de Madera (192" estándar)
          </h4>
          {cuts.lumber.map((piece) => (
            <div key={piece.pieceIndex} className="mb-4 p-4 bg-slate-50 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium">{piece.profile} - Pieza {piece.pieceIndex + 1}</span>
                <Badge variant="outline">
                  {((piece.remainingWaste / 192) * 100).toFixed(1)}% sobrante
                </Badge>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Corte</TableHead>
                    <TableHead>Longitud</TableHead>
                    <TableHead>Propósito</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {piece.cuts.map((cut, i) => (
                    <TableRow key={i}>
                      <TableCell>{cut.id}</TableCell>
                      <TableCell className="font-mono">{cut.length.toFixed(2)}"</TableCell>
                      <TableCell className="capitalize text-sm">{cut.purpose}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
