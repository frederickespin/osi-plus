import { useState } from 'react';
import { 
  QrCode, 
  Package,
  ArrowRight,
  Plus
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { mockLocations, mockInventoryMoves } from '@/data/mockData';
import { toast } from 'sonner';
import { QRScanner, QRGenerator, QRCodeGenerators, type ParsedQRCode, getQRTypeLabel } from '@/components/qr';

export function WMSModule() {
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<typeof mockLocations[0] | null>(null);
  
  const zones = ['MAIN', 'LOCKER', 'CUARENTENA', 'TALLER'];
  
  const handleQRScan = (result: ParsedQRCode) => {
    setShowScanner(false);
    if (result.type === 'LOCATION') {
      const location = mockLocations.find(l => l.code === result.payload);
      if (location) {
        setSelectedLocation(location);
        toast.success(`Ubicación encontrada: ${location.code}`);
      } else {
        toast.warning('Ubicación no encontrada en el sistema');
      }
    } else if (result.type === 'BOX' || result.type === 'ASSET') {
      toast.success(`${getQRTypeLabel(result.type)} escaneado: ${result.payload}`);
    } else {
      toast.info(`Código escaneado: ${result.rawValue}`);
    }
  };
  
  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">WMS</h1>
          <p className="text-slate-500">Sistema de Gestión de Almacén</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => setShowScanner(true)}>
            <QrCode className="h-4 w-4 mr-2" />
            Escanear QR
          </Button>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Nueva Ubicación
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {zones.map((zone) => {
          const zoneLocations = mockLocations.filter(l => l.zone === zone);
          const totalCapacity = zoneLocations.reduce((acc, l) => acc + l.capacity, 0);
          const totalOccupied = zoneLocations.reduce((acc, l) => acc + l.occupied, 0);
          const occupancy = Math.round((totalOccupied / totalCapacity) * 100);
          
          return (
            <Card 
              key={zone} 
              className={`cursor-pointer transition-all ${selectedZone === zone ? 'ring-2 ring-blue-500' : ''}`}
              onClick={() => setSelectedZone(zone === selectedZone ? null : zone)}
            >
              <CardContent className="p-4">
                <p className="text-sm text-slate-500">Zona {zone}</p>
                <p className="text-2xl font-bold text-slate-900">{occupancy}%</p>
                <p className="text-xs text-slate-400">{zoneLocations.length} ubicaciones</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs defaultValue="map">
        <TabsList>
          <TabsTrigger value="map">Mapa Digital</TabsTrigger>
          <TabsTrigger value="moves">Movimientos</TabsTrigger>
          <TabsTrigger value="picking">Picking</TabsTrigger>
          <TabsTrigger value="qr">Generar QR</TabsTrigger>
        </TabsList>

        <TabsContent value="map">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Mapa del Almacén</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                {mockLocations.map((loc) => (
                  <div 
                    key={loc.id}
                    className={`p-3 rounded-lg text-center cursor-pointer hover:shadow-md transition-shadow ${
                      loc.zone === 'MAIN' ? 'bg-blue-50 border border-blue-200' :
                      loc.zone === 'LOCKER' ? 'bg-green-50 border border-green-200' :
                      loc.zone === 'CUARENTENA' ? 'bg-red-50 border border-red-200' :
                      'bg-orange-50 border border-orange-200'
                    } ${selectedZone && loc.zone !== selectedZone ? 'opacity-40' : ''}`}
                  >
                    <p className="text-xs font-medium text-slate-600">{loc.code.split('-').pop()}</p>
                    <p className="text-lg font-bold text-slate-900">{loc.occupied}</p>
                    <p className="text-xs text-slate-400">/ {loc.capacity}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="moves">
          <div className="space-y-3">
            {mockInventoryMoves.map((move) => (
              <Card key={move.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-slate-900">{move.itemName}</p>
                      <p className="text-sm text-slate-500">{move.quantity} {move.reason}</p>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <span>{move.fromLocation}</span>
                      <ArrowRight className="h-4 w-4" />
                      <span>{move.toLocation}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="picking">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Tareas de Picking</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Package className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">Pick #001</p>
                      <p className="text-sm text-slate-500">OSI-2024-002</p>
                    </div>
                  </div>
                  <Badge>5 items</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="qr">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {mockLocations.map((loc) => (
              <div key={loc.id} className="flex flex-col items-center">
                <QRGenerator
                  value={QRCodeGenerators.location(loc.zone, loc.code)}
                  label={loc.code}
                  size={150}
                  showDownload={true}
                  showCopy={false}
                />
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* QR Scanner Modal */}
      {showScanner && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <QRScanner
            onScan={handleQRScan}
            onClose={() => setShowScanner(false)}
            acceptedTypes={['LOCATION', 'BOX', 'ASSET']}
            title="Escanear Ubicación / Caja"
          />
        </div>
      )}
    </div>
  );
}
