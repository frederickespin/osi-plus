import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, LoaderCircle, MapPin, MapPinned, Save } from "lucide-react";
import { AdministrationIconAction } from "@/administration/AdministrationHelp";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { isLogisticsUiEnabled } from "@/logistics-engine/mode";
import { CASE_ROUTE_MAX_STOPS, CaseRouteApi, CaseRouteClientError, type CaseRouteAddress, type CaseRouteOption, type CaseRouteStop, type CaseRouteWorkspace } from "./caseRouteApi";
import CaseRouteStops, { type RouteDraftStop } from "./CaseRouteStops";
import type { RouteMapChoice } from "./CaseRouteMap";

const CaseRouteMap = lazy(() => import("./CaseRouteMap"));
type EditableAddress = { -readonly [K in keyof CaseRouteAddress]: CaseRouteAddress[K] };
const field = "mt-1 h-8 w-full rounded-sm border-0 bg-slate-100 px-2 text-sm font-normal text-slate-900 outline-none focus:bg-sky-50 focus-visible:ring-2 focus-visible:ring-sky-600";
const label = "text-[10px] font-bold uppercase tracking-wide text-slate-600";
const blankAddress = (): EditableAddress => ({ sourceAddressRef: null, countryCode: "DO", provinceState: "", cityMunicipality: "", sector: "", streetAndNumber: "", buildingResidential: "", floorUnit: "", arrivalReference: "", locationContactName: "", locationContactPhone: "" });
const edit = (value: CaseRouteAddress | null): EditableAddress => value ? { ...value } : blankAddress();
const clean = (value: EditableAddress): CaseRouteAddress => Object.freeze({ ...value, countryCode: value.countryCode.trim().toUpperCase(), provinceState: value.provinceState?.trim() || null, cityMunicipality: value.cityMunicipality.trim(), sector: value.sector?.trim() || null, streetAndNumber: value.streetAndNumber?.trim() || null, buildingResidential: value.buildingResidential?.trim() || null, floorUnit: value.floorUnit?.trim() || null, arrivalReference: value.arrivalReference?.trim() || null, locationContactName: value.locationContactName?.trim() || null, locationContactPhone: value.locationContactPhone?.trim() || null });
const valid = (value: EditableAddress) => /^[A-Z]{2}$/.test(value.countryCode.trim().toUpperCase()) && value.cityMunicipality.trim().length >= 2 && (value.countryCode.trim().toUpperCase() !== "DO" || Boolean(value.provinceState?.trim() && value.streetAndNumber?.trim()));
const errorText = (cause: unknown) => {
  const code = cause instanceof CaseRouteClientError ? cause.code : "";
  const messages: Record<string, string> = {
    COMMERCIAL_AUTH_REQUIRED: "La sesión terminó. Inicia sesión nuevamente.",
    CRM_PIPELINE_PERMISSION_FORBIDDEN: "Tu usuario no tiene permiso para modificar esta ruta.",
    CRM_PIPELINE_VERSION_CONFLICT: "El caso cambió en otra sesión. Cierra, actualiza y vuelve a intentarlo.",
    CRM_CASE_ROUTE_ADDRESS_UNAVAILABLE: "La dirección registrada ya no está disponible. Selecciona otra dirección.",
    CRM_CASE_ROUTE_STOP_KIND_REQUIRED: "Selecciona «Recogida» o «Entrega» para la parada que cambiaste.",
    CRM_PIPELINE_RESOURCE_NOT_FOUND: "No encontramos el caso o la dirección solicitada.",
  };
  return messages[code] || "No se pudo completar la operación de la ruta. Actualiza e intenta de nuevo.";
};
const geographicalFields = new Set<keyof EditableAddress>(["countryCode", "provinceState", "cityMunicipality", "sector", "streetAndNumber", "buildingResidential"]);
const stopValue = (stop: CaseRouteStop): CaseRouteStop => ({ kind: stop.kind, address: clean(stop.address) });

function optionText(option: CaseRouteOption) {
  const address = [option.address.streetAndNumber, option.address.sector, option.address.cityMunicipality].filter(Boolean).join(", ");
  return option.source === "REGISTERED" ? `${option.label} · ${address}` : `${option.label} · ${option.serviceType || "Servicio anterior"} · ${address}`;
}

function AddressEditor({ title, value, options, source, onSource, onChange, onMap, hasCurrent = true }: Readonly<{ title: string; value: EditableAddress; options: readonly CaseRouteOption[]; source: string; onSource(value: string): void; onChange(value: EditableAddress): void; onMap?(): void; hasCurrent?: boolean }>) {
  const [expanded, setExpanded] = useState(!valid(value));
  const selectSource = (next: string) => {
    if (next === "MANUAL") setExpanded(true);
    onSource(next);
  };
  const update = <K extends keyof EditableAddress>(key: K, next: EditableAddress[K]) => {
    onChange({ ...value, [key]: next, sourceAddressRef: null, ...(geographicalFields.has(key) && value.point ? { point: null } : {}) });
  };
  return <fieldset className="min-w-0 space-y-1.5">
    <legend className="px-1 text-sm font-black text-[#003366]"><span className="inline-flex items-center gap-1">
      {title}
      {onMap && value.countryCode === "DO" && <AdministrationIconAction label={`Buscar ${title.toLowerCase()} en el mapa`} onClick={onMap}><MapPinned className={value.point ? "size-4 text-sky-700" : "size-4"} aria-hidden="true" /></AdministrationIconAction>}
    </span></legend>
    <label className={label}>Seleccionar dirección<select className={field} value={source} onChange={(event) => selectSource(event.target.value)}>{hasCurrent && <option value="CURRENT">Dirección actual de este caso</option>}{options.some((option) => option.source === "REGISTERED") && <optgroup label="Direcciones registradas del cliente">{options.filter((option) => option.source === "REGISTERED").map((option) => <option key={option.optionId} value={option.optionId}>{optionText(option)}</option>)}</optgroup>}{options.some((option) => option.source === "RECENT_SERVICE") && <optgroup label="Direcciones de los dos últimos servicios">{options.filter((option) => option.source === "RECENT_SERVICE").map((option) => <option key={option.optionId} value={option.optionId}>{optionText(option)}</option>)}</optgroup>}<option value="MANUAL">Otra dirección para este caso</option></select></label>
    <button type="button" className="flex w-full items-center justify-between gap-1 py-1 text-left text-xs font-medium text-sky-800"
      aria-expanded={expanded} aria-label={`Detalles de dirección de ${title.toLowerCase()}`} onClick={() => setExpanded(!expanded)}>
      {[value.streetAndNumber, value.cityMunicipality].filter(Boolean).join(", ") || "Completar dirección"}
      <ChevronDown className={expanded ? "size-4 shrink-0 rotate-180" : "size-4 shrink-0"} aria-hidden="true" />
    </button>
    <div className={expanded ? "grid gap-2 sm:grid-cols-2" : "hidden"}>
      <label className={label}>País<input className={field} maxLength={2} value={value.countryCode} onChange={(event) => update("countryCode", event.target.value.toUpperCase())} /></label>
      <label className={label}>Provincia / estado<input className={field} value={value.provinceState || ""} onChange={(event) => update("provinceState", event.target.value)} /></label>
      <label className={label}>Ciudad / municipio<input className={field} value={value.cityMunicipality} onChange={(event) => update("cityMunicipality", event.target.value)} /></label>
      <label className={label}>Sector<input className={field} value={value.sector || ""} onChange={(event) => update("sector", event.target.value)} /></label>
      <label className={`${label} sm:col-span-2`}>Calle y número<input className={field} value={value.streetAndNumber || ""} onChange={(event) => update("streetAndNumber", event.target.value)} /></label>
      <label className={label}>Edificio / residencial<input className={field} value={value.buildingResidential || ""} onChange={(event) => update("buildingResidential", event.target.value)} /></label>
      <label className={label}>Piso / apartamento / local<input className={field} value={value.floorUnit || ""} onChange={(event) => update("floorUnit", event.target.value)} /></label>
      <label className={`${label} sm:col-span-2`}>Referencia de llegada<input className={field} value={value.arrivalReference || ""} onChange={(event) => update("arrivalReference", event.target.value)} /></label>
    </div>
  </fieldset>;
}

export default function CaseRouteEditor({ open, embedded = false, savedRevision, caseRef, api, onOpenChange, onSaved, renderTravel }: Readonly<{ open: boolean; embedded?: boolean; savedRevision?: number; caseRef: string; api: CaseRouteApi; onOpenChange?(open: boolean): void; onSaved(revision: number): void; renderTravel?(revision: number, changed: boolean): ReactNode }>) {
  const [workspace, setWorkspace] = useState<CaseRouteWorkspace | null>(null);
  const [origin, setOrigin] = useState<EditableAddress>(blankAddress);
  const [destination, setDestination] = useState<EditableAddress>(blankAddress);
  const [destinationStatus, setDestinationStatus] = useState<CaseRouteWorkspace["route"]["destinationStatus"]>("CONFIRMED");
  const [originSource, setOriginSource] = useState("CURRENT");
  const [destinationSource, setDestinationSource] = useState("CURRENT");
  const [stops, setStops] = useState<RouteDraftStop[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [mapEnd, setMapEnd] = useState<string | null>(null);
  const [loading, setLoading] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  function applyWorkspace(value: CaseRouteWorkspace) {
    setWorkspace(value); setOrigin(edit(value.route.origin)); setDestination(edit(value.route.destination));
    setDestinationStatus(value.route.destinationStatus); setOriginSource("CURRENT"); setDestinationSource("CURRENT");
    setStops(value.route.stops.map((stop, index) => ({ ...stop, id: String(index), original: stop.address, source: "CURRENT" })));
    setExpanded(null);
  }
  useEffect(() => {
    if (!open) return undefined;
    let active = true; setLoading(true); setWorkspace(null); setError(""); setMapEnd(null);
    void api.workspace(caseRef).then((value) => { if (active) applyWorkspace(value); }).catch((cause) => { if (active) setError(errorText(cause)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, caseRef, open, reload]);
  function setAddress(target: string, address: CaseRouteAddress, source = "MANUAL") {
    if (target === "origin") { setOrigin(address); setOriginSource(source); }
    else if (target === "destination") { setDestination(address); setDestinationSource(source); }
    else setStops((rows) => rows.map((row) => row.id === target ? { ...row, address, source } : row));
  }
  function select(value: string, target: string) {
    setMapEnd(null);
    const option = workspace?.options.find((candidate) => candidate.optionId === value);
    const saved = target === "origin" ? workspace?.route.origin : target === "destination" ? workspace?.route.destination : stops.find((row) => row.id === target)?.original;
    setAddress(target, edit(option?.address ?? (value === "CURRENT" ? saved : null) ?? null), value);
  }
  function applyMap(target: string, current: CaseRouteAddress, choice: RouteMapChoice) {
    const place = choice.address;
    setAddress(target, {
      ...current, countryCode: "DO", sourceAddressRef: null, point: choice.point,
      cityMunicipality: place?.city.slice(0, 160) || current.cityMunicipality,
      provinceState: place?.province.slice(0, 160) || current.provinceState,
      sector: place ? place.sector.slice(0, 160) || null : current.sector,
      streetAndNumber: place?.street.slice(0, 240) || current.streetAndNumber,
    });
    setMapEnd(null);
  }
  const stopsChanged = workspace && JSON.stringify(stops.map(stopValue)) !== JSON.stringify(workspace.route.stops.map(stopValue));
  const changed = !!workspace && (Boolean(stopsChanged) || JSON.stringify(clean(origin)) !== JSON.stringify(clean(edit(workspace.route.origin))) ||
    destinationStatus !== workspace.route.destinationStatus ||
    (destinationStatus !== "PENDING" && JSON.stringify(clean(destination)) !== JSON.stringify(clean(edit(workspace.route.destination)))));
  const canSave = changed && valid(origin) && (destinationStatus === "PENDING" || valid(destination)) && stops.every((stop) => valid(stop.address));
  function addStop(kind: "PICKUP" | "DELIVERY") {
    if (stops.length >= CASE_ROUTE_MAX_STOPS) return;
    const id = crypto.randomUUID();
    setStops((rows) => [...rows, { kind, address: blankAddress(), original: null, source: "MANUAL", id }]);
    setExpanded(id); setMapEnd(null);
  }
  function moveStop(index: number, offset: -1 | 1) {
    setStops((stops) => {
      const next = [...stops];
      const to = index + offset;
      if (!next[index] || !next[to]) return stops;
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  }
  const save = async () => {
    if (!workspace || !canSave || saving) return;
    setSaving(true); setError("");
    try {
      const updated = await api.update(caseRef, { expectedVersion: workspace.version, expectedRouteRevision: workspace.route.revision, destinationStatus, origin: clean(origin), destination: destinationStatus === "PENDING" ? null : clean(destination), ...(stopsChanged && { stops: stops.map(stopValue) }) });
      applyWorkspace(updated); setMapEnd(null); onSaved(updated.route.revision); onOpenChange?.(false);
    }
    catch (cause) { setError(errorText(cause)); }
    finally { setSaving(false); }
  };
  function renderMap(target: string, title: string, address: CaseRouteAddress) {
    if (mapEnd !== target) return null;
    return <Suspense fallback={<p role="status" className="text-xs text-slate-500">Cargando mapa…</p>}>
      <CaseRouteMap key={target} api={api} caseRef={caseRef} title={title} initialPoint={address.point} disabled={saving}
        onApply={(choice) => applyMap(target, address, choice)} onClose={() => setMapEnd(null)} />
    </Suspense>;
  }
  const body = <>
      {loading && <div className="grid min-h-56 place-items-center text-sm text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" />Cargando direcciones…</div>}
      {error && <p role="alert" className="bg-red-50 px-2 py-1 text-sm text-red-800">{error} <button className="underline" onClick={() => setReload((value) => value + 1)}>Recargar direcciones</button></p>}
      {workspace && !loading && <>
        {changed && <p className="text-xs text-amber-900"><AlertTriangle className="mr-1 inline h-4 w-4" />Al guardar, revisa la distancia, el transporte y la visita para esta ruta.</p>}
        <fieldset disabled={saving} className="grid min-w-0 gap-3 lg:grid-cols-2">
          <div><AddressEditor title="Origen" value={origin} options={workspace.options} source={originSource} onSource={(value) => select(value, "origin")} onChange={(address) => setAddress("origin", address)} onMap={isLogisticsUiEnabled() ? () => setMapEnd("origin") : undefined} />
            {renderMap("origin", "Mapa del origen", origin)}
          </div>
          <div className="space-y-3">
            {destinationStatus !== "PENDING" && <AddressEditor title="Destino" value={destination} options={workspace.options} source={destinationSource} onSource={(value) => select(value, "destination")} onChange={(address) => setAddress("destination", address)} onMap={isLogisticsUiEnabled() ? () => setMapEnd("destination") : undefined} />}
            {renderMap("destination", "Mapa del destino", destination)}
            <label className={label + " block max-w-56"}>Estado del destino
              <select className={field} value={destinationStatus} onChange={(event) => { setDestinationStatus(event.target.value as CaseRouteWorkspace["route"]["destinationStatus"]); if (mapEnd === "destination") setMapEnd(null); }}>
                <option value="CONFIRMED">Confirmado</option><option value="APPROXIMATE">Aproximado</option><option value="PENDING">Pendiente de confirmar</option>
              </select>
            </label>
          </div>
        </fieldset>
        <CaseRouteStops stops={stops} origin={origin} destination={destinationStatus === "PENDING" ? null : destination}
          expanded={expanded} disabled={saving} onAdd={addStop} onMove={moveStop}
          onToggle={(id) => { setExpanded((current) => current === id ? null : id); setMapEnd(null); }}
          onKind={(id, kind) => setStops((rows) => rows.map((row) => row.id === id ? { ...row, kind } : row))}
          onRemove={(id) => { setStops((rows) => rows.filter((row) => row.id !== id)); if (mapEnd === id) setMapEnd(null); if (expanded === id) setExpanded(null); }}
          renderEditor={(stop, index) => <fieldset disabled={saving} className="min-w-0">
            <AddressEditor title={`Parada ${index + 1}`} value={stop.address} options={workspace.options} source={stop.source} hasCurrent={!!stop.original}
              onSource={(value) => select(value, stop.id)} onChange={(address) => setAddress(stop.id, address)}
              onMap={isLogisticsUiEnabled() ? () => setMapEnd(stop.id) : undefined} />
            {renderMap(stop.id, `Mapa de la parada ${index + 1}`, stop.address)}
          </fieldset>} />
        {renderTravel?.(workspace.route.revision, changed)}
      </>}
      <div className="flex items-center justify-end gap-2">
        {embedded && workspace && savedRevision === workspace.route.revision && !changed && <span role="status" className="text-xs text-emerald-700">Direcciones guardadas</span>}
        {!embedded && <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => onOpenChange?.(false)}>Cancelar</Button>}
        <Button type="button" size="sm" disabled={!canSave || saving} onClick={() => void save()}>{saving ? <LoaderCircle className="animate-spin" /> : <Save />}{saving ? "Guardando…" : "Guardar ruta"}</Button>
      </div>
  </>;
  if (embedded) return <section aria-label="Direcciones del caso" data-testid="case-route-editor" className="space-y-3">{body}</section>;
  return <Dialog open={open} onOpenChange={(value) => { if (!saving) onOpenChange?.(value); }}>
    <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-5xl" data-testid="case-route-editor">
      <DialogHeader><DialogTitle className="flex items-center gap-2 text-[#003366]"><MapPin className="h-5 w-5" />Ruta del caso</DialogTitle><DialogDescription>Selecciona el origen y el destino del servicio.</DialogDescription></DialogHeader>
      {body}
    </DialogContent>
  </Dialog>;
}
