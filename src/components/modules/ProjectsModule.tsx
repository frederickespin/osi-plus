import { useEffect, useState } from 'react';
import { 
  Plus, 
  Edit,
  Trash2,
  Search,
  Calendar,
  Package,
  DollarSign,
  CheckCircle
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { getOsis, getProjects, type OsiDto, type ProjectDto } from '@/lib/api';

export function ProjectsModule() {
  const [searchTerm, setSearchTerm] = useState('');
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [osis, setOsis] = useState<OsiDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([getProjects(), getOsis()])
      .then(([projectsResponse, osisResponse]) => {
        if (!active) return;
        setProjects(projectsResponse.data);
        setOsis(osisResponse.data);
      })
      .catch(() => {
        if (!active) return;
        setProjects([]);
        setOsis([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  
  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Proyectos</h1>
          <p className="text-slate-500">Gestión de proyectos "Sombrilla"</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Proyecto
        </Button>
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
              {projects.filter(p => p.status === 'active').length}
            </p>
            <p className="text-sm text-slate-500">Activos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">
              ${projects.reduce((acc, p) => acc + p.totalValue, 0).toLocaleString()}
            </p>
            <p className="text-sm text-slate-500">Valor Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-purple-600">
              {projects.reduce((acc, p) => acc + p.osiCount, 0)}
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

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="active">Activos</TabsTrigger>
          <TabsTrigger value="completed">Completados</TabsTrigger>
          <TabsTrigger value="pending">Pendientes</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredProjects.map((project) => (
              <ProjectCard key={project.id} project={project} osis={osis} />
            ))}
            {!loading && filteredProjects.length === 0 && (
              <p className="text-sm text-slate-500 col-span-full">No se encontraron proyectos.</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="active" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredProjects.filter(p => p.status === 'active').map((project) => (
              <ProjectCard key={project.id} project={project} osis={osis} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredProjects.filter(p => p.status === 'completed').map((project) => (
              <ProjectCard key={project.id} project={project} osis={osis} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="pending" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredProjects.filter(p => p.status === 'pending').map((project) => (
              <ProjectCard key={project.id} project={project} osis={osis} />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProjectCard({ project, osis }: { project: ProjectDto; osis: OsiDto[] }) {
  const projectOSIs = osis.filter(o => o.projectId === project.id);
  const completedOSIs = projectOSIs.filter(o => o.status === 'completed').length;
  const progress = projectOSIs.length > 0 ? (completedOSIs / projectOSIs.length) * 100 : 0;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-semibold text-slate-900">{project.name}</h4>
              <Badge variant={
                project.status === 'active' ? 'default' :
                project.status === 'completed' ? 'secondary' :
                'outline'
              }>
                {project.status === 'active' ? 'Activo' :
                 project.status === 'completed' ? 'Completado' : 'Pendiente'}
              </Badge>
            </div>
            <p className="text-sm text-slate-500">{project.code}</p>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon">
              <Edit className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon">
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          </div>
        </div>
        
        <p className="text-sm text-slate-600 mb-3">{project.clientName}</p>
        
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
            <span className="font-medium">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
        
        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 text-sm">
              <Package className="h-4 w-4 text-slate-400" />
              <span>{project.osiCount} OSIs</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <DollarSign className="h-4 w-4 text-slate-400" />
              <span>${project.totalValue.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

