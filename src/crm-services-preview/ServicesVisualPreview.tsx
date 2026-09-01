import { useState, type ComponentType } from "react";
import {
  ArrowLeft, BarChart3, BriefcaseBusiness, Check, ClipboardCheck, FileText, History,
  LayoutGrid, ListChecks, MessageSquare, PackageCheck, Paperclip, Plus, Settings2,
  StickyNote, Tags, Users, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type CaseTab = "SUMMARY" | "SERVICES" | "SURVEY" | "ACTIVITY" | "TASKS" | "QUOTE" | "NOTES" | "FILES" | "COMMUNICATION";
type CatalogView = "PRIMARY" | "COMPLEMENTARY";

const TABS: ReadonlyArray<readonly [CaseTab, string, ComponentType<{ className?: string }>]> = [
  ["SUMMARY", "Resumen", FileText], ["SERVICES", "Servicios", BriefcaseBusiness],
  ["SURVEY", "Survey", ClipboardCheck], ["ACTIVITY", "Actividad", History],
  ["TASKS", "Tareas", ListChecks], ["QUOTE", "Cotización", BriefcaseBusiness],
  ["NOTES", "Notas", StickyNote], ["FILES", "Archivos", Paperclip],
  ["COMMUNICATION", "Comunicación", MessageSquare],
];

const PRIMARY_SERVICES = [
  ["MOV_RES", "Mudanza residencial", "Mudanzas"], ["MOV_CORP", "Mudanza corporativa y de oficinas", "Mudanzas"],
  ["MOV_DIP", "Mudanza diplomática", "Mudanzas"], ["STORAGE_FURN", "Almacenaje de mobiliario", "Almacenaje"],
  ["STORAGE_LOG", "Almacenaje logístico", "Almacenaje"], ["RECORD_STORAGE", "Record storage", "Archivo"],
  ["TRANSPORT", "Transporte y distribución", "Logística"], ["CUSTOMS", "Gestión aduanal", "Aduanas"],
  ["PACK_INDUSTRIAL", "Embalaje industrial", "Embalaje"], ["PACK_TECH", "Embalaje tecnológico", "Embalaje"],
  ["FINE_ART", "Manejo y embalaje de obras de arte", "Especializados"], ["CRATING", "Crating o fabricación de guacales", "Especializados"],
] as const;

const COMPLEMENTARY_SERVICES = [
  ["PACK_UNPACK", "Embalaje y desembalaje"], ["ASSEMBLY", "Desarme y armado"],
  ["LOAD_UNLOAD", "Carga y descarga"], ["CRATING", "Crating o guacales"],
  ["TEMP_STORAGE", "Almacenaje temporal"], ["LONG_STORAGE", "Almacenaje prolongado"],
  ["CUSTOMS", "Gestión aduanal"], ["PORT_AIR", "Manejo portuario o aeroportuario"],
  ["LOCAL_TRANSPORT", "Transporte local"], ["LAST_MILE", "Distribución o última milla"],
  ["RIGGING", "Elevación o rigging"], ["MATERIALS", "Materiales y cajas"],
  ["SPECIAL_PROTECTION", "Protección especializada"],
] as const;

const fieldClass = "mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#0b5b91] focus:ring-2 focus:ring-sky-100";
const labelClass = "text-[11px] font-bold uppercase tracking-[.06em] text-slate-500";

function CatalogDialog({ open, onClose }: Readonly<{ open: boolean; onClose(): void }>) {
  const [view, setView] = useState<CatalogView>("PRIMARY");
  const [adding, setAdding] = useState(false);
  if (!open) return null;
  const rows = view === "PRIMARY" ? PRIMARY_SERVICES : COMPLEMENTARY_SERVICES.map(([code, name]) => [code, name, "Complementario"] as const);
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-3" data-testid="services-admin-catalog">
    <section role="dialog" aria-modal="true" aria-labelledby="catalog-title" className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-[#0070a8]">Administración · Comercial y CRM</p><h2 id="catalog-title" className="mt-1 text-xl font-black text-[#003366]">Catálogo de servicios</h2><p className="mt-1 text-sm text-slate-500">Configuración tenant-first para selección, estadísticas y análisis.</p></div><button type="button" aria-label="Cerrar catálogo" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={onClose}><X className="h-4 w-4" /></button></header>
      <div className="grid gap-3 border-b border-slate-200 bg-slate-50 p-4 sm:grid-cols-3"><div className="rounded-lg border bg-white p-3"><span className="text-xs text-slate-500">Principales activos</span><strong className="mt-1 block text-xl text-[#003366]">12</strong></div><div className="rounded-lg border bg-white p-3"><span className="text-xs text-slate-500">Complementarios activos</span><strong className="mt-1 block text-xl text-[#003366]">13</strong></div><div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><span className="text-xs text-amber-800">Otros por clasificar</span><strong className="mt-1 block text-xl text-amber-900">1</strong></div></div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3"><div role="tablist" aria-label="Tipo de catálogo" className="flex rounded-lg bg-slate-100 p-1"><button type="button" role="tab" aria-selected={view === "PRIMARY"} className={`rounded-md px-3 py-2 text-xs font-bold ${view === "PRIMARY" ? "bg-white text-[#003366] shadow" : "text-slate-500"}`} onClick={() => setView("PRIMARY")}>Servicios principales</button><button type="button" role="tab" aria-selected={view === "COMPLEMENTARY"} className={`rounded-md px-3 py-2 text-xs font-bold ${view === "COMPLEMENTARY" ? "bg-white text-[#003366] shadow" : "text-slate-500"}`} onClick={() => setView("COMPLEMENTARY")}>Complementarios</button></div><Button type="button" size="sm" onClick={() => setAdding((value) => !value)}><Plus />Nuevo tipo de servicio</Button></div>
      {adding && <div className="grid gap-3 border-b border-sky-200 bg-sky-50 p-4 sm:grid-cols-4"><label className={`${labelClass} sm:col-span-2`}>Nombre<input className={fieldClass} placeholder="Nombre administrable" /></label><label className={labelClass}>Categoría<input className={fieldClass} placeholder="Categoría KPI" /></label><label className={labelClass}>Uso<select className={fieldClass}><option>Principal</option><option>Complementario</option><option>Ambos</option></select></label><div className="flex justify-end gap-2 sm:col-span-4"><Button type="button" size="sm" variant="outline" onClick={() => setAdding(false)}>Cancelar</Button><Button type="button" size="sm" onClick={() => setAdding(false)}>Agregar al catálogo</Button></div></div>}
      <div className="divide-y divide-slate-100">{rows.map(([code, name, category]) => <div key={`${view}-${code}`} className="grid items-center gap-2 px-4 py-3 text-sm sm:grid-cols-[130px_1fr_170px_100px]"><code className="text-xs font-bold text-slate-500">{code}</code><strong className="text-slate-800">{name}</strong><span className="text-xs text-slate-500">{category}</span><span className="w-fit rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold uppercase text-emerald-800">Activo</span></div>)}</div>
      <footer className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">Los servicios usados históricamente se desactivan; nunca se eliminan ni cambian el significado de casos anteriores.</footer>
    </section>
  </div>;
}

function ServicesPanel({ onOpenCatalog }: Readonly<{ onOpenCatalog(): void }>) {
  const [primary, setPrimary] = useState("");
  const [scope, setScope] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [otherDescription, setOtherDescription] = useState("");
  const [saved, setSaved] = useState(false);
  const valid = primary.length > 0 && scope.length > 0 && (primary !== "OTHER" || otherDescription.trim().length >= 3);
  const toggle = (code: string) => setSelected((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code]);
  return <section role="tabpanel" aria-labelledby="services-heading" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" data-testid="services-case-panel">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3"><div><div className="flex flex-wrap items-center gap-2"><h2 id="services-heading" className="font-black text-[#003366]">Servicios del caso</h2><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${saved ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{saved ? "Definido" : "Pendiente"}</span></div><p className="mt-1 text-xs text-slate-500">Definición comercial posterior al ICP y anterior a Survey.</p></div><Button type="button" size="sm" variant="outline" onClick={onOpenCatalog}><Settings2 />Configurar catálogo</Button></header>
    <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_280px]"><div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><label className={labelClass}>Servicio principal *<select aria-label="Servicio principal" className={fieldClass} value={primary} onChange={(event) => { setPrimary(event.target.value); setSaved(false); }}><option value="">Seleccionar del catálogo</option>{PRIMARY_SERVICES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}<option value="OTHER">Otro servicio no catalogado</option></select></label><label className={labelClass}>Alcance *<select aria-label="Alcance" className={fieldClass} value={scope} onChange={(event) => { setScope(event.target.value); setSaved(false); }}><option value="">Confirmar alcance</option><option>Local</option><option>Nacional</option><option>Exportación</option><option>Importación</option><option>Sin traslado</option><option>No aplica</option></select></label></div>{primary === "OTHER" && <label className={labelClass}>Descripción de otro servicio *<textarea aria-label="Descripción de otro servicio" className="mt-1 min-h-20 w-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none focus:ring-2 focus:ring-amber-100" value={otherDescription} onChange={(event) => { setOtherDescription(event.target.value); setSaved(false); }} placeholder="Describe el servicio solicitado para que Administración pueda clasificarlo" /><span className="mt-1 block text-xs font-normal normal-case tracking-normal text-amber-800">Quedará identificado como «Otro pendiente de clasificación».</span></label>}
        <fieldset><legend className={labelClass}>Servicios complementarios</legend><p className="mt-1 text-xs text-slate-500">Selecciona todos los que formen parte del alcance comercial.</p><div className="mt-2 flex flex-wrap gap-2">{COMPLEMENTARY_SERVICES.map(([code, name]) => { const active = selected.includes(code); return <button key={code} type="button" aria-pressed={active} onClick={() => { toggle(code); setSaved(false); }} className={`flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold ${active ? "border-[#0b5b91] bg-sky-50 text-[#003366] ring-1 ring-sky-100" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{active && <Check className="h-3.5 w-3.5" />}{name}</button>; })}</div></fieldset></div>
      <aside className="space-y-3"><div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3"><BarChart3 className="h-5 w-5 text-indigo-700" /><h3 className="mt-2 text-sm font-black text-indigo-950">Preparado para análisis</h3><p className="mt-1 text-xs leading-5 text-indigo-800">Principal, alcance y complementarios se registran por códigos estables para estadísticas, KPI y rendimiento.</p></div><div className="rounded-lg border border-slate-200 p-3"><Tags className="h-5 w-5 text-[#0b5b91]" /><h3 className="mt-2 text-sm font-black text-[#003366]">Selección actual</h3><dl className="mt-2 space-y-2 text-xs"><div className="flex justify-between gap-2"><dt className="text-slate-500">Principal</dt><dd className="text-right font-semibold">{PRIMARY_SERVICES.find(([code]) => code === primary)?.[1] || (primary === "OTHER" ? "Otro" : "Pendiente")}</dd></div><div className="flex justify-between gap-2"><dt className="text-slate-500">Alcance</dt><dd className="font-semibold">{scope || "Pendiente"}</dd></div><div className="flex justify-between gap-2"><dt className="text-slate-500">Complementarios</dt><dd className="font-semibold">{selected.length}</dd></div></dl></div></aside></div>
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3"><p className="text-xs text-slate-500">Guardar creará una revisión de la definición; no sobrescribe silenciosamente el historial.</p><Button type="button" disabled={!valid} onClick={() => setSaved(true)}><PackageCheck />{saved ? "Servicios guardados" : "Guardar definición"}</Button></footer>
  </section>;
}

function Placeholder({ tab }: Readonly<{ tab: CaseTab }>) {
  const label = TABS.find(([value]) => value === tab)?.[1] || tab;
  return <section role="tabpanel" className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center"><h2 className="font-black text-[#003366]">{label}</h2><p className="mt-2 text-sm text-slate-500">Área independiente de la Ficha del Caso. No se presentan datos simulados.</p></section>;
}

export default function ServicesVisualPreview() {
  const [tab, setTab] = useState<CaseTab>("SERVICES");
  const [catalogOpen, setCatalogOpen] = useState(false);
  return <div className="flex min-h-screen bg-[#f4f7fb]" data-testid="crm-services-visual-preview"><aside className="hidden w-64 shrink-0 bg-[#003b70] text-white lg:flex lg:flex-col"><div className="flex h-16 items-center gap-3 border-b border-white/15 px-5"><span className="grid h-9 w-9 place-items-center rounded-lg bg-white font-black text-[#003b70]">OS</span><div><strong className="block">OSi Plus ERP</strong><small className="uppercase tracking-[.15em] text-blue-200">Gestión integrada</small></div></div><nav className="space-y-1 p-3"><div className="mb-3 flex items-center gap-3 rounded-lg border border-white/15 px-3 py-2 text-blue-100"><LayoutGrid className="h-4 w-4 text-amber-300" />OSi Plus Hub</div><p className="px-3 py-2 text-[10px] font-bold uppercase tracking-[.15em] text-blue-300">Aplicaciones ERP</p><div className="flex items-center gap-3 rounded-lg px-3 py-2 text-blue-200"><LayoutGrid className="h-4 w-4" />General</div><div className="flex items-center gap-3 rounded-lg px-3 py-2 text-blue-200"><Settings2 className="h-4 w-4" />Administración</div><div className="rounded-lg bg-sky-500 px-3 py-2 font-bold"><span className="flex items-center gap-3"><BriefcaseBusiness className="h-4 w-4" />Comercial</span><div className="ml-7 mt-3 border-l border-sky-200/40 pl-3 text-xs"><strong>Pipeline</strong><p className="mt-3 text-sky-100">Clientes · En integración</p><p className="mt-3 text-sky-100">Seguimiento · En integración</p></div></div><div className="flex items-center gap-3 rounded-lg px-3 py-2 text-blue-200"><Users className="h-4 w-4" />Coordinación</div></nav><div className="mt-auto border-t border-white/15 p-4"><strong className="block text-sm">FREDERICK ESPINAL</strong><span className="text-xs text-blue-200">ROL A · Preview visual</span></div></aside>
    <main className="min-w-0 flex-1"><header className="border-b border-slate-200 bg-white px-4 py-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-black uppercase tracking-[.2em] text-[#0070a8]">Ficha del caso</p><h1 className="mt-2 text-2xl font-black text-[#003366]">Cliente de ejemplo</h1><p className="mt-1 text-sm text-slate-500"><span className="font-mono font-bold text-[#003366]">ICP-001</span> · Caso recién creado · Servicio pendiente · Sin responsable</p><div className="mt-3 flex gap-2"><span className="rounded bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800">Caso sin asignar</span><span className="rounded bg-sky-50 px-2 py-1 text-[10px] font-bold text-sky-800">Definir servicios</span></div></div><Button type="button" variant="outline"><ArrowLeft />Volver al Inbox</Button></div></header>
      <div role="tablist" aria-label="Áreas de la Ficha del Caso" className="flex gap-1 overflow-x-auto border-b border-slate-300 bg-stone-200 p-1">{TABS.map(([value, label, Icon]) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`flex shrink-0 items-center gap-1.5 rounded px-3 py-2 text-xs font-bold ${tab === value ? "bg-[#df8750] text-white shadow-sm" : "text-slate-700 hover:bg-white/70"}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}</div>
      <div className="p-3 sm:p-4">{tab === "SERVICES" ? <ServicesPanel onOpenCatalog={() => setCatalogOpen(true)} /> : <Placeholder tab={tab} />}</div>
    </main><CatalogDialog open={catalogOpen} onClose={() => setCatalogOpen(false)} />
  </div>;
}
