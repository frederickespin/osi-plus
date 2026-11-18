import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, FileDown, MapPin, Package, Pencil, Plus, Power, ShieldAlert, Tags, Upload, X } from "lucide-react";
import { COMPACT_FORM_FIELD } from "@/components/ui/compact-form";
import spreadsheetLibraryUrl from "@/internal-tools/archaeological-packing/vendor/xlsx.full.min.js?url";
import { CustomerCustodyApi, customerCustodyErrorText, type CustomerCustodyCatalogItem, type CustomerCustodyCatalogKind } from "./api";

const KINDS: readonly { code: CustomerCustodyCatalogKind; label: string; short: string; icon: typeof MapPin }[] = [
  { code: "DAMAGE_LOCATION", label: "Localizaciones de daños", short: "Ubic.", icon: MapPin },
  { code: "CONDITION", label: "Condiciones", short: "Cond.", icon: ShieldAlert },
  { code: "ITEM_NAME", label: "Nombres de artículos", short: "Artíc.", icon: Tags },
  { code: "PACKAGE_FORM", label: "Formas de empaque", short: "Empaq.", icon: Package },
];
const ICON_BUTTON = "grid h-9 w-9 shrink-0 place-items-center rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40";
const PACKAGE_VALUES = new Set(["BOX", "PACKAGE", "BUNDLE", "PALLET", "LOOSE_ITEM", "CRATE", "OTHER"]);

type ImportAction = "CREATE" | "UPDATE" | "SKIP" | "ERROR";
type ImportRow = Readonly<{ row: number; action: ImportAction; label: string; code: string; baseValue: string | null; status: "ACTIVE" | "INACTIVE"; sortOrder: number; existing: CustomerCustodyCatalogItem | null; problem: string | null }>;
type SpreadsheetApi = Readonly<{ read(data: ArrayBuffer, options: { type: "array" }): { SheetNames: string[]; Sheets: Record<string, unknown> }; utils: { sheet_to_json<T>(sheet: unknown, options: { header: 1; defval: string; blankrows: false }): T[] } }>;

function codeFor(label: string) {
  const normalized = label.normalize("NFD").replace(/[\u0300-\u036f]/gu, "").toUpperCase().replace(/[^A-Z0-9]+/gu, "_").replace(/^_|_$/gu, "").slice(0, 48) || "OPCION";
  return `CUSTOM_${normalized}_${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
}
function key(value: unknown) { return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/gu, "").trim().toLowerCase().replace(/[^a-z0-9]+/gu, "_"); }
function cell(value: unknown) { return String(value ?? "").trim(); }
function importedStatus(value: unknown): "ACTIVE" | "INACTIVE" { return ["inactive", "inactivo", "disabled", "desactivado", "0"].includes(key(value)) ? "INACTIVE" : "ACTIVE"; }

async function spreadsheetApi(): Promise<SpreadsheetApi> {
  const host = window as unknown as { XLSX?: SpreadsheetApi };
  if (host.XLSX) return host.XLSX;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${spreadsheetLibraryUrl}"]`);
    if (existing) { existing.addEventListener("load", () => resolve(), { once: true }); existing.addEventListener("error", () => reject(new Error("XLSX_LOAD_FAILED")), { once: true }); return; }
    const script = document.createElement("script"); script.src = spreadsheetLibraryUrl; script.async = true; script.addEventListener("load", () => resolve(), { once: true }); script.addEventListener("error", () => reject(new Error("XLSX_LOAD_FAILED")), { once: true }); document.head.appendChild(script);
  });
  if (!host.XLSX) throw new Error("XLSX_LOAD_FAILED");
  return host.XLSX;
}

async function parseImport(file: File, kind: CustomerCustodyCatalogKind, items: readonly CustomerCustodyCatalogItem[]): Promise<readonly ImportRow[]> {
  const XLSX = await spreadsheetApi();
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: false }).slice(0, 251);
  if (matrix.length === 0) return [];
  const aliases = {
    label: new Set(["nombre", "etiqueta", "descripcion", "label", "name", "opcion"]),
    code: new Set(["codigo", "code"]),
    baseValue: new Set(["valor_base", "base_value", "basevalue", "tipo_base"]),
    status: new Set(["estado", "status"]),
    sortOrder: new Set(["orden", "sort_order", "sortorder", "posicion"]),
  };
  const first = matrix[0].map(key);
  const hasHeader = first.some((value) => Object.values(aliases).some((values) => values.has(value)));
  const indexOf = (values: Set<string>, fallback: number) => { const index = first.findIndex((value) => values.has(value)); return index >= 0 ? index : fallback; };
  const columns = { label: indexOf(aliases.label, 0), code: indexOf(aliases.code, -1), baseValue: indexOf(aliases.baseValue, -1), status: indexOf(aliases.status, -1), sortOrder: indexOf(aliases.sortOrder, -1) };
  const current = items.filter((item) => item.kind === kind);
  const byCode = new Map(current.map((item) => [item.code.toUpperCase(), item]));
  const byLabel = new Map(current.map((item) => [key(item.label), item]));
  const fileCodes = new Set<string>();
  const fileLabels = new Set<string>();
  const startOrder = Math.min(9_990, (current.reduce((maximum, item) => Math.max(maximum, item.sortOrder), 0) || 0) + 10);
  return matrix.slice(hasHeader ? 1 : 0).map((values, offset) => {
    const row = offset + (hasHeader ? 2 : 1);
    const label = cell(values[columns.label]);
    const providedCode = columns.code >= 0 ? cell(values[columns.code]).toUpperCase() : "";
    const existing = (providedCode ? byCode.get(providedCode) : null) || byLabel.get(key(label)) || null;
    const code = existing?.code || providedCode || codeFor(label);
    const status = columns.status >= 0 ? importedStatus(values[columns.status]) : existing?.status || "ACTIVE";
    const requestedOrder = columns.sortOrder >= 0 ? Number(values[columns.sortOrder]) : NaN;
    const sortOrder = Number.isInteger(requestedOrder) && requestedOrder >= 1 && requestedOrder <= 10_000 ? requestedOrder : existing?.sortOrder || Math.min(10_000, startOrder + offset * 10);
    const providedBase = columns.baseValue >= 0 ? cell(values[columns.baseValue]).toUpperCase() : "";
    const baseValue = kind === "PACKAGE_FORM" ? (PACKAGE_VALUES.has(providedBase) ? providedBase : existing?.baseValue || "OTHER") : null;
    let problem: string | null = null;
    if (!label || label.length > 120) problem = "Nombre vacío o mayor de 120 caracteres";
    else if (!/^[A-Z0-9][A-Z0-9_-]{1,63}$/u.test(code)) problem = "Código inválido";
    else if (fileCodes.has(code) || fileLabels.has(key(label))) problem = "Registro repetido dentro del archivo";
    fileCodes.add(code); fileLabels.add(key(label));
    const unchanged = existing && existing.label === label && existing.baseValue === baseValue && existing.status === status && existing.sortOrder === sortOrder;
    const action: ImportAction = problem ? "ERROR" : unchanged ? "SKIP" : existing ? "UPDATE" : "CREATE";
    return Object.freeze({ row, action, label, code, baseValue, status, sortOrder, existing, problem });
  });
}

export default function CustodyCatalogAdmin({ authorization, onUnauthorized }: { authorization?: string; onUnauthorized(): void }) {
  const api = useMemo(() => new CustomerCustodyApi(authorization), [authorization]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<readonly CustomerCustodyCatalogItem[]>([]);
  const [kind, setKind] = useState<CustomerCustodyCatalogKind>("DAMAGE_LOCATION");
  const [label, setLabel] = useState("");
  const [editingRef, setEditingRef] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importName, setImportName] = useState("");
  const [importRows, setImportRows] = useState<readonly ImportRow[]>([]);
  const [importOpen, setImportOpen] = useState(false);

  const refresh = useCallback(async () => {
    try { setItems(await api.catalogItems()); }
    catch (cause) { if (cause instanceof Error && "status" in cause && cause.status === 401) onUnauthorized(); else setError(customerCustodyErrorText(cause)); }
  }, [api, onUnauthorized]);
  useEffect(() => { void refresh(); }, [refresh]);

  const visible = useMemo(() => items.filter((item) => item.kind === kind).sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label, "es")), [items, kind]);
  const selectedKind = KINDS.find((row) => row.code === kind) || KINDS[0];
  const counts = useMemo(() => importRows.reduce((result, row) => ({ ...result, [row.action]: result[row.action] + 1 }), { CREATE: 0, UPDATE: 0, SKIP: 0, ERROR: 0 } as Record<ImportAction, number>), [importRows]);

  const create = async () => {
    const clean = label.trim(); if (!clean) return;
    setSaving(true); setError(null); setNotice(null);
    try {
      const row = await api.createCatalogItem({ kind, code: codeFor(clean), label: clean, baseValue: kind === "PACKAGE_FORM" ? "OTHER" : null, sortOrder: Math.min(10_000, (visible.at(-1)?.sortOrder || 0) + 10) });
      setItems((current) => [...current, row]); setLabel("");
    } catch (cause) { setError(customerCustodyErrorText(cause)); } finally { setSaving(false); }
  };
  const update = async (item: CustomerCustodyCatalogItem, patch: { label?: string; status?: "ACTIVE" | "INACTIVE" }) => {
    setSaving(true); setError(null); setNotice(null);
    try {
      const row = await api.updateCatalogItem(item.catalogRef, { expectedVersion: item.version, label: patch.label ?? item.label, baseValue: item.baseValue, status: patch.status ?? item.status, sortOrder: item.sortOrder });
      setItems((current) => current.map((candidate) => candidate.catalogRef === row.catalogRef ? row : candidate)); setEditingRef(null);
    } catch (cause) { setError(customerCustodyErrorText(cause)); } finally { setSaving(false); }
  };
  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setSaving(true); setError(null); setNotice(null);
    try { setImportRows(await parseImport(file, kind, items)); setImportName(file.name); setImportOpen(true); }
    catch { setError("No pudimos leer el archivo. Use Excel, CSV o TSV con una columna Nombre."); }
    finally { setSaving(false); if (inputRef.current) inputRef.current.value = ""; }
  };
  const runImport = async () => {
    const applicable = importRows.filter((row) => row.action === "CREATE" || row.action === "UPDATE");
    if (applicable.length === 0) return;
    setSaving(true); setError(null); setNotice(null);
    let completed = 0;
    try {
      for (const row of applicable) {
        if (row.action === "CREATE") await api.createCatalogItem({ kind, code: row.code, label: row.label, baseValue: row.baseValue, sortOrder: row.sortOrder });
        else if (row.existing) await api.updateCatalogItem(row.existing.catalogRef, { expectedVersion: row.existing.version, label: row.label, baseValue: row.baseValue, status: row.status, sortOrder: row.sortOrder });
        completed += 1;
      }
      await refresh(); setImportRows([]); setImportOpen(false); setNotice(`${completed} registro(s) importado(s) correctamente.`);
    } catch (cause) { await refresh(); setError(`${customerCustodyErrorText(cause)} Se procesaron ${completed} de ${applicable.length} registros.`); }
    finally { setSaving(false); }
  };
  const downloadTemplate = () => {
    const content = kind === "PACKAGE_FORM" ? "Nombre,Codigo,Valor_base,Estado,Orden\nCaja especial,CAJA_ESPECIAL,OTHER,ACTIVO,80\n" : "Nombre,Codigo,Estado,Orden\nEjemplo,EJEMPLO,ACTIVO,10\n";
    const url = URL.createObjectURL(new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `plantilla-${kind.toLowerCase()}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };

  return <section className="rounded-xl border bg-white p-4" data-testid="custody-catalog-admin">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-sky-700">Configuración tenant-first</p><h3 className="text-lg font-black text-[#003366]">Catálogos de recepción</h3><p className="mt-1 text-xs text-slate-500">Edite opciones o importe listados. El historial conserva el texto utilizado en cada recepción.</p></div><div className="flex items-center gap-1"><input ref={inputRef} type="file" accept=".xlsx,.xls,.csv,.tsv,.txt" className="hidden" onChange={(event) => void readFile(event.target.files?.[0])} /><button type="button" className={ICON_BUTTON} onClick={downloadTemplate} title="Descargar plantilla CSV" aria-label="Descargar plantilla del catálogo"><FileDown className="h-4 w-4" /></button><button type="button" className={ICON_BUTTON} disabled={saving} onClick={() => inputRef.current?.click()} title="Importar Excel, CSV o TSV" aria-label="Importar listado al catálogo activo"><Upload className="h-4 w-4" /></button></div></header>

    <div role="tablist" aria-label="Catálogos de recepción" className="mt-3 flex flex-wrap gap-1 border-y bg-slate-50 p-1">{KINDS.map((row) => { const Icon = row.icon; const active = kind === row.code; return <button key={row.code} type="button" role="tab" aria-selected={active} title={row.label} onClick={() => { setKind(row.code); setEditingRef(null); setImportOpen(false); setImportRows([]); setNotice(null); }} className={`inline-flex h-9 items-center gap-1.5 rounded px-2.5 text-xs font-bold ${active ? "bg-[#003366] text-white shadow-sm" : "text-slate-600 hover:bg-white"}`}><Icon className="h-3.5 w-3.5" />{row.short}<span className={`rounded px-1 text-[9px] ${active ? "bg-white/20" : "bg-slate-200"}`}>{items.filter((item) => item.kind === row.code).length}</span></button>; })}</div>

    <div className="mt-3 flex items-end gap-2"><label className="min-w-0 flex-1 text-xs font-semibold">Nueva opción en {selectedKind.label}<span className="mt-1 flex gap-1"><input value={label} onChange={(event) => setLabel(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void create(); } }} placeholder="Escriba el nombre" className={`${COMPACT_FORM_FIELD} min-w-0 flex-1`} /><button type="button" aria-label="Agregar opción" className={ICON_BUTTON} disabled={saving || !label.trim()} onClick={() => void create()}><Plus className="h-4 w-4" /></button></span></label></div>

    {importOpen && <section className="mt-3 rounded-lg border border-sky-200 bg-sky-50/50 p-3" aria-label="Vista previa de importación"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-black text-[#003366]">Vista previa · {importName}</p><p className="mt-0.5 text-[10px] text-slate-600">Se aplicará solamente a {selectedKind.label}.</p></div><button type="button" className={ICON_BUTTON} aria-label="Cerrar importación" onClick={() => { setImportOpen(false); setImportRows([]); }}><X className="h-4 w-4" /></button></div><div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold"><span className="rounded bg-emerald-100 px-2 py-1 text-emerald-800">Nuevos {counts.CREATE}</span><span className="rounded bg-blue-100 px-2 py-1 text-blue-800">Actualizar {counts.UPDATE}</span><span className="rounded bg-slate-200 px-2 py-1 text-slate-700">Sin cambios {counts.SKIP}</span><span className="rounded bg-red-100 px-2 py-1 text-red-800">Errores {counts.ERROR}</span></div><div className="mt-2 max-h-52 overflow-auto rounded border bg-white"><table className="w-full min-w-[560px] text-left text-xs"><thead className="sticky top-0 bg-slate-50 text-[9px] uppercase text-slate-500"><tr><th className="px-2 py-1.5">Fila</th><th className="px-2 py-1.5">Acción</th><th className="px-2 py-1.5">Nombre</th><th className="px-2 py-1.5">Código</th><th className="px-2 py-1.5">Observación</th></tr></thead><tbody>{importRows.map((row) => <tr key={`${row.row}-${row.code}`} className="border-t"><td className="px-2 py-1.5">{row.row}</td><td className="px-2 py-1.5 font-bold">{{ CREATE: "Crear", UPDATE: "Actualizar", SKIP: "Omitir", ERROR: "Error" }[row.action]}</td><td className="px-2 py-1.5">{row.label || "—"}</td><td className="px-2 py-1.5 font-mono text-[10px]">{row.code}</td><td className="px-2 py-1.5 text-red-700">{row.problem || ""}</td></tr>)}</tbody></table></div><div className="mt-3 flex justify-end"><button type="button" disabled={saving || counts.ERROR > 0 || counts.CREATE + counts.UPDATE === 0} onClick={() => void runImport()} className="inline-flex h-9 items-center gap-1.5 rounded bg-[#003366] px-3 text-xs font-bold text-white disabled:opacity-40"><Upload className="h-3.5 w-3.5" />{saving ? "Importando…" : `Importar ${counts.CREATE + counts.UPDATE}`}</button></div></section>}

    {error && <p role="alert" className="mt-3 text-xs text-red-700">{error}</p>}{notice && <p role="status" className="mt-3 text-xs font-semibold text-emerald-700"><Check className="mr-1 inline h-4 w-4" />{notice}</p>}
    <div className="mt-3 divide-y rounded-lg border">{visible.map((item) => <div key={item.catalogRef} className="flex min-h-12 items-center gap-2 px-3 py-1.5">{editingRef === item.catalogRef ? <input value={editingLabel} onChange={(event) => setEditingLabel(event.target.value)} className={`${COMPACT_FORM_FIELD} min-w-0 flex-1`} /> : <span className={`min-w-0 flex-1 text-sm ${item.status === "INACTIVE" ? "text-slate-400 line-through" : "text-slate-800"}`}>{item.label}</span>}<span className="hidden font-mono text-[9px] text-slate-400 sm:inline">{item.code}</span>{editingRef === item.catalogRef ? <><button type="button" aria-label={`Guardar ${item.label}`} className={ICON_BUTTON} disabled={saving || !editingLabel.trim()} onClick={() => void update(item, { label: editingLabel.trim() })}><Check className="h-4 w-4" /></button><button type="button" aria-label="Cancelar edición" className={ICON_BUTTON} onClick={() => setEditingRef(null)}><X className="h-4 w-4" /></button></> : <><button type="button" aria-label={`Editar ${item.label}`} className={ICON_BUTTON} onClick={() => { setEditingRef(item.catalogRef); setEditingLabel(item.label); }}><Pencil className="h-4 w-4" /></button><button type="button" aria-label={`${item.status === "ACTIVE" ? "Desactivar" : "Activar"} ${item.label}`} className={`${ICON_BUTTON} ${item.status === "ACTIVE" ? "text-emerald-700" : "text-slate-400"}`} disabled={saving} onClick={() => void update(item, { status: item.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" })}><Power className="h-4 w-4" /></button></>}</div>)}{visible.length === 0 && <p className="px-3 py-6 text-center text-xs text-slate-500">No hay opciones en este catálogo.</p>}</div>
  </section>;
}
