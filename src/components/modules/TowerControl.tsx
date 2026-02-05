import { 
  Package, 
  Users, 
  Truck, 
  TrendingUp, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  Star,
  ArrowUpRight,
  ArrowDownRight,
  Bell
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { mockDashboardStats, mockChartData, mockNotifications, mockOSIs } from '@/data/mockData';

export function TowerControl() {
  const stats = [
    { 
      label: 'OSIs Activas', 
      value: mockDashboardStats.activeOSIs, 
      icon: Package, 
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
      trend: '+12%',
      trendUp: true
    },
    { 
      label: 'Clientes', 
      value: mockDashboardStats.totalClients, 
      icon: Users, 
      color: 'text-green-600',
      bgColor: 'bg-green-100',
      trend: '+5%',
      trendUp: true
    },
    { 
      label: 'Vehículos Activos', 
      value: `${mockDashboardStats.fleetUtilization}%`, 
      icon: Truck, 
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
      trend: '-3%',
      trendUp: false
    },
    { 
      label: 'NPS Promedio', 
      value: mockDashboardStats.avgNPS, 
      icon: Star, 
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
      trend: '+0.3',
      trendUp: true
    },
  ];

  const recentOSIs = mockOSIs.slice(0, 5);
  const unreadNotifications = mockNotifications.filter(n => !n.read);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Torre de Control</h1>
          <p className="text-slate-500">Vista general del sistema OSi-plus</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" className="relative">
            <Bell className="h-4 w-4" />
            {unreadNotifications.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                {unreadNotifications.length}
              </span>
            )}
          </Button>
          <Button>
            <TrendingUp className="h-4 w-4 mr-2" />
            Reportes
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card key={index} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                    <Icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                  <div className={`flex items-center gap-1 text-sm ${stat.trendUp ? 'text-green-600' : 'text-red-600'}`}>
                    {stat.trendUp ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                    {stat.trend}
                  </div>
                </div>
                <div className="mt-4">
                  <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
                  <p className="text-sm text-slate-500">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* OSIs Recientes */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Package className="h-5 w-5 text-blue-600" />
              OSIs Recientes
            </CardTitle>
            <Button variant="ghost" size="sm">Ver todas</Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentOSIs.map((osi) => (
                <div key={osi.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      osi.status === 'completed' ? 'bg-green-500' :
                      osi.status === 'in_transit' ? 'bg-blue-500' :
                      osi.status === 'in_preparation' ? 'bg-yellow-500' :
                      osi.status === 'pending_assignment' ? 'bg-gray-400' :
                      'bg-purple-500'
                    }`} />
                    <div>
                      <p className="font-medium text-slate-900">{osi.code}</p>
                      <p className="text-sm text-slate-500">{osi.clientName}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant={
                      osi.status === 'completed' ? 'default' :
                      osi.status === 'in_transit' ? 'secondary' :
                      osi.status === 'in_preparation' ? 'outline' :
                      'destructive'
                    }>
                      {osi.status === 'completed' ? 'Completada' :
                       osi.status === 'in_transit' ? 'En Tránsito' :
                       osi.status === 'in_preparation' ? 'En Preparación' :
                       osi.status === 'pending_assignment' ? 'Sin Asignar' :
                       osi.status === 'liquidation' ? 'Liquidación' :
                       'Asignada'}
                    </Badge>
                    <p className="text-sm text-slate-500 mt-1">{osi.scheduledDate}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Panel Derecho */}
        <div className="space-y-6">
          {/* Progreso Mensual */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Meta Mensual</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-500">OSIs Completadas</span>
                  <span className="font-medium">128 / 150</span>
                </div>
                <Progress value={85} className="h-2" />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-500">Ingresos</span>
                  <span className="font-medium">85% de meta</span>
                </div>
                <Progress value={85} className="h-2" />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-500">Satisfacción Cliente</span>
                  <span className="font-medium">8.4 / 10</span>
                </div>
                <Progress value={84} className="h-2" />
              </div>
            </CardContent>
          </Card>

          {/* Notificaciones */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Bell className="h-5 w-5 text-orange-600" />
                Notificaciones
              </CardTitle>
              <Badge variant="secondary">{unreadNotifications.length}</Badge>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {mockNotifications.slice(0, 4).map((notif) => (
                  <div key={notif.id} className={`p-3 rounded-lg ${notif.read ? 'bg-slate-50' : 'bg-blue-50 border border-blue-100'}`}>
                    <div className="flex items-start gap-2">
                      {notif.type === 'info' && <Clock className="h-4 w-4 text-blue-500 mt-0.5" />}
                      {notif.type === 'warning' && <AlertCircle className="h-4 w-4 text-orange-500 mt-0.5" />}
                      {notif.type === 'success' && <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />}
                      {notif.type === 'error' && <AlertCircle className="h-4 w-4 text-red-500 mt-0.5" />}
                      <div className="flex-1">
                        <p className={`text-sm font-medium ${notif.read ? 'text-slate-700' : 'text-slate-900'}`}>
                          {notif.title}
                        </p>
                        <p className="text-xs text-slate-500">{notif.message}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Resumen por Estado */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">OSIs por Estado</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
            {mockChartData.osisByStatus.map((status, index) => (
              <div key={index} className="text-center p-4 bg-slate-50 rounded-lg">
                <div 
                  className="w-12 h-12 rounded-full mx-auto mb-2 flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: status.color }}
                >
                  {status.value}
                </div>
                <p className="text-sm text-slate-600">{status.name}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
