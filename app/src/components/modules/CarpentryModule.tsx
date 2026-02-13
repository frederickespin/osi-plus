import { useState } from 'react';
import { 
  Hammer, 
  Box, 
  Ruler, 
  Calculator, 
  CheckCircle, 
  TrendingUp,
  Recycle,
  Package,
  Plus,
  Search,
  SprayCan,
  Play,
  CheckSquare
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

import { mockWoodBoxes, mockUsers } from '@/data/mockData';
import { isFieldStaffRole, loadUsers } from '@/lib/userStore';
import { toast } from 'sonner';

export function CarpentryModule() {
  const [dimensions, setDimensions] = useState({ length: 0, width: 0, height: 0 });
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [selectedBox, setSelectedBox] = useState<any>(null);
  const [showFumigationDialog, setShowFumigationDialog] = useState(false);
  
  const availableBoxes = mockWoodBoxes.filter(b => b.status === 'available');
  const inUseBoxes = mockWoodBoxes.filter(b => b.status === 'in_use');
  const storedUsers = loadUsers();
  const users = storedUsers.length ? storedUsers : mockUsers;
  const carpenterUser = users.find(u => u.role === 'PA');
  const canGenerateNota = !!carpenterUser && isFieldStaffRole(carpenterUser.role) && carpenterUser.notaEnabled !== false;
  
  // Solicitudes pendientes (simulado)
  const pendingRequests = [
    { id: 'REQ-001', osi: 'OSI-2024-002', dimensions: '200x100x100', quantity: 2, status: 'approved', priority: 'normal' },
    { id: 'REQ-002', osi: 'OSI-2024-003', dimensions: '150x80x80', quantity: 1, status: 'approved', priority: 'high' },
  ];

  // Calcular Board Feet
  const calculateBoardFeet = () => {
    const { length, width, height } = dimensions;
    if (length && width && height) {
      return ((length * width * height) / 1728) * 12;
    }
    return 0;
  };

  const handleStatusUpdate = (newStatus: string) => {
    if (newStatus === 'fumigacion') {
      setShowStatusDialog(false);
      setShowFumigationDialog(true);
    } else if (newStatus === 'terminado') {
      if (!canGenerateNota) {
        toast.error('Tu usuario no tiene habilitada la creación de NOTA');
        setShowStatusDialog(false);
        return;
      }
      toast.success('Caja marcada como TERMINADA - NOTA generada');
      setShowStatusDialog(false);
    } else {
      toast.success(`Estado actualizado a: ${newStatus}`);
      setShowStatusDialog(false);
    }
  };

  const handleRequestFumigation = () => {
    toast.success('Solicitud de fumigación enviada a Operaciones');
    setShowFumigationDialog(false);
  };

  const openStatusDialog = (box: any) => {
    setSelectedBox(box);
    setShowStatusDialog(true);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Carpintería</h1>
          <p className="text-slate-500">Gestión de cajas de madera</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={canGenerateNota ? 'default' : 'secondary'}>
            NOTA: {canGenerateNota ? 'Sí' : 'No'}
          </Badge>
          <Button variant="outline">
            <Recycle className="h-4 w-4 mr-2" />
            Smart Match
          </Button>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Nueva Caja
          </Button>
        </div>
      </div>

      {/* Botones Principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Button 
          size="lg" 
          className="h-20"
          onClick={() => document.getElementById('solicitudes')?.scrollIntoView({ behavior: 'smooth' })}
        >
          <Package className="h-6 w-6 mr-3" />
          <div className="text-left">
            <p className="font-bold">Nuevas Solicitudes</p>
            <p className="text-sm opacity-70">{pendingRequests.length} pendientes</p>
          </div>
        </Button>
        
        <Button 
          size="lg" 
          variant="secondary"
          className="h-20"
          onClick={() => document.getElementById('inventario')?.scrollIntoView({ behavior: 'smooth' })}
        >
          <Box className="h-6 w-6 mr-3" />
          <div className="text-left">
            <p className="font-bold">Actualizar Estado</p>
            <p className="text-sm opacity-70">Escanea QR de caja</p>
          </div>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{availableBoxes.length}</p>
            <p className="text-sm text-slate-500">Disponibles</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{inUseBoxes.length}</p>
            <p className="text-sm text-slate-500">En Uso</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-orange-600">{pendingRequests.length}</p>
            <p className="text-sm text-slate-500">Solicitudes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-purple-600">
              {mockWoodBoxes.reduce((acc, b) => acc + b.reuseCount, 0)}
            </p>
            <p className="text-sm text-slate-500">Reutilizaciones</p>
          </CardContent>
        </Card>
      </div>

      {/* Solicitudes Pendientes */}
      <div id="solicitudes">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Solicitudes Aprobadas por C</h3>
        <div className="space-y-3">
          {pendingRequests.map((req) => (
            <Card key={req.id} className={req.priority === 'high' ? 'border-red-300' : ''}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold text-slate-900">{req.id}</h4>
                      <Badge variant="default">Aprobada</Badge>
                      {req.priority === 'high' && <Badge variant="destructive">Urgente</Badge>}
                    </div>
                    <p className="text-sm text-slate-600">OSI: {req.osi}</p>
                    <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                      <span className="flex items-center gap-1">
                        <Ruler className="h-3 w-3" />
                        {req.dimensions} cm
                      </span>
                      <span>Cantidad: {req.quantity}</span>
                    </div>
                  </div>
                  <Button>
                    <Play className="h-4 w-4 mr-2" />
                    Iniciar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="inventory">
        <TabsList>
          <TabsTrigger value="inventory">Inventario</TabsTrigger>
          <TabsTrigger value="calculator">Calculadora BF</TabsTrigger>
          <TabsTrigger value="nesting">Nesting</TabsTrigger>
          <TabsTrigger value="smartmatch">Smart Match</TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="space-y-4">
          <div id="inventario">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input 
                placeholder="Buscar caja por código o dimensiones..."
                className="pl-10"
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {mockWoodBoxes.map((box) => (
                <WoodBoxCard key={box.id} box={box} onUpdateStatus={() => openStatusDialog(box)} />
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="calculator">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Calculadora de Board Feet
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">
                    Largo (cm)
                  </label>
                  <Input 
                    type="number" 
                    placeholder="200"
                    value={dimensions.length || ''}
                    onChange={(e) => setDimensions({...dimensions, length: Number(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">
                    Ancho (cm)
                  </label>
                  <Input 
                    type="number" 
                    placeholder="100"
                    value={dimensions.width || ''}
                    onChange={(e) => setDimensions({...dimensions, width: Number(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">
                    Alto (cm)
                  </label>
                  <Input 
                    type="number" 
                    placeholder="100"
                    value={dimensions.height || ''}
                    onChange={(e) => setDimensions({...dimensions, height: Number(e.target.value)})}
                  />
                </div>
              </div>
              
              <div className="p-6 bg-slate-50 rounded-lg text-center">
                <p className="text-sm text-slate-500 mb-2">Board Feet Calculado</p>
                <p className="text-4xl font-bold text-slate-900">
                  {calculateBoardFeet().toFixed(2)} BF
                </p>
                <p className="text-xs text-slate-400 mt-2">
                  Fórmula: (L × A × Al / 1728) × 12
                </p>
              </div>
              
              <div className="flex gap-3 mt-6">
                <Button variant="outline" className="flex-1">
                  Limpiar
                </Button>
                <Button className="flex-1">
                  <Plus className="h-4 w-4 mr-2" />
                  Crear Caja
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="nesting">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Box className="h-5 w-5" />
                Algoritmo de Nesting
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="font-semibold text-blue-900 mb-2">Configuración de Tolerancias</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-blue-700">Tolerancia X</p>
                      <p className="text-lg font-semibold text-blue-900">±2 cm</p>
                    </div>
                    <div>
                      <p className="text-sm text-blue-700">Tolerancia Y</p>
                      <p className="text-lg font-semibold text-blue-900">±2 cm</p>
                    </div>
                    <div>
                      <p className="text-sm text-blue-700">Tolerancia Z</p>
                      <p className="text-lg font-semibold text-blue-900">±1 cm</p>
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 border border-slate-200 rounded-lg">
                    <h4 className="font-semibold text-slate-900 mb-3">Items a Embalar</h4>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-2 bg-slate-50 rounded">
                        <span className="text-sm">Mesa de oficina</span>
                        <span className="text-sm text-slate-500">150×80×75 cm</span>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-slate-50 rounded">
                        <span className="text-sm">Silla ergonómica</span>
                        <span className="text-sm text-slate-500">60×60×100 cm</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4 border border-slate-200 rounded-lg">
                    <h4 className="font-semibold text-slate-900 mb-3">Resultado del Nesting</h4>
                    <div className="space-y-3">
                      <div className="p-3 bg-green-50 border border-green-200 rounded">
                        <p className="font-medium text-green-900">Caja Optimizada #1</p>
                        <p className="text-sm text-green-700">160×90×140 cm - 3 items</p>
                        <p className="text-xs text-green-600 mt-1">Eficiencia: 87%</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="smartmatch">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Recycle className="h-5 w-5" />
                Smart Match - Reutilización de Cajas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <TrendingUp className="h-5 w-5 text-green-600 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-green-900">Match Encontrado</h4>
                      <p className="text-sm text-green-700 mt-1">
                        Se encontraron 2 cajas reutilizables que coinciden con las dimensiones 
                        requeridas para OSI-2024-003.
                      </p>
                      <div className="flex gap-2 mt-3">
                        <Button size="sm" variant="outline">Ver Detalles</Button>
                        <Button size="sm">Usar Cajas</Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog: Actualizar Estado */}
      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Box className="h-5 w-5" />
              Actualizar Estado de Caja
            </DialogTitle>
          </DialogHeader>
          {selectedBox && (
            <div className="p-3 bg-slate-50 rounded-lg mb-4">
              <p className="font-medium text-slate-900">{selectedBox.code}</p>
              <p className="text-sm text-slate-500">
                {selectedBox.dimensions.length}×{selectedBox.dimensions.width}×{selectedBox.dimensions.height} cm
              </p>
            </div>
          )}
          <div className="space-y-3">
            <p className="text-sm text-slate-500">Seleccione el nuevo estado:</p>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" className="h-auto py-4" onClick={() => handleStatusUpdate('inicio')}>
                <Play className="h-5 w-5 mr-2 text-blue-500" />
                Inicio
              </Button>
              <Button variant="outline" className="h-auto py-4" onClick={() => handleStatusUpdate('fumigacion')}>
                <SprayCan className="h-5 w-5 mr-2 text-green-500" />
                Fumigación
              </Button>
              <Button variant="outline" className="h-auto py-4" onClick={() => handleStatusUpdate('produccion')}>
                <Hammer className="h-5 w-5 mr-2 text-orange-500" />
                Producción
              </Button>
              <Button variant="outline" className="h-auto py-4 border-green-300" onClick={() => handleStatusUpdate('terminado')}>
                <CheckSquare className="h-5 w-5 mr-2 text-green-600" />
                Terminado
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStatusDialog(false)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Solicitar Fumigación */}
      <Dialog open={showFumigationDialog} onOpenChange={setShowFumigationDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SprayCan className="h-5 w-5 text-green-500" />
              Solicitar Fumigación
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="font-medium text-slate-900">{selectedBox?.code}</p>
              <p className="text-sm text-slate-500">Lista para fumigación</p>
            </div>
            <p className="text-sm text-slate-600">
              Al solicitar fumigación, se enviará una notificación al departamento de 
              Operaciones (Rol B) para asignar un chofer y transportar la caja.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFumigationDialog(false)}>Cancelar</Button>
            <Button onClick={handleRequestFumigation} className="bg-green-600 hover:bg-green-700">
              <SprayCan className="h-4 w-4 mr-2" />
              Solicitar Fumigación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WoodBoxCard({ box, onUpdateStatus }: { box: typeof mockWoodBoxes[0]; onUpdateStatus: () => void }) {
  return (
    <Card className={
      box.status === 'available' ? 'border-green-300' :
      box.status === 'in_use' ? 'border-blue-300' :
      box.status === 'damaged' ? 'border-red-300' :
      'border-slate-200'
    }>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h4 className="font-semibold text-slate-900">{box.code}</h4>
            <p className="text-xs text-slate-500">
              {box.dimensions.length}×{box.dimensions.width}×{box.dimensions.height} cm
            </p>
          </div>
          <Badge variant={
            box.status === 'available' ? 'default' :
            box.status === 'in_use' ? 'secondary' :
            box.status === 'damaged' ? 'destructive' :
            'outline'
          }>
            {box.status === 'available' ? 'Disponible' :
             box.status === 'in_use' ? 'En Uso' :
             box.status === 'damaged' ? 'Dañada' : 'Desechada'}
          </Badge>
        </div>
        
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Board Feet:</span>
            <span className="text-slate-700">{box.boardFeet.toFixed(2)} BF</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Reutilizaciones:</span>
            <span className="text-slate-700">{box.reuseCount}</span>
          </div>
        </div>
        
        <div className="flex gap-2 mt-4">
          <Button variant="outline" size="sm" className="flex-1" onClick={onUpdateStatus}>
            <CheckCircle className="h-3 w-3 mr-1" />
            Estado
          </Button>
          <Button size="sm" className="flex-1">
            <Package className="h-3 w-3 mr-1" />
            Asignar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
