import { useEffect, useMemo, useState } from 'react';
import { Calendar as CalendarIcon, Download, Mail, MoreHorizontal, Save } from 'lucide-react';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { Resolver, SubmitHandler } from 'react-hook-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { toast } from 'sonner';
import {
  loadCatalogs,
  loadOsi,
  loadPayConfig,
  loadPayCycles,
  loadPayReports,
  saveCatalogs,
  saveOsi,
  savePayConfig,
  savePayCycles,
  savePayReports,
} from '@/lib/hrNotaStorage';
import { calcAmount, isEligibleForEvent } from '@/lib/hrNotaV2';
import { buildPayReport, ensureCyclesForMonth, recomputePayAssignments } from '@/lib/hrNotaPay';
import { loadUsers, normalizeUsers } from '@/lib/userStore';
import { formatCurrency } from '@/lib/formatters';
import { mockUsers } from '@/data/mockData';
import { DefaultMode, NotaStatus, UnitType } from '@/types/hr-nota-v2.types';
import type { NotaEvent, NotaEventType, NotaPayConfig, NotaPayCycle, NotaPayReport } from '@/types/hr-nota-v2.types';
import type { OSI, User, UserRole } from '@/types/osi.types';

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const CSV_HEADERS = ['Empleado', 'Nombre', 'OSI', 'Fecha', 'Detalle', 'Monto'];

const toCurrency = (amount: number) => formatCurrency(amount);

const SHAB_CATEGORIES = ['PA', 'PB', 'PC', 'PD', 'PF', 'PE'] as const;
const GENERAL_CATEGORY = 'GENERAL';

const CATEGORY_OPTIONS = [
  { value: 'PA', label: 'PA (Carpintero)' },
  { value: 'PB', label: 'PB (Mecánico)' },
  { value: 'PC', label: 'PC (Instalador)' },
  { value: 'PD', label: 'PD (Mantenimiento)' },
  { value: 'PF', label: 'PF (Electricista)' },
  { value: 'PE', label: 'PE (Supervisor Suplente)' },
  { value: 'N', label: 'N (Personal de Campo)' },
  { value: 'D', label: 'D (Supervisor)' },
  { value: 'E', label: 'E (Chofer)' },
  { value: 'C1', label: 'C1 (Despachador)' },
  { value: 'G', label: 'G (Portero)' },
  { value: 'GENERAL', label: 'GENERAL (Cualquier rol)' },
];

const CATEGORY_LABELS = new Map(CATEGORY_OPTIONS.map((option) => [option.value, option.label]));

const getMonthPrefix = (year: number, month: number) => `PAY-${year}-${String(month).padStart(2, '0')}-`;

const escapeCsv = (value: string) => {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

const tarifaSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(2),
  name: z.string().min(2),
  unit: z.nativeEnum(UnitType),
  baseRate: z.preprocess(
    (val) => (val === '' ? undefined : val),
    z.coerce.number().min(0)
  ),
  category: z.string().min(1),
  requiresEvidence: z.boolean().optional(),
  defaultMode: z.nativeEnum(DefaultMode),
  active: z.boolean(),
  requiredCbTypeId: z.string().optional().nullable(),
  minGradeValue: z.preprocess(
    (val) => (val === '' ? undefined : val),
    z.coerce.number().min(0).optional()
  ),
  requiredShabCode: z.string().optional().nullable(),
});

type TarifaFormValues = z.infer<typeof tarifaSchema>;

const emptyTarifa = (): TarifaFormValues => ({
  id: `NOTA-${Date.now()}`,
  code: 'NOTA',
  name: '',
  unit: UnitType.EVENTO,
  baseRate: 0,
  category: GENERAL_CATEGORY,
  requiresEvidence: false,
  defaultMode: DefaultMode.MANUAL,
  active: true,
  requiredCbTypeId: null,
  minGradeValue: undefined,
  requiredShabCode: null,
});

const resolveCategory = (item?: NotaEventType | null) => {
  if (!item) return GENERAL_CATEGORY;
  const legacy = (item as NotaEventType & { categoryShab?: string }).category || (item as { categoryShab?: string }).categoryShab;
  if (legacy) return legacy;
  if (item.requiredShabCode) return item.requiredShabCode;
  return GENERAL_CATEGORY;
};

const categoryLabel = (value: string) => CATEGORY_LABELS.get(value) || value;

const isShabCategory = (value: string) => SHAB_CATEGORIES.includes(value as typeof SHAB_CATEGORIES[number]);

const formatDateInput = (date: Date) => date.toISOString().slice(0, 10);


export function NOTAModule({ userRole = 'A' }: { userRole?: UserRole }) {
  const today = new Date();
  const [catalogs, setCatalogs] = useState(loadCatalogs());
  const [osis, setOsis] = useState<OSI[]>(loadOsi());
  const [payConfig, setPayConfig] = useState<NotaPayConfig>(loadPayConfig());
  const [payCycles, setPayCycles] = useState<NotaPayCycle[]>(loadPayCycles());
  const [payReports, setPayReports] = useState<NotaPayReport[]>(loadPayReports());
  const [activeTab, setActiveTab] = useState<'tarifas' | 'historial' | 'calendar'>('tarifas');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<'create' | 'edit' | 'view'>('edit');
  const [notaDialogOpen, setNotaDialogOpen] = useState(false);
  const [notaDialogMode, setNotaDialogMode] = useState<'create' | 'edit'>('create');
  const [notaForm, setNotaForm] = useState<{
    id?: string;
    osiId: string;
    employeeId: string;
    eventTypeId: string;
    qty: number;
    status: NotaStatus;
    effectiveDate: string;
    originalOsiId?: string;
  }>({
    osiId: '',
    employeeId: '',
    eventTypeId: '',
    qty: 1,
    status: NotaStatus.REGISTRADO,
    effectiveDate: formatDateInput(new Date()),
  });

  const storedUsers = loadUsers();
  const users = storedUsers.length ? storedUsers : normalizeUsers(mockUsers as User[]);
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const safeEventTypes = catalogs?.notaEventTypes || [];
  const eventTypeMap = useMemo(
    () => new Map(safeEventTypes.map((t) => [t.id, t])),
    [safeEventTypes]
  );

  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1);

  const notaEvents = useMemo(
    () =>
      osis.flatMap((osi) =>
        (osi.notaEvents || []).map((event) => ({
          ...event,
          osiCode: osi.code,
          projectId: osi.projectId,
          projectCode: osi.projectCode,
        }))
      ),
    [osis]
  );

  const selectedNotaEventType = eventTypeMap.get(notaForm.eventTypeId || '');
  const selectedNotaUser = userMap.get(notaForm.employeeId || '');
  const notaEligibility = selectedNotaUser && selectedNotaEventType
    ? isEligibleForEvent(selectedNotaUser, selectedNotaEventType, catalogs)
    : true;
  const notaAmountPreview =
    selectedNotaEventType && notaForm.qty > 0 ? calcAmount(selectedNotaEventType, notaForm.qty) : 0;

  const form = useForm<TarifaFormValues>({
    resolver: zodResolver(tarifaSchema) as Resolver<TarifaFormValues>,
    defaultValues: emptyTarifa(),
  });

  const filteredTarifas = safeEventTypes.filter((item) => {
    const matchesTerm =
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' || (statusFilter === 'active' ? item.active : !item.active);
    const resolvedCategory = resolveCategory(item);
    const matchesCategory = categoryFilter === 'all' || resolvedCategory === categoryFilter;
    return matchesTerm && matchesStatus && matchesCategory;
  });


  const openSheetFor = (item: NotaEventType, mode: 'edit' | 'view') => {
    setSheetMode(mode);
    const nextCategory = resolveCategory(item);
    form.reset({
      id: item.id || `NOTA-${Date.now()}`,
      code: item.code || 'NOTA',
      name: item.name || '',
      unit: item.unit || UnitType.EVENTO,
      baseRate: item.baseRate ?? 0,
      category: nextCategory,
      requiresEvidence: item.requiresEvidence ?? false,
      defaultMode: item.defaultMode || DefaultMode.MANUAL,
      active: item.active ?? true,
      requiredCbTypeId: item.requiredCbTypeId || null,
      minGradeValue: item.minGradeValue ?? undefined,
      requiredShabCode: item.requiredShabCode || null,
    });
    setSheetOpen(true);
  };

  const openCreateSheet = () => {
    setSheetMode('create');
    const nextCodeIndex = safeEventTypes.reduce((max, item) => {
      const raw = typeof item.code === 'string' ? item.code : '';
      const match = raw.match(/\d+/);
      if (!match) return max;
      const parsed = Number(match[0]);
      return Number.isNaN(parsed) ? max : Math.max(max, parsed);
    }, 0);
    const nextCode = `NOTA${String(nextCodeIndex + 1).padStart(2, '0')}`;
    // Reset form with default values and clear any previous errors
    form.reset({ ...emptyTarifa(), id: nextCode, code: nextCode, name: '' }, { keepErrors: false });
    setSheetOpen(true);
  };

  useEffect(() => {
    if (!sheetOpen) return;
    const currentCategory = form.getValues('category');
    if (!currentCategory) {
      form.setValue('category', GENERAL_CATEGORY, { shouldValidate: true });
    }
  }, [sheetOpen, form]);

  const openCreateNota = () => {
    const fallbackOsi = osis[0]?.id || '';
    const fallbackUser = users[0]?.id || '';
    const fallbackType = safeEventTypes[0]?.id || '';
    setNotaDialogMode('create');
    setNotaForm({
      osiId: fallbackOsi,
      employeeId: fallbackUser,
      eventTypeId: fallbackType,
      qty: 1,
      status: NotaStatus.REGISTRADO,
      effectiveDate: formatDateInput(new Date()),
    });
    setNotaDialogOpen(true);
  };

  const openEditNota = (event: NotaEvent) => {
    setNotaDialogMode('edit');
    setNotaForm({
      id: event.id,
      osiId: event.osiId,
      originalOsiId: event.osiId,
      employeeId: event.employeeId,
      eventTypeId: event.eventTypeId,
      qty: event.qtyActual,
      status: event.status,
      effectiveDate: formatDateInput(new Date(event.effectiveDate || new Date().toISOString())),
    });
    setNotaDialogOpen(true);
  };

  const handleSaveNota = () => {
    if (!notaForm.osiId || !notaForm.employeeId || !notaForm.eventTypeId) {
      toast.error('Completa OSI, empleado y tipo de nota');
      return;
    }
    if (!selectedNotaEventType) {
      toast.error('Selecciona un tipo de nota válido');
      return;
    }
    if (!selectedNotaUser) {
      toast.error('Selecciona un empleado válido');
      return;
    }
    if (!notaEligibility) {
      toast.error('El empleado no cumple con los requisitos de CB/SHAB');
      return;
    }
    if (notaForm.qty <= 0) {
      toast.error('La cantidad debe ser mayor a 0');
      return;
    }

    const now = new Date().toISOString();
    const effectiveDate = new Date(notaForm.effectiveDate).toISOString();
    const amountCalculated = calcAmount(selectedNotaEventType, notaForm.qty);

    if (notaDialogMode === 'create') {
      const nextEvent: NotaEvent = {
        id: `NE-${Date.now()}`,
        osiId: notaForm.osiId,
        eventTypeId: notaForm.eventTypeId,
        employeeId: notaForm.employeeId,
        createdBy: 'A',
        createdAt: now,
        registeredAt: now,
        qtyActual: notaForm.qty,
        unit: selectedNotaEventType.unit,
        amountCalculated,
        amount: amountCalculated,
        status: notaForm.status,
        isExtra: notaForm.status === NotaStatus.PENDIENTE_V,
        effectiveDate,
      };
      const updatedOsis = osis.map((osi) =>
        osi.id === notaForm.osiId
          ? { ...osi, notaEvents: [...(osi.notaEvents || []), nextEvent] }
          : osi
      );
      setOsis(updatedOsis);
      saveOsi(updatedOsis);
      toast.success('Nota registrada');
    } else if (notaForm.id) {
      const updatedOsis = osis.map((osi) => {
        if (osi.id !== notaForm.osiId) return osi;
        const nextEvents = (osi.notaEvents || []).map((event) => {
          if (event.id !== notaForm.id) return event;
          return {
            ...event,
            eventTypeId: notaForm.eventTypeId,
            employeeId: notaForm.employeeId,
            qtyActual: notaForm.qty,
            unit: selectedNotaEventType.unit,
            amountCalculated,
            amount: amountCalculated,
            status: notaForm.status,
            effectiveDate,
          };
        });
        return { ...osi, notaEvents: nextEvents };
      });
      setOsis(updatedOsis);
      saveOsi(updatedOsis);
      toast.success('Nota actualizada');
    }
    setNotaDialogOpen(false);
  };

  const persistCatalogs = (next: typeof catalogs) => {
    setCatalogs(next);
    saveCatalogs(next);
  };

  const handleSaveTarifa = (values: TarifaFormValues) => {
    const resolvedCategory = values.category || GENERAL_CATEGORY;
    const shabCode = isShabCategory(resolvedCategory) ? resolvedCategory : (values.requiredShabCode || undefined);
    const nextItem: NotaEventType = {
      id: values.id,
      code: values.code,
      name: values.name,
      unit: values.unit,
      baseRate: values.baseRate,
      active: values.active,
      category: resolvedCategory,
      requiredCbTypeId: values.requiredCbTypeId || undefined,
      minGradeValue: values.minGradeValue ?? undefined,
      requiredShabCode: shabCode,
      requiresEvidence: values.requiresEvidence ?? false,
      defaultMode: values.defaultMode,
    };
    const existingIndex = safeEventTypes.findIndex((t) => t.id === values.id);
    const nextTypes =
      existingIndex >= 0
        ? safeEventTypes.map((t, idx) => (idx === existingIndex ? nextItem : t))
        : [...safeEventTypes, nextItem];
    persistCatalogs({ ...catalogs, notaEventTypes: nextTypes });
    setSheetOpen(false);
    toast.success('Tarifa guardada');
  };

  const toggleTarifaActive = (item: NotaEventType) => {
    const nextTypes = safeEventTypes.map((t) =>
      t.id === item.id ? { ...t, active: !t.active } : t
    );
    persistCatalogs({ ...catalogs, notaEventTypes: nextTypes });
  };

  const refreshCalendarForMonth = (
    year: number,
    month: number,
    config: NotaPayConfig,
    osisInput: OSI[],
    cyclesInput: NotaPayCycle[],
    reportsInput: NotaPayReport[]
  ) => {
    const { cyclesForMonth, allCycles, changed: cyclesChanged } = ensureCyclesForMonth(
      year,
      month,
      config,
      cyclesInput
    );
    const { updatedOsis, changed: osisChanged } = recomputePayAssignments(
      config,
      osisInput,
      cyclesForMonth,
      year,
      month
    );

    let nextReports = [...reportsInput];
    cyclesForMonth.forEach((cycle) => {
      const report = buildPayReport(cycle, updatedOsis, users, catalogs, config);
      const existingIdx = nextReports.findIndex((r) => r.cycleId === cycle.id);
      if (existingIdx >= 0) {
        nextReports[existingIdx] = report;
      } else {
        nextReports.push(report);
      }
    });

    return {
      osis: updatedOsis,
      cycles: allCycles,
      reports: nextReports,
      cyclesForMonth,
      cyclesChanged,
      osisChanged,
    };
  };

  const recomputeCurrentMonth = () => {
    const result = refreshCalendarForMonth(
      selectedYear,
      selectedMonth,
      payConfig,
      osis,
      payCycles,
      payReports
    );
    if (result.cyclesChanged) {
      setPayCycles(result.cycles);
      savePayCycles(result.cycles);
    }
    if (result.osisChanged) {
      setOsis(result.osis);
      saveOsi(result.osis);
    }
    setPayReports(result.reports);
    savePayReports(result.reports);
  };

  useEffect(() => {
    if (activeTab !== 'calendar') return;
    recomputeCurrentMonth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedYear, selectedMonth]);

  const handleSaveConfig = () => {
    const nextConfig: NotaPayConfig = {
      ...payConfig,
      version: payConfig.version + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: 'A',
    };
    savePayConfig(nextConfig);
    setPayConfig(nextConfig);

    const monthsToRecompute: Array<{ year: number; month: number }> = [];
    const prev = new Date(selectedYear, selectedMonth - 2, 1);
    const curr = new Date(selectedYear, selectedMonth - 1, 1);
    const next = new Date(selectedYear, selectedMonth, 1);
    monthsToRecompute.push(
      { year: prev.getFullYear(), month: prev.getMonth() + 1 },
      { year: curr.getFullYear(), month: curr.getMonth() + 1 },
      { year: next.getFullYear(), month: next.getMonth() + 1 }
    );

    let nextOsis = osis;
    let nextCycles = payCycles;
    let nextReports = payReports;
    monthsToRecompute.forEach(({ year, month }) => {
      const result = refreshCalendarForMonth(year, month, nextConfig, nextOsis, nextCycles, nextReports);
      nextOsis = result.osis;
      nextCycles = result.cycles;
      nextReports = result.reports;
    });

    setOsis(nextOsis);
    setPayCycles(nextCycles);
    setPayReports(nextReports);
    saveOsi(nextOsis);
    savePayCycles(nextCycles);
    savePayReports(nextReports);
    toast.success('Configuración guardada y recalculada');
  };

  const cyclesForMonth = payCycles.filter((cycle) =>
    cycle.id.startsWith(getMonthPrefix(selectedYear, selectedMonth))
  );

  const findReportForCycle = (cycle: NotaPayCycle) =>
    payReports.find((r) => r.cycleId === cycle.id && r.configVersion === payConfig.version);

  const ensureReportForCycle = (cycle: NotaPayCycle) => {
    const existing = findReportForCycle(cycle);
    if (existing) return existing;
    const report = buildPayReport(cycle, osis, users, catalogs, payConfig);
    const nextReports = [...payReports.filter((r) => r.cycleId !== cycle.id), report];
    setPayReports(nextReports);
    savePayReports(nextReports);
    return report;
  };

  const downloadCsv = (cycle: NotaPayCycle) => {
    const report = ensureReportForCycle(cycle);
    const lines = [CSV_HEADERS.join(',')];
    report.rows.forEach((row) => {
      lines.push(
        [
          escapeCsv(row.employeeCode),
          escapeCsv(row.employeeName),
          escapeCsv(row.osiCode),
          escapeCsv(row.date),
          escapeCsv(row.detail),
          row.amount.toFixed(2),
        ].join(',')
      );
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nota_${cycle.id}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const prepareEmail = (cycle: NotaPayCycle) => {
    if (!payConfig.accountingEmail) {
      toast.error('Configura el email de contabilidad');
      return;
    }
    const report = ensureReportForCycle(cycle);
    const subject = `NOTA ${cycle.label} - Pago ${cycle.payDate}`;
    const body = [
      `Periodo: ${cycle.periodStart} a ${cycle.periodEnd}`,
      `Fecha de pago: ${cycle.payDate}`,
      `Total: ${toCurrency(report.grandTotal)}`,
      `Versión config: ${payConfig.version}`,
      'Adjunta el CSV descargado.',
    ].join('\n');
    window.location.href = `mailto:${payConfig.accountingEmail}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
  };

  const markCyclePaid = (cycle: NotaPayCycle) => {
    const paidAt = new Date().toISOString();
    const updatedCycles = payCycles.map((c) =>
      c.id === cycle.id ? { ...c, status: 'PAID' as const, paidAt, paidBy: 'A' } : c
    );
    const updatedOsis = osis.map((osi) => ({
      ...osi,
      notaEvents: (osi.notaEvents || []).map((event) => {
        if (event.payCycleId !== cycle.id) return event;
        if (event.status !== NotaStatus.REGISTRADO && event.status !== NotaStatus.APROBADO) return event;
        return {
          ...event,
          status: NotaStatus.LIQUIDADO,
          paidAt,
          paidBy: 'A',
        };
      }),
    }));
    setPayCycles(updatedCycles);
    setOsis(updatedOsis);
    savePayCycles(updatedCycles);
    saveOsi(updatedOsis);
    const report = buildPayReport({ ...cycle, status: 'PAID' as const, paidAt, paidBy: 'A' }, updatedOsis, users, catalogs, payConfig);
    const nextReports = [...payReports.filter((r) => r.cycleId !== cycle.id), report];
    setPayReports(nextReports);
    savePayReports(nextReports);
    toast.success('Ciclo marcado como pagado');
  };

  return (
    <div className="p-6 space-y-6">
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
        <TabsList>
          <TabsTrigger value="tarifas">Tarifas</TabsTrigger>
          <TabsTrigger value="historial">ESTADO NOTA</TabsTrigger>
          <TabsTrigger value="calendar">Calendario de Pagos</TabsTrigger>
        </TabsList>

        <TabsContent value="tarifas" className="space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">NOTA - Pagos / Tarifas</h1>
              <p className="text-slate-500">Listado de tarifas configuradas</p>
            </div>
            <div className="flex flex-col md:flex-row gap-2 md:items-center">
              <Input
                placeholder="Buscar por nombre o código"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full md:w-64"
              />
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las categorías</SelectItem>
                  {CATEGORY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="active">Activos</SelectItem>
                  <SelectItem value="inactive">Inactivos</SelectItem>
                </SelectContent>
              </Select>
              {userRole === 'A' && (
                <Button onClick={openCreateSheet}>+ Nueva Tarifa</Button>
              )}
            </div>
          </div>

          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Evidencia</TableHead>
                  <TableHead>Estado</TableHead>
                  {userRole === 'A' && <TableHead className="text-right">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTarifas.map((item) => {
                  const resolvedCategory = resolveCategory(item);
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.code}</TableCell>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>{categoryLabel(resolvedCategory)}</TableCell>
                      <TableCell>{item.unit}</TableCell>
                      <TableCell>{toCurrency(item.baseRate)}</TableCell>
                      <TableCell>{item.requiresEvidence ? 'Sí' : 'No'}</TableCell>
                      <TableCell>
                        <Badge variant={item.active ? 'default' : 'outline'}>
                          {item.active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      {userRole === 'A' && (
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openSheetFor(item, 'edit')}>Editar</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => toggleTarifaActive(item)}>
                                {item.active ? 'Desactivar' : 'Activar'}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="historial" className="space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">ESTADO NOTA</h1>
              <p className="text-slate-500">Registro y edición de notas</p>
            </div>
            <Button onClick={openCreateNota}>+ Nueva Nota</Button>
          </div>
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>OSI</TableHead>
                  <TableHead>Empleado</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Ciclo</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notaEvents.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-sm text-slate-500">
                      No hay eventos V2 registrados.
                    </TableCell>
                  </TableRow>
                )}
                {notaEvents.map((event) => {
                  const typeName = eventTypeMap.get(event.eventTypeId)?.name || event.eventTypeId;
                  const user = userMap.get(event.employeeId);
                  return (
                    <TableRow key={event.id}>
                      <TableCell>{event.effectiveDate}</TableCell>
                      <TableCell>{event.osiCode}</TableCell>
                      <TableCell>{user?.fullName || user?.name || event.employeeId}</TableCell>
                      <TableCell>{typeName}</TableCell>
                      <TableCell>{toCurrency(event.amountCalculated)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{event.status}</Badge>
                      </TableCell>
                      <TableCell>{event.payCycleId || '-'}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => openEditNota(event as NotaEvent)}>
                          Editar
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="calendar" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-lg">Configuración (Admin)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>Email Contabilidad</Label>
                  <Input
                    value={payConfig.accountingEmail}
                    onChange={(e) => setPayConfig({ ...payConfig, accountingEmail: e.target.value })}
                    placeholder="contabilidad@empresa.com"
                  />
                </div>
                <div>
                  <Label>Frecuencia</Label>
                  <Select
                    value={String(payConfig.frequency)}
                    onValueChange={(val) => {
                      const frequency = Number(val) as 1 | 2;
                      const cutRules =
                        frequency === 1
                          ? { cutStartDay: 1, cutEndDay: 30, payDay: 30 }
                          : {
                              cut1StartDay: 1,
                              cut1EndDay: 15,
                              pay1Day: 15,
                              cut2StartDay: 16,
                              cut2EndDay: 30,
                              pay2Day: 30,
                              carryDaysBeyondEnd: true,
                            };
                      setPayConfig({ ...payConfig, frequency, cutRules });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Frecuencia" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 vez/mes</SelectItem>
                      <SelectItem value="2">2 veces/mes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Política de Fecha</Label>
                  <Select
                    value={payConfig.datePolicy}
                    onValueChange={(val) =>
                      setPayConfig({ ...payConfig, datePolicy: val as NotaPayConfig['datePolicy'] })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Política" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="REGISTERED_AT">Por ejecución (registeredAt)</SelectItem>
                      <SelectItem value="APPROVED_AT">Por autorización (approvedAt)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {payConfig.frequency === 1 ? (
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label>Inicio</Label>
                      <Input
                        type="number"
                        value={(payConfig.cutRules as any).cutStartDay}
                        onChange={(e) =>
                          setPayConfig({
                            ...payConfig,
                            cutRules: { ...(payConfig.cutRules as any), cutStartDay: Number(e.target.value) || 1 },
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label>Fin</Label>
                      <Input
                        type="number"
                        value={(payConfig.cutRules as any).cutEndDay}
                        onChange={(e) =>
                          setPayConfig({
                            ...payConfig,
                            cutRules: { ...(payConfig.cutRules as any), cutEndDay: Number(e.target.value) || 30 },
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label>Pago</Label>
                      <Input
                        type="number"
                        value={(payConfig.cutRules as any).payDay}
                        onChange={(e) =>
                          setPayConfig({
                            ...payConfig,
                            cutRules: { ...(payConfig.cutRules as any), payDay: Number(e.target.value) || 30 },
                          })
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label>Cut 1 Inicio</Label>
                        <Input
                          type="number"
                          value={(payConfig.cutRules as any).cut1StartDay}
                          onChange={(e) =>
                            setPayConfig({
                              ...payConfig,
                              cutRules: { ...(payConfig.cutRules as any), cut1StartDay: Number(e.target.value) || 1 },
                            })
                          }
                        />
                      </div>
                      <div>
                        <Label>Cut 1 Fin</Label>
                        <Input
                          type="number"
                          value={(payConfig.cutRules as any).cut1EndDay}
                          onChange={(e) =>
                            setPayConfig({
                              ...payConfig,
                              cutRules: { ...(payConfig.cutRules as any), cut1EndDay: Number(e.target.value) || 15 },
                            })
                          }
                        />
                      </div>
                      <div>
                        <Label>Pago 1</Label>
                        <Input
                          type="number"
                          value={(payConfig.cutRules as any).pay1Day}
                          onChange={(e) =>
                            setPayConfig({
                              ...payConfig,
                              cutRules: { ...(payConfig.cutRules as any), pay1Day: Number(e.target.value) || 15 },
                            })
                          }
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label>Cut 2 Inicio</Label>
                        <Input
                          type="number"
                          value={(payConfig.cutRules as any).cut2StartDay}
                          onChange={(e) =>
                            setPayConfig({
                              ...payConfig,
                              cutRules: { ...(payConfig.cutRules as any), cut2StartDay: Number(e.target.value) || 16 },
                            })
                          }
                        />
                      </div>
                      <div>
                        <Label>Cut 2 Fin</Label>
                        <Input
                          type="number"
                          value={(payConfig.cutRules as any).cut2EndDay}
                          onChange={(e) =>
                            setPayConfig({
                              ...payConfig,
                              cutRules: { ...(payConfig.cutRules as any), cut2EndDay: Number(e.target.value) || 30 },
                            })
                          }
                        />
                      </div>
                      <div>
                        <Label>Pago 2</Label>
                        <Input
                          type="number"
                          value={(payConfig.cutRules as any).pay2Day}
                          onChange={(e) =>
                            setPayConfig({
                              ...payConfig,
                              cutRules: { ...(payConfig.cutRules as any), pay2Day: Number(e.target.value) || 30 },
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                )}

                <Button onClick={handleSaveConfig} className="w-full">
                  <Save className="h-4 w-4 mr-2" />
                  Guardar Config
                </Button>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5" />
                  Calendario de Pagos
                </CardTitle>
                <div className="flex gap-2">
                  <Select
                    value={String(selectedMonth)}
                    onValueChange={(val) => setSelectedMonth(Number(val))}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTH_NAMES.map((name, index) => (
                        <SelectItem key={name} value={String(index + 1)}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    className="w-24"
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value) || today.getFullYear())}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ciclo</TableHead>
                        <TableHead>Periodo</TableHead>
                        <TableHead>Pay date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cyclesForMonth.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-sm text-slate-500">
                            Sin ciclos para este mes.
                          </TableCell>
                        </TableRow>
                      )}
                      {cyclesForMonth.map((cycle) => {
                        const report = findReportForCycle(cycle) ?? buildPayReport(cycle, osis, users, catalogs, payConfig);
                        return (
                          <TableRow key={cycle.id}>
                            <TableCell className="font-medium">{cycle.label}</TableCell>
                            <TableCell>{cycle.periodStart} - {cycle.periodEnd}</TableCell>
                            <TableCell>{cycle.payDate}</TableCell>
                            <TableCell>
                              <Badge variant={cycle.status === 'PAID' ? 'default' : 'outline'}>
                                {cycle.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{toCurrency(report.grandTotal)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button variant="outline" size="sm" onClick={() => downloadCsv(cycle)}>
                                  <Download className="h-4 w-4 mr-1" />
                                  CSV
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => prepareEmail(cycle)}>
                                  <Mail className="h-4 w-4 mr-1" />
                                  Correo
                                </Button>
                                <Button size="sm" onClick={() => markCyclePaid(cycle)} disabled={cycle.status === 'PAID'}>
                                  Marcar pagado
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={notaDialogOpen} onOpenChange={setNotaDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{notaDialogMode === 'create' ? 'Nueva Nota' : 'Editar Nota'}</DialogTitle>
            <DialogDescription>Selecciona OSI, empleado y tipo de nota.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>OSI</Label>
                <Select
                  value={notaForm.osiId}
                  onValueChange={(val) => setNotaForm((prev) => ({ ...prev, osiId: val }))}
                  disabled={notaDialogMode === 'edit'}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona OSI" />
                  </SelectTrigger>
                  <SelectContent>
                    {osis.map((osi) => (
                      <SelectItem key={osi.id} value={osi.id}>
                        {osi.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Empleado</Label>
                <Select
                  value={notaForm.employeeId}
                  onValueChange={(val) => setNotaForm((prev) => ({ ...prev, employeeId: val }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona empleado" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.fullName || user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Tipo NOTA</Label>
                <Select
                  value={notaForm.eventTypeId}
                  onValueChange={(val) => setNotaForm((prev) => ({ ...prev, eventTypeId: val }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {safeEventTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Cantidad</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={notaForm.qty}
                  onWheel={(event) => (event.target as HTMLInputElement).blur()}
                  onChange={(e) =>
                    setNotaForm((prev) => ({
                      ...prev,
                      qty: Number(e.target.value) || 0,
                    }))
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Estado</Label>
                <Select
                  value={notaForm.status}
                  onValueChange={(val) => setNotaForm((prev) => ({ ...prev, status: val as NotaStatus }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NotaStatus.REGISTRADO}>REGISTRADO</SelectItem>
                    <SelectItem value={NotaStatus.PENDIENTE_V}>PENDIENTE_V</SelectItem>
                    <SelectItem value={NotaStatus.APROBADO}>APROBADO</SelectItem>
                    <SelectItem value={NotaStatus.LIQUIDADO}>LIQUIDADO</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Fecha</Label>
                <Input
                  type="date"
                  value={notaForm.effectiveDate}
                  onChange={(e) => setNotaForm((prev) => ({ ...prev, effectiveDate: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-sm text-slate-500">
              <span>Monto calculado</span>
              <span className="font-semibold text-slate-900">{toCurrency(notaAmountPreview)}</span>
            </div>

            {!notaEligibility && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                El empleado no cumple con los requisitos de CB/SHAB para este tipo de nota.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNotaDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveNota} disabled={!notaEligibility}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>
              {sheetMode === 'create' ? 'Nueva Tarifa' : sheetMode === 'view' ? 'Detalle de tarifa' : 'Editar tarifa'}
            </SheetTitle>
          </SheetHeader>
          <form
            className="space-y-4 py-4"
            onSubmit={form.handleSubmit(handleSaveTarifa as SubmitHandler<TarifaFormValues>)}
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Código</Label>
                <Input {...form.register('code')} disabled={sheetMode === 'view'} />
              </div>
              <div>
                <Label>Unidad</Label>
                <Select
                  value={form.watch('unit')}
                  onValueChange={(val) => form.setValue('unit', val as UnitType)}
                  disabled={sheetMode === 'view'}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(UnitType).map((unit) => (
                      <SelectItem key={unit} value={unit}>
                        {unit}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Nombre</Label>
              <Input {...form.register('name')} disabled={sheetMode === 'view'} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Monto</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  placeholder="0.00"
                  autoFocus={sheetMode !== 'view'}
                  onWheel={(event) => (event.target as HTMLInputElement).blur()}
                  className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  {...form.register('baseRate')}
                  disabled={sheetMode === 'view'}
                  required
                />
              </div>
              <div>
                <Label>Modo</Label>
                <Select
                  value={form.watch('defaultMode')}
                  onValueChange={(val) => form.setValue('defaultMode', val as DefaultMode)}
                  disabled={sheetMode === 'view'}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DefaultMode.MANUAL}>EXTRA</SelectItem>
                    <SelectItem value={DefaultMode.AUTO}>PACKAGE</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Categoría</Label>
                <Select
                  value={form.watch('category') || GENERAL_CATEGORY}
                  onValueChange={(val) => {
                    form.setValue('category', val);
                    if (isShabCategory(val)) {
                      form.setValue('requiredShabCode', val);
                    } else {
                      form.setValue('requiredShabCode', '');
                    }
                  }}
                  disabled={sheetMode === 'view'}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>CB requerido</Label>
                <Select
                  value={form.watch('requiredCbTypeId') || 'null'}
                  onValueChange={(val) => form.setValue('requiredCbTypeId', val === 'null' ? null : val)}
                  disabled={sheetMode === 'view'}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Ninguno" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="null">Ninguno</SelectItem>
                    {(catalogs.cbTypes || []).map((cb) => (
                      <SelectItem key={cb.id} value={cb.id}>
                        {cb.code} - {cb.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Evidencia</Label>
                <Select
                  value={form.watch('requiresEvidence') ? 'yes' : 'no'}
                  onValueChange={(val) => form.setValue('requiresEvidence', val === 'yes')}
                  disabled={sheetMode === 'view'}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">No</SelectItem>
                    <SelectItem value="yes">Sí</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Grade mínima</Label>
                <Input
                  type="number"
                  min="0"
                  max="3"
                  {...form.register('minGradeValue')}
                  disabled={sheetMode === 'view'}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Estado</Label>
                <Select
                  value={form.watch('active') ? 'active' : 'inactive'}
                  onValueChange={(val) => form.setValue('active', val === 'active')}
                  disabled={sheetMode === 'view'}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Activo</SelectItem>
                    <SelectItem value="inactive">Inactivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <SheetFooter>
              {sheetMode !== 'view' && (
                <Button type="submit">Guardar</Button>
              )}
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
