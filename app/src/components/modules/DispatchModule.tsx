import { useState } from 'react';
import { 
  Send, 
  QrCode, 
  CheckCircle, 
  Clock, 
  MapPin,
  UserCheck,
  Truck,
  Scan,
  ArrowRight,
  ArrowLeft,
  ClipboardCheck,
  XCircle
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';

import { mockHandshakes, mockOSIs } from '@/data/mockData';
import { toast } from 'sonner';

export function DispatchModule() {
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [showDispatchDialog, setShowDispatchDialog] = useState(false);
  const [showReceiveDialog, setShowReceiveDialog] = useState(false);
  const [selectedOSI, setSelectedOSI] = useState<any>(null);
  
  const pendingHandshakes = mockHandshakes.filter(h => h.status === 'pending');
  const completedHandshakes = mockHandshakes.filter(h => h.status === 'completed');
  const readyForDispatch = mockOSIs.filter(o => o.status === 'in_preparation');
  const inTransit = mockOSIs.filter(o => o.status === 'in_transit');

  // Lista de materiales esperados vs real (simulado)
  const materialChecklist = [
    { item: 'Cajas de cartón grandes', expected: 20, actual: 20, status: 'ok' },
    { item: 'Plástico de burbujas', expected: 5, actual: 5, status: 'ok' },
    { item: 'Cinta adhesiva', expected: 10, actual: 8, status: 'missing' },
    { item: 'Mantas protectoras', expected: 15, actual: 15, status: 'ok' },
  ];

  const handleDispatch = (osi: any) => {
    setSelectedOSI(osi);
    setShowDispatchDialog(true);
  };

  const handleReceive = (osi: any) => {
    setSelectedOSI(osi);
    setShowReceiveDialog(true);
  };

  const confirmDispatch = () => {
    toast.success('Despacho confirmado - QR generado para chofer');
    setShowDispatchDialog(false);
  };

  const confirmReceive = () => {
    toast.success('Recepción completada - Inventario actualizado');
    setShowReceiveDialog(false);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Despacho</h1>
          <p className="text-slate-500">Control de salidas y retornos</p>
        </div>
        <Button 
          variant="outline"
          onClick={() => setScanning(!scanning)}
        >
          <Scan className="h-4 w-4 mr-2" />
          {scanning ? 'Cerrar Scanner' : 'Escanear'}
        </Button>
      </div>

      {/* Botones Principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Button 
          size="lg" 
          className="h-24"
          onClick={() => document.getElementById('despachar')?.scrollIntoView({ behavior: 'smooth' })}
        >
          <ArrowRight className="h-8 w-8 mr-3" />
          <div className="text-left">
            <p className="font-bold text-lg">Despachar (Salida)</p>
            <p className="text-sm opacity-70">Generar QR para chofer</p>
          </div>
        </Button>
        
        <Button 
          size="lg" 
          variant="secondary"
          className="h-24"
          onClick={() => document.getElementById('recibir')?.scrollIntoView({ behavior: 'smooth' })}
        >
          <ArrowLeft className="h-8 w-8 mr-3" />
          <div className="text-left">
            <p className="font-bold text-lg">Recibir (Retorno)</p>
            <p className="text-sm opacity-70">Lista de cotejo esperado vs real</p>
          </div>
        </Button>
      </div>

      {/* Scanner */}
      {scanning && (
        <Card className="border-2 border-dashed border-[#003366] bg-blue-50">
          <CardContent className="p-8 text-center">
            <div className="w-32 h-32 mx-auto mb-4 bg-white rounded-lg flex items-center justify-center border-2 border-[#003366]">
              <QrCode className="h-16 w-16 text-[#003366]" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              Escanea el código QR
            </h3>
            <p className="text-slate-500 mb-4">
              Acerca el código QR del chofer o supervisor
            </p>
            <div className="max-w-sm mx-auto flex gap-2">
              <Input 
                placeholder="O ingresa el código manualmente..."
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
              />
              <Button>Verificar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{readyForDispatch.length}</p>
            <p className="text-sm text-slate-500">Listas para Despacho</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-orange-600">{pendingHandshakes.length}</p>
            <p className="text-sm text-slate-500">Handshakes Pendientes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{inTransit.length}</p>
            <p className="text-sm text-slate-500">En Tránsito</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{completedHandshakes.length}</p>
            <p className="text-sm text-slate-500">Completados Hoy</p>
          </CardContent>
        </Card>
      </div>

      {/* Despachar (Salida) */}
      <div id="despachar">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Listas para Despacho</h3>
        <div className="space-y-3">
          {readyForDispatch.map((osi) => (
            <Card key={osi.id} className="border-l-4 border-l-green-500">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold text-slate-900">{osi.code}</h4>
                      <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50">
                        Lista para Despacho
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-600 mb-2">{osi.clientName}</p>
                    <div className="flex items-center gap-4 text-sm text-slate-500">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {osi.origin} → {osi.destination}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {osi.scheduledDate}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button onClick={() => handleDispatch(osi)}>
                      <Send className="h-4 w-4 mr-2" />
                      Despachar
                    </Button>
                    <Button variant="outline" size="sm">
                      <QrCode className="h-4 w-4 mr-2" />
                      Generar QR
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Recibir (Retorno) */}
      <div id="recibir">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">En Tránsito - Pendientes de Recepción</h3>
        <div className="space-y-3">
          {inTransit.map((osi) => (
            <Card key={osi.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold text-slate-900">{osi.code}</h4>
                      <Badge variant="default">En Tránsito</Badge>
                    </div>
                    <p className="text-sm text-slate-600 mb-2">{osi.clientName}</p>
                    <div className="flex items-center gap-4 text-sm text-slate-500">
                      <span className="flex items-center gap-1">
                        <Truck className="h-3 w-3" />
                        {osi.vehicles?.[0]}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {osi.destination}
                      </span>
                    </div>
                  </div>
                  <Button variant="secondary" onClick={() => handleReceive(osi)}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Recibir
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            Handshakes Pendientes
            <Badge variant="secondary" className="ml-2">{pendingHandshakes.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="history">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {pendingHandshakes.map((handshake) => (
            <PendingHandshakeCard key={handshake.id} handshake={handshake} />
          ))}
        </TabsContent>

        <TabsContent value="history">
          {completedHandshakes.map((handshake) => (
            <CompletedHandshakeCard key={handshake.id} handshake={handshake} />
          ))}
        </TabsContent>
      </Tabs>

      {/* Dialog: Despachar */}
      <Dialog open={showDispatchDialog} onOpenChange={setShowDispatchDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Confirmar Despacho
            </DialogTitle>
          </DialogHeader>
          {selectedOSI && (
            <div className="space-y-4">
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="font-medium text-blue-900">{selectedOSI.code}</p>
                <p className="text-sm text-blue-700">{selectedOSI.clientName}</p>
              </div>
              
              <div>
                <p className="font-medium text-slate-900 mb-2">Lista de Materiales:</p>
                <div className="space-y-2">
                  {materialChecklist.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm p-2 bg-slate-50 rounded">
                      <span>{item.item}</span>
                      <span className="text-slate-500">{item.expected} unidades</span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  Al confirmar, se generará un QR para que el chofer/supervisor escanee y acepte la carga.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDispatchDialog(false)}>Cancelar</Button>
            <Button onClick={confirmDispatch}>
              <QrCode className="h-4 w-4 mr-2" />
              Generar QR y Despachar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Recibir */}
      <Dialog open={showReceiveDialog} onOpenChange={setShowReceiveDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" />
              Lista de Cotejo - Recepción
            </DialogTitle>
          </DialogHeader>
          {selectedOSI && (
            <div className="space-y-4">
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="font-medium text-blue-900">{selectedOSI.code}</p>
                <p className="text-sm text-blue-700">{selectedOSI.clientName}</p>
              </div>
              
              <div>
                <p className="font-medium text-slate-900 mb-2">Verificación de Materiales:</p>
                <div className="space-y-2">
                  {materialChecklist.map((item, idx) => (
                    <div key={idx} className={`flex items-center justify-between p-3 rounded-lg ${
                      item.status === 'missing' ? 'bg-red-50 border border-red-200' : 'bg-slate-50'
                    }`}>
                      <div className="flex items-center gap-3">
                        <Checkbox 
                          checked={item.status === 'ok'}
                          disabled={item.status === 'missing'}
                        />
                        <span className="text-sm">{item.item}</span>
                      </div>
                      <div className="text-sm">
                        <span className="text-slate-500">Esperado: {item.expected}</span>
                        <span className="mx-2">|</span>
                        <span className={item.status === 'missing' ? 'text-red-600 font-medium' : 'text-green-600'}>
                          Real: {item.actual}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" className="h-auto py-3">
                  <XCircle className="h-4 w-4 mr-2 text-red-500" />
                  Marcar Perdida
                </Button>
                <Button variant="outline" className="h-auto py-3">
                  <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
                  Devuelto
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReceiveDialog(false)}>Cancelar</Button>
            <Button onClick={confirmReceive}>
              <CheckCircle className="h-4 w-4 mr-2" />
              Confirmar Recepción
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PendingHandshakeCard({ handshake }: { handshake: typeof mockHandshakes[0] }) {
  return (
    <Card className="border-l-4 border-l-orange-500">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h4 className="font-semibold text-slate-900">{handshake.code}</h4>
              <Badge variant="destructive">Pendiente</Badge>
              <Badge variant="outline">
                {handshake.type === 'pickup' ? 'Recolección' :
                 handshake.type === 'delivery' ? 'Entrega' : 'Transferencia'}
              </Badge>
            </div>
            <p className="text-sm text-slate-600 mb-2">OSI: {handshake.osiCode}</p>
            <div className="flex items-center gap-4 text-sm text-slate-500">
              <span className="flex items-center gap-1">
                <UserCheck className="h-3 w-3" />
                De: {handshake.fromUserName}
              </span>
              <ArrowRight className="h-3 w-3" />
              <span className="flex items-center gap-1">
                <UserCheck className="h-3 w-3" />
                Para: {handshake.toUserName}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="text-red-600 hover:bg-red-50">
              <XCircle className="h-4 w-4 mr-1" />
              Rechazar
            </Button>
            <Button>
              <CheckCircle className="h-4 w-4 mr-1" />
              Confirmar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CompletedHandshakeCard({ handshake }: { handshake: typeof mockHandshakes[0] }) {
  return (
    <Card className="opacity-70">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h4 className="font-semibold text-slate-900">{handshake.code}</h4>
              <Badge variant="default">Completado</Badge>
            </div>
            <p className="text-sm text-slate-600 mb-2">OSI: {handshake.osiCode}</p>
            <div className="flex items-center gap-4 text-sm text-slate-500">
              <span className="flex items-center gap-1">
                <UserCheck className="h-3 w-3" />
                {handshake.fromUserName} → {handshake.toUserName}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {handshake.completedAt && new Date(handshake.completedAt).toLocaleString()}
              </span>
            </div>
          </div>
          <CheckCircle className="h-5 w-5 text-green-500" />
        </div>
      </CardContent>
    </Card>
  );
}
