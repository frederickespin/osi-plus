import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, ClipboardCheck, History, MapPin, MessageSquareText, RefreshCw, RotateCcw, ShieldCheck, UserCog, UserRound, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createSurveySchedulingApi } from "./schedulingApi";
import type { SurveySchedulingUiAccess } from "./schedulingAccess";
import type { EvaluationMethod, SchedulingWorkspace } from "./schedulingTypes";

type Props = Readonly<{ caseRef: string; authorization?: string; access: SurveySchedulingUiAccess; onNavigate(pathname: string): void; onUnauthorized(): void }>;

const METHOD_LABELS: Readonly<Record<EvaluationMethod, string>> = Object.freeze({ IN_PERSON: "Visita presencial", VIRTUAL: "Evaluación virtual", CLIENT_PHOTOS_DOCUMENTS: "Fotografías/documentos", WRITTEN_REPORT: "Reporte o listado escrito", VOXME: "Voxme", MINI: "Precarga Mini", NONE: "No requiere evaluación" });
const STATE_LABELS: Readonly<Record<string, string>> = Object.freeze({ NOT_REQUIRED: "No se requiere evaluación", PENDING_METHOD: "Pendiente de seleccionar método", WAITING_CLIENT_INFO: "Esperando información del cliente", READY_TO_SCHEDULE: "Evaluación pendiente de programación", SCHEDULED: "Programada", IN_PROGRESS: "En progreso", COMPLETED: "Completada", CANCELLED: "Cancelada" });
const HISTORY_LABELS: Readonly<Record<string, string>> = Object.freeze({ METHOD_DECIDED: "Método definido", SCHEDULED: "Visita programada", RESCHEDULED: "Visita reprogramada", CANCELLED: "Visita cancelada", EVALUATOR_CHANGED: "Evaluador cambiado", ROUTE_INVALIDATED: "Ruta requiere revalidación", VISIT_FEE_CHANGED: "Visit Fee actualizado", COMMUNICATION_PREPARED: "Comunicación PIC preparada", COMMUNICATION_RECORDED: "Comunicación registrada", SURVEY_PUBLISHED: "Survey publicado" });

function stateFor(method: EvaluationMethod) {
  if (method === "NONE") return "NOT_REQUIRED";
  if (method === "IN_PERSON") return "READY_TO_SCHEDULE";
  return "WAITING_CLIENT_INFO";
}
function localDateTime(date: string, time: string) { return new Date(`${date}T${time}:00`).toISOString(); }
function appointmentCopy(workspace: SchedulingWorkspace) {
  if (!workspace.assignment) return "Aún no existe una cita.";
  return new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(workspace.assignment.scheduledStart));
}

export default function SurveyCasePanel({ caseRef, authorization, access, onNavigate, onUnauthorized }: Props) {
  const api = useMemo(() => createSurveySchedulingApi(authorization), [authorization]);
  const [workspace, setWorkspace] = useState<SchedulingWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<EvaluationMethod>("IN_PERSON");
  const [date, setDate] = useState("");
  const [slotKey, setSlotKey] = useState("");
  const [evaluatorRef, setEvaluatorRef] = useState("");
  const [reason, setReason] = useState("");
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [editingEvaluator, setEditingEvaluator] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async (availabilityDate?: string) => {
    setLoading(true); setError(null);
    try { setWorkspace(await api.workspace(caseRef, availabilityDate)); }
    catch (cause) { const code = cause instanceof Error ? cause.message : "CRM_SURVEY_REQUEST_FAILED"; if (/UNAUTHORIZED|AUTH_REQUIRED/.test(code)) onUnauthorized(); else setError(code); }
    finally { setLoading(false); }
  }, [api, caseRef, onUnauthorized]);
  useEffect(() => { void load(); }, [load]);

  const slots = useMemo(() => workspace?.policy?.slots.filter((slot) => slot.profile === workspace.schedulingContext?.profile) || [], [workspace]);
  const selectedSlot = slots.find((slot) => slot.key === slotKey);
  const mutate = async (operation: () => Promise<unknown>) => {
    setSaving(true); setError(null);
    try { await operation(); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "CRM_SURVEY_SCHEDULING_REQUEST_FAILED"); }
    finally { setSaving(false); }
  };
  const saveDecision = () => mutate(() => api.decide({ caseRef, expectedVersion: workspace?.decision?.version || null, method, commercialState: stateFor(method), informationSource: method === "VOXME" ? "VOXME" : method === "MINI" ? "MINI" : "COMMERCIAL", rationaleCode: method === "NONE" ? "COMMERCIAL_DECISION" : null }));
  const saveSchedule = () => {
    if (!workspace?.decision || !selectedSlot || !date || !evaluatorRef) return;
    const saturday = new Date(`${date}T12:00:00`).getDay() === 6;
    void mutate(() => api.schedule({ decisionRef: workspace.decision!.decisionRef, expectedDecisionVersion: workspace.decision!.version, evaluatorMembershipRef: evaluatorRef, scheduledStart: localDateTime(date, selectedSlot.startTime), scheduledEnd: localDateTime(date, selectedSlot.endTime), slotKey, instruction: null, saturdayApprovalReason: saturday ? reason || null : null }));
  };
  const reschedule = () => {
    if (!workspace?.assignment || !selectedSlot || !date || !reason) return;
    const saturday = new Date(`${date}T12:00:00`).getDay() === 6;
    void mutate(() => api.reschedule({ assignmentRef: workspace.assignment!.assignmentRef, expectedVersion: workspace.assignment!.version, scheduledStart: localDateTime(date, selectedSlot.startTime), scheduledEnd: localDateTime(date, selectedSlot.endTime), slotKey, reasonCode: reason, notificationRequired: true, saturdayApprovalReason: saturday ? reason : null })).then(() => setEditingSchedule(false));
  };
  const changeEvaluator = () => {
    if (!workspace?.assignment || !evaluatorRef || !reason) return;
    void mutate(() => api.changeEvaluator({ assignmentRef: workspace.assignment!.assignmentRef, expectedVersion: workspace.assignment!.version, evaluatorMembershipRef: evaluatorRef, reasonCode: reason, notificationRequired: true })).then(() => { setEditingEvaluator(false); setReason(""); });
  };
  const cancelAppointment = () => {
    if (!workspace?.assignment || !reason) return;
    void mutate(() => api.cancel({ assignmentRef: workspace.assignment!.assignmentRef, expectedVersion: workspace.assignment!.version, reasonCode: reason, notificationRequired: true })).then(() => { setCancelling(false); setReason(""); });
  };
  const preparePic = (audience: "CLIENT" | "EVALUATOR") => {
    if (!workspace?.decision) return;
    void mutate(() => api.prepareCommunication({ decisionRef: workspace.decision!.decisionRef, assignmentRef: workspace.assignment?.assignmentRef || null, templateCode: audience === "CLIENT" ? "PIC_CLIENT_VISIT" : "PIC_EVALUATOR_VISIT", templateVersion: 1, audience, channel: "WHATSAPP", recipientRef: null }));
  };

  if (!access.canView) return <section role="status" className="border border-slate-200 bg-white p-6"><h2 className="font-black text-[#003366]">Evaluación</h2><p className="mt-2 text-sm text-slate-600">No dispone de acceso a la gestión de evaluaciones.</p></section>;
  return <section role="tabpanel" data-testid="survey-scheduling-workspace" className="border border-slate-200 bg-white">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50 px-4 py-3"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-indigo-600">Comercial · Scheduling / Evaluation</p><h2 className="text-lg font-black text-[#003366]">Evaluación</h2></div><Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw />Actualizar</Button></header>
    {loading && <p className="p-8 text-center text-sm text-slate-500">Consultando decisión, agenda e historial…</p>}
    {error && <p role="alert" className="m-4 border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">{error}</p>}
    {!loading && workspace && <div className="grid min-w-0 gap-0 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,.75fr)]">
      <div className="min-w-0 divide-y">
        <section className="p-4" aria-labelledby="evaluation-decision-title"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 id="evaluation-decision-title" className="text-xs font-black uppercase tracking-wide text-slate-500">Decisión y método</h3><p className="mt-1 text-lg font-black text-[#003366]">{workspace.decision ? METHOD_LABELS[workspace.decision.method] : "Pendiente de seleccionar método"}</p><p className="text-sm text-slate-600">{STATE_LABELS[workspace.decision?.state || "PENDING_METHOD"]}</p></div>{workspace.decision && <Badge variant="outline">v{workspace.decision.version}</Badge>}</div>
          {access.canManage && (!workspace.assignment || workspace.assignment.status === "CANCELLED") && <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"><div className="min-w-0 flex-1"><Label htmlFor="survey-method">Método de evaluación</Label><Select value={method} onValueChange={(value) => setMethod(value as EvaluationMethod)}><SelectTrigger id="survey-method"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(METHOD_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><Button disabled={saving} onClick={() => void saveDecision()}>{saving ? "Guardando…" : "Guardar decisión"}</Button></div>}
        </section>

        <section className="p-4" aria-labelledby="evaluation-agenda-title"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 id="evaluation-agenda-title" className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500"><CalendarClock className="h-4 w-4" />Agenda</h3><p className="mt-2 text-base font-bold text-slate-900">{appointmentCopy(workspace)}</p>{workspace.assignment && <p className="mt-1 text-xs text-slate-500">{workspace.assignment.evaluator.displayName} · {workspace.assignment.profile} · {workspace.assignment.zoneCode} · {workspace.assignment.slotKey}</p>}{workspace.assignment?.routeStale && <p className="mt-2 rounded bg-amber-50 p-2 text-xs font-semibold text-amber-900">La ruta cambió. Debe revalidarse zona, Visit Fee y disponibilidad antes de continuar.</p>}</div>{workspace.assignment && <div className="flex flex-wrap gap-2">{access.canReschedule && <Button size="sm" variant="outline" onClick={() => { setEditingSchedule((value) => !value); setEditingEvaluator(false); setCancelling(false); }}><RotateCcw />Reprogramar</Button>}{access.canAssign && <Button size="sm" variant="outline" onClick={() => { setEditingEvaluator((value) => !value); setEditingSchedule(false); setCancelling(false); }}><UserCog />Cambiar evaluador</Button>}{access.canManage && <Button size="sm" variant="outline" onClick={() => { setCancelling((value) => !value); setEditingSchedule(false); setEditingEvaluator(false); }}><XCircle />Cancelar cita</Button>}</div>}</div>
          {workspace.decision?.state === "READY_TO_SCHEDULE" && access.canAssign && <ScheduleEditor workspace={workspace} date={date} setDate={(value) => { setDate(value); void load(value); }} slotKey={slotKey} setSlotKey={setSlotKey} evaluatorRef={evaluatorRef} setEvaluatorRef={setEvaluatorRef} reason={reason} setReason={setReason} saving={saving} onSave={saveSchedule} />}
          {editingSchedule && workspace.assignment && <ScheduleEditor workspace={workspace} date={date} setDate={(value) => { setDate(value); void load(value); }} slotKey={slotKey} setSlotKey={setSlotKey} evaluatorRef={evaluatorRef} setEvaluatorRef={setEvaluatorRef} reason={reason} setReason={setReason} saving={saving} reprogramming onSave={reschedule} />}
          {editingEvaluator && workspace.assignment && <div className="mt-4 grid gap-3 rounded border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2"><div><Label>Nuevo evaluador</Label><Select value={evaluatorRef} onValueChange={setEvaluatorRef}><SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger><SelectContent>{workspace.evaluatorCandidates.map((candidate) => <SelectItem key={candidate.membershipRef} value={candidate.membershipRef}>{candidate.displayName}</SelectItem>)}</SelectContent></Select></div><div><Label htmlFor="evaluator-change-reason">Motivo</Label><Input id="evaluator-change-reason" value={reason} onChange={(event) => setReason(event.target.value)} /></div><div className="sm:col-span-2"><Button disabled={saving || !evaluatorRef || !reason} onClick={changeEvaluator}>Confirmar cambio</Button></div></div>}
          {cancelling && workspace.assignment && <div className="mt-4 flex flex-col gap-3 rounded border border-red-200 bg-red-50 p-3 sm:flex-row sm:items-end"><div className="min-w-0 flex-1"><Label htmlFor="cancel-appointment-reason">Motivo de cancelación</Label><Input id="cancel-appointment-reason" value={reason} onChange={(event) => setReason(event.target.value)} /></div><Button variant="destructive" disabled={saving || !reason} onClick={cancelAppointment}>Confirmar cancelación</Button></div>}
        </section>

        <section className="grid gap-4 p-4 sm:grid-cols-2"><div><h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500"><MapPin className="h-4 w-4" />Visit Fee</h3>{!access.canViewFee ? <p className="mt-2 text-sm text-slate-500">Sin permiso de consulta.</p> : workspace.visitFee ? <div className="mt-2 space-y-1 text-sm"><p className="font-bold text-slate-900">{workspace.visitFee.disposition === "FREE" ? "Sin costo" : workspace.visitFee.disposition === "WAIVED" ? "Exonerada" : workspace.visitFee.suggestedAmount == null ? "Pendiente de cálculo" : `${workspace.visitFee.currency} ${workspace.visitFee.suggestedAmount.toLocaleString("es-DO")}`}</p><p className="text-xs text-slate-500">Comunicación: {workspace.visitFee.communicationStatus} · aprobación: {workspace.visitFee.approvalStatus} · pago: {workspace.visitFee.paymentStatus}</p></div> : <p className="mt-2 text-sm text-slate-500">Pendiente de cálculo por Motor Logístico y Costing. Scheduling no estima importes.</p>}</div><div><h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500"><MessageSquareText className="h-4 w-4" />Comunicación PIC</h3><p className="mt-2 text-sm text-slate-600">{workspace.communications.length ? `${workspace.communications.length} comunicación(es) preparada(s)` : "Sin comunicación preparada"}</p>{access.canManage && workspace.assignment && <div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => preparePic("CLIENT")}>PIC cliente</Button><Button size="sm" variant="outline" onClick={() => preparePic("EVALUATOR")}>PIC evaluador</Button></div>}<p className="mt-2 text-[11px] text-slate-500">PREPARED no envía mensajes externos.</p></div></section>

        <section className="p-4"><h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500"><ClipboardCheck className="h-4 w-4" />Resultado publicado</h3>{workspace.publication ? <div className="mt-2 text-sm"><p className="font-bold text-slate-900">Publicado {new Date(workspace.publication.publishedAt).toLocaleString("es-DO")}</p><p className="text-slate-600">Evaluador: {workspace.publication.evaluatorDisplayName} · elementos con necesidades: {workspace.publication.needs.flaggedItems}</p></div> : <p className="mt-2 text-sm text-slate-500">Todavía no existe un resultado Survey publicado.</p>}{workspace.assignment && <Button className="mt-3" size="sm" onClick={() => onNavigate("/survey")}><ShieldCheck />Abrir Survey App</Button>}</section>
      </div>

      <aside className="min-w-0 border-t bg-slate-50 p-4 xl:border-l xl:border-t-0"><h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500"><History className="h-4 w-4" />Historial</h3>{workspace.history.length === 0 ? <p className="mt-3 text-sm text-slate-500">Sin eventos de evaluación.</p> : <ol className="mt-3 space-y-0">{workspace.history.map((entry) => <li key={entry.eventRef} className="relative border-l border-slate-300 pb-4 pl-4 text-sm before:absolute before:-left-1 before:top-1 before:h-2 before:w-2 before:rounded-full before:bg-[#0070a8]"><p className="font-bold text-slate-800">{HISTORY_LABELS[entry.type] || entry.type}</p><p className="text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString("es-DO")}{entry.reasonCode ? ` · ${entry.reasonCode}` : ""}</p>{entry.notificationRequired && <p className="text-[11px] font-semibold text-amber-700">Notificación requerida</p>}</li>)}</ol>}</aside>
    </div>}
  </section>;
}

type ScheduleEditorProps = Readonly<{ workspace: SchedulingWorkspace; date: string; setDate(value: string): void; slotKey: string; setSlotKey(value: string): void; evaluatorRef: string; setEvaluatorRef(value: string): void; reason: string; setReason(value: string): void; saving: boolean; reprogramming?: boolean; onSave(): void }>;
function ScheduleEditor({ workspace, date, setDate, slotKey, setSlotKey, evaluatorRef, setEvaluatorRef, reason, setReason, saving, reprogramming = false, onSave }: ScheduleEditorProps) {
  const slots = workspace.policy?.slots.filter((slot) => slot.profile === workspace.schedulingContext?.profile) || [];
  if (!workspace.policy || !workspace.schedulingContext) return <p className="mt-4 border border-dashed border-slate-300 p-3 text-sm text-slate-600">Motor Logístico debe publicar zona y distancia antes de habilitar la agenda.</p>;
  const availability = workspace.availability;
  return <div className="mt-4 grid gap-3 rounded border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2" data-testid="survey-schedule-editor"><div><Label htmlFor="survey-date">Fecha</Label><Input id="survey-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />{availability?.date === date && <p className={`mt-1 text-[11px] font-semibold ${availability.closed ? "text-red-700" : "text-slate-500"}`}>{availability.closed ? "Día cerrado" : `${availability.dayOccupied}/${availability.dayCapacity} citas en el perfil`}{availability.saturdayApprovalRequired ? " · sábado sujeto a validación" : ""}</p>}</div><div><Label>Slot</Label><Select value={slotKey} onValueChange={setSlotKey}><SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger><SelectContent>{slots.map((slot) => { const observed = availability?.slots.find((item) => item.key === slot.key); return <SelectItem key={slot.key} value={slot.key} disabled={observed ? !observed.available : false}>{slot.label} · {slot.startTime}–{slot.endTime}{observed ? ` · ${observed.occupied}/${observed.capacity}` : ""}</SelectItem>; })}</SelectContent></Select></div>{!reprogramming && <div><Label>Evaluador</Label><Select value={evaluatorRef} onValueChange={setEvaluatorRef}><SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger><SelectContent>{workspace.evaluatorCandidates.map((candidate) => <SelectItem key={candidate.membershipRef} value={candidate.membershipRef}><span className="flex items-center gap-2"><UserRound className="h-3.5 w-3.5" />{candidate.displayName}</span></SelectItem>)}</SelectContent></Select></div>}<div><Label htmlFor="schedule-reason">{reprogramming ? "Motivo obligatorio" : "Validación de sábado (si aplica)"}</Label><Input id="schedule-reason" value={reason} onChange={(event) => setReason(event.target.value)} /></div><div className="sm:col-span-2"><Button disabled={saving || !date || !slotKey || (!reprogramming && !evaluatorRef) || (reprogramming && !reason)} onClick={onSave}>{saving ? "Guardando…" : reprogramming ? "Confirmar reprogramación" : "Programar evaluación"}</Button></div></div>;
}
