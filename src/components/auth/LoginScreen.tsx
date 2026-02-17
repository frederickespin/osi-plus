import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { login } from '@/lib/api';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import type { UserRole } from '@/types/osi.types';

export interface LoginSession {
  token: string;
  userId: string;
  name: string;
  role: UserRole;
}

interface LoginScreenProps {
  onLoginSuccess: (session: LoginSession) => void;
}

export function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

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
        };
        
        // Store session in localStorage
        localStorage.setItem('osi-plus.session', JSON.stringify(session));
        localStorage.setItem('osi-plus.token', response.token);
        
        onLoginSuccess(session);
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
          
          <div className="mt-6 pt-4 border-t border-slate-200">
            <p className="text-center text-xs text-slate-400 mb-2">
              Credenciales de demostración:
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-50 p-2 rounded">
                <p className="font-medium text-slate-600">Admin</p>
                <p className="text-slate-400">admin@ipackers.com</p>
                <p className="text-slate-400">Admin123*</p>
              </div>
              <div className="bg-slate-50 p-2 rounded">
                <p className="font-medium text-slate-600">Coordinador</p>
                <p className="text-slate-400">maria@ipackers.com</p>
                <p className="text-slate-400">Ventas123*</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
