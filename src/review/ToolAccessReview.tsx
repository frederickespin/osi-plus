/**
 * Isolated, public review of navigation only. Does not mount App, auth,
 * a synthetic actor, a business API, or any operational storage.
 * The authenticated application mounts the same launcher in HubWorkspace.
 */
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowLeft, ArrowUpRight, Calculator, LayoutGrid, Smartphone } from "lucide-react";
import ExternalToolLauncher from "@/hub/ExternalToolLauncher";
import "../index.css";

const ORIGINAL_HUB = "https://osi-plus-v17-experience-preview-02a-cxp80thtn.vercel.app/hub";
const REVIEW_ROUTES = new Set(["/", "/hub", "/quotation-tools", "/mobile-processes"]);

function ReviewApp() {
  const [pathname, setPathname] = useState(window.location.pathname.replace(/\/$/, "") || "/");
  useEffect(() => {
    const update = () => setPathname(window.location.pathname.replace(/\/$/, "") || "/");
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  function navigate(path: string) {
    if (!REVIEW_ROUTES.has(path)) return;
    window.history.pushState({}, "", path);
    setPathname(path);
    window.scrollTo(0, 0);
  }
  const isHome = pathname === "/hub" || pathname === "/";
  return <div className="min-h-screen bg-slate-50 text-slate-950">
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
        <button onClick={() => navigate("/hub")} className="inline-flex items-center gap-3 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600" aria-label="OSi Plus Hub">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-950 text-white"><LayoutGrid className="h-5 w-5" /></span>
          <span><strong className="block text-lg leading-5">OSi Plus</strong><span className="text-xs text-slate-500">Hub de aplicaciones</span></span>
        </button>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">Revisión de accesos · 01</span>
      </div>
    </header>
    <nav aria-label="Navegación de herramientas" className="mx-auto flex max-w-5xl flex-wrap gap-x-5 gap-y-2 border-b border-slate-200 px-5 py-3 text-sm sm:px-8">
      <button onClick={() => navigate("/hub")} aria-current={isHome ? "page" : undefined} className="rounded py-1 font-semibold text-slate-600 hover:text-indigo-700 aria-[current=page]:text-indigo-700">Inicio</button>
      <button onClick={() => navigate("/quotation-tools")} aria-current={pathname === "/quotation-tools" ? "page" : undefined} className="rounded py-1 font-semibold text-slate-600 hover:text-indigo-700 aria-[current=page]:text-indigo-700">Herramientas de cotización</button>
      <button onClick={() => navigate("/mobile-processes")} aria-current={pathname === "/mobile-processes" ? "page" : undefined} className="rounded py-1 font-semibold text-slate-600 hover:text-indigo-700 aria-[current=page]:text-indigo-700">Procesos móviles</button>
    </nav>
    {isHome ? <main className="mx-auto max-w-5xl px-5 py-9 sm:px-8 sm:py-12">
      <p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-600">OSi Plus Hub</p>
      <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Tus herramientas, en su lugar</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Accede a la calculadora y al inventario visual que ya utilizas. Conservan su diseño y sus datos actuales.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <button onClick={() => navigate("/quotation-tools")} className="group rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-600 text-white"><Calculator className="h-5 w-5" /></span>
          <h2 className="mt-5 text-lg font-bold">Herramientas de cotización</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Calculadora de empaque, artículos, materiales y reportes.</p>
          <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-indigo-700">Abrir módulo <ArrowUpRight className="h-4 w-4" /></span>
        </button>
        <button onClick={() => navigate("/mobile-processes")} className="group rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-600 text-white"><Smartphone className="h-5 w-5" /></span>
          <h2 className="mt-5 text-lg font-bold">Procesos móviles</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Levantamientos, artículos y fotografías desde el inventario visual.</p>
          <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-indigo-700">Abrir módulo <ArrowUpRight className="h-4 w-4" /></span>
        </button>
      </div>
      <p className="mt-6 max-w-2xl text-xs leading-5 text-slate-500">Esta revisión permite comprobar los nuevos accesos. La vinculación automática de expedientes, materiales y cotizaciones entre OSI y la Suite sigue pendiente.</p>
    </main> : pathname === "/quotation-tools" ? <main><ExternalToolLauncher toolId="packing" /></main> : pathname === "/mobile-processes" ? <main><ExternalToolLauncher toolId="visual-inventory" /></main> : <main className="mx-auto max-w-5xl px-5 py-12"><h1 className="text-2xl font-bold">Esta ruta no pertenece a la revisión</h1><button className="mt-4 text-indigo-700" onClick={() => navigate("/hub")}>Volver al inicio</button></main>}
    <footer className="mx-auto max-w-5xl border-t border-slate-200 px-5 py-5 text-xs text-slate-500 sm:px-8">
      <a href={ORIGINAL_HUB} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="inline-flex items-center gap-2 rounded py-1 font-semibold text-slate-600 hover:text-indigo-700"><ArrowLeft className="h-4 w-4" /> Abrir el Hub completo de demostración <span className="sr-only">en otra pestaña</span></a>
    </footer>
  </div>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><ReviewApp /></StrictMode>);
