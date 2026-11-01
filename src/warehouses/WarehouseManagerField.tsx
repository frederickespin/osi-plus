import { useEffect, useRef, useState } from "react";
import { COMPACT_FORM_FIELD } from "@/components/ui/compact-form";
import { AdministrationHelp } from "@/administration/AdministrationHelp";
import { WarehouseApi, WarehouseApiError, warehouseErrorText } from "./api";
import type { WarehouseManagerOptions, WarehouseSheet } from "./sheetTypes";

export default function WarehouseManagerField({ api, value, current, disabled, onChange, onUnauthorized }: { api: WarehouseApi; value: string; current?: WarehouseSheet["manager"]; disabled: boolean; onChange(value: string): void; onUnauthorized(): void }) {
  const [search, setSearch] = useState(""); const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ key: string; data: WarehouseManagerOptions | null; error: string | null } | null>(null);
  const [revision, setRevision] = useState(0);
  const callbacks = useRef(onUnauthorized); useEffect(() => { callbacks.current = onUnauthorized; }, [onUnauthorized]);
  const key = JSON.stringify([search.trim(), page, revision]);
  useEffect(() => {
    if (disabled) return;
    const controller = new AbortController();
    const timer = setTimeout(() => { void api.managerOptions(search, page, controller.signal).then((data) => { if (!controller.signal.aborted) setResult({ key, data, error: null }); }).catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      if (cause instanceof WarehouseApiError && cause.status === 401) callbacks.current();
      else setResult({ key, data: null, error: warehouseErrorText(cause) });
    }); }, search ? 200 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [api, disabled, key, page, search]);
  const latest = result?.key === key ? result : null;
  const options = latest?.data?.data ?? [];
  return <div className="min-w-0"><div className="flex h-5 items-center gap-1"><label htmlFor="warehouse-sheet-manager" className="text-xs font-medium text-slate-700">Encargado</label><AdministrationHelp title="Encargado del almacén"><p>Seleccione una persona activa de la empresa. Esta asignación describe quién se encarga del almacén y no concede permisos a su cuenta.</p><p>Puede dejar el campo sin asignar. Una asignación anterior inactiva se conserva hasta que la cambie explícitamente.</p></AdministrationHelp></div>
    <select id="warehouse-sheet-manager" disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} className={`${COMPACT_FORM_FIELD} mt-1 w-full`}><option value="">Sin encargado asignado</option>{value && !options.some((option) => option.membershipRef === value) && <option value={value}>{current?.membershipRef === value ? `${current.displayName}${current.eligible ? "" : " · Asignación actual inactiva"}` : "Encargado elegido en el borrador"}</option>}{options.map((option) => <option key={option.membershipRef} value={option.membershipRef}>{option.displayName}</option>)}</select>
    {!disabled && <div className="mt-1 flex items-center gap-1"><input type="search" aria-label="Buscar encargado" placeholder="Buscar persona…" maxLength={120} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className={`${COMPACT_FORM_FIELD} w-full`} />{Boolean(latest?.data && latest.data.total > 25) && <><button type="button" aria-label="Encargados anteriores" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="h-8 px-2 text-xs disabled:opacity-30">‹</button><button type="button" aria-label="Más encargados" disabled={!latest?.data || page * latest.data.pageSize >= latest.data.total} onClick={() => setPage((value) => value + 1)} className="h-8 px-2 text-xs disabled:opacity-30">›</button></>}</div>}
    {!disabled && !latest && <p role="status" className="mt-1 text-[11px] text-slate-500">Consultando personas…</p>}
    {latest?.error && <p role="alert" className="mt-1 text-xs text-red-800">{latest.error} <button type="button" onClick={() => setRevision((value) => value + 1)} className="underline">Reintentar consulta</button></p>}
    {!disabled && latest?.data && latest.data.total === 0 && <p className="mt-1 text-[11px] text-slate-500">No hay personas disponibles para esta búsqueda.</p>}
  </div>;
}
