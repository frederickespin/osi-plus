import { useEffect, useMemo, useState } from 'react';
import { 
  Search, 
  Plus, 
  Edit,
  Trash2,
  Mail,
  Phone,
  User,
  Camera,
  Shield,
  Award,
  Calendar,
  AlertTriangle,
  CheckCircle,
  X,
  Upload,
  Briefcase,
  Star,
  TrendingUp
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { mockUsers, roleDefinitions } from '@/data/mockData';
import type { User as UserType, UserRole, UserStatus, ContractType, BaseSkill, SHAB } from '@/types/osi.types';
import { isFieldStaffRole, loadUsers, normalizeUsers, persistUsers, saveUsers } from '@/lib/userStore';
import { loadAllowanceRoleConfig, loadCatalogs, saveAllowanceRoleConfig } from '@/lib/hrNotaStorage';

// Extended SHAB including PE
const ALL_SHAB_CODES: { code: SHAB | 'PE'; name: string; description: string }[] = [
  { code: 'PA', name: 'Carpintero', description: 'Fabricación de huacales y embalajes de madera' },
  { code: 'PB', name: 'Mecánico', description: 'Recepción de tickets de avería y mantenimiento' },
  { code: 'PC', name: 'Instalador', description: 'Instalación de equipos y mobiliario' },
  { code: 'PD', name: 'Mantenimiento', description: 'Mantenimiento general y soporte' },
  { code: 'PF', name: 'Electricista', description: 'Trabajos eléctricos y conexiones' },
  { code: 'PE', name: 'Supervisor Suplente', description: 'Funciones de liderazgo en campo' },
];

const BASE_SKILLS: BaseSkill[] = ['Empacador', 'Estibador', 'Cargador', 'Desarmador', 'Embalador'];

const STRATEGIC_ROLES: UserRole[] = ['A', 'V', 'K', 'B', 'C', 'I'];
const OPERATIONAL_ROLES: UserRole[] = ['C1', 'D', 'E', 'G', 'N', 'PA', 'PB', 'PC', 'PD', 'PE', 'PF'];
const isNotaEnabledForUser = (user: UserType) =>
  isFieldStaffRole(user.role) && user.notaEnabled !== false;

export function UsersModule() {
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [activeTab, setActiveTab] = useState('identity');
  const [users, setUsers] = useState<UserType[]>(() => {
    const stored = loadUsers();
    if (stored.length) return normalizeUsers(stored);
    const normalized = normalizeUsers(mockUsers);
    saveUsers(normalized);
    return normalized;
  });
  const catalogs = useMemo(() => loadCatalogs(), []);
  const [allowanceRoleConfig, setAllowanceRoleConfig] = useState(loadAllowanceRoleConfig());
  const [selectedAllowanceRole, setSelectedAllowanceRole] = useState<UserRole>('C1');

  useEffect(() => {
    const hasLegacy = Object.values(allowanceRoleConfig).some((value) => Array.isArray(value));
    if (!hasLegacy) return;
    const nextConfig: Record<string, Record<string, number>> = {};
    OPERATIONAL_ROLES.forEach((role) => {
      const value = (allowanceRoleConfig as any)[role];
      if (Array.isArray(value)) {
        const mapped: Record<string, number> = {};
        value.forEach((id: string) => {
          const allowance = catalogs.allowanceTypes.find((item) => item.id === id);
          mapped[id] = allowance?.baseRate ?? 0;
        });
        nextConfig[role] = mapped;
      } else if (value && typeof value === 'object') {
        const mapped: Record<string, number> = {};
        Object.entries(value).forEach(([id, amount]) => {
          const numeric = Number(amount);
          mapped[id] = Number.isFinite(numeric) ? numeric : 0;
        });
        nextConfig[role] = mapped;
      } else {
        nextConfig[role] = {};
      }
    });
    setAllowanceRoleConfig(nextConfig as any);
    saveAllowanceRoleConfig(nextConfig as any);
  }, [allowanceRoleConfig, catalogs.allowanceTypes]);
  
  // Form state
  const [formData, setFormData] = useState<Partial<UserType>>({
    id: '',
    fullName: '',
    email: '',
    whatsappNumber: '',
    profilePhotoUrl: '',
    role: 'N',
    contractType: 'Planta',
    status: 'ACTIVE',
    currentRating: 100,
    points: 0,
    isPolyfunctional: false,
    baseSkills: [],
    shabActive: [],
    shabRatesOverride: false,
    notaEnabled: true,
    allowanceTypeIds: [],
  });

  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [showShabSection, setShowShabSection] = useState(false);

  useEffect(() => {
    persistUsers(users);
  }, [users]);
  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleRoleChange = (role: UserRole) => {
    setFormData(prev => {
      const template = allowanceRoleConfig[role] || {};
      const templateIds = Object.entries(template)
        .filter(([, amount]) => Number(amount) > 0)
        .map(([id]) => id);
      const shouldApplyTemplate = !editingUser && (prev.allowanceTypeIds?.length ?? 0) === 0;
      return {
        ...prev,
        role,
        notaEnabled: isFieldStaffRole(role)
          ? (prev.notaEnabled ?? true)
          : false,
        allowanceTypeIds: shouldApplyTemplate ? templateIds : prev.allowanceTypeIds,
      };
    });
    // Show SHAB section only for role N
    setShowShabSection(role === 'N');
  };

  const handleContractTypeChange = (type: ContractType) => {
    setFormData(prev => ({ ...prev, contractType: type }));
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
        setFormData(prev => ({ ...prev, profilePhotoUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleBaseSkill = (skill: BaseSkill) => {
    setFormData(prev => {
      const current = prev.baseSkills || [];
      if (current.includes(skill)) {
        return { ...prev, baseSkills: current.filter(s => s !== skill) };
      }
      return { ...prev, baseSkills: [...current, skill] };
    });
  };

  const toggleShab = (shab: SHAB | 'PE') => {
    setFormData(prev => {
      const current = prev.shabActive || [];
      if (current.includes(shab as SHAB)) {
        return { ...prev, shabActive: current.filter(s => s !== shab) };
      }
      return { ...prev, shabActive: [...current, shab as SHAB] };
    });
  };

  const getRoleAllowanceAmount = (role: UserRole, allowanceId: string) =>
    allowanceRoleConfig[role]?.[allowanceId];

  const setRoleAllowanceAmount = (role: UserRole, allowanceId: string, amount: number) => {
    const current = allowanceRoleConfig[role] || {};
    const nextRole = { ...current, [allowanceId]: amount };
    const nextConfig = { ...allowanceRoleConfig, [role]: nextRole };
    setAllowanceRoleConfig(nextConfig);
    saveAllowanceRoleConfig(nextConfig);
  };

  const toggleRoleAllowance = (role: UserRole, allowanceId: string, enabled: boolean) => {
    const current = { ...(allowanceRoleConfig[role] || {}) };
    if (!enabled) {
      delete current[allowanceId];
    } else {
      const allowance = catalogs.allowanceTypes.find((item) => item.id === allowanceId);
      current[allowanceId] = current[allowanceId] ?? allowance?.baseRate ?? 0;
    }
    const nextConfig = { ...allowanceRoleConfig, [role]: current };
    setAllowanceRoleConfig(nextConfig);
    saveAllowanceRoleConfig(nextConfig);
  };

  const handleSave = () => {
    // Validaciones
    if (!formData.id || !formData.fullName || !formData.email || !formData.whatsappNumber) {
      toast.error('Por favor complete los campos obligatorios');
      return;
    }

    // Validar foto obligatoria
    if (!formData.profilePhotoUrl) {
      toast.error('La foto de perfil es obligatoria');
      setActiveTab('identity');
      return;
    }

    // Validar fecha fin de contrato para Personal Móvil
    if (formData.contractType === 'Personal Móvil' && !formData.contractEndDate) {
      toast.error('Debe especificar la fecha de fin de contrato para Personal Móvil');
      return;
    }

    if (editingUser) {
      const updatedUser: UserType = {
        ...editingUser,
        id: formData.id!,
        fullName: formData.fullName!,
        name: formData.fullName!,
        email: formData.email!,
        whatsappNumber: formData.whatsappNumber!,
        phone: formData.whatsappNumber!,
        role: formData.role as UserRole,
        contractType: formData.contractType as ContractType,
        contractEndDate: formData.contractEndDate,
        status: formData.status as UserStatus,
        currentRating: formData.currentRating || 0,
        points: formData.points || 0,
        isPolyfunctional: formData.isPolyfunctional,
        baseSkills: formData.baseSkills || [],
        shabActive: formData.shabActive || [],
        shabRatesOverride: formData.shabRatesOverride,
        notaEnabled: formData.notaEnabled,
        allowanceTypeIds: formData.allowanceTypeIds || [],
        profilePhotoUrl: formData.profilePhotoUrl,
        avatar: formData.profilePhotoUrl,
        rating: Math.round(((formData.currentRating || 0) / 20) * 10) / 10,
        skills: formData.shabActive && formData.shabActive.length > 0 ? formData.shabActive : undefined,
      };
      setUsers(prev => prev.map(u => (u.id === editingUser.id ? updatedUser : u)));
      toast.success('Usuario actualizado exitosamente');
    } else {
      const today = new Date().toISOString().slice(0, 10);
      const newUser: UserType = {
        id: formData.id!,
        code: `EMP${String(users.length + 1).padStart(3, '0')}`,
        name: formData.fullName!,
        fullName: formData.fullName!,
        email: formData.email!,
        phone: formData.whatsappNumber!,
        whatsappNumber: formData.whatsappNumber!,
        role: formData.role as UserRole,
        status: formData.status as UserStatus,
        department: getRoleLabel(formData.role as UserRole),
        joinDate: today,
        contractType: formData.contractType as ContractType,
        contractEndDate: formData.contractEndDate,
        points: formData.points || 0,
        rating: Math.round(((formData.currentRating || 0) / 20) * 10) / 10,
        currentRating: formData.currentRating || 0,
        avatar: formData.profilePhotoUrl,
        profilePhotoUrl: formData.profilePhotoUrl,
        isPolyfunctional: formData.isPolyfunctional,
        baseSkills: formData.baseSkills || [],
        shabActive: formData.shabActive || [],
        shabRatesOverride: formData.shabRatesOverride,
        notaEnabled: formData.notaEnabled,
        allowanceTypeIds: formData.allowanceTypeIds || [],
        skills: formData.shabActive && formData.shabActive.length > 0 ? formData.shabActive : undefined,
      };
      setUsers(prev => [newUser, ...prev]);
      toast.success('Usuario creado exitosamente');
    }
    setIsDialogOpen(false);
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      id: '',
      fullName: '',
      email: '',
      whatsappNumber: '',
      profilePhotoUrl: '',
      role: 'N',
      contractType: 'Planta',
      status: 'ACTIVE',
      currentRating: 100,
      points: 0,
      isPolyfunctional: false,
      baseSkills: [],
      shabActive: [],
      shabRatesOverride: false,
      notaEnabled: true,
      allowanceTypeIds: [],
    });
    setSelectedAllowanceRole('C1');
    setPhotoPreview(null);
    setShowShabSection(true);
    setEditingUser(null);
    setActiveTab('identity');
  };

  const openNewUserDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (user: UserType) => {
    setEditingUser(user);
    const normalizedNotaEnabled = isFieldStaffRole(user.role)
      ? user.notaEnabled !== false
      : false;
    setFormData({
      ...user,
      fullName: user.name,
      whatsappNumber: user.phone,
      profilePhotoUrl: user.avatar,
      notaEnabled: normalizedNotaEnabled,
      allowanceTypeIds: user.allowanceTypeIds || [],
    });
    setPhotoPreview(user.avatar || null);
    setShowShabSection(user.role === 'N');
    setIsDialogOpen(true);
  };

  const getStatusBadge = (status: UserStatus) => {
    const variants: Record<UserStatus, { variant: 'default' | 'secondary' | 'destructive'; label: string; icon: any }> = {
      'ACTIVE': { variant: 'default', label: 'Activo', icon: CheckCircle },
      'SUSPENDED': { variant: 'secondary', label: 'Suspendido', icon: AlertTriangle },
      'INACTIVE': { variant: 'destructive', label: 'Inactivo', icon: X },
    };
    const config = variants[status];
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className="flex items-center gap-1 w-fit">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const getRoleLabel = (role: UserRole) => {
    const def = roleDefinitions.find(r => r.code === role);
    return def?.name || role;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Gestión de Usuarios</h1>
          <p className="text-slate-500">Alta, edición y administración de personal</p>
        </div>
        <Button onClick={openNewUserDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Usuario
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{users.length}</p>
            <p className="text-sm text-slate-500">Total Usuarios</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">
              {users.filter(u => String(u.status).toUpperCase() === 'ACTIVE').length}
            </p>
            <p className="text-sm text-slate-500">Activos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-orange-600">
              {users.filter(u => String(u.status).toUpperCase() === 'SUSPENDED').length}
            </p>
            <p className="text-sm text-slate-500">Suspendidos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{roleDefinitions.length}</p>
            <p className="text-sm text-slate-500">Roles</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-purple-600">
              {users.filter(u => u.skills && u.skills.length > 0).length}
            </p>
            <p className="text-sm text-slate-500">Con SHAB</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input 
          placeholder="Buscar usuario por nombre, email o teléfono..."
          className="pl-10"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Users Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Calificación</TableHead>
              <TableHead>NOTA</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {user.avatar ? (
                        <img 
                          src={user.avatar} 
                          alt={user.name}
                          className="h-10 w-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center">
                          <User className="h-5 w-5 text-slate-500" />
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-slate-900">{user.name}</p>
                        <p className="text-xs text-slate-500">ID: {user.id}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {getRoleLabel(user.role)}
                    </Badge>
                    {user.skills && user.skills.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {user.skills.map(skill => (
                          <span key={skill} className="text-[10px] bg-amber-100 text-amber-700 px-1 rounded">
                            {skill}
                          </span>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-slate-600">
                      <div className="flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {user.email}
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        <Phone className="h-3 w-3" />
                        {user.phone}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                        <span className="font-medium">{user.rating}</span>
                      </div>
                      <span className="text-slate-400">|</span>
                      <div className="flex items-center gap-1">
                        <Award className="h-4 w-4 text-purple-500" />
                        <span>{user.points}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={isNotaEnabledForUser(user as UserType) ? 'default' : 'secondary'}>
                      {isNotaEnabledForUser(user as UserType) ? 'Sí' : 'No'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {getStatusBadge((user.status as UserStatus) || 'ACTIVE')}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(user as UserType)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon">
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* New/Edit User Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              {editingUser ? 'Editar Usuario' : 'Alta de Nuevo Usuario'}
            </DialogTitle>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="identity">
                <Shield className="h-4 w-4 mr-2" />
                Identidad
              </TabsTrigger>
              <TabsTrigger value="access">
                <Briefcase className="h-4 w-4 mr-2" />
                Accesos
              </TabsTrigger>
              <TabsTrigger value="skills">
                <Award className="h-4 w-4 mr-2" />
                Competencias
              </TabsTrigger>
              <TabsTrigger value="performance">
                <TrendingUp className="h-4 w-4 mr-2" />
                Rendimiento
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: Identity */}
            <TabsContent value="identity" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Datos de Identidad y Seguridad
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Photo Upload */}
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      <div className={`h-24 w-24 rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden ${
                        !formData.profilePhotoUrl ? 'border-red-300 bg-red-50' : 'border-slate-300'
                      }`}>
                        {photoPreview ? (
                          <img src={photoPreview} alt="Preview" className="h-full w-full object-cover" />
                        ) : (
                          <Camera className={`h-8 w-8 ${!formData.profilePhotoUrl ? 'text-red-400' : 'text-slate-400'}`} />
                        )}
                      </div>
                    </div>
                    <div className="flex-1 space-y-2">
                      <Label>
                        Foto de Perfil
                        <span className="text-red-500 ml-1">*</span>
                      </Label>
                      <p className="text-sm text-slate-500">
                        Obligatoria para todos los usuarios. Esta foto se utiliza para identificación del personal.
                      </p>
                      <div>
                        <Input 
                          type="file" 
                          accept="image/*"
                          onChange={handlePhotoUpload}
                          className="hidden"
                          id="photo-upload"
                        />
                        <Label htmlFor="photo-upload" className="cursor-pointer">
                          <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm">
                            <Upload className="h-4 w-4" />
                            {photoPreview ? 'Cambiar foto' : 'Subir foto'}
                          </div>
                        </Label>
                      </div>
                    </div>
                  </div>

                  {/* Identity Fields */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="userId">ID / Cédula <span className="text-red-500">*</span></Label>
                      <Input 
                        id="userId"
                        placeholder="Ej: 12345678"
                        value={formData.id}
                        onChange={(e) => setFormData(prev => ({ ...prev, id: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="fullName">Nombre Completo <span className="text-red-500">*</span></Label>
                      <Input 
                        id="fullName"
                        placeholder="Nombre y apellidos"
                        value={formData.fullName}
                        onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email <span className="text-red-500">*</span></Label>
                      <Input 
                        id="email"
                        type="email"
                        placeholder="correo@ipackers.com"
                        value={formData.email}
                        onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="whatsapp">WhatsApp <span className="text-red-500">*</span></Label>
                      <Input 
                        id="whatsapp"
                        placeholder="+591 70000000"
                        value={formData.whatsappNumber}
                        onChange={(e) => setFormData(prev => ({ ...prev, whatsappNumber: e.target.value }))}
                      />
                      <p className="text-xs text-slate-500">Incluir código de país. Se usa para enviar asignaciones OSI.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab 2: Access */}
            <TabsContent value="access" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Briefcase className="h-5 w-5" />
                    Clasificación Operativa
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Rol del Sistema <span className="text-red-500">*</span></Label>
                      <Select 
                        value={formData.role} 
                        onValueChange={(value) => handleRoleChange(value as UserRole)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar rol" />
                        </SelectTrigger>
                      <SelectContent>
                        <div className="px-2 py-1 text-xs font-semibold text-slate-500">Estratégicos (Web)</div>
                        {STRATEGIC_ROLES.map(role => (
                          <SelectItem key={role} value={role}>
                            {getRoleLabel(role)} ({role})
                          </SelectItem>
                        ))}
                        <div className="px-2 py-1 text-xs font-semibold text-slate-500 mt-2">Operativos (App Móvil)</div>
                        {OPERATIONAL_ROLES.map(role => (
                          <SelectItem key={role} value={role}>
                            {getRoleLabel(role)} ({role})
                          </SelectItem>
                        ))}
                      </SelectContent>
                      </Select>
                      <p className="text-xs text-slate-500">
                        {STRATEGIC_ROLES.includes(formData.role as UserRole) 
                          ? 'Acceso a interfaz Web' 
                          : 'Acceso a App Móvil'}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Tipo de Contrato <span className="text-red-500">*</span></Label>
                      <Select 
                        value={formData.contractType} 
                        onValueChange={(value) => handleContractTypeChange(value as ContractType)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Planta">Planta (Fijo)</SelectItem>
                          <SelectItem value="Personal Móvil">Personal Móvil (Temporal)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Contract End Date for Personal Móvil */}
                  {formData.contractType === 'Personal Móvil' && (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                      <Label htmlFor="contractEnd" className="flex items-center gap-2 text-amber-800">
                        <Calendar className="h-4 w-4" />
                        Fecha de Fin de Contrato <span className="text-red-500">*</span>
                      </Label>
                      <Input 
                        id="contractEnd"
                        type="date"
                        value={formData.contractEndDate}
                        onChange={(e) => setFormData(prev => ({ ...prev, contractEndDate: e.target.value }))}
                      />
                      <p className="text-xs text-amber-700">
                        El sistema enviará alertas de expiración 7 días antes.
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="password">Contraseña Inicial</Label>
                    <Input 
                      id="password"
                      type="password"
                      placeholder="Mínimo 8 caracteres"
                      onChange={(e) => setFormData(prev => ({ ...prev, passwordHash: e.target.value }))}
                    />
                    <p className="text-xs text-slate-500">
                      El usuario deberá cambiarla en su primer inicio de sesión.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab 3: Skills (Only for Role N) */}
            <TabsContent value="skills" className="space-y-4">
              {showShabSection ? (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <CheckCircle className="h-5 w-5" />
                        Usuario para NOTA
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                        <div>
                          <p className="font-medium text-slate-900">Activar Usuario para NOTA</p>
                          <p className="text-sm text-slate-500">
                            Todo el personal de campo puede generar NOTA. Los SHAB también pueden generar NOTA.
                          </p>
                        </div>
                        <Switch
                          checked={!!formData.notaEnabled}
                          onCheckedChange={(checked) => setFormData(prev => ({ ...prev, notaEnabled: checked }))}
                        />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <CheckCircle className="h-5 w-5" />
                        Capacidades Base (Sin pago extra)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-slate-500 mb-4">
                        Selecciona las capacidades operativas para filtrar equipos en plantillas PET.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {BASE_SKILLS.map(skill => (
                          <label 
                            key={skill} 
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors ${
                              formData.baseSkills?.includes(skill) 
                                ? 'bg-blue-50 border-blue-300 text-blue-700' 
                                : 'bg-white border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <Checkbox 
                              checked={formData.baseSkills?.includes(skill)}
                              onCheckedChange={() => toggleBaseSkill(skill)}
                            />
                            <span className="text-sm font-medium">{skill}</span>
                          </label>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Award className="h-5 w-5" />
                        Habilidades Especiales (SHAB)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                        <div>
                          <p className="font-medium text-slate-900">Activar SHAB</p>
                          <p className="text-sm text-slate-500">Habilita tarifas NOTA para este usuario</p>
                        </div>
                        <Switch 
                          checked={(formData.shabActive?.length || 0) > 0}
                          onCheckedChange={(checked) => {
                            if (!checked) {
                              setFormData(prev => ({ ...prev, shabActive: [] }));
                            }
                          }}
                        />
                      </div>

                      {(formData.shabActive?.length || 0) > 0 && (
                        <div className="space-y-3">
                          <p className="text-sm font-medium text-slate-700">Selecciona las habilidades:</p>
                          <div className="grid grid-cols-1 gap-3">
                            {ALL_SHAB_CODES.map(({ code, name, description }) => (
                              <label 
                                key={code} 
                                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                  formData.shabActive?.includes(code as SHAB) 
                                    ? 'bg-amber-50 border-amber-300' 
                                    : 'bg-white border-slate-200 hover:bg-slate-50'
                                }`}
                              >
                                <Checkbox 
                                  checked={formData.shabActive?.includes(code as SHAB)}
                                  onCheckedChange={() => toggleShab(code)}
                                  className="mt-1"
                                />
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-amber-600">{code}</span>
                                    <span className="font-medium">{name}</span>
                                  </div>
                                  <p className="text-sm text-slate-500">{description}</p>
                                </div>
                              </label>
                            ))}
                          </div>

                          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg mt-4">
                            <div>
                              <p className="font-medium text-slate-900">Tarifa Personalizada</p>
                              <p className="text-sm text-slate-500">Este usuario tiene tarifas especiales diferentes a las estándar</p>
                            </div>
                            <Switch 
                              checked={formData.shabRatesOverride}
                              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, shabRatesOverride: checked }))}
                            />
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </>
              ) : (
                <div className="space-y-4">
                  {isFieldStaffRole(formData.role as UserRole) && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <CheckCircle className="h-5 w-5" />
                          Usuario para NOTA
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                          <div>
                            <p className="font-medium text-slate-900">Activar Usuario para NOTA</p>
                            <p className="text-sm text-slate-500">
                              Disponible para personal de campo (N, PA, PB, PC, PD, PE, PF).
                            </p>
                          </div>
                          <Switch
                            checked={!!formData.notaEnabled}
                            onCheckedChange={(checked) => setFormData(prev => ({ ...prev, notaEnabled: checked }))}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  <div className="p-6 text-center border border-dashed rounded-lg">
                    <Award className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500">Las competencias SHAB solo están disponibles para el rol N (Personal de Campo)</p>
                  </div>
                </div>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Briefcase className="h-5 w-5" />
                    Allowances por Rol (Plantilla)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-slate-500">
                    Define los allowances y sus montos por rol operativo. Se aplica a nuevos usuarios del rol.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Rol Operativo</Label>
                      <Select
                        value={selectedAllowanceRole}
                        onValueChange={(value) => setSelectedAllowanceRole(value as UserRole)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar rol" />
                        </SelectTrigger>
                        <SelectContent>
                          {OPERATIONAL_ROLES.map((role) => (
                            <SelectItem key={role} value={role}>
                              {getRoleLabel(role)} ({role})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {catalogs.allowanceTypes.length === 0 && (
                    <p className="text-sm text-slate-500">No hay allowances configurados.</p>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {catalogs.allowanceTypes.map((allowance) => (
                      <label
                        key={allowance.id}
                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          getRoleAllowanceAmount(selectedAllowanceRole, allowance.id) !== undefined
                            ? 'bg-blue-50 border-blue-300'
                            : 'bg-white border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <Checkbox
                          checked={getRoleAllowanceAmount(selectedAllowanceRole, allowance.id) !== undefined}
                          onCheckedChange={(checked) => toggleRoleAllowance(selectedAllowanceRole, allowance.id, Boolean(checked))}
                          className="mt-1"
                        />
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{allowance.name}</span>
                            <span className="text-xs text-slate-500">
                              {allowance.code} · {allowance.unit}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500">Monto por rol:</span>
                            <Input
                              type="number"
                              inputMode="decimal"
                              step="any"
                              value={getRoleAllowanceAmount(selectedAllowanceRole, allowance.id) ?? ''}
                              onWheel={(event) => (event.target as HTMLInputElement).blur()}
                              onChange={(e) =>
                                setRoleAllowanceAmount(
                                  selectedAllowanceRole,
                                  allowance.id,
                                  Number(e.target.value) || 0
                                )
                              }
                              disabled={getRoleAllowanceAmount(selectedAllowanceRole, allowance.id) === undefined}
                              className="h-7 max-w-[120px] text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </div>
                          <p className="text-[11px] text-slate-500">
                            Base catálogo: {allowance.baseRate.toFixed(2)}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab 4: Performance */}
            <TabsContent value="performance" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Métricas de Rendimiento
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Estado del Usuario</Label>
                      <Select 
                        value={formData.status} 
                        onValueChange={(value) => setFormData(prev => ({ ...prev, status: value as UserStatus }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ACTIVE">
                            <span className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-green-500" />
                              Activo - Puede ser asignado
                            </span>
                          </SelectItem>
                          <SelectItem value="SUSPENDED">
                            <span className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-orange-500" />
                              Suspendido - Bloqueo temporal
                            </span>
                          </SelectItem>
                          <SelectItem value="INACTIVE">
                            <span className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-red-500" />
                              Inactivo - Desactivado
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="rating">Calificación Actual (0-100)</Label>
                      <Input 
                        id="rating"
                        type="number"
                        min="0"
                        max="100"
                        value={formData.currentRating}
                        onChange={(e) => setFormData(prev => ({ ...prev, currentRating: parseInt(e.target.value) || 0 }))}
                      />
                      <p className="text-xs text-slate-500">
                        Basado en puntualidad, evaluaciones de clientes y reportes de daños.
                      </p>
                    </div>
                  </div>

                  {formData.status === 'SUSPENDED' && (
                    <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                      <Label className="flex items-center gap-2 text-orange-800">
                        <AlertTriangle className="h-4 w-4" />
                        Fecha del Incidente
                      </Label>
                      <Input 
                        type="date"
                        value={formData.lastIncidentDate}
                        onChange={(e) => setFormData(prev => ({ ...prev, lastIncidentDate: e.target.value }))}
                        className="mt-2"
                      />
                      <p className="text-xs text-orange-700 mt-2">
                        Reportado por Portería (G). El usuario no podrá ser asignado hasta reactivación.
                      </p>
                    </div>
                  )}

                  {formData.status === 'INACTIVE' && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm text-red-700">
                        <strong>Desactivación automática:</strong> Los usuarios con KPI {'<'} 60% 
                        son automáticamente marcados como INACTIVOS y no pueden ser asignados a nuevas OSI.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave}>
              <CheckCircle className="h-4 w-4 mr-2" />
              {editingUser ? 'Guardar Cambios' : 'Crear Usuario'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
