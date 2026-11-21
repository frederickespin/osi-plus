import { useId, type ReactNode } from "react";
import { AdministrationHelp } from "@/administration/AdministrationHelp";
import { ADMIN_FLEET_TRANSIT_CONFIGURATIONS, ADMIN_FLEET_TRANSIT_CONFIGURATION_LABELS } from "../../shared/adminFleet.js";
import { DIMENSION_LABELS, VOLUME_LABELS, WEIGHT_LABELS, type FleetOptions } from "./types";
import type { VehicleDraft } from "./vehicleForm";

const fieldClass = "mt-1 h-10 min-w-0 rounded border border-slate-300 bg-white px-2 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-500 sm:h-9";
const tollCategories = [1, 2, 3, 4, 5] as const;

export default function FleetFields({ draft, onChange, options, calculatedVolume, disabled, technicalLocked }: {
  draft: VehicleDraft;
  onChange(draft: VehicleDraft): void;
  options: FleetOptions | null;
  calculatedVolume: number | null;
  disabled: boolean;
  technicalLocked: boolean;
}) {
  const hubFieldId = useId();
  const update = <K extends keyof VehicleDraft>(key: K, value: VehicleDraft[K]) => onChange({ ...draft, [key]: value });
  const variableVolume = options?.types.find((type) => type.name === draft.vehicleType)?.variableVolume ?? false;
  function selectType(vehicleType: string) {
    const variable = options?.types.some((type) => type.name === vehicleType && type.variableVolume);
    onChange({ ...draft, vehicleType, ...(variable && { capacityVolume: "", usableLength: "", usableWidth: "", usableHeight: "" }) });
  }
  const text = (key: keyof VehicleDraft, label: string, maxLength: number, options: { technical?: boolean; numeric?: boolean; integer?: boolean; required?: boolean; caption?: string; calculated?: string } = {}) => (
    <label className={`flex min-w-0 flex-col justify-end text-xs font-medium text-slate-600 ${options.numeric ? "w-fit shrink-0" : ""}`}>{options.caption || label}
      <input aria-label={label} value={options.calculated ?? String(draft[key])} onChange={(event) => update(key, event.target.value)}
        readOnly={options.calculated !== undefined}
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
      <label className="flex min-w-0 flex-col justify-end text-xs font-medium text-slate-600">Código
        <input value={draft.businessCode} placeholder="Se asigna al guardar" readOnly className={fieldClass + " bg-slate-50"} />
      </label>
      {text("plate", "Matrícula", 40)}
      <label className="flex min-w-0 flex-col justify-end text-xs font-medium text-slate-600">Tipo de vehículo *
        <select aria-label="Tipo de vehículo *" value={draft.vehicleType} required disabled={disabled || technicalLocked || !options} onChange={(event) => selectType(event.target.value)} className={fieldClass}>
          <option value="">Seleccionar tipo</option>
          {draft.vehicleType && !options?.types.some((type) => type.name === draft.vehicleType) && <option value={draft.vehicleType}>{draft.vehicleType}</option>}
          {options?.types.map(({ name }) => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
      {text("vin", "VIN / chasis", 80)}
      {text("brand", "Marca", 120)}
      {text("model", "Modelo", 120)}
      {text("modelYear", "Año", 4, { numeric: true, integer: true })}
      <div className="min-w-0">
        <div className="flex min-h-4 items-center gap-1 text-xs font-medium text-slate-600">
          <label htmlFor={hubFieldId}>Sede habitual</label>
          <AdministrationHelp title="Sede habitual"><p>Seleccione una base registrada en Motor Logístico. La sede indica desde dónde se despacha habitualmente el vehículo.</p></AdministrationHelp>
        </div>
        <select id={hubFieldId} value={draft.hubCode} disabled={disabled || !options} onChange={(event) => update("hubCode", event.target.value)} className={`${fieldClass} w-full`}>
          <option value="">Sin asignar</option>
          {draft.hubCode && !options?.bases.some(({ code }) => code === draft.hubCode) && <option value={draft.hubCode}>
            {/^BASE-[0-9A-F]{20}$/u.test(draft.hubCode) ? "Sede guardada fuera de la lista" : draft.hubCode}
          </option>}
          {options?.bases.filter((base) => base.selectable !== false || base.code === draft.hubCode)
            .map(({ code, name, address, selectable }) => <option key={code} value={code} disabled={selectable === false}>{name} · {address}</option>)}
        </select>
        {options && !options.bases.some((base) => base.selectable !== false) && <p className="mt-1 text-xs text-slate-500">Registre la sede en Motor Logístico.</p>}
      </div>
    </>)}
    {group("Clasificación de tránsito", <>
      <label className="flex min-w-0 flex-col justify-end text-xs font-medium text-slate-600">Configuración vial
        <select value={draft.transitConfiguration ?? ""} disabled={disabled} className={fieldClass}
          onChange={(event) => update("transitConfiguration", ADMIN_FLEET_TRANSIT_CONFIGURATIONS.find((value) => value === event.target.value) ?? null)}>
          <option value="">Sin clasificar</option>
          {ADMIN_FLEET_TRANSIT_CONFIGURATIONS.map((value) => <option key={value} value={value}>{ADMIN_FLEET_TRANSIT_CONFIGURATION_LABELS[value]}</option>)}
        </select>
      </label>
      {text("transitAxles", "Ejes totales", 2, { numeric: true, integer: true })}
      <label className="flex min-w-0 flex-col justify-end text-xs font-medium text-slate-600">Categoría de peaje
        <select value={draft.tollCategory ?? ""} disabled={disabled} className={fieldClass}
          onChange={(event) => update("tollCategory", tollCategories.find((value) => String(value) === event.target.value) ?? null)}>
          <option value="">Sin confirmar</option>
          {tollCategories.map((category) => <option key={category} value={category}>Categoría {category}</option>)}
        </select>
      </label>
    </>, "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,0.8fr)]", <>
      <p>En una patana, cuente los ejes del cabezote y del semirremolque. Si cambia el conjunto, confirme los ejes del viaje.</p>
      <p>La categoría de peaje es una referencia que se confirma por estación. Los permisos se verifican según la ruta, la zona y la fecha del viaje.</p>
    </>)}
    {group("Capacidades", <>
      <div className="flex items-end gap-2">
        {text("capacityWeight", `Capacidad de peso (${WEIGHT_LABELS[draft.weightUnit]})`, 20, { technical: true, numeric: true, caption: "Peso" })}
        {unit("weightUnit", "Unidad de peso", WEIGHT_LABELS)}
      </div>
      {!variableVolume && <div className="flex items-end gap-2">
        {text("capacityVolume", `Capacidad de volumen (${VOLUME_LABELS[draft.volumeUnit]})`, 20, {
          technical: true, numeric: true, caption: calculatedVolume === null ? "Volumen" : "Volumen automático",
          calculated: calculatedVolume?.toFixed(1),
        })}
        {unit("volumeUnit", "Unidad de volumen", VOLUME_LABELS)}
      </div>}
      {variableVolume && <p className="self-center text-xs text-slate-600">Volumen y dimensiones según el contenedor.</p>}
    </>, "flex flex-wrap items-end gap-x-6 gap-y-2", <><p>Con largo, ancho y alto completos, el volumen se calcula en la unidad elegida y se redondea a un decimal. Puede escribirlo directamente cuando falte alguna medida.</p><p>Para el peso y el volumen ingresados a mano, escriba el valor en la unidad seleccionada.</p></>)}
    {!variableVolume && group("Dimensiones útiles", <>
      {text("usableLength", `Largo útil (${DIMENSION_LABELS[draft.dimensionUnit]})`, 20, { technical: true, numeric: true, caption: "Largo" })}
      {text("usableWidth", `Ancho útil (${DIMENSION_LABELS[draft.dimensionUnit]})`, 20, { technical: true, numeric: true, caption: "Ancho" })}
      {text("usableHeight", `Alto útil (${DIMENSION_LABELS[draft.dimensionUnit]})`, 20, { technical: true, numeric: true, caption: "Alto" })}
      {unit("dimensionUnit", "Unidad de dimensiones", DIMENSION_LABELS)}
    </>, "flex flex-wrap items-end gap-x-3 gap-y-2", <p>Medidas interiores aprovechables para la carga. Las tres medidas utilizan la misma unidad; cambiarla no convierte los números.</p>)}
    {technicalLocked && <p className="text-xs leading-5 text-amber-900">Las características técnicas están protegidas porque este vehículo ya se utilizó en un cálculo.</p>}
  </div>;
}
