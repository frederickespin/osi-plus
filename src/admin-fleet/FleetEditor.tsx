import { useEffect, useRef, useState } from "react";
import { Archive, RefreshCw, Save, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AdministrationHelp, AdministrationIconAction } from "@/administration/AdministrationHelp";
import { FleetApi, FleetApiError, fleetErrorText } from "./api";
import FleetFields from "./FleetFields";
import FleetAvailabilityFields from "./FleetAvailabilityFields";
import type { FleetVehicle, VehicleValues } from "./types";
import { hasVehicleChanges, vehicleChanges, vehicleDraft, vehicleValues, type VehicleDraft } from "./vehicleForm";

export default function FleetEditor({ api, vehicleRef, canEdit, section = "details", onClose, onSaved, onUnauthorized }: {
  api: FleetApi;
  vehicleRef: string | null;
  canEdit: boolean;
  section?: "details" | "availability";
  onClose(): void;
  onSaved(vehicle: FleetVehicle): void;
  onUnauthorized(): void;
}) {
  const [vehicle, setVehicle] = useState<FleetVehicle | null>(null);
  const [draft, setDraft] = useState<VehicleDraft | null>(() => vehicleRef ? null : vehicleDraft());
  const [loading, setLoading] = useState(Boolean(vehicleRef));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mustReload, setMustReload] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmRetirement, setConfirmRetirement] = useState(false);
  const [reload, setReload] = useState(0);
  const writing = useRef(false);
  const pending = useRef(new Set<AbortController>());
  const callbacks = useRef({ onSaved, onUnauthorized });
  useEffect(() => { callbacks.current = { onSaved, onUnauthorized }; }, [onSaved, onUnauthorized]);
  useEffect(() => {
    const requests = pending.current;
    return () => { requests.forEach((controller) => controller.abort()); requests.clear(); };
  }, [api]);
  const readRef = vehicle?.vehicleRef || vehicleRef;
  useEffect(() => {
    if (!vehicleRef && reload === 0 || !readRef) return undefined;
    const controller = new AbortController(); const requests = pending.current; requests.add(controller);
    setLoading(true); setError(null); setSaved(false); setConfirmRetirement(false);
    void api.get(readRef, controller.signal).then((value) => {
      if (controller.signal.aborted) return;
      setVehicle(value); setDraft(vehicleDraft(value)); setMustReload(false);
    }).catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      setMustReload(true);
      if (cause instanceof FleetApiError && cause.status === 401) callbacks.current.onUnauthorized();
      else setError(fleetErrorText(cause));
    }).finally(() => { requests.delete(controller); if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); requests.delete(controller); };
  }, [api, vehicleRef, readRef, reload]);

  const retired = vehicle?.operationalStatus === "RETIRED";
  const availability = section === "availability" && Boolean(vehicleRef || vehicle);
  const editable = canEdit && !retired && !loading && !saving && !mustReload;
  const dirty = hasVehicleChanges(vehicle, draft);
  const save = async (retire = false) => {
    if (!editable || !draft || writing.current || !retire && !dirty || retire && (!vehicle || dirty)) return;
    let values: VehicleValues;
    try { values = vehicleValues(draft, vehicle || undefined); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Revise los datos de la ficha."); return; }
    const changes = vehicle ? retire ? { operationalStatus: "RETIRED" as const, availableForCalculation: false } : vehicleChanges(vehicle, values) : null;
    if (changes && Object.keys(changes).length === 0) { setDraft(vehicleDraft(vehicle!)); return; }
    const controller = new AbortController(); pending.current.add(controller);
    writing.current = true; setSaving(true); setError(null); setSaved(false);
    try {
      const result = vehicle
        ? await api.update(vehicle.vehicleRef, { requestId: crypto.randomUUID(), expectedVersion: vehicle.rowVersion, changes: changes! }, controller.signal)
        : await api.create({ requestId: crypto.randomUUID(), ...values }, controller.signal);
      if (controller.signal.aborted) return;
      setVehicle(result); setDraft(vehicleDraft(result)); setSaved(true); setConfirmRetirement(false);
      callbacks.current.onSaved(result);
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof FleetApiError && cause.status === 401) callbacks.current.onUnauthorized();
      else {
        const uncertain = !(cause instanceof FleetApiError) || cause.status >= 500
          || !["ADMIN_FLEET_INPUT_INVALID", "ADMIN_FLEET_DUPLICATE"].includes(cause.code);
        setMustReload(uncertain);
        setError(fleetErrorText(cause, retire ? "request" : availability ? "availability" : "details"));
      }
    } finally {
      pending.current.delete(controller);
      if (!controller.signal.aborted) { writing.current = false; setSaving(false); }
    }
  };
  const close = () => { if (!writing.current) onClose(); };

  return <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
    <DialogContent showCloseButton={false} className="flex max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[600px]"
      onEscapeKeyDown={(event) => { if (writing.current) event.preventDefault(); }} onInteractOutside={(event) => event.preventDefault()}>
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div><DialogTitle className="text-base text-[#003366]">{availability ? "Disponibilidad del vehículo" : vehicle || vehicleRef ? "Ficha de vehículo" : "Nuevo vehículo"}</DialogTitle><DialogDescription className="mt-1 text-xs">{vehicle ? [vehicle.businessCode, vehicle.plate].filter(Boolean).join(" · ") : vehicleRef ? "Consultando la ficha guardada." : "Código y tipo son obligatorios."}</DialogDescription></div>
        <div className="flex shrink-0 items-center gap-1"><AdministrationHelp title="Ficha de vehículo"><p>Registre la matrícula, las capacidades y las dimensiones en sus unidades reales. Los campos vacíos conservan el dato como desconocido.</p><p>Una ficha nueva se crea inactiva para planificación. Actívela desde la casilla Activo del listado; el menú de cada vehículo permite gestionar su disponibilidad.</p><p>El retiro es definitivo y conserva la ficha para consulta.</p></AdministrationHelp><AdministrationIconAction label="Cerrar ficha" disabled={saving} onClick={close}><X aria-hidden="true" className="h-4 w-4" /></AdministrationIconAction></div>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4" data-testid="fleet-editor-body">
        {loading && <p role="status" className="py-6 text-center text-sm text-slate-500">Cargando vehículo…</p>}
        {draft && (availability
          ? <FleetAvailabilityFields draft={draft} onChange={(value) => { setDraft(value); setSaved(false); setError(null); setConfirmRetirement(false); }} disabled={!editable} />
          : <FleetFields draft={draft} onChange={(value) => { setDraft(value); setSaved(false); setError(null); setConfirmRetirement(false); }} disabled={!editable} technicalLocked={Boolean(vehicle?.calculationLocked)} />)}
        {!vehicle && !vehicleRef && <p className="text-xs text-slate-500">Se crea inactivo. Puede activarlo después desde el listado.</p>}
        {!canEdit && <p className="text-xs text-slate-500">Acceso de consulta a la flota.</p>}
        {retired && <p className="rounded bg-slate-100 p-2 text-xs text-slate-600">Vehículo retirado{vehicle?.retiredAt ? ` el ${new Date(vehicle.retiredAt).toLocaleDateString("es")}` : ""}. La ficha se conserva para consulta.</p>}
        {vehicle && <p className="text-xs text-slate-500">Última actualización: {new Date(vehicle.updatedAt).toLocaleString("es")}</p>}
      </div>
      <footer className="shrink-0 space-y-2 border-t border-slate-200 bg-white px-4 py-3" data-testid="fleet-editor-footer">
        {error && <p role="alert" className="rounded bg-red-50 p-2 text-xs leading-5 text-red-800">{error}</p>}
        {mustReload && <p className="text-xs leading-5 text-slate-600">{readRef ? "El borrador se conserva. Recargar sustituirá los campos por la versión guardada." : "El alta no pudo confirmarse. Cierre y revise el listado antes de volver a registrar este vehículo."}</p>}
        {saved && <p role="status" className="text-xs font-medium text-emerald-700">{retired ? "Retiro guardado. La ficha permanece disponible." : "Vehículo guardado."}</p>}
        {confirmRetirement && <div className="space-y-2 rounded bg-amber-50 p-2 text-xs leading-5 text-amber-950"><p>¿Retirar {vehicle?.businessCode}? Se conservará para consulta y quedará fuera de nuevos cálculos. El retiro es definitivo.</p><div className="flex justify-end gap-2"><button type="button" disabled={saving} onClick={() => setConfirmRetirement(false)} className="min-h-9 rounded border border-amber-300 px-3 font-medium">Cancelar retiro</button><button type="button" disabled={!editable} onClick={() => void save(true)} className="min-h-9 rounded bg-amber-900 px-3 font-semibold text-white disabled:opacity-50">Confirmar retiro</button></div></div>}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {vehicle && !retired && canEdit && <AdministrationIconAction label={dirty ? "Guarde los cambios antes de retirar" : "Retirar vehículo"} disabled={!editable || dirty} onClick={() => setConfirmRetirement(true)} className="mr-auto text-amber-900"><Archive aria-hidden="true" className="h-4 w-4" /></AdministrationIconAction>}
          {readRef && (mustReload || error && !vehicle) && <button type="button" disabled={loading || saving} onClick={() => setReload((value) => value + 1)} className="inline-flex min-h-10 items-center gap-1.5 rounded border border-slate-300 px-3 text-xs font-medium text-slate-700 disabled:opacity-50"><RefreshCw aria-hidden="true" className="h-4 w-4" />Recargar ficha</button>}
          <button type="button" disabled={saving} onClick={close} className="min-h-10 rounded border border-slate-300 px-3 text-xs font-medium text-slate-600 disabled:opacity-50">Cerrar</button>
          {canEdit && !retired && <button type="button" disabled={!editable || !dirty || confirmRetirement} onClick={() => void save()} className="inline-flex min-h-10 items-center gap-1.5 rounded bg-[#003366] px-3 text-xs font-semibold text-white disabled:opacity-50"><Save aria-hidden="true" className="h-4 w-4" />{saving ? "Guardando…" : "Guardar vehículo"}</button>}
        </div>
      </footer>
    </DialogContent>
  </Dialog>;
}
