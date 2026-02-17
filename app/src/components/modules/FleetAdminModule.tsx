import { useState } from 'react';
import { 
  Car, 
  Plus, 
  Edit,
  Trash2,
  Calendar,
  Wrench,
  Fuel,
  Gauge,
  User
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/formatters';
import { toast } from 'sonner';

import { mockVehicles, mockMaintenanceRecords, mockUsers } from '@/data/mockData';

export function FleetAdminModule() {
  const [searchTerm, setSearchTerm] = useState('');
  const [vehicles, setVehicles] = useState(mockVehicles.map(v => ({ ...v, driverId: undefined as string | undefined })));
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<typeof vehicles[0] | null>(null);
  const [selectedDriver, setSelectedDriver] = useState('');
  
  // Filtrar choferes disponibles (rol E)
  const availableDrivers = mockUsers.filter(u => u.role === 'E');
  
  const filteredVehicles = vehicles.filter(v =>
    v.plate.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.brand.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Flota</h1>
          <p className="text-slate-500">Administración de vehículos</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Vehículo
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{mockVehicles.length}</p>
            <p className="text-sm text-slate-500">Total Vehículos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">
              {mockVehicles.filter(v => v.status === 'available').length}
            </p>
            <p className="text-sm text-slate-500">Disponibles</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-orange-600">
              {mockVehicles.filter(v => v.status === 'maintenance').length}
            </p>
            <p className="text-sm text-slate-500">En Mantenimiento</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">
              {Math.round(mockVehicles.reduce((acc, v) => acc + v.mileage, 0) / mockVehicles.length).toLocaleString()}
            </p>
            <p className="text-sm text-slate-500">Km Promedio</p>
          </CardContent>
        </Card>
      </div>

      <div className="relative">
        <Car className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input 
          placeholder="Buscar vehículo por placa o marca..."
          className="pl-10"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <Tabs defaultValue="vehicles">
        <TabsList>
          <TabsTrigger value="vehicles">Vehículos</TabsTrigger>
          <TabsTrigger value="maintenance">Mantenimiento</TabsTrigger>
          <TabsTrigger value="fuel">Combustible</TabsTrigger>
        </TabsList>

        <TabsContent value="vehicles">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vehículo</TableHead>
                    <TableHead>Placa</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Capacidad</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Chofer Asignado</TableHead>
                    <TableHead>Kilometraje</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVehicles.map((vehicle) => (
                    <TableRow key={vehicle.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-slate-900">{vehicle.brand} {vehicle.model}</p>
                          <p className="text-sm text-slate-500">{vehicle.year}</p>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{vehicle.plate}</TableCell>
                      <TableCell>{vehicle.type}</TableCell>
                      <TableCell>{vehicle.capacity} kg</TableCell>
                      <TableCell>
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
                      </TableCell>
                      <TableCell>
                        {vehicle.driverId ? (
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-slate-500" />
                            <span className="text-sm">
                              {mockUsers.find(u => u.id === vehicle.driverId)?.name || 'Desconocido'}
                            </span>
                          </div>
                        ) : (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => {
                              setSelectedVehicle(vehicle);
                              setIsAssignDialogOpen(true);
                            }}
                          >
                            <User className="h-3 w-3 mr-1" />
                            Asignar
                          </Button>
                        )}
                      </TableCell>
                      <TableCell>{vehicle.mileage.toLocaleString()} km</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon">
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="maintenance">
          <div className="space-y-4">
            {mockMaintenanceRecords.map((record) => {
              const vehicle = mockVehicles.find(v => v.id === record.vehicleId);
              return (
                <Card key={record.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <p className="font-semibold text-slate-900">{record.description}</p>
                          <Badge variant={record.status === 'completed' ? 'default' : 'outline'}>
                            {record.status === 'completed' ? 'Completado' : record.status === 'in_progress' ? 'En Progreso' : 'Programado'}
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-600">{vehicle?.brand} {vehicle?.model} - {vehicle?.plate}</p>
                        <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {record.date}
                          </span>
                          <span className="flex items-center gap-1">
                            <Wrench className="h-3 w-3" />
                            {record.type === 'preventive' ? 'Preventivo' : record.type === 'corrective' ? 'Correctivo' : 'Predictivo'}
                          </span>
                          <span className="flex items-center gap-1">
                            <Gauge className="h-3 w-3" />
                            {formatCurrency(record.cost, "$")}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="fuel">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Consumo de Combustible</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                      <Fuel className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">VH-001 - ABC-123</p>
                      <p className="text-sm text-slate-500">22 Ene 2024</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-slate-900">45 L</p>
                    <p className="text-sm text-slate-500">{formatCurrency(315, "$")}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                      <Fuel className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">VH-002 - DEF-456</p>
                      <p className="text-sm text-slate-500">20 Ene 2024</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-slate-900">38 L</p>
                    <p className="text-sm text-slate-500">{formatCurrency(266, "$")}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog: Asignar Chofer */}
      <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Asignar Chofer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedVehicle && (
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-500">Vehículo</p>
                <p className="font-medium">{selectedVehicle.brand} {selectedVehicle.model} - {selectedVehicle.plate}</p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Seleccionar Chofer</Label>
              <Select 
                value={selectedDriver}
                onValueChange={setSelectedDriver}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione un chofer" />
                </SelectTrigger>
                <SelectContent>
                  {availableDrivers.map((driver) => (
                    <SelectItem key={driver.id} value={driver.id}>
                      {driver.name} ({driver.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAssignDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => {
              if (!selectedDriver) {
                toast.error('Seleccione un chofer');
                return;
              }
              if (selectedVehicle) {
                setVehicles(vehicles.map(v => 
                  v.id === selectedVehicle.id 
                    ? { ...v, driverId: selectedDriver, status: 'in_use' as const }
                    : v
                ));
                toast.success('Chofer asignado exitosamente');
                setIsAssignDialogOpen(false);
                setSelectedDriver('');
              }
            }}>
              Asignar Chofer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
