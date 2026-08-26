import { useState, type ElementType } from "react";
import {
  Boxes,
  BriefcaseBusiness,
  ChevronLeft,
  ChevronRight,
  Home,
  LogOut,
  Menu,
  Route,
  Settings,
  Truck,
  UserRound,
  Users,
  Warehouse,
  Wrench,
  X,
} from "lucide-react";
import CommercialInboxModule from "./CommercialInboxModule";
import type { CrmCaseMutationUiAccess } from "@/crm-relational/mutationAccess";

type Props = Readonly<{
  authorization?: string;
  caseRef?: string | null;
  role: string;
  mutationAccess: CrmCaseMutationUiAccess;
  userName?: string;
  onNavigate(pathname: string): void;
  onLogout(): void;
  onUnauthorized(): void;
}>;

type NavigationItem = Readonly<{
  label: string;
  icon: ElementType;
  functional: boolean;
}>;

const NAVIGATION: readonly NavigationItem[] = Object.freeze([
  { label: "General", icon: Home, functional: false },
  { label: "Administración", icon: Settings, functional: false },
  { label: "Comercial", icon: BriefcaseBusiness, functional: true },
  { label: "Coordinación", icon: Route, functional: false },
  { label: "Operaciones", icon: Truck, functional: false },
  { label: "Campo y Taller", icon: Wrench, functional: false },
  { label: "Logística", icon: Warehouse, functional: false },
  { label: "Recursos Humanos", icon: Users, functional: false },
]);

function Navigation({ collapsed, onCommercial, onHub }: { collapsed: boolean; onCommercial(): void; onHub(): void }) {
  return <nav aria-label="Módulos del ERP" className="flex-1 overflow-y-auto px-3 py-4">
    <button
      type="button"
      onClick={onHub}
      className="mb-4 flex w-full items-center gap-3 rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-left text-sm text-blue-50 hover:bg-white/10"
    >
      <Boxes className="h-4 w-4 shrink-0 text-amber-300" />
      {!collapsed && <span>OSi Plus Hub</span>}
    </button>
    <p className={`px-3 pb-2 text-[10px] font-bold uppercase tracking-[.18em] text-blue-200/65 ${collapsed ? "sr-only" : ""}`}>Aplicaciones ERP</p>
    <div className="space-y-1">
      {NAVIGATION.map(({ label, icon: Icon, functional }) => functional ? (
        <div key={label}>
          <button type="button" onClick={onCommercial} aria-current="page" className="flex w-full items-center gap-3 rounded-lg bg-sky-500 px-3 py-2.5 text-left text-sm font-semibold text-white shadow-sm"><Icon className="h-4 w-4 shrink-0" />{!collapsed && <><span className="flex-1">{label}</span><span className="rounded bg-white/20 px-1.5 py-0.5 text-[9px] uppercase">Activo</span></>}</button>
          {!collapsed && <div className="ml-7 mt-1 space-y-0.5 border-l border-blue-300/30 pl-3"><button type="button" onClick={onCommercial} className="block w-full rounded px-2 py-1.5 text-left text-xs font-semibold text-white hover:bg-white/10">Pipeline</button><div className="rounded px-2 py-1.5 text-xs text-blue-100/65">Clientes · En integración</div><div className="rounded px-2 py-1.5 text-xs text-blue-100/65">Seguimiento · En integración</div></div>}
        </div>
      ) : (
        <div
          key={label}
          aria-disabled="true"
          title={`${label}: En integración`}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-blue-100/70"
        >
          <Icon className="h-4 w-4 shrink-0" />
          {!collapsed && <><span className="flex-1">{label}</span><span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] uppercase text-blue-100/65">En integración</span></>}
        </div>
      ))}
    </div>
  </nav>;
}

function Sidebar({ collapsed, userName, role, onCollapse, onCommercial, onHub, onLogout }: {
  collapsed: boolean;
  userName?: string;
  role: string;
  onCollapse(): void;
  onCommercial(): void;
  onHub(): void;
  onLogout(): void;
}) {
  return <aside className={`flex h-full flex-col bg-[#003366] text-white shadow-xl transition-[width] ${collapsed ? "w-[76px]" : "w-[286px]"}`}>
    <div className="flex h-[72px] items-center gap-3 border-b border-white/15 px-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-lg font-black text-[#003366]">OS</span>
      {!collapsed && <div className="min-w-0"><p className="truncate text-lg font-black tracking-tight">OSi Plus ERP</p><p className="text-[10px] uppercase tracking-[.18em] text-blue-200">Gestión integrada</p></div>}
    </div>
    <Navigation collapsed={collapsed} onCommercial={onCommercial} onHub={onHub} />
    <div className="border-t border-white/15 p-3">
      <div className={`mb-2 flex items-center gap-3 rounded-lg bg-white/5 p-2.5 ${collapsed ? "justify-center" : ""}`}>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-400 font-black text-[#003366]"><UserRound className="h-4 w-4" /></span>
        {!collapsed && <div className="min-w-0"><p className="truncate text-sm font-semibold">{userName || "Usuario"}</p><p className="text-[10px] uppercase tracking-wide text-blue-200">Rol {role}</p></div>}
      </div>
      <button type="button" onClick={onLogout} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-red-200 hover:bg-red-500/15 ${collapsed ? "justify-center" : ""}`}><LogOut className="h-4 w-4" />{!collapsed && "Cerrar sesión"}</button>
      <button type="button" aria-label={collapsed ? "Expandir navegación ERP" : "Colapsar navegación ERP"} onClick={onCollapse} className="mt-1 hidden w-full items-center justify-center rounded-lg px-3 py-2 text-blue-200 hover:bg-white/10 lg:flex">{collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}</button>
    </div>
  </aside>;
}

export default function AdvancedErpShell({ authorization, caseRef, role, mutationAccess, userName, onNavigate, onLogout, onUnauthorized }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const goCommercial = () => {
    setMobileOpen(false);
    onNavigate("/commercial");
  };
  const goHub = () => {
    setMobileOpen(false);
    onNavigate("/hub");
  };
  const sidebar = <Sidebar collapsed={collapsed} userName={userName} role={role} onCollapse={() => setCollapsed((value) => !value)} onCommercial={goCommercial} onHub={goHub} onLogout={onLogout} />;

  return <div className="flex min-h-screen bg-[#f4f7fb]" data-testid="advanced-erp-shell">
    <div className="sticky top-0 hidden h-screen lg:block">{sidebar}</div>
    {mobileOpen && <div className="fixed inset-0 z-50 flex lg:hidden"><div className="h-full">{sidebar}</div><button type="button" aria-label="Cerrar navegación ERP" className="flex-1 bg-slate-950/55" onClick={() => setMobileOpen(false)} /></div>}
    <div className="min-w-0 flex-1">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 shadow-sm backdrop-blur sm:px-6">
        <div className="flex items-center gap-3">
          <button type="button" aria-label="Abrir navegación ERP" className="rounded-lg border border-slate-200 p-2 text-[#003366] lg:hidden" onClick={() => setMobileOpen(true)}><Menu className="h-5 w-5" /></button>
          <div><p className="text-sm font-black text-[#003366]">Comercial y CRM</p><p className="text-[10px] uppercase tracking-[.16em] text-slate-500">Control comercial relacional</p></div>
        </div>
        <div className="flex items-center gap-2"><span className="hidden rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-[#003366] sm:inline">ERP avanzado</span><button type="button" aria-label="Cerrar navegación ERP" className="hidden"><X /></button></div>
      </header>
      <main>
        <CommercialInboxModule
          authorization={authorization}
          mutationAccess={mutationAccess}
          role={role}
          caseRef={caseRef}
          onBack={goHub}
          onOpenCase={(nextCaseRef) => onNavigate(`/commercial/cases/${nextCaseRef}`)}
          onReturnToInbox={goCommercial}
          onUnauthorized={onUnauthorized}
        />
      </main>
    </div>
  </div>;
}
