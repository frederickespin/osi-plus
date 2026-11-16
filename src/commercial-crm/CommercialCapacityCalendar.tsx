import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, addWeeks, endOfWeek, format, formatISO, isSameDay, parseISO, startOfWeek, subWeeks } from "date-fns";
import { es } from "date-fns/locale";
import { AlertTriangle, CalendarCheck2, ChevronLeft, ChevronRight, Clock3, RefreshCw, Sparkles, UsersRound } from "lucide-react";
import { FleetApi } from "@/admin-fleet/api";
import { NumericInput } from "@/components/ui/numeric-input";
import { CrmPipelineReadApi, CrmPipelineReadError } from "@/crm-relational/readApi";
import type { CrmPipelineCase } from "@/crm-relational/types";
import { getMembershipRef } from "@/lib/sessionStore";
import { createPersonnelPoliciesApi, type PersonnelPoliciesWorkspace } from "@/personnel-policies/api";
import {
  calculateDayCapacity,
  deriveSmartPlans,
  loadCalendarOverrides,
  nextAvailableDate,
  saveCalendarOverride,
  SMART_CALENDAR_LABELS,
  type CalendarPlanOverride,
  type CalendarPlanState,
  type DayCapacity,
  type SmartServicePlan,
} from "./smartCalendar";

type Props = Readonly<{
  authorization?: string;
  onNavigate(pathname: string): void;
  onUnauthorized(): void;
}>;

const STATE_STYLE: Readonly<Record<CalendarPlanState, string>> = Object.freeze({
  ESTIMATED: "bg-slate-100 text-slate-700",
  TENTATIVE: "bg-sky-50 text-sky-700",
  PRE_RESERVED: "bg-amber-50 text-amber-800",
  CONFIRMED: "bg-emerald-50 text-emerald-700",
  LOCKED: "bg-indigo-50 text-indigo-700",
  PAUSED: "bg-slate-100 text-slate-500",
});
const DAY_STYLE = Object.freeze({
  AVAILABLE: "border-emerald-200 bg-emerald-50/35",
  LIMITED: "border-amber-300 bg-amber-50/50",
  OVERLOADED: "border-red-300 bg-red-50/60",
});
const CAPACITY_BADGE = Object.freeze({
  AVAILABLE: "bg-emerald-100 text-emerald-700",
  LIMITED: "bg-amber-100 text-amber-800",
  OVERLOADED: "bg-red-100 text-red-700",
});
const CAPACITY_BAR = Object.freeze({ AVAILABLE: "bg-emerald-500", LIMITED: "bg-amber-500", OVERLOADED: "bg-red-500" });
const FIELD = "mt-1 h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm outline-none focus:border-[#0070a8] focus:ring-1 focus:ring-[#0070a8]";
const isoDate = (date: Date) => formatISO(date, { representation: "date" });
type CalendarView = "DAY" | "WEEK";

function availablePersonnel(date: string, workspace: PersonnelPoliciesWorkspace | null) {
  if (!workspace) return 8;
  const at = parseISO(`${date}T12:00:00`).getTime();
  return workspace.personnel.filter((profile) => {
    if (!/active/i.test(profile.employmentStatus) || !/available/i.test(profile.availabilityStatus)) return false;
    return !profile.overrides.some((override) => /unavailable/i.test(override.kind) && Date.parse(override.startsAt) <= at && at < Date.parse(override.endsAt));
  }).length;
}

function stateNote(plan: SmartServicePlan) {
  if (plan.confidence === "APPROVED") return "Recursos calculados desde la versión aprobada.";
  if (plan.confidence === "QUOTE") return "La negociación puede modificar esta carga.";
  if (plan.confidence === "SURVEY") return "Estimación basada en el levantamiento disponible.";
  return "Estimación preliminar; falta Survey, mini survey o listado.";
}

function capacityLabel(capacity: DayCapacity) {
  if (capacity.status === "AVAILABLE") return "Disponible";
  if (capacity.status === "LIMITED") return "Capacidad media";
  return capacity.utilizationPercent > 100 || capacity.vehiclesRequired > capacity.vehiclesAvailable ? "Sobrecargado" : "Capacidad crítica";
}

export default function CommercialCapacityCalendar({ authorization, onNavigate, onUnauthorized }: Props) {
  const api = useMemo(() => new CrmPipelineReadApi({ tokenProvider: () => authorization || null }), [authorization]);
  const fleetApi = useMemo(() => new FleetApi(() => authorization || null, globalThis.fetch.bind(globalThis), getMembershipRef), [authorization]);
  const personnelApi = useMemo(() => createPersonnelPoliciesApi(authorization), [authorization]);
  const today = useMemo(() => new Date(), []);
  const planningAnchor = useMemo(() => startOfWeek(today, { weekStartsOn: 1 }), [today]);
  const [weekStart, setWeekStart] = useState(planningAnchor);
  const [selectedDate, setSelectedDate] = useState(isoDate(today));
  const [view, setView] = useState<CalendarView>("WEEK");
  const [cases, setCases] = useState<readonly CrmPipelineCase[]>([]);
  const [overrides, setOverrides] = useState(() => loadCalendarOverrides());
  const [personnel, setPersonnel] = useState<PersonnelPoliciesWorkspace | null>(null);
  const [availableVehicles, setAvailableVehicles] = useState(3);
  const [resourceSource, setResourceSource] = useState("Base provisional del Preview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCaseRef, setSelectedCaseRef] = useState<string | null>(null);
  const [draft, setDraft] = useState<CalendarPlanOverride>({});

  const requestWorkspace = useCallback(() => Promise.allSettled([
      api.list({ page: 1, pageSize: 100 }),
      personnelApi.workspace(),
      fleetApi.list({ page: 1, pageSize: 100, search: "", vehicleType: "", operationalStatus: "AVAILABLE" }),
    ]), [api, fleetApi, personnelApi]);
  const applyWorkspace = useCallback((results: Awaited<ReturnType<typeof requestWorkspace>>) => {
    const [pipelineResult, personnelResult, fleetResult] = results;
    if (pipelineResult.status === "rejected") {
      if (pipelineResult.reason instanceof CrmPipelineReadError && pipelineResult.reason.status === 401) onUnauthorized();
      else setError("No fue posible cargar los servicios del calendario.");
      return;
    }
    setCases(pipelineResult.value.data);
    if (personnelResult.status === "fulfilled") setPersonnel(personnelResult.value);
    if (fleetResult.status === "fulfilled") setAvailableVehicles(fleetResult.value.data.filter((vehicle) => vehicle.availableForCalculation && vehicle.operationalStatus === "AVAILABLE").length);
    if (personnelResult.status === "fulfilled" && fleetResult.status === "fulfilled") setResourceSource("Personal y flota disponibles");
    else if (personnelResult.status === "fulfilled") setResourceSource("Personal disponible · flota provisional");
    else if (fleetResult.status === "fulfilled") setResourceSource("Flota disponible · personal provisional");
  }, [onUnauthorized]);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    applyWorkspace(await requestWorkspace());
    setLoading(false);
  }, [applyWorkspace, requestWorkspace]);

  useEffect(() => {
    let active = true;
    void requestWorkspace().then((results) => {
      if (!active) return;
      applyWorkspace(results);
      setLoading(false);
    });
    return () => { active = false; };
  }, [applyWorkspace, requestWorkspace]);

  const plans = useMemo(() => deriveSmartPlans(cases, overrides, planningAnchor), [cases, overrides, planningAnchor]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const dayCapacities = useMemo(() => days.map((day) => {
    const date = isoDate(day);
    return calculateDayCapacity(date, plans, availablePersonnel(date, personnel), availableVehicles);
  }), [availableVehicles, days, personnel, plans]);
  const selectedCapacity = useMemo(() => calculateDayCapacity(selectedDate, plans, availablePersonnel(selectedDate, personnel), availableVehicles), [availableVehicles, personnel, plans, selectedDate]);
  const selectedPlan = useMemo(() => plans.find((plan) => plan.caseRef === selectedCaseRef) || null, [plans, selectedCaseRef]);
  const rangeLabel = view === "WEEK" ? `${format(weekStart, "d MMM", { locale: es })} – ${format(endOfWeek(weekStart, { weekStartsOn: 1 }), "d MMM yyyy", { locale: es })}` : format(parseISO(selectedDate), "EEEE d 'de' MMMM yyyy", { locale: es });
  const activePlans = plans.filter((plan) => plan.state !== "PAUSED");
  const overloadedDays = dayCapacities.filter((day) => day.status === "OVERLOADED").length;
  const totalWeightedHours = dayCapacities.reduce((sum, day) => sum + day.weightedPersonHours, 0);

  const openPlan = (plan: SmartServicePlan) => {
    setSelectedCaseRef(plan.caseRef);
    setSelectedDate(plan.plannedDate);
    setDraft({ plannedDate: plan.plannedDate, crew: plan.crew, durationHours: plan.durationHours, vehicles: plan.vehicles, state: plan.state });
  };
  const updateDraft = <K extends keyof CalendarPlanOverride>(key: K, value: CalendarPlanOverride[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const savePlan = () => {
    if (!selectedPlan || !draft.plannedDate || !draft.crew || !draft.durationHours || !draft.vehicles || !draft.state) return;
    const next = saveCalendarOverride(selectedPlan.caseRef, draft);
    setOverrides(next);
    setSelectedDate(draft.plannedDate);
  };
  const suggestDate = () => {
    if (!selectedPlan) return;
    const date = nextAvailableDate(selectedPlan, plans, (candidate) => availablePersonnel(candidate, personnel), availableVehicles, today);
    if (date) updateDraft("plannedDate", date);
  };
  const goToday = () => {
    setWeekStart(planningAnchor);
    setSelectedDate(isoDate(today));
    setSelectedCaseRef(null);
  };
  const movePeriod = (direction: -1 | 1) => {
    setSelectedCaseRef(null);
    if (view === "WEEK") {
      setWeekStart((value) => direction < 0 ? subWeeks(value, 1) : addWeeks(value, 1));
      return;
    }
    const nextDate = addDays(parseISO(selectedDate), direction);
    setSelectedDate(isoDate(nextDate));
    setWeekStart(startOfWeek(nextDate, { weekStartsOn: 1 }));
  };

  const planEditor = <aside className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
    {!selectedPlan ? <div className="grid min-h-48 place-items-center text-center"><div><Sparkles className="mx-auto h-6 w-6 text-[#0070a8]" /><h2 className="mt-2 text-sm font-black text-[#003366]">Seleccione un servicio</h2><p className="mt-1 text-xs leading-5 text-slate-500">Podrá revisar su cálculo y ajustar fecha, personal, duración o vehículos.</p></div></div> : <div className="space-y-3"><div><p className="text-[10px] font-black uppercase tracking-wide text-[#0070a8]">{selectedPlan.caseCode}</p><h2 className="text-sm font-black text-slate-900">{selectedPlan.clientName}</h2><p className="text-[11px] text-slate-500">{stateNote(selectedPlan)}</p></div><div className="grid grid-cols-2 gap-2"><label className="col-span-2 text-[11px] font-bold text-slate-600">Fecha prevista<input type="date" value={draft.plannedDate || ""} onChange={(event) => updateDraft("plannedDate", event.target.value)} className={FIELD} /></label><label className="text-[11px] font-bold text-slate-600">Personal<NumericInput min="1" max="99" step="1" value={draft.crew || ""} onChange={(event) => updateDraft("crew", Number(event.target.value))} className={FIELD} /></label><label className="text-[11px] font-bold text-slate-600">Duración (h)<NumericInput min="0.5" max="72" step="0.5" value={draft.durationHours || ""} onChange={(event) => updateDraft("durationHours", Number(event.target.value))} className={FIELD} /></label><label className="text-[11px] font-bold text-slate-600">Vehículos<NumericInput min="1" max="20" step="1" value={draft.vehicles || ""} onChange={(event) => updateDraft("vehicles", Number(event.target.value))} className={FIELD} /></label><label className="text-[11px] font-bold text-slate-600">Reserva<select value={draft.state || ""} onChange={(event) => updateDraft("state", event.target.value as CalendarPlanState)} className={FIELD}>{Object.entries(SMART_CALENDAR_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><div className="rounded bg-slate-50 p-2 text-[11px] leading-5 text-slate-600"><p><strong>Origen:</strong> {selectedPlan.origin}</p><p><strong>Destino:</strong> {selectedPlan.destination}</p></div><div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={suggestDate} className="h-9 rounded border border-sky-200 px-3 text-xs font-bold text-[#0070a8]">Sugerir fecha</button><button type="button" onClick={savePlan} className="h-9 rounded bg-[#003366] px-3 text-xs font-bold text-white">Guardar planificación</button></div><button type="button" onClick={() => onNavigate(`/commercial/cases/${selectedPlan.caseRef}`)} className="w-full text-center text-xs font-bold text-[#0070a8] hover:underline">Abrir ficha del caso</button></div>}
  </aside>;

  return <section className="flex h-full min-h-0 flex-col overflow-hidden bg-[#f4f7fb]" data-testid="smart-service-calendar">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-white px-4 py-3 sm:px-5">
      <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-[#0070a8]">Planificación operativa</p><h1 className="text-xl font-black text-[#003366]">Calendario inteligente</h1><p className="text-xs text-slate-500">La carga cambia con el volumen, la etapa del caso y los recursos disponibles.</p></div>
      <div className="flex items-center gap-2"><div className="flex rounded-lg bg-slate-100 p-1" aria-label="Vista del calendario"><button type="button" aria-pressed={view === "DAY"} onClick={() => setView("DAY")} className={`h-8 rounded-md px-3 text-xs font-bold ${view === "DAY" ? "bg-white text-[#003366] shadow-sm" : "text-slate-500"}`}>Día</button><button type="button" aria-pressed={view === "WEEK"} onClick={() => setView("WEEK")} className={`h-8 rounded-md px-3 text-xs font-bold ${view === "WEEK" ? "bg-white text-[#003366] shadow-sm" : "text-slate-500"}`}>Semana</button></div><button type="button" onClick={() => void load()} disabled={loading} aria-label="Actualizar calendario" className="grid h-9 w-9 place-items-center rounded border border-slate-300 bg-white text-[#003366] disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button></div>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
      {error && <div role="alert" className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Summary icon={CalendarCheck2} label="Servicios visibles" value={String(activePlans.length)} note="Estimados y reservados" />
        <Summary icon={Clock3} label="Carga ponderada" value={`${Math.round(totalWeightedHours)} h-persona`} note="Según nivel de certeza" />
        <Summary icon={UsersRound} label="Personal hoy" value={String(availablePersonnel(selectedDate, personnel))} note={resourceSource} />
        <Summary icon={AlertTriangle} label="Días en zona roja" value={String(overloadedDays)} note={overloadedDays ? "80% o más de capacidad" : "Sin días críticos esta semana"} danger={overloadedDays > 0} />
      </div>

      <div className="mt-3 rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
          <div className="flex items-center gap-1"><button type="button" aria-label={view === "WEEK" ? "Semana anterior" : "Día anterior"} onClick={() => movePeriod(-1)} className="grid h-8 w-8 place-items-center rounded border"><ChevronLeft className="h-4 w-4" /></button><button type="button" onClick={goToday} className="h-8 rounded border px-3 text-xs font-bold text-[#003366]">Hoy</button><button type="button" aria-label={view === "WEEK" ? "Semana siguiente" : "Día siguiente"} onClick={() => movePeriod(1)} className="grid h-8 w-8 place-items-center rounded border"><ChevronRight className="h-4 w-4" /></button></div>
          <strong className="text-sm capitalize text-[#003366]">{rangeLabel}</strong>
          <div className="flex flex-wrap items-center gap-1 text-[10px] font-bold"><span className="rounded bg-emerald-100 px-2 py-1 text-emerald-700">0–49%</span><span className="rounded bg-amber-100 px-2 py-1 text-amber-800">50–79%</span><span className="rounded bg-red-100 px-2 py-1 text-red-700">80% o más</span><span className="rounded bg-slate-100 px-2 py-1 text-slate-600">Reserva 15%</span></div>
        </div>
        {view === "WEEK" ? <div className="grid gap-px bg-slate-200 sm:grid-cols-2 lg:grid-cols-7">
          {dayCapacities.map((capacity, index) => {
            const day = days[index];
            const selected = capacity.date === selectedDate;
            return <article key={capacity.date} className={`min-h-48 border ${DAY_STYLE[capacity.status]} ${selected ? "ring-2 ring-inset ring-[#0070a8]" : ""}`}>
              <button type="button" onClick={() => { setSelectedDate(capacity.date); setSelectedCaseRef(null); setView("DAY"); }} aria-label={`${format(day, "EEEE d 'de' MMMM", { locale: es })}: ${capacity.plans.length} servicios, ${capacity.utilizationPercent}% de capacidad`} className="w-full p-2 text-left">
                <div className="flex items-start justify-between gap-1"><span><strong className="block text-xs capitalize text-slate-800">{format(day, "EEE", { locale: es })}</strong><span className={`text-lg font-black ${isSameDay(day, today) ? "text-[#0070a8]" : "text-slate-800"}`}>{format(day, "d")}</span></span><span className={`rounded px-1.5 py-0.5 text-[10px] font-black ${CAPACITY_BADGE[capacity.status]}`}>{Math.min(capacity.utilizationPercent, 999)}%</span></div>
                <div className="mt-2 h-1.5 overflow-hidden rounded bg-white/80"><span className={`block h-full ${CAPACITY_BAR[capacity.status]}`} style={{ width: `${Math.min(100, capacity.utilizationPercent)}%` }} /></div>
                <p className="mt-2 text-[10px] text-slate-600">{Math.round(capacity.weightedPersonHours)}/{Math.round(capacity.personHoursAvailable)} h-persona</p><p className="text-[10px] text-slate-600">{capacity.vehiclesRequired}/{capacity.vehiclesAvailable} vehículos · {capacity.plans.length} servicios</p>
              </button>
              <div className="space-y-1 border-t border-white/80 p-1.5">{capacity.plans.length === 0 ? <p className="py-2 text-center text-[10px] text-slate-400">Sin servicios</p> : capacity.plans.slice(0, 3).map((plan) => <button key={plan.caseRef} type="button" onClick={() => openPlan(plan)} className={`w-full rounded border border-white/90 bg-white/80 px-1.5 py-1 text-left hover:bg-white ${selectedCaseRef === plan.caseRef ? "ring-1 ring-[#0070a8]" : ""}`}><strong className="block truncate text-[10px] text-[#003366]">{plan.caseCode}</strong><span className="block truncate text-[9px] text-slate-600">{plan.clientName}</span></button>)}{capacity.plans.length > 3 && <button type="button" onClick={() => { setSelectedDate(capacity.date); setView("DAY"); }} className="w-full text-center text-[9px] font-bold text-[#0070a8]">+{capacity.plans.length - 3} servicios</button>}</div>
            </article>;
          })}
        </div> : <div className={`border p-3 ${DAY_STYLE[selectedCapacity.status]}`}>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Capacidad del día</p><strong className="text-lg capitalize text-[#003366]">{format(parseISO(selectedDate), "EEEE d 'de' MMMM", { locale: es })}</strong><p className="text-xs text-slate-600">{Math.round(selectedCapacity.weightedPersonHours)}/{Math.round(selectedCapacity.personHoursAvailable)} h-persona · {selectedCapacity.vehiclesRequired}/{selectedCapacity.vehiclesAvailable} vehículos · {selectedCapacity.plans.length} servicios</p></div><div className="min-w-40"><div className="flex items-center justify-between gap-2"><span className={`rounded px-2 py-1 text-[10px] font-black ${CAPACITY_BADGE[selectedCapacity.status]}`}>{capacityLabel(selectedCapacity)}</span><strong className="text-lg text-slate-800">{selectedCapacity.utilizationPercent}%</strong></div><div className="mt-2 h-2 overflow-hidden rounded bg-white/80"><span className={`block h-full ${CAPACITY_BAR[selectedCapacity.status]}`} style={{ width: `${Math.min(100, selectedCapacity.utilizationPercent)}%` }} /></div></div></div>
        </div>}
      </div>

      {view === "DAY" ? <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2"><div><h2 className="text-sm font-black text-[#003366]">Servicios del día</h2><p className="text-[11px] text-slate-500">Seleccione uno para revisar o ajustar su planificación.</p></div><span className={`rounded px-2 py-1 text-[10px] font-black ${CAPACITY_BADGE[selectedCapacity.status]}`}>{capacityLabel(selectedCapacity)}</span></div>
          {selectedCapacity.plans.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No hay servicios previstos para este día.</p> : <div className="divide-y">{selectedCapacity.plans.map((plan) => <button key={plan.caseRef} type="button" onClick={() => openPlan(plan)} className={`grid w-full gap-2 px-3 py-2 text-left hover:bg-sky-50 sm:grid-cols-[minmax(0,1fr)_auto_auto] ${selectedCaseRef === plan.caseRef ? "bg-sky-50" : ""}`}><span className="min-w-0"><strong className="block truncate text-sm text-slate-900">{plan.caseCode} · {plan.clientName}</strong><span className="block truncate text-[11px] text-slate-500">{plan.serviceType} · {plan.volumeM3.toFixed(1)} m³ · {plan.sourceLabel}</span></span><span className="text-[11px] font-semibold text-slate-600">{plan.crew} personas × {plan.durationHours} h<br />{plan.vehicles} vehículo(s)</span><span className={`self-center rounded px-2 py-1 text-[10px] font-bold ${STATE_STYLE[plan.state]}`}>{SMART_CALENDAR_LABELS[plan.state]}</span></button>)}</div>}
        </section>
        {planEditor}
      </div> : selectedPlan ? <div className="ml-auto mt-3 max-w-md">{planEditor}</div> : null}
    </div>
  </section>;
}

function Summary({ icon: Icon, label, value, note, danger = false }: Readonly<{ icon: typeof CalendarCheck2; label: string; value: string; note: string; danger?: boolean }>) {
  return <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${danger ? "bg-red-50 text-red-700" : "bg-sky-50 text-[#0070a8]"}`}><Icon className="h-4 w-4" /></span><span className="min-w-0"><span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</span><strong className={`block truncate text-base ${danger ? "text-red-700" : "text-[#003366]"}`}>{value}</strong><span className="block truncate text-[10px] text-slate-500">{note}</span></span></div>;
}
