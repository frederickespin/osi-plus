import { useState } from 'react';
import { 
  Search, 
  Plus, 
  Filter
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { mockInventoryItems } from '@/data/mockData';

export function InventoryModule() {
  const [searchTerm, setSearchTerm] = useState('');
  
  const filteredItems = mockInventoryItems.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventario</h1>
          <p className="text-slate-500">Gestión de materiales y activos</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline">
            <Filter className="h-4 w-4 mr-2" />
            Filtros
          </Button>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Item
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{mockInventoryItems.length}</p>
            <p className="text-sm text-slate-500">Total Items</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">
              {mockInventoryItems.filter(i => i.status === 'available').length}
            </p>
            <p className="text-sm text-slate-500">Disponibles</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">
              {mockInventoryItems.filter(i => i.status === 'reserved').length}
            </p>
            <p className="text-sm text-slate-500">Reservados</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-orange-600">3</p>
            <p className="text-sm text-slate-500">Bajo Stock</p>
          </CardContent>
        </Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input 
          placeholder="Buscar item por nombre o código..."
          className="pl-10"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="materials">Materiales</TabsTrigger>
          <TabsTrigger value="assets">Activos</TabsTrigger>
          <TabsTrigger value="woodboxes">Cajas Madera</TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Ubicación</TableHead>
                    <TableHead>Cantidad</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.code}</TableCell>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {item.category === 'materials' ? 'Materiales' :
                           item.category === 'assets' ? 'Activos' : 'Cajas Madera'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-slate-500">{item.locationCode}</TableCell>
                      <TableCell>{item.quantity} {item.unit}</TableCell>
                      <TableCell>
                        <Badge variant={
                          item.status === 'available' ? 'default' :
                          item.status === 'reserved' ? 'secondary' :
                          item.status === 'in_use' ? 'outline' :
                          'destructive'
                        }>
                          {item.status === 'available' ? 'Disponible' :
                           item.status === 'reserved' ? 'Reservado' :
                           item.status === 'in_use' ? 'En Uso' : 'Dañado'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="materials">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Ubicación</TableHead>
                    <TableHead>Cantidad</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.filter(i => i.category === 'materials').map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.code}</TableCell>
                      <TableCell>{item.name}</TableCell>
                      <TableCell className="text-sm text-slate-500">{item.locationCode}</TableCell>
                      <TableCell>{item.quantity} {item.unit}</TableCell>
                      <TableCell>
                        <Badge variant={item.status === 'available' ? 'default' : 'secondary'}>
                          {item.status === 'available' ? 'Disponible' : 'Reservado'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assets">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Ubicación</TableHead>
                    <TableHead>Cantidad</TableHead>
                    <TableHead>OSI</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.filter(i => i.category === 'assets').map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.code}</TableCell>
                      <TableCell>{item.name}</TableCell>
                      <TableCell className="text-sm text-slate-500">{item.locationCode}</TableCell>
                      <TableCell>{item.quantity} {item.unit}</TableCell>
                      <TableCell>{item.osiId || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="woodboxes">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Ubicación</TableHead>
                    <TableHead>Cantidad</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.filter(i => i.category === 'woodboxes').map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.code}</TableCell>
                      <TableCell>{item.name}</TableCell>
                      <TableCell className="text-sm text-slate-500">{item.locationCode}</TableCell>
                      <TableCell>{item.quantity} {item.unit}</TableCell>
                      <TableCell>
                        <Badge variant={item.status === 'available' ? 'default' : 'secondary'}>
                          {item.status === 'available' ? 'Disponible' : 'En Uso'}
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
