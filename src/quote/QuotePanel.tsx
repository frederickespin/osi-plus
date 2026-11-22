import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowDown, ArrowUp, Check, ChevronDown, RefreshCw, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { QuoteUiAccess } from "./access";
import { quoteApi, type QuoteCase, type QuoteProposal } from "./api";
import { costingApi, type CostingPackageEstimate, type CostingRevision } from "@/costing/api";
import { PackageCostingForm } from "@/costing/PackageCosting";
import type { CommunicationsAccess } from "@/communications/access";
import type { CaseCommercialIntake } from "@/commercial-crm/caseCommercialIntake";
import { pricingQuantity } from "@/costing/pricingInput";
import ProposalComposer from "./ProposalComposer";

type Props = Readonly<{
  caseRef: string; authorization?: string; access: QuoteUiAccess; defaultPayer?: string; canPreparePackage?: boolean;
  intake?: CaseCommercialIntake;
  communicationsEnabled?: boolean; communicationsAccess?: CommunicationsAccess;
  onOpenCommunications?(quoteRevisionRef: string): void; onOpenTransport?(): void; onOpenCosts?(): void; onUnauthorized(): void;
}>;

const SERVICE_DATE = new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeZone: "UTC" });

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
    QUOTE_CATALOG_PRICE_STALE: "Cambió el precio de un adicional. Quítalo y vuelve a seleccionarlo en el catálogo.",
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
  return <button type="button" onClick={onClick} aria-pressed={active} className={`min-w-48 border px-3 py-2 text-left ${active ? "border-[#0070a8] bg-sky-50" : "border-slate-200 bg-white"}`}><span className="block text-[10px] font-bold uppercase text-slate-500">Propuesta {proposal.position}</span><strong className="block truncate text-sm text-[#003366]">{proposal.reference}</strong><span className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-600"><span>{money(proposal.totals.totalQuotedPrice, proposal.currency)}</span><Badge variant="outline">{proposal.state}</Badge></span></button>;
}

function QuoteLines({ proposal, internal }: { proposal: QuoteProposal; internal: boolean }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-slate-100 text-[10px] uppercase tracking-wide text-slate-600"><tr><th className="p-2">Concepto</th><th>Tipo</th><th>Cant.</th><th>Unidad</th>{internal && <th>Costo</th>}{internal && <th>Sugerido</th>}<th>Cotizado</th><th>Estado</th></tr></thead><tbody className="divide-y divide-slate-100">{proposal.lines.map((line) => { const quoted = Number(line.quotedPrice); const suggested = Number(line.suggestedPrice); const below = internal && line.quotedPrice != null && line.suggestedPrice != null && quoted < suggested; const above = internal && line.quotedPrice != null && line.suggestedPrice != null && quoted > suggested; return <tr key={line.lineRef}><td className="p-2 font-semibold text-slate-900">{line.concept}<span className="block text-[10px] text-slate-500">{line.packageMinimum ? "Ajuste del paquete" : line.sourceKind === "MANUAL" ? "Adicional" : proposal.packageScope ? "Paquete" : "Costo publicado"}</span></td><td><Badge variant="outline">{line.economicClass}</Badge></td><td>{line.quantity}</td><td>{line.unit}</td>{internal && <td>{money(line.capturedCost, line.currency)}</td>}{internal && <td>{money(line.suggestedPrice, line.currency)}</td>}<td className="font-bold">{money(line.quotedPrice, line.currency)}{below && <span className="mt-1 flex items-center gap-1 text-[10px] text-red-700"><ArrowDown className="h-3 w-3" />Debajo del sugerido</span>}{above && <span className="mt-1 flex items-center gap-1 text-[10px] text-blue-700"><ArrowUp className="h-3 w-3" />Sobre el sugerido</span>}</td><td>{line.priceStatus}</td></tr>; })}</tbody></table></div>;
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

export default function QuotePanel({ caseRef, authorization, access, defaultPayer, canPreparePackage = false, intake, communicationsEnabled = false, communicationsAccess, onOpenCommunications, onOpenTransport, onOpenCosts, onUnauthorized }: Props) {
  const [value, setValue] = useState<QuoteCase | null>(null);
  const [costing, setCosting] = useState<CostingRevision | null>(null);
  const [activeRef, setActiveRef] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [prepared, setPrepared] = useState<CostingRevision | null>(null);
  const [packageBusy, setPackageBusy] = useState(false);
  const [packageDirty, setPackageDirty] = useState(false);
  const [missingTransport, setMissingTransport] = useState(false);
  const prepareRequest = useRef<{ key: string; calculateId: string; publishId: string } | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [quotes, costingRevision] = await Promise.all([quoteApi.case(authorization, caseRef), costingApi.revision(authorization, caseRef)]);
      setValue(quotes); setCosting(costingRevision); setActiveRef((current) => current && quotes.proposals.some((item) => item.proposalRef === current) ? current : quotes.proposals[0]?.proposalRef || null);
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "QUOTE_REQUEST_FAILED";
      if (code.includes("UNAUTHORIZED")) onUnauthorized(); else setError(quoteError(code));
    } finally { setLoading(false); }
  }, [authorization, caseRef, onUnauthorized]);
  useEffect(() => { void load(); }, [load]);
  const active = useMemo(() => value?.proposals.find((proposal) => proposal.proposalRef === activeRef) || null, [activeRef, value]);
  const accepted = useMemo(() => value?.proposals.find((proposal) => proposal.state === "ACCEPTED") || null, [value]);
  const nextPosition = [1, 2, 3].find((position) => !value?.proposals.some((proposal) => proposal.position === position));
  const offerPackage = canPreparePackage && access.canCreate && !accepted && Boolean(nextPosition);
  const costingForProposal = prepared ?? (costing?.packagePricing && offerPackage ? null : costing);
  const directQuoteRecordedAt = Date.parse(intake?.directQuoteRecordedAt ?? "");
  const staleCosting = Boolean(intake?.directQuote && costingForProposal && Date.parse(costingForProposal.publishedAt) < directQuoteRecordedAt);
  const proposalCosting = staleCosting ? null : costingForProposal;

  async function preparePackage(estimate: CostingPackageEstimate, currency: string, includeRoute: boolean) {
    if (packageBusy || !offerPackage) return;
    setPackageBusy(true);
    setPackageDirty(true);
    setMissingTransport(false);
    setError(null);
    try {
      const logistics = includeRoute ? await costingApi.currentLogistics(authorization, caseRef) : null;
      if (includeRoute && !logistics) throw new Error("COSTING_PACKAGE_TRANSPORT_REQUIRED");
      const payload = { caseRef, logisticsPlanRevisionRef: logistics?.revisionRef ?? null, baseCurrency: currency, packageEstimate: estimate };
      const key = JSON.stringify(payload);
      if (prepareRequest.current?.key !== key) prepareRequest.current = { key, calculateId: crypto.randomUUID(), publishId: crypto.randomUUID() };
      const { calculateId, publishId } = prepareRequest.current;
      const calculation = await costingApi.calculate(authorization, payload, calculateId);
      const pending = calculation.result.issues.find((item) => item.severity === "BLOCKER" && item.status === "OPEN");
      if (pending) {
        setMissingTransport(pending.code === "COSTING_PACKAGE_TRANSPORT_REQUIRED");
        setError(pending.message);
        prepareRequest.current = null;
        return;
      }
      setPrepared(await costingApi.publish(authorization, calculation.calculationRef, publishId));
      setPackageDirty(false);
      prepareRequest.current = null;
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "";
      if (code.includes("UNAUTHORIZED")) onUnauthorized();
      else setError(quoteError(code));
      setMissingTransport(["COSTING_PACKAGE_TRANSPORT_REQUIRED", "COSTING_PACKAGE_PLAN_STALE", "LOGISTICS_INPUT_STALE"].includes(code));
      if (code === "COSTING_INPUT_STALE") prepareRequest.current = null;
    } finally {
      setPackageBusy(false);
    }
  }
  return <section role="tabpanel" data-testid="quote-panel" className="border border-slate-200 bg-white"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#0070a8]">Cotización tenant-first</p><h2 className="text-lg font-black text-[#003366]">Propuestas comerciales</h2></div><Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw />Actualizar</Button></header>
    {loading && <p className="p-8 text-center text-sm text-slate-500">Cargando Cotización…</p>}
    {error && <div role="alert" className="m-4 flex gap-2 border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle className="h-4 w-4" />{error}</div>}
    {!loading && value && <>
      {intake && <QuoteIntake intake={intake} />}
      {offerPackage && <div className="border-b p-3">
        <PackageCostingForm caseRef={caseRef} authorization={authorization} busy={packageBusy} actionLabel="Aplicar paquete"
          current={intake?.directQuote ? prepared?.packagePricing : (prepared ?? costing)?.packagePricing}
          onCalculate={(estimate, currency, route) => void preparePackage(estimate, currency, route)}
          onChange={() => { setPackageDirty(true); setError(null); setMissingTransport(false); }} onUnauthorized={onUnauthorized} />
        {missingTransport && onOpenTransport && <Button type="button" size="sm" variant="outline" className="mt-2" onClick={onOpenTransport}>Calcular ruta</Button>}
      </div>}
      {!accepted && access.canCreate && nextPosition && staleCosting && <div className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <p role="status">Los datos para cotizar son más recientes que los costos publicados. Actualiza los costos antes de crear una propuesta.</p>
        {onOpenCosts && <Button type="button" size="sm" variant="outline" onClick={onOpenCosts}>Ir a Costos internos</Button>}
      </div>}
      {accepted && <div className="border-b border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900" data-testid="quote-ready-for-operations">Propuesta aceptada · Listo para Operaciones <span className="font-normal">(handoff aún no implementado)</span></div>}
      <div className="flex gap-2 overflow-x-auto border-b border-slate-200 p-3">
        {value.proposals.map((proposal) => <div key={proposal.proposalRef} className={accepted && proposal.proposalRef !== accepted.proposalRef ? "opacity-65" : undefined}>
          <ProposalHeader proposal={proposal} active={proposal.proposalRef === activeRef} onClick={() => setActiveRef(proposal.proposalRef)} />
          {accepted && proposal.proposalRef !== accepted.proposalRef && <span className="mt-1 block text-[10px] font-semibold text-slate-500">Histórica · no operativa</span>}
        </div>)}
        {!proposalCosting && !staleCosting && !offerPackage && value.proposals.length === 0 && <p className="p-2 text-xs text-amber-800">Calcule y publique los costos para preparar la propuesta.</p>}
      </div>
      {!accepted && access.canCreate && proposalCosting && nextPosition && <div className="min-w-0 border-b p-3">
        <ProposalComposer key={`${caseRef}:${nextPosition}`} caseRef={caseRef} authorization={authorization} costing={proposalCosting}
          position={nextPosition} canConfirmCharges={access.canOverridePrice} defaultPayer={defaultPayer}
          autoOpen={Boolean(prepared)} awaitingPackage={packageBusy || packageDirty} errorText={quoteError}
          onCreated={(proposalRef) => { setActiveRef(proposalRef); setPrepared(null); setPackageDirty(false); void load(); }} />
      </div>}
      {active ? <div><div className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-4"><div><span className="text-[10px] font-bold uppercase text-slate-500">Propuesta</span><strong className="block text-sm">{active.proposalName}</strong></div><div><span className="text-[10px] font-bold uppercase text-slate-500">Referencia</span><strong className="block font-mono text-sm">{active.reference}</strong></div><div><span className="text-[10px] font-bold uppercase text-slate-500">Cantidad / Total</span><strong className="block text-sm">{active.lines.length} · {money(active.totals.totalQuotedPrice, active.currency)}</strong></div><div><span className="text-[10px] font-bold uppercase text-slate-500">Estado</span><Badge>{active.state}</Badge></div></div><PackageQuoteSummary proposal={active} /><BillingSummary proposal={active} internal={access.canViewInternalCost} /><section className="border-b bg-sky-50/60 p-3" data-testid="quote-commercial-snapshot"><div className="flex items-center justify-between gap-2"><h3 className="text-[10px] font-black uppercase tracking-wide text-[#003366]">Contexto comercial capturado</h3><span className="text-[10px] text-slate-500">Snapshot v{active.payer.sourceVersion}</span></div><dl className="mt-2 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-3"><div><dt className="font-bold text-slate-500">Responsable del pago</dt><dd className="font-semibold">{active.payer.displayName}</dd></div><div><dt className="font-bold text-slate-500">Lead Account</dt><dd className="font-semibold">{active.commercialContext.leadAccount?.displayName || "No definido"}</dd></div><div><dt className="font-bold text-slate-500">Booker</dt><dd className="font-semibold">{active.commercialContext.booker?.displayName || "No definido"}</dd></div><div><dt className="font-bold text-slate-500">Acuerdo / tarifario</dt><dd className="font-semibold">{active.commercialContext.tariff?.displayName || "No definido"}</dd></div><div><dt className="font-bold text-slate-500">Referido</dt><dd className="font-semibold">{active.commercialContext.referral?.displayName || "No definido"}</dd></div><div><dt className="font-bold text-slate-500">Asociaciones</dt><dd className="font-semibold">{active.commercialContext.associations.length ? active.commercialContext.associations.join(" · ") : "No definido"}</dd></div></dl></section><QuoteLines proposal={active} internal={access.canViewInternalCost} /><footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-3"><p className="text-xs text-slate-500">Vigente hasta {active.validUntil} · Revisión {active.revision}</p><div className="flex flex-wrap gap-2">{communicationsEnabled && communicationsAccess && (communicationsAccess.canView || communicationsAccess.canPrepare && communicationsAccess.canTemplatesView) && onOpenCommunications && <Button size="sm" variant="outline" onClick={() => onOpenCommunications(active.revisionRef)}>Ver comunicaciones de Cotización</Button>}{!accepted && access.canPublish && active.state === "DRAFT" && <Button size="sm" onClick={() => void quoteApi.publish(authorization, active.proposalRef, active.revision).then(load)}><Check />Publicar</Button>}{!accepted && access.canSend && active.state === "READY" && <Button size="sm" onClick={() => void quoteApi.send(authorization, { proposalRef: active.proposalRef, expectedRevision: active.revision, channel: "MANUAL", recipient: { kind: "RECIPIENT_ON_FILE", displayName: null, reference: null, present: true }, evidenceRef: null }).then(load)}><Send />Registrar envío</Button>}{!accepted && access.canRecordDecision && active.state === "SENT" && <><Button size="sm" onClick={() => void quoteApi.decision(authorization, { proposalRef: active.proposalRef, expectedRevision: active.revision, decision: "ACCEPTED", method: "EVIDENCE_ON_FILE", decidedBy: { kind: "CLIENT_REPRESENTATIVE", displayName: null, reference: null, present: true }, evidenceRef: "CLIENT-ACCEPTANCE-EVIDENCE", reason: null }).then(load)}><Check />Registrar aceptación</Button><Button size="sm" variant="outline" onClick={() => void quoteApi.decision(authorization, { proposalRef: active.proposalRef, expectedRevision: active.revision, decision: "REJECTED", method: "EVIDENCE_ON_FILE", decidedBy: { kind: "CLIENT_REPRESENTATIVE", displayName: null, reference: null, present: true }, evidenceRef: "CLIENT-REJECTION-EVIDENCE", reason: "Decisión del cliente registrada" }).then(load)}>Registrar rechazo</Button></>}</div></footer></div> : <p className="p-8 text-center text-sm text-slate-500">Todavía no existen propuestas de Cotización. Cree la primera desde el Costing publicado.</p>}</>}
  </section>;
}
