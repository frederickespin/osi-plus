import { useState } from 'react';
import { 
  Plus, 
  Edit,
  Trash2,
  DollarSign
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { mockNOTAs } from '@/data/mockData';

export function BillingModule() {
  const [tarifas] = useState([
    { id: 'T001', concepto: 'Hora Extra', monto: 25, unidad: 'hora', categoria: 'labor' },
    { id: 'T002', concepto: 'Caja de Cartón Grande', monto: 15, unidad: 'unidad', categoria: 'materials' },
    { id: 'T003', concepto: 'Plástico de Burbujas', monto: 45, unidad: 'rollo', categoria: 'materials' },
    { id: 'T004', concepto: 'Cinta Adhesiva', monto: 8, unidad: 'rollo', categoria: 'materials' },
    { id: 'T005', concepto: 'Almuerzo', monto: 35, unidad: 'persona', categoria: 'meals' },
  ]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">NOTA Tarifas</h1>
          <p className="text-slate-500">Configuración de tarifas para NOTA</p>
        </div>
        <Button>
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
              ${mockNOTAs.reduce((acc, n) => acc + n.amount, 0)}
            </p>
            <p className="text-sm text-slate-500">Total Mes</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="tarifas">
        <TabsList>
          <TabsTrigger value="tarifas">Tarifas</TabsTrigger>
          <TabsTrigger value="categorias">Categorías</TabsTrigger>
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
                        <Badge variant="outline">
                          {tarifa.categoria === 'labor' ? 'Mano de Obra' :
                           tarifa.categoria === 'materials' ? 'Materiales' :
                           tarifa.categoria === 'meals' ? 'Alimentación' : 'Otro'}
                        </Badge>
                      </TableCell>
                      <TableCell className="flex items-center gap-1">
                        <DollarSign className="h-4 w-4 text-slate-400" />
                        {tarifa.monto}
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

        <TabsContent value="categorias">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Mano de Obra</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600">Horas extras, trabajos especiales</p>
                <p className="text-2xl font-bold mt-2">{tarifas.filter(t => t.categoria === 'labor').length} tarifas</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Materiales</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600">Cajas, plástico, cinta</p>
                <p className="text-2xl font-bold mt-2">{tarifas.filter(t => t.categoria === 'materials').length} tarifas</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Alimentación</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600">Almuerzos, refrigerios</p>
                <p className="text-2xl font-bold mt-2">{tarifas.filter(t => t.categoria === 'meals').length} tarifas</p>
              </CardContent>
            </Card>
          </div>
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
                      <TableCell>${nota.amount}</TableCell>
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
    </div>
  );
}
