import { Fragment, lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from "react";
import { AdministrationHelp, AdministrationIconAction } from "@/administration/AdministrationHelp";
import { ArrowLeft, Check, CircleHelp, Pencil, Plus, RefreshCw, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { COMPACT_TABLE_BODY, COMPACT_TABLE_FIELD as FIELD, COMPACT_TABLE_HEAD } from "@/components/ui/compact-form";
import { NumericInput } from "@/components/ui/numeric-input";
import type { CostingUiAccess } from "@/costing/access";
import { costUnitLabel } from "@/costing/componentLabels";
import type { CrmServicesUiAccess } from "./access";
import { CrmServicesApi, CrmServicesApiError, type ServiceCatalogItem, type ServiceMaterialPolicy, type ServiceMode, type ServicePackage } from "./api";
import ServiceCatalogAdmin from "./ServiceCatalogAdmin";
import MaterialPolicySheet from "./MaterialPolicySheet";
import ServiceSetupGuide, { SERVICE_SETUP_LABELS, type ServiceSetupTab } from "./ServiceSetupGuide";
import { draftFromPolicy, newPolicyDraft, policySavePayload, validatePolicyDraft, type PolicyDraft } from "./materialPolicyDraft";

const PackagePricingAdmin = lazy(() => import("@/costing/PackagePricingAdmin"));

type Props = Readonly<{ authorization?: string; access: CrmServicesUiAccess; costingAccess?: CostingUiAccess; onUnauthorized(): void }>;
type NewModeDraft = Readonly<{ modeRef: null; code: string; scope: "LOCAL" | "EXPORT" | "IMPORT"; name: string; description: null; state: "DRAFT" | "PUBLISHED"; version: 0 }>;
const MODE_SCOPES = [
  { code: "LOCAL", label: "Local / Nacional" }, { code: "EXPORT", label: "Exportación" }, { code: "IMPORT", label: "Importación" },
] as const;
type RequirementDraft = Readonly<{ kind: "PERSONNEL" | "MATERIAL" | "ASSET" | "VEHICLE" | "TRANSPORT" | "DURATION" | "CRATING"; code: string | null; name: string; quantity: string; unitCode: string; hours: string; days: string; phaseCode: string | null; configuration: Readonly<Record<string, unknown>>; authorityRef: string; disposition: "" | "CONSUMED" | "RENTED" | "RETURNABLE" | "USAGE_CHARGE"; chargeType: "" | "INCLUDED" | "SALE" | "RENTAL" | "USAGE" }>;
type PackageDraft = Readonly<{ packageRef: string | null; expectedVersion: number | null; code: string; name: string; description: string; category: string; tags: readonly string[]; validFrom: string | null; validTo: string | null; modeRefs: readonly string[]; primaryServiceRef: string; complementaryRefs: readonly string[]; requirements: readonly RequirementDraft[]; state: "DRAFT" | "PUBLISHED" }>;

const EMPTY_PACKAGE: PackageDraft = Object.freeze({ packageRef: null, expectedVersion: null, code: "", name: "", description: "", category: "", tags: [], validFrom: null, validTo: null, modeRefs: [], primaryServiceRef: "", complementaryRefs: [], requirements: [], state: "DRAFT" });
const EMPTY_REQUIREMENT: RequirementDraft = Object.freeze({ kind: "DURATION", code: null, name: "Duración estimada", quantity: "", unitCode: "", hours: "", days: "", phaseCode: null, configuration: {}, authorityRef: "", disposition: "", chargeType: "" });
const numberOrNull = (value: string) => value.trim() ? Number(value.replace(",", ".")) : null;
const CONFIG_STATES = { DRAFT: "Borrador", PUBLISHED: "Publicado", INACTIVE: "Inactivo" };
const REQUIREMENT_KINDS: Record<RequirementDraft["kind"], string> = {
  PERSONNEL: "Personal", MATERIAL: "Material", ASSET: "Equipo", VEHICLE: "Vehículo",
  TRANSPORT: "Transporte", DURATION: "Duración", CRATING: "Huacal",
};
const REQUIREMENT_CHARGES = { "": "—", INCLUDED: "Incluido", SALE: "Venta", RENTAL: "Alquiler", USAGE: "Uso" };
const RESOURCE_REFERENCE = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const GRID_WRAP = "overflow-auto border-b border-slate-200 max-h-[max(14rem,calc(100dvh-19rem))]";
const ACTION = "border-transparent bg-transparent";

export default function ServiceConfigurationAdmin({ authorization, access, costingAccess, onUnauthorized }: Props) {
  const modeForm = useId();
  const requirementForm = useId();
  const guideId = useId();
  const guideTrigger = useRef<HTMLButtonElement>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const api = useMemo(() => new CrmServicesApi(() => authorization || null), [authorization]);
  const [tab, setTab] = useState<ServiceSetupTab>(access.canPackagesView && costingAccess?.canRulesView ? "PRICING" : "CATALOG");
  const [modes, setModes] = useState<readonly ServiceMode[]>([]); const [catalog, setCatalog] = useState<readonly ServiceCatalogItem[]>([]); const [catalogModes, setCatalogModes] = useState<readonly Readonly<{ serviceRef: string; modeRefs: readonly string[] }>[]>([]); const [packages, setPackages] = useState<readonly ServicePackage[]>([]); const [policies, setPolicies] = useState<readonly ServiceMaterialPolicy[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [packageDraft, setPackageDraft] = useState<PackageDraft | null>(null); const [policyDraft, setPolicyDraft] = useState<PolicyDraft | null>(null); const [modeDraft, setModeDraft] = useState<ServiceMode | NewModeDraft | null>(null); const [requirementDraft, setRequirementDraft] = useState<RequirementDraft | null>(null); const [saving, setSaving] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [dataReady, setDataReady] = useState(false);
  const [requirementIndex, setRequirementIndex] = useState<number | null>(null);
  const [showModeMappings, setShowModeMappings] = useState(false);
  const pendingCommands = useRef<Record<string, string>>({});
  const withRequestId = (operation: string, payload: Record<string, unknown>) => {
    // Keep one identity for the open draft, even if an uncertain save is followed by edits.
    // A committed request with different data must conflict rather than create a second record.
    if (!pendingCommands.current[operation]) pendingCommands.current[operation] = crypto.randomUUID();
    return { ...payload, requestId: pendingCommands.current[operation] };
  };
  const allowedTabs: ServiceSetupTab[] = [];
  if (access.canPackagesView && costingAccess?.canRulesView) allowedTabs.push("PRICING", "COSTS");
  if (access.canCatalogView) allowedTabs.push("CATALOG");
  if (access.canCatalogView && access.canPackagesView) allowedTabs.push("MODES");
  if (access.canPackagesView) allowedTabs.push("PACKAGES");
  if (access.canMaterialsView) allowedTabs.push("MATERIALS");
  const activeTab = allowedTabs.includes(tab) ? tab : allowedTabs[0];
  const dataTab = activeTab === "COSTS" ? "PRICING" : activeTab;
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
    if (!dataTab) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setDataReady(false);
    setError(null);
    // Modes belong to the packages read contract; catalog mappings require catalog read.
    const readCatalog = access.canCatalogView;
    const readCatalogModes = access.canCatalogView && access.canPackagesView && (dataTab === "MODES" || dataTab === "PRICING");
    const readPackages = access.canPackagesView && (dataTab === "PACKAGES" || dataTab === "MATERIALS" || dataTab === "PRICING");
    void Promise.all([
      access.canPackagesView ? api.modes(controller.signal) : Promise.resolve([]),
      readCatalog ? api.catalog(controller.signal) : Promise.resolve([]),
      readCatalogModes ? api.catalogModes(controller.signal) : Promise.resolve([]),
      readPackages ? api.packages(controller.signal) : Promise.resolve([]),
      access.canMaterialsView && dataTab === "MATERIALS" ? api.materialPolicies(controller.signal) : Promise.resolve([]),
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
  }, [access.canCatalogView, access.canMaterialsView, access.canPackagesView, dataTab, api, onUnauthorized, refreshVersion]);
  const activeServices = catalog.filter((item) => item.status === "ACTIVE"); const primaries = activeServices.filter((item) => ["PRIMARY", "BOTH"].includes(item.usage)); const complementaries = activeServices.filter((item) => ["COMPLEMENTARY", "BOTH"].includes(item.usage));
  const linkableModes = modes.filter((mode) => mode.state !== "INACTIVE");
  const changeRequirement = (index: number | null, item: RequirementDraft) => {
    setRequirementIndex(index);
    setRequirementDraft(item);
  };
  const closePackage = () => {
    setError(null);
    setRequirementDraft(null);
    setPackageDraft(null);
  };
  const editPackage = (row: ServicePackage) => { delete pendingCommands.current.PACKAGE_SAVE; setError(null); setPackageDraft({ packageRef: row.packageRef, expectedVersion: row.version, code: row.code, name: row.name, description: row.description || "", category: row.category || "", tags: row.tags, validFrom: row.validFrom, validTo: row.validTo, modeRefs: row.modes.map((mode) => mode.modeRef), primaryServiceRef: row.primary?.serviceRef || "", complementaryRefs: row.complementaries.map((item) => item.serviceRef), requirements: row.requirements.map((item) => ({ kind: item.kind, code: item.code, name: item.name, quantity: item.quantity?.toString() || "", unitCode: item.unitCode || "", hours: item.hours?.toString() || "", days: item.days?.toString() || "", phaseCode: item.phaseCode, configuration: item.configuration, authorityRef: item.materialRef || item.assetModelRef || item.capabilityRef || "", disposition: (item.disposition || "") as RequirementDraft["disposition"], chargeType: (item.chargeType || "") as RequirementDraft["chargeType"] })), state: row.state === "PUBLISHED" ? "DRAFT" : row.state as "DRAFT" }); };
  const savePackage = async () => {
    if (!packageDraft || !canEditPackage || activeTab !== "PACKAGES" || loading || !dataReady || saving || requirementDraft) return;
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
      closePackage();
      load();
    } catch (cause) {
      if (cause instanceof CrmServicesApiError && cause.status === 401) onUnauthorized();
      else if (cause instanceof CrmServicesApiError && cause.code === "SERVICE_PACKAGES_IDEMPOTENCY_CONFLICT") setError("Ya se confirmó un guardado anterior de este borrador. Cierre y actualice el listado antes de continuar.");
      else if (cause instanceof CrmServicesApiError && cause.code === "SERVICE_PACKAGES_MODE_INCOMPATIBLE") setError("Revisa en Modalidades la compatibilidad de los servicios seleccionados.");
      else if (cause instanceof CrmServicesApiError && cause.code === "SERVICE_PACKAGES_RESOURCE_NOT_FOUND") setError("Revisa las referencias de los recursos. Al menos uno no está disponible.");
      else setError("No se pudo guardar el paquete. Revisa los recursos y la versión vigente.");
    } finally { setSaving(false); }
  };
  const createTariffPackage = async (value: { name: string; modeRef: string; primaryServiceRef: string; requestId: string }) => {
    const result = await api.savePackage({
      requestId: value.requestId, packageRef: null, expectedVersion: null, code: null, name: value.name,
      description: null, category: null, tags: [], modeRefs: [value.modeRef], primaryServiceRef: value.primaryServiceRef,
      complementaryRefs: [], requirements: [], state: "PUBLISHED", validFrom: null, validTo: null,
    });
    setPackages((current) => [...current.filter((pkg) => pkg.versionRef !== result.package.versionRef), result.package]);
    return result.package;
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
    if (!modeDraft || !canEditMode || activeTab !== "MODES" || loading || !dataReady || saving) return;
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
  const toggleCatalogMode = async (serviceRef: string, modeRef: string) => {
    if (!access.canCatalogView || !access.canCatalogManage || !access.canPackagesView || activeTab !== "MODES" || loading || !dataReady || saving) return;
    const current = catalogModes.find((entry) => entry.serviceRef === serviceRef)?.modeRefs || [];
    const modeRefs = current.includes(modeRef) ? current.filter((entry) => entry !== modeRef) : [...current, modeRef];
    if (!modeRefs.length) { setError("Selecciona al menos una modalidad para el servicio."); return; }
    setSaving(true);
    setError(null);
    try {
      await api.saveCatalogModes({ requestId: crypto.randomUUID(), serviceRef, modeRefs });
      setCatalogModes((rows) => [...rows.filter((row) => row.serviceRef !== serviceRef), { serviceRef, modeRefs }]);
    } catch (cause) {
      if (cause instanceof CrmServicesApiError && cause.status === 401) onUnauthorized();
      else setError("No se pudo guardar la modalidad del servicio.");
    } finally { setSaving(false); }
  };
  const modeEditor = modeDraft && <tr className="bg-sky-50/70">
    <td><input form={modeForm} aria-label="Nombre de la modalidad" className={FIELD} maxLength={160} required disabled={saving}
      value={modeDraft.name} onChange={(event) => setModeDraft({ ...modeDraft, name: event.target.value })} /></td>
    <td>{modeDraft.modeRef === null ? <select form={modeForm} aria-label="Alcance" className={FIELD} disabled={saving}
      value={modeDraft.scope} onChange={(event) => {
        const scope = availableModeScopes.find((item) => item.code === event.target.value);
        if (scope) setModeDraft({ ...modeDraft, scope: scope.code, name: !modeDraft.name.trim() || MODE_SCOPES.some((item) => item.label === modeDraft.name) ? scope.label : modeDraft.name });
      }}>{availableModeScopes.map((scope) => <option key={scope.code} value={scope.code}>{scope.label}</option>)}</select>
      : MODE_SCOPES.find((scope) => scope.code === modeDraft.code)?.label ?? "—"}</td>
    <td><select form={modeForm} aria-label="Estado de la modalidad" className={FIELD} disabled={saving}
      value={modeDraft.state} onChange={(event) => {
        const state = event.target.value as ServiceMode["state"];
        if (modeDraft.modeRef === null && state === "INACTIVE") return;
        if (modeDraft.modeRef === null) setModeDraft({ ...modeDraft, state: state as NewModeDraft["state"] });
        else setModeDraft({ ...modeDraft, state });
      }}>
      <option value="DRAFT">Borrador</option><option value="PUBLISHED">Publicada</option>
      {modeDraft.state === "INACTIVE" && <option value="INACTIVE">Inactiva</option>}
    </select></td>
    <td>{modeDraft.version ? "v" + modeDraft.version : "—"}</td>
    <td><form id={modeForm} onSubmit={(event) => { event.preventDefault(); void saveMode(); }} className="flex justify-end">
      <AdministrationIconAction label="Guardar modalidad" type="submit" className={ACTION + " text-emerald-700"} disabled={saving || !modeDraft.name.trim()}>
        <Check aria-hidden="true" className="size-4" /></AdministrationIconAction>
      <AdministrationIconAction label="Cancelar edición de modalidad" className={ACTION} disabled={saving}
        onClick={() => { setModeDraft(null); setError(null); }}><X aria-hidden="true" className="size-4" /></AdministrationIconAction>
    </form></td>
  </tr>;

  const requirementEditor = requirementDraft && <tr className="bg-sky-50/70">
    <td><select form={requirementForm} aria-label="Tipo de recurso" className={FIELD} value={requirementDraft.kind}
      onChange={(event) => setRequirementDraft({ ...requirementDraft, kind: event.target.value as RequirementDraft["kind"], code: null, authorityRef: "" })}>
      {Object.entries(REQUIREMENT_KINDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select></td>
    <td><input form={requirementForm} aria-label="Nombre del recurso" className={FIELD} required maxLength={160} value={requirementDraft.name}
      onChange={(event) => setRequirementDraft({ ...requirementDraft, name: event.target.value })} /></td>
    <td><NumericInput form={requirementForm} aria-label="Cantidad del recurso" className={FIELD + " text-right"} allowDecimalComma min={0} max={1_000_000} step="any"
      value={requirementDraft.quantity} onChange={(event) => setRequirementDraft({ ...requirementDraft, quantity: event.target.value })} /></td>
    <td><input form={requirementForm} aria-label="Unidad del recurso" className={FIELD} maxLength={32} value={requirementDraft.unitCode}
      onChange={(event) => setRequirementDraft({ ...requirementDraft, unitCode: event.target.value })} /></td>
    <td><NumericInput form={requirementForm} aria-label="Horas del recurso" className={FIELD + " text-right"} allowDecimalComma min={0} max={100_000} step="any"
      value={requirementDraft.hours} onChange={(event) => setRequirementDraft({ ...requirementDraft, hours: event.target.value })} /></td>
    <td><NumericInput form={requirementForm} aria-label="Días del recurso" className={FIELD + " text-right"} allowDecimalComma min={0} max={10_000} step="any"
      value={requirementDraft.days} onChange={(event) => setRequirementDraft({ ...requirementDraft, days: event.target.value })} /></td>
    <td>{["PERSONNEL", "MATERIAL", "ASSET"].includes(requirementDraft.kind) && <input form={requirementForm} aria-label="Referencia del catálogo"
      className={FIELD} placeholder="Requerida" title="Referencia del recurso en su catálogo" required pattern={RESOURCE_REFERENCE}
      value={requirementDraft.authorityRef} onChange={(event) => setRequirementDraft({ ...requirementDraft, authorityRef: event.target.value.trim().toLowerCase() })} />}</td>
    <td>{REQUIREMENT_CHARGES[requirementDraft.chargeType]}</td>
    <td><form id={requirementForm} className="flex justify-end" onSubmit={(event) => {
      event.preventDefault();
      if (!requirementDraft.name.trim()) return;
      setPackageDraft((current) => current ? {
        ...current, requirements: requirementIndex === null ? [...current.requirements, requirementDraft]
          : current.requirements.map((item, index) => index === requirementIndex ? requirementDraft : item),
      } : current);
      setRequirementDraft(null);
    }}>
      <AdministrationIconAction label="Guardar fila del recurso" type="submit" className={ACTION + " text-emerald-700"} disabled={!requirementDraft.name.trim()}>
        <Check aria-hidden="true" className="size-4" /></AdministrationIconAction>
      <AdministrationIconAction label="Cancelar edición del recurso" className={ACTION} onClick={() => setRequirementDraft(null)}><X aria-hidden="true" className="size-4" /></AdministrationIconAction>
    </form></td>
  </tr>;

  if (!activeTab) return null;
  return <section id="admin-service-configuration" className="mt-3 min-w-0" data-testid="service-configuration-admin">
    <header className="flex items-center justify-between gap-2 border-b border-slate-200 pb-1.5">
      <div className="flex items-center gap-1">
        <h2 className="text-base font-semibold text-slate-950">Servicios y combinaciones</h2>
        <button ref={guideTrigger} type="button" aria-label="Guía de Servicios y combinaciones"
          aria-expanded={guideOpen} aria-controls={guideOpen ? guideId : undefined} onClick={() => setGuideOpen(!guideOpen)}
          className={"inline-flex h-8 items-center gap-1 rounded px-2 text-xs font-semibold hover:bg-sky-50 hover:text-[#003366] " +
            (guideOpen ? "bg-sky-100 text-[#003366]" : "text-slate-600")}>
          <CircleHelp aria-hidden="true" className="size-4 shrink-0" /><span>Guía</span>
        </button>
      </div>
      <AdministrationIconAction label="Actualizar configuración de Servicios" disabled={loading || saving} onClick={load}><RefreshCw aria-hidden="true" className="size-4" /></AdministrationIconAction>
    </header>
    <nav aria-label="Configuración de Servicios" className="flex gap-1 overflow-x-auto border-b border-slate-200 pt-1">
      {allowedTabs.map((value) => <button key={value} type="button" disabled={saving} onClick={() => setTab(value)}
        aria-current={activeTab === value ? "page" : undefined}
        className={"whitespace-nowrap border-b-2 px-3 py-2 text-xs font-bold " + (activeTab === value
          ? "border-[#0070a8] bg-sky-50 text-[#003366]" : "border-transparent text-slate-600 hover:bg-slate-100")}>{SERVICE_SETUP_LABELS[value]}</button>)}
    </nav>
    <div className={guideOpen ? "grid min-w-0 gap-2 pt-2 xl:grid-cols-[minmax(0,1fr)_18.5rem] xl:items-start" : "min-w-0"}>
      {guideOpen && <ServiceSetupGuide id={guideId} activeTab={activeTab} allowedTabs={allowedTabs} onClose={() => {
        setGuideOpen(false);
        guideTrigger.current?.focus();
      }} />}
      <div className="min-w-0 xl:order-1">
    {!loading && dataReady && (activeTab === "PRICING" || activeTab === "COSTS") && costingAccess?.canRulesView && <Suspense fallback={<p role="status" className="py-3 text-xs text-slate-600">Cargando tarifas…</p>}>
      <PackagePricingAdmin view={activeTab} authorization={authorization} packages={packages} canManage={costingAccess.canRulesManage} onUnauthorized={onUnauthorized}
        modes={modes} services={primaries} catalogModes={catalogModes} onCreate={canEditPackage && costingAccess.canRulesManage ? createTariffPackage : undefined} />
    </Suspense>}
    {error && !policyDraft && !packageDraft && <p role="alert" className="py-2 text-xs font-medium text-red-800">{error}</p>}
    {loading && <p role="status" className="py-3 text-xs text-slate-600">Cargando configuración…</p>}

    {!loading && dataReady && activeTab === "CATALOG" && <ServiceCatalogAdmin api={api} rows={catalog}
      canManage={access.canCatalogManage} onUpdate={setCatalog} onUnauthorized={onUnauthorized} />}

    {!loading && dataReady && activeTab === "MODES" && <section aria-label="Modalidades de servicio" className="pt-1">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 py-1.5">
        <button type="button" className={"px-2.5 py-1.5 text-xs font-semibold " + (!showModeMappings ? "bg-sky-50 text-[#003366]" : "text-slate-600")}
          aria-pressed={!showModeMappings} disabled={Boolean(modeDraft)} onClick={() => setShowModeMappings(false)}>Lista</button>
        <button type="button" className={"px-2.5 py-1.5 text-xs font-semibold " + (showModeMappings ? "bg-sky-50 text-[#003366]" : "text-slate-600")}
          aria-pressed={showModeMappings} disabled={Boolean(modeDraft)} onClick={() => setShowModeMappings(true)}>Compatibilidad</button>
        {!showModeMappings && canEditMode && availableModeScopes.length > 0 && <AdministrationIconAction label="Nueva modalidad" mobileLabel="Nueva"
          disabled={Boolean(modeDraft) || saving} onClick={openNewMode}><Plus aria-hidden="true" className="size-4" /></AdministrationIconAction>}
        <AdministrationHelp title="modalidades de servicio">
          <p>Publica la modalidad para poder usarla al crear un paquete. En Compatibilidad puedes ajustar las modalidades permitidas para cada servicio.</p>
        </AdministrationHelp>
      </div>
      <div className={GRID_WRAP}>
        {showModeMappings ? <table className="w-full min-w-[540px] text-left" aria-label="Compatibilidad por servicio">
          <thead className={COMPACT_TABLE_HEAD}><tr><th scope="col">Servicio</th>
            {linkableModes.map((mode) => <th key={mode.modeRef} scope="col" className="text-center">{mode.name}</th>)}
          </tr></thead>
          <tbody className={COMPACT_TABLE_BODY}>{catalog.map((service) => {
            const mappings = catalogModes.find((entry) => entry.serviceRef === service.serviceRef)?.modeRefs ?? [];
            return <tr className="h-9" key={service.serviceRef}><td className="font-semibold">{service.name}</td>
              {linkableModes.map((mode) => <td key={mode.modeRef} className="text-center">
                <input type="checkbox" aria-label={mode.name + " para " + service.name} disabled={!access.canCatalogManage || saving}
                  checked={mappings.includes(mode.modeRef)} onChange={() => void toggleCatalogMode(service.serviceRef, mode.modeRef)} />
              </td>)}
            </tr>;
          })}
          {!catalog.length && <tr><td colSpan={linkableModes.length + 1} className="h-10 text-slate-500">Registra un servicio en la pestaña Servicios.</td></tr>}
          </tbody>
        </table> : <table className="w-full min-w-[480px] table-fixed text-left" aria-label="Modalidades">
          <thead className={COMPACT_TABLE_HEAD}><tr><th scope="col" className="w-[34%]">Modalidad</th><th scope="col" className="w-[26%]">Alcance</th>
            <th scope="col" className="w-[18%]">Estado</th><th scope="col" className="w-[9%]">Versión</th><th scope="col"><span className="sr-only">Acciones</span></th></tr></thead>
          <tbody className={COMPACT_TABLE_BODY}>
            {modeDraft?.modeRef === null && modeEditor}
            {modes.map((mode) => modeDraft?.modeRef === mode.modeRef ? <Fragment key={mode.modeRef}>{modeEditor}</Fragment>
              : <tr className="h-9 text-slate-700 hover:bg-slate-50" key={mode.modeRef}><td className="font-semibold">{mode.name}</td>
                <td>{MODE_SCOPES.find((scope) => scope.code === mode.code)?.label ?? "—"}</td>
                <td>{CONFIG_STATES[mode.state]}</td><td>v{mode.version}</td>
                <td className="text-right">{canEditMode && <AdministrationIconAction label={"Editar modalidad " + mode.name} className={ACTION} disabled={Boolean(modeDraft) || saving}
                  onClick={() => { delete pendingCommands.current.MODE_SAVE; setError(null); setModeDraft(mode); }}><Pencil aria-hidden="true" className="size-4" /></AdministrationIconAction>}</td>
              </tr>)}
            {!modes.length && !modeDraft && <tr><td colSpan={5} className="h-10 text-slate-500">Sin modalidades registradas.</td></tr>}
          </tbody>
        </table>}
      </div>
    </section>}

    {!loading && dataReady && activeTab === "PACKAGES" && <section aria-label="Paquetes operativos" className="pt-1">
      {packageDraft ? <>
        <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 py-1.5">
          <AdministrationIconAction label="Volver a paquetes operativos" className={ACTION} disabled={saving} onClick={closePackage}><ArrowLeft aria-hidden="true" className="size-4" /></AdministrationIconAction>
          <h3 className="min-w-32 flex-1 text-sm font-semibold text-[#003366]">{packageDraft.packageRef ? packageDraft.name || "Editar paquete" : "Nuevo paquete operativo"}</h3>
          <label className="flex items-center gap-1 text-xs">Estado<select aria-label="Estado del paquete operativo" className={FIELD + " w-28"} disabled={saving}
            value={packageDraft.state} onChange={(event) => setPackageDraft({ ...packageDraft, state: event.target.value as PackageDraft["state"] })}>
            <option value="DRAFT">Borrador</option><option value="PUBLISHED">Publicado</option>
          </select></label>
          <AdministrationHelp title="paquetes operativos"><p>Define los servicios, recursos y tiempos que se cargan al planificar la operación. Cada publicación conserva las versiones usadas en los casos previos.</p></AdministrationHelp>
          <Button size="sm" type="button" disabled={saving || Boolean(requirementDraft) || !packageDraft.name.trim() || !packageDraft.primaryServiceRef || !packageDraft.modeRefs.length}
            onClick={() => void savePackage()}><Save aria-hidden="true" />{saving ? "Guardando…" : "Guardar versión"}</Button>
        </header>
        {error && <p role="alert" className="py-2 text-xs text-red-800">{error}</p>}
        <fieldset disabled={saving} className="grid gap-x-3 gap-y-2 border-b border-slate-200 bg-white px-2 py-2 text-xs sm:grid-cols-2 xl:grid-cols-3">
          <label className="font-semibold text-slate-600">Nombre<input className={FIELD} maxLength={160} value={packageDraft.name}
            onChange={(event) => setPackageDraft({ ...packageDraft, name: event.target.value })} /></label>
          <label className="font-semibold text-slate-600">Servicio principal<select className={FIELD} value={packageDraft.primaryServiceRef}
            onChange={(event) => setPackageDraft({ ...packageDraft, primaryServiceRef: event.target.value,
              complementaryRefs: packageDraft.complementaryRefs.filter((ref) => ref !== event.target.value) })}>
            <option value="">Selecciona un servicio</option>{primaries.map((item) => <option key={item.serviceRef} value={item.serviceRef}>{item.name}</option>)}
          </select></label>
          <fieldset>
            <legend className="font-semibold text-slate-600">Modalidades</legend>
            <div className="flex flex-wrap gap-x-3 gap-y-1 py-1.5">{linkableModes.map((mode) => <label key={mode.modeRef} className="flex items-center gap-1">
              <input type="checkbox" checked={packageDraft.modeRefs.includes(mode.modeRef)} onChange={() => setPackageDraft({
                ...packageDraft, modeRefs: packageDraft.modeRefs.includes(mode.modeRef)
                  ? packageDraft.modeRefs.filter((ref) => ref !== mode.modeRef) : [...packageDraft.modeRefs, mode.modeRef],
              })} />{mode.name}
            </label>)}</div>
          </fieldset>
        </fieldset>
        <details className="border-b border-slate-200 px-2 py-2 text-xs">
          <summary className="cursor-pointer font-semibold text-[#003366]">Servicios complementarios · {packageDraft.complementaryRefs.length}</summary>
          <div className="flex max-h-24 flex-wrap gap-x-4 gap-y-2 overflow-auto pt-2">
            {complementaries.filter((item) => item.serviceRef !== packageDraft.primaryServiceRef).map((item) => <label key={item.serviceRef} className="flex items-center gap-1">
              <input type="checkbox" disabled={saving} checked={packageDraft.complementaryRefs.includes(item.serviceRef)} onChange={() => setPackageDraft({
                ...packageDraft, complementaryRefs: packageDraft.complementaryRefs.includes(item.serviceRef)
                  ? packageDraft.complementaryRefs.filter((ref) => ref !== item.serviceRef) : [...packageDraft.complementaryRefs, item.serviceRef],
              })} />{item.name}
            </label>)}
          </div>
        </details>
        <div className="flex items-center gap-1 py-1">
          <h4 className="mr-1 text-xs font-semibold text-slate-700">Recursos previstos</h4>
          <AdministrationIconAction label="Agregar recurso" mobileLabel="Agregar" disabled={saving || Boolean(requirementDraft) || packageDraft.requirements.length >= 100}
            onClick={() => changeRequirement(null, EMPTY_REQUIREMENT)}><Plus aria-hidden="true" className="size-4" /></AdministrationIconAction>
          <AdministrationHelp title="recursos previstos"><p>Indica qué personal, materiales, vehículos o equipos necesita el servicio. La asignación concreta se hace al planificar.</p><p>Los tipos Personal, Material y Equipo requieren la referencia del recurso registrado en el catálogo correspondiente.</p></AdministrationHelp>
        </div>
        <div className={GRID_WRAP}>
          <table className="w-full min-w-[760px] table-fixed text-left" aria-label="Recursos previstos">
            <thead className={COMPACT_TABLE_HEAD}><tr>
              <th scope="col" className="w-[12%]">Tipo</th><th scope="col" className="w-[20%]">Recurso</th><th scope="col" className="w-[8%] text-right">Cant.</th>
              <th scope="col" className="w-[9%]">Unidad</th><th scope="col" className="w-[7%] text-right">Horas</th><th scope="col" className="w-[7%] text-right">Días</th>
              <th scope="col" className="w-[16%]">Ref. de catálogo</th><th scope="col" className="w-[9%]">Cargo</th><th scope="col"><span className="sr-only">Acciones</span></th>
            </tr></thead>
            <tbody className={COMPACT_TABLE_BODY}>
              {requirementIndex === null && requirementEditor}
              {packageDraft.requirements.map((item, index) => requirementDraft && requirementIndex === index
                ? <Fragment key={index}>{requirementEditor}</Fragment>
                : <tr key={index} className="h-9 text-slate-700 hover:bg-slate-50">
                  <td>{REQUIREMENT_KINDS[item.kind]}</td><td className="break-words font-semibold">{item.name}</td>
                  <td className="text-right tabular-nums">{item.quantity || "—"}</td><td>{item.unitCode ? costUnitLabel(item.unitCode) : "—"}</td>
                  <td className="text-right tabular-nums">{item.hours || "—"}</td><td className="text-right tabular-nums">{item.days || "—"}</td>
                  <td className="truncate" title={item.authorityRef}>{item.authorityRef || "—"}</td><td>{REQUIREMENT_CHARGES[item.chargeType]}</td>
                  <td className="text-right"><AdministrationIconAction label={"Editar recurso " + item.name} className={ACTION} disabled={saving || Boolean(requirementDraft)}
                    onClick={() => changeRequirement(index, item)}><Pencil aria-hidden="true" className="size-4" /></AdministrationIconAction></td>
                </tr>)}
              {!packageDraft.requirements.length && !requirementDraft && <tr><td colSpan={9} className="h-10 text-slate-500">Sin recursos previstos.</td></tr>}
            </tbody>
          </table>
        </div>
      </> : <>
        <div className="flex items-center gap-2 border-b border-slate-200 py-1.5">
          <h3 className="text-sm font-semibold text-[#003366]">Paquetes operativos</h3>
          {canEditPackage && <AdministrationIconAction label="Nuevo paquete operativo" mobileLabel="Nuevo"
            onClick={() => { delete pendingCommands.current.PACKAGE_SAVE; setError(null); setPackageDraft(EMPTY_PACKAGE); }}><Plus aria-hidden="true" className="size-4" /></AdministrationIconAction>}
          <AdministrationHelp title="configuración operativa"><p>Configura los recursos y servicios predeterminados por paquete. Para costos, mínimos y precios de venta, entra en Tarifario.</p></AdministrationHelp>
        </div>
        <div className={GRID_WRAP}>
          <table className="w-full min-w-[660px] table-fixed text-left" aria-label="Paquetes operativos">
            <thead className={COMPACT_TABLE_HEAD}><tr><th scope="col" className="w-[30%]">Paquete</th><th scope="col" className="w-[23%]">Modalidad</th>
              <th scope="col" className="w-[24%]">Servicios</th><th scope="col" className="w-[12%]">Estado</th>
              <th scope="col" className="w-[7%]">Ver.</th><th scope="col"><span className="sr-only">Acciones</span></th></tr></thead>
            <tbody className={COMPACT_TABLE_BODY}>
              {packages.map((row) => <tr key={row.versionRef} className="h-9 text-slate-700 hover:bg-slate-50">
                <td className="break-words font-semibold">{row.name}</td><td>{row.modes.map((mode) => mode.name).join(", ")}</td>
                <td>{row.primary?.name ?? "—"}{row.complementaries.length > 0 && " +" + row.complementaries.length}</td>
                <td>{CONFIG_STATES[row.state]}</td><td>v{row.version}</td>
                <td className="text-right">{canEditPackage && <AdministrationIconAction label={"Editar operación de " + row.name + " v" + row.version}
                  className={ACTION} onClick={() => editPackage(row)}><Pencil aria-hidden="true" className="size-4" /></AdministrationIconAction>}</td>
              </tr>)}
              {!packages.length && <tr><td colSpan={6} className="h-10 text-slate-500">Sin paquetes registrados.</td></tr>}
            </tbody>
          </table>
        </div>
      </>}
    </section>}

    {!loading && dataReady && activeTab === "MATERIALS" && (policyDraft && canEditPolicy
      ? <MaterialPolicySheet api={api} draft={policyDraft} packages={packages} modes={modes} services={catalog} canReadServices={access.canCatalogView}
        saving={saving} error={error} onChange={setPolicyDraft} onSave={() => void savePolicy()}
        onClose={() => { if (!saving) { setPolicyDraft(null); setError(null); } }} onUnauthorized={onUnauthorized} />
      : <section aria-label="Políticas de materiales" className="pt-1">
        <div className="flex items-center gap-2 border-b border-slate-200 py-1.5">
          <h3 className="text-sm font-semibold text-[#003366]">Políticas de materiales</h3>
          {canEditPolicy && <AdministrationIconAction label="Nueva política" mobileLabel="Nueva"
            onClick={() => { delete pendingCommands.current.MATERIAL_POLICY_SAVE; setError(null); setPolicyDraft(newPolicyDraft()); }}><Plus aria-hidden="true" className="size-4" /></AdministrationIconAction>}
          <AdministrationHelp title="políticas de materiales"><p>Define cuándo los materiales se consumen, se alquilan o se devuelven, y cómo se cobra cada uso.</p></AdministrationHelp>
        </div>
        <div className={GRID_WRAP}>
          <table className="w-full min-w-[480px] table-fixed text-left" aria-label="Políticas registradas">
            <thead className={COMPACT_TABLE_HEAD}><tr><th scope="col" className="w-[45%]">Política</th><th scope="col" className="w-[23%]">Estándar</th>
              <th scope="col" className="w-[15%]">Estado</th><th scope="col" className="w-[8%]">Ver.</th><th scope="col"><span className="sr-only">Acciones</span></th></tr></thead>
            <tbody className={COMPACT_TABLE_BODY}>
              {policies.map((row) => <tr key={row.versionRef} className="h-9 text-slate-700 hover:bg-slate-50">
                <td className="break-words font-semibold">{row.name}</td><td>{row.standardCode === "STANDARD" ? "Estándar" : row.standardCode}</td>
                <td>{CONFIG_STATES[row.state]}</td><td>v{row.version}</td>
                <td className="text-right">{canEditPolicy && <AdministrationIconAction label={"Editar " + row.name} className={ACTION}
                  onClick={() => editPolicy(row)}><Pencil aria-hidden="true" className="size-4" /></AdministrationIconAction>}</td>
              </tr>)}
              {!policies.length && <tr><td colSpan={5} className="h-10 text-slate-500">Sin políticas registradas.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>)}
      </div>
    </div>
  </section>;
}
