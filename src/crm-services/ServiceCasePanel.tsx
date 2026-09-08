import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, History, Plus, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CrmServicesApi, CrmServicesApiError, type CaseServiceConfigurationWorkspace, type CaseServiceWorkspace } from "./api";

type Props = Readonly<{ caseRef: string; authorization?: string; canUpdate: boolean; canConfigure?: boolean; canViewConfiguration?: boolean; onUnauthorized(): void }>;
function errorCopy(error: unknown) {
  const code = error instanceof CrmServicesApiError ? error.code : "CRM_SERVICES_UNAVAILABLE";
  return ({ CRM_SERVICES_VERSION_CONFLICT: "La selección cambió. Recargue antes de guardar.", CRM_SERVICES_PRIMARY_INCOMPATIBLE: "El servicio principal ya no es compatible con el modo del ICP.", CRM_SERVICES_COMPLEMENTARY_NOT_ALLOWED: "Un servicio incluido ya no está permitido para el principal.", CRM_SERVICES_DISABLED: "Servicios permanece desactivado en este entorno." } as Record<string, string>)[code] || "No fue posible cargar o guardar Servicios.";
}

export default function ServiceCasePanel({ caseRef, authorization, canUpdate, canConfigure = false, canViewConfiguration = false, onUnauthorized }: Props) {
  const api = useMemo(() => new CrmServicesApi(() => authorization || null), [authorization]);
  const [workspace, setWorkspace] = useState<CaseServiceWorkspace | null>(null);
  const [primaryRef, setPrimaryRef] = useState("");
  const [complementaryRefs, setComplementaryRefs] = useState<readonly string[]>([]);
  const [defaultRef, setDefaultRef] = useState<string | null>(null);
  const [others, setOthers] = useState<readonly string[]>([]);
  const [otherDraft, setOtherDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configuration, setConfiguration] = useState<CaseServiceConfigurationWorkspace | null>(null);
  const [packageVersionRef, setPackageVersionRef] = useState("");
  const [policyVersionRef, setPolicyVersionRef] = useState("");
  const [durationHours, setDurationHours] = useState("");
  const [configurationSaving, setConfigurationSaving] = useState(false);
  const load = useCallback(() => {
    const controller = new AbortController(); setLoading(true); setError(null);
    void api.workspace(caseRef, controller.signal).then((value) => {
      setWorkspace(value); setPrimaryRef(value.selection.primary?.serviceRef || ""); setComplementaryRefs(value.selection.complementaries.map((item) => item.serviceRef)); setDefaultRef(value.selection.defaultCombinationRef); setOthers(value.selection.otherServices.map((item) => item.description)); setDirty(false);
    }).catch((cause) => { if (cause instanceof CrmServicesApiError && cause.status === 401) onUnauthorized(); else if (!controller.signal.aborted) setError(errorCopy(cause)); }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [api, caseRef, onUnauthorized]);
  useEffect(load, [load]);
  const loadConfiguration = useCallback(() => {
    if (!canViewConfiguration) { setConfiguration(null); return () => undefined; }
    const controller = new AbortController();
    void api.caseConfiguration(caseRef, controller.signal).then((value) => { setConfiguration(value); setPackageVersionRef(value.packages.find((item) => item.packageRef === value.current?.packageRef && item.version === value.current?.packageVersion)?.versionRef || ""); setPolicyVersionRef(value.materialPolicies.find((item) => item.policyRef === value.current?.materialPolicyRef && item.version === value.current?.materialPolicyVersion)?.versionRef || ""); setDurationHours(String((value.current as unknown as { duration?: { hours?: number } } | null)?.duration?.hours || "")); }).catch((cause) => { if (cause instanceof CrmServicesApiError && cause.status === 401) onUnauthorized(); else if (!controller.signal.aborted) setError(errorCopy(cause)); });
    return () => controller.abort();
  }, [api, canViewConfiguration, caseRef, onUnauthorized]);
  useEffect(loadConfiguration, [loadConfiguration]);
  const compatible = useMemo(() => workspace?.allowedComplementaries.filter((item) => item.primaryServiceRef === primaryRef).map((item) => item.service) || [], [primaryRef, workspace]);
  const changePrimary = (next: string) => {
    if (dirty && (complementaryRefs.length > 0 || others.length > 0) && !window.confirm("Cambiar el servicio principal reemplazará selecciones manuales incompatibles por la combinación predeterminada. ¿Continuar?")) return;
    const preset = workspace?.defaults.find((item) => item.primaryServiceRef === next && item.isDefault);
    setPrimaryRef(next); setComplementaryRefs(preset?.complementaryRefs || []); setDefaultRef(preset?.combinationRef || null); setDirty(true);
  };
  const toggle = (ref: string) => { setComplementaryRefs((current) => current.includes(ref) ? current.filter((item) => item !== ref) : [...current, ref]); setDirty(true); };
  const save = async () => {
    if (!workspace || !primaryRef) return; setSaving(true); setError(null);
    try {
      await api.saveSelection(caseRef, { requestId: crypto.randomUUID(), expectedRevision: workspace.selection.revision, primaryServiceRef: primaryRef, complementaryRefs, defaultCombinationRef: defaultRef, otherServices: others.map((description) => ({ description })) });
      load();
    } catch (cause) { if (cause instanceof CrmServicesApiError && cause.status === 401) onUnauthorized(); else setError(errorCopy(cause)); } finally { setSaving(false); }
  };
  const saveConfiguration = async () => {
    if (!workspace?.selection.selectionRef || !configuration) return; setConfigurationSaving(true); setError(null);
    try { await api.saveCaseConfiguration(caseRef, { requestId: crypto.randomUUID(), expectedRevision: configuration.current?.revision || 0, serviceSelectionRef: workspace.selection.selectionRef, serviceSelectionRevision: workspace.selection.revision, packageVersionRef: packageVersionRef || null, materialPolicyVersionRef: policyVersionRef || null, surveyPublicationRef: null, commercialAgreementRef: null, preference: {}, duration: durationHours ? { hours: Number(durationHours) } : {}, source: packageVersionRef ? "PACKAGE" : "MANUAL_RESOLUTION", overrides: [] }); loadConfiguration(); }
    catch (cause) { if (cause instanceof CrmServicesApiError && cause.status === 401) onUnauthorized(); else setError(errorCopy(cause)); } finally { setConfigurationSaving(false); }
  };
  if (loading) return <div role="status" className="p-8 text-center text-sm text-slate-500">Cargando Servicios autorizados…</div>;
  if (error && !workspace) return <div role="alert" className="m-4 border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}<Button className="ml-3" size="sm" variant="outline" onClick={load}>Reintentar</Button></div>;
  if (!workspace) return null;
  return <section role="tabpanel" aria-labelledby="services-tab" className="mx-auto max-w-5xl p-4" data-testid="case-services-panel">
    <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-3"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#0070a8]">Modo/Alcance — Servicio principal — Servicios que incluye</p><h2 className="mt-1 text-xl font-black text-[#003366]">Servicios del caso</h2><p className="mt-1 text-xs text-slate-500">Cada guardado crea una revisión histórica; no modifica el ICP ni los defaults globales.</p></div><span className="flex items-center gap-1 text-xs text-slate-500"><History className="h-4 w-4" />{workspace.selection.historyCount} revisión(es)</span></header>
    <div className="mt-4 grid gap-4 lg:grid-cols-[180px_minmax(230px,1fr)_minmax(280px,1.35fr)]">
      <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Modo / Alcance<input readOnly value={workspace.mode === "LOCAL" ? "LOCAL / NACIONAL" : workspace.mode === "EXPORT" ? "EXPORTACIÓN" : "IMPORTACIÓN"} className="mt-1 h-10 w-full rounded-lg border bg-slate-100 px-3 text-sm font-semibold text-slate-800" /></label>
      <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Servicio principal<select disabled={!canUpdate} value={primaryRef} onChange={(event) => changePrimary(event.target.value)} className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm text-slate-900"><option value="">Seleccionar servicio</option>{workspace.primaries.map((item) => <option key={item.serviceRef} value={item.serviceRef}>{item.name}</option>)}</select></label>
      <fieldset disabled={!canUpdate || !primaryRef} className="min-w-0"><legend className="text-xs font-bold uppercase tracking-wide text-slate-500">Servicios que incluye</legend><div className="mt-1 divide-y rounded-lg border bg-white">{compatible.map((item) => <label key={item.serviceRef} className="flex min-h-10 items-center gap-2 px-3 text-sm"><input type="checkbox" checked={complementaryRefs.includes(item.serviceRef)} onChange={() => toggle(item.serviceRef)} /><span className="min-w-0 flex-1 truncate">{item.name}</span>{complementaryRefs.includes(item.serviceRef) && <Check className="h-4 w-4 text-emerald-600" />}</label>)}{compatible.length === 0 && <p className="p-3 text-xs text-slate-500">Seleccione un principal con complementarios permitidos.</p>}</div></fieldset>
    </div>
    <div className="mt-4 border-t border-slate-200 pt-3"><div className="flex flex-wrap items-end gap-2"><label className="min-w-60 flex-1 text-xs font-bold uppercase tracking-wide text-slate-500">Otro servicio<input disabled={!canUpdate} value={otherDraft} onChange={(event) => setOtherDraft(event.target.value)} maxLength={320} placeholder="Descripción para clasificación" className="mt-1 h-10 w-full rounded-lg border px-3 text-sm normal-case tracking-normal" /></label><Button type="button" variant="outline" disabled={!canUpdate || otherDraft.trim().length < 3} onClick={() => { setOthers((current) => [...current, otherDraft.trim()]); setOtherDraft(""); setDirty(true); }}><Plus />Agregar</Button></div>{others.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{others.map((description, index) => <span key={`${description}-${index}`} className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">Pendiente de clasificación · {description}{canUpdate && <button aria-label={`Quitar ${description}`} onClick={() => { setOthers((current) => current.filter((_, position) => position !== index)); setDirty(true); }}><X className="h-3.5 w-3.5" /></button>}</span>)}</div>}</div>
    {error && <p role="alert" className="mt-3 flex items-center gap-2 bg-red-50 p-3 text-sm text-red-800"><AlertTriangle className="h-4 w-4" />{error}</p>}
    <footer className="mt-4 flex justify-end"><Button disabled={!canUpdate || !dirty || !primaryRef || saving} onClick={() => void save()}><Save />{saving ? "Guardando…" : "Guardar selección"}</Button></footer>
    {canViewConfiguration && <section className="mt-6 border-t-2 border-[#003366] pt-4" data-testid="case-service-configuration"><div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-[#0070a8]">Después de Survey · antes de Costing</p><h3 className="text-lg font-black text-[#003366]">Configuración final del caso</h3><p className="text-xs text-slate-500">Snapshot inmutable. El Motor consume recursos; Costing no reinterpreta el paquete.</p></div><span className="rounded bg-slate-100 px-2 py-1 text-xs font-bold">Revisión {configuration?.current?.revision || 0}</span></div>{configuration && <><div className="mt-3 grid gap-3 md:grid-cols-3"><label className="text-xs font-bold">Paquete publicado<select disabled={!canConfigure || !workspace.selection.selectionRef} value={packageVersionRef} onChange={(event) => { setPackageVersionRef(event.target.value); setPolicyVersionRef(""); }} className="mt-1 h-10 w-full rounded border px-2"><option value="">Resolución manual</option>{configuration.packages.map((item) => <option key={item.versionRef} value={item.versionRef}>{item.code} · {item.name} · v{item.version}</option>)}</select></label><label className="text-xs font-bold">Política de materiales<select disabled={!canConfigure} value={policyVersionRef} onChange={(event) => setPolicyVersionRef(event.target.value)} className="mt-1 h-10 w-full rounded border px-2"><option value="">Sin política confirmada</option>{configuration.materialPolicies.filter((item) => !item.packageVersionRef || item.packageVersionRef === packageVersionRef).map((item) => <option key={item.versionRef} value={item.versionRef}>{item.code} · {item.standardCode} · v{item.version}</option>)}</select></label><label className="text-xs font-bold">Duración asumida (horas)<input disabled={!canConfigure} type="number" min="0" value={durationHours} onChange={(event) => setDurationHours(event.target.value)} className="mt-1 h-10 w-full rounded border px-2" /></label></div><div className="mt-3 overflow-x-auto border"><div className="grid min-w-[700px] grid-cols-[120px_minmax(180px,1fr)_100px_110px_120px] border-b bg-slate-50 px-3 py-2 text-[10px] font-black uppercase text-slate-500"><span>Tipo</span><span>Requerimiento</span><span>Cantidad</span><span>Disposición</span><span>Fuente</span></div>{configuration.current?.items.map((item) => <div key={item.itemRef} className="grid min-w-[700px] grid-cols-[120px_minmax(180px,1fr)_100px_110px_120px] border-b px-3 py-2 text-xs"><span>{item.kind}</span><strong>{item.name}</strong><span>{item.quantity ?? item.hours ?? item.days ?? "—"} {item.unitCode || ""}</span><span>{item.disposition || item.chargeType || "—"}</span><span>{item.source}</span></div>)}{!configuration.current && <p className="p-4 text-xs text-slate-500">Aún no existe configuración final. Seleccione una revisión de Servicios y resuelva paquete/recursos.</p>}</div>{configuration.current?.conflicts.some((item) => item.state === "OPEN") && <p role="alert" className="mt-3 bg-amber-50 p-3 text-sm font-semibold text-amber-900">Existe un conflicto de configuraciones equivalentes. Debe resolverse administrativamente; no se eligió una al azar.</p>}<div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500"><span>Precedencia: override del caso → acuerdo comercial → paquete → modo/servicio → resolución manual.</span><Button disabled={!canConfigure || !workspace.selection.selectionRef || configurationSaving} onClick={() => void saveConfiguration()}><Save />{configurationSaving ? "Confirmando…" : "Confirmar configuración"}</Button></div></>}</section>}
  </section>;
}
