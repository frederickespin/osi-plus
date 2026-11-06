import { ArrowLeft, Calculator, ClipboardCheck, Smartphone } from "lucide-react";
import type { HubApplication } from "./appCatalog";

type Props = Readonly<{
  applications: readonly HubApplication[];
  onNavigate: (pathname: string) => void;
}>;

export default function OsiPlusMobileHub({ applications, onNavigate }: Props) {
  return (
    <section className="mx-auto max-w-5xl px-4 py-6 sm:px-7 sm:py-9" data-testid="osi-plus-mobile-hub">
      <button type="button" onClick={() => onNavigate("/hub")} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-950">
        <ArrowLeft className="h-4 w-4" />Volver al Hub
      </button>
      <div className="mt-3 flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white"><Smartphone className="h-5 w-5" /></span>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.2em] text-indigo-600">Suite de aplicaciones móviles</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">OSi Plus Mobile</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Accesos móviles asignados al usuario. Cada aplicación conserva sus propios permisos y contexto de trabajo.</p>
        </div>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {applications.map((application) => {
          const Icon = application.icon === "calculator" ? Calculator : ClipboardCheck;
          const isExternal = application.status === "EXTERNAL_AVAILABLE";
          return (
            <button key={application.appId} type="button" onClick={() => onNavigate(application.route)} className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-sky-100 text-[#003b70]"><Icon className="h-5 w-5" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2"><strong className="text-sm text-slate-950">{application.name}</strong><small className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${isExternal ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{isExternal ? "Aplicación externa" : "MVP visual"}</small></span>
                <span className="mt-1 block text-xs leading-5 text-slate-600">{application.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
