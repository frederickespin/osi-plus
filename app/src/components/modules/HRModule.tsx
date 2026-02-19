import { useState } from 'react';
import { 
  Star,
  TrendingUp,
  Calendar,
  Search,
  Plus,
  Filter,
  Hammer,
  Wrench,
  Package
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { mockUsers, mockKPIRecords } from '@/data/mockData';

export function HRModule() {
  const [searchTerm, setSearchTerm] = useState('');
  
  const filteredUsers = mockUsers.filter(user =>
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">RRHH</h1>
          <p className="text-slate-500">Gestión de personal y recursos humanos</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline">
            <Filter className="h-4 w-4 mr-2" />
            Filtros
          </Button>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Empleado
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{mockUsers.length}</p>
            <p className="text-sm text-slate-500">Total Empleados</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">
              {mockUsers.filter(u => String(u.status).toUpperCase() === 'ACTIVE').length}
            </p>
            <p className="text-sm text-slate-500">Activos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">4.6</p>
            <p className="text-sm text-slate-500">Rating Promedio</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-purple-600">
              {Math.round(mockUsers.reduce((acc, u) => acc + u.points, 0) / mockUsers.length)}
            </p>
            <p className="text-sm text-slate-500">Puntos Promedio</p>
          </CardContent>
        </Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input 
          placeholder="Buscar empleado por nombre o código..."
          className="pl-10"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <Tabs defaultValue="employees">
        <TabsList>
          <TabsTrigger value="employees">Empleados</TabsTrigger>
          <TabsTrigger value="kpi">KPIs</TabsTrigger>
          <TabsTrigger value="evaluations">Evaluaciones 360°</TabsTrigger>
          <TabsTrigger value="shab">SHAB</TabsTrigger>
        </TabsList>

        <TabsContent value="employees" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredUsers.map((user) => (
              <EmployeeCard key={user.id} user={user} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="kpi">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {mockKPIRecords.map((kpi) => {
              const user = mockUsers.find(u => u.id === kpi.userId);
              return (
                <Card key={kpi.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 mb-4">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-blue-100 text-blue-700 text-sm">
                          {user?.name.split(' ').map((n: string) => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-slate-900">{user?.name}</p>
                        <p className="text-xs text-slate-500">{user?.department}</p>
                      </div>
                      <div className="ml-auto text-right">
                        <p className="text-2xl font-bold text-slate-900">{kpi.totalScore}</p>
                        <p className="text-xs text-slate-500">Score</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-500">OSIs Completadas</span>
                          <span className="font-medium">{kpi.metrics.osisCompleted}</span>
                        </div>
                        <Progress value={kpi.metrics.osisCompleted * 4} className="h-1.5" />
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-500">Puntualidad</span>
                          <span className="font-medium">{kpi.metrics.onTimeRate}%</span>
                        </div>
                        <Progress value={kpi.metrics.onTimeRate} className="h-1.5" />
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-500">Calidad</span>
                          <span className="font-medium">{kpi.metrics.qualityScore}/5</span>
                        </div>
                        <Progress value={kpi.metrics.qualityScore * 20} className="h-1.5" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="evaluations">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Evaluaciones 360°</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 bg-slate-50 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-blue-100 text-blue-700">MT</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-slate-900">Miguel Ángel</p>
                        <p className="text-xs text-slate-500">Personal de Campo</p>
                      </div>
                    </div>
                    <Badge>Período Ene 2024</Badge>
                  </div>
                  <div className="grid grid-cols-5 gap-2 text-center">
                    <div className="p-2 bg-white rounded">
                      <p className="text-lg font-bold text-slate-900">4.5</p>
                      <p className="text-xs text-slate-500">Técnico</p>
                    </div>
                    <div className="p-2 bg-white rounded">
                      <p className="text-lg font-bold text-slate-900">4.8</p>
                      <p className="text-xs text-slate-500">Equipo</p>
                    </div>
                    <div className="p-2 bg-white rounded">
                      <p className="text-lg font-bold text-slate-900">4.2</p>
                      <p className="text-xs text-slate-500">Puntualidad</p>
                    </div>
                    <div className="p-2 bg-white rounded">
                      <p className="text-lg font-bold text-slate-900">4.6</p>
                      <p className="text-xs text-slate-500">Comunicación</p>
                    </div>
                    <div className="p-2 bg-white rounded">
                      <p className="text-lg font-bold text-slate-900">4.9</p>
                      <p className="text-xs text-slate-500">Seguridad</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="shab">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Habilidades Especiales (SHAB)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-center">
                  <Hammer className="h-8 w-8 text-amber-600 mx-auto mb-2" />
                  <p className="font-semibold text-amber-900">PA</p>
                  <p className="text-sm text-amber-700">Carpintería</p>
                  <p className="text-xs text-amber-600 mt-1">2 certificados</p>
                </div>
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-center">
                  <Wrench className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                  <p className="font-semibold text-blue-900">PB</p>
                  <p className="text-sm text-blue-700">Mecánica</p>
                  <p className="text-xs text-blue-600 mt-1">1 certificado</p>
                </div>
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center">
                  <Package className="h-8 w-8 text-green-600 mx-auto mb-2" />
                  <p className="font-semibold text-green-900">PC</p>
                  <p className="text-sm text-green-700">Embalaje</p>
                  <p className="text-xs text-green-600 mt-1">5 certificados</p>
                </div>
                <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg text-center">
                  <Star className="h-8 w-8 text-purple-600 mx-auto mb-2" />
                  <p className="font-semibold text-purple-900">PF</p>
                  <p className="text-sm text-purple-700">Fragiles</p>
                  <p className="text-xs text-purple-600 mt-1">3 certificados</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmployeeCard({ user }: { user: typeof mockUsers[0] }) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <Avatar className="h-12 w-12">
            <AvatarFallback className="bg-blue-100 text-blue-700">
              {user.name.split(' ').map((n: string) => n[0]).join('')}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-slate-900">{user.name}</h4>
              <Badge variant={String(user.status).toUpperCase() === 'ACTIVE' ? 'default' : 'secondary'}>
                {String(user.status).toUpperCase() === 'ACTIVE' ? 'Activo' : 'Inactivo'}
              </Badge>
            </div>
            <p className="text-sm text-slate-500">{user.code} - {user.department}</p>
            <div className="flex items-center gap-3 mt-2">
              <Badge variant="outline">{user.role}</Badge>
              <div className="flex items-center gap-1 text-sm text-slate-600">
                <Star className="h-3 w-3 text-yellow-500" />
                {user.rating}
              </div>
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-1 text-sm text-slate-500">
                <Calendar className="h-3 w-3" />
                <span>{user.joinDate}</span>
              </div>
              <div className="flex items-center gap-1 text-sm">
                <TrendingUp className="h-3 w-3 text-green-500" />
                <span className="font-medium">{user.points} pts</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
