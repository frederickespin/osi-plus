import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Calculator, CheckCircle2, LoaderCircle, MapPin, MapPinned, Navigation, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { AdministrationHelp } from "@/administration/AdministrationHelp";
import { COMPACT_FORM_FIELD } from "@/components/ui/compact-form";
import { NumericInput } from "@/components/ui/numeric-input";
import { cn } from "@/lib/utils";
import { isTransportUnauthorized, transportApi, transportErrorMessage, TransportRequestError, type CaseTravelLeg, type TransportCalculateInput, type TransportCalculation, type TransportCaseAddresses, type TransportCoordinate, type TransportJourney, type TransportLine, type TransportPublication, type TransportReferenceBase, type TransportResult, type TransportWorkspace } from "./transportApi";
import { isRoadTransportComponent } from "../../shared/transportCostScope.js";
import type { TransportUiAccess } from "./transportAccess";
import { BASIS_LABELS, PURPOSE_LABELS, UNIT_LABELS, formatTransportDate, formatTransportNumber } from "./transportPresentation";
import { calculateRoadRoute, reverseTransportLocation, searchTransportLocations, type TransportLocation } from "./transportRouting";

const TransportZoneMap = lazy(() => import("./TransportZoneMap"));
const field = cn(COMPACT_FORM_FIELD, "mt-1 block w-full text-sm font-normal leading-4");
const compact = `${field} w-24 max-w-24 tabular-nums`;
type Props = Readonly<{
  authorization?: string;
  caseRef: string;
  addresses: TransportCaseAddresses;
  access: TransportUiAccess;
  onUnauthorized(): void;
  onPublished?(): void;
}>;
type PointDraft = { longitude: string; latitude: string; address: string; countryCode: string };
type JourneyDraft = Omit<TransportJourney, "origin" | "destination" | "distanceKm" | "trips" | "people" | "days" | "quantities"> & {
  origin: PointDraft; destination: PointDraft; distanceKm: string; trips: string; quantities: Record<string, string>;
};
type Draft = { journeys: JourneyDraft[] };
const EMPTY_WORKSPACE: TransportWorkspace = { cases: [], visits: [], vehicles: [] };
const EMPTY_POINT: PointDraft = { longitude: "", latitude: "", address: "", countryCode: "" };
const PURPOSE = "QUOTE";

function newJourney(number: number): JourneyDraft {
  return { journeyRef: crypto.randomUUID(), label: `Recorrido ${number}`, vehicleType: "", vehicleRef: null, origin: EMPTY_POINT, destination: EMPTY_POINT, distanceKm: "", distanceSource: "", returnToOrigin: false, trips: "1", quantities: {} };
}

function fromCaseLeg(leg: CaseTravelLeg, days: number, baseAddress: string, vehicle: JourneyDraft): JourneyDraft {
  const point = (coordinate: TransportCoordinate | null, address: string): PointDraft => ({
    longitude: coordinate ? String(coordinate[0]) : "", latitude: coordinate ? String(coordinate[1]) : "", address, countryCode: "DO",
  });
  return {
    ...newJourney(1), label: `${leg.from.label} → ${leg.to.label}`.slice(0, 120), trips: String(days),
    vehicleRef: vehicle.vehicleRef, vehicleType: vehicle.vehicleType, operatingBaseAddress: baseAddress,
    ...(leg.returnToBase && { returnToBase: true }),
    origin: point(leg.origin, leg.from.address), destination: point(leg.destination, leg.to.address),
    distanceKm: leg.distanceKm === null ? "" : String(leg.distanceKm), distanceSource: leg.source || "",
  };
}

function fromPublication({ input, result }: TransportPublication): Draft {
  const point = (coordinate: TransportCoordinate | null, address: string): PointDraft => ({
    longitude: coordinate === null ? "" : String(coordinate[0]),
    latitude: coordinate === null ? "" : String(coordinate[1]),
    address,
    countryCode: "",
  });
  return {
    journeys: input.journeys.map((journey) => {
      const personnelCodes = new Set(result.lines.filter((line) => line.journeyRef === journey.journeyRef && !isRoadTransportComponent(line)).map((line) => line.componentCode));
      return {
        ...journey,
        origin: journey.referenceBaseAddress
          ? { ...EMPTY_POINT, address: journey.originLabel || journey.referenceBaseAddress, countryCode: "DO" }
          : point(journey.origin, journey.originLabel || "Punto guardado"),
        destination: point(journey.destination, journey.destinationLabel || "Punto guardado"),
        distanceKm: journey.distanceKm ?? "", trips: String(journey.trips),
        quantities: Object.fromEntries(Object.entries(journey.quantities).filter(([code]) => !personnelCodes.has(code))),
      };
    }),
  };
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
  return <CaseTransport key={`${props.caseRef}:${props.addresses.revision ?? 0}`} {...props} />;
}

function CaseTransport({ authorization, caseRef, addresses, access, onUnauthorized, onPublished }: Props) {
  const [draft, setDraft] = useState<Draft>(() => ({ journeys: [newJourney(1)] }));
  const [workspace, setWorkspace] = useState<TransportWorkspace>(EMPTY_WORKSPACE);
  const [publication, setPublication] = useState<TransportPublication | null>(null);
  const [calculation, setCalculation] = useState<TransportCalculation | null>(null);
  const [calculationDirty, setCalculationDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasRead, setHasRead] = useState(false);
  const [busy, setBusy] = useState<"calculate" | "publish" | null>(null);
  const [uncertain, setUncertain] = useState<"calculate" | "publish" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [appliedTravel, setAppliedTravel] = useState<string | null>(null);
  const touched = useRef(false);
  const scope = useRef(0);
  const currentCalculation = useRef<TransportCalculation | null>(null);
  const pendingSave = useRef<{ calculationRef: string; requestId: string } | null>(null);
  const travelKey = JSON.stringify([addresses.travel?.base?.address, addresses.travel?.terminal?.address, addresses.completeDays, addresses.preparationDays]);
  const travelChanged = appliedTravel !== null && appliedTravel !== travelKey;

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const [saved, choices] = await Promise.all([
        transportApi.publication(authorization, { caseRef, purpose: PURPOSE, contextRef: null }, signal),
        access.canCalculate ? transportApi.context(authorization, { caseRef }, signal) : Promise.resolve(EMPTY_WORKSPACE),
      ]);
      if (signal?.aborted) return null;
      setWorkspace(choices);
      setPublication(saved);
      setHasRead(true);
      if (saved && (addresses.revision === undefined || (saved.routeRevision ?? saved.input.routeRevision) === addresses.revision) && !touched.current) setDraft(fromPublication(saved));
      return { saved };
    } catch (cause) {
      if (signal?.aborted) return null;
      if (isTransportUnauthorized(cause)) onUnauthorized();
      else setError(transportErrorMessage(cause));
      return null;
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [access.canCalculate, addresses.revision, authorization, caseRef, onUnauthorized]);

  useEffect(() => {
    const controller = new AbortController();
    scope.current += 1;
    void load(controller.signal);
    return () => { controller.abort(); scope.current += 1; };
  }, [load]);

  const change = (next: Draft) => { touched.current = true; setDraft(next); setCalculationDirty(true); setNotice(null); };
  const setJourney = (journey: JourneyDraft) => change({ ...draft, journeys: draft.journeys.map((row) => row.journeyRef === journey.journeyRef ? journey : row) });

  const calculate = async (event: FormEvent) => {
    event.preventDefault();
    if (!access.canCalculate || busy || uncertain) return;
    setError(null);
    let input: TransportCalculateInput;
    try {
      const journeys = draft.journeys.map((journey) => {
        const { referenceBaseAddress } = journey;
        const origin = parsePoint(journey.origin);
        const destination = parsePoint(journey.destination);
        if ((!origin && !referenceBaseAddress) || !destination) throw new Error(`Indique la salida y el destino de «${journey.label}».`);
        if (journey.origin.countryCode && journey.destination.countryCode && journey.origin.countryCode !== journey.destination.countryCode) {
          throw new Error(`Seleccione el tramo terrestre dentro del país para «${journey.label}».`);
        }
        if (!referenceBaseAddress && (!journey.distanceKm.trim() || !journey.distanceSource.trim())) {
          throw new Error(`Confirme la distancia vial de «${journey.label}».`);
        }
        return {
          journeyRef: journey.journeyRef,
          label: journey.label.trim(), vehicleType: journey.vehicleType.trim(), vehicleRef: journey.vehicleRef,
          origin, destination, returnToOrigin: journey.returnToOrigin,
          ...(referenceBaseAddress && { referenceBaseAddress }),
          ...(journey.operatingBaseAddress && { operatingBaseAddress: journey.operatingBaseAddress }),
          ...(journey.returnToBase && { returnToBase: true }),
          originLabel: journey.origin.address.slice(0, 240).trim() || "Salida",
          destinationLabel: journey.destination.address.slice(0, 240).trim() || "Destino",
          distanceKm: journey.distanceKm.trim() || null, distanceSource: journey.distanceSource.trim(),
          trips: Number(journey.trips), people: null, days: null,
          quantities: Object.fromEntries(Object.entries(journey.quantities).filter(([, value]) => value.trim()).map(([key, value]) => [key, value.trim()])),
        };
      });
      input = {
        caseRef, purpose: PURPOSE, contextRef: null, intervalStart: null, intervalEnd: null, journeys,
        ...(addresses.revision !== undefined && { routeRevision: addresses.revision }),
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
      if (result.result.complete && access.canPublish) {
        const command = { calculationRef: result.calculationRef, requestId: crypto.randomUUID() };
        pendingSave.current = command;
        await saveTransport(command, currentScope);
      }
    } catch (cause) {
      if (currentScope !== scope.current) return;
      if (isTransportUnauthorized(cause)) onUnauthorized();
      setError(transportErrorMessage(cause));
      if (cause instanceof TransportRequestError && cause.uncertain) setUncertain("calculate");
    } finally { if (currentScope === scope.current) setBusy(null); }
  };

  const saveTransport = async (command: { calculationRef: string; requestId: string }, currentScope: number) => {
    setBusy("publish");
    try {
      const saved = await transportApi.publish(authorization, command.calculationRef, undefined, command.requestId);
      if (currentScope !== scope.current) return;
      pendingSave.current = null;
      setUncertain(null);
      setPublication(saved);
      setNotice(`Transporte aplicado a la cotización · revisión ${saved.revision}.`);
      onPublished?.();
    } catch (cause) {
      if (currentScope !== scope.current) return;
      if (isTransportUnauthorized(cause)) onUnauthorized();
      setError(transportErrorMessage(cause));
      if (cause instanceof TransportRequestError && cause.uncertain) setUncertain("publish");
      else { pendingSave.current = null; setUncertain(null); }
    } finally { if (currentScope === scope.current) setBusy(null); }
  };

  const reconcile = async () => {
    const currentScope = scope.current;
    const checked = await load();
    if (currentScope !== scope.current) return;
    if (!checked) return;
    if (uncertain === "publish" && checked.saved && checked.saved.calculationRef === currentCalculation.current?.calculationRef) {
      setUncertain(null);
      pendingSave.current = null;
      setNotice(`Transporte confirmado · revisión ${checked.saved.revision}.`);
      onPublished?.();
    } else if (uncertain === "calculate") {
      setUncertain(null);
      setCalculation(null);
      currentCalculation.current = null;
      setNotice("Se consultó la publicación vigente. Revise los recorridos y solicite un nuevo cálculo cuando corresponda.");
    } else if (uncertain === "publish" && pendingSave.current) {
      await saveTransport(pendingSave.current, currentScope);
    }
  };

  const blocked = loading || !hasRead || Boolean(busy) || Boolean(uncertain);
  const oldRoute = publication && addresses.revision !== undefined && (publication.routeRevision ?? publication.input.routeRevision) !== addresses.revision;
  const resultLines = (calculation?.result.lines ?? (oldRoute ? [] : publication?.result.lines) ?? []).filter(isRoadTransportComponent);
  const legacyPublication = publication?.result.lines.some((line) => !isRoadTransportComponent(line));
  const travel = addresses.travel;
  const completeDays = addresses.completeDays;
  const preparationDays = addresses.preparationDays ?? 0;
  const canLoadDays = completeDays !== undefined && completeDays <= 366 && preparationDays <= 366 && completeDays + preparationDays > 0;
  function loadCaseJourneys() {
    if (!canLoadDays || completeDays === undefined || !travel?.base) return;
    const base = travel.base.address;
    const vehicle = draft.journeys[0];
    const journeys = [[travel.legs, completeDays], [travel.preparation, preparationDays]] as const;
    const rows = journeys.flatMap(([legs, days]) => days ? legs.filter((leg) => leg.distanceKm !== 0 || leg.source !== "Mismo punto")
      .map((leg) => fromCaseLeg(leg, days, base, vehicle)) : []);
    if (rows.length) { change({ journeys: rows }); setAppliedTravel(travelKey); }
  }
  return <section className="space-y-3" data-testid="transport-calculation-panel" aria-label="Transporte de la cotización">
    <header className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-1"><h3 className="text-sm font-semibold text-slate-900">Transporte de la cotización</h3><AdministrationHelp title="Transporte de la cotización"><p>Use las direcciones del caso o seleccione un tramo en el mapa. Las tarifas de vehículo y peajes se toman del Motor Logístico.</p><p>Para usar kilómetros de referencia desde una sede, selecciónela en Salida. El costo se incorpora a la cotización cuando están completos los datos.</p></AdministrationHelp></div>
    </header>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><p className="text-slate-500">{loading ? "Cargando transporte…" : oldRoute ? "La ruta del caso cambió. Calcule el nuevo recorrido." : publication ? `Costo aplicado · ${formatTransportDate(publication.publishedAt)}` : "Sin costo de transporte aplicado."}</p>{uncertain && <button type="button" disabled={Boolean(busy) || loading} onClick={() => void reconcile()} className="inline-flex min-h-8 items-center gap-1.5 rounded border px-2.5 font-medium text-amber-800 disabled:opacity-40"><RefreshCw className="h-3.5 w-3.5" />Confirmar estado</button>}</div>
    {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-[#003366]">{notice}</p>}
    {uncertain && <p role="alert" className="rounded border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">No se confirmó {uncertain === "publish" ? "el guardado del costo" : "el cálculo"}. Confirme el estado para continuar.</p>}
    {access.canCalculate && <form onSubmit={(event) => void calculate(event)} className="space-y-3" data-testid="transport-calculation-form">
      {travel?.legs.length ? <div className="flex flex-wrap items-center gap-2 text-xs">
        <button type="button" disabled={blocked || !canLoadDays} onClick={loadCaseJourneys} className="min-h-8 rounded border px-2.5 font-semibold text-[#003366] disabled:opacity-40">Cargar tramos del caso</button>
        {!canLoadDays && <span className="text-slate-500">Indique los días en Recorrido diario.</span>}
      </div> : null}
      {travelChanged && <p role="status" className="text-xs text-amber-800">La sede o los días cambiaron. Vuelva a cargar los tramos para actualizar el cálculo.</p>}
      <fieldset disabled={blocked} className="min-w-0 space-y-3 disabled:opacity-70">
        {draft.journeys.map((journey, index) => <JourneyFields key={journey.journeyRef} journey={journey} index={index} vehicles={workspace.vehicles} bases={workspace.referenceBases ?? []} addresses={index === 0 ? addresses : undefined} lines={resultLines.filter((line) => line.journeyRef === journey.journeyRef)} disabled={blocked} canRemove={draft.journeys.length > 1} onChange={setJourney} onRemove={() => change({ ...draft, journeys: draft.journeys.filter((row) => row.journeyRef !== journey.journeyRef) })} />)}
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" disabled={blocked || draft.journeys.length >= 20} onClick={() => change({ journeys: [...draft.journeys, newJourney(draft.journeys.length + 1)] })} className="inline-flex min-h-9 items-center gap-1.5 rounded border px-2.5 text-xs font-medium text-slate-600 disabled:opacity-40"><Plus className="size-3.5" aria-hidden="true" />Añadir tramo</button>
        <button type="submit" disabled={blocked || travelChanged} className="inline-flex min-h-10 items-center gap-1.5 rounded bg-[#003366] px-4 text-xs font-semibold text-white disabled:opacity-40"><Calculator className="h-4 w-4" />{busy === "calculate" ? "Calculando…" : busy === "publish" ? "Aplicando…" : "Calcular transporte"}</button></div>
    </form>}
    {calculation && <section className="space-y-3 rounded border border-slate-200 bg-white p-3" data-testid="transport-calculation-result">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="text-sm font-semibold text-slate-900">Resultado del cálculo</h4><p className="mt-1 text-[11px] text-slate-500">{formatTransportDate(calculation.calculatedAt)}</p></div><span className={`rounded px-2 py-1 text-xs ${calculationDirty ? "bg-amber-50 text-amber-800" : calculation.result.complete ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{calculationDirty ? "Cambios por calcular" : calculation.result.complete ? "Completo" : "Datos pendientes"}</span></div>
      {calculationDirty && <p className="text-xs text-amber-800">Los recorridos cambiaron. Vuelva a calcular para publicar sus valores actuales.</p>}
      <ResultTable result={calculation.result} journeys={calculation.input.journeys} />
      {publication && <details className="rounded border border-slate-200"><summary className="cursor-pointer p-3 text-xs font-medium text-slate-600">Comparar con publicación vigente · revisión {publication.revision}</summary><div className="px-3 pb-3"><CostComparison previous={publication.result} current={calculation.result} /></div></details>}
      {!access.canPublish && calculation.result.complete && <p className="text-xs text-slate-600">Estimación para consulta. Aplicar el costo requiere permiso de publicación.</p>}
    </section>}
    {publication && <details open={!access.canCalculate || (!legacyPublication && !oldRoute && !calculation) || undefined} className="rounded border border-slate-200 bg-white" data-testid="transport-publication"><summary className="cursor-pointer p-3 text-xs font-semibold text-slate-700">{legacyPublication || oldRoute ? "Historial de transporte" : "Costo aplicado"} · revisión {publication.revision} · {PURPOSE_LABELS[publication.context.purpose]}</summary><div className="space-y-3 px-3 pb-3"><ResultTable result={publication.result} journeys={publication.input.journeys} /><details className="border-t pt-3"><summary className="cursor-pointer text-xs font-medium text-slate-600">Recorridos utilizados</summary><div className="mt-2 overflow-x-auto"><table className="w-full min-w-[630px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-2">Recorrido</th><th className="p-2">Vehículo</th><th className="p-2">Kilómetros</th><th className="p-2">Viajes</th><th className="p-2">Regreso</th><th className="p-2">Fuente vial</th></tr></thead><tbody>{publication.input.journeys.map((journey) => <tr key={journey.journeyRef} className="border-t"><td className="p-2">{journey.label}</td><td className="p-2">{journey.vehicleType}</td><td className="p-2 tabular-nums">{formatTransportNumber(journey.distanceKm)}</td><td className="p-2 tabular-nums">{journey.trips}</td><td className="p-2">{journey.returnToOrigin ? "Incluido" : "Sin duplicar"}</td><td className="p-2">{journey.distanceSource || "Pendiente"}</td></tr>)}</tbody></table></div></details></div></details>}
  </section>;
}

const ROUTE_POINT_LABELS = ["S", "D"] as const;
const DESTINATION_LABEL = ["D"] as const;

function pointValue(point: PointDraft): TransportCoordinate | null {
  try { return parsePoint(point); } catch { return null; }
}

function routeErrorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : "MAP_SERVICE_UNAVAILABLE";
  if (code === "ADDRESS_NOT_FOUND") return "No se encontró una dirección cercana a ese punto.";
  if (code === "ROAD_ROUTE_NOT_FOUND") return "No se encontró una ruta vial entre los puntos seleccionados.";
  return "El servicio de mapas no respondió. Intente nuevamente.";
}

function JourneyFields({ journey, index, vehicles, bases, addresses, lines, disabled, canRemove, onChange, onRemove }: Readonly<{ journey: JourneyDraft; index: number; vehicles: TransportWorkspace["vehicles"]; bases: readonly TransportReferenceBase[]; addresses?: TransportCaseAddresses; lines: readonly TransportLine[]; disabled: boolean; canRemove: boolean; onChange(journey: JourneyDraft): void; onRemove(): void }>) {
  const [mapPoint, setMapPoint] = useState<"origin" | "destination" | null>(null);
  const [addressQuery, setAddressQuery] = useState("");
  const [addressResults, setAddressResults] = useState<TransportLocation[]>([]);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [routeBusy, setRouteBusy] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeDuration, setRouteDuration] = useState<number | null>(null);
  const routeRequest = useRef(0);
  const originPoint = pointValue(journey.origin);
  const destinationPoint = pointValue(journey.destination);
  const mapIndex = mapPoint === "destination" && originPoint ? 1 : 0;
  const mapLabels = mapPoint === "destination" && !originPoint ? DESTINATION_LABEL : ROUTE_POINT_LABELS;
  const selectedMapPoints = useMemo(() => {
    const origin = pointValue(journey.origin);
    if (mapPoint === "origin" && !origin) return [];
    return [origin, pointValue(journey.destination)].filter((point): point is TransportCoordinate => point !== null);
  }, [journey.destination, journey.origin, mapPoint]);
  const hasOrigin = Boolean(originPoint || journey.referenceBaseAddress);
  const quantities = useMemo(() => [...new Map(lines.filter((line) => line.basis === "PASS" || line.basis === "FIXED").map((line) => [line.componentCode, line])).values()], [lines]);
  const unmatchedQuantities = Object.keys(journey.quantities).filter((code) => journey.quantities[code].trim() && lines.length > 0 && !quantities.some((line) => line.componentCode === code));
  const set = <K extends keyof JourneyDraft>(key: K, value: JourneyDraft[K]) => {
    onChange({ ...journey, [key]: value, ...(key === "returnToOrigin" && value === true && { returnToBase: undefined }), ...(["trips", "returnToOrigin", "vehicleType"].includes(key) && { quantities: {} }) });
  };
  const chooseVehicle = (vehicleRef: string) => { const vehicle = vehicles.find((row) => row.vehicleRef === vehicleRef); onChange({ ...journey, vehicleRef: vehicle?.vehicleRef || null, vehicleType: vehicle?.vehicleType || journey.vehicleType, quantities: {} }); };

  useEffect(() => {
    if (!mapPoint || addressQuery.trim().length < 3) { setAddressResults([]); setSearchingAddress(false); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearchingAddress(true); setLocationError(null);
      void searchTransportLocations(addressQuery, controller.signal).then(setAddressResults).catch((error) => { if (!controller.signal.aborted) setLocationError(routeErrorMessage(error)); }).finally(() => { if (!controller.signal.aborted) setSearchingAddress(false); });
    }, 450);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [addressQuery, mapPoint]);

  const calculateSelectedRoute = async (draft: JourneyDraft) => {
    const request = ++routeRequest.current;
    let origin = draft.origin;
    let destination = draft.destination;
    const originCoordinate = pointValue(origin);
    const destinationCoordinate = pointValue(destination);
    setRouteError(null); setRouteDuration(null);
    if (!originCoordinate || !destinationCoordinate) { setRouteBusy(false); return; }
    setRouteBusy(true);
    try {
      if (!origin.countryCode || !origin.address || origin.address === "Punto guardado") { const value = await reverseTransportLocation(originCoordinate); origin = { longitude: String(value.point[0]), latitude: String(value.point[1]), address: value.label, countryCode: value.countryCode }; }
      if (!destination.countryCode || !destination.address || destination.address === "Punto guardado") { const value = await reverseTransportLocation(destinationCoordinate); destination = { longitude: String(value.point[0]), latitude: String(value.point[1]), address: value.label, countryCode: value.countryCode }; }
      if (request !== routeRequest.current) return;
      const enriched = { ...draft, origin, destination };
      onChange(enriched);
      if (!origin.countryCode || !destination.countryCode || origin.countryCode !== destination.countryCode) {
        setRouteError("La salida y el destino deben pertenecer al mismo país para calcular automáticamente esta ruta.");
        onChange({ ...enriched, distanceKm: "", distanceSource: "" });
        return;
      }
      const route = await calculateRoadRoute(pointValue(origin)!, pointValue(destination)!);
      if (request !== routeRequest.current) return;
      setRouteDuration(route.durationMinutes);
      onChange({ ...enriched, distanceKm: route.distanceKm, distanceSource: route.source });
    } catch (error) { if (request === routeRequest.current) setRouteError(routeErrorMessage(error)); }
    finally { if (request === routeRequest.current) setRouteBusy(false); }
  };

  const selectLocation = async (pointKey: "origin" | "destination", value: TransportLocation) => {
    const point: PointDraft = { longitude: String(value.point[0]), latitude: String(value.point[1]), address: value.label, countryCode: value.countryCode };
    const next = { ...journey, [pointKey]: point, distanceKm: "", distanceSource: "", quantities: {} };
    if (pointKey === "destination" && point.address !== journey.destination.address) delete next.returnToBase;
    if (pointKey === "origin") delete next.referenceBaseAddress;
    onChange(next); setAddressQuery(""); setAddressResults([]); setLocationError(null);
    if (pointKey === "origin" && !pointValue(next.destination)) openMap("destination");
    else { setMapPoint(null); await calculateSelectedRoute(next); }
  };

  const selectMapCoordinate = async (pointKey: "origin" | "destination", coordinate: TransportCoordinate) => {
    setLocationBusy(true); setLocationError(null);
    try { await selectLocation(pointKey, await reverseTransportLocation(coordinate)); }
    catch (error) { setLocationError(routeErrorMessage(error)); }
    finally { setLocationBusy(false); }
  };

  const openMap = (point: "origin" | "destination") => {
    setMapPoint(point);
    setAddressQuery(journey[point].address && journey[point].address !== "Punto guardado" ? journey[point].address : addresses?.[point] || "");
    setAddressResults([]);
    setLocationError(null);
  };

  const chooseReferenceBase = (address: string) => {
    const base = bases.find((candidate) => candidate.address === address);
    if (!base) return;
    routeRequest.current += 1;
    setRouteBusy(false); setRouteError(null); setRouteDuration(null);
    const { operatingBaseAddress: _base, returnToBase: _return, ...current } = journey;
    onChange({ ...current, origin: { ...EMPTY_POINT, address: base.name, countryCode: "DO" }, referenceBaseAddress: base.address, distanceKm: "", distanceSource: "", quantities: {} });
    if (!destinationPoint) openMap("destination");
    else setMapPoint(null);
  };

  return <section className="space-y-2 rounded border border-slate-200 bg-white p-2" aria-label={`Recorrido ${index + 1}`}>
    <div className="flex items-center justify-between gap-2"><h4 className="text-xs font-bold text-[#003366]">Recorrido {index + 1}</h4>{canRemove && <button type="button" aria-label={`Quitar recorrido ${index + 1}`} onClick={onRemove} className="grid h-8 w-8 place-items-center rounded border text-slate-500"><Trash2 className="h-3.5 w-3.5" /></button>}</div>
    <div className="grid gap-2 sm:grid-cols-3"><label className="text-[11px] font-medium text-slate-600">Descripción *<input required maxLength={120} value={journey.label} onChange={(event) => set("label", event.target.value)} className={field} /></label><label className="text-[11px] font-medium text-slate-600">Vehículo de flota<select value={journey.vehicleRef || ""} onChange={(event) => chooseVehicle(event.target.value)} className={field}><option value="">Usar un tipo de vehículo</option>{journey.vehicleRef && !vehicles.some((vehicle) => vehicle.vehicleRef === journey.vehicleRef) && <option value={journey.vehicleRef}>Vehículo guardado · {journey.vehicleType}</option>}{vehicles.map((vehicle) => <option key={vehicle.vehicleRef} value={vehicle.vehicleRef}>{vehicle.businessCode} · {vehicle.vehicleType}</option>)}</select></label><label className="text-[11px] font-medium text-slate-600">Tipo de vehículo *<input required maxLength={80} disabled={Boolean(journey.vehicleRef)} value={journey.vehicleType} onChange={(event) => set("vehicleType", event.target.value)} placeholder="Perfil configurado" className={field} /></label></div>
    <div className="grid gap-2 sm:grid-cols-2">{(["origin", "destination"] as const).map((point) => { const selected = point === "origin" ? hasOrigin : destinationPoint; const destinationDisabled = point === "destination" && !hasOrigin; return <button key={point} type="button" disabled={disabled || destinationDisabled} aria-label={`Ubicar ${point === "origin" ? "salida" : "destino"} en mapa`} aria-pressed={mapPoint === point} onClick={() => mapPoint === point ? setMapPoint(null) : openMap(point)} className={`flex min-h-14 items-center gap-2 rounded border px-3 py-2 text-left disabled:opacity-50 ${mapPoint === point ? "border-[#0070a8] bg-sky-50" : "border-slate-200 bg-white hover:border-sky-300"}`}><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${selected ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{selected ? <CheckCircle2 className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}</span><span className="min-w-0 flex-1"><strong className="block text-xs text-slate-800">{point === "origin" ? "Salida" : "Destino"}</strong><span className="block truncate text-[11px] text-slate-500">{journey[point].address || addresses?.[point] || (destinationDisabled ? "Seleccione primero la salida" : "Buscar dirección o señalar en el mapa")}</span></span><MapPinned className="h-4 w-4 shrink-0 text-[#0070a8]" /></button>; })}</div>
    {mapPoint && <div className="space-y-2 rounded border border-sky-200 bg-sky-50/40 p-3"><div className="flex items-center justify-between gap-2"><div><p className="text-xs font-bold text-[#003366]">{mapPoint === "origin" ? "Seleccione la salida" : "Seleccione el destino"}</p><p className="text-[11px] text-slate-500">Busque una dirección o pulse directamente el punto en el mapa.</p></div><button type="button" aria-label="Cerrar mapa del recorrido" onClick={() => setMapPoint(null)} className="grid h-8 w-8 place-items-center rounded text-slate-500"><X className="h-4 w-4" /></button></div>
      {mapPoint === "origin" && bases.length > 0 && <label className="block max-w-md text-xs font-medium text-slate-600">Distancia de referencia desde una sede<select value={journey.referenceBaseAddress || ""} onChange={(event) => chooseReferenceBase(event.target.value)} className={field}><option value="">Elegir sede configurada</option>{bases.map((base) => <option key={base.address} value={base.address}>{base.name} · {base.address}</option>)}</select></label>}
      <label className="relative block"><span className="sr-only">Buscar dirección de {mapPoint === "origin" ? "salida" : "destino"}</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input aria-label={`Buscar dirección de ${mapPoint === "origin" ? "salida" : "destino"}`} value={addressQuery} onChange={(event) => setAddressQuery(event.target.value)} placeholder="Calle, sector, ciudad o establecimiento" className={`${field} mt-0 pl-9 pr-10`} />{searchingAddress && <LoaderCircle className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#0070a8]" />}</label>{addressResults.length > 0 && <div className="divide-y rounded border bg-white" aria-label="Resultados de direcciones">{addressResults.map((result) => <button key={`${result.point[0]}:${result.point[1]}`} type="button" onClick={() => void selectLocation(mapPoint, result)} className="block w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-sky-50"><MapPin className="mr-2 inline h-3.5 w-3.5 text-[#0070a8]" />{result.label}</button>)}</div>}{locationError && <p role="alert" className="text-xs text-amber-800">{locationError}</p>}{locationBusy && <p role="status" className="text-xs text-sky-800"><LoaderCircle className="mr-1 inline h-3.5 w-3.5 animate-spin" />Identificando la dirección…</p>}<Suspense fallback={<p role="status" className="p-8 text-center text-xs text-slate-500">Cargando mapa…</p>}><TransportZoneMap points={selectedMapPoints} mode="points" selectedPoint={mapIndex} autoSelect pointLabels={mapLabels} disabled={disabled || locationBusy} label="Mapa del recorrido" onChange={(points) => { const point = points[mapIndex]; if (point) void selectMapCoordinate(mapPoint, point); }} /></Suspense></div>}
    <div className="flex flex-wrap items-end gap-2"><div aria-label="Distancia vial calculada" className={`min-w-36 rounded px-3 py-1.5 text-[11px] ${journey.distanceKm ? "bg-emerald-50 text-emerald-800" : "bg-slate-50 text-slate-500"}`}><span className="block">Distancia vial</span><strong className="text-sm">{routeBusy ? "Calculando…" : journey.distanceKm ? `${Number(journey.distanceKm).toFixed(2)} km` : journey.referenceBaseAddress ? "Referencia de sede" : "Pendiente del mapa"}</strong>{routeDuration !== null && <span className="ml-1">· aprox. {routeDuration} min</span>}</div><label className="text-[11px] font-medium text-slate-600">Viajes *<NumericInput required min="1" max="9999" step="1" value={journey.trips} onChange={(event) => set("trips", event.target.value)} className={compact} /></label><label className="flex min-h-9 items-center gap-2 text-[11px] text-slate-600"><input type="checkbox" checked={journey.returnToOrigin} onChange={(event) => set("returnToOrigin", event.target.checked)} className="h-4 w-4 accent-[#003366]" />Regreso</label><AdministrationHelp title="Kilómetros y viajes"><p>La distancia vial se calcula automáticamente al seleccionar la salida y el destino dentro del mismo país.</p><p>Los kilómetros afectan el combustible y los renglones por kilómetro. Una tarifa por viaje cambia con la cantidad de viajes, no con la distancia.</p></AdministrationHelp></div>
    {routeError && <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900"><div className="flex flex-wrap items-center justify-between gap-2"><p>{routeError}</p>{originPoint && destinationPoint && <button type="button" disabled={routeBusy} onClick={() => void calculateSelectedRoute(journey)} className="inline-flex min-h-8 items-center gap-1 rounded border border-amber-300 bg-white px-2 font-bold"><Navigation className="h-3.5 w-3.5" />Reintentar ruta</button>}</div><details className="mt-2"><summary className="cursor-pointer text-[11px] font-bold">Registrar distancia manual como respaldo</summary><div className="mt-2 flex flex-wrap gap-2"><label>Km viales manuales<NumericInput min="0" max="999999.9999" step="0.01" value={journey.distanceKm} onChange={(event) => set("distanceKm", event.target.value)} className={compact} /></label><label className="min-w-52 flex-1">Fuente de la distancia<input maxLength={240} value={journey.distanceSource} onChange={(event) => set("distanceSource", event.target.value)} placeholder="Documento o medición confirmada" className={field} /></label></div></details></div>}
    {unmatchedQuantities.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><p>Hay cantidades de una zona anterior que ya no corresponden a este recorrido.</p><button type="button" onClick={() => set("quantities", Object.fromEntries(Object.entries(journey.quantities).filter(([code]) => !unmatchedQuantities.includes(code))))} className="min-h-9 rounded border border-amber-300 bg-white px-3 font-medium">Retirar cantidades anteriores</button></div>}
    {quantities.length > 0 && <div className="space-y-2 border-t pt-3"><div className="flex items-center gap-1"><h5 className="text-xs font-semibold text-slate-600">Cantidades del recorrido</h5><AdministrationHelp title="Peajes y cantidades"><p>Indique el total de pasos o unidades de todos los viajes y regresos de este recorrido. El motor no los vuelve a multiplicar.</p><p>Ejemplo ilustrativo: una tarifa de DOP 200 por paso cuesta DOP 400 con 2 pasos y DOP 800 con 4 pasos. Aumentar los viajes no duplica automáticamente estos pasos.</p><p>Deje vacío lo que aún no esté confirmado. Ingrese cero si el concepto no tiene cantidad en este recorrido.</p></AdministrationHelp></div><div className="flex flex-wrap items-end gap-3">{quantities.map((line) => <label key={line.componentCode} className="max-w-48 text-xs font-medium text-slate-600">{line.concept}<span className="block text-[11px] font-normal text-slate-400">{line.basis === "PASS" ? "Pasos totales" : "Unidades totales"}</span><NumericInput aria-label={`${line.concept} del recorrido ${index + 1}`} min="0" step={line.basis === "PASS" ? "1" : "0.0001"} value={journey.quantities[line.componentCode] ?? ""} onChange={(event) => set("quantities", { ...journey.quantities, [line.componentCode]: event.target.value })} placeholder="Pendiente" className={compact} /></label>)}</div></div>}
  </section>;
}

function ResultTable({ result, journeys }: Readonly<{ result: TransportResult; journeys: readonly TransportJourney[] }>) {
  const names = new Map(journeys.map((journey) => [journey.journeyRef, journey.label]));
  return <div className="space-y-3">
    {result.issues.length > 0 && <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><h5 className="font-semibold">{result.complete ? "Observaciones" : "Datos por completar"}</h5><ul className="mt-2 list-disc space-y-1 pl-4">{result.issues.map((issue, index) => <li key={`${issue.code}:${issue.journeyRef}:${index}`}>{issue.journeyRef && names.get(issue.journeyRef) ? `${names.get(issue.journeyRef)}: ` : ""}{issue.message}</li>)}</ul></div>}
    <div className="overflow-x-auto rounded border border-slate-200"><table className="w-full min-w-[860px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-2 font-medium">Recorrido</th><th className="p-2 font-medium">Ubicación</th><th className="p-2 font-medium">Concepto</th><th className="p-2 font-medium">Base</th><th className="p-2 text-right font-medium">Cantidad</th><th className="p-2 text-right font-medium">Tarifa aplicada</th><th className="p-2 text-right font-medium">Costo</th></tr></thead><tbody>{result.lines.map((line, index) => <tr key={`${line.journeyRef}:${line.componentCode}:${index}`} className="border-t"><td className="p-2 text-slate-600">{names.get(line.journeyRef) || "Recorrido"}</td><td className="p-2"><span className="block">{line.zoneCode}</span><span className="text-[10px] text-slate-500">{line.zoneType === "METRO" ? "Metro" : "Fuera de metro"} · v{line.zoneVersion}</span>{line.distanceKm !== null && <span className="block text-[10px] text-slate-500">{formatTransportNumber(line.distanceKm)} km · {line.distanceSource || "fuente pendiente"}</span>}</td><td className="p-2"><span className="block font-medium">{line.concept}</span><span className="text-[10px] text-slate-500">Tarifa v{line.costRuleVersion}</span>{line.kind === "FUEL" && <span className="block text-[10px] text-slate-500">{line.fuelType || "Combustible pendiente"} · {formatTransportNumber(line.kmPerGallon)} km/gal {line.gallonUnit === "IMPERIAL" ? "imperial" : line.gallonUnit === "US" ? "US" : "pendiente"}</span>}</td><td className="p-2 text-slate-600">{BASIS_LABELS[line.basis]}{line.factor && <span className="block text-[10px]">Base {line.currency} {formatTransportNumber(line.baseUnitCost, 4)} × {formatTransportNumber(line.factor, 6)}</span>}</td><td className="p-2 text-right tabular-nums">{formatTransportNumber(line.quantity, 6)}{line.quantity !== null && <span className="ml-1 text-[10px] text-slate-500">{UNIT_LABELS[line.basis]}</span>}</td><td className="p-2 text-right tabular-nums">{line.unitCost === null ? "Pendiente" : `${line.currency} ${formatTransportNumber(line.unitCost, 4)}`}</td><td className="p-2 text-right font-medium tabular-nums">{line.totalCost === null ? <span className="text-amber-800">Pendiente</span> : `${line.currency} ${formatTransportNumber(line.totalCost, 2)}`}</td></tr>)}{!result.lines.length && <tr><td colSpan={7} className="p-5 text-center text-slate-500">Complete la ubicación y el perfil para identificar los costos aplicables.</td></tr>}</tbody></table></div>
    {result.totals.length > 0 && <div className="flex flex-wrap justify-end gap-5">{result.totals.map((total) => <p key={total.currency} className="text-right text-xs text-slate-500">Total {total.currency}<strong className={`mt-1 block text-base tabular-nums ${total.amount === null ? "text-amber-800" : "text-[#003366]"}`}>{formatTransportNumber(total.amount, 2)}</strong></p>)}</div>}
  </div>;
}

function CostComparison({ previous, current }: { previous: TransportResult; current: TransportResult }) {
  const currencies = [...new Set([...previous.totals, ...current.totals].map((total) => total.currency))];
  return <table className="w-full text-left text-xs"><thead className="text-slate-500"><tr><th className="py-2 font-medium">Moneda</th><th className="py-2 text-right font-medium">Publicado</th><th className="py-2 text-right font-medium">Calculado</th></tr></thead><tbody>{currencies.map((currency) => <tr key={currency} className="border-t"><td className="py-2">{currency}</td><td className="py-2 text-right tabular-nums">{formatTransportNumber(previous.totals.find((total) => total.currency === currency)?.amount ?? null, 2)}</td><td className="py-2 text-right tabular-nums">{formatTransportNumber(current.totals.find((total) => total.currency === currency)?.amount ?? null, 2)}</td></tr>)}</tbody></table>;
}
