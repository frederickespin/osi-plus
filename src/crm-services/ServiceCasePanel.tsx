import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, History, Plus, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { COMPACT_TABLE_FIELD } from "@/components/ui/compact-form";
import { cn } from "@/lib/utils";
import { CrmServicesApi, CrmServicesApiError, type CaseServiceConfigurationWorkspace, type CaseServiceWorkspace } from "./api";
import CommercialStorageAuthorizationPanel from "@/customer-custody/CommercialStorageAuthorizationPanel";
import QuickQuoteConfigurator from "./QuickQuoteConfigurator";

export type ServiceCaseIntake = Readonly<{
  addresses?: ReactNode;
  costs?: ReactNode;
  saving?: boolean;
  nextStep?: (plan: Readonly<{
    canContinue: boolean;
    selectionRef: string | null;
    selectionRevision: number;
    configuration: CaseServiceConfigurationWorkspace | null;
    configurationLoading: boolean;
    configurationUnavailable: boolean;
    reloadConfiguration: () => void;
  }>) => ReactNode;
}>;
type Props = Readonly<{
  caseRef: string;
  authorization?: string;
  canUpdate: boolean;
  canConfigure?: boolean;
  canReadCatalog: boolean;
  canViewConfiguration?: boolean;
  intake?: ServiceCaseIntake;
  activeStage: PlanStage;
  onStageChange(stage: PlanStage): void;
  onUnauthorized(): void;
}>;
export type PlanStage = "plan" | "addresses" | "movements" | "configuration" | "costs";
const MODE_LABEL = { LOCAL: "LOCAL / NACIONAL", EXPORT: "EXPORTACIÓN", IMPORT: "IMPORTACIÓN" };
const FIELD = cn(COMPACT_TABLE_FIELD, "bg-slate-50 px-2");
function errorCopy(error: unknown) {
  const code = error instanceof CrmServicesApiError ? error.code : "CRM_SERVICES_UNAVAILABLE";
  if (code === "SERVICE_PACKAGES_ADDON_PRICE_STALE") return "Cambió la tarifa de un adicional. Actualiza la lista y vuelve a seleccionarlo.";
  if (code === "SERVICE_PACKAGES_ADDON_INPUT_INVALID") return "Revisa la cantidad y la moneda de los adicionales.";
  if (code === "SERVICE_PACKAGES_VERSION_CONFLICT") return "Cambió la ruta o la configuración del caso. Actualiza el plan y confirma los datos antes de guardar.";
  return ({ CRM_SERVICES_VERSION_CONFLICT: "El plan cambió. Recargue antes de guardar una nueva versión.", CRM_SERVICES_PRIMARY_INCOMPATIBLE: "La necesidad principal ya no es compatible con el modo del caso.", CRM_SERVICES_COMPLEMENTARY_NOT_ALLOWED: "Un servicio asociado ya no está permitido para la necesidad principal.", CRM_SERVICES_DISABLED: "Servicios permanece desactivado en este entorno." } as Record<string, string>)[code] || "No fue posible cargar o guardar el plan de Servicios.";
}

export default function ServiceCasePanel({ caseRef, authorization, canUpdate, canConfigure = false, canReadCatalog, canViewConfiguration = false, intake, activeStage, onStageChange, onUnauthorized }: Props) {
  const api = useMemo(() => new CrmServicesApi(() => authorization || null), [authorization]);
  const [workspace, setWorkspace] = useState<CaseServiceWorkspace | null>(null);
  const [primaryRef, setPrimaryRef] = useState("");
  const [complementaryRefs, setComplementaryRefs] = useState<readonly string[]>([]);
  const [catalogRef, setCatalogRef] = useState("");
  const [defaultRef, setDefaultRef] = useState<string | null>(null);
  const [others, setOthers] = useState<readonly string[]>([]);
  const [otherDraft, setOtherDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configurationWorkspace, setConfiguration] = useState<CaseServiceConfigurationWorkspace | null>(null);
  const [configurationLoading, setConfigurationLoading] = useState(canViewConfiguration);
  const [configurationUnavailable, setConfigurationUnavailable] = useState(false);
  const [configurationRefresh, setConfigurationRefresh] = useState(0);
  const [loadedSelection, setLoadedSelection] = useState<string>();
  const [configurationSaving, setConfigurationSaving] = useState(false);
  const [openedAddresses, setOpenedAddresses] = useState(false);
  const [openedConfiguration, setOpenedConfiguration] = useState(false);
  const load = useCallback(() => {
    const controller = new AbortController(); setLoading(true); setError(null);
    void api.workspace(caseRef, controller.signal).then((value) => {
      if (controller.signal.aborted) return;
      setWorkspace(value); setPrimaryRef(value.selection.primary?.serviceRef || ""); setComplementaryRefs(value.selection.complementaries.map((item) => item.serviceRef)); setDefaultRef(value.selection.defaultCombinationRef); setOthers(value.selection.otherServices.map((item) => item.description)); setDirty(false);
    }).catch((cause) => {
      if (controller.signal.aborted) return;
      if (cause instanceof CrmServicesApiError && cause.status === 401) onUnauthorized();
      else setError(errorCopy(cause));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, caseRef, onUnauthorized]);
  useEffect(load, [load]);
  const reloadConfiguration = useCallback(() => { setConfigurationRefresh((count) => count + 1); }, []);
  const selectionKey = workspace && workspace.caseRef === caseRef ? workspace.selection.selectionRef || "empty" : undefined;
  const configuration = canViewConfiguration && selectionKey && loadedSelection === selectionKey && configurationWorkspace?.caseRef === caseRef ? configurationWorkspace : null;
  const current = configuration?.current && configuration.current.serviceSelectionRef === workspace?.selection.selectionRef &&
    configuration.current.serviceSelectionRevision === workspace.selection.revision ? configuration.current : null;
  const packageVersionRef = configuration?.packages.find((item) => item.packageRef === current?.packageRef && item.version === current?.packageVersion)?.versionRef || "";
  const policyVersionRef = configuration?.materialPolicies.find((item) => item.policyRef === current?.materialPolicyRef && item.version === current?.materialPolicyVersion)?.versionRef || "";
  const durationHours = typeof current?.duration.hours === "number" ? String(current.duration.hours) : "";
  useEffect(() => {
    if (!canViewConfiguration || !selectionKey) {
      setConfiguration(null);
      setConfigurationLoading(false);
      setConfigurationUnavailable(false);
      return;
    }
    const controller = new AbortController();
    setConfigurationLoading(true);
    setConfigurationUnavailable(false);
    void api.caseConfiguration(caseRef, controller.signal).then((value) => {
      if (controller.signal.aborted) return;
      setConfiguration(value);
      setLoadedSelection(selectionKey);
    }).catch((cause) => {
      if (controller.signal.aborted) return;
      if (cause instanceof CrmServicesApiError && cause.status === 401) onUnauthorized();
      setConfigurationUnavailable(true);
    }).finally(() => { if (!controller.signal.aborted) setConfigurationLoading(false); });
    return () => controller.abort();
  }, [api, canViewConfiguration, caseRef, onUnauthorized, configurationRefresh, selectionKey]);
  const compatible = useMemo(() => workspace?.allowedComplementaries.filter((item) => item.primaryServiceRef === primaryRef).map((item) => item.service) || [], [primaryRef, workspace]);
  const compatibleByRef = useMemo(() => new Map(compatible.map((item) => [item.serviceRef, item])), [compatible]);
  const availableCatalog = useMemo(() => compatible.filter((item) => !complementaryRefs.includes(item.serviceRef)), [compatible, complementaryRefs]);
  const selectedCatalogServices = useMemo(() => complementaryRefs.flatMap((ref) => {
    const item = compatibleByRef.get(ref) ?? workspace?.selection.complementaries.find((entry) => entry.serviceRef === ref);
    return item ? [item] : [];
  }), [compatibleByRef, complementaryRefs, workspace]);
  const storageSelected = useMemo(() => [workspace?.selection.primary, ...(workspace?.selection.complementaries || [])].some((item) => Boolean(item && (item.category === "STORAGE" || ["STORAGE", "ALMACENAJE"].includes(item.code)))), [workspace]);
  const eligiblePackages = useMemo(() => {
    if (!configuration || !workspace) return [];
    const selectedCodes = new Set([workspace.selection.primary?.code, ...workspace.selection.complementaries.map((item) => item.code)].filter(Boolean));
    return configuration.packages.filter((item) => [item.primary, ...item.complementaries].filter(Boolean).every((service) => Boolean(service && selectedCodes.has(service.code))));
  }, [configuration, workspace]);
  const hasCostView = Boolean(intake?.costs);
  useEffect(() => {
    if (activeStage === "addresses") setOpenedAddresses(true);
    if (activeStage === "configuration") setOpenedConfiguration(true);
    if ((!loading && !storageSelected && activeStage === "movements") ||
      (!canViewConfiguration && activeStage === "configuration") ||
      (!hasCostView && activeStage === "costs")) onStageChange("plan");
  }, [activeStage, canViewConfiguration, hasCostView, loading, onStageChange, storageSelected]);
  const pendingService = Boolean(catalogRef || otherDraft.trim());
  const canEditPlan = canUpdate && !saving && !loading && !intake?.saving;
  const canContinue = Boolean(workspace?.selection.selectionRef && !dirty && !pendingService && !saving && !loading);
  const primaryChanged = Boolean(workspace?.selection.primary?.serviceRef && primaryRef && workspace.selection.primary.serviceRef !== primaryRef);
  const changePrimary = (next: string) => {
    const changesPublishedNeed = Boolean(workspace?.selection.primary?.serviceRef && workspace.selection.primary.serviceRef !== next);
    if (changesPublishedNeed && (complementaryRefs.length > 0 || others.length > 0) && !window.confirm("Cambiar la necesidad principal reemplazará servicios asociados incompatibles por la combinación predeterminada. Al guardar se creará una nueva versión y el plan anterior permanecerá en el historial. ¿Continuar?")) return;
    const preset = workspace?.defaults.find((item) => item.primaryServiceRef === next && item.isDefault);
    setPrimaryRef(next); setComplementaryRefs(preset?.complementaryRefs || []); setCatalogRef(""); setDefaultRef(preset?.combinationRef || null); setDirty(true);
  };
  const addCatalogService = () => {
    if (!catalogRef || complementaryRefs.includes(catalogRef)) return;
    setComplementaryRefs((current) => [...current, catalogRef]); setCatalogRef(""); setDefaultRef(null); setDirty(true);
  };
  const removeCatalogService = (ref: string) => { setComplementaryRefs((current) => current.filter((item) => item !== ref)); setDefaultRef(null); setDirty(true); };
  const save = async () => {
    if (!workspace || !primaryRef || !canEditPlan || !dirty || pendingService) return;
    setSaving(true); setError(null);
    try {
      await api.saveSelection(caseRef, { requestId: crypto.randomUUID(), expectedRevision: workspace.selection.revision, primaryServiceRef: primaryRef, complementaryRefs, defaultCombinationRef: defaultRef, otherServices: others.map((description) => ({ description })) });
      load();
    } catch (cause) { if (cause instanceof CrmServicesApiError && cause.status === 401) onUnauthorized(); else setError(errorCopy(cause)); } finally { setSaving(false); }
  };
  const saveConfiguration = async (draft?: Readonly<{ packageVersionRef: string; policyVersionRef: string; durationHours: string; preference: Record<string, unknown> }>) => {
    if (!workspace?.selection.selectionRef || !configuration || !canContinue || !canConfigure ||
      configurationSaving || configurationLoading || configurationUnavailable) return;
    setConfigurationSaving(true); setError(null);
    const nextPackageRef = draft?.packageVersionRef ?? packageVersionRef;
    const nextPolicyRef = draft?.policyVersionRef ?? policyVersionRef;
    const nextDuration = draft?.durationHours ?? durationHours;
    const preference = { ...current?.preference };
    delete preference.serviceStartDate;
    delete preference.directQuote;
    delete preference.directQuoteRecordedAt;
    delete preference.directAccessRouteVersions;
    if (draft) preference.quickQuote = draft.preference;
    try {
      await api.saveCaseConfiguration(caseRef, {
        requestId: crypto.randomUUID(), expectedRevision: configuration.current?.revision || 0,
        serviceSelectionRef: workspace.selection.selectionRef, serviceSelectionRevision: workspace.selection.revision,
        packageVersionRef: nextPackageRef || null, materialPolicyVersionRef: nextPolicyRef || null,
        surveyPublicationRef: configuration.surveySummary?.publicationRef ?? null, commercialAgreementRef: null,
        preference,
        duration: nextDuration ? { hours: Number(nextDuration) } : {},
        source: nextPackageRef ? "PACKAGE" : "MANUAL_RESOLUTION", overrides: [],
      });
      reloadConfiguration();
    }
    catch (cause) { if (cause instanceof CrmServicesApiError && cause.status === 401) onUnauthorized(); else setError(errorCopy(cause)); } finally { setConfigurationSaving(false); }
  };
  if (loading && workspace?.caseRef !== caseRef) {
    return <div role="status" className="p-6 text-center text-sm text-slate-500">Cargando plan de servicios…</div>;
  }
  if (error && workspace?.caseRef !== caseRef) {
    return <div role="alert" className="m-3 border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      {error}<Button className="ml-2" size="sm" variant="outline" onClick={load}>Reintentar</Button>
    </div>;
  }
  if (!workspace || workspace.caseRef !== caseRef) return null;

  const stages: { id: PlanStage; label: string }[] = [{ id: "plan", label: "Plan" }];
  if (intake?.addresses) stages.push({ id: "addresses", label: "Direcciones" });
  if (storageSelected) stages.push({ id: "movements", label: "Movimientos" });
  if (canViewConfiguration) stages.push({ id: "configuration", label: "Configuración" });
  if (intake?.costs) stages.push({ id: "costs", label: "Costos internos" });
  const selectedPrimary = workspace.primaries.find((item) => item.serviceRef === primaryRef) ??
    (workspace.selection.primary?.serviceRef === primaryRef ? workspace.selection.primary : undefined);
  const savedPrimary = workspace.selection.primary;
  const unavailableSavedPrimary = savedPrimary && !workspace.primaries.some((item) => item.serviceRef === savedPrimary.serviceRef);
  const total = selectedCatalogServices.length + others.length + Number(Boolean(selectedPrimary));
  const hasViews = stages.length > 1;
  const canChangeStage = !dirty && !pendingService && !saving && !loading && !configurationSaving && !intake?.saving;

  return <section role="tabpanel" aria-labelledby="services-tab" className="w-full min-w-0 px-2 py-3 sm:px-4" data-testid="case-services-panel">
    {hasViews && <nav role="tablist" aria-label="Áreas del plan de servicios" className="mb-3 flex flex-wrap gap-1 border-b border-slate-200 pb-1">
      {stages.map((stage) => <button key={stage.id} id={"storage-" + stage.id + "-tab"} type="button" role="tab"
        aria-selected={activeStage === stage.id} aria-controls={"storage-" + stage.id + "-panel"}
        disabled={stage.id !== "plan" && !canChangeStage}
        onClick={() => onStageChange(stage.id)}
        className={"rounded px-2.5 py-1.5 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0070a8] disabled:opacity-40 " +
          (activeStage === stage.id ? "bg-[#003366] text-white" : "text-slate-600 hover:bg-slate-100")}>{stage.label}</button>)}
    </nav>}
    {error && <p role="alert" className="mb-2 flex items-center gap-2 rounded bg-red-50 px-2 py-1.5 text-xs text-red-800">
      <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />{error}
      {activeStage === "configuration" && <button type="button" className="font-semibold underline" onClick={() => { load(); reloadConfiguration(); }}>Actualizar plan</button>}
    </p>}
    <div id="storage-plan-panel" role={hasViews ? "tabpanel" : undefined} aria-labelledby={hasViews ? "storage-plan-tab" : undefined}
      hidden={activeStage !== "plan"}>
      <div className="grid min-w-0 items-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <section aria-labelledby="case-intake-heading" className="min-w-0 space-y-2">
          <h2 id="case-intake-heading" className="text-sm font-semibold text-[#003366]">Datos del caso</h2>
          <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
            <label className="min-w-0 text-xs font-semibold text-slate-600">Modo / Alcance
              <input readOnly value={MODE_LABEL[workspace.mode]} className={FIELD + " mt-0.5"} />
            </label>
            <label className="min-w-0 text-xs font-semibold text-slate-600">Necesidad principal
              <select disabled={!canEditPlan} value={primaryRef} onChange={(event) => changePrimary(event.target.value)}
                className={FIELD + " mt-0.5"}>
                <option value="">Seleccionar necesidad</option>
                {unavailableSavedPrimary && <option value={savedPrimary.serviceRef} disabled>{savedPrimary.name} · no disponible</option>}
                {workspace.primaries.map((item) => <option key={item.serviceRef} value={item.serviceRef}>{item.name}</option>)}
              </select>
            </label>
          </div>
          {intake?.nextStep?.({
            canContinue, selectionRef: workspace.selection.selectionRef, selectionRevision: workspace.selection.revision,
            configuration, configurationLoading, configurationUnavailable, reloadConfiguration,
          })}
        </section>

        <section aria-labelledby="selected-services-heading" className="min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
            <h2 id="selected-services-heading" className="text-sm font-semibold text-[#003366]">Servicios asociados al caso</h2>
            <p aria-live="polite" className="text-xs text-slate-600">{total} {total === 1 ? "servicio" : "servicios"}</p>
          </div>
          {canUpdate && <fieldset disabled={!canEditPlan || !primaryRef} className="mt-2 min-w-0">
            <legend className="text-xs font-semibold text-slate-600">Agregar desde el catálogo</legend>
            <div className="mt-0.5 flex min-w-0 items-center gap-1">
              <select aria-label="Servicio asociado del catálogo" value={catalogRef} onChange={(event) => setCatalogRef(event.target.value)}
                className={FIELD}>
                <option value="">{availableCatalog.length ? "Seleccionar servicio…" : "Sin servicios disponibles"}</option>
                {availableCatalog.map((item) => <option key={item.serviceRef} value={item.serviceRef}>{item.name}</option>)}
              </select>
              <Button type="button" variant="ghost" size="icon" aria-label="Agregar servicio seleccionado"
                disabled={!catalogRef} onClick={addCatalogService} className="size-8 shrink-0"><Plus aria-hidden="true" className="size-4" /></Button>
            </div>
          </fieldset>}
          <table aria-labelledby="selected-services-heading" className="mt-2 w-full table-fixed border-b border-slate-200 text-left text-xs">
            <colgroup><col /><col className="w-[24%]" /><col className="w-[26%]" /><col className="w-9" /></colgroup>
            <thead className="bg-slate-50 text-slate-600"><tr>
              <th scope="col" className="px-2 py-1.5 font-semibold">Servicio</th>
              <th scope="col" className="px-1 py-1.5 font-semibold">Rol</th>
              <th scope="col" className="px-1 py-1.5 font-semibold">Base</th>
              <th scope="col"><span className="sr-only">Acciones</span></th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {selectedPrimary && <tr className="bg-sky-50/60">
                <th scope="row" className="break-words px-2 py-1.5 font-semibold text-[#003366]">{selectedPrimary.name}</th>
                <td className="break-words px-1 py-1.5">Principal</td><td className="break-words px-1 py-1.5">Según tarifario</td><td />
              </tr>}
              {selectedCatalogServices.map((item) => <tr key={item.serviceRef}>
                <th scope="row" className="break-words px-2 py-1.5 font-medium text-slate-900">{item.name}</th>
                <td className="break-words px-1 py-1.5">Asociado</td><td className="break-words px-1 py-1.5">Según tarifario</td>
                <td className="text-right">{canUpdate && <Button type="button" size="icon" variant="ghost" aria-label={"Quitar " + item.name}
                  disabled={!canEditPlan} onClick={() => removeCatalogService(item.serviceRef)} className="size-8 text-rose-700">
                  <X aria-hidden="true" className="size-4" />
                </Button>}</td>
              </tr>)}
              {others.map((description, index) => <tr key={description + "-" + index}>
                <th scope="row" className="break-words px-2 py-1.5 font-medium text-slate-900">{description}</th>
                <td className="break-words px-1 py-1.5">Asociado</td><td className="break-words px-1 py-1.5 text-amber-900">Pendiente</td>
                <td className="text-right">{canUpdate && <Button type="button" size="icon" variant="ghost" aria-label={"Quitar " + description}
                  disabled={!canEditPlan} onClick={() => { setOthers((current) => current.filter((_, position) => position !== index)); setDirty(true); }}
                  className="size-8 text-rose-700"><X aria-hidden="true" className="size-4" /></Button>}</td>
              </tr>)}
              {!primaryRef && <tr><td colSpan={4} className="px-2 py-3 text-center text-slate-600">Selecciona la necesidad principal para formar el plan.</td></tr>}
            </tbody>
          </table>
          {canUpdate && <details className="mt-2 text-xs">
            <summary className="cursor-pointer font-semibold text-[#003366]">Añadir otro servicio</summary>
            <div className="mt-1 flex min-w-0 items-center gap-1">
              <input aria-label="Otro servicio" disabled={!canEditPlan || !primaryRef} value={otherDraft}
                onChange={(event) => setOtherDraft(event.target.value)} maxLength={320}
                placeholder="Descripción para revisar" className={FIELD} />
              <Button type="button" variant="ghost" size="icon" aria-label="Agregar pendiente"
                disabled={!canEditPlan || !primaryRef || otherDraft.trim().length < 3}
                onClick={() => { setOthers((current) => [...current, otherDraft.trim()]); setOtherDraft(""); setDirty(true); }}
                className="size-8 shrink-0"><Plus aria-hidden="true" className="size-4" /></Button>
            </div>
          </details>}
          {pendingService && <p className="mt-1 text-xs text-amber-900">Agrega el servicio pendiente o limpia el campo.</p>}
        </section>
      </div>

      <footer className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p role="status" className="text-xs text-slate-600">
            {workspace.selection.revision ? "Plan vigente V" + workspace.selection.revision : "Plan sin publicar"}
            {dirty && <span className="ml-2 font-semibold text-amber-900">Cambios pendientes</span>}
          </p>
          {workspace.planHistory.length > 0 && <details className="text-xs">
            <summary className="flex cursor-pointer list-none items-center gap-1 font-semibold text-[#003366]">
              <History aria-hidden="true" className="size-4" />Historial del plan
            </summary>
            <ol className="mt-1 divide-y divide-slate-100">
              {workspace.planHistory.map((plan) => <li key={plan.selectionRef} className="flex flex-wrap gap-x-2 gap-y-1 py-1">
                <strong className="text-[#003366]">V{plan.revision}</strong>
                <span>{MODE_LABEL[plan.mode]}</span>
                <span>{plan.primary?.name || "Sin necesidad principal"}</span>
                <span>{[...plan.associatedServices.map((item) => item.name), ...plan.otherServices].join(", ")}</span>
                <time dateTime={plan.createdAt} className="text-slate-600">{new Date(plan.createdAt).toLocaleString("es-DO")}</time>
              </li>)}
            </ol>
            {workspace.selection.historyCount > workspace.planHistory.length && <p className="text-slate-600">20 versiones más recientes.</p>}
          </details>}
        </div>
        {canUpdate && <Button type="button" size="sm" disabled={!canEditPlan || !dirty || !primaryRef || pendingService}
          onClick={() => void save()}><Save aria-hidden="true" />{saving || loading ? "Guardando…" :
            workspace.selection.revision ? "Guardar Plan V" + (workspace.selection.revision + 1) : "Crear plan de servicios"}</Button>}
        {primaryChanged && <p className="basis-full text-xs text-amber-900">El cambio de necesidad principal creará una nueva versión.</p>}
      </footer>
    </div>
    {intake?.addresses && <div id="storage-addresses-panel" role="tabpanel" aria-labelledby="storage-addresses-tab" hidden={activeStage !== "addresses"}>
      {(activeStage === "addresses" || openedAddresses) && intake.addresses}
    </div>}
    {intake?.costs && <div id="storage-costs-panel" role="tabpanel" aria-labelledby="storage-costs-tab" hidden={activeStage !== "costs"}>
      {activeStage === "costs" && intake.costs}
    </div>}
    {storageSelected && <div id="storage-movements-panel"
      role="tabpanel" aria-labelledby="storage-movements-tab" hidden={activeStage !== "movements"}>
      <CommercialStorageAuthorizationPanel caseRef={caseRef} selectionRef={workspace.selection.selectionRef}
        primary={workspace.selection.primary} complementaries={workspace.selection.complementaries} authorization={authorization}
        canAuthorize={canUpdate && canContinue} activeView="authorization" showRequirementDetails />
    </div>}
    <div id="storage-configuration-panel" role="tabpanel" aria-labelledby="storage-configuration-tab" hidden={activeStage !== "configuration"}>
      {canViewConfiguration && (activeStage === "configuration" || openedConfiguration) && <section className="mt-4" data-testid="case-service-configuration">
        <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-[#003366]">Recursos y materiales</h3><span className="text-xs text-slate-500">Revisión {current?.revision || 0}</span></div>
        {configurationLoading && <p role="status" className="mt-2 text-xs text-slate-600">Cargando configuración…</p>}
        {configurationUnavailable && <p role="alert" className="mt-2 flex flex-wrap items-center gap-2 text-xs text-red-800">
          No fue posible cargar la configuración.<Button type="button" variant="ghost" size="sm" onClick={reloadConfiguration}>Reintentar</Button>
        </p>}
        {configuration && <>
          <QuickQuoteConfigurator key={selectionKey + ":" + (current?.revision || 0) + ":" + (configuration.surveySummary?.publicationRef || "")}
            caseRef={caseRef} authorization={authorization} canReadCatalog={canReadCatalog} surveySummary={configuration.surveySummary}
            routeRevision={configuration.routeRevision} estimatedVolumeM3={configuration.estimatedVolumeM3}
            packages={eligiblePackages} policies={configuration.materialPolicies} initialPackageVersionRef={packageVersionRef}
            initialPolicyVersionRef={policyVersionRef} initialDurationHours={durationHours} initialPreference={current?.preference || {}}
            disabled={!canConfigure || !canContinue || configurationLoading || configurationUnavailable} saving={configurationSaving} onConfirm={(draft) => void saveConfiguration(draft)} />
          <details className="mt-4 rounded-lg border border-slate-200 bg-white"><summary className="cursor-pointer px-3 py-2 text-xs font-bold text-slate-700">Ver recursos y requerimientos confirmados</summary><div className="overflow-x-auto border-t"><div className="grid min-w-[700px] grid-cols-[120px_minmax(180px,1fr)_100px_110px_120px] border-b bg-slate-50 px-3 py-2 text-[10px] font-black uppercase text-slate-500"><span>Tipo</span><span>Requerimiento</span><span>Cantidad</span><span>Disposición</span><span>Fuente</span></div>{current?.items.map((item) => <div key={item.itemRef} className="grid min-w-[700px] grid-cols-[120px_minmax(180px,1fr)_100px_110px_120px] border-b px-3 py-2 text-xs"><span>{item.kind}</span><strong>{item.name}</strong><span>{item.quantity ?? item.hours ?? item.days ?? "—"} {item.unitCode || ""}</span><span>{item.disposition || item.chargeType || "—"}</span><span>{item.source}</span></div>)}{!current && <p className="p-4 text-xs text-slate-500">Aún no se han guardado los recursos del servicio.</p>}</div></details>
          {current?.conflicts.some((item) => item.state === "OPEN") && <p role="alert" className="mt-3 bg-amber-50 p-3 text-sm font-semibold text-amber-900">Existe un conflicto de configuraciones equivalentes. Debe resolverse administrativamente; no se eligió una al azar.</p>}
          <p className="mt-3 text-[11px] text-slate-500">Precedencia: ajuste del caso → acuerdo comercial → paquete → modo/servicio → resolución manual.</p>
        </>}
      </section>}
    </div>
  </section>;
}
