import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, FileCheck2, Route, Save, Send } from "lucide-react";
import { executionOrderApi, ExecutionOrderApiError, type ExecutionOrderWorkspace } from "./executionOrderApi";

type Props = Readonly<{
  caseRef: string;
  authorization?: string;
  canUpdate: boolean;
  onUnauthorized(): void;
}>;

type FormState = Readonly<{
  plannedStart: string;
  plannedEnd: string;
  contractEvidenceRef: string;
  coordinatorName: string;
  crewLeadName: string;
  driverName: string;
  vehicleName: string;
  instructions: string;
}>;

const EMPTY_FORM: FormState = Object.freeze({ plannedStart: "", plannedEnd: "", contractEvidenceRef: "", coordinatorName: "", crewLeadName: "", driverName: "", vehicleName: "", instructions: "" });

function localInput(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function formOf(workspace: ExecutionOrderWorkspace): FormState {
  const order = workspace.order;
  if (!order) return EMPTY_FORM;
  return Object.freeze({
    plannedStart: localInput(order.plannedStart),
    plannedEnd: localInput(order.plannedEnd),
    contractEvidenceRef: order.contractEvidenceRef || "",
    coordinatorName: order.coordinatorName || "",
    crewLeadName: order.crewLeadName || "",
    driverName: order.driverName || "",
    vehicleName: order.vehicleName || "",
    instructions: order.instructions || "",
  });
}

function routeLabel(workspace: ExecutionOrderWorkspace, role: "ORIGIN" | "DESTINATION") {
  const item = workspace.route.find((entry) => entry.role === role);
  if (!item) return role === "ORIGIN" ? "Origen pendiente" : "Destino pendiente";
  return [item.streetAndNumber, item.sector, item.cityMunicipality, item.provinceState, item.countryCode].filter(Boolean).join(", ");
}

function money(workspace: ExecutionOrderWorkspace) {
  const proposal = workspace.proposal;
  if (!proposal) return "Pendiente";
  const total = proposal.totals.totalQuotedPrice ?? proposal.totals.payablePrice ?? proposal.totals.grossQuotedPrice;
  return typeof total === "number" ? new Intl.NumberFormat("es-DO", { style: "currency", currency: proposal.currency }).format(total) : proposal.currency;
}

function message(code: string) {
  const copy: Readonly<Record<string, string>> = {
    EXECUTION_ORDER_AUTHORITY_INCOMPLETE: "Falta completar una autoridad anterior del caso.",
    EXECUTION_ORDER_SCHEDULE_INVALID: "La finalización estimada debe ser posterior al inicio.",
    EXECUTION_ORDER_VERSION_CONFLICT: "La orden cambió en otra sesión. Actualice antes de continuar.",
    EXECUTION_ORDER_ALREADY_ISSUED: "La orden ya fue emitida y no puede modificarse silenciosamente.",
    EXECUTION_ORDER_FORBIDDEN: "Su usuario no tiene autoridad para preparar esta orden.",
  };
  return copy[code] || "No fue posible confirmar la orden. Actualice e intente de nuevo.";
}

export default function CommonExecutionOrderPanel({ caseRef, authorization, canUpdate, onUnauthorized }: Props) {
  const [workspace, setWorkspace] = useState<ExecutionOrderWorkspace | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void executionOrderApi.workspace(authorization, caseRef, controller.signal)
      .then((next) => { setWorkspace(next); setForm(formOf(next)); })
      .catch((cause) => {
        if (cause instanceof ExecutionOrderApiError && cause.status === 401) onUnauthorized();
        else if (!controller.signal.aborted) setError("No fue posible consultar la orden de ejecución.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [authorization, caseRef, onUnauthorized]);

  const update = useCallback((field: keyof FormState, value: string) => setForm((current) => Object.freeze({ ...current, [field]: value })), []);
  const issued = workspace?.order?.state === "ISSUED";
  const authorityReady = Boolean(workspace && workspace.blockers.length === 0);
  const scheduleReady = Boolean(form.plannedStart && form.plannedEnd && new Date(form.plannedEnd) > new Date(form.plannedStart));
  const canIssue = canUpdate && authorityReady && scheduleReady && Boolean(form.contractEvidenceRef.trim()) && !issued && !saving;

  const submit = useCallback(async (action: "SAVE_DRAFT" | "ISSUE") => {
    if (!workspace || !scheduleReady) { setError("Indique un inicio y una finalización estimada válidos."); return; }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const next = await executionOrderApi.command(authorization, caseRef, {
        action,
        expectedVersion: workspace.order?.version || 0,
        plannedStart: new Date(form.plannedStart).toISOString(),
        plannedEnd: new Date(form.plannedEnd).toISOString(),
        contractEvidenceRef: form.contractEvidenceRef.trim() || null,
        coordinatorName: form.coordinatorName.trim() || null,
        crewLeadName: form.crewLeadName.trim() || null,
        driverName: form.driverName.trim() || null,
        vehicleName: form.vehicleName.trim() || null,
        instructions: form.instructions.trim() || null,
      });
      setWorkspace(next);
      setForm(formOf(next));
      setNotice(action === "ISSUE" ? "Orden emitida y disponible para la coordinación operativa." : "Borrador de la orden guardado.");
    } catch (cause) {
      if (cause instanceof ExecutionOrderApiError && cause.status === 401) onUnauthorized();
      else setError(message(cause instanceof ExecutionOrderApiError ? cause.code : ""));
    } finally { setSaving(false); }
  }, [authorization, caseRef, form, onUnauthorized, scheduleReady, workspace]);

  const statusItems = workspace ? [
    { label: "Propuesta aceptada", ok: Boolean(workspace.proposal) },
    { label: "Plan de servicios", ok: Boolean(workspace.services?.primary) },
    { label: "Ruta confirmada", ok: !workspace.blockers.some((item) => item.code.includes("ORIGIN") || item.code.includes("DESTINATION")) },
    { label: "Contrato evidenciado", ok: Boolean(form.contractEvidenceRef.trim()) },
  ] : [];

  if (loading) return <div role="status" className="p-8 text-center text-sm text-slate-500">Cargando orden de ejecución…</div>;
  if (!workspace) return <p role="alert" className="mt-4 border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error || "No fue posible abrir la orden."}</p>;

  return <section className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white" aria-labelledby="common-execution-order-heading">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50 px-4 py-3">
      <div className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-[#0070a8]" /><div><h3 id="common-execution-order-heading" className="text-sm font-black text-[#003366]">Orden común de ejecución</h3><p className="text-[11px] text-slate-500">Mudanzas y transportes · información congelada al emitir</p></div></div>
      <span className={`rounded px-2 py-1 text-xs font-black ${issued ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{issued ? `Emitida · ${workspace.order?.orderCode}` : workspace.order ? `Borrador V${workspace.order.version}` : "Sin preparar"}</span>
    </div>

    <div className="grid border-b md:grid-cols-4">
      <div className="border-b p-3 md:border-b-0 md:border-r"><p className="text-[10px] font-bold uppercase text-slate-500">Cliente / caso</p><p className="mt-1 truncate text-sm font-black text-[#003366]">{workspace.case.clientName}</p><p className="font-mono text-[10px] text-slate-500">{workspace.case.caseCode}</p></div>
      <div className="border-b p-3 md:border-b-0 md:border-r"><p className="text-[10px] font-bold uppercase text-slate-500">Servicio</p><p className="mt-1 truncate text-sm font-black text-[#003366]">{workspace.services?.primary?.name || "Pendiente"}</p><p className="truncate text-[10px] text-slate-500">{workspace.services?.associated.map((item) => item.name).join(" · ") || "Sin asociados"}</p></div>
      <div className="border-b p-3 md:border-b-0 md:border-r"><p className="text-[10px] font-bold uppercase text-slate-500">Propuesta aceptada</p><p className="mt-1 text-sm font-black text-[#003366]">{workspace.proposal?.reference || "Pendiente"}</p><p className="text-[10px] text-slate-500">{money(workspace)}</p></div>
      <div className="p-3"><p className="text-[10px] font-bold uppercase text-slate-500">Ruta</p><p className="mt-1 truncate text-[11px] font-semibold text-slate-700" title={routeLabel(workspace, "ORIGIN")}>{routeLabel(workspace, "ORIGIN")}</p><p className="truncate text-[10px] text-slate-500" title={routeLabel(workspace, "DESTINATION")}>→ {routeLabel(workspace, "DESTINATION")}</p></div>
    </div>

    <div className="flex flex-wrap gap-1.5 border-b px-4 py-2">{statusItems.map((item) => <span key={item.label} className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold ${item.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{item.ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}{item.label}</span>)}</div>

    <fieldset disabled={issued || !canUpdate || saving} className="grid gap-3 p-4 lg:grid-cols-4">
      <legend className="sr-only">Programación y responsables de la orden</legend>
      <label className="text-xs font-bold">Inicio del servicio<input type="datetime-local" value={form.plannedStart} onChange={(event) => update("plannedStart", event.target.value)} className="mt-1 h-10 w-full rounded border px-3 text-sm" /></label>
      <label className="text-xs font-bold">Finalización estimada<input type="datetime-local" value={form.plannedEnd} onChange={(event) => update("plannedEnd", event.target.value)} className="mt-1 h-10 w-full rounded border px-3 text-sm" /></label>
      <label className="text-xs font-bold lg:col-span-2">Contrato / evidencia de aceptación<input value={form.contractEvidenceRef} onChange={(event) => update("contractEvidenceRef", event.target.value)} placeholder="Ej. contrato firmado, correo o referencia documental" className="mt-1 h-10 w-full rounded border px-3 text-sm" /></label>
      <label className="text-xs font-bold">Coordinador<input value={form.coordinatorName} onChange={(event) => update("coordinatorName", event.target.value)} placeholder="Por asignar" className="mt-1 h-10 w-full rounded border px-3 text-sm" /></label>
      <label className="text-xs font-bold">Jefe de grupo<input value={form.crewLeadName} onChange={(event) => update("crewLeadName", event.target.value)} placeholder="Puede asignarse después" className="mt-1 h-10 w-full rounded border px-3 text-sm" /></label>
      <label className="text-xs font-bold">Chofer<input value={form.driverName} onChange={(event) => update("driverName", event.target.value)} placeholder="Puede asignarse después" className="mt-1 h-10 w-full rounded border px-3 text-sm" /></label>
      <label className="text-xs font-bold">Vehículo<input value={form.vehicleName} onChange={(event) => update("vehicleName", event.target.value)} placeholder="Puede asignarse después" className="mt-1 h-10 w-full rounded border px-3 text-sm" /></label>
      <label className="text-xs font-bold lg:col-span-4">Instrucciones operativas<textarea value={form.instructions} onChange={(event) => update("instructions", event.target.value)} rows={2} placeholder="Accesos, restricciones, contacto en sitio y cuidados especiales" className="mt-1 w-full resize-none rounded border px-3 py-2 text-sm" /></label>
    </fieldset>

    {workspace.blockers.length > 0 && <div className="mx-4 mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950"><b>Antes de preparar la orden:</b> {workspace.blockers.map((item) => item.label).join(" · ")}</div>}
    {error && <p role="alert" className="mx-4 mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p>}
    {notice && <p role="status" className="mx-4 mb-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{notice}</p>}

    <footer className="flex flex-wrap items-center justify-between gap-3 border-t bg-slate-50 px-4 py-3">
      <p className="flex items-center gap-2 text-[11px] text-slate-500">{issued ? <FileCheck2 className="h-4 w-4 text-emerald-700" /> : <Route className="h-4 w-4" />}{issued ? "La orden está congelada. Los cambios posteriores usarán una adenda." : "Las asignaciones de personal y vehículo pueden completarse antes de emitir."}</p>
      <div className="flex gap-2">{!issued && <><button type="button" disabled={!canUpdate || !authorityReady || !scheduleReady || saving} onClick={() => void submit("SAVE_DRAFT")} className="inline-flex h-10 items-center gap-2 rounded border border-slate-300 bg-white px-4 text-xs font-bold text-[#003366] disabled:opacity-40"><Save className="h-4 w-4" />Guardar borrador</button><button type="button" disabled={!canIssue} onClick={() => void submit("ISSUE")} className="inline-flex h-10 items-center gap-2 rounded bg-[#003366] px-4 text-xs font-bold text-white disabled:opacity-40"><Send className="h-4 w-4" />Emitir orden</button></>}</div>
    </footer>
  </section>;
}

