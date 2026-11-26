import { Fragment, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, X } from "lucide-react";
import { CASE_ROUTE_MAX_STOPS, type CaseRouteAddress, type CaseRouteStop } from "./caseRouteApi";

export type RouteDraftStop = Readonly<CaseRouteStop & {
  id: string;
  source: string;
  original: CaseRouteAddress | null;
}>;

type Props = Readonly<{
  stops: readonly RouteDraftStop[];
  origin: CaseRouteAddress;
  destination: CaseRouteAddress | null;
  expanded: string | null;
  disabled: boolean;
  onAdd(kind: "PICKUP" | "DELIVERY"): void;
  onKind(id: string, kind: "PICKUP" | "DELIVERY"): void;
  onToggle(id: string): void;
  onMove(index: number, offset: -1 | 1): void;
  onRemove(id: string): void;
  renderEditor(stop: RouteDraftStop, index: number): ReactNode;
}>;
const control = "inline-flex size-7 shrink-0 items-center justify-center rounded text-slate-700 hover:bg-sky-50 focus-visible:outline-sky-700 disabled:opacity-25";
const addControl = "inline-flex min-h-8 items-center gap-1 rounded px-2 text-xs font-semibold text-sky-800 hover:bg-sky-50 disabled:opacity-40";
function addressLabel(address: CaseRouteAddress | null) {
  if (!address) return "Pendiente de confirmar";
  return [address.streetAndNumber, address.sector, address.cityMunicipality, address.countryCode !== "DO" && address.countryCode].filter(Boolean).join(", ") || "Dirección pendiente";
}

export default function CaseRouteStops({ stops, origin, destination, expanded, disabled, onAdd, onKind, onToggle, onMove, onRemove, renderEditor }: Props) {
  const atLimit = stops.length >= CASE_ROUTE_MAX_STOPS;
  return <section aria-label="Recorrido del servicio" className="min-w-0 border-y border-slate-200 py-2">
    <header className="mb-1 flex flex-wrap items-center justify-between gap-1">
      <h3 className="text-sm font-bold text-[#003366]">Recorrido</h3>
      <div className="flex items-center gap-1">
        <button type="button" className={addControl} aria-label="Añadir recogida" disabled={disabled || atLimit} onClick={() => onAdd("PICKUP")}><Plus className="size-3.5" aria-hidden="true" />Recogida</button>
        <button type="button" className={addControl} aria-label="Añadir entrega" disabled={disabled || atLimit} onClick={() => onAdd("DELIVERY")}><Plus className="size-3.5" aria-hidden="true" />Entrega</button>
      </div>
    </header>
    {atLimit && <p className="mb-1 text-xs text-slate-600">Límite de {CASE_ROUTE_MAX_STOPS} paradas adicionales por ruta.</p>}
    <table aria-label="Orden de recogidas y entregas" className="w-full table-fixed text-left text-xs">
      <thead className="bg-slate-100 text-[11px] text-slate-600"><tr>
        <th scope="col" className="w-6 px-1 text-center" aria-label="Orden">#</th>
        <th scope="col" className="w-[5.4rem] px-1 py-1 sm:w-28">Movimiento</th><th scope="col" className="p-1">Dirección</th>
        <th scope="col" className="w-16 p-1 text-right sm:w-28"><span className="sr-only">Acciones</span></th>
      </tr></thead>
      <tbody className="divide-y divide-slate-100">
        <tr><td className="p-1 text-center text-slate-500">1</td><th scope="row" className="p-1 font-medium">Origen</th><td colSpan={2} className="p-1 text-slate-700">{addressLabel(origin)}</td></tr>
        {stops.map((stop, index) => <Fragment key={stop.id}>
          <tr className={expanded === stop.id ? "bg-sky-50" : ""}>
            <td className="p-1 text-center text-slate-500">{index + 2}</td>
            <td><select aria-label={`Movimiento de la parada ${index + 1}`} value={stop.kind ?? ""} disabled={disabled}
              className="h-7 w-full rounded-sm border-0 bg-slate-100 px-1 text-xs" onChange={(event) => onKind(stop.id, event.target.value as "PICKUP" | "DELIVERY")}>
              {stop.kind == null && <option value="" disabled>Por clasificar</option>}
              <option value="PICKUP">Recogida</option><option value="DELIVERY">Entrega</option>
            </select></td>
            <td className="break-words p-1 text-slate-700">{addressLabel(stop.address)}</td>
            <td className="py-0.5"><div className="flex flex-wrap justify-end">
              <button type="button" className={control} aria-label={`Editar dirección de la parada ${index + 1}`} title="Editar dirección" aria-expanded={expanded === stop.id} disabled={disabled} onClick={() => onToggle(stop.id)}><Pencil aria-hidden="true" className="size-3.5" /></button>
              <button type="button" className={control} aria-label={`Subir parada ${index + 1}`} title="Subir parada" disabled={disabled || index === 0} onClick={() => onMove(index, -1)}><ArrowUp aria-hidden="true" className="size-3.5" /></button>
              <button type="button" className={control} aria-label={`Bajar parada ${index + 1}`} title="Bajar parada" disabled={disabled || index + 1 === stops.length} onClick={() => onMove(index, 1)}><ArrowDown aria-hidden="true" className="size-3.5" /></button>
              <button type="button" className={control} aria-label={`Quitar parada ${index + 1}`} title="Quitar parada" disabled={disabled} onClick={() => onRemove(stop.id)}><X aria-hidden="true" className="size-3.5" /></button>
            </div></td>
          </tr>
          {expanded === stop.id && <tr><td colSpan={4} className="bg-slate-50 px-2 pb-2">{renderEditor(stop, index)}</td></tr>}
        </Fragment>)}
        <tr><td className="p-1 text-center text-slate-500">{stops.length + 2}</td><th scope="row" className="p-1 font-medium">Destino</th><td colSpan={2} className="p-1 text-slate-700">{addressLabel(destination)}</td></tr>
      </tbody>
    </table>
  </section>;
}
