import { useEffect, useState } from "react";
import { Route } from "lucide-react";
import { NumericInput } from "@/components/ui/numeric-input";
import { COMPACT_FORM_FIELD } from "@/components/ui/compact-form";
import type { CaseDailyTravel } from "../../shared/logisticsTransport";
import { CaseRouteApi } from "./caseRouteApi";

const kilometers = new Intl.NumberFormat("es-DO", { maximumFractionDigits: 2 });
const area = (value: "METRO" | "INTERIOR" | null) => value === "METRO" ? "Zona metro" : value === "INTERIOR" ? "Fuera de zona metro" : "Zona por verificar";

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

export default function CaseDailyTravelPanel({ travel, loading, error, setBase, setTerminal, completeDays, preparationDays, setCompleteDays, setPreparationDays }: {
  travel: CaseDailyTravel | null; loading: boolean; error: boolean; setBase(value: string): void; setTerminal(value: string): void;
  completeDays: string; preparationDays: string; setCompleteDays(value: string): void; setPreparationDays(value: string): void;
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
  return <section aria-label="Recorrido diario del caso" className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded border border-slate-200 px-3 py-2 text-xs">
    <h3 className="flex items-center gap-1.5 font-semibold text-[#003366]"><Route aria-hidden="true" className="size-4" />Recorrido diario</h3>
    {loading && <span role="status" className="text-slate-500">Consultando kilómetros…</span>}
    {error && <span className="text-amber-800">Recorrido pendiente de consultar</span>}
    {travel && <>
      {travel.bases.length > 1 ? <label className="flex items-center gap-1.5">Sede
        <select className={COMPACT_FORM_FIELD} value={travel.base?.address ?? ""} onChange={(event) => setBase(event.target.value)}>
          <option value="">Seleccione una sede</option>
          {travel.bases.map((base) => <option key={base.address} value={base.address}>{base.name}</option>)}
        </select>
      </label> : <span>{travel.base?.name ?? "Sede pendiente de configurar"}</span>}
      {(travel.foreignOrigin || travel.foreignDestination) && travel.bases.length > 0 && <label className="flex items-center gap-1.5">Almacén para el tramo local
        <select className={COMPACT_FORM_FIELD} value={travel.terminal?.address ?? ""} onChange={(event) => setTerminal(event.target.value)}>
          <option value="">Seleccione el almacén</option>
          {travel.bases.map((base) => <option key={base.address} value={base.address}>{base.name}</option>)}
        </select>
      </label>}
      <span className="font-semibold text-slate-800">{travel.distanceKm === null ? "Km diarios pendientes" : `${kilometers.format(travel.distanceKm)} km/día${travel.estimated ? " estimados" : ""}`}</span>
      {travel.legs.length > 0 && <>
        <label className="flex items-center gap-1.5">Días de ruta completa<NumericInput min="0" max="366" step="1" value={completeDays} onChange={(event) => setCompleteDays(event.target.value)} className={`${COMPACT_FORM_FIELD} w-14`} /></label>
        <label className="flex items-center gap-1.5">Días solo en origen<NumericInput min="0" max="366" step="1" value={preparationDays} onChange={(event) => setPreparationDays(event.target.value)} className={`${COMPACT_FORM_FIELD} w-14`} /></label>
        <strong className="text-[#003366]">{total === null ? "Total pendiente" : `${kilometers.format(total)} km en total${estimatedTotal ? " · Estimado" : ""}`}</strong>
      </>}
      <details className="basis-full">
        <summary className="w-fit cursor-pointer text-[#0070a8]">Ver tramos y zonas</summary>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-slate-600">
          {travel.legs.map((leg, index) => <p key={index}>{leg.from.label} → {leg.to.label} · {leg.distanceKm === null ? "Pendiente" : `${kilometers.format(leg.distanceKm)} km${leg.estimated ? " estimados" : ""}`}</p>)}
          {!travel.foreignOrigin && <p>Origen · {area(travel.area.origin)}</p>}
          {!travel.foreignDestination && <p>Destino · {area(travel.area.destination)}</p>}
        </div>
      </details>
    </>}
  </section>;
}
