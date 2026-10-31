import { useEffect, useRef, useState } from "react";
import type { FeatureGroup, Map as LeafletMap } from "leaflet";
import { LocateFixed, Undo2 } from "lucide-react";
import "leaflet/dist/leaflet.css";

export type TransportMapPoint = readonly [longitude: number, latitude: number];

type Props = {
  points: readonly TransportMapPoint[];
  onChange(points: TransportMapPoint[]): void;
  disabled?: boolean;
  mode?: "polygon" | "points";
  selectedPoint?: number;
  label?: string;
};

export default function TransportZoneMap({ points, onChange, disabled = false, mode = "polygon", selectedPoint, label = "Mapa de la geocerca" }: Props) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layers = useRef<FeatureGroup | null>(null);
  const leaflet = useRef<typeof import("leaflet") | null>(null);
  const current = useRef({ points, onChange, disabled, mode, selectedPoint });
  const fitted = useRef(points.length === 0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const drawingRef = useRef(false);

  useEffect(() => { current.current = { points, onChange, disabled, mode, selectedPoint }; }, [points, onChange, disabled, mode, selectedPoint]);
  useEffect(() => { drawingRef.current = drawing; }, [drawing]);
  useEffect(() => {
    let stopped = false;
    let instance: LeafletMap | null = null;
    let observer: ResizeObserver | null = null;
    void import("leaflet").then((L) => {
      if (stopped || !element.current) return;
      leaflet.current = L;
      instance = L.map(element.current, { center: [18.8, -70.5], zoom: 7, minZoom: 4, maxZoom: 18, doubleClickZoom: false, zoomControl: false });
      map.current = instance;
      L.control.zoom({ zoomInTitle: "Acercar", zoomOutTitle: "Alejar" }).addTo(instance);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
        maxZoom: 19,
        referrerPolicy: "strict-origin-when-cross-origin",
      }).on("tileerror", () => { if (!stopped) setError("No se pudo cargar una parte del mapa base. Puede seguir utilizando las coordenadas del perímetro."); }).on("tileload", () => { if (!stopped) setError(null); }).addTo(instance);
      layers.current = L.featureGroup().addTo(instance);
      instance.on("click", (event) => {
        const value = current.current;
        if (value.disabled || !drawingRef.current) return;
        const position = event.latlng.wrap();
        const point: TransportMapPoint = [Number(position.lng.toFixed(6)), Number(position.lat.toFixed(6))];
        if (value.mode === "points" && value.selectedPoint !== undefined) {
          if (value.selectedPoint < value.points.length) value.onChange(value.points.map((old, index) => index === value.selectedPoint ? point : old));
          else if (value.selectedPoint === value.points.length) value.onChange([...value.points, point]);
        } else if (value.points.length < 200) value.onChange([...value.points, point]);
      });
      observer = new ResizeObserver(() => instance?.invalidateSize({ animate: false }));
      observer.observe(element.current);
      setReady(true);
    }).catch(() => { if (!stopped) setError("El mapa no pudo cargar. Puede registrar el perímetro con las coordenadas de sus puntos."); });
    return () => { stopped = true; observer?.disconnect(); instance?.remove(); map.current = null; layers.current = null; leaflet.current = null; };
  }, []);

  useEffect(() => {
    const L = leaflet.current;
    const group = layers.current;
    if (!ready || !L || !group || !map.current) return;
    group.clearLayers();
    const coordinates = points.map(([longitude, latitude]) => L.latLng(latitude, longitude));
    if (coordinates.length > 1) {
      const shape = mode === "polygon" && coordinates.length > 2 ? L.polygon(coordinates, { color: "#003366", weight: 2, fillOpacity: 0.15 }) : L.polyline(coordinates, { color: "#003366", weight: 2 });
      shape.addTo(group);
    }
    coordinates.forEach((coordinate, index) => {
      const marker = L.marker(coordinate, {
        draggable: !disabled,
        title: `Punto ${index + 1}`,
        alt: `Punto ${index + 1}`,
        icon: L.divIcon({ html: `<span style="display:grid;place-items:center;width:24px;height:24px;border:2px solid white;border-radius:50%;background:#003366;color:white;font:600 11px sans-serif;box-shadow:0 1px 3px #475569">${index + 1}</span>`, className: "", iconSize: [24, 24], iconAnchor: [12, 12] }),
      }).addTo(group);
      marker.on("dragend", () => {
        const value = current.current;
        if (value.disabled) return;
        const position = marker.getLatLng().wrap();
        value.onChange(value.points.map((old, at) => at === index ? [Number(position.lng.toFixed(6)), Number(position.lat.toFixed(6))] : old));
      });
    });
    if (!fitted.current && coordinates.length) {
      map.current.fitBounds(group.getBounds(), { padding: [30, 30], maxZoom: 13 });
      fitted.current = true;
    }
  }, [disabled, mode, points, ready]);

  const fit = () => {
    const bounds = layers.current?.getBounds();
    if (bounds?.isValid()) map.current?.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
  };

  return <div className="min-w-0 space-y-2">
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {!disabled && <button type="button" aria-pressed={drawing} onClick={() => setDrawing((value) => !value)} className={`min-h-9 rounded border px-3 font-medium ${drawing ? "border-[#003366] bg-[#003366] text-white" : "border-slate-300 bg-white text-slate-700"}`}>{drawing ? "Terminar trazado" : mode === "polygon" ? "Trazar perímetro" : "Elegir ubicación"}</button>}
      {!disabled && mode === "polygon" && <button type="button" disabled={!points.length} onClick={() => onChange(points.slice(0, -1))} className="inline-flex min-h-9 items-center gap-1 rounded border border-slate-300 px-2 text-slate-600 disabled:opacity-40"><Undo2 aria-hidden="true" className="h-3.5 w-3.5" />Quitar último punto</button>}
      <button type="button" disabled={!points.length || !ready} onClick={fit} className="inline-flex min-h-9 items-center gap-1 rounded border border-slate-300 px-2 text-slate-600 disabled:opacity-40"><LocateFixed aria-hidden="true" className="h-3.5 w-3.5" />Ver puntos</button>
      {drawing && !disabled && <span role="status" className="text-slate-500">{mode === "polygon" ? "Pulse el mapa para añadir puntos al perímetro." : "Pulse el mapa para ubicar el punto seleccionado."}</span>}
    </div>
    {error && <p role="alert" className="text-xs text-amber-800">{error}</p>}
    <div ref={element} role="region" aria-label={label} className="relative isolate z-0 h-72 w-full overflow-hidden rounded border border-slate-300 bg-slate-100 sm:h-80" />
    <p className="text-[11px] text-slate-500">{disabled ? "Perímetro guardado." : "También puede ingresar o ajustar las coordenadas. Arrastre los puntos para corregirlos."}</p>
  </div>;
}
