import { useMemo, useRef, useState } from "react";
import { Check, Pencil, Plus, RefreshCw, Search, Settings } from "lucide-react";
import { AdministrationHelp, AdministrationIconAction } from "@/administration/AdministrationHelp";
import { COMPACT_FORM_FIELD } from "@/components/ui/compact-form";
import { getMembershipRef } from "@/lib/sessionStore";
import { isMaterialsUiEnabled } from "@/materials-inventory/mode";
import { WarehouseApi, isWarehouseAreaUseChange, type WarehouseAreaUseChange } from "./api";
import { isWarehouseConfigurationUiEnabled } from "./configurationMode";
import { AREA_PURPOSE_LABELS, type WarehouseAreaPurpose, type WarehouseAreaUse } from "./configurationTypes";
import { pendingWarehouseRoute, WAREHOUSE_BUTTON, WAREHOUSE_PRIMARY_BUTTON, WAREHOUSE_TEXTAREA } from "./configurationUi";
import { ConfigurationDialog } from "./ConfigurationDialog";
import { getPendingWarehouseDraft, type PendingWarehouseDraft } from "./pendingDraft";
import { useWarehouseConfiguration } from "./useWarehouseConfiguration";
import { useWarehouseMutation } from "./useWarehouseMutation";

type Props = Readonly<{
  authorization?: string; effectivePermissions: readonly string[]; deniedPermissions: readonly string[];
  onNavigate(pathname: string): void; onUnauthorized(): void;
}>;
type UseEditor = Readonly<{ id: string; row?: WarehouseAreaUse; recovery?: PendingWarehouseDraft<WarehouseAreaUseChange> }>;

function recoveredUseEditor(draft: PendingWarehouseDraft | null): UseEditor | null {
  return draft && isWarehouseAreaUseChange(draft.change) ? { id: draft.requestId, recovery: { requestId: draft.requestId, change: draft.change } } : null;
}

export default function WarehouseConfiguration(props: Props) {
  const can = (permission: string) => props.effectivePermissions.includes(permission) && !props.deniedPermissions.includes(permission);
  if (!isMaterialsUiEnabled() || !isWarehouseConfigurationUiEnabled() || !can("inventory:stock:view")) return <p role="alert" className="py-6 text-sm">La configuración de almacenes no está disponible para esta sesión.</p>;
  const membershipRef = getMembershipRef();
  const scope = JSON.stringify([props.authorization, membershipRef, [...props.effectivePermissions].sort(), [...props.deniedPermissions].sort()]);
  return <ConfigurationContent key={scope} {...props} membershipRef={membershipRef} canManage={Boolean(membershipRef) && can("inventory:catalog:manage")} />;
}

function ConfigurationContent({ authorization, membershipRef, canManage, onNavigate, onUnauthorized }: Props & { membershipRef: string | null; canManage: boolean }) {
  const api = useMemo(() => new WarehouseApi(authorization), [authorization]);
  const [revision, setRevision] = useState(0);
  const result = useWarehouseConfiguration(api, true, revision, onUnauthorized);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(() => membershipRef ? getPendingWarehouseDraft(membershipRef) : null);
  const [editor, setEditor] = useState<UseEditor | null>(() => recoveredUseEditor(pending));
  const [editorOpen, setEditorOpen] = useState(Boolean(editor) && canManage);
  const [notice, setNotice] = useState("");
  const triggerRef = useRef<HTMLElement | null>(null);
  const refresh = () => setRevision((current) => current + 1);
  const rows = (result.data?.areaUses ?? []).filter((row) => (!status || row.status === status) && `${row.code} ${row.name} ${row.description ?? ""}`.toLocaleLowerCase("es").includes(search.trim().toLocaleLowerCase("es")));
  const openEditor = (row?: WarehouseAreaUse) => {
    if (pending || !canManage) return;
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setNotice(""); setEditor({ id: crypto.randomUUID(), row }); setEditorOpen(true);
  };
  const closeEditor = (retain: boolean) => { setEditorOpen(false); if (!retain) setEditor(null); };
  const recoveredChange = editor?.recovery?.change;
  const editorRow = editor?.row ?? (recoveredChange?.operation === "WAREHOUSE_AREA_USE_UPDATE" ? result.data?.areaUses.find((row) => row.useRef === recoveredChange.useRef) : undefined);

  return <section data-testid="warehouse-configuration" aria-labelledby="warehouse-configuration-heading">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2"><Settings className="h-5 w-5 text-[#003366]" aria-hidden="true" /><h2 id="warehouse-configuration-heading" className="text-lg font-bold text-[#003366]">Configuración</h2>{!canManage && <span className="text-xs text-slate-500">Consulta</span>}</div>
      <div className="flex items-center gap-1.5"><AdministrationHelp title="Usos de áreas"><p>El uso describe para qué se destina una ubicación. Créelo aquí y asígnelo explícitamente desde Espacios y ubicaciones.</p><p>Ejemplo: puede registrar un uso llamado «Material de embalaje» y asignarlo a una zona. Crear el uso no crea ubicaciones ni asigna mercancías.</p><p>Uso interno, almacenamiento de clientes y uso mixto orientan la organización. No establecen propiedad, custodia ni capacidad disponible.</p><p>Los códigos son automáticos y se conservan al cambiar el nombre.</p></AdministrationHelp><AdministrationIconAction label="Actualizar configuración" disabled={result.loading || Boolean(pending)} onClick={refresh}><RefreshCw className={`h-4 w-4 ${result.loading ? "animate-spin" : ""}`} aria-hidden="true" /></AdministrationIconAction>{canManage && <button type="button" onClick={() => openEditor()} disabled={result.loading || Boolean(result.error) || Boolean(pending)} className={WAREHOUSE_PRIMARY_BUTTON}><Plus className="h-4 w-4" aria-hidden="true" />Nuevo uso</button>}</div>
    </div>
    <h3 className="mb-1 text-sm font-semibold text-slate-800">Usos de áreas</h3>
    <p className="mb-3 text-xs leading-5 text-slate-500">Defina los usos y asígnelos a cada ubicación desde Espacios y ubicaciones.</p>
    <div className="mb-3 grid grid-cols-[minmax(0,1fr)_140px] gap-2"><label className="relative"><Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-slate-400 sm:top-1.5" aria-hidden="true" /><input type="search" aria-label="Buscar usos de áreas" placeholder="Nombre o código…" maxLength={160} value={search} onChange={(event) => setSearch(event.target.value)} className={`${COMPACT_FORM_FIELD} w-full pl-8`} /></label><select aria-label="Estado de usos" value={status} onChange={(event) => setStatus(event.target.value)} className={COMPACT_FORM_FIELD}><option value="">Todos los estados</option><option value="ACTIVE">Activos</option><option value="INACTIVE">Inactivos</option></select></div>
    {notice && <p role="status" className="mb-3 flex items-center gap-2 text-xs text-emerald-800"><Check className="h-4 w-4" aria-hidden="true" />{notice}</p>}
    {pending && !editorOpen && <div role="alert" className="mb-3 flex flex-wrap items-center gap-2 text-xs text-amber-900"><span>Hay un guardado sin confirmar. {canManage ? "Compruebe ese intento antes de iniciar otro cambio." : "Necesita permiso de gestión para comprobarlo."}</span>{canManage && (editor ? <button type="button" className={WAREHOUSE_BUTTON} onClick={() => setEditorOpen(true)}>Reabrir guardado</button> : <button type="button" className={WAREHOUSE_BUTTON} onClick={() => onNavigate(pendingWarehouseRoute(pending.change))}>Ir al guardado pendiente</button>)}</div>}
    <div className="overflow-hidden rounded border border-slate-200 bg-white"><div role="region" aria-label="Usos de áreas" tabIndex={0} className="overflow-x-auto"><table className="w-full min-w-[660px] border-collapse text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr>{["Código", "Nombre", "Destino orientativo", "Ubicaciones", "Estado", "Acciones"].map((heading) => <th key={heading} scope="col" className="px-3 py-2 font-semibold">{heading}</th>)}</tr></thead><tbody>
      {result.loading && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500"><span role="status">Cargando configuración…</span></td></tr>}
      {result.error && <tr><td colSpan={6} className="px-3 py-6 text-center"><p role="alert" className="mb-2 text-red-800">{result.error}</p><button type="button" onClick={refresh} className={WAREHOUSE_BUTTON}>Reintentar consulta</button></td></tr>}
      {!result.loading && !result.error && rows.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">{search || status ? "No hay usos que coincidan con estos filtros." : "Todavía no hay usos de áreas registrados."}</td></tr>}
      {!result.loading && !result.error && rows.map((row) => <tr key={row.useRef} className="border-t border-slate-100 hover:bg-slate-50" data-testid="warehouse-use-row"><td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-slate-600">{row.code}</td><td className="max-w-[360px] px-3 py-2"><div className="font-medium text-slate-800">{row.name}</div>{row.description && <p className="mt-0.5 break-words text-slate-500">{row.description}</p>}</td><td className="px-3 py-2 text-slate-600">{AREA_PURPOSE_LABELS[row.purpose]}</td><td className="w-24 px-3 py-2 tabular-nums text-slate-600">{row.assignedLocationCount}</td><td className="px-3 py-2"><span className={`rounded px-2 py-0.5 ${row.status === "ACTIVE" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{row.status === "ACTIVE" ? "Activo" : "Inactivo"}</span></td><td className="px-3 py-1.5">{canManage ? <AdministrationIconAction label={`Editar uso ${row.name}`} disabled={Boolean(pending)} onClick={() => openEditor(row)}><Pencil className="h-3.5 w-3.5" aria-hidden="true" /></AdministrationIconAction> : <span className="text-slate-400">—</span>}</td></tr>)}
    </tbody></table></div>{!result.loading && !result.error && <p className="border-t border-slate-200 px-3 py-2 text-xs text-slate-500">{result.data?.areaUses.length ?? 0} usos registrados</p>}</div>
    {editor && canManage && <AreaUseEditor key={editor.id} row={editorRow} recovery={editor.recovery} open={editorOpen} api={api} membershipRef={membershipRef} triggerRef={triggerRef} onClose={closeEditor} onPending={setPending} onUnauthorized={onUnauthorized} onRefresh={() => { closeEditor(false); refresh(); }} onSaved={() => { setEditor(null); setEditorOpen(false); setNotice("Uso guardado. Puede asignarlo desde Espacios y ubicaciones."); setSearch(""); setStatus(""); refresh(); }} />}
  </section>;
}

function AreaUseEditor({ row, recovery, open, api, membershipRef, triggerRef, onClose, onPending, onUnauthorized, onRefresh, onSaved }: {
  row?: WarehouseAreaUse; recovery?: PendingWarehouseDraft<WarehouseAreaUseChange>; open: boolean; api: WarehouseApi; membershipRef: string | null;
  triggerRef: React.RefObject<HTMLElement | null>; onClose(retain: boolean): void; onPending(draft: PendingWarehouseDraft | null): void; onUnauthorized(): void; onRefresh(): void; onSaved(): void;
}) {
  const recovered = recovery?.change;
  const creating = recovered ? recovered.operation === "WAREHOUSE_AREA_USE_CREATE" : !row;
  const [name, setName] = useState(recovered?.name ?? row?.name ?? "");
  const [description, setDescription] = useState((recovered ? recovered.description : row?.description) ?? "");
  const [purpose, setPurpose] = useState<WarehouseAreaPurpose | "">(recovered?.purpose ?? row?.purpose ?? "");
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE">(recovered?.operation === "WAREHOUSE_AREA_USE_UPDATE" ? recovered.status : row?.status ?? "ACTIVE");
  const mutation = useWarehouseMutation({ api, membershipRef, recovery, onPending, onSaved, onUnauthorized });
  function submit() {
    if (!name.trim() || !purpose) return;
    const common = { name: name.trim(), description: description.trim() || null, purpose };
    const identity = recovered?.operation === "WAREHOUSE_AREA_USE_UPDATE" ? { useRef: recovered.useRef, expectedVersion: recovered.expectedVersion } : row ? { useRef: row.useRef, expectedVersion: row.version } : null;
    if (!creating && !identity) return;
    const change: WarehouseAreaUseChange = mutation.uncertain && recovered ? recovered : creating ? { operation: "WAREHOUSE_AREA_USE_CREATE", ...common } : { operation: "WAREHOUSE_AREA_USE_UPDATE", ...identity!, ...common, status };
    void mutation.submit(change);
  }
  return <ConfigurationDialog open={open} title={creating ? "Nuevo uso de área" : "Editar uso de área"} description="El uso describe el destino de una ubicación. La asignación se realiza explícitamente en su ficha." {...mutation} canManage canSubmit={Boolean(name.trim() && purpose)} triggerRef={triggerRef} onClose={onClose} onRefresh={onRefresh} onSubmit={submit}>
    <fieldset disabled={mutation.locked} className="space-y-3">
      <label className="block text-xs font-medium text-slate-700">Nombre del uso<input autoFocus required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} className={`${COMPACT_FORM_FIELD} mt-1 w-full`} placeholder="Ej.: Material de embalaje" /></label>
      <div><div className="flex items-center gap-1"><label htmlFor="warehouse-use-purpose" className="text-xs font-medium text-slate-700">Destino orientativo</label><AdministrationHelp title="Destino del uso"><p>Elija uso interno, almacenamiento de clientes o uso mixto según la organización del área.</p><p>Este dato es descriptivo. No asigna propietarios ni crea registros de custodia de clientes.</p></AdministrationHelp></div><select id="warehouse-use-purpose" required value={purpose} onChange={(event) => setPurpose(event.target.value as WarehouseAreaPurpose)} className={`${COMPACT_FORM_FIELD} w-full`}><option value="">Seleccione un destino</option>{Object.entries(AREA_PURPOSE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <label className="block text-xs font-medium text-slate-700">Descripción<textarea rows={2} maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} className={`${WAREHOUSE_TEXTAREA} mt-1`} /></label>
      {!creating && <label className="block text-xs font-medium text-slate-700">Estado del uso<select value={status} onChange={(event) => setStatus(event.target.value as "ACTIVE" | "INACTIVE")} className={`${COMPACT_FORM_FIELD} mt-1 w-full`}><option value="ACTIVE">Activo</option><option value="INACTIVE">Inactivo</option></select></label>}
    </fieldset>
    <p className="text-xs text-slate-500">{creating ? "Código automático al guardar." : <>Código: <span className="font-mono">{row?.code ?? "Registro del guardado anterior"}</span>. Se conserva al cambiar el nombre.</>}</p>
    {!creating && status === "INACTIVE" && <p className="text-xs leading-5 text-amber-900">No podrá elegir este uso para nuevas asignaciones. Las ubicaciones que ya lo utilizan conservan su asignación.</p>}
  </ConfigurationDialog>;
}
