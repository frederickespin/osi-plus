import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BriefcaseBusiness,
  ChevronLeft,
  ChevronRight,
  MapPin,
  RefreshCw,
  Search,
  UserCheck,
  UserMinus,
  UserRoundPlus,
  UsersRound,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CrmPipelineApi, CrmPipelineError, type CrmCommandIntent } from "@/crm-relational/api";
import {
  PIPELINE_CASE_STATUSES,
  type CrmAllowedTransition,
  type CrmAllowedTransitions,
  type CrmPipelineCase,
  type CrmPipelineFilters,
  type CrmPipelineList,
  type CrmPipelineSummary,
  type CrmOwnerOption,
  type EvidenceType,
  type PipelineCaseStatus,
} from "@/crm-relational/types";
import type { UserRole } from "@/types/osi.types";

const PAGE_SIZE = 25;
const LOSS_REASONS = ["PRICE", "COMPETITOR", "NO_RESPONSE", "CLIENT_CANCELLED", "TIMING", "SERVICE_UNAVAILABLE", "DUPLICATE", "OTHER"] as const;
const REOPEN_REASONS = ["MANUAL_REVIEW", "CLIENT_REENGAGED", "DATA_CORRECTION", "OTHER"] as const;

const STATUS_LABELS: Record<PipelineCaseStatus, string> = {
  NEW_INBOX: "Nueva", AWAITING_ICP: "Esperando ICP", GOVERNANCE_CONFIRMED: "Gobernanza confirmada",
  REQUIREMENTS_CONFIRMED: "Requisitos confirmados", SURVEY_PLANNING: "Planificando levantamiento",
  SURVEY_SCHEDULED: "Levantamiento agendado", SURVEY_COMPLETED: "Levantamiento completo",
  CRATING_ESTIMATE_PENDING: "Estimación de embalaje", PRICING_IN_PROGRESS: "Precio en proceso",
  QUOTE_DRAFT: "Cotización borrador", INTERNAL_REVIEW: "Revisión interna", QUOTE_SENT: "Cotización enviada",
  NEGOTIATION: "Negociación", WON: "Ganada", LOST: "Perdida", CHANGE_CONTROL: "Control de cambios",
  APPROVED: "Aprobada (congelada)", OPS_HANDOFF: "Entregada a Operaciones",
};

type DetailState = Readonly<{
  data: CrmPipelineCase | null;
  allowed: CrmAllowedTransitions | null;
  loading: boolean;
  error: CrmPipelineError | null;
}>;

function asCrmError(error: unknown): CrmPipelineError {
  if (error instanceof CrmPipelineError) return error;
  if (error instanceof DOMException && error.name === "AbortError") return new CrmPipelineError(499, "CRM_PIPELINE_REQUEST_CANCELLED");
  return new CrmPipelineError(503, "CRM_PIPELINE_REQUEST_FAILED", { recoverable: true });
}

function errorMessage(error: CrmPipelineError): string {
  if (error.status === 401) return "La sesión ya no es válida.";
  if (error.status === 403) return "No tienes permiso para esta operación.";
  if (error.status === 404) return "La oportunidad ya no está disponible.";
  if (error.code === "CRM_PIPELINE_VERSION_CONFLICT") return "La oportunidad cambió. Se recargó su estado actual.";
  if (error.code === "CRM_PIPELINE_IDEMPOTENCY_CONFLICT") return "La intención ya fue usada con datos diferentes. Revisa el caso antes de iniciar otra acción.";
  if (error.code === "CRM_PIPELINE_COMMAND_IN_PROGRESS") return "Otra operación sigue en curso. Puedes reintentar esta misma intención.";
  if (error.code === "CRM_PIPELINE_OWNER_REF_EXPIRED") return "La selección expiró. Abre de nuevo el catálogo y confirma el vendedor otra vez.";
  if (error.status === 503) return "CRM temporalmente no disponible. Los datos visibles pueden estar desactualizados.";
  return "No fue posible completar la operación CRM.";
}

function Summary({ value }: { value: CrmPipelineSummary | null }) {
  const items = [
    { label: "Oportunidades", count: value?.total, icon: BriefcaseBusiness, tone: "border-sky-200 bg-sky-50/80 text-sky-800" },
    { label: "Asignadas", count: value?.assigned, icon: UserCheck, tone: "border-emerald-200 bg-emerald-50/80 text-emerald-800" },
    { label: "Sin asignar", count: value?.unassigned, icon: UsersRound, tone: "border-amber-200 bg-amber-50/80 text-amber-800" },
  ] as const;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Resumen del Pipeline">
      {items.map(({ label, count, icon: Icon, tone }) => (
        <Card key={label} className={tone}>
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div><p className="text-xs font-medium opacity-75">{label}</p><p className="text-2xl font-semibold tabular-nums">{count ?? "—"}</p></div>
            <span className="rounded-full bg-white/80 p-2 shadow-sm" aria-hidden="true"><Icon className="size-4" /></span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function statusClass(status: PipelineCaseStatus): string {
  if (status === "LOST") return "border-red-200 bg-red-50 text-red-700";
  if (status === "WON" || status === "APPROVED" || status === "OPS_HANDOFF") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "NEW_INBOX" || status === "AWAITING_ICP") return "border-sky-200 bg-sky-50 text-sky-700";
  if (status === "CHANGE_CONTROL" || status === "INTERNAL_REVIEW") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function modeClass(mode: CrmPipelineCase["mode"]): string {
  if (mode === "EXPORT") return "border-sky-200 bg-sky-50 text-sky-700";
  if (mode === "IMPORT") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Fecha no disponible" : date.toLocaleDateString("es-DO", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function PipelineList({ value, selectedId, onSelect }: { value: CrmPipelineList | null; selectedId: string | null; onSelect(id: string, trigger: HTMLButtonElement): void }) {
  if (!value || value.data.length === 0) return <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No hay oportunidades para estos filtros.</div>;
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" role="list" aria-label="Oportunidades CRM relacionales">
      <div className="hidden grid-cols-[minmax(8rem,1fr)_minmax(10rem,1.3fr)_minmax(13rem,1.5fr)_minmax(9rem,1fr)_minmax(10rem,1fr)_2.5rem] gap-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 via-sky-50/70 to-emerald-50/50 px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500 md:grid" aria-hidden="true">
        <span>Caso</span><span>Cliente</span><span>Ruta</span><span>Tipo</span><span>Estado y owner</span><span />
      </div>
      {value.data.map((item) => (
        <button key={item.id} type="button" role="listitem" onClick={(event) => onSelect(item.id, event.currentTarget)}
          className={`grid w-full grid-cols-1 gap-3 border-b border-slate-100 p-4 text-left transition-colors last:border-b-0 hover:bg-sky-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-600 md:grid-cols-[minmax(8rem,1fr)_minmax(10rem,1.3fr)_minmax(13rem,1.5fr)_minmax(9rem,1fr)_minmax(10rem,1fr)_2.5rem] md:items-center ${selectedId === item.id ? "bg-sky-50" : ""}`}>
          <span className="min-w-0"><strong className="block truncate font-mono text-sm text-slate-900">{item.caseCode}</strong><span className="mt-1 block text-xs text-slate-500">{formatDate(item.createdAt)}</span></span>
          <span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-900">{item.clientName || "Cliente no publicado"}</span><span className="mt-1 block text-xs text-slate-500">{item.quoteCount} cotizaciones · {item.eventCount} eventos</span></span>
          <span className="min-w-0"><span className="flex items-center gap-1 truncate text-sm text-slate-800"><MapPin className="size-3.5 shrink-0 text-slate-400" aria-hidden="true" />{item.originLocation || "Origen no publicado"}</span><span className="mt-1 flex items-center gap-1 truncate text-xs text-slate-500"><ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />{item.destinationLocation || "Destino no publicado"}</span></span>
          <span className="min-w-0"><Badge variant="outline" className={modeClass(item.mode)}>{item.mode}</Badge><span className="mt-1 block truncate text-xs text-slate-600">{item.serviceType}</span></span>
          <span className="min-w-0"><Badge variant="outline" className={statusClass(item.status)}>{STATUS_LABELS[item.status]}</Badge><span className="mt-1 block truncate text-xs text-slate-500">{item.owner?.displayName || "Sin asignar"}</span></span>
          <span className="hidden justify-self-end rounded-full border border-slate-200 bg-white p-1.5 text-slate-500 shadow-sm md:inline-flex" aria-hidden="true"><ChevronRight className="size-4" /></span>
          <span className="flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-500 md:hidden">
            <span>Owner: {item.owner?.displayName || "Sin asignar"}</span><span className="inline-flex items-center gap-1 font-medium text-sky-700">Ver detalle<ChevronRight className="size-3.5" /></span>
          </span>
        </button>
      ))}
    </div>
  );
}

function TransitionForm({ transition, disabled, onSubmit }: { transition: CrmAllowedTransition; disabled: boolean; onSubmit(reasonCode: string | null, evidence: { type: EvidenceType; id: string } | null): void }) {
  const [reason, setReason] = useState("");
  const [evidenceId, setEvidenceId] = useState("");
  const reasons = transition.toStatus === "LOST" ? LOSS_REASONS : transition.toStatus === "NEW_INBOX" ? REOPEN_REASONS : null;
  const valid = (!reasons || reasons.includes(reason as never)) && (!transition.evidenceType || evidenceId.trim().length > 0);
  return (
    <div className="rounded-md border p-3">
      <p className="text-sm font-medium">{STATUS_LABELS[transition.toStatus]}</p>
      {reasons && <label className="mt-2 block text-xs">Motivo
        <select className="mt-1 h-9 w-full rounded-md border px-2 text-sm" value={reason} onChange={(event) => setReason(event.target.value)}>
          <option value="">Selecciona un motivo</option>{reasons.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>}
      {transition.evidenceType && <label className="mt-2 block text-xs">Evidencia {transition.evidenceType}
        <Input className="mt-1" value={evidenceId} onChange={(event) => setEvidenceId(event.target.value)} aria-label={`Referencia de evidencia ${transition.evidenceType}`} />
      </label>}
      <AlertDialog>
        <AlertDialogTrigger asChild><Button className="mt-3" size="sm" disabled={disabled || !valid}>Revisar cambio</Button></AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Confirmar cambio de estado</AlertDialogTitle><AlertDialogDescription>Se enviará la transición a {STATUS_LABELS[transition.toStatus]}. El servidor volverá a validar permisos, versión y evidencia.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => onSubmit(reason || null, transition.evidenceType ? { type: transition.evidenceType, id: evidenceId.trim() } : null)}>Confirmar cambio</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function OwnerSelector({ api, currentOwnerName, disabled, onAssign }: {
  api: CrmPipelineApi;
  currentOwnerName: string | null;
  disabled: boolean;
  onAssign(option: CrmOwnerOption): void;
}) {
  const [authorized, setAuthorized] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<CrmPipelineError | null>(null);
  const [options, setOptions] = useState<readonly CrmOwnerOption[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [search, setSearch] = useState("");
  const catalogController = useRef<AbortController | null>(null);

  const load = useCallback(async (query = "", retain = true) => {
    catalogController.current?.abort();
    const controller = new AbortController();
    catalogController.current = controller;
    setLoading(true); setError(null);
    try {
      const result = await api.ownerOptions({ page: 1, pageSize: 100, search: query || undefined }, controller.signal);
      if (controller.signal.aborted) return;
      setAuthorized(true);
      setOptions(retain ? result.data : []);
      setSelectedKey("");
    } catch (cause) {
      if (controller.signal.aborted) return;
      const next = asCrmError(cause);
      if (next.status === 403 || next.status === 401) setAuthorized(false);
      else setError(next);
      setOptions([]);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load("", true);
    return () => { catalogController.current?.abort(); setOptions([]); };
  }, [load]);

  const close = () => {
    catalogController.current?.abort();
    setOpen(false); setOptions([]); setSelectedKey(""); setSearch(""); setError(null);
  };
  const selected = options.find((option) => option.presentationKey === selectedKey) ?? null;
  if (!authorized && loading) return <p className="text-sm text-slate-500">Verificando autorización de asignación…</p>;
  if (!authorized) return error ? <Alert variant="destructive"><AlertCircle /><AlertTitle>{error.code}</AlertTitle><AlertDescription>{errorMessage(error)}<Button className="mt-2" size="sm" variant="outline" onClick={() => void load("", true)}>Reintentar catálogo</Button></AlertDescription></Alert> : null;
  return <AlertDialog open={open} onOpenChange={(next) => { if (!next) close(); else { setOpen(true); if (options.length === 0) void load("", true); } }}>
    <AlertDialogTrigger asChild><Button variant="outline" disabled={disabled}><UserRoundPlus />{currentOwnerName ? "Reasignar owner" : "Asignar owner"}</Button></AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>{currentOwnerName ? "Confirmar reasignación" : "Asignar vendedor"}</AlertDialogTitle><AlertDialogDescription>Elige un vendedor autorizado. La referencia segura permanece sólo en memoria y el servidor revalida la identidad.</AlertDialogDescription></AlertDialogHeader>
      <label className="text-xs">Buscar por nombre<Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre del vendedor" /></label>
      <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => void load(search, true)}>Buscar</Button>
      {loading ? <p className="text-sm text-slate-500">Cargando vendedores…</p> : error ? <Alert variant="destructive"><AlertCircle /><AlertTitle>{error.code}</AlertTitle><AlertDescription>{errorMessage(error)}</AlertDescription></Alert> :
        <label className="text-xs">Vendedor<select aria-label="Vendedor elegible" className="mt-1 h-10 w-full rounded-md border px-2 text-sm" value={selectedKey} onChange={(event) => setSelectedKey(event.target.value)}>
          <option value="">Selecciona un vendedor</option>{options.map((option) => <option key={option.presentationKey} value={option.presentationKey}>{option.displayName} · {option.role}</option>)}
        </select>{options.length === 0 && <span className="mt-2 block text-slate-500">No hay vendedores elegibles.</span>}</label>}
      <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction disabled={!selected || loading} onClick={() => { if (selected) { onAssign(selected); close(); } }}>Confirmar</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}

function DetailDrawer({ api, role, state, open, busy, actionError, retryIntent, onOpenChange, onTransition, onAssign, onUnassign, onRetryIntent }: {
  api: CrmPipelineApi;
  role: UserRole; state: DetailState; open: boolean; busy: boolean; actionError: CrmPipelineError | null; retryIntent: CrmCommandIntent | null;
  onOpenChange(open: boolean): void; onTransition(transition: CrmAllowedTransition, reason: string | null, evidence: { type: EvidenceType; id: string } | null): void;
  onAssign(option: CrmOwnerOption): void;
  onUnassign(): void; onRetryIntent(): void;
}) {
  const item = state.data;
  const transitions = !item || ["APPROVED", "OPS_HANDOFF"].includes(item.status) || (role === "V" && item.status === "LOST")
    ? []
    : state.allowed?.transitions ?? [];
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto border-l-slate-200 bg-slate-50 sm:max-w-none md:w-[60vw]" aria-describedby="crm-detail-description">
        <SheetHeader className="border-b border-slate-200 bg-white pr-12">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Detalle de oportunidad</p>
          <SheetTitle className="line-clamp-2 break-all text-xl text-slate-950">{item?.caseCode || "Detalle CRM"}</SheetTitle>
          <SheetDescription id="crm-detail-description">Información relacional publicada por el servidor.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-8 md:px-6" aria-live="polite">
          {state.loading && <p>Actualizando detalle…</p>}
          {state.error && <Alert variant="destructive"><AlertCircle /><AlertTitle>Error</AlertTitle><AlertDescription>{errorMessage(state.error)}</AlertDescription></Alert>}
          {item && <>
            <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className={statusClass(item.status)}>{STATUS_LABELS[item.status]}</Badge><Badge variant="outline" className={modeClass(item.mode)}>{item.mode}</Badge><span className="ml-auto text-sm tabular-nums text-slate-500">Versión {state.allowed?.version ?? "—"}</span></div>
            <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-2">
              <div className="bg-white p-4"><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Cliente</dt><dd className="mt-1 text-sm text-slate-900">{item.clientName || "No publicado"}</dd></div>
              <div className="bg-white p-4"><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Owner</dt><dd className="mt-1 text-sm text-slate-900">{item.owner?.displayName || "Sin asignar"}</dd></div>
              <div className="bg-white p-4"><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Servicio</dt><dd className="mt-1 text-sm text-slate-900">{item.serviceType}</dd></div>
              <div className="bg-white p-4"><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Volumen estimado</dt><dd className="mt-1 text-sm text-slate-900">{item.estimatedCbm} m³</dd></div>
              <div className="bg-white p-4"><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Origen</dt><dd className="mt-1 text-sm text-slate-900">{item.originLocation}</dd></div>
              <div className="bg-white p-4"><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Destino</dt><dd className="mt-1 text-sm text-slate-900">{item.destinationLocation}</dd></div>
            </dl>
            {item.status === "APPROVED" && <Alert><AlertTitle>Oportunidad congelada</AlertTitle><AlertDescription>APPROVED no admite comandos en esta fase.</AlertDescription></Alert>}
            {item.status === "OPS_HANDOFF" && <Alert><AlertTitle>Estado terminal</AlertTitle><AlertDescription>La oportunidad ya fue entregada a Operaciones.</AlertDescription></Alert>}
            {actionError && <Alert variant="destructive"><AlertCircle /><AlertTitle>{actionError.code}</AlertTitle><AlertDescription>{errorMessage(actionError)}{retryIntent && <Button className="mt-2" size="sm" variant="outline" onClick={onRetryIntent}>Reintentar misma intención</Button>}</AlertDescription></Alert>}
            <section className="rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="crm-transitions-title"><h3 id="crm-transitions-title" className="mb-2 font-semibold text-slate-900">Transiciones autorizadas por el servidor</h3>
              {!state.allowed ? <p className="text-sm text-slate-500">No disponibles.</p> : transitions.length === 0 ? <p className="text-sm text-slate-500">No hay transiciones disponibles.</p> : <div className="space-y-2">{transitions.map((transition) => <TransitionForm key={transition.toStatus} transition={transition} disabled={busy} onSubmit={(reason, evidence) => onTransition(transition, reason, evidence)} />)}</div>}
            </section>
            {role === "A" && !["APPROVED", "OPS_HANDOFF"].includes(item.status) && <OwnerSelector api={api} currentOwnerName={item.owner?.displayName ?? null} disabled={busy || !state.allowed} onAssign={onAssign} />}
            {role === "A" && item.owner && !["APPROVED", "OPS_HANDOFF"].includes(item.status) && <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="outline" disabled={busy || !state.allowed}><UserMinus />Desasignar owner</Button></AlertDialogTrigger>
              <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirmar desasignación</AlertDialogTitle><AlertDialogDescription>La oportunidad quedará sin owner. El servidor volverá a validar permisos y versión.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={onUnassign}>Confirmar desasignación</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
            </AlertDialog>}
          </>}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function RelationalPipelineModule({ userRole, onUnauthorized }: { userRole: UserRole; onUnauthorized(): void }) {
  const api = useMemo(() => new CrmPipelineApi(), []);
  const [filters, setFilters] = useState<CrmPipelineFilters>({ page: 1, pageSize: PAGE_SIZE });
  const [list, setList] = useState<CrmPipelineList | null>(null);
  const [summary, setSummary] = useState<CrmPipelineSummary | null>(null);
  const [listError, setListError] = useState<CrmPipelineError | null>(null);
  const [summaryError, setSummaryError] = useState<CrmPipelineError | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailState>({ data: null, allowed: null, loading: false, error: null });
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<CrmPipelineError | null>(null);
  const [retryIntent, setRetryIntent] = useState<CrmCommandIntent | null>(null);
  const listSequence = useRef(0);
  const detailSequence = useRef(0);
  const commandInFlight = useRef(false);
  const activeIntent = useRef<CrmCommandIntent | null>(null);
  const detailTrigger = useRef<HTMLButtonElement | null>(null);

  const handleError = useCallback((error: unknown) => {
    const crmError = asCrmError(error);
    if (crmError.status === 401) onUnauthorized();
    return crmError;
  }, [onUnauthorized]);

  useEffect(() => {
    const sequence = ++listSequence.current;
    const controller = new AbortController();
    setListLoading(true); setListError(null);
    void api.list(filters, controller.signal)
      .then((nextList) => { if (sequence === listSequence.current) setList(nextList); })
      .catch((error: unknown) => { if (!controller.signal.aborted && sequence === listSequence.current) setListError(handleError(error)); })
      .finally(() => { if (sequence === listSequence.current) setListLoading(false); });
    return () => controller.abort();
  }, [api, filters, refreshVersion, handleError]);

  useEffect(() => {
    const controller = new AbortController();
    setSummaryError(null);
    void api.summary(controller.signal)
      .then(setSummary)
      .catch((error: unknown) => { if (!controller.signal.aborted) setSummaryError(handleError(error)); });
    return () => controller.abort();
  }, [api, refreshVersion, handleError]);

  const loadDetail = useCallback((caseId: string) => {
    const sequence = ++detailSequence.current;
    const controller = new AbortController();
    setDetail((current) => ({ ...current, loading: true, error: null }));
    void Promise.all([api.detail(caseId, controller.signal), api.allowedTransitions(caseId, controller.signal)])
      .then(([data, allowed]) => { if (sequence === detailSequence.current) setDetail({ data, allowed, loading: false, error: null }); })
      .catch((error: unknown) => {
        if (controller.signal.aborted || sequence !== detailSequence.current) return;
        const crmError = handleError(error);
        setDetail((current) => ({ ...current, loading: false, error: crmError }));
        if (crmError.status === 404) setSelectedId(null);
      });
    return () => controller.abort();
  }, [api, handleError]);

  useEffect(() => {
    if (!selectedId) { setDetail({ data: null, allowed: null, loading: false, error: null }); return; }
    return loadDetail(selectedId);
  }, [selectedId, loadDetail, refreshVersion]);

  const executeIntent = useCallback(async (intent: CrmCommandIntent, manual = false) => {
    if (commandInFlight.current) return;
    commandInFlight.current = true;
    activeIntent.current = intent;
    setBusy(true); setActionError(null);
    try {
      await (manual ? intent.retry() : intent.execute());
      setRetryIntent(null);
      setRefreshVersion((value) => value + 1);
    } catch (error) {
      const crmError = handleError(error);
      if (crmError.code === "CRM_PIPELINE_INTENT_CANCELLED" || crmError.code === "CRM_PIPELINE_REQUEST_CANCELLED") return;
      setActionError(crmError);
      if (crmError.code === "CRM_PIPELINE_COMMAND_IN_PROGRESS" || crmError.status === 503) setRetryIntent(intent);
      if (crmError.code === "CRM_PIPELINE_VERSION_CONFLICT" && selectedId) loadDetail(selectedId);
      if (crmError.code === "CRM_PIPELINE_IDEMPOTENCY_CONFLICT") setRetryIntent(null);
      if (crmError.status === 403 && selectedId) loadDetail(selectedId);
      if (crmError.status === 404) setSelectedId(null);
    } finally {
      if (activeIntent.current === intent) activeIntent.current = null;
      commandInFlight.current = false;
      setBusy(false);
    }
  }, [handleError, loadDetail, selectedId]);

  useEffect(() => () => {
    activeIntent.current?.cancel();
    activeIntent.current = null;
    commandInFlight.current = false;
  }, []);

  const transition = (target: CrmAllowedTransition, reasonCode: string | null, evidence: { type: EvidenceType; id: string } | null) => {
    if (!selectedId || !detail.allowed) return;
    const intent = api.transition({ caseId: selectedId, expectedVersion: detail.allowed.version, toStatus: target.toStatus, reasonCode, evidence });
    void executeIntent(intent);
  };
  const unassign = () => {
    if (!selectedId || !detail.allowed) return;
    const intent = api.unassignOwner({ caseId: selectedId, expectedVersion: detail.allowed.version });
    void executeIntent(intent);
  };
  const assign = (option: CrmOwnerOption) => {
    if (!selectedId || !detail.allowed) return;
    const intent = api.assignOwner({ caseId: selectedId, expectedVersion: detail.allowed.version, ownerRef: option.ownerRef });
    void executeIntent(intent);
  };

  const pages = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1;
  return (
    <div className="min-h-full bg-slate-50/80 p-3 sm:p-4 md:p-6" data-testid="crm-relational-root">
      <div className="mx-auto max-w-[1600px] space-y-4">
      <header className="overflow-hidden rounded-xl border border-sky-200 bg-gradient-to-br from-white via-sky-50/60 to-emerald-50/40 p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">CRM relacional</p><h1 className="mt-1 text-2xl font-semibold text-slate-950 md:text-3xl">Inbox Comercial</h1><p className="mt-1 max-w-2xl text-sm text-slate-600">Oportunidades publicadas por el servidor, con estado, owner y acciones autorizadas.</p></div>
          <div className="w-full xl:max-w-2xl"><Summary value={summary} /></div>
        </div>
      </header>
      <Card className="border-slate-200 shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base text-slate-900">Buscar y filtrar</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-[minmax(14rem,1.5fr)_minmax(12rem,1fr)_minmax(11rem,.8fr)]">
        <label className="text-xs font-medium text-slate-600">Buscar<span className="relative mt-1 block"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" /><Input className="pl-9" value={filters.search || ""} onChange={(event) => setFilters((current) => ({ ...current, page: 1, search: event.target.value || undefined }))} placeholder="Código, cliente o ubicación" /></span></label>
        <label className="text-xs font-medium text-slate-600">Estado<select className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900" value={filters.status || ""} onChange={(event) => setFilters((current) => ({ ...current, page: 1, status: (event.target.value || undefined) as PipelineCaseStatus | undefined }))}><option value="">Todos los estados</option>{PIPELINE_CASE_STATUSES.map((item) => <option key={item} value={item}>{STATUS_LABELS[item]}</option>)}</select></label>
        <label className="text-xs font-medium text-slate-600">Asignación<select aria-label="Owner" className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900" value={filters.owner || ""} onChange={(event) => setFilters((current) => ({ ...current, page: 1, owner: (event.target.value || undefined) as CrmPipelineFilters["owner"] }))}><option value="">Todas</option><option value="assigned">Asignadas</option><option value="unassigned">Sin asignar</option></select></label>
      </CardContent></Card>
      {listError && <Alert variant="destructive"><AlertCircle /><AlertTitle>{listError.code}</AlertTitle><AlertDescription>{errorMessage(listError)}<Button className="mt-2" size="sm" variant="outline" onClick={() => setRefreshVersion((value) => value + 1)}><RefreshCw />Reintentar lectura</Button></AlertDescription></Alert>}
      {summaryError && <Alert variant="destructive"><AlertCircle /><AlertTitle>{summaryError.code}</AlertTitle><AlertDescription>{errorMessage(summaryError)}<Button className="mt-2" size="sm" variant="outline" onClick={() => setRefreshVersion((value) => value + 1)}><RefreshCw />Reintentar resumen</Button></AlertDescription></Alert>}
      <div aria-live="polite">{listLoading && !list && <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">Cargando oportunidades…</div>}{listLoading && list && <p className="pb-2 text-sm text-slate-500">Actualizando oportunidades…</p>}{(list || !listError) && <PipelineList value={list} selectedId={selectedId} onSelect={(caseId, trigger) => { detailTrigger.current = trigger; setSelectedId(caseId); }} />}</div>
      <div className="flex flex-col items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row"><Button variant="outline" disabled={(list?.page ?? filters.page) <= 1 || listLoading} onClick={() => setFilters((current) => ({ ...current, page: Math.max(1, (list?.page ?? current.page) - 1) }))}><ChevronLeft />Anterior</Button><span className="text-center text-sm tabular-nums text-slate-600">Página {list?.page ?? filters.page} de {pages} · {list?.total ?? 0} resultados</span><Button variant="outline" disabled={(list?.page ?? filters.page) >= pages || listLoading} onClick={() => setFilters((current) => ({ ...current, page: Math.min(pages, (list?.page ?? current.page) + 1) }))}>Siguiente<ChevronRight /></Button></div>
      <DetailDrawer api={api} role={userRole} state={detail} open={selectedId !== null} busy={busy} actionError={actionError} retryIntent={retryIntent} onOpenChange={(open) => { if (!open) { activeIntent.current?.cancel(); activeIntent.current = null; retryIntent?.cancel(); setSelectedId(null); setRetryIntent(null); setActionError(null); globalThis.setTimeout(() => detailTrigger.current?.focus(), 0); } }} onTransition={transition} onAssign={assign} onUnassign={unassign} onRetryIntent={() => { if (retryIntent) void executeIntent(retryIntent, true); }} />
      </div>
    </div>
  );
}
