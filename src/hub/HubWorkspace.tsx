import { Suspense, lazy, useMemo, useState, type ElementType } from "react";
import { BriefcaseBusiness, ClipboardCheck, Hammer, LayoutGrid, LogOut, Menu, Route, Settings, Truck, Users, Warehouse } from "lucide-react";
import { ENV_LABELS, getAppEnv } from "@/lib/env";
import { HUB_APPLICATIONS, commercialCaseRefFromRoute, findHubApplicationByRoute, type HubApplication, type HubIconId } from "./appCatalog";
import { visibleHubApplications, type HubAccessContext } from "./hubAccess";
import type { OsiHubMode } from "./hubMode";
import { resolveCrmCaseMutationUiAccess } from "@/crm-relational/mutationAccess";
import { resolveCrmServicesUiAccess } from "@/crm-services/access";
import { isAdminIdentityInvitationEnabled, isAdminTenantMembershipEnabled, resolveAdminIdentityInvitationMode } from "@/admin-tenant/adminMode";
import { isSurveyUiEnabled } from "@/survey/mode";
import { isMaterialsUiEnabled } from "@/materials-inventory/mode";
import { isToolsEquipmentUiEnabled } from "@/tools-equipment/mode";
import { resolveLogisticsUiAccess } from "@/logistics-engine/access";
import { isLogisticsUiEnabled } from "@/logistics-engine/mode";

const OsiSurveyInactive = lazy(() => import("./OsiSurveyInactive"));
const AdvancedErpShell = lazy(() => import("@/commercial-crm/AdvancedErpShell"));
const AdminTenantMembershipModule = lazy(() => import("@/admin-tenant/AdminTenantMembershipModule"));
const SurveyApp = lazy(() => import("@/survey/SurveyApp"));
const MaterialsInventoryApp = lazy(() => import("@/materials-inventory/MaterialsInventoryApp"));
const ToolsEquipmentApp = lazy(() => import("@/tools-equipment/ToolsEquipmentApp"));

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
  authorization?: string;
  accessContext: HubAccessContext;
  crmReadEnabled: boolean;
  mode: OsiHubMode;
  pathname: string;
  onNavigate: (pathname: string) => void;
  onLogout: () => void;
};

function statusLabel(application: HubApplication, crmReadEnabled: boolean, adminEnabled: boolean, surveyEnabled: boolean, materialsEnabled: boolean, toolsEnabled: boolean) {
  if (application.appId === "commercial-crm" && crmReadEnabled) return "Disponible";
  if (application.appId === "administration" && adminEnabled) return "Disponible";
  if (application.appId === "osi-survey" && surveyEnabled) return "Disponible";
  if (application.appId === "materials-equipment" && materialsEnabled) return "Disponible";
  if (application.appId === "tools-equipment" && toolsEnabled) return "Disponible";
  return application.status === "PLANNED" ? "Próximamente" : "En integración";
}

function ctaLabel(application: HubApplication, crmReadEnabled: boolean, adminEnabled: boolean, surveyEnabled: boolean, materialsEnabled: boolean, toolsEnabled: boolean) {
  if (application.appId === "commercial-crm" && crmReadEnabled) return "Abrir ERP →";
  if (application.appId === "administration" && adminEnabled) return "Abrir Administración →";
  if (application.appId === "osi-survey" && surveyEnabled) return "Abrir Survey →";
  if (application.appId === "materials-equipment" && materialsEnabled) return "Abrir Inventario →";
  if (application.appId === "tools-equipment" && toolsEnabled) return "Abrir Activos →";
  return "Ver descriptor →";
}

function environmentLabel(mode: OsiHubMode) {
  if (mode === "PREVIEW_REHEARSAL") return "Preview";
  if (mode === "PRODUCTION_READ") return "Producción · sólo lectura";
  return ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)
    ? "Desarrollo local"
    : ENV_LABELS[getAppEnv()];
}

function HubHome({ applications, crmReadEnabled, adminEnabled, surveyEnabled, materialsEnabled, toolsEnabled, userName, onNavigate }: { applications: readonly HubApplication[]; crmReadEnabled: boolean; adminEnabled: boolean; surveyEnabled: boolean; materialsEnabled: boolean; toolsEnabled: boolean; userName?: string; onNavigate: (pathname: string) => void }) {
  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-11">
      <p className="text-xs font-bold uppercase tracking-[.2em] text-indigo-600">OSi Plus Hub</p>
      <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Hola, {userName || "Usuario"}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">El catálogo muestra únicamente accesos derivados del contexto autenticado. Comercial abre el ERP sólo cuando la sesión y el entorno están autorizados.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {applications.map((application) => {
          const Icon = ICONS[application.icon];
          return (
            <button key={application.appId} onClick={() => onNavigate(application.route)} className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-lg">
              <div className="flex items-start justify-between gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-600 text-white"><Icon className="h-5 w-5" /></span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">{statusLabel(application, crmReadEnabled, adminEnabled, surveyEnabled, materialsEnabled, toolsEnabled)}</span></div>
              <h2 className="mt-5 font-bold text-slate-950">{application.name}</h2>
              <p className="mt-2 min-h-10 text-xs leading-5 text-slate-600">{application.description}</p>
              <p className="mt-5 text-xs font-semibold text-indigo-600">{ctaLabel(application, crmReadEnabled, adminEnabled, surveyEnabled, materialsEnabled, toolsEnabled)}</p>
            </button>
          );
        })}
      </div>
      {applications.length === 0 && <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">No hay aplicaciones habilitadas para este contexto.</div>}
    </div>
  );
}

function RegisteredApplication({ application }: { application: HubApplication }) {
  const Icon = ICONS[application.icon];
  return <section className="mx-auto max-w-3xl px-5 py-12"><div className="rounded-3xl border bg-white p-8 shadow-sm"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-indigo-100 text-indigo-700"><Icon className="h-7 w-7" /></span><p className="mt-6 text-xs font-bold uppercase tracking-[.2em] text-indigo-600">Aplicación registrada</p><h1 className="mt-2 text-3xl font-black">{application.name}</h1><p className="mt-3 text-sm leading-6 text-slate-600">{application.description}</p><div className="mt-7 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900"><strong>En integración.</strong> La conexión funcional se realizará en un lote separado; esta vista no ejecuta APIs ni monta el módulo heredado.</div></div></section>;
}

export default function HubWorkspace({ userName, authorization, accessContext, crmReadEnabled, mode, pathname, onNavigate, onLogout }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const visible = useMemo(() => visibleHubApplications(HUB_APPLICATIONS, accessContext), [accessContext]);
  const selected = findHubApplicationByRoute(pathname);
  const commercialCaseRef = commercialCaseRefFromRoute(pathname);
  const adminEnabled = isAdminTenantMembershipEnabled();
  const adminInvitationsEnabled = isAdminIdentityInvitationEnabled();
  const adminInvitationMode = resolveAdminIdentityInvitationMode();
  const surveyEnabled = isSurveyUiEnabled();
  const materialsEnabled = isMaterialsUiEnabled();
  const toolsEnabled = isToolsEquipmentUiEnabled();
  const toolsAuthorized = visible.some((application) => application.appId === "tools-equipment");
  if (selected?.appId === "commercial-crm" && crmReadEnabled) {
    return <Suspense fallback={<div className="grid min-h-screen place-items-center bg-[#003366] text-sm font-semibold text-white">Cargando ERP Comercial…</div>}>
      <AdvancedErpShell
        authorization={authorization}
        caseRef={commercialCaseRef}
        role={accessContext.role}
        mutationAccess={resolveCrmCaseMutationUiAccess(accessContext)}
        servicesAccess={resolveCrmServicesUiAccess(accessContext.effectivePermissions, accessContext.deniedPermissions)}
        logisticsAccess={resolveLogisticsUiAccess(accessContext.effectivePermissions, accessContext.deniedPermissions)}
        logisticsEnabled={isLogisticsUiEnabled()}
        userName={userName}
        onNavigate={onNavigate}
        onLogout={onLogout}
        onUnauthorized={onLogout}
      />
    </Suspense>;
  }
  if (selected?.appId === "administration" && adminEnabled) {
    return <Suspense fallback={<div className="grid min-h-screen place-items-center bg-slate-50 text-sm font-semibold text-slate-600">Cargando Administración…</div>}>
      <AdminTenantMembershipModule
        authorization={authorization}
        effectivePermissions={accessContext.effectivePermissions || []}
        deniedPermissions={accessContext.deniedPermissions}
        servicesAccess={resolveCrmServicesUiAccess(accessContext.effectivePermissions, accessContext.deniedPermissions)}
        invitationEnabled={adminInvitationsEnabled}
        invitationMode={adminInvitationMode}
        onUnauthorized={onLogout}
      />
    </Suspense>;
  }
  if (selected?.appId === "osi-survey" && surveyEnabled) {
    return <Suspense fallback={<div className="grid min-h-screen place-items-center bg-slate-50 text-sm font-semibold text-slate-600">Cargando Survey…</div>}>
      <SurveyApp authorization={authorization} onUnauthorized={onLogout} />
    </Suspense>;
  }
  if (selected?.appId === "materials-equipment" && materialsEnabled) {
    return <Suspense fallback={<div className="grid min-h-screen place-items-center bg-[#003366] text-sm font-semibold text-white">Cargando Materiales e Inventario…</div>}>
      <MaterialsInventoryApp authorization={authorization} effectivePermissions={accessContext.effectivePermissions || []} deniedPermissions={accessContext.deniedPermissions} onNavigate={onNavigate} onUnauthorized={onLogout} />
    </Suspense>;
  }
  if (selected?.appId === "tools-equipment" && toolsEnabled && toolsAuthorized) {
    return <Suspense fallback={<div className="grid min-h-screen place-items-center bg-[#003366] text-sm font-semibold text-white">Cargando Herramientas y Equipos…</div>}>
      <ToolsEquipmentApp authorization={authorization} effectivePermissions={accessContext.effectivePermissions || []} deniedPermissions={accessContext.deniedPermissions} onNavigate={onNavigate} onUnauthorized={onLogout} />
    </Suspense>;
  }
  const sidebar = (
    <aside className="flex h-full w-72 flex-col bg-slate-950 text-white">
      <button onClick={() => onNavigate("/hub")} className="flex items-center gap-3 border-b border-white/10 p-5 text-left"><span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-500"><LayoutGrid className="h-5 w-5" /></span><span><strong className="block">OSi Plus</strong><small className="text-slate-400">Hub de aplicaciones</small></span></button>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Aplicaciones OSi Plus"><button onClick={() => onNavigate("/hub")} className={`w-full rounded-xl px-3 py-2.5 text-left text-sm ${pathname === "/hub" ? "bg-white/15" : "text-slate-300 hover:bg-white/10"}`}>Inicio</button>{visible.map((application) => { const Icon = ICONS[application.icon]; const active = selected?.appId === application.appId; return <button key={application.appId} onClick={() => onNavigate(application.route)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm ${active ? "bg-indigo-500 text-white" : "text-slate-300 hover:bg-white/10"}`}><Icon className="h-4 w-4" />{application.name}</button>; })}</nav>
      <div className="border-t border-white/10 p-4"><p className="mb-3 text-xs text-slate-400">{userName || "Usuario"}<br />{environmentLabel(mode)}</p><button onClick={onLogout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-300 hover:bg-red-500/10"><LogOut className="h-4 w-4" />Cerrar sesión</button></div>
    </aside>
  );
  const content = pathname === "/hub"
    ? <HubHome applications={visible} crmReadEnabled={crmReadEnabled} adminEnabled={adminEnabled} surveyEnabled={surveyEnabled} materialsEnabled={materialsEnabled} toolsEnabled={toolsEnabled} userName={userName} onNavigate={onNavigate} />
    : selected
      ? selected.appId === "osi-survey"
            ? <Suspense fallback={<div className="p-8 text-sm text-slate-500">Cargando descriptor…</div>}><OsiSurveyInactive /></Suspense>
            : <RegisteredApplication application={selected} />
      : <section className="p-12 text-center"><p className="font-bold">404 · Ruta del Hub no registrada</p></section>;
  return <div className="flex min-h-screen bg-slate-50"><div className="hidden lg:block">{sidebar}</div>{mobileOpen && <div className="fixed inset-0 z-50 flex lg:hidden"><div className="h-full">{sidebar}</div><button aria-label="Cerrar navegación" className="flex-1 bg-black/50" onClick={() => setMobileOpen(false)} /></div>}<div className="min-w-0 flex-1"><header className="flex h-16 items-center justify-between border-b bg-white px-4 sm:px-6"><button aria-label="Abrir navegación" className="rounded-lg border p-2 lg:hidden" onClick={() => setMobileOpen(true)}><Menu className="h-5 w-5" /></button><button onClick={() => onNavigate("/hub")} className="text-sm font-bold text-slate-900">OSi Plus Hub</button><span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800">{mode === "PRODUCTION_READ" ? "CRM · sólo lectura" : mode}</span></header><main>{content}</main></div></div>;
}
