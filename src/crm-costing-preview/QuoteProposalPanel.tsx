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
} from "lucide-react";

type ProposalId = "P1" | "P2" | "P3";
type QuoteFamily = "Servicios propios" | "Terceros" | "Fletes" | "Cajas de madera" | "Aduanas" | "Cargos adicionales";
type EconomicClass = "PROPIO" | "TRASLADADO" | "DESEMBOLSO";

type QuoteLine = Readonly<{
  id: string;
  family: QuoteFamily;
  concept: string;
  detail: string;
  cost: number;
  suggested: number;
  economicClass: EconomicClass;
}>;

type Proposal = Readonly<{
  id: ProposalId;
  name: string;
  detail: string;
  included: readonly string[];
}>;

const MINIMUM_OWN_MARGIN = 24;
const money = new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP", maximumFractionDigits: 0 });

const QUOTE_LINES: readonly QuoteLine[] = [
  { id: "LOCAL_MOVE", family: "Servicios propios", concept: "Servicio local de mudanza", detail: "Personal, supervisión y transporte de origen", cost: 66000, suggested: 92000, economicClass: "PROPIO" },
  { id: "PACKING", family: "Servicios propios", concept: "Embalaje y desembalaje", detail: "Materiales y mano de obra según Survey", cost: 20400, suggested: 30600, economicClass: "PROPIO" },
  { id: "STORAGE", family: "Servicios propios", concept: "Almacenaje temporal", detail: "Recepción y custodia por 15 días", cost: 9000, suggested: 13200, economicClass: "PROPIO" },
  { id: "CRATING", family: "Cajas de madera", concept: "Guacales fabricados en taller", detail: "Materiales, mano de obra e indirectos", cost: 29000, suggested: 42000, economicClass: "PROPIO" },
  { id: "ISPM15", family: "Cajas de madera", concept: "Tratamiento y certificado ISPM 15", detail: "Costo externo confirmado", cost: 6500, suggested: 6500, economicClass: "TRASLADADO" },
  { id: "CRANE", family: "Terceros", concept: "Grúa para acceso especial", detail: "Proveedor seleccionado y oferta vigente", cost: 22000, suggested: 22000, economicClass: "TRASLADADO" },
  { id: "THIRD_PARTY_MANAGEMENT", family: "Terceros", concept: "Gestión y coordinación de terceros", detail: "Cargo propio separado del proveedor", cost: 1800, suggested: 5000, economicClass: "PROPIO" },
  { id: "OCEAN_FREIGHT", family: "Fletes", concept: "Flete marítimo", detail: "Oferta externa · 25.5 m³ · vigencia verificada", cost: 85000, suggested: 85000, economicClass: "TRASLADADO" },
  { id: "CUSTOMS_SERVICE", family: "Aduanas", concept: "Servicios aduanales", detail: "Honorarios de International Packers", cost: 7000, suggested: 12000, economicClass: "PROPIO" },
  { id: "DUTIES", family: "Aduanas", concept: "Impuestos y desembolsos aduanales", detail: "No forma parte del ingreso ni del margen", cost: 15000, suggested: 15000, economicClass: "DESEMBOLSO" },
  { id: "LONG_CARRY", family: "Cargos adicionales", concept: "Acarreo largo", detail: "Detectado en Survey · 65 metros", cost: 4000, suggested: 6500, economicClass: "PROPIO" },
];

const PROPOSALS: readonly Proposal[] = [
  { id: "P1", name: "Esencial", detail: "Traslado y gestión internacional básica", included: ["LOCAL_MOVE", "OCEAN_FREIGHT", "CUSTOMS_SERVICE", "DUTIES"] },
  { id: "P2", name: "Recomendada", detail: "Incluye embalaje y protección de madera", included: ["LOCAL_MOVE", "PACKING", "CRATING", "ISPM15", "OCEAN_FREIGHT", "CUSTOMS_SERVICE", "DUTIES", "LONG_CARRY"] },
  { id: "P3", name: "Integral", detail: "Cobertura completa con almacenaje y grúa", included: QUOTE_LINES.map((line) => line.id) },
];

function createInitialPrices() {
  return Object.fromEntries(PROPOSALS.map((proposal) => [proposal.id, Object.fromEntries(QUOTE_LINES.map((line) => [line.id, String(line.suggested)]))])) as Record<ProposalId, Record<string, string>>;
}

function EconomicBadge({ value }: Readonly<{ value: EconomicClass }>) {
  const label = value === "PROPIO" ? "Propio" : value === "TRASLADADO" ? "Externo" : "Desembolso";
  const color = value === "PROPIO" ? "bg-emerald-50 text-emerald-800" : value === "TRASLADADO" ? "bg-sky-50 text-sky-800" : "bg-slate-100 text-slate-600";
  return <span className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${color}`}>{label}</span>;
}

export default function QuoteProposalPanel() {
  const [activeId, setActiveId] = useState<ProposalId>("P2");
  const [approvedId, setApprovedId] = useState<ProposalId | null>(null);
  const [prices, setPrices] = useState<Record<ProposalId, Record<string, string>>>(createInitialPrices);
  const activeProposal = PROPOSALS.find((proposal) => proposal.id === activeId) ?? PROPOSALS[0];
  const lines = useMemo(() => QUOTE_LINES.filter((line) => activeProposal.included.includes(line.id)), [activeProposal]);
  const values = prices[activeId];
  const ownLines = lines.filter((line) => line.economicClass === "PROPIO");
  const ownCost = ownLines.reduce((sum, line) => sum + line.cost, 0);
  const ownRevenue = ownLines.reduce((sum, line) => sum + Number(values[line.id] || 0), 0);
  const ownMargin = ownRevenue > 0 ? ((ownRevenue - ownCost) / ownRevenue) * 100 : 0;
  const externalTotal = lines.filter((line) => line.economicClass !== "PROPIO").reduce((sum, line) => sum + Number(values[line.id] || 0), 0);
  const total = lines.reduce((sum, line) => sum + Number(values[line.id] || 0), 0);
  const marginBlocked = ownMargin < MINIMUM_OWN_MARGIN;

  const proposalTotal = (proposal: Proposal) => proposal.included.reduce((sum, id) => sum + Number(prices[proposal.id][id] || 0), 0);
  const updatePrice = (lineId: string, value: string) => setPrices((current) => ({
    ...current,
    [activeId]: { ...current[activeId], [lineId]: value },
  }));

  return <section role="tabpanel" className="rounded-xl border border-slate-200 bg-white shadow-sm" data-testid="quote-proposal-panel">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
      <div><div className="flex items-center gap-2"><h2 className="font-black text-[#003366]">Propuestas de cotización</h2><span className="rounded-full bg-[#003366] px-2 py-1 text-[10px] font-black text-white">3 / 3</span></div><p className="mt-1 text-xs text-slate-500">Máximo tres alternativas por caso. Solamente una puede quedar aprobada por el cliente.</p></div>
      <button type="button" disabled title="Límite de tres propuestas alcanzado" aria-label="Límite de 3 propuestas alcanzado" className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-slate-100 text-slate-400"><Plus className="h-4 w-4" /></button>
    </header>

    <div className="grid gap-2 border-b border-slate-200 p-3 lg:grid-cols-3" data-testid="proposal-selector">
      {PROPOSALS.map((proposal, index) => {
        const active = proposal.id === activeId;
        const approved = proposal.id === approvedId;
        return <button key={proposal.id} type="button" onClick={() => setActiveId(proposal.id)} aria-pressed={active} className={`relative rounded-lg border p-3 text-left ${active ? "border-[#0070a8] bg-sky-50 ring-1 ring-[#0070a8]" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
          <div className="flex items-start justify-between gap-2"><span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Propuesta {index + 1}</span>{approved && <span className="flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black uppercase text-emerald-800"><CheckCircle2 className="h-3 w-3" />Aprobada</span>}</div>
          <strong className="mt-1 block text-sm text-[#003366]">{proposal.name}</strong><p className="mt-0.5 text-[10px] text-slate-500">{proposal.detail}</p><strong className="mt-2 block text-sm">{money.format(proposalTotal(proposal))}</strong>
        </button>;
      })}
    </div>

    <div className="overflow-x-auto" data-testid="quote-lines-table"><div className="min-w-[920px]">
      <div className="grid grid-cols-[minmax(270px,1.5fr)_125px_115px_125px_155px] bg-[#edf2f7] px-3 py-2 text-[10px] font-black uppercase tracking-[.05em] text-slate-500"><span>Concepto</span><span>Clasificación</span><span>Costo</span><span>Precio sugerido</span><span>Precio cotizado</span></div>
      {lines.map((line, index) => {
        const quoted = Number(values[line.id] || 0);
        const lower = quoted < line.suggested;
        const higher = quoted > line.suggested;
        const inputColor = lower ? "border-rose-400 bg-rose-50 text-rose-800" : higher ? "border-sky-400 bg-sky-50 text-sky-800" : "border-slate-200 bg-white text-slate-800";
        return <div key={line.id} className={`grid grid-cols-[minmax(270px,1.5fr)_125px_115px_125px_155px] items-center px-3 py-2 text-xs ${index % 2 ? "bg-slate-50/70" : "bg-white"}`}>
          <div className="pr-3"><strong className="text-slate-800">{line.concept}</strong><p className="mt-0.5 truncate text-[10px] text-slate-500" title={line.detail}>{line.family} · {line.detail}</p></div>
          <EconomicBadge value={line.economicClass} /><span>{money.format(line.cost)}</span><strong className="text-[#003366]">{money.format(line.suggested)}</strong>
          <label className="relative"><span className="sr-only">Precio cotizado de {line.concept}</span><input aria-label={`Precio cotizado de ${line.concept}`} type="number" min="0" value={values[line.id]} onChange={(event) => updatePrice(line.id, event.target.value)} className={`h-8 w-full rounded-md border px-2 pr-7 text-right font-bold outline-none focus:ring-2 focus:ring-sky-100 ${inputColor}`} />{lower ? <ChevronDown aria-label="Precio reducido" className="absolute right-2 top-2 h-4 w-4 text-rose-700" /> : higher ? <ChevronUp aria-label="Precio aumentado" className="absolute right-2 top-2 h-4 w-4 text-sky-700" /> : null}</label>
        </div>;
      })}
    </div></div>

    <div className="grid border-t border-slate-200 lg:grid-cols-[minmax(0,1fr)_430px]">
      <div className="space-y-3 p-4"><div className={`flex items-start gap-3 rounded-lg border p-3 ${marginBlocked ? "border-rose-300 bg-rose-50 text-rose-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>{marginBlocked ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <Check className="mt-0.5 h-4 w-4 shrink-0" />}<p className="text-xs leading-5"><strong>{marginBlocked ? "Margen bloqueado." : "Margen propio protegido."}</strong> El mínimo administrativo para este servicio es {MINIMUM_OWN_MARGIN} %. Terceros, fletes, impuestos y desembolsos no participan en este cálculo.</p></div>{approvedId && <p role="status" className="flex items-center gap-2 text-xs font-semibold text-emerald-800"><FileCheck2 className="h-4 w-4" />{PROPOSALS.find((proposal) => proposal.id === approvedId)?.name} es la única propuesta aprobada y habilitada para continuar.</p>}</div>
      <aside className="border-l border-slate-200 bg-[#f8fafc] p-4" data-testid="quote-summary"><div className="grid grid-cols-2 gap-x-5 gap-y-2 text-sm"><span className="text-slate-500">Servicios propios</span><strong className="text-right">{money.format(ownRevenue)}</strong><span className="text-slate-500">Costos propios</span><strong className="text-right">{money.format(ownCost)}</strong><span className="text-slate-500">Externos y desembolsos</span><strong className="text-right">{money.format(externalTotal)}</strong><span className="text-slate-500">Margen propio</span><strong className={`text-right ${marginBlocked ? "text-rose-700" : "text-emerald-700"}`}>{ownMargin.toFixed(1)} %</strong><span className="border-t border-slate-200 pt-2 font-bold text-[#003366]">Total propuesta</span><strong className="border-t border-slate-200 pt-2 text-right text-[#003366]">{money.format(total)}</strong></div><div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3"><span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500"><LockKeyhole className="h-3.5 w-3.5" />Selección exclusiva</span><button type="button" title={approvedId === activeId ? "Propuesta ya aprobada" : marginBlocked ? "Requiere aprobación administrativa del margen" : `Registrar aprobación del cliente para ${activeProposal.name}`} aria-label={approvedId === activeId ? `${activeProposal.name} aprobada por el cliente` : `Registrar aprobación del cliente para ${activeProposal.name}`} disabled={marginBlocked || approvedId === activeId} onClick={() => setApprovedId(activeId)} className={`grid h-9 w-9 place-items-center rounded-md text-white ${approvedId === activeId ? "bg-emerald-600" : marginBlocked ? "bg-slate-300" : "bg-[#003366]"}`}><CheckCircle2 className="h-4 w-4" /></button></div></aside>
    </div>
  </section>;
}
