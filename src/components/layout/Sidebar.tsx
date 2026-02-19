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
  ChevronRight,
  Briefcase as CaseIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import type { ModuleId } from '@/App';
import type { UserRole } from '@/types/osi.types';

interface SidebarProps {
  activeModule: ModuleId;
  onModuleChange: (module: ModuleId) => void;
  userRole?: UserRole;
  userName?: string;
}

interface MenuItem {
  id: ModuleId;
  label: string;
  icon: React.ElementType;
  roles: UserRole[];
  description?: string;
}

interface MenuGroup {
  id: string;
  label: string;
  icon: React.ElementType;
  items: MenuItem[];
}

// Menú agrupado con categorías
const menuGroups: MenuGroup[] = [
  {
    id: 'general',
    label: 'General',
    icon: LayoutDashboard,
    items: [
      { id: 'dashboard', label: 'Centro de Comando', icon: LayoutDashboard, roles: ['A'] },
    ]
  },
  {
    id: 'admin',
    label: 'Administración',
    icon: Settings,
    items: [
      { id: 'users', label: 'Usuarios y Roles', icon: UserCog, roles: ['A'] },
      { id: 'settings', label: 'Configuración', icon: Settings, roles: ['A'] },
      { id: 'fleet', label: 'Registro de Flota', icon: Car, roles: ['A'] },
      { id: 'a-template-approvals', label: 'Aprobaciones (Plantillas)', icon: ClipboardList, roles: ['A'] },
    ]
  },
  {
    id: 'commercial',
    label: 'Comercial',
    icon: CaseIcon,
    items: [
      { id: 'clients', label: 'Clientes', icon: UserCircle, roles: ['A', 'V'] },
      { id: 'sales-quote', label: 'Cotizador Tecnico', icon: FileText, roles: ['A', 'V'], description: 'Alcance -> cajas -> recursos -> resumen' },
      { id: 'k-templates', label: 'Plantillas PST', icon: FileText, roles: ['A', 'V', 'K'], description: 'Catálogo de servicios técnicos' },
      { id: 'commercial-calendar', label: 'Calendario', icon: Calendar, roles: ['A', 'V'], description: 'Propuestas y proyectos' },
      { id: 'commercial-config', label: 'Configuración', icon: Settings, roles: ['A', 'V'], description: 'Config de cajas' },
      { id: 'projects', label: 'Proyectos', icon: FolderOpen, roles: ['A', 'V'] },
    ]
  },
  {
    id: 'coordination',
    label: 'Coordinación',
    icon: Briefcase,
    items: [
      { id: 'k-dashboard', label: 'Control K', icon: LayoutDashboard, roles: ['A', 'K'], description: 'Semáforos + PGD aplicado' },
      { id: 'clients', label: 'Clientes', icon: UserCircle, roles: ['A', 'K'] },
      { id: 'projects', label: 'Proyectos', icon: FolderOpen, roles: ['A', 'K'] },
      { id: 'commercial-calendar', label: 'Calendario', icon: Calendar, roles: ['A', 'K'], description: 'Seguimiento y cumplimiento' },
      { id: 'k-templates', label: 'Centro de Plantillas', icon: FileText, roles: ['A', 'K'], description: 'PIC / PGD / NPS con versionado' },
    ]
  },
  {
    id: 'operations',
    label: 'Operaciones',
    icon: ClipboardList,
    items: [
      { id: 'operations', label: 'Tablero Ops', icon: ClipboardList, roles: ['A', 'B'] },
      { id: 'dispatch', label: 'Despacho', icon: Send, roles: ['A', 'C1'] },
      { id: 'tracking', label: 'Rastreo', icon: MapPin, roles: ['A', 'K', 'B'] },
      { id: 'calendar', label: 'Calendario', icon: Calendar, roles: ['A', 'B'] },
      { id: 'wall', label: 'Muro Liquidación', icon: LayoutTemplate, roles: ['A', 'B'] },
      { id: 'security', label: 'Portería', icon: Shield, roles: ['A', 'G'] },
    ]
  },
  {
    id: 'field',
    label: 'Campo y Taller',
    icon: HardHat,
    items: [
      { id: 'field', label: 'Personal Campo', icon: HardHat, roles: ['A', 'N'] },
      { id: 'supervisor', label: 'Supervisor', icon: Users, roles: ['A', 'D'] },
      { id: 'supervisor-nota', label: 'Sup. NOTA', icon: FileText, roles: ['A', 'D'] },
      { id: 'mechanic', label: 'Mecánica', icon: Wrench, roles: ['A', 'PB'] },
      { id: 'maintenance', label: 'Mantenimiento', icon: Wrench, roles: ['A', 'PD'] },
      { id: 'carpentry', label: 'Taller Madera', icon: Hammer, roles: ['A', 'C'] },
    ]
  },
  {
    id: 'logistics',
    label: 'Logística',
    icon: Package,
    items: [
      { id: 'wms', label: 'WMS Inventario', icon: Warehouse, roles: ['A', 'C'] },
      { id: 'inventory', label: 'Stock General', icon: Package, roles: ['A', 'C'] },
      { id: 'purchases', label: 'Compras', icon: ShoppingCart, roles: ['A', 'C'] },
    ]
  },
  {
    id: 'hr',
    label: 'Recursos Humanos',
    icon: Users,
    items: [
      { id: 'hr', label: 'Dashboard RRHH', icon: Briefcase, roles: ['A', 'I'] },
      { id: 'kpi', label: 'Ranking KPI', icon: BarChart3, roles: ['A', 'I'] },
      { id: 'nota', label: 'Nómina NOTA', icon: FileText, roles: ['A', 'I'] },
      { id: 'osi-editor', label: 'Editor OSI', icon: ClipboardList, roles: ['A', 'V', 'K'] },
      { id: 'badges', label: 'Eco Badges', icon: Award, roles: ['A', 'I'] },
    ]
  }
];

// Obtener grupos filtrados por rol
const getMenuGroupsByRole = (role: UserRole): MenuGroup[] => {
  return menuGroups.map(group => ({
    ...group,
    items: group.items.filter(item => item.roles.includes(role) || role === 'A')
  })).filter(group => group.items.length > 0);
};

function getInitials(name?: string) {
  const value = (name || "").trim();
  if (!value) return "US";
  const parts = value.split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).filter(Boolean);
  return (letters.join("") || "US").slice(0, 2);
}

function getRoleLabel(role: UserRole) {
  if (role === "A") return "Administrador";
  if (role === "I") return "RRHH";
  if (role === "K") return "Coordinador";
  if (role === "V") return "Ventas";
  return role;
}

export function Sidebar({ activeModule, onModuleChange, userRole = 'A', userName }: SidebarProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null);

  const visibleGroups = getMenuGroupsByRole(userRole);

  const handleModuleClick = (moduleId: ModuleId) => {
    onModuleChange(moduleId);
    setIsMobileMenuOpen(false);
  };

  const isGroupActive = (items: MenuItem[]) => items.some(i => i.id === activeModule);

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
              <div className="overflow-hidden">
                <h1 className="text-white font-bold text-lg leading-tight truncate">OSi-plus</h1>
                <p className="text-white/60 text-xs truncate">International Packers</p>
              </div>
            )}
          </div>
        </div>

        {/* User Profile */}
        <div className="p-4 border-b border-white/10">
          <div className={`flex items-center gap-3 ${isCollapsed ? 'justify-center' : ''}`}>
            <div className="w-10 h-10 bg-[#D4AF37] rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-[#003366] font-bold text-sm">{getInitials(userName)}</span>
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{userName || 'Usuario'}</p>
                <p className="text-[#D4AF37] text-xs truncate">{getRoleLabel(userRole)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Menu Items */}
        <nav className="flex-1 overflow-y-auto py-2 overflow-x-hidden">
          <div className="px-2 space-y-2">
            
            {visibleGroups.map((group) => {
              const isActive = isGroupActive(group.items);
              const isHovered = hoveredGroupId === group.id;
              const isExpanded = isHovered || (isActive && !isCollapsed);
              
              // Only render spacer for empty groups (safety check)
              if (group.items.length === 0) return null;

              return (
                <div 
                  key={group.id}
                  className="relative group"
                  onMouseEnter={() => setHoveredGroupId(group.id)}
                  onMouseLeave={() => setHoveredGroupId(null)}
                >
                  {/* Group Header */}
                  <div 
                    className={`
                      flex items-center gap-3 px-3 py-3 rounded-lg cursor-pointer
                      transition-all duration-200
                      ${isCollapsed ? 'justify-center' : ''}
                      ${isActive 
                        ? 'bg-[#D4AF37]/20 text-white' 
                        : 'text-white/80 hover:bg-white/5 hover:text-white'
                      }
                    `}
                  >
                    <group.icon className={`h-5 w-5 flex-shrink-0 ${isActive ? 'text-[#D4AF37]' : ''}`} />
                    
                    {!isCollapsed && (
                      <>
                        <span className="flex-1 text-sm font-medium truncate">{group.label}</span>
                        <ChevronRight 
                          className={`h-4 w-4 text-white/40 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} 
                        />
                      </>
                    )}

                    {/* Collapsed Mode Flyout (Pseudo-tooltip) */}
                    {isCollapsed && isHovered && (
                      <div className="absolute left-full top-0 ml-2 w-56 bg-[#002244] border border-white/10 rounded-lg shadow-xl py-2 z-50">
                        <div className="px-4 py-2 border-b border-white/10 mb-1">
                          <span className="text-[#D4AF37] font-bold text-sm">{group.label}</span>
                        </div>
                        {group.items.map(item => (
                          <button
                            key={item.id}
                            onClick={(e) => { e.stopPropagation(); handleModuleClick(item.id); }}
                            className={`
                              w-full flex items-center gap-3 px-4 py-2 text-sm text-left
                              ${activeModule === item.id 
                                ? 'bg-[#D4AF37]/20 text-white border-l-2 border-[#D4AF37]' 
                                : 'text-white/70 hover:bg-white/5 hover:text-white'
                              }
                            `}
                          >
                            <item.icon className="h-4 w-4" />
                            {item.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Expanded Mode Submenu */}
                  {!isCollapsed && (
                    <div 
                      className={`
                        overflow-hidden transition-all duration-300 ease-in-out
                        ${isExpanded ? 'max-h-[500px] opacity-100 mt-1' : 'max-h-0 opacity-0'}
                      `}
                    >
                      <div className="pl-4 space-y-1">
                        {group.items.map((item) => {
                           const isItemActive = activeModule === item.id;
                           return (
                            <button
                              key={item.id}
                              onClick={() => handleModuleClick(item.id)}
                              className={`
                                w-full flex items-center gap-3 px-3 py-2 rounded-lg
                                text-sm transition-all duration-200 border-l-2
                                ${isItemActive
                                  ? 'border-[#D4AF37] text-[#D4AF37] bg-white/5'
                                  : 'border-white/10 text-white/60 hover:text-white hover:bg-white/5 hover:border-white/30'
                                }
                              `}
                            >
                              <div className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
                              <span className="truncate text-xs font-medium">{item.label}</span>
                            </button>
                           );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
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
