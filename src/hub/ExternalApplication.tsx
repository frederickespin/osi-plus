import { ArrowLeft, Calculator, ExternalLink } from "lucide-react";
import type { HubApplication } from "./appCatalog";

export default function ExternalApplication({ application, onNavigate }: {
  application: HubApplication;
  onNavigate: (pathname: string) => void;
}) {
  if (!application.externalHref) return null;
  return (
    <section className="mx-auto max-w-3xl px-4 py-6 sm:px-7 sm:py-9" data-testid="hub-external-application">
      <button type="button" onClick={() => onNavigate("/mobile")} className="flex min-h-11 items-center gap-2 rounded-lg px-2 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-950">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />Volver a OSi Plus Mobile
      </button>
      <div className="mt-4 flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white"><Calculator className="h-5 w-5" aria-hidden="true" /></span>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.2em] text-emerald-700">Aplicación externa</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{application.name}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{application.description}</p>
        </div>
      </div>
      <a href={application.externalHref} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600" aria-describedby="external-application-note">
        Abrir {application.name}<ExternalLink className="h-4 w-4" aria-hidden="true" />
      </a>
      <p id="external-application-note" className="mt-3 text-sm leading-6 text-slate-600">Se abre en otra pestaña. Esta pestaña conserva OSi Plus Mobile para que puedas regresar.</p>
    </section>
  );
}
