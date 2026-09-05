import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowDown, ArrowUp, Check, Plus, RefreshCw, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { QuoteUiAccess } from "./access";
import { quoteApi, type QuoteCase, type QuoteProposal } from "./api";
import { costingApi, type CostingRevision } from "@/costing/api";

type Props = Readonly<{ caseRef: string; authorization?: string; access: QuoteUiAccess; onUnauthorized(): void }>;

function money(value: number | string | null | undefined, currency: string) {
  if (value == null) return "Pendiente";
  return new Intl.NumberFormat("es-DO", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value));
}

function quoteError(value: string) {
  return ({
    QUOTE_COSTING_REVISION_REQUIRED: "Se requiere un Costing publicado antes de crear una propuesta.",
    QUOTE_DESTINATION_PENDING: "El destino debe confirmarse antes de aprobar la Cotización.",
    QUOTE_BLOCKERS_PRESENT: "La Cotización tiene pendientes. Resuélvalos en el dominio indicado antes de continuar.",
    QUOTE_REQUEST_FAILED: "No fue posible consultar la Cotización. Intente nuevamente.",
  } as Record<string, string>)[value] || "No fue posible completar la acción de Cotización. Revise los pendientes publicados e intente nuevamente.";
}

function ProposalHeader({ proposal, active, onClick }: { proposal: QuoteProposal; active: boolean; onClick(): void }) {
  return <button type="button" onClick={onClick} aria-pressed={active} className={`min-w-48 border px-3 py-2 text-left ${active ? "border-[#0070a8] bg-sky-50" : "border-slate-200 bg-white"}`}><span className="block text-[10px] font-bold uppercase text-slate-500">Propuesta {proposal.position}</span><strong className="block truncate text-sm text-[#003366]">{proposal.reference}</strong><span className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-600"><span>{money(proposal.totals.totalQuotedPrice, proposal.currency)}</span><Badge variant="outline">{proposal.state}</Badge></span></button>;
}

function QuoteLines({ proposal, internal }: { proposal: QuoteProposal; internal: boolean }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-slate-100 text-[10px] uppercase tracking-wide text-slate-600"><tr><th className="p-2">Concepto</th><th>Tipo</th><th>Cant.</th><th>Unidad</th>{internal && <th>Costo</th>}{internal && <th>Sugerido</th>}<th>Cotizado</th><th>Estado</th></tr></thead><tbody className="divide-y divide-slate-100">{proposal.lines.map((line) => { const quoted = Number(line.quotedPrice); const suggested = Number(line.suggestedPrice); const below = internal && line.quotedPrice != null && line.suggestedPrice != null && quoted < suggested; const above = internal && line.quotedPrice != null && line.suggestedPrice != null && quoted > suggested; return <tr key={line.lineRef}><td className="p-2 font-semibold text-slate-900">{line.concept}<span className="block text-[10px] text-slate-500">{line.sourceKind}</span></td><td><Badge variant="outline">{line.economicClass}</Badge></td><td>{line.quantity}</td><td>{line.unit}</td>{internal && <td>{money(line.capturedCost, line.currency)}</td>}{internal && <td>{money(line.suggestedPrice, line.currency)}</td>}<td className="font-bold">{money(line.quotedPrice, line.currency)}{below && <span className="mt-1 flex items-center gap-1 text-[10px] text-red-700"><ArrowDown className="h-3 w-3" />Debajo del sugerido</span>}{above && <span className="mt-1 flex items-center gap-1 text-[10px] text-blue-700"><ArrowUp className="h-3 w-3" />Sobre el sugerido</span>}</td><td>{line.priceStatus}</td></tr>; })}</tbody></table></div>;
}

function CreateProposal({ caseRef, authorization, costing, position, onCreated }: { caseRef: string; authorization?: string; costing: CostingRevision; position: number; onCreated(): void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(`Propuesta ${position}`);
  const [payerName, setPayerName] = useState("");
  const [scope, setScope] = useState("");
  const [prices, setPrices] = useState<Record<string, string>>(() => Object.fromEntries(costing.lines.filter((line) => line.lineRef && line.suggestedPrice != null).map((line) => [String(line.lineRef), String(line.suggestedPrice)])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currency = costing.baseCurrency;
  const submit = async () => {
    setSaving(true); setError(null);
    const today = new Date(); const valid = new Date(today); valid.setUTCDate(valid.getUTCDate() + 30);
    try {
      await quoteApi.create(authorization, {
        caseRef, costingRevisionRef: costing.revisionRef, position, proposalName: name, currency,
        issueDate: today.toISOString().slice(0, 10), validUntil: valid.toISOString().slice(0, 10),
        commercialContext: { company: null, leadAccount: null, booker: null, tariff: null, associations: [], referral: null, commissionContext: null },
        payer: { kind: "AUTHORIZED_ENTITY", reference: `payer-explicit-${position}`, displayName: payerName, sourceVersion: 1, validFrom: null, validUntil: null, conditions: null },
        terms: { paymentTerms: "Según propuesta comercial", scope, exclusions: [], clientNotes: null, specialConditions: [], templateRef: null, templateVersion: null },
        exchange: null, discount: null, marginAuthorizationRef: null,
        lines: costing.lines.filter((line) => line.lineRef && line.suggestedPrice != null).map((line) => ({ sourceKind: "COSTING", costingLineRef: line.lineRef, concept: line.concept, quantity: line.quantity, unit: line.unit, economicClass: line.classification, quotedPrice: prices[String(line.lineRef)], currency, reason: null, manualAuthority: null })),
      });
      setOpen(false); onCreated();
    } catch (cause) { setError(quoteError(cause instanceof Error ? cause.message : "QUOTE_REQUEST_FAILED")); }
    finally { setSaving(false); }
  };
  if (!open) return <Button size="sm" onClick={() => setOpen(true)}><Plus />Nueva propuesta {position}</Button>;
  return <section className="border border-sky-200 bg-sky-50 p-3"><h3 className="text-sm font-black text-[#003366]">Definir propuesta {position}</h3><div className="mt-2 grid gap-2 md:grid-cols-3"><label className="text-xs font-bold text-slate-600">Nombre<input className="mt-1 h-9 w-full border bg-white px-2 font-normal" value={name} onChange={(event) => setName(event.target.value)} /></label><label className="text-xs font-bold text-slate-600">Responsable del pago explícito<input className="mt-1 h-9 w-full border bg-white px-2 font-normal" value={payerName} onChange={(event) => setPayerName(event.target.value)} /></label><label className="text-xs font-bold text-slate-600">Alcance<input className="mt-1 h-9 w-full border bg-white px-2 font-normal" value={scope} onChange={(event) => setScope(event.target.value)} /></label></div><div className="mt-3 divide-y border bg-white">{costing.lines.filter((line) => line.lineRef && line.suggestedPrice != null).map((line) => <label key={line.lineRef} className="grid items-center gap-2 p-2 text-xs sm:grid-cols-[minmax(0,1fr)_140px_140px]"><span className="truncate font-semibold">{line.concept} · {line.classification}</span><span>Sugerido {money(line.suggestedPrice, currency)}</span><span><span className="sr-only">Precio cotizado {line.concept}</span><input aria-label={`Precio cotizado ${line.concept}`} type="number" min="0" step="0.01" className="h-8 w-full border px-2" value={prices[String(line.lineRef)] || ""} onChange={(event) => setPrices((current) => ({ ...current, [String(line.lineRef)]: event.target.value }))} /></span></label>)}</div>{error && <p className="mt-2 text-xs text-red-700">{error}</p>}<div className="mt-3 flex gap-2"><Button size="sm" disabled={saving || !name.trim() || !payerName.trim() || !scope.trim() || Object.values(prices).some((value) => !value)} onClick={() => void submit()}>{saving ? "Guardando…" : "Crear desde Costing publicado"}</Button><Button size="sm" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button></div></section>;
}

export default function QuotePanel({ caseRef, authorization, access, onUnauthorized }: Props) {
  const [value, setValue] = useState<QuoteCase | null>(null);
  const [costing, setCosting] = useState<CostingRevision | null>(null);
  const [activeRef, setActiveRef] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
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
  return <section role="tabpanel" data-testid="quote-panel" className="border border-slate-200 bg-white"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#0070a8]">Cotización tenant-first</p><h2 className="text-lg font-black text-[#003366]">Propuestas comerciales</h2></div><Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw />Actualizar</Button></header>
    {loading && <p className="p-8 text-center text-sm text-slate-500">Cargando Cotización…</p>}
    {error && <div role="alert" className="m-4 flex gap-2 border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle className="h-4 w-4" />{error}</div>}
    {!loading && value && <>{accepted && <div className="border-b border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900" data-testid="quote-ready-for-operations">Propuesta aceptada · Listo para Operaciones <span className="font-normal">(handoff aún no implementado)</span></div>}<div className="flex gap-2 overflow-x-auto border-b border-slate-200 p-3">{value.proposals.map((proposal) => <div key={proposal.proposalRef} className={accepted && proposal.proposalRef !== accepted.proposalRef ? "opacity-65" : undefined}><ProposalHeader proposal={proposal} active={proposal.proposalRef === activeRef} onClick={() => setActiveRef(proposal.proposalRef)} />{accepted && proposal.proposalRef !== accepted.proposalRef && <span className="mt-1 block text-[10px] font-semibold text-slate-500">Histórica · no operativa</span>}</div>)}{!accepted && access.canCreate && costing && nextPosition && <CreateProposal caseRef={caseRef} authorization={authorization} costing={costing} position={nextPosition} onCreated={() => void load()} />}{!costing && value.proposals.length === 0 && <p className="p-2 text-xs text-amber-800">Se requiere un Costing publicado.</p>}</div>
      {active ? <div><div className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-4"><div><span className="text-[10px] font-bold uppercase text-slate-500">Propuesta</span><strong className="block text-sm">{active.proposalName}</strong></div><div><span className="text-[10px] font-bold uppercase text-slate-500">Referencia</span><strong className="block font-mono text-sm">{active.reference}</strong></div><div><span className="text-[10px] font-bold uppercase text-slate-500">Cantidad / Total</span><strong className="block text-sm">{active.lines.length} · {money(active.totals.totalQuotedPrice, active.currency)}</strong></div><div><span className="text-[10px] font-bold uppercase text-slate-500">Estado</span><Badge>{active.state}</Badge></div></div><QuoteLines proposal={active} internal={access.canViewInternalCost} /><footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-3"><p className="text-xs text-slate-500">Vigente hasta {active.validUntil} · Revisión {active.revision}</p><div className="flex flex-wrap gap-2">{!accepted && access.canPublish && active.state === "DRAFT" && <Button size="sm" onClick={() => void quoteApi.publish(authorization, active.proposalRef, active.revision).then(load)}><Check />Publicar</Button>}{!accepted && access.canSend && active.state === "READY" && <Button size="sm" onClick={() => void quoteApi.send(authorization, { proposalRef: active.proposalRef, expectedRevision: active.revision, channel: "MANUAL", recipient: { kind: "RECIPIENT_ON_FILE", displayName: null, reference: null, present: true }, evidenceRef: null }).then(load)}><Send />Registrar envío</Button>}{!accepted && access.canRecordDecision && active.state === "SENT" && <><Button size="sm" onClick={() => void quoteApi.decision(authorization, { proposalRef: active.proposalRef, expectedRevision: active.revision, decision: "ACCEPTED", method: "EVIDENCE_ON_FILE", decidedBy: { kind: "CLIENT_REPRESENTATIVE", displayName: null, reference: null, present: true }, evidenceRef: "CLIENT-ACCEPTANCE-EVIDENCE", reason: null }).then(load)}><Check />Registrar aceptación</Button><Button size="sm" variant="outline" onClick={() => void quoteApi.decision(authorization, { proposalRef: active.proposalRef, expectedRevision: active.revision, decision: "REJECTED", method: "EVIDENCE_ON_FILE", decidedBy: { kind: "CLIENT_REPRESENTATIVE", displayName: null, reference: null, present: true }, evidenceRef: "CLIENT-REJECTION-EVIDENCE", reason: "Decisión del cliente registrada" }).then(load)}>Registrar rechazo</Button></>}</div></footer></div> : <p className="p-8 text-center text-sm text-slate-500">Todavía no existen propuestas de Cotización. Cree la primera desde el Costing publicado.</p>}</>}
  </section>;
}
