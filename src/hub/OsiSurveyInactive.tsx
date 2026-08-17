import { ClipboardCheck, DatabaseZap, Smartphone } from "lucide-react";

export default function OsiSurveyInactive() {
  return (
    <section className="mx-auto max-w-3xl px-5 py-10" data-testid="osi-survey-inactive">
      <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-indigo-100 text-indigo-700"><ClipboardCheck className="h-7 w-7" /></span>
        <p className="mt-6 text-xs font-bold uppercase tracking-[.2em] text-indigo-600">Descriptor canónico</p>
        <h1 className="mt-2 text-3xl font-black text-slate-950">OSi Survey</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">Módulo planificado — sin backend conectado.</p>
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-slate-50 p-4"><Smartphone className="h-5 w-5 text-indigo-600" /><h2 className="mt-3 text-sm font-bold">Experiencia móvil</h2><p className="mt-1 text-xs leading-5 text-slate-500">La ruta está preparada para una futura aplicación de evaluadores expresamente autorizados.</p></div>
          <div className="rounded-2xl bg-slate-50 p-4"><DatabaseZap className="h-5 w-5 text-indigo-600" /><h2 className="mt-3 text-sm font-bold">Sin autoridad local</h2><p className="mt-1 text-xs leading-5 text-slate-500">No existen asignaciones, drafts, autosave, persistencia ni solicitudes API en este lote.</p></div>
        </div>
      </div>
    </section>
  );
}

