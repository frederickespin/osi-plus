import type { ReactNode } from "react";
import { DIMENSION_LABELS, FLEET_STATUS_LABELS, VOLUME_LABELS, WEIGHT_LABELS } from "./types";
import type { VehicleDraft } from "./vehicleForm";

const fieldClass = "mt-1 h-10 w-full min-w-0 rounded border border-slate-300 bg-white px-2 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-500 sm:h-9";

export default function FleetFields({ draft, onChange, disabled, technicalLocked }: {
  draft: VehicleDraft;
  onChange(draft: VehicleDraft): void;
  disabled: boolean;
  technicalLocked: boolean;
}) {
  const update = <K extends keyof VehicleDraft>(key: K, value: VehicleDraft[K]) => onChange({ ...draft, [key]: value });
  const text = (key: keyof VehicleDraft, label: string, maxLength: number, options: { technical?: boolean; numeric?: boolean; integer?: boolean; required?: boolean } = {}) => (
    <label className="flex min-w-0 flex-col justify-end text-xs font-medium text-slate-600">{label}
      <input aria-label={label} value={String(draft[key])} onChange={(event) => update(key, event.target.value)}
        required={options.required} maxLength={maxLength} disabled={disabled || options.technical && technicalLocked}
        inputMode={options.numeric ? options.integer ? "numeric" : "decimal" : undefined} type="text"
        onFocus={options.numeric ? (event) => event.currentTarget.select() : undefined} className={fieldClass} />
    </label>
  );
  const unit = (key: "weightUnit" | "volumeUnit" | "dimensionUnit", label: string, labels: Readonly<Record<string, string>>) => (
    <label className="flex min-w-0 flex-col justify-end text-xs font-medium text-slate-600">{label}
      <select aria-label={label} value={draft[key]} onChange={(event) => update(key, event.target.value as VehicleDraft[typeof key])} disabled={disabled || technicalLocked} className={fieldClass}>
        {Object.entries(labels).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
      </select>
    </label>
  );
  const group = (title: string, children: ReactNode) => <fieldset className="min-w-0 border-t border-slate-200 pt-3"><legend className="px-1 text-xs font-semibold text-slate-800">{title}</legend><div className="grid grid-cols-2 gap-x-3 gap-y-3">{children}</div></fieldset>;
  return <div className="space-y-4">
    {group("Identificación", <>
      {text("businessCode", "Código *", 80, { required: true })}
      {text("plate", "Matrícula", 40)}
      {text("vehicleType", "Tipo de vehículo *", 80, { required: true, technical: true })}
      {text("vin", "VIN / chasis", 80)}
      {text("brand", "Marca", 120)}
      {text("model", "Modelo", 120)}
      {text("modelYear", "Año", 4, { numeric: true, integer: true })}
      {text("hubCode", "Base operativa", 80)}
    </>)}
    {group("Capacidades", <>
      {text("capacityWeight", `Capacidad de peso (${WEIGHT_LABELS[draft.weightUnit]})`, 20, { technical: true, numeric: true })}
      {unit("weightUnit", "Unidad de peso", WEIGHT_LABELS)}
      {text("capacityVolume", `Capacidad de volumen (${VOLUME_LABELS[draft.volumeUnit]})`, 20, { technical: true, numeric: true })}
      {unit("volumeUnit", "Unidad de volumen", VOLUME_LABELS)}
      <p className="col-span-2 text-xs leading-5 text-slate-500">Cambiar una unidad no convierte el número. Introduzca la capacidad en la unidad seleccionada.</p>
    </>)}
    {group("Dimensiones útiles", <>
      {text("usableLength", `Largo útil (${DIMENSION_LABELS[draft.dimensionUnit]})`, 20, { technical: true, numeric: true })}
      {text("usableWidth", `Ancho útil (${DIMENSION_LABELS[draft.dimensionUnit]})`, 20, { technical: true, numeric: true })}
      {text("usableHeight", `Alto útil (${DIMENSION_LABELS[draft.dimensionUnit]})`, 20, { technical: true, numeric: true })}
      {unit("dimensionUnit", "Unidad de dimensiones", DIMENSION_LABELS)}
    </>)}
    {technicalLocked && <p className="rounded bg-amber-50 p-2 text-xs leading-5 text-amber-900">Las características técnicas están protegidas porque este vehículo ya se utilizó en un cálculo.</p>}
    {group("Disponibilidad", <>
      <label className="text-xs font-medium text-slate-600">Estado operativo
        <select aria-label="Estado operativo" value={draft.operationalStatus} disabled={disabled} onChange={(event) => onChange({ ...draft, operationalStatus: event.target.value as VehicleDraft["operationalStatus"], availableForCalculation: ["AVAILABLE", "IN_USE"].includes(event.target.value) && draft.availableForCalculation })} className={fieldClass}>
          {Object.entries(FLEET_STATUS_LABELS).filter(([status]) => status !== "RETIRED" || draft.operationalStatus === "RETIRED").map(([value, name]) => <option key={value} value={value}>{name}</option>)}
        </select>
      </label>
      <label className="flex items-end gap-2 pb-2 text-xs font-medium leading-5 text-slate-600">
        <input type="checkbox" checked={draft.availableForCalculation} disabled={disabled || !["AVAILABLE", "IN_USE"].includes(draft.operationalStatus)} onChange={(event) => update("availableForCalculation", event.target.checked)} className="h-4 w-4 shrink-0 accent-[#003366]" />Disponible para cálculos
      </label>
      <label className="text-xs font-medium text-slate-600">Vigencia desde<input aria-label="Vigencia desde" type="date" value={draft.effectiveFrom} disabled={disabled} onChange={(event) => update("effectiveFrom", event.target.value)} className={fieldClass} /></label>
      <label className="text-xs font-medium text-slate-600">Vigencia hasta<input aria-label="Vigencia hasta" type="date" value={draft.effectiveTo} disabled={disabled} onChange={(event) => update("effectiveTo", event.target.value)} className={fieldClass} /></label>
      <p className="col-span-2 text-xs leading-5 text-slate-500">Para ofrecerse como disponible en Logística debe estar Disponible, vigente y habilitado para cálculos.</p>
    </>)}
  </div>;
}
