import { useState } from 'react';
import { 
  DollarSign,
  CheckCircle,
  XCircle,
  Calendar,
  UserCheck,
  Search
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { mockNOTAs } from '@/data/mockData';
import { toast } from 'sonner';

export function NOTAModule() {
  const [searchTerm, setSearchTerm] = useState('');
  const [showPayDialog, setShowPayDialog] = useState(false);
  const [selectedNOTA, setSelectedNOTA] = useState<any>(null);

  const filteredNOTAs = mockNOTAs.filter(nota =>
    nota.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    nota.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pendingNOTAs = filteredNOTAs.filter(n => n.status === 'pending');
  const approvedNOTAs = filteredNOTAs.filter(n => n.status === 'approved');
  const paidNOTAs = filteredNOTAs.filter(n => n.status === 'paid');

  const totalPending = pendingNOTAs.reduce((acc, n) => acc + n.amount, 0);
  const totalApproved = approvedNOTAs.reduce((acc, n) => acc + n.amount, 0);
  const totalPaid = paidNOTAs.reduce((acc, n) => acc + n.amount, 0);

  const handlePay = (nota: any) => {
    setSelectedNOTA(nota);
    setShowPayDialog(true);
  };

  const confirmPay = () => {
    toast.success(`NOTA ${selectedNOTA?.code} pagada exitosamente`);
    setShowPayDialog(false);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">NOTA - Pagos</h1>
          <p className="text-slate-500">Gestión de pagos adicionales</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{mockNOTAs.length}</p>
            <p className="text-sm text-slate-500">Total NOTAs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-orange-600">${totalPending}</p>
            <p className="text-sm text-slate-500">Pendientes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">${totalApproved}</p>
            <p className="text-sm text-slate-500">Aprobadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">${totalPaid}</p>
            <p className="text-sm text-slate-500">Pagadas</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input 
          placeholder="Buscar NOTA por código o descripción..."
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
            <Badge variant="secondary" className="ml-2">{pendingNOTAs.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="approved">Aprobadas</TabsTrigger>
          <TabsTrigger value="paid">Pagadas</TabsTrigger>
          <TabsTrigger value="all">Todas</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-3">
          {pendingNOTAs.map((nota) => (
            <NOTACard key={nota.id} nota={nota} onPay={() => handlePay(nota)} />
          ))}
        </TabsContent>

        <TabsContent value="approved" className="space-y-3">
          {approvedNOTAs.map((nota) => (
            <NOTACard key={nota.id} nota={nota} onPay={() => handlePay(nota)} />
          ))}
        </TabsContent>

        <TabsContent value="paid" className="space-y-3">
          {paidNOTAs.map((nota) => (
            <NOTACard key={nota.id} nota={nota} />
          ))}
        </TabsContent>

        <TabsContent value="all" className="space-y-3">
          {filteredNOTAs.map((nota) => (
            <NOTACard key={nota.id} nota={nota} onPay={nota.status !== 'paid' ? () => handlePay(nota) : undefined} />
          ))}
        </TabsContent>
      </Tabs>

      {/* Dialog: Pagar NOTA */}
      <Dialog open={showPayDialog} onOpenChange={setShowPayDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Procesar Pago NOTA
            </DialogTitle>
          </DialogHeader>
          {selectedNOTA && (
            <div className="space-y-4">
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="font-medium text-blue-900">{selectedNOTA.code}</p>
                <p className="text-sm text-blue-700">{selectedNOTA.osiCode}</p>
              </div>
              
              <div>
                <p className="text-sm text-slate-500">Descripción</p>
                <p className="text-slate-900">{selectedNOTA.description}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-500">Monto</p>
                  <p className="text-2xl font-bold text-slate-900">${selectedNOTA.amount}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Categoría</p>
                  <p className="text-slate-900 capitalize">{selectedNOTA.category}</p>
                </div>
              </div>
              
              <div>
                <p className="text-sm text-slate-500">Solicitado por</p>
                <p className="text-slate-900">{selectedNOTA.requestedBy}</p>
              </div>

              <div>
                <Label>Método de Pago</Label>
                <select className="w-full mt-1 p-2 border rounded-lg">
                  <option>Efectivo</option>
                  <option>Transferencia Bancaria</option>
                  <option>Billetera Móvil</option>
                </select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPayDialog(false)}>Cancelar</Button>
            <Button onClick={confirmPay} className="bg-green-600 hover:bg-green-700">
              <CheckCircle className="h-4 w-4 mr-2" />
              Confirmar Pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NOTACard({ nota, onPay }: { nota: typeof mockNOTAs[0]; onPay?: () => void }) {
  const categoryLabels: Record<string, string> = {
    materials: 'Materiales',
    labor: 'Mano de Obra',
    transport: 'Transporte',
    meals: 'Alimentación',
    accommodation: 'Alojamiento',
    other: 'Otros',
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h4 className="font-semibold text-slate-900">{nota.code}</h4>
              <Badge variant={
                nota.status === 'paid' ? 'default' :
                nota.status === 'approved' ? 'secondary' :
                nota.status === 'pending' ? 'outline' :
                'destructive'
              }>
                {nota.status === 'paid' ? 'Pagado' :
                 nota.status === 'approved' ? 'Aprobado' :
                 nota.status === 'pending' ? 'Pendiente' : 'Rechazado'}
              </Badge>
              <Badge variant="outline">{categoryLabels[nota.category]}</Badge>
            </div>
            <p className="text-sm text-slate-600">{nota.description}</p>
            <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
              <span className="flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                ${nota.amount}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {nota.createdAt}
              </span>
              <span className="flex items-center gap-1">
                <UserCheck className="h-3 w-3" />
                {nota.requestedBy}
              </span>
            </div>
            {nota.paidAt && (
              <p className="text-sm text-green-600 mt-2">
                <CheckCircle className="h-3 w-3 inline mr-1" />
                Pagado el {nota.paidAt}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {nota.status === 'pending' && (
              <>
                <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50">
                  <XCircle className="h-4 w-4 mr-1" />
                  Rechazar
                </Button>
                <Button size="sm">
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Aprobar
                </Button>
              </>
            )}
            {nota.status === 'approved' && onPay && (
              <Button size="sm" onClick={onPay} className="bg-green-600 hover:bg-green-700">
                <DollarSign className="h-4 w-4 mr-1" />
                Pagar
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
