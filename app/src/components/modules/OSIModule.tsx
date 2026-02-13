import { useMemo, useState, useEffect } from 'react';
import { ClipboardList, Plus, Save } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  getActiveOsiId,
  loadCatalogs,
  loadOsi,
  saveOsi,
  saveAllowances,
  setActiveOsiId,
} from '@/lib/hrNotaStorage';
import { approveEvent, isEligibleForEvent, registerExtraEvent, registerPlannedEvent, rejectEvent } from '@/lib/hrNotaV2';
import { loadUsers, normalizeUsers } from '@/lib/userStore';
import { loadCustomers } from '@/lib/customersStore';
import { queryHistory, upsertHistoryItem } from '@/lib/customerHistoryStore';
import { mockUsers } from '@/data/mockData';
import { NotaStatus } from '@/types/hr-nota-v2.types';
import type { AllowanceRecord, OsiNotaPlan } from '@/types/hr-nota-v2.types';
import type { OSI, User } from '@/types/osi.types';
import { toast } from 'sonner';

const SECTION_KEY = 'osi-plus.osi.activeSection';
const FIELD_ROLES = ['N', 'PA', 'PB', 'PC', 'PD', 'PE', 'PF'];

function mapOsiTypeToServiceType(osiType?: string): 'LOCAL' | 'INTERNATIONAL' | 'OTHER' {
  const t = String(osiType || '').toLowerCase();
  if (t === 'local') return 'LOCAL';
  if (t === 'international') return 'INTERNATIONAL';
  return 'OTHER';
}

export function OSIModule() {
  const catalogs = loadCatalogs();
  const seeded = useMemo(() => loadOsi(), []);
  const [osis, setOsis] = useState<OSI[]>(seeded);
  const initialActiveId = getActiveOsiId();
  const [selectedId, setSelectedId] = useState(initialActiveId || osis[0]?.id || '');
  const initialSection =
    typeof window !== 'undefined' ? (window.localStorage.getItem(SECTION_KEY) as 'plan' | 'allowances' | 'nota' | 'approvals' | null) : null;
  const [activeSection, setActiveSection] = useState<'plan' | 'allowances' | 'nota' | 'approvals'>(initialSection || 'plan');

  const storedUsers = loadUsers();
  const users = storedUsers.length ? storedUsers : normalizeUsers(mockUsers as User[]);
  const fieldUsers = users.filter((u) => FIELD_ROLES.includes(u.role));
  const [selectedUserId, setSelectedUserId] = useState(fieldUsers[0]?.id || '');
  const [actualQtyByEvent, setActualQtyByEvent] = useState<Record<string, number>>({});
  const [extraTypeId, setExtraTypeId] = useState(catalogs.notaEventTypes[0]?.id || '');
  const [extraQty, setExtraQty] = useState(1);
  const [extraReason, setExtraReason] = useState('');
  const [extraEvidence, setExtraEvidence] = useState('');

  const selectedOSI = osis.find((o) => o.id === selectedId);
  const selectedUser = fieldUsers.find((u) => u.id === selectedUserId);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SECTION_KEY, activeSection);
    }
  }, [activeSection]);

  useEffect(() => {
    setActualQtyByEvent({});
  }, [selectedId]);

  const updateAndPersist = (next: OSI) => {
    const prev = osis.find((o) => o.id === next.id);

    // Al cerrar un servicio (status -> completed), registrar historial del cliente
    if (prev?.status !== 'completed' && next.status === 'completed' && next.clientId) {
      const alreadyLogged = queryHistory({ customerId: next.clientId, kind: 'SERVICE_COMPLETED' }).some(
        (h) => h.osiId === next.id
      );

      if (!alreadyLogged) {
        const customer = loadCustomers().find((c) => c.id === next.clientId);
        upsertHistoryItem({
          id: crypto?.randomUUID ? crypto.randomUUID() : `svc_${next.id}_${Date.now()}`,
          schemaVersion: 1,
          occurredAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          customerId: next.clientId,
          kind: 'SERVICE_COMPLETED',
          type: 'SERVICE_COMPLETED',
          serviceType: mapOsiTypeToServiceType(next.type),
          projectId: next.projectId,
          osiId: next.id,
          billingTaxId: customer?.billingTaxId,
          billingName: customer?.billingLegalName || customer?.legalName,
          notes: 'Servicio completado sin incidentes',
        });
      }
    }

    const updated = osis.map((o) => (o.id === next.id ? next : o));
    setOsis(updated);
    saveOsi(updated);
  };

  const handleSelectOsi = (osiId: string) => {
    setSelectedId(osiId);
    setActiveOsiId(osiId);
  };

  const addPlanItem = () => {
    if (!selectedOSI) return;
    const firstType = catalogs.notaEventTypes[0];
    if (!firstType) return;
    const plan: OsiNotaPlan = selectedOSI.osiNotaPlan ?? {
      osiId: selectedOSI.id,
      createdBy: 'V',
      createdAt: new Date().toISOString(),
      items: [],
    };
    const next = {
      ...selectedOSI,
      osiNotaPlan: {
        ...plan,
        items: [
          ...plan.items,
          { eventTypeId: firstType.id, qtyEstimated: 1, unit: firstType.unit, baseRate: firstType.baseRate },
        ],
      },
    };
    updateAndPersist(next);
  };

  const updatePlanItem = (index: number, patch: Partial<OsiNotaPlan['items'][number]>) => {
    const plan = selectedOSI?.osiNotaPlan;
    if (!plan || !selectedOSI) return;
    const items = plan.items.map((item, i) => (i === index ? { ...item, ...patch } : item));
    updateAndPersist({ ...selectedOSI, osiNotaPlan: { ...plan, items } });
  };

  const addAllowance = () => {
    if (!selectedOSI) return;
    const type = catalogs.allowanceTypes[0];
    if (!type) return;
    const record: AllowanceRecord = {
      id: `ALW-${Date.now()}`,
      osiId: selectedOSI.id,
      allowanceTypeId: type.id,
      createdBy: 'V',
      createdAt: new Date().toISOString(),
      qty: 1,
      unit: type.unit,
      amount: type.baseRate,
      status: NotaStatus.REGISTRADO,
    };
    const allowances = [...(selectedOSI.allowances || []), record];
    updateAndPersist({ ...selectedOSI, allowances });
  };

  const updateAllowance = (index: number, patch: Partial<AllowanceRecord>) => {
    if (!selectedOSI) return;
    const allowances = (selectedOSI.allowances || []).map((a, i) => (i === index ? { ...a, ...patch } : a));
    updateAndPersist({ ...selectedOSI, allowances });
  };

  const handleSave = () => {
    saveOsi(osis);
    const allAllowances = osis.flatMap((o) => o.allowances || []);
    saveAllowances(allAllowances);
    toast.success('OSI actualizada');
  };

  const registerPlanEvent = (eventTypeId: string, qtyActual: number) => {
    if (!selectedOSI || !selectedUser) return;
    const planItem = selectedOSI.osiNotaPlan?.items.find((i) => i.eventTypeId === eventTypeId);
    const eventType = catalogs.notaEventTypes.find((t) => t.id === eventTypeId);
    if (!planItem || !eventType) return;
    if (!isEligibleForEvent(selectedUser, eventType, catalogs)) {
      toast.error('El usuario no cumple CB/SHAB para este evento');
      return;
    }
    const event = registerPlannedEvent(selectedOSI.id, planItem, eventType, selectedUser.id, qtyActual, 'D');
    const nextEvents = [...(selectedOSI.notaEvents || []), event];
    updateAndPersist({ ...selectedOSI, notaEvents: nextEvents });
    toast.success('Evento registrado');
  };

  const registerExtra = () => {
    if (!selectedOSI || !selectedUser) return;
    const eventType = catalogs.notaEventTypes.find((t) => t.id === extraTypeId);
    if (!eventType) return;
    if (!isEligibleForEvent(selectedUser, eventType, catalogs)) {
      toast.error('El usuario no cumple CB/SHAB para este evento');
      return;
    }
    try {
      const event = registerExtraEvent(
        selectedOSI.id,
        eventType,
        selectedUser.id,
        extraQty,
        'D',
        extraReason,
        extraEvidence || undefined
      );
      const nextEvents = [...(selectedOSI.notaEvents || []), event];
      updateAndPersist({ ...selectedOSI, notaEvents: nextEvents });
      setExtraReason('');
      setExtraEvidence('');
      toast.success('Extra enviado a Ventas');
    } catch (err: any) {
      toast.error(err?.message || 'No se pudo registrar el extra');
    }
  };

  const approveExtra = (eventId: string) => {
    if (!selectedOSI) return;
    const nextEvents = (selectedOSI.notaEvents || []).map((e) =>
      e.id === eventId ? approveEvent(e, 'V') : e
    );
    updateAndPersist({ ...selectedOSI, notaEvents: nextEvents });
  };

  const rejectExtra = (eventId: string) => {
    if (!selectedOSI) return;
    const nextEvents = (selectedOSI.notaEvents || []).map((e) =>
      e.id === eventId ? rejectEvent(e, 'V') : e
    );
    updateAndPersist({ ...selectedOSI, notaEvents: nextEvents });
  };

  const pendingExtras = (selectedOSI?.notaEvents || []).filter((e) => e.status === NotaStatus.PENDIENTE_V);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">OSi - Centro NOTA V2</h1>
          <p className="text-slate-500">Plan, Allowances, Registro y Aprobaciones</p>
        </div>
        <Button onClick={handleSave}>
          <Save className="h-4 w-4 mr-2" />
          Guardar
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              OSIs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {osis.map((osi) => (
              <button
                key={osi.id}
                onClick={() => handleSelectOsi(osi.id)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  selectedId === osi.id ? 'bg-blue-50 border-blue-300' : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{osi.code}</p>
                    <p className="text-xs text-slate-500">{osi.clientName}</p>
                  </div>
                  <Badge variant="outline">{osi.status}</Badge>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant={activeSection === 'plan' ? 'default' : 'outline'} onClick={() => setActiveSection('plan')}>
              Plan
            </Button>
            <Button variant={activeSection === 'allowances' ? 'default' : 'outline'} onClick={() => setActiveSection('allowances')}>
              Allowances
            </Button>
            <Button variant={activeSection === 'nota' ? 'default' : 'outline'} onClick={() => setActiveSection('nota')}>
              Registro
            </Button>
            <Button variant={activeSection === 'approvals' ? 'default' : 'outline'} onClick={() => setActiveSection('approvals')}>
              Aprobaciones
            </Button>
          </div>

          {activeSection === 'plan' && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Paquete NOTA (Plan)</CardTitle>
                <Button size="sm" variant="outline" onClick={addPlanItem}>
                  <Plus className="h-4 w-4 mr-1" />
                  Agregar
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedOSI?.osiNotaPlan?.items?.length ? (
                  selectedOSI.osiNotaPlan.items.map((item, index) => (
                    <div key={`${item.eventTypeId}-${index}`} className="grid grid-cols-1 md:grid-cols-5 gap-3">
                      <Select
                        value={item.eventTypeId}
                        onValueChange={(val) => {
                          const type = catalogs.notaEventTypes.find((t) => t.id === val);
                          if (!type) return;
                          updatePlanItem(index, { eventTypeId: type.id, unit: type.unit, baseRate: type.baseRate });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Evento" />
                        </SelectTrigger>
                        <SelectContent>
                          {catalogs.notaEventTypes.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min="1"
                        value={item.qtyEstimated}
                        onChange={(e) => updatePlanItem(index, { qtyEstimated: Number(e.target.value) || 1 })}
                      />
                      <Input value={item.unit} readOnly />
                      <Input value={item.baseRate} readOnly />
                      <Input
                        type="number"
                        min="0"
                        placeholder="Cap"
                        value={item.capAmount ?? ''}
                        onChange={(e) => {
                          const value = e.target.value.trim();
                          const parsed = value === '' ? undefined : Number(value);
                          updatePlanItem(index, { capAmount: Number.isNaN(parsed as number) ? undefined : parsed });
                        }}
                      />
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">Sin plan. Agrega eventos.</p>
                )}
              </CardContent>
            </Card>
          )}

          {activeSection === 'allowances' && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Dietas / Viáticos</CardTitle>
                <Button size="sm" variant="outline" onClick={addAllowance}>
                  <Plus className="h-4 w-4 mr-1" />
                  Agregar
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedOSI?.allowances?.length ? (
                  selectedOSI.allowances.map((allowance, index) => (
                    <div key={allowance.id} className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <Select
                        value={allowance.allowanceTypeId}
                        onValueChange={(val) => {
                          const type = catalogs.allowanceTypes.find((t) => t.id === val);
                          if (!type) return;
                          updateAllowance(index, { allowanceTypeId: type.id, unit: type.unit, amount: type.baseRate });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          {catalogs.allowanceTypes.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min="1"
                        value={allowance.qty}
                        onChange={(e) => updateAllowance(index, { qty: Number(e.target.value) || 1 })}
                      />
                      <Input value={allowance.unit} readOnly />
                      <Input value={allowance.amount} readOnly />
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">Sin dietas/viáticos.</p>
                )}
              </CardContent>
            </Card>
          )}

          {activeSection === 'nota' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Registro NOTA (Supervisor)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-700">Personal</label>
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {fieldUsers.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name} ({user.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedOSI?.osiNotaPlan?.items?.length ? (
                  selectedOSI.osiNotaPlan.items.map((item, idx) => {
                    const type = catalogs.notaEventTypes.find((t) => t.id === item.eventTypeId);
                    const actualQty = actualQtyByEvent[item.eventTypeId] ?? item.qtyEstimated;
                    return (
                      <div key={`${item.eventTypeId}-${idx}`} className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-3 border rounded-lg">
                        <div>
                          <p className="font-medium text-slate-900">{type?.name || item.eventTypeId}</p>
                          <p className="text-xs text-slate-500">Qty Est.: {item.qtyEstimated} {item.unit}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="1"
                            className="w-28"
                            value={actualQty}
                            onChange={(e) =>
                              setActualQtyByEvent((prev) => ({
                                ...prev,
                                [item.eventTypeId]: Number(e.target.value) || item.qtyEstimated,
                              }))
                            }
                          />
                          <Button size="sm" onClick={() => registerPlanEvent(item.eventTypeId, actualQty)}>
                            Registrar
                          </Button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-slate-500">Esta OSI no tiene plan.</p>
                )}

                <div className="pt-4 border-t space-y-3">
                  <Select value={extraTypeId} onValueChange={setExtraTypeId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Tipo de evento" />
                    </SelectTrigger>
                    <SelectContent>
                      {catalogs.notaEventTypes.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min="1"
                    value={extraQty}
                    onChange={(e) => setExtraQty(Number(e.target.value) || 1)}
                    placeholder="Cantidad"
                  />
                  <Input
                    value={extraReason}
                    onChange={(e) => setExtraReason(e.target.value)}
                    placeholder="Motivo del extra"
                  />
                  <Input
                    value={extraEvidence}
                    onChange={(e) => setExtraEvidence(e.target.value)}
                    placeholder="Evidencia (URL si aplica)"
                  />
                  <Button onClick={registerExtra}>Enviar Extra a Ventas</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {activeSection === 'approvals' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Aprobaciones de Extras (Ventas)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {pendingExtras.length === 0 && (
                  <p className="text-sm text-slate-500">No hay extras pendientes.</p>
                )}
                {pendingExtras.map((event) => {
                  const type = catalogs.notaEventTypes.find((t) => t.id === event.eventTypeId);
                  return (
                    <div key={event.id} className="flex items-start justify-between p-3 border rounded-lg">
                      <div className="space-y-1">
                        <p className="font-medium text-slate-900">{type?.name || event.eventTypeId}</p>
                        <p className="text-xs text-slate-500">Cantidad: {event.qtyActual} {event.unit}</p>
                        <p className="text-xs text-slate-500">Motivo: {event.reason || '-'}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => rejectExtra(event.id)}>Rechazar</Button>
                        <Button onClick={() => approveExtra(event.id)}>Aprobar</Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
