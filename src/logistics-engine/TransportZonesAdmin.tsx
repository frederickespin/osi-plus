import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapPinned, Plus, RefreshCw, Search } from "lucide-react";
import { AdministrationHelp, AdministrationIconAction } from "@/administration/AdministrationHelp";
import { COMPACT_FORM_FIELD } from "@/components/ui/compact-form";
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
  const [editor, setEditor] = useState<{ zone: TransportZone | null; requestId: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const scope = useRef(0);
  const latest = useMemo(() => {
    const bySeries = new Map<string, TransportZone>();
    for (const zone of zones) if (!bySeries.has(zone.seriesRef) || bySeries.get(zone.seriesRef)!.version < zone.version) bySeries.set(zone.seriesRef, zone);
    return [...bySeries.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [zones]);
  const visible = useMemo(() => latest.filter((zone) => (state === "ALL" || zone.state === state) && `${zone.code} ${zone.name} ${zone.vehicleType || ""}`.toLocaleLowerCase("es").includes(search.trim().toLocaleLowerCase("es"))), [latest, search, state]);
  const vehicleTypes = useMemo(() => [...new Set(latest.map((zone) => zone.vehicleType).filter((value): value is string => Boolean(value)))].sort(), [latest]);

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

  const open = (zone: TransportZone | null) => { if (uncertain) return; setEditor({ zone, requestId: crypto.randomUUID() }); setSaveError(null); setNotice(null); };
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
      setNotice(`${saved.name}: versión ${saved.version} guardada.`);
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
      setNotice("Listado actualizado. Revise la versión y el estado de la zona antes de iniciar otro cambio.");
    }
  };

  if (!access.canZonesView) return null;
  return <section className="space-y-3" data-testid="transport-zones-admin">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-1"><h3 className="text-sm font-semibold text-slate-900">Zonas y costos de transporte</h3><AdministrationHelp title="Zonas y costos"><p>Configure el perímetro, el tipo de vehículo y los costos que corresponden a cada zona. Las tarifas y el rendimiento son datos de su empresa.</p><p>Una zona activa puede aplicarse a cotizaciones, servicios y visitas. Sus cambios crean versiones; las publicaciones anteriores conservan sus tarifas.</p></AdministrationHelp></div>
      <div className="flex items-center gap-2"><AdministrationIconAction label="Actualizar zonas" disabled={loading || saving} onClick={() => void (uncertain ? reconcile() : load())}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></AdministrationIconAction>{access.canZonesManage && <button type="button" disabled={loading || saving || uncertain || Boolean(error)} onClick={() => open(null)} className="inline-flex min-h-10 items-center gap-1.5 rounded bg-[#003366] px-3 text-xs font-semibold text-white disabled:opacity-40"><Plus className="h-4 w-4" />Nueva zona</button>}</div>
    </div>
    <div className="flex flex-wrap gap-2"><label className="relative min-w-48 flex-1"><span className="sr-only">Buscar zonas</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Código, nombre o tipo de vehículo…" className={cn(COMPACT_FORM_FIELD, "w-full pl-9 pr-3")} /></label><select aria-label="Estado de la zona" value={state} onChange={(event) => setState(event.target.value)} className={COMPACT_FORM_FIELD}><option value="ALL">Todos los estados</option>{Object.entries(STATE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-800">{error}</p>}
    {uncertain && !editor && <p role="alert" className="rounded border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">El guardado anterior no se confirmó. Actualice las zonas para consultar su estado antes de iniciar otro cambio.</p>}
    {notice && <p role="status" className="rounded border border-blue-100 bg-blue-50 p-3 text-xs text-[#003366]">{notice}</p>}
    <div className="overflow-x-auto rounded border border-slate-200 bg-white"><table className="w-full min-w-[810px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-3 font-medium">Zona</th><th className="px-3 py-3 font-medium">Cobertura</th><th className="px-3 py-3 font-medium">Vehículo</th><th className="px-3 py-3 font-medium">Cálculo</th><th className="px-3 py-3 font-medium">Usos</th><th className="px-3 py-3 font-medium">Estado</th><th className="px-3 py-3 font-medium">Versión</th><th className="px-3 py-3 text-right font-medium">Acciones</th></tr></thead><tbody>
      {visible.map((zone) => <tr key={zone.ruleRef} className="border-t hover:bg-slate-50"><td className="px-3 py-3"><span className="block font-medium text-slate-900">{zone.name}</span><span className="text-[11px] text-slate-500">{zone.code}</span></td><td className="px-3 py-3 text-slate-600">{zone.zoneType === "METRO" ? "Metropolitana" : "Fuera de zona metro"}</td><td className="px-3 py-3 text-slate-600">{zone.vehicleType || "Todos"}</td><td className="px-3 py-3"><span className="block">{zone.mode === "FACTOR" ? `Factor ${zone.factor ?? "pendiente"}` : "Por renglones"}</span><span className="text-[11px] text-slate-500">{zone.currency} · {zone.components.length} conceptos</span></td><td className="max-w-40 px-3 py-3 text-slate-600">{zone.purposes.map((purpose) => PURPOSE_LABELS[purpose]).join(", ")}</td><td className="px-3 py-3"><span className={`rounded px-2 py-1 text-[11px] ${zone.state === "ACTIVE" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{STATE_LABELS[zone.state]}</span></td><td className="px-3 py-3 text-slate-600">v{zone.version}</td><td className="px-3 py-3 text-right"><button type="button" disabled={uncertain || loading || Boolean(error)} onClick={() => open(zone)} className="inline-flex min-h-9 items-center gap-1.5 rounded border px-2.5 font-medium text-[#003366]"><MapPinned className="h-3.5 w-3.5" />{access.canZonesManage ? "Editar zona" : "Ver zona"}</button></td></tr>)}
      {!visible.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500">{loading ? "Cargando zonas…" : search || state !== "ALL" ? "No hay zonas para este filtro." : "Aún no hay zonas configuradas. Defina los perímetros y costos de su empresa."}</td></tr>}
    </tbody></table></div>
    <p className="text-[11px] text-slate-500">{visible.length} {visible.length === 1 ? "zona" : "zonas"}</p>
    {editor && <Suspense fallback={<p role="status" className="text-xs text-slate-500">Abriendo zona…</p>}><TransportZoneEditor key={editor.zone?.ruleRef || "new"} zone={editor.zone} vehicleTypes={vehicleTypes} saving={saving} error={saveError} uncertain={uncertain} readOnly={!access.canZonesManage} onSave={(input) => void save(input)} onClose={() => { if (!saving) setEditor(null); }} onRefresh={() => void reconcile()} /></Suspense>}
  </section>;
}
