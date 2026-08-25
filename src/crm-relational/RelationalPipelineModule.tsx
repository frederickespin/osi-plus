import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ChevronLeft, ChevronRight, RefreshCw, UserMinus, UserRoundPlus } from "lucide-react";
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
  type CrmPipelineCaseDetail,
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
  data: CrmPipelineCaseDetail | null;
  allowed: CrmAllowedTransitions | null;
  loading: boolean;
  error: CrmPipelineError | null;
}>;

function asCrmError(error: unknown): CrmPipelineError {
  if (error instanceof CrmPipelineError) return error;
  if (error instanceof DOMException && error.name === "AbortError") return new CrmPipelineError(499, "CRM_PIPELINE_REQUEST_CANCELLED");
  return new CrmPipelineError(503, "CRM_PIPELINE_REQUEST_FAILED", { recoverable: true });
}

function isResponseContractError(error: CrmPipelineError): boolean {
  return error.code.startsWith("CRM_PIPELINE_RESPONSE_");
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
  return (
    <div className="grid grid-cols-3 gap-3" aria-label="Resumen del Pipeline">
      {[["Total", value?.total], ["Asignadas", value?.assigned], ["Sin asignar", value?.unassigned]].map(([label, count]) => (
        <Card key={String(label)}><CardContent className="p-4"><p className="text-xs text-slate-500">{label}</p><p className="text-2xl font-semibold">{count ?? "—"}</p></CardContent></Card>
      ))}
    </div>
  );
}

function statusTone(status: PipelineCaseStatus): "default" | "secondary" | "outline" | "destructive" {
  if (status === "LOST") return "destructive";
  if (status === "APPROVED" || status === "OPS_HANDOFF" || status === "WON") return "default";
  return "secondary";
}

function PipelineList({ value, selectedId, onSelect }: { value: CrmPipelineList | null; selectedId: string | null; onSelect(id: string, trigger: HTMLButtonElement): void }) {
  if (!value || value.data.length === 0) return <div className="rounded-lg border border-dashed p-10 text-center text-slate-500">No hay oportunidades para estos filtros.</div>;
  return (
    <div className="overflow-hidden rounded-lg border bg-white" role="list" aria-label="Oportunidades CRM relacionales">
      {value.data.map((item) => (
        <button key={item.caseRef} type="button" role="listitem" onClick={(event) => onSelect(item.caseRef, event.currentTarget)}
          className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 border-b p-4 text-left last:border-b-0 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 ${selectedId === item.caseRef ? "bg-blue-50" : ""}`}>
          <span className="min-w-0">
            <span className="flex min-w-0 flex-wrap items-center gap-2"><strong className="max-w-full truncate">{item.caseCode}</strong><Badge variant={statusTone(item.status)}>{STATUS_LABELS[item.status]}</Badge></span>
            <span className="mt-1 block truncate text-sm text-slate-700">{item.client?.displayName || "Sin Client vinculado"}</span>
            <span className="mt-1 block truncate text-xs text-slate-500">{item.serviceType} · {item.originLocation} → {item.destinationLocation}</span>
          </span>
          <span className="max-w-40 self-center truncate text-right text-xs text-slate-500">{item.owner?.displayName || "Sin asignar"}<br />{item.quoteCount} cotizaciones</span>
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

function DetailDrawer({ api, role, state, open, busy, actionError, retryIntent, onOpenChange, onReload, onTransition, onAssign, onUnassign, onRetryIntent }: {
  api: CrmPipelineApi;
  role: UserRole; state: DetailState; open: boolean; busy: boolean; actionError: CrmPipelineError | null; retryIntent: CrmCommandIntent | null;
  onOpenChange(open: boolean): void; onReload(): void; onTransition(transition: CrmAllowedTransition, reason: string | null, evidence: { type: EvidenceType; id: string } | null): void;
  onAssign(option: CrmOwnerOption): void;
  onUnassign(): void; onRetryIntent(): void;
}) {
  const item = state.data;
  const transitions = !item || ["APPROVED", "OPS_HANDOFF"].includes(item.status) || (role === "V" && item.status === "LOST")
    ? []
    : state.allowed?.transitions ?? [];
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-none md:w-[60vw]" aria-describedby="crm-detail-description">
        <SheetHeader><SheetTitle className="line-clamp-2 break-all">{item?.caseCode || "Detalle CRM"}</SheetTitle><SheetDescription id="crm-detail-description">Vista relacional; no usa ni modifica LeadLite.</SheetDescription></SheetHeader>
        <div className="space-y-4 px-4 pb-8" aria-live="polite">
          {state.loading && <p>Actualizando detalle…</p>}
          {state.error && <Alert variant="destructive"><AlertCircle /><AlertTitle>{state.error.code}</AlertTitle><AlertDescription>{errorMessage(state.error)}<Button className="mt-2" size="sm" variant="outline" onClick={onReload}><RefreshCw />Reintentar detalle</Button></AlertDescription></Alert>}
          {item && <>
            <div className="flex flex-wrap items-center gap-2"><Badge variant={statusTone(item.status)}>{STATUS_LABELS[item.status]}</Badge><span className="text-sm text-slate-500">Versión {state.allowed?.version ?? "—"}</span></div>
            <dl className="grid grid-cols-1 gap-3 rounded-lg border p-4 sm:grid-cols-2">
              <div><dt className="text-xs text-slate-500">Cliente</dt><dd>{item.client?.displayName || "Sin Client vinculado"}</dd></div>
              <div><dt className="text-xs text-slate-500">Owner</dt><dd>{item.owner?.displayName || "Sin asignar"}</dd></div>
              <div><dt className="text-xs text-slate-500">Servicio</dt><dd>{item.serviceType}</dd></div>
              <div><dt className="text-xs text-slate-500">Modo</dt><dd>{item.mode}</dd></div>
              <div><dt className="text-xs text-slate-500">Origen</dt><dd>{item.originLocation}</dd></div>
              <div><dt className="text-xs text-slate-500">Destino</dt><dd>{item.destinationLocation}</dd></div>
            </dl>
            {item.status === "APPROVED" && <Alert><AlertTitle>Oportunidad congelada</AlertTitle><AlertDescription>APPROVED no admite comandos en esta fase.</AlertDescription></Alert>}
            {item.status === "OPS_HANDOFF" && <Alert><AlertTitle>Estado terminal</AlertTitle><AlertDescription>La oportunidad ya fue entregada a Operaciones.</AlertDescription></Alert>}
            {actionError && <Alert variant="destructive"><AlertCircle /><AlertTitle>{actionError.code}</AlertTitle><AlertDescription>{errorMessage(actionError)}{retryIntent && <Button className="mt-2" size="sm" variant="outline" onClick={onRetryIntent}>Reintentar misma intención</Button>}</AlertDescription></Alert>}
            <section aria-labelledby="crm-transitions-title"><h3 id="crm-transitions-title" className="mb-2 font-semibold">Transiciones autorizadas por el servidor</h3>
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
  const summarySequence = useRef(0);
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
      .catch((error: unknown) => {
        if (controller.signal.aborted || sequence !== listSequence.current) return;
        const next = handleError(error);
        if (isResponseContractError(next)) setList(null);
        setListError(next);
      })
      .finally(() => { if (sequence === listSequence.current) setListLoading(false); });
    return () => controller.abort();
  }, [api, filters, refreshVersion, handleError]);

  useEffect(() => {
    const sequence = ++summarySequence.current;
    const controller = new AbortController();
    setSummaryError(null);
    void api.summary(controller.signal)
      .then((nextSummary) => { if (sequence === summarySequence.current) setSummary(nextSummary); })
      .catch((error: unknown) => {
        if (controller.signal.aborted || sequence !== summarySequence.current) return;
        const next = handleError(error);
        if (isResponseContractError(next)) setSummary(null);
        setSummaryError(next);
      });
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
        setDetail((current) => isResponseContractError(crmError)
          ? { data: null, allowed: null, loading: false, error: crmError }
          : { ...current, loading: false, error: crmError });
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
    <div className="space-y-5 p-4 md:p-6" data-testid="crm-relational-root">
      <header><p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Vista relacional local</p><h1 className="text-2xl font-bold">Pipeline CRM</h1><p className="text-sm text-slate-500">Separado del prototipo LeadLite; el servidor conserva la autoridad.</p></header>
      <Summary value={summary} />
      <Card><CardHeader><CardTitle className="text-base">Filtros</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-3">
        <label className="text-xs">Buscar<Input value={filters.search || ""} onChange={(event) => setFilters((current) => ({ ...current, page: 1, search: event.target.value || undefined }))} placeholder="Código, cliente o ubicación" /></label>
        <label className="text-xs">Estado<select className="mt-1 h-9 w-full rounded-md border px-2 text-sm" value={filters.status || ""} onChange={(event) => setFilters((current) => ({ ...current, page: 1, status: (event.target.value || undefined) as PipelineCaseStatus | undefined }))}><option value="">Todos</option>{PIPELINE_CASE_STATUSES.map((item) => <option key={item} value={item}>{STATUS_LABELS[item]}</option>)}</select></label>
        <label className="text-xs">Owner<select className="mt-1 h-9 w-full rounded-md border px-2 text-sm" value={filters.owner || ""} onChange={(event) => setFilters((current) => ({ ...current, page: 1, owner: (event.target.value || undefined) as CrmPipelineFilters["owner"] }))}><option value="">Todos</option><option value="assigned">Con owner</option><option value="unassigned">Sin asignar</option></select></label>
      </CardContent></Card>
      {listError && <Alert variant="destructive"><AlertCircle /><AlertTitle>{listError.code}</AlertTitle><AlertDescription>{errorMessage(listError)}<Button className="mt-2" size="sm" variant="outline" onClick={() => setRefreshVersion((value) => value + 1)}><RefreshCw />Reintentar lectura</Button></AlertDescription></Alert>}
      {summaryError && <Alert variant="destructive"><AlertCircle /><AlertTitle>{summaryError.code}</AlertTitle><AlertDescription>{errorMessage(summaryError)}<Button className="mt-2" size="sm" variant="outline" onClick={() => setRefreshVersion((value) => value + 1)}><RefreshCw />Reintentar resumen</Button></AlertDescription></Alert>}
      <div aria-live="polite">{listLoading && <p className="py-2 text-sm text-slate-500">Cargando oportunidades…</p>}{!listError && <PipelineList value={list} selectedId={selectedId} onSelect={(caseId, trigger) => { detailTrigger.current = trigger; setSelectedId(caseId); }} />}</div>
      <div className="flex items-center justify-between"><Button variant="outline" disabled={(list?.page ?? filters.page) <= 1 || listLoading} onClick={() => setFilters((current) => ({ ...current, page: Math.max(1, (list?.page ?? current.page) - 1) }))}><ChevronLeft />Anterior</Button><span className="text-sm">Página {list?.page ?? filters.page} de {pages} · {list?.total ?? 0} resultados</span><Button variant="outline" disabled={(list?.page ?? filters.page) >= pages || listLoading} onClick={() => setFilters((current) => ({ ...current, page: Math.min(pages, (list?.page ?? current.page) + 1) }))}>Siguiente<ChevronRight /></Button></div>
      <DetailDrawer api={api} role={userRole} state={detail} open={selectedId !== null} busy={busy} actionError={actionError} retryIntent={retryIntent} onOpenChange={(open) => { if (!open) { activeIntent.current?.cancel(); activeIntent.current = null; retryIntent?.cancel(); setSelectedId(null); setRetryIntent(null); setActionError(null); globalThis.setTimeout(() => detailTrigger.current?.focus(), 0); } }} onReload={() => { if (selectedId) loadDetail(selectedId); }} onTransition={transition} onAssign={assign} onUnassign={unassign} onRetryIntent={() => { if (retryIntent) void executeIntent(retryIntent, true); }} />
    </div>
  );
}
