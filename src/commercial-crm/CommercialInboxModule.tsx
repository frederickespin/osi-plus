import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, BellRing, ChevronLeft, ChevronRight, Clock3, Filter, MapPin, Plus, Search, UserRound, UsersRound } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CrmPipelineReadApi, asCrmPipelineReadError, type CrmPipelineReadError } from "@/crm-relational/readApi";
import { PIPELINE_CASE_STATUSES, type CrmPipelineCase, type CrmPipelineCaseDetail, type CrmPipelineFilters, type CrmPipelineList, type CrmPipelineSummary, type PipelineCaseStatus, type PipelineMode } from "@/crm-relational/types";
import { STATUS_LABELS, commercialReadErrorCopy, statusClass } from "./presentation";
import { CrmCaseMutationApi, isCrmCaseMutationUiEnabled } from "@/crm-relational/mutationApi";
import CommercialCaseForm from "./CommercialCaseForm";
import type { CrmCaseMutationUiAccess } from "@/crm-relational/mutationAccess";

const CommercialCaseDetail = lazy(() => import("./CommercialCaseDetail"));
const PAGE_SIZE = 25;
const MODES: readonly PipelineMode[] = ["LOCAL", "EXPORT", "IMPORT"];

type Props = Readonly<{
  authorization?: string;
  mutationAccess: CrmCaseMutationUiAccess;
  role: string;
  caseRef?: string | null;
  onBack(): void;
  onOpenCase(caseRef: string): void;
  onReturnToInbox(): void;
  onUnauthorized(): void;
  api?: CrmPipelineReadApi;
}>;
type DetailState = Readonly<{ loading: boolean; value: CrmPipelineCaseDetail | null; error: CrmPipelineReadError | null }>;

function factualAlerts(item: CrmPipelineCase) {
  return [!item.client ? "Cliente pendiente" : null, !item.owner ? "Sin asignar" : null, item.requiresSurvey ? "Survey requerido" : null, !item.destinationLocation ? "Destino pendiente" : null, item.estimatedCbm === null || item.estimatedCbm <= 0 ? "Volumen pendiente" : null].filter((value): value is string => Boolean(value));
}

function SummaryStrip({ value, role }: { value: CrmPipelineSummary | null; role: string }) {
  const values = [
    { label: role === "V" ? "Mis casos" : "Casos del tenant", value: value?.total ?? 0, icon: UsersRound },
    { label: "Asignados", value: value?.assigned ?? 0, icon: UserRound },
    { label: "Sin asignar", value: value?.unassigned ?? 0, icon: AlertCircle },
    { label: "SLA", value: "No disponible", icon: Clock3 },
  ];
  return <div className="grid grid-cols-2 border-b border-slate-200 bg-white xl:grid-cols-4">{values.map(({ label, value: count, icon: Icon }) => <div key={label} className="flex min-h-16 items-center gap-3 border-b border-r border-slate-100 px-3 py-2 xl:border-b-0 xl:px-4 xl:py-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-sky-50 text-[#006aa6]"><Icon className="h-4 w-4" /></span><div className="min-w-0"><p className="truncate text-[9px] font-bold uppercase tracking-[.1em] text-slate-500 sm:text-[10px] sm:tracking-[.12em]">{label}</p><p className={`${typeof count === "number" ? "text-xl" : "text-[11px]"} font-black text-[#003366]`}>{count}</p></div></div>)}</div>;
}

function EmptyState() {
  return <div className="border border-dashed border-slate-300 bg-white px-5 py-12 text-center" data-testid="commercial-crm-empty"><h2 className="text-base font-bold text-slate-900">Inbox Comercial vacío</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">Aún no hay oportunidades reales registradas en el alcance autorizado. No se generan datos de demostración.</p></div>;
}

function QueueItem({ item, selected, onOpen }: { item: CrmPipelineCase; selected: boolean; onOpen(caseRef: string): void }) {
  const alerts = factualAlerts(item);
  return <article className={`border-b border-slate-200 bg-white transition-colors ${selected ? "border-l-4 border-l-[#0079b8] bg-sky-50" : "border-l-4 border-l-transparent hover:bg-slate-50"}`}><div className="px-2 py-1.5"><div className="flex items-center gap-1.5"><p className="min-w-0 flex-1 truncate text-[11px] font-bold text-slate-900"><span className="font-mono font-black text-[#003366]">{item.caseCode}</span> · {item.client?.displayName || "Sin Client vinculado"}</p><Badge data-status={item.status} variant="outline" className={`${statusClass(item.status)} shrink-0 px-1.5 text-[8px]`}>{STATUS_LABELS[item.status]}</Badge><Button size="sm" className="h-6 shrink-0 px-1.5 text-[9px]" variant={selected ? "secondary" : "outline"} onClick={() => onOpen(item.caseRef)}>Abrir ficha</Button></div><div className="mt-1 flex min-w-0 items-center gap-1 overflow-hidden text-[9px]"><span className="flex min-w-20 flex-1 items-center gap-1 truncate text-slate-600"><MapPin className="h-2.5 w-2.5 shrink-0" />{item.originLocation || "Origen pendiente"} → {item.destinationLocation || "Destino pendiente"}</span><Badge variant="outline" className="shrink-0 px-1 text-[8px]">{item.mode}</Badge><span className="shrink-0 rounded bg-slate-100 px-1 py-0.5 text-slate-600">SLA: GRAY</span>{alerts.slice(0, 1).map((alert) => <span key={alert} className="max-w-24 truncate rounded bg-amber-50 px-1 py-0.5 font-semibold text-amber-800">{alert}</span>)}<span className="max-w-24 truncate text-slate-500">{item.owner?.displayName || "Sin asignar"}</span>{item.eventCount > 0 && <span className="shrink-0 text-slate-500">Act. {item.eventCount}</span>}</div></div></article>;
}

function SupervisionPanel({ summary, role }: { summary: CrmPipelineSummary | null; role: string }) {
  const statuses = PIPELINE_CASE_STATUSES.filter((status) => (summary?.byStatus[status] ?? 0) > 0);
  return <section className="h-full bg-white" aria-labelledby="supervision-heading"><header className="border-b border-slate-200 px-5 py-4"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#0070a8]">{role === "V" ? "Seguimiento personal" : "Supervisión comercial"}</p><h2 id="supervision-heading" className="mt-1 text-xl font-black text-[#003366]">{role === "V" ? "Mis métricas" : "Control del equipo"}</h2><p className="mt-1 text-sm text-slate-600">{role === "V" ? "Los totales incluyen exclusivamente casos con owner completo coincidente con tu sesión." : "Vista tenant-wide. Las métricas por vendedor requieren un contrato agregado y no se infieren en el navegador."}</p></header><div className="grid divide-y divide-slate-200 lg:grid-cols-2 lg:divide-x lg:divide-y-0"><div className="p-5"><h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Distribución por estado</h3><div className="mt-3 divide-y divide-slate-100">{statuses.length ? statuses.map((status) => <div key={status} className="flex items-center justify-between py-2 text-sm"><span>{STATUS_LABELS[status]}</span><strong className="text-[#003366]">{summary?.byStatus[status] ?? 0}</strong></div>) : <p className="py-5 text-sm text-slate-500">Sin casos en el alcance actual.</p>}</div></div><div className="p-5"><h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500"><BellRing className="h-4 w-4" />Atención operativa</h3><div className="mt-3 divide-y divide-slate-100"><div className="flex items-center justify-between py-3 text-sm"><span>Sin asignar</span><strong>{summary?.unassigned ?? 0}</strong></div><div className="flex items-center justify-between py-3 text-sm"><span>SLA</span><span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">Sin autoridad</span></div><div className="py-3 text-sm text-slate-500">Alertas detalladas usan sólo campos publicados. No se inventa historial ni prioridad.</div></div></div></div></section>;
}

export default function CommercialInboxModule({ authorization, mutationAccess, role, caseRef, onBack, onOpenCase, onReturnToInbox, onUnauthorized, api: suppliedApi }: Props) {
  const api = useMemo(() => suppliedApi ?? new CrmPipelineReadApi({ tokenProvider: () => authorization ?? null }), [authorization, suppliedApi]);
  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState<CrmPipelineFilters>({ page: 1, pageSize: PAGE_SIZE });
  const [list, setList] = useState<CrmPipelineList | null>(null);
  const [summary, setSummary] = useState<CrmPipelineSummary | null>(null);
  const [listError, setListError] = useState<CrmPipelineReadError | null>(null);
  const [summaryError, setSummaryError] = useState<CrmPipelineReadError | null>(null);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<DetailState>({ loading: false, value: null, error: null });
  const [refresh, setRefresh] = useState(0);
  const [detailRefresh, setDetailRefresh] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const listFence = useRef(0);
  const summaryFence = useRef(0);
  const detailFence = useRef(0);
  const mutationEnvironmentEnabled = isCrmCaseMutationUiEnabled();
  const mutationApi = useMemo(() => new CrmCaseMutationApi(() => authorization ?? null), [authorization]);
  const captureError = useCallback((cause: unknown) => { const error = asCrmPipelineReadError(cause); if (error.status === 401) onUnauthorized(); return error; }, [onUnauthorized]);

  useEffect(() => { const timer = globalThis.setTimeout(() => setFilters((current) => { const search = searchInput.trim() || undefined; return current.search === search ? current : { ...current, page: 1, search }; }), 300); return () => globalThis.clearTimeout(timer); }, [searchInput]);
  useEffect(() => { const fence = ++listFence.current; const controller = new AbortController(); queueMicrotask(() => { if (controller.signal.aborted) return; setLoading(true); setListError(null); void api.list(filters, controller.signal).then((value) => { if (fence === listFence.current) setList(value); }).catch((cause) => { if (!controller.signal.aborted && fence === listFence.current) setListError(captureError(cause)); }).finally(() => { if (fence === listFence.current) setLoading(false); }); }); return () => controller.abort(new DOMException("Inbox list unmounted", "AbortError")); }, [api, captureError, filters, refresh]);
  useEffect(() => { const fence = ++summaryFence.current; const controller = new AbortController(); queueMicrotask(() => { if (controller.signal.aborted) return; setSummaryError(null); void api.summary(controller.signal).then((value) => { if (fence === summaryFence.current) setSummary(value); }).catch((cause) => { if (!controller.signal.aborted && fence === summaryFence.current) setSummaryError(captureError(cause)); }); }); return () => controller.abort(new DOMException("Inbox summary unmounted", "AbortError")); }, [api, captureError, refresh]);
  useEffect(() => { if (!caseRef) return undefined; const fence = ++detailFence.current; const controller = new AbortController(); queueMicrotask(() => { if (controller.signal.aborted) return; setDetail({ loading: true, value: null, error: null }); void api.detail(caseRef, controller.signal).then((value) => { if (fence === detailFence.current) setDetail({ loading: false, value, error: null }); }).catch((cause) => { if (!controller.signal.aborted && fence === detailFence.current) setDetail({ loading: false, value: null, error: captureError(cause) }); }); }); return () => controller.abort(new DOMException("Case detail unmounted", "AbortError")); }, [api, captureError, caseRef, detailRefresh]);

  const pages = Math.max(1, Math.ceil((list?.total ?? 0) / (list?.pageSize ?? PAGE_SIZE)));
  const queue = <section className="flex min-h-0 flex-col border-r border-slate-200 bg-slate-50" aria-label="Cola comercial"><div className="border-b border-slate-200 bg-white p-3"><label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Buscar<span className="relative mt-1 block"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input className="h-9 pl-9" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Caso, cliente o ruta" /></span></label><div className="mt-2 grid grid-cols-2 gap-2"><select aria-label="Estado" className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs" value={filters.status || ""} onChange={(event) => setFilters((current) => ({ ...current, page: 1, status: (event.target.value || undefined) as PipelineCaseStatus | undefined }))}><option value="">Todos los estados</option>{PIPELINE_CASE_STATUSES.map((value) => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}</select><select aria-label="Asignación" className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs" value={filters.owner || ""} onChange={(event) => setFilters((current) => ({ ...current, page: 1, owner: (event.target.value || undefined) as CrmPipelineFilters["owner"] }))} disabled={role === "V"}><option value="">{role === "V" ? "Sólo mis casos" : "Toda asignación"}</option><option value="assigned">Asignadas</option><option value="unassigned">Sin asignar</option></select></div><div className="mt-2 flex flex-wrap gap-1"><Filter className="mr-1 h-4 w-4 text-slate-400" /><Button size="sm" variant={!filters.mode ? "secondary" : "ghost"} onClick={() => setFilters((current) => ({ ...current, page: 1, mode: undefined }))}>Todos</Button>{MODES.map((mode) => <Button key={mode} size="sm" variant={filters.mode === mode ? "secondary" : "ghost"} onClick={() => setFilters((current) => ({ ...current, page: 1, mode }))}>{mode}</Button>)}</div></div><div className="min-h-0 flex-1 overflow-y-auto">{listError && <Alert variant="destructive" className="m-3"><AlertCircle /><AlertTitle>{listError.code}</AlertTitle><AlertDescription>{commercialReadErrorCopy(listError)}<Button size="sm" variant="outline" className="mt-2" onClick={() => setRefresh((value) => value + 1)}>Reintentar lectura</Button></AlertDescription></Alert>}{loading && !list && <p className="p-8 text-center text-sm text-slate-500">Cargando Inbox Comercial…</p>}{!loading && list?.data.length === 0 && <EmptyState />}{list?.data.map((item) => <QueueItem key={item.caseRef} item={item} selected={item.caseRef === caseRef} onOpen={onOpenCase} />)}</div><footer className="flex items-center justify-between gap-2 border-t border-slate-200 bg-white p-2"><Button size="sm" variant="ghost" aria-label="Página anterior" disabled={loading || (list?.page ?? filters.page) <= 1} onClick={() => setFilters((current) => ({ ...current, page: Math.max(1, current.page - 1) }))}><ChevronLeft /></Button><p className="text-[11px] text-slate-600">{list?.total ?? 0} resultados · Página {list?.page ?? filters.page} de {pages}</p><Button size="sm" variant="ghost" aria-label="Página siguiente" disabled={loading || (list?.page ?? filters.page) >= pages} onClick={() => setFilters((current) => ({ ...current, page: Math.min(pages, current.page + 1) }))}><ChevronRight /></Button></footer></section>;

  return <section className="flex min-h-[calc(100vh-4rem)] flex-col bg-[#f4f7fb]" data-testid="commercial-crm-inbox"><header className="border-b border-slate-200 bg-white"><div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#0070a8]">Control Comercial</p><h1 className="text-xl font-black tracking-tight text-[#003366]">Inbox Comercial</h1><p className="text-xs text-slate-500">{role === "V" ? "Cola personal revalidada por servidor" : "Supervisión tenant-wide"} · CRM relacional</p></div><div className="flex gap-2">{mutationEnvironmentEnabled && mutationAccess.canCreate && <Button size="sm" onClick={() => setCreateOpen(true)}><Plus />Nuevo Caso</Button>}<Button size="sm" variant="outline" onClick={onBack}><ArrowLeft />Regresar al Hub</Button></div></div><SummaryStrip value={summary} role={role} /></header>{mutationEnvironmentEnabled && mutationAccess.canCreate && <CommercialCaseForm open={createOpen} mode="CREATE" api={mutationApi} onOpenChange={setCreateOpen} onCommitted={(receipt) => { setRefresh((value) => value + 1); onOpenCase(receipt.caseRef); }} />}{summaryError && <Alert variant="destructive" className="m-3"><AlertCircle /><AlertTitle>{summaryError.code}</AlertTitle><AlertDescription>{commercialReadErrorCopy(summaryError)}</AlertDescription></Alert>}<div className="min-h-0 flex-1 md:grid md:grid-cols-[390px_minmax(0,1fr)] xl:grid-cols-[430px_minmax(0,1fr)]"><div className={caseRef ? "hidden md:block" : "block"}>{queue}</div><main className={caseRef ? "block min-w-0 bg-white" : "hidden min-w-0 bg-white md:block"}>{caseRef ? <Suspense fallback={<div className="grid min-h-[50vh] place-items-center text-sm text-slate-500">Cargando Ficha del Caso…</div>}><CommercialCaseDetail state={detail} mutationEnvironmentEnabled={mutationEnvironmentEnabled} mutationAccess={mutationAccess} mutationApi={mutationApi} onBack={onReturnToInbox} onReload={() => setDetailRefresh((value) => value + 1)} /></Suspense> : <SupervisionPanel summary={summary} role={role} />}</main></div></section>;
}
