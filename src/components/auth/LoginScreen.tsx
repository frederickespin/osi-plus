import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { login, type LegacyLoginResponse } from '@/lib/api';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { getAppEnv, ENV_LABELS } from '@/lib/env';
import type { UserRole } from '@/types/osi.types';
import { notifyMt01b2LegacyLogin } from '@/lib/mt01b2FrontendBootstrap';
import type { MembershipOption } from '@/lib/sessionStore';

export interface LoginSession {
  token: string;
  name: string;
  role: UserRole;
  membershipRef: string;
  memberships: readonly MembershipOption[];
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
  const [pendingSelection, setPendingSelection] = useState<LegacyLoginResponse | null>(null);
  const [selectedMembershipRef, setSelectedMembershipRef] = useState('');
  const appEnvironment = getAppEnv();

  const completeLogin = async (response: LegacyLoginResponse, membershipRef: string) => {
    const selected = response.membershipSelection.options.find((option) => option.membershipRef === membershipRef);
    if (!selected) throw new Error('La empresa seleccionada no está disponible.');
    const session: LoginSession = {
      token: response.token,
      name: response.user.name,
      role: selected.role,
      membershipRef: selected.membershipRef,
      memberships: response.membershipSelection.options,
    };
    await onLoginSuccess(session);
    void notifyMt01b2LegacyLogin();
    toast.success(`Bienvenido, ${response.user.name}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim() || !password.trim()) {
      toast.error('Por favor ingresa email y contraseña');
      return;
    }
    
    setLoading(true);
    
    try {
      const response = await login(email, password);
      
      if (response.ok && response.token && response.user && response.membershipSelection.options.length > 0) {
        if (response.membershipSelection.required) {
          const preferred = response.membershipSelection.options.find((option) => option.preferred)
            ?? response.membershipSelection.options[0];
          setPendingSelection(response);
          setSelectedMembershipRef(preferred.membershipRef);
        } else {
          await completeLogin(response, response.membershipSelection.options[0].membershipRef);
        }
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

  const handleMembershipSelection = async () => {
    if (!pendingSelection || !selectedMembershipRef) return;
    setLoading(true);
    try {
      await completeLogin(pendingSelection, selectedMembershipRef);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'No fue posible seleccionar la empresa.');
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
          {pendingSelection ? <div className="space-y-4" data-testid="membership-selection">
            <div><Label htmlFor="membership">Organización</Label><p className="mt-1 text-xs text-slate-500">Seleccione el contexto empresarial para esta sesión.</p></div>
            <select id="membership" value={selectedMembershipRef} onChange={(event) => setSelectedMembershipRef(event.target.value)} disabled={loading} className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm">
              {pendingSelection.membershipSelection.options.map((option) => <option key={option.membershipRef} value={option.membershipRef}>{option.tenantName}</option>)}
            </select>
            <Button type="button" className="w-full bg-[#003366] hover:bg-[#002244]" disabled={loading || !selectedMembershipRef} onClick={() => void handleMembershipSelection()}>{loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verificando...</> : 'Continuar'}</Button>
            <Button type="button" variant="ghost" className="w-full" disabled={loading} onClick={() => { setPendingSelection(null); setSelectedMembershipRef(''); }}>Usar otra cuenta</Button>
          </div> : <form onSubmit={handleSubmit} className="space-y-4">
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
          </form>}
        </CardContent>
      </Card>
    </div>
  );
}
