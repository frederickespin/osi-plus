import { useMemo, useState } from 'react';
import { 
  Car, 
  Plus, 
  Edit,
  Trash2,
  Calendar,
  Wrench,
  Fuel,
  Gauge,
  User,
  CheckCircle2,
  XCircle,
  ShieldCheck
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
import { Switch } from '@/components/ui/switch';
import { formatCurrency } from '@/lib/formatters';
import { toast } from 'sonner';
import { loadUsers } from '@/lib/userStore';
import { mockUsers } from '@/data/mockData';
import {
  createBackupDriverApprovalRequest,
  createFleetVehicle,
  createFuelLog,
  findApprovedBackupDriverRequest,
  loadBackupDriverApprovals,
  loadFleetFuelLogs,
  loadFleetMaintenanceRecords,
  loadFleetVehicles,
  saveFleetVehicles,
  type BackupDriverApprovalRequest,
  type FleetVehicleRecord,
  type FuelLogRecord,
  updateBackupDriverApprovalRequest,
} from '@/lib/fleetStore';

type DriverOption = {
  id: string;
  name: string;
  code: string;
};

const todayIso = () => new Date().toISOString().slice(0, 10);

function getDriverOptions(): DriverOption[] {
  const users = loadUsers();
  const activeDrivers = users
    .filter((user) => user.role === 'E' && String(user.status).toUpperCase() === 'ACTIVE')
    .map((user) => ({
      id: user.id,
      name: user.fullName || user.name || user.id,
      code: user.code || user.id,
    }));

  if (activeDrivers.length > 0) return activeDrivers;

  return mockUsers
    .filter((user) => user.role === 'E' && String(user.status).toUpperCase() === 'ACTIVE')
    .map((user) => ({
      id: user.id,
      name: user.fullName || user.name || user.id,
      code: user.code || user.id,
    }));
}

export function FleetAdminModule() {
  const [searchTerm, setSearchTerm] = useState('');
  const [vehicles, setVehicles] = useState<FleetVehicleRecord[]>(() => loadFleetVehicles());
  const [maintenanceRecords] = useState(() => loadFleetMaintenanceRecords());
  const [fuelLogs, setFuelLogs] = useState<FuelLogRecord[]>(() => loadFleetFuelLogs());
  const [approvalRequests, setApprovalRequests] = useState<BackupDriverApprovalRequest[]>(() =>
    loadBackupDriverApprovals()
  );

  const [isVehicleDialogOpen, setIsVehicleDialogOpen] = useState(false);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [vehicleForm, setVehicleForm] = useState({
    plate: '',
    type: 'Camión',
    brand: '',
    model: '',
    year: String(new Date().getFullYear()),
    capacity: '0',
    mileage: '0',
    status: 'available' as FleetVehicleRecord['status'],
  });

  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [useBackupDriver, setUseBackupDriver] = useState(false);
  const [selectedBackupDriverId, setSelectedBackupDriverId] = useState('');

  const [isFuelDialogOpen, setIsFuelDialogOpen] = useState(false);
  const [fuelForm, setFuelForm] = useState({
    vehicleId: '',
    liters: '',
    cost: '',
    date: todayIso(),
    station: '',
  });

  const availableDrivers = useMemo(() => getDriverOptions(), [isAssignDialogOpen, vehicles.length]);
  const driverMap = useMemo(() => new Map(availableDrivers.map((driver) => [driver.id, driver])), [availableDrivers]);

  const selectedVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.id === selectedVehicleId) || null,
    [vehicles, selectedVehicleId]
  );

  const filteredVehicles = useMemo(
    () =>
      vehicles.filter(
        (vehicle) =>
          vehicle.plate.toLowerCase().includes(searchTerm.toLowerCase()) ||
          vehicle.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
          vehicle.model.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [vehicles, searchTerm]
  );

  const sortedFuelLogs = useMemo(() => [...fuelLogs].sort((a, b) => b.date.localeCompare(a.date)), [fuelLogs]);
  const pendingApprovals = useMemo(
    () => approvalRequests.filter((request) => request.status === 'PENDING'),
    [approvalRequests]
  );

  const currentBackupRequest = useMemo(() => {
    if (!selectedVehicleId || !selectedDriverId || !selectedBackupDriverId) return null;
    return approvalRequests.find(
      (request) =>
        request.vehicleId === selectedVehicleId &&
        request.primaryDriverId === selectedDriverId &&
        request.backupDriverId === selectedBackupDriverId
    );
  }, [approvalRequests, selectedVehicleId, selectedDriverId, selectedBackupDriverId]);

  const backupApprovalReady = useMemo(() => {
    if (!selectedVehicleId || !selectedDriverId || !selectedBackupDriverId) return false;
    return Boolean(
      findApprovedBackupDriverRequest({
        vehicleId: selectedVehicleId,
        primaryDriverId: selectedDriverId,
        backupDriverId: selectedBackupDriverId,
      })
    );
  }, [selectedVehicleId, selectedDriverId, selectedBackupDriverId, approvalRequests.length]);

  const resetVehicleForm = () => {
    setEditingVehicleId(null);
    setVehicleForm({
      plate: '',
      type: 'Camión',
      brand: '',
      model: '',
      year: String(new Date().getFullYear()),
      capacity: '0',
      mileage: '0',
      status: 'available',
    });
  };

  const openCreateVehicleDialog = () => {
    resetVehicleForm();
    setIsVehicleDialogOpen(true);
  };

  const openEditVehicleDialog = (vehicle: FleetVehicleRecord) => {
    setEditingVehicleId(vehicle.id);
    setVehicleForm({
      plate: vehicle.plate,
      type: vehicle.type,
      brand: vehicle.brand,
      model: vehicle.model,
      year: String(vehicle.year),
      capacity: String(vehicle.capacity),
      mileage: String(vehicle.mileage),
      status: vehicle.status,
    });
    setIsVehicleDialogOpen(true);
  };

  const saveVehicle = () => {
    const plate = vehicleForm.plate.trim().toUpperCase();
    const brand = vehicleForm.brand.trim();
    const model = vehicleForm.model.trim();
    const type = vehicleForm.type.trim();
    const year = Number(vehicleForm.year);
    const capacity = Number(vehicleForm.capacity);
    const mileage = Number(vehicleForm.mileage);

    if (!plate || !brand || !model || !type || !Number.isFinite(year) || !Number.isFinite(capacity)) {
      toast.error('Completa los campos obligatorios del vehículo.');
      return;
    }
    if (capacity <= 0) {
      toast.error('La capacidad debe ser mayor que cero.');
      return;
    }
    if (mileage < 0) {
      toast.error('El kilometraje no puede ser negativo.');
      return;
    }

    const duplicatedPlate = vehicles.find(
      (vehicle) => vehicle.plate.toUpperCase() === plate && vehicle.id !== editingVehicleId
    );
    if (duplicatedPlate) {
      toast.error('Ya existe un vehículo con esa placa.');
      return;
    }

    if (editingVehicleId) {
      const current = vehicles.find((vehicle) => vehicle.id === editingVehicleId);
      if (!current) return;
      const next = vehicles.map((vehicle) =>
        vehicle.id === editingVehicleId
          ? { ...current, ...vehicleForm, plate, brand, model, type, year, capacity, mileage }
          : vehicle
      );
      saveFleetVehicles(next);
      setVehicles(next);
      toast.success('Vehículo actualizado.');
    } else {
      const created = createFleetVehicle({
        plate,
        type,
        brand,
        model,
        year,
        capacity,
        mileage,
        status: vehicleForm.status,
        driverId: undefined,
        backupDriverId: undefined,
        backupDriverApprovalId: undefined,
      });
      setVehicles((prev) => [created, ...prev]);
      toast.success('Vehículo registrado.');
    }

    setIsVehicleDialogOpen(false);
    resetVehicleForm();
  };

  const deleteVehicle = (vehicleId: string) => {
    const next = vehicles.filter((vehicle) => vehicle.id !== vehicleId);
    saveFleetVehicles(next);
    setVehicles(next);
  };

  const openAssignDialog = (vehicle: FleetVehicleRecord) => {
    setSelectedVehicleId(vehicle.id);
    setSelectedDriverId(vehicle.driverId || '');
    setUseBackupDriver(Boolean(vehicle.backupDriverId));
    setSelectedBackupDriverId(vehicle.backupDriverId || '');
    setIsAssignDialogOpen(true);
  };

  const requestBackupApproval = () => {
    if (!selectedVehicle || !selectedDriverId || !selectedBackupDriverId) {
      toast.error('Completa chofer titular y suplente para solicitar autorización.');
      return;
    }
    if (selectedBackupDriverId === selectedDriverId) {
      toast.error('El chofer suplente no puede ser el mismo titular.');
      return;
    }

    createBackupDriverApprovalRequest({
      vehicleId: selectedVehicle.id,
      vehiclePlate: selectedVehicle.plate,
      primaryDriverId: selectedDriverId,
      backupDriverId: selectedBackupDriverId,
      requestedBy: 'A',
    });
    setApprovalRequests(loadBackupDriverApprovals());
    toast.success('Solicitud de autorización enviada al panel Admin.');
  };

  const assignDrivers = () => {
    if (!selectedVehicle) return;
    if (!selectedDriverId) {
      toast.error('Seleccione un chofer titular.');
      return;
    }

    let approvalId: string | undefined;
    if (useBackupDriver) {
      if (!selectedBackupDriverId) {
        toast.error('Seleccione un chofer suplente.');
        return;
      }
      if (selectedBackupDriverId === selectedDriverId) {
        toast.error('El chofer suplente no puede ser el mismo titular.');
        return;
      }
      const approved = findApprovedBackupDriverRequest({
        vehicleId: selectedVehicle.id,
        primaryDriverId: selectedDriverId,
        backupDriverId: selectedBackupDriverId,
      });
      if (!approved) {
        toast.error('El chofer suplente requiere autorización aprobada en panel Admin.');
        return;
      }
      approvalId = approved.id;
    }

    const next = vehicles.map((vehicle) =>
      vehicle.id === selectedVehicle.id
        ? {
            ...vehicle,
            driverId: selectedDriverId,
            backupDriverId: useBackupDriver ? selectedBackupDriverId : undefined,
            backupDriverApprovalId: useBackupDriver ? approvalId : undefined,
            status: 'in_use' as const,
          }
        : vehicle
    );
    saveFleetVehicles(next);
    setVehicles(next);
    setIsAssignDialogOpen(false);
    setSelectedVehicleId(null);
    setSelectedDriverId('');
    setUseBackupDriver(false);
    setSelectedBackupDriverId('');
    toast.success('Asignación de chofer actualizada.');
  };

  const resolveApproval = (requestId: string, status: 'APPROVED' | 'REJECTED') => {
    updateBackupDriverApprovalRequest(requestId, {
      status,
      reviewedAt: new Date().toISOString(),
      reviewedBy: 'A',
    });
    setApprovalRequests(loadBackupDriverApprovals());
    toast.success(status === 'APPROVED' ? 'Solicitud aprobada.' : 'Solicitud rechazada.');
  };

  const registerFuel = () => {
    const liters = Number(fuelForm.liters);
    const cost = Number(fuelForm.cost);
    if (!fuelForm.vehicleId || !Number.isFinite(liters) || liters <= 0 || !Number.isFinite(cost) || cost <= 0) {
      toast.error('Completa los datos de la carga de combustible.');
      return;
    }
    const log = createFuelLog({
      vehicleId: fuelForm.vehicleId,
      liters,
      cost,
      date: fuelForm.date || todayIso(),
      station: fuelForm.station.trim() || undefined,
    });
    setFuelLogs((prev) => [log, ...prev]);
    setFuelForm({
      vehicleId: '',
      liters: '',
      cost: '',
      date: todayIso(),
      station: '',
    });
    setIsFuelDialogOpen(false);
    toast.success('Carga de combustible registrada.');
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Flota</h1>
          <p className="text-slate-500">Administración de vehículos</p>
        </div>
        <Button onClick={openCreateVehicleDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Vehículo
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{vehicles.length}</p>
            <p className="text-sm text-slate-500">Total Vehículos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">
              {vehicles.filter((vehicle) => vehicle.status === 'available').length}
            </p>
            <p className="text-sm text-slate-500">Disponibles</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-orange-600">
              {vehicles.filter((vehicle) => vehicle.status === 'maintenance').length}
            </p>
            <p className="text-sm text-slate-500">En Mantenimiento</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">
              {vehicles.length > 0
                ? Math.round(vehicles.reduce((acc, vehicle) => acc + vehicle.mileage, 0) / vehicles.length).toLocaleString()
                : '0'}
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
          <TabsTrigger value="approvals">Autorizaciones</TabsTrigger>
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
                    <TableHead>Choferes</TableHead>
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
                      <TableCell>{vehicle.capacity}</TableCell>
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
                        <div className="space-y-1">
                          {vehicle.driverId ? (
                            <p className="text-sm">
                              <span className="font-medium">Titular:</span>{" "}
                              {driverMap.get(vehicle.driverId)?.name || vehicle.driverId}
                            </p>
                          ) : (
                            <p className="text-xs text-slate-500">Sin titular</p>
                          )}
                          {vehicle.backupDriverId ? (
                            <div className="text-xs text-slate-600">
                              Suplente: {driverMap.get(vehicle.backupDriverId)?.name || vehicle.backupDriverId}
                              {vehicle.backupDriverApprovalId ? (
                                <Badge variant="outline" className="ml-2 text-emerald-700 border-emerald-300">
                                  Aprobado
                                </Badge>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>{vehicle.mileage.toLocaleString()} km</TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => openAssignDialog(vehicle)}>
                          <User className="h-3 w-3 mr-1" />
                          {vehicle.driverId ? 'Reasignar' : 'Asignar'}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEditVehicleDialog(vehicle)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteVehicle(vehicle.id)}>
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
            {maintenanceRecords.map((record) => {
              const vehicle = vehicles.find(v => v.id === record.vehicleId);
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
                            {formatCurrency(record.cost)}
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
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Consumo de Combustible</CardTitle>
              <Button variant="outline" onClick={() => setIsFuelDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Registrar carga
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {sortedFuelLogs.map((log) => {
                  const vehicle = vehicles.find((item) => item.id === log.vehicleId);
                  return (
                    <div key={log.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                          <Fuel className="h-5 w-5 text-green-600" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">
                            {(vehicle?.code || log.vehicleId)} - {vehicle?.plate || "Sin placa"}
                          </p>
                          <p className="text-sm text-slate-500">{log.date}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-slate-900">{log.liters} L</p>
                        <p className="text-sm text-slate-500">{formatCurrency(log.cost)}</p>
                      </div>
                    </div>
                  );
                })}
                {sortedFuelLogs.length === 0 && (
                  <p className="text-center text-slate-500 py-6">No hay consumos de combustible registrados.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approvals">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Panel de Autorizaciones (Admin)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingApprovals.map((request) => (
                <div key={request.id} className="rounded-lg border p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">{request.vehiclePlate} - Solicitud de suplente</p>
                    <p className="text-sm text-slate-600">
                      Titular: {driverMap.get(request.primaryDriverId)?.name || request.primaryDriverId}
                    </p>
                    <p className="text-sm text-slate-600">
                      Suplente: {driverMap.get(request.backupDriverId)?.name || request.backupDriverId}
                    </p>
                    <p className="text-xs text-slate-500">Solicitado: {new Date(request.requestedAt).toLocaleString()}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => resolveApproval(request.id, 'REJECTED')}>
                      <XCircle className="h-4 w-4 mr-2" />
                      Rechazar
                    </Button>
                    <Button onClick={() => resolveApproval(request.id, 'APPROVED')}>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Aprobar
                    </Button>
                  </div>
                </div>
              ))}
              {pendingApprovals.length === 0 && (
                <p className="text-slate-500 text-sm">No hay solicitudes pendientes en este momento.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isVehicleDialogOpen} onOpenChange={setIsVehicleDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingVehicleId ? "Editar Vehículo" : "Registrar Nuevo Vehículo"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Placa *</Label>
              <Input value={vehicleForm.plate} onChange={(event) => setVehicleForm((prev) => ({ ...prev, plate: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Tipo *</Label>
              <Input value={vehicleForm.type} onChange={(event) => setVehicleForm((prev) => ({ ...prev, type: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Marca *</Label>
              <Input value={vehicleForm.brand} onChange={(event) => setVehicleForm((prev) => ({ ...prev, brand: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Modelo *</Label>
              <Input value={vehicleForm.model} onChange={(event) => setVehicleForm((prev) => ({ ...prev, model: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Año *</Label>
              <Input type="number" value={vehicleForm.year} onChange={(event) => setVehicleForm((prev) => ({ ...prev, year: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Capacidad *</Label>
              <Input type="number" value={vehicleForm.capacity} onChange={(event) => setVehicleForm((prev) => ({ ...prev, capacity: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Kilometraje</Label>
              <Input type="number" value={vehicleForm.mileage} onChange={(event) => setVehicleForm((prev) => ({ ...prev, mileage: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Estado</Label>
              <Select value={vehicleForm.status} onValueChange={(value) => setVehicleForm((prev) => ({ ...prev, status: value as FleetVehicleRecord["status"] }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Disponible</SelectItem>
                  <SelectItem value="in_use">En uso</SelectItem>
                  <SelectItem value="maintenance">Mantenimiento</SelectItem>
                  <SelectItem value="retired">Retirado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsVehicleDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveVehicle}>{editingVehicleId ? "Guardar cambios" : "Registrar vehículo"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
        <DialogContent className="max-w-lg">
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
              <Label>Chofer titular (activo)</Label>
              <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione un chofer" />
                </SelectTrigger>
                <SelectContent>
                  {availableDrivers.map((driver) => (
                    <SelectItem key={driver.id} value={driver.id}>
                      {driver.name} ({driver.code})
                    </SelectItem>
                  ))}
                  {availableDrivers.length === 0 && (
                    <SelectItem value="NO_DRIVERS" disabled>
                      No hay choferes activos en Usuarios
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {availableDrivers.length === 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.dispatchEvent(new CustomEvent("changeModule", { detail: "users" }))}
                >
                  Ir a Usuarios y Roles
                </Button>
              )}
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-slate-900">Habilitar chofer suplente</p>
                <p className="text-xs text-slate-500">Requiere autorización previa en panel Admin.</p>
              </div>
              <Switch checked={useBackupDriver} onCheckedChange={(checked) => setUseBackupDriver(Boolean(checked))} />
            </div>
            {useBackupDriver && (
              <div className="space-y-3 rounded-md border p-3">
                <div className="space-y-2">
                  <Label>Chofer suplente (activo)</Label>
                  <Select value={selectedBackupDriverId} onValueChange={setSelectedBackupDriverId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione suplente" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableDrivers
                        .filter((driver) => driver.id !== selectedDriverId)
                        .map((driver) => (
                          <SelectItem key={driver.id} value={driver.id}>
                            {driver.name} ({driver.code})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="text-xs">
                  {!selectedBackupDriverId ? (
                    <Badge variant="outline">Selecciona suplente para validar autorización</Badge>
                  ) : backupApprovalReady ? (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">
                      <ShieldCheck className="h-3 w-3 mr-1" />
                      Autorización aprobada
                    </Badge>
                  ) : currentBackupRequest?.status === "PENDING" ? (
                    <Badge variant="outline" className="text-amber-700 border-amber-300">
                      Solicitud pendiente de aprobación
                    </Badge>
                  ) : currentBackupRequest?.status === "REJECTED" ? (
                    <Badge variant="outline" className="text-red-700 border-red-300">
                      Solicitud rechazada. Debes solicitar nueva autorización.
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-slate-600">
                      Sin autorización registrada
                    </Badge>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={requestBackupApproval}
                  disabled={!selectedDriverId || !selectedBackupDriverId}
                >
                  Solicitar autorización A
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAssignDialogOpen(false)}>Cancelar</Button>
            <Button onClick={assignDrivers}>Guardar asignación</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isFuelDialogOpen} onOpenChange={setIsFuelDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar carga de combustible</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Vehículo</Label>
              <Select value={fuelForm.vehicleId} onValueChange={(value) => setFuelForm((prev) => ({ ...prev, vehicleId: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione vehículo" />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map((vehicle) => (
                    <SelectItem key={vehicle.id} value={vehicle.id}>
                      {vehicle.code} - {vehicle.plate}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Litros</Label>
                <Input type="number" value={fuelForm.liters} onChange={(event) => setFuelForm((prev) => ({ ...prev, liters: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Costo</Label>
                <Input type="number" value={fuelForm.cost} onChange={(event) => setFuelForm((prev) => ({ ...prev, cost: event.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Fecha</Label>
              <Input type="date" value={fuelForm.date} onChange={(event) => setFuelForm((prev) => ({ ...prev, date: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Estación (opcional)</Label>
              <Input value={fuelForm.station} onChange={(event) => setFuelForm((prev) => ({ ...prev, station: event.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFuelDialogOpen(false)}>Cancelar</Button>
            <Button onClick={registerFuel}>Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
