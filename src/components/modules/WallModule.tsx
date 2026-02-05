import { useState } from 'react';
import { 
  Search,
  UserCheck,
  CheckCircle,
  Clock,
  AlertCircle
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { mockOSIs } from '@/data/mockData';
import type { OSIStatus } from '@/types/osi.types';

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

export function WallModule() {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredOSIs = mockOSIs.filter(osi => {
    const matchesSearch = 
      osi.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      osi.clientName.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const getOSIsByStatus = (status: OSIStatus) => filteredOSIs.filter(osi => osi.status === status);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Muro de Liquidación</h1>
          <p className="text-slate-500">Vista Kanban de todas las OSIs</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Buscar OSI..."
              className="pl-10 w-64"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{mockOSIs.length}</p>
            <p className="text-sm text-slate-500">Total OSIs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">
              {mockOSIs.filter(o => !['completed', 'cancelled'].includes(o.status)).length}
            </p>
            <p className="text-sm text-slate-500">Activas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">
              {mockOSIs.filter(o => o.status === 'completed').length}
            </p>
            <p className="text-sm text-slate-500">Completadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-orange-600">
              {mockOSIs.filter(o => o.status === 'liquidation').length}
            </p>
            <p className="text-sm text-slate-500">En Liquidación</p>
          </CardContent>
        </Card>
      </div>

      {/* Kanban Board */}
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
    </div>
  );
}

function KanbanCard({ osi }: { osi: typeof mockOSIs[0] }) {
  return (
    <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 cursor-pointer hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-sm text-slate-900">{osi.code}</span>
        <span className="text-xs text-slate-500">{osi.scheduledDate}</span>
      </div>
      <p className="text-xs text-slate-600 mb-2 truncate">{osi.clientName}</p>
      <div className="flex items-center justify-between">
        <Badge variant="outline" className="text-xs">${osi.value.toLocaleString()}</Badge>
        <div className="flex gap-1">
          {osi.status === 'completed' && <CheckCircle className="h-4 w-4 text-green-500" />}
          {osi.status === 'in_transit' && <Clock className="h-4 w-4 text-blue-500" />}
          {osi.status === 'pending_assignment' && <AlertCircle className="h-4 w-4 text-red-500" />}
        </div>
      </div>
      {osi.assignedTo && (
        <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-1 text-xs text-slate-500">
          <UserCheck className="h-3 w-3" />
          <span>Asignada</span>
        </div>
      )}
    </div>
  );
}
