import { useEffect, useMemo, useState } from 'react';
import { Calendar, CheckCircle, Edit, Package, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { loadProjects } from '@/lib/projectsStore';
import { loadQuotes } from '@/lib/salesStore';
import { loadBookings } from '@/lib/commercialCalendarStore';
import { loadOsi } from '@/lib/hrNotaStorage';
import { isAdminRole, loadSession } from '@/lib/sessionStore';

type Filter = 'ALL' | 'ACTIVE' | 'COMPLETED' | 'PENDING';
type UiProjectStatus = 'active' | 'completed' | 'pending';

type ResolvedProject = {
  id: string;
  projectNumber: string;
  customerName: string;
  lifecycle: UiProjectStatus;
  statusRaw: string;
  startDate: string;
  endDate?: string;
  progress: number;
  osiCount: number;
  completedOsiCount: number;
  totalValue: number;
};

function normalizeProjectStatus(s: unknown): string {
  return String(s ?? '').trim().toUpperCase();
}

function projectMatchesSearch(p: ResolvedProject, q: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return (
    p.customerName.toLowerCase().includes(needle) ||
    p.projectNumber.toLowerCase().includes(needle)
  );
}

function mapLifecycle(input: {
  statusRaw: string;
  bookingStatus?: string;
  osiCount: number;
  completedOsiCount: number;
}): UiProjectStatus {
  if (input.statusRaw === 'CLOSED' || (input.osiCount > 0 && input.completedOsiCount === input.osiCount)) {
    return 'completed';
  }
  if (input.bookingStatus === 'PAUSED' || input.bookingStatus === 'TENTATIVE') {
    return 'pending';
  }
  if (!input.bookingStatus && input.osiCount === 0) {
    return 'pending';
  }
  return 'active';
}

function defaultProgress(input: {
  statusRaw: string;
  bookingStatus?: string;
  osiCount: number;
  completedOsiCount: number;
}) {
  if (input.osiCount > 0) return (input.completedOsiCount / input.osiCount) * 100;
  if (input.statusRaw === 'CLOSED') return 100;
  if (input.bookingStatus === 'CONFIRMED') return 35;
  if (input.bookingStatus === 'TENTATIVE') return 20;
  if (input.bookingStatus === 'PAUSED') return 10;
  return 5;
}

function projectCodeVariants(projectNumber: string) {
  const clean = projectNumber.trim().toUpperCase();
  if (!clean) return [];
  if (clean.startsWith('P')) return [clean, `PRJ-${clean.slice(1)}`];
  return [clean];
}

export function ProjectsModule() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [refreshKey, setRefreshKey] = useState(0);
  const session = loadSession();
  const isAdmin = isAdminRole(session.role);

  useEffect(() => {
    const tick = window.setInterval(() => setRefreshKey((prev) => prev + 1), 2000);
    return () => window.clearInterval(tick);
  }, []);

  const projects = useMemo<ResolvedProject[]>(() => {
    const storedProjects = loadProjects();
    const quotes = loadQuotes();
    const bookings = loadBookings();
    const osis = loadOsi();

    return storedProjects.map((project) => {
      const statusRaw = normalizeProjectStatus(project.status);
      const booking = bookings.find(
        (b) => b.projectId === project.id || b.workNumber === project.projectNumber
      );
      const quote =
        quotes.find((q) => q.id === project.quoteId) ||
        quotes.find((q) => q.proposalNumber === project.projectNumber);
      const codeCandidates = new Set(projectCodeVariants(project.projectNumber));
      const relatedOsis = osis.filter((osi) => {
        const code = String(osi.projectCode ?? '').toUpperCase();
        return osi.projectId === project.id || codeCandidates.has(code);
      });
      const completedOsiCount = relatedOsis.filter((osi) => osi.status === 'completed').length;
      const lifecycle = mapLifecycle({
        statusRaw,
        bookingStatus: booking?.bookingStatus,
        osiCount: relatedOsis.length,
        completedOsiCount,
      });

      return {
        id: project.id,
        projectNumber: project.projectNumber,
        customerName: project.customerName || 'Cliente',
        lifecycle,
        statusRaw,
        startDate: booking?.startDate || project.createdAt?.slice(0, 10) || '-',
        endDate: booking?.endDate,
        osiCount: relatedOsis.length,
        completedOsiCount,
        totalValue: Number(quote?.totals?.total ?? 0),
        progress: defaultProgress({
          statusRaw,
          bookingStatus: booking?.bookingStatus,
          osiCount: relatedOsis.length,
          completedOsiCount,
        }),
      };
    });
  }, [refreshKey]);

  const searchedProjects = useMemo(() => {
    return projects.filter((p) => projectMatchesSearch(p, searchTerm));
  }, [projects, searchTerm]);

  const filteredProjects = useMemo(() => {
    if (filter === 'ALL') return searchedProjects;
    if (filter === 'ACTIVE') return searchedProjects.filter((p) => p.lifecycle === 'active');
    if (filter === 'COMPLETED') return searchedProjects.filter((p) => p.lifecycle === 'completed');
    return searchedProjects.filter((p) => p.lifecycle === 'pending');
  }, [filter, searchedProjects]);

  const stats = useMemo(() => {
    return {
      total: projects.length,
      active: projects.filter((p) => p.lifecycle === 'active').length,
      completed: projects.filter((p) => p.lifecycle === 'completed').length,
      pending: projects.filter((p) => p.lifecycle === 'pending').length,
    };
  }, [projects]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Proyectos</h1>
          <p className="text-slate-500">Cierre comercial y entrega al Coordinador (K)</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
            <p className="text-sm text-slate-500">Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">{stats.active}</p>
            <p className="text-sm text-slate-500">Activos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
            <p className="text-sm text-slate-500">Pendientes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{stats.completed}</p>
            <p className="text-sm text-slate-500">Completados</p>
          </CardContent>
        </Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Buscar proyecto por cliente o numero..."
          className="pl-10"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <Tabs value={filter.toLowerCase()} onValueChange={(value) => setFilter(value.toUpperCase() as Filter)}>
        <TabsList className="h-auto rounded-xl bg-slate-100 p-1.5">
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="active">Activos</TabsTrigger>
          <TabsTrigger value="completed">Completados</TabsTrigger>
          <TabsTrigger value="pending">Pendientes</TabsTrigger>
        </TabsList>

        <TabsContent value={filter.toLowerCase()} className="space-y-4">
          {filteredProjects.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-slate-500">
                No hay proyectos para este filtro. Cuando una propuesta se aprueba en Cotizador Técnico, aparecerá aquí.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredProjects.map((project) => (
                <ProjectCard key={project.id} project={project} isAdmin={isAdmin} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProjectCard({ project, isAdmin }: { project: ResolvedProject; isAdmin: boolean }) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-semibold text-slate-900">{project.customerName}</h4>
              <Badge
                variant={
                  project.lifecycle === 'active'
                    ? 'default'
                    : project.lifecycle === 'completed'
                    ? 'secondary'
                    : 'outline'
                }
              >
                {project.lifecycle === 'active'
                  ? 'Activo'
                  : project.lifecycle === 'completed'
                  ? 'Completado'
                  : 'Pendiente'}
              </Badge>
            </div>
            <p className="text-sm text-slate-500">{project.projectNumber}</p>
          </div>
          {isAdmin && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                toast.message('Edición de proyecto disponible solo para Admin (pendiente de formulario).')
              }
              aria-label="Editar proyecto"
            >
              <Edit className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="flex items-center gap-4 text-sm text-slate-500 mb-3">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {project.startDate}
          </span>
          {project.endDate && (
            <span className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />
              {project.endDate}
            </span>
          )}
        </div>

        <div className="mb-3">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-slate-500">Progreso</span>
            <span className="font-medium">{Math.round(project.progress)}%</span>
          </div>
          <Progress value={project.progress} className="h-2" />
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-sm">
          <div className="flex items-center gap-1 text-slate-600">
            <Package className="h-4 w-4 text-slate-400" />
            <span>
              {project.completedOsiCount}/{project.osiCount} OSIs
            </span>
          </div>
          <div className="font-semibold text-slate-700">RD$ {project.totalValue.toLocaleString()}</div>
        </div>
      </CardContent>
    </Card>
  );
}
