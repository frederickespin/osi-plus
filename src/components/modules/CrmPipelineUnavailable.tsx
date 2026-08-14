import { Inbox, LockKeyhole } from "lucide-react";

export function CrmPipelineUnavailable() {
  return (
    <div className="min-h-full bg-slate-50 p-4 md:p-8" data-testid="crm-pipeline-unavailable">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-3xl bg-gradient-to-br from-[#003366] to-[#075985] p-6 text-white shadow-lg md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-200">Inbox Comercial</p>
          <h1 className="mt-2 text-2xl font-bold md:text-4xl">Pipeline relacional</h1>
          <p className="mt-3 max-w-3xl text-sm text-sky-50 md:text-base">
            La experiencia visual está preparada; los casos y comandos permanecen bajo autoridad del servidor.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" role="status" aria-live="polite">
          <div className="flex items-start gap-3">
            <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-slate-700" aria-hidden="true" />
            <div>
              <h2 className="font-semibold text-slate-950">CRM inactivo en este ambiente</h2>
              <p className="mt-1 text-sm text-slate-600">
                No se solicitaron oportunidades ni se cargó el cliente relacional. Esta vista no contiene datos simulados.
              </p>
            </div>
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-3" aria-label="Fronteras del Pipeline">
          {[
            "Owner y tenant provienen del servidor",
            "APPROVED permanece congelado",
            "OPS_HANDOFF permanece terminal",
          ].map((label) => (
            <div key={label} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
              <Inbox className="h-4 w-4 text-sky-700" aria-hidden="true" />
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
