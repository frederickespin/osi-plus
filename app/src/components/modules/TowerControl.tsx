import { 
  Package, 
  Users, 
  Truck, 
  TrendingUp, 
  Clock, 
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Bell
} from 'lucide-react';
import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { loadOsi, setActiveOsiId } from '@/lib/hrNotaStorage';
import { loadUsers, normalizeUsers } from '@/lib/userStore';
import { formatCurrency } from '@/lib/formatters';
import { mockUsers } from '@/data/mockData';

export function TowerControl() {
  const osis = useMemo(() => loadOsi(), []);
  const storedUsers = useMemo(() => loadUsers(), []);
  const users = storedUsers.length ? storedUsers : normalizeUsers(mockUsers);
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const buildIsoFromDateAndTime = (dateYYYYMMDD: string, timeHHMM: string): string => {
    const safeTime = timeHHMM.includes(':') ? timeHHMM : `${timeHHMM.slice(0, 2)}:${timeHHMM.slice(2, 4)}`;
    const composed = `${dateYYYYMMDD}T${safeTime}:00`;
    return new Date(composed).toISOString();
  };

  const isValidDateString = (dateValue?: string) => {
    if (!dateValue) return false;
    return /^\d{4}-\d{2}-\d{2}$/.test(dateValue);
  };

  const formatMinutesAgo = (iso?: string) => {
    if (!iso) return 'Sin tracking';
    const time = new Date(iso);
    if (Number.isNaN(time.getTime())) return 'Sin tracking';
    const diffMs = Date.now() - time.getTime();
    if (diffMs < 0) return 'Ahora';
    const minutes = Math.round(diffMs / 60000);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remaining = minutes % 60;
    return `${hours}h ${remaining}m`;
  };

  const getLastTracking = (osi: any) => {
    const events = (osi.trackingEvents || osi.tracking || []) as Array<Record<string, any>>;
    if (!Array.isArray(events) || events.length === 0) return undefined;
    const sorted = [...events].sort((a, b) => {
      const at = new Date(a.timestamp || a.createdAt || a.time || '').getTime();
      const bt = new Date(b.timestamp || b.createdAt || b.time || '').getTime();
      return bt - at;
    });
    return sorted[0]?.timestamp || sorted[0]?.createdAt || sorted[0]?.time;
  };

  const projectsById = useMemo(() => {
    const map = new Map<string, { id: string; code: string; defaultStartTime: string; defaultEndTime: string }>();
    osis.forEach((osi) => {
      const projectId = osi.projectId || 'UNKNOWN';
      if (!map.has(projectId)) {
        map.set(projectId, {
          id: projectId,
          code: osi.projectCode || 'SIN-PROY',
          defaultStartTime: '09:00',
          defaultEndTime: '17:00',
        });
      }
    });
    return map;
  }, [osis]);

  const getOsiWindow = (osi: any) => {
    if (!isValidDateString(osi.scheduledDate)) return undefined;
    const project = projectsById.get(osi.projectId) || { defaultStartTime: '09:00', defaultEndTime: '17:00' };
    const scheduledStartAt =
      osi.scheduledStartAt || buildIsoFromDateAndTime(osi.scheduledDate, project.defaultStartTime ?? '09:00');
    const scheduledEndAt =
      osi.scheduledEndAt || buildIsoFromDateAndTime(osi.scheduledDate, project.defaultEndTime ?? '17:00');
    return { scheduledStartAt, scheduledEndAt, windowLabel: `${project.defaultStartTime ?? '09:00'}–${project.defaultEndTime ?? '17:00'}` };
  };

  // 1. Calculate Dashboard Stats based on real data
  const stats = useMemo(() => {
    // Active Statuses
    const activeStatuses = [
      'pending_assignment',
      'assigned',
      'in_preparation',
      'in_transit',
      'at_destination',
      'liquidation'
    ];

    const activeOSIsCount = osis.filter(o => activeStatuses.includes(o.status)).length;
    
    // Unassigned
    const unassignedCount = osis.filter(o => o.status === 'pending_assignment').length;

    // Pending Extras (Nota V2)
    // We look for notaEvents with status PENDIENTE_V
    const pendingExtrasCount = osis.flatMap(o => o.notaEvents || [])
      .filter(event => event.status === 'PENDIENTE_V').length;
    
    // Clients: No distinct storage for clients yet, so we keep placeholder "Sin datos"
    
    return [
      { 
        label: 'OSIs Activas', 
        value: activeOSIsCount, 
        icon: Package, 
        color: 'text-blue-600',
        bgColor: 'bg-blue-100',
        onClickModule: 'osi-editor',
        trend: 'En curso',
        trendUp: true
      },
      { 
        label: 'Sin Asignar', 
        value: unassignedCount, 
        icon: AlertCircle, 
        color: 'text-red-600',
        bgColor: 'bg-red-100',
        onClickModule: 'dispatch',
        trend: 'Requiere atención',
        trendUp: false
      },
      { 
        label: 'Extras NOTA Pend.', 
        value: pendingExtrasCount, 
        icon: Clock, 
        color: 'text-orange-600',
        bgColor: 'bg-orange-100',
        onClickModule: 'sales-approvals',
        trend: 'Por aprobar',
        trendUp: false
      },
      { 
        label: 'Clientes', 
        value: 'Sin datos', 
        icon: Users, 
        color: 'text-green-600',
        bgColor: 'bg-green-100',
        trend: '--',
        trendUp: true
      },
    ];
  }, [osis]);

  // 2. Recent OSIs
  const recentOSIs = useMemo(() => {
    return [...osis]
      .sort((a, b) => {
        const dateA = a.scheduledDate || a.createdAt || '';
        const dateB = b.scheduledDate || b.createdAt || '';
        return dateB.localeCompare(dateA);
      })
      .slice(0, 5);
  }, [osis]);

  // 3. Status Distribution
  const osisByStatus = useMemo(() => {
    // Map existing statuses to display colors and counts
    const statusMap: Record<string, { name: string; color: string; value: number }> = {
      'completed': { name: 'Completadas', color: '#10B981', value: 0 },
      'in_transit': { name: 'En Tránsito', color: '#3B82F6', value: 0 },
      'in_preparation': { name: 'En Preparación', color: '#EAB308', value: 0 },
      'pending_assignment': { name: 'Sin Asignar', color: '#9CA3AF', value: 0 },
      'assigned': { name: 'Asignadas', color: '#8B5CF6', value: 0 },
      'at_destination': { name: 'En Destino', color: '#F97316', value: 0 },
      'liquidation': { name: 'Liquidación', color: '#EC4899', value: 0 },
      'cancelled': { name: 'Canceladas', color: '#EF4444', value: 0 },
    };

    osis.forEach(o => {
      const s = o.status;
      if (statusMap[s]) {
        statusMap[s].value++;
      } else {
        // Fallback for draft or others
        if (!statusMap['others']) statusMap['others'] = { name: 'Otros', color: '#64748B', value: 0 };
        statusMap['others'].value++;
      }
    });

    return Object.values(statusMap).filter(item => item.value > 0);
  }, [osis]);

  // 4. Monthly Goals
  const monthMetrics = useMemo(() => {
    const now = new Date();
    const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    // OSIs scheduled for this month
    const osisThisMonth = osis.filter(o => o.scheduledDate?.startsWith(prefix));
    const completedThisMonth = osisThisMonth.filter(o => o.status === 'completed').length;
    const totalThisMonth = osisThisMonth.length || 1; // avoid division by zero
    
    const completionRate = Math.round((completedThisMonth / totalThisMonth) * 100);

    // Revenue
    const revenueThisMonth = osisThisMonth.reduce((acc, curr) => acc + (Number(curr.value) || 0), 0);

    return {
      completedCount: completedThisMonth,
      totalCount: osisThisMonth.length,
      completionRate,
      revenue: revenueThisMonth
    };
  }, [osis]);

  // 5. Notifications
  const notifications = useMemo(() => {
    const list = [];
    
    // Rule 1: Warning if there are unassigned OSIs
    const unassigned = osis.filter(o => o.status === 'pending_assignment').length;
    if (unassigned > 0) {
      list.push({
        id: 'warn-dispatch',
        title: 'OSIs Sin Asignar',
        message: `Existen ${unassigned} servicios pendientes de asignación.`,
        type: 'warning',
        actionModule: 'dispatch',
        read: false
      });
    }

    // Rule 2: Warning if there are pending Extras (V2)
    const pendingExtras = osis.flatMap(o => o.notaEvents || []).filter(e => e.status === 'PENDIENTE_V').length;
    if (pendingExtras > 0) {
      list.push({
        id: 'warn-approvals',
        title: 'Aprobaciones Pendientes',
        message: `Hay ${pendingExtras} cargos extra/nota que requieren aprobación.`,
        type: 'warning',
        actionModule: 'sales-approvals',
        read: false
      });
    }

    // Rule 3: Info about active services
    // Check for 'in_transit' or 'at_destination'
    const active = osis.filter(o => ['in_transit', 'at_destination'].includes(o.status)).length;
    if (active > 0) {
      list.push({
        id: 'info-active',
        title: 'Operación en Curso',
        message: `${active} OSIs se encuentran actualmente en ruta o destino.`,
        type: 'info',
        actionModule: 'operations', // or tracking
        read: false
      });
    }
    
    return list;
  }, [osis]);

  const liveDrivers = useMemo(() => {
    return osis
      .filter((osi) => osi.status === 'in_transit')
      .map((osi) => {
        const lastTracking = getLastTracking(osi);
        const diffMs = lastTracking ? Date.now() - new Date(lastTracking).getTime() : undefined;
        const signalLost = typeof diffMs === 'number' && diffMs > 20 * 60 * 1000;
        const driver = osi.assignedDriverId ? userMap.get(osi.assignedDriverId) : undefined;
        return {
          id: osi.id,
          osiCode: osi.code,
          driverLabel: driver?.fullName || driver?.name || osi.assignedDriverId || '—',
          lastPing: lastTracking,
          signalLost,
          status: osi.status,
        };
      });
  }, [osis, userMap]);

  const lateOsis = useMemo(() => {
    const now = Date.now();
    const candidates = osis
      .filter((osi) =>
        ['pending_assignment', 'assigned', 'in_preparation', 'in_transit'].includes(osi.status)
      )
      .map((osi) => {
      const window = getOsiWindow(osi);
      if (!window) {
        return {
          id: osi.id,
          code: osi.code,
          clientName: osi.clientName,
          status: osi.status,
          minLate: null,
          windowLabel: 'Sin hora',
        };
      }
      const start = new Date(window.scheduledStartAt).getTime();
      const end = new Date(window.scheduledEndAt).getTime();
      let minLate: number | null = null;
      if (now > start && ['pending_assignment', 'assigned', 'in_preparation'].includes(osi.status)) {
        minLate = Math.max(1, Math.round((now - start) / 60000));
      }
      if (now > end && osi.status === 'in_transit') {
        minLate = Math.max(1, Math.round((now - end) / 60000));
      }
      return {
        id: osi.id,
        code: osi.code,
        clientName: osi.clientName,
        status: osi.status,
        minLate,
        windowLabel: window.windowLabel,
      };
    });
    return candidates
      .filter((item) => item.minLate === null || item.minLate > 0)
      .sort((a, b) => {
        const aVal = a.minLate ?? -1;
        const bVal = b.minLate ?? -1;
        return bVal - aVal;
      });
  }, [osis, projectsById]);

  const materialsList = useMemo(() => {
    const priority: Record<string, number> = {
      PREPARADO: 1,
      PREPARANDO: 2,
      PENDIENTE: 3,
      RECOGIDO: 4,
    };
    return osis
      .map((osi) => ({
        id: osi.id,
        code: osi.code,
        status: osi.materialsStatus || 'PENDIENTE',
        location: osi.materialsLocation || '—',
        updatedAt: osi.materialsUpdatedAt || '—',
      }))
      .sort((a, b) => (priority[a.status] || 9) - (priority[b.status] || 9));
  }, [osis]);

  // Navigation Helper
  const navigateToModule = (moduleId: string) => {
    window.dispatchEvent(new CustomEvent('changeModule', { detail: moduleId }));
  };

  const handleOsiClick = (osiId: string) => {
    setActiveOsiId(osiId);
    navigateToModule('osi-editor');
  };

  const handleStatusFilter = (_statusName: string) => {
    // Just navigate to OSI editor for now, filtering logic would be in the list view
    navigateToModule('osi-editor');
  };

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
            {notifications.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                {notifications.length}
              </span>
            )}
          </Button>
          <Button onClick={() => navigateToModule('kpi')}>
            <TrendingUp className="h-4 w-4 mr-2" />
            Reportes
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          const isClickable = !!stat.onClickModule;
          return (
            <Card 
              key={index} 
              className={`transition-shadow ${isClickable ? 'hover:shadow-md cursor-pointer' : ''}`}
              onClick={() => isClickable && stat.onClickModule && navigateToModule(stat.onClickModule)}
            >
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
            <Button variant="ghost" size="sm" onClick={() => navigateToModule('osi-editor')}>Ver todas</Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentOSIs.map((osi) => (
                <div 
                  key={osi.id} 
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                  onClick={() => handleOsiClick(osi.id)}
                >
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
              {recentOSIs.length === 0 && (
                <div className="text-center text-slate-500 py-4">No hay OSIs recientes</div>
              )}
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
                  <span className="font-medium">{monthMetrics.completedCount} / {monthMetrics.totalCount}</span>
                </div>
                <Progress value={monthMetrics.completionRate} className="h-2" />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-500">Ingresos (Estimados)</span>
                  <span className="font-medium">{formatCurrency(monthMetrics.revenue)}</span>
                </div>
                {/* Visual bar just for effect */}
                <Progress value={75} className="h-2" />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-500">Satisfacción Cliente</span>
                  <span className="font-medium">Sin datos</span>
                </div>
                <Progress value={0} className="h-2 bg-slate-100" />
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
              <Badge variant="secondary">{notifications.length}</Badge>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {notifications.slice(0, 4).map((notif) => (
                  <div 
                    key={notif.id} 
                    className={`p-3 rounded-lg bg-blue-50 border border-blue-100 cursor-pointer hover:bg-blue-100 transition-colors`}
                    onClick={() => notif.actionModule && navigateToModule(notif.actionModule)}
                  >
                    <div className="flex items-start gap-2">
                      {notif.type === 'info' && <Clock className="h-4 w-4 text-blue-500 mt-0.5" />}
                      {notif.type === 'warning' && <AlertCircle className="h-4 w-4 text-orange-500 mt-0.5" />}
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-900">
                          {notif.title}
                        </p>
                        <p className="text-xs text-slate-500">{notif.message}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {notifications.length === 0 && (
                  <p className="text-sm text-slate-500 text-center py-2">
                    Sin notificaciones pendientes
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Operaciones en vivo */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Choferes en ruta */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Truck className="h-5 w-5 text-blue-600" />
              Choferes en ruta
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Chofer</TableHead>
                    <TableHead>OSI</TableHead>
                    <TableHead>Último ping</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {liveDrivers.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.driverLabel}</TableCell>
                      <TableCell>{row.osiCode}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>{formatMinutesAgo(row.lastPing)}</span>
                          {row.signalLost && <Badge variant="outline">Sin señal</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">En ruta</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => handleOsiClick(row.id)}>
                          Ver OSI
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {liveDrivers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-slate-500">
                        Sin choferes en ruta.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* OSIs atrasadas vs hora */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-600" />
              OSIs atrasadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>OSI</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Min tarde</TableHead>
                    <TableHead>Ventana</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lateOsis.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.code}</TableCell>
                      <TableCell>{row.clientName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.status}</Badge>
                      </TableCell>
                      <TableCell className="font-semibold text-red-600">
                        {row.minLate ?? '-'}
                      </TableCell>
                      <TableCell>{row.windowLabel}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => handleOsiClick(row.id)}>
                          Ver OSI
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {lateOsis.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-slate-500">
                        Sin atrasos detectados.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Estado de materiales */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Package className="h-5 w-5 text-emerald-600" />
              Estado de materiales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>OSI</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Ubicación</TableHead>
                    <TableHead>Actualizado</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {materialsList.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.code}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            row.status === 'PREPARADO'
                              ? 'default'
                              : row.status === 'PREPARANDO'
                                ? 'secondary'
                                : row.status === 'RECOGIDO'
                                  ? 'outline'
                                  : 'destructive'
                          }
                        >
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{row.location}</TableCell>
                      <TableCell>{row.updatedAt}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => handleOsiClick(row.id)}>
                          Ver OSI
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {materialsList.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-slate-500">
                        Sin datos de materiales.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Resumen por Estado */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">OSIs por Estado</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
            {osisByStatus.map((status, index) => (
              <div 
                key={index} 
                className="text-center p-4 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100"
                onClick={() => handleStatusFilter(status.name)}
              >
                <div 
                  className="w-12 h-12 rounded-full mx-auto mb-2 flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: status.color }}
                >
                  {status.value}
                </div>
                <p className="text-sm text-slate-600">{status.name}</p>
              </div>
            ))}
             {osisByStatus.length === 0 && (
                <div className="col-span-full text-center text-slate-500 py-4">No hay datos de estados</div>
              )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
