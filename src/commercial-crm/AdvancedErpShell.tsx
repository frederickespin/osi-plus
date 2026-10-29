import { Suspense, lazy, useState, type ElementType } from "react";
import {
  Boxes,
  BriefcaseBusiness,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  Settings,
  Smartphone,
  UserRound,
  Warehouse,
  Wrench,
  X,
} from "lucide-react";
import CommercialInboxModule from "./CommercialInboxModule";
import type { HubApplication } from "@/hub/appCatalog";
import type { CrmCaseMutationUiAccess } from "@/crm-relational/mutationAccess";
import type { CrmServicesUiAccess } from "@/crm-services/access";
import type { LogisticsUiAccess } from "@/logistics-engine/access";
import type { CostingUiAccess } from "@/costing/access";
import type { QuoteUiAccess } from "@/quote/access";
import type { SurveySchedulingUiAccess } from "@/survey/schedulingAccess";
import type { CommercialRelationshipsAccess } from "@/commercial-relationships/access";
import type { CommunicationsAccess } from "@/communications/access";
import type { ClientTemporaryAccessUi } from "@/client-portal/access";

const CommercialRelationshipsAdmin = lazy(() => import("@/commercial-relationships/CommercialRelationshipsAdmin"));

type Props = Readonly<{
  authorization?: string;
  caseRef?: string | null;
  role: string;
  mutationAccess: CrmCaseMutationUiAccess;
  servicesAccess: CrmServicesUiAccess;
  logisticsAccess: LogisticsUiAccess;
  logisticsEnabled: boolean;
  costingAccess: CostingUiAccess;
  costingEnabled: boolean;
  quoteAccess: QuoteUiAccess;
  quoteEnabled: boolean;
  surveyEnabled: boolean;
  surveySchedulingAccess: SurveySchedulingUiAccess;
  materialsEnabled: boolean;
  toolsEnabled: boolean;
  commercialRelationshipsEnabled: boolean;
  commercialRelationshipsAdmin: boolean;
  commercialRelationshipsAccess: CommercialRelationshipsAccess;
  communicationsEnabled: boolean;
  communicationsAccess: CommunicationsAccess;
  clientTemporaryAccessEnabled: boolean;
  clientTemporaryAccess: ClientTemporaryAccessUi;
  userName?: string;
  navigationApplications: readonly HubApplication[];
  mobileAvailable: boolean;
  onNavigate(pathname: string): void;
  onLogout(): void;
  onUnauthorized(): void;
}>;

const APPLICATION_ICONS: Readonly<Record<string, ElementType>> = {
  "commercial-crm": BriefcaseBusiness,
  "materials-equipment": Warehouse,
  "tools-equipment": Wrench,
  administration: Settings,
};

type NavigationProps = {
  collapsed: boolean;
  applications: readonly HubApplication[];
  mobileAvailable: boolean;
  commercialRelationshipsEnabled: boolean;
  commercialRelationshipsAdmin: boolean;
  onNavigate(pathname: string): void;
};

function Navigation({ collapsed, applications, mobileAvailable, commercialRelationshipsEnabled, commercialRelationshipsAdmin, onNavigate }: NavigationProps) {
  return <nav aria-label="Módulos del ERP" className="flex-1 overflow-y-auto px-3 py-4">
    <button type="button" onClick={() => onNavigate("/hub")} aria-label="OSi Plus Hub" className="mb-4 flex w-full items-center gap-3 rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-left text-sm text-blue-50 hover:bg-white/10">
      <Boxes className="h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
      {!collapsed && <span>OSi Plus Hub</span>}
    </button>
    <p className={`px-3 pb-2 text-[10px] font-bold uppercase tracking-[.18em] text-blue-200/65 ${collapsed ? "sr-only" : ""}`}>Aplicaciones</p>
    <div className="space-y-1">
      {applications.map((application) => {
        const commercial = application.appId === "commercial-crm";
        const Icon = APPLICATION_ICONS[application.appId] || Boxes;
        return <div key={application.appId}>
          <button type="button" onClick={() => onNavigate(application.route)} aria-label={application.name} aria-current={commercial ? "page" : undefined} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${commercial ? "bg-sky-500 font-semibold text-white shadow-sm" : "text-blue-50 hover:bg-white/10"}`}>
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {!collapsed && <span>{application.name}</span>}
          </button>
          {commercial && !collapsed && <div className="ml-7 mt-1 space-y-0.5 border-l border-blue-300/30 pl-3">
            <button type="button" onClick={() => onNavigate("/commercial")} aria-current={!commercialRelationshipsAdmin ? "page" : undefined} className="block w-full rounded px-2 py-1.5 text-left text-xs font-semibold text-white hover:bg-white/10">Pipeline</button>
            {commercialRelationshipsEnabled && <button type="button" onClick={() => onNavigate("/commercial/relationships")} aria-current={commercialRelationshipsAdmin ? "page" : undefined} className="block w-full rounded px-2 py-1.5 text-left text-xs font-semibold text-white hover:bg-white/10">Relaciones Comerciales</button>}
          </div>}
        </div>;
      })}
      {mobileAvailable && <button type="button" onClick={() => onNavigate("/mobile")} aria-label="OSi Plus Mobile" className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-blue-50 hover:bg-white/10"><Smartphone className="h-4 w-4 shrink-0" aria-hidden="true" />{!collapsed && <span>OSi Plus Mobile</span>}</button>}
    </div>
  </nav>;
}

function Sidebar({ userName, role, onCollapse, onLogout, ...navigation }: NavigationProps & {
  userName?: string;
  role: string;
  onCollapse(): void;
  onLogout(): void;
}) {
  const { collapsed } = navigation;
  return <aside className={`flex h-full flex-col bg-[#003366] text-white shadow-xl transition-[width] ${collapsed ? "w-[76px]" : "w-[286px]"}`}>
    <div className="flex h-[72px] items-center gap-3 border-b border-white/15 px-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-lg font-black text-[#003366]">OS</span>
      {!collapsed && <div className="min-w-0"><p className="truncate text-lg font-black tracking-tight">OSi Plus ERP</p><p className="text-[10px] uppercase tracking-[.18em] text-blue-200">Gestión integrada</p></div>}
    </div>
    <Navigation {...navigation} />
    <div className="border-t border-white/15 p-3">
      <div className={`mb-2 flex items-center gap-3 rounded-lg bg-white/5 p-2.5 ${collapsed ? "justify-center" : ""}`}>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-400 font-black text-[#003366]"><UserRound className="h-4 w-4" /></span>
        {!collapsed && <div className="min-w-0"><p className="truncate text-sm font-semibold">{userName || "Usuario"}</p><p className="text-[10px] uppercase tracking-wide text-blue-200">Rol {role}</p></div>}
      </div>
      <button type="button" onClick={onLogout} aria-label="Cerrar sesión" className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-red-200 hover:bg-red-500/15 ${collapsed ? "justify-center" : ""}`}><LogOut className="h-4 w-4" />{!collapsed && "Cerrar sesión"}</button>
      <button type="button" aria-label={collapsed ? "Expandir navegación ERP" : "Colapsar navegación ERP"} onClick={onCollapse} className="mt-1 hidden w-full items-center justify-center rounded-lg px-3 py-2 text-blue-200 hover:bg-white/10 lg:flex">{collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}</button>
    </div>
  </aside>;
}

export default function AdvancedErpShell({ authorization, caseRef, role, mutationAccess, servicesAccess, logisticsAccess, logisticsEnabled, costingAccess, costingEnabled, quoteAccess, quoteEnabled, surveyEnabled, surveySchedulingAccess, commercialRelationshipsEnabled, commercialRelationshipsAdmin, commercialRelationshipsAccess, communicationsEnabled, communicationsAccess, clientTemporaryAccessEnabled, clientTemporaryAccess, userName, navigationApplications, mobileAvailable, onNavigate, onLogout, onUnauthorized }: Props) {
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
  const goResource = (pathname: string) => { setMobileOpen(false); onNavigate(pathname); };
  const sidebar = <Sidebar collapsed={collapsed} userName={userName} role={role} applications={navigationApplications} mobileAvailable={mobileAvailable} commercialRelationshipsEnabled={commercialRelationshipsEnabled && commercialRelationshipsAccess.canView} commercialRelationshipsAdmin={commercialRelationshipsAdmin} onCollapse={() => setCollapsed((value) => !value)} onNavigate={goResource} onLogout={onLogout} />;

  return <div className="flex min-h-screen bg-[#f4f7fb]" data-testid="advanced-erp-shell">
    <div className="sticky top-0 hidden h-screen lg:block">{sidebar}</div>
    {mobileOpen && <div className="fixed inset-0 z-50 flex lg:hidden"><div className="h-full">{sidebar}</div><button type="button" aria-label="Cerrar navegación ERP" className="flex-1 bg-slate-950/55" onClick={() => setMobileOpen(false)} /></div>}
    <div className="min-w-0 flex-1">
      {!caseRef && !commercialRelationshipsAdmin && <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 shadow-sm backdrop-blur sm:px-6">
        <div className="flex items-center gap-3">
          <button type="button" aria-label="Abrir navegación ERP" className="rounded-lg border border-slate-200 p-2 text-[#003366] lg:hidden" onClick={() => setMobileOpen(true)}><Menu className="h-5 w-5" /></button>
          <div><p className="text-sm font-black text-[#003366]">Comercial y CRM</p><p className="text-[10px] uppercase tracking-[.16em] text-slate-500">Control comercial relacional</p></div>
        </div>
        <div className="flex items-center gap-2"><span className="hidden rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-[#003366] sm:inline">ERP avanzado</span><button type="button" aria-label="Cerrar navegación ERP" className="hidden"><X /></button></div>
      </header>}
      <main className={caseRef ? "min-h-screen" : undefined}>
        {commercialRelationshipsAdmin && commercialRelationshipsEnabled && commercialRelationshipsAccess.canView ? <Suspense fallback={<div className="grid min-h-[60vh] place-items-center text-sm text-slate-500">Cargando Relaciones Comerciales…</div>}><CommercialRelationshipsAdmin authorization={authorization} access={commercialRelationshipsAccess} onBack={goCommercial} onUnauthorized={onUnauthorized} /></Suspense> : <CommercialInboxModule
          authorization={authorization}
          mutationAccess={mutationAccess}
          servicesAccess={servicesAccess}
          logisticsAccess={logisticsAccess}
          logisticsEnabled={logisticsEnabled}
          costingAccess={costingAccess}
          costingEnabled={costingEnabled}
          quoteAccess={quoteAccess}
          quoteEnabled={quoteEnabled}
          surveyEnabled={surveyEnabled}
          surveySchedulingAccess={surveySchedulingAccess}
          commercialRelationshipsEnabled={commercialRelationshipsEnabled}
          commercialRelationshipsAccess={commercialRelationshipsAccess}
          communicationsEnabled={communicationsEnabled}
          communicationsAccess={communicationsAccess}
          clientTemporaryAccessEnabled={clientTemporaryAccessEnabled}
          clientTemporaryAccess={clientTemporaryAccess}
          role={role}
          caseRef={caseRef}
          onOpenNavigation={() => setMobileOpen(true)}
          onBack={goHub}
          onOpenCase={(nextCaseRef) => onNavigate(`/commercial/cases/${nextCaseRef}`)}
          onNavigate={onNavigate}
          onReturnToInbox={goCommercial}
          onUnauthorized={onUnauthorized}
        />}
      </main>
    </div>
  </div>;
}
