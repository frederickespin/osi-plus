import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, MapPin, Plus, Trash2 } from "lucide-react";
import { AdministrationHelp, AdministrationIconAction } from "@/administration/AdministrationHelp";
import { COMPACT_FORM_FIELD } from "@/components/ui/compact-form";
import { NumericInput } from "@/components/ui/numeric-input";
import { pointInTransportPolygon, transportRingError } from "../../shared/transportGeometry.js";
import TransportPlaceSearch from "./TransportPlaceSearch";
import { findTransportBoundary, type TransportBoundary, type TransportPlace } from "./transportPlaces";
import type { TransportCoordinate } from "./transportApi";

const TransportZoneMap = lazy(() => import("./TransportZoneMap"));
const field = `${COMPACT_FORM_FIELD} mt-1 block w-full font-normal`;
const emptyPoints: readonly TransportCoordinate[] = [];

export type TransportZoneLocationDraft = {
  name: string;
  locationType: "CITY" | "SECTOR";
  city: string;
  sector: string;
  points: { longitude: string; latitude: string }[];
};

type Props = Readonly<{
  value: TransportZoneLocationDraft;
  mapPoints: readonly TransportCoordinate[];
  invalidPoints: boolean;
  blocked: boolean;
  readOnly: boolean;
  onChange(changes: Partial<TransportZoneLocationDraft>): void;
}>;

export default function TransportZoneLocation({ value, mapPoints, invalidPoints, blocked, readOnly, onChange }: Props) {
  const [selected, select] = useState<TransportPlace | null>(null);
  const [focus, setFocus] = useState<{ point: TransportCoordinate; zoom: number } | null>(null);
  const [suggestion, setSuggestion] = useState<TransportBoundary | null>(null);
  const [loading, setLoading] = useState(false);
  const [manual, setManual] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function choose(place: TransportPlace) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const name = value.name.trim();
    const oldLocationName = value.sector || value.city;
    const placeName = place.sector || place.city || place.name;
    const ring = [...mapPoints, mapPoints[0]];
    const sameArea = !transportRingError(ring) && pointInTransportPolygon(place.point, { type: "Polygon", coordinates: [ring] });
    onChange({
      name: !name || name === oldLocationName ? placeName.slice(0, 140) : name,
      locationType: place.sector ? "SECTOR" : "CITY",
      city: place.city.slice(0, 160),
      sector: place.sector.slice(0, 160),
      ...(!sameArea && mapPoints.length > 0 ? { points: [] } : {}),
    });
    select(place);
    setFocus({ point: place.point, zoom: place.municipality ? 13 : 16 });
    setSuggestion(null);
    setManual(sameArea);
    setLoading(Boolean(place.boundary || place.municipality));
    try {
      const boundary = await findTransportBoundary(place, controller.signal);
      if (!controller.signal.aborted) setSuggestion(boundary);
    } catch {
      // The selected reference can still be used for tracing.
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  function setPoints(points: readonly TransportCoordinate[]) {
    request.current?.abort();
    setLoading(false);
    setSuggestion(null);
    onChange({ points: points.map(([longitude, latitude]) => ({ longitude: String(longitude), latitude: String(latitude) })) });
  }

  return <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
    <div className="min-w-0 space-y-2">
      {!readOnly && <TransportPlaceSearch disabled={blocked} onSelect={(place) => void choose(place)} />}
      <Suspense fallback={<p role="status" className="grid h-60 place-items-center rounded border bg-slate-50 text-xs text-slate-500">Cargando mapa…</p>}>
        <TransportZoneMap points={mapPoints} focus={focus} previewBoundary={suggestion?.points ?? emptyPoints} disabled={blocked || invalidPoints} onChange={(points) => { setManual(true); setPoints(points); }} heightClassName="h-60 sm:h-[clamp(14rem,37dvh,28rem)]" />
      </Suspense>
      {!readOnly && <details className="text-xs" open={invalidPoints || undefined}>
        <summary className="w-fit cursor-pointer py-1 text-slate-600">Coordenadas · {value.points.length} puntos</summary>
        <div className="space-y-2 py-2">
          <div className="max-h-52 space-y-2 overflow-y-auto">
            {value.points.map((point, index) => <div key={index} className="flex flex-wrap items-end gap-2">
              <span className="w-5 py-1 text-slate-500">{index + 1}</span>
              <label className="text-[11px] text-slate-600">Latitud
                <NumericInput aria-label={`Latitud del punto ${index + 1}`} inputMode="text" step="0.000001" min="-90" max="90" value={point.latitude} onChange={(event) => onChange({ points: value.points.map((old, at) => at === index ? { ...old, latitude: event.target.value } : old) })} className={`${field} w-28`} />
              </label>
              <label className="text-[11px] text-slate-600">Longitud
                <NumericInput aria-label={`Longitud del punto ${index + 1}`} inputMode="text" step="0.000001" min="-180" max="180" value={point.longitude} onChange={(event) => onChange({ points: value.points.map((old, at) => at === index ? { ...old, longitude: event.target.value } : old) })} className={`${field} w-28`} />
              </label>
              <AdministrationIconAction label={`Quitar punto ${index + 1}`} disabled={blocked} onClick={() => onChange({ points: value.points.filter((_, at) => at !== index) })}><Trash2 className="h-4 w-4" aria-hidden="true" /></AdministrationIconAction>
            </div>)}
          </div>
          <button type="button" disabled={blocked || value.points.length >= 200} onClick={() => onChange({ points: [...value.points, { longitude: "", latitude: "" }] })} className="inline-flex min-h-9 items-center gap-1 rounded border px-3 font-medium disabled:opacity-40"><Plus className="h-4 w-4" aria-hidden="true" />Añadir coordenada</button>
        </div>
      </details>}
    </div>
    <div className="min-w-0 space-y-2">
      <div className="flex items-center gap-1">
        <MapPin className="h-4 w-4 text-sky-700" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-[#003366]">Área de operación</h3>
        <AdministrationHelp title="Perímetro">
          <p>Seleccione un resultado y revise el contorno sugerido. También puede trazar el área directamente en el mapa.</p>
          <p>Los kilómetros de carretera se confirman en Operación y costos.</p>
        </AdministrationHelp>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
        <label className="text-xs font-medium text-slate-600">Tipo de ubicación
          <select value={value.locationType} onChange={(event) => onChange({ locationType: event.target.value as TransportZoneLocationDraft["locationType"] })} className={field}>
            <option value="CITY">Ciudad / municipio</option><option value="SECTOR">Sector</option>
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">Ciudad *
          <input required maxLength={160} value={value.city} onChange={(event) => onChange({ city: event.target.value })} className={field} />
        </label>
        {value.locationType === "SECTOR" && <label className="text-xs font-medium text-slate-600">Sector *
          <input required maxLength={160} value={value.sector} onChange={(event) => onChange({ sector: event.target.value })} className={field} />
        </label>}
        <label className="text-xs font-medium text-slate-600">Nombre del perfil *
          <input required maxLength={140} value={value.name} onChange={(event) => onChange({ name: event.target.value })} placeholder="Ej. Santiago · servicios en camión" className={field} />
        </label>
      </div>
      {loading && <p role="status" className="flex items-center gap-1.5 text-xs text-slate-500"><LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Consultando el contorno…</p>}
      {suggestion && <div className="space-y-1.5 border-t border-slate-200 pt-2">
        <p className="text-xs text-slate-700">{suggestion.label}</p>
        <button type="button" disabled={blocked} onClick={() => { setManual(true); setPoints(suggestion.points); }} className="inline-flex min-h-9 items-center gap-1.5 rounded border border-sky-200 bg-sky-50 px-2.5 text-xs font-semibold text-[#003366] disabled:opacity-40"><Check className="h-4 w-4" aria-hidden="true" />Usar contorno</button>
      </div>}
      {!loading && selected && !suggestion && !manual && <p role="status" className="text-xs text-slate-600">{selected.province ? `${selected.province} · ` : ""}Punto localizado. Trace el perímetro en el mapa.</p>}
    </div>
  </div>;
}
