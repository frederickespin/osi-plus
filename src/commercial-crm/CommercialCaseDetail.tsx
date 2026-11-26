import { lazy, Suspense, useEffect, useMemo, useState, type ComponentProps } from "react";
import { AlertCircle, ArrowLeft, BellRing, BriefcaseBusiness, Calculator, ClipboardCheck, FileText, MapPin, Menu, Route } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { CrmPipelineReadError } from "@/crm-relational/readApi";
import type { CrmPipelineCaseDetail } from "@/crm-relational/types";
import { STATUS_LABELS, commercialReadErrorCopy } from "./presentation";
import type { CrmServicesUiAccess } from "@/crm-services/access";
import { CrmServicesApi, CrmServicesApiError } from "@/crm-services/api";
import { isCrmServicesUiEnabled } from "@/crm-services/mode";
import type { LogisticsUiAccess } from "@/logistics-engine/access";
import { resolveTransportUiAccess } from "@/logistics-engine/transportAccess";
import type { CostingUiAccess } from "@/costing/access";
import type { QuoteUiAccess } from "@/quote/access";
import type { SurveySchedulingUiAccess } from "@/survey/schedulingAccess";
import type { SurveyIntakeMethod } from "@/survey/SurveyCasePanel";
import type { CommercialRelationshipsAccess } from "@/commercial-relationships/access";
import type { CommunicationsAccess } from "@/communications/access";
import type { ClientTemporaryAccessUi } from "@/client-portal/access";
import CaseRouteEditor from "./CaseRouteEditor";
import { CaseRouteApi } from "./caseRouteApi";
import CaseDailyTravelPanel, { useCaseDailyTravel } from "./CaseDailyTravel";
import CommercialCaseIntake from "./CommercialCaseIntake";
import { commercialIntake, type CaseCommercialIntake } from "./caseCommercialIntake";

const ServiceCasePanel = lazy(() => import("@/crm-services/ServiceCasePanel"));
const CostingPanel = lazy(() => import("@/costing/CostingPanel"));
const QuotePanel = lazy(() => import("@/quote/QuotePanel"));
const SurveyCasePanel = lazy(() => import("@/survey/SurveyCasePanel"));
const CaseCommercialContextPanel = lazy(() => import("@/commercial-relationships/CaseCommercialContextPanel"));
const CommunicationPanel = lazy(() => import("@/communications/CommunicationPanel"));
const ContractCasePanel = lazy(() => import("./ContractCasePanel"));
const ExecutionCasePanel = lazy(() => import("./ExecutionCasePanel"));
const ChangeAddendaPanel = lazy(() => import("./ChangeAddendaPanel"));
const EconomicControlPanel = lazy(() => import("./EconomicControlPanel"));

type Props = Readonly<{
  state: Readonly<{ loading: boolean; value: CrmPipelineCaseDetail | null; error: CrmPipelineReadError | null }>;
  onBack(): void;
  onOpenNavigation(): void;
  onReload(): void;
  authorization?: string;
  servicesAccess: CrmServicesUiAccess;
  logisticsAccess: LogisticsUiAccess;
  logisticsEnabled: boolean;
  costingAccess: CostingUiAccess;
  costingEnabled: boolean;
  quoteAccess: QuoteUiAccess;
  quoteEnabled: boolean;
  surveyEnabled: boolean;
  surveySchedulingAccess: SurveySchedulingUiAccess;
  commercialRelationshipsEnabled: boolean;
  commercialRelationshipsAccess: CommercialRelationshipsAccess;
  communicationsEnabled: boolean;
  communicationsAccess: CommunicationsAccess;
  clientTemporaryAccessEnabled: boolean;
  clientTemporaryAccess: ClientTemporaryAccessUi;
  onNavigate(pathname: string): void;
  onUnauthorized(): void;
}>;
type WorkspaceTab = "SURVEY" | "SERVICES" | "QUOTE" | "CONTRACT" | "EXECUTION" | "CHANGES" | "ECONOMIC_CONTROL";
type QuoteWorkspaceView = "COSTS" | "PROPOSALS";
type CommunicationTarget = Readonly<
  | { context: "SCHEDULING"; surveyAssignmentRef: string; quoteRevisionRef: null }
  | { context: "QUOTE"; surveyAssignmentRef: null; quoteRevisionRef: string }
  | { context: "CASE"; surveyAssignmentRef: null; quoteRevisionRef: null }
>;

const TABS = Object.freeze([
  ["SERVICES", "Servicios", BriefcaseBusiness],
  ["SURVEY", "Survey", ClipboardCheck],
  ["QUOTE", "Cotización", BriefcaseBusiness],
  ["CONTRACT", "Contrato", FileText],
  ["EXECUTION", "Ejecución", Route],
  ["CHANGES", "Cambios", BellRing],
  ["ECONOMIC_CONTROL", "Control económico", Calculator],
] as const);

function initialWorkspaceTab(caseRef: string | undefined): WorkspaceTab {
  if (!caseRef || typeof window === "undefined") return "SERVICES";
  const key = `osi-commercial-workspace:${caseRef}`;
  const requested = window.sessionStorage.getItem(key);
  window.sessionStorage.removeItem(key);
  return requested === "SURVEY" || requested === "QUOTE" || requested === "CONTRACT" || requested === "EXECUTION" || requested === "CHANGES" || requested === "ECONOMIC_CONTROL" ? requested : "SERVICES";
}

function CaseProposals({ readIntake, ...props }: ComponentProps<typeof QuotePanel> & Readonly<{ readIntake: boolean }>) {
  const { caseRef, authorization, onUnauthorized } = props;
  const api = useMemo(() => new CrmServicesApi(() => authorization ?? null), [authorization]);
  const [result, setResult] = useState<{ intake?: CaseCommercialIntake } | "ERROR" | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!readIntake) return;
    const controller = new AbortController();
    void Promise.all([api.workspace(caseRef, controller.signal), api.caseConfiguration(caseRef, controller.signal)])
      .then(([plan, configuration]) => {
        if (controller.signal.aborted) return;
        const current = configuration.current;
        const intake = current && current.serviceSelectionRef === plan.selection.selectionRef && current.serviceSelectionRevision === plan.selection.revision
          ? commercialIntake(current.preference) : undefined;
        setResult({ intake });
      }).catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        if (cause instanceof CrmServicesApiError && cause.status === 401) onUnauthorized();
        else if (cause instanceof CrmServicesApiError && cause.status === 403) setResult({});
        else setResult("ERROR");
      });
    return () => controller.abort();
  }, [api, caseRef, onUnauthorized, readIntake, retry]);
  return <>
    {readIntake && result === "ERROR" && <p role="status" className="px-3 py-1 text-xs text-amber-900">
      No se pudieron consultar las medidas del caso. <button type="button" className="font-semibold underline" onClick={() => {
        setResult(null);
        setRetry((current) => current + 1);
      }}>Reintentar</button>
    </p>}
    <QuotePanel {...props} intake={readIntake && typeof result === "object" ? result?.intake : undefined} />
  </>;
}

export default function CommercialCaseDetail(props: Props) {
  return <CommercialCaseWorkspace key={props.state.value?.caseRef ?? "loading"} {...props} />;
}

function CommercialCaseWorkspace({ state, authorization, servicesAccess, logisticsAccess, logisticsEnabled, costingAccess, costingEnabled, quoteAccess, quoteEnabled, surveyEnabled, surveySchedulingAccess, commercialRelationshipsEnabled, commercialRelationshipsAccess, communicationsEnabled, communicationsAccess, clientTemporaryAccessEnabled, clientTemporaryAccess, onNavigate, onUnauthorized, onBack, onOpenNavigation, onReload }: Props) {
  const [tab, setTab] = useState<WorkspaceTab>(() => initialWorkspaceTab(state.value?.caseRef));
  const [quoteView, setQuoteView] = useState<QuoteWorkspaceView>("PROPOSALS");
  const [keepProposalDraft, setKeepProposalDraft] = useState(false);
  const [surveyIntakeMethod, setSurveyIntakeMethod] = useState<SurveyIntakeMethod>();
  const [savingIntake, setSavingIntake] = useState(false);
  const [communicationTarget, setCommunicationTarget] = useState<CommunicationTarget | null>(null);
  const [routeOpen, setRouteOpen] = useState(false);
  const routeApi = useMemo(() => new CaseRouteApi(() => authorization ?? null), [authorization]);
  const item = state.value;
  const [completeDays, setCompleteDays] = useState("");
  const [preparationDays, setPreparationDays] = useState("");
  const alerts = item ? [!item.client ? "Cliente receptor pendiente" : null, !item.owner ? "Caso sin asignar" : null, item.requiresSurvey ? "Survey requerido" : null, !item.route?.destination ? "Destino estructurado pendiente" : null].filter((value): value is string => Boolean(value)) : [];
  const servicesEnabled = isCrmServicesUiEnabled() && servicesAccess.canCaseView;
  const transportAccess = logisticsEnabled && costingEnabled ? resolveTransportUiAccess(logisticsAccess, costingAccess) : undefined;
  const quoteWorkspaceAvailable = quoteEnabled && quoteAccess.canView || costingEnabled && costingAccess.canView;
  const canOpenTransport = Boolean(transportAccess?.canView && costingEnabled && costingAccess.canView);
  const openProposals = () => { setQuoteView("PROPOSALS"); setTab("QUOTE"); };
  const openSurvey = (method: SurveyIntakeMethod) => { setSurveyIntakeMethod(method); setTab("SURVEY"); };
  const canReadIntake = servicesEnabled && servicesAccess.canCaseConfigView;
  const quoteWorkspaceCount = Number(costingEnabled && costingAccess.canView) + Number(quoteEnabled && quoteAccess.canView);
  const tabs = TABS.filter(([value]) => ((value !== "SERVICES" && value !== "CONTRACT") || servicesEnabled) && (value !== "SURVEY" || surveyEnabled && surveySchedulingAccess.canView) && (value !== "QUOTE" || quoteWorkspaceAvailable));
  const activeTab = tabs.some(([value]) => value === tab) ? tab : tabs[0]?.[0] ?? "SERVICES";
  const activeQuoteView: QuoteWorkspaceView = quoteView === "COSTS" && costingEnabled && costingAccess.canView || quoteView === "PROPOSALS" && quoteEnabled && quoteAccess.canView ? quoteView : costingEnabled && costingAccess.canView ? "COSTS" : "PROPOSALS";
  const openTransport = () => {
    if (activeTab === "QUOTE" && activeQuoteView === "PROPOSALS") setKeepProposalDraft(true);
    setQuoteView("COSTS");
    setTab("QUOTE");
  };
  const showTravelDetails = logisticsEnabled && activeTab === "QUOTE" && activeQuoteView === "COSTS";
  const travelState = useCaseDailyTravel(routeApi, showTravelDetails ? item?.caseRef : undefined, item?.route?.revision);
  const transportAddresses = {
    revision: item?.route?.revision,
    origin: item?.route?.origin?.compactAddress || item?.originLocation || "",
    destination: item?.route?.destination?.compactAddress || item?.destinationLocation || "",
    travel: travelState.travel,
    completeDays: /^\d{1,3}$/u.test(completeDays) ? Number(completeDays) : undefined,
    preparationDays: preparationDays === "" ? undefined : /^\d{1,3}$/u.test(preparationDays) ? Number(preparationDays) : NaN,
  };
  const openCommunications = (target: CommunicationTarget) => {
    setCommunicationTarget(target);
  };

  return <section className="min-h-full bg-white" data-testid="commercial-case-detail">
    <header data-testid="commercial-case-focused-header" className="border-b border-slate-200 bg-gradient-to-r from-sky-50 via-white to-white px-4 py-3">
      <h1 className="sr-only">Ficha del Caso</h1>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" aria-label="Abrir navegación ERP" className="shrink-0 rounded-lg border border-slate-200 p-2 text-[#003366] lg:hidden" onClick={onOpenNavigation}>
            <Menu aria-hidden="true" className="h-5 w-5" />
          </button>
          {item && <h2 className="break-words text-xl font-black tracking-tight text-[#003366]">{item.client?.displayName || "Sin cliente vinculado"}</h2>}
        </div>
        <div className="ms-auto flex items-center gap-2">
          {item && activeTab !== "SERVICES" && <Button size="sm" variant="outline" onClick={() => setRouteOpen(true)}><MapPin />Ruta del caso</Button>}
          <Button type="button" size="icon" title="Volver al Inbox" aria-label="Volver al Inbox" onClick={onBack}
            className="border border-yellow-400 bg-yellow-300 text-slate-900 hover:border-yellow-500 hover:bg-yellow-400">
            <ArrowLeft aria-hidden="true" />
          </Button>
        </div>
      </div>
      {item && <>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
          <span className="font-mono font-black text-[#003366]">{item.caseCode}</span><span aria-hidden="true">·</span>
          <span>{STATUS_LABELS[item.status]}</span><span aria-hidden="true">·</span>
          <span>Etapa no publicada</span><span aria-hidden="true">·</span><span>{item.owner?.displayName || "Sin responsable"}</span>
        </p>
        {alerts.length > 0 && <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <BellRing className="h-4 w-4 text-amber-700" />
          {alerts.map((alert) => <span key={alert} className="rounded bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800">{alert}</span>)}
        </div>}
      </>}
    </header>
    {state.loading && <div className="grid min-h-[40vh] place-items-center text-sm text-slate-500">Cargando la autoridad relacional del caso…</div>}
    {state.error && <Alert variant="destructive" role="alert" className="m-4"><AlertCircle /><AlertTitle>No pudimos cargar la Ficha</AlertTitle><AlertDescription>{commercialReadErrorCopy(state.error)}<Button className="mt-3" size="sm" variant="outline" onClick={onReload}>Reintentar lectura</Button></AlertDescription></Alert>}
    {item && <>
      <div role="tablist" aria-label="Áreas del Caso Comercial" className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-[#e7e5e4] p-1">{tabs.map(([value, label, Icon]) => <button id={`${value.toLowerCase()}-tab`} key={value} type="button" role="tab" aria-selected={activeTab === value} disabled={savingIntake} onClick={() => { setSurveyIntakeMethod(undefined); setTab(value); }} className={`flex shrink-0 items-center gap-1.5 rounded px-3 py-2 text-xs font-bold ${activeTab === value ? "bg-[#df8750] text-white shadow-sm" : "text-slate-700 hover:bg-white/60"}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}</div>
      <div className="p-4">
        {showTravelDetails && item.route?.revision &&
          <CaseDailyTravelPanel {...travelState} completeDays={completeDays} preparationDays={preparationDays}
            setCompleteDays={setCompleteDays} setPreparationDays={setPreparationDays} />}
        {activeTab === "SURVEY" && surveyEnabled && surveySchedulingAccess.canView && <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Cargando Survey…</div>}><SurveyCasePanel caseRef={item.caseRef} authorization={authorization} routeVersion={item.route?.revision} access={surveySchedulingAccess} intakeMethod={surveyIntakeMethod} communicationsEnabled={communicationsEnabled} communicationsAccess={communicationsAccess} logisticsSummaryEnabled={logisticsEnabled && logisticsAccess.canView} transportAccess={transportAccess} clientTemporaryAccessEnabled={clientTemporaryAccessEnabled} clientTemporaryAccess={clientTemporaryAccess} onPrepareClientMessage={() => openCommunications({ context: "CASE", surveyAssignmentRef: null, quoteRevisionRef: null })} onOpenCommunications={(surveyAssignmentRef) => openCommunications({ context: "SCHEDULING", surveyAssignmentRef, quoteRevisionRef: null })} onEditRoute={() => setRouteOpen(true)} onNavigate={onNavigate} onUnauthorized={onUnauthorized} /></Suspense>}
        {activeTab === "SERVICES" && servicesEnabled && <div className="space-y-3">
          <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Cargando selección de Servicios…</div>}>
            <ServiceCasePanel caseRef={item.caseRef} authorization={authorization} canUpdate={servicesAccess.canCaseUpdate}
              canViewConfiguration={servicesAccess.canCaseConfigView} canConfigure={servicesAccess.canCaseConfigUpdate}
              onUnauthorized={onUnauthorized} intake={{
                origin: transportAddresses.origin, destination: transportAddresses.destination,
                onOpenRoute: () => setRouteOpen(true), onOpenTransport: canOpenTransport ? openTransport : undefined, saving: savingIntake,
                nextStep: (plan) => <CommercialCaseIntake key={plan.selectionRef ?? "new-plan"} caseRef={item.caseRef}
                  authorization={authorization} estimatedCbm={item.estimatedCbm} plan={plan}
                  canCapture={canReadIntake && servicesAccess.canCaseConfigUpdate}
                  onSchedule={surveyEnabled && surveySchedulingAccess.canView && surveySchedulingAccess.canManage ? openSurvey : undefined}
                  onQuote={quoteWorkspaceAvailable ? openProposals : undefined} onSavingChange={setSavingIntake} onUnauthorized={onUnauthorized} />,
              }} />
          </Suspense>
          {commercialRelationshipsEnabled && commercialRelationshipsAccess.canView && <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Cargando contexto comercial…</div>}><CaseCommercialContextPanel caseRef={item.caseRef} authorization={authorization} access={commercialRelationshipsAccess} onUnauthorized={onUnauthorized} /></Suspense>}
        </div>}
        {activeTab === "QUOTE" && quoteWorkspaceAvailable && <section aria-label="Cotización del caso" className="space-y-2">
          {quoteWorkspaceCount > 1 && <div role="tablist" aria-label="Etapas de Cotización" className="flex gap-1 border border-slate-200 bg-slate-50 p-1">
            {costingEnabled && costingAccess.canView && <button type="button" role="tab" aria-selected={activeQuoteView === "COSTS"} onClick={openTransport}
              className={`rounded px-3 py-1.5 text-xs font-bold ${activeQuoteView === "COSTS" ? "bg-[#003366] text-white" : "text-slate-600 hover:bg-white"}`}>
              <Calculator className="mr-1.5 inline h-3.5 w-3.5" />Costos internos
            </button>}
            {quoteEnabled && quoteAccess.canView && <button type="button" role="tab" aria-selected={activeQuoteView === "PROPOSALS"} onClick={openProposals}
              className={`rounded px-3 py-1.5 text-xs font-bold ${activeQuoteView === "PROPOSALS" ? "bg-[#003366] text-white" : "text-slate-600 hover:bg-white"}`}>
              <BriefcaseBusiness className="mr-1.5 inline h-3.5 w-3.5" />Propuestas
            </button>}
          </div>}
          {activeQuoteView === "COSTS" && costingEnabled && costingAccess.canView &&
            <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Cargando Costos…</div>}>
              <CostingPanel caseRef={item.caseRef} authorization={authorization} access={costingAccess} transportAccess={transportAccess}
                transportAddresses={transportAddresses} onUnauthorized={onUnauthorized} onContinueToProposals={quoteEnabled && quoteAccess.canView ? openProposals : undefined} />
            </Suspense>}
          {(activeQuoteView === "PROPOSALS" || keepProposalDraft) && quoteEnabled && quoteAccess.canView && <div hidden={activeQuoteView !== "PROPOSALS"}>
            <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Cargando Cotización…</div>}>
              <CaseProposals caseRef={item.caseRef} authorization={authorization} access={quoteAccess} readIntake={canReadIntake}
                defaultPayer={item.client?.displayName} canViewCosting={costingEnabled && costingAccess.canView}
                canAuthorizeMargin={costingAccess.canAuthorizeMargin}
                canPreparePackage={costingEnabled && costingAccess.canView && costingAccess.canCalculate && costingAccess.canPublish}
                onOpenTransport={canOpenTransport ? openTransport : undefined} communicationsEnabled={communicationsEnabled} communicationsAccess={communicationsAccess}
                onOpenCommunications={(quoteRevisionRef) => openCommunications({ context: "QUOTE", surveyAssignmentRef: null, quoteRevisionRef })}
                onUnauthorized={onUnauthorized} />
            </Suspense>
          </div>}
        </section>}
        {activeTab === "CONTRACT" && servicesEnabled && <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Cargando Contrato…</div>}><ContractCasePanel caseRef={item.caseRef} authorization={authorization} canUpdate={servicesAccess.canCaseUpdate} canViewTemplates={communicationsEnabled && communicationsAccess.canTemplatesView} context={{ caseCode: item.caseCode, clientName: item.client?.displayName || "Cliente pendiente", origin: item.route?.origin?.compactAddress || item.originLocation || "Origen pendiente", destination: item.route?.destination?.compactAddress || item.destinationLocation || "Destino pendiente" }} onUnauthorized={onUnauthorized} /></Suspense>}
        {activeTab === "EXECUTION" && servicesEnabled && <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Cargando Ejecución…</div>}><ExecutionCasePanel caseRef={item.caseRef} authorization={authorization} canUpdate={servicesAccess.canCaseUpdate} onUnauthorized={onUnauthorized} /></Suspense>}
        {activeTab === "CHANGES" && servicesEnabled && <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Cargando Cambios…</div>}><ChangeAddendaPanel caseRef={item.caseRef} authorization={authorization} canUpdate={servicesAccess.canCaseUpdate} onUnauthorized={onUnauthorized} /></Suspense>}
        {activeTab === "ECONOMIC_CONTROL" && servicesEnabled && <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Cargando Control económico…</div>}><EconomicControlPanel caseRef={item.caseRef} authorization={authorization} canUpdate={servicesAccess.canCaseUpdate} onUnauthorized={onUnauthorized} /></Suspense>}
        {communicationTarget && communicationsEnabled && (communicationsAccess.canView || communicationsAccess.canPrepare && communicationsAccess.canTemplatesView) && <section id="case-communications" className="mt-3 border border-slate-200" aria-label="Actividad y Comunicaciones"><div className="flex flex-wrap items-center justify-between gap-2 border-b bg-slate-50 px-3 py-2"><p className="text-xs font-semibold text-slate-600">{communicationTarget.context === "CASE" ? "Solicitud al cliente" : communicationTarget.context === "SCHEDULING" ? "Comunicación de Survey" : "Comunicación de Cotización"}</p><Button size="sm" variant="outline" onClick={() => setCommunicationTarget(null)}>Cerrar</Button></div><Suspense fallback={<p className="p-4 text-xs text-slate-500">Cargando comunicaciones…</p>}><CommunicationPanel caseRef={item.caseRef} authorization={authorization} access={communicationsAccess} context={communicationTarget.context} surveyAssignmentRef={communicationTarget.surveyAssignmentRef} quoteRevisionRef={communicationTarget.quoteRevisionRef} startPreparing={communicationTarget.context === "CASE"} onUnauthorized={onUnauthorized} /></Suspense></section>}
      </div>
      <CaseRouteEditor open={routeOpen} caseRef={item.caseRef} api={routeApi} onOpenChange={setRouteOpen} onSaved={onReload} />
      {item.status === "APPROVED" && <Alert className="m-4"><AlertTitle>Legacy congelado</AlertTitle><AlertDescription>APPROVED permanece visible, pero no admite acciones en esta fase.</AlertDescription></Alert>}{item.status === "OPS_HANDOFF" && <Alert className="m-4"><AlertTitle>Estado terminal</AlertTitle><AlertDescription>La oportunidad ya fue entregada a Operaciones.</AlertDescription></Alert>}
    </>}
  </section>;
}
