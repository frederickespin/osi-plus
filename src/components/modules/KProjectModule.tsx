import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { UserRole } from "@/types/osi.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  applyProjectPgd,
  getKProject,
  listTemplates,
  setProjectPgdItemStatus,
  setProjectReleased,
  setProjectValidated,
  updateProjectSignal,
  type ProjectPgdItemDto,
  type ProjectSignalDto,
  type SignalColor,
  type TemplateDto,
} from "@/lib/api";

function colorPill(color: SignalColor) {
  if (color === "GREEN") return <Badge className="bg-emerald-600 hover:bg-emerald-600">OK</Badge>;
  if (color === "AMBER") return <Badge className="bg-amber-500 hover:bg-amber-500">Atención</Badge>;
  return <Badge className="bg-red-600 hover:bg-red-600">Riesgo</Badge>;
}

function kindLabel(kind: string) {
  if (kind === "PAYMENT") return "Pago / Anticipo";
  if (kind === "PERMITS_PARKING") return "Permisos de Estacionamiento";
  if (kind === "CRATES") return "Huacales / Cajas";
  if (kind === "THIRD_PARTIES") return "Terceros";
  if (kind === "PGD_BLOCKING_DOCS") return "PGD (Bloqueantes)";
  return kind;
}

function policyLabel(policy: string) {
  if (policy === "HARD_BLOCK") return "HARD_BLOCK";
  if (policy === "SOFT_ALERT") return "SOFT_ALERT";
  return policy;
}

function kStateLabel(state: string) {
  if (state === "PENDING_VALIDATION") return "Pendiente Validación";
  if (state === "VALIDATED") return "Validado";
  if (state === "RELEASED") return "Liberado a Ops";
  return state;
}

type BlockInfo = {
  hardBlocks?: Array<{ kind: string; policy?: string; reason?: string; dueAt?: string | null }>;
  needsAck?: Array<{ kind: string; policy?: string; dueAt?: string | null }>;
};

export function KProjectModule({ userRole }: { userRole: UserRole }) {
  const [loading, setLoading] = useState(true);
  const [projectId, setProjectId] = useState<string>(() => localStorage.getItem("osi-plus.k.openProjectId") || "");
  const [data, setData] = useState<any>(null);
  const [pgdTemplates, setPgdTemplates] = useState<TemplateDto[]>([]);
  const [selectedPgdTemplateId, setSelectedPgdTemplateId] = useState<string>("");

  const [ackOpen, setAckOpen] = useState(false);
  const [ackSignal, setAckSignal] = useState<ProjectSignalDto | null>(null);
  const [ackNote, setAckNote] = useState("");

  const [blockOpen, setBlockOpen] = useState(false);
  const [blockInfo, setBlockInfo] = useState<BlockInfo | null>(null);

  async function load() {
    if (!projectId) {
      setLoading(false);
      setData(null);
      return;
    }
    setLoading(true);
    try {
      const r = await getKProject(projectId);
      setData(r.data);
    } catch (e: any) {
      toast.error(e?.message || "Error cargando proyecto");
    } finally {
      setLoading(false);
    }
  }

  async function loadPgdTemplates() {
    try {
      const r = await listTemplates("PGD");
      setPgdTemplates(r.data || []);
      const first = (r.data || []).find((t) => t.publishedVersionId) || (r.data || [])[0];
      if (first?.id) setSelectedPgdTemplateId(first.id);
    } catch (e: any) {
      toast.error(e?.message || "Error cargando plantillas PGD");
    }
  }

  useEffect(() => {
    void load();
    void loadPgdTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const project = data?.project || null;
  const sem = data?.semaphores || null;
  const signals: ProjectSignalDto[] = project?.signals || [];
  const pgd = project?.pgd || null;

  const signalColors = useMemo(() => {
    // The API returns computed semaphores, but for per-row signals we infer:
    // doneAt => GREEN, else dueAt passed => RED, else if warnAt passed => AMBER.
    const now = Date.now();
    const byId = new Map<string, SignalColor>();
    for (const s of signals) {
      if (s.doneAt) byId.set(s.id, "GREEN");
      else if (s.dueAt && new Date(s.dueAt).getTime() <= now) byId.set(s.id, "RED");
      else if (s.warnAt && new Date(s.warnAt).getTime() <= now) byId.set(s.id, "AMBER");
      else byId.set(s.id, "GREEN");
    }
    return byId;
  }, [signals]);

  const openAck = (s: ProjectSignalDto) => {
    setAckSignal(s);
    setAckNote(s.ackNote || "");
    setAckOpen(true);
  };

  const saveAck = async () => {
    if (!ackSignal) return;
    try {
      await updateProjectSignal({ signalId: ackSignal.id, ack: true, ackNote });
      toast.success("Riesgo reconocido (ack).");
      setAckOpen(false);
      setAckSignal(null);
      setAckNote("");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "No se pudo guardar ack");
    }
  };

  const toggleDone = async (s: ProjectSignalDto) => {
    try {
      await updateProjectSignal({ signalId: s.id, done: !Boolean(s.doneAt) });
      await load();
    } catch (e: any) {
      toast.error(e?.message || "No se pudo actualizar señal");
    }
  };

  const applyPgd = async () => {
    if (!selectedPgdTemplateId) return toast.error("Selecciona una plantilla PGD");
    try {
      await applyProjectPgd({ projectId, templateId: selectedPgdTemplateId });
      toast.success("PGD aplicada al proyecto.");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "No se pudo aplicar PGD");
    }
  };

  const runValidate = async () => {
    try {
      await setProjectValidated(projectId);
      toast.success("Proyecto marcado como VALIDADO.");
      await load();
    } catch (e: any) {
      const body = e?.body || null;
      if (body?.error === "Blocked") {
        setBlockInfo({ hardBlocks: body.hardBlocks || [], needsAck: body.needsAck || [] });
        setBlockOpen(true);
        return;
      }
      toast.error(e?.message || "No se pudo validar");
    }
  };

  const runRelease = async () => {
    try {
      await setProjectReleased(projectId);
      toast.success("Proyecto LIBERADO a Operaciones.");
      await load();
    } catch (e: any) {
      const body = e?.body || null;
      if (body?.error === "Blocked") {
        setBlockInfo({ hardBlocks: body.hardBlocks || [], needsAck: body.needsAck || [] });
        setBlockOpen(true);
        return;
      }
      toast.error(e?.message || "No se pudo liberar");
    }
  };

  const updateDoc = async (item: ProjectPgdItemDto, status: "VALIDATED" | "REJECTED") => {
    try {
      await setProjectPgdItemStatus({ itemId: item.id, status, note: status === "REJECTED" ? "Rechazado por Admin" : undefined });
      await load();
    } catch (e: any) {
      toast.error(e?.message || "No se pudo actualizar documento");
    }
  };

  if (!projectId) {
    return (
      <div className="p-6 space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">Proyecto (K)</h2>
        <Card>
          <CardContent className="py-6 space-y-3">
            <div className="text-sm text-slate-600">No hay un proyecto abierto.</div>
            <div className="flex gap-2">
              <Button onClick={() => window.dispatchEvent(new CustomEvent("changeModule", { detail: "k-dashboard" }))}>Ir al Dashboard K</Button>
              <div className="flex items-center gap-2">
                <Label htmlFor="pid" className="text-sm text-slate-600">Abrir por ID</Label>
                <Input id="pid" value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="cuid..." className="w-80" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{project ? `${project.code} - ${project.name}` : "Proyecto (K)"}</h2>
          <p className="text-sm text-slate-600">
            Fecha servicio: <span className="font-medium text-slate-900">{project?.startDate || "-"}</span>
            {" · "}
            kState: <span className="font-medium text-slate-900">{kStateLabel(project?.kState || "-")}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => window.dispatchEvent(new CustomEvent("changeModule", { detail: "k-dashboard" }))}>
            Volver
          </Button>
          <Button variant="outline" onClick={load} disabled={loading}>Actualizar</Button>
          <Button onClick={runValidate} disabled={loading}>Marcar Validado</Button>
          <Button onClick={runRelease} disabled={loading || project?.kState !== "VALIDATED"}>Liberar a Operaciones</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-sm text-slate-600">Pago</CardTitle></CardHeader>
          <CardContent className="pt-0">{sem ? colorPill(sem.payment) : "-"}</CardContent>
        </Card>
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-sm text-slate-600">Permisos</CardTitle></CardHeader>
          <CardContent className="pt-0">{sem ? colorPill(sem.permits) : "-"}</CardContent>
        </Card>
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-sm text-slate-600">PGD</CardTitle></CardHeader>
          <CardContent className="pt-0">{sem ? colorPill(sem.pgd) : "-"}</CardContent>
        </Card>
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-sm text-slate-600">Cajas</CardTitle></CardHeader>
          <CardContent className="pt-0">{sem ? colorPill(sem.crates) : "-"}</CardContent>
        </Card>
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-sm text-slate-600">Terceros</CardTitle></CardHeader>
          <CardContent className="pt-0">{sem ? colorPill(sem.thirdParties) : "-"}</CardContent>
        </Card>
      </div>

      <Tabs defaultValue="semaforos">
        <TabsList>
          <TabsTrigger value="semaforos">Semáforos</TabsTrigger>
          <TabsTrigger value="pgd">PGD</TabsTrigger>
        </TabsList>

        <TabsContent value="semaforos" className="mt-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Señales</CardTitle>
            </CardHeader>
            <CardContent>
              {signals.length === 0 ? (
                <div className="text-sm text-slate-600">Sin señales registradas.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Proceso</TableHead>
                      <TableHead>Policy</TableHead>
                      <TableHead>Warn</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Ack</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {signals.map((s) => {
                      const c = signalColors.get(s.id) || "AMBER";
                      const canAck = s.policy === "SOFT_ALERT" && c === "RED";
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{kindLabel(s.kind)}</TableCell>
                          <TableCell><Badge variant="outline">{policyLabel(s.policy)}</Badge></TableCell>
                          <TableCell className="text-xs text-slate-600">{s.warnAt ? String(s.warnAt).slice(0, 10) : "-"}</TableCell>
                          <TableCell className="text-xs text-slate-600">{s.dueAt ? String(s.dueAt).slice(0, 10) : "-"}</TableCell>
                          <TableCell>{colorPill(c)}</TableCell>
                          <TableCell className="text-xs text-slate-600">{s.ackAt ? "ACK" : "-"}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              {canAck && (
                                <Button size="sm" variant="outline" onClick={() => openAck(s)}>Ack</Button>
                              )}
                              <Button size="sm" variant="secondary" onClick={() => toggleDone(s)}>
                                {s.doneAt ? "Marcar Pendiente" : "Marcar OK"}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pgd" className="mt-3 space-y-3">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="text-base">PGD Aplicada</CardTitle>
              <div className="flex gap-2">
                <Select value={selectedPgdTemplateId} onValueChange={setSelectedPgdTemplateId}>
                  <SelectTrigger className="w-72">
                    <SelectValue placeholder="Selecciona plantilla PGD..." />
                  </SelectTrigger>
                  <SelectContent>
                    {pgdTemplates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}{t.publishedVersionId ? "" : " (sin publicar)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={applyPgd} disabled={!selectedPgdTemplateId}>Aplicar / Re-aplicar</Button>
              </div>
            </CardHeader>
            <CardContent>
              {!pgd ? (
                <div className="text-sm text-slate-600">
                  Aún no hay PGD aplicada. Para poder VALIDAR o LIBERAR, aplica una plantilla PGD publicada.
                </div>
              ) : (
                <div className="text-sm text-slate-600">
                  Plantilla: <span className="font-medium text-slate-900">{pgd.template?.name || pgd.templateId}</span>
                  {" · "}
                  Versión bloqueada: <span className="font-medium text-slate-900">{pgd.templateVersion?.version ?? "-"}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Checklist de Documentos</CardTitle>
            </CardHeader>
            <CardContent>
              {!pgd ? (
                <div className="text-sm text-slate-600">Aplica una PGD para generar el checklist.</div>
              ) : pgd.items.length === 0 ? (
                <div className="text-sm text-slate-600">La PGD aplicada no generó items.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Documento</TableHead>
                      <TableHead>Bloqueante</TableHead>
                      <TableHead>Visibilidad</TableHead>
                      <TableHead>Responsable</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pgd.items.map((it: ProjectPgdItemDto) => (
                      <TableRow key={it.id}>
                        <TableCell className="font-medium">{it.name}</TableCell>
                        <TableCell>{it.isBlocking ? <Badge className="bg-red-600 hover:bg-red-600">Sí</Badge> : <Badge variant="secondary">No</Badge>}</TableCell>
                        <TableCell className="text-xs text-slate-600">{it.visibility}</TableCell>
                        <TableCell className="text-xs text-slate-600">{it.responsible}</TableCell>
                        <TableCell className="text-xs text-slate-600">{it.expectedFileType}</TableCell>
                        <TableCell>
                          <Badge variant={it.status === "VALIDATED" ? "default" : it.status === "REJECTED" ? "destructive" : "secondary"}>
                            {it.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {userRole === "A" ? (
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="secondary" onClick={() => updateDoc(it, "VALIDATED")} disabled={it.status === "VALIDATED"}>
                                Validar
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => updateDoc(it, "REJECTED")}>
                                Rechazar
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500">Validación: solo Admin</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={ackOpen} onOpenChange={setAckOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ack de Riesgo</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="text-sm text-slate-600">
              Señal: <span className="font-medium text-slate-900">{ackSignal ? kindLabel(ackSignal.kind) : "-"}</span>
            </div>
            <Label htmlFor="ackNote">Nota (obligatorio si quieres dejar rastro)</Label>
            <Textarea id="ackNote" value={ackNote} onChange={(e) => setAckNote(e.target.value)} placeholder="Ej: Permiso municipal sale el día del servicio. Confirmado con ayuntamiento." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAckOpen(false)}>Cancelar</Button>
            <Button onClick={saveAck}>Guardar Ack</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={blockOpen} onOpenChange={setBlockOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>No se puede avanzar (bloqueos)</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {(blockInfo?.hardBlocks || []).length > 0 && (
              <div>
                <div className="text-sm font-medium text-slate-900">HARD_BLOCK</div>
                <div className="text-sm text-slate-600">
                  {(blockInfo?.hardBlocks || []).map((b, idx) => (
                    <div key={idx}>• {kindLabel(b.kind)}{b.reason ? `: ${b.reason}` : ""}</div>
                  ))}
                </div>
              </div>
            )}
            {(blockInfo?.needsAck || []).length > 0 && (
              <div>
                <div className="text-sm font-medium text-slate-900">SOFT_ALERT sin Ack</div>
                <div className="text-sm text-slate-600">
                  {(blockInfo?.needsAck || []).map((b, idx) => (
                    <div key={idx}>• {kindLabel(b.kind)} (requiere Ack)</div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

