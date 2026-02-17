import { useState } from 'react';
import { 
  QrCode, 
  CheckCircle, 
  XCircle, 
  UserCheck,
  ClipboardCheck,
  AlertTriangle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { mockHandshakes } from '@/data/mockData';
import { toast } from 'sonner';
import { QRScanner, type ParsedQRCode, getQRTypeLabel } from '@/components/qr';

interface ScannedData {
  type: string;
  code: string;
  plate?: string;
  driver?: string;
  osi?: string;
  rawValue?: string;
}

export function SecurityModule() {
  const [scanMode, setScanMode] = useState(false);
  const [showIncidentDialog, setShowIncidentDialog] = useState(false);
  const [showChecklistDialog, setShowChecklistDialog] = useState(false);
  const [scannedData, setScannedData] = useState<ScannedData | null>(null);
  
  // Checklist state
  const [checklist, setChecklist] = useState({
    vehiculoVacio: false,
    selloIntacto: false,
    odometro: '',
    danosVisibles: false,
  });

  const pendingHandshakes = mockHandshakes.filter(h => h.status === 'pending');
  const completedHandshakes = mockHandshakes.filter(h => h.status === 'completed');

  // Handle QR scan result
  const handleQRScan = (result: ParsedQRCode) => {
    setScanMode(false);
    
    // Map QR result to scanned data
    const data: ScannedData = {
      type: result.type,
      code: result.payload,
      rawValue: result.rawValue,
    };
    
    // Add mock data based on type for demo
    if (result.type === 'VEHICLE') {
      data.plate = 'ABC-123';
      data.driver = 'Roberto Sánchez';
      data.osi = 'OSI-2024-002';
    } else if (result.type === 'OSI') {
      data.plate = 'XYZ-789';
      data.driver = 'Juan Pérez';
      data.osi = result.rawValue;
    }
    
    setScannedData(data);
    
    if (result.isValid) {
      toast.success(`${getQRTypeLabel(result.type)} escaneado: ${result.payload}`);
      setShowChecklistDialog(true);
    } else {
      toast.warning('Código no reconocido - verificar manualmente');
      setShowChecklistDialog(true);
    }
  };

  const handleReportIncident = () => {
    toast.error('Incidente reportado - Protocolo de bloqueo activado');
    setShowIncidentDialog(false);
  };

  const handleChecklistComplete = () => {
    toast.success('Checklist completado - Acceso autorizado');
    setShowChecklistDialog(false);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Portería</h1>
          <p className="text-slate-500">Control de acceso y salida</p>
        </div>
      </div>

      {/* Botones Principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Button 
          size="lg" 
          className="h-24 text-lg bg-[#003366] hover:bg-[#002244]"
          onClick={() => setScanMode(true)}
        >
          <QrCode className="h-8 w-8 mr-3" />
          <div className="text-left">
            <p className="font-bold">Escanear Entrada/Salida</p>
            <p className="text-sm opacity-70">QR de OSI o Vehículo</p>
          </div>
        </Button>
        
        <Button 
          size="lg" 
          variant="destructive"
          className="h-24 text-lg"
          onClick={() => setShowIncidentDialog(true)}
        >
          <AlertTriangle className="h-8 w-8 mr-3" />
          <div className="text-left">
            <p className="font-bold">Reportar Incidente</p>
            <p className="text-sm opacity-70">Avería crítica o emergencia</p>
          </div>
        </Button>
      </div>

      {/* QR Scanner Dialog */}
      {scanMode && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <QRScanner
            onScan={handleQRScan}
            onClose={() => setScanMode(false)}
            acceptedTypes={['OSI', 'VEHICLE', 'USER', 'HANDSHAKE']}
            title="Escanear Entrada/Salida"
          />
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">12</p>
            <p className="text-sm text-slate-500">Entradas Hoy</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">10</p>
            <p className="text-sm text-slate-500">Salidas Hoy</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">8</p>
            <p className="text-sm text-slate-500">Vehículos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-orange-600">{pendingHandshakes.length}</p>
            <p className="text-sm text-slate-500">Pendientes</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            Pendientes
            <Badge variant="secondary" className="ml-2">{pendingHandshakes.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="completed">Completados</TabsTrigger>
          <TabsTrigger value="today">Hoy</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {pendingHandshakes.map((handshake) => (
            <HandshakeCard key={handshake.id} handshake={handshake} />
          ))}
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          {completedHandshakes.map((handshake) => (
            <HandshakeCard key={handshake.id} handshake={handshake} completed />
          ))}
        </TabsContent>

        <TabsContent value="today">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Resumen del Día</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-slate-50 rounded-lg">
                  <p className="text-2xl font-bold text-slate-900">12</p>
                  <p className="text-sm text-slate-500">Entradas</p>
                </div>
                <div className="text-center p-4 bg-slate-50 rounded-lg">
                  <p className="text-2xl font-bold text-slate-900">10</p>
                  <p className="text-sm text-slate-500">Salidas</p>
                </div>
                <div className="text-center p-4 bg-slate-50 rounded-lg">
                  <p className="text-2xl font-bold text-slate-900">8</p>
                  <p className="text-sm text-slate-500">Vehículos</p>
                </div>
                <div className="text-center p-4 bg-slate-50 rounded-lg">
                  <p className="text-2xl font-bold text-slate-900">5</p>
                  <p className="text-sm text-slate-500">Handshakes</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog: Reportar Incidente */}
      <Dialog open={showIncidentDialog} onOpenChange={setShowIncidentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Reportar Incidente Crítico
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tipo de Incidente</Label>
              <select className="w-full mt-1 p-2 border rounded-lg">
                <option>Avería vehicular</option>
                <option>Accidente</option>
                <option>Mercancía dañada</option>
                <option>Incidente de seguridad</option>
              </select>
            </div>
            <div>
              <Label>Descripción</Label>
              <textarea className="w-full mt-1 p-2 border rounded-lg h-24" placeholder="Describa el incidente..." />
            </div>
            <div>
              <Label>Vehículo/Equipo Afectado</Label>
              <Input placeholder="Placa o código" />
            </div>
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">
                <strong>Advertencia:</strong> Este reporte activará el protocolo de bloqueo automático 
                para el chofer y supervisor asociados.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowIncidentDialog(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleReportIncident}>Reportar Incidente</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Checklist de Entrada/Salida */}
      <Dialog open={showChecklistDialog} onOpenChange={setShowChecklistDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" />
              Checklist de Verificación
            </DialogTitle>
          </DialogHeader>
          {scannedData && (
            <div className="p-3 bg-blue-50 rounded-lg mb-4">
              <p className="font-medium text-blue-900">{scannedData.code} - {scannedData.plate}</p>
              <p className="text-sm text-blue-700">Chofer: {scannedData.driver}</p>
              <p className="text-sm text-blue-700">OSI: {scannedData.osi}</p>
            </div>
          )}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="vacio" 
                checked={checklist.vehiculoVacio}
                onCheckedChange={(c) => setChecklist({...checklist, vehiculoVacio: c as boolean})}
              />
              <Label htmlFor="vacio">Vehículo vacío / limpio</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="sello" 
                checked={checklist.selloIntacto}
                onCheckedChange={(c) => setChecklist({...checklist, selloIntacto: c as boolean})}
              />
              <Label htmlFor="sello">Sello intacto</Label>
            </div>
            <div>
              <Label htmlFor="odometro">Odómetro (km)</Label>
              <Input 
                id="odometro"
                placeholder="Ingrese lectura"
                value={checklist.odometro}
                onChange={(e) => setChecklist({...checklist, odometro: e.target.value})}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="danos" 
                checked={checklist.danosVisibles}
                onCheckedChange={(c) => setChecklist({...checklist, danosVisibles: c as boolean})}
              />
              <Label htmlFor="danos" className="text-red-600">Daños visibles</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowChecklistDialog(false)}>Cancelar</Button>
            <Button onClick={handleChecklistComplete}>
              <CheckCircle className="h-4 w-4 mr-2" />
              Completar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HandshakeCard({ handshake, completed }: { handshake: typeof mockHandshakes[0]; completed?: boolean }) {
  return (
    <Card className={completed ? 'opacity-70' : 'border-l-4 border-l-orange-500'}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-semibold text-slate-900">{handshake.code}</h3>
              <Badge variant={completed ? 'default' : 'destructive'}>
                {completed ? 'Completado' : 'Pendiente'}
              </Badge>
              <Badge variant="outline">{handshake.type === 'pickup' ? 'Recolección' : handshake.type === 'delivery' ? 'Entrega' : 'Transferencia'}</Badge>
            </div>
            <p className="text-sm text-slate-600 mb-2">OSI: {handshake.osiCode}</p>
            <div className="flex items-center gap-4 text-sm text-slate-500">
              <span className="flex items-center gap-1">
                <UserCheck className="h-3 w-3" />
                De: {handshake.fromUserName}
              </span>
              <span className="flex items-center gap-1">
                <UserCheck className="h-3 w-3" />
                Para: {handshake.toUserName}
              </span>
            </div>
          </div>
          {!completed && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50">
                <XCircle className="h-4 w-4 mr-1" />
                Rechazar
              </Button>
              <Button size="sm">
                <CheckCircle className="h-4 w-4 mr-1" />
                Aceptar
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
