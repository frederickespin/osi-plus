import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileCheck2,
  LockKeyhole,
  Plus,
  Trash2,
  X,
} from "lucide-react";

type ProposalId = "P1" | "P2" | "P3";
type QuoteFamily = "Servicios propios" | "Terceros" | "Fletes" | "Cajas de madera" | "Aduanas" | "Permisos" | "Cargos adicionales";
type EconomicClass = "PROPIO" | "EXTERNO" | "DESEMBOLSO";
type LineStatus = "CONFIRMED" | "PENDING";

type QuoteLine = Readonly<{
  id: string;
  reference: string;
  family: QuoteFamily;
  concept: string;
  detail: string;
  quantity: number;
  unit: string;
  cost: number;
  suggested: number;
  economicClass: EconomicClass;
  status: LineStatus;
}>;

type Proposal = Readonly<{
  id: ProposalId;
  name: string;
  reference: string;
  detail: string;
  included: readonly string[];
}>;

type AdditionalDraft = {
  reference: string;
  concept: string;
  quantity: string;
  unit: string;
  cost: string;
  price: string;
  economicClass: EconomicClass;
  status: LineStatus;
};

const MINIMUM_OWN_MARGIN = 24;
const USD_REFERENCE_RATE = 62.96;
const FREIGHT_USD = 1350;
const money = new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP", maximumFractionDigits: 0 });

const QUOTE_LINES: readonly QuoteLine[] = [
  { id: "LOCAL_MOVE", reference: "SER-001", family: "Servicios propios", concept: "Servicio local de mudanza", detail: "Personal, supervisión y transporte de origen", quantity: 1, unit: "servicio", cost: 66000, suggested: 92000, economicClass: "PROPIO", status: "CONFIRMED" },
  { id: "PACKING", reference: "SER-002", family: "Servicios propios", concept: "Embalaje y desembalaje", detail: "Materiales y mano de obra según Survey", quantity: 1, unit: "servicio", cost: 20400, suggested: 30600, economicClass: "PROPIO", status: "CONFIRMED" },
  { id: "STORAGE", reference: "SER-003", family: "Servicios propios", concept: "Almacenaje temporal", detail: "Recepción y custodia por 15 días", quantity: 15, unit: "día", cost: 9000, suggested: 13200, economicClass: "PROPIO", status: "CONFIRMED" },
  { id: "CRATING", reference: "CAJ-001", family: "Cajas de madera", concept: "Guacales fabricados en taller", detail: "Nesting, materiales, mano de obra y fabricación", quantity: 2, unit: "caja", cost: 29000, suggested: 42000, economicClass: "PROPIO", status: "CONFIRMED" },
  { id: "ISPM15", reference: "CAJ-002", family: "Cajas de madera", concept: "Tratamiento y certificado ISPM 15", detail: "Proveedor y oferta confirmados", quantity: 1, unit: "lote", cost: 6500, suggested: 6500, economicClass: "EXTERNO", status: "CONFIRMED" },
  { id: "CRANE", reference: "EXT-001", family: "Terceros", concept: "Grúa para acceso especial", detail: "Grúas del Caribe · oferta GC-842 vigente", quantity: 1, unit: "jornada", cost: 22000, suggested: 22000, economicClass: "EXTERNO", status: "CONFIRMED" },
  { id: "THIRD_PARTY_MANAGEMENT", reference: "SER-004", family: "Terceros", concept: "Gestión y coordinación de terceros", detail: "Cargo propio separado del proveedor", quantity: 1, unit: "gestión", cost: 1800, suggested: 5000, economicClass: "PROPIO", status: "CONFIRMED" },
  { id: "OCEAN_FREIGHT", reference: "FLT-001", family: "Fletes", concept: "Flete marítimo", detail: `Oferta externa · USD ${FREIGHT_USD.toLocaleString("en-US")} · tasa fijada ${USD_REFERENCE_RATE}`, quantity: 1, unit: "embarque", cost: Math.round(FREIGHT_USD * USD_REFERENCE_RATE), suggested: Math.round(FREIGHT_USD * USD_REFERENCE_RATE), economicClass: "EXTERNO", status: "CONFIRMED" },
  { id: "CUSTOMS_SERVICE", reference: "ADU-001", family: "Aduanas", concept: "Servicios aduanales", detail: "Honorarios de International Packers", quantity: 1, unit: "gestión", cost: 7000, suggested: 12000, economicClass: "PROPIO", status: "CONFIRMED" },
  { id: "DUTIES", reference: "ADU-002", family: "Aduanas", concept: "Desembolsos aduanales", detail: "No forma parte del ingreso ni del margen", quantity: 1, unit: "expediente", cost: 15000, suggested: 15000, economicClass: "DESEMBOLSO", status: "CONFIRMED" },
  { id: "LONG_CARRY", reference: "ADI-001", family: "Cargos adicionales", concept: "Acarreo largo", detail: "Detectado en Survey · 65 metros", quantity: 1, unit: "evento", cost: 4000, suggested: 6500, economicClass: "PROPIO", status: "CONFIRMED" },
  { id: "RESTRICTED_PERMIT", reference: "PER-001", family: "Permisos", concept: "Permiso de tránsito en zona restringida", detail: "Autoridad y monto todavía pendientes", quantity: 1, unit: "permiso", cost: 0, suggested: 0, economicClass: "DESEMBOLSO", status: "PENDING" },
];

const PROPOSALS: readonly Proposal[] = [
  { id: "P1", name: "Esencial", reference: "COT-ICP001-A", detail: "Traslado y gestión internacional básica", included: ["LOCAL_MOVE", "OCEAN_FREIGHT", "CUSTOMS_SERVICE", "DUTIES"] },
  { id: "P2", name: "Recomendada", reference: "COT-ICP001-B", detail: "Incluye embalaje y protección de madera", included: ["LOCAL_MOVE", "PACKING", "CRATING", "ISPM15", "OCEAN_FREIGHT", "CUSTOMS_SERVICE", "DUTIES", "LONG_CARRY"] },
  { id: "P3", name: "Integral", reference: "COT-ICP001-C", detail: "Cobertura completa con almacenaje, grúa y permiso", included: QUOTE_LINES.map((line) => line.id) },
];

function createInitialPrices() {
  return Object.fromEntries(PROPOSALS.map((proposal) => [proposal.id, Object.fromEntries(QUOTE_LINES.map((line) => [line.id, String(line.suggested)]))])) as Record<ProposalId, Record<string, string>>;
}

function createEmptyLineMap<T>(value: T): Record<ProposalId, T> {
  return { P1: structuredClone(value), P2: structuredClone(value), P3: structuredClone(value) };
}

function EconomicBadge({ value }: Readonly<{ value: EconomicClass }>) {
  const label = value === "PROPIO" ? "Pr" : value === "EXTERNO" ? "Ex" : "De";
  const title = value === "PROPIO" ? "Propio: participa en el margen" : value === "EXTERNO" ? "Externo: costo de proveedor" : "Desembolso: valor trasladado";
  const color = value === "PROPIO" ? "bg-emerald-50 text-emerald-800" : value === "EXTERNO" ? "bg-sky-50 text-sky-800" : "bg-slate-100 text-slate-700";
  return <span title={title} aria-label={title} className={`inline-flex w-7 justify-center rounded py-0.5 text-[10px] font-black ${color}`}>{label}</span>;
}

function additionalDraft(reference: string): AdditionalDraft {
  return { reference, concept: "", quantity: "1", unit: "servicio", cost: "", price: "", economicClass: "PROPIO", status: "PENDING" };
}

export default function QuoteProposalPanel({ permitResolved, onResolvePermit }: Readonly<{ permitResolved: boolean; onResolvePermit: () => void }>) {
  const [activeId, setActiveId] = useState<ProposalId>("P2");
  const [approvedId, setApprovedId] = useState<ProposalId | null>(null);
  const [prices, setPrices] = useState<Record<ProposalId, Record<string, string>>>(createInitialPrices);
  const [removed, setRemoved] = useState<Record<ProposalId, string[]>>(() => createEmptyLineMap<string[]>([]));
  const [additionalLines, setAdditionalLines] = useState<Record<ProposalId, QuoteLine[]>>(() => createEmptyLineMap<QuoteLine[]>([]));
  const [resolvedManual, setResolvedManual] = useState<Record<ProposalId, string[]>>(() => createEmptyLineMap<string[]>([]));
  const [usdRate, setUsdRate] = useState("63.70");
  const [adding, setAdding] = useState(false);
  const [additionalSequence, setAdditionalSequence] = useState(2);
  const [draft, setDraft] = useState<AdditionalDraft>(() => additionalDraft("ADI-002"));

  const currentUsdRate = Number(usdRate) || 0;
  const exchangeCompensation = Math.max(0, Math.round(FREIGHT_USD * (currentUsdRate - USD_REFERENCE_RATE)));
  const activeProposal = PROPOSALS.find((proposal) => proposal.id === activeId) ?? PROPOSALS[0];

  const dynamicBaseLine = (line: QuoteLine): QuoteLine => line.id === "RESTRICTED_PERMIT"
    ? { ...line, cost: permitResolved ? 8500 : 0, suggested: permitResolved ? 8500 : 0, detail: permitResolved ? "Permiso confirmado · Ayuntamiento · ref. PM-26091" : line.detail, status: permitResolved ? "CONFIRMED" : "PENDING" }
    : line;

  const exchangeLine: QuoteLine = {
    id: "FX_VARIATION",
    reference: "CAM-001",
    family: "Cargos adicionales",
    concept: "Compensación por variación cambiaria",
    detail: `Diferencia entre tasa fijada ${USD_REFERENCE_RATE} y tasa vigente ${currentUsdRate.toFixed(2)}`,
    quantity: 1,
    unit: "ajuste",
    cost: exchangeCompensation,
    suggested: exchangeCompensation,
    economicClass: "DESEMBOLSO",
    status: "CONFIRMED",
  };

  const linesForProposal = (proposalId: ProposalId) => {
    const proposal = PROPOSALS.find((item) => item.id === proposalId) ?? PROPOSALS[0];
    const base = QUOTE_LINES.filter((line) => proposal.included.includes(line.id)).map(dynamicBaseLine);
    const withExchange = proposal.included.includes("OCEAN_FREIGHT") && exchangeCompensation > 0 ? [...base, exchangeLine] : base;
    return [...withExchange, ...additionalLines[proposalId]].filter((line) => !removed[proposalId].includes(line.id));
  };

  const lines = useMemo(
    () => linesForProposal(activeId),
    // The proposal calculator is intentionally recomputed from its visible inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeId, additionalLines, removed, permitResolved, exchangeCompensation],
  );
  const values = prices[activeId];
  const quotedValue = (proposalId: ProposalId, line: QuoteLine) => Number(prices[proposalId][line.id] ?? line.suggested) || 0;
  const lineStatus = (proposalId: ProposalId, line: QuoteLine) => resolvedManual[proposalId].includes(line.id) ? "CONFIRMED" : line.status;
  const ownLines = lines.filter((line) => line.economicClass === "PROPIO");
  const ownCost = ownLines.reduce((sum, line) => sum + line.cost, 0);
  const ownRevenue = ownLines.reduce((sum, line) => sum + quotedValue(activeId, line), 0);
  const ownMargin = ownRevenue > 0 ? ((ownRevenue - ownCost) / ownRevenue) * 100 : 0;
  const externalTotal = lines.filter((line) => line.economicClass !== "PROPIO").reduce((sum, line) => sum + quotedValue(activeId, line), 0);
  const total = lines.reduce((sum, line) => sum + quotedValue(activeId, line), 0);
  const pendingCount = lines.filter((line) => lineStatus(activeId, line) === "PENDING").length;
  const marginBlocked = ownMargin < MINIMUM_OWN_MARGIN;
  const quoteBlocked = marginBlocked || pendingCount > 0;

  const proposalTotal = (proposalId: ProposalId) => linesForProposal(proposalId).reduce((sum, line) => sum + quotedValue(proposalId, line), 0);
  const proposalPending = (proposalId: ProposalId) => linesForProposal(proposalId).filter((line) => lineStatus(proposalId, line) === "PENDING").length;
  const invalidateApproval = (proposalId?: ProposalId) => setApprovedId((current) => !proposalId || current === proposalId ? null : current);
  const updatePrice = (lineId: string, value: string) => {
    setPrices((current) => ({ ...current, [activeId]: { ...current[activeId], [lineId]: value } }));
    invalidateApproval(activeId);
  };

  const addAdditional = () => {
    const quantity = Number(draft.quantity);
    const cost = Number(draft.cost);
    const price = Number(draft.price);
    if (!draft.reference.trim() || !draft.concept.trim() || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(cost) || cost < 0 || !Number.isFinite(price) || price < 0) return;
    const id = `MANUAL_${activeId}_${additionalSequence}`;
    const line: QuoteLine = { id, reference: draft.reference.trim().toUpperCase(), family: "Cargos adicionales", concept: draft.concept.trim(), detail: "Concepto introducido manualmente · requiere trazabilidad", quantity, unit: draft.unit.trim() || "servicio", cost, suggested: price, economicClass: draft.economicClass, status: draft.status };
    setAdditionalLines((current) => ({ ...current, [activeId]: [...current[activeId], line] }));
    setPrices((current) => ({ ...current, [activeId]: { ...current[activeId], [id]: String(price) } }));
    setAdditionalSequence((value) => value + 1);
    setDraft(additionalDraft(`ADI-${String(additionalSequence + 1).padStart(3, "0")}`));
    setAdding(false);
    invalidateApproval(activeId);
  };

  const removeLine = (lineId: string) => {
    setRemoved((current) => ({ ...current, [activeId]: [...current[activeId], lineId] }));
    invalidateApproval(activeId);
  };

  const resolveLine = (line: QuoteLine) => {
    if (line.id === "RESTRICTED_PERMIT") {
      onResolvePermit();
      setPrices((current) => ({ ...current, [activeId]: { ...current[activeId], [line.id]: "8500" } }));
    }
    else setResolvedManual((current) => ({ ...current, [activeId]: [...current[activeId], line.id] }));
    invalidateApproval(activeId);
  };

  return <section role="tabpanel" className="rounded-xl border border-slate-200 bg-white shadow-sm" data-testid="quote-proposal-panel">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
      <div><div className="flex items-center gap-2"><h2 className="font-black text-[#003366]">Propuestas de cotización</h2><span className="rounded-full bg-[#003366] px-2 py-1 text-[10px] font-black text-white">3 / 3</span></div><p className="mt-1 text-xs text-slate-500">Tres referencias por caso. Solamente la aprobada por el cliente puede continuar.</p></div>
      <div className="flex gap-1"><button type="button" title="Agregar concepto adicional" aria-label="Agregar concepto adicional" onClick={() => setAdding(true)} className="grid h-9 w-9 place-items-center rounded-md border border-slate-300 bg-white text-[#003366]"><Plus className="h-4 w-4" /></button><button type="button" disabled title="Límite de tres propuestas alcanzado" aria-label="Límite de 3 propuestas alcanzado" className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-slate-100 text-slate-400"><span className="text-[10px] font-black">P+</span></button></div>
    </header>

    <div className="grid border-b border-slate-200 lg:grid-cols-4" data-testid="commercial-context">
      <div className="border-b border-slate-100 px-3 py-2 lg:border-b-0 lg:border-r"><span className="text-[9px] font-black uppercase text-slate-500">Cliente · empresa</span><strong className="block text-xs text-[#003366]">Juan Pérez · Coca-Cola</strong></div>
      <div className="border-b border-slate-100 px-3 py-2 lg:border-b-0 lg:border-r"><span className="text-[9px] font-black uppercase text-slate-500">Lead account · pagador</span><strong className="block text-xs text-[#003366]">Sirva · Sirva (30 días)</strong></div>
      <div className="border-b border-slate-100 px-3 py-2 lg:border-b-0 lg:border-r"><span className="text-[9px] font-black uppercase text-slate-500">Tarifa · asociaciones</span><strong className="block text-xs text-[#003366]">SIRVA-INT-2026 · FIDI/LACMA</strong></div>
      <div className="px-3 py-2"><span className="text-[9px] font-black uppercase text-slate-500">Referido</span><strong className="block text-xs text-[#003366]">Laura Méndez · 3 % interno</strong></div>
    </div>

    <div className="grid border-b border-slate-200 bg-white lg:grid-cols-3" data-testid="proposal-selector">
      {PROPOSALS.map((proposal, index) => {
        const active = proposal.id === activeId;
        const approved = proposal.id === approvedId;
        const count = linesForProposal(proposal.id).length;
        const pending = proposalPending(proposal.id);
        return <button key={proposal.id} type="button" onClick={() => setActiveId(proposal.id)} aria-pressed={active} aria-label={`Propuesta ${index + 1} ${proposal.name}, No. ref. ${proposal.reference}, ${count} conceptos`} className={`border-b-2 px-3 py-2 text-left lg:border-r ${active ? "border-b-[#0070a8] bg-sky-50/60" : "border-b-transparent hover:bg-slate-50"}`}>
          <div className="flex items-center justify-between gap-2"><strong className="text-sm text-[#003366]">{proposal.name}</strong>{approved ? <span className="flex items-center gap-1 text-[9px] font-black uppercase text-emerald-700"><CheckCircle2 className="h-3 w-3" />Aprobada</span> : pending > 0 ? <span className="text-[9px] font-black uppercase text-amber-700">{pending} pendiente</span> : <span className="text-[9px] uppercase text-slate-400">Borrador</span>}</div>
          <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-slate-500"><span>No. ref. <b>{proposal.reference}</b> · {count} conceptos</span><strong className="text-xs text-slate-800">{money.format(proposalTotal(proposal.id))}</strong></div>
        </button>;
      })}
    </div>

    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-slate-200 bg-[#f8fafc] px-3 py-2 text-[10px]" data-testid="exchange-control">
      <span><b>Moneda base:</b> DOP</span><span><b>USD fijada:</b> {USD_REFERENCE_RATE}</span><label className="flex items-center gap-2"><b>USD vigente:</b><input aria-label="Tasa USD vigente" type="number" min="0" step="0.01" value={usdRate} onChange={(event) => { setUsdRate(event.target.value); invalidateApproval(); }} className="h-7 w-20 rounded border border-slate-300 bg-white px-2 text-right font-bold" /></label><span className={exchangeCompensation > 0 ? "font-bold text-amber-800" : "text-slate-500"}>Compensación: {money.format(exchangeCompensation)}</span><span className="ml-auto text-slate-500">Impuestos: etapa posterior</span>
    </div>

    {adding && <div className="grid gap-2 border-b border-sky-200 bg-sky-50/60 p-3 sm:grid-cols-2 lg:grid-cols-[100px_minmax(180px,1fr)_70px_90px_90px_105px_105px_110px_70px]" data-testid="additional-concept-form">
      <label><span className="text-[9px] font-black uppercase text-slate-500">Ref.</span><input aria-label="Referencia adicional" value={draft.reference} onChange={(event) => setDraft({ ...draft, reference: event.target.value })} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs" /></label>
      <label><span className="text-[9px] font-black uppercase text-slate-500">Concepto</span><input aria-label="Concepto adicional" value={draft.concept} onChange={(event) => setDraft({ ...draft, concept: event.target.value })} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs" /></label>
      <label><span className="text-[9px] font-black uppercase text-slate-500">Cant.</span><input aria-label="Cantidad adicional" type="number" min="0.01" step="0.01" value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: event.target.value })} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-right text-xs" /></label>
      <label><span className="text-[9px] font-black uppercase text-slate-500">Unidad</span><input aria-label="Unidad adicional" value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs" /></label>
      <label><span className="text-[9px] font-black uppercase text-slate-500">Clase</span><select aria-label="Clase económica adicional" value={draft.economicClass} onChange={(event) => setDraft({ ...draft, economicClass: event.target.value as EconomicClass })} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-1 text-xs"><option value="PROPIO">Pr</option><option value="EXTERNO">Ex</option><option value="DESEMBOLSO">De</option></select></label>
      <label><span className="text-[9px] font-black uppercase text-slate-500">Costo</span><input aria-label="Costo adicional" type="number" min="0" value={draft.cost} onChange={(event) => setDraft({ ...draft, cost: event.target.value })} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-right text-xs" /></label>
      <label><span className="text-[9px] font-black uppercase text-slate-500">Cotizado</span><input aria-label="Precio adicional" type="number" min="0" value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-right text-xs" /></label>
      <label><span className="text-[9px] font-black uppercase text-slate-500">Estado</span><select aria-label="Estado adicional" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as LineStatus })} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-1 text-xs"><option value="PENDING">Pendiente</option><option value="CONFIRMED">Confirmado</option></select></label>
      <div className="flex items-end gap-1"><button type="button" title="Guardar concepto" aria-label="Guardar concepto adicional" onClick={addAdditional} className="grid h-8 w-8 place-items-center rounded bg-[#003366] text-white"><Check className="h-4 w-4" /></button><button type="button" title="Cancelar" aria-label="Cancelar concepto adicional" onClick={() => setAdding(false)} className="grid h-8 w-8 place-items-center text-slate-500"><X className="h-4 w-4" /></button></div>
    </div>}

    <div className="overflow-x-auto" data-testid="quote-lines-table"><div className="min-w-[920px]">
      <div className="grid grid-cols-[70px_minmax(210px,1.5fr)_55px_45px_88px_100px_130px_76px] bg-[#edf2f7] px-3 py-2 text-[10px] font-black uppercase tracking-[.05em] text-slate-500"><span>Ref.</span><span>Concepto</span><span>Cant.</span><span>Clase</span><span>Costo</span><span>Sugerido</span><span>Cotizado</span><span>Estado</span></div>
      {lines.map((line, index) => {
        const quoted = quotedValue(activeId, line);
        const lower = quoted < line.suggested;
        const higher = quoted > line.suggested;
        const status = lineStatus(activeId, line);
        const inputColor = lower ? "border-rose-400 bg-rose-50 text-rose-800" : higher ? "border-sky-400 bg-sky-50 text-sky-800" : "border-slate-200 bg-white text-slate-800";
        return <div key={line.id} className={`grid grid-cols-[70px_minmax(210px,1.5fr)_55px_45px_88px_100px_130px_76px] items-center px-3 py-2 text-xs ${status === "PENDING" ? "bg-amber-50" : index % 2 ? "bg-slate-50/70" : "bg-white"}`}>
          <span className="font-mono text-[10px] font-bold text-slate-600">{line.reference}</span><div className="min-w-0 pr-3"><strong className="text-slate-800">{line.concept}</strong><p className="mt-0.5 truncate text-[10px] text-slate-500" title={`${line.family} · ${line.detail}`}>{line.unit} · {line.family} · {line.detail}</p></div><span>{line.quantity}</span><EconomicBadge value={line.economicClass} /><span>{money.format(line.cost)}</span><strong className="text-[#003366]">{status === "PENDING" ? "Por confirmar" : money.format(line.suggested)}</strong>
          <label className="relative"><span className="sr-only">Precio cotizado de {line.concept}</span><input aria-label={`Precio cotizado de ${line.concept}`} type="number" min="0" value={values[line.id] ?? line.suggested} onChange={(event) => updatePrice(line.id, event.target.value)} disabled={status === "PENDING"} className={`h-8 w-full rounded-md border px-2 pr-7 text-right font-bold outline-none focus:ring-2 focus:ring-sky-100 disabled:bg-slate-100 disabled:text-slate-400 ${inputColor}`} />{lower && status !== "PENDING" ? <ChevronDown aria-label="Precio reducido" className="absolute right-2 top-2 h-4 w-4 text-rose-700" /> : higher && status !== "PENDING" ? <ChevronUp aria-label="Precio aumentado" className="absolute right-2 top-2 h-4 w-4 text-sky-700" /> : null}</label>
          <div className="flex items-center gap-1">{status === "PENDING" ? <button type="button" title="Resolver pendiente" aria-label={`Resolver pendiente ${line.concept}`} onClick={() => resolveLine(line)} className="grid h-7 w-7 place-items-center text-amber-800"><AlertTriangle className="h-4 w-4" /></button> : <Check className="h-4 w-4 text-emerald-700" />}<button type="button" title="Eliminar cargo" aria-label={`Eliminar ${line.concept}`} onClick={() => removeLine(line.id)} className="grid h-7 w-7 place-items-center text-rose-600"><Trash2 className="h-4 w-4" /></button></div>
        </div>;
      })}
    </div></div>

    <div className="grid border-t border-slate-200 lg:grid-cols-[minmax(0,1fr)_430px]">
      <div className="space-y-2 p-4"><div className={`flex items-start gap-3 border-l-4 px-3 py-2 ${quoteBlocked ? "border-rose-500 bg-rose-50 text-rose-900" : "border-emerald-500 bg-emerald-50 text-emerald-900"}`}>{quoteBlocked ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <Check className="mt-0.5 h-4 w-4 shrink-0" />}<p className="text-xs leading-5"><strong>{pendingCount > 0 ? `Cotización bloqueada: ${pendingCount} pendiente${pendingCount === 1 ? "" : "s"}.` : marginBlocked ? "Margen bloqueado." : "Lista para aprobación."}</strong> {pendingCount > 0 ? "Confirma el monto y servicio o elimina el cargo pendiente." : `El margen mínimo administrativo es ${MINIMUM_OWN_MARGIN} %.`}</p></div><p className="text-[10px] text-slate-500">Pr: propio · Ex: externo · De: desembolso. Los impuestos se definirán en una etapa posterior.</p>{approvedId && <p role="status" className="flex items-center gap-2 text-xs font-semibold text-emerald-800"><FileCheck2 className="h-4 w-4" />{PROPOSALS.find((proposal) => proposal.id === approvedId)?.name} es la única propuesta aprobada y habilitada para continuar.</p>}</div>
      <aside className="border-l border-slate-200 bg-[#f8fafc] p-4" data-testid="quote-summary"><div className="grid grid-cols-2 gap-x-5 gap-y-2 text-sm"><span className="text-slate-500">Servicios propios</span><strong className="text-right">{money.format(ownRevenue)}</strong><span className="text-slate-500">Costos propios</span><strong className="text-right">{money.format(ownCost)}</strong><span className="text-slate-500">Externos y desembolsos</span><strong className="text-right">{money.format(externalTotal)}</strong><span className="text-slate-500">Compensación cambiaria</span><strong className="text-right text-amber-800">{money.format(exchangeCompensation)}</strong><span className="text-slate-500">Margen propio</span><strong className={`text-right ${marginBlocked ? "text-rose-700" : "text-emerald-700"}`}>{ownMargin.toFixed(1)} %</strong><span className="border-t border-slate-200 pt-2 font-bold text-[#003366]">Total propuesta</span><strong className="border-t border-slate-200 pt-2 text-right text-[#003366]">{money.format(total)}</strong></div><div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3"><span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500"><LockKeyhole className="h-3.5 w-3.5" />Selección exclusiva</span><button type="button" title={approvedId === activeId ? "Propuesta ya aprobada" : pendingCount > 0 ? "Resuelve los cargos pendientes" : marginBlocked ? "Requiere aprobación administrativa del margen" : `Registrar aprobación del cliente para ${activeProposal.name}`} aria-label={approvedId === activeId ? `${activeProposal.name} aprobada por el cliente` : `Registrar aprobación del cliente para ${activeProposal.name}`} disabled={quoteBlocked || approvedId === activeId} onClick={() => setApprovedId(activeId)} className={`grid h-9 w-9 place-items-center rounded-md text-white ${approvedId === activeId ? "bg-emerald-600" : quoteBlocked ? "bg-slate-300" : "bg-[#003366]"}`}><CheckCircle2 className="h-4 w-4" /></button></div></aside>
    </div>
  </section>;
}
