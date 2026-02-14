import { useMemo, useState } from 'react';
import { 
  Edit,
  Search,
  Calendar,
  Package,
  DollarSign,
  CheckCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { mockProjects, mockOSIs } from '@/data/mockData';
import { loadProjects } from '@/lib/projectsStore';
import { isAdminRole, loadSession } from '@/lib/sessionStore';

type Filter = "ALL" | "ACTIVE" | "COMPLETED" | "PENDING";
type UiProjectStatus = "active" | "completed" | "pending" | "cancelled";

function projectLabel(p: any) {
  return String(p.name ?? p.customerName ?? "").toLowerCase();
}

function projectCode(p: any) {
  return String(p.code ?? p.projectNumber ?? "").toLowerCase();
}

function normalizeProjectStatus(s: unknown): UiProjectStatus {
  const v = String(s ?? "").trim().toLowerCase();

  if (v === "active") return "active";
  if (v === "pending") return "pending";
  if (v === "completed") return "completed";
  if (v === "cancelled" || v === "canceled") return "cancelled";
  if (v === "closed") return "completed";
  if (v === "active") return "active";

  return "active";
}

export function ProjectsModule() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<Filter>("ALL");
  const session = loadSession();
  const isAdmin = isAdminRole(session.role);
  const [projects] = useState<any[]>(() => {
    const commercial = loadProjects();
    return commercial.length > 0 ? commercial : (mockProjects as any[]);
  });

  const searchedProjects = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return projects;

    return projects.filter((p: any) => {
      return projectLabel(p).includes(q) || projectCode(p).includes(q);
    });
  }, [searchTerm, projects]);

  const filteredProjects = useMemo(() => {
    if (filter === "ALL") return searchedProjects;
    return searchedProjects.filter((p) => {
      const st = normalizeProjectStatus((p as { status?: unknown }).status);
      if (filter === "ACTIVE") return st === "active";
      if (filter === "COMPLETED") return st === "completed";
      if (filter === "PENDING") return st === "pending";
      return true;
    });
  }, [searchedProjects, filter]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Proyectos</h1>
          <p className="text-slate-500">Gestión de proyectos "Sombrilla"</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{projects.length}</p>
            <p className="text-sm text-slate-500">Total Proyectos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">
              {projects.filter((p) => normalizeProjectStatus((p as { status?: unknown }).status) === "active").length}
            </p>
            <p className="text-sm text-slate-500">Activos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">
              ${projects.reduce((acc, p) => acc + Number((p as any).totalValue ?? 0), 0).toLocaleString()}
            </p>
            <p className="text-sm text-slate-500">Valor Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-purple-600">
              {projects.reduce((acc, p) => acc + Number((p as any).osiCount ?? 0), 0)}
            </p>
            <p className="text-sm text-slate-500">Total OSIs</p>
          </CardContent>
        </Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input 
          placeholder="Buscar proyecto por nombre o código..."
          className="pl-10"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <Tabs
        value={filter.toLowerCase()}
        onValueChange={(value) => setFilter(value.toUpperCase() as Filter)}
      >
        <TabsList>
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="active">Activos</TabsTrigger>
          <TabsTrigger value="completed">Completados</TabsTrigger>
          <TabsTrigger value="pending">Pendientes</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredProjects.map((project) => (
              <ProjectCard key={project.id} project={project} isAdmin={isAdmin} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="active" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredProjects.map((project) => (
              <ProjectCard key={project.id} project={project} isAdmin={isAdmin} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredProjects.map((project) => (
              <ProjectCard key={project.id} project={project} isAdmin={isAdmin} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="pending" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredProjects.map((project) => (
              <ProjectCard key={project.id} project={project} isAdmin={isAdmin} />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProjectCard({ project, isAdmin }: { project: any; isAdmin: boolean }) {
  const projectOSIs = mockOSIs.filter(o => o.projectId === project.id);
  const completedOSIs = projectOSIs.filter(o => o.status === 'completed').length;
  const progress = projectOSIs.length > 0 ? (completedOSIs / projectOSIs.length) * 100 : 0;

  const lifecycle = normalizeProjectStatus((project as { status?: unknown }).status);

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-semibold text-slate-900">{project.name ?? project.customerName}</h4>
              <Badge variant={
                lifecycle === 'active' ? 'default' :
                lifecycle === 'completed' ? 'secondary' :
                'outline'
              }>
                {lifecycle === 'active' ? 'Activo' :
                 lifecycle === 'completed' ? 'Completado' :
                 lifecycle === 'pending' ? 'Pendiente' : 'Cancelado'}
              </Badge>
            </div>
            <p className="text-sm text-slate-500">{project.code ?? project.projectNumber}</p>
          </div>
          {isAdmin && (
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => toast.message("Edición de proyecto disponible solo para Admin (pendiente de formulario).")}
                aria-label="Editar proyecto"
              >
                <Edit className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
        
        <p className="text-sm text-slate-600 mb-3">{project.clientName ?? project.customerName}</p>
        
        <div className="flex items-center gap-4 text-sm text-slate-500 mb-3">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
            {project.startDate ?? project.createdAt}
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
            <span className="font-medium">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
        
        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 text-sm">
              <Package className="h-4 w-4 text-slate-400" />
              <span>{Number(project.osiCount ?? 0)} OSIs</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <DollarSign className="h-4 w-4 text-slate-400" />
              <span>${Number(project.totalValue ?? 0).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
