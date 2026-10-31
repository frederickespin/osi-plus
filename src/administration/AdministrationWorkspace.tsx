import { lazy, Suspense, type MouseEvent } from "react";
import { ArrowLeft, Banknote, Boxes, ClipboardList, Mail, Route, Truck, Users } from "lucide-react";
import { CanonicalAccessDenied } from "@/components/auth/CanonicalAccessDenied";
import type { AdminTenantMembershipMode } from "@/admin-tenant/adminMode";
import type { CrmServicesUiAccess } from "@/crm-services/access";
import type { LogisticsUiAccess } from "@/logistics-engine/access";
import type { CostingUiAccess } from "@/costing/access";
import type { CommunicationsAccess } from "@/communications/access";
import type { PersonnelPoliciesAccess } from "@/personnel-policies/access";
import { administrationSectionFromRoute, type AdministrationSection, type AdministrationSectionId } from "./administrationSections";

const AdminTenantMembershipModule = lazy(() => import("@/admin-tenant/AdminTenantMembershipModule"));
const FleetModule = lazy(() => import("@/admin-fleet/FleetModule"));
const ServiceConfigurationAdmin = lazy(() => import("@/crm-services/ServiceConfigurationAdmin"));
const LogisticsRulesAdmin = lazy(() => import("@/logistics-engine/LogisticsRulesAdmin"));
const CostingRulesAdmin = lazy(() => import("@/costing/CostingRulesAdmin"));
const CommunicationTemplatesAdmin = lazy(() => import("@/communications/CommunicationTemplatesAdmin"));
const PersonnelPoliciesAdmin = lazy(() => import("@/personnel-policies/PersonnelPoliciesAdmin"));

const ICONS = { access: Users, fleet: Truck, services: Boxes, logistics: Route, costing: Banknote, communications: Mail, policies: ClipboardList };

type Props = Readonly<{
  authorization?: string;
  role: string;
  pathname: string;
  sections: readonly AdministrationSection[];
  effectivePermissions: readonly string[];
  deniedPermissions: readonly string[];
  servicesAccess: CrmServicesUiAccess;
  logisticsAccess: LogisticsUiAccess;
  costingAccess: CostingUiAccess;
  communicationsAccess: CommunicationsAccess;
  personnelPoliciesAccess: PersonnelPoliciesAccess;
  invitationEnabled: boolean;
  invitationMode: AdminTenantMembershipMode;
  onNavigate(pathname: string): void;
  onUnauthorized(): void;
}>;

export default function AdministrationWorkspace(props: Props) {
  const { pathname, sections, onNavigate, authorization, onUnauthorized } = props;
  const requested = administrationSectionFromRoute(pathname);
  const selected = pathname === "/administration" ? sections[0] : sections.find((section) => section.id === requested?.id);
  if (!selected) return <CanonicalAccessDenied onReturnToSafeRoute={() => onNavigate("/hub")} />;

  const navigate = (event: MouseEvent<HTMLAnchorElement>, route: string) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate(route);
  };
  const renderSection = (id: AdministrationSectionId) => {
    switch (id) {
      case "access": return <AdminTenantMembershipModule authorization={authorization} effectivePermissions={props.effectivePermissions} deniedPermissions={props.deniedPermissions} invitationEnabled={props.invitationEnabled} invitationMode={props.invitationMode} includeConfiguration={false} onUnauthorized={onUnauthorized} />;
      case "fleet": return <FleetModule authorization={authorization} role={props.role} effectivePermissions={props.effectivePermissions} deniedPermissions={props.deniedPermissions} onUnauthorized={onUnauthorized} onReturnToHub={() => onNavigate("/hub")} />;
      case "services": return <ServiceConfigurationAdmin authorization={authorization} access={props.servicesAccess} onUnauthorized={onUnauthorized} />;
      case "logistics": return <LogisticsRulesAdmin authorization={authorization} access={props.logisticsAccess} costingAccess={props.costingAccess} onUnauthorized={onUnauthorized} />;
      case "costing": return <CostingRulesAdmin authorization={authorization} access={props.costingAccess} onUnauthorized={onUnauthorized} />;
      case "communications": return <CommunicationTemplatesAdmin authorization={authorization} access={props.communicationsAccess} onUnauthorized={onUnauthorized} />;
      case "policies": return <PersonnelPoliciesAdmin authorization={authorization} access={props.personnelPoliciesAccess} onUnauthorized={onUnauthorized} />;
    }
  };

  return <div className="min-h-screen bg-slate-50" data-testid="administration-workspace">
    <header className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-5 gap-y-2">
        <a href="/hub" onClick={(event) => navigate(event, "/hub")} className="inline-flex min-h-11 items-center gap-2 rounded px-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Volver al Hub</a>
        <div className="border-l border-slate-200 pl-5"><p className="text-xs text-slate-500">OSi Plus</p><h1 className="text-xl font-bold text-[#003366]">Administración</h1></div>
      </div>
    </header>
    <div className="mx-auto max-w-[1600px] lg:grid lg:grid-cols-[245px_minmax(0,1fr)]">
      <aside className="border-b border-slate-200 bg-white p-3 lg:min-h-[calc(100vh-82px)] lg:border-b-0 lg:border-r lg:p-4">
        <label className="block text-xs font-semibold text-slate-500 lg:hidden">Sección
          <select aria-label="Sección de Administración" value={selected.route} onChange={(event) => onNavigate(event.target.value)} className="mt-1 h-11 w-full rounded border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900">{sections.map((section) => <option key={section.id} value={section.route}>{section.label}</option>)}</select>
        </label>
        <nav aria-label="Secciones de Administración" className="hidden space-y-1 lg:block">
          {sections.map((section) => {
            const Icon = ICONS[section.id];
            return <a key={section.id} href={section.route} aria-current={selected.id === section.id ? "page" : undefined} onClick={(event) => navigate(event, section.route)} className={`flex min-h-11 items-center gap-2 rounded px-3 py-2 text-sm font-medium ${selected.id === section.id ? "bg-indigo-50 text-indigo-800" : "text-slate-600 hover:bg-slate-50"}`}><Icon className="h-4 w-4 shrink-0" aria-hidden="true" />{section.label}</a>;
          })}
        </nav>
      </aside>
      <section aria-label={selected.label} className="min-w-0 px-4 pb-6 sm:px-6 [&>section]:mt-5">
        <Suspense fallback={<p role="status" className="py-10 text-center text-sm text-slate-500">Cargando {selected.label}…</p>}>
          {renderSection(selected.id)}
        </Suspense>
      </section>
    </div>
  </div>;
}
