import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowDown, ArrowUp, Check, ChevronDown, Pencil, Plus, RefreshCw, Send, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NumericInput } from "@/components/ui/numeric-input";
import { COMPACT_FORM_FIELD } from "@/components/ui/compact-form";
import type { QuoteUiAccess } from "./access";
import { quoteApi, type QuoteCase, type QuoteProposal } from "./api";
import { costingApi, type CostingPackageEstimate, type CostingPackageOption, type CostingPackageOptions, type CostingRevision } from "@/costing/api";
import type { CommunicationsAccess } from "@/communications/access";
import type { CaseCommercialIntake } from "@/commercial-crm/caseCommercialIntake";
import { pricingDecimal, pricingQuantity } from "@/costing/pricingInput";
import { minimumForPackage } from "../../shared/servicePackagePricing.js";
import ProposalComposer from "./ProposalComposer";

type Props = Readonly<{
  caseRef: string; authorization?: string; access: QuoteUiAccess; defaultPayer?: string; canPreparePackage?: boolean;
  canViewCosting?: boolean; canAuthorizeMargin?: boolean; suggestedGroupName?: string;
  intake?: CaseCommercialIntake;
  communicationsEnabled?: boolean; communicationsAccess?: CommunicationsAccess;
  onOpenCommunications?(quoteRevisionRef: string): void; onOpenTransport?(): void; onUnauthorized(): void;
}>;

const SERVICE_DATE = new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeZone: "UTC" });
const EDITABLE_STATES = new Set(["DRAFT", "READY", "SENT"]);
const COMPACT_FIELD = COMPACT_FORM_FIELD + " w-full bg-white";
const DEFAULT_QUOTE_CURRENCY = "DOP";

type Editor = Readonly<{ position: number; currency: string; basis: CostingRevision | null; proposal?: QuoteProposal }>;
type CombinationInput = Readonly<{ option: CostingPackageOption; volume: string; gross: string }>;

function combinationEstimate(input: CombinationInput): CostingPackageEstimate | null {
  const volumeM3 = pricingDecimal(input.volume, 4);
  const grossKg = pricingDecimal(input.gross, 4);
  const tier = volumeM3 && minimumForPackage(input.option, Number(volumeM3));
  if (!volumeM3 || Number(volumeM3) <= 0 || Number(volumeM3) > 100_000 || !tier) return null;
  if ((input.option.needsWeight || input.gross.trim()) && (!grossKg || Number(grossKg) <= 0 || Number(grossKg) > 1_000_000)) return null;
  return { versionRef: input.option.versionRef, volumeM3, grossKg };
}

function money(value: number | string | null | undefined, currency: string) {
  if (value == null) return "Pendiente";
  return new Intl.NumberFormat("es-DO", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value));
}

function quoteError(value: string) {
  return ({
    QUOTE_COSTING_REVISION_REQUIRED: "Se requiere un Costing publicado antes de crear una propuesta.",
    QUOTE_COSTING_CONTEXT_INVALID: "Seleccione los costos publicados para esta cotización. Los cálculos de servicio y de visita se gestionan en su propio contexto.",
    QUOTE_COSTING_INPUT_STALE: "Hay una revisión de costos más reciente para esta cotización. Actualice la propuesta antes de publicarla.",
    QUOTE_PACKAGE_LINES_REQUIRED: "La propuesta requiere todos los conceptos publicados del paquete.",
    QUOTE_PACKAGE_CURRENCY_INVALID: "Use la moneda de la tarifa publicada del paquete.",
    QUOTE_PACKAGE_EDIT_NOT_ALLOWED: "La tarifa del paquete bloquea los ajustes de sus renglones.",
    QUOTE_PACKAGE_ADJUSTMENT_REASON_REQUIRED: "Escribe el motivo del ajuste de los renglones del paquete.",
    QUOTE_CATALOG_PRICE_STALE: "Cambió la tarifa de un concepto. Quítalo y vuelve a seleccionarlo en el catálogo.",
    QUOTE_CATALOG_LINES_REQUIRED: "Agrega un concepto con tarifa para guardar la propuesta.",
    QUOTE_CATALOG_AUTHORITY_INVALID: "Revisa el precio y la procedencia de los renglones de la propuesta.",
    QUOTE_VERSION_CONFLICT: "La propuesta cambió en otra sesión. Actualízala para continuar.",
    QUOTE_MARGIN_APPROVAL_REQUIRED: "Se requiere una autorización sobre este descuento antes de publicar.",
    COSTING_PACKAGE_NOT_AVAILABLE: "La tarifa del paquete dejó de estar disponible para el caso. Actualiza la cotización.",
    COSTING_PACKAGE_VOLUME_UNSUPPORTED: "El volumen queda fuera de los tramos del paquete.",
    COSTING_INPUT_STALE: "Los datos del caso o la tarifa cambiaron. Aplica el paquete de nuevo.",
    COSTING_PACKAGE_PLAN_STALE: "Actualiza la ruta del caso antes de calcular el paquete.",
    COSTING_PACKAGE_TRANSPORT_REQUIRED: "Este paquete requiere calcular el transporte de la ruta del caso.",
    QUOTE_FORBIDDEN: "Su usuario no tiene permiso para confirmar esta operación.",
    QUOTE_DESTINATION_PENDING: "El destino debe confirmarse antes de aprobar la Cotización.",
    QUOTE_BLOCKERS_PRESENT: "La Cotización tiene pendientes. Resuélvalos en el dominio indicado antes de continuar.",
    QUOTE_REQUEST_FAILED: "No fue posible consultar la Cotización. Intente nuevamente.",
  } as Record<string, string>)[value] || "No fue posible completar la acción de Cotización. Revise los pendientes publicados e intente nuevamente.";
}

function ProposalHeader({ proposal, active, onClick }: { proposal: QuoteProposal; active: boolean; onClick(): void }) {
  return <button type="button" onClick={onClick} aria-pressed={active} aria-label={`Propuesta ${proposal.position} ${proposal.reference}`}
    className={`rounded px-3 py-1.5 text-left text-xs font-semibold ${active ? "bg-sky-50 text-[#003366]" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
    {proposal.reference} <span className="ml-1 font-normal">{money(proposal.totals.totalQuotedPrice, proposal.currency)}</span>
  </button>;
}

function QuoteLines({ proposal, internal }: { proposal: QuoteProposal; internal: boolean }) {
  return <div className="overflow-x-auto">
    <table className="w-full min-w-[760px] text-left text-xs">
      <thead className="bg-slate-100 text-[10px] uppercase tracking-wide text-slate-600">
        <tr><th className="p-2">Concepto</th><th>Tipo</th><th>Cant.</th><th>Unidad</th>
          {internal && <th>Costo</th>}{internal && <th>Sugerido</th>}<th>Cotizado</th><th>Estado</th></tr>
      </thead>
      <tbody className="divide-y divide-slate-100">{proposal.lines.map((line) => {
        const canCompare = internal && line.quotedPrice != null && line.suggestedPrice != null;
        const difference = canCompare ? Number(line.quotedPrice) - Number(line.suggestedPrice) : 0;
        const source = line.packageMinimum ? "Ajuste del paquete" : line.catalog ? "Catálogo"
          : line.sourceKind === "MANUAL" ? "Cargo particular" : proposal.packageScope ? "Combinación" : "Costo publicado";
        return <tr key={line.lineRef}>
          <td className="p-2 font-semibold text-slate-900">{line.concept}<span className="block text-[10px] text-slate-500">{source}</span></td>
          <td><Badge variant="outline">{line.economicClass}</Badge></td>
          <td>{line.quantity}</td><td>{line.unit}</td>
          {internal && <td>{money(line.capturedCost, line.currency)}</td>}
          {internal && <td>{money(line.suggestedPrice, line.currency)}</td>}
          <td className="font-bold">{money(line.quotedPrice, line.currency)}
            {difference < 0 && <span className="mt-1 flex items-center gap-1 text-[10px] text-red-700"><ArrowDown className="h-3 w-3" />Debajo del sugerido</span>}
            {difference > 0 && <span className="mt-1 flex items-center gap-1 text-[10px] text-blue-700"><ArrowUp className="h-3 w-3" />Sobre el sugerido</span>}
          </td>
          <td>{line.priceStatus === "CONFIRMED" ? "Confirmado" : "Pendiente"}</td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}

function BillingSummary({ proposal, internal }: { proposal: QuoteProposal; internal: boolean }) {
  if (!internal) return null;
  const regular = Number(proposal.totals.regularPrice ?? proposal.totals.suggestedPrice ?? 0);
  const payable = Number(proposal.totals.payablePrice ?? proposal.totals.totalQuotedPrice ?? 0);
  const foregone = Number(proposal.totals.foregoneRevenue ?? Math.max(0, regular - payable));
  return <section className="grid border-b border-slate-200 bg-slate-50 sm:grid-cols-3" data-testid="quote-billing-summary"><div className="p-3"><span className="text-[10px] font-bold uppercase text-slate-500">Valor regular</span><strong className="block text-sm text-[#003366]">{money(regular, proposal.currency)}</strong></div><div className={`border-y p-3 sm:border-x sm:border-y-0 ${foregone > 0 ? "bg-amber-50" : ""}`}><span className="text-[10px] font-bold uppercase text-slate-500">Descuento o exoneración</span><strong className={foregone > 0 ? "block text-sm text-amber-800" : "block text-sm text-slate-700"}>{money(foregone, proposal.currency)}</strong>{foregone > 0 && <span className="text-[10px] font-semibold text-amber-800">Requiere autorización de Administración</span>}</div><div className="p-3"><span className="text-[10px] font-bold uppercase text-slate-500">Total a pagar</span><strong className="block text-sm text-[#003366]">{money(payable, proposal.currency)}</strong></div></section>;
}

function PackageQuoteSummary({ proposal }: { proposal: QuoteProposal }) {
  if (!proposal.packageScope) return null;
  const base = proposal.totals.packageSubtotal ?? proposal.lines.filter((line) => line.sourceKind === "COSTING" || line.packageMinimum).reduce((sum, line) => sum + Number(line.quotedPrice), 0);
  const extras = proposal.totals.grossQuotedPrice - base;
  return <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-b bg-sky-50 px-3 py-2 text-xs">
    <strong className="text-[#003366]">{proposal.packageScope.name} · {pricingQuantity.format(proposal.packageScope.volumeM3)} m³</strong>
    <span>Paquete {money(base, proposal.currency)}</span>
    <span>Adicionales {money(extras, proposal.currency)}</span>
    <span className="font-semibold">Total {money(proposal.totals.totalQuotedPrice, proposal.currency)}</span>
  </div>;
}

function QuoteIntake({ intake }: { intake: CaseCommercialIntake }) {
  const { directQuote, serviceStartDate } = intake;
  const serviceDate = Date.parse(serviceStartDate ?? "");
  const showDate = Boolean(serviceStartDate) && Number.isFinite(serviceDate);
  if (!directQuote && !showDate) return null;
  const capturedDetails = [
    ["Listado del cliente", directQuote?.clientList],
    ["Acceso en origen", directQuote?.originAccess],
    ["Acceso en destino", directQuote?.destinationAccess],
    ["Trabajos especiales", directQuote?.specialWork],
  ];

  return <details className="group border-b border-slate-200 px-3 text-xs" data-testid="quote-intake">
    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 py-2 text-slate-600 [&::-webkit-details-marker]:hidden">
      <ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform group-open:rotate-180" />
      <strong className="text-[#003366]">Datos para cotizar</strong>
      {directQuote?.volumeM3 === null && <span className="font-semibold text-amber-800">Volumen pendiente en Servicios</span>}
    </summary>
    <dl className="grid min-w-0 gap-2 pb-3 pl-7 sm:grid-cols-2">
      {showDate && <div><dt className="font-semibold text-slate-600">Fecha prevista del servicio</dt>
        <dd><time dateTime={serviceStartDate ?? undefined}>{SERVICE_DATE.format(serviceDate)}</time></dd></div>}
      {directQuote && <div><dt className="font-semibold text-slate-600">Fuente</dt>
        <dd>{directQuote.source === "CLIENT_LIST" ? "Listado del cliente" : "Estimación preliminar"}
          {directQuote.volumeM3 !== null && <> · {pricingQuantity.format(directQuote.volumeM3)} m³</>}</dd></div>}
      {capturedDetails.map(([label, detail]) => detail && <div className="min-w-0" key={label}>
        <dt className="font-semibold text-slate-600">{label}</dt><dd className="whitespace-pre-wrap break-words">{detail}</dd>
      </div>)}
    </dl>
  </details>;
}

function CombinationFields({ input, busy, needsRoute, canOpenRoute, onInput, onApply, onCancel, onOpenRoute }: {
  input: CombinationInput; busy: boolean; needsRoute: boolean; canOpenRoute: boolean;
  onInput(next: CombinationInput): void; onApply(): void; onCancel(): void; onOpenRoute?(): void;
}) {
  if (busy) return <p role="status" className="py-2 text-xs text-slate-600">Calculando {input.option.name}…</p>;
  const canUseWeight = input.option.needsWeight || input.option.shipment.mode !== "NONE";
  const estimate = combinationEstimate(input);
  const tier = estimate && minimumForPackage(input.option, Number(estimate.volumeM3));
  return <div aria-label="Datos de la combinación" className="space-y-2 bg-slate-50 px-2 py-2 text-xs">
    <strong className="text-[#003366]">{input.option.name}</strong>
    <div className="flex flex-wrap items-end gap-2">
      <label className="w-28">Volumen (m³)
        <NumericInput className={COMPACT_FIELD} allowDecimalComma min="0.0001" max={100_000} step="0.0001"
          value={input.volume} onChange={(event) => onInput({ ...input, volume: event.target.value })} />
      </label>
      {canUseWeight && <label className="w-32">Peso bruto (kg)
        <NumericInput className={COMPACT_FIELD} allowDecimalComma min="0.0001" max={1_000_000} step="0.0001"
          value={input.gross} onChange={(event) => onInput({ ...input, gross: event.target.value })} />
      </label>}
      <Button type="button" size="sm" disabled={!estimate} onClick={onApply}>Agregar combinación</Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Cancelar combinación" title="Cancelar combinación" onClick={onCancel}><X /></Button>
      {needsRoute && canOpenRoute && <Button type="button" variant="outline" size="sm" onClick={onOpenRoute}>Calcular ruta</Button>}
    </div>
    {tier && <p className="text-slate-600">Mínimo {money(tier.minimumSale, input.option.currency)}</p>}
    {!tier && pricingDecimal(input.volume, 4) && Number(input.volume.replace(",", ".")) > 0 &&
      <p className="text-amber-800">Revisa el volumen o el peso requerido para esta combinación.</p>}
  </div>;
}

export default function QuotePanel({
  caseRef, authorization, access, defaultPayer, canPreparePackage = false, canViewCosting = true,
  canAuthorizeMargin = false, suggestedGroupName, intake, communicationsEnabled = false,
  communicationsAccess, onOpenCommunications, onOpenTransport, onUnauthorized,
}: Props) {
  const [value, setValue] = useState<QuoteCase | null>(null);
  const [costing, setCosting] = useState<CostingRevision | null>(null);
  const [packageOptions, setPackageOptions] = useState<CostingPackageOptions | null>(null);
  const [activeRef, setActiveRef] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [prepared, setPrepared] = useState<CostingRevision | null>(null);
  const [combination, setCombination] = useState<CombinationInput | null>(null);
  const [packageBusy, setPackageBusy] = useState(false);
  const [missingTransport, setMissingTransport] = useState(false);
  const [marginReason, setMarginReason] = useState("");
  const prepareRequest = useRef<{ key: string; calculateId: string; publishId: string } | null>(null);
  const packageRun = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const quotes = await quoteApi.case(authorization, caseRef);
      setValue(quotes);
      setActiveRef((current) => current && quotes.proposals.some((item) => item.proposalRef === current) ? current : quotes.proposals[0]?.proposalRef || null);
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "QUOTE_REQUEST_FAILED";
      if (code.includes("UNAUTHORIZED")) onUnauthorized();
      else setError(quoteError(code));
    } finally {
      setLoading(false);
    }
  }, [authorization, caseRef, onUnauthorized]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    if (canViewCosting) {
      void costingApi.revision(authorization, caseRef, undefined, controller.signal).then((revision) => {
        if (!controller.signal.aborted) setCosting(revision);
      }).catch(() => {});
    }
    if (canPreparePackage) {
      void costingApi.packageOptions(authorization, caseRef, controller.signal).then((options) => {
        if (!controller.signal.aborted) setPackageOptions(options);
      }).catch(() => {});
    }
    return () => controller.abort();
  }, [authorization, caseRef, canViewCosting, canPreparePackage]);

  const active = useMemo(() => value?.proposals.find((proposal) => proposal.proposalRef === activeRef) || null, [activeRef, value]);
  const accepted = useMemo(() => value?.proposals.find((proposal) => proposal.state === "ACCEPTED") || null, [value]);
  const nextPosition = [1, 2, 3].find((position) => !value?.proposals.some((proposal) => proposal.position === position));
  const editBasis = prepared ?? editor?.basis ?? null;
  const isFlexible = editor && (!editor.proposal || editor.proposal.flexibleBasis || editor.proposal.sourceMode === "CATALOG");
  const packages = isFlexible && canPreparePackage
    ? packageOptions?.packages.filter((option) => option.currency === (editBasis?.baseCurrency ?? editor.currency)) ?? []
    : [];
  const recordedAt = Date.parse(intake?.directQuoteRecordedAt ?? "");
  const usePublished = !editor?.proposal && !editBasis && costing && !costing.packagePricing
    && !(Number.isFinite(recordedAt) && Date.parse(costing.publishedAt) < recordedAt);
  const canRevise = Boolean(active && !accepted && access.canUpdate && EDITABLE_STATES.has(active.state)
    && (active.sourceMode === "CATALOG" || canViewCosting));
  const currentIssues = active?.issues.filter((issue) => (issue.severity === undefined || issue.severity === "BLOCKER")
    && (issue.status === undefined || issue.status === "OPEN")) ?? [];
  const marginPending = currentIssues.some((issue) => issue.code === "MARGIN_AUTHORIZATION_REQUIRED");
  const canPublishDirectDiscount = marginPending && active?.sourceMode === "CATALOG" && canAuthorizeMargin
    && currentIssues.every((issue) => issue.code === "MARGIN_AUTHORIZATION_REQUIRED");

  function closeEditor() {
    packageRun.current += 1;
    prepareRequest.current = null;
    setPrepared(null);
    setCombination(null);
    setPackageBusy(false);
    setMissingTransport(false);
    setError(null);
    setEditor(null);
  }

  function startNew(position: number) {
    closeEditor();
    const configuredPackage = packageOptions?.packages.find((option) => option.versionRef === packageOptions.selectedPackageVersionRef);
    setEditor({ position, currency: configuredPackage?.currency ?? costing?.baseCurrency ?? DEFAULT_QUOTE_CURRENCY, basis: null });
  }

  async function startRevision(proposal: QuoteProposal) {
    if (actionBusy) return;
    setError(null);
    setActionBusy(true);
    try {
      const basis = proposal.sourceMode === "CATALOG" ? null
        : costing?.revisionRef === proposal.costingRevisionRef ? costing
        : await costingApi.revision(authorization, caseRef, proposal.costingRevisionRef);
      if (!basis && proposal.sourceMode !== "CATALOG") throw new Error("QUOTE_COSTING_REVISION_REQUIRED");
      closeEditor();
      setEditor({ position: proposal.position, currency: proposal.currency, basis, proposal });
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "QUOTE_REQUEST_FAILED";
      if (code.includes("UNAUTHORIZED")) onUnauthorized();
      else setError(quoteError(code));
    } finally {
      setActionBusy(false);
    }
  }

  async function applyCombination(input: CombinationInput) {
    if (packageBusy || !editor || !isFlexible) return;
    const estimate = combinationEstimate(input);
    if (!estimate) return;
    const run = ++packageRun.current;
    setPackageBusy(true);
    setMissingTransport(false);
    setError(null);
    try {
      const logistics = input.option.includeRouteTransport ? await costingApi.currentLogistics(authorization, caseRef) : null;
      if (input.option.includeRouteTransport && !logistics) throw new Error("COSTING_PACKAGE_TRANSPORT_REQUIRED");
      const payload = { caseRef, logisticsPlanRevisionRef: logistics?.revisionRef ?? null, baseCurrency: input.option.currency, packageEstimate: estimate };
      const key = JSON.stringify(payload);
      if (prepareRequest.current?.key !== key) prepareRequest.current = { key, calculateId: crypto.randomUUID(), publishId: crypto.randomUUID() };
      const { calculateId, publishId } = prepareRequest.current;
      const calculation = await costingApi.calculate(authorization, payload, calculateId);
      const pending = calculation.result.issues.find((item) => item.severity === "BLOCKER" && item.status === "OPEN");
      if (run !== packageRun.current) return;
      if (pending) {
        setMissingTransport(pending.code === "COSTING_PACKAGE_TRANSPORT_REQUIRED");
        setError(pending.message);
        prepareRequest.current = null;
        return;
      }
      const published = await costingApi.publish(authorization, calculation.calculationRef, publishId);
      if (run !== packageRun.current) return;
      setPrepared(published);
      setCombination(null);
      prepareRequest.current = null;
    } catch (cause) {
      if (run !== packageRun.current) return;
      const code = cause instanceof Error ? cause.message : "";
      if (code.includes("UNAUTHORIZED")) onUnauthorized();
      else setError(quoteError(code));
      setMissingTransport(["COSTING_PACKAGE_TRANSPORT_REQUIRED", "COSTING_PACKAGE_PLAN_STALE", "LOGISTICS_INPUT_STALE"].includes(code));
      if (code === "COSTING_INPUT_STALE") prepareRequest.current = null;
    } finally {
      if (run === packageRun.current) setPackageBusy(false);
    }
  }

  function selectCombination(option: CostingPackageOption) {
    if (packageBusy) return;
    const measures = editBasis?.packagePricing?.measures;
    const knownVolume = measures?.volumeM3 ?? packageOptions?.volumeM3 ?? intake?.directQuote?.volumeM3;
    const input = {
      option,
      volume: knownVolume == null ? "" : String(Number(knownVolume.toFixed(4))),
      gross: measures?.grossKg == null ? "" : String(measures.grossKg),
    };
    setError(null);
    setMissingTransport(false);
    setCombination(input);
    if (combinationEstimate(input)) void applyCombination(input);
  }

  function removeCombination() {
    if (!editor || !isFlexible || packageBusy) return;
    setPrepared(null);
    setCombination(null);
    setError(null);
    setMissingTransport(false);
    setEditor({ ...editor, basis: null });
  }

  async function runAction(action: () => Promise<QuoteProposal>) {
    if (actionBusy) return;
    setError(null);
    setActionBusy(true);
    try {
      await action();
      setMarginReason("");
      await load();
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "QUOTE_REQUEST_FAILED";
      if (code.includes("UNAUTHORIZED")) onUnauthorized();
      else setError(quoteError(code));
    } finally {
      setActionBusy(false);
    }
  }

  return <section role="tabpanel" data-testid="quote-panel" className="border border-slate-200 bg-white">
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
      <h2 className="text-base font-bold text-[#003366]">Propuestas comerciales</h2>
      <div className="flex items-center gap-1">
        {!editor && value && !accepted && access.canCreate && nextPosition && <Button type="button" size="sm" onClick={() => startNew(nextPosition)}>
          <Plus />Nueva propuesta {nextPosition}
        </Button>}
        {!editor && <Button type="button" size="icon-sm" variant="ghost" aria-label="Actualizar cotización" title="Actualizar" onClick={() => void load()}><RefreshCw /></Button>}
      </div>
    </header>
    {loading && !value && <p role="status" className="p-4 text-center text-sm text-slate-500">Cargando cotización…</p>}
    {error && <p role="alert" className="mx-3 my-2 flex gap-2 rounded bg-red-50 px-2 py-1.5 text-xs text-red-800"><AlertCircle className="size-4 shrink-0" />{error}</p>}
    {value && <>
      {intake && <QuoteIntake intake={intake} />}
      {accepted && <div className="border-b border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900" data-testid="quote-ready-for-operations">Propuesta aceptada · Lista para Operaciones</div>}
      {!editor && value.proposals.length > 0 && <div className="flex flex-wrap gap-1 border-b border-slate-200 px-2 py-1">
        {value.proposals.map((proposal) => <ProposalHeader key={proposal.proposalRef} proposal={proposal} active={proposal.proposalRef === activeRef}
          onClick={() => { setActiveRef(proposal.proposalRef); setMarginReason(""); setError(null); }} />)}
      </div>}
      {editor && <div className="min-w-0 p-3">
        {usePublished && costing && <Button type="button" size="sm" variant="ghost" className="mb-2"
          disabled={packageBusy} onClick={() => { setEditor({ ...editor, currency: costing.baseCurrency, basis: costing }); setCombination(null); }}>
          Usar costos publicados
        </Button>}
        <ProposalComposer key={editor.proposal?.revisionRef ?? "create-" + editor.position}
          caseRef={caseRef} authorization={authorization} costing={editBasis}
          position={editor.position} defaultPayer={defaultPayer} canConfirmCharges={access.canOverridePrice}
          autoOpen awaitingPackage={Boolean(combination)} errorText={quoteError} currency={editor.currency}
          packages={packages} selectedPackageVersionRef={packageOptions?.selectedPackageVersionRef}
          onSelectPackage={selectCombination} proposal={editor.proposal}
          onClose={closeEditor} onRemovePackage={isFlexible && editBasis?.packagePricing ? removeCombination : undefined}
          suggestedGroupName={suggestedGroupName}
          currencyOptions={[...new Set([DEFAULT_QUOTE_CURRENCY, "USD", "EUR", editor.currency, ...(packageOptions?.packages.map((option) => option.currency) ?? [])])]}
          onCurrencyChange={(currency) => { setEditor({ ...editor, currency }); setCombination(null); }}
          extraControls={combination && <CombinationFields input={combination} busy={packageBusy} needsRoute={missingTransport}
            canOpenRoute={Boolean(onOpenTransport)} onInput={setCombination} onApply={() => void applyCombination(combination)}
            onCancel={() => { setCombination(null); setError(null); setMissingTransport(false); }} onOpenRoute={onOpenTransport} />}
          onCreated={(proposalRef) => { if (prepared) setCosting(prepared); closeEditor(); setActiveRef(proposalRef); void load(); }} />
      </div>}
      {!editor && active && <div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
          <div>
            <h3 className="text-sm font-semibold text-[#003366]">{active.proposalName}</h3>
            <p className="text-xs text-slate-600">{active.reference} · Revisión {active.revision} · Vigente hasta {active.validUntil}</p>
          </div>
          <div className="flex items-center gap-1">
            <Badge variant="outline">{active.state}</Badge>
            {canRevise && <Button variant="ghost" size="icon-sm" aria-label="Editar propuesta" title="Editar propuesta" disabled={actionBusy}
              onClick={() => void startRevision(active)}><Pencil /></Button>}
          </div>
        </div>
        <PackageQuoteSummary proposal={active} />
        <BillingSummary proposal={active} internal={access.canViewInternalCost} />
        {active.groupName && <h4 className="px-3 pt-2 text-sm font-semibold text-[#003366]">{active.groupName}</h4>}
        <QuoteLines proposal={active} internal={access.canViewInternalCost} />
        <details className="border-b border-slate-200 px-3 py-1.5 text-xs" data-testid="quote-commercial-snapshot">
          <summary className="cursor-pointer font-semibold text-slate-600">Datos comerciales</summary>
          <dl className="grid gap-2 py-2 sm:grid-cols-2 lg:grid-cols-3">
            <div><dt>Responsable del pago</dt><dd className="font-semibold">{active.payer.displayName}</dd></div>
            {active.commercialContext.leadAccount && <div><dt>Cuenta principal</dt><dd className="font-semibold">{active.commercialContext.leadAccount.displayName}</dd></div>}
            {active.commercialContext.booker && <div><dt>Booker</dt><dd className="font-semibold">{active.commercialContext.booker.displayName}</dd></div>}
            {active.commercialContext.tariff && <div><dt>Acuerdo o tarifario</dt><dd className="font-semibold">{active.commercialContext.tariff.displayName}</dd></div>}
            {active.commercialContext.referral && <div><dt>Referido</dt><dd className="font-semibold">{active.commercialContext.referral.displayName}</dd></div>}
            {active.commercialContext.associations.length > 0 && <div><dt>Asociaciones</dt><dd className="font-semibold">{active.commercialContext.associations.join(", ")}</dd></div>}
          </dl>
        </details>
        {currentIssues.length > 0 && !accepted && <ul className="space-y-1 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {currentIssues.map((issue, index) => <li key={issue.code + index}>{issue.message}</li>)}
        </ul>}
        <footer className="flex flex-wrap items-end justify-end gap-2 p-3">
          {communicationsEnabled && communicationsAccess && (communicationsAccess.canView || communicationsAccess.canPrepare && communicationsAccess.canTemplatesView)
            && onOpenCommunications && <Button size="sm" variant="ghost" onClick={() => onOpenCommunications(active.revisionRef)}>Ver comunicaciones de Cotización</Button>}
          {!accepted && access.canPublish && active.state === "DRAFT" && (canPublishDirectDiscount
            ? <>
              <label className="min-w-44 text-xs font-semibold">Motivo de autorización
                <input className={COMPACT_FIELD} maxLength={1000} value={marginReason} onChange={(event) => setMarginReason(event.target.value)} />
              </label>
              <Button size="sm" disabled={actionBusy || !marginReason.trim()}
                onClick={() => void runAction(() => quoteApi.publish(authorization, active.proposalRef, active.revision, marginReason.trim()))}>
                <Check />Autorizar y publicar
              </Button>
            </>
            : <Button size="sm" disabled={actionBusy || currentIssues.length > 0}
              onClick={() => void runAction(() => quoteApi.publish(authorization, active.proposalRef, active.revision))}><Check />Publicar</Button>)}
          {!accepted && access.canSend && active.state === "READY" && <Button size="sm" disabled={actionBusy} onClick={() => void runAction(() =>
            quoteApi.send(authorization, { proposalRef: active.proposalRef, expectedRevision: active.revision, channel: "MANUAL", recipient: { kind: "RECIPIENT_ON_FILE", displayName: null, reference: null, present: true }, evidenceRef: null }))}>
            <Send />Registrar envío
          </Button>}
          {!accepted && access.canRecordDecision && active.state === "SENT" && <>
            <Button size="sm" disabled={actionBusy} onClick={() => void runAction(() => quoteApi.decision(authorization, {
              proposalRef: active.proposalRef, expectedRevision: active.revision, decision: "ACCEPTED", method: "EVIDENCE_ON_FILE",
              decidedBy: { kind: "CLIENT_REPRESENTATIVE", displayName: null, reference: null, present: true }, evidenceRef: "CLIENT-ACCEPTANCE-EVIDENCE", reason: null,
            }))}><Check />Registrar aceptación</Button>
            <Button size="sm" variant="outline" disabled={actionBusy} onClick={() => void runAction(() => quoteApi.decision(authorization, {
              proposalRef: active.proposalRef, expectedRevision: active.revision, decision: "REJECTED", method: "EVIDENCE_ON_FILE",
              decidedBy: { kind: "CLIENT_REPRESENTATIVE", displayName: null, reference: null, present: true }, evidenceRef: "CLIENT-REJECTION-EVIDENCE", reason: "Decisión del cliente registrada",
            }))}>Registrar rechazo</Button>
          </>}
        </footer>
      </div>}
      {!editor && !active && <p className="px-3 py-5 text-sm text-slate-600">Aún no hay propuestas para este caso.</p>}
    </>}
  </section>;
}
