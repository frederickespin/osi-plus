import { useId, useMemo, useState } from "react";
import { ArrowLeft, Check, MapPin, Plus, Save, SlidersHorizontal, Trash2 } from "lucide-react";
import { AdministrationHelp, AdministrationIconAction } from "@/administration/AdministrationHelp";
import { COMPACT_FORM_FIELD } from "@/components/ui/compact-form";
import { NumericInput } from "@/components/ui/numeric-input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { transportRingError } from "../../shared/transportGeometry.js";
import type { TransportBasis, TransportComponentInput, TransportComponentKind, TransportCoordinate, TransportPurpose, TransportZone, TransportZoneInput } from "./transportApi";
import { BASIS_LABELS, INCLUDED_KINDS, KIND_LABELS, PURPOSE_LABELS, STATE_LABELS } from "./transportPresentation";
import TransportZoneLocation, { type TransportZoneLocationDraft } from "./TransportZoneLocation";

const field = cn(COMPACT_FORM_FIELD, "mt-1 block w-full text-sm font-normal leading-4");
const numberField = `${field} max-w-24 tabular-nums`;
type ComponentDraft = Omit<TransportComponentInput, "code" | "unitCost" | "minimumMarginBps" | "recommendedMarginBps"> & { key: string; code: string; unitCost: string; minimumMargin: string; recommendedMargin: string };
type Draft = TransportZoneLocationDraft & {
  code: string;
  baseName: string; baseAddress: string; referenceDistanceKm: string; referenceDistanceSource: string;
  zoneType: "METRO" | "INTERIOR"; priority: string; vehicleType: string;
  purposes: TransportPurpose[]; mode: "ITEMIZED" | "FACTOR"; factor: string; currency: string;
  kmPerGallon: string; gallonUnit: "US" | "IMPERIAL"; fuelType: string; includedConcepts: TransportComponentKind[];
  components: ComponentDraft[]; state: "DRAFT" | "ACTIVE" | "INACTIVE";
};
type OperatingBase = Readonly<{ baseName: string; baseAddress: string }>;
type Props = Readonly<{
  zone: TransportZone | null; vehicleTypes: readonly string[]; saving: boolean; error: string | null; uncertain: boolean;
  area?: TransportZone | null;
  bases: readonly OperatingBase[];
  readOnly?: boolean;
  onSave(input: TransportZoneInput): void; onClose(): void; onRefresh(): void;
}>;
const ALLOWED_BASES: Record<TransportComponentKind, readonly TransportBasis[]> = { BASE: ["TRIP"], FUEL: ["GALLON"], TOLL: ["PASS", "FIXED"], PER_DIEM: ["PERSON_DAY"], ALLOWANCE: ["PERSON_DAY", "FIXED", "TRIP"], OTHER: ["TRIP", "PASS", "PERSON_DAY", "FIXED", "KM"] };
const CONFIGURABLE_ZONE_PURPOSES: readonly TransportPurpose[] = ["VISIT", "SERVICE"];

function newComponent(kind: TransportComponentKind = "OTHER"): ComponentDraft {
  const basis: TransportBasis = kind === "FUEL" ? "GALLON" : kind === "TOLL" ? "PASS" : kind === "PER_DIEM" ? "PERSON_DAY" : kind === "BASE" ? "TRIP" : "FIXED";
  return { key: crypto.randomUUID(), code: "", label: KIND_LABELS[kind], kind, basis, unitCost: "", classification: "PR", minimumMargin: "", recommendedMargin: "", includedConcepts: [] };
}

function fromZone(zone: TransportZone | null, area?: TransportZone | null): Draft {
  if (!zone) return {
    code: "", name: area?.sector || area?.city || "", locationType: area?.locationType || "CITY", city: area?.city || "", sector: area?.sector || "",
    baseName: "", baseAddress: "", referenceDistanceKm: "", referenceDistanceSource: "",
    zoneType: area?.zoneType || "INTERIOR", priority: "100", vehicleType: "", purposes: [],
    points: area ? pointFields(area) : [], mode: "ITEMIZED", factor: "", currency: "DOP",
    kmPerGallon: "", gallonUnit: "US", fuelType: "", includedConcepts: [], components: [], state: "DRAFT",
  };
  return {
    code: zone.code, name: zone.name, locationType: zone.locationType, city: zone.city, sector: zone.sector || "",
    baseName: zone.baseName, baseAddress: zone.baseAddress, referenceDistanceKm: zone.referenceDistanceKm || "", referenceDistanceSource: zone.referenceDistanceSource,
    zoneType: zone.zoneType, priority: String(zone.priority), vehicleType: zone.vehicleType || "",
    purposes: [...zone.purposes], points: pointFields(zone),
    mode: zone.mode, factor: zone.factor || "", currency: zone.currency, kmPerGallon: zone.kmPerGallon || "", gallonUnit: zone.gallonUnit,
    fuelType: zone.fuelType || "", includedConcepts: [...zone.includedConcepts], state: zone.state,
    components: zone.components.map((component) => ({ ...component, key: crypto.randomUUID(), unitCost: component.unitCost ?? "", minimumMargin: component.minimumMarginBps === null ? "" : String(component.minimumMarginBps / 100), recommendedMargin: component.recommendedMarginBps === null ? "" : String(component.recommendedMarginBps / 100) })),
  };
}

function pointFields(zone: TransportZone): TransportZoneLocationDraft["points"] {
  return zone.geometry.coordinates[0].slice(0, -1).map(([longitude, latitude]) => ({ longitude: String(longitude), latitude: String(latitude) }));
}

function coordinate(point: TransportZoneLocationDraft["points"][number]): TransportCoordinate | null {
  const longitude = point.longitude.trim() ? Number(point.longitude) : NaN;
  const latitude = point.latitude.trim() ? Number(point.latitude) : NaN;
  return Number.isFinite(longitude) && Number.isFinite(latitude) && Math.abs(longitude) <= 180 && Math.abs(latitude) <= 90 ? [longitude, latitude] : null;
}

export default function TransportZoneEditor({ zone, area, bases, vehicleTypes, saving, error, uncertain, readOnly = false, onSave, onClose, onRefresh }: Props) {
  const formId = useId();
  const [draft, setDraft] = useState<Draft>(() => fromZone(zone, area));
  const [tab, setTab] = useState("location");
  const [validation, setValidation] = useState<string | null>(null);
  const points = useMemo(() => draft.points.map(coordinate), [draft.points]);
  const mapPoints = useMemo(() => points.filter((point): point is TransportCoordinate => point !== null), [points]);
  const hasInvalidPoints = points.some((point) => point === null);
  const blocked = saving || uncertain || readOnly;
  const baseIndex = bases.findIndex((base) => base.baseName === draft.baseName && base.baseAddress === draft.baseAddress);
  const change = <K extends keyof Draft>(key: K, value: Draft[K]) => { setDraft((current) => ({ ...current, [key]: value })); setValidation(null); };
  const changeComponent = (key: string, changes: Partial<ComponentDraft>) => change("components", draft.components.map((component) => component.key === key ? { ...component, ...changes } : component));
  const setMode = (mode: Draft["mode"]) => {
    change("mode", mode);
    if (mode === "FACTOR" && !draft.components.some((component) => component.kind === "BASE")) change("components", [newComponent("BASE"), ...draft.components]);
  };
  function incomplete(section: string, message: string) {
    setTab(section);
    setValidation(message);
  }
  function setBase(base: OperatingBase) {
    setDraft((current) => ({ ...current, ...base, referenceDistanceKm: "", referenceDistanceSource: "" }));
    setValidation(null);
  }
  function submit() {
    if (blocked) return;
    if (!draft.city.trim() || !draft.name.trim() || draft.locationType === "SECTOR" && !draft.sector.trim()) return incomplete("location", "Complete la ciudad, el nombre del perfil y el sector cuando corresponda.");
    const ring = [...mapPoints, mapPoints[0]];
    const geometryError = hasInvalidPoints ? "TRANSPORT_GEOMETRY_INVALID" : transportRingError(ring);
    if (geometryError) return incomplete("location", geometryError === "TRANSPORT_GEOMETRY_SELF_INTERSECTION" ? "Ajuste los puntos donde se cruza el perímetro." : "Confirme un contorno sugerido o trace un perímetro de al menos tres puntos en el mapa.");
    if (draft.state === "ACTIVE") {
      if (!draft.baseName.trim() || !draft.baseAddress.trim()) return incomplete("operation", "Seleccione o complete la base operativa y su dirección para activar el área.");
      if (!draft.purposes.length) return incomplete("operation", "Seleccione al menos un uso para activar el área.");
      if (!draft.components.length) return incomplete("operation", "Añada al menos un renglón de costo para activar el área.");
    }
    if (draft.referenceDistanceKm.trim() && !draft.referenceDistanceSource.trim()) return incomplete("operation", "Indique la fuente de los kilómetros viales de referencia.");
    if (draft.mode === "FACTOR" && draft.components.filter((component) => component.kind === "BASE").length !== 1) return incomplete("operation", "El cálculo por factor requiere una sola base de transporte.");
    const components: TransportComponentInput[] = draft.components.map((component) => ({
      code: component.code.trim().toUpperCase() || null, label: component.label.trim(), kind: component.kind, basis: component.basis,
      unitCost: component.unitCost.trim() || null, classification: component.classification,
      minimumMarginBps: component.classification === "PR" && component.minimumMargin.trim() ? Math.round(Number(component.minimumMargin) * 100) : null,
      recommendedMarginBps: component.classification === "PR" && component.recommendedMargin.trim() ? Math.round(Number(component.recommendedMargin) * 100) : null,
      includedConcepts: component.includedConcepts,
    }));
    onSave({
      seriesRef: zone?.seriesRef || null, expectedVersion: zone?.version ?? null, code: draft.code.trim().toUpperCase() || null, name: draft.name.trim(),
      locationType: draft.locationType, city: draft.city.trim(), sector: draft.locationType === "SECTOR" ? draft.sector.trim() : null,
      baseName: draft.baseName.trim(), baseAddress: draft.baseAddress.trim(), referenceDistanceKm: draft.referenceDistanceKm.trim() || null,
      referenceDistanceSource: draft.referenceDistanceSource.trim(),
      zoneType: draft.zoneType, priority: Number(draft.priority), vehicleType: draft.vehicleType.trim() || null, purposes: draft.purposes,
      geometry: { type: "Polygon", coordinates: [ring] }, mode: draft.mode, factor: draft.mode === "FACTOR" ? draft.factor.trim() || null : null,
      currency: draft.currency.trim().toUpperCase(), kmPerGallon: draft.kmPerGallon.trim() || null, gallonUnit: draft.gallonUnit,
      fuelType: draft.fuelType.trim() || null, includedConcepts: draft.mode === "FACTOR" ? draft.includedConcepts : [], components, state: draft.state,
    });
  }

  const requiredProfile = draft.state === "ACTIVE";
  const title = readOnly ? "Ciudad o sector" : zone ? "Editar ciudad o sector" : area ? "Nuevo perfil para el área" : "Nueva ciudad o sector";
  return (
    <section aria-labelledby={`${formId}-title`} className="min-w-0 space-y-3 overflow-x-clip" data-testid="transport-zone-form">
      <header className="flex flex-wrap items-center gap-2">
        <AdministrationIconAction label="Volver a ciudades y sectores" disabled={saving} onClick={onClose}><ArrowLeft className="h-4 w-4" aria-hidden="true" /></AdministrationIconAction>
        <div className="min-w-0">
          <h3 id={`${formId}-title`} className="text-base font-semibold text-[#003366]">{title}</h3>
          {zone && <p className="text-xs text-slate-600">{zone.name} · {STATE_LABELS[zone.state]} · v{zone.version}</p>}
        </div>
      </header>
      <Tabs value={tab} onValueChange={setTab} className="gap-3">
        <TabsList aria-label="Configuración de la ubicación" className="w-full justify-start overflow-x-auto sm:w-fit">
          <TabsTrigger value="location" className="data-[state=active]:bg-[#003366] data-[state=active]:text-white"><MapPin aria-hidden="true" />Ubicación</TabsTrigger>
          <TabsTrigger value="operation" className="data-[state=active]:bg-[#003366] data-[state=active]:text-white"><SlidersHorizontal aria-hidden="true" />Operación y costos</TabsTrigger>
        </TabsList>
        <TabsContent value="location" forceMount className="data-[state=inactive]:hidden">
          <fieldset disabled={blocked} className="min-w-0">
            <TransportZoneLocation
              value={draft}
              mapPoints={mapPoints}
              invalidPoints={hasInvalidPoints}
              blocked={blocked}
              readOnly={readOnly}
              onChange={(changes) => { setDraft((current) => ({ ...current, ...changes })); setValidation(null); }}
            />
          </fieldset>
        </TabsContent>
        <TabsContent value="operation" className="min-w-0">
          <form id={formId} onSubmit={(event) => { event.preventDefault(); submit(); }}>
            <fieldset disabled={blocked} className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <div className="flex items-center gap-1">
                  <h4 className="text-sm font-semibold text-[#003366]">Aplicación</h4>
                  <AdministrationHelp title="Visitas y servicios por separado">
                    <p>Marque los usos que comparten este perfil. Desde el listado puede reutilizar el mismo perímetro para otro perfil con su propia base, vehículo y costos.</p>
                    <p>La geocerca identifica dónde aplica el perfil. El cobro de una visita al cliente se decide en Comercial.</p>
                  </AdministrationHelp>
                </div>
                {CONFIGURABLE_ZONE_PURPOSES.map((purpose) => (
                  <label key={purpose} className="inline-flex min-h-8 items-center gap-1.5 text-xs font-medium text-slate-700">
                    <input type="checkbox" checked={draft.purposes.includes(purpose)} onChange={(event) => change("purposes", event.target.checked ? [...draft.purposes, purpose] : draft.purposes.filter((value) => value !== purpose))} className="h-4 w-4 accent-[#003366]" />
                    {PURPOSE_LABELS[purpose]}
                  </label>
                ))}
                {draft.purposes.includes("QUOTE") && <span className="text-xs text-slate-500">Aplicación histórica en cotizaciones</span>}
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 lg:grid-cols-4">
                {bases.length > 0 && <label className="col-span-2 min-w-0 text-xs font-medium text-slate-600">Usar base registrada
                  <select value={baseIndex < 0 ? "" : String(baseIndex)} onChange={(event) => { if (event.target.value !== "") setBase(bases[Number(event.target.value)]); }} className={field}>
                    <option value="">{baseIndex < 0 ? "Seleccione una oficina o almacén" : "Base registrada"}</option>
                    {bases.map((base, index) => <option key={index} value={index}>{base.baseName} · {base.baseAddress}</option>)}
                  </select>
                </label>}
                <label className="text-xs font-medium text-slate-600">Base operativa
                  <input required={requiredProfile} maxLength={160} value={draft.baseName} onChange={(event) => change("baseName", event.target.value)} placeholder="Oficina o almacén" className={field} />
                </label>
                <label className="text-xs font-medium text-slate-600">Dirección de la base
                  <input required={requiredProfile} maxLength={240} value={draft.baseAddress} onChange={(event) => setBase({ baseName: draft.baseName, baseAddress: event.target.value })} className={field} />
                </label>
                <label className="text-xs font-medium text-slate-600">Km viales de referencia
                  <NumericInput min="0" max="999999.9999" step="0.0001" value={draft.referenceDistanceKm} onChange={(event) => change("referenceDistanceKm", event.target.value)} placeholder="Pendiente" className={numberField} />
                </label>
                <label className="text-xs font-medium text-slate-600">Fuente de la distancia
                  <input maxLength={240} value={draft.referenceDistanceSource} onChange={(event) => change("referenceDistanceSource", event.target.value)} placeholder="Ruta o medición confirmada" className={field} />
                </label>
                <label className="text-xs font-medium text-slate-600">Tipo de vehículo
                  <input list={`${formId}-vehicles`} value={draft.vehicleType} onChange={(event) => change("vehicleType", event.target.value)} placeholder="Todos" maxLength={80} className={field} />
                  <datalist id={`${formId}-vehicles`}>{vehicleTypes.map((type) => <option key={type} value={type} />)}</datalist>
                </label>
                <label className="text-xs font-medium text-slate-600">Clasificación operativa
                  <select value={draft.zoneType} onChange={(event) => change("zoneType", event.target.value as Draft["zoneType"])} className={field}>
                    <option value="METRO">Metropolitana</option><option value="INTERIOR">Fuera de zona metro</option>
                  </select>
                </label>
                <label className="text-xs font-medium text-slate-600">Estado
                  <select value={draft.state} onChange={(event) => change("state", event.target.value as Draft["state"])} className={field}>
                    {Object.entries(STATE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <div className="text-xs font-medium text-slate-600">
                  <label htmlFor={`${formId}-priority`}>Prioridad</label>
                  <div className="flex items-center gap-1">
                    <NumericInput id={`${formId}-priority`} required min="0" max="9999" step="1" value={draft.priority} onChange={(event) => change("priority", event.target.value)} className={numberField} />
                    <AdministrationHelp title="Prioridad de la zona">
                      <p>Primero tiene preferencia el perfil específico del vehículo. Entre perfiles equivalentes se elige el de mayor prioridad.</p>
                      <p>Una prioridad de 101 se elige antes que una de 100. Cambiar de 100 a 101 no aumenta el costo de transporte.</p>
                    </AdministrationHelp>
                  </div>
                </div>
              </div>
            <section className="space-y-3 border-t pt-3">
              <div className="flex items-center gap-1"><h3 className="text-sm font-semibold">Costos de transporte</h3><AdministrationHelp title="Costos de transporte"><p>Por renglones: combustible, peajes, dietas, viáticos y otros gastos se suman con sus cantidades.</p><p>Por factor: la base de transporte se multiplica por el índice de la zona. Se añaden únicamente conceptos que la base no incluya.</p><p>Una tarifa vacía queda pendiente. Ingrese cero solamente cuando el costo realmente sea cero.</p></AdministrationHelp></div>
              <div className="flex flex-wrap items-end gap-3">
                <label className="w-44 text-xs font-medium text-slate-600">Forma de cálculo<select value={draft.mode} onChange={(event) => setMode(event.target.value as Draft["mode"])} className={field}><option value="ITEMIZED">Por renglones</option><option value="FACTOR">Por factor</option></select></label>
                <label className="text-xs font-medium text-slate-600">Moneda<input required pattern="[A-Za-z]{3}" maxLength={3} value={draft.currency} onChange={(event) => change("currency", event.target.value.toUpperCase())} className={`${field} w-20 max-w-20`} /></label>
                {draft.mode === "FACTOR" && <div className="text-xs font-medium text-slate-600"><label htmlFor={`${formId}-factor`}>Factor</label><div className="flex items-center gap-1"><NumericInput id={`${formId}-factor`} min="0.000001" max="9999.999999" step="0.000001" value={draft.factor} onChange={(event) => change("factor", event.target.value)} placeholder="Pendiente" className={numberField} /><AdministrationHelp title="Factor de la zona"><p>Multiplica únicamente la base de transporte. Los conceptos adicionales se suman aparte, siempre que la base no los incluya.</p><p>Ejemplo ilustrativo por viaje: una base de 1,000 con factor 1 cuesta 1,000; con factor 1.25 cuesta 1,250, un aumento de 250 (25 %).</p><p>El factor vacío queda pendiente. Un factor de 1 mantiene el costo base.</p></AdministrationHelp></div></div>}
              </div>
              {draft.mode === "FACTOR" && <div className="rounded border border-slate-200 bg-slate-50 p-3"><span className="text-xs font-medium text-slate-600">La base ya incluye</span><div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">{INCLUDED_KINDS.map((kind) => <label key={kind} className="flex min-h-8 items-center gap-2 text-xs"><input type="checkbox" checked={draft.includedConcepts.includes(kind)} onChange={(event) => change("includedConcepts", event.target.checked ? [...draft.includedConcepts, kind] : draft.includedConcepts.filter((value) => value !== kind))} className="h-4 w-4 accent-[#003366]" />{KIND_LABELS[kind]}</label>)}</div></div>}
              {draft.components.some((component) => component.kind === "FUEL") && <div className="flex flex-wrap items-end gap-3 rounded border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-medium text-slate-600"><label htmlFor={`${formId}-efficiency`}>Rendimiento km/gal</label><div className="flex items-center gap-1"><NumericInput id={`${formId}-efficiency`} min="0.0001" max="9999.9999" step="0.0001" value={draft.kmPerGallon} onChange={(event) => change("kmPerGallon", event.target.value)} placeholder="Pendiente" className={numberField} /><AdministrationHelp title="Rendimiento de combustible"><p>Este dato pertenece a la ficha del vehículo o perfil de camión. Galones necesarios = kilómetros totales ÷ rendimiento.</p><p>Ejemplo ilustrativo: para 160 km, un rendimiento de 8 km/gal requiere 20 galones; al subir a 10 km/gal requiere 16. Con una tarifa de 250 por galón, el costo baja de 5,000 a 4,000.</p><p>Los kilómetros totales contemplan los viajes y el regreso, si se indica. Use el mismo tipo de galón para el rendimiento y la tarifa.</p></AdministrationHelp></div></div>
                <label className="w-44 text-xs font-medium text-slate-600">Galón<select value={draft.gallonUnit} onChange={(event) => change("gallonUnit", event.target.value as Draft["gallonUnit"])} className={field}><option value="US">Estadounidense</option><option value="IMPERIAL">Imperial</option></select></label>
                <label className="w-40 text-xs font-medium text-slate-600">Combustible<input value={draft.fuelType} onChange={(event) => change("fuelType", event.target.value)} placeholder="Tipo aprobado" maxLength={80} className={field} /></label>
              </div>}
              <div className="relative overflow-x-auto rounded border border-slate-200"><table className="w-full min-w-[800px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-2 font-medium">Concepto</th><th className="p-2 font-medium">Nombre visible</th><th className="p-2 font-medium"><div className="flex items-center gap-1">Base<AdministrationHelp title="Base del renglón"><p>Define la cantidad que multiplicará la tarifa al calcular el recorrido.</p><p>Por viaje usa el número de viajes; por galón usa kilómetros totales ÷ rendimiento; por kilómetro usa la distancia total, con viajes y regreso.</p><p>Por persona / día: 2 personas × 3 días = 6 unidades. Al cambiar a 4 días son 8 unidades; con tarifa ilustrativa de 500, el costo pasa de 3,000 a 4,000.</p><p>Por paso y cantidad indicada usan la cantidad que se ingrese para ese renglón al calcular.</p></AdministrationHelp></div></th><th className="p-2 font-medium"><div className="flex items-center gap-1">Tarifa<AdministrationHelp title="Tarifa del renglón"><p>Es el costo por una unidad de la base elegida. Costo del renglón = cantidad × tarifa.</p><p>Ejemplo ilustrativo de peaje: 2 pasos × 100 = 200. Al subir la tarifa a 150, esos mismos 2 pasos cuestan 300. Si se mantienen 100 y se indican 3 pasos, cuestan 300.</p><p>Una tarifa vacía queda pendiente; una tarifa de 0 confirma costo cero. En el modo por factor, la base de transporte también se multiplica por el factor.</p></AdministrationHelp></div></th><th className="p-2 font-medium">Clase</th><th className="p-2 font-medium"><div className="flex items-center gap-1">Margen %<AdministrationHelp title="Márgenes del renglón"><p>Se aplican a recursos propios en el costeo de venta. El margen objetivo propone un precio; no aumenta el costo de transporte.</p><p>Ejemplo ilustrativo con costo de 1,000: un objetivo de 20 % propone 1,000 ÷ (1 − 0.20) = 1,250; al subir a 25 % propone 1,333.33. El costo sigue siendo 1,000.</p><p>El margen mínimo controla la autorización de una venta rebajada: con mínimo de 20 %, vender a 1,200 deja 16.67 % y requiere autorización. Al bajar el mínimo a 15 %, supera ese umbral.</p></AdministrationHelp></div></th><th className="p-2"><span className="sr-only">Acciones</span></th></tr></thead><tbody>
                {draft.components.map((component, index) => <tr key={component.key} className="border-t align-top"><td className="p-2"><select aria-label={`Concepto del renglón ${index + 1}`} value={component.kind} onChange={(event) => { const kind = event.target.value as TransportComponentKind; changeComponent(component.key, { kind, basis: newComponent(kind).basis, ...(component.label === KIND_LABELS[component.kind] || !component.label.trim() ? { label: KIND_LABELS[kind] } : {}) }); }} className={`${field} w-36`}>{Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{(component.kind === "ALLOWANCE" || component.kind === "BASE" && draft.mode !== "FACTOR" || component.kind === "OTHER") && <details className="mt-2"><summary className="cursor-pointer text-[11px] text-slate-500">Conceptos incluidos</summary>{INCLUDED_KINDS.filter((kind) => kind !== component.kind).map((kind) => <label key={kind} className="mt-2 flex items-center gap-1.5 text-[11px]"><input type="checkbox" checked={component.includedConcepts.includes(kind)} onChange={(event) => changeComponent(component.key, { includedConcepts: event.target.checked ? [...component.includedConcepts, kind] : component.includedConcepts.filter((value) => value !== kind) })} />{KIND_LABELS[kind]}</label>)}</details>}</td>
                  <td className="p-2"><input aria-label={`Nombre del renglón ${index + 1}`} required maxLength={140} placeholder="Nombre visible" value={component.label} onChange={(event) => changeComponent(component.key, { label: event.target.value })} className={`${field} w-40`} />{component.code && <span title={component.code} className="mt-1 block max-w-40 truncate text-[11px] text-slate-500">{component.code}</span>}</td>
                  <td className="p-2"><select aria-label={`Base del renglón ${index + 1}`} value={component.basis} onChange={(event) => changeComponent(component.key, { basis: event.target.value as TransportBasis })} className={`${field} w-36`}>{Object.entries(BASIS_LABELS).filter(([value]) => ALLOWED_BASES[component.kind].includes(value as TransportBasis)).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
                  <td className="p-2"><NumericInput aria-label={`Tarifa del renglón ${index + 1}`} min="0" step="0.000001" value={component.unitCost} onChange={(event) => changeComponent(component.key, { unitCost: event.target.value })} placeholder="Pendiente" className={`${numberField} w-24`} /></td>
                  <td className="p-2"><select aria-label={`Clase del renglón ${index + 1}`} value={component.classification} onChange={(event) => changeComponent(component.key, { classification: event.target.value as ComponentDraft["classification"] })} className={`${field} w-28`}><option value="PR">Propio</option><option value="EX">Externo</option><option value="DE">Desembolso</option></select></td>
                  <td className="p-2">{component.classification === "PR" ? <div className="space-y-1"><NumericInput aria-label={`Margen mínimo del renglón ${index + 1}`} min="0" max="99.99" step="0.01" value={component.minimumMargin} onChange={(event) => changeComponent(component.key, { minimumMargin: event.target.value })} placeholder="Mínimo" className={`${field} w-24`} /><NumericInput aria-label={`Margen recomendado del renglón ${index + 1}`} min="0" max="99.99" step="0.01" value={component.recommendedMargin} onChange={(event) => changeComponent(component.key, { recommendedMargin: event.target.value })} placeholder="Objetivo" className={`${field} w-24`} /></div> : <span className="block py-3 text-slate-400">No aplica</span>}</td>
                  <td className="p-2"><button type="button" aria-label={`Quitar renglón ${index + 1}`} onClick={() => change("components", draft.components.filter((value) => value.key !== component.key))} className="mt-1 grid h-10 w-10 place-items-center rounded border text-slate-500 sm:h-8 sm:w-8"><Trash2 className="h-3.5 w-3.5" /></button></td></tr>)}
                {!draft.components.length && <tr><td colSpan={7} className="p-6 text-center text-slate-500">Añada los conceptos que corresponden a esta zona.</td></tr>}
              </tbody></table></div>
              <div className="flex flex-wrap items-center gap-3"><button type="button" disabled={draft.components.length >= 40} onClick={() => change("components", [...draft.components, newComponent()])} className="inline-flex min-h-9 items-center gap-1.5 rounded border px-3 text-xs font-medium text-slate-600"><Plus className="h-3.5 w-3.5" />Añadir renglón</button><p className="text-[11px] text-slate-500">Los códigos de los renglones se generan al guardar.</p></div>
            </section>
            </fieldset>
          </form>
        </TabsContent>
      </Tabs>
      {!readOnly && <footer className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 py-2">
        {(validation || error) && <p role="alert" className="min-w-0 flex-1 basis-56 text-xs font-medium text-red-800">{validation || error}</p>}
        {uncertain && <div className="flex flex-wrap items-center gap-2 text-xs text-amber-900">
          <p>Quedó pendiente confirmar el guardado.</p>
          <button type="button" onClick={onRefresh} className="rounded border border-amber-300 bg-white px-3 py-1.5 font-medium">Consultar estado guardado</button>
        </div>}
        <div className="ml-auto flex items-center gap-2">
          <button type="button" disabled={saving} onClick={onClose} className="min-h-9 rounded border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 disabled:opacity-40">Cerrar</button>
          <button type={tab === "operation" ? "submit" : "button"} form={tab === "operation" ? formId : undefined} onClick={tab === "location" ? submit : undefined} disabled={blocked} className="inline-flex min-h-9 items-center gap-1.5 rounded bg-[#003366] px-3 text-xs font-semibold text-white disabled:opacity-40">
            {draft.state === "DRAFT" ? <Save className="h-4 w-4" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
            {saving ? "Guardando…" : draft.state === "DRAFT" ? "Guardar borrador" : "Guardar versión"}
          </button>
        </div>
      </footer>}
    </section>
  );
}
