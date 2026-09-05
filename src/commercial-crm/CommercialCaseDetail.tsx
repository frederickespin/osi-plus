import { lazy, Suspense, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, BellRing, BriefcaseBusiness, Calculator, ClipboardCheck, FileText, Menu, PackageSearch, Pencil } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { CrmPipelineReadError } from "@/crm-relational/readApi";
import type { CrmPipelineCaseDetail } from "@/crm-relational/types";
import { STATUS_LABELS, commercialReadErrorCopy } from "./presentation";
import { CrmCaseMutationApi, type CrmCaseFields } from "@/crm-relational/mutationApi";
import CommercialCaseForm from "./CommercialCaseForm";
import type { CrmCaseMutationUiAccess } from "@/crm-relational/mutationAccess";
import type { CrmServicesUiAccess } from "@/crm-services/access";
import { isCrmServicesUiEnabled } from "@/crm-services/mode";
import type { LogisticsUiAccess } from "@/logistics-engine/access";
import type { CostingUiAccess } from "@/costing/access";
import type { QuoteUiAccess } from "@/quote/access";

const ServiceCasePanel = lazy(() => import("@/crm-services/ServiceCasePanel"));
const LogisticsPlanPanel = lazy(() => import("@/logistics-engine/LogisticsPlanPanel"));
const CostingPanel = lazy(() => import("@/costing/CostingPanel"));
const QuotePanel = lazy(() => import("@/quote/QuotePanel"));
const SurveyCasePanel = lazy(() => import("@/survey/SurveyCasePanel"));
const CaseWorkflowOverview = lazy(() => import("./CaseWorkflowOverview"));

type Props = Readonly<{
  state: Readonly<{ loading: boolean; value: CrmPipelineCaseDetail | null; error: CrmPipelineReadError | null }>;
  onBack(): void;
  onOpenNavigation(): void;
  onReload(): void;
  mutationEnvironmentEnabled: boolean;
  mutationAccess: CrmCaseMutationUiAccess;
  mutationApi: CrmCaseMutationApi;
  authorization?: string;
  servicesAccess: CrmServicesUiAccess;
  logisticsAccess: LogisticsUiAccess;
  logisticsEnabled: boolean;
  costingAccess: CostingUiAccess;
  costingEnabled: boolean;
  quoteAccess: QuoteUiAccess;
  quoteEnabled: boolean;
  surveyEnabled: boolean;
  onNavigate(pathname: string): void;
  onUnauthorized(): void;
}>;
type WorkspaceTab = "SUMMARY" | "SERVICES" | "SURVEY" | "LOGISTICS" | "COSTING" | "QUOTE";

const TABS = Object.freeze([
  ["SUMMARY", "Resumen", FileText],
  ["SERVICES", "Servicios", BriefcaseBusiness],
  ["SURVEY", "Survey", ClipboardCheck],
  ["LOGISTICS", "Motor Logístico", PackageSearch],
  ["COSTING", "Costing", Calculator],
  ["QUOTE", "Cotización", BriefcaseBusiness],
] as const);

export default function CommercialCaseDetail({ state, authorization, servicesAccess, logisticsAccess, logisticsEnabled, costingAccess, costingEnabled, quoteAccess, quoteEnabled, surveyEnabled, onNavigate, onUnauthorized, onBack, onOpenNavigation, onReload, mutationEnvironmentEnabled, mutationAccess, mutationApi }: Props) {
  const [tab, setTab] = useState<WorkspaceTab>("SUMMARY");
  const [editOpen, setEditOpen] = useState(false);
  const item = state.value;
  const mutationEnabled = Boolean(item && mutationEnvironmentEnabled && !["APPROVED", "OPS_HANDOFF"].includes(item.status) && (mutationAccess.canUpdateAny || (mutationAccess.canUpdateOwn && item.owner?.isCurrentActor)));
  const initial = useMemo<CrmCaseFields | undefined>(() => item ? ({ clientRef: item.client?.clientRef || null, mode: item.mode || "LOCAL", serviceType: item.serviceType || "", customerType: (item.customerType || "L4_PERSONAL") as CrmCaseFields["customerType"], estimatedCbm: item.estimatedCbm || 0, requiresSurvey: item.requiresSurvey, surveyMethod: (item.surveyMethod || "NO_APLICA") as CrmCaseFields["surveyMethod"], originLocation: item.originLocation || "", destinationLocation: item.destinationLocation || "", destinationContracted: item.destinationContracted ?? true }) : undefined, [item]);
  const alerts = item ? [!item.client ? "Cliente receptor pendiente" : null, !item.owner ? "Caso sin asignar" : null, item.requiresSurvey ? "Survey requerido" : null, !item.destinationLocation ? "Destino no registrado" : null, item.estimatedCbm === null || item.estimatedCbm <= 0 ? "Volumen pendiente" : null].filter((value): value is string => Boolean(value)) : [];
  const servicesEnabled = isCrmServicesUiEnabled() && servicesAccess.canCaseView;
  const tabs = TABS.filter(([value]) => (value !== "SERVICES" || servicesEnabled) && (value !== "SURVEY" || surveyEnabled) && (value !== "LOGISTICS" || logisticsEnabled && logisticsAccess.canView) && (value !== "COSTING" || costingEnabled && costingAccess.canView) && (value !== "QUOTE" || quoteEnabled && quoteAccess.canView));

  return <section className="min-h-full bg-white" data-testid="commercial-case-detail"><header data-testid="commercial-case-focused-header" className="border-b border-slate-200 bg-gradient-to-r from-sky-50 via-white to-white px-4 py-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-center gap-3"><button type="button" aria-label="Abrir navegación ERP" className="rounded-lg border border-slate-200 p-2 text-[#003366] lg:hidden" onClick={onOpenNavigation}><Menu className="h-5 w-5" /></button><h1 className="text-sm font-black uppercase tracking-[.18em] text-[#0070a8]">Ficha del Caso</h1></div><div className="flex gap-2">{mutationEnabled && item && <Button size="sm" onClick={() => setEditOpen(true)}><Pencil />Editar</Button>}<Button size="sm" variant="outline" onClick={onBack}><ArrowLeft />Volver al Inbox</Button></div></div>{item && <div className="mt-2"><h2 className="text-xl font-black tracking-tight text-[#003366]">{item.client?.displayName || "Sin Client vinculado"}</h2><p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600"><span className="font-mono font-black text-[#003366]">{item.caseCode}</span><span aria-hidden="true">·</span><span>{STATUS_LABELS[item.status]}</span><span aria-hidden="true">·</span><span>Etapa no publicada</span><span aria-hidden="true">·</span><span>{item.owner?.displayName || "Sin responsable"}</span></p>{alerts.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-1.5"><BellRing className="h-4 w-4 text-amber-700" />{alerts.map((alert) => <span key={alert} className="rounded bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800">{alert}</span>)}</div>}</div>}</header>
    {state.loading && <div className="grid min-h-[40vh] place-items-center text-sm text-slate-500">Cargando la autoridad relacional del caso…</div>}
    {state.error && <Alert variant="destructive" role="alert" className="m-4"><AlertCircle /><AlertTitle>No pudimos cargar la Ficha</AlertTitle><AlertDescription>{commercialReadErrorCopy(state.error)}<Button className="mt-3" size="sm" variant="outline" onClick={onReload}>Reintentar lectura</Button></AlertDescription></Alert>}
    {item && <>
      <div role="tablist" aria-label="Áreas del Caso Comercial" className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-[#e7e5e4] p-1">{tabs.map(([value, label, Icon]) => <button id={`${value.toLowerCase()}-tab`} key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`flex shrink-0 items-center gap-1.5 rounded px-3 py-2 text-xs font-bold ${tab === value ? "bg-[#df8750] text-white shadow-sm" : "text-slate-700 hover:bg-white/60"}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}</div>
      <div className="p-4">{tab === "SUMMARY" && <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Cargando resumen integrado…</div>}><CaseWorkflowOverview item={item} authorization={authorization} servicesEnabled={servicesEnabled} surveyEnabled={surveyEnabled} logisticsEnabled={logisticsEnabled && logisticsAccess.canView} costingEnabled={costingEnabled && costingAccess.canView} quoteEnabled={quoteEnabled && quoteAccess.canView} onSelectTab={setTab} onUnauthorized={onUnauthorized} /></Suspense>}
        {tab === "SERVICES" && servicesEnabled && <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Cargando selección de Servicios…</div>}><ServiceCasePanel caseRef={item.caseRef} authorization={authorization} canUpdate={servicesAccess.canCaseUpdate} onUnauthorized={onUnauthorized} /></Suspense>}
        {tab === "SURVEY" && surveyEnabled && <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Cargando Survey…</div>}><SurveyCasePanel caseRef={item.caseRef} authorization={authorization} onNavigate={onNavigate} onUnauthorized={onUnauthorized} /></Suspense>}
        {tab === "LOGISTICS" && logisticsEnabled && logisticsAccess.canView && <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Cargando Motor Logístico…</div>}><LogisticsPlanPanel caseRef={item.caseRef} authorization={authorization} access={logisticsAccess} onUnauthorized={onUnauthorized} /></Suspense>}
        {tab === "COSTING" && costingEnabled && costingAccess.canView && <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Cargando Costos…</div>}><CostingPanel caseRef={item.caseRef} authorization={authorization} access={costingAccess} onUnauthorized={onUnauthorized} /></Suspense>}
        {tab === "QUOTE" && quoteEnabled && quoteAccess.canView && <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Cargando Cotización…</div>}><QuotePanel caseRef={item.caseRef} authorization={authorization} access={quoteAccess} onUnauthorized={onUnauthorized} /></Suspense>}
      </div>
      {item.status === "APPROVED" && <Alert className="m-4"><AlertTitle>Legacy congelado</AlertTitle><AlertDescription>APPROVED permanece visible, pero no admite acciones en esta fase.</AlertDescription></Alert>}{item.status === "OPS_HANDOFF" && <Alert className="m-4"><AlertTitle>Estado terminal</AlertTitle><AlertDescription>La oportunidad ya fue entregada a Operaciones.</AlertDescription></Alert>}{!mutationEnabled && <div className="m-4 border border-dashed border-slate-300 p-4"><p className="text-sm font-semibold text-slate-800">Edición y acciones empresariales</p><p className="mt-1 text-sm text-slate-500">Disponible en una fase posterior. Esta Ficha no inventa autoridades ausentes.</p></div>}{mutationEnabled && initial && <CommercialCaseForm open={editOpen} mode="UPDATE" api={mutationApi} caseRef={item.caseRef} expectedVersion={item.version} initial={initial} initialClient={item.client ? { clientRef: item.client.clientRef, displayName: item.client.displayName, type: item.client.type, status: item.client.status } : undefined} onOpenChange={setEditOpen} onCommitted={() => onReload()} />}</>}
  </section>;
}
