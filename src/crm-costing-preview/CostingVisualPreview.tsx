import { useMemo, useState, type ComponentType } from "react";
import {
  ArrowLeft, BarChart3, BriefcaseBusiness, Calculator, Check, ChevronDown, ClipboardCheck,
  Eye, EyeOff, FileText, History, LayoutGrid, ListChecks, LockKeyhole, MessageSquare,
  PackageCheck, Paperclip, Plus, Settings2, ShieldCheck, StickyNote, Truck, Users, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type CaseTab = "SUMMARY" | "SERVICES" | "SURVEY" | "COSTING" | "ACTIVITY" | "TASKS" | "QUOTE" | "NOTES" | "FILES" | "COMMUNICATION";
type CostFamily = "Personal" | "Transporte" | "Materiales" | "Cajas de madera" | "Equipos" | "Compensaciones" | "Terceros" | "Riesgo";
type CostSource = "SURVEY" | "SERVICIO" | "COMBO" | "ADMIN" | "PROVEEDOR";
type BillingMode = "INCLUIDO" | "EXTRA" | "NO COBRABLE";

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
}>;

const TABS: ReadonlyArray<readonly [CaseTab, string, ComponentType<{ className?: string }>]> = [
  ["SUMMARY", "Resumen", FileText], ["SERVICES", "Servicios", BriefcaseBusiness],
  ["SURVEY", "Survey", ClipboardCheck], ["COSTING", "Costos", Calculator],
  ["ACTIVITY", "Actividad", History], ["TASKS", "Tareas", ListChecks],
  ["QUOTE", "Cotización", BriefcaseBusiness], ["NOTES", "Notas", StickyNote],
  ["FILES", "Archivos", Paperclip], ["COMMUNICATION", "Comunicación", MessageSquare],
];

const COST_ROWS: readonly CostRow[] = [
  { id: "SUPERVISOR", family: "Personal", concept: "Supervisor", detail: "1 persona × 2 jornadas", qty: 2, unit: "persona-jornada", unitCost: 4500, cost: 9000, billing: "INCLUIDO", price: 12600, source: "SERVICIO", service: "Mudanza residencial" },
  { id: "CREW", family: "Personal", concept: "Personal operativo", detail: "6 personas × 2 jornadas", qty: 12, unit: "persona-jornada", unitCost: 1800, cost: 21600, billing: "INCLUIDO", price: 30240, source: "SURVEY", service: "Carga y descarga" },
  { id: "DRIVER", family: "Personal", concept: "Chofer", detail: "1 chofer × 2 jornadas", qty: 2, unit: "persona-jornada", unitCost: 2500, cost: 5000, billing: "INCLUIDO", price: 6500, source: "SERVICIO", service: "Transporte local" },
  { id: "TRUCK", family: "Transporte", concept: "Camión cerrado 24 pies", detail: "Capacidad validada para 25.5 m³", qty: 2, unit: "camión-jornada", unitCost: 18000, cost: 36000, billing: "INCLUIDO", price: 45000, source: "SURVEY", service: "Transporte local" },
  { id: "DISTANCE", family: "Transporte", concept: "Recorrido operativo", detail: "Origen → destino · zona Metro", qty: 42, unit: "km", unitCost: 70, cost: 2940, billing: "INCLUIDO", price: 4200, source: "ADMIN", service: "Transporte local" },
  { id: "PACKING", family: "Materiales", concept: "Material de embalaje", detail: "Proyección por inventario y nivel de protección", qty: 25.5, unit: "m³", unitCost: 800, cost: 20400, billing: "INCLUIDO", price: 30600, source: "SURVEY", service: "Embalaje y desembalaje" },
  { id: "CRATING", family: "Cajas de madera", concept: "Guacales a medida", detail: "2 artículos señalados para protección especial", qty: 2, unit: "unidad", unitCost: 14500, cost: 29000, billing: "EXTRA", price: 42000, source: "SURVEY", service: "Crating o guacales" },
  { id: "RIGGING", family: "Equipos", concept: "Rigging y elevación", detail: "Acceso especial reportado", qty: 1, unit: "evento", unitCost: 22000, cost: 22000, billing: "EXTRA", price: 28000, source: "COMBO", service: "Elevación o rigging" },
  { id: "ALLOWANCES", family: "Compensaciones", concept: "Dietas operativas", detail: "Equipo autorizado · 2 jornadas", qty: 14, unit: "asignación", unitCost: 600, cost: 8400, billing: "INCLUIDO", price: 10500, source: "ADMIN", service: "Mudanza residencial" },
  { id: "FUMIGATION", family: "Terceros", concept: "Fumigación de guacales", detail: "Cotización de proveedor pendiente de confirmar", qty: 1, unit: "lote", unitCost: 6500, cost: 6500, billing: "EXTRA", price: 8000, source: "PROVEEDOR", service: "Crating o guacales" },
  { id: "CONTINGENCY", family: "Riesgo", concept: "Contingencia operativa", detail: "Acceso especial · requiere aprobación", qty: 1, unit: "evento", unitCost: 8000, cost: 8000, billing: "INCLUIDO", price: 10000, source: "ADMIN", service: "Mudanza residencial" },
];

const FAMILY_ORDER: readonly CostFamily[] = ["Personal", "Transporte", "Materiales", "Cajas de madera", "Equipos", "Compensaciones", "Terceros", "Riesgo"];
const money = new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP", maximumFractionDigits: 0 });

function SourceBadge({ source }: Readonly<{ source: CostSource }>) {
  const color = source === "SURVEY" ? "bg-sky-100 text-sky-800" : source === "SERVICIO" || source === "COMBO" ? "bg-indigo-100 text-indigo-800" : source === "PROVEEDOR" ? "bg-amber-100 text-amber-900" : "bg-slate-200 text-slate-700";
  return <span className={`rounded px-1.5 py-0.5 text-[9px] font-black ${color}`}>{source}</span>;
}

function BillingBadge({ mode }: Readonly<{ mode: BillingMode }>) {
  const color = mode === "EXTRA" ? "text-amber-800" : mode === "NO COBRABLE" ? "text-slate-500" : "text-emerald-700";
  return <span className={`text-[10px] font-black ${color}`}>{mode}</span>;
}

function CostCatalogDialog({ open, onClose }: Readonly<{ open: boolean; onClose(): void }>) {
  const [activeFamily, setActiveFamily] = useState<CostFamily>("Personal");
  const [disabled, setDisabled] = useState<string[]>([]);
  if (!open) return null;
  const rows = COST_ROWS.filter((row) => row.family === activeFamily);
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-3" data-testid="cost-catalog-dialog">
    <section role="dialog" aria-modal="true" aria-labelledby="cost-catalog-title" className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl">
      <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-[#0070a8]">Administración · Motor de costos</p><h2 id="cost-catalog-title" className="mt-1 text-xl font-black text-[#003366]">Catálogos y reglas</h2><p className="mt-1 text-sm text-slate-500">Versión activa 4 · vigencia 01 sep 2026 · moneda DOP</p></div><button type="button" title="Cerrar" aria-label="Cerrar catálogos de costos" onClick={onClose} className="rounded p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button></header>
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50 p-2" role="tablist" aria-label="Familias del catálogo">{FAMILY_ORDER.map((family) => <button key={family} type="button" role="tab" aria-selected={activeFamily === family} onClick={() => setActiveFamily(family)} className={`shrink-0 rounded px-3 py-2 text-xs font-bold ${activeFamily === family ? "bg-[#003366] text-white" : "text-slate-600 hover:bg-white"}`}>{family}</button>)}</div>
      <div className="grid grid-cols-[minmax(0,1fr)_100px_120px_44px] border-b border-slate-200 bg-slate-100 px-4 py-2 text-[10px] font-black uppercase text-slate-500"><span>Concepto</span><span>Unidad</span><span>Costo base</span><span></span></div>
      <div className="divide-y divide-slate-100">{rows.map((row) => { const inactive = disabled.includes(row.id); return <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_100px_120px_44px] items-center px-4 py-3 text-xs"><div><strong className={inactive ? "text-slate-400 line-through" : "text-slate-800"}>{row.concept}</strong><p className="mt-0.5 text-[10px] text-slate-500">{row.id} · {inactive ? "Inactivo" : "Activo"}</p></div><span>{row.unit}</span><span className="font-semibold">{money.format(row.unitCost)}</span><button type="button" title={inactive ? "Activar" : "Desactivar"} aria-label={`${inactive ? "Activar" : "Desactivar"} ${row.concept}`} onClick={() => setDisabled((current) => current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id])} className={`grid h-8 w-8 place-items-center rounded border ${inactive ? "border-emerald-200 text-emerald-700" : "border-rose-200 text-rose-700"}`}><Check className="h-3.5 w-3.5" /></button></div>; })}</div>
      <footer className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600"><span>Las modificaciones crean una nueva versión; no alteran cotizaciones históricas.</span><button type="button" title="Nuevo concepto" aria-label="Nuevo concepto de costo" className="grid h-9 w-9 place-items-center rounded-md bg-[#003366] text-white"><Plus className="h-4 w-4" /></button></footer>
    </section>
  </div>;
}

function CostingPanel({ onOpenCatalog }: Readonly<{ onOpenCatalog(): void }>) {
  const [showInternalCost, setShowInternalCost] = useState(true);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [openFamilies, setOpenFamilies] = useState<CostFamily[]>([...FAMILY_ORDER]);
  const [sent, setSent] = useState(false);
  const activeRows = useMemo(() => COST_ROWS.filter((row) => !excluded.includes(row.id)), [excluded]);
  const totalCost = activeRows.reduce((sum, row) => sum + row.cost, 0);
  const totalPrice = activeRows.reduce((sum, row) => sum + row.price, 0);
  const grossMargin = totalPrice > 0 ? ((totalPrice - totalCost) / totalPrice) * 100 : 0;
  const toggleFamily = (family: CostFamily) => setOpenFamilies((current) => current.includes(family) ? current.filter((item) => item !== family) : [...current, family]);
  return <section role="tabpanel" aria-labelledby="costing-heading" className="rounded-xl border border-slate-200 bg-white shadow-sm" data-testid="costing-case-panel">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3"><div><div className="flex flex-wrap items-center gap-2"><h2 id="costing-heading" className="font-black text-[#003366]">Evaluación de costos</h2><span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold uppercase text-emerald-800">Survey publicado</span><span className="rounded-full bg-sky-100 px-2 py-1 text-[10px] font-bold uppercase text-sky-800">Escenario 1</span></div><p className="mt-1 text-xs text-slate-500">Recursos propuestos desde Servicios + Survey. Aún no constituye una cotización.</p></div><div className="flex gap-1"><button type="button" title={showInternalCost ? "Ocultar costos internos" : "Mostrar costos internos"} aria-label={showInternalCost ? "Ocultar costos internos" : "Mostrar costos internos"} onClick={() => setShowInternalCost((value) => !value)} className="grid h-9 w-9 place-items-center rounded-md border border-slate-300 bg-white text-[#003366]">{showInternalCost ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button><button type="button" title="Configurar catálogos" aria-label="Configurar catálogos de costos" onClick={onOpenCatalog} className="grid h-9 w-9 place-items-center rounded-md border border-slate-300 bg-white text-[#003366]"><Settings2 className="h-4 w-4" /></button></div></header>
    <div className="grid gap-3 border-b border-slate-200 p-3 sm:grid-cols-2 xl:grid-cols-4"><div className="flex items-center gap-3 border-r border-slate-100 px-2"><ClipboardCheck className="h-5 w-5 text-sky-700" /><div><span className="text-[10px] font-bold uppercase text-slate-500">Base Survey</span><strong className="block text-sm text-[#003366]">25.5 m³ · 2 jornadas</strong></div></div><div className="flex items-center gap-3 border-r border-slate-100 px-2"><PackageCheck className="h-5 w-5 text-indigo-700" /><div><span className="text-[10px] font-bold uppercase text-slate-500">Servicios</span><strong className="block text-sm text-[#003366]">1 principal · 6 incluidos</strong></div></div><div className="flex items-center gap-3 border-r border-slate-100 px-2"><Truck className="h-5 w-5 text-amber-700" /><div><span className="text-[10px] font-bold uppercase text-slate-500">Plan operativo</span><strong className="block text-sm text-[#003366]">7 personas · 1 camión</strong></div></div><div className="flex items-center gap-3 px-2"><ShieldCheck className="h-5 w-5 text-emerald-700" /><div><span className="text-[10px] font-bold uppercase text-slate-500">Reglas aplicadas</span><strong className="block text-sm text-[#003366]">Versión 4 · DOP</strong></div></div></div>
    <div className="overflow-x-auto" data-testid="cost-lines-table"><div className="min-w-[900px]"><div className="grid grid-cols-[minmax(260px,1.6fr)_115px_92px_120px_100px_120px_34px] bg-[#edf2f7] px-3 py-2 text-[10px] font-black uppercase tracking-[.05em] text-slate-500"><span>Recurso / origen</span><span>Cantidad</span><span>Costo unit.</span><span>Costo interno</span><span>Tratamiento</span><span>Precio sugerido</span><span></span></div>{FAMILY_ORDER.map((family) => { const rows = COST_ROWS.filter((row) => row.family === family); const familyOpen = openFamilies.includes(family); const familyActive = rows.filter((row) => !excluded.includes(row.id)); return <div key={family} className="border-b border-slate-200"><button type="button" aria-expanded={familyOpen} onClick={() => toggleFamily(family)} className="grid w-full grid-cols-[minmax(260px,1.6fr)_115px_92px_120px_100px_120px_34px] items-center bg-slate-50 px-3 py-2 text-left text-xs"><span className="flex items-center gap-2 font-black text-[#003366]"><ChevronDown className={`h-3.5 w-3.5 transition ${familyOpen ? "" : "-rotate-90"}`} />{family}</span><span className="text-slate-500">{familyActive.length} conceptos</span><span></span><strong>{showInternalCost ? money.format(familyActive.reduce((sum, row) => sum + row.cost, 0)) : "••••••"}</strong><span></span><strong>{money.format(familyActive.reduce((sum, row) => sum + row.price, 0))}</strong><span></span></button>{familyOpen && rows.map((row, index) => { const inactive = excluded.includes(row.id); return <div key={row.id} className={`grid grid-cols-[minmax(260px,1.6fr)_115px_92px_120px_100px_120px_34px] items-center px-3 py-2 text-xs ${inactive ? "bg-rose-50/60 opacity-55" : index % 2 ? "bg-slate-50/60" : "bg-white"}`}><div className="min-w-0 pr-3"><div className="flex items-center gap-2"><strong className={inactive ? "line-through" : "text-slate-800"}>{row.concept}</strong><SourceBadge source={row.source} /></div><p className="mt-0.5 truncate text-[10px] text-slate-500" title={`${row.detail} · ${row.service}`}>{row.detail} · {row.service}</p></div><span>{row.qty} {row.unit}</span><span>{showInternalCost ? money.format(row.unitCost) : "••••"}</span><strong>{showInternalCost ? money.format(row.cost) : "••••••"}</strong><BillingBadge mode={row.billing} /><strong className="text-[#003366]">{money.format(row.price)}</strong><button type="button" title={inactive ? "Incluir" : "Excluir del escenario"} aria-label={`${inactive ? "Incluir" : "Excluir"} ${row.concept}`} onClick={() => setExcluded((current) => current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id])} className={`grid h-7 w-7 place-items-center ${inactive ? "text-emerald-700" : "text-rose-600"}`}>{inactive ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}</button></div>; })}</div>; })}</div></div>
    <div className="grid border-t border-slate-200 lg:grid-cols-[minmax(0,1fr)_420px]"><div className="p-4"><div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-amber-800" /><p className="text-xs leading-5 text-amber-900"><strong>Control económico.</strong> Costo y precio permanecen separados. Ajustes manuales, margen bajo el mínimo o conceptos de riesgo requerirán aprobación y dejarán auditoría.</p></div><p className="mt-3 text-xs text-slate-500">Impuestos, condiciones de pago y vigencia se determinan en Cotización. Los valores mostrados son sintéticos.</p></div><aside className="border-l border-slate-200 bg-[#f8fafc] p-4" data-testid="cost-summary"><div className="grid grid-cols-2 gap-x-5 gap-y-2 text-sm"><span className="text-slate-500">Costo interno</span><strong className="text-right">{showInternalCost ? money.format(totalCost) : "••••••••"}</strong><span className="text-slate-500">Precio sugerido</span><strong className="text-right text-[#003366]">{money.format(totalPrice)}</strong><span className="text-slate-500">Utilidad bruta</span><strong className="text-right text-emerald-700">{showInternalCost ? money.format(totalPrice - totalCost) : "••••••••"}</strong><span className="text-slate-500">Margen estimado</span><strong className="text-right text-emerald-700">{showInternalCost ? `${grossMargin.toFixed(1)} %` : "••••"}</strong></div><div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3"><span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500"><BarChart3 className="h-3.5 w-3.5" />{activeRows.length} conceptos activos</span><button type="button" title="Enviar escenario a Cotización" aria-label="Enviar escenario a Cotización" onClick={() => setSent(true)} className="grid h-9 w-9 place-items-center rounded-md bg-[#003366] text-white"><BriefcaseBusiness className="h-4 w-4" /></button></div>{sent && <p role="status" className="mt-3 flex items-center gap-2 bg-emerald-50 px-2 py-1.5 text-xs font-semibold text-emerald-800"><Check className="h-4 w-4" />Snapshot preparado para Cotización.</p>}</aside></div>
  </section>;
}

function Placeholder({ tab }: Readonly<{ tab: CaseTab }>) {
  const label = TABS.find(([value]) => value === tab)?.[1] || tab;
  return <section role="tabpanel" className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center"><h2 className="font-black text-[#003366]">{label}</h2><p className="mt-2 text-sm text-slate-500">Área independiente de la Ficha del Caso. No se presentan datos simulados fuera del preview.</p></section>;
}

export default function CostingVisualPreview() {
  const [tab, setTab] = useState<CaseTab>("COSTING");
  const [catalogOpen, setCatalogOpen] = useState(false);
  return <div className="flex min-h-screen bg-[#f4f7fb]" data-testid="crm-costing-visual-preview"><aside className="hidden w-64 shrink-0 bg-[#003b70] text-white lg:flex lg:flex-col"><div className="flex h-16 items-center gap-3 border-b border-white/15 px-5"><span className="grid h-9 w-9 place-items-center rounded-lg bg-white font-black text-[#003b70]">OS</span><div><strong className="block">OSi Plus ERP</strong><small className="uppercase tracking-[.15em] text-blue-200">Gestión integrada</small></div></div><nav className="space-y-1 p-3"><div className="mb-3 flex items-center gap-3 rounded-lg border border-white/15 px-3 py-2 text-blue-100"><LayoutGrid className="h-4 w-4 text-amber-300" />OSi Plus Hub</div><p className="px-3 py-2 text-[10px] font-bold uppercase tracking-[.15em] text-blue-300">Aplicaciones ERP</p><div className="flex items-center gap-3 rounded-lg px-3 py-2 text-blue-200"><LayoutGrid className="h-4 w-4" />General</div><div className="flex items-center gap-3 rounded-lg px-3 py-2 text-blue-200"><Settings2 className="h-4 w-4" />Administración</div><div className="rounded-lg bg-sky-500 px-3 py-2 font-bold"><span className="flex items-center gap-3"><BriefcaseBusiness className="h-4 w-4" />Comercial</span><div className="ml-7 mt-3 border-l border-sky-200/40 pl-3 text-xs"><strong>Pipeline</strong><p className="mt-3 text-sky-100">Clientes · En integración</p><p className="mt-3 text-sky-100">Seguimiento · En integración</p></div></div><div className="flex items-center gap-3 rounded-lg px-3 py-2 text-blue-200"><Users className="h-4 w-4" />Coordinación</div></nav><div className="mt-auto border-t border-white/15 p-4"><strong className="block text-sm">FREDERICK ESPINAL</strong><span className="text-xs text-blue-200">ROL A · Preview visual</span></div></aside>
    <main className="min-w-0 flex-1"><header className="border-b border-slate-200 bg-white px-4 py-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-black uppercase tracking-[.2em] text-[#0070a8]">Ficha del caso</p><h1 className="mt-2 text-2xl font-black text-[#003366]">Cliente de ejemplo</h1><p className="mt-1 text-sm text-slate-500"><span className="font-mono font-bold text-[#003366]">ICP-001</span> · Servicios definidos · Survey publicado · Sin cotización</p><div className="mt-3 flex gap-2"><span className="rounded bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800">Datos para evaluar</span><span className="rounded bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800">Costos por validar</span></div></div><Button type="button" variant="outline"><ArrowLeft />Volver al Inbox</Button></div></header>
      <div role="tablist" aria-label="Áreas de la Ficha del Caso" className="flex gap-1 overflow-x-auto border-b border-slate-300 bg-stone-200 p-1">{TABS.map(([value, label, Icon]) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`flex shrink-0 items-center gap-1.5 rounded px-3 py-2 text-xs font-bold ${tab === value ? "bg-[#df8750] text-white shadow-sm" : "text-slate-700 hover:bg-white/70"}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}</div>
      <div className="p-3 sm:p-4">{tab === "COSTING" ? <CostingPanel onOpenCatalog={() => setCatalogOpen(true)} /> : <Placeholder tab={tab} />}</div>
    </main><CostCatalogDialog open={catalogOpen} onClose={() => setCatalogOpen(false)} />
  </div>;
}
