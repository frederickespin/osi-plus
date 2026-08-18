import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, ChevronLeft, ChevronRight, Search, UserRound, UsersRound } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CrmPipelineReadApi, asCrmPipelineReadError, type CrmPipelineReadError } from "@/crm-relational/readApi";
import {
  PIPELINE_CASE_STATUSES,
  type CrmPipelineCase,
  type CrmPipelineFilters,
  type CrmPipelineList,
  type CrmPipelineSummary,
  type PipelineCaseStatus,
  type PipelineMode,
} from "@/crm-relational/types";

const PAGE_SIZE = 25;
const MODES: readonly PipelineMode[] = ["LOCAL", "EXPORT", "IMPORT"];
const STATUS_LABELS: Readonly<Record<PipelineCaseStatus, string>> = {
  NEW_INBOX: "Nuevo en Inbox", AWAITING_ICP: "Esperando ICP", GOVERNANCE_CONFIRMED: "Gobernanza confirmada",
  REQUIREMENTS_CONFIRMED: "Requisitos confirmados", SURVEY_PLANNING: "Planificando Survey", SURVEY_SCHEDULED: "Survey programado",
  SURVEY_COMPLETED: "Survey completado", CRATING_ESTIMATE_PENDING: "Estimación de cajas", PRICING_IN_PROGRESS: "Costeo en proceso",
  QUOTE_DRAFT: "Cotización borrador", INTERNAL_REVIEW: "Revisión interna", QUOTE_SENT: "Cotización enviada",
  NEGOTIATION: "Negociación", WON: "Ganado", LOST: "Perdido", CHANGE_CONTROL: "Control de cambios",
  APPROVED: "Aprobado · legacy congelado", OPS_HANDOFF: "Handoff a Operaciones · terminal",
};

type Props = Readonly<{ onBack(): void; onUnauthorized(): void; api?: CrmPipelineReadApi }>;
type DetailState = Readonly<{ loading: boolean; value: CrmPipelineCase | null; error: CrmPipelineReadError | null }>;

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Fecha no disponible" : new Intl.DateTimeFormat("es-DO", { dateStyle: "medium" }).format(date);
}

function errorCopy(error: CrmPipelineReadError) {
  if (error.status === 401) return "La sesión ya no es válida. Inicia sesión nuevamente.";
  if (error.status === 403) return "Tu membresía no tiene permiso para consultar el Inbox Comercial.";
  if (error.status === 404) return "La oportunidad no existe o no pertenece a este tenant.";
  if (error.status === 409) return "La lectura CRM continúa desactivada en este entorno.";
  if (error.status === 503) return "El servicio relacional no está disponible temporalmente.";
  return "La respuesta del servicio no pudo validarse de forma segura.";
}

function statusClass(value: PipelineCaseStatus) {
  if (value === "APPROVED") return "border-amber-300 bg-amber-50 text-amber-800";
  if (value === "OPS_HANDOFF") return "border-slate-400 bg-slate-100 text-slate-800";
  if (value === "WON") return "border-emerald-300 bg-emerald-50 text-emerald-800";
  if (value === "LOST") return "border-rose-300 bg-rose-50 text-rose-800";
  return "border-sky-200 bg-sky-50 text-sky-800";
}

function SummaryCards({ value }: { value: CrmPipelineSummary | null }) {
  const cards = [
    { label: "Oportunidades", value: value?.total ?? 0, icon: UsersRound },
    { label: "Asignadas", value: value?.assigned ?? 0, icon: UserRound },
    { label: "Sin asignar", value: value?.unassigned ?? 0, icon: AlertCircle },
  ];
  return <div className="grid gap-3 sm:grid-cols-3">{cards.map(({ label, value: count, icon: Icon }) => <Card key={label} className="border-slate-200 bg-white shadow-sm"><CardContent className="flex items-center justify-between p-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{count}</p></div><span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-50 text-sky-700"><Icon className="h-5 w-5" /></span></CardContent></Card>)}</div>;
}

function EmptyState() {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center" data-testid="commercial-crm-empty"><h2 className="text-lg font-bold text-slate-900">Inbox Comercial vacío</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">Aún no hay oportunidades reales registradas para este tenant. Esta vista no genera casos ni muestra datos de demostración.</p></div>;
}

function CaseRow({ item, onOpen }: { item: CrmPipelineCase; onOpen(item: CrmPipelineCase, trigger: HTMLButtonElement): void }) {
  return <tr className="border-b border-slate-100 align-top hover:bg-sky-50/40">
    <td className="px-4 py-3"><p className="font-mono text-sm font-bold text-slate-950">{item.caseCode}</p><p className="mt-1 text-xs text-slate-500">{formatDate(item.updatedAt)}</p></td>
    <td className="px-4 py-3"><p className="max-w-48 truncate text-sm font-medium text-slate-900">{item.clientName || "Receptor no publicado"}</p><p className="text-xs text-slate-500">{item.customerType}</p></td>
    <td className="px-4 py-3"><p className="max-w-52 truncate text-sm text-slate-900">{item.originLocation || "Origen pendiente"}</p><p className="max-w-52 truncate text-xs text-slate-500">→ {item.destinationLocation || "Destino pendiente"}</p></td>
    <td className="px-4 py-3"><Badge variant="outline">{item.mode}</Badge><p className="mt-1 text-xs text-slate-600">{item.serviceType}</p></td>
    <td className="px-4 py-3"><Badge data-status={item.status} variant="outline" className={statusClass(item.status)}>{STATUS_LABELS[item.status]}</Badge></td>
    <td className="px-4 py-3"><p className="text-sm font-medium text-slate-900">{item.owner?.displayName || "Sin asignar"}</p><p className="text-xs text-slate-500">{item.owner ? "Owner relacional" : "Cola comercial"}</p></td>
    <td className="px-4 py-3 text-right"><Button size="sm" variant="outline" onClick={(event) => onOpen(item, event.currentTarget)}>Ver detalle</Button></td>
  </tr>;
}

function MobileCase({ item, onOpen }: { item: CrmPipelineCase; onOpen(item: CrmPipelineCase, trigger: HTMLButtonElement): void }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-sm font-bold">{item.caseCode}</p><p className="text-xs text-slate-500">{formatDate(item.updatedAt)}</p></div><Badge variant="outline">{item.mode}</Badge></div><p className="mt-3 text-sm font-medium">{item.clientName || "Receptor no publicado"}</p><p className="mt-1 text-xs text-slate-500">{item.originLocation || "Origen pendiente"} → {item.destinationLocation || "Destino pendiente"}</p><div className="mt-3"><Badge data-status={item.status} variant="outline" className={statusClass(item.status)}>{STATUS_LABELS[item.status]}</Badge></div><div className="mt-4 flex items-center justify-between"><span className="text-xs text-slate-600">{item.owner?.displayName || "Sin asignar"}</span><Button size="sm" variant="outline" onClick={(event) => onOpen(item, event.currentTarget)}>Ver detalle</Button></div></article>;
}

function DetailDrawer({ state, open, onOpenChange }: { state: DetailState; open: boolean; onOpenChange(value: boolean): void }) {
  const item = state.value;
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl" aria-describedby="commercial-case-description"><SheetHeader><SheetTitle>{item?.caseCode || "Detalle de oportunidad"}</SheetTitle><SheetDescription id="commercial-case-description">Información publicada por el dominio relacional del tenant.</SheetDescription></SheetHeader><div className="space-y-5 px-4 pb-8" aria-live="polite">{state.loading && <p className="text-sm text-slate-500">Cargando detalle…</p>}{state.error && <Alert variant="destructive"><AlertCircle /><AlertTitle>{state.error.code}</AlertTitle><AlertDescription>{errorCopy(state.error)}</AlertDescription></Alert>}{item && <><div className="flex flex-wrap gap-2"><Badge variant="outline" className={statusClass(item.status)}>{STATUS_LABELS[item.status]}</Badge><Badge variant="outline">{item.mode}</Badge></div><dl className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-2"><div><dt className="text-xs text-slate-500">Receptor publicado</dt><dd className="mt-1 text-sm font-medium">{item.clientName || "No publicado"}</dd></div><div><dt className="text-xs text-slate-500">Asignación</dt><dd className="mt-1 text-sm font-medium">{item.owner?.displayName || "Sin asignar"}</dd></div><div><dt className="text-xs text-slate-500">Servicio</dt><dd className="mt-1 text-sm">{item.serviceType}</dd></div><div><dt className="text-xs text-slate-500">Volumen estimado</dt><dd className="mt-1 text-sm">{item.estimatedCbm.toLocaleString("es-DO")} m³</dd></div><div><dt className="text-xs text-slate-500">Origen</dt><dd className="mt-1 text-sm">{item.originLocation || "Pendiente"}</dd></div><div><dt className="text-xs text-slate-500">Destino</dt><dd className="mt-1 text-sm">{item.destinationLocation || "Pendiente"}</dd></div><div><dt className="text-xs text-slate-500">Survey</dt><dd className="mt-1 text-sm">{item.requiresSurvey ? item.surveyMethod : "No requerido"}</dd></div><div><dt className="text-xs text-slate-500">Actividad publicada</dt><dd className="mt-1 text-sm">{item.eventCount} eventos · {item.quoteCount} cotizaciones</dd></div></dl>{item.status === "APPROVED" && <Alert><AlertTitle>Legacy congelado</AlertTitle><AlertDescription>APPROVED permanece visible, pero no admite acciones en esta fase.</AlertDescription></Alert>}{item.status === "OPS_HANDOFF" && <Alert><AlertTitle>Estado terminal</AlertTitle><AlertDescription>La oportunidad ya fue entregada a Operaciones.</AlertDescription></Alert>}<div className="rounded-2xl border border-dashed border-slate-300 p-4"><p className="text-sm font-semibold text-slate-800">Transiciones, asignación y edición</p><p className="mt-1 text-sm text-slate-500">Disponible en una fase posterior.</p></div></>}</div></SheetContent></Sheet>;
}

export default function CommercialInboxModule({ onBack, onUnauthorized, api: suppliedApi }: Props) {
  const api = useMemo(() => suppliedApi ?? new CrmPipelineReadApi(), [suppliedApi]);
  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState<CrmPipelineFilters>({ page: 1, pageSize: PAGE_SIZE });
  const [list, setList] = useState<CrmPipelineList | null>(null);
  const [summary, setSummary] = useState<CrmPipelineSummary | null>(null);
  const [listError, setListError] = useState<CrmPipelineReadError | null>(null);
  const [summaryError, setSummaryError] = useState<CrmPipelineReadError | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailState>({ loading: false, value: null, error: null });
  const [refresh, setRefresh] = useState(0);
  const listFence = useRef(0);
  const summaryFence = useRef(0);
  const detailFence = useRef(0);
  const detailTrigger = useRef<HTMLButtonElement | null>(null);

  const captureError = useCallback((cause: unknown) => {
    const error = asCrmPipelineReadError(cause);
    if (error.status === 401) onUnauthorized();
    return error;
  }, [onUnauthorized]);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => setFilters((current) => {
      const search = searchInput.trim() || undefined;
      return current.search === search ? current : { ...current, page: 1, search };
    }), 300);
    return () => globalThis.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const fence = ++listFence.current;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setLoading(true); setListError(null);
      void api.list(filters, controller.signal).then((value) => { if (fence === listFence.current) setList(value); }).catch((cause) => { if (!controller.signal.aborted && fence === listFence.current) setListError(captureError(cause)); }).finally(() => { if (fence === listFence.current) setLoading(false); });
    });
    return () => controller.abort(new DOMException("Inbox list unmounted", "AbortError"));
  }, [api, captureError, filters, refresh]);

  useEffect(() => {
    const fence = ++summaryFence.current;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setSummaryError(null);
      void api.summary(controller.signal).then((value) => { if (fence === summaryFence.current) setSummary(value); }).catch((cause) => { if (!controller.signal.aborted && fence === summaryFence.current) setSummaryError(captureError(cause)); });
    });
    return () => controller.abort(new DOMException("Inbox summary unmounted", "AbortError"));
  }, [api, captureError, refresh]);

  useEffect(() => {
    if (!selectedId) return undefined;
    const fence = ++detailFence.current;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setDetail((current) => ({ ...current, loading: true, error: null }));
      void api.detail(selectedId, controller.signal).then((value) => { if (fence === detailFence.current) setDetail({ loading: false, value, error: null }); }).catch((cause) => { if (!controller.signal.aborted && fence === detailFence.current) setDetail({ loading: false, value: null, error: captureError(cause) }); });
    });
    return () => controller.abort(new DOMException("Inbox detail closed", "AbortError"));
  }, [api, captureError, selectedId]);

  const openDetail = (item: CrmPipelineCase, trigger: HTMLButtonElement) => { detailTrigger.current = trigger; setDetail({ loading: true, value: item, error: null }); setSelectedId(item.id); };
  const closeDetail = () => { setSelectedId(null); setDetail({ loading: false, value: null, error: null }); globalThis.setTimeout(() => detailTrigger.current?.focus(), 0); };
  const pages = Math.max(1, Math.ceil((list?.total ?? 0) / (list?.pageSize ?? PAGE_SIZE)));

  return <section className="mx-auto max-w-[1500px] space-y-5 px-4 py-6 sm:px-6 lg:px-8" data-testid="commercial-crm-inbox"><header className="rounded-2xl border border-sky-200 bg-gradient-to-br from-white via-sky-50/60 to-cyan-50/30 p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-sky-700">Comercial · lectura relacional local</p><h1 className="mt-2 text-2xl font-bold text-slate-950">Inbox Comercial</h1><p className="mt-1 text-sm text-slate-600">Oportunidades del tenant autenticado, sin mocks ni autoridad local.</p></div><Button variant="outline" onClick={onBack}><ArrowLeft />Regresar al Hub</Button></div></header><SummaryCards value={summary} />
    <Card className="border-slate-200"><CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(220px,1fr)_180px_200px]"><label className="text-xs font-semibold text-slate-600">Buscar<span className="relative mt-1 block"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input className="pl-9" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Caso, receptor o ruta" /></span></label><label className="text-xs font-semibold text-slate-600">Estado<select aria-label="Estado" className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" value={filters.status || ""} onChange={(event) => setFilters((current) => ({ ...current, page: 1, status: (event.target.value || undefined) as PipelineCaseStatus | undefined }))}><option value="">Todos</option>{PIPELINE_CASE_STATUSES.map((value) => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}</select></label><label className="text-xs font-semibold text-slate-600">Asignación<select aria-label="Asignación" className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" value={filters.owner || ""} onChange={(event) => setFilters((current) => ({ ...current, page: 1, owner: (event.target.value || undefined) as CrmPipelineFilters["owner"] }))}><option value="">Todas</option><option value="assigned">Asignadas</option><option value="unassigned">Sin asignar</option></select></label><div className="flex flex-wrap gap-2 md:col-span-3"><Button size="sm" variant={!filters.mode ? "default" : "outline"} onClick={() => setFilters((current) => ({ ...current, page: 1, mode: undefined }))}>Todos los modos</Button>{MODES.map((mode) => <Button key={mode} size="sm" variant={filters.mode === mode ? "default" : "outline"} onClick={() => setFilters((current) => ({ ...current, page: 1, mode }))}>{mode}</Button>)}</div></CardContent></Card>
    {listError && <Alert variant="destructive"><AlertCircle /><AlertTitle>{listError.code}</AlertTitle><AlertDescription>{errorCopy(listError)}<Button size="sm" variant="outline" className="mt-3" onClick={() => setRefresh((value) => value + 1)}>Reintentar lectura</Button></AlertDescription></Alert>}{summaryError && <Alert variant="destructive"><AlertCircle /><AlertTitle>{summaryError.code}</AlertTitle><AlertDescription>{errorCopy(summaryError)}</AlertDescription></Alert>}
    {loading && !list && <div className="rounded-2xl border bg-white p-10 text-center text-sm text-slate-500">Cargando Inbox Comercial…</div>}{!loading && list?.data.length === 0 && <EmptyState />}{list && list.data.length > 0 && <><div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:block"><div className="overflow-x-auto"><table className="w-full min-w-[1100px] border-collapse"><thead className="bg-gradient-to-r from-slate-50 via-sky-50 to-emerald-50"><tr className="border-b text-left text-[11px] uppercase tracking-wide text-slate-500"><th className="px-4 py-3">Caso</th><th className="px-4 py-3">Receptor</th><th className="px-4 py-3">Ruta</th><th className="px-4 py-3">Servicio</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Asignación</th><th className="px-4 py-3 text-right">Detalle</th></tr></thead><tbody>{list.data.map((item) => <CaseRow key={item.id} item={item} onOpen={openDetail} />)}</tbody></table></div></div><div className="grid gap-3 md:hidden">{list.data.map((item) => <MobileCase key={item.id} item={item} onOpen={openDetail} />)}</div></>}
    <footer className="flex flex-wrap items-center justify-between gap-3"><Button variant="outline" disabled={loading || (list?.page ?? filters.page) <= 1} onClick={() => setFilters((current) => ({ ...current, page: Math.max(1, current.page - 1) }))}><ChevronLeft />Anterior</Button><p className="text-sm text-slate-600">Página {list?.page ?? filters.page} de {pages} · {list?.total ?? 0} resultados</p><Button variant="outline" disabled={loading || (list?.page ?? filters.page) >= pages} onClick={() => setFilters((current) => ({ ...current, page: Math.min(pages, current.page + 1) }))}>Siguiente<ChevronRight /></Button></footer>
    <DetailDrawer state={detail} open={selectedId !== null} onOpenChange={(open) => { if (!open) closeDetail(); }} />
  </section>;
}
