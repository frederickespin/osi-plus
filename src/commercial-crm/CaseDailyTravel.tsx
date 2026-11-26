import { useEffect, useState } from "react";
import { Route } from "lucide-react";
import { NumericInput } from "@/components/ui/numeric-input";
import { COMPACT_FORM_FIELD } from "@/components/ui/compact-form";
import { formatTransportCoverage, formatTravelDuration } from "@/logistics-engine/transportPresentation";
import type { CaseDailyTravel, CaseTravelLeg, TransportReferenceBase } from "../../shared/logisticsTransport";
import { CaseRouteApi } from "./caseRouteApi";

const kilometers = new Intl.NumberFormat("es-DO", { maximumFractionDigits: 2 });
const baseValue = (value: TransportReferenceBase | null) => value?.baseRef ?? value?.address ?? "";

function legMinutes(legs: readonly CaseTravelLeg[] | undefined) {
  if (!legs?.length) return null;
  let total = 0;
  for (const leg of legs) {
    if (leg.durationMinutes == null) return null;
    total += leg.durationMinutes;
  }
  return total;
}

function LegTable({ legs }: { legs: readonly CaseTravelLeg[] }) {
  return <table className="mt-2 w-full text-left text-xs">
    <thead className="border-b text-slate-600"><tr><th scope="col">Tramo</th><th scope="col" className="text-right">Distancia</th><th scope="col" className="text-right">Conducción est.</th></tr></thead>
    <tbody>{legs.map((leg, index) => <tr key={index} className="border-b border-slate-100">
      <td className="py-1">{leg.from.label} → {leg.to.label}</td>
      <td className="text-right tabular-nums">{leg.distanceKm == null ? "Pendiente" : kilometers.format(leg.distanceKm) + " km" + (leg.estimated ? " est." : "")}</td>
      <td className="text-right tabular-nums">{formatTravelDuration(leg.durationMinutes)}</td>
    </tr>)}</tbody>
  </table>;
}

export function useCaseDailyTravel(api: CaseRouteApi, caseRef?: string, revision?: number) {
  const [base, setBase] = useState("");
  const [terminal, setTerminal] = useState("");
  const [state, setState] = useState<{ request: string; data: CaseDailyTravel | null; error: boolean } | null>(null);
  const request = JSON.stringify([caseRef, revision, base, terminal]);
  useEffect(() => {
    if (!caseRef || !revision) return;
    const controller = new AbortController();
    void api.travel(caseRef, base, terminal, controller.signal).then((data) => {
      if (!controller.signal.aborted) setState({ request, data: data.revision === revision ? data : null, error: data.revision !== revision });
    }).catch(() => {
      if (!controller.signal.aborted) setState({ request, data: null, error: true });
    });
    return () => controller.abort();
  }, [api, base, caseRef, request, revision, terminal]);
  return { travel: state?.request === request ? state.data : null, loading: Boolean(caseRef && revision && state?.request !== request),
    error: Boolean(state?.request === request && state.error), setBase, setTerminal };
}

export default function CaseDailyTravelPanel({ travel, loading, error, setBase, setTerminal, completeDays, preparationDays, setCompleteDays, setPreparationDays, addressesView = false, onReviewTolls }: {
  travel: CaseDailyTravel | null; loading: boolean; error: boolean; setBase(value: string): void; setTerminal(value: string): void;
  completeDays: string; preparationDays: string; setCompleteDays(value: string): void; setPreparationDays(value: string): void;
  addressesView?: boolean; onReviewTolls?(): void;
}) {
  const preparationKm = travel?.preparation.length && travel.preparation.every((leg) => leg.distanceKm !== null)
    ? travel.preparation.reduce((sum, leg) => sum + leg.distanceKm!, 0) : null;
  const validDays = (value: string) => /^\d{1,3}$/u.test(value) && Number(value) <= 366;
  const validComplete = validDays(completeDays);
  const validPreparation = !preparationDays || validDays(preparationDays);
  const total = travel && validComplete && validPreparation && (Number(completeDays) + Number(preparationDays) > 0)
    && (travel.distanceKm !== null || Number(completeDays) === 0) && (preparationKm !== null || !Number(preparationDays))
    ? (travel.distanceKm ?? 0) * Number(completeDays) + (preparationKm ?? 0) * Number(preparationDays) : null;
  const estimatedTotal = (Number(completeDays) > 0 && travel?.estimated)
    || (Number(preparationDays) > 0 && travel?.preparation.some((leg) => leg.estimated));
  const terminals = travel?.terminals ?? travel?.bases ?? [];
  const caseLegs = travel?.routeLegs ?? travel?.legs.slice(1, -1) ?? [];
  const driving = travel?.durationMinutes ?? legMinutes(travel?.legs);
  const preparationMinutes = legMinutes(travel?.preparation);
  const totalMinutes = validComplete && validPreparation && (Number(completeDays) > 0 || Number(preparationDays) > 0)
    && (!Number(completeDays) || driving !== null) && (!Number(preparationDays) || preparationMinutes !== null)
    ? Number(completeDays) * (driving ?? 0) + Number(preparationDays) * (preparationMinutes ?? 0) : null;
  const title = addressesView ? "Recorrido de la ruta guardada" : "Recorrido diario del caso";
  return <section aria-label={title} className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-slate-200 px-1 py-2 text-xs">
    <h3 className="flex items-center gap-1.5 font-semibold text-[#003366]"><Route aria-hidden="true" className="size-4" />{addressesView ? "Recorrido" : "Recorrido diario"}</h3>
    {loading && <span role="status" className="text-slate-500">Consultando kilómetros y tiempo…</span>}
    {error && <span className="text-amber-800">Recorrido pendiente de consultar</span>}
    {travel && <>
      {addressesView && <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>{travel.foreignOrigin || travel.foreignDestination ? "Tramo terrestre local" : "Origen → destino"}</span>
        <strong>{travel.routeDistanceKm == null ? "Distancia pendiente" : kilometers.format(travel.routeDistanceKm) + " km" + (caseLegs.some((leg) => leg.estimated) ? " est." : "")}</strong>
        <span>{formatTravelDuration(travel.routeDurationMinutes)}{travel.routeDurationMinutes != null && " de conducción estimada"}</span>
      </div>}
      {travel.bases.length > 1 || (travel.bases.length === 1 && !travel.base) ? <label className="flex items-center gap-1.5">Sede
        <select className={COMPACT_FORM_FIELD} value={baseValue(travel.base)} onChange={(event) => setBase(event.target.value)}>
          <option value="">Seleccione una sede</option>
          {travel.bases.map((base) => <option key={baseValue(base)} value={baseValue(base)}>{base.name}</option>)}
        </select>
      </label> : <span>{travel.base?.name ?? "Sede pendiente de configurar"}</span>}
      {(travel.foreignOrigin || travel.foreignDestination) && (terminals.length
        ? <label className="flex items-center gap-1.5">Almacén para el tramo local
          <select className={COMPACT_FORM_FIELD} value={baseValue(travel.terminal)} onChange={(event) => setTerminal(event.target.value)}>
            <option value="">Seleccione el almacén</option>
            {terminals.map((base) => <option key={baseValue(base)} value={baseValue(base)}>{base.name}</option>)}
          </select>
        </label>
        : <span className="text-amber-800">Almacén para el tramo local pendiente de configurar</span>)}
      {(travel.base || !addressesView) && <span className="font-semibold text-slate-800">{addressesView && "Con salida y regreso a sede · "}{travel.distanceKm === null ? "Km diarios pendientes" : `${kilometers.format(travel.distanceKm)} km/día${travel.estimated ? " estimados" : ""}`} · {formatTravelDuration(driving)}{driving != null && " de conducción est."}</span>}
      {!addressesView && travel.legs.length > 0 && <>
        <label className="flex items-center gap-1.5">Días de ruta completa<NumericInput min="0" max="366" step="1" value={completeDays} onChange={(event) => setCompleteDays(event.target.value)} className={`${COMPACT_FORM_FIELD} w-14`} /></label>
        <label className="flex items-center gap-1.5">Días solo en origen<NumericInput min="0" max="366" step="1" value={preparationDays} onChange={(event) => setPreparationDays(event.target.value)} className={`${COMPACT_FORM_FIELD} w-14`} /></label>
        <strong className="text-[#003366]">{total === null ? "Total pendiente" : `${kilometers.format(total)} km en total${estimatedTotal ? " · Estimado" : ""}`}{totalMinutes != null && " · " + formatTravelDuration(totalMinutes) + " de conducción"}</strong>
      </>}
      {onReviewTolls && <button type="button" onClick={onReviewTolls} className="font-semibold text-[#0070a8] hover:underline">Ver peajes por vehículo</button>}
      <details className="basis-full">
        <summary className="w-fit cursor-pointer text-[#0070a8]">Ver tramos y zonas</summary>
        {(travel.legs.length > 0 || caseLegs.length > 0) && <LegTable legs={travel.legs.length ? travel.legs : caseLegs} />}
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-slate-600">
          {!travel.foreignOrigin && <p>Origen · {formatTransportCoverage(travel.area.origin)}</p>}
          {!travel.foreignDestination && <p>Destino · {formatTransportCoverage(travel.area.destination)}</p>}
          <p>La carga, la descarga y los descansos se planifican aparte del tiempo de conducción.</p>
          {caseLegs.some((leg) => leg.distanceKm == null || leg.durationMinutes == null) && <p>Para los tramos pendientes, verifica los puntos en el mapa y la disponibilidad de la ruta vial.</p>}
        </div>
      </details>
    </>}
  </section>;
}
