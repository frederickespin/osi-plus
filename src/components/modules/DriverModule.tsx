import { useState } from 'react';
import { 
  Truck, 
  MapPin, 
  Navigation, 
  Clock, 
  CheckCircle, 
  Camera,
  Package,
  Phone,
  AlertTriangle,
  Fuel,
  Wrench,
  Play,
  Square
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { mockOSIs, mockVehicles } from '@/data/mockData';
import { toast } from 'sonner';

export function DriverModule() {
  const [activeTrip, setActiveTrip] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [showFuelDialog, setShowFuelDialog] = useState(false);
  const [tripStartTime, setTripStartTime] = useState<Date | null>(null);
  
  // Simular OSI asignada al chofer
  const assignedOSI = mockOSIs.find(o => o.status === 'in_transit');
  const assignedVehicle = mockVehicles.find(v => v.assignedDriver === 'U007');

  const handleStartTrip = () => {
    setActiveTrip(true);
    setTripStartTime(new Date());
    toast.success('Viaje iniciado - Tiempo registrado');
  };

  const handleEndTrip = () => {
    setActiveTrip(false);
    toast.success('Viaje finalizado - NOTA generada');
  };

  const handleReportIssue = () => {
    toast.success('Reporte enviado a Mecánica');
    setShowReportDialog(false);
  };

  const handleFuelReport = () => {
    toast.success('Carga de combustible registrada');
    setShowFuelDialog(false);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Panel de Chofer</h1>
          <p className="text-slate-500">Gestión de rutas y entregas</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon">
            <Phone className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setShowReportDialog(true)}>
            <AlertTriangle className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Estado de Viaje */}
      <Card className={activeTrip ? 'border-2 border-green-500' : ''}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {activeTrip ? 'Viaje en Progreso' : 'Sin Viaje Activo'}
              </h2>
              <p className="text-slate-500">
                {activeTrip && assignedOSI ? `${assignedOSI.code} en tránsito` : 'Esperando asignación'}
              </p>
            </div>
            <Badge variant={activeTrip ? 'default' : 'secondary'} className="text-lg px-4 py-2">
              {activeTrip ? 'EN RUTA' : 'DISPONIBLE'}
            </Badge>
          </div>
          
          {activeTrip && assignedOSI && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full" />
                    <span className="text-sm text-slate-600">{assignedOSI.origin}</span>
                  </div>
                  <div className="w-0.5 h-8 bg-slate-300 ml-1.5" />
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-500 rounded-full" />
                    <span className="text-sm text-slate-600">{assignedOSI.destination}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-slate-900">45 min</p>
                  <p className="text-sm text-slate-500">Tiempo estimado</p>
                </div>
              </div>
              
              {tripStartTime && (
                <div className="p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-700">
                    <Clock className="h-4 w-4 inline mr-1" />
                    Inicio: {tripStartTime.toLocaleTimeString()}
                  </p>
                </div>
              )}
              
              <div className="flex gap-3">
                <Button className="flex-1" variant="outline">
                  <Navigation className="h-4 w-4 mr-2" />
                  Navegar
                </Button>
                <Button className="flex-1" variant="outline">
                  <Camera className="h-4 w-4 mr-2" />
                  Reportar
                </Button>
                <Button 
                  className="flex-1 bg-green-600 hover:bg-green-700"
                  onClick={handleEndTrip}
                >
                  <Square className="h-4 w-4 mr-2" />
                  Finalizar
                </Button>
              </div>
            </div>
          )}
          
          {!activeTrip && assignedOSI && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 rounded-lg">
                <h4 className="font-medium text-slate-900">{assignedOSI.code}</h4>
                <p className="text-sm text-slate-600">{assignedOSI.clientName}</p>
                <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {assignedOSI.origin} → {assignedOSI.destination}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {assignedOSI.scheduledDate}
                  </span>
                </div>
              </div>
              <Button className="w-full" onClick={handleStartTrip}>
                <Play className="h-4 w-4 mr-2" />
                Iniciar Viaje
              </Button>
            </div>
          )}
          
          {!activeTrip && !assignedOSI && (
            <div className="text-center py-8">
              <Truck className="h-16 w-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">No tienes viajes asignados actualmente</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="today">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="today">Hoy</TabsTrigger>
          <TabsTrigger value="upcoming">Próximos</TabsTrigger>
          <TabsTrigger value="vehicle">Vehículo</TabsTrigger>
          <TabsTrigger value="history">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="space-y-4">
          <h3 className="font-semibold text-slate-900">Viajes de Hoy</h3>
          {mockOSIs.filter(o => o.status === 'in_transit' || o.status === 'assigned').map((osi) => (
            <TripCard key={osi.id} osi={osi} />
          ))}
        </TabsContent>

        <TabsContent value="upcoming" className="space-y-4">
          <h3 className="font-semibold text-slate-900">Próximos Viajes</h3>
          {mockOSIs.filter(o => o.status === 'in_preparation').map((osi) => (
            <TripCard key={osi.id} osi={osi} upcoming />
          ))}
        </TabsContent>

        <TabsContent value="vehicle">
          {assignedVehicle && <VehicleCard vehicle={assignedVehicle} onReportIssue={() => setShowReportDialog(true)} onFuelReport={() => setShowFuelDialog(true)} />}
        </TabsContent>

        <TabsContent value="history">
          <div className="space-y-4">
            {mockOSIs.filter(o => o.status === 'completed').slice(0, 3).map((osi) => (
              <TripCard key={osi.id} osi={osi} completed />
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialog: Reportar Falla */}
      <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600">
              <Wrench className="h-5 w-5" />
              Reportar Falla o Incidente
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tipo de Reporte</Label>
              <select className="w-full mt-1 p-2 border rounded-lg">
                <option>Falla mecánica</option>
                <option>Accidente</option>
                <option>Retraso imprevisto</option>
                <option>Problema con carga</option>
                <option>Otro</option>
              </select>
            </div>
            <div>
              <Label>Descripción</Label>
              <textarea className="w-full mt-1 p-2 border rounded-lg h-24" placeholder="Describa el problema..." />
            </div>
            <div>
              <Label>OSI Relacionada</Label>
              <select className="w-full mt-1 p-2 border rounded-lg">
                <option>{assignedOSI?.code || 'Ninguna'}</option>
              </select>
            </div>
            <p className="text-sm text-slate-500">
              Este reporte será enviado al departamento de Mecánica y a su supervisor.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReportDialog(false)}>Cancelar</Button>
            <Button onClick={handleReportIssue} variant="destructive">
              Enviar Reporte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Cargar Combustible */}
      <Dialog open={showFuelDialog} onOpenChange={setShowFuelDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Fuel className="h-5 w-5" />
              Reportar Carga de Combustible
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Litros Cargados</Label>
              <Input type="number" placeholder="Ej: 45" />
            </div>
            <div>
              <Label>Costo Total ($)</Label>
              <Input type="number" placeholder="Ej: 315" />
            </div>
            <div>
              <Label>Kilometraje Actual</Label>
              <Input type="number" placeholder={assignedVehicle?.mileage.toString()} />
            </div>
            <div>
              <Label>Estación de Servicio</Label>
              <Input placeholder="Nombre de la estación" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFuelDialog(false)}>Cancelar</Button>
            <Button onClick={handleFuelReport}>
              <CheckCircle className="h-4 w-4 mr-2" />
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TripCard({ osi, upcoming, completed }: { osi: typeof mockOSIs[0]; upcoming?: boolean; completed?: boolean }) {
  return (
    <Card className={completed ? 'opacity-60' : ''}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h4 className="font-semibold text-slate-900">{osi.code}</h4>
              <Badge variant={completed ? 'default' : upcoming ? 'secondary' : 'outline'}>
                {completed ? 'Completado' : upcoming ? 'Programado' : 'En Progreso'}
              </Badge>
            </div>
            <div className="space-y-1 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-slate-400" />
                <span>{osi.origin} → {osi.destination}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-slate-400" />
                <span>{osi.scheduledDate}</span>
              </div>
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-slate-400" />
                <span>{osi.clientName}</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="font-semibold text-slate-900">${osi.value.toLocaleString()}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function VehicleCard({ vehicle, onReportIssue, onFuelReport }: { vehicle: typeof mockVehicles[0]; onReportIssue: () => void; onFuelReport: () => void }) {
  const nextMaintenance = vehicle.nextMaintenance ? new Date(vehicle.nextMaintenance) : null;
  const daysUntilMaintenance = nextMaintenance ? Math.ceil((nextMaintenance.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
  
  return (
    <Card className={vehicle.status === 'maintenance' ? 'border-orange-300' : ''}>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Truck className="h-5 w-5" />
          {vehicle.brand} {vehicle.model}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-slate-50 rounded-lg">
            <p className="text-sm text-slate-500">Placa</p>
            <p className="font-semibold text-slate-900">{vehicle.plate}</p>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg">
            <p className="text-sm text-slate-500">Año</p>
            <p className="font-semibold text-slate-900">{vehicle.year}</p>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg">
            <p className="text-sm text-slate-500">Capacidad</p>
            <p className="font-semibold text-slate-900">{vehicle.capacity} kg</p>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg">
            <p className="text-sm text-slate-500">Kilometraje</p>
            <p className="font-semibold text-slate-900">{vehicle.mileage.toLocaleString()} km</p>
          </div>
        </div>
        
        {daysUntilMaintenance !== null && (
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-500">Próximo mantenimiento</span>
              <span className={`font-medium ${daysUntilMaintenance < 7 ? 'text-red-600' : 'text-slate-700'}`}>
                {daysUntilMaintenance} días
              </span>
            </div>
            <Progress 
              value={Math.max(0, Math.min(100, 100 - (daysUntilMaintenance / 30) * 100))} 
              className="h-2"
            />
          </div>
        )}
        
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onReportIssue}>
            <Wrench className="h-4 w-4 mr-2" />
            Reportar Falla
          </Button>
          <Button variant="outline" className="flex-1" onClick={onFuelReport}>
            <Fuel className="h-4 w-4 mr-2" />
            Cargar Combustible
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
