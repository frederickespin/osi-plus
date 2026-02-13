import { useState } from 'react';
import { 
  Settings, 
  UserCog,
  Bell,
  Shield,
  Database,
  Palette,
  Save,
  CheckCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

export function SettingsModule() {
  const [settings, setSettings] = useState({
    companyName: 'International Packers SRL',
    email: 'admin@ipackers.com',
    phone: '+591 2100000',
    address: 'Av. Principal #123, La Paz, Bolivia',
    notifications: true,
    emailAlerts: true,
    autoBackup: true,
  });

  const handleSave = () => {
    toast.success('Configuración guardada exitosamente');
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Configuración</h1>
          <p className="text-slate-500">Ajustes del sistema OSi-plus</p>
        </div>
        <Button onClick={handleSave}>
          <Save className="h-4 w-4 mr-2" />
          Guardar Cambios
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="general">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="notifications">Notificaciones</TabsTrigger>
          <TabsTrigger value="security">Seguridad</TabsTrigger>
          <TabsTrigger value="database">Base de Datos</TabsTrigger>
          <TabsTrigger value="appearance">Apariencia</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <UserCog className="h-5 w-5" />
                Información de la Empresa
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Nombre de la Empresa</Label>
                  <Input 
                    value={settings.companyName}
                    onChange={(e) => setSettings({...settings, companyName: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Email Principal</Label>
                  <Input 
                    type="email"
                    value={settings.email}
                    onChange={(e) => setSettings({...settings, email: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Teléfono</Label>
                  <Input 
                    value={settings.phone}
                    onChange={(e) => setSettings({...settings, phone: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Dirección</Label>
                  <Input 
                    value={settings.address}
                    onChange={(e) => setSettings({...settings, address: e.target.value})}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Configuración del Sistema
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Zona Horaria</Label>
                  <select className="w-full mt-1 p-2 border rounded-lg">
                    <option>America/La_Paz (GMT-4)</option>
                    <option>America/Santiago (GMT-3)</option>
                    <option>America/Buenos_Aires (GMT-3)</option>
                  </select>
                </div>
                <div>
                  <Label>Moneda Principal</Label>
                  <select className="w-full mt-1 p-2 border rounded-lg">
                    <option>BOB - Boliviano</option>
                    <option>USD - Dólar Americano</option>
                    <option>EUR - Euro</option>
                  </select>
                </div>
                <div>
                  <Label>Idioma</Label>
                  <select className="w-full mt-1 p-2 border rounded-lg">
                    <option>Español</option>
                    <option>English</option>
                    <option>Português</option>
                  </select>
                </div>
                <div>
                  <Label>Formato de Fecha</Label>
                  <select className="w-full mt-1 p-2 border rounded-lg">
                    <option>DD/MM/YYYY</option>
                    <option>MM/DD/YYYY</option>
                    <option>YYYY-MM-DD</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Configuración de Notificaciones
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div>
                  <p className="font-medium text-slate-900">Notificaciones Push</p>
                  <p className="text-sm text-slate-500">Recibir alertas en tiempo real</p>
                </div>
                <Switch 
                  checked={settings.notifications}
                  onCheckedChange={(c) => setSettings({...settings, notifications: c})}
                />
              </div>
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div>
                  <p className="font-medium text-slate-900">Alertas por Email</p>
                  <p className="text-sm text-slate-500">Enviar notificaciones importantes por correo</p>
                </div>
                <Switch 
                  checked={settings.emailAlerts}
                  onCheckedChange={(c) => setSettings({...settings, emailAlerts: c})}
                />
              </div>
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div>
                  <p className="font-medium text-slate-900">Resumen Diario</p>
                  <p className="text-sm text-slate-500">Enviar reporte diario de actividades</p>
                </div>
                <Switch />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Seguridad
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Sesión Expira (minutos)</Label>
                  <Input type="number" defaultValue={30} />
                </div>
                <div>
                  <Label>Intentos de Login Fallidos</Label>
                  <Input type="number" defaultValue={3} />
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div>
                  <p className="font-medium text-slate-900">Autenticación de Dos Factores</p>
                  <p className="text-sm text-slate-500">Requerir 2FA para administradores</p>
                </div>
                <Switch />
              </div>
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div>
                  <p className="font-medium text-slate-900">Registro de Actividad</p>
                  <p className="text-sm text-slate-500">Guardar logs de todas las acciones</p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="database" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Database className="h-5 w-5" />
                Base de Datos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div>
                  <p className="font-medium text-slate-900">Respaldo Automático</p>
                  <p className="text-sm text-slate-500">Respaldar base de datos diariamente</p>
                </div>
                <Switch 
                  checked={settings.autoBackup}
                  onCheckedChange={(c) => setSettings({...settings, autoBackup: c})}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Button variant="outline">
                  <Database className="h-4 w-4 mr-2" />
                  Respaldar Ahora
                </Button>
                <Button variant="outline">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Restaurar Backup
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appearance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Palette className="h-5 w-5" />
                Apariencia
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Color Principal</Label>
                <div className="flex gap-3 mt-2">
                  <div className="w-10 h-10 rounded-lg bg-[#003366] cursor-pointer ring-2 ring-offset-2 ring-[#003366]" />
                  <div className="w-10 h-10 rounded-lg bg-blue-600 cursor-pointer" />
                  <div className="w-10 h-10 rounded-lg bg-slate-800 cursor-pointer" />
                  <div className="w-10 h-10 rounded-lg bg-green-700 cursor-pointer" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
