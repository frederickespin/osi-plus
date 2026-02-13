import { useState } from 'react';
import { 
  MapPin, 
  Search, 
  Truck, 
  Clock,
  CheckCircle,
  Package,
  Navigation
  Navigation,
  RotateCcw
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { mockOSIs } from '@/data/mockData';

export function TrackingModule() {
  const [trackingCode, setTrackingCode] = useState('');
  const [showResults, setShowResults] = useState(false);
  
  const trackedOSI = mockOSIs?.[0];
  
  const trackingEvents = [
    { status: 'OSI Creada', date: '2024-01-15 08:00', completed: true },
    { status: 'Asignada a Equipo', date: '2024-01-15 09:30', completed: true },
    { status: 'En Preparación', date: '2024-01-15 10:00', completed: true },
    { status: 'En Tránsito', date: '2024-01-15 11:00', completed: true },
    { status: 'En Destino', date: '2024-01-15 14:30', completed: false },
    { status: 'Entregada', date: 'Pendiente', completed: false },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="text-center max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Rastrea tu OSI</h1>
        <p className="text-slate-500 mb-6">
          Ingresa el código de tu OSI para conocer el estado de tu mudanza en tiempo real
        </p>
        
        <div className="flex gap-2">
          <Input 
            placeholder="Ej: OSI-2024-001"
            className="flex-1 text-lg"
            value={trackingCode}
            onChange={(e) => setTrackingCode(e.target.value)}
          />
          <Button size="lg" onClick={() => setShowResults(true)}>
            <Search className="h-5 w-5 mr-2" />
            Rastrear
          </Button>
          {showResults && (
            <Button 
              size="lg" 
              variant="outline" 
              onClick={() => {
                setShowResults(false);
                setTrackingCode('');
              }}
            >
              <RotateCcw className="h-5 w-5 mr-2" />
              Reiniciar
            </Button>
          )}
        </div>
      </div>

      {showResults && trackedOSI && (
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Status Card */}
          <Card className="border-2 border-blue-200">
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-2xl font-bold text-slate-900">{trackedOSI.code}</h2>
                    <Badge variant="default" className="text-lg px-3 py-1">En Tránsito</Badge>
                  </div>
                  <p className="text-slate-600">{trackedOSI.clientName}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-500">Entrega estimada</p>
                  <p className="text-xl font-semibold text-slate-900">15 Ene, 4:30 PM</p>
                </div>
              </div>
              
              <div className="mt-6">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-500">Progreso</span>
                  <span className="font-medium">75%</span>
                </div>
                <Progress value={75} className="h-3" />
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                <div className="p-3 bg-slate-50 rounded-lg text-center">
                  <Truck className="h-5 w-5 text-slate-400 mx-auto mb-1" />
                  <p className="text-xs text-slate-500">Vehículo</p>
                  <p className="font-medium text-slate-900">VH-001</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg text-center">
                  <Package className="h-5 w-5 text-slate-400 mx-auto mb-1" />
                  <p className="text-xs text-slate-500">Items</p>
                  <p className="font-medium text-slate-900">45</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg text-center">
                  <MapPin className="h-5 w-5 text-slate-400 mx-auto mb-1" />
                  <p className="text-xs text-slate-500">Origen</p>
                  <p className="font-medium text-slate-900 truncate">Av. Arce</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg text-center">
                  <Navigation className="h-5 w-5 text-slate-400 mx-auto mb-1" />
                  <p className="text-xs text-slate-500">Destino</p>
                  <p className="font-medium text-slate-900 truncate">Calle Loayza</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Historial de Eventos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-0">
                {trackingEvents.map((event, index) => (
                  <div key={index} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        event.completed ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-400'
                      }`}>
                        {event.completed ? <CheckCircle className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
                      </div>
                      {index < trackingEvents.length - 1 && (
                        <div className={`w-0.5 h-12 ${event.completed ? 'bg-green-500' : 'bg-slate-200'}`} />
                      )}
                    </div>
                    <div className="pb-8">
                      <p className={`font-medium ${event.completed ? 'text-slate-900' : 'text-slate-400'}`}>
                        {event.status}
                      </p>
                      <p className="text-sm text-slate-500">{event.date}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Map Placeholder */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Ubicación en Tiempo Real</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 bg-slate-100 rounded-lg flex items-center justify-center">
                <div className="text-center">
                  <MapPin className="h-12 w-12 text-slate-300 mx-auto mb-2" />
                  <p className="text-slate-500">Mapa de seguimiento en tiempo real</p>
                  <p className="text-sm text-slate-400">Vehículo ubicado en: Av. Mariscal Santa Cruz</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export default TrackingModule;
