import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Calculator, Check, MapPin, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { AdministrationHelp, AdministrationIconAction } from "@/administration/AdministrationHelp";
import { COMPACT_FORM_FIELD } from "@/components/ui/compact-form";
import { NumericInput } from "@/components/ui/numeric-input";
import { cn } from "@/lib/utils";
import { isTransportUnauthorized, transportApi, transportErrorMessage, TransportRequestError, type TransportCalculateInput, type TransportCalculation, type TransportCoordinate, type TransportJourney, type TransportLine, type TransportPublication, type TransportPurpose, type TransportResult, type TransportWorkspace } from "./transportApi";
import type { TransportUiAccess } from "./transportAccess";
import { BASIS_LABELS, PURPOSE_LABELS, TRANSPORT_PURPOSES, UNIT_LABELS, formatTransportDate, formatTransportNumber } from "./transportPresentation";

const TransportZoneMap = lazy(() => import("./TransportZoneMap"));
const field = cn(COMPACT_FORM_FIELD, "mt-1 block w-full text-sm font-normal leading-4");
const compact = `${field} w-24 max-w-24 tabular-nums`;
type Props = Readonly<{
  authorization?: string; caseRef?: string; purpose?: TransportPurpose; contextRef?: string | null;
  access: TransportUiAccess; onUnauthorized(): void; onPublished?(): void;
}>;
type PointDraft = { longitude: string; latitude: string };
type JourneyDraft = Omit<TransportJourney, "origin" | "destination" | "distanceKm" | "trips" | "people" | "days" | "quantities"> & {
  origin: PointDraft; destination: PointDraft; distanceKm: string; trips: string; people: string; days: string; quantities: Record<string, string>;
};
type Draft = { intervalStart: string; intervalEnd: string; journeys: JourneyDraft[] };
const EMPTY_WORKSPACE: TransportWorkspace = { cases: [], visits: [], vehicles: [] };

function newJourney(number: number): JourneyDraft {
  return { journeyRef: crypto.randomUUID(), label: `Recorrido ${number}`, vehicleType: "", vehicleRef: null, origin: { longitude: "", latitude: "" }, destination: { longitude: "", latitude: "" }, distanceKm: "", distanceSource: "", returnToOrigin: false, trips: "1", people: "", days: "", quantities: {} };
}

function localDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromInput(input: TransportCalculateInput): Draft {
  const point = (coordinate: TransportCoordinate | null): PointDraft => ({ longitude: coordinate === null ? "" : String(coordinate[0]), latitude: coordinate === null ? "" : String(coordinate[1]) });
  return { intervalStart: localDate(input.intervalStart), intervalEnd: localDate(input.intervalEnd), journeys: input.journeys.map((journey) => ({ ...journey, origin: point(journey.origin), destination: point(journey.destination), distanceKm: journey.distanceKm ?? "", trips: String(journey.trips), people: journey.people === null ? "" : String(journey.people), days: journey.days ?? "", quantities: { ...journey.quantities } })) };
}

function parsePoint(point: PointDraft): TransportCoordinate | null {
  if (!point.longitude.trim() && !point.latitude.trim()) return null;
  const longitude = point.longitude.trim() ? Number(point.longitude) : NaN;
  const latitude = point.latitude.trim() ? Number(point.latitude) : NaN;
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(longitude) > 180 || Math.abs(latitude) > 90) throw new Error("Complete la latitud y longitud del punto, o deje ambas pendientes.");
  return [longitude, latitude];
}

export default function TransportCalculationPanel(props: Props) {
  if (!props.access.canView) return null;
  return <TransportWorkspacePanel {...props} />;
}

function TransportWorkspacePanel({ authorization, caseRef: fixedCase, purpose: fixedPurpose, contextRef: fixedContext, access, onUnauthorized, onPublished }: Props) {
  const [search, setSearch] = useState("");
  const [selectedCase, setSelectedCase] = useState("");
  const [selectedCaseLabel, setSelectedCaseLabel] = useState("");
  const [selectedPurpose, setSelectedPurpose] = useState<TransportPurpose>("QUOTE");
  const [selectedVisit, setSelectedVisit] = useState("");
  const [workspace, setWorkspace] = useState<{ caseRef: string; data: TransportWorkspace } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const caseRef = fixedCase || selectedCase;
  const purpose = fixedPurpose || selectedPurpose;
  const contextRef = purpose === "VISIT" ? fixedContext || selectedVisit || null : null;
  const currentWorkspace = workspace?.caseRef === caseRef ? workspace.data : EMPTY_WORKSPACE;

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void transportApi.context(authorization, { search: fixedCase ? undefined : search.trim(), caseRef: caseRef || undefined }, controller.signal).then((data) => {
        if (!controller.signal.aborted) setWorkspace({ caseRef, data });
      }).catch((cause) => {
        if (controller.signal.aborted) return;
        if (isTransportUnauthorized(cause)) onUnauthorized();
        else setError(transportErrorMessage(cause));
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, search ? 250 : 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [authorization, caseRef, fixedCase, onUnauthorized, reload, search]);

  return <section className="space-y-3" data-testid="transport-calculation-panel">
    <header className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-1"><h3 className="text-sm font-semibold text-slate-900">{fixedPurpose ? `Transporte · ${PURPOSE_LABELS[fixedPurpose].toLocaleLowerCase("es")}` : "Calcular transporte"}</h3><AdministrationHelp title="Cálculo de transporte"><p>Ubique la salida y el destino de cada recorrido. El motor identifica la zona y aplica sus tarifas y su perfil de vehículo.</p><p>Registre kilómetros viales confirmados y su fuente. Marque el regreso solamente si esos kilómetros corresponden a la ida.</p><p>Cotización, servicio y cada visita conservan publicaciones independientes. El costo interno de una visita se calcula aunque al cliente no se le cobre.</p></AdministrationHelp></div><AdministrationIconAction label="Actualizar casos y vehículos" disabled={loading || busy} onClick={() => setReload((value) => value + 1)}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></AdministrationIconAction></header>
    {!fixedCase && <div className="grid gap-3 rounded border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className="text-xs font-medium text-slate-600">Buscar caso<div className="relative mt-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input disabled={busy} maxLength={120} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Código o cliente…" className={cn(field, "mt-0 pl-9 pr-3")} /></div></label>
      <label className="text-xs font-medium text-slate-600">Caso<select value={caseRef} disabled={busy || loading} onChange={(event) => { setSelectedCase(event.target.value); setSelectedCaseLabel(event.target.selectedOptions[0]?.textContent || ""); setSelectedVisit(""); }} className={field}><option value="">Seleccione un caso</option>{selectedCase && !currentWorkspace.cases.some((row) => row.caseRef === selectedCase) && <option value={selectedCase}>{selectedCaseLabel}</option>}{currentWorkspace.cases.map((row) => <option key={row.caseRef} value={row.caseRef}>{row.label}</option>)}</select></label>
      {!fixedPurpose && <label className="text-xs font-medium text-slate-600">Uso del cálculo<select disabled={busy} value={purpose} onChange={(event) => { setSelectedPurpose(event.target.value as TransportPurpose); setSelectedVisit(""); }} className={field}>{TRANSPORT_PURPOSES.map((value) => <option key={value} value={value}>{PURPOSE_LABELS[value]}</option>)}</select></label>}
    </div>}
    {purpose === "VISIT" && !fixedContext && caseRef && <label className="block max-w-lg text-xs font-medium text-slate-600">Visita presencial<select value={selectedVisit} disabled={busy || loading} onChange={(event) => setSelectedVisit(event.target.value)} className={field}><option value="">Seleccione la visita</option>{currentWorkspace.visits.map((row) => <option key={row.contextRef} value={row.contextRef}>{row.label}</option>)}</select></label>}
    {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-800">{error}</p>}
    {!caseRef ? <p className="rounded border border-slate-200 bg-white px-4 py-8 text-center text-xs text-slate-500">Seleccione el caso cuyo transporte desea calcular.</p> : purpose === "VISIT" && !contextRef ? <p className="rounded border border-slate-200 bg-white p-4 text-xs text-slate-500">{loading ? "Cargando visitas…" : currentWorkspace.visits.length ? "Seleccione una visita para consultar su costo de transporte." : "El caso aún no tiene una visita presencial disponible. Regístrela desde Agenda."}</p> : <CaseTransport key={`${caseRef}:${purpose}:${contextRef || ""}`} authorization={authorization} caseRef={caseRef} purpose={purpose} contextRef={contextRef} vehicles={currentWorkspace.vehicles} access={access} onUnauthorized={onUnauthorized} onPublished={onPublished} onBusy={setBusy} />}
  </section>;
}

type CaseProps = Readonly<{
  authorization?: string; caseRef: string; purpose: TransportPurpose; contextRef: string | null;
  vehicles: TransportWorkspace["vehicles"]; access: TransportUiAccess; onUnauthorized(): void; onPublished?(): void; onBusy(value: boolean): void;
}>;

function CaseTransport({ authorization, caseRef, purpose, contextRef, vehicles, access, onUnauthorized, onPublished, onBusy }: CaseProps) {
  const [draft, setDraft] = useState<Draft>(() => ({ intervalStart: "", intervalEnd: "", journeys: [newJourney(1)] }));
  const [publication, setPublication] = useState<TransportPublication | null>(null);
  const [calculation, setCalculation] = useState<TransportCalculation | null>(null);
  const [calculationDirty, setCalculationDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasRead, setHasRead] = useState(false);
  const [busy, setBusy] = useState<"calculate" | "publish" | null>(null);
  const [uncertain, setUncertain] = useState<"calculate" | "publish" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const touched = useRef(false);
  const scope = useRef(0);
  const currentCalculation = useRef<TransportCalculation | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const saved = await transportApi.publication(authorization, { caseRef, purpose, contextRef }, signal);
      if (signal?.aborted) return null;
      setPublication(saved);
      setHasRead(true);
      if (saved && !touched.current) setDraft(fromInput(saved.input));
      return { saved };
    } catch (cause) {
      if (signal?.aborted) return null;
      if (isTransportUnauthorized(cause)) onUnauthorized();
      else setError(transportErrorMessage(cause));
      return null;
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [authorization, caseRef, contextRef, onUnauthorized, purpose]);

  useEffect(() => {
    const controller = new AbortController();
    scope.current += 1;
    void load(controller.signal);
    return () => { controller.abort(); scope.current += 1; };
  }, [load]);

  useEffect(() => { onBusy(Boolean(busy)); return () => onBusy(false); }, [busy, onBusy]);
  const change = (next: Draft) => { touched.current = true; setDraft(next); setCalculationDirty(true); setNotice(null); };
  const setJourney = (journey: JourneyDraft) => change({ ...draft, journeys: draft.journeys.map((row) => row.journeyRef === journey.journeyRef ? journey : row) });

  const calculate = async (event: FormEvent) => {
    event.preventDefault();
    if (!access.canCalculate || busy || uncertain) return;
    setError(null);
    let input: TransportCalculateInput;
    try {
      const start = new Date(draft.intervalStart);
      const end = new Date(draft.intervalEnd);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) throw new Error("Indique un inicio y un fin posterior para el desplazamiento.");
      input = {
        caseRef, purpose, contextRef, intervalStart: start.toISOString(), intervalEnd: end.toISOString(),
        journeys: draft.journeys.map((journey) => ({ ...journey, label: journey.label.trim(), vehicleType: journey.vehicleType.trim(), origin: parsePoint(journey.origin), destination: parsePoint(journey.destination), distanceKm: journey.distanceKm.trim() || null, distanceSource: journey.distanceSource.trim(), trips: Number(journey.trips), people: journey.people.trim() ? Number(journey.people) : null, days: journey.days.trim() || null, quantities: Object.fromEntries(Object.entries(journey.quantities).filter(([, value]) => value.trim()).map(([key, value]) => [key, value.trim()])) })),
      };
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Revise los datos del recorrido."); return; }
    const currentScope = scope.current;
    setBusy("calculate");
    setNotice(null);
    try {
      const result = await transportApi.calculate(authorization, input);
      if (currentScope !== scope.current) return;
      setCalculation(result);
      currentCalculation.current = result;
      setCalculationDirty(false);
    } catch (cause) {
      if (currentScope !== scope.current) return;
      if (isTransportUnauthorized(cause)) onUnauthorized();
      setError(transportErrorMessage(cause));
      if (cause instanceof TransportRequestError && cause.uncertain) setUncertain("calculate");
    } finally { if (currentScope === scope.current) setBusy(null); }
  };

  const publish = async () => {
    if (!access.canPublish || !calculation?.result.complete || calculationDirty || busy || uncertain || publication?.calculationRef === calculation.calculationRef) return;
    const currentScope = scope.current;
    setBusy("publish");
    setError(null);
    try {
      const saved = await transportApi.publish(authorization, calculation.calculationRef);
      if (currentScope !== scope.current) return;
      setPublication(saved);
      setNotice(`Costo de transporte publicado · revisión ${saved.revision}.`);
      onPublished?.();
    } catch (cause) {
      if (currentScope !== scope.current) return;
      if (isTransportUnauthorized(cause)) onUnauthorized();
      setError(transportErrorMessage(cause));
      if (cause instanceof TransportRequestError && (cause.uncertain || cause.status === 409)) setUncertain("publish");
    } finally { if (currentScope === scope.current) setBusy(null); }
  };

  const reconcile = async () => {
    const checked = await load();
    if (!checked) return;
    if (uncertain === "publish" && checked.saved && checked.saved.calculationRef === currentCalculation.current?.calculationRef) {
      setUncertain(null);
      setNotice(`Publicación confirmada · revisión ${checked.saved.revision}.`);
      onPublished?.();
    } else if (uncertain === "calculate") {
      setUncertain(null);
      setCalculation(null);
      currentCalculation.current = null;
      setNotice("Se consultó la publicación vigente. Revise los recorridos y solicite un nuevo cálculo cuando corresponda.");
    } else if (uncertain === "publish") setNotice("La consulta aún no confirma esta publicación. El envío permanece bloqueado; conserve este cálculo y vuelva a consultar su estado.");
  };

  const blocked = loading || !hasRead || Boolean(busy) || Boolean(uncertain);
  const resultLines = calculation?.result.lines || publication?.result.lines || [];
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><p className="text-slate-500">{loading ? "Consultando publicación…" : publication ? `Última publicación: revisión ${publication.revision} · ${formatTransportDate(publication.publishedAt)}` : "Este contexto todavía no tiene un costo de transporte publicado."}</p><button type="button" disabled={Boolean(busy) || loading} onClick={() => void (uncertain ? reconcile() : load())} className="inline-flex min-h-9 items-center gap-1.5 rounded border px-2.5 font-medium text-slate-600 disabled:opacity-40"><RefreshCw className="h-3.5 w-3.5" />Consultar publicación</button></div>
    {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-[#003366]">{notice}</p>}
    {uncertain && <p role="alert" className="rounded border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">No se confirmó {uncertain === "publish" ? "la publicación" : "el cálculo"}. Consulte la publicación antes de continuar. Los envíos quedan bloqueados para evitar repetir la operación.</p>}
    {access.canCalculate && <form onSubmit={(event) => void calculate(event)} className="space-y-3" data-testid="transport-calculation-form">
      <fieldset disabled={blocked} className="min-w-0 space-y-3 disabled:opacity-70">
        <div className="flex flex-wrap items-end gap-3 rounded border border-slate-200 bg-white p-3"><label className="text-xs font-medium text-slate-600">Inicio del desplazamiento *<input required type="datetime-local" value={draft.intervalStart} onChange={(event) => change({ ...draft, intervalStart: event.target.value })} className={`${field} w-56 max-w-full`} /></label><label className="text-xs font-medium text-slate-600">Fin del desplazamiento *<input required type="datetime-local" value={draft.intervalEnd} onChange={(event) => change({ ...draft, intervalEnd: event.target.value })} className={`${field} w-56 max-w-full`} /></label><AdministrationHelp title="Recorridos"><p>Registre un recorrido por vehículo y tramo con política propia. Si hay varias paradas, divida el desplazamiento en los tramos que correspondan.</p><p>Los kilómetros se multiplican por viajes y, únicamente cuando se marca, por regreso. Los pasos de peaje y las cantidades indicadas ya deben incluir todos los viajes y vueltas.</p><p>Las dietas se calculan por personas y días, sin multiplicarlas nuevamente por viajes.</p></AdministrationHelp></div>
        {draft.journeys.map((journey, index) => <JourneyFields key={journey.journeyRef} journey={journey} index={index} vehicles={vehicles} lines={resultLines.filter((line) => line.journeyRef === journey.journeyRef)} disabled={blocked} canRemove={draft.journeys.length > 1} onChange={setJourney} onRemove={() => change({ ...draft, journeys: draft.journeys.filter((row) => row.journeyRef !== journey.journeyRef) })} />)}
        <button type="button" disabled={draft.journeys.length >= 20} onClick={() => change({ ...draft, journeys: [...draft.journeys, newJourney(draft.journeys.length + 1)] })} className="inline-flex min-h-9 items-center gap-1.5 rounded border px-3 text-xs font-medium text-slate-600 disabled:opacity-40"><Plus className="h-3.5 w-3.5" />Añadir recorrido</button>
      </fieldset>
      <div className="flex flex-wrap items-center justify-end gap-2"><button type="submit" disabled={blocked} className="inline-flex min-h-10 items-center gap-1.5 rounded bg-[#003366] px-4 text-xs font-semibold text-white disabled:opacity-40"><Calculator className="h-4 w-4" />{busy === "calculate" ? "Calculando…" : "Calcular transporte"}</button></div>
    </form>}
    {calculation && <section className="space-y-3 rounded border border-slate-200 bg-white p-3" data-testid="transport-calculation-result">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="text-sm font-semibold text-slate-900">Resultado del cálculo</h4><p className="mt-1 text-[11px] text-slate-500">{formatTransportDate(calculation.calculatedAt)}</p></div><span className={`rounded px-2 py-1 text-xs ${calculationDirty ? "bg-amber-50 text-amber-800" : calculation.result.complete ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{calculationDirty ? "Cambios por calcular" : calculation.result.complete ? "Completo" : "Datos pendientes"}</span></div>
      {calculationDirty && <p className="text-xs text-amber-800">Los recorridos cambiaron. Vuelva a calcular para publicar sus valores actuales.</p>}
      <ResultTable result={calculation.result} journeys={calculation.input.journeys} />
      {publication && <details className="rounded border border-slate-200"><summary className="cursor-pointer p-3 text-xs font-medium text-slate-600">Comparar con publicación vigente · revisión {publication.revision}</summary><div className="px-3 pb-3"><CostComparison previous={publication.result} current={calculation.result} /></div></details>}
      {access.canPublish && <div className="flex justify-end"><button type="button" disabled={blocked || !calculation.result.complete || calculationDirty || publication?.calculationRef === calculation.calculationRef} onClick={() => void publish()} className="inline-flex min-h-10 items-center gap-1.5 rounded bg-[#003366] px-4 text-xs font-semibold text-white disabled:opacity-40"><Check className="h-4 w-4" />{busy === "publish" ? "Publicando…" : publication?.calculationRef === calculation.calculationRef ? "Publicado" : "Publicar costo de transporte"}</button></div>}
    </section>}
    {publication && <details open={!access.canCalculate || !calculation || undefined} className="rounded border border-slate-200 bg-white" data-testid="transport-publication"><summary className="cursor-pointer p-3 text-xs font-semibold text-slate-700">Costo publicado · revisión {publication.revision} · {PURPOSE_LABELS[publication.context.purpose]}</summary><div className="space-y-3 px-3 pb-3"><ResultTable result={publication.result} journeys={publication.input.journeys} /><details className="border-t pt-3"><summary className="cursor-pointer text-xs font-medium text-slate-600">Recorridos utilizados</summary><div className="mt-2 overflow-x-auto"><table className="w-full min-w-[630px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-2">Recorrido</th><th className="p-2">Vehículo</th><th className="p-2">Kilómetros</th><th className="p-2">Viajes</th><th className="p-2">Regreso</th><th className="p-2">Fuente vial</th></tr></thead><tbody>{publication.input.journeys.map((journey) => <tr key={journey.journeyRef} className="border-t"><td className="p-2">{journey.label}</td><td className="p-2">{journey.vehicleType}</td><td className="p-2 tabular-nums">{formatTransportNumber(journey.distanceKm)}</td><td className="p-2 tabular-nums">{journey.trips}</td><td className="p-2">{journey.returnToOrigin ? "Incluido" : "Sin duplicar"}</td><td className="p-2">{journey.distanceSource || "Pendiente"}</td></tr>)}</tbody></table></div></details></div></details>}
  </div>;
}

function JourneyFields({ journey, index, vehicles, lines, disabled, canRemove, onChange, onRemove }: Readonly<{ journey: JourneyDraft; index: number; vehicles: TransportWorkspace["vehicles"]; lines: readonly TransportLine[]; disabled: boolean; canRemove: boolean; onChange(journey: JourneyDraft): void; onRemove(): void }>) {
  const [mapPoint, setMapPoint] = useState<"origin" | "destination" | null>(null);
  const selectedMapPoints = useMemo(() => {
    if (!mapPoint) return [];
    try { const point = parsePoint(journey[mapPoint]); return point ? [point] : []; } catch { return []; }
  }, [journey, mapPoint]);
  const quantities = useMemo(() => [...new Map(lines.filter((line) => line.basis === "PASS" || line.basis === "FIXED").map((line) => [line.componentCode, line])).values()], [lines]);
  const unmatchedQuantities = Object.keys(journey.quantities).filter((code) => journey.quantities[code].trim() && lines.length > 0 && !quantities.some((line) => line.componentCode === code));
  const set = <K extends keyof JourneyDraft>(key: K, value: JourneyDraft[K]) => onChange({ ...journey, [key]: value });
  const chooseVehicle = (vehicleRef: string) => { const vehicle = vehicles.find((row) => row.vehicleRef === vehicleRef); onChange({ ...journey, vehicleRef: vehicle?.vehicleRef || null, vehicleType: vehicle?.vehicleType || journey.vehicleType }); };

  return <section className="space-y-3 rounded border border-slate-200 bg-white p-3" aria-label={`Recorrido ${index + 1}`}>
    <div className="flex items-center justify-between gap-2"><h4 className="text-xs font-semibold text-slate-700">Recorrido {index + 1}</h4>{canRemove && <button type="button" aria-label={`Quitar recorrido ${index + 1}`} onClick={onRemove} className="grid h-9 w-9 place-items-center rounded border text-slate-500"><Trash2 className="h-3.5 w-3.5" /></button>}</div>
    <div className="grid gap-3 sm:grid-cols-3"><label className="text-xs font-medium text-slate-600">Descripción *<input required maxLength={120} value={journey.label} onChange={(event) => set("label", event.target.value)} className={field} /></label><label className="text-xs font-medium text-slate-600">Vehículo de flota<select value={journey.vehicleRef || ""} onChange={(event) => chooseVehicle(event.target.value)} className={field}><option value="">Usar un tipo de vehículo</option>{journey.vehicleRef && !vehicles.some((vehicle) => vehicle.vehicleRef === journey.vehicleRef) && <option value={journey.vehicleRef}>Vehículo guardado · {journey.vehicleType}</option>}{vehicles.map((vehicle) => <option key={vehicle.vehicleRef} value={vehicle.vehicleRef}>{vehicle.businessCode} · {vehicle.vehicleType}</option>)}</select></label><label className="text-xs font-medium text-slate-600">Tipo de vehículo *<input required maxLength={80} disabled={Boolean(journey.vehicleRef)} value={journey.vehicleType} onChange={(event) => set("vehicleType", event.target.value)} placeholder="Perfil configurado" className={field} /></label></div>
    <div className="grid gap-3 sm:grid-cols-2">{(["origin", "destination"] as const).map((point) => <div key={point} className="rounded border border-slate-200 p-3"><div className="mb-2 flex items-center justify-between gap-2"><span className="text-xs font-medium text-slate-700">{point === "origin" ? "Salida" : "Destino"}</span><button type="button" aria-pressed={mapPoint === point} onClick={() => setMapPoint(mapPoint === point ? null : point)} className="inline-flex min-h-9 items-center gap-1 rounded border px-2 text-xs text-[#003366]"><MapPin className="h-3.5 w-3.5" />Ubicar en mapa</button></div><div className="flex flex-wrap gap-2"><label className="text-[11px] text-slate-500">Latitud<NumericInput inputMode="text" aria-label={`${point === "origin" ? "Latitud de salida" : "Latitud de destino"} del recorrido ${index + 1}`} step="0.000001" min="-90" max="90" value={journey[point].latitude} onChange={(event) => set(point, { ...journey[point], latitude: event.target.value })} className={`${field} w-32 max-w-32`} /></label><label className="text-[11px] text-slate-500">Longitud<NumericInput inputMode="text" aria-label={`${point === "origin" ? "Longitud de salida" : "Longitud de destino"} del recorrido ${index + 1}`} step="0.000001" min="-180" max="180" value={journey[point].longitude} onChange={(event) => set(point, { ...journey[point], longitude: event.target.value })} className={`${field} w-32 max-w-32`} /></label></div></div>)}</div>
    {mapPoint && <div className="space-y-2 rounded border border-slate-200 p-3"><div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-600">Ubicación de {mapPoint === "origin" ? "salida" : "destino"}</p><button type="button" aria-label="Cerrar mapa del recorrido" onClick={() => setMapPoint(null)} className="grid h-8 w-8 place-items-center rounded text-slate-500"><X className="h-4 w-4" /></button></div><Suspense fallback={<p role="status" className="p-8 text-center text-xs text-slate-500">Cargando mapa…</p>}><TransportZoneMap key={mapPoint} points={selectedMapPoints} mode="points" selectedPoint={0} disabled={disabled} label={`Mapa de ${mapPoint === "origin" ? "salida" : "destino"}`} onChange={(points) => { const point = points[0]; if (point) set(mapPoint, { longitude: String(point[0]), latitude: String(point[1]) }); }} /></Suspense></div>}
    <div className="flex flex-wrap items-end gap-3"><label className="text-xs font-medium text-slate-600">Km viales<NumericInput min="0" max="999999.9999" step="0.0001" value={journey.distanceKm} onChange={(event) => set("distanceKm", event.target.value)} placeholder="Pendiente" className={compact} /></label><label className="min-w-44 flex-1 text-xs font-medium text-slate-600">Fuente del recorrido vial<input maxLength={240} value={journey.distanceSource} onChange={(event) => set("distanceSource", event.target.value)} placeholder="Ruta o medición confirmada" className={field} /></label><label className="text-xs font-medium text-slate-600">Viajes *<NumericInput required min="1" max="9999" step="1" value={journey.trips} onChange={(event) => set("trips", event.target.value)} className={compact} /></label><label className="flex min-h-8 items-center gap-2 text-xs text-slate-600 sm:min-h-7"><input type="checkbox" checked={journey.returnToOrigin} onChange={(event) => set("returnToOrigin", event.target.checked)} className="h-4 w-4 accent-[#003366]" />Añadir regreso</label><AdministrationHelp title="Kilómetros, viajes y regreso"><p>Ejemplo: 100 km de ida × 1 viaje = 100 km. Con 2 viajes se calculan 200 km; si además añade regreso, son 400 km.</p><p>Estos kilómetros afectan el combustible y los renglones por kilómetro. Una tarifa por viaje cambia con la cantidad de viajes, no con la distancia.</p><p>Si ya registró los kilómetros de ida y vuelta, no marque regreso. Los pasos de peaje se indican aparte como cantidad total.</p></AdministrationHelp></div>
    <div className="flex flex-wrap items-end gap-3"><label className="text-xs font-medium text-slate-600">Personas<NumericInput min="0" max="9999" step="1" value={journey.people} onChange={(event) => set("people", event.target.value)} placeholder="Pendiente" className={compact} /></label><label className="text-xs font-medium text-slate-600">Días<NumericInput min="0" max="9999" step="0.01" value={journey.days} onChange={(event) => set("days", event.target.value)} placeholder="Pendiente" className={compact} /></label><AdministrationHelp title="Personas y días"><p>Para dietas y viáticos por persona / día se multiplica personas × días × tarifa.</p><p>Ejemplo ilustrativo, tarifa DOP 500: 2 personas × 1 día cuestan DOP 1,000. Con 3 personas son DOP 1,500; con 3 personas y 2 días son DOP 3,000.</p><p>Los viajes no vuelven a multiplicar esta cantidad. Deje pendiente el dato que todavía no haya confirmado.</p></AdministrationHelp></div>
    {unmatchedQuantities.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><p>Hay cantidades de una zona anterior que ya no corresponden a este recorrido.</p><button type="button" onClick={() => set("quantities", Object.fromEntries(Object.entries(journey.quantities).filter(([code]) => !unmatchedQuantities.includes(code))))} className="min-h-9 rounded border border-amber-300 bg-white px-3 font-medium">Retirar cantidades anteriores</button></div>}
    {quantities.length > 0 && <div className="space-y-2 border-t pt-3"><div className="flex items-center gap-1"><h5 className="text-xs font-semibold text-slate-600">Cantidades del recorrido</h5><AdministrationHelp title="Peajes y cantidades"><p>Indique el total de pasos o unidades de todos los viajes y regresos de este recorrido. El motor no los vuelve a multiplicar.</p><p>Ejemplo ilustrativo: una tarifa de DOP 200 por paso cuesta DOP 400 con 2 pasos y DOP 800 con 4 pasos. Aumentar los viajes no duplica automáticamente estos pasos.</p><p>Deje vacío lo que aún no esté confirmado. Ingrese cero si el concepto no tiene cantidad en este recorrido.</p></AdministrationHelp></div><div className="flex flex-wrap items-end gap-3">{quantities.map((line) => <label key={line.componentCode} className="max-w-48 text-xs font-medium text-slate-600">{line.concept}<span className="block text-[11px] font-normal text-slate-400">{line.basis === "PASS" ? "Pasos totales" : "Unidades totales"}</span><NumericInput aria-label={`${line.concept} del recorrido ${index + 1}`} min="0" step={line.basis === "PASS" ? "1" : "0.0001"} value={journey.quantities[line.componentCode] ?? ""} onChange={(event) => set("quantities", { ...journey.quantities, [line.componentCode]: event.target.value })} placeholder="Pendiente" className={compact} /></label>)}</div></div>}
  </section>;
}

function ResultTable({ result, journeys }: Readonly<{ result: TransportResult; journeys: readonly TransportJourney[] }>) {
  const names = new Map(journeys.map((journey) => [journey.journeyRef, journey.label]));
  return <div className="space-y-3">
    {result.issues.length > 0 && <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><h5 className="font-semibold">{result.complete ? "Observaciones" : "Datos por completar"}</h5><ul className="mt-2 list-disc space-y-1 pl-4">{result.issues.map((issue, index) => <li key={`${issue.code}:${issue.journeyRef}:${index}`}>{issue.journeyRef && names.get(issue.journeyRef) ? `${names.get(issue.journeyRef)}: ` : ""}{issue.message}</li>)}</ul></div>}
    <div className="overflow-x-auto rounded border border-slate-200"><table className="w-full min-w-[860px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-2 font-medium">Recorrido</th><th className="p-2 font-medium">Zona</th><th className="p-2 font-medium">Concepto</th><th className="p-2 font-medium">Base</th><th className="p-2 text-right font-medium">Cantidad</th><th className="p-2 text-right font-medium">Tarifa aplicada</th><th className="p-2 text-right font-medium">Costo</th></tr></thead><tbody>{result.lines.map((line, index) => <tr key={`${line.journeyRef}:${line.componentCode}:${index}`} className="border-t"><td className="p-2 text-slate-600">{names.get(line.journeyRef) || "Recorrido"}</td><td className="p-2"><span className="block">{line.zoneCode}</span><span className="text-[10px] text-slate-500">{line.zoneType === "METRO" ? "Metro" : "Fuera de metro"} · v{line.zoneVersion}</span></td><td className="p-2"><span className="block font-medium">{line.concept}</span><span className="text-[10px] text-slate-500">Tarifa v{line.costRuleVersion}</span>{line.kind === "FUEL" && <span className="block text-[10px] text-slate-500">{line.fuelType || "Combustible pendiente"} · {formatTransportNumber(line.kmPerGallon)} km/gal {line.gallonUnit === "IMPERIAL" ? "imperial" : line.gallonUnit === "US" ? "US" : "pendiente"}</span>}</td><td className="p-2 text-slate-600">{BASIS_LABELS[line.basis]}{line.factor && <span className="block text-[10px]">Base {line.currency} {formatTransportNumber(line.baseUnitCost, 4)} × {formatTransportNumber(line.factor, 6)}</span>}</td><td className="p-2 text-right tabular-nums">{formatTransportNumber(line.quantity, 6)}{line.quantity !== null && <span className="ml-1 text-[10px] text-slate-500">{UNIT_LABELS[line.basis]}</span>}</td><td className="p-2 text-right tabular-nums">{line.unitCost === null ? "Pendiente" : `${line.currency} ${formatTransportNumber(line.unitCost, 4)}`}</td><td className="p-2 text-right font-medium tabular-nums">{line.totalCost === null ? <span className="text-amber-800">Pendiente</span> : `${line.currency} ${formatTransportNumber(line.totalCost, 2)}`}</td></tr>)}{!result.lines.length && <tr><td colSpan={7} className="p-5 text-center text-slate-500">Complete la ubicación y el perfil para identificar los costos aplicables.</td></tr>}</tbody></table></div>
    {result.totals.length > 0 && <div className="flex flex-wrap justify-end gap-5">{result.totals.map((total) => <p key={total.currency} className="text-right text-xs text-slate-500">Total {total.currency}<strong className={`mt-1 block text-base tabular-nums ${total.amount === null ? "text-amber-800" : "text-[#003366]"}`}>{formatTransportNumber(total.amount, 2)}</strong></p>)}</div>}
  </div>;
}

function CostComparison({ previous, current }: { previous: TransportResult; current: TransportResult }) {
  const currencies = [...new Set([...previous.totals, ...current.totals].map((total) => total.currency))];
  return <table className="w-full text-left text-xs"><thead className="text-slate-500"><tr><th className="py-2 font-medium">Moneda</th><th className="py-2 text-right font-medium">Publicado</th><th className="py-2 text-right font-medium">Calculado</th></tr></thead><tbody>{currencies.map((currency) => <tr key={currency} className="border-t"><td className="py-2">{currency}</td><td className="py-2 text-right tabular-nums">{formatTransportNumber(previous.totals.find((total) => total.currency === currency)?.amount ?? null, 2)}</td><td className="py-2 text-right tabular-nums">{formatTransportNumber(current.totals.find((total) => total.currency === currency)?.amount ?? null, 2)}</td></tr>)}</tbody></table>;
}
