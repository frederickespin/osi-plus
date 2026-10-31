import { Suspense, lazy, useMemo, useState, type ElementType } from "react";
import { ArrowLeft, BriefcaseBusiness, Calculator, ClipboardCheck, Hammer, LayoutGrid, LogOut, Menu, Route, Settings, Smartphone, Truck, Users, Warehouse } from "lucide-react";
import { ENV_LABELS, getAppEnv } from "@/lib/env";
import { HUB_APPLICATIONS, applicationsForHubSuite, commercialCaseRefFromRoute, findHubApplicationByRoute, type HubApplication, type HubIconId } from "./appCatalog";
import { visibleHubApplications, type HubAccessContext } from "./hubAccess";
import { availableHubApplications } from "./hubAvailability";
import OsiPlusMobileHub from "./OsiPlusMobileHub";
import ExternalApplication from "./ExternalApplication";
import type { OsiHubMode } from "./hubMode";
import { resolveCrmCaseMutationUiAccess } from "@/crm-relational/mutationAccess";
import { resolveCrmServicesUiAccess } from "@/crm-services/access";
import { isCrmServicesUiEnabled } from "@/crm-services/mode";
import { availableAdministrationSections } from "@/administration/administrationSections";
import { isAdminFleetEnabled } from "@/admin-fleet/mode";
import { resolveFleetAccess } from "@/admin-fleet/access";
import { isAdminIdentityInvitationEnabled, isAdminTenantMembershipEnabled, resolveAdminIdentityInvitationMode } from "@/admin-tenant/adminMode";
import { isSurveyUiEnabled } from "@/survey/mode";
import { resolveSurveySchedulingUiAccess } from "@/survey/schedulingAccess";
import { isMaterialsUiEnabled } from "@/materials-inventory/mode";
import { isToolsEquipmentUiEnabled } from "@/tools-equipment/mode";
import { resolveLogisticsUiAccess } from "@/logistics-engine/access";
import { isLogisticsUiEnabled } from "@/logistics-engine/mode";
import { resolveCostingUiAccess } from "@/costing/access";
import { isCostingUiEnabled } from "@/costing/mode";
import { resolveQuoteUiAccess } from "@/quote/access";
import { isQuoteUiEnabled } from "@/quote/mode";
import { isCommercialRelationshipsUiEnabled } from "@/commercial-relationships/mode";
import { resolveCommercialRelationshipsAccess } from "@/commercial-relationships/access";
import { resolveCommunicationsAccess } from "@/communications/access";
import { isCommunicationsUiEnabled } from "@/communications/mode";
import { resolvePersonnelPoliciesAccess } from "@/personnel-policies/access";
import { isPersonnelPoliciesUiEnabled } from "@/personnel-policies/mode";
import { CanonicalAccessDenied } from "@/components/auth/CanonicalAccessDenied";
import { resolveClientTemporaryAccessUi } from "@/client-portal/access";
import { resolveClientTemporaryPortalMode } from "@/client-portal/mode";

const AdministrationWorkspace = lazy(() => import("@/administration/AdministrationWorkspace"));
const AdvancedErpShell = lazy(() => import("@/commercial-crm/AdvancedErpShell"));
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
  calculator: Calculator,
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

function ctaLabel(application: HubApplication) {
  if (application.appId === "commercial-crm") return "Abrir ERP →";
  if (application.appId === "administration") return "Abrir Administración →";
  if (application.appId === "materials-equipment") return "Abrir Inventario →";
  if (application.appId === "tools-equipment") return "Abrir Activos →";
  return "Abrir aplicación →";
}

function environmentLabel(mode: OsiHubMode) {
  if (mode === "PREVIEW_REHEARSAL") return "Preview";
  if (mode === "PRODUCTION_READ") return "Producción · sólo lectura";
  return ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)
    ? "Desarrollo local"
    : ENV_LABELS[getAppEnv()];
}

function HubHome({ applications, mobileApplications, pendingApplications, userName, onNavigate }: {
  applications: readonly HubApplication[];
  mobileApplications: readonly HubApplication[];
  pendingApplications: readonly HubApplication[];
  userName?: string;
  onNavigate: (pathname: string) => void;
}) {
  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-11">
      <p className="text-xs font-bold uppercase tracking-[.2em] text-indigo-600">OSi Plus Hub</p>
      <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Hola, {userName || "Usuario"}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Abre tus aplicaciones disponibles y continúa el trabajo desde un mismo lugar.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {applications.map((application) => {
          const Icon = ICONS[application.icon];
          return (
            <button type="button" key={application.appId} onClick={() => onNavigate(application.route)} className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-lg">
              <div className="flex items-start justify-between gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-600 text-white"><Icon className="h-5 w-5" /></span><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">Disponible</span></div>
              <h2 className="mt-5 font-bold text-slate-950">{application.name}</h2>
              <p className="mt-2 min-h-10 text-xs leading-5 text-slate-600">{application.description}</p>
              <p className="mt-5 text-xs font-semibold text-indigo-600">{ctaLabel(application)}</p>
            </button>
          );
        })}
        {mobileApplications.length > 0 && (
          <button type="button" onClick={() => onNavigate("/mobile")} className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-lg">
            <div className="flex items-start justify-between gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-600 text-white"><Smartphone className="h-5 w-5" /></span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">Aplicaciones</span></div>
            <h2 className="mt-5 font-bold text-slate-950">OSi Plus Mobile</h2>
            <p className="mt-2 min-h-10 text-xs leading-5 text-slate-600">Visitas, levantamientos y herramientas de empaque.</p>
            <p className="mt-5 text-xs font-semibold text-indigo-600">Abrir aplicaciones →</p>
          </button>
        )}
      </div>
      {applications.length === 0 && mobileApplications.length === 0 && <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">No hay aplicaciones habilitadas para este contexto.</div>}
      {pendingApplications.length > 0 && <details className="mt-7 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-500" data-testid="hub-pending-applications">
        <summary className="cursor-pointer font-semibold">Módulos pendientes de habilitación ({pendingApplications.length})</summary>
        <p className="mt-3">Estos módulos todavía no están disponibles en este entorno.</p>
        <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-2">{pendingApplications.map((application) => <li key={application.appId}>{application.name}</li>)}</ul>
      </details>}
    </div>
  );
}

function RegisteredApplication({ application, onNavigate }: { application: HubApplication; onNavigate: (pathname: string) => void }) {
  const Icon = ICONS[application.icon];
  return <section className="mx-auto max-w-3xl px-5 py-12"><div className="rounded-3xl border bg-white p-8 shadow-sm"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-indigo-100 text-indigo-700"><Icon className="h-7 w-7" /></span><p className="mt-6 text-xs font-bold uppercase tracking-[.2em] text-indigo-600">Pendiente de habilitación</p><h1 className="mt-2 text-3xl font-black">{application.name}</h1><p className="mt-3 text-sm leading-6 text-slate-600">Esta aplicación todavía no está disponible en este entorno. Puedes continuar en las aplicaciones disponibles del Hub.</p><button type="button" onClick={() => onNavigate("/hub")} className="mt-6 flex min-h-11 items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"><ArrowLeft className="h-4 w-4" />Volver al Hub</button></div></section>;
}

export default function HubWorkspace({ userName, authorization, accessContext, crmReadEnabled, mode, pathname, onNavigate, onLogout }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const visible = useMemo(() => visibleHubApplications(HUB_APPLICATIONS, accessContext), [accessContext]);
  const selected = findHubApplicationByRoute(pathname);
  const commercialCaseRef = commercialCaseRefFromRoute(pathname);
  const adminEnabled = isAdminTenantMembershipEnabled();
  const effectivePermissions = new Set(accessContext.effectivePermissions || []);
  const deniedPermissions = new Set(accessContext.deniedPermissions);
  const adminMembershipAvailable = adminEnabled && accessContext.role === "A" && effectivePermissions.has("membership:view") && !deniedPermissions.has("membership:view");
  const adminInvitationsEnabled = isAdminIdentityInvitationEnabled();
  const adminInvitationMode = resolveAdminIdentityInvitationMode();
  const surveyEnabled = isSurveyUiEnabled();
  const materialsEnabled = isMaterialsUiEnabled();
  const toolsEnabled = isToolsEquipmentUiEnabled();
  const surveyAuthorized = visible.some((application) => application.appId === "osi-survey");
  const materialsAuthorized = visible.some((application) => application.appId === "materials-equipment");
  const toolsAuthorized = visible.some((application) => application.appId === "tools-equipment");
  const materialsAvailable = materialsEnabled && materialsAuthorized;
  const toolsAvailable = toolsEnabled && Boolean(toolsAuthorized);
  const logisticsAccess = resolveLogisticsUiAccess(accessContext.effectivePermissions, accessContext.deniedPermissions);
  const logisticsAdminAvailable = isLogisticsUiEnabled() && logisticsAccess.canRulesView;
  const communicationsAccess = resolveCommunicationsAccess(accessContext.effectivePermissions, accessContext.deniedPermissions);
  const communicationsEnabled = isCommunicationsUiEnabled();
  const communicationsAdminAvailable = communicationsEnabled && communicationsAccess.canTemplatesView;
  const personnelPoliciesAccess = resolvePersonnelPoliciesAccess(accessContext.effectivePermissions, accessContext.deniedPermissions);
  const personnelPoliciesEnabled = isPersonnelPoliciesUiEnabled();
  const personnelPoliciesAvailable = personnelPoliciesEnabled && personnelPoliciesAccess.canView;
  const servicesAccess = resolveCrmServicesUiAccess(accessContext.effectivePermissions, accessContext.deniedPermissions);
  const servicesAdminAvailable = isCrmServicesUiEnabled() && (servicesAccess.canCatalogView || servicesAccess.canPackagesView || servicesAccess.canMaterialsView);
  const costingAccess = resolveCostingUiAccess(accessContext.effectivePermissions, accessContext.deniedPermissions);
  const costingAdminAvailable = isCostingUiEnabled() && costingAccess.canRulesView;
  const administrationSections = availableAdministrationSections({
    access: adminMembershipAvailable,
    fleet: isAdminFleetEnabled() && resolveFleetAccess(accessContext.role, accessContext.effectivePermissions, accessContext.deniedPermissions).canView,
    services: servicesAdminAvailable,
    logistics: logisticsAdminAvailable,
    costing: costingAdminAvailable,
    communications: communicationsAdminAvailable,
    policies: personnelPoliciesAvailable,
  }, accessContext.effectivePermissions, accessContext.deniedPermissions);
  const administrationAvailable = administrationSections.length > 0;
  const commercialRelationshipsEnabled = isCommercialRelationshipsUiEnabled();
  const commercialRelationshipsAccess = resolveCommercialRelationshipsAccess(accessContext.effectivePermissions, accessContext.deniedPermissions);
  const available = availableHubApplications(visible, {
    "commercial-crm": crmReadEnabled,
    administration: administrationAvailable,
    "osi-survey": surveyEnabled,
    "materials-equipment": materialsEnabled,
    "tools-equipment": toolsEnabled,
    "packing-calculator": true,
  });
  const rootAvailable = available.filter((application) => !application.suiteId);
  const mobileApplications = applicationsForHubSuite("osi-plus-mobile", available);
  const pendingApplications = visible.filter((application) => !available.includes(application));
  const navigate = (nextPath: string) => {
    setMobileOpen(false);
    onNavigate(nextPath);
  };
  if (selected && !visible.includes(selected)) {
    return <CanonicalAccessDenied onReturnToSafeRoute={() => onNavigate("/hub")} />;
  }
  if (pathname === "/commercial/relationships" && (!commercialRelationshipsEnabled || !commercialRelationshipsAccess.canView)) {
    return <CanonicalAccessDenied onReturnToSafeRoute={() => onNavigate("/hub")} />;
  }
  if (selected?.appId === "commercial-crm" && crmReadEnabled) {
    return <Suspense fallback={<div className="grid min-h-screen place-items-center bg-[#003366] text-sm font-semibold text-white">Cargando ERP Comercial…</div>}>
      <AdvancedErpShell
        authorization={authorization}
        caseRef={commercialCaseRef}
        role={accessContext.role}
        mutationAccess={resolveCrmCaseMutationUiAccess(accessContext)}
        servicesAccess={resolveCrmServicesUiAccess(accessContext.effectivePermissions, accessContext.deniedPermissions)}
        logisticsAccess={logisticsAccess}
        logisticsEnabled={isLogisticsUiEnabled()}
        costingAccess={resolveCostingUiAccess(accessContext.effectivePermissions, accessContext.deniedPermissions)}
        costingEnabled={isCostingUiEnabled()}
        quoteAccess={resolveQuoteUiAccess(accessContext.effectivePermissions, accessContext.deniedPermissions)}
        quoteEnabled={isQuoteUiEnabled()}
        surveyEnabled={surveyEnabled && surveyAuthorized}
        surveySchedulingAccess={resolveSurveySchedulingUiAccess(accessContext.effectivePermissions, accessContext.deniedPermissions)}
        materialsEnabled={materialsAvailable}
        toolsEnabled={toolsAvailable}
        commercialRelationshipsEnabled={commercialRelationshipsEnabled}
        commercialRelationshipsAdmin={pathname === "/commercial/relationships"}
        commercialRelationshipsAccess={commercialRelationshipsAccess}
        communicationsEnabled={communicationsEnabled}
        communicationsAccess={communicationsAccess}
        clientTemporaryAccessEnabled={resolveClientTemporaryPortalMode().enabled}
        clientTemporaryAccess={resolveClientTemporaryAccessUi(accessContext.effectivePermissions, accessContext.deniedPermissions)}
        navigationApplications={rootAvailable}
        mobileAvailable={mobileApplications.length > 0}
        userName={userName}
        onNavigate={onNavigate}
        onLogout={onLogout}
        onUnauthorized={onLogout}
      />
    </Suspense>;
  }
  if (selected?.appId === "administration" && administrationAvailable) {
    return <Suspense fallback={<div className="grid min-h-screen place-items-center bg-slate-50 text-sm font-semibold text-slate-600">Cargando Administración…</div>}>
      <AdministrationWorkspace
        authorization={authorization}
        role={accessContext.role}
        pathname={pathname}
        sections={administrationSections}
        effectivePermissions={accessContext.effectivePermissions || []}
        deniedPermissions={accessContext.deniedPermissions}
        servicesAccess={servicesAccess}
        logisticsAccess={logisticsAccess}
        costingAccess={costingAccess}
        communicationsAccess={communicationsAccess}
        personnelPoliciesAccess={personnelPoliciesAccess}
        invitationEnabled={adminInvitationsEnabled}
        invitationMode={adminInvitationMode}
        onNavigate={onNavigate}
        onUnauthorized={onLogout}
      />
    </Suspense>;
  }
  if (selected?.appId === "osi-survey" && surveyEnabled && surveyAuthorized) {
    return <Suspense fallback={<div className="grid min-h-screen place-items-center bg-slate-50 text-sm font-semibold text-slate-600">Cargando Survey…</div>}>
      <SurveyApp authorization={authorization} onUnauthorized={onLogout} onBack={() => onNavigate("/mobile")} backLabel="Volver a OSi Plus Mobile" />
    </Suspense>;
  }
  if (selected?.appId === "materials-equipment" && materialsEnabled) {
    if (materialsAuthorized) return <Suspense fallback={<div className="grid min-h-screen place-items-center bg-[#003366] text-sm font-semibold text-white">Cargando Materiales e Inventario…</div>}>
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
      <button type="button" onClick={() => navigate("/hub")} className="flex items-center gap-3 border-b border-white/10 p-5 text-left"><span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-500"><LayoutGrid className="h-5 w-5" /></span><span><strong className="block">OSi Plus</strong><small className="text-slate-400">Hub de aplicaciones</small></span></button>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Aplicaciones OSi Plus">
        <button type="button" onClick={() => navigate("/hub")} className={`w-full rounded-xl px-3 py-2.5 text-left text-sm ${pathname === "/hub" ? "bg-white/15" : "text-slate-300 hover:bg-white/10"}`}>Inicio</button>
        {rootAvailable.map((application) => {
          const Icon = ICONS[application.icon];
          const active = selected?.appId === application.appId;
          return <button type="button" key={application.appId} onClick={() => navigate(application.route)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm ${active ? "bg-indigo-500 text-white" : "text-slate-300 hover:bg-white/10"}`}><Icon className="h-4 w-4" />{application.name}</button>;
        })}
        {mobileApplications.length > 0 && <button type="button" onClick={() => navigate("/mobile")} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm ${pathname === "/mobile" || selected?.suiteId === "osi-plus-mobile" ? "bg-indigo-500 text-white" : "text-slate-300 hover:bg-white/10"}`}><Smartphone className="h-4 w-4" />OSi Plus Mobile</button>}
      </nav>
      <div className="border-t border-white/10 p-4"><p className="mb-3 text-xs text-slate-400">{userName || "Usuario"}<br />{environmentLabel(mode)}</p><button onClick={onLogout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-300 hover:bg-red-500/10"><LogOut className="h-4 w-4" />Cerrar sesión</button></div>
    </aside>
  );
  const content = pathname === "/hub"
    ? <HubHome applications={rootAvailable} mobileApplications={mobileApplications} pendingApplications={pendingApplications} userName={userName} onNavigate={navigate} />
    : pathname === "/mobile"
      ? <OsiPlusMobileHub applications={mobileApplications} onNavigate={navigate} />
      : selected?.externalHref && available.includes(selected)
        ? <ExternalApplication application={selected} onNavigate={navigate} />
        : selected
          ? <RegisteredApplication application={selected} onNavigate={navigate} />
          : <section className="p-12 text-center"><p className="font-bold">404 · Ruta del Hub no registrada</p><button type="button" className="mt-4 font-semibold text-indigo-600" onClick={() => navigate("/hub")}>Volver al Hub</button></section>;
  return <div className="flex min-h-screen bg-slate-50"><div className="hidden lg:block">{sidebar}</div>{mobileOpen && <div className="fixed inset-0 z-50 flex lg:hidden"><div className="h-full">{sidebar}</div><button aria-label="Cerrar navegación" className="flex-1 bg-black/50" onClick={() => setMobileOpen(false)} /></div>}<div className="min-w-0 flex-1"><header className="flex h-16 items-center justify-between border-b bg-white px-4 sm:px-6"><button aria-label="Abrir navegación" className="rounded-lg border p-2 lg:hidden" onClick={() => setMobileOpen(true)}><Menu className="h-5 w-5" /></button><button type="button" onClick={() => navigate("/hub")} className="text-sm font-bold text-slate-900">OSi Plus Hub</button><span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800">{mode === "PRODUCTION_READ" ? "CRM · sólo lectura" : environmentLabel(mode)}</span></header><main>{content}</main></div></div>;
}
