import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Calendar, CheckCircle, Edit, FilePlus2, Paperclip, Search } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { loadProjects } from "@/lib/projectsStore";
import { loadQuotes } from "@/lib/salesStore";
import { loadBookings } from "@/lib/commercialCalendarStore";
import { loadOsi } from "@/lib/hrNotaStorage";
import { formatCurrency } from "@/lib/formatters";
import {
  createCommercialAddendum,
  listAddendaByProject,
  loadCommercialAddenda,
  updateAddendumStatus,
  type AddendumEvidence,
  type AddendumStatus,
  type CommercialAddendum,
} from "@/lib/commercialAddendumStore";
import { isAdminRole, loadSession } from "@/lib/sessionStore";

type Filter = "ALL" | "ACTIVE" | "COMPLETED" | "PENDING";
type UiProjectStatus = "active" | "completed" | "pending";

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
  addendaCount: number;
  approvedAddendaAmount: number;
};

type AddendumDraftForm = {
  detail: string;
  amount: string;
  status: AddendumStatus;
  approvedByName: string;
  approvedAtLocal: string;
  approvalComment: string;
  evidence: AddendumEvidence[];
};

function isAddendumLocked(project?: Pick<ResolvedProject, "statusRaw"> | null) {
  return project?.statusRaw === "CLOSED";
}

function normalizeProjectStatus(s: unknown): string {
  return String(s ?? "").trim().toUpperCase();
}

function projectMatchesSearch(p: ResolvedProject, q: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return p.customerName.toLowerCase().includes(needle) || p.projectNumber.toLowerCase().includes(needle);
}

function mapLifecycle(input: {
  statusRaw: string;
  bookingStatus?: string;
  osiCount: number;
  completedOsiCount: number;
}): UiProjectStatus {
  if (input.statusRaw === "CLOSED" || (input.osiCount > 0 && input.completedOsiCount === input.osiCount)) {
    return "completed";
  }
  if (input.bookingStatus === "PAUSED" || input.bookingStatus === "TENTATIVE") {
    return "pending";
  }
  if (!input.bookingStatus && input.osiCount === 0) {
    return "pending";
  }
  return "active";
}

function defaultProgress(input: {
  statusRaw: string;
  bookingStatus?: string;
  osiCount: number;
  completedOsiCount: number;
}) {
  if (input.osiCount > 0) return (input.completedOsiCount / input.osiCount) * 100;
  if (input.statusRaw === "CLOSED") return 100;
  if (input.bookingStatus === "CONFIRMED") return 35;
  if (input.bookingStatus === "TENTATIVE") return 20;
  if (input.bookingStatus === "PAUSED") return 10;
  return 5;
}

function projectCodeVariants(projectNumber: string) {
  const clean = projectNumber.trim().toUpperCase();
  if (!clean) return [];
  if (clean.startsWith("P")) return [clean, `PRJ-${clean.slice(1)}`];
  return [clean];
}

function nowLocalInputValue() {
  const d = new Date();
  const tzOffsetMs = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 16);
}

function defaultAddendumDraft(approverName: string): AddendumDraftForm {
  return {
    detail: "",
    amount: "",
    status: "PENDING_APPROVAL",
    approvedByName: approverName,
    approvedAtLocal: nowLocalInputValue(),
    approvalComment: "",
    evidence: [],
  };
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

const money = (n: number) => formatCurrency(n);

async function readFilesAsEvidence(files: File[]) {
  const toDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error(`No se pudo leer ${file.name}`));
      reader.readAsDataURL(file);
    });

  const items = await Promise.all(
    files.map(async (file) => ({
      id: crypto?.randomUUID ? crypto.randomUUID() : `ev_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      dataUrl: await toDataUrl(file),
      uploadedAt: new Date().toISOString(),
    }))
  );

  return items;
}

export function ProjectsModule() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedProject, setSelectedProject] = useState<ResolvedProject | null>(null);
  const [isAddendumOpen, setIsAddendumOpen] = useState(false);

  const session = loadSession();
  const isAdmin = isAdminRole(session.role);

  const [addendumDraft, setAddendumDraft] = useState<AddendumDraftForm>(
    defaultAddendumDraft(session.name?.trim() || `Rol ${session.role}`)
  );

  useEffect(() => {
    const tick = window.setInterval(() => setRefreshKey((prev) => prev + 1), 2000);
    return () => window.clearInterval(tick);
  }, []);

  const projects = useMemo<ResolvedProject[]>(() => {
    const storedProjects = loadProjects();
    const quotes = loadQuotes();
    const bookings = loadBookings();
    const osis = loadOsi();
    const addenda = loadCommercialAddenda();

    return storedProjects.map((project) => {
      const statusRaw = normalizeProjectStatus(project.status);
      const booking = bookings.find((b) => b.projectId === project.id || b.workNumber === project.projectNumber);
      const quote =
        quotes.find((q) => q.id === project.quoteId) ||
        quotes.find((q) => q.proposalNumber === project.projectNumber);

      const codeCandidates = new Set(projectCodeVariants(project.projectNumber));
      const relatedOsis = osis.filter((osi) => {
        const code = String(osi.projectCode ?? "").toUpperCase();
        return osi.projectId === project.id || codeCandidates.has(code);
      });
      const completedOsiCount = relatedOsis.filter((osi) => osi.status === "completed").length;

      const addendaForProject = addenda.filter(
        (item) => item.projectId === project.id || item.projectNumber === project.projectNumber
      );
      const approvedAddendaAmount = addendaForProject
        .filter((item) => item.status === "APPROVED")
        .reduce((acc, item) => acc + Number(item.amount || 0), 0);

      const lifecycle = mapLifecycle({
        statusRaw,
        bookingStatus: booking?.bookingStatus,
        osiCount: relatedOsis.length,
        completedOsiCount,
      });

      const baseTotalValue = Number(quote?.totals?.total ?? 0);
      return {
        id: project.id,
        projectNumber: project.projectNumber,
        customerName: project.customerName || "Cliente",
        lifecycle,
        statusRaw,
        startDate: booking?.startDate || project.createdAt?.slice(0, 10) || "-",
        endDate: booking?.endDate,
        osiCount: relatedOsis.length,
        completedOsiCount,
        totalValue: baseTotalValue + approvedAddendaAmount,
        addendaCount: addendaForProject.length,
        approvedAddendaAmount,
        progress: defaultProgress({
          statusRaw,
          bookingStatus: booking?.bookingStatus,
          osiCount: relatedOsis.length,
          completedOsiCount,
        }),
      };
    });
  }, [refreshKey]);

  const searchedProjects = useMemo(() => projects.filter((p) => projectMatchesSearch(p, searchTerm)), [projects, searchTerm]);

  const filteredProjects = useMemo(() => {
    if (filter === "ALL") return searchedProjects;
    if (filter === "ACTIVE") return searchedProjects.filter((p) => p.lifecycle === "active");
    if (filter === "COMPLETED") return searchedProjects.filter((p) => p.lifecycle === "completed");
    return searchedProjects.filter((p) => p.lifecycle === "pending");
  }, [filter, searchedProjects]);

  const stats = useMemo(
    () => ({
      total: projects.length,
      active: projects.filter((p) => p.lifecycle === "active").length,
      completed: projects.filter((p) => p.lifecycle === "completed").length,
      pending: projects.filter((p) => p.lifecycle === "pending").length,
    }),
    [projects]
  );

  const selectedAddenda = useMemo(() => {
    if (!selectedProject) return [];
    return listAddendaByProject(selectedProject.id, selectedProject.projectNumber);
  }, [selectedProject?.id, selectedProject?.projectNumber, refreshKey]);

  const isSelectedProjectClosed = isAddendumLocked(selectedProject);

  const openAddendumDialog = (project: ResolvedProject) => {
    if (isAddendumLocked(project)) {
      toast.error("Proyecto cerrado. Los adendums comerciales solo se gestionan antes del cierre.");
      return;
    }
    setSelectedProject(project);
    setAddendumDraft(defaultAddendumDraft(session.name?.trim() || `Rol ${session.role}`));
    setIsAddendumOpen(true);
  };

  const createAddendum = () => {
    if (!selectedProject) return;
    if (isSelectedProjectClosed) {
      toast.error("Proyecto cerrado. No se pueden registrar adendums.");
      return;
    }

    const detail = addendumDraft.detail.trim();
    const amount = Number(addendumDraft.amount || 0);

    if (!detail) {
      toast.error("Completa el detalle del servicio adicional.");
      return;
    }
    if (amount <= 0) {
      toast.error("El monto del adicional debe ser mayor que 0.");
      return;
    }
    if (addendumDraft.status === "APPROVED") {
      if (!addendumDraft.approvedByName.trim()) {
        toast.error("Indica quien aprobo el adicional.");
        return;
      }
      if (addendumDraft.evidence.length === 0) {
        toast.error("Adjunta al menos una captura o documento como comprobacion de aprobacion.");
        return;
      }
    }

    createCommercialAddendum({
      projectId: selectedProject.id,
      projectNumber: selectedProject.projectNumber,
      customerName: selectedProject.customerName,
      detail,
      amount,
      status: addendumDraft.status,
      approvedByName: addendumDraft.status === "APPROVED" ? addendumDraft.approvedByName : undefined,
      approvedAt:
        addendumDraft.status === "APPROVED" && addendumDraft.approvedAtLocal
          ? new Date(addendumDraft.approvedAtLocal).toISOString()
          : undefined,
      approvalComment: addendumDraft.approvalComment,
      evidence: addendumDraft.evidence,
    });

    setAddendumDraft(defaultAddendumDraft(session.name?.trim() || `Rol ${session.role}`));
    setRefreshKey((prev) => prev + 1);
    toast.success("Adendum registrado en el proyecto.");
  };

  const handleDraftEvidence = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    try {
      const evidence = await readFilesAsEvidence(files);
      setAddendumDraft((prev) => ({ ...prev, evidence: [...prev.evidence, ...evidence] }));
      e.currentTarget.value = "";
    } catch {
      toast.error("No se pudieron cargar los archivos de evidencia.");
    }
  };

  const removeDraftEvidence = (id: string) => {
    setAddendumDraft((prev) => ({ ...prev, evidence: prev.evidence.filter((item) => item.id !== id) }));
  };

  const approvePendingAddendum = (item: CommercialAddendum) => {
    if (isSelectedProjectClosed) {
      toast.error("Proyecto cerrado. No se pueden aprobar adendums.");
      return;
    }
    const approvedBy = window.prompt("Indica quien aprobo el adicional:", session.name?.trim() || `Rol ${session.role}`);
    if (!approvedBy) return;
    if (item.evidence.length === 0) {
      toast.error("Este adendum no tiene evidencia. Adjunta la comprobacion al crear el adendum.");
      return;
    }
    updateAddendumStatus(item.id, {
      status: "APPROVED",
      approvedByName: approvedBy,
      approvedAt: new Date().toISOString(),
    });
    setRefreshKey((prev) => prev + 1);
    toast.success("Adendum marcado como aprobado.");
  };

  const rejectPendingAddendum = (item: CommercialAddendum) => {
    if (isSelectedProjectClosed) {
      toast.error("Proyecto cerrado. No se pueden rechazar adendums.");
      return;
    }
    const reason = window.prompt("Motivo del rechazo:");
    if (reason === null) return;
    updateAddendumStatus(item.id, {
      status: "REJECTED",
      approvalComment: reason.trim() || "Rechazado",
    });
    setRefreshKey((prev) => prev + 1);
    toast.success("Adendum marcado como rechazado.");
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Proyectos</h1>
          <p className="text-slate-500">Cierre comercial, adendums y entrega al Coordinador (K)</p>
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
                <ProjectCard
                  key={project.id}
                  project={project}
                  isAdmin={isAdmin}
                  addendumLocked={isAddendumLocked(project)}
                  onOpenAddendum={() => openAddendumDialog(project)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog
        open={isAddendumOpen}
        onOpenChange={(open) => {
          setIsAddendumOpen(open);
          if (!open) setSelectedProject(null);
        }}
      >
        <DialogContent className="max-w-6xl max-h-[88vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              Adendum Comercial {selectedProject ? `- ${selectedProject.projectNumber}` : ""}
            </DialogTitle>
          </DialogHeader>

          {selectedProject && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 h-full min-h-0">
              <div className="space-y-4 overflow-y-auto pr-1">
                <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
                  <p className="text-sm font-semibold text-slate-900">{selectedProject.customerName}</p>
                  <p className="text-xs text-slate-600 mt-1">
                    Proyecto: {selectedProject.projectNumber}
                  </p>
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-semibold text-slate-900">Nuevo adendum</p>
                  <div className="space-y-1">
                    <Label>Detalle del servicio adicional</Label>
                    <Textarea
                      value={addendumDraft.detail}
                      onChange={(e) => setAddendumDraft((prev) => ({ ...prev, detail: e.target.value }))}
                      placeholder="Describe exactamente que adicional se esta solicitando."
                      disabled={isSelectedProjectClosed}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Monto adicional (RD$)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={addendumDraft.amount}
                        onChange={(e) => setAddendumDraft((prev) => ({ ...prev, amount: e.target.value }))}
                        placeholder="0.00"
                        disabled={isSelectedProjectClosed}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Estado</Label>
                      <select
                        className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                        value={addendumDraft.status}
                        disabled={isSelectedProjectClosed}
                        onChange={(e) =>
                          setAddendumDraft((prev) => ({ ...prev, status: e.target.value as AddendumStatus }))
                        }
                      >
                        <option value="PENDING_APPROVAL">Pendiente de aprobacion</option>
                        <option value="APPROVED">Aprobado</option>
                      </select>
                    </div>
                  </div>

                  {addendumDraft.status === "APPROVED" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>Aprobado por</Label>
                        <Input
                          value={addendumDraft.approvedByName}
                          onChange={(e) =>
                            setAddendumDraft((prev) => ({ ...prev, approvedByName: e.target.value }))
                          }
                          placeholder="Nombre de quien aprobo"
                          disabled={isSelectedProjectClosed}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Fecha y hora de aprobacion</Label>
                        <Input
                          type="datetime-local"
                          value={addendumDraft.approvedAtLocal}
                          onChange={(e) =>
                            setAddendumDraft((prev) => ({ ...prev, approvedAtLocal: e.target.value }))
                          }
                          disabled={isSelectedProjectClosed}
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-1">
                    <Label>Comentario / observacion</Label>
                    <Textarea
                      value={addendumDraft.approvalComment}
                      onChange={(e) =>
                        setAddendumDraft((prev) => ({ ...prev, approvalComment: e.target.value }))
                      }
                      placeholder="Notas de aprobacion o condiciones del adicional."
                      disabled={isSelectedProjectClosed}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Comprobacion (captura o documento)</Label>
                    <Input
                      type="file"
                      multiple
                      accept=".png,.jpg,.jpeg,.webp,.pdf,.doc,.docx"
                      onChange={(e) => void handleDraftEvidence(e)}
                      disabled={isSelectedProjectClosed}
                    />
                    {addendumDraft.evidence.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {addendumDraft.evidence.map((item) => (
                          <div
                            key={item.id}
                            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs"
                          >
                            <Paperclip className="h-3.5 w-3.5 text-slate-500" />
                            <span className="max-w-[190px] truncate">{item.name}</span>
                            <button
                              type="button"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => removeDraftEvidence(item.id)}
                            >
                              Quitar
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pt-2">
                    <Button onClick={createAddendum} className="w-full" disabled={isSelectedProjectClosed}>
                      <FilePlus2 className="h-4 w-4 mr-2" />
                      {isSelectedProjectClosed ? "Proyecto cerrado" : "Registrar adendum"}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-3 overflow-y-auto pr-1">
                <p className="text-sm font-semibold text-slate-900">
                  Historial de adendums ({selectedAddenda.length})
                </p>

                {selectedAddenda.length === 0 ? (
                  <Card>
                    <CardContent className="p-4 text-sm text-slate-500">
                      Aun no hay adendums para este proyecto.
                    </CardContent>
                  </Card>
                ) : (
                  selectedAddenda.map((item) => (
                    <Card key={item.id}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">Adendum #{item.id.slice(0, 8)}</p>
                            <p className="text-xs text-slate-500 mt-1">{item.detail}</p>
                          </div>
                          <Badge
                            variant={
                              item.status === "APPROVED"
                                ? "default"
                                : item.status === "REJECTED"
                                  ? "destructive"
                                  : "outline"
                            }
                          >
                            {item.status === "APPROVED"
                              ? "Aprobado"
                              : item.status === "REJECTED"
                                ? "Rechazado"
                                : "Pendiente"}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                          <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                            <p className="text-slate-500">Monto</p>
                            <p className="font-semibold text-slate-900">{money(item.amount)}</p>
                          </div>
                          <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                            <p className="text-slate-500">Solicitado por</p>
                            <p className="font-semibold text-slate-900">
                              {item.requestedByName} ({item.requestedByRole})
                            </p>
                            <p className="text-slate-500">{formatDateTime(item.requestedAt)}</p>
                          </div>
                          <div className="rounded-md border border-slate-200 bg-slate-50 p-2 md:col-span-2">
                            <p className="text-slate-500">Aprobacion</p>
                            <p className="font-semibold text-slate-900">
                              {item.approvedByName ? `${item.approvedByName}` : "Sin aprobacion registrada"}
                            </p>
                            <p className="text-slate-500">
                              {item.approvedByRole ? `Rol ${item.approvedByRole} - ` : ""}
                              {item.approvedAt ? formatDateTime(item.approvedAt) : "Pendiente"}
                            </p>
                            {item.approvalComment && <p className="text-slate-600 mt-1">{item.approvalComment}</p>}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-slate-700">Evidencia ({item.evidence.length})</p>
                          {item.evidence.length === 0 ? (
                            <p className="text-xs text-slate-500">Sin evidencia adjunta.</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {item.evidence.map((ev) => (
                                <a
                                  key={ev.id}
                                  href={ev.dataUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                                >
                                  <Paperclip className="h-3.5 w-3.5" />
                                  <span className="max-w-[190px] truncate">{ev.name}</span>
                                </a>
                              ))}
                            </div>
                          )}
                        </div>

                        {item.status === "PENDING_APPROVAL" && !isSelectedProjectClosed && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            <Button size="sm" onClick={() => approvePendingAddendum(item)}>
                              Aprobar
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => rejectPendingAddendum(item)}>
                              Rechazar
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProjectCard({
  project,
  isAdmin,
  addendumLocked,
  onOpenAddendum,
}: {
  project: ResolvedProject;
  isAdmin: boolean;
  addendumLocked: boolean;
  onOpenAddendum: () => void;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-semibold text-slate-900">{project.customerName}</h4>
              <Badge
                variant={
                  project.lifecycle === "active"
                    ? "default"
                    : project.lifecycle === "completed"
                      ? "secondary"
                      : "outline"
                }
              >
                {project.lifecycle === "active" ? "Activo" : project.lifecycle === "completed" ? "Completado" : "Pendiente"}
              </Badge>
            </div>
            <p className="text-sm text-slate-500">{project.projectNumber}</p>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenAddendum}
              disabled={addendumLocked}
              title={addendumLocked ? "Proyecto cerrado: no se permiten nuevos adendums." : undefined}
            >
              <FilePlus2 className="h-4 w-4 mr-1" />
              Adendum
            </Button>
            {isAdmin && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  toast.message("Edicion de proyecto disponible solo para Admin (pendiente de formulario).")
                }
                aria-label="Editar proyecto"
              >
                <Edit className="h-4 w-4" />
              </Button>
            )}
          </div>
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-3 border-t border-slate-100 text-xs">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-slate-700">
            <p className="text-slate-500">OSIs</p>
            <p className="font-semibold">
              {project.completedOsiCount}/{project.osiCount}
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-slate-700">
            <p className="text-slate-500">Adendums</p>
            <p className="font-semibold">{project.addendaCount}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-slate-700">
            <p className="text-slate-500">Total proyecto</p>
            <p className="font-semibold">{money(project.totalValue)}</p>
            {project.approvedAddendaAmount > 0 && (
              <p className="text-[11px] text-emerald-700">Incluye adicionales {money(project.approvedAddendaAmount)}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
