import { useMemo, useState, type ComponentType } from "react";
import {
  ArrowLeft, BarChart3, BriefcaseBusiness, Calculator, Check, ChevronDown, ClipboardCheck,
  Eye, EyeOff, FileText, History, LayoutGrid, ListChecks, LockKeyhole, MessageSquare,
  PackageCheck, Paperclip, Settings2, ShieldCheck, StickyNote, Truck, Users, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import AdminLogisticEnginePreview from "@/crm-costing-preview/AdminLogisticEnginePreview";
import CaseManagementPanel from "@/crm-costing-preview/CaseManagementPanel";
import QuoteProposalPanel from "@/crm-costing-preview/QuoteProposalPanel";

type CaseTab = "SUMMARY" | "SERVICES" | "SURVEY" | "COSTING" | "MANAGEMENT" | "ACTIVITY" | "TASKS" | "QUOTE" | "NOTES" | "FILES" | "COMMUNICATION";
type CostFamily = "Personal" | "Transporte" | "Materiales" | "Cajas de madera" | "Equipos" | "Compensaciones" | "Terceros" | "Fletes" | "Aduanas" | "Cargos adicionales" | "Riesgo";
type CostSource = "SURVEY" | "SERVICIO" | "COMBO" | "ADMIN" | "MOTOR" | "PROVEEDOR";
type BillingMode = "INCLUIDO" | "EXTRA" | "TRASLADADO" | "NO COBRABLE";

type CostRow = Readonly<{
  id: string;
  family: CostFamily;
  concept: string;
  detail: string;
  qty: number;
  unit: string;
  unitCost: number;
  cost: number;
  billing: BillingMode;
  price: number;
  source: CostSource;
  service: string;
  marginBearing: boolean;
}>;

const TABS: ReadonlyArray<readonly [CaseTab, string, ComponentType<{ className?: string }>]> = [
  ["SUMMARY", "Resumen", FileText], ["SERVICES", "Servicios", BriefcaseBusiness],
  ["SURVEY", "Survey", ClipboardCheck], ["COSTING", "Costos", Calculator],
  ["MANAGEMENT", "Gestiones", ListChecks],
  ["ACTIVITY", "Actividad", History], ["TASKS", "Tareas", ListChecks],
  ["QUOTE", "Cotización", BriefcaseBusiness], ["NOTES", "Notas", StickyNote],
  ["FILES", "Archivos", Paperclip], ["COMMUNICATION", "Comunicación", MessageSquare],
];

const COST_ROWS: readonly CostRow[] = [
  { id: "SUPERVISOR", family: "Personal", concept: "Supervisor", detail: "1 persona × 2 jornadas", qty: 2, unit: "persona-jornada", unitCost: 4500, cost: 9000, billing: "INCLUIDO", price: 12600, source: "SERVICIO", service: "Mudanza residencial", marginBearing: true },
  { id: "CREW", family: "Personal", concept: "Personal operativo", detail: "6 personas × 2 jornadas", qty: 12, unit: "persona-jornada", unitCost: 1800, cost: 21600, billing: "INCLUIDO", price: 30240, source: "SURVEY", service: "Carga y descarga", marginBearing: true },
  { id: "DRIVER", family: "Personal", concept: "Chofer", detail: "1 chofer × 2 jornadas", qty: 2, unit: "persona-jornada", unitCost: 2500, cost: 5000, billing: "INCLUIDO", price: 6500, source: "SERVICIO", service: "Transporte local", marginBearing: true },
  { id: "TRUCK", family: "Transporte", concept: "Camión cerrado 24 pies", detail: "Capacidad validada después del Survey: 25.5 m³", qty: 2, unit: "camión-jornada", unitCost: 18000, cost: 36000, billing: "INCLUIDO", price: 45000, source: "SURVEY", service: "Transporte local", marginBearing: true },
  { id: "DISTANCE", family: "Transporte", concept: "Recorrido operativo", detail: "Base → origen → destino → retorno", qty: 42, unit: "km", unitCost: 70, cost: 2940, billing: "INCLUIDO", price: 4200, source: "MOTOR", service: "Transporte local", marginBearing: true },
  { id: "PACKING", family: "Materiales", concept: "Material de embalaje", detail: "Proyección por inventario y nivel de protección", qty: 25.5, unit: "m³", unitCost: 800, cost: 20400, billing: "INCLUIDO", price: 30600, source: "SURVEY", service: "Embalaje y desembalaje", marginBearing: true },
  { id: "CRATING", family: "Cajas de madera", concept: "Guacales fabricados en taller", detail: "2 artículos señalados para protección especial", qty: 2, unit: "unidad", unitCost: 14500, cost: 29000, billing: "EXTRA", price: 42000, source: "SURVEY", service: "Crating o guacales", marginBearing: true },
  { id: "FUMIGATION", family: "Cajas de madera", concept: "Tratamiento y certificado ISPM 15", detail: "Oferta externa confirmada", qty: 1, unit: "lote", unitCost: 6500, cost: 6500, billing: "TRASLADADO", price: 6500, source: "PROVEEDOR", service: "Crating o guacales", marginBearing: false },
  { id: "RIGGING", family: "Equipos", concept: "Rigging y elevación", detail: "Equipo propio para acceso especial", qty: 1, unit: "evento", unitCost: 14000, cost: 14000, billing: "EXTRA", price: 21000, source: "COMBO", service: "Elevación o rigging", marginBearing: true },
  { id: "ALLOWANCES", family: "Compensaciones", concept: "Dietas operativas", detail: "Equipo autorizado · 2 jornadas", qty: 14, unit: "asignación", unitCost: 600, cost: 8400, billing: "INCLUIDO", price: 10500, source: "MOTOR", service: "Mudanza residencial", marginBearing: true },
  { id: "CRANE", family: "Terceros", concept: "Grúa contratada", detail: "Costo del proveedor separado de nuestra gestión", qty: 1, unit: "evento", unitCost: 22000, cost: 22000, billing: "TRASLADADO", price: 22000, source: "PROVEEDOR", service: "Acceso especial", marginBearing: false },
  { id: "THIRD_PARTY_MANAGEMENT", family: "Terceros", concept: "Gestión de terceros", detail: "Coordinación y seguimiento de la grúa", qty: 1, unit: "gestión", unitCost: 1800, cost: 1800, billing: "EXTRA", price: 5000, source: "SERVICIO", service: "Gestión logística", marginBearing: true },
  { id: "OCEAN_FREIGHT", family: "Fletes", concept: "Flete marítimo", detail: "Oferta externa vigente · 25.5 m³", qty: 1, unit: "embarque", unitCost: 85000, cost: 85000, billing: "TRASLADADO", price: 85000, source: "PROVEEDOR", service: "Exportación", marginBearing: false },
  { id: "CUSTOMS_SERVICE", family: "Aduanas", concept: "Servicios aduanales", detail: "Honorarios propios de International Packers", qty: 1, unit: "gestión", unitCost: 7000, cost: 7000, billing: "EXTRA", price: 12000, source: "SERVICIO", service: "Gestión aduanal", marginBearing: true },
  { id: "DUTIES", family: "Aduanas", concept: "Impuestos y desembolsos", detail: "No forman parte del ingreso ni del margen", qty: 1, unit: "expediente", unitCost: 15000, cost: 15000, billing: "TRASLADADO", price: 15000, source: "PROVEEDOR", service: "Gestión aduanal", marginBearing: false },
  { id: "LONG_CARRY", family: "Cargos adicionales", concept: "Acarreo largo", detail: "Detectado en Survey · 65 metros", qty: 1, unit: "evento", unitCost: 4000, cost: 4000, billing: "EXTRA", price: 6500, source: "SURVEY", service: "Mudanza residencial", marginBearing: true },
  { id: "CONTINGENCY", family: "Riesgo", concept: "Contingencia operativa", detail: "Acceso especial · requiere aprobación", qty: 1, unit: "evento", unitCost: 8000, cost: 8000, billing: "NO COBRABLE", price: 0, source: "ADMIN", service: "Mudanza residencial", marginBearing: false },
];

const FAMILY_ORDER: readonly CostFamily[] = ["Personal", "Transporte", "Materiales", "Cajas de madera", "Equipos", "Compensaciones", "Terceros", "Fletes", "Aduanas", "Cargos adicionales", "Riesgo"];
const money = new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP", maximumFractionDigits: 0 });

function SourceBadge({ source }: Readonly<{ source: CostSource }>) {
  const color = source === "SURVEY" ? "bg-sky-100 text-sky-800" : source === "SERVICIO" || source === "COMBO" ? "bg-indigo-100 text-indigo-800" : source === "PROVEEDOR" ? "bg-amber-100 text-amber-900" : source === "MOTOR" ? "bg-violet-100 text-violet-800" : "bg-slate-200 text-slate-700";
  return <span className={`rounded px-1.5 py-0.5 text-[9px] font-black ${color}`}>{source}</span>;
}

function BillingBadge({ mode }: Readonly<{ mode: BillingMode }>) {
  const color = mode === "EXTRA" ? "text-amber-800" : mode === "TRASLADADO" ? "text-sky-800" : mode === "NO COBRABLE" ? "text-slate-500" : "text-emerald-700";
  return <span className={`text-[10px] font-black ${color}`}>{mode}</span>;
}

function CostingPanel({ onOpenEngine }: Readonly<{ onOpenEngine(): void }>) {
  const [showInternalCost, setShowInternalCost] = useState(true);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [openFamilies, setOpenFamilies] = useState<CostFamily[]>(["Personal"]);
  const [sent, setSent] = useState(false);
  const activeRows = useMemo(() => COST_ROWS.filter((row) => !excluded.includes(row.id)), [excluded]);
  const ownRows = activeRows.filter((row) => row.marginBearing);
  const totalCost = ownRows.reduce((sum, row) => sum + row.cost, 0);
  const externalCost = activeRows.filter((row) => !row.marginBearing).reduce((sum, row) => sum + row.cost, 0);
  const ownPrice = ownRows.reduce((sum, row) => sum + row.price, 0);
  const totalPrice = activeRows.reduce((sum, row) => sum + row.price, 0);
  const grossMargin = ownPrice > 0 ? ((ownPrice - totalCost) / ownPrice) * 100 : 0;
  const toggleFamily = (family: CostFamily) => setOpenFamilies((current) => current.includes(family) ? current.filter((item) => item !== family) : [...current, family]);
  return <section role="tabpanel" aria-labelledby="costing-heading" className="rounded-xl border border-slate-200 bg-white shadow-sm" data-testid="costing-case-panel">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3"><div><div className="flex flex-wrap items-center gap-2"><h2 id="costing-heading" className="font-black text-[#003366]">Evaluación automática de costos</h2><span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold uppercase text-emerald-800">Survey publicado</span><span className="rounded-full bg-sky-100 px-2 py-1 text-[10px] font-bold uppercase text-sky-800">Escenario 1</span></div><p className="mt-1 text-xs text-slate-500">Recursos propios, cargos externos y advertencias. Aún no constituye una cotización.</p></div><div className="flex gap-1"><button type="button" title={showInternalCost ? "Ocultar costos internos" : "Mostrar costos internos"} aria-label={showInternalCost ? "Ocultar costos internos" : "Mostrar costos internos"} onClick={() => setShowInternalCost((value) => !value)} className="grid h-9 w-9 place-items-center rounded-md border border-slate-300 bg-white text-[#003366]">{showInternalCost ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button><button type="button" title="Abrir Motor Logístico en Administración" aria-label="Abrir Motor Logístico en Administración" onClick={onOpenEngine} className="grid h-9 w-9 place-items-center rounded-md border border-slate-300 bg-white text-[#003366]"><Settings2 className="h-4 w-4" /></button></div></header>
    <div className="grid gap-3 border-b border-slate-200 p-3 sm:grid-cols-2 xl:grid-cols-4"><div className="flex items-center gap-3 border-r border-slate-100 px-2"><ClipboardCheck className="h-5 w-5 text-sky-700" /><div><span className="text-[10px] font-bold uppercase text-slate-500">Base Survey</span><strong className="block text-sm text-[#003366]">25.5 m³ · 2 jornadas</strong></div></div><div className="flex items-center gap-3 border-r border-slate-100 px-2"><PackageCheck className="h-5 w-5 text-indigo-700" /><div><span className="text-[10px] font-bold uppercase text-slate-500">Servicios</span><strong className="block text-sm text-[#003366]">1 principal · 6 incluidos</strong></div></div><div className="flex items-center gap-3 border-r border-slate-100 px-2"><Truck className="h-5 w-5 text-amber-700" /><div><span className="text-[10px] font-bold uppercase text-slate-500">Plan operativo</span><strong className="block text-sm text-[#003366]">7 personas · 1 camión</strong></div></div><div className="flex items-center gap-3 px-2"><ShieldCheck className="h-5 w-5 text-emerald-700" /><div><span className="text-[10px] font-bold uppercase text-slate-500">Reglas aplicadas</span><strong className="block text-sm text-[#003366]">Versión 4 · DOP</strong></div></div></div>
    <div className="overflow-x-auto" data-testid="cost-lines-table"><div className="min-w-[900px]"><div className="grid grid-cols-[minmax(260px,1.6fr)_115px_92px_120px_100px_120px_34px] bg-[#edf2f7] px-3 py-2 text-[10px] font-black uppercase tracking-[.05em] text-slate-500"><span>Recurso / origen</span><span>Cantidad</span><span>Costo unit.</span><span>Costo interno</span><span>Tratamiento</span><span>Precio sugerido</span><span></span></div>{FAMILY_ORDER.map((family) => { const rows = COST_ROWS.filter((row) => row.family === family); const familyOpen = openFamilies.includes(family); const familyActive = rows.filter((row) => !excluded.includes(row.id)); return <div key={family} className="border-b border-slate-200"><button type="button" aria-expanded={familyOpen} onClick={() => toggleFamily(family)} className="grid w-full grid-cols-[minmax(260px,1.6fr)_115px_92px_120px_100px_120px_34px] items-center bg-slate-50 px-3 py-2 text-left text-xs"><span className="flex items-center gap-2 font-black text-[#003366]"><ChevronDown className={`h-3.5 w-3.5 transition ${familyOpen ? "" : "-rotate-90"}`} />{family}</span><span className="text-slate-500">{familyActive.length} conceptos</span><span></span><strong>{showInternalCost ? money.format(familyActive.reduce((sum, row) => sum + row.cost, 0)) : "••••••"}</strong><span></span><strong>{money.format(familyActive.reduce((sum, row) => sum + row.price, 0))}</strong><span></span></button>{familyOpen && rows.map((row, index) => { const inactive = excluded.includes(row.id); return <div key={row.id} className={`grid grid-cols-[minmax(260px,1.6fr)_115px_92px_120px_100px_120px_34px] items-center px-3 py-2 text-xs ${inactive ? "bg-rose-50/60 opacity-55" : index % 2 ? "bg-slate-50/60" : "bg-white"}`}><div className="min-w-0 pr-3"><div className="flex items-center gap-2"><strong className={inactive ? "line-through" : "text-slate-800"}>{row.concept}</strong><SourceBadge source={row.source} /></div><p className="mt-0.5 truncate text-[10px] text-slate-500" title={`${row.detail} · ${row.service}`}>{row.detail} · {row.service}</p></div><span>{row.qty} {row.unit}</span><span>{showInternalCost ? money.format(row.unitCost) : "••••"}</span><strong>{showInternalCost ? money.format(row.cost) : "••••••"}</strong><BillingBadge mode={row.billing} /><strong className="text-[#003366]">{money.format(row.price)}</strong><button type="button" title={inactive ? "Incluir" : "Excluir del escenario"} aria-label={`${inactive ? "Incluir" : "Excluir"} ${row.concept}`} onClick={() => setExcluded((current) => current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id])} className={`grid h-7 w-7 place-items-center ${inactive ? "text-emerald-700" : "text-rose-600"}`}>{inactive ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}</button></div>; })}</div>; })}</div></div>
    <div className="grid border-t border-slate-200 lg:grid-cols-[minmax(0,1fr)_420px]"><div className="p-4"><div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-amber-800" /><p className="text-xs leading-5 text-amber-900"><strong>Control económico.</strong> El margen utiliza sólo servicios propios. Fletes, terceros, impuestos y desembolsos quedan visibles, pero excluidos del porcentaje.</p></div><p className="mt-3 text-xs text-slate-500">La configuración del Motor Logístico se mantiene en Administración. Los valores mostrados son sintéticos.</p></div><aside className="border-l border-slate-200 bg-[#f8fafc] p-4" data-testid="cost-summary"><div className="grid grid-cols-2 gap-x-5 gap-y-2 text-sm"><span className="text-slate-500">Costo propio</span><strong className="text-right">{showInternalCost ? money.format(totalCost) : "••••••••"}</strong><span className="text-slate-500">Precio servicios propios</span><strong className="text-right text-[#003366]">{money.format(ownPrice)}</strong><span className="text-slate-500">Externos y desembolsos</span><strong className="text-right">{showInternalCost ? money.format(externalCost) : "••••••••"}</strong><span className="text-slate-500">Margen propio</span><strong className="text-right text-emerald-700">{showInternalCost ? `${grossMargin.toFixed(1)} %` : "••••"}</strong><span className="border-t border-slate-200 pt-2 text-slate-500">Precio total sugerido</span><strong className="border-t border-slate-200 pt-2 text-right text-[#003366]">{money.format(totalPrice)}</strong></div><div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3"><span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500"><BarChart3 className="h-3.5 w-3.5" />{activeRows.length} conceptos activos</span><button type="button" title="Enviar escenario a Cotización" aria-label="Enviar escenario a Cotización" onClick={() => setSent(true)} className="grid h-9 w-9 place-items-center rounded-md bg-[#003366] text-white"><BriefcaseBusiness className="h-4 w-4" /></button></div>{sent && <p role="status" className="mt-3 flex items-center gap-2 bg-emerald-50 px-2 py-1.5 text-xs font-semibold text-emerald-800"><Check className="h-4 w-4" />Snapshot preparado para Cotización.</p>}</aside></div>
  </section>;
}

function Placeholder({ tab }: Readonly<{ tab: CaseTab }>) {
  const label = TABS.find(([value]) => value === tab)?.[1] || tab;
  return <section role="tabpanel" className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center"><h2 className="font-black text-[#003366]">{label}</h2><p className="mt-2 text-sm text-slate-500">Área independiente de la Ficha del Caso. No se presentan datos simulados fuera del preview.</p></section>;
}

export default function CostingVisualPreview() {
  const [tab, setTab] = useState<CaseTab>("COSTING");
  const [adminEngineOpen, setAdminEngineOpen] = useState(false);
  const [permitResolved, setPermitResolved] = useState(false);
  if (adminEngineOpen) return <AdminLogisticEnginePreview onBack={() => setAdminEngineOpen(false)} />;
  return <div className="flex min-h-screen bg-[#f4f7fb]" data-testid="crm-costing-visual-preview"><aside className="hidden w-64 shrink-0 bg-[#003b70] text-white lg:flex lg:flex-col"><div className="flex h-16 items-center gap-3 border-b border-white/15 px-5"><span className="grid h-9 w-9 place-items-center rounded-lg bg-white font-black text-[#003b70]">OS</span><div><strong className="block">OSi Plus ERP</strong><small className="uppercase tracking-[.15em] text-blue-200">Gestión integrada</small></div></div><nav className="space-y-1 p-3"><div className="mb-3 flex items-center gap-3 rounded-lg border border-white/15 px-3 py-2 text-blue-100"><LayoutGrid className="h-4 w-4 text-amber-300" />OSi Plus Hub</div><p className="px-3 py-2 text-[10px] font-bold uppercase tracking-[.15em] text-blue-300">Aplicaciones ERP</p><div className="flex items-center gap-3 rounded-lg px-3 py-2 text-blue-200"><LayoutGrid className="h-4 w-4" />General</div><div className="flex items-center gap-3 rounded-lg px-3 py-2 text-blue-200"><Settings2 className="h-4 w-4" />Administración</div><div className="rounded-lg bg-sky-500 px-3 py-2 font-bold"><span className="flex items-center gap-3"><BriefcaseBusiness className="h-4 w-4" />Comercial</span><div className="ml-7 mt-3 border-l border-sky-200/40 pl-3 text-xs"><strong>Pipeline</strong><p className="mt-3 text-sky-100">Clientes · En integración</p><p className="mt-3 text-sky-100">Seguimiento · En integración</p></div></div><div className="flex items-center gap-3 rounded-lg px-3 py-2 text-blue-200"><Users className="h-4 w-4" />Coordinación</div></nav><div className="mt-auto border-t border-white/15 p-4"><strong className="block text-sm">FREDERICK ESPINAL</strong><span className="text-xs text-blue-200">ROL A · Preview visual</span></div></aside>
    <main className="min-w-0 flex-1"><header className="border-b border-slate-200 bg-white px-4 py-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-black uppercase tracking-[.2em] text-[#0070a8]">Ficha del caso</p><h1 className="mt-2 text-2xl font-black text-[#003366]">Mudanza internacional de ejemplo</h1><p className="mt-1 text-sm text-slate-500"><span className="font-mono font-bold text-[#003366]">ICP-001</span> · Exportación · Servicios definidos · Survey publicado</p><div className="mt-3 flex gap-2"><span className="rounded bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800">Datos para evaluar</span><span className="rounded bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800">Costos por validar</span></div></div><Button type="button" variant="outline"><ArrowLeft />Volver al Inbox</Button></div></header>
      <div role="tablist" aria-label="Áreas de la Ficha del Caso" className="flex gap-1 overflow-x-auto border-b border-slate-300 bg-stone-200 p-1">{TABS.map(([value, label, Icon]) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`flex shrink-0 items-center gap-1.5 rounded px-3 py-2 text-xs font-bold ${tab === value ? "bg-[#df8750] text-white shadow-sm" : "text-slate-700 hover:bg-white/70"}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}</div>
      <div className="p-3 sm:p-4">{tab === "COSTING" ? <CostingPanel onOpenEngine={() => setAdminEngineOpen(true)} /> : tab === "MANAGEMENT" ? <CaseManagementPanel permitResolved={permitResolved} onResolvePermit={() => setPermitResolved(true)} /> : tab === "QUOTE" ? <QuoteProposalPanel permitResolved={permitResolved} onResolvePermit={() => setPermitResolved(true)} /> : <Placeholder tab={tab} />}</div>
    </main>
  </div>;
}
