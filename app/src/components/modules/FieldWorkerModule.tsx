import { useState } from 'react';
import { 
  HardHat, 
  Package, 
  CheckCircle, 
  Clock, 
  MapPin,
  Star,
  Trophy,
  Camera,
  AlertTriangle,
  Calendar,
  TrendingUp,
  Award,
  QrCode,
  Play
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { mockOSIs, mockBadges, mockUsers } from '@/data/mockData';
import { isFieldStaffRole, loadUsers } from '@/lib/userStore';
import { toast } from 'sonner';

export function FieldWorkerModule() {
  const [activeTask, setActiveTask] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [showScanDialog, setShowScanDialog] = useState(false);
  
  // Simular usuario de campo
  const storedUsers = loadUsers();
  const users = storedUsers.length ? storedUsers : mockUsers;
  const fieldWorker = users.find(u => u.role === 'N');
  const canGenerateNota = !!fieldWorker && isFieldStaffRole(fieldWorker.role) && fieldWorker.notaEnabled !== false;
  const assignedOSIs = mockOSIs.filter(o => o.status === 'assigned' || o.status === 'in_preparation');
  const completedOSIs = mockOSIs.filter(o => o.status === 'completed').slice(0, 5);

  // Órdenes de taller para especialistas (PA/PB)
  const workshopOrders = [
    { id: 'WO-001', type: 'carpentry', description: 'Caja 2x1x1m para OSI-2024-002', status: 'pending', deadline: '2024-01-25' },
    { id: 'WO-002', type: 'packing', description: 'Embalaje especial mueble antiguo', status: 'in_progress', deadline: '2024-01-24' },
  ];

  const handleStartTask = () => {
    setActiveTask(true);
    toast.success('Tarea iniciada - Tiempo registrado');
  };

  const handleCompleteTask = () => {
    setActiveTask(false);
    if (!canGenerateNota) {
      toast.error('Tu usuario no tiene habilitada la creación de NOTA');
      return;
    }
    toast.success('Tarea completada - NOTA generada');
  };

  const handleReportIssue = () => {
    toast.success('Reporte enviado al supervisor');
    setShowReportDialog(false);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header con Perfil */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="bg-blue-100 text-blue-700 text-xl">
              {fieldWorker?.name.split(' ').map((n: string) => n[0]).join('')}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{fieldWorker?.name}</h1>
            <p className="text-slate-500">Personal de Campo - {fieldWorker?.department}</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline">{fieldWorker?.role}</Badge>
              <Badge variant={canGenerateNota ? 'default' : 'secondary'}>
                NOTA: {canGenerateNota ? 'Sí' : 'No'}
              </Badge>
              <div className="flex items-center gap-1 text-sm text-slate-600">
                <Star className="h-4 w-4 text-yellow-500" />
                {fieldWorker?.rating}
              </div>
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-2 justify-end">
            <Trophy className="h-5 w-5 text-yellow-500" />
            <span className="text-2xl font-bold text-slate-900">{fieldWorker?.points}</span>
          </div>
          <p className="text-sm text-slate-500">puntos acumulados</p>
        </div>
      </div>

      {/* Botones Principales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Button 
          size="lg" 
          className="h-20"
          onClick={() => document.getElementById('mis-tareas')?.scrollIntoView({ behavior: 'smooth' })}
        >
          <Package className="h-6 w-6 mr-2" />
          <div className="text-left">
            <p className="font-bold">Mis Tareas</p>
            <p className="text-xs opacity-70">{assignedOSIs.length} pendientes</p>
          </div>
        </Button>
        
        <Button 
          size="lg" 
          variant="secondary"
          className="h-20"
          onClick={() => setShowScanDialog(true)}
        >
          <QrCode className="h-6 w-6 mr-2" />
          <div className="text-left">
            <p className="font-bold">Escanear</p>
            <p className="text-xs opacity-70">QR de OSI</p>
          </div>
        </Button>
        
        <Button 
          size="lg" 
          variant="outline"
          className="h-20"
          onClick={() => document.getElementById('ordenes-taller')?.scrollIntoView({ behavior: 'smooth' })}
        >
          <HardHat className="h-6 w-6 mr-2" />
          <div className="text-left">
            <p className="font-bold">Órdenes Taller</p>
            <p className="text-xs opacity-70">{workshopOrders.length} activas</p>
          </div>
        </Button>
        
        <Button 
          size="lg" 
          variant="destructive"
          className="h-20"
          onClick={() => setShowReportDialog(true)}
        >
          <AlertTriangle className="h-6 w-6 mr-2" />
          <div className="text-left">
            <p className="font-bold">Reportar</p>
            <p className="text-xs opacity-70">Problema o incidencia</p>
          </div>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">24</p>
            <p className="text-sm text-slate-500">OSIs Este Mes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">98%</p>
            <p className="text-sm text-slate-500">Puntualidad</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">156</p>
            <p className="text-sm text-slate-500">Horas Trabajadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-purple-600">5</p>
            <p className="text-sm text-slate-500">Insignias</p>
          </CardContent>
        </Card>
      </div>

      {/* Mis Tareas */}
      <div id="mis-tareas">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Mis Tareas</h3>
        
        {/* Tarea Activa */}
        {activeTask && (
          <Card className="border-2 border-green-500 mb-4">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Play className="h-5 w-5 text-green-500" />
                Tarea en Progreso
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-slate-900">OSI-2024-002</h4>
                  <p className="text-sm text-slate-600">Minera Los Andes S.A.</p>
                </div>
                <div className="flex items-center gap-4 text-sm text-slate-500">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    Av. Arce → Calle Loayza
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    Inicio: 08:00 AM
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1">
                    <Camera className="h-4 w-4 mr-2" />
                    Subir Foto
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={() => setShowReportDialog(true)}>
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    Reportar
                  </Button>
                  <Button 
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    onClick={handleCompleteTask}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Completar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Próximas Tareas */}
        <div className="space-y-3">
          {assignedOSIs.map((osi) => (
            <TaskCard key={osi.id} osi={osi} onStart={handleStartTask} />
          ))}
        </div>
      </div>

      {/* Órdenes de Taller */}
      <div id="ordenes-taller">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Mis Órdenes de Taller</h3>
        <div className="space-y-3">
          {workshopOrders.map((order) => (
            <Card key={order.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold text-slate-900">{order.id}</h4>
                      <Badge variant={order.status === 'in_progress' ? 'default' : 'outline'}>
                        {order.status === 'in_progress' ? 'En Progreso' : 'Pendiente'}
                      </Badge>
                      <Badge variant="outline">
                        {order.type === 'carpentry' ? 'Carpintería' : 'Embalaje'}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-600">{order.description}</p>
                    <p className="text-sm text-slate-500 mt-1">
                      <Clock className="h-3 w-3 inline mr-1" />
                      Fecha límite: {order.deadline}
                    </p>
                  </div>
                  <Button size="sm">
                    {order.status === 'in_progress' ? 'Continuar' : 'Iniciar'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="schedule">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="schedule">Horario</TabsTrigger>
          <TabsTrigger value="badges">Insignias</TabsTrigger>
          <TabsTrigger value="profile">Perfil</TabsTrigger>
          <TabsTrigger value="history">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="schedule">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Horario de la Semana
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <ScheduleDay day="Lunes" date="22 Ene" hours="8:00 - 17:00" status="completed" />
                <ScheduleDay day="Martes" date="23 Ene" hours="8:00 - 17:00" status="completed" />
                <ScheduleDay day="Miércoles" date="24 Ene" hours="8:00 - 17:00" status="active" />
                <ScheduleDay day="Jueves" date="25 Ene" hours="8:00 - 17:00" status="scheduled" />
                <ScheduleDay day="Viernes" date="26 Ene" hours="8:00 - 14:00" status="scheduled" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="badges">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {mockBadges.map((badge) => (
              <BadgeCard key={badge.id} badge={badge} earned={Math.random() > 0.5} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Mi Perfil</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="font-medium text-slate-900 mb-3">Habilidades (SHAB)</h4>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="px-3 py-1">Embalaje (PC)</Badge>
                  <Badge variant="outline" className="px-3 py-1">Carga Pesada</Badge>
                  <Badge variant="outline" className="px-3 py-1">Manejo de Fragiles</Badge>
                </div>
              </div>
              
              <div>
                <h4 className="font-medium text-slate-900 mb-3">Certificaciones</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <span className="text-sm text-slate-700">Seguridad Industrial</span>
                    <Badge variant="default">Vigente</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <span className="text-sm text-slate-700">Manejo Defensivo</span>
                    <Badge variant="default">Vigente</Badge>
                  </div>
                </div>
              </div>
              
              <div>
                <h4 className="font-medium text-slate-900 mb-3">Estadísticas del Mes</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-slate-50 rounded-lg">
                    <TrendingUp className="h-6 w-6 text-green-500 mx-auto mb-2" />
                    <p className="text-lg font-bold">24</p>
                    <p className="text-xs text-slate-500">OSIs</p>
                  </div>
                  <div className="text-center p-4 bg-slate-50 rounded-lg">
                    <Star className="h-6 w-6 text-yellow-500 mx-auto mb-2" />
                    <p className="text-lg font-bold">4.8</p>
                    <p className="text-xs text-slate-500">Rating</p>
                  </div>
                  <div className="text-center p-4 bg-slate-50 rounded-lg">
                    <Clock className="h-6 w-6 text-blue-500 mx-auto mb-2" />
                    <p className="text-lg font-bold">156h</p>
                    <p className="text-xs text-slate-500">Horas</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <div className="space-y-3">
            {completedOSIs.map((osi) => (
              <Card key={osi.id} className="opacity-70">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-slate-900">{osi.code}</h4>
                        <Badge variant="default">Completado</Badge>
                      </div>
                      <p className="text-sm text-slate-500">{osi.clientName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-slate-500">{osi.scheduledDate}</p>
                      <CheckCircle className="h-5 w-5 text-green-500 inline mt-1" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialog: Reportar Problema */}
      <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600">
              <AlertTriangle className="h-5 w-5" />
              Reportar Problema
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tipo de Problema</Label>
              <select className="w-full mt-1 p-2 border rounded-lg">
                <option>Material faltante</option>
                <option>Herramienta dañada</option>
                <option>Condiciones inseguras</option>
                <option>Retraso en servicio</option>
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
                <option>OSI-2024-002</option>
                <option>OSI-2024-003</option>
                <option>Ninguna / General</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReportDialog(false)}>Cancelar</Button>
            <Button onClick={handleReportIssue} variant="destructive">
              Enviar Reporte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Escanear QR */}
      <Dialog open={showScanDialog} onOpenChange={setShowScanDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Escanear Código QR
            </DialogTitle>
          </DialogHeader>
          <div className="text-center py-8">
            <div className="w-48 h-48 mx-auto mb-4 bg-slate-100 rounded-lg flex items-center justify-center border-2 border-dashed border-slate-300">
              <QrCode className="h-24 w-24 text-slate-400" />
            </div>
            <p className="text-slate-500">Acerca el código QR de la OSI al escáner</p>
            <Input className="mt-4" placeholder="O ingresa el código manualmente..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowScanDialog(false)}>Cancelar</Button>
            <Button onClick={() => { setShowScanDialog(false); toast.success('OSI encontrada'); }}>
              Buscar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TaskCard({ osi, onStart }: { osi: typeof mockOSIs[0]; onStart: () => void }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h4 className="font-semibold text-slate-900">{osi.code}</h4>
              <Badge variant="outline">{osi.status === 'assigned' ? 'Asignada' : 'En Preparación'}</Badge>
            </div>
            <p className="text-sm text-slate-600 mb-2">{osi.clientName}</p>
            <div className="flex items-center gap-4 text-sm text-slate-500">
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {osi.origin} → {osi.destination}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {osi.scheduledDate}
              </span>
            </div>
          </div>
          <Button onClick={onStart}>
            <Play className="h-4 w-4 mr-2" />
            Iniciar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ScheduleDay({ day, date, hours, status }: { day: string; date: string; hours: string; status: 'completed' | 'active' | 'scheduled' }) {
  const statusColors = {
    completed: 'bg-slate-100 text-slate-500',
    active: 'bg-green-100 text-green-700 border-green-300',
    scheduled: 'bg-white border border-slate-200',
  };

  return (
    <div className={`flex items-center justify-between p-3 rounded-lg ${statusColors[status]}`}>
      <div className="flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full ${status === 'completed' ? 'bg-slate-400' : status === 'active' ? 'bg-green-500' : 'bg-slate-300'}`} />
        <div>
          <p className="font-medium">{day}</p>
          <p className="text-xs opacity-70">{date}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="font-medium">{hours}</p>
        <p className="text-xs opacity-70">
          {status === 'completed' ? 'Completado' : status === 'active' ? 'En curso' : 'Programado'}
        </p>
      </div>
    </div>
  );
}

function BadgeCard({ badge, earned }: { badge: typeof mockBadges[0]; earned: boolean }) {
  return (
    <Card className={`text-center ${earned ? '' : 'opacity-50 grayscale'}`}>
      <CardContent className="p-4">
        <div className={`w-16 h-16 mx-auto mb-3 rounded-full flex items-center justify-center ${earned ? 'bg-yellow-100' : 'bg-slate-100'}`}>
          <Award className={`h-8 w-8 ${earned ? 'text-yellow-600' : 'text-slate-400'}`} />
        </div>
        <h4 className="font-medium text-slate-900 text-sm">{badge.name}</h4>
        <p className="text-xs text-slate-500 mt-1">{badge.description}</p>
        {earned && (
          <Badge variant="secondary" className="mt-2 text-xs">
            +{badge.points} pts
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
