import { useMemo, useState, type ElementType } from "react";
import {
  ArrowLeft,
  Boxes,
  BriefcaseBusiness,
  Calculator,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Grid2X2,
  LogOut,
  PackageOpen,
  Plus,
  Route,
  Settings,
  Truck,
  Users,
  Wrench,
} from "lucide-react";

type Mode = "LOCAL" | "EXPORT" | "IMPORT";
type ModeFilter = "ALL" | Mode;

type CommercialCase = Readonly<{
  code: string;
  date: string;
  client: string;
  origin: string;
  destination: string;
  mode: Mode;
  service: string;
  status: string;
  sla: "SLA vencido" | "SLA en riesgo" | "A tiempo";
}>;

const CLIENTS = [
  "Cliente Demo Local",
  "Institución Demo",
  "Lead Account Demo",
  "Cliente Diplomático Demo",
  "Cliente Tecnología Demo",
  "Patrocinador Demo",
  "Organización Demo",
];
const PLACES = ["Origen Demo Principal", "Destino Demo Principal", "Almacén Demo", "Puerto Demo", "Aeropuerto Demo", "Parada Adicional Demo"];
const STATUSES = ["NEW_INBOX", "AWAITING_ICP", "GOVERNANCE_CONFIRMED", "REQUIREMENTS_CONFIRMED", "SURVEY_PLANNING", "SURVEY_SCHEDULED", "SURVEY_COMPLETED", "PRICING_IN_PROGRESS", "INTERNAL_REVIEW", "QUOTE_SENT"];
const SERVICES = ["RESIDENTIAL_LOCAL", "RESIDENTIAL_EXPORT", "RESIDENTIAL_IMPORT", "CORPORATE_OFFICE", "INDUSTRIAL_RELOC", "STORAGE_ONLY", "CRATING_ONLY"];

function buildCases(): readonly CommercialCase[] {
  return Array.from({ length: 103 }, (_, index) => {
    const mode: Mode = (["LOCAL", "EXPORT", "IMPORT"] as const)[index % 3];
    const date = new Date(2026, 10, 5);
    date.setDate(date.getDate() - Math.floor(index / 3));
    return Object.freeze({
      code: `VISUAL-${String(index + 1).padStart(3, "0")}`,
      date: date.toLocaleDateString("es-DO", { day: "2-digit", month: "2-digit", year: "numeric" }),
      client: CLIENTS[index % CLIENTS.length],
      origin: PLACES[index % PLACES.length],
      destination: PLACES[(index + 2) % PLACES.length],
      mode,
      service: SERVICES[index % SERVICES.length],
      status: STATUSES[index % STATUSES.length],
      sla: index < 12 ? "SLA vencido" : index < 36 ? "SLA en riesgo" : "A tiempo",
    });
  });
}

const CASES = buildCases();

const NAVIGATION: readonly Readonly<{ label: string; icon: ElementType; active?: boolean; children?: readonly string[] }>[] = [
  { label: "General", icon: Grid2X2 },
  { label: "Administración", icon: Settings },
  { label: "Comercial", icon: BriefcaseBusiness, active: true, children: ["Pipeline", "Clientes", "Relaciones Comerciales", "Plantillas", "Calendario"] },
  { label: "Coordinación", icon: Route },
  { label: "Operaciones", icon: Truck },
  { label: "Campo y Taller", icon: Wrench },
  { label: "Logística", icon: Boxes },
  { label: "Recursos Humanos", icon: Users },
];

function modeClass(mode: Mode) {
  if (mode === "EXPORT") return "border-sky-300 bg-sky-50 text-sky-700";
  if (mode === "IMPORT") return "border-amber-300 bg-amber-50 text-amber-700";
  return "border-slate-300 bg-slate-50 text-slate-700";
}

function slaClass(sla: CommercialCase["sla"]) {
  if (sla === "SLA vencido") return "border-rose-300 bg-rose-50 text-rose-700";
  if (sla === "SLA en riesgo") return "border-amber-300 bg-amber-50 text-amber-700";
  return "border-emerald-300 bg-emerald-50 text-emerald-700";
}

type Props = Readonly<{
  onBack: () => void;
}>;

export default function RecoveredCommercialPreview({ onBack }: Props) {
  const [mode, setMode] = useState<ModeFilter>("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return CASES.filter((item) => {
      if (mode !== "ALL" && item.mode !== mode) return false;
      if (!query) return true;
      return [item.code, item.client, item.origin, item.destination, item.service, item.status].join(" ").toLowerCase().includes(query);
    });
  }, [mode, search]);

  return (
    <div className="min-h-screen bg-[#f7f9fb] text-slate-950" data-testid="recovered-commercial-preview">
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-amber-300 bg-[#fff3c7] px-4 py-2 text-[11px] font-bold uppercase tracking-[.12em] text-amber-950">
        <span>◉ Preview visual — identidades y datos sintéticos</span>
        <label className="flex items-center gap-2 normal-case tracking-normal"><span className="hidden font-medium sm:inline">Persona demo</span><select aria-label="Persona demo" className="h-8 rounded-lg border border-amber-300 bg-white px-3 text-xs font-semibold"><option>Administrador A</option></select></label>
      </div>
      <div className="flex min-h-11 items-center justify-between bg-slate-950 px-4 text-white">
        <button type="button" onClick={onBack} className="flex min-h-10 items-center gap-2 rounded-lg px-1 text-xs font-semibold hover:text-sky-300"><ArrowLeft className="h-4 w-4" />Hub</button>
        <span className="text-[10px] font-black uppercase tracking-[.18em] text-sky-300">Comercial avanzado recuperado</span>
      </div>
      <div className="flex min-h-[calc(100vh-88px)]">
        <aside className="hidden w-64 shrink-0 flex-col bg-[#073f70] text-white lg:flex">
          <div className="flex items-center gap-3 border-b border-white/10 p-4"><span className="grid h-11 w-11 place-items-center rounded-xl bg-white text-[#073f70]"><PackageOpen className="h-6 w-6" /></span><span><strong className="block text-lg">OSi-plus</strong><small className="text-sky-200">International Packers</small></span></div>
          <div className="flex items-center gap-3 border-b border-white/10 px-4 py-5"><span className="grid h-10 w-10 place-items-center rounded-full bg-amber-400 font-bold text-[#073f70]">AA</span><span><strong className="block text-sm">Administrador A</strong><small className="text-amber-300">Administrador</small><small className="block text-[10px] text-sky-200">Pruebas (Preview)</small></span></div>
          <nav className="flex-1 overflow-y-auto p-2" aria-label="Aplicaciones ERP recuperadas">
            {NAVIGATION.map(({ label, icon: Icon, active, children }) => <div key={label}>
              <button type="button" className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm ${active ? "bg-white/15 font-bold" : "text-sky-100 hover:bg-white/10"}`}><Icon className={`h-5 w-5 ${active ? "text-amber-300" : ""}`} /><span className="flex-1">{label}</span><ChevronRight className="h-4 w-4 opacity-60" /></button>
              {children && <div className="ml-4 border-l border-white/20 pl-2">{children.map((child, index) => <button type="button" key={child} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs ${index === 0 ? "bg-[#123d77] font-bold text-amber-300" : "text-sky-100"}`}><CircleDot className="h-2.5 w-2.5" />{child}</button>)}</div>}
            </div>)}
          </nav>
          <div className="border-t border-white/10 p-3"><button type="button" className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sky-100"><ChevronDown className="h-4 w-4" />Colapsar</button><button type="button" className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-rose-300"><LogOut className="h-4 w-4" />Cerrar Sesión</button></div>
        </aside>
        <main className="min-w-0 flex-1 p-0">
          <header className="border-b border-sky-200 bg-gradient-to-br from-white via-sky-50/60 to-cyan-50/30 px-4 py-5 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold">Inbox Comercial</h1><p className="text-sm text-slate-600">Tabla compacta de casos para operar por SLA y etapa.</p></div><button type="button" className="flex min-h-10 items-center gap-2 rounded-lg bg-[#063e70] px-4 text-sm font-bold text-white"><Plus className="h-4 w-4" />Nuevo Caso</button></div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <div className="flex rounded-xl border border-slate-200 bg-gradient-to-r from-slate-100 via-sky-50 to-emerald-50 p-1 shadow-sm">{(["ALL", "EXPORT", "IMPORT", "LOCAL"] as const).map((value) => <button type="button" key={value} onClick={() => setMode(value)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${mode === value ? "bg-white shadow-sm" : "text-slate-600"}`}>{value}</button>)}</div>
              <input aria-label="Buscar casos" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por caso, cliente, ruta o tipo..." className="min-h-10 min-w-[230px] flex-1 rounded-lg border border-slate-300 bg-white px-4 text-sm shadow-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200" />
              <span className="text-sm text-slate-500">{filtered.length} casos</span>
            </div>
          </header>
          <div className="h-[calc(100vh-238px)] overflow-auto border-t border-slate-200 bg-white">
            <table className="w-full min-w-[980px] border-collapse">
              <thead className="sticky top-0 z-10 bg-gradient-to-r from-slate-50 via-sky-50 to-emerald-50"><tr className="border-b border-slate-200 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500"><th className="px-4 py-3">Caso</th><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Ruta</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">SLA</th><th className="px-4 py-3 text-right">Acción</th></tr></thead>
              <tbody>{filtered.map((item) => <CommercialCaseRows key={item.code} item={item} expanded={expanded === item.code} onToggle={() => setExpanded((current) => current === item.code ? null : item.code)} />)}</tbody>
            </table>
            {filtered.length === 0 && <p className="p-10 text-center text-sm text-slate-500">No hay casos para los filtros seleccionados.</p>}
          </div>
        </main>
      </div>
    </div>
  );
}

function CommercialCaseRows({ item, expanded, onToggle }: { item: CommercialCase; expanded: boolean; onToggle: () => void }) {
  return <>
    <tr className="border-b border-slate-200 align-top hover:bg-slate-50">
      <td className="px-4 py-4"><strong className="font-mono text-sm">{item.code}</strong><small className="block text-xs text-slate-500">{item.date}</small></td>
      <td className="px-4 py-4"><strong className="block max-w-44 text-sm">{item.client}</strong><small className="text-xs text-slate-500">Visita pendiente</small></td>
      <td className="px-4 py-4 text-sm"><span className="block max-w-52">{item.origin}</span><small className="block text-xs text-slate-500">→ {item.destination}</small></td>
      <td className="px-4 py-4"><span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${modeClass(item.mode)}`}>{item.mode}</span><small className="mt-1 block text-xs text-slate-600">{item.service}</small></td>
      <td className="px-4 py-4"><span className="inline-flex rounded-full border border-slate-300 bg-slate-50 px-2 py-1 text-[10px] text-slate-700">{item.status}</span></td>
      <td className="px-4 py-4"><span className={`inline-flex rounded-full border px-2 py-1 text-[10px] ${slaClass(item.sla)}`}>{item.sla}</span></td>
      <td className="px-4 py-4"><div className="flex justify-end gap-1"><button type="button" onClick={onToggle} className="min-h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-indigo-700 shadow-sm">{expanded ? "Cerrar" : "Pipeline"}</button><button type="button" aria-label={`Cotizador ${item.code}`} className="grid h-8 w-8 place-items-center rounded-lg text-emerald-600 hover:bg-emerald-50"><Calculator className="h-4 w-4" /></button></div></td>
    </tr>
    {expanded && <tr className="border-b-2 border-indigo-200 bg-indigo-50/60"><td colSpan={7} className="px-5 py-4"><div className="grid gap-3 rounded-xl border border-indigo-200 bg-white p-4 text-sm shadow-sm sm:grid-cols-3"><div><small className="font-bold uppercase text-slate-500">Origen</small><p>{item.origin}</p></div><div><small className="font-bold uppercase text-slate-500">Destino</small><p>{item.destination}</p></div><div><small className="font-bold uppercase text-slate-500">Servicio</small><p>{item.mode} · {item.service}</p></div><p className="sm:col-span-3 text-xs text-slate-500">Referencia visual recuperada. La conexión con los contratos CRM actuales se realizará en el siguiente lote funcional.</p></div></td></tr>}
  </>;
}
