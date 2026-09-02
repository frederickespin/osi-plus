import {
  AlertTriangle,
  ArrowLeft,
  BedDouble,
  CalendarClock,
  Car,
  CircleDollarSign,
  MapPinned,
  Route,
  ShieldCheck,
  Utensils,
} from "lucide-react";

type RuleRow = Readonly<{
  icon: typeof Route;
  concept: string;
  trigger: string;
  result: string;
  treatment: string;
}>;

const RULES: readonly RuleRow[] = [
  { icon: Route, concept: "Recorrido de visita", trigger: "Survey presencial", result: "Base → origen → base", treatment: "Distancia real ida y vuelta" },
  { icon: Car, concept: "Transporte", trigger: "Fuera de 15 km incluidos", result: "RD$ 70 por km", treatment: "Costo automático" },
  { icon: Utensils, concept: "Dieta", trigger: "Jornada superior a 6 horas", result: "RD$ 600 por persona", treatment: "Según equipo asignado" },
  { icon: CircleDollarSign, concept: "Viático", trigger: "Zona Interior", result: "RD$ 1,250 por persona", treatment: "Requiere responsable" },
  { icon: BedDouble, concept: "Hospedaje", trigger: "Retorno no viable el mismo día", result: "Precio pendiente", treatment: "Solicitud a tercero" },
  { icon: MapPinned, concept: "Peajes y estacionamiento", trigger: "Ruta con cargos", result: "Costo estimado o real", treatment: "Reembolsable configurable" },
];

export default function AdminLogisticEnginePreview({ onBack }: Readonly<{ onBack(): void }>) {
  return <div className="min-h-screen bg-[#f4f7fb]" data-testid="admin-logistic-engine-preview">
    <header className="border-b border-slate-200 bg-white px-4 py-3"><div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-black uppercase tracking-[.2em] text-[#0070a8]">Administración · Configuración operativa</p><h1 className="mt-1 text-2xl font-black text-[#003366]">Motor Logístico</h1><p className="mt-1 text-sm text-slate-500">Fuente automática de costos y advertencias para visitas, servicios y cotizaciones.</p></div><button type="button" title="Volver a la Ficha del Caso" aria-label="Volver a la Ficha del Caso" onClick={onBack} className="grid h-10 w-10 place-items-center rounded-md border border-slate-300 bg-white text-[#003366]"><ArrowLeft className="h-4 w-4" /></button></div></header>

    <main className="mx-auto max-w-7xl space-y-4 p-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-3"><span className="text-[10px] font-black uppercase text-slate-500">Versión activa</span><strong className="mt-1 block text-[#003366]">v4 · 01 sep 2026</strong></div>
        <div className="rounded-lg border border-slate-200 bg-white p-3"><span className="text-[10px] font-black uppercase text-slate-500">Base operativa</span><strong className="mt-1 block text-[#003366]">Hub principal · Santo Domingo</strong></div>
        <div className="rounded-lg border border-slate-200 bg-white p-3"><span className="text-[10px] font-black uppercase text-slate-500">Método de ruta</span><strong className="mt-1 block text-[#003366]">Carretera · ida y vuelta</strong></div>
        <div className="rounded-lg border border-slate-200 bg-white p-3"><span className="text-[10px] font-black uppercase text-slate-500">Activación</span><strong className="mt-1 flex items-center gap-2 text-emerald-700"><ShieldCheck className="h-4 w-4" />Sólo Preview</strong></div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 bg-slate-50 px-4 py-3"><h2 className="font-black text-[#003366]">Reglas automáticas de desplazamiento</h2><p className="mt-1 text-xs text-slate-500">La configuración vive en Administración; Cotización recibe únicamente el resultado versionado.</p></header>
        <div className="overflow-x-auto"><div className="min-w-[860px]"><div className="grid grid-cols-[minmax(190px,1fr)_220px_180px_minmax(200px,1fr)] bg-[#edf2f7] px-4 py-2 text-[10px] font-black uppercase text-slate-500"><span>Concepto</span><span>Activación</span><span>Resultado</span><span>Tratamiento</span></div>{RULES.map(({ icon: Icon, ...rule }, index) => <div key={rule.concept} className={`grid grid-cols-[minmax(190px,1fr)_220px_180px_minmax(200px,1fr)] items-center px-4 py-3 text-xs ${index % 2 ? "bg-slate-50/70" : "bg-white"}`}><strong className="flex items-center gap-2 text-[#003366]"><Icon className="h-4 w-4" />{rule.concept}</strong><span>{rule.trigger}</span><span className="font-semibold">{rule.result}</span><span className="text-slate-500">{rule.treatment}</span></div>)}</div></div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_390px]">
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-[#0070a8]" /><h2 className="font-black text-[#003366]">Orden del cálculo</h2></div><ol className="mt-3 grid gap-2 text-xs text-slate-700 sm:grid-cols-2"><li className="rounded border border-slate-200 p-3"><strong>1. Dirección verificada</strong><p className="mt-1 text-slate-500">Origen, destino o dirección específica de la visita.</p></li><li className="rounded border border-slate-200 p-3"><strong>2. Ruta y zona</strong><p className="mt-1 text-slate-500">Distancia por carretera, tiempo, peajes y retorno.</p></li><li className="rounded border border-slate-200 p-3"><strong>3. Recursos disponibles</strong><p className="mt-1 text-slate-500">Personal y vehículo; volumen solamente después del Survey.</p></li><li className="rounded border border-slate-200 p-3"><strong>4. Resultado versionado</strong><p className="mt-1 text-slate-500">Costos, advertencias y requerimientos pendientes.</p></li></ol></div>
        <aside className="rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-800" /><div><h2 className="font-black text-amber-950">Ejemplo de advertencia</h2><p className="mt-2 text-xs leading-5 text-amber-900">La visita presencial está fuera de zona Metro. Se calculan ida y vuelta, dieta y peajes. El hospedaje queda como requerimiento pendiente: el motor no inventa el precio del proveedor.</p></div></div></aside>
      </section>

      <p className="text-center text-[10px] font-semibold uppercase tracking-wider text-slate-400">Datos sintéticos · sin API · sin cambios en Producción</p>
    </main>
  </div>;
}
