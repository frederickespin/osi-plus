import { AlertTriangle, Boxes, ClipboardCheck, Ruler, ShieldCheck } from "lucide-react";
import { EVALUATOR_BACKEND_STATUS } from "@/evaluator-canonical/contracts";

const capabilities = [
  { icon: Boxes, title: "Inventario", detail: "Volumen y peso con reglas puras portadas del Evaluador moderno." },
  { icon: Ruler, title: "Acceso", detail: "Escaleras, elevador, cuerda y grúa con validación explícita." },
  { icon: ShieldCheck, title: "Riesgos", detail: "Permisos y terceros permanecen como captura presentacional." },
  { icon: ClipboardCheck, title: "Sincronización", detail: "Draft y submission esperan contratos server-backed." },
] as const;

export function EvaluatorCanonicalModule() {
  return (
    <div className="min-h-full bg-slate-50 p-4 md:p-8" data-testid="evaluator-canonical-root">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-3xl bg-gradient-to-br from-[#003366] to-[#075985] p-6 text-white shadow-lg md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-200">Evaluador canónico</p>
          <h1 className="mt-2 text-2xl font-bold md:text-4xl">Visitas técnicas, sin datos simulados</h1>
          <p className="mt-3 max-w-3xl text-sm text-sky-50 md:text-base">
            La experiencia moderna está preparada. La lista de visitas, el catálogo, los borradores y el envío
            se habilitarán cuando exista una API empresarial revisada.
          </p>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Capacidades preparadas">
          {capabilities.map(({ icon: Icon, title, detail }) => (
            <article key={title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <Icon className="h-5 w-5 text-sky-700" aria-hidden="true" />
              <h2 className="mt-3 font-semibold text-slate-900">{title}</h2>
              <p className="mt-1 text-sm text-slate-600">{detail}</p>
            </article>
          ))}
        </section>

        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5" role="status" aria-live="polite">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
            <div>
              <h2 className="font-semibold text-amber-950">Backend del Evaluador no disponible</h2>
              <p className="mt-1 text-sm text-amber-900">
                No se consultaron mocks ni almacenamiento local. Esta pantalla no representa visitas reales.
              </p>
              <code className="mt-3 inline-block rounded bg-amber-100 px-2 py-1 text-xs text-amber-950">
                EVALUATOR_BACKEND_STATUS={EVALUATOR_BACKEND_STATUS}
              </code>
            </div>
          </div>
        </section>

        <nav className="sticky bottom-3 grid grid-cols-4 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur md:hidden" aria-label="Navegación móvil del Evaluador">
          {['Visitas', 'Inventario', 'Acceso', 'Resumen'].map((label, index) => (
            <button key={label} type="button" disabled className={`rounded-xl px-2 py-2 text-xs font-medium ${index === 0 ? 'bg-sky-50 text-sky-800' : 'text-slate-400'}`}>
              {label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
