import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Eye, MoreHorizontal, Pencil, Plus, RefreshCw, Search, Truck, UsersRound } from "lucide-react";
import { CanonicalAccessDenied } from "@/components/auth/CanonicalAccessDenied";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AdministrationHelp, AdministrationIconAction } from "@/administration/AdministrationHelp";
import { getMembershipRef } from "@/lib/sessionStore";
import { resolveFleetAccess, type FleetAccess } from "./access";
import { FleetApi, FleetApiError, fleetErrorText } from "./api";
import FleetEditor from "./FleetEditor";
import { isAdminFleetEnabled } from "./mode";
import { isFleetDriversEnabled } from "./driversMode";
import { FleetDriversApi } from "./driversApi";
import { FLEET_STATUS_LABELS, VOLUME_LABELS, WEIGHT_LABELS, type FleetStatus, type FleetVehicle } from "./types";

const FleetDriversDialog = lazy(() => import("./FleetDriversDialog"));

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
  const driversApi = useMemo(() => new FleetDriversApi(() => authorization || null, globalThis.fetch.bind(globalThis), () => membershipRef), [authorization, membershipRef]);
  const driversEnabled = isFleetDriversEnabled();
  const [result, setResult] = useState<{ query: string; rows: readonly FleetVehicle[]; total: number; error: string | null } | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<FleetStatus | "">("");
  const [vehicleType, setVehicleType] = useState("");
  const [page, setPage] = useState(1);
  const [asOf, setAsOf] = useState(() => Date.now());
  const [refresh, setRefresh] = useState(0);
  const [selection, setSelection] = useState<{ vehicleRef: string | null; section: "details" | "availability" } | { vehicleRef: string; section: "drivers" } | null>(null);
  const [updating, setUpdating] = useState<ReadonlySet<string>>(() => new Set());
  const [updateErrors, setUpdateErrors] = useState<Readonly<Record<string, { code: string; message: string }>>>({});
  const pendingUpdates = useRef(new Map<string, AbortController>());
  const blockedUpdates = useRef(new Map<string, number>());
  const manualRefreshVersion = useRef(0);
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
    if (!result || result.query !== query) return;
    const boundaries = result.rows.filter((vehicle) => vehicle.availableForCalculation)
      .flatMap((vehicle) => [vehicle.effectiveFrom, vehicle.effectiveTo])
      .filter((value): value is string => value !== null)
      .map((value) => new Date(value).getTime()).filter((value) => value > asOf);
    if (!boundaries.length) return;
    const delay = Math.min(2_147_483_647, Math.max(1, Math.min(...boundaries) - Date.now() + 1));
    const timer = window.setTimeout(() => setAsOf(Date.now()), delay);
    return () => window.clearTimeout(timer);
  }, [asOf, query, result]);

  useEffect(() => {
    const requests = pendingUpdates.current;
    return () => { requests.forEach((controller) => controller.abort()); requests.clear(); };
  }, [api]);

  useEffect(() => {
    const controller = new AbortController();
    const epoch = ++readEpoch.current;
    const explicitRefresh = manualRefreshVersion.current;
    const timer = window.setTimeout(() => {
      void api.list({ search, operationalStatus: status, vehicleType, page, pageSize }, controller.signal).then((result) => {
        if (controller.signal.aborted || readEpoch.current !== epoch) return;
        const lastPage = Math.max(1, Math.ceil(result.total / pageSize));
        if (page > lastPage) { setPage(lastPage); return; }
        setResult({ query, rows: result.data, total: result.total, error: null });
        setAsOf(Date.now());
        // A failed write is never replayed. Only an explicit refresh followed by
        // an authoritative read of this row releases its quick-action lock.
        const confirmed = result.data.filter((vehicle) => {
          const blockedAt = blockedUpdates.current.get(vehicle.vehicleRef);
          return blockedAt !== undefined && explicitRefresh > blockedAt;
        });
        if (confirmed.length) {
          const refs = new Set(confirmed.map((vehicle) => vehicle.vehicleRef));
          refs.forEach((ref) => blockedUpdates.current.delete(ref));
          setUpdateErrors((current) => Object.fromEntries(Object.entries(current).filter(([ref]) => !refs.has(ref))));
        }
      }).catch((cause) => {
        if (controller.signal.aborted || readEpoch.current !== epoch) return;
        if (cause instanceof FleetApiError && cause.status === 401) callbacks.current.onUnauthorized();
        else setResult({ query, rows: [], total: 0, error: fleetErrorText(cause) });
      });
    }, 150);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [api, search, status, vehicleType, page, query]);

  const refreshList = () => {
    if (loading || pendingUpdates.current.size) return;
    manualRefreshVersion.current += 1;
    setRefresh((value) => value + 1);
  };
  const changeActive = async (vehicle: FleetVehicle, active: boolean) => {
    const ref = vehicle.vehicleRef;
    if (!access.canEdit || loading || vehicle.operationalStatus === "RETIRED"
      || pendingUpdates.current.has(ref) || blockedUpdates.current.has(ref)
      || active === vehicle.availableForCalculation) return;
    const controller = new AbortController();
    pendingUpdates.current.set(ref, controller);
    setUpdating(new Set(pendingUpdates.current.keys()));
    const operationalStatus = active && vehicle.operationalStatus === "UNAVAILABLE" ? "AVAILABLE"
      : !active && vehicle.operationalStatus === "AVAILABLE" ? "UNAVAILABLE" : vehicle.operationalStatus;
    try {
      await api.update(ref, { requestId: crypto.randomUUID(), expectedVersion: vehicle.rowVersion,
        changes: { availableForCalculation: active, ...(operationalStatus !== vehicle.operationalStatus ? { operationalStatus } : {}) } }, controller.signal);
      if (controller.signal.aborted) return;
      // Re-query after the confirmed write; filters and row counts may change.
      // Keep the previous checkbox value until the server has confirmed it.
      readEpoch.current += 1;
      setRefresh((value) => value + 1);
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof FleetApiError && cause.status === 401) callbacks.current.onUnauthorized();
      else {
        blockedUpdates.current.set(ref, manualRefreshVersion.current);
        setUpdateErrors((current) => ({ ...current, [ref]: { code: vehicle.businessCode, message: fleetErrorText(cause) } }));
      }
    } finally {
      pendingUpdates.current.delete(ref);
      if (!controller.signal.aborted) setUpdating(new Set(pendingUpdates.current.keys()));
    }
  };

  const filterClass = "h-10 min-w-0 rounded border border-slate-300 bg-white px-2 text-xs text-slate-800 sm:h-9";
  const number = (value: number | null, unit: string) => value === null ? "—" : `${value.toLocaleString("es", { maximumFractionDigits: 4 })} ${unit}`;
  return <section className="mt-5 min-w-0" aria-labelledby="fleet-heading">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2"><Truck aria-hidden="true" className="h-5 w-5 text-[#003366]" /><h2 id="fleet-heading" className="text-lg font-bold text-[#003366]">Flota vehicular</h2>{!access.canEdit && !(driversEnabled && (access.canAssignDrivers || access.canRequestDrivers || access.canAuthorizeDrivers)) && <span className="text-xs text-slate-500">Consulta</span>}</div>
      <div className="flex items-center gap-1.5">
        <AdministrationHelp title="Flota vehicular"><p>Registre primero la ficha técnica y active el vehículo desde la casilla Activo del listado.</p><p>Activo permite considerarlo en planificación. Para ofrecerse como disponible también debe estar en estado Disponible y dentro de su vigencia. En uso no significa libre.</p><p>En el menú de tres puntos encontrará la ficha y Disponibilidad, donde puede gestionar el estado, la vigencia y el retiro. Un vehículo retirado conserva sus datos y deja de admitir cambios.</p><p>Las características técnicas usadas en cálculos quedan protegidas. La flota no incluye todavía mantenimiento, combustible ni reservas.</p></AdministrationHelp>
        <AdministrationIconAction label="Actualizar flota" disabled={loading || updating.size > 0} onClick={refreshList}><RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></AdministrationIconAction>
        {access.canEdit && <AdministrationIconAction label="Nuevo vehículo" onClick={() => setSelection({ vehicleRef: null, section: "details" })} className="border-[#003366] bg-[#003366] text-white hover:bg-[#00264d]"><Plus aria-hidden="true" className="h-4 w-4" /></AdministrationIconAction>}
      </div>
    </div>
    <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-[minmax(180px,1fr)_160px_160px]">
      <label className="relative col-span-2 block sm:col-span-1"><Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-3 h-4 w-4 text-slate-400 sm:top-2.5" /><input type="search" aria-label="Buscar vehículos" placeholder="Código, matrícula, marca…" maxLength={120} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className={`${filterClass} w-full pl-8`} /></label>
      <select aria-label="Filtrar por estado" value={status} onChange={(event) => { setStatus(event.target.value as FleetStatus | ""); setPage(1); }} className={filterClass}><option value="">Todos los estados</option>{Object.entries(FLEET_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <input aria-label="Filtrar por tipo" placeholder="Tipo de vehículo" maxLength={80} value={vehicleType} onChange={(event) => { setVehicleType(event.target.value); setPage(1); }} className={filterClass} />
    </div>
    {Object.keys(updateErrors).length > 0 && <div role="alert" className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5 text-red-800">
      <div>{Object.values(updateErrors).map((issue) => <p key={issue.code}><strong>{issue.code}:</strong> {issue.message}</p>)}<p>Actualice el listado para comprobar el estado guardado antes de volver a cambiar la casilla.</p></div>
      <button type="button" disabled={loading || updating.size > 0} onClick={refreshList} className="inline-flex min-h-9 items-center gap-1.5 rounded border border-slate-300 px-3 font-medium text-slate-700 disabled:opacity-40"><RefreshCw aria-hidden="true" className="h-4 w-4" />Actualizar listado</button>
    </div>}
    <div className="overflow-hidden rounded border border-slate-200 bg-white">
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tabla de flota vehicular">
        <table className="w-full min-w-[840px] border-collapse text-left text-xs">
          <thead className="bg-slate-50 text-slate-500"><tr>{["Código", "Matrícula", "Tipo", "Marca / modelo", "Peso", "Volumen", "Activo", "Estado", "Acciones"].map((label) => <th key={label} scope="col" className={`border-b border-slate-200 px-3 py-2.5 font-semibold ${["Activo", "Acciones"].includes(label) ? "w-14 text-center" : ""}`}>{label}</th>)}</tr></thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-500"><span role="status">Cargando flota…</span></td></tr>}
            {error && <tr><td colSpan={9} className="px-3 py-6 text-center"><p role="alert" className="mb-2 text-red-800">{error}</p><button type="button" disabled={updating.size > 0} onClick={refreshList} className="inline-flex min-h-9 items-center gap-1.5 rounded border border-slate-300 px-3 font-medium text-slate-700 disabled:opacity-40"><RefreshCw aria-hidden="true" className="h-4 w-4" />Reintentar consulta</button></td></tr>}
            {!loading && !error && rows.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-500">{search || status || vehicleType ? "No hay vehículos que coincidan con estos filtros." : "Todavía no hay vehículos registrados."}</td></tr>}
            {!loading && !error && rows.map((vehicle) => {
              const pending = updating.has(vehicle.vehicleRef);
              const retired = vehicle.operationalStatus === "RETIRED";
              const outsideValidity = vehicle.availableForCalculation && (new Date(vehicle.effectiveFrom).getTime() > asOf
                || vehicle.effectiveTo !== null && new Date(vehicle.effectiveTo).getTime() <= asOf);
              return <tr key={vehicle.vehicleRef} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
              <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-900"><button type="button" disabled={pending} onClick={() => setSelection({ vehicleRef: vehicle.vehicleRef, section: "details" })} className="min-h-9 rounded text-left underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:opacity-40">{vehicle.businessCode}</button></td>
              <td className="whitespace-nowrap px-3 py-2 text-slate-700">{vehicle.plate || "—"}</td>
              <td className="max-w-48 px-3 py-2 text-slate-600">{vehicle.vehicleType}</td>
              <td className="max-w-56 px-3 py-2 text-slate-600">{[vehicle.brand, vehicle.model, vehicle.modelYear].filter(Boolean).join(" · ") || "—"}</td>
              <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600">{number(vehicle.capacityWeight, WEIGHT_LABELS[vehicle.weightUnit])}</td>
              <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600">{number(vehicle.capacityVolume, VOLUME_LABELS[vehicle.volumeUnit])}</td>
              <td className="px-2 py-1 text-center"><label className="inline-flex min-h-10 min-w-10 items-center justify-center" aria-busy={pending}>
                <input type="checkbox" aria-label={`Activo ${vehicle.businessCode}`} checked={vehicle.availableForCalculation}
                  disabled={!access.canEdit || retired || pending || Boolean(updateErrors[vehicle.vehicleRef])}
                  onChange={(event) => void changeActive(vehicle, event.currentTarget.checked)}
                  className="h-4 w-4 accent-[#003366] disabled:opacity-40" />
                {pending && <span role="status" className="sr-only">Actualizando {vehicle.businessCode}</span>}
              </label></td>
              <td className="whitespace-nowrap px-3 py-2"><span className={`inline-flex rounded px-1.5 py-1 text-[11px] ${vehicle.operationalStatus === "AVAILABLE" ? "bg-emerald-50 text-emerald-800" : vehicle.operationalStatus === "IN_USE" ? "bg-blue-50 text-blue-800" : "bg-slate-100 text-slate-600"}`}>{FLEET_STATUS_LABELS[vehicle.operationalStatus]}</span>{outsideValidity && <span className="mt-1 block text-[11px] text-amber-800">Fuera de vigencia</span>}</td>
              <td className="px-2 py-1 text-center"><DropdownMenu>
                <DropdownMenuTrigger asChild><button type="button" aria-label={`Acciones de ${vehicle.businessCode}`} disabled={pending} className="inline-flex h-10 w-10 items-center justify-center rounded text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:opacity-40 sm:h-8 sm:w-8"><MoreHorizontal aria-hidden="true" className="h-4 w-4" /></button></DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="text-xs">
                  <DropdownMenuItem onSelect={() => setSelection({ vehicleRef: vehicle.vehicleRef, section: "details" })}>{access.canEdit && !retired ? <Pencil aria-hidden="true" /> : <Eye aria-hidden="true" />}{access.canEdit && !retired ? "Editar ficha" : "Consultar ficha"}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setSelection({ vehicleRef: vehicle.vehicleRef, section: "availability" })}><CalendarDays aria-hidden="true" />{access.canEdit && !retired ? "Disponibilidad" : "Consultar disponibilidad"}</DropdownMenuItem>
                  {driversEnabled && <DropdownMenuItem onSelect={() => setSelection({ vehicleRef: vehicle.vehicleRef, section: "drivers" })}><UsersRound aria-hidden="true" />Choferes</DropdownMenuItem>}
                </DropdownMenuContent>
              </DropdownMenu></td>
            </tr>; })}
          </tbody>
        </table>
      </div>
      <footer className="flex items-center justify-between gap-2 border-t border-slate-200 px-3 py-2 text-xs text-slate-500">
        <span aria-live="polite">{loading ? "Consultando…" : `${total} vehículo${total === 1 ? "" : "s"}`}</span>
        <div className="flex items-center gap-2"><AdministrationIconAction label="Página anterior" disabled={loading || Boolean(error) || page === 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft aria-hidden="true" className="h-4 w-4" /></AdministrationIconAction><span>Página {page} de {Math.max(1, Math.ceil(total / pageSize))}</span><AdministrationIconAction label="Página siguiente" disabled={loading || Boolean(error) || page * pageSize >= total} onClick={() => setPage((value) => value + 1)}><ChevronRight aria-hidden="true" className="h-4 w-4" /></AdministrationIconAction></div>
      </footer>
    </div>
    {selection?.section === "drivers" ? <Suspense fallback={<p role="status" className="py-3 text-xs text-slate-500">Cargando gestión de choferes…</p>}><FleetDriversDialog key={selection.vehicleRef} api={driversApi} vehicleRef={selection.vehicleRef} access={access} onClose={() => setSelection(null)} onUnauthorized={onUnauthorized} /></Suspense> : selection && <FleetEditor key={`${selection.vehicleRef || "new"}:${selection.section}`} api={api} vehicleRef={selection.vehicleRef} section={selection.section} canEdit={access.canEdit} onClose={() => { setSelection(null); setRefresh((value) => value + 1); }} onSaved={() => setRefresh((value) => value + 1)} onUnauthorized={onUnauthorized} />}
  </section>;
}
