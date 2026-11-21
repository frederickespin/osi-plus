import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Check, MapPin, X } from "lucide-react";
import { AdministrationIconAction } from "@/administration/AdministrationHelp";
import TransportPlaceSearch from "@/logistics-engine/TransportPlaceSearch";
import type { TransportCoordinate } from "@/logistics-engine/transportApi";
import type { TransportPlace } from "@/logistics-engine/transportPlaces";
import type { CaseRouteApi, CaseRouteCoverage } from "./caseRouteApi";

const TransportZoneMap = lazy(() => import("@/logistics-engine/TransportZoneMap"));
const pointLabel = ["•"];

type Props = Readonly<{
  api: CaseRouteApi;
  caseRef: string;
  title: string;
  disabled: boolean;
  onApply(place: TransportPlace): void;
  onClose(): void;
}>;

export default function CaseRouteMap({ api, caseRef, title, disabled, onApply, onClose }: Props) {
  const [place, setPlace] = useState<TransportPlace | null>(null);
  const [point, setPoint] = useState<TransportCoordinate | null>(null);
  const [focus, setFocus] = useState<{ point: TransportCoordinate; zoom: number } | null>(null);
  const [coverage, setCoverage] = useState<CaseRouteCoverage | null>(null);
  const [status, setStatus] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

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
      setPlace(selected);
      setFocus({ point: selected.point, zoom: selected.municipality ? 13 : 16 });
      void locate(selected.point);
    }} />
    <Suspense fallback={<p role="status" className="p-4 text-center text-xs text-slate-500">Cargando mapa…</p>}>
      <TransportZoneMap points={point ? [point] : []} mode="points" selectedPoint={0} autoSelect pointLabels={pointLabel}
        disabled={disabled} label={title} focus={focus} previewBoundary={areas?.length === 1 ? areas[0].geometry.coordinates[0] : undefined}
        heightClassName="h-52 sm:h-64" onChange={(points) => {
          if (points[0]) { setFocus(null); setPlace(null); void locate(points[0]); }
        }} />
    </Suspense>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p role="status" className="text-xs text-slate-700">{status || areaLabel}</p>
      {place && <button type="button" disabled={disabled} onClick={() => onApply(place)} className="inline-flex min-h-9 items-center gap-1.5 rounded border border-sky-200 bg-sky-50 px-2.5 text-xs font-semibold text-[#003366]"><Check className="h-4 w-4" aria-hidden="true" />Usar datos del mapa</button>}
    </div>
  </section>;
}
