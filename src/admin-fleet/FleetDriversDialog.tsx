import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Pencil, Plus, RefreshCw, Save, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AdministrationHelp, AdministrationIconAction } from "@/administration/AdministrationHelp";
import type { FleetAccess } from "./access";
import { FleetApiError } from "./api";
import { FleetDriversApi, fleetDriversErrorText } from "./driversApi";
import { FLEET_DRIVER_STATUS_LABELS, canDecideFleetDriver, type FleetDriverAuthorization, type FleetDriverDecision, type FleetDriverHistoryEntry, type FleetDriverHistoryKind, type FleetDriverPerson, type FleetDriverReceipt, type FleetDriverWorkspace } from "./driverTypes";
import { FLEET_DRIVER_TIMEZONE_LABEL, fleetDriverLocalToUtc, formatFleetDriverDate } from "./driverTime";
import FleetDriverPicker from "./FleetDriverPicker";
import FleetDriverHistory from "./FleetDriverHistory";

type View = { kind: "PRIMARY"; driver: FleetDriverPerson | null; reason: string }
  | { kind: "REQUEST"; driver: FleetDriverPerson | null; startsAt: string; endsAt: string; reason: string }
  | { kind: "DECISION"; entry: FleetDriverAuthorization; action: FleetDriverDecision; reason: string }
  | { kind: "DETAIL"; entry: FleetDriverHistoryEntry };
const fieldClass = "mt-1 min-w-0 rounded border border-slate-300 bg-white px-2 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-500";
const actionClass = "inline-flex min-h-10 items-center justify-center gap-1.5 rounded border border-slate-300 px-3 text-xs font-medium text-slate-700 disabled:opacity-40 sm:min-h-9";
const decisionLabels = { APPROVE: "Aprobar autorización", REJECT: "Rechazar solicitud", REVOKE: "Revocar autorización" } as const;

function DriverDetail({ entry }: { entry: FleetDriverHistoryEntry }) {
  const item = (label: string, value: string | null, full = false) => <div className={full ? "col-span-2" : "min-w-0"}><dt className="text-[11px] text-slate-500">{label}</dt><dd className="mt-0.5 whitespace-pre-wrap break-words text-xs text-slate-800">{value || "—"}</dd></div>;
  return <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
    {item("Chofer", entry.driver?.displayName || "Sin asignar")}
    {entry.kind === "PRIMARY" ? <>{item("Asignado por", entry.assignedBy.displayName)}{item("Fecha", formatFleetDriverDate(entry.assignedAt))}{item("Motivo", entry.reason, true)}</> : <>
      {item("Estado", FLEET_DRIVER_STATUS_LABELS[entry.effectiveStatus])}
      {item("Desde", formatFleetDriverDate(entry.startsAt))}{item("Hasta", formatFleetDriverDate(entry.endsAt))}
      {item("Solicitado por", entry.requestedBy.displayName)}{item("Solicitado el", formatFleetDriverDate(entry.requestedAt))}{item("Motivo de la solicitud", entry.reason, true)}
      {entry.decidedBy && <>{item("Decidido por", entry.decidedBy.displayName)}{item("Decidido el", entry.decidedAt ? formatFleetDriverDate(entry.decidedAt) : null)}{item("Motivo de la decisión", entry.decisionReason, true)}</>}
      {entry.revokedBy && <>{item("Revocado por", entry.revokedBy.displayName)}{item("Revocado el", entry.revokedAt ? formatFleetDriverDate(entry.revokedAt) : null)}{item("Motivo de revocación", entry.revocationReason, true)}</>}
    </>}
  </dl>;
}

export default function FleetDriversDialog({ api, vehicleRef, access, onClose, onUnauthorized }: {
  api: FleetDriversApi;
  vehicleRef: string;
  access: FleetAccess;
  onClose(): void;
  onUnauthorized(): void;
}) {
  const [historyKind, setHistoryKind] = useState<FleetDriverHistoryKind>("TEMPORARY");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<{ query: string; workspace: FleetDriverWorkspace | null; error: string | null } | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [saving, setSaving] = useState(false);
  const [mustReload, setMustReload] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const writing = useRef(false);
  const pending = useRef(new Set<AbortController>());
  const readEpoch = useRef(0);
  const manualRefresh = useRef(0);
  const blockedAt = useRef<number | null>(null);
  const callbacks = useRef({ onUnauthorized });
  useEffect(() => { callbacks.current = { onUnauthorized }; }, [onUnauthorized]);
  useEffect(() => {
    const requests = pending.current;
    return () => { requests.forEach((controller) => controller.abort()); requests.clear(); };
  }, [api, vehicleRef]);
  const query = JSON.stringify([vehicleRef, historyKind, page, refresh]);
  const loading = result?.query !== query;
  const workspace = result?.workspace ?? null;
  const readError = loading ? null : result?.error;
  useEffect(() => {
    const controller = new AbortController(); const requests = pending.current; requests.add(controller);
    const epoch = ++readEpoch.current; const manual = manualRefresh.current;
    void api.get(vehicleRef, { historyKind, page, pageSize: 20 }, controller.signal).then((data) => {
      if (controller.signal.aborted || epoch !== readEpoch.current) return;
      const lastPage = Math.max(1, Math.ceil(data.total / data.pageSize));
      if (page > lastPage) { setPage(lastPage); return; }
      setResult({ query, workspace: data, error: null });
      if (blockedAt.current !== null && manual > blockedAt.current) {
        blockedAt.current = null; setMustReload(false); setMutationError(null);
      }
    }).catch((cause) => {
      if (controller.signal.aborted || epoch !== readEpoch.current) return;
      if (cause instanceof FleetApiError && cause.status === 401) callbacks.current.onUnauthorized();
      else setResult((current) => ({ query, workspace: current?.workspace ?? null, error: fleetDriversErrorText(cause) }));
    }).finally(() => requests.delete(controller));
    return () => { controller.abort(); requests.delete(controller); };
  }, [api, historyKind, page, query, vehicleRef]);

  const retired = workspace?.vehicle.operationalStatus === "RETIRED";
  const locked = saving || loading || Boolean(readError) || mustReload || !workspace;
  const canAssign = access.canAssignDrivers && Boolean(workspace?.permissions.assign);
  const canRequest = access.canRequestDrivers && Boolean(workspace?.permissions.request);
  const canAuthorize = access.canAuthorizeDrivers && Boolean(workspace?.permissions.authorize);
  const detailRecord = view?.kind === "DETAIL" ? workspace?.data.find((entry) => entry.kind === "PRIMARY" && view.entry.kind === "PRIMARY" ? entry.assignmentRef === view.entry.assignmentRef : entry.kind === "TEMPORARY" && view.entry.kind === "TEMPORARY" && entry.authorizationRef === view.entry.authorizationRef) : undefined;
  const decisionRecord = view?.kind === "DECISION" ? workspace?.data.find((entry): entry is FleetDriverAuthorization => entry.kind === "TEMPORARY" && entry.authorizationRef === view.entry.authorizationRef) : undefined;
  const canSubmit = view?.kind === "PRIMARY" ? canAssign && !retired : view?.kind === "REQUEST" ? canRequest && !retired : view?.kind === "DECISION" && canAuthorize && (!retired || view.action === "REVOKE") && Boolean(decisionRecord && canDecideFleetDriver(decisionRecord, view.action));

  const reload = () => {
    if (writing.current || loading) return;
    manualRefresh.current += 1; setRefresh((value) => value + 1);
  };
  const openView = (next: View) => { if (!writing.current) { setView(next); setSaved(null); if (!mustReload) setMutationError(null); } };
  const close = () => { if (!writing.current) onClose(); };
  const submit = async () => {
    if (locked || !canSubmit || !view || view.kind === "DETAIL" || !workspace || writing.current) return;
    let operation: (signal: AbortSignal) => Promise<FleetDriverReceipt>;
    let success: string;
    try {
      const requestId = crypto.randomUUID();
      if (view.kind === "PRIMARY") {
        if (!view.reason.trim()) throw new Error("Indique el motivo del cambio de chofer habitual.");
        if ((view.driver?.membershipRef ?? null) === (workspace.primaryDriver?.driver?.membershipRef ?? null)) throw new Error("Seleccione otro chofer o quite la asignación actual.");
        const input = { requestId, expectedVersion: workspace.primaryVersion, driverMembershipRef: view.driver?.membershipRef ?? null, reason: view.reason.trim() };
        operation = (signal) => api.setPrimary(vehicleRef, input, signal); success = "Chofer habitual actualizado.";
      } else if (view.kind === "REQUEST") {
        if (!view.driver) throw new Error("Seleccione el chofer para el uso temporal.");
        if (!view.reason.trim()) throw new Error("Indique el motivo del uso temporal.");
        const startsAt = fleetDriverLocalToUtc(view.startsAt); const endsAt = fleetDriverLocalToUtc(view.endsAt);
        if (endsAt <= startsAt) throw new Error("La fecha y hora final deben ser posteriores al inicio.");
        const input = { requestId, driverMembershipRef: view.driver.membershipRef, startsAt, endsAt, reason: view.reason.trim() };
        operation = (signal) => api.requestAuthorization(vehicleRef, input, signal); success = "Solicitud registrada. Queda pendiente de autorización.";
      } else {
        if (!decisionRecord || !canDecideFleetDriver(decisionRecord, view.action)) return;
        if (view.action !== "APPROVE" && !view.reason.trim()) throw new Error("Indique el motivo de la decisión.");
        const input = { requestId, expectedVersion: decisionRecord.version, action: view.action, ...(view.reason.trim() ? { reason: view.reason.trim() } : {}) };
        operation = (signal) => api.decideAuthorization(vehicleRef, decisionRecord.authorizationRef, input, signal);
        success = view.action === "APPROVE" ? "Autorización aprobada." : view.action === "REJECT" ? "Solicitud rechazada." : "Autorización revocada.";
      }
    } catch (cause) { setMutationError(cause instanceof Error ? cause.message : "Revise los datos."); return; }
    const controller = new AbortController(); pending.current.add(controller); writing.current = true;
    setSaving(true); setMutationError(null); setSaved(null);
    try {
      await operation(controller.signal);
      if (controller.signal.aborted) return;
      if (view.kind === "REQUEST") { setHistoryKind("TEMPORARY"); setPage(1); }
      readEpoch.current += 1; setView(null); setSaved(success); setRefresh((value) => value + 1);
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof FleetApiError && cause.status === 401) callbacks.current.onUnauthorized();
      else {
        const uncertain = !(cause instanceof FleetApiError) || cause.status >= 500 || cause.status === 403 || cause.status === 409;
        if (uncertain) { blockedAt.current = manualRefresh.current; setMustReload(true); }
        setMutationError(fleetDriversErrorText(cause));
      }
    } finally {
      pending.current.delete(controller);
      if (!controller.signal.aborted) { writing.current = false; setSaving(false); }
    }
  };

  const changePerson = (driver: FleetDriverPerson | null) => setView((current) => current?.kind === "PRIMARY" || current?.kind === "REQUEST" ? { ...current, driver } : current);
  const changeReason = (reason: string) => setView((current) => current && current.kind !== "DETAIL" ? { ...current, reason } : current);
  const mainTitle = view?.kind === "PRIMARY" ? "Cambiar chofer habitual" : view?.kind === "REQUEST" ? "Solicitar uso temporal" : view?.kind === "DECISION" ? decisionLabels[view.action] : view?.kind === "DETAIL" ? "Detalle del registro" : null;
  return <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
    <DialogContent showCloseButton={false} className="flex max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[760px]" onEscapeKeyDown={(event) => { if (writing.current) event.preventDefault(); }} onInteractOutside={(event) => event.preventDefault()}>
      <header className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div><DialogTitle className="text-base text-[#003366]">Choferes del vehículo</DialogTitle><DialogDescription className="mt-1 text-xs">{workspace ? [workspace.vehicle.businessCode, workspace.vehicle.plate].filter(Boolean).join(" · ") : "Asignaciones y autorizaciones temporales"}</DialogDescription></div>
        <div className="flex items-center gap-1"><AdministrationHelp title="Choferes del vehículo"><p>El chofer habitual queda vinculado al vehículo. El uso temporal requiere una solicitud con fecha, hora y motivo, y la decisión del responsable de Flota o Logística.</p><p>Las horas corresponden a Santo Domingo (UTC−04:00). Al terminar el intervalo, la autorización deja de estar vigente. Revocarla conserva su historial.</p><p>Una autorización no asigna viajes ni cambia el vehículo a En uso. Tampoco reemplaza al chofer habitual.</p><p>Los permisos para asignar, solicitar y autorizar se administran en Usuarios y roles.</p></AdministrationHelp><AdministrationIconAction label="Recargar choferes" disabled={saving || loading} onClick={reload}><RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></AdministrationIconAction><AdministrationIconAction label="Cerrar choferes" disabled={saving} onClick={close}><X aria-hidden="true" className="h-4 w-4" /></AdministrationIconAction></div>
      </header>
      <div className="min-h-0 min-w-0 overflow-y-auto px-4 py-3">
        {(mutationError || readError) && <div role="alert" className="mb-3 text-xs leading-5 text-red-800"><p>{mutationError || readError}</p>{mustReload && <p>El borrador se conserva. Recargue los datos para comprobar el estado antes de volver a guardar.</p>}</div>}
        {saved && <p role="status" className="mb-3 text-xs text-emerald-800">{saved}</p>}
        {retired && <p className="mb-3 text-xs text-slate-500">{canAuthorize ? "Vehículo retirado. Puede consultar el historial y revocar autorizaciones existentes." : "Vehículo retirado. Asignaciones disponibles para consulta."}</p>}
        {loading && <p role="status" className="mb-3 py-2 text-center text-xs text-slate-500">Cargando choferes…</p>}
        {view ? <>
          <div className="mb-3 flex items-center gap-2"><button type="button" aria-label="Volver a choferes" disabled={saving} onClick={() => setView(null)} className="inline-flex h-9 w-9 items-center justify-center rounded text-slate-600 hover:bg-slate-50 disabled:opacity-40"><ArrowLeft aria-hidden="true" className="h-4 w-4" /></button><h3 className="text-sm font-semibold text-slate-900">{mainTitle}</h3></div>
          {view.kind === "DETAIL" ? <><p className="mb-3 text-[11px] text-slate-500">{FLEET_DRIVER_TIMEZONE_LABEL}</p>{detailRecord ? <DriverDetail entry={detailRecord} /> : !loading && <p className="text-xs text-slate-500">El registro ya no aparece en esta página. Vuelva al historial para localizarlo.</p>}</> : <form id="fleet-driver-form" onSubmit={(event) => { event.preventDefault(); void submit(); }} className="space-y-3">
            {(view.kind === "PRIMARY" || view.kind === "REQUEST") && <FleetDriverPicker api={api} label={view.kind === "PRIMARY" ? "Chofer habitual" : "Chofer temporal"} value={view.driver} onChange={changePerson} disabled={Boolean(locked || !canSubmit)} allowClear={view.kind === "PRIMARY"} onUnauthorized={onUnauthorized} />}
            {view.kind === "PRIMARY" && workspace && <p className="text-[11px] text-slate-500">Asignación guardada: {workspace.primaryDriver?.driver?.displayName || "Sin asignar"}.</p>}
            {view.kind === "REQUEST" && <div><div className="flex flex-wrap gap-3"><label className="flex min-w-0 flex-col text-xs font-medium text-slate-600">Desde<input type="datetime-local" aria-label="Uso temporal desde" value={view.startsAt} required disabled={Boolean(locked || !canSubmit)} onChange={(event) => { const startsAt = event.target.value; setView((current) => current?.kind === "REQUEST" ? { ...current, startsAt } : current); }} className={`${fieldClass} h-10 w-[14rem] max-w-full tabular-nums sm:h-9`} /></label><label className="flex min-w-0 flex-col text-xs font-medium text-slate-600">Hasta<input type="datetime-local" aria-label="Uso temporal hasta" value={view.endsAt} required disabled={Boolean(locked || !canSubmit)} onChange={(event) => { const endsAt = event.target.value; setView((current) => current?.kind === "REQUEST" ? { ...current, endsAt } : current); }} className={`${fieldClass} h-10 w-[14rem] max-w-full tabular-nums sm:h-9`} /></label></div><p className="mt-1 text-[11px] text-slate-500">{FLEET_DRIVER_TIMEZONE_LABEL}</p></div>}
            {view.kind === "DECISION" && <><p className="text-xs font-semibold text-slate-800">{view.entry.driver.displayName}</p><p className="text-xs text-slate-600">{formatFleetDriverDate(view.entry.startsAt)} — {formatFleetDriverDate(view.entry.endsAt)}</p><p className="text-[11px] text-slate-500">{FLEET_DRIVER_TIMEZONE_LABEL}</p><p className="whitespace-pre-wrap break-words text-xs text-slate-700">{view.entry.reason}</p>{!loading && !canSubmit && <p className="text-xs text-amber-900">Esta solicitud ya no admite esa decisión. Vuelva al listado para revisar su estado actual.</p>}</>}
            <label className="block text-xs font-medium text-slate-600">{view.kind === "DECISION" ? view.action === "APPROVE" ? "Observación (opcional)" : "Motivo de la decisión" : "Motivo"}<textarea aria-label={view.kind === "DECISION" ? view.action === "APPROVE" ? "Observación de aprobación" : "Motivo de la decisión" : view.kind === "PRIMARY" ? "Motivo del cambio de chofer" : "Motivo del uso temporal"} value={view.reason} required={view.kind !== "DECISION" || view.action !== "APPROVE"} maxLength={500} disabled={Boolean(locked || !canSubmit)} onChange={(event) => changeReason(event.target.value)} className={`${fieldClass} min-h-20 w-full resize-y py-2`} /></label>
          </form>}
        </> : workspace && !loading && !readError ? <>
          <div className="mb-3 flex min-w-0 items-center justify-between gap-3 border-b border-slate-200 pb-3"><div className="min-w-0"><p className="text-[11px] font-medium text-slate-500">Chofer habitual</p><p className="mt-0.5 break-words text-sm font-semibold text-slate-900">{workspace.primaryDriver?.driver?.displayName || "Sin asignar"}</p>{workspace.primaryDriver?.driver && !workspace.primaryDriver.driverEligible && <p className="mt-0.5 text-[11px] text-amber-800">El chofer ya no está habilitado.</p>}</div>{canAssign && !retired && <AdministrationIconAction label="Cambiar chofer habitual" disabled={Boolean(locked)} onClick={() => openView({ kind: "PRIMARY", driver: workspace.primaryDriver?.driver ?? null, reason: "" })}><Pencil aria-hidden="true" className="h-4 w-4" /></AdministrationIconAction>}</div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div className="flex gap-1" role="group" aria-label="Historial de choferes"><button type="button" aria-pressed={historyKind === "TEMPORARY"} disabled={saving} onClick={() => { setHistoryKind("TEMPORARY"); setPage(1); }} className={`min-h-9 rounded px-2.5 text-xs font-medium ${historyKind === "TEMPORARY" ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:bg-slate-50"}`}>Uso temporal</button><button type="button" aria-pressed={historyKind === "PRIMARY"} disabled={saving} onClick={() => { setHistoryKind("PRIMARY"); setPage(1); }} className={`min-h-9 rounded px-2.5 text-xs font-medium ${historyKind === "PRIMARY" ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:bg-slate-50"}`}>Historial habitual</button></div>{canRequest && !retired && <AdministrationIconAction label="Solicitar uso temporal" disabled={Boolean(locked)} onClick={() => openView({ kind: "REQUEST", driver: null, startsAt: "", endsAt: "", reason: "" })}><Plus aria-hidden="true" className="h-4 w-4" /></AdministrationIconAction>}</div>
          <p className="mb-2 text-[11px] text-slate-500">{FLEET_DRIVER_TIMEZONE_LABEL}</p><FleetDriverHistory workspace={workspace} disabled={saving} canAuthorize={canAuthorize && !locked} retired={Boolean(retired)} onDetail={(entry) => openView({ kind: "DETAIL", entry })} onDecision={(entry, action) => openView({ kind: "DECISION", entry, action, reason: "" })} onPage={setPage} />
          {!canAssign && !canRequest && !canAuthorize && <p className="mt-2 text-xs text-slate-500">Consulta de choferes. Los permisos específicos se asignan en Usuarios y roles.</p>}
        </> : null}
      </div>
      {view && <footer data-testid="fleet-drivers-footer" className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3"><button type="button" disabled={saving} onClick={() => setView(null)} className={actionClass}>{view.kind === "DETAIL" ? "Volver" : "Cancelar"}</button>{view.kind !== "DETAIL" && <button type="submit" form="fleet-driver-form" disabled={Boolean(locked || !canSubmit)} className={`${actionClass} border-[#003366] bg-[#003366] text-white hover:bg-[#00264d]`}><Save aria-hidden="true" className="h-4 w-4" />{saving ? "Guardando…" : view.kind === "PRIMARY" ? "Guardar habitual" : view.kind === "REQUEST" ? "Enviar solicitud" : decisionLabels[view.action]}</button>}</footer>}
    </DialogContent>
  </Dialog>;
}
