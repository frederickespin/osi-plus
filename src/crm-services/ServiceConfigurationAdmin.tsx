import { useEffect, useMemo, useRef, useState } from "react";
import { AdministrationHelp, AdministrationIconAction } from "@/administration/AdministrationHelp";
import { Boxes, Layers3, PackagePlus, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { COMPACT_FORM_DIALOG, COMPACT_FORM_FIELD } from "@/components/ui/compact-form";
import { NumericInput } from "@/components/ui/numeric-input";
import type { CrmServicesUiAccess } from "./access";
import { CrmServicesApi, CrmServicesApiError, type ServiceCatalogItem, type ServiceMaterialPolicy, type ServiceMode, type ServicePackage } from "./api";
import ServiceCatalogAdmin from "./ServiceCatalogAdmin";
import MaterialPolicySheet from "./MaterialPolicySheet";
import { draftFromPolicy, newPolicyDraft, policySavePayload, validatePolicyDraft, type PolicyDraft } from "./materialPolicyDraft";

type Props = Readonly<{ authorization?: string; access: CrmServicesUiAccess; onUnauthorized(): void }>;
type Tab = "CATALOG" | "PACKAGES" | "MATERIALS";
type NewModeDraft = Readonly<{ modeRef: null; code: string; scope: "LOCAL" | "EXPORT" | "IMPORT"; name: string; description: null; state: "DRAFT"; version: 0 }>;
const MODE_SCOPES = [
  { code: "LOCAL", label: "Local / Nacional" }, { code: "EXPORT", label: "Exportación" }, { code: "IMPORT", label: "Importación" },
] as const;
type RequirementDraft = Readonly<{ kind: "PERSONNEL" | "MATERIAL" | "ASSET" | "VEHICLE" | "TRANSPORT" | "DURATION" | "CRATING"; code: string | null; name: string; quantity: string; unitCode: string; hours: string; days: string; phaseCode: string | null; configuration: Readonly<Record<string, unknown>>; authorityRef: string; disposition: "" | "CONSUMED" | "RENTED" | "RETURNABLE" | "USAGE_CHARGE"; chargeType: "" | "INCLUDED" | "SALE" | "RENTAL" | "USAGE" }>;
type PackageDraft = Readonly<{ packageRef: string | null; expectedVersion: number | null; code: string; name: string; description: string; category: string; tags: readonly string[]; validFrom: string | null; validTo: string | null; modeRefs: readonly string[]; primaryServiceRef: string; complementaryRefs: readonly string[]; requirements: readonly RequirementDraft[]; state: "DRAFT" | "PUBLISHED" }>;

const EMPTY_PACKAGE: PackageDraft = Object.freeze({ packageRef: null, expectedVersion: null, code: "", name: "", description: "", category: "", tags: [], validFrom: null, validTo: null, modeRefs: [], primaryServiceRef: "", complementaryRefs: [], requirements: [], state: "DRAFT" });
const EMPTY_REQUIREMENT: RequirementDraft = Object.freeze({ kind: "DURATION", code: null, name: "Duración estimada", quantity: "", unitCode: "", hours: "", days: "", phaseCode: null, configuration: {}, authorityRef: "", disposition: "", chargeType: "" });
const numberOrNull = (value: string) => value.trim() ? Number(value) : null;

export default function ServiceConfigurationAdmin({ authorization, access, onUnauthorized }: Props) {
  const api = useMemo(() => new CrmServicesApi(() => authorization || null), [authorization]);
  const [tab, setTab] = useState<Tab>("CATALOG"); const [modes, setModes] = useState<readonly ServiceMode[]>([]); const [catalog, setCatalog] = useState<readonly ServiceCatalogItem[]>([]); const [catalogModes, setCatalogModes] = useState<readonly Readonly<{ serviceRef: string; modeRefs: readonly string[] }>[]>([]); const [packages, setPackages] = useState<readonly ServicePackage[]>([]); const [policies, setPolicies] = useState<readonly ServiceMaterialPolicy[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [packageDraft, setPackageDraft] = useState<PackageDraft | null>(null); const [policyDraft, setPolicyDraft] = useState<PolicyDraft | null>(null); const [modeDraft, setModeDraft] = useState<ServiceMode | NewModeDraft | null>(null); const [requirementDraft, setRequirementDraft] = useState<RequirementDraft | null>(null); const [saving, setSaving] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [dataReady, setDataReady] = useState(false);
  const pendingCommands = useRef<Record<string, string>>({});
  const withRequestId = (operation: string, payload: Record<string, unknown>) => {
    // Keep one identity for the open draft, even if an uncertain save is followed by edits.
    // A committed request with different data must conflict rather than create a second record.
    if (!pendingCommands.current[operation]) pendingCommands.current[operation] = crypto.randomUUID();
    return { ...payload, requestId: pendingCommands.current[operation] };
  };
  const allowedTabs = (["CATALOG", "PACKAGES", "MATERIALS"] as const).filter((value) =>
    value === "CATALOG" ? access.canCatalogView : value === "PACKAGES" ? access.canPackagesView : access.canMaterialsView,
  );
  const activeTab = allowedTabs.includes(tab) ? tab : allowedTabs[0];
  const canEditPackage = access.canPackagesView && access.canPackagesManage && access.canCatalogView;
  const canEditPolicy = access.canMaterialsView && access.canMaterialsManage && access.canPackagesView;
  const canEditMode = access.canPackagesView && access.canPackagesManage;
  const availableModeScopes = MODE_SCOPES.filter((scope) => !modes.some((mode) => mode.code === scope.code));
  const openNewMode = () => {
    const scope = availableModeScopes[0];
    if (!scope) return;
    delete pendingCommands.current.MODE_SAVE;
    setError(null);
    setModeDraft({ modeRef: null, code: "", scope: scope.code, name: scope.label, description: null, state: "DRAFT", version: 0 });
  };
  const load = () => setRefreshVersion((current) => current + 1);

  useEffect(() => {
    if (!activeTab) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setDataReady(false);
    setError(null);
    // Modes belong to the packages read contract; catalog mappings require catalog read.
    const readCatalog = access.canCatalogView && (activeTab === "CATALOG" || activeTab === "PACKAGES" || activeTab === "MATERIALS");
    const readCatalogModes = access.canCatalogView && access.canPackagesView && activeTab === "CATALOG";
    const readPackages = access.canPackagesView && (activeTab === "PACKAGES" || activeTab === "MATERIALS");
    void Promise.all([
      access.canPackagesView ? api.modes(controller.signal) : Promise.resolve([]),
      readCatalog ? api.catalog(controller.signal) : Promise.resolve([]),
      readCatalogModes ? api.catalogModes(controller.signal) : Promise.resolve([]),
      readPackages ? api.packages(controller.signal) : Promise.resolve([]),
      access.canMaterialsView && activeTab === "MATERIALS" ? api.materialPolicies(controller.signal) : Promise.resolve([]),
    ]).then(([nextModes, nextCatalog, nextCatalogModes, nextPackages, nextPolicies]) => {
      if (controller.signal.aborted) return;
      setModes(nextModes);
      setCatalog(nextCatalog);
      setCatalogModes(nextCatalogModes);
      setPackages(nextPackages);
      setPolicies(nextPolicies);
      setDataReady(true);
    }).catch((cause) => {
      if (controller.signal.aborted) return;
      if (cause instanceof CrmServicesApiError && cause.status === 401) onUnauthorized();
      else setError("No fue posible cargar la configuración de Servicios.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [access.canCatalogView, access.canMaterialsView, access.canPackagesView, activeTab, api, onUnauthorized, refreshVersion]);
  const activeServices = catalog.filter((item) => item.status === "ACTIVE"); const primaries = activeServices.filter((item) => ["PRIMARY", "BOTH"].includes(item.usage)); const complementaries = activeServices.filter((item) => ["COMPLEMENTARY", "BOTH"].includes(item.usage));
  const editPackage = (row: ServicePackage) => { delete pendingCommands.current.PACKAGE_SAVE; setError(null); setPackageDraft({ packageRef: row.packageRef, expectedVersion: row.version, code: row.code, name: row.name, description: row.description || "", category: row.category || "", tags: row.tags, validFrom: row.validFrom, validTo: row.validTo, modeRefs: row.modes.map((mode) => mode.modeRef), primaryServiceRef: row.primary?.serviceRef || "", complementaryRefs: row.complementaries.map((item) => item.serviceRef), requirements: row.requirements.map((item) => ({ kind: item.kind, code: item.code, name: item.name, quantity: item.quantity?.toString() || "", unitCode: item.unitCode || "", hours: item.hours?.toString() || "", days: item.days?.toString() || "", phaseCode: item.phaseCode, configuration: item.configuration, authorityRef: item.materialRef || item.assetModelRef || item.capabilityRef || "", disposition: (item.disposition || "") as RequirementDraft["disposition"], chargeType: (item.chargeType || "") as RequirementDraft["chargeType"] })), state: row.state === "PUBLISHED" ? "DRAFT" : row.state as "DRAFT" }); };
  const savePackage = async () => {
    if (!packageDraft || !canEditPackage || activeTab !== "PACKAGES" || loading || !dataReady) return;
    setSaving(true); setError(null);
    try {
      await api.savePackage(withRequestId("PACKAGE_SAVE", {
        packageRef: packageDraft.packageRef, expectedVersion: packageDraft.expectedVersion,
        code: packageDraft.packageRef ? packageDraft.code : null, name: packageDraft.name.trim(),
        description: packageDraft.description.trim() || null, category: packageDraft.category.trim() || null,
        tags: packageDraft.tags, modeRefs: packageDraft.modeRefs, primaryServiceRef: packageDraft.primaryServiceRef,
        complementaryRefs: packageDraft.complementaryRefs,
        requirements: packageDraft.requirements.map((item) => ({
          kind: item.kind, code: item.code?.trim() || null, name: item.name.trim(), quantity: numberOrNull(item.quantity),
          unitCode: item.unitCode.trim() || null, hours: numberOrNull(item.hours), days: numberOrNull(item.days),
          phaseCode: item.phaseCode, materialRef: item.kind === "MATERIAL" ? item.authorityRef : null,
          assetModelRef: item.kind === "ASSET" ? item.authorityRef : null,
          capabilityRef: item.kind === "PERSONNEL" ? item.authorityRef : null,
          disposition: item.disposition || null, chargeType: item.chargeType || null, configuration: item.configuration,
        })), state: packageDraft.state, validFrom: packageDraft.validFrom, validTo: packageDraft.validTo,
      }));
      delete pendingCommands.current.PACKAGE_SAVE;
      setPackageDraft(null); load();
    } catch (cause) {
      if (cause instanceof CrmServicesApiError && cause.status === 401) onUnauthorized();
      else if (cause instanceof CrmServicesApiError && cause.code === "SERVICE_PACKAGES_IDEMPOTENCY_CONFLICT") setError("Ya se confirmó un guardado anterior de este borrador. Cierre y actualice el listado antes de continuar.");
      else setError("No fue posible guardar la combinación. Revise sus servicios y recursos; otra persona puede haber guardado una versión más reciente.");
    } finally { setSaving(false); }
  };
  const editPolicy = (row: ServiceMaterialPolicy) => { delete pendingCommands.current.MATERIAL_POLICY_SAVE; setError(null); setPolicyDraft(draftFromPolicy(row)); };
  const savePolicy = async () => {
    if (!policyDraft || !canEditPolicy || activeTab !== "MATERIALS" || loading || !dataReady || !validatePolicyDraft(policyDraft).valid) return;
    setSaving(true); setError(null);
    try {
      await api.saveMaterialPolicy(withRequestId("MATERIAL_POLICY_SAVE", policySavePayload(policyDraft)));
      delete pendingCommands.current.MATERIAL_POLICY_SAVE;
      setPolicyDraft(null); load();
    } catch (cause) {
      if (cause instanceof CrmServicesApiError && cause.status === 401) onUnauthorized();
      else if (cause instanceof CrmServicesApiError && cause.code === "SERVICE_PACKAGES_IDEMPOTENCY_CONFLICT") setError("Ya se confirmó un guardado anterior de este borrador. Cierre y actualice el listado antes de continuar.");
      else if (cause instanceof CrmServicesApiError && cause.code === "SERVICE_PACKAGES_VERSION_CONFLICT") setError("Otra persona guardó una versión más reciente. Cierre y actualice el listado antes de editar de nuevo.");
      else if (cause instanceof CrmServicesApiError && cause.code === "SERVICE_PACKAGES_RESOURCE_NOT_FOUND") setError("Un material, recurso o vínculo ya no está disponible. Actualice el catálogo y revise la selección.");
      else setError("No se pudo confirmar el guardado. Sus filas se conservan; puede intentar guardar de nuevo sin duplicar esta solicitud.");
    } finally { setSaving(false); }
  };
  const saveMode = async () => {
    if (!modeDraft || !canEditMode || activeTab !== "CATALOG" || loading || !dataReady) return;
    setSaving(true); setError(null);
    try {
      await api.saveMode(withRequestId("MODE_SAVE", { modeRef: modeDraft.modeRef, expectedVersion: modeDraft.modeRef ? modeDraft.version : null, code: modeDraft.modeRef ? modeDraft.code : null, ...(modeDraft.modeRef === null ? { scope: modeDraft.scope } : {}), name: modeDraft.name.trim(), description: modeDraft.description, state: modeDraft.state, sortOrder: modes.length }));
      delete pendingCommands.current.MODE_SAVE;
      setModeDraft(null); load();
    } catch (cause) {
      if (cause instanceof CrmServicesApiError && cause.status === 401) onUnauthorized();
      else if (cause instanceof CrmServicesApiError && cause.code === "SERVICE_PACKAGES_IDEMPOTENCY_CONFLICT") setError("Ya se confirmó un guardado anterior de este borrador. Cierre y actualice el listado antes de continuar.");
      else if (cause instanceof CrmServicesApiError && cause.code === "SERVICE_PACKAGES_CONFLICT") setError("Esta modalidad ya está registrada. Cierre y actualice el listado para editarla.");
      else setError("No fue posible guardar la modalidad. Revise el nombre o actualice si otra persona cambió su versión.");
    } finally { setSaving(false); }
  };
  const toggleCatalogMode = async (serviceRef: string, modeRef: string) => { if (!access.canCatalogView || !access.canCatalogManage || !access.canPackagesView || activeTab !== "CATALOG" || loading || !dataReady) return; const current = catalogModes.find((entry) => entry.serviceRef === serviceRef)?.modeRefs || []; const modeRefs = current.includes(modeRef) ? current.filter((entry) => entry !== modeRef) : [...current, modeRef]; if (!modeRefs.length) { setError("Cada servicio debe conservar al menos un modo explícito."); return; } setSaving(true); try { await api.saveCatalogModes({ requestId: crypto.randomUUID(), serviceRef, modeRefs }); load(); } catch { setError("No fue posible guardar la compatibilidad explícita."); } finally { setSaving(false); } };
  if (!activeTab) return null;
  return <section id="admin-service-configuration" className="mt-3 min-w-0" data-testid="service-configuration-admin">
    <header className="flex flex-wrap items-center justify-between gap-2 border-b pb-3"><div className="flex items-center gap-1"><h2 className="text-base font-semibold text-slate-950">Configuración de Servicios</h2><AdministrationHelp title="Servicios y combinaciones"><p>El catálogo reúne los servicios disponibles. Las combinaciones reúnen servicios y recursos para reutilizarlos en los casos.</p><p>Las políticas de materiales definen consumo, alquiler, devolución y cargos. Cada versión publicada conserva sus condiciones.</p></AdministrationHelp></div><AdministrationIconAction label="Actualizar configuración de Servicios" mobileLabel="Actualizar" disabled={loading || saving} onClick={load}><RefreshCw aria-hidden="true" className="h-4 w-4" /></AdministrationIconAction></header>
    <nav aria-label="Configuración de Servicios" className="flex gap-1 overflow-x-auto border-b px-4 pt-2">{allowedTabs.map((value) => <button key={value} type="button" onClick={() => setTab(value)} aria-current={activeTab === value ? "page" : undefined} className={`whitespace-nowrap border-b-2 px-3 py-2 text-xs font-bold ${activeTab === value ? "border-[#0070a8] text-[#003366]" : "border-transparent text-slate-500"}`}>{value === "CATALOG" ? access.canPackagesView ? "Catálogo y modos" : "Catálogo" : value === "PACKAGES" ? "Combinaciones" : "Políticas de materiales"}</button>)}</nav>
    {error && !policyDraft && !modeDraft && !packageDraft && <p role="alert" className="m-4 border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}{loading && <p role="status" className="p-8 text-center text-sm text-slate-500">Cargando configuración…</p>}
    {!loading && dataReady && activeTab === "CATALOG" && <div className="py-3">{access.canPackagesView ? <><div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b pb-2"><div><h3 className="text-sm font-semibold text-slate-950">Modalidades de servicio</h3><p className="text-xs text-slate-500">Local, exportación, importación y otras modalidades configuradas.</p></div>{canEditMode && <Button size="sm" disabled={!availableModeScopes.length} onClick={openNewMode}><Plus />Nuevo modo</Button>}</div>{canEditMode && !availableModeScopes.length && <p className="mb-2 text-xs text-slate-500">Las modalidades están configuradas. Seleccione una para editarla.</p>}<div className="flex flex-wrap gap-2">{modes.map((mode) => <button key={mode.modeRef} type="button" disabled={!canEditMode} onClick={() => { delete pendingCommands.current.MODE_SAVE; setError(null); setModeDraft(mode); }} className="rounded border px-3 py-2 text-left text-xs"><strong className="block text-[#003366]">{mode.name}</strong><span>{mode.state} · v{mode.version}</span></button>)}</div><div className="mt-4 overflow-x-auto border"><div className="min-w-[700px]"><div className="grid grid-cols-[200px_1fr] border-b bg-slate-50 px-3 py-2 text-[10px] font-black uppercase"><span>Servicio</span><span>Modalidades disponibles</span></div>{catalog.map((service) => <div key={service.serviceRef} className="grid grid-cols-[200px_1fr] gap-2 border-b px-3 py-2 text-xs"><strong>{service.name}</strong><span className="flex flex-wrap gap-3">{modes.filter((mode) => mode.state !== "INACTIVE").map((mode) => <label key={mode.modeRef}><input type="checkbox" disabled={!access.canCatalogManage || saving} checked={catalogModes.find((entry) => entry.serviceRef === service.serviceRef)?.modeRefs.includes(mode.modeRef) || false} onChange={() => void toggleCatalogMode(service.serviceRef, mode.modeRef)} /> {mode.name}</label>)}</span></div>)}</div></div></> : <p className="mb-4 text-xs text-slate-600">Para consultar modos y compatibilidades necesitas acceso de consulta a combinaciones.</p>}<ServiceCatalogAdmin authorization={authorization} canManage={access.canCatalogManage} onUnauthorized={onUnauthorized} /></div>}
    {!loading && dataReady && activeTab === "PACKAGES" && <div className="py-3"><div className="flex flex-wrap items-end justify-between gap-3 border-b pb-3"><div><h3 className="text-sm font-semibold text-slate-950">Combinaciones reutilizables</h3><p className="text-xs text-slate-500">Combinaciones de servicios y recursos.</p></div>{access.canPackagesManage && <Button size="sm" disabled={!canEditPackage} onClick={() => { delete pendingCommands.current.PACKAGE_SAVE; setError(null); setPackageDraft(EMPTY_PACKAGE); }}><PackagePlus />Nueva combinación</Button>}</div>{access.canPackagesManage && !canEditPackage && <p className="mt-3 text-xs text-slate-600">Puedes consultar las combinaciones. Para crearlas o editarlas necesitas también acceso de consulta al catálogo de servicios.</p>}<div className="mt-3 overflow-x-auto"><div className="min-w-[900px] divide-y border bg-white"><div className="grid grid-cols-[120px_minmax(180px,1fr)_140px_160px_90px_90px] gap-3 bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase text-slate-500"><span>Código</span><span>Combinación</span><span>Modalidad</span><span>Servicios</span><span>Estado</span><span>Versión</span></div>{packages.map((row) => <button key={row.versionRef} type="button" disabled={!canEditPackage} onClick={() => canEditPackage && editPackage(row)} className="grid w-full grid-cols-[120px_minmax(180px,1fr)_140px_160px_90px_90px] gap-3 px-3 py-2 text-left text-xs"><code>{row.code}</code><strong>{row.name}</strong><span>{row.modes.map((mode) => mode.name).join(", ")}</span><span>{row.primary?.name || "—"} +{row.complementaries.length}</span><span>{row.state}</span><span>v{row.version}</span></button>)}{!packages.length && <p className="p-6 text-center text-xs text-slate-500">No hay combinaciones registradas.</p>}</div></div></div>}
    {!loading && dataReady && activeTab === "MATERIALS" && <div className="py-3"><div className="flex flex-wrap items-end justify-between gap-3 border-b pb-3"><div><h3 className="text-sm font-semibold text-slate-950">Políticas de materiales</h3><p className="text-xs text-slate-500">Nuevo/reutilizado · consumo/alquiler/devolución · cargos configurables</p></div>{access.canMaterialsManage && <Button size="sm" disabled={!canEditPolicy} onClick={() => { delete pendingCommands.current.MATERIAL_POLICY_SAVE; setError(null); setPolicyDraft(newPolicyDraft()); }}><Boxes />Nueva política</Button>}</div>{access.canMaterialsManage && !canEditPolicy && <p className="mt-3 text-xs text-slate-600">Puedes consultar las políticas. Para crearlas o editarlas necesitas también acceso de consulta a combinaciones y modos.</p>}<div className="mt-3 overflow-x-auto border"><div className="min-w-[720px] divide-y bg-white"><div className="grid grid-cols-[120px_minmax(180px,1fr)_120px_120px_80px] gap-3 bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase text-slate-500"><span>Código</span><span>Política</span><span>Estándar</span><span>Estado</span><span>Versión</span></div>{policies.map((row) => <button key={row.versionRef} type="button" disabled={!canEditPolicy} onClick={() => canEditPolicy && editPolicy(row)} className="grid w-full grid-cols-[120px_minmax(180px,1fr)_120px_120px_80px] gap-3 px-3 py-2 text-left text-xs"><code>{row.code}</code><strong>{row.name}</strong><span>{row.standardCode}</span><span>{row.state}</span><span>v{row.version}</span></button>)}{!policies.length && <p className="p-6 text-center text-xs text-slate-500">No hay políticas de materiales registradas.</p>}</div></div></div>}
    <Dialog open={Boolean(modeDraft) && canEditMode && activeTab === "CATALOG"} onOpenChange={(open) => { if (!open && !saving) setModeDraft(null); }}><DialogContent showCloseButton={!saving} className={`${COMPACT_FORM_DIALOG} max-h-[92vh] overflow-y-auto`}><DialogHeader><DialogTitle>{modeDraft?.modeRef ? "Versionar modo" : "Nuevo modo"}</DialogTitle><DialogDescription>El código se asigna automáticamente y se conserva al editar la modalidad.</DialogDescription></DialogHeader>{error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">{error}</p>}{modeDraft && <fieldset disabled={saving} className="grid min-w-0 gap-3 sm:grid-cols-2">{modeDraft.modeRef === null && <label className="text-xs font-bold sm:col-span-2">Alcance<select aria-label="Alcance" value={modeDraft.scope} onChange={(event) => { const nextScope = availableModeScopes.find((scope) => scope.code === event.target.value); if (nextScope) setModeDraft({ ...modeDraft, scope: nextScope.code, name: MODE_SCOPES.some((scope) => scope.label === modeDraft.name) || !modeDraft.name.trim() ? nextScope.label : modeDraft.name }); }} className={`${COMPACT_FORM_FIELD} mt-1 w-full`}>{availableModeScopes.map((scope) => <option key={scope.code} value={scope.code}>{scope.label}</option>)}</select></label>}<div className="text-xs text-slate-500">Código<span className="mt-1 block text-sm text-slate-700">{modeDraft.modeRef ? <code>{modeDraft.code}</code> : "Automático al guardar"}</span></div><label className="text-xs font-bold">Nombre<input value={modeDraft.name} onChange={(e) => setModeDraft({ ...modeDraft, name: e.target.value })} className={`${COMPACT_FORM_FIELD} mt-1 w-full`} /></label><Button size="sm" disabled={saving || !modeDraft.name.trim()} onClick={() => void saveMode()} className="sm:col-span-2">Guardar modo</Button></fieldset>}</DialogContent></Dialog>
    <Dialog open={Boolean(packageDraft) && canEditPackage && activeTab === "PACKAGES"} onOpenChange={(open) => { if (!open && !saving) setPackageDraft(null); }}><DialogContent showCloseButton={!saving} className={`${COMPACT_FORM_DIALOG} max-h-[92vh] overflow-y-auto sm:max-w-4xl`}><DialogHeader className="pr-6"><DialogTitle>Editor compacto de combinación</DialogTitle><DialogDescription>General · Servicios · Personal y recursos · Duración. Publicar vuelve inmutable esta versión.</DialogDescription></DialogHeader>{error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">{error}</p>}{packageDraft && <div className="min-w-0 space-y-3"><div className="grid min-w-0 gap-3 sm:grid-cols-2"><div className="text-xs text-slate-500">Código<span className="mt-1 block text-sm text-slate-700">{packageDraft.packageRef ? <code>{packageDraft.code}</code> : "Automático al guardar"}</span></div><label className="text-xs font-bold">Nombre<input value={packageDraft.name} onChange={(e) => setPackageDraft({ ...packageDraft, name: e.target.value })} className={`${COMPACT_FORM_FIELD} mt-1 w-full`} /></label></div><fieldset><legend className="text-xs font-bold">Modos</legend><div className="flex flex-wrap gap-3">{modes.filter((mode) => mode.state !== "INACTIVE").map((mode) => <label key={mode.modeRef} className="text-xs"><input type="checkbox" checked={packageDraft.modeRefs.includes(mode.modeRef)} onChange={() => setPackageDraft({ ...packageDraft, modeRefs: packageDraft.modeRefs.includes(mode.modeRef) ? packageDraft.modeRefs.filter((ref) => ref !== mode.modeRef) : [...packageDraft.modeRefs, mode.modeRef] })} /> {mode.name}</label>)}</div></fieldset><div className="grid min-w-0 gap-3 sm:grid-cols-2"><label className="text-xs font-bold">Principal<select aria-label="Principal" value={packageDraft.primaryServiceRef} onChange={(e) => setPackageDraft({ ...packageDraft, primaryServiceRef: e.target.value })} className={`${COMPACT_FORM_FIELD} mt-1 w-full`}><option value="">Seleccionar</option>{primaries.map((item) => <option key={item.serviceRef} value={item.serviceRef}>{item.name}</option>)}</select></label><fieldset><legend className="text-xs font-bold">Complementarios</legend>{complementaries.map((item) => <label key={item.serviceRef} className="mr-3 block text-xs"><input type="checkbox" checked={packageDraft.complementaryRefs.includes(item.serviceRef)} onChange={() => setPackageDraft({ ...packageDraft, complementaryRefs: packageDraft.complementaryRefs.includes(item.serviceRef) ? packageDraft.complementaryRefs.filter((ref) => ref !== item.serviceRef) : [...packageDraft.complementaryRefs, item.serviceRef] })} /> {item.name}</label>)}</fieldset></div><section className="border-t pt-3"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-xs font-black uppercase text-slate-500">Requerimientos predeterminados</h4><Button size="sm" variant="outline" onClick={() => setRequirementDraft(EMPTY_REQUIREMENT)}><Plus />Agregar</Button></div><div className="mt-2 overflow-x-auto border"><div className="min-w-[560px] divide-y">{packageDraft.requirements.map((item, index) => <button key={`${item.kind}-${index}`} onClick={() => setRequirementDraft(item)} className="grid w-full grid-cols-[100px_1fr_90px_100px] p-2 text-left text-xs"><span>{item.kind}</span><strong>{item.name}</strong><span>{item.quantity || item.hours || item.days || "—"} {item.unitCode}</span><span>{item.chargeType || "Sin cargo"}</span></button>)}</div></div></section><div className="flex justify-end gap-2"><select value={packageDraft.state} onChange={(e) => setPackageDraft({ ...packageDraft, state: e.target.value as PackageDraft["state"] })} className={COMPACT_FORM_FIELD}><option value="DRAFT">Borrador</option><option value="PUBLISHED">Publicar versión</option></select><Button size="sm" disabled={saving || !packageDraft.name || !packageDraft.primaryServiceRef || !packageDraft.modeRefs.length} onClick={() => void savePackage()}>{saving ? <RefreshCw className="animate-spin" /> : <Layers3 />}Guardar versión</Button></div></div>}</DialogContent></Dialog>
    <Dialog open={Boolean(requirementDraft) && canEditPackage && activeTab === "PACKAGES"} onOpenChange={(open) => !open && setRequirementDraft(null)}><DialogContent className={`${COMPACT_FORM_DIALOG} max-h-[92vh] overflow-y-auto`}><DialogHeader><DialogTitle>Requerimiento</DialogTitle><DialogDescription>Define las cantidades, capacidades o recursos que necesita la combinación. La asignación concreta se realiza al planificar el servicio.</DialogDescription></DialogHeader>{requirementDraft && <form onSubmit={(event) => { event.preventDefault(); setPackageDraft((current) => current ? { ...current, requirements: [...current.requirements, requirementDraft] } : current); setRequirementDraft(null); }} className="grid min-w-0 gap-3 sm:grid-cols-2"><label className="text-xs font-bold">Tipo<select value={requirementDraft.kind} onChange={(e) => setRequirementDraft({ ...requirementDraft, kind: e.target.value as RequirementDraft["kind"], code: null, authorityRef: "" })} className={`${COMPACT_FORM_FIELD} mt-1 w-full`}>{["PERSONNEL","MATERIAL","ASSET","VEHICLE","TRANSPORT","DURATION","CRATING"].map((value) => <option key={value}>{value}</option>)}</select></label><label className="text-xs font-bold">Nombre<input value={requirementDraft.name} onChange={(e) => setRequirementDraft({ ...requirementDraft, name: e.target.value })} className={`${COMPACT_FORM_FIELD} mt-1 w-full`} /></label>{["PERSONNEL","MATERIAL","ASSET"].includes(requirementDraft.kind) && <label className="text-xs font-bold sm:col-span-2">Referencia del catálogo<input value={requirementDraft.authorityRef} onChange={(e) => setRequirementDraft({ ...requirementDraft, authorityRef: e.target.value })} className={`${COMPACT_FORM_FIELD} mt-1 w-full`} /></label>}<label className="text-xs font-bold">Cantidad<NumericInput min="0" step="any" value={requirementDraft.quantity} onChange={(e) => setRequirementDraft({ ...requirementDraft, quantity: e.target.value })} className={`${COMPACT_FORM_FIELD} mt-1 block w-24 tabular-nums`} /></label><label className="text-xs font-bold">Unidad<input value={requirementDraft.unitCode} onChange={(e) => setRequirementDraft({ ...requirementDraft, unitCode: e.target.value })} className={`${COMPACT_FORM_FIELD} mt-1 w-full`} /></label><label className="text-xs font-bold">Horas<NumericInput min="0" step="any" value={requirementDraft.hours} onChange={(e) => setRequirementDraft({ ...requirementDraft, hours: e.target.value })} className={`${COMPACT_FORM_FIELD} mt-1 block w-24 tabular-nums`} /></label><label className="text-xs font-bold">Días<NumericInput min="0" step="any" value={requirementDraft.days} onChange={(e) => setRequirementDraft({ ...requirementDraft, days: e.target.value })} className={`${COMPACT_FORM_FIELD} mt-1 block w-24 tabular-nums`} /></label><Button type="submit" size="sm" className="sm:col-span-2">Agregar requerimiento</Button></form>}</DialogContent></Dialog>
    {policyDraft && canEditPolicy && activeTab === "MATERIALS" && <MaterialPolicySheet api={api} draft={policyDraft} packages={packages} modes={modes} services={catalog} canReadServices={access.canCatalogView} saving={saving} error={error} onChange={setPolicyDraft} onSave={() => void savePolicy()} onClose={() => { if (!saving) setPolicyDraft(null); }} onUnauthorized={onUnauthorized} />}
  </section>;
}
