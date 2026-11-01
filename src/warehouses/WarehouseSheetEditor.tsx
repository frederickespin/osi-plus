import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Copy, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { canPlaceWarehouseAddressKind } from "../../shared/warehouseSheetAddress.js";
import { AdministrationHelp, AdministrationIconAction } from "@/administration/AdministrationHelp";
import { COMPACT_FORM_FIELD } from "@/components/ui/compact-form";
import { NumericInput } from "@/components/ui/numeric-input";
import type { WarehouseAreaUse } from "./configurationTypes";
import { WAREHOUSE_BUTTON, WAREHOUSE_PRIMARY_BUTTON } from "./configurationUi";
import type { WarehouseApi } from "./api";
import { LOCATION_KIND_LABELS } from "./locationTree";
import type { PendingWarehouseDraft } from "./pendingDraft";
import { EMPTY_GENERATION, SHEET_KIND_LABELS, SHEET_KINDS, SHEET_ROW_LIMIT, existingParentKey, generateSheetRows, newParentKey, newSheetRow, provisionalSheetLabels, sheetDraftFrom, sheetGenerationSummary, sheetParentKinds, validateSheetDraft, warehouseSheetChange, type SheetDraftRow, type SheetGenerationCounts } from "./sheetDraft";
import type { WarehouseSheet, WarehouseSheetChange, WarehouseSheetKind, WarehouseSheetSaved } from "./sheetTypes";
import { useWarehouseMutation } from "./useWarehouseMutation";
import { clearWorkingWarehouseSheet, setWorkingWarehouseSheet } from "./workingSheet";
import WarehouseManagerField from "./WarehouseManagerField";

type Props = Readonly<{
  api: WarehouseApi; membershipRef: string; sheet?: WarehouseSheet; recovery?: PendingWarehouseDraft<WarehouseSheetChange>; working?: WarehouseSheetChange;
  initialParentRef?: string; initialFocusRef?: string; uses: readonly WarehouseAreaUse[]; usesReady: boolean; usesError: string | null;
  onPending(draft: PendingWarehouseDraft | null): void; onSaved(saved: WarehouseSheetSaved): void; onUnauthorized(): void;
  onReturn(change: WarehouseSheetChange | null): void; onNavigate(path: string): void; onRefresh(): void; onRetryUses(): void;
}>;

export default function WarehouseSheetEditor({ api, membershipRef, sheet, recovery, working, initialParentRef, initialFocusRef, uses, usesReady, usesError, onPending, onSaved, onUnauthorized, onReturn, onNavigate, onRefresh, onRetryUses }: Props) {
  const original = recovery?.change ?? working;
  const [draft, setDraft] = useState(() => {
    const value = sheetDraftFrom(sheet, original);
    if (!original && initialParentRef) {
      const parentKey = initialParentRef === sheet?.rootLocationRef ? "" : existingParentKey(initialParentRef);
      const ancestors = sheetParentKinds(parentKey, value.rows, sheet);
      const kind = SHEET_KINDS.find((kind) => ancestors && canPlaceWarehouseAddressKind(kind, [...ancestors]));
      if (kind) return { ...value, rows: [...value.rows, newSheetRow(parentKey, kind)] };
    }
    return value;
  });
  const [showErrors, setShowErrors] = useState(false);
  const [generatorParent, setGeneratorParent] = useState("");
  const [counts, setCounts] = useState<Readonly<Record<WarehouseSheetKind, string>>>({ ZONE: "0", AISLE: "0", RACK: "0", LEVEL: "0", BIN: "0" });
  const [localError, setLocalError] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const mutation = useWarehouseMutation({ api, membershipRef, recovery, onPending, onUnauthorized, onSaved: (saved) => { if ("warehouse" in saved) { clearWorkingWarehouseSheet(membershipRef); onSaved(saved); } } });
  const change = useMemo(() => warehouseSheetChange(draft, sheet, original), [draft, sheet, original]);
  const validation = validateSheetDraft(draft, sheet, uses);
  const labels = useMemo(() => provisionalSheetLabels(draft.rows, sheet), [draft.rows, sheet]);
  const creating = original ? original.warehouseRef === null : !sheet;
  const changed = creating || change.rows.length > 0 || draft.name.trim() !== sheet?.name || (draft.managerMembershipRef || null) !== (sheet?.manager?.membershipRef ?? null) || (draft.rootAreaUseRef || null) !== sheet?.rootAreaUseRef || sheet?.profileVersion === 0;
  const parentChoices = [
    { key: "", label: draft.name.trim() || "Almacén principal" },
    ...(sheet?.locations ?? []).filter((row) => row.locationRef !== sheet?.rootLocationRef).map((row) => ({ key: existingParentKey(row.locationRef), label: `${row.name} · ${row.address?.label ?? row.code}` })),
    ...draft.rows.filter((row) => !row.existing).map((row, index) => ({ key: newParentKey(row.rowId), label: `${row.name.trim() || `${SHEET_KIND_LABELS[row.kind as WarehouseSheetKind]} sin nombre`} · Nueva ${index + 1}` })),
  ];
  const generatorAncestors = sheetParentKinds(generatorParent, draft.rows, sheet);
  const generationCounts = Object.fromEntries(SHEET_KINDS.map((kind) => [kind, counts[kind].trim() ? Number(counts[kind]) : NaN])) as SheetGenerationCounts;
  const generation = sheetGenerationSummary(generationCounts, generatorAncestors);
  const generationFits = generation.total > 0 && !generation.error && change.rows.length + generation.total <= SHEET_ROW_LIMIT;
  const newCount = draft.rows.filter((row) => !row.existing).length;

  useEffect(() => {
    if (!mutation.locked && changed) setWorkingWarehouseSheet(membershipRef, change);
  }, [change, changed, membershipRef, mutation.locked]);

  useEffect(() => {
    panelRef.current?.scrollIntoView({ block: "start" });
    const target = initialFocusRef ? panelRef.current?.querySelector<HTMLInputElement>(`input[data-location-ref="${initialFocusRef}"]`) : null;
    (target ?? panelRef.current?.querySelector<HTMLInputElement>('input[aria-label="Nombre del almacén"]'))?.focus({ preventScroll: true });
  }, [initialFocusRef]);

  const updateRow = (rowId: string, patch: Partial<SheetDraftRow>) => setDraft((current) => ({ ...current, rows: current.rows.map((row) => row.rowId === rowId ? { ...row, ...patch } : row) }));
  const addRow = (parentKey = "", requestedKind?: WarehouseSheetKind) => {
    if (mutation.locked || change.rows.length >= SHEET_ROW_LIMIT) return;
    const ancestors = sheetParentKinds(parentKey, draft.rows, sheet);
    const kind = requestedKind ?? SHEET_KINDS.find((kind) => ancestors && canPlaceWarehouseAddressKind(kind, [...ancestors]));
    if (!kind) return;
    setDraft((current) => ({ ...current, rows: [...current.rows, newSheetRow(parentKey, kind)] }));
  };
  const preserveWorking = () => {
    if (setWorkingWarehouseSheet(membershipRef, change)) { setLocalError(null); return true; }
    setLocalError("Revise la estructura y el límite de filas para conservar este borrador antes de salir."); return false;
  };
  const returnToList = () => { if (mutation.saving) return; if (mutation.uncertain) { onReturn(null); return; } if (preserveWorking()) onReturn(change); };
  const discardWorking = () => { if (mutation.saving || mutation.uncertain) return; clearWorkingWarehouseSheet(membershipRef); onReturn(null); };
  const createUse = () => { if (!mutation.locked && preserveWorking()) onNavigate("/warehouses/configuration"); };
  const submit = () => {
    setShowErrors(true); setLocalError(null);
    if (!mutation.uncertain && (!usesReady || !validation.valid || !changed)) return;
    void mutation.submit(change);
  };
  const addGenerated = () => {
    if (mutation.locked || !generationFits) return;
    const generated = generateSheetRows(generatorParent, generationCounts);
    setDraft((current) => ({ ...current, rows: [...current.rows, ...generated] }));
    setCounts(Object.fromEntries(SHEET_KINDS.map((kind) => [kind, String(EMPTY_GENERATION[kind])])) as Readonly<Record<WarehouseSheetKind, string>>);
  };
  const allowedUseOptions = (selected: string) => uses.filter((use) => use.status === "ACTIVE" || use.useRef === selected);

  return <section ref={panelRef} role="region" aria-labelledby="warehouse-sheet-heading" data-testid="warehouse-sheet" className="min-w-0 scroll-mt-4">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={returnToList} disabled={mutation.saving} className={WAREHOUSE_BUTTON}><ArrowLeft className="h-4 w-4" aria-hidden="true" />Volver al listado</button><h2 id="warehouse-sheet-heading" className="text-lg font-bold text-[#003366]">{creating ? "Nuevo almacén" : "Editar almacén"}</h2><AdministrationHelp title="Hoja del almacén"><p>Complete el nombre, el uso y el encargado. Agregue las ubicaciones reales en las filas; Tab avanza entre las celdas.</p><p>Un solo guardado confirma todos los cambios de la hoja. Las ubicaciones guardadas conservan su identidad, código, tipo y ubicación superior.</p><p>Puede omitir niveles. El cero en una etiqueta representa un nivel omitido; nunca se crea una ubicación física con número cero.</p><p>Las etiquetas nuevas son automáticas. Ejemplo: ALM-03-000-01-AZ-9-4 identifica almacén 03, sin zona, pasillo 01, estantería AZ, nivel 9 y posición 4.</p></AdministrationHelp></div><p className="text-xs text-slate-500">{sheet?.warehouseLabel ?? "Etiqueta automática al guardar"}{sheet && <> · Código conservado: <span className="font-mono">{sheet.code}</span></>}</p></div>
    {working && !recovery && <p role="status" className="mb-3 text-xs text-slate-600">Borrador recuperado. Revise la hoja y guarde cuando esté lista.</p>}
    <form noValidate onSubmit={(event) => { event.preventDefault(); submit(); }} className="space-y-3">
      <div className="grid min-w-0 gap-3 rounded border border-slate-200 bg-white p-3 sm:grid-cols-3">
        <div className="min-w-0"><label htmlFor="warehouse-sheet-name" className="flex h-5 items-center text-xs font-medium text-slate-700">Nombre del almacén</label><input id="warehouse-sheet-name" aria-label="Nombre del almacén" disabled={mutation.locked} required maxLength={160} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={`${COMPACT_FORM_FIELD} mt-1 w-full`} /></div>
        <div className="min-w-0"><label className="flex h-5 items-center text-xs font-medium text-slate-700" htmlFor="warehouse-sheet-root-use">Uso del almacén</label><select id="warehouse-sheet-root-use" disabled={mutation.locked || !usesReady} value={draft.rootAreaUseRef} onChange={(event) => setDraft({ ...draft, rootAreaUseRef: event.target.value })} className={`${COMPACT_FORM_FIELD} mt-1 w-full`}><option value="">Sin uso asignado</option>{draft.rootAreaUseRef && !uses.some((use) => use.useRef === draft.rootAreaUseRef) && <option value={draft.rootAreaUseRef}>Uso del borrador</option>}{allowedUseOptions(draft.rootAreaUseRef).map((use) => <option key={use.useRef} value={use.useRef}>{use.name}{use.status === "INACTIVE" ? " · Inactivo" : ""}</option>)}</select><p className="mt-1 text-[11px] leading-5 text-slate-500">Cada ubicación puede tener su propio uso.</p>{usesReady && uses.length === 0 && <p className="text-[11px] leading-5 text-slate-600">Todavía no hay usos registrados. Puede guardar sin asignar uno.</p>}<button type="button" onClick={createUse} disabled={mutation.locked} className="mt-1 text-xs text-[#0070a8] underline disabled:opacity-40">Crear uso en Configuración</button><p className="mt-1 text-[11px] text-slate-500">La hoja se conserva al ir a Configuración.</p></div>
        <WarehouseManagerField api={api} value={draft.managerMembershipRef} current={sheet?.manager} disabled={mutation.locked} onChange={(managerMembershipRef) => setDraft({ ...draft, managerMembershipRef })} onUnauthorized={onUnauthorized} />
      </div>
      {usesError && <p role="alert" className="text-xs text-red-800">No se pudo consultar el catálogo de usos. {usesError} <button type="button" onClick={onRetryUses} disabled={mutation.saving} className="underline">Reintentar consulta</button></p>}
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-slate-800">Estructura de ubicaciones</h3><button type="button" onClick={() => addRow()} disabled={mutation.locked || change.rows.length >= SHEET_ROW_LIMIT} className={WAREHOUSE_BUTTON}><Plus className="h-4 w-4" aria-hidden="true" />Agregar fila</button></div>
      <div className="overflow-hidden rounded border border-slate-200 bg-white"><div role="region" aria-label="Hoja de ubicaciones" tabIndex={0} className="overflow-x-auto"><table className="w-full min-w-[920px] border-collapse text-left text-xs"><caption className="sr-only">Edite nombres y usos en las filas. Los códigos existentes se conservan.</caption><thead className="bg-slate-50 text-slate-500"><tr>{["Fila", "Tipo", "Dentro de", "Nombre", "Uso", "Etiqueta", "Acciones"].map((heading) => <th key={heading} scope="col" className="px-2 py-2 font-semibold">{heading}</th>)}</tr></thead><tbody>
        {draft.rows.map((row, index) => {
          const rowLabel = `fila ${index + 1}`; const errors = validation.rows[row.rowId] ?? [];
          const known = row.existing ? sheet?.locations.find((location) => location.locationRef === row.existing!.locationRef) ?? row.existing : null;
          const parentKey = known ? known.parentLocationRef === sheet?.rootLocationRef || !known.parentLocationRef ? "" : existingParentKey(known.parentLocationRef) : row.parentKey;
          const parentLabel = parentChoices.find((parent) => parent.key === parentKey)?.label ?? "Ubicación del guardado anterior";
          const childKey = row.existing ? existingParentKey(row.existing.locationRef) : newParentKey(row.rowId);
          const childAncestors = sheetParentKinds(childKey, draft.rows, sheet);
          const canAddChild = Boolean(childAncestors && SHEET_KINDS.some((kind) => canPlaceWarehouseAddressKind(kind, [...childAncestors])));
          const duplicateAncestors = sheetParentKinds(parentKey, draft.rows, sheet);
          const canDuplicate = Boolean(duplicateAncestors && canPlaceWarehouseAddressKind(known?.kind ?? row.kind, duplicateAncestors));
          const hasDraftChildren = draft.rows.some((child) => !child.existing && child.parentKey === newParentKey(row.rowId));
          const label = known?.address?.label ?? (row.existing ? null : labels.get(row.rowId));
          return <Fragment key={row.rowId}><tr data-testid="warehouse-sheet-row" className="border-t border-slate-100 align-top"><th scope="row" className="px-2 py-2 font-normal text-slate-400">{index + 1}{!row.existing && <span className="block text-[10px] text-emerald-700">Nueva</span>}</th><td className="px-1.5 py-1">{row.existing ? <span className="inline-flex h-8 items-center text-slate-600 sm:h-7">{SHEET_KIND_LABELS[known?.kind as WarehouseSheetKind] ?? LOCATION_KIND_LABELS[known?.kind ?? row.kind] ?? "Otra ubicación"}</span> : <select aria-label={`Tipo, ${rowLabel}`} disabled={mutation.locked} value={row.kind} onChange={(event) => updateRow(row.rowId, { kind: event.target.value })} className={`${COMPACT_FORM_FIELD} w-28`}>{SHEET_KINDS.map((kind) => <option key={kind} value={kind}>{SHEET_KIND_LABELS[kind]}</option>)}</select>}</td><td className="max-w-52 px-1.5 py-1">{row.existing ? <span className="inline-flex min-h-7 items-center text-[11px] leading-4 text-slate-600">{parentLabel}</span> : <select aria-label={`Dentro de, ${rowLabel}`} disabled={mutation.locked} value={row.parentKey} onChange={(event) => updateRow(row.rowId, { parentKey: event.target.value })} className={`${COMPACT_FORM_FIELD} w-48`}>{!parentChoices.some((parent) => parent.key === row.parentKey) && <option value={row.parentKey}>Ubicación del borrador</option>}{parentChoices.filter((parent) => parent.key !== newParentKey(row.rowId)).map((parent) => <option key={parent.key} value={parent.key}>{parent.label}</option>)}</select>}</td><td className="px-1.5 py-1"><input aria-label={`Nombre, ${rowLabel}`} data-location-ref={row.existing?.locationRef} disabled={mutation.locked} maxLength={160} value={row.name} onChange={(event) => updateRow(row.rowId, { name: event.target.value })} aria-invalid={showErrors && errors.length > 0} className={`${COMPACT_FORM_FIELD} w-48`} /></td><td className="px-1.5 py-1"><select aria-label={`Uso, ${rowLabel}`} disabled={mutation.locked || !usesReady} value={row.areaUseRef} onChange={(event) => updateRow(row.rowId, { areaUseRef: event.target.value })} className={`${COMPACT_FORM_FIELD} w-40`}><option value="">Sin asignar</option>{row.areaUseRef && !uses.some((use) => use.useRef === row.areaUseRef) && <option value={row.areaUseRef}>Uso del borrador</option>}{allowedUseOptions(row.areaUseRef).map((use) => <option key={use.useRef} value={use.useRef}>{use.name}{use.status === "INACTIVE" ? " · Inactivo" : ""}</option>)}</select></td><td className="px-2 py-1.5"><p className="whitespace-nowrap font-mono text-[11px] text-slate-600">{label ?? known?.code ?? "Se confirmará al guardar"}</p>{!row.existing && label && <span className="text-[10px] text-slate-400">Provisional</span>}{row.existing && !known?.address && <span className="text-[10px] text-slate-400">Código existente</span>}</td><td className="px-1.5 py-1"><div className="flex gap-1"><AdministrationIconAction label={`Agregar ubicación dentro de ${rowLabel}`} disabled={mutation.locked || !canAddChild || change.rows.length >= SHEET_ROW_LIMIT} onClick={() => addRow(childKey)}><Plus className="h-3.5 w-3.5" aria-hidden="true" /></AdministrationIconAction><AdministrationIconAction label={`Duplicar ${rowLabel}`} disabled={mutation.locked || !canDuplicate || change.rows.length >= SHEET_ROW_LIMIT} onClick={() => setDraft((current) => ({ ...current, rows: [...current.rows, { ...newSheetRow(parentKey, (known?.kind ?? row.kind) as WarehouseSheetKind), name: row.name, areaUseRef: row.areaUseRef }] }))}><Copy className="h-3.5 w-3.5" aria-hidden="true" /></AdministrationIconAction>{!row.existing && <AdministrationIconAction label={`Quitar ${rowLabel}`} disabled={mutation.locked || hasDraftChildren} onClick={() => setDraft((current) => ({ ...current, rows: current.rows.filter((item) => item.rowId !== row.rowId) }))}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></AdministrationIconAction>}</div></td></tr>{showErrors && errors.length > 0 && <tr className="bg-red-50"><td colSpan={7} className="px-3 py-2 text-xs text-red-800">Fila {index + 1}: {errors.join(" ")}</td></tr>}</Fragment>;
        })}
        {draft.rows.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-slate-500">Agregue las ubicaciones que existan. Puede guardar solo el almacén principal.</td></tr>}
      </tbody></table></div><p className="border-t border-slate-200 px-3 py-2 text-xs text-slate-500">{draft.rows.length} filas · {newCount} nuevas · {change.rows.length - newCount} modificadas · Tab para avanzar entre celdas</p></div>
      <details className="rounded border border-slate-200 bg-white p-3"><summary className="cursor-pointer text-xs font-semibold text-slate-700">Generar recorrido por cantidades</summary><p className="my-2 text-xs leading-5 text-slate-500">Cada cantidad se aplica dentro de cada ubicación del nivel anterior. Cero omite ese nivel. Solo se agregan filas al pulsar el botón.</p><div className="flex flex-wrap items-end gap-3"><label className="text-xs text-slate-600">Dentro de<select aria-label="Ubicación superior del generador" disabled={mutation.locked} value={generatorParent} onChange={(event) => { setGeneratorParent(event.target.value); setCounts({ ZONE: "0", AISLE: "0", RACK: "0", LEVEL: "0", BIN: "0" }); }} className={`${COMPACT_FORM_FIELD} mt-1 block w-48`}>{parentChoices.map((parent) => <option key={parent.key} value={parent.key}>{parent.label}</option>)}</select></label>{SHEET_KINDS.map((kind) => <label key={kind} className="text-xs text-slate-600">{SHEET_KIND_LABELS[kind]}<NumericInput aria-label={`Cantidad de ${SHEET_KIND_LABELS[kind].toLowerCase()}`} disabled={mutation.locked} min={0} max={kind === "ZONE" ? 999 : kind === "AISLE" ? 99 : kind === "RACK" ? 676 : kind === "LEVEL" ? 9 : 4} maxLength={4} step={1} value={counts[kind]} onChange={(event) => setCounts({ ...counts, [kind]: event.target.value })} className={`${COMPACT_FORM_FIELD} mt-1 block w-16 text-right tabular-nums`} /></label>)}<button type="button" onClick={addGenerated} disabled={mutation.locked || !generationFits} className={WAREHOUSE_BUTTON}><Plus className="h-4 w-4" aria-hidden="true" />Agregar filas generadas</button></div><p aria-live="polite" className="mt-2 text-xs text-slate-600">{generation.total} filas: {Object.entries(generation.byKind).map(([kind, count]) => `${count} ${SHEET_KIND_LABELS[kind as WarehouseSheetKind].toLowerCase()}`).join(" · ") || "ninguna ubicación indicada"}.</p>{generation.error && <p className="mt-1 text-xs text-red-800">{generation.error}</p>}{!generation.error && change.rows.length + generation.total > SHEET_ROW_LIMIT && <p className="mt-1 text-xs text-red-800">La hoja admite hasta {SHEET_ROW_LIMIT} filas nuevas o modificadas por guardado.</p>}<p className="mt-1 text-[11px] text-slate-500">Ejemplo: 2 pasillos × 3 estanterías × 4 niveles = 2 pasillos, 6 estanterías y 24 niveles: 32 filas. Las estanterías se etiquetan AA, AB… ZZ.</p></details>
      {showErrors && validation.general.length > 0 && <p role="alert" className="text-xs leading-5 text-red-800">{validation.general.join(" ")}</p>}
      {(mutation.error || localError) && <p role="alert" className="text-xs leading-5 text-red-800">{localError ?? mutation.error}</p>}
      <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-3 py-3"><p className="max-w-xl text-xs leading-5 text-slate-500">Las filas existentes conservan su ubicación superior y su código. Se confirman las etiquetas de las ubicaciones nuevas o editadas que tengan una estructura compatible.</p><div className="flex flex-wrap gap-2"><button type="button" onClick={discardWorking} disabled={mutation.saving || mutation.uncertain} className={WAREHOUSE_BUTTON}>Descartar borrador</button>{mutation.conflict ? <button type="button" onClick={() => { clearWorkingWarehouseSheet(membershipRef); onReturn(null); onRefresh(); }} className={WAREHOUSE_BUTTON}><RefreshCw className="h-4 w-4" aria-hidden="true" />Actualizar listado</button> : <button type="submit" disabled={mutation.saving || !mutation.uncertain && (!usesReady || !changed)} className={WAREHOUSE_PRIMARY_BUTTON}><Save className="h-4 w-4" aria-hidden="true" />{mutation.saving ? "Guardando…" : mutation.uncertain ? "Reintentar guardado" : "Guardar hoja"}</button>}</div></footer>
    </form>
  </section>;
}
