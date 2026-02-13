import { useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { TowerControl } from '@/components/modules/TowerControl';
import { OperationsModule } from '@/components/modules/OperationsModule';
import { SecurityModule } from '@/components/modules/SecurityModule';
import { DriverModule } from '@/components/modules/DriverModule';
import { SupervisorModule } from '@/components/modules/SupervisorModule';
import { MechanicModule } from '@/components/modules/MechanicModule';
import { DispatchModule } from '@/components/modules/DispatchModule';
import { FieldWorkerModule } from '@/components/modules/FieldWorkerModule';
import { WMSModule } from '@/components/modules/WMSModule';
import { InventoryModule } from '@/components/modules/InventoryModule';
import { ClientsModule } from '@/components/modules/ClientsModule';
import { TrackingModule } from '@/components/modules/TrackingModule';
import { HRModule } from '@/components/modules/HRModule';
import { CarpentryModule } from '@/components/modules/CarpentryModule';
import { UsersModule } from '@/components/modules/UsersModule';
import { BillingModule } from '@/components/modules/BillingModule';
import { FleetAdminModule } from '@/components/modules/FleetAdminModule';
import { ProjectsModule } from '@/components/modules/ProjectsModule';
import { CalendarModule } from '@/components/modules/CalendarModule';
import { WallModule } from '@/components/modules/WallModule';
import { PurchasesModule } from '@/components/modules/PurchasesModule';
import { KPIModule } from '@/components/modules/KPIModule';
import { NOTAModule } from '@/components/modules/NOTAModule';
import { BadgesModule } from '@/components/modules/BadgesModule';
import { SettingsModule } from '@/components/modules/SettingsModule';
import { Toaster } from '@/components/ui/sonner';
import type { UserRole } from '@/types/osi.types';

export type ModuleId = 
  | 'dashboard'
  | 'operations'
  | 'security'
  | 'driver'
  | 'supervisor'
  | 'mechanic'
  | 'dispatch'
  | 'field'
  | 'wms'
  | 'inventory'
  | 'clients'
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
  | 'settings';

function App() {
  const [activeModule, setActiveModule] = useState<ModuleId>('dashboard');
  // Simular usuario logueado - en producción vendría de auth context
  const [userRole] = useState<UserRole>('A');

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
      case 'dispatch':
        return <DispatchModule />;
      case 'field':
        return <FieldWorkerModule />;
      case 'wms':
        return <WMSModule />;
      case 'inventory':
        return <InventoryModule />;
      case 'clients':
        return <ClientsModule />;
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
        return <NOTAModule />;
      case 'badges':
        return <BadgesModule />;
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
      />
      <main className="flex-1 overflow-auto">
        {renderModule()}
      </main>
      <Toaster />
    </div>
  );
}

export default App;
