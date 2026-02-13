import { ClipboardList } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { loadOsi } from '@/lib/hrNotaStorage';
import { openOsi } from '@/lib/navigation';

export function SupervisorNotaModule() {
  const osis = loadOsi();
  const withPlan = osis.filter((osi) => (osi.osiNotaPlan?.items?.length || 0) > 0);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Supervisor - Bandeja NOTA</h1>
        <p className="text-slate-500">OSIs con plan NOTA para registrar</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            OSIs con Plan
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {withPlan.length === 0 && (
            <p className="text-sm text-slate-500">No hay OSIs con plan.</p>
          )}
          {withPlan.map((osi) => (
            <div key={osi.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="font-medium text-slate-900">{osi.code}</p>
                <p className="text-xs text-slate-500">{osi.clientName}</p>
                <Badge variant="outline">Plan: {osi.osiNotaPlan?.items?.length || 0}</Badge>
              </div>
              <Button onClick={() => openOsi(osi.id, 'nota')}>Abrir OSI (Registro)</Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
