import { ArrowLeft, ClipboardCheck, Images, PackageCheck, Smartphone } from "lucide-react";
import type { HubApplication } from "./appCatalog";

type Props = Readonly<{
  applications: readonly HubApplication[];
  onNavigate: (pathname: string) => void;
}>;

export default function OsiPlusMobileHub({ applications, onNavigate }: Props) {
  return (
    <section className="mx-auto max-w-5xl px-4 py-6 sm:px-7 sm:py-9" data-testid="osi-plus-mobile-hub">
      <button type="button" onClick={() => onNavigate("/hub")} className="flex min-h-11 items-center gap-2 rounded-lg px-2 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-950">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />Volver al Hub
      </button>
      <div className="mt-3 flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white"><Smartphone className="h-5 w-5" aria-hidden="true" /></span>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.2em] text-indigo-600">Suite de aplicaciones móviles</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">OSi Plus Mobile</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Tus visitas asignadas y aplicaciones móviles en un solo lugar.</p>
        </div>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {applications.map((application) => {
          const Icon = application.appId === "visual-inventory" ? Images : application.appId === "osi-custody" ? PackageCheck : ClipboardCheck;
          return (
            <button key={application.appId} type="button" onClick={() => onNavigate(application.route)} className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-sky-100 text-[#003b70]"><Icon className="h-5 w-5" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2"><strong className="text-sm text-slate-950">{application.name}</strong><small className="rounded bg-sky-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-sky-800">Disponible</small></span>
                <span className="mt-1 block text-xs leading-5 text-slate-600">{application.description}</span>
                {application.appId === "visual-inventory" && <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wide text-amber-700">Independiente · conexión ERP pendiente</span>}
              </span>
            </button>
          );
        })}
      </div>
      {applications.length === 0 && <p className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">No hay aplicaciones móviles disponibles.</p>}
    </section>
  );
}
