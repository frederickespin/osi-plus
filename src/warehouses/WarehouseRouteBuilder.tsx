import { useRef } from "react";
import { Plus, RotateCcw } from "lucide-react";
import { normalizeWarehouseAddressIdentifier } from "../../shared/warehouseSheetAddress.js";
import { AdministrationHelp } from "@/administration/AdministrationHelp";
import { COMPACT_FORM_FIELD } from "@/components/ui/compact-form";
import { WAREHOUSE_BUTTON } from "./configurationUi";
import { emptyWarehouseRoute, ROUTE_FORMATS, type WarehouseRouteDraft, type WarehouseRouteNode, type WarehouseRoutePlan } from "./routeDraft";
import { SHEET_KIND_LABELS, SHEET_KINDS } from "./sheetDraft";
import type { WarehouseSheetKind } from "./sheetTypes";

type Props = Readonly<{
  route: WarehouseRouteDraft; plan: WarehouseRoutePlan; warehouseName: string;
  disabled: boolean; provisionalWarehouse: boolean;
  onChange(route: WarehouseRouteDraft): void; onAdd(): void; onView(node: WarehouseRouteNode): void;
}>;

function RouteIdentifierInput({ kind, value, disabled, invalid, onChange }: Readonly<{ kind: WarehouseSheetKind; value: string; disabled: boolean; invalid: boolean; onChange(value: string): void }>) {
  const entering = useRef(false);
  const format = ROUTE_FORMATS[kind];
  return <input
    type="text" inputMode={format.numeric ? "numeric" : "text"} autoCapitalize="characters" autoComplete="off" spellCheck={false}
    aria-label={`Identificador de ${SHEET_KIND_LABELS[kind].toLowerCase()}`} aria-describedby={`route-format-${kind}`} aria-invalid={invalid}
    disabled={disabled} maxLength={format.width} value={value} onChange={(event) => onChange(event.target.value)}
    onFocus={(event) => event.currentTarget.select()}
    onPointerDown={(event) => { entering.current = document.activeElement !== event.currentTarget; }}
    onPointerUp={(event) => { if (entering.current) event.currentTarget.select(); entering.current = false; }}
    onPointerCancel={() => { entering.current = false; }}
    onBlur={() => { entering.current = false; try { onChange(normalizeWarehouseAddressIdentifier(kind, value, { allowDisabled: true })); } catch { /* Retain the text for correction. */ } }}
    className={`${COMPACT_FORM_FIELD} w-20 font-mono tabular-nums`}
  />;
}

const statusLabels = { new: "Nueva", existing: "Existente", staged: "Ya en la hoja", newWarehouse: "Almacén por guardar" };
const statusStyles = { new: "bg-emerald-50 text-emerald-800", existing: "bg-slate-100 text-slate-600", staged: "bg-blue-50 text-blue-800", newWarehouse: "bg-blue-50 text-blue-800" };

export default function WarehouseRouteBuilder({ route, plan, warehouseName, disabled, provisionalWarehouse, onChange, onAdd, onView }: Props) {
  const destination = plan.nodes.at(-1);
  const complete = plan.valid && plan.activeCount > 0 && plan.newCount === 0 && destination;
  return <section data-testid="warehouse-route-builder" aria-labelledby="warehouse-route-heading" className="rounded border border-slate-200 bg-white p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2"><h3 id="warehouse-route-heading" className="text-sm font-semibold text-slate-800">Crear recorrido de ubicación</h3><AdministrationHelp title="Identificadores de cada nivel"><p>Cada recorrido describe una rama del almacén. Una rama puede tener zona y estantería; otra, pasillo, estantería, nivel y posición.</p><p>Los ceros indican que ese nivel no está habilitado en el recorrido. No crean ubicaciones físicas ni cambian el estado operativo del almacén.</p><p>Ejemplo: zona TRD y estantería AA, con los demás niveles en cero, forman ALM-01-TRD-00-AA-0-0. Si solo existe el almacén, se agregan 2 ubicaciones: la zona y la estantería.</p><p>Al cambiar AA por AB, se reutiliza la zona TRD y se agrega una estantería. El nombre es opcional; las ubicaciones existentes conservan su nombre y uso.</p></AdministrationHelp></div>
      <button type="button" disabled={disabled} onClick={() => onChange(emptyWarehouseRoute())} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 disabled:opacity-40"><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />Limpiar recorrido</button>
    </div>
    <p className="mt-1 text-xs leading-5 text-slate-500">Almacén de origen: <span className="font-medium text-slate-700">{warehouseName.trim() || "Este almacén"}</span>. Indique los niveles que tenga esta rama.</p>
    <div className="mt-3 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="hidden grid-cols-[minmax(150px,1fr)_80px_minmax(140px,1.2fr)] gap-x-3 border-b border-slate-100 pb-1 text-[11px] font-semibold text-slate-500 sm:grid"><span>Nivel y formato</span><span>Identificador</span><span>Nombre · opcional</span></div>
        {SHEET_KINDS.map((kind) => {
          const format = ROUTE_FORMATS[kind]; const field = route[kind];
          let omitted = false;
          try { omitted = normalizeWarehouseAddressIdentifier(kind, field.identifier, { allowDisabled: true }) === format.zero; } catch { /* Display the format error below. */ }
          return <div key={kind} className="grid grid-cols-[minmax(0,1fr)_80px] items-start gap-x-3 gap-y-1 border-b border-slate-100 py-2 sm:grid-cols-[minmax(150px,1fr)_80px_minmax(140px,1.2fr)]">
            <div><p className="text-xs font-medium leading-4 text-slate-700">{format.label}</p><p id={`route-format-${kind}`} className="mt-0.5 text-[11px] leading-4 text-slate-500">{format.format}<br /><span className="font-mono">{format.zero}</span> = sin este nivel</p></div>
            <RouteIdentifierInput kind={kind} value={field.identifier} disabled={disabled} invalid={Boolean(plan.errors[kind])} onChange={(identifier) => onChange({ ...route, [kind]: { ...field, identifier } })} />
            <input aria-label={`Nombre de ${SHEET_KIND_LABELS[kind].toLowerCase()}`} disabled={disabled || omitted} maxLength={160} value={field.name} placeholder={omitted ? "Sin este nivel" : `${SHEET_KIND_LABELS[kind]} · opcional`} onChange={(event) => onChange({ ...route, [kind]: { ...field, name: event.target.value } })} className={`${COMPACT_FORM_FIELD} col-span-2 w-full sm:col-span-1`} />
            {plan.errors[kind] && <p className="col-span-2 text-[11px] leading-4 text-red-800 sm:col-span-3">{plan.errors[kind]}</p>}
          </div>;
        })}
        <p className="mt-2 text-[11px] leading-5 text-slate-500">Zona: TRD, A01, 00A o 001. Al escribir 1, se completa como 001 en zona y 01 en pasillo.</p>
      </div>
      <div data-testid="warehouse-route-preview" className="min-w-0 rounded bg-slate-50 p-3" aria-live="polite" aria-atomic="true">
        <h4 className="text-xs font-semibold text-slate-700">Vista previa del recorrido</h4>
        <p className="mt-1 text-xs text-slate-600">{plan.newCount} nuevas · {plan.existingCount} existentes · {plan.stagedCount} ya en la hoja</p>
        <div className="mt-2 border-y border-slate-200 py-2"><p className="text-[11px] text-slate-500">Etiqueta de destino</p><p data-testid="warehouse-route-label" className="mt-0.5 break-all font-mono text-xs font-semibold text-[#003366]">{plan.label ?? "Revise los identificadores"}</p>{provisionalWarehouse && <p className="mt-1 text-[11px] text-slate-500">ALM-?? se completará con el número automático al guardar.</p>}</div>
        <ol aria-label="Niveles del recorrido" className="mt-2 space-y-2">
          {plan.nodes.map((node, index) => <li key={`${node.kind}-${node.identifier}`} data-testid="warehouse-route-step" data-status={node.status} data-kind={node.kind} className="border-l-2 border-slate-200 pl-2" style={{ marginLeft: `${index * 10}px` }}><div className="flex flex-wrap items-center gap-1.5"><span className="text-xs text-slate-700">{node.name}</span><span className={`rounded px-1 py-0.5 text-[10px] ${statusStyles[node.status]}`}>{statusLabels[node.status]}</span></div><p className="mt-0.5 break-all font-mono text-[10px] text-slate-500">{node.label}</p></li>)}
        </ol>
        {plan.error && <p role="alert" className="mt-2 text-xs text-red-800">{plan.error}</p>}
        {plan.valid && plan.activeCount === 0 && <p className="mt-2 text-xs text-slate-500">Complete un identificador para incluir ese nivel.</p>}
        {plan.valid && plan.activeCount > 0 && plan.newCount === 0 && <p className="mt-2 text-xs text-slate-600">Este recorrido ya está completo entre las ubicaciones existentes y las filas de la hoja.</p>}
      </div>
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="max-w-lg text-[11px] leading-5 text-slate-500">Agregue el recorrido a la hoja; después podrá asignar el uso de cada ubicación. Guardar hoja confirma todas las filas.</p>{complete ? <button type="button" data-testid="warehouse-route-open" disabled={disabled} onClick={() => onView(destination)} className={WAREHOUSE_BUTTON}>{destination.status === "existing" ? "Abrir ubicación existente" : "Ver fila en la hoja"}</button> : <button type="button" onClick={onAdd} disabled={disabled || !plan.valid || plan.newCount === 0} className={WAREHOUSE_BUTTON}><Plus className="h-4 w-4" aria-hidden="true" />Agregar recorrido a la hoja</button>}</div>
  </section>;
}
