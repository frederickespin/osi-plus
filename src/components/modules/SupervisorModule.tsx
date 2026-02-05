import { useState } from 'react';
import { 
  QrCode, 
  Star,
  CheckCircle,
  MapPin,
  Package,
  Camera,
  MessageSquare,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { mockOSIs, mockUsers, mockKPIRecords } from '@/data/mockData';
import { toast } from 'sonner';

export function SupervisorModule() {
  const [_scanMode, setScanMode] = useState(false);
  const [_scanResult, setScanResult] = useState<string | null>(null);
  const [showEvalDialog, setShowEvalDialog] = useState(false);
  const [showCloseOSIDialog, setShowCloseOSIDialog] = useState(false);
  const [canCloseOSI, setCanCloseOSI] = useState(false);
  
  const teamMembers = mockUsers.filter(u => ['N', 'PA', 'E'].includes(u.role));
  const activeOSIs = mockOSIs.filter(o => ['assigned', 'in_preparation', 'in_transit'].includes(o.status));
  const myCurrentOSI = activeOSIs[0];

  // Simular escaneo QR inteligente
  const handleScan = (type: string) => {
    setScanMode(false);
    setScanResult(type);
    
    if (type === 'cliente') {
      toast.success('Registro de servicio completado');
      setCanCloseOSI(true);
    } else if (type === 'chofer') {
      toast.info('Lista de recepción de materiales abierta');
    } else if (type === 'despachador') {
      toast.info('Retorno de sobrantes iniciado');
    }
  };

  const handleEvaluateTeam = () => {
    toast.success('Evaluación guardada');
    setShowEvalDialog(false);
  };

  const handleCloseOSI = () => {
    if (!canCloseOSI) {
      toast.error('Debe escanear el QR de salida del cliente primero');
      return;
    }
    toast.success('OSI cerrada exitosamente');
    setShowCloseOSIDialog(false);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Panel de Supervisor</h1>
          <p className="text-slate-500">Gestión de equipo y operaciones de campo</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline">
            <MessageSquare className="h-4 w-4 mr-2" />
            Mensajes
          </Button>
        </div>
      </div>

      {/* Botón Central: Escanear QR */}
      <Card className="border-2 border-[#003366]">
        <CardContent className="p-6">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Escaneo QR Inteligente</h3>
            <div className="flex justify-center gap-4 flex-wrap">
              <Button 
                size="lg" 
                className="h-20 px-6"
                onClick={() => handleScan('cliente')}
              >
                <QrCode className="h-6 w-6 mr-2" />
                <div className="text-left">
                  <p className="font-bold">Cliente</p>
                  <p className="text-xs opacity-70">Inicio/Fin servicio</p>
                </div>
              </Button>
              <Button 
                size="lg" 
                variant="secondary"
                className="h-20 px-6"
                onClick={() => handleScan('chofer')}
              >
                <QrCode className="h-6 w-6 mr-2" />
                <div className="text-left">
                  <p className="font-bold">Chofer</p>
                  <p className="text-xs opacity-70">Recepción materiales</p>
                </div>
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                className="h-20 px-6"
                onClick={() => handleScan('despachador')}
              >
                <QrCode className="h-6 w-6 mr-2" />
                <div className="text-left">
                  <p className="font-bold">Despachador</p>
                  <p className="text-xs opacity-70">Retorno sobrantes</p>
                </div>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* OSI Actual */}
      {myCurrentOSI && (
        <Card className="bg-blue-50 border-blue-200">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Package className="h-5 w-5 text-blue-600" />
              OSI Activa: {myCurrentOSI.code}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <p className="text-sm text-slate-500">Cliente</p>
                <p className="font-medium text-slate-900">{myCurrentOSI.clientName}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Ruta</p>
                <p className="font-medium text-slate-900">{myCurrentOSI.origin} → {myCurrentOSI.destination}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Fecha</p>
                <p className="font-medium text-slate-900">{myCurrentOSI.scheduledDate}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button 
                onClick={() => setShowCloseOSIDialog(true)}
                disabled={!canCloseOSI}
                className={canCloseOSI ? '' : 'opacity-50 cursor-not-allowed'}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Cerrar OSI
              </Button>
              <Button variant="outline">
                <Camera className="h-4 w-4 mr-2" />
                Subir Fotos
              </Button>
            </div>
            {!canCloseOSI && (
              <p className="text-sm text-orange-600 mt-2">
                <AlertCircle className="h-4 w-4 inline mr-1" />
                Escanea el QR de salida del cliente para habilitar el cierre
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{teamMembers.length}</p>
            <p className="text-sm text-slate-500">Equipo Activo</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{activeOSIs.length}</p>
            <p className="text-sm text-slate-500">OSIs Hoy</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-orange-600">48h</p>
            <p className="text-sm text-slate-500">Horas Trabajadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-purple-600">4.7</p>
            <p className="text-sm text-slate-500">Rating Equipo</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="team">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="team">Mi Equipo</TabsTrigger>
          <TabsTrigger value="osis">OSIs Activas</TabsTrigger>
          <TabsTrigger value="tasks">Tareas</TabsTrigger>
        </TabsList>

        <TabsContent value="team" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-slate-900">Personal Asignado</h3>
            <Button size="sm" onClick={() => setShowEvalDialog(true)}>
              <Star className="h-4 w-4 mr-2" />
              Evaluar Equipo
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teamMembers.map((member) => (
              <TeamMemberCard key={member.id} member={member} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="osis" className="space-y-4">
          {activeOSIs.map((osi) => (
            <OSISupervisorCard key={osi.id} osi={osi} />
          ))}
        </TabsContent>

        <TabsContent value="tasks">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Tareas del Día</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <TaskItem title="Revisar equipos de seguridad" priority="high" completed={false} />
              <TaskItem title="Briefing matutino con equipo" priority="high" completed={true} />
              <TaskItem title="Verificar carga vehículo VH-001" priority="medium" completed={false} />
              <TaskItem title="Reporte de incidentes" priority="low" completed={false} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog: Evaluar Equipo */}
      <Dialog open={showEvalDialog} onOpenChange={setShowEvalDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-500" />
              Evaluar Equipo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {teamMembers.slice(0, 3).map((member) => (
              <div key={member.id} className="p-3 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-3 mb-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-blue-100 text-blue-700">
                      {member.name.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-slate-900">{member.name}</p>
                    <p className="text-xs text-slate-500">{member.department}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Button key={star} variant="ghost" size="sm" className="p-1">
                      <Star className="h-5 w-5 text-yellow-400" />
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEvalDialog(false)}>Cancelar</Button>
            <Button onClick={handleEvaluateTeam}>Guardar Evaluaciones</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Cerrar OSI */}
      <Dialog open={showCloseOSIDialog} onOpenChange={setShowCloseOSIDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Cerrar OSI
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="font-medium text-blue-900">{myCurrentOSI?.code}</p>
              <p className="text-sm text-blue-700">{myCurrentOSI?.clientName}</p>
            </div>
            <div className="space-y-2">
              <p className="font-medium text-slate-900">Checklist de Cierre:</p>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm text-slate-600">Servicio completado</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm text-slate-600">Cliente conforme</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm text-slate-600">Fotos documentadas</span>
              </div>
            </div>
            <p className="text-sm text-slate-500">
              Al cerrar esta OSI, se generará automáticamente la NOTA para el equipo.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCloseOSIDialog(false)}>Cancelar</Button>
            <Button onClick={handleCloseOSI} className="bg-green-600 hover:bg-green-700">
              Confirmar Cierre
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TeamMemberCard({ member }: { member: typeof mockUsers[0] }) {
  const kpi = mockKPIRecords.find(k => k.userId === member.id);
  
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <Avatar className="h-12 w-12">
            <AvatarFallback className="bg-blue-100 text-blue-700">
              {member.name.split(' ').map(n => n[0]).join('')}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-slate-900">{member.name}</h4>
              <div className={`w-3 h-3 rounded-full ${member.status === 'active' ? 'bg-green-500' : 'bg-gray-400'}`} />
            </div>
            <p className="text-sm text-slate-500">{member.department}</p>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline">{member.role}</Badge>
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <Star className="h-3 w-3 text-yellow-500" />
                {member.rating}
              </div>
            </div>
            {kpi && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-500">OSIs este mes</span>
                  <span className="font-medium">{kpi.metrics.osisCompleted}</span>
                </div>
                <Progress value={kpi.totalScore} className="h-1.5" />
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OSISupervisorCard({ osi }: { osi: typeof mockOSIs[0] }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h4 className="font-semibold text-slate-900">{osi.code}</h4>
              <Badge variant={osi.status === 'in_transit' ? 'default' : 'secondary'}>
                {osi.status === 'in_transit' ? 'En Tránsito' : osi.status === 'in_preparation' ? 'En Preparación' : 'Asignada'}
              </Badge>
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
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Camera className="h-4 w-4 mr-1" />
              Fotos
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TaskItem({ title, priority, completed }: { title: string; priority: 'high' | 'medium' | 'low'; completed: boolean }) {
  const priorityColors = {
    high: 'text-red-600 bg-red-50',
    medium: 'text-orange-600 bg-orange-50',
    low: 'text-blue-600 bg-blue-50',
  };

  return (
    <div className={`flex items-center justify-between p-3 rounded-lg ${completed ? 'bg-slate-50' : 'bg-white border border-slate-200'}`}>
      <div className="flex items-center gap-3">
        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${completed ? 'bg-green-500 border-green-500' : 'border-slate-300'}`}>
          {completed && <CheckCircle className="h-3 w-3 text-white" />}
        </div>
        <span className={`text-sm ${completed ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
          {title}
        </span>
      </div>
      <Badge variant="outline" className={`text-xs ${priorityColors[priority]}`}>
        {priority === 'high' ? 'Alta' : priority === 'medium' ? 'Media' : 'Baja'}
      </Badge>
    </div>
  );
}
