import { lazy, Suspense, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, BellRing, BriefcaseBusiness, ClipboardCheck, FileText, History, ListChecks, Menu, MessageSquare, PackageSearch, Paperclip, Pencil, StickyNote } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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

const ServiceCasePanel = lazy(() => import("@/crm-services/ServiceCasePanel"));
const LogisticsPlanPanel = lazy(() => import("@/logistics-engine/LogisticsPlanPanel"));

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
  onUnauthorized(): void;
}>;
type WorkspaceTab = "SUMMARY" | "SERVICES" | "SURVEY" | "LOGISTICS" | "ACTIVITY" | "TASKS" | "QUOTE" | "NOTES" | "FILES" | "COMMUNICATION";

const TABS = Object.freeze([
  ["SUMMARY", "Resumen", FileText], ["SERVICES", "Servicios", BriefcaseBusiness], ["SURVEY", "Survey", ClipboardCheck], ["LOGISTICS", "Motor Logístico", PackageSearch], ["ACTIVITY", "Actividad", History], ["TASKS", "Tareas", ListChecks],
  ["QUOTE", "Cotización", BriefcaseBusiness], ["NOTES", "Notas", StickyNote],
  ["FILES", "Archivos", Paperclip], ["COMMUNICATION", "Comunicación", MessageSquare],
] as const);

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "No disponible" : new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
function formatCbm(value: number | null) {
  return value === null ? "No disponible" : `${new Intl.NumberFormat("es-DO", { maximumFractionDigits: 2 }).format(value)} m³`;
}
function DetailRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="grid gap-1 border-b border-slate-100 py-3 last:border-b-0 sm:grid-cols-[180px_minmax(0,1fr)]"><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</dt><dd className="min-w-0 break-words text-sm font-semibold text-slate-900"><span>{value}</span>{note && <span className="mt-0.5 block text-xs font-normal leading-5 text-slate-500">{note}</span>}</dd></div>;
}
function IntegrationPanel({ title, description, count }: { title: string; description: string; count?: number }) {
  return <section className="border border-dashed border-amber-300 bg-amber-50/70 px-6 py-10 text-center" role="tabpanel"><ClipboardCheck className="mx-auto h-6 w-6 text-amber-700" /><h2 className="mt-3 text-lg font-black text-[#003366]">{title}</h2>{count !== undefined && <p className="mt-2 text-3xl font-black text-[#003366]">{count}</p>}<p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">{description}</p><Badge variant="outline" className="mt-4 border-amber-300 bg-white text-amber-800">En integración</Badge></section>;
}

export default function CommercialCaseDetail({ state, authorization, servicesAccess, logisticsAccess, logisticsEnabled, onUnauthorized, onBack, onOpenNavigation, onReload, mutationEnvironmentEnabled, mutationAccess, mutationApi }: Props) {
  const [tab, setTab] = useState<WorkspaceTab>("SUMMARY");
  const [editOpen, setEditOpen] = useState(false);
  const item = state.value;
  const mutationEnabled = Boolean(item && mutationEnvironmentEnabled && !["APPROVED", "OPS_HANDOFF"].includes(item.status) && (mutationAccess.canUpdateAny || (mutationAccess.canUpdateOwn && item.owner?.isCurrentActor)));
  const initial = useMemo<CrmCaseFields | undefined>(() => item ? ({ clientRef: item.client?.clientRef || null, mode: item.mode || "LOCAL", serviceType: item.serviceType || "", customerType: (item.customerType || "L4_PERSONAL") as CrmCaseFields["customerType"], estimatedCbm: item.estimatedCbm || 0, requiresSurvey: item.requiresSurvey, surveyMethod: (item.surveyMethod || "NO_APLICA") as CrmCaseFields["surveyMethod"], originLocation: item.originLocation || "", destinationLocation: item.destinationLocation || "", destinationContracted: item.destinationContracted ?? true }) : undefined, [item]);
  const alerts = item ? [!item.client ? "Cliente receptor pendiente" : null, !item.owner ? "Caso sin asignar" : null, item.requiresSurvey ? "Survey requerido" : null, !item.destinationLocation ? "Destino no registrado" : null, item.estimatedCbm === null || item.estimatedCbm <= 0 ? "Volumen pendiente" : null].filter((value): value is string => Boolean(value)) : [];
  const servicesEnabled = isCrmServicesUiEnabled() && servicesAccess.canCaseView;
  const tabs = TABS.filter(([value]) => (value !== "SERVICES" || servicesEnabled) && (value !== "LOGISTICS" || logisticsEnabled && logisticsAccess.canView));

  return <section className="min-h-full bg-white" data-testid="commercial-case-detail"><header data-testid="commercial-case-focused-header" className="border-b border-slate-200 bg-gradient-to-r from-sky-50 via-white to-white px-4 py-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-center gap-3"><button type="button" aria-label="Abrir navegación ERP" className="rounded-lg border border-slate-200 p-2 text-[#003366] lg:hidden" onClick={onOpenNavigation}><Menu className="h-5 w-5" /></button><h1 className="text-sm font-black uppercase tracking-[.18em] text-[#0070a8]">Ficha del Caso</h1></div><div className="flex gap-2">{mutationEnabled && item && <Button size="sm" onClick={() => setEditOpen(true)}><Pencil />Editar</Button>}<Button size="sm" variant="outline" onClick={onBack}><ArrowLeft />Volver al Inbox</Button></div></div>{item && <div className="mt-2"><h2 className="text-xl font-black tracking-tight text-[#003366]">{item.client?.displayName || "Sin Client vinculado"}</h2><p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600"><span className="font-mono font-black text-[#003366]">{item.caseCode}</span><span aria-hidden="true">·</span><span>{STATUS_LABELS[item.status]}</span><span aria-hidden="true">·</span><span>Etapa no publicada</span><span aria-hidden="true">·</span><span>{item.owner?.displayName || "Sin responsable"}</span></p>{alerts.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-1.5"><BellRing className="h-4 w-4 text-amber-700" />{alerts.map((alert) => <span key={alert} className="rounded bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800">{alert}</span>)}</div>}</div>}</header>
    {state.loading && <div className="grid min-h-[40vh] place-items-center text-sm text-slate-500">Cargando la autoridad relacional del caso…</div>}
    {state.error && <Alert variant="destructive" role="alert" className="m-4"><AlertCircle /><AlertTitle>{state.error.code}</AlertTitle><AlertDescription>{commercialReadErrorCopy(state.error)}<Button className="mt-3" size="sm" variant="outline" onClick={onReload}>Reintentar lectura</Button></AlertDescription></Alert>}
    {item && <>
      <div role="tablist" aria-label="Áreas del Caso Comercial" className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-[#e7e5e4] p-1">{tabs.map(([value, label, Icon]) => <button id={value === "SERVICES" ? "services-tab" : value === "LOGISTICS" ? "logistics-tab" : undefined} key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`flex shrink-0 items-center gap-1.5 rounded px-3 py-2 text-xs font-bold ${tab === value ? "bg-[#df8750] text-white shadow-sm" : "text-slate-700 hover:bg-white/60"}`}><Icon className="h-3.5 w-3.5" />{label}{!(["SUMMARY", "SERVICES", "LOGISTICS"] as WorkspaceTab[]).includes(value) && <span className={`rounded px-1 py-0.5 text-[8px] uppercase ${tab === value ? "bg-white/20" : "bg-amber-100 text-amber-800"}`}>En integración</span>}</button>)}</div>
      <div className="p-4">{tab === "SUMMARY" && <div role="tabpanel" className="grid gap-4 xl:grid-cols-2"><section className="border border-slate-200"><h2 className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-[#003366]">Identidad y servicio</h2><dl className="px-4"><DetailRow label="Cliente receptor" value={item.client?.displayName || "Sin Client vinculado"} note={item.client ? `${item.client.type || "Tipo no registrado"} · ${item.client.status}` : "No se infiere desde clientName, pagador, institución o Lead Account."} /><DetailRow label="Responsable" value={item.owner?.displayName || "Sin asignar"} /><DetailRow label="Servicio" value={`${item.mode || "Modo no disponible"} · ${item.serviceType || "Tipo no disponible"}`} note={`Perfil: ${item.customerType || "No disponible"}`} /><DetailRow label="Volumen" value={formatCbm(item.estimatedCbm)} /><DetailRow label="Survey" value={item.requiresSurvey ? "Requerido" : "No requerido"} note={item.surveyMethod || "Método no disponible"} /></dl></section><section className="border border-slate-200"><h2 className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-[#003366]">Ruta y control</h2><dl className="px-4"><DetailRow label="Origen" value={item.originLocation || "No registrado"} /><DetailRow label="Destino" value={item.destinationLocation || "No registrado"} note={item.destinationContracted === null ? "Condición no disponible" : item.destinationContracted ? "Destino contratado" : "Destino no contratado"} /><DetailRow label="Fechas" value={`Creado ${formatDate(item.createdAt)}`} note={`Actualizado ${formatDate(item.updatedAt)}`} /><DetailRow label="Actividad" value={`${item.eventCount} eventos`} note="Sólo conteo publicado; el historial no se inventa." /><DetailRow label="Cotizaciones" value={`${item.quoteCount} registros`} note="Sólo conteo publicado; el workspace continúa en integración." /></dl></section><div className="border border-dashed border-slate-300 bg-slate-50 p-4 xl:col-span-2"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Direcciones adicionales y relaciones comerciales</p><p className="mt-1 text-sm text-slate-600">No disponibles hasta contar con autoridad tenant-first 1:N. No se reducen a notas ni se infieren desde campos legacy.</p></div></div>}
        {tab === "SERVICES" && servicesEnabled && <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Cargando selección de Servicios…</div>}><ServiceCasePanel caseRef={item.caseRef} authorization={authorization} canUpdate={servicesAccess.canCaseUpdate} onUnauthorized={onUnauthorized} /></Suspense>}
        {tab === "LOGISTICS" && logisticsEnabled && logisticsAccess.canView && <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Cargando Motor Logístico…</div>}><LogisticsPlanPanel caseRef={item.caseRef} authorization={authorization} access={logisticsAccess} onUnauthorized={onUnauthorized} /></Suspense>}
        {tab === "ACTIVITY" && <IntegrationPanel title="Actividad en integración" count={item.eventCount} description="eventCount se publica únicamente como conteo. El historial permanecerá cerrado hasta existir un GET tenant-first de eventos." />}
        {tab === "SURVEY" && <IntegrationPanel title="Survey en integración" description="Programación, Precarga Mini, historial, resultado y PIC se incorporarán cuando exista autoridad Survey tenant-first; no se muestran mocks." />}
        {tab === "QUOTE" && <IntegrationPanel title="Cotización en integración" count={item.quoteCount} description="Alcance, recursos, materiales, cajas, tarifas, monedas, márgenes y aprobaciones se integrarán como un vertical coordinado." />}
        {tab === "TASKS" && <IntegrationPanel title="Tareas en integración" description="No existe todavía un contrato tenant-first de tareas para esta Ficha." />}
        {tab === "NOTES" && <IntegrationPanel title="Notas en integración" description="No se reutilizan notas legacy ni storage local como autoridad empresarial." />}
        {tab === "FILES" && <IntegrationPanel title="Archivos en integración" description="No se presentan adjuntos hasta disponer de un contrato seguro y tenant-first." />}
        {tab === "COMMUNICATION" && <IntegrationPanel title="Comunicación en integración" description="PIC y mensajería se integrarán con auditoría y contratos propios; no se simulan conversaciones." />}
      </div>
      {item.status === "APPROVED" && <Alert className="m-4"><AlertTitle>Legacy congelado</AlertTitle><AlertDescription>APPROVED permanece visible, pero no admite acciones en esta fase.</AlertDescription></Alert>}{item.status === "OPS_HANDOFF" && <Alert className="m-4"><AlertTitle>Estado terminal</AlertTitle><AlertDescription>La oportunidad ya fue entregada a Operaciones.</AlertDescription></Alert>}{!mutationEnabled && <div className="m-4 border border-dashed border-slate-300 p-4"><p className="text-sm font-semibold text-slate-800">Edición y acciones empresariales</p><p className="mt-1 text-sm text-slate-500">Disponible en una fase posterior. Esta Ficha no inventa autoridades ausentes.</p></div>}{mutationEnabled && initial && <CommercialCaseForm open={editOpen} mode="UPDATE" api={mutationApi} caseRef={item.caseRef} expectedVersion={item.version} initial={initial} initialClient={item.client ? { clientRef: item.client.clientRef, displayName: item.client.displayName, type: item.client.type, status: item.client.status } : undefined} onOpenChange={setEditOpen} onCommitted={() => onReload()} />}</>}
  </section>;
}
