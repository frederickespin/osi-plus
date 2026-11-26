import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Check, MapPin, X } from "lucide-react";
import { AdministrationIconAction } from "@/administration/AdministrationHelp";
import TransportPlaceSearch from "@/logistics-engine/TransportPlaceSearch";
import type { TransportCoordinate } from "@/logistics-engine/transportApi";
import type { TransportPlace } from "@/logistics-engine/transportPlaces";
import { reverseTransportLocation } from "@/logistics-engine/transportRouting";
import type { CaseRouteApi, CaseRouteCoverage } from "./caseRouteApi";

const TransportZoneMap = lazy(() => import("@/logistics-engine/TransportZoneMap"));
const pointLabel = ["•"];
export type RouteMapChoice = Readonly<{ point: TransportCoordinate; address: Pick<TransportPlace, "city" | "province" | "sector" | "street"> | null }>;

type Props = Readonly<{
  api: CaseRouteApi;
  caseRef: string;
  title: string;
  disabled: boolean;
  initialPoint?: TransportCoordinate | null;
  onApply(choice: RouteMapChoice): void;
  onClose(): void;
}>;

export default function CaseRouteMap({ api, caseRef, title, disabled, initialPoint, onApply, onClose }: Props) {
  const [choice, setChoice] = useState<RouteMapChoice | null>(null);
  const [point, setPoint] = useState<TransportCoordinate | null>(initialPoint ?? null);
  const [focus, setFocus] = useState<{ point: TransportCoordinate; zoom: number } | null>(initialPoint ? { point: initialPoint, zoom: 16 } : null);
  const [placeHint, setPlaceHint] = useState("");
  const [coverage, setCoverage] = useState<CaseRouteCoverage | null>(null);
  const [status, setStatus] = useState("");
  const request = useRef<AbortController | null>(null);
  const reverseRequest = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); reverseRequest.current?.abort(); }, []);

  async function locate(coordinate: TransportCoordinate) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setPoint(coordinate);
    setCoverage(null);
    setStatus("Consultando áreas…");
    try {
      const result = await api.coverage(caseRef, coordinate, controller.signal);
      if (!controller.signal.aborted) { setCoverage(result); setStatus(""); }
    } catch {
      if (!controller.signal.aborted) setStatus("No se pudo consultar el área para este punto.");
    }
  }

  async function selectPoint(selected: TransportCoordinate) {
    reverseRequest.current?.abort();
    const controller = new AbortController();
    reverseRequest.current = controller;
    setChoice(null); setFocus(null); setPlaceHint("Buscando la dirección del punto…");
    void locate(selected);
    try {
      const location = await reverseTransportLocation(selected, AbortSignal.any([controller.signal, AbortSignal.timeout(8_000)]));
      if (controller.signal.aborted) return;
      if (location.countryCode !== "DO") {
        setPlaceHint("Selecciona un punto dentro de República Dominicana.");
        return;
      }
      setChoice({ point: selected, address: location.address ?? null });
      setPlaceHint(location.label);
    } catch {
      if (controller.signal.aborted) return;
      setPlaceHint("Dirección sin identificar. Verifica la dirección escrita antes de confirmar el punto.");
      setChoice({ point: selected, address: null });
    }
  }

  const areas = coverage?.areas;
  let areaLabel = "Busque una referencia o seleccione el punto en el mapa.";
  if (coverage?.classification === "METRO") areaLabel = "Zona metro";
  else if (coverage?.classification === "INTERIOR") areaLabel = "Fuera de zona metro";
  else if (coverage?.classification === null) areaLabel = "Zona por verificar";
  else if (areas) areaLabel = areas.length ? `Área registrada · ${areas.map((area) => area.label).join(" · ")}` : "Sin área activa en este punto.";

  return <section className="space-y-2 border-y border-slate-200 py-2" aria-label={title}>
    <div className="flex items-center justify-between gap-2">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-[#003366]"><MapPin className="h-4 w-4" aria-hidden="true" />{title}</h3>
      <AdministrationIconAction label="Cerrar mapa de la dirección" onClick={onClose}><X className="h-4 w-4" aria-hidden="true" /></AdministrationIconAction>
    </div>
    <TransportPlaceSearch disabled={disabled} onSelect={(selected) => {
      reverseRequest.current?.abort();
      setChoice({ point: selected.point, address: selected });
      setPlaceHint(selected.matchType === "Referencia" ? selected.name : "Centro de " + selected.name + " · Señala la entrada exacta o confirma este punto de referencia.");
      setFocus({ point: selected.point, zoom: selected.municipality ? 13 : 16 });
      void locate(selected.point);
    }} />
    <Suspense fallback={<p role="status" className="p-4 text-center text-xs text-slate-500">Cargando mapa…</p>}>
      <TransportZoneMap points={point ? [point] : []} mode="points" selectedPoint={0} autoSelect pointLabels={pointLabel}
        disabled={disabled} label={title} focus={focus} previewBoundary={areas?.length === 1 ? areas[0].geometry.coordinates[0] : undefined}
        heightClassName="h-52 sm:h-64" onChange={(points) => {
          if (points[0]) void selectPoint(points[0]);
        }} />
    </Suspense>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p role="status" className="text-xs text-slate-700">{status || areaLabel}</p>
      {placeHint && <p className="text-xs text-slate-700" aria-live="polite">{placeHint}</p>}
      {choice && <button type="button" disabled={disabled} onClick={() => onApply(choice)} className="inline-flex min-h-9 items-center gap-1.5 rounded border border-sky-200 bg-sky-50 px-2.5 text-xs font-semibold text-[#003366]"><Check className="h-4 w-4" aria-hidden="true" />Usar punto del mapa</button>}
    </div>
  </section>;
}
