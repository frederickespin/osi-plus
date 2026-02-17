import { useState } from 'react';
import { 
  Plus, 
  Edit,
  Trash2,
  DollarSign
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { mockNOTAs } from '@/data/mockData';
import { formatCurrency } from '@/lib/formatters';
import { toast } from 'sonner';

// Categorías SHAB con colores distintivos
const SHAB_CATEGORIES = [
  { code: 'PA', name: 'Carpintero', description: 'Fabricación de huacales y embalajes de madera', color: 'bg-amber-100 border-amber-300 text-amber-900', badgeColor: 'bg-amber-200 text-amber-800 hover:bg-amber-300' },
  { code: 'PB', name: 'Mecánico', description: 'Recepción de tickets de avería y mantenimiento', color: 'bg-blue-100 border-blue-300 text-blue-900', badgeColor: 'bg-blue-200 text-blue-800 hover:bg-blue-300' },
  { code: 'PC', name: 'Instalador', description: 'Instalación de equipos y mobiliario', color: 'bg-emerald-100 border-emerald-300 text-emerald-900', badgeColor: 'bg-emerald-200 text-emerald-800 hover:bg-emerald-300' },
  { code: 'PD', name: 'Mantenimiento', description: 'Mantenimiento general de instalaciones', color: 'bg-slate-100 border-slate-300 text-slate-900', badgeColor: 'bg-slate-200 text-slate-800 hover:bg-slate-300' },
  { code: 'PF', name: 'Electricista', description: 'Trabajos eléctricos y conexiones', color: 'bg-purple-100 border-purple-300 text-purple-900', badgeColor: 'bg-purple-200 text-purple-800 hover:bg-purple-300' },
  { code: 'PE', name: 'Supervisor Suplente', description: 'Funciones de liderazgo en campo', color: 'bg-red-100 border-red-300 text-red-900', badgeColor: 'bg-red-200 text-red-800 hover:bg-red-300' },
  { code: 'N', name: 'Personal de Campo', description: 'Personal general de campo', color: 'bg-zinc-100 border-zinc-300 text-zinc-900', badgeColor: 'bg-zinc-200 text-zinc-800 hover:bg-zinc-300' },
  { code: 'D', name: 'Supervisor', description: 'Supervisión de operaciones', color: 'bg-orange-100 border-orange-300 text-orange-900', badgeColor: 'bg-orange-200 text-orange-800 hover:bg-orange-300' },
  { code: 'E', name: 'Chofer', description: 'Conducción de unidades', color: 'bg-yellow-100 border-yellow-300 text-yellow-900', badgeColor: 'bg-yellow-200 text-yellow-800 hover:bg-yellow-300' },
  { code: 'C1', name: 'Despachador', description: 'Control de despacho y almacén', color: 'bg-cyan-100 border-cyan-300 text-cyan-900', badgeColor: 'bg-cyan-200 text-cyan-800 hover:bg-cyan-300' },
  { code: 'G', name: 'Portero', description: 'Seguridad y control de acceso', color: 'bg-stone-100 border-stone-300 text-stone-900', badgeColor: 'bg-stone-200 text-stone-800 hover:bg-stone-300' },
  { code: 'GENERAL', name: 'General', description: 'Aplica a cualquier rol', color: 'bg-gray-100 border-gray-300 text-gray-900', badgeColor: 'bg-gray-200 text-gray-800 hover:bg-gray-300' },
];

export function BillingModule() {
  const [tarifas, setTarifas] = useState([
    { id: 'T001', concepto: 'Hora Extra Carpintería', monto: 35, unidad: 'hora', categoria: 'PA' },
    { id: 'T002', concepto: 'Hora Extra Mecánica', monto: 32, unidad: 'hora', categoria: 'PB' },
    { id: 'T003', concepto: 'Hora Extra Instalación', monto: 30, unidad: 'hora', categoria: 'PC' },
    { id: 'T004', concepto: 'Hora Extra Electricidad', monto: 38, unidad: 'hora', categoria: 'PF' },
    { id: 'T005', concepto: 'Hora Extra Supervisión', monto: 45, unidad: 'hora', categoria: 'PE' },
    { id: 'T006', concepto: 'Material Embalaje', monto: 25, unidad: 'unidad', categoria: 'PA' },
  ]);
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newTarifa, setNewTarifa] = useState({ concepto: '', monto: 0, unidad: 'hora', categoria: 'PA' });

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">NOTA Tarifas</h1>
          <p className="text-slate-500">Configuración de tarifas para NOTA</p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva Tarifa
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{tarifas.length}</p>
            <p className="text-sm text-slate-500">Tarifas Activas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{mockNOTAs.filter(n => n.status === 'paid').length}</p>
            <p className="text-sm text-slate-500">NOTAs Pagadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-orange-600">{mockNOTAs.filter(n => n.status === 'pending').length}</p>
            <p className="text-sm text-slate-500">Pendientes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">
              {formatCurrency(mockNOTAs.reduce((acc, n) => acc + n.amount, 0), "$")}
            </p>
            <p className="text-sm text-slate-500">Total Mes</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="tarifas">
        <TabsList>
          <TabsTrigger value="tarifas">Tarifas</TabsTrigger>
          <TabsTrigger value="historial">Historial NOTA</TabsTrigger>
        </TabsList>

        <TabsContent value="tarifas">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Concepto</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Monto</TableHead>
                    <TableHead>Unidad</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tarifas.map((tarifa) => (
                    <TableRow key={tarifa.id}>
                      <TableCell className="font-medium">{tarifa.concepto}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono">
                          {tarifa.categoria}
                        </Badge>
                        <span className="text-xs text-slate-500 ml-2">
                          {SHAB_CATEGORIES.find(c => c.code === tarifa.categoria)?.name || 'General'}
                        </span>
                      </TableCell>
                      <TableCell className="flex items-center gap-1">
                        <DollarSign className="h-4 w-4 text-slate-400" />
                        {formatCurrency(tarifa.monto, "$")}
                      </TableCell>
                      <TableCell className="text-slate-600">{tarifa.unidad}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon">
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



        <TabsContent value="historial">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>OSI</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Monto</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockNOTAs.map((nota) => (
                    <TableRow key={nota.id}>
                      <TableCell className="font-medium">{nota.code}</TableCell>
                      <TableCell>{nota.osiCode}</TableCell>
                      <TableCell>{nota.description}</TableCell>
                      <TableCell>{formatCurrency(nota.amount, "$")}</TableCell>
                      <TableCell>
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog: Nueva Tarifa */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva Tarifa NOTA</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Concepto</Label>
              <Input 
                value={newTarifa.concepto}
                onChange={(e) => setNewTarifa({ ...newTarifa, concepto: e.target.value })}
                placeholder="Ej: Hora Extra Carpintería"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Monto</Label>
                <Input 
                  type="number"
                  value={newTarifa.monto}
                  onChange={(e) => setNewTarifa({ ...newTarifa, monto: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Unidad</Label>
                <Select 
                  value={newTarifa.unidad}
                  onValueChange={(v) => setNewTarifa({ ...newTarifa, unidad: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hora">Hora</SelectItem>
                    <SelectItem value="dia">Día</SelectItem>
                    <SelectItem value="unidad">Unidad</SelectItem>
                    <SelectItem value="servicio">Servicio</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Categoría SHAB</Label>
              <Select 
                value={newTarifa.categoria}
                onValueChange={(v) => setNewTarifa({ ...newTarifa, categoria: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SHAB_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.code} value={cat.code}>
                      {cat.code} - {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => {
              if (!newTarifa.concepto) {
                toast.error('Ingrese un concepto');
                return;
              }
              const newId = `T${String(tarifas.length + 1).padStart(3, '0')}`;
              setTarifas([...tarifas, { ...newTarifa, id: newId }]);
              setNewTarifa({ concepto: '', monto: 0, unidad: 'hora', categoria: 'PA' });
              setIsDialogOpen(false);
              toast.success('Tarifa creada exitosamente');
            }}>
              Guardar Tarifa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
