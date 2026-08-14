import { Component, Suspense, lazy, useEffect, useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { LoginScreen, type LoginSession } from '@/components/auth/LoginScreen';
import { Toaster } from '@/components/ui/sonner';
import type { UserRole } from '@/types/osi.types';
import { getMe } from '@/lib/api';
import {
  clearSession,
  inspectStoredSession,
  normalizeRole,
  saveSession,
  type Session,
} from '@/lib/sessionStore';
import { isRelationalCrmClientEnabled, resolveCrmPipelineClientMode } from '@/crm-relational/clientMode';
import { canAccessModule, type ModuleId } from '@/lib/roleModuleMap';
import { resolveModuleFromPath, updateModuleRoute } from '@/lib/moduleRouting';
export type { ModuleId } from '@/lib/roleModuleMap';

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
const TemplatesCenterModule = lazy(() =>
  import('@/components/modules/TemplatesCenterModule').then((m) => ({ default: m.TemplatesCenterModule }))
);
const TemplateEditorModule = lazy(() =>
  import('@/components/modules/TemplateEditorModule').then((m) => ({ default: m.TemplateEditorModule }))
);
const TemplateApprovalsModule = lazy(() =>
  import('@/components/modules/TemplateApprovalsModule').then((m) => ({ default: m.TemplateApprovalsModule }))
);
const KDashboardModule = lazy(() =>
  import('@/components/modules/KDashboardModule').then((m) => ({ default: m.KDashboardModule }))
);
const KProjectModule = lazy(() =>
  import('@/components/modules/KProjectModule').then((m) => ({ default: m.KProjectModule }))
);
const RelationalPipelineModule = lazy(() =>
  import('@/crm-relational/RelationalPipelineModule').then((m) => ({ default: m.RelationalPipelineModule }))
);
const EvaluatorCanonicalModule = lazy(() =>
  import('@/evaluator-canonical/EvaluatorCanonicalModule').then((m) => ({ default: m.EvaluatorCanonicalModule }))
);
const CrmPipelineUnavailable = lazy(() =>
  import('@/components/modules/CrmPipelineUnavailable').then((m) => ({ default: m.CrmPipelineUnavailable }))
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

type AuthState =
  | { status: 'AUTH_LOADING'; session: null }
  | { status: 'AUTHENTICATED'; session: Session }
  | {
      status: 'ANONYMOUS';
      session: null;
      reason: 'NO_SESSION' | 'INVALID_LOCAL_SESSION' | 'UNAUTHORIZED' | 'VALIDATION_FAILED' | 'LOGGED_OUT';
    };

type PendingLegacyValidation = {
  token: string;
  promise: Promise<Session>;
};

let pendingLegacyValidation: PendingLegacyValidation | null = null;

function validateLegacySession(session: Session): Promise<Session> {
  const token = session.token;
  if (!token) return Promise.reject(Object.assign(new Error('Token legacy requerido.'), { status: 401 }));
  if (pendingLegacyValidation?.token === token) return pendingLegacyValidation.promise;

  const promise = getMe(token).then((response) => {
    const role = normalizeRole(response.user.role);
    if (!role) {
      throw Object.assign(new Error('El servidor devolvió un rol inválido.'), { status: 401 });
    }
    return {
      token,
      userId: response.user.id,
      name: response.user.name,
      role,
    };
  });
  const entry = { token, promise };
  pendingLegacyValidation = entry;
  void promise.then(
    () => { if (pendingLegacyValidation === entry) pendingLegacyValidation = null; },
    () => { if (pendingLegacyValidation === entry) pendingLegacyValidation = null; },
  );
  return promise;
}

function AuthLoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100" role="status" aria-live="polite">
      <p className="text-sm font-medium text-slate-600">Verificando sesión...</p>
    </div>
  );
}

async function resolveInitialAuthState(): Promise<AuthState> {
  const stored = inspectStoredSession();
  if (stored.kind === 'EMPTY') {
    return { status: 'ANONYMOUS', session: null, reason: 'NO_SESSION' };
  }
  if (stored.kind === 'INVALID') {
    clearSession();
    return { status: 'ANONYMOUS', session: null, reason: 'INVALID_LOCAL_SESSION' };
  }

  try {
    const session = await validateLegacySession(stored.session);
    saveSession(session);
    return { status: 'AUTHENTICATED', session };
  } catch (error: unknown) {
    const status = typeof error === 'object' && error !== null && 'status' in error
      ? Number((error as { status?: unknown }).status)
      : null;
    if (status === 401) clearSession();
    return {
      status: 'ANONYMOUS',
      session: null,
      reason: status === 401 ? 'UNAUTHORIZED' : 'VALIDATION_FAILED',
    };
  }
}

function AuthenticatedApp({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const crmPipelineClientEnabled = isRelationalCrmClientEnabled(resolveCrmPipelineClientMode());
  const userRole: UserRole = session.role;
  const [activeModule, setActiveModule] = useState<ModuleId>(() => {
    const routed = typeof window === 'undefined' ? null : resolveModuleFromPath(window.location.pathname);
    return routed && canAccessModule(userRole, routed) ? routed : getDefaultModuleForRole(userRole);
  });

  const selectModule = (moduleId: ModuleId) => {
    if (!canAccessModule(userRole, moduleId)) return;
    setActiveModule(moduleId);
    if (typeof window !== 'undefined') updateModuleRoute(moduleId, window.history, window.location);
  };

  // Escuchar evento de cambio de módulo desde otros componentes
  useEffect(() => {
    const handleChangeModule = (e: CustomEvent<ModuleId>) => {
      if (!canAccessModule(userRole, e.detail)) return;
      setActiveModule(e.detail);
      updateModuleRoute(e.detail, window.history, window.location);
    };
    window.addEventListener('changeModule', handleChangeModule as EventListener);
    return () => {
      window.removeEventListener('changeModule', handleChangeModule as EventListener);
    };
  }, [userRole]);

  useEffect(() => {
    const syncFromLocation = () => {
      const routed = resolveModuleFromPath(window.location.pathname);
      if (routed && canAccessModule(userRole, routed)) {
        setActiveModule(routed);
        return;
      }
      if (window.location.pathname !== '/') window.history.replaceState({}, '', '/');
    };
    syncFromLocation();
    window.addEventListener('popstate', syncFromLocation);
    return () => window.removeEventListener('popstate', syncFromLocation);
  }, [userRole]);

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
      case 'crm-pipeline':
        return crmPipelineClientEnabled
          ? <RelationalPipelineModule userRole={userRole} onUnauthorized={onLogout} />
          : <CrmPipelineUnavailable />;
      case 'evaluator-app':
        return <EvaluatorCanonicalModule />;
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
      case 'k-templates':
        return <TemplatesCenterModule userRole={userRole} />;
      case 'k-template-editor':
        return <TemplateEditorModule userRole={userRole} />;
      case 'a-template-approvals':
        return <TemplateApprovalsModule userRole={userRole} />;
      case 'k-dashboard':
        return <KDashboardModule />;
      case 'k-project':
        return <KProjectModule userRole={userRole} />;
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
        onModuleChange={selectModule}
        userRole={userRole}
        userName={session.name}
        onLogout={onLogout}
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

function App() {
  const [authState, setAuthState] = useState<AuthState>({ status: 'AUTH_LOADING', session: null });

  useEffect(() => {
    let active = true;
    void resolveInitialAuthState().then((nextState) => {
      if (active) setAuthState(nextState);
    });

    return () => { active = false; };
  }, []);

  const handleLoginSuccess = (session: LoginSession) => {
    saveSession(session);
    setAuthState({ status: 'AUTHENTICATED', session });
  };

  const handleLogout = () => {
    clearSession();
    setAuthState({ status: 'ANONYMOUS', session: null, reason: 'LOGGED_OUT' });
  };

  if (authState.status === 'AUTH_LOADING') return <AuthLoadingScreen />;
  if (authState.status === 'ANONYMOUS') {
    return (
      <>
        <LoginScreen onLoginSuccess={handleLoginSuccess} />
        <Toaster />
      </>
    );
  }

  return <AuthenticatedApp session={authState.session} onLogout={handleLogout} />;
}

export default App;

function getDefaultModuleForRole(role: UserRole): ModuleId {
  // Un default coherente evita que parezca que "eres admin" pero caes en RRHH sin querer.
  if (role === 'A') return 'dashboard';
  if (role === 'I') return 'hr';
  if (role === 'K') return 'k-dashboard';
  if (role === 'V') return 'osi-editor';
  if (role === 'B') return 'operations';
  if (role === 'C') return 'wms';
  if (role === 'C1') return 'dispatch';
  if (role === 'D') return 'supervisor';
  if (role === 'E') return 'driver';
  if (role === 'G') return 'security';
  if (role === 'N') return 'field';
  if (role === 'PA') return 'carpentry';
  if (role === 'PB' || role === 'PD') return 'maintenance';
  return 'clients';
}
