import { Component, Suspense, lazy, useEffect, useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Toaster } from '@/components/ui/sonner';
import type { UserRole } from '@/types/osi.types';
import { loadSession } from '@/lib/sessionStore';

const TowerControl = lazy(() =>
  import('@/components/modules/TowerControl').then((m) => ({ default: m.TowerControl }))
);
const OperationsModule = lazy(() =>
  import('@/components/modules/OperationsModule').then((m) => ({ default: m.OperationsModule }))
);
const SecurityModule = lazy(() =>
  import('@/components/modules/SecurityModule').then((m) => ({ default: m.SecurityModule }))
);
const DriverModule = lazy(() =>
  import('@/components/modules/DriverModule').then((m) => ({ default: m.DriverModule }))
);
const SupervisorModule = lazy(() =>
  import('@/components/modules/SupervisorModule').then((m) => ({ default: m.SupervisorModule }))
);
const MechanicModule = lazy(() =>
  import('@/components/modules/MechanicModule').then((m) => ({ default: m.MechanicModule }))
);
const MaintenanceModule = lazy(() =>
  import('@/components/modules/MaintenanceModule').then((m) => ({ default: m.MaintenanceModule }))
);

const OSIModule = lazy(() =>
  import('@/components/modules/OSIModule').then((m) => ({ default: m.OSIModule }))
);
const SupervisorNotaModule = lazy(() =>
  import('@/components/modules/SupervisorNotaModule').then((m) => ({ default: m.SupervisorNotaModule }))
);
const SalesApprovalsModule = lazy(() =>
  import('@/components/modules/SalesApprovalsModule').then((m) => ({ default: m.SalesApprovalsModule }))
);
const DispatchModule = lazy(() =>
  import('@/components/modules/DispatchModule').then((m) => ({ default: m.DispatchModule }))
);
const FieldWorkerModule = lazy(() =>
  import('@/components/modules/FieldWorkerModule').then((m) => ({ default: m.FieldWorkerModule }))
);
const WMSModule = lazy(() =>
  import('@/components/modules/WMSModule').then((m) => ({ default: m.WMSModule }))
);
const InventoryModule = lazy(() =>
  import('@/components/modules/InventoryModule').then((m) => ({ default: m.InventoryModule }))
);
const ClientsModule = lazy(() =>
  import('@/components/modules/ClientsModule').then((m) => ({ default: m.ClientsModule }))
);
const SalesQuoteModule = lazy(() =>
  import('@/components/modules/SalesQuoteModule').then((m) => ({ default: m.SalesQuoteModule }))
);
const CommercialCalendarModule = lazy(() =>
  import('@/modules/commercial/CommercialCalendarModule').then((m) => ({ default: m.default }))
);
const TrackingModule = lazy(() =>
  import('@/components/modules/TrackingModule').then((m) => ({ default: m.TrackingModule }))
);
const HRModule = lazy(() =>
  import('@/components/modules/HRModule').then((m) => ({ default: m.HRModule }))
);
const CarpentryModule = lazy(() =>
  import('@/components/modules/CarpentryModule').then((m) => ({ default: m.CarpentryModule }))
);
const UsersModule = lazy(() =>
  import('@/components/modules/UsersModule').then((m) => ({ default: m.UsersModule }))
);
const BillingModule = lazy(() =>
  import('@/components/modules/BillingModule').then((m) => ({ default: m.BillingModule }))
);
const FleetAdminModule = lazy(() =>
  import('@/components/modules/FleetAdminModule').then((m) => ({ default: m.FleetAdminModule }))
);
const ProjectsModule = lazy(() =>
  import('@/components/modules/ProjectsModule').then((m) => ({ default: m.ProjectsModule }))
);
const CalendarModule = lazy(() =>
  import('@/components/modules/CalendarModule').then((m) => ({ default: m.CalendarModule }))
);
const WallModule = lazy(() =>
  import('@/components/modules/WallModule').then((m) => ({ default: m.WallModule }))
);
const PurchasesModule = lazy(() =>
  import('@/components/modules/PurchasesModule').then((m) => ({ default: m.PurchasesModule }))
);
const KPIModule = lazy(() =>
  import('@/components/modules/KPIModule').then((m) => ({ default: m.KPIModule }))
);
const NOTAModule = lazy(() =>
  import('@/components/modules/NOTAModule').then((m) => ({ default: m.NOTAModule }))
);
const BadgesModule = lazy(() =>
  import('@/components/modules/BadgesModule').then((m) => ({ default: m.BadgesModule }))
);
const SettingsModule = lazy(() =>
  import('@/components/modules/SettingsModule').then((m) => ({ default: m.SettingsModule }))
);
const NestingModule = lazy(() =>
  import('@/components/modules/NestingModule').then((m) => ({ default: m.NestingModule }))
);
const NestingV2Module = lazy(() =>
  import('@/components/modules/NestingV2Module').then((m) => ({ default: m.NestingV2Module }))
);
const DisenaCotizaModule = lazy(() =>
  import('@/components/modules/DisenaCotizaModule').then((m) => ({ default: m.DisenaCotizaModule }))
);
const CrateWoodModule = lazy(() =>
  import('@/modules/CrateWoodModule').then((m) => ({ default: m.default }))
);
const CrateSettingsModule = lazy(() =>
  import('@/modules/CrateSettingsModule').then((m) => ({ default: m.default }))
);
const TemplatesModule = lazy(() =>
  import('@/components/modules/TemplatesModule').then((m) => ({ default: m.TemplatesModule }))
);

class AppErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; message?: string }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: undefined };
  }

  static getDerivedStateFromError(error: unknown) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Error inesperado en render",
    };
  }

  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.error("AppErrorBoundary:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6">
          <h2 className="text-lg font-semibold text-red-600">Error de render</h2>
          <p className="text-sm text-slate-700 mt-2">{this.state.message}</p>
          <p className="text-xs text-slate-500 mt-2">Revisa la consola del navegador para más detalle.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export type ModuleId =
  | 'dashboard'
  | 'operations'
  | 'security'
  | 'driver'
  | 'supervisor'
  | 'mechanic'
  | 'maintenance'
  | 'osi-editor'
  | 'supervisor-nota'
  | 'sales-approvals'
  | 'dispatch'
  | 'field'
  | 'wms'
  | 'inventory'
  | 'clients'
  | 'sales-quote'
  | 'commercial-calendar'
  | 'commercial-config'
  | 'tracking'
  | 'hr'
  | 'carpentry'
  | 'users'
  | 'billing'
  | 'fleet'
  | 'projects'
  | 'calendar'
  | 'wall'
  | 'purchases'
  | 'kpi'
  | 'nota'
  | 'badges'
  | 'nesting'
  | 'nestingv2'
  | 'disenacotiza'
  | 'crate-wood'
  | 'crate-settings'
  | 'templates'
  | 'settings';

function App() {
  const [session] = useState(() => {
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      return { role: 'A' as UserRole, name: 'Admin User' };
    }
    return loadSession();
  });
  const [activeModule, setActiveModule] = useState<ModuleId>(() => (session.role === 'A' ? 'dashboard' : 'clients'));
  const userRole = session.role;

  // Escuchar evento de cambio de módulo desde otros componentes
  useEffect(() => {
    const handleChangeModule = (e: CustomEvent<ModuleId>) => {
      setActiveModule(e.detail);
    };
    window.addEventListener('changeModule', handleChangeModule as EventListener);
    return () => {
      window.removeEventListener('changeModule', handleChangeModule as EventListener);
    };
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const payload = (e as CustomEvent).detail;
      localStorage.setItem("osi-plus.crateWood.openContext", JSON.stringify(payload));
      setActiveModule("crate-wood");
    };
    window.addEventListener("osi:cratewood:open", handler as EventListener);
    return () => window.removeEventListener("osi:cratewood:open", handler as EventListener);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const payload = (e as CustomEvent).detail;
      localStorage.setItem("osi-plus.salesQuote.openContext", JSON.stringify(payload));
      setActiveModule("sales-quote");
    };
    window.addEventListener("osi:salesquote:open", handler as EventListener);
    return () => window.removeEventListener("osi:salesquote:open", handler as EventListener);
  }, []);

  const renderModule = () => {
    switch (activeModule) {
      case 'dashboard':
        return <TowerControl />;
      case 'operations':
        return <OperationsModule />;
      case 'security':
        return <SecurityModule />;
      case 'driver':
        return <DriverModule />;
      case 'supervisor':
        return <SupervisorModule />;
      case 'mechanic':
        return <MechanicModule />;
      case 'maintenance':
        return <MaintenanceModule />;

      case 'osi-editor':
        return <OSIModule />;
      case 'supervisor-nota':
        return <SupervisorNotaModule />;
      case 'sales-approvals':
        return <SalesApprovalsModule />;
      case 'dispatch':
        return <DispatchModule />;
      case 'field':
        return <FieldWorkerModule />;
      case 'wms':
        return <WMSModule />;
      case 'inventory':
        return <InventoryModule />;
      case 'clients':
        return <ClientsModule userRole={userRole} />;
      case 'sales-quote':
        return <SalesQuoteModule userRole={userRole} />;
      case 'commercial-calendar':
        return <CommercialCalendarModule />;
      case 'commercial-config':
        return <CrateSettingsModule />;
      case 'tracking':
        return <TrackingModule />;
      case 'hr':
        return <HRModule />;
      case 'carpentry':
        return <CarpentryModule />;
      case 'users':
        return <UsersModule />;
      case 'billing':
        return <BillingModule />;
      case 'fleet':
        return <FleetAdminModule />;
      case 'projects':
        return <ProjectsModule />;
      case 'calendar':
        return <CalendarModule />;
      case 'wall':
        return <WallModule />;
      case 'purchases':
        return <PurchasesModule />;
      case 'kpi':
        return <KPIModule />;
      case 'nota':
        return <NOTAModule userRole={userRole} />;
      case 'badges':
        return <BadgesModule />;
      case 'nesting':
        return <NestingModule />;
      case 'nestingv2':
        return <NestingV2Module />;
      case 'disenacotiza':
        return <DisenaCotizaModule />;
      case 'crate-wood':
        return <CrateWoodModule />;
      case 'crate-settings':
        return <CrateSettingsModule />;
      case 'templates':
        return <TemplatesModule />;
      case 'settings':
        return <SettingsModule />;
      default:
        return <TowerControl />;
    }
  };

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar 
        activeModule={activeModule} 
        onModuleChange={setActiveModule} 
        userRole={userRole}
        userName={session.name}
      />
      <main className="flex-1 overflow-auto">
        <AppErrorBoundary>
          <Suspense fallback={<div className="p-6 text-slate-600">Cargando módulo...</div>}>
            {renderModule()}
          </Suspense>
        </AppErrorBoundary>
      </main>
      <Toaster />
    </div>
  );
}

export default App;
