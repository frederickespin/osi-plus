import { useState } from "react";
import { AdministrationHelp } from "@/administration/AdministrationHelp";
import { COMPACT_FORM_FIELD } from "@/components/ui/compact-form";
import type { WarehouseLocationRow, WarehouseRow } from "@/materials-inventory/api";
import { WarehouseApi, type WarehouseLocationConfigurationChange } from "./api";
import { ConfigurationPanel } from "./ConfigurationPanel";
import { AVAILABILITY_RULE_LABELS, OPERATIONAL_STATUS_LABELS, type WarehouseAreaUse, type WarehouseAvailabilityRule, type WarehouseLocationConfiguration, type WarehouseOperationalStatus } from "./configurationTypes";
import { findConfiguredLocation, WAREHOUSE_TEXTAREA } from "./configurationUi";
import { locationNamePath } from "./locationTree";
import type { PendingWarehouseDraft } from "./pendingDraft";
import { useWarehouseMutation } from "./useWarehouseMutation";
import { isWarehouseRoutesUiEnabled } from "./routesMode";

export type LocationConfigurationEditorState = Readonly<{
  id: string; kind: "details" | "controls"; warehouse: WarehouseRow; location: WarehouseLocationRow;
  configuration: WarehouseLocationConfiguration;
  recovery?: PendingWarehouseDraft<WarehouseLocationConfigurationChange>;
}>;

export function LocationOperationalSummary({ configuration, warehouses }: { configuration: WarehouseLocationConfiguration; warehouses: readonly WarehouseRow[] }) {
  return <div className="space-y-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs" aria-label="Condición efectiva de la ubicación">
    <p className="font-medium text-slate-700">Condición efectiva{configuration.effective.inherited ? " · incluye controles superiores" : ""}</p>
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-600"><span>Estado: <strong className="font-medium">{OPERATIONAL_STATUS_LABELS[configuration.effective.operationalStatus]}</strong></span><span>{configuration.effective.canReceive ? "Recepciones permitidas" : "Recepciones bloqueadas"}</span><span>{configuration.effective.canDispatch ? "Despachos permitidos" : "Despachos bloqueados"}</span></div>
    {configuration.effective.blockedBy.length > 0 && <ul className="space-y-1 border-t border-slate-200 pt-2">{configuration.effective.blockedBy.map((block, index) => {
      const source = block.locationRef ? findConfiguredLocation(warehouses, block.locationRef) : null;
      const warehouse = warehouses.find((row) => row.warehouseRef === block.warehouseRef);
      const label = source ? locationNamePath(source.warehouse, source.location) : warehouse?.name ?? "Ubicación sin confirmar";
      const control = block.kind === "DISPATCH_BLOCKED" ? "Despachos bloqueados" : block.kind === "OPERATIONAL_STATUS" ? OPERATIONAL_STATUS_LABELS[block.value as WarehouseOperationalStatus] ?? "Restricción operativa" : block.kind === "HIERARCHY_INVALID" ? "Jerarquía sin confirmar" : "Registro inactivo";
      return <li key={`${block.kind}-${block.locationRef}-${index}`} className="leading-5 text-amber-900"><span className="font-medium">{label}</span>: {control}{block.reason ? `. Motivo: ${block.reason}` : "."}</li>;
    })}</ul>}
  </div>;
}

export default function LocationConfigurationEditor({ editor, open, api, membershipRef, canManage, areaUses, warehouses, triggerRef, onClose, onPending, onSaved, onUnauthorized, onRefresh }: {
  editor: LocationConfigurationEditorState; open: boolean; api: WarehouseApi; membershipRef: string | null; canManage: boolean;
  areaUses: readonly WarehouseAreaUse[]; warehouses: readonly WarehouseRow[]; triggerRef: React.RefObject<HTMLElement | null>;
  onClose(retain: boolean): void; onPending(draft: PendingWarehouseDraft | null): void; onSaved(): void; onUnauthorized(): void; onRefresh(): void;
}) {
  const recovered = editor.recovery?.change;
  const routesEnabled = isWarehouseRoutesUiEnabled();
  const config = editor.configuration;
  const controls = editor.kind === "controls";
  const [areaUseRef, setAreaUseRef] = useState((recovered ? recovered.areaUseRef : config.areaUseRef) ?? "");
  const [characteristics, setCharacteristics] = useState((recovered ? recovered.characteristics : config.characteristics) ?? "");
  const [notes, setNotes] = useState((recovered ? recovered.notes : config.notes) ?? "");
  const [operationalStatus, setOperationalStatus] = useState(recovered?.operationalStatus ?? config.operationalStatus);
  const [availabilityRule, setAvailabilityRule] = useState(recovered?.availabilityRule ?? config.availabilityRule);
  const [reason, setReason] = useState(recovered?.changeReason ?? "");
  const [acknowledge, setAcknowledge] = useState(recovered?.acknowledgeImpact ?? false);
  const mutation = useWarehouseMutation({ api, membershipRef, recovery: editor.recovery, onPending, onSaved, onUnauthorized });
  const fieldsDisabled = !canManage || mutation.locked;
  const controlsChanged = operationalStatus !== config.operationalStatus || availabilityRule !== config.availabilityRule;
  const detailsChanged = (areaUseRef || null) !== config.areaUseRef || (characteristics.trim() || null) !== config.characteristics || (notes.trim() || null) !== config.notes;
  const canSubmit = mutation.uncertain || (controls ? controlsChanged && Boolean(reason.trim()) && acknowledge : detailsChanged);
  const choices = areaUses.filter((use) => use.status === "ACTIVE" || use.useRef === areaUseRef);
  function submit() {
    if (!canManage || !canSubmit) return;
    const change: WarehouseLocationConfigurationChange = mutation.uncertain && recovered ? recovered : {
      operation: "WAREHOUSE_LOCATION_CONFIGURATION_UPDATE", locationRef: editor.location.locationRef, expectedVersion: recovered?.expectedVersion ?? config.version,
      areaUseRef: areaUseRef || null, characteristics: characteristics.trim() || null, notes: notes.trim() || null,
      operationalStatus, availabilityRule, changeReason: controls ? reason.trim() : null, acknowledgeImpact: controls && acknowledge,
    };
    void mutation.submit(change);
  }
  return <ConfigurationPanel open={open} title={controls ? "Controles operativos" : "Configurar ubicación"} description={locationNamePath(editor.warehouse, editor.location)} {...mutation} canManage={canManage} canSubmit={canSubmit} triggerRef={triggerRef} onClose={onClose} onRefresh={onRefresh} onSubmit={submit}>
    <p className="text-xs text-slate-500">Código: <span className="font-mono">{editor.location.code}</span>. La identidad de la ubicación se conserva.</p>
    {!controls && <fieldset className="space-y-3">
      <div><div className="flex items-center gap-1"><label htmlFor="warehouse-location-use" className="text-xs font-medium text-slate-700">Uso del área</label><AdministrationHelp title="Asignación del uso"><p>Seleccione un uso creado en Configuración. La asignación solo corresponde a esta ubicación; las ubicaciones interiores se asignan por separado.</p><p>Dejar «Sin uso asignado» conserva la ubicación y no asigna un destino automáticamente.</p></AdministrationHelp></div><select id="warehouse-location-use" disabled={fieldsDisabled} value={areaUseRef} onChange={(event) => setAreaUseRef(event.target.value)} className={`${COMPACT_FORM_FIELD} w-full`}><option value="">Sin uso asignado</option>{areaUseRef && !choices.some((use) => use.useRef === areaUseRef) && <option value={areaUseRef}>Uso del guardado anterior</option>}{choices.map((use) => <option key={use.useRef} value={use.useRef}>{use.name}{use.status === "INACTIVE" ? " · Inactivo" : ""}</option>)}</select>{areaUses.length === 0 && <p className="mt-1 text-xs text-slate-500">Cree los usos en Configuración para poder seleccionarlos aquí.</p>}</div>
      <div><div className="flex items-center gap-1"><label htmlFor="warehouse-location-characteristics" className="text-xs font-medium text-slate-700">{routesEnabled ? "Capacidad / características" : "Características"}</label><AdministrationHelp title={routesEnabled ? "Capacidad y características de la ubicación" : "Características de la ubicación"}><p>{routesEnabled ? "Describa el tamaño y las condiciones físicas, por ejemplo «6 m³, área techada, acceso por rampa»." : "Describa condiciones físicas, por ejemplo «Área techada, acceso por rampa»."}</p><p>Este texto es informativo. Escribir dimensiones o capacidades no calcula espacio libre ni modifica los controles operativos.</p></AdministrationHelp></div><input id="warehouse-location-characteristics" disabled={fieldsDisabled} maxLength={180} value={characteristics} onChange={(event) => setCharacteristics(event.target.value)} className={`${COMPACT_FORM_FIELD} w-full`} placeholder={routesEnabled ? "Ej.: 6 m³, área techada, acceso por rampa" : "Ej.: Área techada, acceso por rampa"} /></div>
      <label className="block text-xs font-medium text-slate-700">Notas<textarea disabled={fieldsDisabled} rows={3} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} className={`${WAREHOUSE_TEXTAREA} mt-1`} placeholder="Indicaciones para identificar o utilizar este lugar" /></label>
    </fieldset>}
    {controls && <fieldset className="space-y-3">
      <div><div className="flex items-center gap-1"><label htmlFor="warehouse-operational-status" className="text-xs font-medium text-slate-700">Estado operativo propio</label><AdministrationHelp title="Estado operativo"><p>Activo permite operaciones físicas cuando los controles superiores también lo permiten.</p><p>Restringido y Fuera de servicio impiden nuevas operaciones físicas en esta ubicación y sus ubicaciones interiores.</p><p>Ejemplo: si restringe una zona, sus estantes también quedan restringidos. Reactivar un estante no elimina la restricción de la zona.</p></AdministrationHelp></div><select id="warehouse-operational-status" disabled={fieldsDisabled} value={operationalStatus} onChange={(event) => { setOperationalStatus(event.target.value as WarehouseOperationalStatus); setAcknowledge(false); }} className={`${COMPACT_FORM_FIELD} w-full`}>{Object.entries(OPERATIONAL_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><p className="mt-1 text-xs leading-5 text-slate-500">{operationalStatus === "ACTIVE" ? "Permite operaciones si las ubicaciones superiores y los demás controles lo permiten." : "Impide nuevas operaciones físicas aquí y en sus ubicaciones interiores."}</p></div>
      <div><div className="flex items-center gap-1"><label htmlFor="warehouse-availability-rule" className="text-xs font-medium text-slate-700">Regla de disponibilidad</label><AdministrationHelp title="Disponibilidad para despachos"><p>Según condición operativa: los despachos siguen el estado de la ubicación y los controles superiores.</p><p>Despachos bloqueados: impide despachos desde esta ubicación y las interiores. Las recepciones siguen permitidas si el estado operativo está activo.</p><p>Quitar este bloqueo no elimina una restricción heredada de una ubicación superior.</p></AdministrationHelp></div><select id="warehouse-availability-rule" disabled={fieldsDisabled} value={availabilityRule} onChange={(event) => { setAvailabilityRule(event.target.value as WarehouseAvailabilityRule); setAcknowledge(false); }} className={`${COMPACT_FORM_FIELD} w-full`}>{Object.entries(AVAILABILITY_RULE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><p className="mt-1 text-xs leading-5 text-slate-500">{availabilityRule === "BLOCKED" ? "Bloquea despachos; las recepciones dependen del estado operativo." : "Los despachos dependen del estado operativo y de los controles superiores."}</p></div>
      {(controlsChanged || mutation.uncertain) && <div className="space-y-2 border-t border-slate-200 pt-3"><label className="block text-xs font-medium text-slate-700">Motivo del cambio<textarea disabled={fieldsDisabled} required rows={2} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} className={`${WAREHOUSE_TEXTAREA} mt-1`} placeholder="Explique por qué cambia el estado o la regla" /></label><label className="flex items-start gap-2 text-xs leading-5 text-slate-700"><input disabled={fieldsDisabled} type="checkbox" checked={acknowledge} onChange={(event) => setAcknowledge(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300" />Confirmo el alcance sobre esta ubicación y sus ubicaciones interiores. Las reservas y préstamos pendientes deben resolverse antes de cambiar estos controles.</label></div>}
    </fieldset>}
    {controls && config.lastControlReason && <p className="text-xs leading-5 text-slate-500">Último motivo registrado: {config.lastControlReason}</p>}
    <LocationOperationalSummary configuration={config} warehouses={warehouses} />
    {controls && <p className="text-xs leading-5 text-slate-500">Se revisarán los compromisos pendientes al guardar. El estado guardado conserva sus efectos hasta que se confirme el cambio.</p>}
  </ConfigurationPanel>;
}
