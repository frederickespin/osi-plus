import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Calendar,
  CheckCircle,
  Filter,
  Handshake,
  MapPin,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  Truck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createOsi, listActivePstTemplates, listPtfSuggestions, registerOsiHandshake, updateOsi, type OsiDto, type PstActiveTemplateDto, type PtfAdjustmentSuggestionDto } from "@/lib/api";
import { useOpsOsis, useOpsProjects } from "@/lib/useOpsData";
import type { OSI, OSIStatus, OpsProject, User } from "@/types/osi.types";
import { loadLeads, loadQuotes } from "@/lib/salesStore";
import { loadUsers, normalizeUsers } from "@/lib/userStore";
import { mockUsers } from "@/data/mockData";
import { setActiveOsiId } from "@/lib/hrNotaStorage";

const statusColumns: { id: OSIStatus; label: string; color: string }[] = [
  { id: "draft", label: "Borrador", color: "bg-gray-100" },
  { id: "pending_assignment", label: "Sin Asignar", color: "bg-red-50" },
  { id: "assigned", label: "Asignada", color: "bg-yellow-50" },
  { id: "in_preparation", label: "En Preparación", color: "bg-blue-50" },
  { id: "in_transit", label: "En Tránsito", color: "bg-purple-50" },
  { id: "at_destination", label: "En Destino", color: "bg-indigo-50" },
  { id: "completed", label: "Completada", color: "bg-green-50" },
  { id: "liquidation", label: "Liquidación", color: "bg-orange-50" },
];

type OsiForm = {
  id?: string;
  projectId: string;
  projectCode: string;
  clientId: string;
  clientName: string;
  kind: "EXTERNAL" | "INTERNAL";
  status: string;
  type: "local" | "national" | "international";
  origin: string;
  destination: string;
  scheduledDate: string;
  supervisorId: string;
  driverId: string;
  pstCode: string;
  ptfCode: string;
  petCode: string;
  ptfMaterialPlanText: string;
  petPlanText: string;
  ptfEditedManually: boolean;
  petEditedManually: boolean;
  teamCsv: string;
  vehiclesCsv: string;
  value: string;
  notes: string;
  startedAt: string;
  endedAt: string;
  npsScore: string;
  ecoPoints: string;
  supervisorNotes: string;
  changeReason: string;
};

function dateISO() {
  return new Date().toISOString().slice(0, 10);
}

function parseJsonSafe<T>(value: string, fallback: T): T {
  try {
    const parsed = JSON.parse(value);
    return (parsed as T) ?? fallback;
  } catch {
    return fallback;
  }
}

function toCsv(list?: string[]) {
  return Array.isArray(list) ? list.join(", ") : "";
}

function fromCsv(value: string) {
  return value.split(",").map((v) => v.trim()).filter(Boolean);
}

function toDatetimeLocal(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

function emptyForm(): OsiForm {
  return {
    projectId: "",
    projectCode: "",
    clientId: "",
    clientName: "",
    kind: "EXTERNAL",
    status: "draft",
    type: "local",
    origin: "",
    destination: "",
    scheduledDate: dateISO(),
    supervisorId: "",
    driverId: "",
    pstCode: "",
    ptfCode: "",
    petCode: "",
    ptfMaterialPlanText: JSON.stringify({ source: "EMPTY", items: [] }, null, 2),
    petPlanText: JSON.stringify({ source: "EMPTY", slots: 0, requiredRoles: [] }, null, 2),
    ptfEditedManually: false,
    petEditedManually: false,
    teamCsv: "",
    vehiclesCsv: "",
    value: "0",
    notes: "",
    startedAt: "",
    endedAt: "",
    npsScore: "",
    ecoPoints: "",
    supervisorNotes: "",
    changeReason: "",
  };
}

function formFromOsi(osi: OSI): OsiForm {
  return {
    id: osi.id,
    projectId: osi.projectId,
    projectCode: osi.projectCode,
    clientId: osi.clientId,
    clientName: osi.clientName,
    kind: (osi.kind || "EXTERNAL") as "EXTERNAL" | "INTERNAL",
    status: osi.status,
    type: osi.type,
    origin: osi.origin,
    destination: osi.destination,
    scheduledDate: osi.scheduledDate,
    supervisorId: osi.supervisorId || "",
    driverId: osi.driverId || "",
    pstCode: osi.pstCode || "",
    ptfCode: osi.ptfCode || "",
    petCode: osi.petCode || "",
    ptfMaterialPlanText: JSON.stringify(osi.ptfMaterialPlan || { source: "EMPTY", items: [] }, null, 2),
    petPlanText: JSON.stringify(osi.petPlan || { source: "EMPTY", slots: 0, requiredRoles: [] }, null, 2),
    ptfEditedManually: Boolean(osi.ptfEditedManually),
    petEditedManually: Boolean(osi.petEditedManually),
    teamCsv: toCsv(osi.team),
    vehiclesCsv: toCsv(osi.vehicles),
    value: String(osi.value || 0),
    notes: osi.notes || "",
    startedAt: toDatetimeLocal(osi.startedAt || null),
    endedAt: toDatetimeLocal(osi.endedAt || null),
    npsScore: osi.npsScore == null ? "" : String(osi.npsScore),
    ecoPoints: osi.ecoPoints == null ? "" : String(osi.ecoPoints),
    supervisorNotes: osi.supervisorNotes || "",
    changeReason: "",
  };
}

function suggestByPst(pstCode: string) {
  const code = String(pstCode || "").toUpperCase();
  if (/INT|EXPORT|IMPORT/.test(code)) {
    return {
      ptfCode: "PTF-INT-BASE",
      petCode: "PET-INT-6",
      ptfMaterialPlan: { source: "UI", items: [{ code: "BOX_EXPORT", qty: 20 }, { code: "TAPE_HEAVY", qty: 12 }] },
      petPlan: { source: "UI", slots: 6, requiredRoles: ["D", "E", "N", "N", "N", "N"] },
    };
  }
  if (/LOCAL/.test(code)) {
    return {
      ptfCode: "PTF-LOCAL-BASE",
      petCode: "PET-LOCAL-4",
      ptfMaterialPlan: { source: "UI", items: [{ code: "BOX_STD", qty: 15 }, { code: "TAPE_STD", qty: 8 }] },
      petPlan: { source: "UI", slots: 4, requiredRoles: ["D", "E", "N", "N"] },
    };
  }
  return {
    ptfCode: "",
    petCode: "",
    ptfMaterialPlan: { source: "UI", items: [] },
    petPlan: { source: "UI", slots: 0, requiredRoles: [] },
  };
}

function resolvePst(project?: OpsProject) {
  if (!project) return "";
  if (project.pstCode) return project.pstCode;
  const quotes = loadQuotes();
  if (project.quoteId) {
    const q = quotes.find((x) => x.id === project.quoteId);
    if (q?.pstCode) return q.pstCode;
  }
  const leads = loadLeads();
  if (project.leadId) {
    const l = leads.find((x) => x.id === project.leadId);
    if (l?.pstCode) return l.pstCode;
  }
  return "";
}

function deviationSummary(osi: OSI) {
  const entries = Object.entries(osi.lastMaterialDeviation || {});
  if (!entries.length) return "Sin desviaciones";
  return entries.slice(0, 3).map(([k, v]) => `${k}:${Number(v) > 0 ? "+" : ""}${Number(v)}`).join(" · ");
}

function suggestionSummary(s?: PtfAdjustmentSuggestionDto) {
  if (!s) return "Sin sugerencias";
  const entries = Object.entries(s.recommendedDelta || {});
  if (!entries.length) return "Sin delta";
  return entries.slice(0, 3).map(([k, v]) => `${k}:${Number(v) > 0 ? "+" : ""}${Number(v)}`).join(" · ");
}

export function OperationsModule() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTab, setSelectedTab] = useState("all");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState<OsiForm>(emptyForm());
  const [pstCatalog, setPstCatalog] = useState<PstActiveTemplateDto[]>([]);
  const [suggestions, setSuggestions] = useState<PtfAdjustmentSuggestionDto[]>([]);
  const [handshakingId, setHandshakingId] = useState<string | null>(null);

  const { osis: osisSource, reload: reloadOsis } = useOpsOsis();
  const { projects } = useOpsProjects();

  const usersStored = loadUsers();
  const users = useMemo<User[]>(() => (usersStored.length ? usersStored : normalizeUsers(mockUsers as User[])), [usersStored.length]);
  const supervisors = useMemo(() => users.filter((u) => u.role === "D" || u.role === "PE"), [users]);
  const drivers = useMemo(() => users.filter((u) => u.role === "E"), [users]);

  useEffect(() => {
    listActivePstTemplates().then((r) => setPstCatalog(Array.isArray(r.data) ? r.data : [])).catch(() => setPstCatalog([]));
    listPtfSuggestions().then((r) => setSuggestions(Array.isArray(r.data) ? r.data : [])).catch(() => setSuggestions([]));
  }, []);

  const suggestionsByPst = useMemo(() => {
    const map = new Map<string, PtfAdjustmentSuggestionDto[]>();
    suggestions.forEach((s) => {
      const key = String(s.pstCode || "").toUpperCase();
      if (!key) return;
      const list = map.get(key) || [];
      list.push(s);
      map.set(key, list);
    });
    return map;
  }, [suggestions]);

  const filteredOSIs = useMemo(() => osisSource.filter((osi) => {
    const matchesSearch =
      osi.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      osi.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      osi.origin.toLowerCase().includes(searchTerm.toLowerCase()) ||
      osi.destination.toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(osi.pstCode || "").toLowerCase().includes(searchTerm.toLowerCase());
    if (selectedTab === "all") return matchesSearch;
    if (selectedTab === "active") return matchesSearch && !["completed", "cancelled"].includes(osi.status);
    if (selectedTab === "completed") return matchesSearch && osi.status === "completed";
    return matchesSearch;
  }), [osisSource, searchTerm, selectedTab]);

  const getOSIsByStatus = (status: OSIStatus) => filteredOSIs.filter((osi) => osi.status === status);

  const openCreate = () => {
    setMode("create");
    setForm(emptyForm());
    setOpen(true);
  };

  const openEdit = (osi: OSI) => {
    setMode("edit");
    setForm(formFromOsi(osi));
    setOpen(true);
  };

  const updateField = <K extends keyof OsiForm>(key: K, value: OsiForm[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  const petSlotsPreview = useMemo(() => {
    const pet = parseJsonSafe<{ slots?: number; requiredRoles?: string[] }>(form.petPlanText, { slots: 0, requiredRoles: [] });
    const declared = Number(pet.slots || 0);
    const requiredRoles = Array.isArray(pet.requiredRoles) ? pet.requiredRoles : [];
    const total = Math.max(declared, requiredRoles.length);
    return Array.from({ length: total }).map((_, idx) => ({
      slot: idx + 1,
      role: requiredRoles[idx] || "N",
    }));
  }, [form.petPlanText]);

  const ptfItemsPreview = useMemo(() => {
    const parsed = parseJsonSafe<{ items?: Array<{ code?: string; qty?: number; unit?: string }> }>(
      form.ptfMaterialPlanText,
      { items: [] }
    );
    return Array.isArray(parsed.items) ? parsed.items : [];
  }, [form.ptfMaterialPlanText]);

  const selectProject = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    const pstCode = resolvePst(project);
    const suggested = suggestByPst(pstCode);
    setForm((prev) => ({
      ...prev,
      projectId: project.id,
      projectCode: project.code,
      clientId: project.clientId,
      clientName: project.clientName,
      pstCode,
      ptfCode: suggested.ptfCode,
      petCode: suggested.petCode,
      ptfMaterialPlanText: JSON.stringify(suggested.ptfMaterialPlan, null, 2),
      petPlanText: JSON.stringify(suggested.petPlan, null, 2),
    }));
  };

  const onPstChanged = (pstCode: string) => {
    const suggested = suggestByPst(pstCode);
    setForm((prev) => ({
      ...prev,
      pstCode,
      ptfCode: suggested.ptfCode,
      petCode: suggested.petCode,
      ptfMaterialPlanText: JSON.stringify(suggested.ptfMaterialPlan, null, 2),
      petPlanText: JSON.stringify(suggested.petPlan, null, 2),
      ptfEditedManually: false,
      petEditedManually: false,
    }));
  };

  const applySuggestedFromCurrentPst = () => {
    const suggested = suggestByPst(form.pstCode);
    setForm((prev) => ({
      ...prev,
      ptfCode: suggested.ptfCode,
      petCode: suggested.petCode,
      ptfMaterialPlanText: JSON.stringify(suggested.ptfMaterialPlan, null, 2),
      petPlanText: JSON.stringify(suggested.petPlan, null, 2),
      ptfEditedManually: false,
      petEditedManually: false,
    }));
    toast.success("PTF/PET sugeridos aplicados desde PST.");
  };

  const validate = () => {
    if (!form.projectId) return "Selecciona Proyecto Sombrilla.";
    if (!form.projectCode || !form.clientId || !form.clientName) return "Proyecto incompleto.";
    if (form.kind === "EXTERNAL") {
      if (!form.supervisorId) return "Supervisor (D) obligatorio.";
      if (!form.driverId) return "Chofer (E) obligatorio.";
    }
    return null;
  };

  const save = async () => {
    const err = validate();
    if (err) return toast.error(err);
    const payload: Partial<OsiDto> & { changeReason?: string } = {
      kind: form.kind,
      status: form.status,
      type: form.type,
      origin: form.origin,
      destination: form.destination,
      scheduledDate: form.scheduledDate,
      supervisorId: form.supervisorId || undefined,
      driverId: form.driverId || undefined,
      pstCode: form.pstCode || undefined,
      ptfCode: form.ptfCode || undefined,
      petCode: form.petCode || undefined,
      ptfMaterialPlan: parseJsonSafe(form.ptfMaterialPlanText, { source: "UI", items: [] }),
      petPlan: parseJsonSafe(form.petPlanText, { source: "UI", slots: 0, requiredRoles: [] }),
      ptfEditedManually: form.ptfEditedManually,
      petEditedManually: form.petEditedManually,
      team: fromCsv(form.teamCsv),
      vehicles: fromCsv(form.vehiclesCsv),
      value: Number(form.value || 0),
      notes: form.notes || undefined,
      startedAt: form.startedAt ? new Date(form.startedAt).toISOString() : undefined,
      endedAt: form.endedAt ? new Date(form.endedAt).toISOString() : undefined,
      npsScore: form.npsScore === "" ? undefined : Number(form.npsScore),
      ecoPoints: form.ecoPoints === "" ? undefined : Number(form.ecoPoints),
      supervisorNotes: form.supervisorNotes || undefined,
      changeReason: form.changeReason || undefined,
    };
    setSaving(true);
    try {
      if (mode === "create") {
        await createOsi({ code: `OSI-${Date.now()}`, projectId: form.projectId, projectCode: form.projectCode, clientId: form.clientId, clientName: form.clientName, ...payload });
        toast.success("OSI creada con PST/PTF/PET.");
      } else if (form.id) {
        await updateOsi(form.id, payload);
        toast.success("OSI actualizada con auditoría.");
      }
      await reloadOsis();
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo guardar la OSI.");
    } finally {
      setSaving(false);
    }
  };

  const handshake = async (osi: OSI) => {
    if (!osi.driverId || !osi.supervisorId) return toast.error("Define Chofer y Supervisor antes del handshake.");
    setHandshakingId(osi.id);
    try {
      await registerOsiHandshake(osi.id, { supervisorId: osi.supervisorId, driverId: osi.driverId, timestamp: new Date().toISOString() });
      toast.success("Custodia transferida a D. Chofer/vehículo liberados.");
      await reloadOsis();
    } catch (e: any) {
      toast.error(e?.message || "No se pudo registrar handshake.");
    } finally {
      setHandshakingId(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Operaciones</h1>
          <p className="text-slate-500">OSI Externa con herencia PST, PTF/PET, auditoría y handshake táctico</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline"><Filter className="h-4 w-4 mr-2" />Filtros</Button>
          <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Nueva OSI</Button>
        </div>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList>
          <TabsTrigger value="all">Todas</TabsTrigger>
          <TabsTrigger value="active">Activas</TabsTrigger>
          <TabsTrigger value="completed">Completadas</TabsTrigger>
          <TabsTrigger value="kanban">Muro de Liquidación</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input placeholder="Buscar por OSI, cliente, ruta o PST..." className="pl-10" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <div className="space-y-3">
            {filteredOSIs.map((osi) => {
              const suggestion = suggestionsByPst.get(String(osi.pstCode || "").toUpperCase())?.[0];
              return (
                <Card key={osi.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-slate-900">{osi.code}</h3>
                          <StatusBadge status={osi.status} />
                          <Badge variant="outline">{osi.type}</Badge>
                          <Badge variant={osi.pstCode ? "secondary" : "destructive"}>PST {osi.pstCode || "FALTANTE"}</Badge>
                          <Badge variant={osi.custodyStatus === "SUPERVISOR" ? "default" : "outline"}>Custodia: {osi.custodyStatus === "SUPERVISOR" ? "D" : "E"}</Badge>
                        </div>
                        <p className="text-sm text-slate-600">{osi.clientName}</p>
                        <div className="flex items-center gap-4 text-sm text-slate-500 flex-wrap">
                          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{osi.origin} → {osi.destination}</span>
                          <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{osi.scheduledDate}</span>
                          <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3" />D:{osi.supervisorId || "—"} / E:{osi.driverId || "—"}</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                          <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1">Desvío C1: {deviationSummary(osi)}</div>
                          <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1">Sugerencia PTF: {suggestionSummary(suggestion)}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-slate-900">RD$ {Number(osi.value || 0).toLocaleString()}</p>
                        <div className="flex flex-wrap justify-end gap-2 mt-2">
                          <Button variant="outline" size="sm" onClick={() => { setActiveOsiId(osi.id); window.dispatchEvent(new CustomEvent("changeModule", { detail: "osi-editor" })); }}>
                            <Users className="h-4 w-4 mr-1" />Plan NOTA
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => openEdit(osi)}>Editar</Button>
                          <Button size="sm" disabled={osi.custodyStatus === "SUPERVISOR" || handshakingId === osi.id} onClick={() => void handshake(osi)}>
                            <Handshake className="h-4 w-4 mr-1" />{handshakingId === osi.id ? "Procesando..." : osi.custodyStatus === "SUPERVISOR" ? "Handshake OK" : "Handshake E→D"}
                          </Button>
                          <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="active" className="space-y-4" />
        <TabsContent value="completed" className="space-y-4" />
        <TabsContent value="kanban">
          <div className="overflow-x-auto"><div className="flex gap-4 min-w-max pb-4">{statusColumns.map((column) => (
            <div key={column.id} className="w-72">
              <div className={`p-3 rounded-t-lg ${column.color} border-b-2 border-slate-200`}>
                <div className="flex items-center justify-between"><h3 className="font-semibold text-slate-700">{column.label}</h3><Badge variant="secondary">{getOSIsByStatus(column.id).length}</Badge></div>
              </div>
              <div className={`p-3 ${column.color} rounded-b-lg min-h-[240px] space-y-3`}>
                {getOSIsByStatus(column.id).map((osi) => (
                  <div key={osi.id} className="bg-white p-3 rounded-lg border border-slate-200">
                    <div className="flex items-center justify-between mb-1"><span className="font-medium text-sm">{osi.code}</span><span className="text-xs text-slate-500">{osi.scheduledDate}</span></div>
                    <p className="text-xs text-slate-600 truncate">{osi.clientName}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}</div></div>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[1600px] w-[min(1600px,calc(100vw-0.5rem))] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{mode === "create" ? "Nueva OSI Externa" : `Editar OSI ${form.id}`}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            <div className="space-y-4 xl:col-span-7 2xl:col-span-8">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Proyecto + PST + Roles</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    <Label>Proyecto Sombrilla</Label>
                    <Select value={form.projectId} onValueChange={selectProject}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar proyecto" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.code} · {p.clientName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1"><Label>Project Code</Label><Input value={form.projectCode} disabled /></div>
                    <div className="space-y-1"><Label>Cliente</Label><Input value={form.clientName} disabled /></div>
                    <div className="space-y-1"><Label>Origen</Label><Input value={form.origin} onChange={(e) => updateField("origin", e.target.value)} /></div>
                    <div className="space-y-1"><Label>Destino</Label><Input value={form.destination} onChange={(e) => updateField("destination", e.target.value)} /></div>
                    <div className="space-y-1"><Label>Fecha</Label><Input type="date" value={form.scheduledDate} onChange={(e) => updateField("scheduledDate", e.target.value)} /></div>
                    <div className="space-y-1">
                      <Label>Tipo</Label>
                      <Select value={form.type} onValueChange={(v) => updateField("type", v as OsiForm["type"])}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="local">Local</SelectItem>
                          <SelectItem value="national">Nacional</SelectItem>
                          <SelectItem value="international">Internacional</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Supervisor (D)</Label>
                      {supervisors.length ? (
                        <Select value={form.supervisorId} onValueChange={(v) => updateField("supervisorId", v)}>
                          <SelectTrigger><SelectValue placeholder="Seleccionar supervisor" /></SelectTrigger>
                          <SelectContent>
                            {supervisors.map((u) => (
                              <SelectItem key={u.id} value={u.id}>{u.name} ({u.role})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input value={form.supervisorId} onChange={(e) => updateField("supervisorId", e.target.value)} placeholder="ID supervisor" />
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label>Chofer (E)</Label>
                      {drivers.length ? (
                        <Select value={form.driverId} onValueChange={(v) => updateField("driverId", v)}>
                          <SelectTrigger><SelectValue placeholder="Seleccionar chofer" /></SelectTrigger>
                          <SelectContent>
                            {drivers.map((u) => (
                              <SelectItem key={u.id} value={u.id}>{u.name} ({u.role})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input value={form.driverId} onChange={(e) => updateField("driverId", e.target.value)} placeholder="ID chofer" />
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label>PST</Label>
                    <Select value={form.pstCode} onValueChange={onPstChanged}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar PST" /></SelectTrigger>
                      <SelectContent>
                        {pstCatalog.map((p) => (
                          <SelectItem key={p.versionId} value={p.serviceCode}>
                            {p.serviceName} ({p.serviceCode})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" onClick={applySuggestedFromCurrentPst} disabled={!form.pstCode}>
                      Aplicar sugerido
                    </Button>
                    <span className="text-xs text-slate-500">PTF: {form.ptfCode || "N/D"} · PET: {form.petCode || "N/D"}</span>
                  </div>
                  {!form.pstCode && <Badge variant="destructive">PST faltante: elegir manualmente antes de liberar.</Badge>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">PTF/PET + Auditoría</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1"><Label>PTF Código</Label><Input value={form.ptfCode} onChange={(e) => updateField("ptfCode", e.target.value)} /></div>
                    <div className="space-y-1"><Label>PET Código</Label><Input value={form.petCode} onChange={(e) => updateField("petCode", e.target.value)} /></div>
                    <div className="space-y-1"><Label>Equipo (CSV)</Label><Input value={form.teamCsv} onChange={(e) => updateField("teamCsv", e.target.value)} /></div>
                    <div className="space-y-1"><Label>Vehículos (CSV)</Label><Input value={form.vehiclesCsv} onChange={(e) => updateField("vehiclesCsv", e.target.value)} /></div>
                    <div className="space-y-1"><Label>Valor</Label><Input type="number" value={form.value} onChange={(e) => updateField("value", e.target.value)} /></div>
                  </div>

                  <div className="space-y-1"><Label>PTF Materiales (JSON)</Label><Textarea className="min-h-28 font-mono text-xs" value={form.ptfMaterialPlanText} onChange={(e) => { updateField("ptfMaterialPlanText", e.target.value); updateField("ptfEditedManually", true); }} /></div>
                  <div className="space-y-1"><Label>PET Plan (JSON)</Label><Textarea className="min-h-28 font-mono text-xs" value={form.petPlanText} onChange={(e) => { updateField("petPlanText", e.target.value); updateField("petEditedManually", true); }} /></div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-medium text-slate-700 mb-2">Slots PET sugeridos por PST</p>
                    <div className="flex flex-wrap gap-2">
                      {petSlotsPreview.length ? petSlotsPreview.map((slot) => (
                        <Badge key={`${slot.slot}-${slot.role}`} variant="outline">Slot {slot.slot}: {slot.role}</Badge>
                      )) : <span className="text-xs text-slate-500">Sin slots definidos.</span>}
                    </div>
                  </div>

                  <div className="space-y-1"><Label>Notas</Label><Textarea value={form.notes} onChange={(e) => updateField("notes", e.target.value)} /></div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1"><Label>Inicio real (KPI)</Label><Input type="datetime-local" value={form.startedAt} onChange={(e) => updateField("startedAt", e.target.value)} /></div>
                    <div className="space-y-1"><Label>Fin real (KPI)</Label><Input type="datetime-local" value={form.endedAt} onChange={(e) => updateField("endedAt", e.target.value)} /></div>
                    <div className="space-y-1"><Label>NPS</Label><Input type="number" min={0} max={10} value={form.npsScore} onChange={(e) => updateField("npsScore", e.target.value)} placeholder="0-10" /></div>
                    <div className="space-y-1"><Label>Puntos ecológicos</Label><Input type="number" value={form.ecoPoints} onChange={(e) => updateField("ecoPoints", e.target.value)} /></div>
                  </div>
                  <div className="space-y-1"><Label>Nota supervisor (KPI)</Label><Textarea value={form.supervisorNotes} onChange={(e) => updateField("supervisorNotes", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Motivo cambio (auditoría)</Label><Input value={form.changeReason} onChange={(e) => updateField("changeReason", e.target.value)} placeholder="Opcional, recomendado al editar PTF/PET" /></div>
                </CardContent>
              </Card>

              <div className="flex justify-end gap-2 border-t pt-4">
                <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
                <Button onClick={() => void save()} disabled={saving}>{saving ? "Guardando..." : mode === "create" ? "Crear OSI" : "Guardar cambios"}</Button>
              </div>
            </div>

            <div className="space-y-4 xl:col-span-5 2xl:col-span-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Vista previa</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={form.pstCode ? "secondary" : "destructive"}>PST {form.pstCode || "FALTANTE"}</Badge>
                    <Badge variant="outline">{form.type}</Badge>
                    <Badge variant="outline">{form.kind}</Badge>
                  </div>
                  <div className="rounded-md border border-slate-200 p-3 bg-white space-y-2">
                    <div className="text-sm font-medium text-slate-900">{form.projectCode || "Sin proyecto"} · {form.clientName || "Sin cliente"}</div>
                    <div className="text-xs text-slate-600">{form.origin || "Origen"} → {form.destination || "Destino"}</div>
                    <div className="text-xs text-slate-600">Fecha: {form.scheduledDate || "N/D"}</div>
                    <div className="text-xs text-slate-600">D: {form.supervisorId || "—"} · E: {form.driverId || "—"}</div>
                  </div>

                  <div className="rounded-md border border-slate-200 p-3 bg-slate-50 space-y-2">
                    <div className="text-xs text-slate-500">PTF sugerido</div>
                    <div className="text-sm font-medium text-slate-900">{form.ptfCode || "Sin PTF"}</div>
                    <div className="space-y-1">
                      {ptfItemsPreview.length ? ptfItemsPreview.slice(0, 6).map((item, idx) => (
                        <div key={`${item.code || idx}-${idx}`} className="text-xs text-slate-700">
                          {item.code || "ITEM"}: {Number(item.qty || 0)} {item.unit || "UND"}
                        </div>
                      )) : <div className="text-xs text-slate-500">Sin materiales cargados.</div>}
                    </div>
                  </div>

                  <div className="rounded-md border border-slate-200 p-3 bg-slate-50">
                    <div className="text-xs text-slate-500 mb-2">PET / Slots</div>
                    <div className="flex flex-wrap gap-1">
                      {petSlotsPreview.length ? petSlotsPreview.map((slot) => (
                        <Badge key={`preview-${slot.slot}-${slot.role}`} variant="outline">{slot.slot}:{slot.role}</Badge>
                      )) : <span className="text-xs text-slate-500">Sin slots definidos.</span>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ status }: { status: OSIStatus }) {
  const variants: Record<OSIStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    draft: { label: "Borrador", variant: "outline" },
    pending_assignment: { label: "Sin Asignar", variant: "destructive" },
    assigned: { label: "Asignada", variant: "secondary" },
    in_preparation: { label: "En Prep.", variant: "outline" },
    in_transit: { label: "En Tránsito", variant: "secondary" },
    at_destination: { label: "En Destino", variant: "default" },
    completed: { label: "Completada", variant: "default" },
    cancelled: { label: "Cancelada", variant: "destructive" },
    liquidation: { label: "Liquidación", variant: "outline" },
  };
  const { label, variant } = variants[status];
  return <Badge variant={variant}>{label}</Badge>;
}
