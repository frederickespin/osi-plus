import { lazy, Suspense, useMemo, useState, type FormEvent } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { AdministrationHelp } from "@/administration/AdministrationHelp";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { TransportBasis, TransportComponentInput, TransportComponentKind, TransportCoordinate, TransportPurpose, TransportZone, TransportZoneInput } from "./transportApi";
import { BASIS_LABELS, INCLUDED_KINDS, KIND_LABELS, PURPOSE_LABELS, STATE_LABELS, TRANSPORT_PURPOSES } from "./transportPresentation";

const TransportZoneMap = lazy(() => import("./TransportZoneMap"));
const field = "mt-1 block min-h-10 w-full rounded border border-slate-300 bg-white px-2 py-2 text-sm font-normal text-slate-900 disabled:bg-slate-50";
const numberField = `${field} max-w-24 tabular-nums`;
type PointDraft = { longitude: string; latitude: string };
type ComponentDraft = Omit<TransportComponentInput, "unitCost" | "minimumMarginBps" | "recommendedMarginBps"> & { key: string; unitCost: string; minimumMargin: string; recommendedMargin: string };
type Draft = {
  code: string; name: string; zoneType: "METRO" | "INTERIOR"; priority: string; vehicleType: string;
  purposes: TransportPurpose[]; points: PointDraft[]; mode: "ITEMIZED" | "FACTOR"; factor: string; currency: string;
  kmPerGallon: string; gallonUnit: "US" | "IMPERIAL"; fuelType: string; includedConcepts: TransportComponentKind[];
  components: ComponentDraft[]; state: "DRAFT" | "ACTIVE" | "INACTIVE";
};
type Props = Readonly<{
  zone: TransportZone | null; vehicleTypes: readonly string[]; saving: boolean; error: string | null; uncertain: boolean;
  readOnly?: boolean;
  onSave(input: TransportZoneInput): void; onClose(): void; onRefresh(): void;
}>;
const ALLOWED_BASES: Record<TransportComponentKind, readonly TransportBasis[]> = { BASE: ["TRIP"], FUEL: ["GALLON"], TOLL: ["PASS", "FIXED"], PER_DIEM: ["PERSON_DAY"], ALLOWANCE: ["PERSON_DAY", "FIXED", "TRIP"], OTHER: ["TRIP", "PASS", "PERSON_DAY", "FIXED", "KM"] };

function newComponent(kind: TransportComponentKind = "OTHER"): ComponentDraft {
  const basis: TransportBasis = kind === "FUEL" ? "GALLON" : kind === "TOLL" ? "PASS" : kind === "PER_DIEM" ? "PERSON_DAY" : kind === "BASE" ? "TRIP" : "FIXED";
  return { key: crypto.randomUUID(), code: "", label: "", kind, basis, unitCost: "", classification: "PR", minimumMargin: "", recommendedMargin: "", includedConcepts: [] };
}

function fromZone(zone: TransportZone | null): Draft {
  if (!zone) return { code: "", name: "", zoneType: "INTERIOR", priority: "100", vehicleType: "", purposes: [...TRANSPORT_PURPOSES], points: [], mode: "ITEMIZED", factor: "", currency: "DOP", kmPerGallon: "", gallonUnit: "US", fuelType: "", includedConcepts: [], components: [], state: "DRAFT" };
  const ring = zone.geometry.coordinates[0] || [];
  return {
    code: zone.code, name: zone.name, zoneType: zone.zoneType, priority: String(zone.priority), vehicleType: zone.vehicleType || "",
    purposes: [...zone.purposes], points: ring.slice(0, -1).map(([longitude, latitude]) => ({ longitude: String(longitude), latitude: String(latitude) })),
    mode: zone.mode, factor: zone.factor || "", currency: zone.currency, kmPerGallon: zone.kmPerGallon || "", gallonUnit: zone.gallonUnit,
    fuelType: zone.fuelType || "", includedConcepts: [...zone.includedConcepts], state: zone.state,
    components: zone.components.map((component) => ({ ...component, key: crypto.randomUUID(), unitCost: component.unitCost ?? "", minimumMargin: component.minimumMarginBps === null ? "" : String(component.minimumMarginBps / 100), recommendedMargin: component.recommendedMarginBps === null ? "" : String(component.recommendedMarginBps / 100) })),
  };
}

function coordinate(point: PointDraft): TransportCoordinate | null {
  const longitude = point.longitude.trim() ? Number(point.longitude) : NaN;
  const latitude = point.latitude.trim() ? Number(point.latitude) : NaN;
  return Number.isFinite(longitude) && Number.isFinite(latitude) && Math.abs(longitude) <= 180 && Math.abs(latitude) <= 90 ? [longitude, latitude] : null;
}

export default function TransportZoneEditor({ zone, vehicleTypes, saving, error, uncertain, readOnly = false, onSave, onClose, onRefresh }: Props) {
  const [draft, setDraft] = useState<Draft>(() => fromZone(zone));
  const [validation, setValidation] = useState<string | null>(null);
  const points = useMemo(() => draft.points.map(coordinate), [draft.points]);
  const mapPoints = useMemo(() => points.filter((point): point is TransportCoordinate => point !== null), [points]);
  const hasInvalidPoints = points.some((point) => point === null);
  const blocked = saving || uncertain || readOnly;
  const change = <K extends keyof Draft>(key: K, value: Draft[K]) => { setDraft((current) => ({ ...current, [key]: value })); setValidation(null); };
  const changeComponent = (key: string, changes: Partial<ComponentDraft>) => change("components", draft.components.map((component) => component.key === key ? { ...component, ...changes } : component));
  const setMode = (mode: Draft["mode"]) => {
    change("mode", mode);
    if (mode === "FACTOR" && !draft.components.some((component) => component.kind === "BASE")) change("components", [newComponent("BASE"), ...draft.components]);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (blocked) return;
    if (hasInvalidPoints || mapPoints.length < 3 || mapPoints.length > 200) { setValidation("Complete un perímetro de 3 a 200 puntos con latitud y longitud válidas."); return; }
    if (!draft.purposes.length) { setValidation("Seleccione al menos un uso para esta zona."); return; }
    if (!draft.components.length) { setValidation("Añada al menos un renglón de costo. Puede dejar su tarifa pendiente."); return; }
    if (draft.mode === "FACTOR" && draft.components.filter((component) => component.kind === "BASE").length !== 1) { setValidation("El cálculo por factor requiere una sola base de transporte."); return; }
    const codes = draft.components.map((component) => component.code.trim().toUpperCase());
    if (new Set(codes).size !== codes.length) { setValidation("Cada renglón necesita un código diferente."); return; }
    const components: TransportComponentInput[] = draft.components.map((component) => ({
      code: component.code.trim().toUpperCase(), label: component.label.trim(), kind: component.kind, basis: component.basis,
      unitCost: component.unitCost.trim() || null, classification: component.classification,
      minimumMarginBps: component.classification === "PR" && component.minimumMargin.trim() ? Math.round(Number(component.minimumMargin) * 100) : null,
      recommendedMarginBps: component.classification === "PR" && component.recommendedMargin.trim() ? Math.round(Number(component.recommendedMargin) * 100) : null,
      includedConcepts: component.includedConcepts,
    }));
    onSave({
      seriesRef: zone?.seriesRef || null, expectedVersion: zone?.version ?? null, code: draft.code.trim().toUpperCase(), name: draft.name.trim(),
      zoneType: draft.zoneType, priority: Number(draft.priority), vehicleType: draft.vehicleType.trim() || null, purposes: draft.purposes,
      geometry: { type: "Polygon", coordinates: [[...mapPoints, mapPoints[0]]] }, mode: draft.mode, factor: draft.mode === "FACTOR" ? draft.factor.trim() || null : null,
      currency: draft.currency.trim().toUpperCase(), kmPerGallon: draft.kmPerGallon.trim() || null, gallonUnit: draft.gallonUnit,
      fuelType: draft.fuelType.trim() || null, includedConcepts: draft.mode === "FACTOR" ? draft.includedConcepts : [], components, state: draft.state,
    });
  };

  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
    <DialogContent showCloseButton={false} className="flex max-h-[94dvh] w-[calc(100%-1rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl" onInteractOutside={(event) => event.preventDefault()} onEscapeKeyDown={(event) => { if (saving) event.preventDefault(); }}>
      <DialogHeader className="shrink-0 border-b px-4 py-3 text-left sm:px-5">
        <div className="flex items-center justify-between gap-3"><DialogTitle className="text-base text-[#003366]">{readOnly ? "Zona de transporte" : zone ? "Nueva versión de zona" : "Nueva zona"}</DialogTitle><button type="button" disabled={saving} aria-label="Cerrar zona" onClick={onClose} className="grid h-9 w-9 place-items-center rounded border text-slate-500 disabled:opacity-40"><X className="h-4 w-4" /></button></div>
        <DialogDescription className="text-xs">{zone ? `${zone.name} · versión actual ${zone.version}` : "Defina su perímetro y la forma de calcular el transporte."}</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="transport-zone-form">
        <div data-testid="transport-zone-scroll" className="min-h-0 min-w-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
          {(validation || error) && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800">{validation || error}</p>}
          {uncertain && <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><p>No se confirmó el guardado. Revise el listado antes de iniciar otra versión; el formulario queda bloqueado para evitar repetir la operación.</p><button type="button" onClick={onRefresh} className="mt-2 rounded border border-amber-400 bg-white px-3 py-2 font-medium">Consultar estado guardado</button></div>}
          <fieldset disabled={blocked} className="min-w-0 space-y-5 disabled:opacity-70">
            <div className="grid gap-3 sm:grid-cols-4">
              <label className="text-xs font-medium text-slate-600">Código *<input required minLength={2} maxLength={64} pattern="[A-Za-z][A-Za-z0-9_]{1,63}" title="Entre 2 y 64 letras, números o guiones bajos; comience con una letra." disabled={Boolean(zone)} value={draft.code} onChange={(event) => change("code", event.target.value)} className={field} /></label>
              <label className="text-xs font-medium text-slate-600 sm:col-span-3">Nombre *<input required maxLength={140} value={draft.name} onChange={(event) => change("name", event.target.value)} className={field} /></label>
              <label className="text-xs font-medium text-slate-600">Zona<select value={draft.zoneType} onChange={(event) => change("zoneType", event.target.value as Draft["zoneType"])} className={field}><option value="METRO">Metropolitana</option><option value="INTERIOR">Fuera de zona metro</option></select></label>
              <label className="text-xs font-medium text-slate-600">Tipo de vehículo<input list="transport-vehicle-types" value={draft.vehicleType} onChange={(event) => change("vehicleType", event.target.value)} placeholder="Todos" maxLength={80} className={field} /><datalist id="transport-vehicle-types">{vehicleTypes.map((type) => <option key={type} value={type} />)}</datalist></label>
              <label className="text-xs font-medium text-slate-600">Prioridad<input required type="number" min="0" max="9999" step="1" value={draft.priority} onChange={(event) => change("priority", event.target.value)} className={numberField} /></label>
              <label className="text-xs font-medium text-slate-600">Estado<select value={draft.state} onChange={(event) => change("state", event.target.value as Draft["state"])} className={field}>{Object.entries(STATE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs"><span className="font-medium text-slate-600">Aplicar a</span>{TRANSPORT_PURPOSES.map((purpose) => <label key={purpose} className="flex min-h-9 items-center gap-2"><input type="checkbox" checked={draft.purposes.includes(purpose)} onChange={(event) => change("purposes", event.target.checked ? [...draft.purposes, purpose] : draft.purposes.filter((value) => value !== purpose))} className="h-4 w-4 accent-[#003366]" />{PURPOSE_LABELS[purpose]}</label>)}<AdministrationHelp title="Prioridad y vehículo"><p>Una regla del tipo de vehículo elegido tiene preferencia sobre una regla para todos los vehículos. Entre reglas equivalentes se aplica primero la prioridad mayor; un empate requiere corregir la configuración.</p><p>Escriba el tipo tal como aparece en Flota vehicular; vacío significa todos. Use una zona por perfil cuando el rendimiento, la base o el peaje cambien según el vehículo.</p></AdministrationHelp></div>
            <section className="space-y-3 border-t pt-3">
              <div className="flex items-center gap-1"><h3 className="text-sm font-semibold">Perímetro</h3><AdministrationHelp title="Perímetro"><p>Trace la geocerca real de la empresa o ingrese las coordenadas de sus vértices. El último punto se conecta con el primero al guardar.</p><p>El mapa delimita zonas. La distancia vial se confirma al calcular cada recorrido.</p></AdministrationHelp></div>
              <Suspense fallback={<p role="status" className="rounded border bg-slate-50 p-8 text-center text-xs text-slate-500">Cargando mapa…</p>}><TransportZoneMap points={mapPoints} disabled={blocked || hasInvalidPoints} onChange={(value) => change("points", value.map(([longitude, latitude]) => ({ longitude: String(longitude), latitude: String(latitude) })))} /></Suspense>
              <details className="rounded border border-slate-200 text-xs" open={hasInvalidPoints || undefined}>
                <summary className="cursor-pointer px-3 py-2 font-medium text-slate-600">Coordenadas · {draft.points.length} puntos</summary>
                <div className="space-y-2 px-3 pb-3"><div className="max-h-52 space-y-2 overflow-y-auto">{draft.points.map((point, index) => <div key={index} className="flex flex-wrap items-end gap-2"><span className="w-5 py-2 text-slate-500">{index + 1}</span><label className="text-[11px] text-slate-500">Latitud<input aria-label={`Latitud del punto ${index + 1}`} type="number" step="0.000001" min="-90" max="90" value={point.latitude} onChange={(event) => change("points", draft.points.map((old, at) => at === index ? { ...old, latitude: event.target.value } : old))} className={`${field} w-32 max-w-32`} /></label><label className="text-[11px] text-slate-500">Longitud<input aria-label={`Longitud del punto ${index + 1}`} type="number" step="0.000001" min="-180" max="180" value={point.longitude} onChange={(event) => change("points", draft.points.map((old, at) => at === index ? { ...old, longitude: event.target.value } : old))} className={`${field} w-32 max-w-32`} /></label><button type="button" aria-label={`Quitar punto ${index + 1}`} onClick={() => change("points", draft.points.filter((_, at) => at !== index))} className="grid h-10 w-9 place-items-center rounded border text-slate-500"><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div><button type="button" disabled={draft.points.length >= 200} onClick={() => change("points", [...draft.points, { longitude: "", latitude: "" }])} className="inline-flex min-h-9 items-center gap-1 rounded border px-3 text-xs disabled:opacity-40"><Plus className="h-3.5 w-3.5" />Añadir coordenada</button></div>
              </details>
            </section>
            <section className="space-y-3 border-t pt-3">
              <div className="flex items-center gap-1"><h3 className="text-sm font-semibold">Costos de transporte</h3><AdministrationHelp title="Costos de transporte"><p>Por renglones: combustible, peajes, dietas, viáticos y otros gastos se suman con sus cantidades.</p><p>Por factor: la base de transporte se multiplica por el índice de la zona. Se añaden únicamente conceptos que la base no incluya.</p><p>Una tarifa vacía queda pendiente. Ingrese cero solamente cuando el costo realmente sea cero.</p></AdministrationHelp></div>
              <div className="flex flex-wrap items-end gap-3">
                <label className="w-44 text-xs font-medium text-slate-600">Forma de cálculo<select value={draft.mode} onChange={(event) => setMode(event.target.value as Draft["mode"])} className={field}><option value="ITEMIZED">Por renglones</option><option value="FACTOR">Por factor</option></select></label>
                <label className="text-xs font-medium text-slate-600">Moneda<input required pattern="[A-Za-z]{3}" maxLength={3} value={draft.currency} onChange={(event) => change("currency", event.target.value.toUpperCase())} className={`${field} w-20 max-w-20`} /></label>
                {draft.mode === "FACTOR" && <label className="text-xs font-medium text-slate-600">Factor<input type="number" min="0.000001" max="9999.999999" step="0.000001" value={draft.factor} onChange={(event) => change("factor", event.target.value)} placeholder="Pendiente" className={numberField} /></label>}
              </div>
              {draft.mode === "FACTOR" && <div className="rounded border border-slate-200 bg-slate-50 p-3"><span className="text-xs font-medium text-slate-600">La base ya incluye</span><div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">{INCLUDED_KINDS.map((kind) => <label key={kind} className="flex min-h-8 items-center gap-2 text-xs"><input type="checkbox" checked={draft.includedConcepts.includes(kind)} onChange={(event) => change("includedConcepts", event.target.checked ? [...draft.includedConcepts, kind] : draft.includedConcepts.filter((value) => value !== kind))} className="h-4 w-4 accent-[#003366]" />{KIND_LABELS[kind]}</label>)}</div></div>}
              {draft.components.some((component) => component.kind === "FUEL") && <div className="flex flex-wrap items-end gap-3 rounded border border-slate-200 bg-slate-50 p-3">
                <label className="text-xs font-medium text-slate-600">Rendimiento km/gal<input type="number" min="0.0001" max="9999.9999" step="0.0001" value={draft.kmPerGallon} onChange={(event) => change("kmPerGallon", event.target.value)} placeholder="Pendiente" className={numberField} /></label>
                <label className="w-44 text-xs font-medium text-slate-600">Galón<select value={draft.gallonUnit} onChange={(event) => change("gallonUnit", event.target.value as Draft["gallonUnit"])} className={field}><option value="US">Estadounidense</option><option value="IMPERIAL">Imperial</option></select></label>
                <label className="w-40 text-xs font-medium text-slate-600">Combustible<input value={draft.fuelType} onChange={(event) => change("fuelType", event.target.value)} placeholder="Tipo aprobado" maxLength={80} className={field} /></label>
              </div>}
              <div className="overflow-x-auto rounded border border-slate-200"><table className="w-full min-w-[800px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-2 font-medium">Concepto</th><th className="p-2 font-medium">Código y nombre</th><th className="p-2 font-medium">Base</th><th className="p-2 font-medium">Tarifa</th><th className="p-2 font-medium">Clase</th><th className="p-2 font-medium">Margen %</th><th className="p-2"><span className="sr-only">Acciones</span></th></tr></thead><tbody>
                {draft.components.map((component, index) => <tr key={component.key} className="border-t align-top"><td className="p-2"><select aria-label={`Concepto del renglón ${index + 1}`} value={component.kind} onChange={(event) => { const kind = event.target.value as TransportComponentKind; changeComponent(component.key, { kind, basis: newComponent(kind).basis }); }} className={`${field} w-36`}>{Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{(component.kind === "ALLOWANCE" || component.kind === "BASE" && draft.mode !== "FACTOR" || component.kind === "OTHER") && <details className="mt-2"><summary className="cursor-pointer text-[11px] text-slate-500">Conceptos incluidos</summary>{INCLUDED_KINDS.filter((kind) => kind !== component.kind).map((kind) => <label key={kind} className="mt-2 flex items-center gap-1.5 text-[11px]"><input type="checkbox" checked={component.includedConcepts.includes(kind)} onChange={(event) => changeComponent(component.key, { includedConcepts: event.target.checked ? [...component.includedConcepts, kind] : component.includedConcepts.filter((value) => value !== kind) })} />{KIND_LABELS[kind]}</label>)}</details>}</td>
                  <td className="p-2"><input aria-label={`Código del renglón ${index + 1}`} required maxLength={48} pattern="[A-Za-z][A-Za-z0-9_]{0,47}" title="Hasta 48 letras, números o guiones bajos; comience con una letra." placeholder="Código" value={component.code} onChange={(event) => changeComponent(component.key, { code: event.target.value })} className={`${field} w-40`} /><input aria-label={`Nombre del renglón ${index + 1}`} required maxLength={140} placeholder="Nombre visible" value={component.label} onChange={(event) => changeComponent(component.key, { label: event.target.value })} className={`${field} w-40`} /></td>
                  <td className="p-2"><select aria-label={`Base del renglón ${index + 1}`} value={component.basis} onChange={(event) => changeComponent(component.key, { basis: event.target.value as TransportBasis })} className={`${field} w-36`}>{Object.entries(BASIS_LABELS).filter(([value]) => ALLOWED_BASES[component.kind].includes(value as TransportBasis)).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
                  <td className="p-2"><input aria-label={`Tarifa del renglón ${index + 1}`} type="number" min="0" step="0.000001" value={component.unitCost} onChange={(event) => changeComponent(component.key, { unitCost: event.target.value })} placeholder="Pendiente" className={`${numberField} w-24`} /></td>
                  <td className="p-2"><select aria-label={`Clase del renglón ${index + 1}`} value={component.classification} onChange={(event) => changeComponent(component.key, { classification: event.target.value as ComponentDraft["classification"] })} className={`${field} w-28`}><option value="PR">Propio</option><option value="EX">Externo</option><option value="DE">Desembolso</option></select></td>
                  <td className="p-2">{component.classification === "PR" ? <div className="space-y-1"><input aria-label={`Margen mínimo del renglón ${index + 1}`} type="number" min="0" max="99.99" step="0.01" value={component.minimumMargin} onChange={(event) => changeComponent(component.key, { minimumMargin: event.target.value })} placeholder="Mínimo" className={`${field} w-24`} /><input aria-label={`Margen recomendado del renglón ${index + 1}`} type="number" min="0" max="99.99" step="0.01" value={component.recommendedMargin} onChange={(event) => changeComponent(component.key, { recommendedMargin: event.target.value })} placeholder="Objetivo" className={`${field} w-24`} /></div> : <span className="block py-3 text-slate-400">No aplica</span>}</td>
                  <td className="p-2"><button type="button" aria-label={`Quitar renglón ${index + 1}`} onClick={() => change("components", draft.components.filter((value) => value.key !== component.key))} className="mt-1 grid h-10 w-9 place-items-center rounded border text-slate-500"><Trash2 className="h-3.5 w-3.5" /></button></td></tr>)}
                {!draft.components.length && <tr><td colSpan={7} className="p-6 text-center text-slate-500">Añada los conceptos que corresponden a esta zona.</td></tr>}
              </tbody></table></div>
              <button type="button" disabled={draft.components.length >= 40} onClick={() => change("components", [...draft.components, newComponent()])} className="inline-flex min-h-9 items-center gap-1.5 rounded border px-3 text-xs font-medium text-slate-600"><Plus className="h-3.5 w-3.5" />Añadir renglón</button>
            </section>
          </fieldset>
        </div>
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t bg-white px-4 py-3 sm:px-5"><button type="button" disabled={saving} onClick={onClose} className="min-h-10 rounded border px-4 text-xs font-medium text-slate-600 disabled:opacity-40">Cerrar</button>{!readOnly && <button type="submit" disabled={blocked} className="min-h-10 rounded bg-[#003366] px-4 text-xs font-semibold text-white disabled:opacity-40">{saving ? "Guardando…" : zone ? "Guardar nueva versión" : "Guardar zona"}</button>}</footer>
      </form>
    </DialogContent>
  </Dialog>;
}
