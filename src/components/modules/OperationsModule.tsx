import { useEffect, useMemo, useState } from 'react';
import { 
  Plus, 
  Search, 
  Filter,
  Calendar,
  MapPin,
  Users,
  Truck,
  CheckCircle,
  Clock,
  AlertCircle,
  MoreHorizontal
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { OSI, OSIStatus } from '@/types/osi.types';
import { getOsis, type OsiDto } from '@/lib/api';

const statusColumns: { id: OSIStatus; label: string; color: string }[] = [
  { id: 'draft', label: 'Borrador', color: 'bg-gray-100' },
  { id: 'pending_assignment', label: 'Sin Asignar', color: 'bg-red-50' },
  { id: 'assigned', label: 'Asignada', color: 'bg-yellow-50' },
  { id: 'in_preparation', label: 'En Preparación', color: 'bg-blue-50' },
  { id: 'in_transit', label: 'En Tránsito', color: 'bg-purple-50' },
  { id: 'at_destination', label: 'En Destino', color: 'bg-indigo-50' },
  { id: 'completed', label: 'Completada', color: 'bg-green-50' },
  { id: 'liquidation', label: 'Liquidación', color: 'bg-orange-50' },
];

export function OperationsModule() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTab, setSelectedTab] = useState('all');
  const [osis, setOsis] = useState<OSI[]>([]);

  useEffect(() => {
    let active = true;
    getOsis().then((response) => {
      if (!active) return;
      setOsis(response.data.map(normalizeOsi));
    }).catch(() => {
      if (!active) return;
      setOsis([]);
    });
    return () => {
      active = false;
    };
  }, []);

  const filteredOSIs = useMemo(() => osis.filter(osi => {
    const matchesSearch = 
      osi.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      osi.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      osi.origin.toLowerCase().includes(searchTerm.toLowerCase()) ||
      osi.destination.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (selectedTab === 'all') return matchesSearch;
    if (selectedTab === 'active') return matchesSearch && !['completed', 'cancelled'].includes(osi.status);
    if (selectedTab === 'completed') return matchesSearch && osi.status === 'completed';
    return matchesSearch;
  }), [osis, searchTerm, selectedTab]);

  const getOSIsByStatus = (status: OSIStatus) => filteredOSIs.filter(osi => osi.status === status);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Operaciones</h1>
          <p className="text-slate-500">Gestión de OSIs y logística central</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline">
            <Filter className="h-4 w-4 mr-2" />
            Filtros
          </Button>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Nueva OSI
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-slate-900">{osis.length}</p>
            <p className="text-sm text-slate-500">Total OSIs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-blue-600">
              {osis.filter(o => !['completed', 'cancelled'].includes(o.status)).length}
            </p>
            <p className="text-sm text-slate-500">Activas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-green-600">
              {osis.filter(o => o.status === 'completed').length}
            </p>
            <p className="text-sm text-slate-500">Completadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-orange-600">
              {osis.filter(o => o.status === 'liquidation').length}
            </p>
            <p className="text-sm text-slate-500">En Liquidación</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList>
          <TabsTrigger value="all">Todas</TabsTrigger>
          <TabsTrigger value="active">Activas</TabsTrigger>
          <TabsTrigger value="completed">Completadas</TabsTrigger>
          <TabsTrigger value="kanban">Muro de Liquidación</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Buscar OSI por código, cliente, origen o destino..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* OSIs List */}
          <div className="space-y-3">
            {filteredOSIs.map((osi) => (
              <OSICard key={osi.id} osi={osi} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="active" className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Buscar OSI activa..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="space-y-3">
            {filteredOSIs.map((osi) => (
              <OSICard key={osi.id} osi={osi} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Buscar OSI completada..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="space-y-3">
            {filteredOSIs.map((osi) => (
              <OSICard key={osi.id} osi={osi} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="kanban">
          {/* Kanban Board - Muro de Liquidación */}
          <div className="overflow-x-auto">
            <div className="flex gap-4 min-w-max pb-4">
              {statusColumns.map((column) => {
                const columnOSIs = getOSIsByStatus(column.id);
                return (
                  <div key={column.id} className="w-72">
                    <div className={`p-3 rounded-t-lg ${column.color} border-b-2 border-slate-200`}>
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-slate-700">{column.label}</h3>
                        <Badge variant="secondary">{columnOSIs.length}</Badge>
                      </div>
                    </div>
                    <div className={`p-3 ${column.color} rounded-b-lg min-h-[400px] space-y-3`}>
                      {columnOSIs.map((osi) => (
                        <KanbanCard key={osi.id} osi={osi} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function normalizeOsi(osi: OsiDto): OSI {
  const allowedStatuses: OSIStatus[] = [
    'draft',
    'pending_assignment',
    'assigned',
    'in_preparation',
    'in_transit',
    'at_destination',
    'completed',
    'cancelled',
    'liquidation',
  ];

  const status = allowedStatuses.includes(osi.status as OSIStatus)
    ? (osi.status as OSIStatus)
    : 'draft';

  const type = ['local', 'national', 'international'].includes(osi.type)
    ? (osi.type as OSI['type'])
    : 'local';

  return {
    ...osi,
    status,
    type,
    assignedTo: osi.assignedTo ?? undefined,
    value: Number(osi.value || 0),
    team: Array.isArray(osi.team) ? osi.team : [],
    vehicles: Array.isArray(osi.vehicles) ? osi.vehicles : [],
    notes: osi.notes ?? undefined,
  };
}

function OSICard({ osi }: { osi: OSI }) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="font-semibold text-slate-900">{osi.code}</h3>
              <StatusBadge status={osi.status} />
              <Badge variant="outline">{osi.type}</Badge>
            </div>
            <p className="text-sm text-slate-600 mb-2">{osi.clientName}</p>
            <div className="flex items-center gap-4 text-sm text-slate-500">
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {osi.origin} → {osi.destination}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {osi.scheduledDate}
              </span>
            </div>
            {osi.assignedTo && (
              <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  Equipo asignado
                </span>
                {osi.vehicles && (
                  <span className="flex items-center gap-1">
                    <Truck className="h-3 w-3" />
                    {osi.vehicles.length} vehículo(s)
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="text-right">
            <p className="font-semibold text-slate-900">${osi.value.toLocaleString()}</p>
            <Button variant="ghost" size="icon" className="mt-2">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function KanbanCard({ osi }: { osi: OSI }) {
  return (
    <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 cursor-pointer hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-sm text-slate-900">{osi.code}</span>
        <span className="text-xs text-slate-500">{osi.scheduledDate}</span>
      </div>
      <p className="text-xs text-slate-600 mb-2 truncate">{osi.clientName}</p>
      <div className="flex items-center justify-between">
        <Badge variant="outline" className="text-xs">${osi.value.toLocaleString()}</Badge>
        {osi.status === 'completed' && <CheckCircle className="h-4 w-4 text-green-500" />}
        {osi.status === 'in_transit' && <Clock className="h-4 w-4 text-blue-500" />}
        {osi.status === 'pending_assignment' && <AlertCircle className="h-4 w-4 text-red-500" />}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: OSIStatus }) {
  const variants: Record<OSIStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    draft: { label: 'Borrador', variant: 'outline' },
    pending_assignment: { label: 'Sin Asignar', variant: 'destructive' },
    assigned: { label: 'Asignada', variant: 'secondary' },
    in_preparation: { label: 'En Prep.', variant: 'outline' },
    in_transit: { label: 'En Tránsito', variant: 'secondary' },
    at_destination: { label: 'En Destino', variant: 'default' },
    completed: { label: 'Completada', variant: 'default' },
    cancelled: { label: 'Cancelada', variant: 'destructive' },
    liquidation: { label: 'Liquidación', variant: 'outline' },
  };

  const { label, variant } = variants[status];
  return <Badge variant={variant}>{label}</Badge>;
}
