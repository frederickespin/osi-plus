import { Suspense, lazy, useEffect, useMemo, useState, type ElementType } from "react";
import { BriefcaseBusiness, ClipboardCheck, Hammer, LayoutGrid, LogOut, Menu, Route, Settings, Truck, Users, Warehouse } from "lucide-react";
import { ENV_LABELS, getAppEnv } from "@/lib/env";
import { HUB_APPLICATIONS, findHubApplicationByRoute, type HubApplication, type HubIconId } from "./appCatalog";
import { evaluateHubAccess, visibleHubApplications, type HubAccessContext } from "./hubAccess";

const OsiSurveyInactive = lazy(() => import("./OsiSurveyInactive"));

const ICONS: Record<HubIconId, ElementType> = {
  briefcase: BriefcaseBusiness,
  route: Route,
  truck: Truck,
  warehouse: Warehouse,
  hammer: Hammer,
  settings: Settings,
  users: Users,
  clipboard: ClipboardCheck,
};

type Props = {
  userName?: string;
  accessContext: HubAccessContext;
  onLogout: () => void;
};

function currentPath() {
  return window.location.pathname === "/" ? "/hub" : window.location.pathname;
}

function navigate(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo({ top: 0, behavior: "instant" });
}

function statusLabel(application: HubApplication) {
  return application.status === "PLANNED" ? "Próximamente" : "Fundación inactiva";
}

function environmentLabel() {
  return ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)
    ? "Desarrollo local"
    : ENV_LABELS[getAppEnv()];
}

function HubHome({ applications, userName }: { applications: readonly HubApplication[]; userName?: string }) {
  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-11">
      <p className="text-xs font-bold uppercase tracking-[.2em] text-indigo-600">OSi Plus Hub</p>
      <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Hola, {userName || "Usuario"}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">El catálogo muestra únicamente accesos derivados del contexto autenticado. Esta fundación local no activa ninguna aplicación.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {applications.map((application) => {
          const Icon = ICONS[application.icon];
          return (
            <button key={application.appId} onClick={() => navigate(application.route)} className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-lg">
              <div className="flex items-start justify-between gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-600 text-white"><Icon className="h-5 w-5" /></span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">{statusLabel(application)}</span></div>
              <h2 className="mt-5 font-bold text-slate-950">{application.name}</h2>
              <p className="mt-2 min-h-10 text-xs leading-5 text-slate-600">{application.description}</p>
              <p className="mt-5 text-xs font-semibold text-indigo-600">Ver descriptor →</p>
            </button>
          );
        })}
      </div>
      {applications.length === 0 && <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">No hay aplicaciones habilitadas para este contexto.</div>}
    </div>
  );
}

function AccessDenied({ application }: { application: HubApplication }) {
  return <section className="mx-auto max-w-xl px-5 py-16 text-center" data-testid="hub-forbidden"><p className="text-sm font-bold text-red-700">403 · Acceso no autorizado</p><h1 className="mt-3 text-2xl font-black">{application.name}</h1><p className="mt-2 text-sm text-slate-600">La ruta directa y la tarjeta utilizan la misma decisión de acceso. Ocultar una tarjeta no sustituye la autorización del backend.</p></section>;
}

function RegisteredApplication({ application }: { application: HubApplication }) {
  const Icon = ICONS[application.icon];
  return <section className="mx-auto max-w-3xl px-5 py-12"><div className="rounded-3xl border bg-white p-8 shadow-sm"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-indigo-100 text-indigo-700"><Icon className="h-7 w-7" /></span><p className="mt-6 text-xs font-bold uppercase tracking-[.2em] text-indigo-600">Aplicación registrada</p><h1 className="mt-2 text-3xl font-black">{application.name}</h1><p className="mt-3 text-sm leading-6 text-slate-600">{application.description}</p><div className="mt-7 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900"><strong>Fundación inactiva.</strong> La conexión funcional se realizará en un lote separado; esta vista no ejecuta APIs ni monta el módulo heredado.</div></div></section>;
}

export default function HubWorkspace({ userName, accessContext, onLogout }: Props) {
  const [pathname, setPathname] = useState(currentPath);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    const update = () => { setPathname(currentPath()); setMobileOpen(false); };
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  const visible = useMemo(() => visibleHubApplications(HUB_APPLICATIONS, accessContext), [accessContext]);
  const selected = findHubApplicationByRoute(pathname);
  const decision = selected ? evaluateHubAccess(selected, accessContext) : null;
  const sidebar = (
    <aside className="flex h-full w-72 flex-col bg-slate-950 text-white">
      <button onClick={() => navigate("/hub")} className="flex items-center gap-3 border-b border-white/10 p-5 text-left"><span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-500"><LayoutGrid className="h-5 w-5" /></span><span><strong className="block">OSi Plus</strong><small className="text-slate-400">Hub canónico local</small></span></button>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Aplicaciones OSi Plus"><button onClick={() => navigate("/hub")} className={`w-full rounded-xl px-3 py-2.5 text-left text-sm ${pathname === "/hub" ? "bg-white/15" : "text-slate-300 hover:bg-white/10"}`}>Inicio</button>{visible.map((application) => { const Icon = ICONS[application.icon]; return <button key={application.appId} onClick={() => navigate(application.route)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm ${pathname === application.route ? "bg-indigo-500 text-white" : "text-slate-300 hover:bg-white/10"}`}><Icon className="h-4 w-4" />{application.name}</button>; })}</nav>
      <div className="border-t border-white/10 p-4"><p className="mb-3 text-xs text-slate-400">{userName || "Usuario"}<br />{environmentLabel()}</p><button onClick={onLogout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-300 hover:bg-red-500/10"><LogOut className="h-4 w-4" />Cerrar sesión</button></div>
    </aside>
  );
  const content = pathname === "/hub" ? <HubHome applications={visible} userName={userName} /> : selected ? !decision?.allowed ? <AccessDenied application={selected} /> : selected.appId === "osi-survey" ? <Suspense fallback={<div className="p-8 text-sm text-slate-500">Cargando descriptor…</div>}><OsiSurveyInactive /></Suspense> : <RegisteredApplication application={selected} /> : <section className="p-12 text-center"><p className="font-bold">404 · Ruta del Hub no registrada</p></section>;
  return <div className="flex min-h-screen bg-slate-50"><div className="hidden lg:block">{sidebar}</div>{mobileOpen && <div className="fixed inset-0 z-50 flex lg:hidden"><div className="h-full">{sidebar}</div><button aria-label="Cerrar navegación" className="flex-1 bg-black/50" onClick={() => setMobileOpen(false)} /></div>}<div className="min-w-0 flex-1"><header className="flex h-16 items-center justify-between border-b bg-white px-4 sm:px-6"><button aria-label="Abrir navegación" className="rounded-lg border p-2 lg:hidden" onClick={() => setMobileOpen(true)}><Menu className="h-5 w-5" /></button><button onClick={() => navigate("/hub")} className="text-sm font-bold text-slate-900">OSi Plus Hub</button><span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800">LOCAL_ONLY</span></header><main>{content}</main></div></div>;
}
