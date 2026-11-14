import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BellRing,
  CalendarClock,
  Check,
  Circle,
  Clock3,
  LoaderCircle,
  Minus,
  RefreshCw,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CrmPipelineCaseDetail } from "@/crm-relational/types";
import type { IcpCaseDetail } from "@/crm-icp-v2/api";
import type { CaseServiceWorkspace } from "@/crm-services/api";
import type { SurveyAssignment } from "@/survey/types";
import type { LogisticsRevision } from "@/logistics-engine/api";
import type { CostingRevision } from "@/costing/api";
import type { QuoteCase, QuoteProposal } from "@/quote/api";
import { STATUS_LABELS } from "./presentation";

export type ConsolidatedCaseTab = "SUMMARY" | "SERVICES" | "SURVEY" | "QUOTE";

type Props = Readonly<{
  item: CrmPipelineCaseDetail;
  authorization?: string;
  servicesEnabled: boolean;
  surveyEnabled: boolean;
  logisticsEnabled: boolean;
  costingEnabled: boolean;
  quoteEnabled: boolean;
  onSelectTab(tab: ConsolidatedCaseTab): void;
  onUnauthorized(): void;
}>;

type Snapshot = Readonly<{
  icp: IcpCaseDetail;
  services: CaseServiceWorkspace | null;
  survey: SurveyAssignment | null;
  logistics: LogisticsRevision | null;
  costing: CostingRevision | null;
  quote: QuoteCase | null;
}>;

type NextAction = Readonly<{ label: string; note: string; tab: ConsolidatedCaseTab | null }>;

const MODE_LABEL: Record<string, string> = { LOCAL: "LOCAL / NACIONAL", EXPORT: "Exportación", IMPORT: "Importación" };
const DESTINATION_LABEL: Record<string, string> = { CONFIRMED: "Confirmado", APPROXIMATE: "Aproximado", PENDING: "Pendiente" };
const SURVEY_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  PENDING_CLIENT: "Pendiente del cliente",
  UNASSIGNED: "Por asignar",
  ASSIGNED: "Asignado",
  SCHEDULED: "Programado",
  CONFIRMED: "Confirmado",
  EN_ROUTE: "En ruta",
  ARRIVED: "Llegada registrada",
  IN_PROGRESS: "En proceso",
  COMPLETED: "Completado, pendiente de revisión",
  REVIEWED: "Revisado",
  PUBLISHED: "Publicado",
  CANCELLED: "Cancelado",
};
const QUOTE_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  PUBLISHED: "Publicada",
  SENT: "Enviada",
  ACCEPTED: "Aceptada",
  REJECTED: "Rechazada",
  CANCELLED: "Cancelada",
};
const DATE_TIME = new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeStyle: "short" });

function address(value: IcpCaseDetail["route"]["origin"] | null) {
  if (!value) return "Pendiente de confirmar";
  return [value.streetAndNumber, value.sector, value.cityMunicipality, value.provinceState, value.countryCode].filter(Boolean).join(", ");
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Sin fecha publicada";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Fecha no disponible" : DATE_TIME.format(date);
}

function surveyState(value: SurveyAssignment | null) {
  if (!value) return "Sin solicitud publicada";
  return SURVEY_STATUS_LABEL[value.status] || value.status;
}

function proposalState(value: QuoteProposal | null) {
  if (!value) return "Sin propuestas";
  return QUOTE_STATUS_LABEL[value.state] || value.state;
}

function WorkflowStep({ label, ready, active, onClick }: { label: string; ready: boolean; active?: boolean; onClick?(): void }) {
  return <button type="button" onClick={onClick} disabled={!onClick} aria-disabled={!onClick} title={onClick ? undefined : "Se habilitará cuando exista la autoridad correspondiente"} className={`flex min-w-fit items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-bold disabled:cursor-not-allowed ${active ? "border-sky-500 bg-sky-50 text-[#003366]" : ready ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-500"}`}>
    {ready ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : active ? <Circle className="h-3.5 w-3.5 fill-current" aria-hidden="true" /> : <Minus className="h-3.5 w-3.5" aria-hidden="true" />}{label}
  </button>;
}

function Fact({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="min-w-0 border-b border-slate-100 py-2.5 last:border-b-0"><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-0.5 break-words text-sm font-semibold text-slate-900">{value}</dd>{note ? <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{note}</p> : null}</div>;
}

function DashboardCard({ label, value, note, tone = "default", action }: { label: string; value: string; note: string; tone?: "default" | "warning" | "success"; action?: Readonly<{ label: string; onClick(): void }> }) {
  const toneClass = tone === "warning" ? "border-amber-200 bg-amber-50" : tone === "success" ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white";
  return <section className={`min-w-0 border p-3 ${toneClass}`}>
    <p className="text-[10px] font-black uppercase tracking-[.14em] text-slate-500">{label}</p>
    <p className="mt-1 break-words text-sm font-black text-[#003366]">{value}</p>
    <p className="mt-1 text-[11px] leading-4 text-slate-600">{note}</p>
    {action ? <Button type="button" variant="link" size="sm" className="mt-1 h-auto p-0 text-xs" onClick={action.onClick}>{action.label}</Button> : null}
  </section>;
}

function nextAction(item: CrmPipelineCaseDetail, snapshot: Snapshot, accepted: QuoteProposal | null, currentQuote: QuoteProposal | null): NextAction {
  if (!item.client) return { label: "Vincular el cliente", note: "El caso todavía no tiene un cliente receptor publicado.", tab: null };
  if (!snapshot.services?.selection.primary) return { label: "Definir servicios", note: "Seleccione la necesidad principal y los servicios asociados.", tab: "SERVICES" };
  if (item.requiresSurvey && !snapshot.survey) return { label: "Solicitar Survey", note: "El caso requiere levantamiento y aún no tiene una solicitud publicada.", tab: "SURVEY" };
  if (snapshot.survey && snapshot.survey.status !== "PUBLISHED") return { label: "Completar el Survey", note: `Estado actual: ${surveyState(snapshot.survey)}.`, tab: "SURVEY" };
  if (!snapshot.costing) return { label: "Preparar costos", note: "Los resultados publicados todavía no tienen una revisión económica.", tab: "QUOTE" };
  if (!currentQuote) return { label: "Preparar propuesta", note: "Costos está disponible, pero aún no existe una propuesta.", tab: "QUOTE" };
  if (!accepted) return { label: "Obtener decisión del cliente", note: `Propuesta ${currentQuote.reference}: ${proposalState(currentQuote)}.`, tab: "QUOTE" };
  return { label: "Preparar contrato", note: "La propuesta fue aceptada. Contrato se habilitará en el siguiente bloque aprobado.", tab: null };
}

export default function CaseWorkflowOverview({ item, authorization, servicesEnabled, surveyEnabled, logisticsEnabled, costingEnabled, quoteEnabled, onSelectTab, onUnauthorized }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const { CrmIcpV2Api } = await import("@/crm-icp-v2/api");
        const icpPromise = new CrmIcpV2Api(() => authorization || null).case(item.caseRef, controller.signal);
        const servicesPromise = servicesEnabled ? import("@/crm-services/api").then(({ CrmServicesApi }) => new CrmServicesApi(() => authorization || null).workspace(item.caseRef, controller.signal)) : Promise.resolve(null);
        const surveyPromise = surveyEnabled ? import("@/survey/api").then(({ createSurveyApi }) => createSurveyApi(authorization).agenda()).then((rows) => rows.find((row) => row.caseRef === item.caseRef) || null) : Promise.resolve(null);
        const logisticsPromise = logisticsEnabled ? import("@/logistics-engine/api").then(({ logisticsApi }) => logisticsApi.plan(authorization, item.caseRef)) : Promise.resolve(null);
        const costingPromise = costingEnabled ? import("@/costing/api").then(({ costingApi }) => costingApi.revision(authorization, item.caseRef)) : Promise.resolve(null);
        const quotePromise = quoteEnabled ? import("@/quote/api").then(({ quoteApi }) => quoteApi.case(authorization, item.caseRef)) : Promise.resolve(null);
        const [icp, services, survey, logistics, costing, quote] = await Promise.all([icpPromise, servicesPromise, surveyPromise, logisticsPromise, costingPromise, quotePromise]);
        if (current) setSnapshot(Object.freeze({ icp, services, survey, logistics, costing, quote }));
      } catch (cause) {
        if (!current || controller.signal.aborted) return;
        const message = cause instanceof Error ? cause.message : "CASE_WORKFLOW_UNAVAILABLE";
        if (/UNAUTHORIZED|AUTH_REQUIRED/.test(message)) onUnauthorized();
        else setError("No fue posible reunir el estado del flujo. Puede reintentar sin perder el contexto del caso.");
      } finally {
        if (current) setLoading(false);
      }
    })();
    return () => {
      current = false;
      controller.abort();
    };
  }, [authorization, costingEnabled, item.caseRef, logisticsEnabled, onUnauthorized, quoteEnabled, reload, servicesEnabled, surveyEnabled]);

  const accepted = useMemo(() => snapshot?.quote?.proposals.find((proposal) => proposal.state === "ACCEPTED") || null, [snapshot]);
  const currentQuote = accepted || snapshot?.quote?.proposals[0] || null;
  const servicesReady = Boolean(snapshot?.services?.selection.primary);
  const surveyPublished = snapshot?.survey?.status === "PUBLISHED";
  const costingReady = Boolean(snapshot?.costing && snapshot.costing.status === "PUBLISHED");
  const quoteReady = Boolean(currentQuote);

  const alerts = useMemo(() => {
    if (!snapshot) return [];
    return [
      !item.owner ? "Caso sin responsable" : null,
      snapshot.icp.route.destinationStatus === "PENDING" ? "Destino estructurado pendiente" : null,
      item.requiresSurvey && !snapshot.survey ? "Survey requerido sin solicitar" : null,
      snapshot.survey && snapshot.survey.status === "COMPLETED" ? "Survey completado pendiente de revisión" : null,
      snapshot.logistics?.issues.length ? `${snapshot.logistics.issues.length} pendiente(s) del Motor Logístico` : null,
      currentQuote?.issues.length ? `${currentQuote.issues.length} pendiente(s) en Cotización` : null,
    ].filter((value): value is string => Boolean(value));
  }, [currentQuote, item.owner, item.requiresSurvey, snapshot]);

  const action = snapshot ? nextAction(item, snapshot, accepted, currentQuote) : null;
  const appointment = snapshot?.survey;
  const quoteNote = currentQuote ? `${currentQuote.currency} · válida hasta ${formatDate(currentQuote.validUntil)}` : "Cotización todavía no publicada";

  return <section role="tabpanel" aria-label="Tablero operativo del caso" className="space-y-3" data-testid="case-workflow-overview">
    <div className="flex items-center gap-2 overflow-x-auto border border-slate-200 bg-slate-50 p-2" aria-label="Progreso real del caso" data-testid="case-workflow-progress">
      <WorkflowStep label="ICP" ready onClick={() => onSelectTab("SUMMARY")} />
      <WorkflowStep label="Servicios" ready={servicesReady} onClick={() => onSelectTab("SERVICES")} />
      <WorkflowStep label="Survey" ready={surveyPublished} active={Boolean(snapshot?.survey) && !surveyPublished} onClick={() => onSelectTab("SURVEY")} />
      <WorkflowStep label="Costos" ready={costingReady} onClick={() => onSelectTab("QUOTE")} />
      <WorkflowStep label="Cotización" ready={Boolean(accepted)} active={quoteReady && !accepted} onClick={() => onSelectTab("QUOTE")} />
      <WorkflowStep label="Contrato" ready={false} active={Boolean(accepted)} />
    </div>
    {loading ? <div className="flex min-h-44 items-center justify-center gap-2 border border-slate-200 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Reuniendo el estado publicado del caso…</div> : null}
    {error ? <div role="alert" className="flex items-start gap-2 border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><div><p>{error}</p><Button size="sm" variant="outline" className="mt-2" onClick={() => setReload((value) => value + 1)}><RefreshCw />Reintentar</Button></div></div> : null}
    {!loading && snapshot ? <>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Control inmediato del caso">
        <DashboardCard label="Estado del caso" value={STATUS_LABELS[item.status]} note={`Actualizado ${formatDate(item.updatedAt)}`} />
        <DashboardCard label="Responsable" value={item.owner?.displayName || "Sin asignar"} note={item.owner ? "Responsable comercial publicado" : "Requiere asignación"} tone={item.owner ? "default" : "warning"} />
        <DashboardCard label="Próxima acción" value={action?.label || "Por determinar"} note={action?.note || "No existe una regla publicada"} tone="warning" action={action?.tab ? { label: "Abrir proceso", onClick: () => onSelectTab(action.tab as ConsolidatedCaseTab) } : undefined} />
        <DashboardCard label="Próxima cita" value={appointment ? formatDate(appointment.scheduledStart) : "Sin cita programada"} note={appointment ? `${appointment.evaluator.displayName} · ${surveyState(appointment)}` : "Survey no tiene una agenda publicada"} action={appointment ? { label: "Abrir Survey", onClick: () => onSelectTab("SURVEY") } : undefined} />
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <section className="border border-slate-200 bg-white"><h2 className="border-b bg-slate-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-[#003366]">Identidad, servicio y ruta</h2><dl className="grid px-3 sm:grid-cols-2"><Fact label="Cliente" value={snapshot.icp.client?.displayName || "Sin cliente vinculado"} note={`${snapshot.icp.clientProfileType} · ${snapshot.icp.intakeChannel}`} /><Fact label="Contacto" value={snapshot.icp.caseContact.displayName} note={[snapshot.icp.caseContact.phone, snapshot.icp.caseContact.email].filter(Boolean).join(" · ")} /><Fact label="Necesidad principal" value={snapshot.services?.selection.primary?.name || "Pendiente de seleccionar"} note={MODE_LABEL[snapshot.icp.mode] || snapshot.icp.mode} /><Fact label="Servicios asociados" value={snapshot.services?.selection.complementaries.map((service) => service.name).join(", ") || "Sin servicios asociados publicados"} /><Fact label="Origen" value={address(snapshot.icp.route.origin)} /><Fact label="Destino" value={address(snapshot.icp.route.destination)} note={`Estado: ${DESTINATION_LABEL[snapshot.icp.route.destinationStatus] || snapshot.icp.route.destinationStatus}`} /></dl></section>
        <section className="border border-slate-200 bg-white"><h2 className="border-b bg-slate-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-[#003366]">Seguimiento comercial y operativo</h2><dl className="grid px-3 sm:grid-cols-2"><Fact label="Survey" value={surveyState(snapshot.survey)} note={snapshot.survey ? `${snapshot.survey.evaluator.displayName} · ${formatDate(snapshot.survey.scheduledStart)}` : "No existe una solicitud publicada"} /><Fact label="Costos" value={snapshot.costing ? `Revisión ${snapshot.costing.revision} · ${snapshot.costing.status}` : "Sin revisión económica"} note={snapshot.costing ? `Moneda base: ${snapshot.costing.baseCurrency}` : "Requiere información publicada"} /><Fact label="Cotización" value={currentQuote ? `${currentQuote.reference} · ${proposalState(currentQuote)}` : "Sin propuestas"} note={quoteNote} /><Fact label="Contrato" value={accepted ? "Pendiente de preparar" : "Bloqueado"} note={accepted ? "La propuesta aceptada será su autoridad de origen" : "Requiere una propuesta aceptada"} /><Fact label="Cambios / adendas" value="Sin autoridad publicada" note="Se habilitarán durante la ejecución del contrato" /><Fact label="Actividad" value={`${item.eventCount} evento(s) publicado(s)`} note={`Última actualización: ${formatDate(item.updatedAt)}`} /></dl></section>
      </div>

      <section className={`border p-3 ${alerts.length ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`} aria-label="Alertas del caso">
        <div className="flex items-center gap-2"><BellRing className={`h-4 w-4 ${alerts.length ? "text-amber-700" : "text-emerald-700"}`} /><h2 className="text-xs font-black uppercase tracking-wide text-[#003366]">Alertas y bloqueos</h2></div>
        {alerts.length ? <ul className="mt-2 grid gap-1 text-xs text-amber-900 sm:grid-cols-2">{alerts.map((alert) => <li key={alert}>• {alert}</li>)}</ul> : <p className="mt-2 text-xs text-emerald-900">No existen alertas deterministas con la información publicada.</p>}
      </section>

      <section className="grid gap-2 border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 sm:grid-cols-3" aria-label="Fechas y control del caso">
        <p className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-[#0070a8]" /><span><strong className="block text-[#003366]">Creado</strong>{formatDate(item.createdAt)}</span></p>
        <p className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-[#0070a8]" /><span><strong className="block text-[#003366]">Actualizado</strong>{formatDate(item.updatedAt)}</span></p>
        <p className="flex items-center gap-2"><UserRound className="h-4 w-4 text-[#0070a8]" /><span><strong className="block text-[#003366]">Responsable</strong>{item.owner?.displayName || "Pendiente"}</span></p>
      </section>
    </> : null}
  </section>;
}
