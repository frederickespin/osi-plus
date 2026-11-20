import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, MapPinned, Plus, RefreshCw, Search } from "lucide-react";
import { AdministrationHelp, AdministrationIconAction } from "@/administration/AdministrationHelp";
import { FleetApi } from "@/admin-fleet/api";
import { isAdminFleetEnabled } from "@/admin-fleet/mode";
import { COMPACT_FORM_FIELD } from "@/components/ui/compact-form";
import { getMembershipRef } from "@/lib/sessionStore";
import { cn } from "@/lib/utils";
import { isTransportUnauthorized, transportApi, transportErrorMessage, TransportRequestError, type TransportZone, type TransportZoneInput } from "./transportApi";
import type { TransportUiAccess } from "./transportAccess";
import { PURPOSE_LABELS, STATE_LABELS } from "./transportPresentation";

const TransportZoneEditor = lazy(() => import("./TransportZoneEditor"));
type Props = Readonly<{ authorization?: string; access: TransportUiAccess; onUnauthorized(): void }>;

export default function TransportZonesAdmin({ authorization, access, onUnauthorized }: Props) {
  const [zones, setZones] = useState<readonly TransportZone[]>([]);
  const [search, setSearch] = useState("");
  const [state, setState] = useState("ALL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ zone: TransportZone | null; area: TransportZone | null; requestId: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [fleetTypes, setFleetTypes] = useState<{ authorization?: string; membership: string; names: readonly string[] } | null>(null);
  const membership = getMembershipRef();
  const editing = editor !== null && access.canZonesManage;
  const scope = useRef(0);
  const latest = useMemo(() => {
    const bySeries = new Map<string, TransportZone>();
    for (const zone of zones) if (!bySeries.has(zone.seriesRef) || bySeries.get(zone.seriesRef)!.version < zone.version) bySeries.set(zone.seriesRef, zone);
    return [...bySeries.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [zones]);
  const visible = useMemo(() => latest.filter((zone) => (state === "ALL" || zone.state === state) && `${zone.code} ${zone.name} ${zone.city} ${zone.sector || ""} ${zone.baseName} ${zone.vehicleType || ""}`.toLocaleLowerCase("es").includes(search.trim().toLocaleLowerCase("es"))), [latest, search, state]);
  const vehicleTypes = useMemo(() => {
    const names = fleetTypes && fleetTypes.authorization === authorization && fleetTypes.membership === membership ? fleetTypes.names : [];
    return [...new Set([...names, ...latest.flatMap(({ vehicleType }) => vehicleType ? [vehicleType] : [])])].sort((a, b) => a.localeCompare(b, "es"));
  }, [fleetTypes, latest, authorization, membership]);
  const bases = useMemo(() => {
    const registered = new Map<string, { baseName: string; baseAddress: string }>();
    for (const { baseName, baseAddress } of latest) {
      if (!baseName || !baseAddress || baseAddress === "Dirección pendiente de confirmar") continue;
      registered.set(JSON.stringify([baseName, baseAddress]), { baseName, baseAddress });
    }
    return [...registered.values()].sort((a, b) => a.baseName.localeCompare(b.baseName, "es"));
  }, [latest]);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!access.canZonesView) return null;
    setLoading(true);
    setError(null);
    try {
      const data = await transportApi.zones(authorization, signal);
      if (signal?.aborted) return null;
      setZones(data);
      return data;
    } catch (cause) {
      if (signal?.aborted) return null;
      if (isTransportUnauthorized(cause)) onUnauthorized();
      else setError(transportErrorMessage(cause));
      return null;
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [access.canZonesView, authorization, onUnauthorized]);

  useEffect(() => {
    const controller = new AbortController();
    scope.current += 1;
    void load(controller.signal);
    return () => { controller.abort(); scope.current += 1; };
  }, [load]);

  useEffect(() => {
    if (!editing || !membership || !isAdminFleetEnabled()) return;
    const controller = new AbortController();
    const api = new FleetApi(() => authorization || null, globalThis.fetch.bind(globalThis), () => membership);
    void api.options(controller.signal).then(({ types }) => {
      if (!controller.signal.aborted) setFleetTypes({ authorization, membership, names: types.map(({ name }) => name) });
    }).catch(() => {
      if (!controller.signal.aborted) setFleetTypes(null);
    });
    return () => controller.abort();
  }, [authorization, editing, membership]);

  const open = (zone: TransportZone | null, area: TransportZone | null = null) => { if (uncertain) return; setEditor({ zone, area, requestId: crypto.randomUUID() }); setSaveError(null); setNotice(null); };
  const save = async (input: TransportZoneInput) => {
    if (!access.canZonesManage || !editor || saving || uncertain) return;
    const currentScope = scope.current;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await transportApi.versionZone(authorization, input, undefined, editor.requestId);
      if (currentScope !== scope.current) return;
      setZones((current) => [...current.filter((zone) => zone.ruleRef !== saved.ruleRef), saved]);
      setEditor(null);
      setNotice(saved.state === "DRAFT" ? `${saved.name} · borrador guardado.` : `${saved.name} · versión ${saved.version} guardada.`);
      void load();
    } catch (cause) {
      if (currentScope !== scope.current) return;
      if (isTransportUnauthorized(cause)) onUnauthorized();
      setSaveError(transportErrorMessage(cause));
      setUncertain(cause instanceof TransportRequestError && (cause.uncertain || cause.status === 409));
    } finally { if (currentScope === scope.current) setSaving(false); }
  };

  const reconcile = async () => {
    const loaded = await load();
    if (loaded) {
      setUncertain(false);
      setEditor(null);
      setNotice("Listado actualizado. Revise la versión y el estado de la ubicación antes de iniciar otro cambio.");
    }
  };

  if (!access.canZonesView) return null;
  if (editor) return <Suspense fallback={<p role="status" className="text-xs text-slate-500">Abriendo ubicación…</p>}>
    <TransportZoneEditor
      key={editor.requestId} zone={editor.zone} area={editor.area}
      vehicleTypes={vehicleTypes} bases={bases} saving={saving} error={saveError} uncertain={uncertain}
      readOnly={!access.canZonesManage} onSave={(input) => void save(input)}
      onClose={() => { if (!saving) setEditor(null); }} onRefresh={() => void reconcile()}
    />
  </Suspense>;
  return <section className="space-y-3" data-testid="transport-zones-admin">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-1"><h3 className="text-sm font-semibold text-slate-900">Ciudades, sectores y costos</h3><AdministrationHelp title="Ciudades y sectores"><p>Registre cada ciudad o sector con ayuda del mapa y confirme sus kilómetros viales desde la oficina o almacén de salida.</p><p>Visitas y servicios en camión pueden usar el mismo perímetro, pero deben tener perfiles distintos cuando cambien la ruta, el vehículo o los costos.</p><p>La clasificación metropolitana se conserva únicamente para reglas operativas. El costo vial se obtiene de la distancia, el perfil del vehículo y los peajes.</p></AdministrationHelp></div>
      <div className="flex items-center gap-2"><AdministrationIconAction label="Actualizar ubicaciones" disabled={loading || saving} onClick={() => void (uncertain ? reconcile() : load())}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></AdministrationIconAction>{access.canZonesManage && <button type="button" disabled={loading || saving || uncertain || Boolean(error)} onClick={() => open(null)} className="inline-flex min-h-10 items-center gap-1.5 rounded bg-[#003366] px-3 text-xs font-semibold text-white disabled:opacity-40"><Plus className="h-4 w-4" />Nueva ciudad o sector</button>}</div>
    </div>
    <div className="flex flex-wrap gap-2"><label className="relative min-w-48 flex-1"><span className="sr-only">Buscar ciudades o sectores</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ciudad, sector, código o vehículo…" className={cn(COMPACT_FORM_FIELD, "w-full pl-9 pr-3")} /></label><select aria-label="Estado de la ubicación" value={state} onChange={(event) => setState(event.target.value)} className={COMPACT_FORM_FIELD}><option value="ALL">Todos los estados</option>{Object.entries(STATE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-800">{error}</p>}
    {uncertain && <p role="alert" className="rounded border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">El guardado anterior no se confirmó. Actualice las ubicaciones para consultar su estado antes de iniciar otro cambio.</p>}
    {notice && <p role="status" className="rounded border border-blue-100 bg-blue-50 p-3 text-xs text-[#003366]">{notice}</p>}
    <div className="overflow-x-auto rounded border border-slate-200 bg-white"><table className="w-full min-w-[930px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-3 font-medium">Ciudad / sector</th><th className="px-3 py-3 font-medium">Perfil</th><th className="px-3 py-3 font-medium">Base y distancia</th><th className="px-3 py-3 font-medium">Vehículo</th><th className="px-3 py-3 font-medium">Usos</th><th className="px-3 py-3 font-medium">Estado</th><th className="px-3 py-3 font-medium">Versión</th><th className="px-3 py-3 text-right font-medium">Acciones</th></tr></thead><tbody>
      {visible.map((zone) => <tr key={zone.ruleRef} className="border-t hover:bg-slate-50">
        <td className="px-3 py-2"><span className="block font-medium text-slate-900">{zone.locationType === "SECTOR" ? `${zone.sector}, ${zone.city}` : zone.city}</span><span className="text-[11px] text-slate-500">{!zone.purposes.length ? "Operación pendiente" : zone.zoneType === "METRO" ? "Metropolitana" : "Fuera de zona metro"}</span></td>
        <td className="px-3 py-2"><span className="block text-slate-700">{zone.name}</span><span className="text-[11px] text-slate-500">{zone.code}</span></td>
        <td className="px-3 py-2"><span className="block text-slate-700">{zone.baseName || "Base pendiente"}</span>{zone.baseName && <span className="text-[11px] text-slate-500">{zone.referenceDistanceKm === null ? "Km pendientes" : `${zone.referenceDistanceKm} km viales`}</span>}</td>
        <td className="px-3 py-2 text-slate-600">{zone.vehicleType || (zone.purposes.length ? "Todos" : "—")}</td>
        <td className="max-w-40 px-3 py-2 text-slate-600">{zone.purposes.map((purpose) => PURPOSE_LABELS[purpose]).join(", ") || "—"}</td>
        <td className="px-3 py-2"><span className={`rounded px-2 py-1 text-[11px] ${zone.state === "ACTIVE" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{STATE_LABELS[zone.state]}</span></td>
        <td className="px-3 py-2 text-slate-600">v{zone.version}</td>
        <td className="px-3 py-2">
          <div className="flex justify-end gap-1">
            {access.canZonesManage && <AdministrationIconAction label="Reutilizar perímetro" disabled={uncertain || loading || Boolean(error)} onClick={() => open(null, zone)}><Copy className="h-3.5 w-3.5" aria-hidden="true" /></AdministrationIconAction>}
            <AdministrationIconAction label={access.canZonesManage ? "Editar" : "Ver"} disabled={uncertain || loading || Boolean(error)} onClick={() => open(zone)}><MapPinned className="h-3.5 w-3.5" aria-hidden="true" /></AdministrationIconAction>
          </div>
        </td>
      </tr>)}
      {!visible.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500">{loading ? "Cargando ubicaciones…" : search || state !== "ALL" ? "No hay ciudades o sectores para este filtro." : "Aún no hay ciudades o sectores configurados. Registre su perímetro y perfil de costos."}</td></tr>}
    </tbody></table></div>
    <p className="text-[11px] text-slate-500">{visible.length} {visible.length === 1 ? "ubicación" : "ubicaciones"}</p>
  </section>;
}
