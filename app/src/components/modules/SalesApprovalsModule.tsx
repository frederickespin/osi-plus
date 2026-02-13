import { CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { loadOsi } from '@/lib/hrNotaStorage';
import { NotaStatus } from '@/types/hr-nota-v2.types';
import { openOsi } from '@/lib/navigation';

export function SalesApprovalsModule() {
  const osis = loadOsi();
  const pendingByOsi = osis.filter((osi) =>
    (osi.notaEvents || []).some((e) => e.status === NotaStatus.PENDIENTE_V)
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Ventas - Bandeja Aprobaciones</h1>
        <p className="text-slate-500">Extras pendientes por OSI</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            Pendientes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {pendingByOsi.length === 0 && (
            <p className="text-sm text-slate-500">No hay extras pendientes.</p>
          )}
          {pendingByOsi.map((osi) => {
            const pendingCount = (osi.notaEvents || []).filter((e) => e.status === NotaStatus.PENDIENTE_V).length;
            return (
              <div key={osi.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium text-slate-900">{osi.code}</p>
                  <p className="text-xs text-slate-500">{osi.clientName}</p>
                  <Badge variant="secondary">Pendientes: {pendingCount}</Badge>
                </div>
                <Button onClick={() => openOsi(osi.id, 'approvals')}>Abrir OSI (Aprobaciones)</Button>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
