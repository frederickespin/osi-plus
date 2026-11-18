import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleDollarSign, FileCheck2, LockKeyhole, Save } from "lucide-react";
import { economicControlApi, EconomicControlApiError, type CollectionState, type EconomicControlCommand, type EconomicControlWorkspace, type ThirdPartyCostsStatus } from "./economicControlApi";

type Props = Readonly<{ caseRef: string; authorization?: string; canUpdate: boolean; onUnauthorized(): void }>;
type Form = Readonly<{ billingEvidenceRef: string; completionEvidenceRef: string; thirdPartyCostsStatus: ThirdPartyCostsStatus; thirdPartyEvidenceRef: string; collectionState: CollectionState; collectionEvidenceRef: string; invoiceRef: string; notes: string }>;

const STATE = Object.freeze({ DRAFT: "En revisión", READY: "Listo para facturar", INVOICED: "Factura registrada", CLOSED: "Cerrado" });
const COLLECTION = Object.freeze({ NOT_VALIDATED: "Sin validar", PENDING: "Pendiente", PARTIAL: "Pago parcial informado", CURRENT: "Al día confirmado", EXEMPTED: "Exento autorizado" });

function formOf(workspace: EconomicControlWorkspace): Form {
  const control = workspace.control;
  return Object.freeze({ billingEvidenceRef: control.billingEvidenceRef || "", completionEvidenceRef: control.completionEvidenceRef || "", thirdPartyCostsStatus: control.thirdPartyCostsStatus, thirdPartyEvidenceRef: control.thirdPartyEvidenceRef || "", collectionState: control.collectionState, collectionEvidenceRef: control.collectionEvidenceRef || "", invoiceRef: control.invoiceRef || "", notes: control.notes || "" });
}
function money(value: number, currency: string) { return new Intl.NumberFormat("es-DO", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value); }
function message(code: string) {
  return ({
    ECONOMIC_CONTROL_BLOCKED: "Todavía existen verificaciones pendientes.",
    ECONOMIC_CONTROL_VERSION_CONFLICT: "Otra persona actualizó el control. Recargue antes de continuar.",
    ECONOMIC_CONTROL_THIRD_PARTY_EVIDENCE_REQUIRED: "Indique la evidencia de los cargos de terceros.",
    ECONOMIC_CONTROL_COLLECTION_EVIDENCE_REQUIRED: "Indique la evidencia del estado de cobro.",
    ECONOMIC_CONTROL_INVOICE_REFERENCE_REQUIRED: "Indique la referencia de la factura emitida.",
    ECONOMIC_CONTROL_CLOSE_BLOCKED: "Para cerrar, la factura debe estar registrada y el estado de cobro debe estar al día o exento.",
    ECONOMIC_CONTROL_STATE_INVALID: "La acción no corresponde al estado actual.",
    ECONOMIC_CONTROL_CLOSED: "El control está cerrado y conserva su historial.",
    ECONOMIC_CONTROL_FORBIDDEN: "Su usuario no tiene autoridad para modificar este control.",
  } as Record<string, string>)[code] || "No se pudo confirmar la operación. Actualice e intente de nuevo.";
}

export default function EconomicControlPanel({ caseRef, authorization, canUpdate, onUnauthorized }: Props) {
  const [workspace, setWorkspace] = useState<EconomicControlWorkspace | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void economicControlApi.workspace(authorization, caseRef, controller.signal).then((value) => { setWorkspace(value); setForm(formOf(value)); }).catch((cause) => { if (cause instanceof EconomicControlApiError && cause.status === 401) onUnauthorized(); else if (!controller.signal.aborted) setError("No fue posible consultar el control económico."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [authorization, caseRef, onUnauthorized]);

  const update = useCallback(<K extends keyof Form>(field: K, value: Form[K]) => setForm((current) => current ? Object.freeze({ ...current, [field]: value }) : current), []);
  const commandOf = useCallback((action: EconomicControlCommand["action"]): EconomicControlCommand | null => workspace && form ? ({ action, expectedVersion: workspace.control.version, billingEvidenceRef: form.billingEvidenceRef.trim() || null, completionEvidenceRef: form.completionEvidenceRef.trim() || null, thirdPartyCostsStatus: form.thirdPartyCostsStatus, thirdPartyEvidenceRef: form.thirdPartyEvidenceRef.trim() || null, collectionState: form.collectionState, collectionEvidenceRef: form.collectionEvidenceRef.trim() || null, invoiceRef: form.invoiceRef.trim() || null, notes: form.notes.trim() || null }) : null, [form, workspace]);
  const run = useCallback(async (action: EconomicControlCommand["action"]) => {
    const command = commandOf(action); if (!command) return;
    setSaving(true); setError(null); setNotice(null);
    try {
      const next = await economicControlApi.command(authorization, caseRef, command);
      setWorkspace(next); setForm(formOf(next));
      setNotice(action === "SAVE_DRAFT" ? "Verificaciones guardadas." : action === "MARK_READY" ? "Control listo para facturar." : action === "RECORD_INVOICE" ? "Factura registrada como evidencia." : "Control económico cerrado.");
    } catch (cause) {
      if (cause instanceof EconomicControlApiError && cause.status === 401) onUnauthorized(); else setError(message(cause instanceof EconomicControlApiError ? cause.code : ""));
    } finally { setSaving(false); }
  }, [authorization, caseRef, commandOf, onUnauthorized]);

  const readyChanges = useMemo(() => workspace?.financials.changes.filter((item) => item.documentKind === "ADDENDUM" && item.economicControlReady) || [], [workspace]);
  const liveBlockers = useMemo(() => {
    if (!workspace || !form) return [];
    const editableCodes = new Set(["BILLING_EVIDENCE_REQUIRED", "COMPLETION_EVIDENCE_REQUIRED", "THIRD_PARTY_COSTS_PENDING"]);
    const blockers = workspace.blockers.filter((item) => !editableCodes.has(item.code));
    if (!form.billingEvidenceRef.trim()) blockers.push({ code: "BILLING_EVIDENCE_REQUIRED", label: "Validación de facturación pendiente" });
    if (!form.completionEvidenceRef.trim()) blockers.push({ code: "COMPLETION_EVIDENCE_REQUIRED", label: "Evidencia de ejecución pendiente" });
    if (form.thirdPartyCostsStatus === "PENDING") blockers.push({ code: "THIRD_PARTY_COSTS_PENDING", label: "Cargos de terceros pendientes de confirmar" });
    if (form.thirdPartyCostsStatus === "CONFIRMED" && !form.thirdPartyEvidenceRef.trim()) blockers.push({ code: "THIRD_PARTY_EVIDENCE_REQUIRED", label: "Evidencia de cargos de terceros pendiente" });
    return blockers;
  }, [form, workspace]);
  if (loading) return <div role="status" className="p-8 text-center text-sm text-slate-500">Cargando control económico…</div>;
  if (!workspace || !form) return <p role="alert" className="m-4 border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error || "No fue posible abrir Control económico."}</p>;
  const locked = workspace.control.state === "CLOSED";
  const invoiced = workspace.control.state === "INVOICED";
  const canReady = workspace.control.state === "DRAFT" && liveBlockers.length === 0;
  const canInvoice = workspace.control.state === "READY" && Boolean(form.invoiceRef.trim());
  const canClose = workspace.control.state === "INVOICED" && ["CURRENT", "EXEMPTED"].includes(form.collectionState) && Boolean(form.collectionEvidenceRef.trim());

  return <section role="tabpanel" aria-labelledby="economic_control-tab" className="w-full p-4" data-testid="case-economic-control-panel">
    <header className="flex flex-wrap items-end justify-between gap-3 border-b pb-3"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#0070a8]">Validación comercial</p><h2 className="mt-1 text-xl font-black text-[#003366]">Control económico</h2><p className="mt-1 text-xs text-slate-500">Estados, evidencias y reportes del caso. No genera contabilidad ni conciliación bancaria.</p></div><span className={`rounded px-3 py-2 text-xs font-black ${workspace.control.state === "CLOSED" ? "bg-emerald-50 text-emerald-800" : workspace.control.state === "INVOICED" ? "bg-blue-50 text-blue-800" : "bg-amber-50 text-amber-800"}`}>{STATE[workspace.control.state]}</span></header>

    <div className="mt-3 grid gap-2 sm:grid-cols-4"><div className="border p-3"><p className="text-[10px] font-bold uppercase text-slate-500">Propuesta base</p><p className="mt-1 text-lg font-black text-[#003366]">{money(workspace.financials.baseAmount, workspace.financials.currency)}</p><p className="truncate text-[10px] text-slate-500">{workspace.proposal?.reference || "Pendiente"}</p></div><div className="border p-3"><p className="text-[10px] font-bold uppercase text-slate-500">Adendas ejecutadas</p><p className={`mt-1 text-lg font-black ${workspace.financials.addendaAmount < 0 ? "text-red-700" : "text-blue-700"}`}>{money(workspace.financials.addendaAmount, workspace.financials.currency)}</p><p className="text-[10px] text-slate-500">{readyChanges.length} incorporada(s)</p></div><div className="border p-3"><p className="text-[10px] font-bold uppercase text-slate-500">Total controlado</p><p className="mt-1 text-lg font-black text-[#003366]">{money(workspace.financials.controlledTotal, workspace.financials.currency)}</p><p className="text-[10px] text-slate-500">No es asiento contable</p></div><div className="border p-3"><p className="text-[10px] font-bold uppercase text-slate-500">Cobro informado</p><p className="mt-1 text-sm font-black text-[#003366]">{COLLECTION[workspace.control.collectionState]}</p><p className="truncate text-[10px] text-slate-500">{workspace.control.collectionEvidenceRef || "Sin evidencia"}</p></div></div>

    {liveBlockers.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Verificaciones pendientes">{liveBlockers.map((blocker) => <span key={blocker.code} className="rounded bg-amber-50 px-2 py-1.5 text-[10px] font-bold text-amber-900"><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />{blocker.label}</span>)}</div>}

    <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(420px,1.15fr)_minmax(340px,0.85fr)]">
      <div className="border"><div className="border-b bg-slate-50 px-3 py-2 text-xs font-black text-[#003366]">Composición controlada</div><div className="divide-y"><div className="grid grid-cols-[1fr_auto] gap-3 px-3 py-3"><div><p className="text-sm font-bold text-slate-800">Propuesta aceptada</p><p className="text-[10px] text-slate-500">{workspace.proposal?.reference || "Sin propuesta"} · versión congelada</p></div><p className="text-sm font-black text-[#003366]">{money(workspace.financials.baseAmount, workspace.financials.currency)}</p></div>{readyChanges.map((change) => <div key={change.changeRef} className="grid grid-cols-[1fr_auto] gap-3 px-3 py-3"><div><p className="text-sm font-bold text-slate-800">{change.serviceName}</p><p className="text-[10px] text-slate-500">{change.changeCode} · {change.changeKind === "REMOVED" ? "Retiro" : change.changeKind === "MODIFIED" ? "Modificación" : "Adición"}</p></div><p className={`text-sm font-black ${change.amount < 0 ? "text-red-700" : "text-blue-700"}`}>{money(change.amount, change.currency)}</p></div>)}{readyChanges.length === 0 && <p className="px-3 py-4 text-center text-xs text-slate-500">No hay adendas ejecutadas para incorporar.</p>}</div><div className="grid grid-cols-[1fr_auto] gap-3 border-t-2 border-[#003366] bg-slate-50 px-3 py-3"><p className="text-sm font-black text-[#003366]">Total previsto para facturación</p><p className="text-base font-black text-[#003366]">{money(workspace.financials.controlledTotal, workspace.financials.currency)}</p></div></div>

      <div className="border"><div className="flex items-center justify-between border-b bg-slate-50 px-3 py-2"><p className="text-xs font-black text-[#003366]">Validaciones y evidencias</p>{locked && <LockKeyhole className="h-4 w-4 text-emerald-700" />}</div><fieldset disabled={saving || locked || !canUpdate} className="grid gap-3 p-3 sm:grid-cols-2">
        <label className="text-xs font-bold">Facturación confirmada<input value={form.billingEvidenceRef} onChange={(event) => update("billingEvidenceRef", event.target.value)} disabled={invoiced} placeholder="Ficha fiscal o validación" className="mt-1 h-10 w-full rounded border px-3 text-sm disabled:bg-slate-50" /></label>
        <label className="text-xs font-bold">Ejecución completada<input value={form.completionEvidenceRef} onChange={(event) => update("completionEvidenceRef", event.target.value)} disabled={invoiced} placeholder="Acta, entrega o cierre operativo" className="mt-1 h-10 w-full rounded border px-3 text-sm disabled:bg-slate-50" /></label>
        <label className="text-xs font-bold">Cargos de terceros<select value={form.thirdPartyCostsStatus} onChange={(event) => update("thirdPartyCostsStatus", event.target.value as ThirdPartyCostsStatus)} disabled={invoiced} className="mt-1 h-10 w-full rounded border px-2 text-sm disabled:bg-slate-50"><option value="PENDING">Pendientes de confirmar</option><option value="NONE">No aplican</option><option value="CONFIRMED">Confirmados</option></select></label>
        <label className="text-xs font-bold">Evidencia de terceros<input value={form.thirdPartyEvidenceRef} onChange={(event) => update("thirdPartyEvidenceRef", event.target.value)} disabled={invoiced || form.thirdPartyCostsStatus !== "CONFIRMED"} placeholder={form.thirdPartyCostsStatus === "CONFIRMED" ? "Factura o soporte" : "No requerida"} className="mt-1 h-10 w-full rounded border px-3 text-sm disabled:bg-slate-50" /></label>
        <label className="text-xs font-bold">Estado de cobro informado<select value={form.collectionState} onChange={(event) => update("collectionState", event.target.value as CollectionState)} className="mt-1 h-10 w-full rounded border px-2 text-sm"><option value="NOT_VALIDATED">Sin validar</option><option value="PENDING">Pendiente</option><option value="PARTIAL">Pago parcial informado</option><option value="CURRENT">Al día confirmado</option><option value="EXEMPTED">Exento autorizado</option></select></label>
        <label className="text-xs font-bold">Evidencia del cobro<input value={form.collectionEvidenceRef} onChange={(event) => update("collectionEvidenceRef", event.target.value)} placeholder="Recibo, confirmación o exención" className="mt-1 h-10 w-full rounded border px-3 text-sm" /></label>
        <label className="text-xs font-bold sm:col-span-2">Referencia de factura<input value={form.invoiceRef} onChange={(event) => update("invoiceRef", event.target.value)} disabled={invoiced} placeholder="Se exige al registrar la factura emitida" className="mt-1 h-10 w-full rounded border px-3 text-sm disabled:bg-slate-50" /></label>
        <label className="text-xs font-bold sm:col-span-2">Notas de control<textarea rows={2} value={form.notes} onChange={(event) => update("notes", event.target.value)} className="mt-1 w-full resize-none rounded border px-3 py-2 text-sm" placeholder="Observaciones, diferencias o seguimiento" /></label>
      </fieldset><footer className="flex flex-wrap justify-end gap-2 border-t bg-slate-50 px-3 py-2">{!locked && !invoiced && <button type="button" disabled={saving || !canUpdate} onClick={() => void run("SAVE_DRAFT")} className="inline-flex h-9 items-center gap-1.5 rounded border bg-white px-3 text-xs font-bold text-[#003366] disabled:opacity-40"><Save className="h-3.5 w-3.5" />Guardar</button>}{workspace.control.state === "DRAFT" && <button type="button" disabled={saving || !canUpdate || !canReady} onClick={() => void run("MARK_READY")} className="inline-flex h-9 items-center gap-1.5 rounded bg-[#003366] px-3 text-xs font-bold text-white disabled:opacity-40"><CheckCircle2 className="h-3.5 w-3.5" />Listo para facturar</button>}{workspace.control.state === "READY" && <button type="button" disabled={saving || !canUpdate || !canInvoice} onClick={() => void run("RECORD_INVOICE")} className="inline-flex h-9 items-center gap-1.5 rounded bg-blue-700 px-3 text-xs font-bold text-white disabled:opacity-40"><FileCheck2 className="h-3.5 w-3.5" />Registrar factura</button>}{workspace.control.state === "INVOICED" && <button type="button" disabled={saving || !canUpdate || !canClose} onClick={() => void run("CLOSE")} className="inline-flex h-9 items-center gap-1.5 rounded bg-emerald-700 px-3 text-xs font-bold text-white disabled:opacity-40"><CircleDollarSign className="h-3.5 w-3.5" />Cerrar control</button>}</footer></div>
    </div>
    {error && <p role="alert" className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p>}{notice && <p role="status" className="mt-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"><CheckCircle2 className="mr-1 inline h-4 w-4" />{notice}</p>}
  </section>;
}
