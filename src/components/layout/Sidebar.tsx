import { 
  LayoutDashboard, 
  ClipboardList, 
  Shield, 
  Users, 
  Wrench, 
  Send,
  HardHat,
  Warehouse,
  Package,
  UserCircle,
  MapPin,
  Briefcase,
  Hammer,
  Settings,
  UserCog,
  CreditCard,
  Car,
  FolderOpen,
  Calendar,
  LayoutTemplate,
  ShoppingCart,
  BarChart3,
  FileText,
  Award,
  LogOut,
  Menu,
  X,
  Box
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import type { ModuleId } from '@/App';
import type { UserRole } from '@/types/osi.types';

interface SidebarProps {
  activeModule: ModuleId;
  onModuleChange: (module: ModuleId) => void;
  userRole?: UserRole;
}

interface MenuItem {
  id: ModuleId;
  label: string;
  icon: React.ElementType;
  roles: UserRole[];
}

// Menú simplificado - acceso directo por roles
const menuItems: MenuItem[] = [
  // ROL A - Administrador
  { id: 'dashboard', label: 'Centro de Comando', icon: LayoutDashboard, roles: ['A'] },
  { id: 'settings', label: 'Configuración', icon: Settings, roles: ['A'] },
  { id: 'users', label: 'Usuarios y Roles', icon: UserCog, roles: ['A'] },
  { id: 'billing', label: 'Tarifas NOTA', icon: CreditCard, roles: ['A'] },
  { id: 'fleet', label: 'Registro de Flota', icon: Car, roles: ['A'] },
  
  // ROL K - Coordinador
  { id: 'projects', label: 'Proyectos', icon: FolderOpen, roles: ['A', 'K'] },
  { id: 'clients', label: 'Clientes', icon: UserCircle, roles: ['A', 'K'] },
  { id: 'carpentry', label: 'Planning de Cajas', icon: Box, roles: ['A', 'K'] },
  
  // ROL B - Operaciones
  { id: 'operations', label: 'Operaciones', icon: ClipboardList, roles: ['A', 'B'] },
  { id: 'calendar', label: 'Calendario', icon: Calendar, roles: ['A', 'B'] },
  { id: 'wall', label: 'Muro Liquidación', icon: LayoutTemplate, roles: ['A', 'B'] },
  
  // ROL C - Materiales/WMS
  { id: 'wms', label: 'Inventario', icon: Warehouse, roles: ['A', 'C'] },
  { id: 'inventory', label: 'Stock General', icon: Package, roles: ['A', 'C'] },
  { id: 'carpentry', label: 'Órdenes Taller', icon: Hammer, roles: ['A', 'C'] },
  
  // ROL I - RRHH
  { id: 'hr', label: 'Analítica', icon: Briefcase, roles: ['A', 'I'] },
  { id: 'kpi', label: 'Ranking KPI', icon: BarChart3, roles: ['A', 'I'] },
  { id: 'nota', label: 'Nómina NOTA', icon: FileText, roles: ['A', 'I'] },
  { id: 'badges', label: 'Módulo Ecológico', icon: Award, roles: ['A', 'I'] },
  
  // Módulos Móviles - Acceso según rol
  { id: 'security', label: 'Portería', icon: Shield, roles: ['A', 'G'] },
  { id: 'mechanic', label: 'Mecánica', icon: Wrench, roles: ['A', 'PB'] },
  { id: 'supervisor', label: 'Supervisor', icon: Users, roles: ['A', 'D'] },
  { id: 'dispatch', label: 'Despacho', icon: Send, roles: ['A', 'C1'] },
  { id: 'field', label: 'Personal Campo', icon: HardHat, roles: ['A', 'N'] },
  
  // Adicionales
  { id: 'tracking', label: 'Rastreo', icon: MapPin, roles: ['A', 'K', 'B'] },
  { id: 'purchases', label: 'Compras', icon: ShoppingCart, roles: ['A', 'C'] },
];

// Obtener items filtrados por rol
const getMenuItemsByRole = (role: UserRole): MenuItem[] => {
  return menuItems.filter(item => item.roles.includes(role) || role === 'A');
};

export function Sidebar({ activeModule, onModuleChange, userRole = 'A' }: SidebarProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const visibleMenuItems = getMenuItemsByRole(userRole);

  const handleModuleClick = (moduleId: ModuleId) => {
    onModuleChange(moduleId);
    setIsMobileMenuOpen(false);
  };

  return (
    <>
      {/* Mobile Menu Button */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 left-4 z-50 lg:hidden bg-[#003366] text-white hover:bg-[#002244]"
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
      >
        {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`
          fixed lg:static inset-y-0 left-0 z-40
          bg-[#003366] flex flex-col
          transition-all duration-300 ease-in-out
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          ${isCollapsed ? 'w-20' : 'w-64'}
        `}
      >
        {/* Logo */}
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center flex-shrink-0">
              <Package className="h-6 w-6 text-[#003366]" />
            </div>
            {!isCollapsed && (
              <div>
                <h1 className="text-white font-bold text-lg leading-tight">OSi-plus</h1>
                <p className="text-white/60 text-xs">International Packers</p>
              </div>
            )}
          </div>
        </div>

        {/* User Profile */}
        <div className="p-4 border-b border-white/10">
          <div className={`flex items-center gap-3 ${isCollapsed ? 'justify-center' : ''}`}>
            <div className="w-10 h-10 bg-[#D4AF37] rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-[#003366] font-bold text-sm">AD</span>
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">Admin User</p>
                <p className="text-[#D4AF37] text-xs truncate">{userRole === 'A' ? 'Administrador' : userRole}</p>
              </div>
            )}
          </div>
        </div>

        {/* Menu Items */}
        <nav className="flex-1 overflow-y-auto py-2">
          <div className="px-2">
            {!isCollapsed && (
              <p className="text-white/40 text-xs font-semibold uppercase tracking-wider px-3 mb-2">
                Módulos
              </p>
            )}
            <div className="space-y-1">
              {visibleMenuItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeModule === item.id;
                
                return (
                  <button
                    key={item.id}
                    onClick={() => handleModuleClick(item.id)}
                    className={`
                      w-full flex items-center gap-3 px-3 py-3 rounded-lg
                      text-sm font-medium transition-all duration-200
                      ${isCollapsed ? 'justify-center' : ''}
                      ${isActive 
                        ? 'bg-[#D4AF37]/20 text-[#D4AF37] border-l-4 border-[#D4AF37]' 
                        : 'text-white hover:text-[#D4AF37] hover:bg-white/5 border-l-4 border-transparent'
                      }
                    `}
                    title={isCollapsed ? item.label : undefined}
                  >
                    <Icon className={`h-5 w-5 flex-shrink-0 ${isActive ? 'text-[#D4AF37]' : ''}`} />
                    {!isCollapsed && <span className="truncate">{item.label}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-white/10">
          <Button 
            variant="ghost" 
            className={`
              w-full justify-start gap-2 text-white/70 hover:text-white hover:bg-white/5
              ${isCollapsed ? 'justify-center px-2' : ''}
            `}
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            {isCollapsed ? <Menu className="h-4 w-4" /> : <><Menu className="h-4 w-4" /> Colapsar</>}
          </Button>
          <Button 
            variant="ghost" 
            className={`
              w-full justify-start gap-2 text-white/70 hover:text-white hover:bg-white/5 mt-2
              ${isCollapsed ? 'justify-center px-2' : ''}
            `}
          >
            <LogOut className="h-4 w-4" />
            {!isCollapsed && 'Cerrar Sesión'}
          </Button>
        </div>
      </aside>
    </>
  );
}
