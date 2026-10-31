import { AdministrationHelp } from "@/administration/AdministrationHelp";
import { FLEET_STATUS_LABELS, type FleetStatus } from "./types";
import type { VehicleDraft } from "./vehicleForm";

const fieldClass = "mt-1 h-10 min-w-0 rounded border border-slate-300 bg-white px-2 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-500 sm:h-9";

export default function FleetAvailabilityFields({ draft, onChange, disabled }: {
  draft: VehicleDraft;
  onChange(draft: VehicleDraft): void;
  disabled: boolean;
}) {
  const update = <K extends keyof VehicleDraft>(key: K, value: VehicleDraft[K]) => onChange({ ...draft, [key]: value });
  const supportsPlanning = ["AVAILABLE", "IN_USE"].includes(draft.operationalStatus);

  return <div className="space-y-4">
    <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
      <label className="flex min-w-0 flex-col text-xs font-medium text-slate-600">Estado operativo
        <select aria-label="Estado operativo" value={draft.operationalStatus} disabled={disabled} className={`${fieldClass} w-40 max-w-full`}
          onChange={(event) => {
            const operationalStatus = event.target.value as FleetStatus;
            onChange({ ...draft, operationalStatus, availableForCalculation: ["AVAILABLE", "IN_USE"].includes(operationalStatus) && draft.availableForCalculation });
          }}>
          {Object.entries(FLEET_STATUS_LABELS).filter(([status]) => status !== "RETIRED" || draft.operationalStatus === "RETIRED").map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <div className="flex min-h-10 items-center gap-1 sm:min-h-9">
        <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-xs text-slate-700 sm:min-h-9">
          <input type="checkbox" checked={draft.availableForCalculation} disabled={disabled || !supportsPlanning}
            onChange={(event) => update("availableForCalculation", event.currentTarget.checked)} className="h-4 w-4 accent-[#003366] disabled:opacity-40" />
          Activo en planificación
        </label>
        <AdministrationHelp title="Disponibilidad del vehículo"><p>Logística ofrece el vehículo cuando está activo, en estado Disponible y dentro de su vigencia.</p><p>En uso permite conservarlo activo, pero no lo ofrece como libre. No disponible desactiva la planificación.</p><p>Las fechas se registran a las 00:00 UTC. Desde incluye esa fecha; Hasta termina al comenzar la fecha elegida, sin incluirla. Deje Hasta vacío si no necesita una fecha de cierre.</p><p>Retirar el vehículo conserva su historial y bloquea nuevos cambios. El retiro se confirma por separado.</p></AdministrationHelp>
      </div>
    </div>
    <fieldset className="min-w-0 border-t border-slate-200 pt-2">
      <legend className="pr-2 text-xs font-semibold text-slate-800">Vigencia</legend>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-0 flex-col text-xs font-medium text-slate-600">Desde
          <input type="date" aria-label="Vigencia desde" required value={draft.effectiveFrom} disabled={disabled}
            onChange={(event) => update("effectiveFrom", event.target.value)} className={`${fieldClass} w-[9.75rem] max-w-full tabular-nums`} />
        </label>
        <label className="flex min-w-0 flex-col text-xs font-medium text-slate-600">Hasta (sin incluir)
          <input type="date" aria-label="Vigencia hasta" value={draft.effectiveTo} disabled={disabled}
            onChange={(event) => update("effectiveTo", event.target.value)} className={`${fieldClass} w-[9.75rem] max-w-full tabular-nums`} />
        </label>
      </div>
    </fieldset>
  </div>;
}
