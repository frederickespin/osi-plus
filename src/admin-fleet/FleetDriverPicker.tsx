import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FleetApiError } from "./api";
import { FleetDriversApi, fleetDriversErrorText } from "./driversApi";
import type { FleetDriverOptions, FleetDriverPerson } from "./driverTypes";

export default function FleetDriverPicker({ api, label, value, onChange, disabled, allowClear = false, onUnauthorized }: {
  api: FleetDriversApi;
  label: string;
  value: FleetDriverPerson | null;
  onChange(value: FleetDriverPerson | null): void;
  disabled: boolean;
  allowClear?: boolean;
  onUnauthorized(): void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<{ query: string; data: FleetDriverOptions | null; error: string | null } | null>(null);
  const epoch = useRef(0);
  const callbacks = useRef({ onUnauthorized });
  const listId = useId();
  useEffect(() => { callbacks.current = { onUnauthorized }; }, [onUnauthorized]);
  const query = JSON.stringify([search, page, refresh]);
  const loading = result?.query !== query;
  const current = loading ? null : result;
  useEffect(() => {
    if (!open || disabled) return;
    const controller = new AbortController(); const currentEpoch = ++epoch.current;
    const timer = window.setTimeout(() => {
      void api.options({ search, page, pageSize: 20 }, controller.signal).then((data) => {
        if (controller.signal.aborted || epoch.current !== currentEpoch) return;
        const lastPage = Math.max(1, Math.ceil(data.total / data.pageSize));
        if (page > lastPage) { setPage(lastPage); return; }
        setResult({ query, data, error: null });
      }).catch((cause) => {
        if (controller.signal.aborted || epoch.current !== currentEpoch) return;
        if (cause instanceof FleetApiError && cause.status === 401) callbacks.current.onUnauthorized();
        else setResult({ query, data: null, error: fleetDriversErrorText(cause) });
      });
    }, 150);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [api, disabled, open, page, query, search]);

  const select = (person: FleetDriverPerson | null) => { if (!disabled) { onChange(person); setOpen(false); } };
  return <div className="min-w-0">
    <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
    <Popover open={open && !disabled} onOpenChange={(next) => { if (!disabled) setOpen(next); }}>
      <PopoverTrigger asChild><button type="button" role="combobox" aria-label={label} aria-expanded={open && !disabled} aria-controls={listId} disabled={disabled}
        className="flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded border border-slate-300 bg-white px-2 text-left text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-500 sm:h-9">
        <span className="truncate">{value?.displayName || (allowClear ? "Sin asignar" : "Seleccionar chofer")}</span><ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
      </button></PopoverTrigger>
      <PopoverContent align="start" className="w-[min(340px,calc(100vw-2rem))] p-0">
        <Command shouldFilter={false} label={`Buscar ${label.toLocaleLowerCase("es")}`}>
          <CommandInput aria-label={`Buscar ${label.toLocaleLowerCase("es")}`} placeholder="Buscar por nombre" value={search} maxLength={120} onValueChange={(text) => { setSearch(text); setPage(1); }} disabled={disabled} />
          <CommandList id={listId} label="Choferes activos" className="max-h-52">
            {loading && <p role="status" className="px-3 py-4 text-center text-xs text-slate-500">Buscando choferes…</p>}
            {current?.error && <div className="px-3 py-3 text-xs"><p role="alert" className="text-red-800">{current.error}</p><button type="button" onClick={() => setRefresh((value) => value + 1)} className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded border px-2"><RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />Reintentar búsqueda</button></div>}
            {current?.data && <CommandGroup>
              {allowClear && <CommandItem value="none" onSelect={() => select(null)} className="min-h-9 text-xs"><Check aria-hidden="true" className={`h-3.5 w-3.5 ${value === null ? "opacity-100" : "opacity-0"}`} />Sin asignar</CommandItem>}
              {current.data.data.map((driver) => <CommandItem key={driver.membershipRef} value={driver.membershipRef} onSelect={() => select(driver)} className="min-h-9 text-xs"><Check aria-hidden="true" className={`h-3.5 w-3.5 ${value?.membershipRef === driver.membershipRef ? "opacity-100" : "opacity-0"}`} /><span className="break-words">{driver.displayName}</span></CommandItem>)}
              {current.data.data.length === 0 && <p className="px-2 py-3 text-xs text-slate-500">No hay choferes activos para esta búsqueda.</p>}
            </CommandGroup>}
          </CommandList>
        </Command>
        {current?.data && <footer className="flex items-center justify-between gap-2 border-t px-2 py-1 text-[11px] text-slate-500">
          <span>Página {page} de {Math.max(1, Math.ceil(current.data.total / current.data.pageSize))}</span>
          <div className="flex gap-1"><button type="button" aria-label="Choferes anteriores" disabled={page === 1} onClick={() => setPage((value) => value - 1)} className="inline-flex h-9 w-9 items-center justify-center rounded hover:bg-slate-50 disabled:opacity-30"><ChevronLeft aria-hidden="true" className="h-4 w-4" /></button><button type="button" aria-label="Choferes siguientes" disabled={page * current.data.pageSize >= current.data.total} onClick={() => setPage((value) => value + 1)} className="inline-flex h-9 w-9 items-center justify-center rounded hover:bg-slate-50 disabled:opacity-30"><ChevronRight aria-hidden="true" className="h-4 w-4" /></button></div>
        </footer>}
      </PopoverContent>
    </Popover>
  </div>;
}
