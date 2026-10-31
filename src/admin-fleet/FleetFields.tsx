import { useId, type ReactNode } from "react";
import { AdministrationHelp } from "@/administration/AdministrationHelp";
import { DIMENSION_LABELS, VOLUME_LABELS, WEIGHT_LABELS } from "./types";
import type { VehicleDraft } from "./vehicleForm";

const fieldClass = "mt-1 h-10 min-w-0 rounded border border-slate-300 bg-white px-2 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-500 sm:h-9";

export default function FleetFields({ draft, onChange, disabled, technicalLocked }: {
  draft: VehicleDraft;
  onChange(draft: VehicleDraft): void;
  disabled: boolean;
  technicalLocked: boolean;
}) {
  const hubFieldId = useId();
  const update = <K extends keyof VehicleDraft>(key: K, value: VehicleDraft[K]) => onChange({ ...draft, [key]: value });
  const text = (key: keyof VehicleDraft, label: string, maxLength: number, options: { technical?: boolean; numeric?: boolean; integer?: boolean; required?: boolean; caption?: string } = {}) => (
    <label className={`flex min-w-0 flex-col justify-end text-xs font-medium text-slate-600 ${options.numeric ? "w-fit shrink-0" : ""}`}>{options.caption || label}
      <input aria-label={label} value={String(draft[key])} onChange={(event) => update(key, event.target.value)}
        required={options.required} maxLength={maxLength} disabled={disabled || options.technical && technicalLocked}
        inputMode={options.numeric ? options.integer ? "numeric" : "decimal" : undefined} type="text"
        onFocus={options.numeric ? (event) => event.currentTarget.select() : undefined}
        className={`${fieldClass} ${options.numeric ? `${options.integer ? "w-[7ch]" : "w-[10ch]"} max-w-full tabular-nums` : "w-full"}`} />
    </label>
  );
  const unit = (key: "weightUnit" | "volumeUnit" | "dimensionUnit", label: string, labels: Readonly<Record<string, string>>) => (
    <label className="flex w-fit min-w-0 shrink-0 flex-col justify-end text-xs font-medium text-slate-600">Unidad
      <select aria-label={label} value={draft[key]} onChange={(event) => update(key, event.target.value as VehicleDraft[typeof key])} disabled={disabled || technicalLocked} className={`${fieldClass} w-20 max-w-full`}>
        {Object.entries(labels).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
      </select>
    </label>
  );
  const group = (title: string, children: ReactNode, layout = "grid grid-cols-2 gap-x-3 gap-y-2", help?: ReactNode) => (
    <fieldset className="min-w-0 border-t border-slate-200 pt-2">
      <legend className="pr-1 text-xs font-semibold text-slate-800"><span className="inline-flex items-center gap-1">{title}{help && <AdministrationHelp title={title}>{help}</AdministrationHelp>}</span></legend>
      <div className={layout}>{children}</div>
    </fieldset>
  );
  return <div className="space-y-3">
    {group("Identificación", <>
      {text("businessCode", "Código *", 80, { required: true })}
      {text("plate", "Matrícula", 40)}
      {text("vehicleType", "Tipo de vehículo *", 80, { required: true, technical: true })}
      {text("vin", "VIN / chasis", 80)}
      {text("brand", "Marca", 120)}
      {text("model", "Modelo", 120)}
      {text("modelYear", "Año", 4, { numeric: true, integer: true })}
      <div className="min-w-0">
        <div className="flex min-h-4 items-center gap-1 text-xs font-medium text-slate-600">
          <label htmlFor={hubFieldId}>Sede habitual</label>
          <AdministrationHelp title="Sede habitual"><p>Dato opcional: sede o lugar desde el que normalmente se administra o despacha el vehículo. Puede dejarlo vacío si no necesita distinguir sedes.</p><p>No indica su ubicación actual ni el chofer asignado.</p></AdministrationHelp>
        </div>
        <input id={hubFieldId} aria-label="Sede habitual" type="text" maxLength={80} value={draft.hubCode} disabled={disabled} onChange={(event) => update("hubCode", event.target.value)} className={`${fieldClass} w-full`} />
      </div>
    </>)}
    {group("Capacidades", <>
      <div className="flex items-end gap-2">
        {text("capacityWeight", `Capacidad de peso (${WEIGHT_LABELS[draft.weightUnit]})`, 20, { technical: true, numeric: true, caption: "Peso" })}
        {unit("weightUnit", "Unidad de peso", WEIGHT_LABELS)}
      </div>
      <div className="flex items-end gap-2">
        {text("capacityVolume", `Capacidad de volumen (${VOLUME_LABELS[draft.volumeUnit]})`, 20, { technical: true, numeric: true, caption: "Volumen" })}
        {unit("volumeUnit", "Unidad de volumen", VOLUME_LABELS)}
      </div>
    </>, "flex flex-wrap items-end gap-x-6 gap-y-2", <><p>Indique la capacidad útil de carga y su unidad. Los campos vacíos conservan el dato como desconocido.</p><p>Cambiar una unidad no convierte el número. Introduzca la capacidad en la unidad seleccionada.</p></>)}
    {group("Dimensiones útiles", <>
      {text("usableLength", `Largo útil (${DIMENSION_LABELS[draft.dimensionUnit]})`, 20, { technical: true, numeric: true, caption: "Largo" })}
      {text("usableWidth", `Ancho útil (${DIMENSION_LABELS[draft.dimensionUnit]})`, 20, { technical: true, numeric: true, caption: "Ancho" })}
      {text("usableHeight", `Alto útil (${DIMENSION_LABELS[draft.dimensionUnit]})`, 20, { technical: true, numeric: true, caption: "Alto" })}
      {unit("dimensionUnit", "Unidad de dimensiones", DIMENSION_LABELS)}
    </>, "flex flex-wrap items-end gap-x-3 gap-y-2", <p>Medidas interiores aprovechables para la carga. Las tres medidas utilizan la misma unidad; cambiarla no convierte los números.</p>)}
    {technicalLocked && <p className="text-xs leading-5 text-amber-900">Las características técnicas están protegidas porque este vehículo ya se utilizó en un cálculo.</p>}
  </div>;
}
