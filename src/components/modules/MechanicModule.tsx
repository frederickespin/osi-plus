import { useState } from 'react';
import { 
  Wrench, 
  ClipboardList,
  AlertCircle,
  CheckCircle,
  Package
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

import { mockVehicles, mockMaintenanceRecords, mockUsers } from '@/data/mockData';
import { isFieldStaffRole, loadUsers } from '@/lib/userStore';
import { toast } from 'sonner';

export function MechanicModule() {
  const [showPartsDialog, setShowPartsDialog] = useState(false);
  
  const completedMaintenance = mockMaintenanceRecords.filter(m => m.status === 'completed');
  const vehiclesInMaintenance = mockVehicles.filter(v => v.status === 'maintenance');
  const storedUsers = loadUsers();
  const users = storedUsers.length ? storedUsers : mockUsers;
  const mechanicUser = users.find(u => u.role === 'PB');
  const canGenerateNota = !!mechanicUser && isFieldStaffRole(mechanicUser.role) && mechanicUser.notaEnabled !== false;

  // Órdenes asignadas al mecánico (simulado)
  const myOrders = [
    { id: 'ORD-001', vehicle: 'VH-001', plate: 'ABC-123', type: 'preventive', description: 'Cambio de aceite y filtros', status: 'in_progress', priority: 'normal' },
    { id: 'ORD-002', vehicle: 'VH-005', plate: 'MNO-345', type: 'corrective', description: 'Reparación de frenos', status: 'pending', priority: 'high' },
  ];

  // Reportes de choferes
  const driverReports = [
    { id: 'REP-001', driver: 'Roberto Sánchez', vehicle: 'VH-002', issue: 'Ruido extraño en motor', date: '2024-01-22', status: 'pending' },
    { id: 'REP-002', driver: 'Juan Pérez', vehicle: 'VH-003', issue: 'Frenos suaves', date: '2024-01-21', status: 'in_progress' },
  ];

  const handleRequestParts = () => {
    toast.success('Solicitud de repuestos enviada al almacén');
    setShowPartsDialog(false);
  };

  const handleCompleteOrder = (orderId: string) => {
    toast.success(`Orden ${orderId} completada`);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mecánica</h1>
          <p className="text-slate-500">Mantenimiento de flota</p>
        </div>
        <Badge variant={canGenerateNota ? 'default' : 'secondary'}>
          NOTA: {canGenerateNota ? 'Sí' : 'No'}
        </Badge>
      </div>

      {/* Botones Principales */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Button 
          size="lg" 
          className="h-20"
          onClick={() => document.getElementById('mis-ordenes')?.scrollIntoView({ behavior: 'smooth' })}
        >
          <ClipboardList className="h-6 w-6 mr-3" />
          <div className="text-left">
            <p className="font-bold">Mis Órdenes</p>
            <p className="text-sm opacity-70">{myOrders.length} pendientes</p>
          </div>
        </Button>
        
        <Button 
          size="lg" 
          variant="secondary"
          className="h-20"
          onClick={() => document.getElementById('reportes')?.scrollIntoView({ behavior: 'smooth' })}
        >
          <AlertCircle className="h-6 w-6 mr-3" />
          <div className="text-left">
            <p className="font-bold">Reportes de Choferes</p>
            <p className="text-sm opacity-70">{driverReports.length} nuevos</p>
          </div>
        </Button>
        
        <Button 
          size="lg" 
          variant="outline"
          className="h-20"
          onClick={() => setShowPartsDialog(true)}
        >
          <Package className="h-6 w-6 mr-3" />
          <div className="text-left">
            <p className="font-bold">Solicitar Repuestos</p>
            <p className="text-sm opacity-70">Conectar con almacén</p>
          </div>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{myOrders.length}</p>
            <p className="text-sm text-slate-500">Mis Órdenes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-orange-600">{vehiclesInMaintenance.length}</p>
            <p className="text-sm text-slate-500">En Taller</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{driverReports.length}</p>
            <p className="text-sm text-slate-500">Reportes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{completedMaintenance.length}</p>
            <p className="text-sm text-slate-500">Completados</p>
          </CardContent>
        </Card>
      </div>

      {/* Mis Órdenes */}
      <div id="mis-ordenes">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Mis Órdenes de Trabajo</h3>
        <div className="space-y-3">
          {myOrders.map((order) => (
            <Card key={order.id} className={order.priority === 'high' ? 'border-red-300' : ''}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold text-slate-900">{order.id}</h4>
                      <Badge variant={order.status === 'in_progress' ? 'default' : 'outline'}>
                        {order.status === 'in_progress' ? 'En Progreso' : 'Pendiente'}
                      </Badge>
                      {order.priority === 'high' && (
                        <Badge variant="destructive">Urgente</Badge>
                      )}
                      <Badge variant="outline">
                        {order.type === 'preventive' ? 'Preventivo' : 'Correctivo'}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-600">{order.description}</p>
                    <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                      <span className="flex items-center gap-1">
                        <Wrench className="h-3 w-3" />
                        {order.vehicle} - {order.plate}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">
                      Detalles
                    </Button>
                    <Button size="sm" onClick={() => handleCompleteOrder(order.id)}>
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Completar
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Reportes de Choferes */}
      <div id="reportes">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Reportes de Choferes</h3>
        <div className="space-y-3">
          {driverReports.map((report) => (
            <Card key={report.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold text-slate-900">{report.vehicle}</h4>
                      <Badge variant={report.status === 'in_progress' ? 'default' : 'outline'}>
                        {report.status === 'in_progress' ? 'En Atención' : 'Pendiente'}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-600">{report.issue}</p>
                    <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                      <span>Reportado por: {report.driver}</span>
                      <span>{report.date}</span>
                    </div>
                  </div>
                  <Button size="sm">
                    Atender
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Tabs: Historial y Vehículos */}
      <Tabs defaultValue="vehicles">
        <TabsList>
          <TabsTrigger value="vehicles">Vehículos</TabsTrigger>
          <TabsTrigger value="history">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="vehicles">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {mockVehicles.map((vehicle) => (
              <Card key={vehicle.id} className={vehicle.status === 'maintenance' ? 'border-orange-300' : ''}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="font-semibold text-slate-900">{vehicle.brand} {vehicle.model}</h4>
                      <p className="text-sm text-slate-500">{vehicle.plate}</p>
                    </div>
                    <Badge variant={
                      vehicle.status === 'available' ? 'default' :
                      vehicle.status === 'in_use' ? 'secondary' :
                      vehicle.status === 'maintenance' ? 'destructive' :
                      'outline'
                    }>
                      {vehicle.status === 'available' ? 'Disponible' :
                       vehicle.status === 'in_use' ? 'En Uso' :
                       vehicle.status === 'maintenance' ? 'Mantenimiento' : 'Retirado'}
                    </Badge>
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Kilometraje:</span>
                      <span className="text-slate-700">{vehicle.mileage.toLocaleString()} km</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Próx. mantenimiento:</span>
                      <span className="text-slate-700">{vehicle.nextMaintenance}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="history">
          <div className="space-y-3">
            {completedMaintenance.map((record) => {
              const vehicle = mockVehicles.find(v => v.id === record.vehicleId);
              return (
                <Card key={record.id} className="opacity-70">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-slate-900">{record.description}</p>
                        <p className="text-sm text-slate-600">{vehicle?.brand} {vehicle?.model} - {vehicle?.plate}</p>
                        <p className="text-sm text-slate-500 mt-1">{record.date} - ${record.cost}</p>
                      </div>
                      <Badge variant="default">Completado</Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialog: Solicitar Repuestos */}
      <Dialog open={showPartsDialog} onOpenChange={setShowPartsDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Solicitar Repuestos
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Vehículo</Label>
              <select className="w-full mt-1 p-2 border rounded-lg">
                <option>VH-001 - ABC-123</option>
                <option>VH-002 - DEF-456</option>
                <option>VH-003 - GHI-789</option>
              </select>
            </div>
            <div>
              <Label>Repuesto</Label>
              <select className="w-full mt-1 p-2 border rounded-lg">
                <option>Aceite de motor</option>
                <option>Filtro de aceite</option>
                <option>Filtro de aire</option>
                <option>Pastillas de freno</option>
                <option>Bujías</option>
                <option>Otro (especificar)</option>
              </select>
            </div>
            <div>
              <Label>Cantidad</Label>
              <Input type="number" defaultValue={1} min={1} />
            </div>
            <div>
              <Label>Observaciones</Label>
              <textarea className="w-full mt-1 p-2 border rounded-lg h-20" placeholder="Detalles adicionales..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPartsDialog(false)}>Cancelar</Button>
            <Button onClick={handleRequestParts}>Enviar Solicitud</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
