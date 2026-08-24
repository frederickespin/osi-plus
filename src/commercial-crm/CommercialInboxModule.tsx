import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, ChevronLeft, ChevronRight, Clock3, MapPin, Plus, Search, UserRound, UsersRound } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CrmPipelineReadApi, asCrmPipelineReadError, type CrmPipelineReadError } from "@/crm-relational/readApi";
import {
  PIPELINE_CASE_STATUSES,
  type CrmPipelineCase,
  type CrmPipelineCaseDetail,
  type CrmPipelineFilters,
  type CrmPipelineList,
  type CrmPipelineSummary,
  type PipelineCaseStatus,
  type PipelineMode,
} from "@/crm-relational/types";
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
  caseRef?: string | null;
  onBack(): void;
  onOpenCase(caseRef: string): void;
  onReturnToInbox(): void;
  onUnauthorized(): void;
  api?: CrmPipelineReadApi;
}>;

type DetailState = Readonly<{
  loading: boolean;
  value: CrmPipelineCaseDetail | null;
  error: CrmPipelineReadError | null;
}>;

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Fecha no disponible"
    : new Intl.DateTimeFormat("es-DO", { dateStyle: "medium" }).format(date);
}

function SummaryCards({ value }: { value: CrmPipelineSummary | null }) {
  const cards = [
    { label: "Oportunidades", value: value?.total ?? 0, icon: UsersRound },
    { label: "Asignadas", value: value?.assigned ?? 0, icon: UserRound },
    { label: "Sin asignar", value: value?.unassigned ?? 0, icon: AlertCircle },
    { label: "SLA vencido", value: value?.sla.basis === "UNAVAILABLE" ? "No disponible" : value?.sla.overdue ?? 0, icon: Clock3 },
  ];
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({ label, value: count, icon: Icon }) => (
    <Card key={label} className="overflow-hidden border-slate-200 bg-white shadow-sm"><CardContent className="flex items-center justify-between border-l-4 border-l-sky-500 p-4"><div><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p><p className={`mt-1 font-black text-slate-950 ${typeof count === "number" ? "text-2xl" : "text-sm"}`}>{count}</p></div><span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-50 text-[#006aa6]"><Icon className="h-5 w-5" /></span></CardContent></Card>
  ))}</div>;
}

function EmptyState() {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center" data-testid="commercial-crm-empty"><h2 className="text-lg font-bold text-slate-900">Inbox Comercial vacío</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">Aún no hay oportunidades reales registradas para este tenant. Esta vista no genera casos ni muestra datos de demostración.</p></div>;
}

function CaseRow({ item, onOpen }: { item: CrmPipelineCase; onOpen(caseRef: string): void }) {
  return <tr className="border-b border-slate-100 align-top hover:bg-sky-50/40">
    <td className="px-4 py-3"><p className="font-mono text-sm font-black text-[#003366]">{item.caseCode}</p><p className="mt-1 text-[11px] text-slate-500">Actualizado {formatDate(item.updatedAt)}</p></td>
    <td className="px-4 py-3"><p className="max-w-48 truncate text-sm font-semibold text-slate-900">{item.client?.displayName || "Sin Client vinculado"}</p><p className="mt-1 text-[11px] text-slate-500">{item.client ? `${item.client.type || "Tipo no registrado"} · ${item.client.status}` : "Sin inferencia legacy"}</p></td>
    <td className="px-4 py-3"><p className="flex max-w-52 items-center gap-1.5 truncate text-sm text-slate-900"><MapPin className="h-3.5 w-3.5 shrink-0 text-sky-600" />{item.originLocation || "Origen no registrado"}</p><p className="ml-5 max-w-48 truncate text-xs text-slate-500">→ {item.destinationLocation || "Destino no registrado"}</p></td>
    <td className="px-4 py-3"><Badge variant="outline">{item.mode}</Badge><p className="mt-1 text-xs text-slate-600">{item.serviceType}</p></td>
    <td className="px-4 py-3"><Badge data-status={item.status} variant="outline" className={statusClass(item.status)}>{STATUS_LABELS[item.status]}</Badge></td>
    <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">No disponible</span><p className="mt-1 text-[10px] text-slate-400">Sin autoridad SLA</p></td>
    <td className="px-4 py-3 text-right"><Button size="sm" className="bg-[#006aa6] hover:bg-[#005482]" onClick={() => onOpen(item.caseRef)}>Abrir ficha</Button></td>
  </tr>;
}

function MobileCase({ item, onOpen }: { item: CrmPipelineCase; onOpen(caseRef: string): void }) {
  return <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="border-l-4 border-l-sky-500 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-sm font-black text-[#003366]">{item.caseCode}</p><p className="mt-1 max-w-56 truncate text-sm font-semibold text-slate-900">{item.client?.displayName || "Sin Client vinculado"}</p><p className="text-[11px] text-slate-500">{formatDate(item.updatedAt)}</p></div><Badge variant="outline">{item.mode}</Badge></div><p className="mt-3 text-sm text-slate-700">{item.originLocation || "Origen no registrado"} → {item.destinationLocation || "Destino no registrado"}</p><div className="mt-3 flex flex-wrap gap-2"><Badge data-status={item.status} variant="outline" className={statusClass(item.status)}>{STATUS_LABELS[item.status]}</Badge><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">SLA no disponible</span></div><div className="mt-4 flex items-center justify-between"><span className="text-xs text-slate-600">{item.owner?.displayName || "Sin asignar"}</span><Button size="sm" className="bg-[#006aa6] hover:bg-[#005482]" onClick={() => onOpen(item.caseRef)}>Abrir ficha</Button></div></div></article>;
}

export default function CommercialInboxModule({ authorization, mutationAccess, caseRef, onBack, onOpenCase, onReturnToInbox, onUnauthorized, api: suppliedApi }: Props) {
  const api = useMemo(
    () => suppliedApi ?? new CrmPipelineReadApi({ tokenProvider: () => authorization ?? null }),
    [authorization, suppliedApi],
  );
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

  const captureError = useCallback((cause: unknown) => {
    const error = asCrmPipelineReadError(cause);
    if (error.status === 401) onUnauthorized();
    return error;
  }, [onUnauthorized]);

  useEffect(() => {
    if (caseRef) return undefined;
    const timer = globalThis.setTimeout(() => setFilters((current) => {
      const search = searchInput.trim() || undefined;
      return current.search === search ? current : { ...current, page: 1, search };
    }), 300);
    return () => globalThis.clearTimeout(timer);
  }, [caseRef, searchInput]);

  useEffect(() => {
    if (caseRef) return undefined;
    const fence = ++listFence.current;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setLoading(true);
      setListError(null);
      void api.list(filters, controller.signal)
        .then((value) => { if (fence === listFence.current) setList(value); })
        .catch((cause) => { if (!controller.signal.aborted && fence === listFence.current) setListError(captureError(cause)); })
        .finally(() => { if (fence === listFence.current) setLoading(false); });
    });
    return () => controller.abort(new DOMException("Inbox list unmounted", "AbortError"));
  }, [api, captureError, caseRef, filters, refresh]);

  useEffect(() => {
    if (caseRef) return undefined;
    const fence = ++summaryFence.current;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setSummaryError(null);
      void api.summary(controller.signal)
        .then((value) => { if (fence === summaryFence.current) setSummary(value); })
        .catch((cause) => { if (!controller.signal.aborted && fence === summaryFence.current) setSummaryError(captureError(cause)); });
    });
    return () => controller.abort(new DOMException("Inbox summary unmounted", "AbortError"));
  }, [api, captureError, caseRef, refresh]);

  useEffect(() => {
    if (!caseRef) return undefined;
    const fence = ++detailFence.current;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setDetail({ loading: true, value: null, error: null });
      void api.detail(caseRef, controller.signal)
        .then((value) => { if (fence === detailFence.current) setDetail({ loading: false, value, error: null }); })
        .catch((cause) => { if (!controller.signal.aborted && fence === detailFence.current) setDetail({ loading: false, value: null, error: captureError(cause) }); });
    });
    return () => controller.abort(new DOMException("Case detail unmounted", "AbortError"));
  }, [api, captureError, caseRef, detailRefresh]);

  if (caseRef) {
    return <Suspense fallback={<div className="grid min-h-[50vh] place-items-center text-sm text-slate-500">Cargando Ficha del Caso…</div>}><CommercialCaseDetail state={detail} mutationEnvironmentEnabled={mutationEnvironmentEnabled} mutationAccess={mutationAccess} mutationApi={mutationApi} onBack={onReturnToInbox} onReload={() => setDetailRefresh((value) => value + 1)} /></Suspense>;
  }

  const pages = Math.max(1, Math.ceil((list?.total ?? 0) / (list?.pageSize ?? PAGE_SIZE)));
  return <section className="mx-auto max-w-[1580px] space-y-5 px-4 py-5 sm:px-6 lg:px-8" data-testid="commercial-crm-inbox">
    <header className="overflow-hidden rounded-xl border border-sky-200 bg-white shadow-sm"><div className="h-1 bg-gradient-to-r from-[#003366] via-[#0079b8] to-amber-400" /><div className="flex flex-wrap items-start justify-between gap-4 p-5"><div><p className="text-[11px] font-bold uppercase tracking-[.2em] text-[#0070a8]">Gestión Comercial</p><h1 className="mt-1 text-2xl font-black tracking-tight text-[#003366]">Inbox Comercial</h1><p className="mt-1 text-sm text-slate-600">Pipeline relacional del tenant autenticado{mutationEnvironmentEnabled && mutationAccess.canCreate ? " · altas locales gobernadas" : " · lectura segura"}</p></div><div className="flex gap-2">{mutationEnvironmentEnabled && mutationAccess.canCreate && <Button onClick={() => setCreateOpen(true)}><Plus />Nuevo Caso</Button>}<Button variant="outline" onClick={onBack}><ArrowLeft />Regresar al Hub</Button></div></div></header>
    {mutationEnvironmentEnabled && mutationAccess.canCreate && <CommercialCaseForm open={createOpen} mode="CREATE" api={mutationApi} onOpenChange={setCreateOpen} onCommitted={(receipt) => { setRefresh((value) => value + 1); onOpenCase(receipt.caseRef); }} />}
    <SummaryCards value={summary} />
    <Card className="border-slate-200 shadow-sm"><CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(220px,1fr)_180px_200px]"><label className="text-xs font-semibold text-slate-600">Buscar<span className="relative mt-1 block"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input className="pl-9" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Caso, cliente o ruta" /></span></label><label className="text-xs font-semibold text-slate-600">Estado<select aria-label="Estado" className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" value={filters.status || ""} onChange={(event) => setFilters((current) => ({ ...current, page: 1, status: (event.target.value || undefined) as PipelineCaseStatus | undefined }))}><option value="">Todos</option>{PIPELINE_CASE_STATUSES.map((value) => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}</select></label><label className="text-xs font-semibold text-slate-600">Asignación<select aria-label="Asignación" className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" value={filters.owner || ""} onChange={(event) => setFilters((current) => ({ ...current, page: 1, owner: (event.target.value || undefined) as CrmPipelineFilters["owner"] }))}><option value="">Todas</option><option value="assigned">Asignadas</option><option value="unassigned">Sin asignar</option></select></label><div className="flex flex-wrap gap-2 md:col-span-3"><Button size="sm" variant={!filters.mode ? "default" : "outline"} onClick={() => setFilters((current) => ({ ...current, page: 1, mode: undefined }))}>Todos los modos</Button>{MODES.map((mode) => <Button key={mode} size="sm" variant={filters.mode === mode ? "default" : "outline"} onClick={() => setFilters((current) => ({ ...current, page: 1, mode }))}>{mode}</Button>)}</div></CardContent></Card>
    {listError && <Alert variant="destructive"><AlertCircle /><AlertTitle>{listError.code}</AlertTitle><AlertDescription>{commercialReadErrorCopy(listError)}<Button size="sm" variant="outline" className="mt-3" onClick={() => setRefresh((value) => value + 1)}>Reintentar lectura</Button></AlertDescription></Alert>}
    {summaryError && <Alert variant="destructive"><AlertCircle /><AlertTitle>{summaryError.code}</AlertTitle><AlertDescription>{commercialReadErrorCopy(summaryError)}</AlertDescription></Alert>}
    {loading && !list && <div className="rounded-2xl border bg-white p-10 text-center text-sm text-slate-500">Cargando Inbox Comercial…</div>}
    {!loading && list?.data.length === 0 && <EmptyState />}
    {list && list.data.length > 0 && <><div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:block"><div className="overflow-x-auto"><table className="w-full min-w-[1060px] border-collapse"><thead className="bg-[#eef5fa]"><tr className="border-b border-sky-100 text-left text-[10px] font-bold uppercase tracking-[.14em] text-[#31566d]"><th className="px-4 py-3">Caso</th><th className="px-4 py-3">Cliente receptor</th><th className="px-4 py-3">Ruta</th><th className="px-4 py-3">Tipo / modo</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">SLA</th><th className="px-4 py-3 text-right">Acción</th></tr></thead><tbody>{list.data.map((item) => <CaseRow key={item.caseRef} item={item} onOpen={onOpenCase} />)}</tbody></table></div></div><div className="grid gap-3 md:hidden">{list.data.map((item) => <MobileCase key={item.caseRef} item={item} onOpen={onOpenCase} />)}</div></>}
    <footer className="flex flex-wrap items-center justify-between gap-3"><Button variant="outline" disabled={loading || (list?.page ?? filters.page) <= 1} onClick={() => setFilters((current) => ({ ...current, page: Math.max(1, current.page - 1) }))}><ChevronLeft />Anterior</Button><p className="text-sm text-slate-600">Página {list?.page ?? filters.page} de {pages} · {list?.total ?? 0} resultados</p><Button variant="outline" disabled={loading || (list?.page ?? filters.page) >= pages} onClick={() => setFilters((current) => ({ ...current, page: Math.min(pages, current.page + 1) }))}>Siguiente<ChevronRight /></Button></footer>
  </section>;
}
