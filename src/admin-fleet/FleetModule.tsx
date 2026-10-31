import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, Pencil, Plus, RefreshCw, Search, Truck } from "lucide-react";
import { CanonicalAccessDenied } from "@/components/auth/CanonicalAccessDenied";
import { AdministrationHelp, AdministrationIconAction } from "@/administration/AdministrationHelp";
import { getMembershipRef } from "@/lib/sessionStore";
import { resolveFleetAccess, type FleetAccess } from "./access";
import { FleetApi, FleetApiError, fleetErrorText } from "./api";
import FleetEditor from "./FleetEditor";
import { isAdminFleetEnabled } from "./mode";
import { FLEET_STATUS_LABELS, VOLUME_LABELS, WEIGHT_LABELS, type FleetStatus, type FleetVehicle } from "./types";

type Props = Readonly<{
  authorization?: string;
  role: string;
  effectivePermissions: readonly string[];
  deniedPermissions: readonly string[];
  onUnauthorized(): void;
  onReturnToHub(): void;
}>;

export default function FleetModule(props: Props) {
  const membershipRef = getMembershipRef();
  const access = resolveFleetAccess(props.role, props.effectivePermissions, props.deniedPermissions);
  const scope = JSON.stringify([props.authorization, membershipRef, props.role, [...props.effectivePermissions].sort(), [...props.deniedPermissions].sort()]);
  if (!isAdminFleetEnabled() || !access.canView || !membershipRef) return <CanonicalAccessDenied onReturnToSafeRoute={props.onReturnToHub} />;
  return <FleetWorkspace key={scope} {...props} access={access} membershipRef={membershipRef} />;
}

function FleetWorkspace({ authorization, membershipRef, access, onUnauthorized }: Props & { membershipRef: string; access: FleetAccess }) {
  const api = useMemo(() => new FleetApi(() => authorization || null, globalThis.fetch.bind(globalThis), () => membershipRef), [authorization, membershipRef]);
  const [result, setResult] = useState<{ query: string; rows: readonly FleetVehicle[]; total: number; error: string | null } | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<FleetStatus | "">("");
  const [vehicleType, setVehicleType] = useState("");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [selection, setSelection] = useState<{ vehicleRef: string | null } | null>(null);
  const readEpoch = useRef(0);
  const callbacks = useRef({ onUnauthorized });
  useEffect(() => { callbacks.current = { onUnauthorized }; }, [onUnauthorized]);
  const pageSize = 20;
  const query = JSON.stringify([search, status, vehicleType, page, refresh]);
  const loading = result?.query !== query;
  const rows = !loading && result ? result.rows : [];
  const total = !loading && result ? result.total : 0;
  const error = !loading && result ? result.error : null;

  useEffect(() => {
    const controller = new AbortController();
    const epoch = ++readEpoch.current;
    const timer = window.setTimeout(() => {
      void api.list({ search, operationalStatus: status, vehicleType, page, pageSize }, controller.signal).then((result) => {
        if (controller.signal.aborted || readEpoch.current !== epoch) return;
        const lastPage = Math.max(1, Math.ceil(result.total / pageSize));
        if (page > lastPage) { setPage(lastPage); return; }
        setResult({ query, rows: result.data, total: result.total, error: null });
      }).catch((cause) => {
        if (controller.signal.aborted || readEpoch.current !== epoch) return;
        if (cause instanceof FleetApiError && cause.status === 401) callbacks.current.onUnauthorized();
        else setResult({ query, rows: [], total: 0, error: fleetErrorText(cause) });
      });
    }, 150);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [api, search, status, vehicleType, page, query]);

  const filterClass = "h-10 min-w-0 rounded border border-slate-300 bg-white px-2 text-xs text-slate-800 sm:h-9";
  const number = (value: number | null, unit: string) => value === null ? "—" : `${value.toLocaleString("es", { maximumFractionDigits: 4 })} ${unit}`;
  return <section className="mt-5 min-w-0" aria-labelledby="fleet-heading">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2"><Truck aria-hidden="true" className="h-5 w-5 text-[#003366]" /><h2 id="fleet-heading" className="text-lg font-bold text-[#003366]">Flota vehicular</h2>{!access.canEdit && <span className="text-xs text-slate-500">Consulta</span>}</div>
      <div className="flex items-center gap-1.5">
        <AdministrationHelp title="Flota vehicular"><p>Consulte y registre los vehículos de la empresa. La capacidad de peso y volumen siempre incluye la unidad almacenada.</p><p>El estado operativo y la disponibilidad para cálculos se administran desde la ficha. Un vehículo retirado conserva sus datos y deja de admitir cambios.</p><p>Las características técnicas usadas en cálculos quedan protegidas. La flota no incluye todavía mantenimiento, combustible ni reservas.</p></AdministrationHelp>
        <AdministrationIconAction label="Actualizar flota" disabled={loading} onClick={() => setRefresh((value) => value + 1)}><RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></AdministrationIconAction>
        {access.canEdit && <AdministrationIconAction label="Nuevo vehículo" onClick={() => setSelection({ vehicleRef: null })} className="border-[#003366] bg-[#003366] text-white hover:bg-[#00264d]"><Plus aria-hidden="true" className="h-4 w-4" /></AdministrationIconAction>}
      </div>
    </div>
    <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-[minmax(180px,1fr)_160px_160px]">
      <label className="relative col-span-2 block sm:col-span-1"><Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-3 h-4 w-4 text-slate-400 sm:top-2.5" /><input type="search" aria-label="Buscar vehículos" placeholder="Código, matrícula, marca…" maxLength={120} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className={`${filterClass} w-full pl-8`} /></label>
      <select aria-label="Filtrar por estado" value={status} onChange={(event) => { setStatus(event.target.value as FleetStatus | ""); setPage(1); }} className={filterClass}><option value="">Todos los estados</option>{Object.entries(FLEET_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <input aria-label="Filtrar por tipo" placeholder="Tipo de vehículo" maxLength={80} value={vehicleType} onChange={(event) => { setVehicleType(event.target.value); setPage(1); }} className={filterClass} />
    </div>
    <div className="overflow-hidden rounded border border-slate-200 bg-white">
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tabla de flota vehicular">
        <table className="w-full min-w-[840px] border-collapse text-left text-xs">
          <thead className="bg-slate-50 text-slate-500"><tr>{["Código", "Matrícula", "Tipo", "Marca / modelo", "Peso", "Volumen", "Estado", "Acciones"].map((label) => <th key={label} scope="col" className={`border-b border-slate-200 px-3 py-2.5 font-semibold ${label === "Acciones" ? "w-14 text-center" : ""}`}>{label}</th>)}</tr></thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-500"><span role="status">Cargando flota…</span></td></tr>}
            {error && <tr><td colSpan={8} className="px-3 py-6 text-center"><p role="alert" className="mb-2 text-red-800">{error}</p><button type="button" onClick={() => setRefresh((value) => value + 1)} className="inline-flex min-h-9 items-center gap-1.5 rounded border border-slate-300 px-3 font-medium text-slate-700"><RefreshCw aria-hidden="true" className="h-4 w-4" />Reintentar consulta</button></td></tr>}
            {!loading && !error && rows.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-500">{search || status || vehicleType ? "No hay vehículos que coincidan con estos filtros." : "Todavía no hay vehículos registrados."}</td></tr>}
            {!loading && !error && rows.map((vehicle) => <tr key={vehicle.vehicleRef} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
              <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-900"><button type="button" onClick={() => setSelection({ vehicleRef: vehicle.vehicleRef })} className="min-h-9 rounded text-left underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-indigo-600">{vehicle.businessCode}</button></td>
              <td className="whitespace-nowrap px-3 py-2 text-slate-700">{vehicle.plate || "—"}</td>
              <td className="max-w-48 px-3 py-2 text-slate-600">{vehicle.vehicleType}</td>
              <td className="max-w-56 px-3 py-2 text-slate-600">{[vehicle.brand, vehicle.model, vehicle.modelYear].filter(Boolean).join(" · ") || "—"}</td>
              <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600">{number(vehicle.capacityWeight, WEIGHT_LABELS[vehicle.weightUnit])}</td>
              <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600">{number(vehicle.capacityVolume, VOLUME_LABELS[vehicle.volumeUnit])}</td>
              <td className="whitespace-nowrap px-3 py-2"><span className={`inline-flex rounded px-1.5 py-1 text-[11px] ${vehicle.operationalStatus === "AVAILABLE" ? "bg-emerald-50 text-emerald-800" : vehicle.operationalStatus === "IN_USE" ? "bg-blue-50 text-blue-800" : "bg-slate-100 text-slate-600"}`}>{FLEET_STATUS_LABELS[vehicle.operationalStatus]}</span></td>
              <td className="px-2 py-1 text-center"><AdministrationIconAction label={`${access.canEdit && vehicle.operationalStatus !== "RETIRED" ? "Editar" : "Consultar"} ${vehicle.businessCode}`} onClick={() => setSelection({ vehicleRef: vehicle.vehicleRef })}>{access.canEdit && vehicle.operationalStatus !== "RETIRED" ? <Pencil aria-hidden="true" className="h-3.5 w-3.5" /> : <Eye aria-hidden="true" className="h-3.5 w-3.5" />}</AdministrationIconAction></td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <footer className="flex items-center justify-between gap-2 border-t border-slate-200 px-3 py-2 text-xs text-slate-500">
        <span aria-live="polite">{loading ? "Consultando…" : `${total} vehículo${total === 1 ? "" : "s"}`}</span>
        <div className="flex items-center gap-2"><AdministrationIconAction label="Página anterior" disabled={loading || Boolean(error) || page === 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft aria-hidden="true" className="h-4 w-4" /></AdministrationIconAction><span>Página {page} de {Math.max(1, Math.ceil(total / pageSize))}</span><AdministrationIconAction label="Página siguiente" disabled={loading || Boolean(error) || page * pageSize >= total} onClick={() => setPage((value) => value + 1)}><ChevronRight aria-hidden="true" className="h-4 w-4" /></AdministrationIconAction></div>
      </footer>
    </div>
    {selection && <FleetEditor key={selection.vehicleRef || "new"} api={api} vehicleRef={selection.vehicleRef} canEdit={access.canEdit} onClose={() => { setSelection(null); setRefresh((value) => value + 1); }} onSaved={() => setRefresh((value) => value + 1)} onUnauthorized={onUnauthorized} />}
  </section>;
}
