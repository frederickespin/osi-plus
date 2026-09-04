import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { login } from '@/lib/api';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { getAppEnv, ENV_LABELS } from '@/lib/env';
import type { UserRole } from '@/types/osi.types';
import { notifyMt01b2LegacyLogin } from '@/lib/mt01b2FrontendBootstrap';

export interface LoginSession {
  token: string;
  userId: string;
  name: string;
  role: UserRole;
  permissions?: readonly string[];
  deniedPermissions?: readonly string[];
  commercialCrmPreviewAuthorized?: boolean;
  commercialCrmProductionAuthorized?: boolean;
}

interface LoginScreenProps {
  onLoginSuccess: (session: LoginSession) => void | Promise<void>;
}

export function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const appEnvironment = getAppEnv();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim() || !password.trim()) {
      toast.error('Por favor ingresa email y contraseña');
      return;
    }
    
    setLoading(true);
    
    try {
      const response = await login(email, password);
      
      if (response.ok && response.token && response.user) {
        const session: LoginSession = {
          token: response.token,
          userId: response.user.id,
          name: response.user.name,
          role: response.user.role as UserRole,
          permissions: Array.isArray(response.user.permissions) ? response.user.permissions : undefined,
          deniedPermissions: Array.isArray(response.user.deniedPermissions) ? response.user.deniedPermissions : undefined,
          commercialCrmPreviewAuthorized: response.user.commercialCrmPreviewAuthorized === true,
          commercialCrmProductionAuthorized: response.user.commercialCrmProductionAuthorized === true,
        };
        
        await onLoginSuccess(session);
        void notifyMt01b2LegacyLogin();
        toast.success(`Bienvenido, ${response.user.name}`);
      } else {
        toast.error('Error en la respuesta del servidor');
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Credenciales inválidas';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 bg-[#003366] rounded-xl flex items-center justify-center mb-2">
            <span className="text-white text-2xl font-bold">OSi</span>
          </div>
          <CardTitle className="text-2xl font-bold text-slate-900">OSi-Plus ERP</CardTitle>
          <p className="text-slate-500 text-sm">Sistema de Gestión Integral</p>
          <p
            className={`text-xs font-medium px-2 py-1 rounded inline-block ${
              appEnvironment === 'production'
                ? 'bg-emerald-100 text-emerald-800'
                : appEnvironment === 'preview'
                  ? 'bg-amber-100 text-amber-800'
                  : appEnvironment === 'development'
                    ? 'bg-sky-100 text-sky-800'
                    : 'bg-slate-200 text-slate-800'
            }`}
            title="Ambiente actual"
          >
            {ENV_LABELS[appEnvironment]}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@empresa.com"
                autoComplete="email"
                disabled={loading}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                disabled={loading}
                required
              />
            </div>
            <Button 
              type="submit" 
              className="w-full bg-[#003366] hover:bg-[#002244]" 
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Iniciando sesión...
                </>
              ) : (
                'Iniciar Sesión'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
