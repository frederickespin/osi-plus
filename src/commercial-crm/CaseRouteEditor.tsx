import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, LoaderCircle, MapPin, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CaseRouteApi, CaseRouteClientError, type CaseRouteAddress, type CaseRouteOption, type CaseRouteWorkspace } from "./caseRouteApi";

type EditableAddress = { -readonly [K in keyof CaseRouteAddress]: CaseRouteAddress[K] };
const field = "mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-100";
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
    CRM_PIPELINE_RESOURCE_NOT_FOUND: "No encontramos el caso o la dirección solicitada.",
  };
  return messages[code] || "No se pudo completar la operación de la ruta. Actualiza e intenta de nuevo.";
};

function optionText(option: CaseRouteOption) {
  const address = [option.address.streetAndNumber, option.address.sector, option.address.cityMunicipality].filter(Boolean).join(", ");
  return option.source === "REGISTERED" ? `${option.label} · ${address}` : `${option.label} · ${option.serviceType || "Servicio anterior"} · ${address}`;
}

function AddressEditor({ title, value, options, source, onSource, onChange }: Readonly<{ title: string; value: EditableAddress; options: readonly CaseRouteOption[]; source: string; onSource(value: string): void; onChange(value: EditableAddress): void }>) {
  const update = <K extends keyof EditableAddress>(key: K, next: EditableAddress[K]) => { onSource("MANUAL"); onChange({ ...value, [key]: next, ...(key === "sourceAddressRef" ? {} : { sourceAddressRef: null }) }); };
  return <fieldset className="rounded-xl border border-slate-200 p-3">
    <legend className="px-1 text-sm font-black text-[#003366]">{title}</legend>
    <label className={label}>Seleccionar dirección<select className={field} value={source} onChange={(event) => onSource(event.target.value)}><option value="CURRENT">Dirección actual de este caso</option>{options.some((option) => option.source === "REGISTERED") && <optgroup label="Direcciones registradas del cliente">{options.filter((option) => option.source === "REGISTERED").map((option) => <option key={option.optionId} value={option.optionId}>{optionText(option)}</option>)}</optgroup>}{options.some((option) => option.source === "RECENT_SERVICE") && <optgroup label="Direcciones de los dos últimos servicios">{options.filter((option) => option.source === "RECENT_SERVICE").map((option) => <option key={option.optionId} value={option.optionId}>{optionText(option)}</option>)}</optgroup>}<option value="MANUAL">Otra dirección para este caso</option></select></label>
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
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

export default function CaseRouteEditor({ open, caseRef, api, onOpenChange, onSaved }: Readonly<{ open: boolean; caseRef: string; api: CaseRouteApi; onOpenChange(open: boolean): void; onSaved(): void }>) {
  const [workspace, setWorkspace] = useState<CaseRouteWorkspace | null>(null);
  const [origin, setOrigin] = useState<EditableAddress>(blankAddress);
  const [destination, setDestination] = useState<EditableAddress>(blankAddress);
  const [destinationStatus, setDestinationStatus] = useState<CaseRouteWorkspace["route"]["destinationStatus"]>("CONFIRMED");
  const [originSource, setOriginSource] = useState("CURRENT");
  const [destinationSource, setDestinationSource] = useState("CURRENT");
  const [loading, setLoading] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return undefined;
    let active = true; setLoading(true); setError("");
    void api.workspace(caseRef).then((value) => { if (!active) return; setWorkspace(value); setOrigin(edit(value.route.origin)); setDestination(edit(value.route.destination)); setDestinationStatus(value.route.destinationStatus); setOriginSource("CURRENT"); setDestinationSource("CURRENT"); }).catch((cause) => { if (active) setError(errorText(cause)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, caseRef, open]);
  const select = (value: string, current: "origin" | "destination") => {
    const option = workspace?.options.find((candidate) => candidate.optionId === value);
    if (current === "origin") { setOriginSource(value); if (option) setOrigin(edit(option.address)); else if (value === "MANUAL") setOrigin(blankAddress()); else if (workspace) setOrigin(edit(workspace.route.origin)); }
    else { setDestinationSource(value); if (option) setDestination(edit(option.address)); else if (value === "MANUAL") setDestination(blankAddress()); else if (workspace) setDestination(edit(workspace.route.destination)); }
  };
  const canSave = useMemo(() => Boolean(workspace && valid(origin) && (destinationStatus === "PENDING" || valid(destination))), [destination, destinationStatus, origin, workspace]);
  const save = async () => {
    if (!workspace || !canSave || saving) return;
    setSaving(true); setError("");
    try { await api.update(caseRef, { expectedVersion: workspace.version, expectedRouteRevision: workspace.route.revision, destinationStatus, origin: clean(origin), destination: destinationStatus === "PENDING" ? null : clean(destination) }); onSaved(); onOpenChange(false); }
    catch (cause) { setError(errorText(cause)); }
    finally { setSaving(false); }
  };
  return <Dialog open={open} onOpenChange={(value) => { if (!saving) onOpenChange(value); }}>
    <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-5xl" data-testid="case-route-editor">
      <DialogHeader><DialogTitle className="flex items-center gap-2 text-[#003366]"><MapPin className="h-5 w-5" />Ruta del caso</DialogTitle><DialogDescription>Estas direcciones pertenecen al servicio. No modifican la dirección maestra del cliente.</DialogDescription></DialogHeader>
      {loading && <div className="grid min-h-56 place-items-center text-sm text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" />Cargando direcciones…</div>}
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{error}</p>}
      {workspace && !loading && <>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"><AlertTriangle className="mr-1 inline h-4 w-4" />Al guardar se crea una nueva versión de la ruta y deberán revisarse geocerca, distancia, visita, transporte y agenda.</div>
        <div className="grid gap-3 lg:grid-cols-2"><AddressEditor title="Origen" value={origin} options={workspace.options} source={originSource} onSource={(value) => select(value, "origin")} onChange={setOrigin} /><div className="space-y-3"><label className={label}>Estado del destino<select className={field} value={destinationStatus} onChange={(event) => setDestinationStatus(event.target.value as CaseRouteWorkspace["route"]["destinationStatus"])}><option value="CONFIRMED">Confirmado</option><option value="APPROXIMATE">Aproximado</option><option value="PENDING">Pendiente de confirmar</option></select></label>{destinationStatus !== "PENDING" && <AddressEditor title="Destino" value={destination} options={workspace.options} source={destinationSource} onSource={(value) => select(value, "destination")} onChange={setDestination} />}</div></div>
      </>}
      <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancelar</Button><Button type="button" disabled={!canSave || saving} onClick={() => void save()}>{saving ? <LoaderCircle className="animate-spin" /> : <Save />}{saving ? "Guardando…" : "Guardar ruta"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
