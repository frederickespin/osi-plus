import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, Circle, LoaderCircle, Minus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CrmPipelineCaseDetail } from "@/crm-relational/types";
import type { IcpCaseDetail } from "@/crm-icp-v2/api";
import type { CaseServiceWorkspace } from "@/crm-services/api";
import type { SurveyAssignment } from "@/survey/types";
import type { LogisticsRevision } from "@/logistics-engine/api";
import type { CostingRevision } from "@/costing/api";
import type { QuoteCase } from "@/quote/api";

export type ConsolidatedCaseTab = "SUMMARY" | "SERVICES" | "SURVEY" | "LOGISTICS" | "COSTING" | "QUOTE";

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

const MODE_LABEL: Record<string, string> = { LOCAL: "LOCAL / NACIONAL", EXPORT: "Exportación", IMPORT: "Importación" };
const DESTINATION_LABEL: Record<string, string> = { CONFIRMED: "Confirmado", APPROXIMATE: "Aproximado", PENDING: "Pendiente" };

function address(value: IcpCaseDetail["route"]["origin"] | null) {
  if (!value) return "Pendiente de confirmar";
  return [value.streetAndNumber, value.sector, value.cityMunicipality, value.provinceState, value.countryCode].filter(Boolean).join(", ");
}

function surveyState(value: SurveyAssignment | null) {
  if (!value) return "Sin asignar";
  if (["COMPLETED", "PUBLISHED"].includes(value.status)) return "Publicado";
  if (["ARRIVED", "IN_PROGRESS"].includes(value.status)) return "En progreso";
  return "Asignado";
}

function WorkflowStep({ label, ready, active, onClick }: { label: string; ready: boolean; active?: boolean; onClick(): void }) {
  return <button type="button" onClick={onClick} className={`flex min-w-fit items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-bold ${active ? "border-sky-500 bg-sky-50 text-[#003366]" : ready ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-500"}`}>
    {ready ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : active ? <Circle className="h-3.5 w-3.5 fill-current" aria-hidden="true" /> : <Minus className="h-3.5 w-3.5" aria-hidden="true" />}{label}
  </button>;
}

function Fact({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="min-w-0 border-b border-slate-100 py-2.5 last:border-b-0"><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-0.5 break-words text-sm font-semibold text-slate-900">{value}</dd>{note && <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{note}</p>}</div>;
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
      } finally { if (current) setLoading(false); }
    })();
    return () => { current = false; controller.abort(); };
  }, [authorization, costingEnabled, item.caseRef, logisticsEnabled, onUnauthorized, quoteEnabled, reload, servicesEnabled, surveyEnabled]);

  const accepted = useMemo(() => snapshot?.quote?.proposals.find((proposal) => proposal.state === "ACCEPTED") || null, [snapshot]);
  const currentQuote = accepted || snapshot?.quote?.proposals[0] || null;
  const servicesReady = Boolean(snapshot?.services?.selection.primary);
  const surveyPublished = surveyState(snapshot?.survey) === "Publicado";
  const logisticsReady = Boolean(snapshot?.logistics && snapshot.logistics.status === "PUBLISHED");
  const costingReady = Boolean(snapshot?.costing && snapshot.costing.status === "PUBLISHED");
  const quoteReady = Boolean(currentQuote);

  return <section role="tabpanel" aria-label="Resumen consolidado del caso" className="space-y-3" data-testid="case-workflow-overview">
    <div className="flex items-center gap-2 overflow-x-auto border border-slate-200 bg-slate-50 p-2" aria-label="Progreso real del caso" data-testid="case-workflow-progress">
      <WorkflowStep label="ICP" ready onClick={() => onSelectTab("SUMMARY")} />
      <WorkflowStep label="Servicios" ready={servicesReady} onClick={() => onSelectTab("SERVICES")} />
      <WorkflowStep label="Survey" ready={surveyPublished} onClick={() => onSelectTab("SURVEY")} />
      <WorkflowStep label="Motor" ready={logisticsReady} onClick={() => onSelectTab("LOGISTICS")} />
      <WorkflowStep label="Costing" ready={costingReady} onClick={() => onSelectTab("COSTING")} />
      <WorkflowStep label="Cotización" ready={Boolean(accepted)} active={quoteReady && !accepted} onClick={() => onSelectTab("QUOTE")} />
    </div>
    {loading && <div className="flex min-h-44 items-center justify-center gap-2 border border-slate-200 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Reuniendo el estado publicado del caso…</div>}
    {error && <div role="alert" className="flex items-start gap-2 border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><div><p>{error}</p><Button size="sm" variant="outline" className="mt-2" onClick={() => setReload((value) => value + 1)}><RefreshCw />Reintentar</Button></div></div>}
    {!loading && snapshot && <>
      <div className="grid gap-3 xl:grid-cols-2">
        <section className="border border-slate-200 bg-white"><h2 className="border-b bg-slate-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-[#003366]">ICP y relación comercial</h2><dl className="px-3"><Fact label="Caso" value={snapshot.icp.caseCode} /><Fact label="Cliente" value={snapshot.icp.client?.displayName || "Sin cliente vinculado"} note={`${snapshot.icp.clientProfileType} · ${snapshot.icp.intakeChannel}`} /><Fact label="Contacto" value={snapshot.icp.caseContact.displayName} note={[snapshot.icp.caseContact.phone, snapshot.icp.caseContact.email].filter(Boolean).join(" · ")} /><Fact label="Empresa / Lead Account / Booker" value="No publicado" note="La ficha no infiere relaciones comerciales que el contrato actual todavía no publica." /><Fact label="Modo" value={MODE_LABEL[snapshot.icp.mode] || snapshot.icp.mode} /></dl></section>
        <section className="border border-slate-200 bg-white"><h2 className="border-b bg-slate-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-[#003366]">Ruta y definición</h2><dl className="px-3"><Fact label="Origen" value={address(snapshot.icp.route.origin)} /><Fact label="Destino" value={address(snapshot.icp.route.destination)} note={`Estado: ${DESTINATION_LABEL[snapshot.icp.route.destinationStatus] || snapshot.icp.route.destinationStatus}`} /><Fact label="Servicio principal" value={snapshot.services?.selection.primary?.name || "Todavía no se ha seleccionado un servicio"} /><Fact label="Servicios incluidos" value={snapshot.services?.selection.complementaries.map((service) => service.name).join(", ") || "Sin servicios complementarios publicados"} /></dl></section>
      </div>
      <section className="border border-slate-200 bg-white"><h2 className="border-b bg-slate-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-[#003366]">Cadena operativa y económica</h2><dl className="grid px-3 sm:grid-cols-2 xl:grid-cols-4"><Fact label="Survey vigente" value={surveyState(snapshot.survey)} note={snapshot.survey?.caseCode ? "Agenda tenant-first vigente" : "No existe un Survey publicado"} /><Fact label="Motor Logístico" value={snapshot.logistics ? `Revisión ${snapshot.logistics.revision} · ${snapshot.logistics.status}` : "Todavía no se ha calculado"} note={snapshot.logistics?.issues.length ? `${snapshot.logistics.issues.length} pendiente(s)` : undefined} /><Fact label="Costing vigente" value={snapshot.costing ? `Revisión ${snapshot.costing.revision} · ${snapshot.costing.status}` : "No existe Costing publicado"} note={snapshot.costing ? `${snapshot.costing.baseCurrency} · costo y precio sugerido internos` : "Requiere un Plan Logístico publicado"} /><Fact label="Cotización vigente" value={currentQuote ? `${currentQuote.reference} · ${currentQuote.state}` : "Todavía no existen propuestas"} note={accepted ? "Listo para Operaciones · handoff aún no implementado" : `${snapshot.quote?.proposals.length || 0} de 3 propuestas`} /></dl></section>
      {accepted && <div className="border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-900" data-testid="ready-for-operations">Listo para Operaciones <span className="font-normal">· La propuesta aceptada queda congelada; el handoff operacional pertenece al siguiente lote.</span></div>}
    </>}
  </section>;
}
