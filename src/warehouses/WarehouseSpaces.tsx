import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, MapPin, Pencil, Plus, RefreshCw, Search, Settings, ShieldCheck, Warehouse } from "lucide-react";
import { AdministrationHelp, AdministrationIconAction } from "@/administration/AdministrationHelp";
import { COMPACT_FORM_FIELD } from "@/components/ui/compact-form";
import { getMembershipRef } from "@/lib/sessionStore";
import type { WarehouseLocationRow, WarehouseRow } from "@/materials-inventory/api";
import { WarehouseApi, WarehouseApiError, isWarehouseRejectionConfirmed, isWarehouseSpatialChange, warehouseErrorText, type WarehouseSpatialChange } from "./api";
import { isWarehouseConfigurationUiEnabled } from "./configurationMode";
import { OPERATIONAL_STATUS_LABELS, type WarehouseLocationConfiguration } from "./configurationTypes";
import { findConfiguredLocation, locationConfigurationOrDefault, pendingWarehouseRoute } from "./configurationUi";
import type { LocationConfigurationEditorState } from "./LocationConfigurationEditor";
import { canAddInside, LOCATION_KIND_LABELS, locationNamePath, spaceTreeRows, type SpaceTreeRow } from "./locationTree";
import { clearPendingWarehouseDraft, getPendingWarehouseDraft, setPendingWarehouseDraft, type PendingWarehouseDraft } from "./pendingDraft";
import { useWarehouseConfiguration } from "./useWarehouseConfiguration";
import { ConfigurationPanel } from "./ConfigurationPanel";
import { isWarehouseSheetUiEnabled } from "./sheetMode";
import type { WarehouseSheet, WarehouseSheetChange } from "./sheetTypes";
import { clearWorkingWarehouseSheet, getWorkingWarehouseSheet } from "./workingSheet";
import { SHEET_KINDS, sheetParentKinds, existingParentKey } from "./sheetDraft";
import { canPlaceWarehouseAddressKind } from "../../shared/warehouseSheetAddress.js";

const LocationConfigurationEditor = lazy(() => import("./LocationConfigurationEditor"));
const WarehouseSheetEditor = lazy(() => import("./WarehouseSheetEditor"));

type Props = Readonly<{
  authorization?: string;
  effectivePermissions: readonly string[];
  deniedPermissions: readonly string[];
  onNavigate?(pathname: string): void;
  onUnauthorized(): void;
}>;
type Editor = Readonly<{ id: string; kind: "warehouse-create" | "location-create" | "warehouse-rename" | "location-rename"; warehouse?: WarehouseRow; location?: WarehouseLocationRow; recovery?: PendingWarehouseDraft<WarehouseSpatialChange> }>;
type SheetEditor = Readonly<{ id: string; warehouseRef: string | null; recovery?: PendingWarehouseDraft<WarehouseSheetChange>; working?: WarehouseSheetChange; initialParentRef?: string; initialFocusRef?: string }>;
const buttonClass = "inline-flex min-h-9 items-center justify-center gap-1.5 rounded border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40";

function recoverEditor(draft: PendingWarehouseDraft<WarehouseSpatialChange>, warehouses: readonly WarehouseRow[]): Editor {
  const change = draft.change;
  if (change.operation === "WAREHOUSE_CREATE") return { id: draft.requestId, kind: "warehouse-create", recovery: draft };
  const warehouse = warehouses.find((row) => "warehouseRef" in change ? row.warehouseRef === change.warehouseRef : row.locations.some((location) => location.locationRef === change.locationRef))
    ?? { warehouseRef: "warehouseRef" in change ? change.warehouseRef : "", code: "—", name: "Guardado anterior", status: "", version: "expectedVersion" in change ? change.expectedVersion : 1, locations: [] };
  if (change.operation === "WAREHOUSE_UPDATE") return { id: draft.requestId, kind: "warehouse-rename", warehouse, recovery: draft };
  const ref = change.operation === "WAREHOUSE_LOCATION_CREATE" ? change.parentLocationRef : change.locationRef;
  const location = warehouse.locations.find((row) => row.locationRef === ref)
    ?? { locationRef: ref, parentLocationRef: null, code: "—", name: "Ubicación del guardado anterior", kind: "OTHER", depth: 0, path: "", status: "", version: "expectedVersion" in change ? change.expectedVersion : 1 };
  return { id: draft.requestId, kind: change.operation === "WAREHOUSE_LOCATION_CREATE" ? "location-create" : "location-rename", warehouse, location, recovery: draft };
}

function recoverSpatialEditor(draft: PendingWarehouseDraft | null): Editor | null {
  return draft && isWarehouseSpatialChange(draft.change) ? recoverEditor({ requestId: draft.requestId, change: draft.change }, []) : null;
}

function recoverConfigurationEditor(draft: PendingWarehouseDraft | null, warehouses: readonly WarehouseRow[], configurations: readonly WarehouseLocationConfiguration[]): LocationConfigurationEditorState | null {
  if (draft?.change.operation !== "WAREHOUSE_LOCATION_CONFIGURATION_UPDATE") return null;
  const change = draft.change;
  const location = findConfiguredLocation(warehouses, change.locationRef) ?? {
    warehouse: { warehouseRef: "", code: "—", name: "Guardado anterior", status: "", version: 1, locations: [] },
    location: { locationRef: change.locationRef, parentLocationRef: null, code: "—", name: "Ubicación del guardado anterior", kind: "OTHER", depth: 0, path: "", status: "", version: 1 },
  };
  return { id: draft.requestId, kind: change.acknowledgeImpact || change.changeReason !== null ? "controls" : "details", ...location, configuration: locationConfigurationOrDefault(location.warehouse, location.location, configurations), recovery: { requestId: draft.requestId, change } };
}

export default function WarehouseSpaces(props: Props) {
  const can = (permission: string) => props.effectivePermissions.includes(permission) && !props.deniedPermissions.includes(permission);
  if (!can("inventory:stock:view")) return <p role="alert" className="py-6 text-sm">No tiene permiso para consultar las ubicaciones.</p>;
  const membershipRef = getMembershipRef();
  const scope = JSON.stringify([props.authorization, membershipRef, [...props.effectivePermissions].sort(), [...props.deniedPermissions].sort()]);
  return <SpacesContent key={scope} {...props} membershipRef={membershipRef} canManage={Boolean(membershipRef) && can("inventory:catalog:manage")} />;
}

function SpacesContent({ authorization, canManage, membershipRef, onNavigate, onUnauthorized }: Props & { canManage: boolean; membershipRef: string | null }) {
  const api = useMemo(() => new WarehouseApi(authorization), [authorization]);
  const [revision, setRevision] = useState(0);
  const [usesRevision, setUsesRevision] = useState(0);
  const configurationEnabled = isWarehouseConfigurationUiEnabled();
  const sheetEnabled = isWarehouseSheetUiEnabled();
  const configurationResult = useWarehouseConfiguration(api, configurationEnabled, revision + usesRevision, onUnauthorized);
  const [result, setResult] = useState<{ revision: number; rows: readonly WarehouseRow[]; error: string | null } | null>(null);
  const [search, setSearch] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("");
  const [status, setStatus] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [pendingDraft, setPendingDraft] = useState(() => membershipRef ? getPendingWarehouseDraft(membershipRef) : null);
  const [workingDraft, setWorkingDraft] = useState(() => sheetEnabled && membershipRef ? getWorkingWarehouseSheet(membershipRef) : null);
  const [sheetEditor, setSheetEditor] = useState<SheetEditor | null>(() => {
    if (!sheetEnabled || !canManage) return null;
    if (pendingDraft?.change.operation === "WAREHOUSE_SHEET_SAVE") return { id: pendingDraft.requestId, warehouseRef: pendingDraft.change.warehouseRef, recovery: { requestId: pendingDraft.requestId, change: pendingDraft.change } };
    return !pendingDraft && workingDraft ? { id: crypto.randomUUID(), warehouseRef: workingDraft.warehouseRef, working: workingDraft } : null;
  });
  const [editor, setEditor] = useState<Editor | null>(() => recoverSpatialEditor(pendingDraft));
  const [configurationEditor, setConfigurationEditor] = useState<LocationConfigurationEditorState | null>(() => configurationEnabled ? recoverConfigurationEditor(pendingDraft, [], []) : null);
  const [editorOpen, setEditorOpen] = useState(Boolean(editor || configurationEditor) && canManage);
  const [pendingWrite, setPendingWrite] = useState(Boolean(pendingDraft));
  const [notice, setNotice] = useState("");
  const triggerRef = useRef<HTMLElement | null>(null);
  const callbacks = useRef({ onUnauthorized });
  useEffect(() => { callbacks.current = { onUnauthorized }; }, [onUnauthorized]);
  useEffect(() => {
    const controller = new AbortController();
    void (sheetEnabled ? api.sheets(controller.signal) : api.list(controller.signal)).then((rows) => {
      if (!controller.signal.aborted) {
        setResult({ revision, rows, error: null });
        setEditor((current) => current?.recovery ? recoverEditor(current.recovery, rows) : current);
      }
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (error instanceof WarehouseApiError && error.status === 401) callbacks.current.onUnauthorized();
      else setResult({ revision, rows: [], error: warehouseErrorText(error) });
    });
    return () => controller.abort();
  }, [api, revision, sheetEnabled]);

  const loading = result?.revision !== revision;
  const warehouses = !loading && result && !result.error ? result.rows : [];
  const error = !loading ? result?.error : null;
  const filteredWarehouses = warehouses.filter((warehouse) => !warehouseFilter || warehouse.warehouseRef === warehouseFilter);
  const configurations = configurationResult.data?.locations ?? [];
  const resolvedConfigurationEditor = configurationEditor?.recovery ? recoverConfigurationEditor(configurationEditor.recovery, warehouses, configurations) : configurationEditor;
  const rows = spaceTreeRows(filteredWarehouses, search, status, collapsed);
  const filtering = Boolean(search.trim() || status);
  const refresh = () => { setRevision((current) => current + 1); };
  const openSheet = (warehouse?: WarehouseRow, options: Pick<SheetEditor, "initialParentRef" | "initialFocusRef"> = {}) => {
    if (!sheetEnabled || !canManage || pendingWrite) return;
    setNotice(""); setEditor(null); setConfigurationEditor(null); setEditorOpen(false);
    setSheetEditor({ id: crypto.randomUUID(), warehouseRef: warehouse?.warehouseRef ?? null, ...options });
  };
  const openEditor = (value: Omit<Editor, "id">) => {
    if (pendingWrite) return;
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setNotice(""); setConfigurationEditor(null); setEditor({ ...value, id: crypto.randomUUID() }); setEditorOpen(true);
  };
  const closeEditor = (retain: boolean) => { setEditorOpen(false); if (!retain) { setEditor(null); setConfigurationEditor(null); } };
  const openConfigurationEditor = (row: SpaceTreeRow, kind: "details" | "controls") => {
    if (pendingWrite || !configurationEnabled || !row.location) return;
    const configuration = configurations.find((item) => item.locationRef === row.location!.locationRef);
    if (!configuration) return;
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setNotice(""); setEditor(null); setConfigurationEditor({ id: crypto.randomUUID(), kind, warehouse: row.warehouse, location: row.location, configuration }); setEditorOpen(true);
  };
  const toggle = (key: string) => setCollapsed((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const addLocation = (row: SpaceTreeRow) => {
    if (!row.location) return;
    if (sheetEnabled) openSheet(row.warehouse, { initialParentRef: row.location.locationRef });
    else openEditor({ kind: "location-create", warehouse: row.warehouse, location: row.location });
  };

  if (sheetEnabled && sheetEditor && canManage && membershipRef) {
    const sheet = warehouses.find((warehouse) => warehouse.warehouseRef === sheetEditor.warehouseRef) as WarehouseSheet | undefined;
    if (loading) return <p role="status" className="py-6 text-xs text-slate-500">Cargando hoja de almacén…</p>;
    if (sheetEditor.warehouseRef && !sheet && !sheetEditor.recovery) return <section className="mt-5 space-y-3"><p role="alert" className="text-xs text-red-800">{error ?? "El almacén del borrador ya no está disponible. Actualice el listado antes de continuar."}</p><div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} onClick={refresh}>Reintentar consulta</button><button type="button" className={buttonClass} onClick={() => { clearWorkingWarehouseSheet(membershipRef); setWorkingDraft(null); setSheetEditor(null); }}>Descartar borrador</button></div></section>;
    return <div className="mt-5 min-w-0"><Suspense fallback={<p role="status" className="py-3 text-xs text-slate-500">Preparando hoja de almacén…</p>}><WarehouseSheetEditor key={sheetEditor.id} api={api} membershipRef={membershipRef} sheet={sheet} recovery={sheetEditor.recovery} working={sheetEditor.working} initialParentRef={sheetEditor.initialParentRef} initialFocusRef={sheetEditor.initialFocusRef} uses={configurationResult.data?.areaUses ?? []} usesReady={Boolean(configurationResult.data) && !configurationResult.loading} usesError={configurationResult.error} onPending={(draft) => { setPendingDraft(draft); setPendingWrite(Boolean(draft)); }} onUnauthorized={onUnauthorized} onNavigate={(path) => onNavigate?.(path)} onReturn={(change) => { setSheetEditor(null); setWorkingDraft(change ?? getWorkingWarehouseSheet(membershipRef)); }} onRefresh={refresh} onRetryUses={() => setUsesRevision((value) => value + 1)} onSaved={(saved) => { setSheetEditor(null); setWorkingDraft(null); setPendingDraft(null); setPendingWrite(false); setWarehouseFilter(""); setSearch(""); setStatus(""); setCollapsed(new Set()); setNotice(`Guardado: ${saved.warehouse.name} · ${saved.warehouse.warehouseLabel ?? saved.warehouse.code}`); refresh(); }} /></Suspense></div>;
  }

  const reopenPending = () => {
    if (pendingDraft?.change.operation === "WAREHOUSE_SHEET_SAVE" && sheetEnabled) setSheetEditor({ id: pendingDraft.requestId, warehouseRef: pendingDraft.change.warehouseRef, recovery: { requestId: pendingDraft.requestId, change: pendingDraft.change } });
    else setEditorOpen(true);
  };
  const pendingSheet = pendingDraft?.change.operation === "WAREHOUSE_SHEET_SAVE";
  const canReopenPending = Boolean(editor || configurationEditor || pendingSheet && sheetEnabled);

  return <section className="mt-5 min-w-0" data-testid="warehouse-spaces" aria-labelledby="warehouse-spaces-heading">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2"><Warehouse aria-hidden="true" className="h-5 w-5 text-[#003366]" /><h2 id="warehouse-spaces-heading" className="text-lg font-bold text-[#003366]">Espacios y ubicaciones</h2>{!canManage && <span className="text-xs text-slate-500">Consulta</span>}</div>
      <div className="flex items-center gap-1.5">
        <AdministrationHelp title="Espacios y ubicaciones">
          <p>Registre un almacén principal y agregue las ubicaciones que existan físicamente dentro de él.</p>
          <p>{sheetEnabled ? "Abra la hoja del almacén para organizar zonas, pasillos, estanterías, niveles y posiciones. Puede agregar filas individualmente o generarlas por cantidades." : "Ejemplo: Almacén central → Zona de embalaje → Estante A → Posición superior. Puede omitir los niveles que no utilice; cada alta crea una sola ubicación."}</p>
          <p>El código se asigna al guardar. Cambiar el nombre conserva el código y la identidad del lugar.</p>
          <p>{configurationEnabled ? "El estado operativo controla las operaciones físicas. La regla de disponibilidad puede bloquear los despachos; los controles de ubicaciones superiores también se aplican." : "Activo describe el estado del registro."} La capacidad y el espacio ocupado se incorporarán cuando se definan sus medidas y los bienes almacenados.</p>
        </AdministrationHelp>
        <AdministrationIconAction label="Actualizar almacenes" disabled={loading || pendingWrite} onClick={refresh}><RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></AdministrationIconAction>
        {canManage && <button type="button" disabled={loading || Boolean(error) || pendingWrite || Boolean(workingDraft)} onClick={() => sheetEnabled ? openSheet() : openEditor({ kind: "warehouse-create" })} className={`${buttonClass} border-[#003366] bg-[#003366] text-white hover:bg-[#00264d]`}><Plus aria-hidden="true" className="h-4 w-4" />Nuevo almacén</button>}
      </div>
    </div>
    <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-[minmax(180px,1fr)_minmax(160px,220px)_160px]">
      <label className="relative col-span-2 sm:col-span-1"><Search aria-hidden="true" className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-slate-400 sm:top-1.5" /><input type="search" aria-label="Buscar almacenes y ubicaciones" placeholder="Nombre o código…" maxLength={160} value={search} onChange={(event) => setSearch(event.target.value)} className={`${COMPACT_FORM_FIELD} w-full pl-8`} /></label>
      <select aria-label="Filtrar por almacén" value={warehouseFilter} onChange={(event) => setWarehouseFilter(event.target.value)} disabled={loading} className={COMPACT_FORM_FIELD}><option value="">Todos los almacenes</option>{warehouses.map((warehouse) => <option key={warehouse.warehouseRef} value={warehouse.warehouseRef}>{warehouse.name}</option>)}</select>
      <select aria-label={configurationEnabled ? "Estado del registro" : "Estado de ubicaciones"} value={status} onChange={(event) => setStatus(event.target.value)} className={COMPACT_FORM_FIELD}><option value="">{configurationEnabled ? "Todos los registros" : "Todos los estados"}</option><option value="ACTIVE">{configurationEnabled ? "Registros activos" : "Activos"}</option><option value="INACTIVE">{configurationEnabled ? "Registros inactivos" : "Inactivos"}</option></select>
    </div>
    {notice && <p role="status" className="mb-3 flex items-center gap-2 text-xs text-emerald-800"><Check aria-hidden="true" className="h-4 w-4" />{notice}</p>}
    {pendingWrite && !editorOpen && <div role="alert" className="mb-3 flex flex-wrap items-center gap-2 text-xs text-amber-900"><span>Hay un guardado sin confirmar. {canManage ? canReopenPending ? "Reabra el formulario para comprobar el mismo intento." : pendingSheet ? "La hoja de almacenes debe estar habilitada para comprobar ese intento." : configurationEnabled ? "Compruebe ese intento en Configuración antes de iniciar otro cambio." : "La configuración debe estar habilitada para comprobar ese intento." : "Necesita permiso de gestión para comprobarlo."}</span>{canManage && (canReopenPending ? <button type="button" onClick={reopenPending} className={buttonClass}>Reabrir guardado</button> : !pendingSheet && configurationEnabled && pendingDraft && onNavigate ? <button type="button" onClick={() => onNavigate(pendingWarehouseRoute(pendingDraft.change))} className={buttonClass}>Ir al guardado pendiente</button> : null)}</div>}
    {sheetEnabled && workingDraft && !pendingWrite && canManage && <div role="status" className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-700"><span>Hay una hoja sin guardar.</span><button type="button" disabled={loading || Boolean(error)} className={buttonClass} onClick={() => setSheetEditor({ id: crypto.randomUUID(), warehouseRef: workingDraft.warehouseRef, working: workingDraft })}>Continuar borrador</button><button type="button" className={buttonClass} onClick={() => { if (membershipRef) clearWorkingWarehouseSheet(membershipRef); setWorkingDraft(null); }}>Descartar borrador</button></div>}
    {configurationResult.error && <div role="alert" className="mb-3 flex flex-wrap items-center gap-2 text-xs text-red-800"><span>No se pudieron consultar los usos y controles. {configurationResult.error}</span><button type="button" disabled={pendingWrite} onClick={refresh} className={buttonClass}>Actualizar configuración</button></div>}
    <div className="overflow-hidden rounded border border-slate-200 bg-white">
      <div tabIndex={0} role="region" aria-label="Árbol de almacenes y ubicaciones" className="overflow-x-auto">
        <table className="w-full min-w-[650px] border-collapse text-left text-xs">
          <thead className="bg-slate-50 text-slate-500"><tr><th scope="col" className="px-3 py-2 font-semibold">Ubicación</th><th scope="col" className="px-3 py-2 font-semibold">Código</th><th scope="col" className="px-3 py-2 font-semibold">Tipo</th>{configurationEnabled && <th scope="col" className="px-3 py-2 font-semibold">Uso</th>}<th scope="col" className="px-3 py-2 font-semibold">{configurationEnabled ? "Operación / despachos" : "Estado"}</th><th scope="col" className="w-24 px-3 py-2 text-center font-semibold">Acciones</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={configurationEnabled ? 6 : 5} className="px-3 py-8 text-center text-slate-500"><span role="status">Cargando almacenes…</span></td></tr>}
            {error && <tr><td colSpan={configurationEnabled ? 6 : 5} className="px-3 py-6 text-center"><p role="alert" className="mb-2 text-red-800">{error}</p><button type="button" onClick={refresh} className={buttonClass}>Reintentar consulta</button></td></tr>}
            {!loading && !error && rows.length === 0 && <tr><td colSpan={configurationEnabled ? 6 : 5} className="px-3 py-8 text-center text-slate-500">{search || warehouseFilter || status ? "No hay ubicaciones que coincidan con estos filtros." : "Todavía no hay almacenes registrados."}</td></tr>}
            {!loading && !error && rows.map((row) => {
              const name = row.isWarehouse ? row.warehouse.name : row.location!.name;
              const active = (row.isWarehouse ? row.warehouse.status : row.location!.status) === "ACTIVE";
              const sheet = sheetEnabled ? row.warehouse as WarehouseSheet : undefined;
              const sheetLocation = sheet?.locations.find((location) => location.locationRef === row.location?.locationRef);
              const code = row.isWarehouse ? sheet?.warehouseLabel ?? row.warehouse.code : sheetLocation?.address?.label ?? row.location!.code;
              const parentKinds = sheetEnabled && row.location ? sheetParentKinds(row.isWarehouse ? "" : existingParentKey(row.location.locationRef), [], sheet) : null;
              const canAddSheetChild = !sheetEnabled || Boolean(parentKinds && SHEET_KINDS.some((kind) => canPlaceWarehouseAddressKind(kind, parentKinds)));
              const configuration = configurations.find((item) => item.locationRef === row.location?.locationRef);
              const areaUse = configurationResult.data?.areaUses.find((use) => use.useRef === configuration?.areaUseRef);
              return <tr key={row.key} data-testid="warehouse-space-row" className={`border-t border-slate-100 ${row.isWarehouse ? "bg-slate-50/70" : "hover:bg-slate-50"}`}>
                <td className={`max-w-[420px] py-1.5 pr-3 ${row.matches ? "text-slate-900" : "text-slate-500"}`} style={{ paddingLeft: `${12 + Math.min(row.indent, 5) * 18}px` }}>
                  <div className="flex items-center gap-1">
                    {row.hasChildren ? <button type="button" aria-label={`${!filtering && collapsed.has(row.key) ? "Expandir" : "Contraer"} ${name}`} aria-expanded={filtering || !collapsed.has(row.key)} disabled={filtering} onClick={() => toggle(row.key)} className="inline-flex h-8 w-7 shrink-0 items-center justify-center rounded hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:opacity-50">{!filtering && collapsed.has(row.key) ? <ChevronRight aria-hidden="true" className="h-4 w-4" /> : <ChevronDown aria-hidden="true" className="h-4 w-4" />}</button> : <span className="w-7 shrink-0" />}
                    {row.isWarehouse ? <Warehouse aria-hidden="true" className="h-4 w-4 shrink-0 text-[#003366]" /> : <MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                    <span title={row.location ? locationNamePath(row.warehouse, row.location) : name} className={`break-words ${row.isWarehouse ? "font-semibold" : ""}`}>{name}</span>
                  </div>
                  {row.isWarehouse && sheet?.manager && <p className="ml-12 mt-1 text-[11px] text-slate-500">Encargado: {sheet.manager.displayName}{!sheet.manager.eligible ? " · Asignación conservada" : ""}</p>}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[11px] text-slate-600">{code}</td>
                <td className="whitespace-nowrap px-3 py-1.5 text-slate-600">{row.isWarehouse ? "Almacén principal" : LOCATION_KIND_LABELS[row.location!.kind] ?? "Otra ubicación"}</td>
                {configurationEnabled && <td className="px-3 py-1.5 text-slate-600">{configuration ? areaUse?.name ?? (configuration.areaUseRef ? "Uso sin confirmar" : "Sin asignar") : "—"}</td>}
                <td className="px-3 py-1.5">{configurationEnabled ? configuration ? <div className="space-y-1 whitespace-nowrap"><span className={`inline-flex rounded px-2 py-0.5 ${configuration.effective.operationalStatus === "ACTIVE" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{OPERATIONAL_STATUS_LABELS[configuration.effective.operationalStatus]}</span><p className={`text-[11px] ${configuration.effective.canDispatch ? "text-slate-500" : "text-amber-900"}`}>{configuration.effective.canDispatch ? "Despachos permitidos" : "Despachos bloqueados"}{configuration.effective.inherited ? " · Heredado" : ""}</p>{!active && <p className="text-[11px] text-slate-500">Registro inactivo</p>}</div> : <span className="text-slate-400">{configurationResult.loading ? "Consultando…" : "Sin confirmar"}</span> : <span className={`inline-flex rounded px-2 py-0.5 ${active ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{active ? "Activo" : "Inactivo"}</span>}</td>
                <td className="px-2 py-1.5"><div className="flex justify-center gap-1">{canManage ? <>
                  <AdministrationIconAction label={sheetEnabled ? `Editar ${name}` : `Cambiar nombre de ${name}`} disabled={pendingWrite || Boolean(workingDraft)} onClick={() => sheetEnabled ? openSheet(row.warehouse, { initialFocusRef: row.isWarehouse ? undefined : row.location?.locationRef }) : openEditor({ kind: row.isWarehouse ? "warehouse-rename" : "location-rename", warehouse: row.warehouse, location: row.location ?? undefined })}><Pencil aria-hidden="true" className="h-3.5 w-3.5" /></AdministrationIconAction>
                  <AdministrationIconAction label={`Agregar ubicación en ${name}`} disabled={pendingWrite || Boolean(workingDraft) || !canAddSheetChild || !row.location || !canAddInside(row.warehouse, row.location)} onClick={() => addLocation(row)}><Plus aria-hidden="true" className="h-4 w-4" /></AdministrationIconAction>
                </> : !configurationEnabled && <span className="text-slate-400">—</span>}{configurationEnabled && <>
                  <AdministrationIconAction label={`${canManage ? "Configurar" : "Ver configuración de"} ${name}`} disabled={pendingWrite || !configuration} onClick={() => openConfigurationEditor(row, "details")}><Settings className="h-3.5 w-3.5" aria-hidden="true" /></AdministrationIconAction>
                  <AdministrationIconAction label={`Controles operativos de ${name}`} disabled={pendingWrite || !configuration} onClick={() => openConfigurationEditor(row, "controls")}><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /></AdministrationIconAction>
                </>}</div></td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      {!loading && !error && <p className="border-t border-slate-200 px-3 py-2 text-xs text-slate-500">{warehouses.length} {warehouses.length === 1 ? "almacén" : "almacenes"} · {warehouses.reduce((count, warehouse) => count + warehouse.locations.filter((location) => location.parentLocationRef !== null).length, 0)} ubicaciones interiores</p>}
    </div>
    {editor && canManage && <WarehouseEditor key={editor.id} editor={editor} open={editorOpen} api={api} triggerRef={triggerRef} onClose={closeEditor} onPendingChange={setPendingWrite} onRemember={(draft) => { setPendingDraft(draft); if (membershipRef) setPendingWarehouseDraft(membershipRef, draft); }} onResolved={() => { setPendingDraft(null); if (membershipRef) clearPendingWarehouseDraft(membershipRef); }} onUnauthorized={onUnauthorized} onSaved={(saved) => { setPendingWrite(false); setEditorOpen(false); setEditor(null); setWarehouseFilter(""); setSearch(""); setStatus(""); setCollapsed(new Set()); setNotice(`Guardado: ${saved.name} · ${saved.code}`); refresh(); }} onRefresh={() => { setPendingWrite(false); closeEditor(false); refresh(); }} />}
    {configurationEnabled && resolvedConfigurationEditor && <Suspense fallback={<p role="status" className="py-3 text-xs text-slate-500">Cargando ficha de ubicación…</p>}><LocationConfigurationEditor key={resolvedConfigurationEditor.id} editor={resolvedConfigurationEditor} open={editorOpen} api={api} membershipRef={membershipRef} canManage={canManage} areaUses={configurationResult.data?.areaUses ?? []} warehouses={warehouses} triggerRef={triggerRef} onClose={closeEditor} onPending={(draft) => { setPendingDraft(draft); setPendingWrite(Boolean(draft)); }} onSaved={() => { closeEditor(false); setNotice("Configuración de la ubicación guardada."); refresh(); }} onUnauthorized={onUnauthorized} onRefresh={() => { closeEditor(false); refresh(); }} /></Suspense>}
  </section>;
}

function WarehouseEditor({ editor, open, api, triggerRef, onClose, onPendingChange, onRemember, onResolved, onSaved, onUnauthorized, onRefresh }: {
  editor: Editor; open: boolean; api: WarehouseApi; triggerRef: React.RefObject<HTMLElement | null>;
  onClose(retain: boolean): void; onPendingChange(pending: boolean): void;
  onRemember(draft: PendingWarehouseDraft): void; onResolved(): void;
  onSaved(row: WarehouseRow | WarehouseLocationRow): void; onUnauthorized(): void; onRefresh(): void;
}) {
  const creatingWarehouse = editor.kind === "warehouse-create";
  const creatingLocation = editor.kind === "location-create";
  const creating = creatingWarehouse || creatingLocation;
  const recovered = editor.recovery?.change;
  const [name, setName] = useState(recovered?.name ?? (creating ? "" : editor.kind === "warehouse-rename" ? editor.warehouse!.name : editor.location!.name));
  const [parentRef, setParentRef] = useState(recovered?.operation === "WAREHOUSE_LOCATION_CREATE" ? recovered.parentLocationRef : editor.location?.locationRef ?? "");
  const [kind, setKind] = useState(recovered?.operation === "WAREHOUSE_LOCATION_CREATE" ? recovered.kind : "");
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(Boolean(recovered));
  const [error, setError] = useState<string | null>(recovered ? "Hay un guardado anterior sin confirmar. Reintente para comprobar el mismo registro." : null);
  const [conflict, setConflict] = useState(false);
  const pending = useRef(false);
  const attempt = useRef<{ key: string; requestId: string } | null>(editor.recovery ? { key: JSON.stringify(editor.recovery.change), requestId: editor.recovery.requestId } : null);
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => controllerRef.current?.abort(), []);
  const title = creatingWarehouse ? "Nuevo almacén" : creatingLocation ? "Nueva ubicación" : "Cambiar nombre";
  const availableParents = editor.warehouse?.locations.filter((location) => canAddInside(editor.warehouse!, location)) ?? [];

  async function submit() {
    if (pending.current || conflict) return;
    const cleanName = name.trim();
    if (!cleanName) { setError("Escriba el nombre del almacén o la ubicación."); return; }
    const change: WarehouseSpatialChange = uncertain && recovered ? recovered : (creatingWarehouse ? { operation: "WAREHOUSE_CREATE", name: cleanName }
      : creatingLocation ? { operation: "WAREHOUSE_LOCATION_CREATE", warehouseRef: editor.warehouse!.warehouseRef, parentLocationRef: parentRef, kind, name: cleanName }
      : editor.kind === "warehouse-rename" ? { operation: "WAREHOUSE_UPDATE", warehouseRef: editor.warehouse!.warehouseRef, expectedVersion: editor.warehouse!.version, name: cleanName }
      : { operation: "WAREHOUSE_LOCATION_UPDATE", locationRef: editor.location!.locationRef, expectedVersion: editor.location!.version, name: cleanName });
    const key = JSON.stringify(change);
    if (!attempt.current || attempt.current.key !== key) attempt.current = { key, requestId: crypto.randomUUID() };
    const controller = new AbortController(); controllerRef.current = controller;
    pending.current = true; setSaving(true); setError(null); onPendingChange(true);
    onRemember({ requestId: attempt.current.requestId, change });
    try {
      const saved = await api.save(change, attempt.current.requestId, controller.signal);
      if (controller.signal.aborted) return;
      setUncertain(false); onPendingChange(false); onResolved(); onSaved(saved);
    } catch (cause) {
      if (controller.signal.aborted) return;
      const unknownResult = !(cause instanceof WarehouseApiError) || cause.status >= 500;
      // A later permission/session/gate rejection occurs before receipt lookup;
      // it cannot resolve an earlier request whose response was lost.
      const unresolved = unknownResult || uncertain && !isWarehouseRejectionConfirmed(cause);
      setUncertain(unresolved); onPendingChange(unresolved);
      if (!unresolved) onResolved();
      if (cause instanceof WarehouseApiError && cause.status === 401) { onUnauthorized(); return; }
      setConflict(!unresolved && cause instanceof WarehouseApiError && ["MATERIALS_VERSION_CONFLICT", "MATERIALS_IDEMPOTENCY_CONFLICT", "MATERIALS_RESOURCE_NOT_FOUND"].includes(cause.code));
      setError(unknownResult ? "No se pudo confirmar el guardado. Reintente para comprobar el mismo registro; sus datos se conservaron." : `${warehouseErrorText(cause)}${unresolved ? " El guardado anterior sigue sin confirmar." : ""}`);
    } finally {
      pending.current = false;
      if (!controller.signal.aborted) setSaving(false);
    }
  }

  return <ConfigurationPanel open={open} title={title} description={creatingWarehouse ? "Registre el almacén principal y agregue después sus ubicaciones interiores." : creatingLocation ? "Se creará una ubicación dentro del lugar que seleccione." : "El código y la identidad del lugar se conservan."} saving={saving} uncertain={uncertain} conflict={conflict} error={error} canManage canSubmit={Boolean(name.trim()) && (!creatingLocation || Boolean(parentRef && kind))} saveLabel={creatingWarehouse ? "Guardar almacén" : creatingLocation ? "Guardar ubicación" : "Guardar nombre"} triggerRef={triggerRef} onClose={onClose} onRefresh={onRefresh} onSubmit={() => void submit()}>
        <fieldset disabled={saving || uncertain || conflict} className="space-y-3">
          <label className="block text-xs font-medium text-slate-700">{creatingWarehouse || editor.kind === "warehouse-rename" ? "Nombre del almacén" : "Nombre de la ubicación"}<input autoFocus required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} className={`${COMPACT_FORM_FIELD} mt-1 w-full`} placeholder={creatingWarehouse ? "Ej.: Almacén central" : creatingLocation ? "Ej.: Zona de embalaje" : undefined} /></label>
          {creatingLocation && <>
            <label className="block text-xs font-medium text-slate-700">Dentro de<select aria-label="Dentro de" required value={parentRef} onChange={(event) => setParentRef(event.target.value)} className={`${COMPACT_FORM_FIELD} mt-1 w-full`}>{uncertain && !availableParents.some((location) => location.locationRef === parentRef) && <option value={parentRef}>Ubicación del guardado anterior</option>}{availableParents.map((location) => <option key={location.locationRef} value={location.locationRef}>{locationNamePath(editor.warehouse!, location)} · {location.code}</option>)}</select></label>
            <div><div className="flex items-center gap-1"><label htmlFor="warehouse-location-kind" className="text-xs font-medium text-slate-700">Tipo de ubicación</label><AdministrationHelp title="Tipo de ubicación"><p>Elija la estructura física: una zona agrupa áreas; una estantería contiene niveles o posiciones.</p><p>Por ejemplo, si una estantería tiene dos posiciones, cree cada una cuando la registre. Elegir Estantería no genera niveles ni posiciones automáticamente.</p><p>Recepción, despacho y cuarentena identifican áreas de trabajo. El tipo no indica el propietario de los bienes ni el espacio disponible.</p></AdministrationHelp></div><select id="warehouse-location-kind" required value={kind} onChange={(event) => setKind(event.target.value)} className={`${COMPACT_FORM_FIELD} w-full`}><option value="">Seleccione el tipo</option>{Object.entries(LOCATION_KIND_LABELS).filter(([value]) => value !== "WAREHOUSE_ROOT").map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          </>}
        </fieldset>
        {creating ? <p className="text-xs text-slate-500">Código automático al guardar.</p> : <p className="text-xs text-slate-500">Código: <span className="font-mono">{editor.kind === "warehouse-rename" ? editor.warehouse!.code : editor.location!.code}</span></p>}
  </ConfigurationPanel>;
}
