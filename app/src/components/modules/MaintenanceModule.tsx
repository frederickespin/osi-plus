import { useState } from 'react';
import {
  Wrench,
  ClipboardList,
  AlertTriangle,
  CheckCircle,
  FileText
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { mockMaintenanceRecords, mockVehicles, mockUsers } from '@/data/mockData';
import { isFieldStaffRole, loadUsers } from '@/lib/userStore';
import { toast } from 'sonner';

export function MaintenanceModule() {
  const [showReportDialog, setShowReportDialog] = useState(false);

  const storedUsers = loadUsers();
  const users = storedUsers.length ? storedUsers : mockUsers;
  const maintenanceUser = users.find((u) => u.role === 'PD');
  const canGenerateNota =
    !!maintenanceUser && isFieldStaffRole(maintenanceUser.role) && maintenanceUser.notaEnabled !== false;

  const assignedTasks = [
    { id: 'MT-001', vehicle: 'VH-002', plate: 'DEF-456', type: 'preventive', description: 'Revisión general', status: 'in_progress' },
    { id: 'MT-002', vehicle: 'VH-004', plate: 'JKL-012', type: 'corrective', description: 'Ajuste de puerta trasera', status: 'pending' },
  ];

  const completedMaintenance = mockMaintenanceRecords.filter((m) => m.status === 'completed');
  const vehiclesInMaintenance = mockVehicles.filter((v) => v.status === 'maintenance');

  const handleCompleteTask = (taskId: string) => {
    toast.success(`Mantenimiento ${taskId} completado`);
  };

  const handleReportMaintenance = () => {
    toast.success('Reporte de mantenimiento enviado');
    setShowReportDialog(false);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mantenimiento</h1>
          <p className="text-slate-500">Asignaciones y reportes de mantenimiento</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={canGenerateNota ? 'default' : 'secondary'}>
            NOTA: {canGenerateNota ? 'Sí' : 'No'}
          </Badge>
          <Button variant="outline" onClick={() => setShowReportDialog(true)}>
            <FileText className="h-4 w-4 mr-2" />
            Reportar Mantenimiento
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{assignedTasks.length}</p>
            <p className="text-sm text-slate-500">Asignaciones</p>
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
            <p className="text-2xl font-bold text-green-600">{completedMaintenance.length}</p>
            <p className="text-sm text-slate-500">Completados</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">2</p>
            <p className="text-sm text-slate-500">Reportes Hoy</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="assignments">
        <TabsList>
          <TabsTrigger value="assignments">Asignaciones</TabsTrigger>
          <TabsTrigger value="vehicles">Vehículos</TabsTrigger>
          <TabsTrigger value="history">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="assignments" className="space-y-3">
          {assignedTasks.map((task) => (
            <Card key={task.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold text-slate-900">{task.id}</h4>
                      <Badge variant={task.status === 'in_progress' ? 'default' : 'outline'}>
                        {task.status === 'in_progress' ? 'En Progreso' : 'Pendiente'}
                      </Badge>
                      <Badge variant="outline">
                        {task.type === 'preventive' ? 'Preventivo' : 'Correctivo'}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-600">{task.description}</p>
                    <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                      <span className="flex items-center gap-1">
                        <Wrench className="h-3 w-3" />
                        {task.vehicle} - {task.plate}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">
                      Detalles
                    </Button>
                    <Button size="sm" onClick={() => handleCompleteTask(task.id)}>
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Completar
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

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
              const vehicle = mockVehicles.find((v) => v.id === record.vehicleId);
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

      {/* Dialog: Reportar mantenimiento */}
      <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Reportar Mantenimiento
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Vehículo</Label>
              <select className="w-full mt-1 p-2 border rounded-lg">
                {mockVehicles.map((v) => (
                  <option key={v.id}>{v.code} - {v.plate}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Tipo</Label>
              <select className="w-full mt-1 p-2 border rounded-lg">
                <option>Preventivo</option>
                <option>Correctivo</option>
                <option>Predictivo</option>
              </select>
            </div>
            <div>
              <Label>Descripción</Label>
              <textarea className="w-full mt-1 p-2 border rounded-lg h-24" placeholder="Detalle del mantenimiento..." />
            </div>
            {!canGenerateNota && (
              <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <AlertTriangle className="h-4 w-4 mt-0.5" />
                <span>Tu usuario no tiene habilitada la creación de NOTA.</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReportDialog(false)}>Cancelar</Button>
            <Button onClick={handleReportMaintenance}>
              Enviar Reporte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
