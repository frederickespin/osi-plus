import { addDays, formatISO, startOfWeek } from "date-fns";
import type { CrmPipelineCase, PipelineCaseStatus } from "@/crm-relational/types";

export type CalendarPlanState = "ESTIMATED" | "TENTATIVE" | "PRE_RESERVED" | "CONFIRMED" | "LOCKED" | "PAUSED";
export type CalendarConfidence = "REQUEST" | "SURVEY" | "QUOTE" | "APPROVED";

export type CalendarPlanOverride = Readonly<{
  plannedDate?: string;
  crew?: number;
  durationHours?: number;
  vehicles?: number;
  state?: CalendarPlanState;
}>;

export type SmartServicePlan = Readonly<{
  caseRef: string;
  caseCode: string;
  clientName: string;
  serviceType: string;
  mode: CrmPipelineCase["mode"];
  plannedDate: string;
  crew: number;
  durationHours: number;
  vehicles: number;
  volumeM3: number;
  state: CalendarPlanState;
  confidence: CalendarConfidence;
  sourceLabel: string;
  origin: string;
  destination: string;
}>;

export type DayCapacity = Readonly<{
  date: string;
  plans: readonly SmartServicePlan[];
  weightedPersonHours: number;
  confirmedPersonHours: number;
  personHoursAvailable: number;
  vehiclesRequired: number;
  vehiclesAvailable: number;
  utilizationPercent: number;
  status: "AVAILABLE" | "LIMITED" | "OVERLOADED";
}>;

export type CarryoverCapacityViolation = Readonly<{
  sourceDate: string;
  protectedDate: string;
  protectedUtilizationPercent: number;
}>;

const STORAGE_KEY = "osi-plus.preview.smart-calendar.v1";
const STATE_WEIGHTS: Readonly<Record<CalendarPlanState, number>> = Object.freeze({
  ESTIMATED: 0.25,
  TENTATIVE: 0.6,
  PRE_RESERVED: 0.85,
  CONFIRMED: 1,
  LOCKED: 1,
  PAUSED: 0,
});
const SURVEY = new Set<PipelineCaseStatus>(["SURVEY_PLANNING", "SURVEY_SCHEDULED", "SURVEY_COMPLETED", "CRATING_ESTIMATE_PENDING"]);
const QUOTE = new Set<PipelineCaseStatus>(["PRICING_IN_PROGRESS", "QUOTE_DRAFT", "INTERNAL_REVIEW", "QUOTE_SENT", "NEGOTIATION"]);

const isoDate = (date: Date) => formatISO(date, { representation: "date" });
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

function stateFor(status: PipelineCaseStatus): CalendarPlanState {
  if (status === "OPS_HANDOFF") return "LOCKED";
  if (["WON", "APPROVED", "CHANGE_CONTROL"].includes(status)) return "CONFIRMED";
  if (QUOTE.has(status)) return "PRE_RESERVED";
  if (SURVEY.has(status)) return "TENTATIVE";
  return "ESTIMATED";
}

function confidenceFor(status: PipelineCaseStatus): CalendarConfidence {
  if (["WON", "APPROVED", "OPS_HANDOFF", "CHANGE_CONTROL"].includes(status)) return "APPROVED";
  if (QUOTE.has(status)) return "QUOTE";
  if (SURVEY.has(status)) return "SURVEY";
  return "REQUEST";
}

function resourceEstimate(item: CrmPipelineCase) {
  const volume = Math.max(1, item.estimatedCbm || 1);
  const storage = /almacen|storage|guardamueble/i.test(item.serviceType);
  let crew = storage ? 3 : item.mode === "LOCAL" ? clamp(Math.ceil(volume / 6), 3, 8) : clamp(Math.ceil(volume / 5), 4, 9);
  let durationHours = storage ? 6 : volume <= 10 ? 5 : volume <= 25 ? 8 : 12;
  const vehicles = storage ? 1 : clamp(Math.ceil(volume / 25), 1, 3);
  if (item.route?.origin?.area === "INTERIOR" || item.route?.destination?.area === "INTERIOR") durationHours += 2;
  if (item.assetsCount > 20) durationHours += 1;
  if (item.mode !== "LOCAL") crew = Math.max(crew, 5);
  return { crew, durationHours, vehicles };
}

function validOverride(value: unknown): CalendarPlanOverride | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const plannedDate = typeof row.plannedDate === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(row.plannedDate) ? row.plannedDate : undefined;
  const positive = (candidate: unknown, maximum: number) => typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0 && candidate <= maximum ? candidate : undefined;
  const state = typeof row.state === "string" && Object.hasOwn(STATE_WEIGHTS, row.state) ? row.state as CalendarPlanState : undefined;
  return { plannedDate, crew: positive(row.crew, 99), durationHours: positive(row.durationHours, 72), vehicles: positive(row.vehicles, 20), state };
}

export function loadCalendarOverrides(): Readonly<Record<string, CalendarPlanOverride>> {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).flatMap(([key, value]) => {
      const override = validOverride(value);
      return override ? [[key, override]] : [];
    }));
  } catch {
    return {};
  }
}

export function saveCalendarOverride(caseRef: string, override: CalendarPlanOverride) {
  const next = { ...loadCalendarOverrides(), [caseRef]: override };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function deriveSmartPlans(cases: readonly CrmPipelineCase[], overrides: Readonly<Record<string, CalendarPlanOverride>>, anchor = new Date()): SmartServicePlan[] {
  const monday = startOfWeek(anchor, { weekStartsOn: 1 });
  return cases
    .filter((item) => !["LOST"].includes(item.status))
    .slice(0, 18)
    .map((item, index) => {
      const estimate = resourceEstimate(item);
      const override = overrides[item.caseRef] || {};
      const confidence = confidenceFor(item.status);
      return {
        caseRef: item.caseRef,
        caseCode: item.caseCode,
        clientName: item.client?.displayName || "Cliente pendiente",
        serviceType: item.serviceType || "Servicio por definir",
        mode: item.mode,
        plannedDate: override.plannedDate || isoDate(addDays(monday, index % 6)),
        crew: override.crew || estimate.crew,
        durationHours: override.durationHours || estimate.durationHours,
        vehicles: override.vehicles || estimate.vehicles,
        volumeM3: item.estimatedCbm,
        state: override.state || stateFor(item.status),
        confidence,
        sourceLabel: confidence === "APPROVED" ? "Propuesta aprobada" : confidence === "QUOTE" ? "Cotización" : confidence === "SURVEY" ? "Survey" : "Necesidad inicial",
        origin: item.route?.origin?.compactAddress || item.originLocation || "Origen pendiente",
        destination: item.route?.destination?.compactAddress || item.destinationLocation || "Destino pendiente",
      };
    });
}

export function calculateDayCapacity(date: string, plans: readonly SmartServicePlan[], availablePeople: number, availableVehicles: number, hoursPerPerson = 8, reservePercent = 15): DayCapacity {
  const target = parseISODate(date);
  const activeHours = (plan: SmartServicePlan) => {
    const offset = Math.round((target.getTime() - parseISODate(plan.plannedDate).getTime()) / 86_400_000);
    if (offset < 0) return 0;
    return clamp(plan.durationHours - offset * hoursPerPerson, 0, hoursPerPerson);
  };
  const dayPlans = plans.filter((plan) => plan.state !== "PAUSED" && activeHours(plan) > 0);
  const personHoursAvailable = availablePeople * hoursPerPerson * (1 - reservePercent / 100);
  const weightedPersonHours = dayPlans.reduce((sum, plan) => sum + plan.crew * activeHours(plan) * STATE_WEIGHTS[plan.state], 0);
  const confirmedPersonHours = dayPlans.filter((plan) => plan.state === "CONFIRMED" || plan.state === "LOCKED").reduce((sum, plan) => sum + plan.crew * activeHours(plan), 0);
  const vehiclesRequired = dayPlans.filter((plan) => plan.state !== "ESTIMATED").reduce((sum, plan) => sum + plan.vehicles, 0);
  const utilizationPercent = personHoursAvailable > 0 ? Math.round(weightedPersonHours / personHoursAvailable * 100) : weightedPersonHours > 0 ? 999 : 0;
  const critical = utilizationPercent >= 80 || vehiclesRequired > availableVehicles;
  return {
    date,
    plans: dayPlans,
    weightedPersonHours,
    confirmedPersonHours,
    personHoursAvailable,
    vehiclesRequired,
    vehiclesAvailable: availableVehicles,
    utilizationPercent,
    status: critical ? "OVERLOADED" : utilizationPercent >= 50 ? "LIMITED" : "AVAILABLE",
  };
}

function parseISODate(value: string) {
  return new Date(`${value}T00:00:00`);
}

export function nextWorkingDate(value: string) {
  let candidate = addDays(parseISODate(value), 1);
  while (candidate.getDay() === 0 || candidate.getDay() === 6) candidate = addDays(candidate, 1);
  return isoDate(candidate);
}

export function carryoverSourceForDate(date: string, plans: readonly SmartServicePlan[], availablePeople: number | ((candidate: string) => number), availableVehicles: number | ((candidate: string) => number)) {
  for (let offset = 1; offset <= 3; offset += 1) {
    const candidate = isoDate(addDays(parseISODate(date), -offset));
    if (nextWorkingDate(candidate) !== date) continue;
    const people = typeof availablePeople === "function" ? availablePeople(candidate) : availablePeople;
    const vehicles = typeof availableVehicles === "function" ? availableVehicles(candidate) : availableVehicles;
    if (calculateDayCapacity(candidate, plans, people, vehicles).status === "OVERLOADED") return candidate;
  }
  return null;
}

export function findCarryoverCapacityViolation(plans: readonly SmartServicePlan[], availablePeople: number | ((candidate: string) => number), availableVehicles: number | ((candidate: string) => number)): CarryoverCapacityViolation | null {
  if (plans.length === 0) return null;
  const first = plans.reduce((earliest, plan) => plan.plannedDate < earliest ? plan.plannedDate : earliest, plans[0].plannedDate);
  const last = plans.reduce((latest, plan) => {
    const finalDay = isoDate(addDays(parseISODate(plan.plannedDate), Math.max(0, Math.ceil(plan.durationHours / 8) - 1)));
    return finalDay > latest ? finalDay : latest;
  }, plans[0].plannedDate);
  const days = Math.ceil((parseISODate(last).getTime() - parseISODate(first).getTime()) / 86_400_000) + 1;
  for (let offset = 0; offset < days; offset += 1) {
    const sourceDate = isoDate(addDays(parseISODate(first), offset));
    const people = typeof availablePeople === "function" ? availablePeople(sourceDate) : availablePeople;
    const vehicles = typeof availableVehicles === "function" ? availableVehicles(sourceDate) : availableVehicles;
    if (calculateDayCapacity(sourceDate, plans, people, vehicles).status !== "OVERLOADED") continue;
    const protectedDate = nextWorkingDate(sourceDate);
    const protectedPeople = typeof availablePeople === "function" ? availablePeople(protectedDate) : availablePeople;
    const protectedVehicles = typeof availableVehicles === "function" ? availableVehicles(protectedDate) : availableVehicles;
    const protectedCapacity = calculateDayCapacity(protectedDate, plans, protectedPeople, protectedVehicles);
    if (protectedCapacity.utilizationPercent > 80) return { sourceDate, protectedDate, protectedUtilizationPercent: protectedCapacity.utilizationPercent };
  }
  return null;
}

export function nextAvailableDate(plan: SmartServicePlan, plans: readonly SmartServicePlan[], availablePeople: number | ((date: string) => number), availableVehicles: number | ((date: string) => number), anchor = new Date()) {
  for (let offset = 0; offset < 42; offset += 1) {
    const date = isoDate(addDays(anchor, offset));
    const candidatePlans = [...plans.filter((item) => item.caseRef !== plan.caseRef), { ...plan, plannedDate: date }];
    const serviceDays = Math.max(1, Math.ceil(plan.durationHours / 8));
    const fits = Array.from({ length: serviceDays }, (_, serviceOffset) => isoDate(addDays(parseISODate(date), serviceOffset))).every((candidateDate) => {
      const people = typeof availablePeople === "function" ? availablePeople(candidateDate) : availablePeople;
      const vehicles = typeof availableVehicles === "function" ? availableVehicles(candidateDate) : availableVehicles;
      return calculateDayCapacity(candidateDate, candidatePlans, people, vehicles).status === "AVAILABLE";
    });
    if (fits) return date;
  }
  return null;
}

export function stateWeight(state: CalendarPlanState) {
  return STATE_WEIGHTS[state];
}

export const SMART_CALENDAR_LABELS = Object.freeze({
  ESTIMATED: "Estimado",
  TENTATIVE: "Tentativo",
  PRE_RESERVED: "Pre-reservado",
  CONFIRMED: "Confirmado",
  LOCKED: "Bloqueado",
  PAUSED: "Pausado",
} satisfies Record<CalendarPlanState, string>);
