import { useState } from 'react';
import { 
  Settings, 
  UserCog,
  Bell,
  Shield,
  Palette,
  Save
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { loadSystemSettings, saveSystemSettings, type MainCurrencyCode } from '@/lib/systemSettingsStore';

export function SettingsModule() {
  const [settings, setSettings] = useState(() => loadSystemSettings());

  const colorOptions = ['#003366', '#2563eb', '#0f172a', '#15803d'];

  const handleSave = () => {
    saveSystemSettings(settings);
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
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="notifications">Notificaciones</TabsTrigger>
          <TabsTrigger value="security">Seguridad</TabsTrigger>
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
                  <select
                    className="w-full mt-1 p-2 border rounded-lg"
                    value={settings.timezone}
                    onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                  >
                    <option>America/La_Paz (GMT-4)</option>
                    <option>America/Santo_Domingo (GMT-4)</option>
                    <option>America/New_York (GMT-5)</option>
                  </select>
                </div>
                <div>
                  <Label>Moneda Principal</Label>
                  <select
                    className="w-full mt-1 p-2 border rounded-lg"
                    value={settings.currency}
                    onChange={(e) => setSettings({ ...settings, currency: e.target.value as MainCurrencyCode })}
                  >
                    <option value="DOP">DOP - Peso Dominicano</option>
                    <option value="USD">USD - Dólar Estadounidense</option>
                  </select>
                </div>
                <div>
                  <Label>Idioma</Label>
                  <select
                    className="w-full mt-1 p-2 border rounded-lg"
                    value={settings.language}
                    onChange={(e) => setSettings({ ...settings, language: e.target.value })}
                  >
                    <option value="es">Español</option>
                    <option value="en">English</option>
                  </select>
                </div>
                <div>
                  <Label>Formato de Fecha</Label>
                  <select
                    className="w-full mt-1 p-2 border rounded-lg"
                    value={settings.dateFormat}
                    onChange={(e) => setSettings({ ...settings, dateFormat: e.target.value })}
                  >
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
                  onCheckedChange={(c) => setSettings({ ...settings, notifications: c })}
                />
              </div>
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div>
                  <p className="font-medium text-slate-900">Alertas por Email</p>
                  <p className="text-sm text-slate-500">Enviar notificaciones importantes por correo</p>
                </div>
                <Switch 
                  checked={settings.emailAlerts}
                  onCheckedChange={(c) => setSettings({ ...settings, emailAlerts: c })}
                />
              </div>
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div>
                  <p className="font-medium text-slate-900">Resumen Diario</p>
                  <p className="text-sm text-slate-500">Enviar reporte diario de actividades</p>
                </div>
                <Switch 
                  checked={settings.dailySummary}
                  onCheckedChange={(c) => setSettings({ ...settings, dailySummary: c })}
                />
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
                  <Input
                    type="number"
                    value={settings.sessionTimeout}
                    onChange={(e) => setSettings({ ...settings, sessionTimeout: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Intentos de Login Fallidos</Label>
                  <Input
                    type="number"
                    value={settings.failedLoginAttempts}
                    onChange={(e) => setSettings({ ...settings, failedLoginAttempts: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div>
                  <p className="font-medium text-slate-900">Autenticación de Dos Factores</p>
                  <p className="text-sm text-slate-500">Requerir 2FA para administradores</p>
                </div>
                <Switch
                  checked={settings.twoFactor}
                  onCheckedChange={(c) => setSettings({ ...settings, twoFactor: c })}
                />
              </div>
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div>
                  <p className="font-medium text-slate-900">Registro de Actividad</p>
                  <p className="text-sm text-slate-500">Guardar logs de todas las acciones</p>
                </div>
                <Switch
                  checked={settings.activityLog}
                  onCheckedChange={(c) => setSettings({ ...settings, activityLog: c })}
                />
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
                  {colorOptions.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setSettings({ ...settings, primaryColor: color })}
                      className={`w-10 h-10 rounded-lg cursor-pointer ring-offset-2 transition-all ${
                        settings.primaryColor === color ? 'ring-2 ring-slate-900' : 'ring-0'
                      }`}
                      style={{ backgroundColor: color }}
                      aria-label={`Seleccionar color ${color}`}
                    />
                  ))}
                </div>
                <p className="text-sm text-slate-500 mt-2">
                  Color seleccionado: <span className="font-medium">{settings.primaryColor}</span>
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
