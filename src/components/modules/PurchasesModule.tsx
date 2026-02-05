import { useState } from 'react';
import { 
  Plus, 
  Search,
  Filter,
  Clock,
  DollarSign,
  Calendar
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { mockPurchaseRequests } from '@/data/mockData';
import { toast } from 'sonner';

export function PurchasesModule() {
  const [searchTerm, setSearchTerm] = useState('');
  const [showNewRequestDialog, setShowNewRequestDialog] = useState(false);

  const filteredRequests = mockPurchaseRequests.filter(req =>
    req.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    req.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pendingRequests = filteredRequests.filter(r => r.status === 'pending');
  const approvedRequests = filteredRequests.filter(r => ['approved', 'ordered'].includes(r.status));
  const receivedRequests = filteredRequests.filter(r => r.status === 'received');

  const handleNewRequest = () => {
    toast.success('Solicitud de compra creada');
    setShowNewRequestDialog(false);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Compras</h1>
          <p className="text-slate-500">Solicitudes y órdenes de compra</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline">
            <Filter className="h-4 w-4 mr-2" />
            Filtros
          </Button>
          <Button onClick={() => setShowNewRequestDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nueva Solicitud
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{mockPurchaseRequests.length}</p>
            <p className="text-sm text-slate-500">Total Solicitudes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-orange-600">{pendingRequests.length}</p>
            <p className="text-sm text-slate-500">Pendientes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{approvedRequests.length}</p>
            <p className="text-sm text-slate-500">Aprobadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{receivedRequests.length}</p>
            <p className="text-sm text-slate-500">Recibidas</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input 
          placeholder="Buscar solicitud por código o descripción..."
          className="pl-10"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            Pendientes
            <Badge variant="secondary" className="ml-2">{pendingRequests.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="approved">Aprobadas</TabsTrigger>
          <TabsTrigger value="received">Recibidas</TabsTrigger>
          <TabsTrigger value="all">Todas</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-3">
          {pendingRequests.map((req) => (
            <PurchaseCard key={req.id} request={req} />
          ))}
        </TabsContent>

        <TabsContent value="approved" className="space-y-3">
          {approvedRequests.map((req) => (
            <PurchaseCard key={req.id} request={req} />
          ))}
        </TabsContent>

        <TabsContent value="received" className="space-y-3">
          {receivedRequests.map((req) => (
            <PurchaseCard key={req.id} request={req} />
          ))}
        </TabsContent>

        <TabsContent value="all" className="space-y-3">
          {filteredRequests.map((req) => (
            <PurchaseCard key={req.id} request={req} />
          ))}
        </TabsContent>
      </Tabs>

      {/* Dialog: Nueva Solicitud */}
      <Dialog open={showNewRequestDialog} onOpenChange={setShowNewRequestDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Nueva Solicitud de Compra
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Descripción</Label>
              <Input placeholder="Ej: Cajas de cartón tamaño grande" />
            </div>
            <div>
              <Label>Categoría</Label>
              <select className="w-full mt-1 p-2 border rounded-lg">
                <option>Materiales</option>
                <option>Equipos</option>
                <option>Herramientas</option>
                <option>Repuestos</option>
                <option>Otros</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Cantidad</Label>
                <Input type="number" defaultValue={1} min={1} />
              </div>
              <div>
                <Label>Monto Estimado ($)</Label>
                <Input type="number" placeholder="0.00" />
              </div>
            </div>
            <div>
              <Label>Prioridad</Label>
              <select className="w-full mt-1 p-2 border rounded-lg">
                <option>Baja</option>
                <option>Media</option>
                <option>Alta</option>
                <option>Urgente</option>
              </select>
            </div>
            <div>
              <Label>Fecha Requerida</Label>
              <Input type="date" />
            </div>
            <div>
              <Label>Justificación</Label>
              <textarea className="w-full mt-1 p-2 border rounded-lg h-20" placeholder="Explique por qué se necesita..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewRequestDialog(false)}>Cancelar</Button>
            <Button onClick={handleNewRequest}>Enviar Solicitud</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PurchaseCard({ request }: { request: typeof mockPurchaseRequests[0] }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h4 className="font-semibold text-slate-900">{request.code}</h4>
              <Badge variant={
                request.status === 'received' ? 'default' :
                request.status === 'approved' ? 'secondary' :
                request.status === 'ordered' ? 'outline' :
                'destructive'
              }>
                {request.status === 'received' ? 'Recibido' :
                 request.status === 'approved' ? 'Aprobado' :
                 request.status === 'ordered' ? 'Ordenado' :
                 request.status === 'rejected' ? 'Rechazado' : 'Pendiente'}
              </Badge>
              <Badge variant="outline" className={
                request.priority === 'urgent' ? 'text-red-600 border-red-300' :
                request.priority === 'high' ? 'text-orange-600 border-orange-300' :
                request.priority === 'medium' ? 'text-blue-600 border-blue-300' :
                'text-slate-600'
              }>
                {request.priority === 'urgent' ? 'Urgente' :
                 request.priority === 'high' ? 'Alta' :
                 request.priority === 'medium' ? 'Media' : 'Baja'}
              </Badge>
            </div>
            <p className="text-sm text-slate-600">{request.description}</p>
            <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
              <span className="flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                ${request.amount}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {request.createdAt}
              </span>
              {request.neededBy && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Requerido: {request.neededBy}
                </span>
              )}
            </div>
          </div>
          {request.status === 'pending' && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50">
                Rechazar
              </Button>
              <Button size="sm">
                Aprobar
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
