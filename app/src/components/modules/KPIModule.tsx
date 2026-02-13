import { useState } from 'react';
import { 
  BarChart3, 
  TrendingUp,
  TrendingDown,
  Star,
  Users,
  Award,
  AlertTriangle,
  Calendar
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { mockKPIRecords, mockUsers } from '@/data/mockData';

export function KPIModule() {
  const [selectedPeriod, setSelectedPeriod] = useState('2024-01');

  // Calcular rankings
  const sortedKPIs = [...mockKPIRecords].sort((a, b) => b.totalScore - a.totalScore);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">KPIs y Desempeño</h1>
          <p className="text-slate-500">Análisis de rendimiento del equipo</p>
        </div>
        <div className="flex items-center gap-3">
          <select 
            className="p-2 border rounded-lg"
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
          >
            <option value="2024-01">Enero 2024</option>
            <option value="2023-12">Diciembre 2023</option>
            <option value="2023-11">Noviembre 2023</option>
          </select>
        </div>
      </div>

      {/* Stats Globales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{mockKPIRecords.length}</p>
                <p className="text-sm text-slate-500">Evaluados</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">
                  {Math.round(mockKPIRecords.reduce((acc, k) => acc + k.totalScore, 0) / mockKPIRecords.length)}
                </p>
                <p className="text-sm text-slate-500">Score Promedio</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Star className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">4.6</p>
                <p className="text-sm text-slate-500">Rating Promedio</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">2</p>
                <p className="text-sm text-slate-500">Alertas Bajo KPI</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="ranking">
        <TabsList>
          <TabsTrigger value="ranking">Ranking</TabsTrigger>
          <TabsTrigger value="metrics">Métricas Detalladas</TabsTrigger>
          <TabsTrigger value="alerts">Alertas</TabsTrigger>
        </TabsList>

        <TabsContent value="ranking" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedKPIs.map((kpi, index) => {
              const user = mockUsers.find(u => u.id === kpi.userId);
              return (
                <KPICard key={kpi.id} kpi={kpi} user={user} rank={index + 1} />
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="metrics">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Métricas por Categoría</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <MetricCard 
                  title="OSIs Completadas" 
                  value={Math.round(mockKPIRecords.reduce((acc, k) => acc + k.metrics.osisCompleted, 0) / mockKPIRecords.length)}
                  icon={Calendar}
                  trend="up"
                />
                <MetricCard 
                  title="Puntualidad" 
                  value={`${Math.round(mockKPIRecords.reduce((acc, k) => acc + k.metrics.onTimeRate, 0) / mockKPIRecords.length)}%`}
                  icon={TrendingUp}
                  trend="up"
                />
                <MetricCard 
                  title="Calidad" 
                  value={(mockKPIRecords.reduce((acc, k) => acc + k.metrics.qualityScore, 0) / mockKPIRecords.length).toFixed(1)}
                  icon={Star}
                  trend="stable"
                />
                <MetricCard 
                  title="Seguridad" 
                  value={`${Math.round(mockKPIRecords.reduce((acc, k) => acc + k.metrics.safetyScore, 0) / mockKPIRecords.length)}%`}
                  icon={Award}
                  trend="up"
                />
                <MetricCard 
                  title="Satisfacción Cliente" 
                  value={(mockKPIRecords.reduce((acc, k) => acc + k.metrics.customerRating, 0) / mockKPIRecords.length).toFixed(1)}
                  icon={Users}
                  trend="down"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                Alertas de Bajo Desempeño
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-red-900">KPI Bajo Detectado</h4>
                    <p className="text-sm text-red-700 mt-1">
                      El empleado <strong>Miguel Ángel</strong> tiene un score de 65, 
                      por debajo del mínimo requerido (75). Se recomienda revisión.
                    </p>
                    <div className="flex gap-2 mt-3">
                      <Button size="sm" variant="outline">Ver Detalles</Button>
                      <Button size="sm">Programar Reunión</Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KPICard({ kpi, user, rank }: { kpi: typeof mockKPIRecords[0]; user: any; rank: number }) {
  const getRankColor = (r: number) => {
    if (r === 1) return 'text-yellow-500';
    if (r === 2) return 'text-slate-400';
    if (r === 3) return 'text-amber-600';
    return 'text-slate-500';
  };

  return (
    <Card className={rank <= 3 ? 'border-yellow-200' : ''}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className={`text-2xl font-bold ${getRankColor(rank)}`}>
            #{rank}
          </div>
          <Avatar className="h-12 w-12">
            <AvatarFallback className="bg-blue-100 text-blue-700">
              {user?.name.split(' ').map((n: string) => n[0]).join('')}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h4 className="font-semibold text-slate-900">{user?.name}</h4>
            <p className="text-sm text-slate-500">{user?.department}</p>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline">{user?.role}</Badge>
              <div className="flex items-center gap-1 text-sm">
                <Star className="h-3 w-3 text-yellow-500" />
                {user?.rating}
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-slate-900">{kpi.totalScore}</p>
            <p className="text-xs text-slate-500">Score</p>
          </div>
        </div>
        
        <div className="mt-4 space-y-2">
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
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-500">OSIs</span>
              <span className="font-medium">{kpi.metrics.osisCompleted}</span>
            </div>
            <Progress value={kpi.metrics.osisCompleted * 4} className="h-1.5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricCard({ title, value, icon: Icon, trend }: { title: string; value: string | number; icon: React.ElementType; trend: 'up' | 'down' | 'stable' }) {
  const trendColors = {
    up: 'text-green-600',
    down: 'text-red-600',
    stable: 'text-slate-600',
  };

  const trendIcons = {
    up: TrendingUp,
    down: TrendingDown,
    stable: BarChart3,
  };

  const TrendIcon = trendIcons[trend];

  return (
    <div className="p-4 bg-slate-50 rounded-lg text-center">
      <Icon className="h-6 w-6 text-slate-400 mx-auto mb-2" />
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-sm text-slate-500">{title}</p>
      <div className={`flex items-center justify-center gap-1 mt-2 text-sm ${trendColors[trend]}`}>
        <TrendIcon className="h-4 w-4" />
        <span>{trend === 'up' ? '+5%' : trend === 'down' ? '-3%' : '0%'}</span>
      </div>
    </div>
  );
}
