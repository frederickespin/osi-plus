import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarClock,
  ClipboardCheck,
  FileCheck2,
  History,
  MapPin,
  MessageSquareText,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  UserCog,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createSurveySchedulingApi } from "./schedulingApi";
import type { SurveySchedulingUiAccess } from "./schedulingAccess";
import type { EvaluationMethod, ScheduledEvaluationMethod, SchedulingWorkspace, SurveyCoordinationDraft, SurveyTimeAvailability } from "./schedulingTypes";
import {
  CommercialRelationshipsApi,
  type CommercialCaseSnapshot,
} from "@/commercial-relationships/api";
import { isCommercialRelationshipsUiEnabled } from "@/commercial-relationships/mode";
import type { TransportUiAccess } from "@/logistics-engine/transportAccess";
import type { CommunicationsAccess } from "@/communications/access";
import { createPersonnelPoliciesApi } from "@/personnel-policies/api";
import type { ClientTemporaryAccessUi } from "@/client-portal/access";
import ClientTemporaryAccessPanel from "@/client-portal/ClientTemporaryAccessPanel";

export type SurveyIntakeMethod = "IN_PERSON" | "VIRTUAL" | "MINI" | "SPECIAL";

type Props = Readonly<{
  caseRef: string;
  authorization?: string;
  routeVersion?: number;
  access: SurveySchedulingUiAccess;
  intakeMethod?: SurveyIntakeMethod;
  communicationsEnabled?: boolean;
  communicationsAccess?: CommunicationsAccess;
  logisticsSummaryEnabled?: boolean;
  transportAccess?: TransportUiAccess;
  clientTemporaryAccessEnabled?: boolean;
  clientTemporaryAccess?: ClientTemporaryAccessUi;
  onOpenCommunications?(surveyAssignmentRef: string): void;
  onPrepareClientMessage?(): void;
  onEditRoute?(): void;
  onNavigate(pathname: string): void;
  onUnauthorized(): void;
}>;

type SurveyWorkspaceView = "COORDINATE" | "RESULT";

const METHOD_LABELS: Readonly<Record<EvaluationMethod, string>> = Object.freeze(
  {
    IN_PERSON: "Visita presencial",
    VIRTUAL: "Visita virtual",
    CLIENT_PHOTOS_DOCUMENTS: "Listado + fotografías",
    WRITTEN_REPORT: "Listado o informe escrito",
    VOXME: "Voxme",
    MINI: "Mini-visita",
    NONE: "No requiere Survey",
  },
);
const STATE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  NOT_REQUIRED: "No se requiere evaluación",
  PENDING_METHOD: "Pendiente de seleccionar método",
  WAITING_CLIENT_INFO: "Esperando información del cliente",
  READY_TO_SCHEDULE: "Evaluación pendiente de programación",
  SCHEDULED: "Programada",
  IN_PROGRESS: "En progreso",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
});
const HISTORY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  METHOD_DECIDED: "Método definido",
  SCHEDULED: "Visita programada",
  RESCHEDULED: "Visita reprogramada",
  CANCELLED: "Visita cancelada",
  EVALUATOR_CHANGED: "Evaluador cambiado",
  ROUTE_INVALIDATED: "Ruta requiere revalidación",
  VISIT_FEE_CHANGED: "Visit Fee actualizado",
  COMMUNICATION_PREPARED: "Comunicación PIC preparada",
  COMMUNICATION_RECORDED: "Comunicación registrada",
  SURVEY_PUBLISHED: "Survey publicado",
});

function stateFor(method: EvaluationMethod) {
  if (method === "NONE") return "NOT_REQUIRED";
  if (["CLIENT_PHOTOS_DOCUMENTS", "WRITTEN_REPORT", "VOXME"].includes(method)) return "WAITING_CLIENT_INFO";
  return "READY_TO_SCHEDULE";
}
function isScheduledMethod(method: EvaluationMethod | ""): method is ScheduledEvaluationMethod {
  return method === "IN_PERSON" || method === "VIRTUAL" || method === "MINI";
}
function clientTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return new Intl.DateTimeFormat("es-DO", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2000, 0, 1, hours, minutes));
}
function agendaTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("es-DO", { timeStyle: "short", timeZone: timezone }).format(new Date(value));
}
function scheduleTimezone(workspace: SchedulingWorkspace) {
  return workspace.operationalPolicy?.timezone ?? workspace.policy?.timezone ?? "America/Santo_Domingo";
}
function locationKey(
  location: SchedulingWorkspace["visitLocations"][number],
) {
  return `${location.role}:${location.order}`;
}
function locationRoleLabel(role: string) {
  if (role === "ORIGIN") return "Origen";
  if (role === "DESTINATION") return "Destino";
  return "Parada adicional";
}
function schedulingErrorMessage(code: string) {
  if (code === "CRM_SURVEY_INTERIOR_DAILY_LIMIT")
    return "Este evaluador ya tiene una visita fuera de la zona metropolitana en esa fecha. Seleccione otro evaluador o cambie el día.";
  if (code === "PERSONNEL_AFTER_HOURS_REQUEST_REQUIRED")
    return "El horario seleccionado requiere autorización extraordinaria.";
  if (code === "PERSONNEL_EVALUATOR_UNAVAILABLE" || code === "CRM_SURVEY_EVALUATOR_CONFLICT")
    return "El evaluador no dispone del tiempo de visita y traslado necesario. Seleccione otro horario o evaluador.";
  if (code === "CRM_SURVEY_SLOT_FULL")
    return "Ese horario acaba de ocuparse. Seleccione otro disponible.";
  if (code === "CRM_SURVEY_EVALUATOR_OUTSIDE_METRO")
    return "El evaluador está fuera de zona metro. Seleccione otro horario o evaluador.";
  if (code === "CRM_SURVEY_EVALUATOR_DAY_BLOCKED")
    return "El evaluador ya tiene otra visita ese día. Seleccione otro evaluador o fecha para la visita fuera de zona metro.";
  if (code === "CRM_SURVEY_VERSION_CONFLICT" || code === "CRM_SURVEY_COORDINATION_CONFLICT")
    return "La coordinación cambió en otra sesión. Actualice la ficha para revisar los datos.";
  if (code === "CRM_SURVEY_VISIT_FEE_APPROVAL_REQUIRED")
    return "El cargo de la visita está pendiente de autorización.";
  return code;
}
function appointmentCopy(workspace: SchedulingWorkspace) {
  if (!workspace.assignment) return "Aún no existe una cita.";
  return new Intl.DateTimeFormat("es-DO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: scheduleTimezone(workspace),
  }).format(new Date(workspace.assignment.scheduledStart));
}

export default function SurveyCasePanel({
  caseRef,
  authorization,
  routeVersion,
  access,
  intakeMethod,
  communicationsEnabled = false,
  communicationsAccess,
  clientTemporaryAccessEnabled = false,
  clientTemporaryAccess,
  onOpenCommunications,
  onPrepareClientMessage,
  onEditRoute,
  onNavigate,
  onUnauthorized,
}: Props) {
  const api = useMemo(
    () => createSurveySchedulingApi(authorization),
    [authorization],
  );
  const commercialApi = useMemo(
    () => new CommercialRelationshipsApi(authorization),
    [authorization],
  );
  const personnelApi = useMemo(
    () => createPersonnelPoliciesApi(authorization),
    [authorization],
  );
  const [workspace, setWorkspace] = useState<SchedulingWorkspace | null>(null);
  const [commercialContext, setCommercialContext] =
    useState<CommercialCaseSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [exceptionQueryKey, setExceptionQueryKey] = useState("");
  const [requestedExceptionKey, setRequestedExceptionKey] = useState("");
  const [method, setMethod] = useState<EvaluationMethod | "">("");
  const [date, setDate] = useState("");
  const [arrivalTime, setArrivalTime] = useState("");
  const [evaluatorRef, setEvaluatorRef] = useState("");
  const [visitReasonRef, setVisitReasonRef] = useState("");
  const [chosenLocationKey, setVisitLocationKey] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [reason, setReason] = useState("");
  const [instruction, setInstruction] = useState("");
  const [informationNotes, setInformationNotes] = useState("");
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [editingEvaluator, setEditingEvaluator] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [activeView, setActiveView] =
    useState<SurveyWorkspaceView>("COORDINATE");
  const [agendaRefresh, setAgendaRefresh] = useState(0);
  const [agendaResponse, setAgendaResponse] = useState<{
    key: string;
    contextKey: string;
    workspace?: SchedulingWorkspace;
    error?: string;
  } | null>(null);
  const loadVersion = useRef(0);
  const loadedIntake = useRef<string | null>(null);

  const load = useCallback(
    async () => {
      const version = ++loadVersion.current;
      setLoading(true);
      setError(null);
      try {
        const nextWorkspace = await api.workspace(caseRef);
        if (version !== loadVersion.current) return;
        setWorkspace(nextWorkspace);
        const intakeKey = `${caseRef}:${intakeMethod ?? ""}`;
        if (loadedIntake.current !== intakeKey) {
          loadedIntake.current = intakeKey;
          const savedMethod = nextWorkspace.decision?.method ?? "";
          const requestedMethod = intakeMethod === "SPECIAL" ? "IN_PERSON" : intakeMethod;
          const hasAppointment = nextWorkspace.assignment && nextWorkspace.assignment.status !== "CANCELLED";
          const selectedMethod = access.canManage && !hasAppointment ? requestedMethod ?? savedMethod : savedMethod;
          const draft = selectedMethod === savedMethod ? nextWorkspace.coordinationDraft : null;
          setMethod(selectedMethod);
          setVisitLocationKey(draft?.visitLocation ?? "");
          setDate(draft?.date ?? "");
          setArrivalTime(draft?.time ?? "");
          setDurationMinutes(draft?.durationMinutes ?? 45);
          setEvaluatorRef(draft?.evaluatorMembershipRef ?? "");
          setVisitReasonRef(draft?.visitReasonRef ?? "");
          setInstruction(isScheduledMethod(selectedMethod)
            ? draft?.instruction ?? (intakeMethod === "SPECIAL" && !hasAppointment ? "Visita especial. " : "")
            : "");
          setInformationNotes(isScheduledMethod(selectedMethod) ? "" : draft?.instruction ?? "");
          setReason(draft?.approvalReason ?? "");
          setActiveView("COORDINATE");
        }
      } catch (cause) {
        if (version !== loadVersion.current) return;
        const code =
          cause instanceof Error ? cause.message : "CRM_SURVEY_REQUEST_FAILED";
        if (/UNAUTHORIZED|AUTH_REQUIRED/.test(code)) onUnauthorized();
        else setError(code);
      } finally {
        if (version === loadVersion.current) setLoading(false);
      }
    },
    [
      api,
      caseRef,
      access.canManage,
      intakeMethod,
      onUnauthorized,
    ],
  );
  useEffect(() => {
    void load();
    return () => { loadVersion.current += 1; };
  }, [load, routeVersion]);
  useEffect(() => {
    if (!isCommercialRelationshipsUiEnabled()) return;
    let active = true;
    void commercialApi.caseContext(caseRef).then(
      (context) => { if (active) setCommercialContext(context); },
      () => { if (active) setCommercialContext(null); },
    );
    return () => { active = false; };
  }, [caseRef, commercialApi]);

  const assignment = workspace?.assignment;
  const hasAppointment = Boolean(assignment && !["CANCELLED", "SUPERSEDED"].includes(assignment.status));
  const canDecide = access.canManage && !hasAppointment;
  const scheduleMethod = editingSchedule ? workspace?.decision?.method ?? "" : method;
  const selectedVisitLocation = workspace?.visitLocations.find((location) => locationKey(location) === chosenLocationKey)
    ?? workspace?.visitLocations.find((location) => Boolean(location.metroZone))
    ?? workspace?.visitLocations.find((location) => location.role === "ORIGIN")
    ?? workspace?.visitLocations[0];
  const visitLocationKey = selectedVisitLocation ? locationKey(selectedVisitLocation) : "";
  const sameReadyMethod = workspace?.decision?.state === "READY_TO_SCHEDULE" && workspace.decision.method === scheduleMethod;
  const creatingSchedule = !hasAppointment && isScheduledMethod(scheduleMethod) && (canDecide || (sameReadyMethod && access.canAssign));
  const canEditSchedule = activeView === "COORDINATE" && (creatingSchedule || editingSchedule);
  const queryLocation = !editingSchedule && scheduleMethod === "IN_PERSON" ? visitLocationKey : "";
  const previewMethod = !editingSchedule && canDecide && isScheduledMethod(scheduleMethod) ? scheduleMethod : undefined;
  const hasRequestedTime = Boolean(date && /^\d{2}:\d{2}$/.test(arrivalTime));
  const contextKey = JSON.stringify([caseRef, workspace?.routeVersion, scheduleMethod, queryLocation, editingSchedule]);
  const defaultOrigin = workspace?.visitLocations.find((location) => location.role === "ORIGIN");
  const hasDifferentLocation = Boolean(queryLocation && (chosenLocationKey || (defaultOrigin && queryLocation !== locationKey(defaultOrigin))));
  const queryKey = canEditSchedule && (hasRequestedTime || previewMethod || hasDifferentLocation)
    ? JSON.stringify([contextKey, date, arrivalTime, durationMinutes, agendaRefresh, workspace?.decision?.version, workspace?.coordinationRef])
    : "";
  const currentAgenda = agendaResponse?.key === queryKey ? agendaResponse : null;
  const routeWorkspace = agendaResponse?.contextKey === contextKey ? agendaResponse.workspace : undefined;
  const coordinationWorkspace = routeWorkspace ?? workspace;
  const awaitingZone = Boolean((previewMethod || hasDifferentLocation) && queryKey && !routeWorkspace && !currentAgenda?.error);
  const zoneReady = scheduleMethod !== "IN_PERSON" || editingSchedule
    || Boolean(coordinationWorkspace?.schedulingContext && !awaitingZone);
  const exactAvailability = currentAgenda?.workspace?.timeAvailability ?? null;
  const eligibleEvaluators = exactAvailability?.evaluators ?? [];
  const selectedEvaluatorRef = eligibleEvaluators.includes(evaluatorRef) ? evaluatorRef : eligibleEvaluators[0] ?? "";
  const availabilityPending = Boolean((hasRequestedTime || awaitingZone) && queryKey && !currentAgenda);
  const scheduleNeedsException = Boolean(exactAvailability?.requiresApproval || (queryKey && exceptionQueryKey === queryKey));
  const feeApprovalPending = scheduleMethod === "IN_PERSON" && coordinationWorkspace?.schedulingContext?.zoneType !== "METRO"
    && coordinationWorkspace?.visitFee?.disposition === "CHARGEABLE"
    && coordinationWorkspace.visitFee.approvalStatus !== "APPROVED";
  const canPrepareClientMessage = communicationsEnabled && communicationsAccess?.canPrepare
    && communicationsAccess.canTemplatesView && Boolean(onPrepareClientMessage);

  useEffect(() => {
    if (!queryKey) return;
    const abort = new AbortController();
    let timer: number;
    const checkAvailability = async () => {
      try {
        const updated = await api.workspace(caseRef, {
          date: hasRequestedTime ? date : undefined,
          time: hasRequestedTime ? arrivalTime : undefined,
          durationMinutes: hasRequestedTime ? durationMinutes : undefined,
          visitLocation: queryLocation || undefined,
          method: previewMethod,
          rescheduling: editingSchedule,
          signal: abort.signal,
        });
        if (abort.signal.aborted) return;
        setAgendaResponse({ key: queryKey, contextKey, workspace: updated });
        if (updated.timeAvailability?.agenda.some((visit) => visit.outsideMetro && !visit.returnedToMetroAt)) {
          timer = window.setTimeout(checkAvailability, 30_000);
        }
      } catch (cause) {
        if (abort.signal.aborted) return;
        if ((cause as {status?: number})?.status === 401) onUnauthorized();
        setAgendaResponse({ key: queryKey, contextKey, error: "No se pudo consultar la agenda." });
      }
    };
    timer = window.setTimeout(checkAvailability, 200);
    return () => {
      window.clearTimeout(timer);
      abort.abort();
    };
  }, [api, queryKey, contextKey, caseRef, date, arrivalTime, durationMinutes, queryLocation, previewMethod, editingSchedule, hasRequestedTime, onUnauthorized]);

  useEffect(() => {
    if (!workspace) return;
    if (
      !visitReasonRef ||
      !workspace.visitReasons.some(
        (visitReason) => visitReason.reasonRef === visitReasonRef,
      )
    )
      setVisitReasonRef(workspace.visitReasons[0]?.reasonRef || "");
  }, [
    visitReasonRef,
    workspace,
  ]);
  function refreshAgenda() {
    setAgendaRefresh((value) => value + 1);
  }
  function openRescheduling() {
    if (!workspace || !assignment) return;
    if (!editingSchedule) {
      const timeZone = scheduleTimezone(workspace);
      const start = new Date(assignment.scheduledStart);
      setDate(new Intl.DateTimeFormat("fr-CA", { timeZone, dateStyle: "short" }).format(start));
      setArrivalTime(new Intl.DateTimeFormat("en-GB", {
        timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      }).format(start));
      const minutes = assignment.scheduledEnd
        ? Math.round((Date.parse(assignment.scheduledEnd) - start.getTime()) / 60000)
        : 45;
      setDurationMinutes(minutes >= 15 && minutes <= 240 ? minutes : 45);
    }
    setEditingSchedule(!editingSchedule);
    setEditingEvaluator(false);
    setCancelling(false);
    setReason("");
  }
  const mutate = async (operation: () => Promise<unknown>) => {
    setSaving(true);
    setError(null);
    try {
      await operation();
      await load();
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "CRM_SURVEY_SCHEDULING_REQUEST_FAILED",
      );
      return false;
    } finally {
      setSaving(false);
    }
  };
  const saveDecision = async (prepareMessage = false) => {
    if (!workspace || !method || !canDecide) return;
    setNotice(null);
    const schedulesVisit = isScheduledMethod(method);
    const coordinationDraft: SurveyCoordinationDraft = {
      visitLocation: method === "IN_PERSON" ? visitLocationKey || null : null,
      date: schedulesVisit ? date || null : null,
      time: schedulesVisit ? arrivalTime || null : null,
      durationMinutes,
      evaluatorMembershipRef: schedulesVisit ? selectedEvaluatorRef || null : null,
      visitReasonRef: schedulesVisit ? visitReasonRef || null : null,
      instruction: method === "NONE" ? null : (schedulesVisit ? instruction : informationNotes).trim() || null,
      approvalReason: schedulesVisit ? reason.trim() || null : null,
    };
    const saved = await mutate(() =>
      api.decide({
        caseRef,
        expectedVersion: workspace.decision?.version ?? null,
        expectedCoordinationRef: workspace.coordinationRef ?? null,
        method,
        commercialState: stateFor(method),
        informationSource:
          method === "VOXME"
            ? "VOXME"
            : method === "MINI"
              ? "MINI"
              : ["CLIENT_PHOTOS_DOCUMENTS", "WRITTEN_REPORT"].includes(method)
                ? "CLIENT"
                : "COMMERCIAL",
        rationaleCode: method === "NONE" ? "COMMERCIAL_DECISION" : null,
        coordinationDraft,
      }),
    );
    if (saved) {
      setNotice(schedulesVisit ? "Coordinación guardada como pendiente." : "Decisión de Survey guardada.");
      if (prepareMessage) onPrepareClientMessage?.();
    }
  };
  const saveSchedule = async () => {
    if (!workspace || !isScheduledMethod(scheduleMethod) || !access.canAssign || feeApprovalPending
      || !exactAvailability?.slotKey || !exactAvailability.scheduledStart || !exactAvailability.scheduledEnd || !selectedEvaluatorRef) return;
    const saturday = new Date(`${date}T12:00:00`).getDay() === 6;
    setSaving(true);
    setError(null);
    setNotice(null);
    setExceptionQueryKey("");
    try {
      const booking = {
        evaluatorMembershipRef: selectedEvaluatorRef,
        scheduledStart: exactAvailability.scheduledStart,
        scheduledEnd: exactAvailability.scheduledEnd,
        slotKey: exactAvailability.slotKey,
        instruction: instruction.trim() || null,
        saturdayApprovalReason: saturday ? reason || null : null,
        ...(scheduleMethod === "IN_PERSON" && selectedVisitLocation
          ? {
              visitRouteRole: selectedVisitLocation.role,
              visitRouteOrder: selectedVisitLocation.order,
            }
          : {}),
        visitReasonRef: workspace.operationalPolicy
          ? visitReasonRef || null
          : null,
      };
      if (canDecide) {
        await api.decideAndSchedule({
          ...booking,
          caseRef,
          method: scheduleMethod,
          expectedVersion: workspace.decision?.version ?? null,
          expectedCoordinationRef: workspace.coordinationRef ?? null,
        });
      } else if (sameReadyMethod && workspace.decision) {
        await api.schedule({
          ...booking,
          decisionRef: workspace.decision.decisionRef,
          expectedDecisionVersion: workspace.decision.version,
        });
      }
      await load();
    } catch (cause) {
      const code =
        cause instanceof Error
          ? cause.message
          : "CRM_SURVEY_SCHEDULING_REQUEST_FAILED";
      setError(code);
      if (code === "PERSONNEL_AFTER_HOURS_REQUEST_REQUIRED") setExceptionQueryKey(queryKey);
      if (code !== "PERSONNEL_AFTER_HOURS_REQUEST_REQUIRED") refreshAgenda();
    } finally {
      setSaving(false);
    }
  };
  const requestScheduleException = async () => {
    const reasonRef = editingSchedule ? assignment?.reason?.reasonRef : visitReasonRef;
    if (
      !workspace || !isScheduledMethod(scheduleMethod) ||
      !exactAvailability?.scheduledStart ||
      !exactAvailability.scheduledEnd ||
      !reasonRef ||
      !selectedEvaluatorRef ||
      !reason
    )
      return;
    const evaluator = coordinationWorkspace?.evaluatorCandidates.find(
      (entry) => entry.membershipRef === selectedEvaluatorRef,
    );
    if (!evaluator?.profileRef) {
      setError("PERSONNEL_OPERATIONAL_PROFILE_REQUIRED");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await personnelApi.mutate("EXCEPTION_REQUEST", {
        caseRef,
        assignmentRef: editingSchedule ? assignment?.assignmentRef : null,
        profileRef: evaluator.profileRef,
        reasonRef,
        method: scheduleMethod,
        requestedStart: exactAvailability.scheduledStart,
        requestedEnd: exactAvailability.scheduledEnd,
        requesterOrigin: "SALES",
        reasonDescription: reason,
      });
      setExceptionQueryKey("");
      setRequestedExceptionKey(queryKey);
      setNotice(
        "Solicitud excepcional registrada para respuesta del evaluador y aprobación administrativa.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "PERSONNEL_POLICIES_REQUEST_FAILED",
      );
    } finally {
      setSaving(false);
    }
  };
  const reschedule = () => {
    if (!assignment || !exactAvailability?.slotKey || !exactAvailability.scheduledStart || !exactAvailability.scheduledEnd || !selectedEvaluatorRef || !reason) return;
    const saturday = new Date(`${date}T12:00:00`).getDay() === 6;
    void mutate(() =>
      api.reschedule({
        assignmentRef: assignment.assignmentRef,
        expectedVersion: assignment.version,
        scheduledStart: exactAvailability.scheduledStart,
        scheduledEnd: exactAvailability.scheduledEnd,
        slotKey: exactAvailability.slotKey,
        reasonCode: reason,
        notificationRequired: true,
        saturdayApprovalReason: saturday ? reason : null,
      }),
    ).then((saved) => {
      if (saved) setEditingSchedule(false);
      else refreshAgenda();
    });
  };
  const changeEvaluator = () => {
    if (!workspace?.assignment || !evaluatorRef || !reason) return;
    void mutate(() =>
      api.changeEvaluator({
        assignmentRef: workspace.assignment!.assignmentRef,
        expectedVersion: workspace.assignment!.version,
        evaluatorMembershipRef: evaluatorRef,
        reasonCode: reason,
        notificationRequired: true,
      }),
    ).then(() => {
      setEditingEvaluator(false);
      setReason("");
    });
  };
  const cancelAppointment = () => {
    if (!workspace?.assignment || !reason) return;
    void mutate(() =>
      api.cancel({
        assignmentRef: workspace.assignment!.assignmentRef,
        expectedVersion: workspace.assignment!.version,
        reasonCode: reason,
        notificationRequired: true,
      }),
    ).then(() => {
      setCancelling(false);
      setReason("");
    });
  };
  const recordClientConfirmation = (
    confirmation: "CONFIRMED" | "CHANGE_REQUESTED",
  ) => {
    if (!workspace?.assignment) return;
    void mutate(() =>
      personnelApi.mutate("RECORD_CLIENT_CONFIRMATION", {
        assignmentRef: workspace.assignment!.assignmentRef,
        expectedVersion: workspace.assignment!.version,
        confirmation,
      }),
    );
  };
  const canOpenResult = Boolean(workspace?.assignment || workspace?.publication);
  if (!access.canView)
    return (
      <section role="status" className="border border-slate-200 bg-white p-6">
        <h2 className="font-black text-[#003366]">Survey</h2>
        <p className="mt-2 text-sm text-slate-600">
          No dispone de acceso a la gestión de Survey.
        </p>
      </section>
    );
  return (
    <section
      role="tabpanel"
      data-testid="survey-scheduling-workspace"
      className="border border-slate-200 bg-white"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-slate-50 px-4 py-2">
        <h2 className="text-lg font-black text-[#003366]">Coordinar Survey</h2>
        <Button size="icon" variant="ghost" title="Actualizar agenda" aria-label="Actualizar agenda" onClick={() => {
          if (error === "CRM_SURVEY_VERSION_CONFLICT" || error === "CRM_SURVEY_COORDINATION_CONFLICT") loadedIntake.current = null;
          refreshAgenda();
          void load();
        }}>
          <RefreshCw />
        </Button>
      </header>
      {loading && (
        <p className="p-8 text-center text-sm text-slate-500">
          Consultando decisión, agenda e historial…
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="m-4 border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800"
        >
          {schedulingErrorMessage(error)}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="m-4 border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900"
        >
          {notice}
        </p>
      )}
      {!loading && workspace && (
        <>
          <nav
            aria-label="Etapas de Survey"
            className="flex flex-wrap gap-1 border-b bg-white px-3"
            data-testid="survey-workspace-views"
          >
            <SurveyViewButton
              active={activeView === "COORDINATE"}
              complete={hasAppointment}
              icon={CalendarClock}
              label="Coordinar"
              onClick={() => setActiveView("COORDINATE")}
            />
            <SurveyViewButton
              active={activeView === "RESULT"}
              complete={Boolean(workspace.publication)}
              disabled={!canOpenResult}
              icon={FileCheck2}
              label="Resultado"
              onClick={() => setActiveView("RESULT")}
            />
          </nav>
          <div
            className={
              activeView === "RESULT"
                ? "grid min-w-0 gap-0 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,.75fr)]"
                : "min-w-0"
            }
          >
          <div className="min-w-0 divide-y">
            {activeView === "COORDINATE" && <div className="divide-y">
            <section className="space-y-3 p-4" aria-label="Coordinación de Survey">
              {canDecide && (
                <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
                  <div className="w-full max-w-80">
                    <Label htmlFor="survey-method">Método de Survey</Label>
                    <select id="survey-method" className={SCHEDULE_FIELD} value={method} disabled={saving}
                      onChange={(event) => {
                        setMethod(event.target.value as EvaluationMethod | "");
                        setNotice(null);
                        setError(null);
                      }}>
                      <option value="" disabled>¿Cómo obtendrá los datos para cotizar?</option>
                      {Object.entries(METHOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                  {workspace.coordinationDraft && workspace.decision?.method === method && (
                    <span className="mb-1 rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900">
                      {STATE_LABELS[workspace.decision.state]}
                    </span>
                  )}
                  {commercialContext?.parties.filter((party) => party.role === "BOOKER" || party.role === "LEAD_ACCOUNT").map((party) => (
                    <span key={`${party.role}:${party.entityRef}`} className="mb-1 text-xs text-slate-600">
                      {party.role === "BOOKER" ? "Booker" : "Empresa"} · {party.displayName}
                    </span>
                  ))}
                </div>
              )}
              {canDecide && method && !isScheduledMethod(method) && (
                <div className="max-w-2xl space-y-2">
                  {method !== "NONE" && <div>
                    <Label htmlFor="survey-information-notes">Información recibida o por pedir</Label>
                    <textarea id="survey-information-notes" rows={2} maxLength={1000}
                      className="w-full rounded bg-slate-100 px-2.5 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
                      value={informationNotes} onChange={(event) => setInformationNotes(event.target.value)}
                      placeholder="Resumen del listado, las fotos o el informe del agente" />
                  </div>}
                  <div className="flex flex-wrap items-center gap-2">
                    {method !== "NONE" && canPrepareClientMessage && (
                      <Button size="sm" disabled={saving} onClick={() => void saveDecision(true)}>
                        <MessageSquareText />Solicitar información
                      </Button>
                    )}
                    <Button size="sm" variant={method !== "NONE" && canPrepareClientMessage ? "ghost" : "default"}
                      disabled={saving} onClick={() => void saveDecision()}>
                      {method === "NONE" ? "Guardar decisión" : "Guardar información"}
                    </Button>
                  </div>
                </div>
              )}
              {!canDecide && !hasAppointment && !canEditSchedule && (
                <p className="text-sm text-slate-600">{STATE_LABELS[workspace.decision?.state ?? "PENDING_METHOD"]}</p>
              )}
              {workspace.assignment && <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3
                    id="evaluation-agenda-title"
                    className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500"
                  >
                    <CalendarClock className="h-4 w-4" />
                    Agenda
                  </h3>
                  <p className="mt-2 text-base font-bold text-slate-900">
                    {appointmentCopy(workspace)}
                  </p>
                  {workspace.assignment && (
                    <p className="mt-1 text-xs text-slate-500">
                      {workspace.assignment.evaluator.displayName} ·{" "}
                      {workspace.assignment.profile} ·{" "}
                      {workspace.assignment.zoneCode} ·{" "}
                      {workspace.assignment.slotKey}
                    </p>
                  )}
                  {workspace.assignment.returnedToMetroAt && (
                    <p className="mt-1 text-xs font-medium text-emerald-800">
                      Regreso registrado a las {agendaTime(workspace.assignment.returnedToMetroAt, scheduleTimezone(workspace))}
                    </p>
                  )}
                  {workspace.assignment?.routeStale && (
                    <p className="mt-2 rounded bg-amber-50 p-2 text-xs font-semibold text-amber-900">
                      La ruta cambió. Verifique la zona, el cargo y la disponibilidad.
                    </p>
                  )}
                </div>
                {hasAppointment && (
                  <div className="flex flex-wrap gap-2">
                    {access.canReschedule && !workspace.assignment.returnedToMetroAt && (
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Reprogramar"
                        aria-label="Reprogramar"
                        aria-pressed={editingSchedule}
                        onClick={openRescheduling}
                      >
                        <RotateCcw />
                      </Button>
                    )}
                    {access.canAssign && !workspace.assignment.returnedToMetroAt && (
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Cambiar evaluador"
                        aria-label="Cambiar evaluador"
                        aria-pressed={editingEvaluator}
                        onClick={() => {
                          setEditingEvaluator((value) => !value);
                          setEditingSchedule(false);
                          setCancelling(false);
                        }}
                      >
                        <UserCog />
                      </Button>
                    )}
                    {access.canManage && (
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Cancelar cita"
                        aria-label="Cancelar cita"
                        aria-pressed={cancelling}
                        onClick={() => {
                          setCancelling((value) => !value);
                          setEditingSchedule(false);
                          setEditingEvaluator(false);
                        }}
                      >
                        <XCircle />
                      </Button>
                    )}
                  </div>
                )}
              </div>}
              {canEditSchedule && isScheduledMethod(scheduleMethod) && (
                  <ScheduleEditor
                    workspace={coordinationWorkspace ?? workspace}
                    method={scheduleMethod}
                    date={date}
                    setDate={setDate}
                    arrivalTime={arrivalTime}
                    setArrivalTime={setArrivalTime}
                    availability={exactAvailability}
                    availabilityPending={availabilityPending}
                    availabilityError={currentAgenda?.error}
                    zoneReady={zoneReady}
                    awaitingZone={awaitingZone}
                    onEditRoute={onEditRoute}
                    refreshAgenda={refreshAgenda}
                    visitLocationKey={visitLocationKey}
                    setVisitLocationKey={setVisitLocationKey}
                    durationMinutes={durationMinutes}
                    setDurationMinutes={setDurationMinutes}
                    evaluatorRef={selectedEvaluatorRef}
                    setEvaluatorRef={setEvaluatorRef}
                    visitReasonRef={visitReasonRef}
                    setVisitReasonRef={setVisitReasonRef}
                    reason={reason}
                    setReason={setReason}
                    instruction={instruction}
                    setInstruction={setInstruction}
                    saving={saving}
                    needsException={scheduleNeedsException}
                    exceptionRequested={Boolean(queryKey && requestedExceptionKey === queryKey)}
                    canViewFee={access.canViewFee}
                    feeApprovalPending={feeApprovalPending}
                    canConfirm={editingSchedule || access.canAssign}
                    onSavePending={!editingSchedule && canDecide ? () => void saveDecision() : undefined}
                    onPrepareFeeApproval={!editingSchedule && canDecide && canPrepareClientMessage ? () => void saveDecision(true) : undefined}
                    reprogramming={editingSchedule}
                    onSave={editingSchedule ? reschedule : saveSchedule}
                    onRequestException={requestScheduleException}
                  />
                )}
              {editingEvaluator && workspace.assignment && (
                <div className="mt-4 grid gap-3 rounded border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
                  <div>
                    <Label>Nuevo evaluador</Label>
                    <Select
                      value={evaluatorRef}
                      onValueChange={setEvaluatorRef}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccione" />
                      </SelectTrigger>
                      <SelectContent>
                        {workspace.evaluatorCandidates.map((candidate) => (
                          <SelectItem
                            key={candidate.membershipRef}
                            value={candidate.membershipRef}
                          >
                            {candidate.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="evaluator-change-reason">Motivo</Label>
                    <Input
                      id="evaluator-change-reason"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Button
                      disabled={saving || !evaluatorRef || !reason}
                      onClick={changeEvaluator}
                    >
                      Confirmar cambio
                    </Button>
                  </div>
                </div>
              )}
              {cancelling && workspace.assignment && (
                <div className="mt-4 flex flex-col gap-3 rounded border border-red-200 bg-red-50 p-3 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1">
                    <Label htmlFor="cancel-appointment-reason">
                      Motivo de cancelación
                    </Label>
                    <Input
                      id="cancel-appointment-reason"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </div>
                  <Button
                    variant="destructive"
                    disabled={saving || !reason}
                    onClick={cancelAppointment}
                  >
                    Confirmar cancelación
                  </Button>
                </div>
              )}
            </section>

            {workspace.assignment && (
              <section className="grid gap-3 p-4 sm:grid-cols-2" data-testid="survey-confirmation-status">
                <div>
                  <ConfirmationStatus
                    label="Confirmación del cliente"
                    value={workspace.assignment.clientConfirmation}
                  />
                  {access.canManage && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={saving || workspace.assignment.clientConfirmation === "CONFIRMED"}
                        onClick={() => recordClientConfirmation("CONFIRMED")}
                      >
                        Confirmar con cliente
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={saving}
                        onClick={() => recordClientConfirmation("CHANGE_REQUESTED")}
                      >
                        Solicitó cambio
                      </Button>
                    </div>
                  )}
                </div>
                <ConfirmationStatus
                  label="Confirmación del evaluador"
                  value={workspace.assignment.evaluatorConfirmation}
                />
              </section>
            )}

            {clientTemporaryAccessEnabled && clientTemporaryAccess && workspace.assignment && commercialContext && (clientTemporaryAccess.canView || clientTemporaryAccess.canCreate) && <ClientTemporaryAccessPanel
              caseRef={caseRef}
              assignmentRef={workspace.assignment.assignmentRef}
              contacts={commercialContext.parties.flatMap((party) => party.contacts.map((contact) => ({ contactRef: contact.contactRef, displayName: contact.displayName })))}
              authorization={authorization}
              access={clientTemporaryAccess}
              onUnauthorized={onUnauthorized}
            />}

            {!canEditSchedule && workspace.assignment && <section className="grid gap-3 bg-slate-50 p-4 sm:grid-cols-2" data-testid="survey-visit-readiness">
              <div>
                <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500">
                  <MapPin className="h-4 w-4" />
                  Zona y costo
                </h3>
                {workspace.decision?.method === "VIRTUAL" ? (
                  <p className="mt-2 text-sm font-bold text-emerald-700">Virtual · sin tiempo ni costo de traslado</p>
                ) : !workspace.schedulingContext ? (
                  <p className="mt-2 text-sm font-semibold text-amber-700">
                    {selectedVisitLocation?.metroZone === "INTERIOR"
                      ? "Fuera de zona metro · distancia pendiente para la agenda"
                      : selectedVisitLocation?.metroZone === null
                        ? "Zona por confirmar en Motor Logístico"
                        : "Clasificando la dirección del caso"}
                  </p>
                ) : !access.canViewFee ? (
                  <p className="mt-2 text-sm text-slate-500">
                    {workspace.schedulingContext.zoneType === "METRO" ? "Zona metropolitana" : "Fuera de zona metropolitana"}
                  </p>
                ) : workspace.visitFee ? (
                  <div className="mt-2 space-y-1 text-sm">
                    <p className="font-bold text-slate-900">
                      {workspace.visitFee.disposition === "FREE"
                        ? "Sin cobro al cliente"
                        : workspace.visitFee.disposition === "WAIVED"
                          ? "Exonerada"
                          : workspace.visitFee.suggestedAmount == null
                            ? "Pendiente de cálculo"
                            : `${workspace.visitFee.currency} ${workspace.visitFee.suggestedAmount.toLocaleString("es-DO")}`}
                    </p>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">
                    {workspace.schedulingContext.zoneType === "METRO"
                      ? "Zona metropolitana · visita sin cargo. Los servicios operativos se cotizan por separado."
                      : "Costo pendiente de publicar"}
                  </p>
                )}
              </div>
              <div>
                <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500">
                  <MessageSquareText className="h-4 w-4" />
                  Confirmaciones
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  {workspace.assignment
                    ? `Cliente: ${workspace.assignment.clientConfirmation} · Evaluador: ${workspace.assignment.evaluatorConfirmation}`
                    : "Al reservar se preparan los avisos versionados para cliente y evaluador"}
                </p>
              </div>
            </section>}
            {communicationsEnabled && communicationsAccess && (communicationsAccess.canView || communicationsAccess.canPrepare && communicationsAccess.canTemplatesView) && workspace.assignment && onOpenCommunications && (
              <section className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-4" data-testid="survey-communications-link">
                <div><h3 className="text-xs font-black uppercase tracking-wide text-slate-600">Comunicaciones de Survey</h3><p className="mt-1 text-xs text-slate-500">El historial completo vive en la autoridad única de Actividad / Comunicaciones.</p></div>
                <Button size="sm" variant="outline" onClick={() => { if (workspace.assignment) onOpenCommunications(workspace.assignment.assignmentRef); }}><MessageSquareText />Ver comunicaciones de Survey</Button>
              </section>
            )}
            </div>}

            {activeView === "RESULT" && <div className="divide-y">
            <section className="p-4">
              <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500">
                <ClipboardCheck className="h-4 w-4" />
                Resultado publicado
              </h3>
              {workspace.publication ? (
                <div className="mt-2 text-sm">
                  <p className="font-bold text-slate-900">
                    Publicado{" "}
                    {new Date(workspace.publication.publishedAt).toLocaleString(
                      "es-DO",
                    )}
                  </p>
                  <p className="text-slate-600">
                    Evaluador: {workspace.publication.evaluatorDisplayName} ·
                    elementos con necesidades:{" "}
                    {workspace.publication.needs.flaggedItems}
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">
                  Todavía no existe un resultado Survey publicado.
                </p>
              )}
              {workspace.assignment && (
                <Button
                  className="mt-3"
                  size="sm"
                  onClick={() => onNavigate("/survey")}
                >
                  <ShieldCheck />
                  Abrir Survey App
                </Button>
              )}
            </section>
            </div>}
          </div>

          {activeView === "RESULT" && (
          <aside className="min-w-0 border-t bg-slate-50 p-4 xl:border-l xl:border-t-0">
            <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500">
              <History className="h-4 w-4" />
              Historial
            </h3>
            {workspace.history.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                Sin eventos de evaluación.
              </p>
            ) : (
              <ol className="mt-3 space-y-0">
                {workspace.history.map((entry) => (
                  <li
                    key={entry.eventRef}
                    className="relative border-l border-slate-300 pb-4 pl-4 text-sm before:absolute before:-left-1 before:top-1 before:h-2 before:w-2 before:rounded-full before:bg-[#0070a8]"
                  >
                    <p className="font-bold text-slate-800">
                      {HISTORY_LABELS[entry.type] || entry.type}
                    </p>
                    <p className="text-xs text-slate-500">
                      {new Date(entry.createdAt).toLocaleString("es-DO")}
                      {entry.reasonCode ? ` · ${entry.reasonCode}` : ""}
                    </p>
                    {entry.notificationRequired && (
                      <p className="text-[11px] font-semibold text-amber-700">
                        Notificación requerida
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </aside>
          )}
          </div>
        </>
      )}
    </section>
  );
}

type SurveyViewButtonProps = Readonly<{
  active: boolean;
  complete: boolean;
  disabled?: boolean;
  icon: LucideIcon;
  label: string;
  onClick(): void;
}>;

function SurveyViewButton({
  active,
  complete,
  disabled = false,
  icon: Icon,
  label,
  onClick,
}: SurveyViewButtonProps) {
  return (
    <button
      type="button"
      aria-current={active ? "step" : undefined}
      className={`flex min-h-10 items-center justify-center gap-1.5 border-b-2 px-3 py-2 text-sm font-bold transition-colors ${
        active
          ? "border-[#0070a8] bg-sky-50 text-[#003366]"
          : "border-transparent text-slate-600 hover:bg-slate-50"
      } disabled:cursor-not-allowed disabled:opacity-40`}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
      {label}
      {complete && (
        <span className="h-2 w-2 rounded-full bg-emerald-500" aria-label="Completado" />
      )}
    </button>
  );
}

function ConfirmationStatus({
  label,
  value,
}: Readonly<{ label: string; value: string }>) {
  const confirmed = /CONFIRMED|ACCEPTED|APPROVED/.test(value);
  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-3">
      <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p
        className={`mt-1 text-sm font-bold ${confirmed ? "text-emerald-700" : "text-amber-700"}`}
      >
        {confirmed ? "Confirmada" : "Pendiente"}
      </p>
      <p className="mt-1 text-[11px] text-slate-500">Estado: {value}</p>
    </div>
  );
}

type ScheduleEditorProps = Readonly<{
  workspace: SchedulingWorkspace;
  method: ScheduledEvaluationMethod;
  date: string;
  setDate(value: string): void;
  arrivalTime: string;
  setArrivalTime(value: string): void;
  availability: SurveyTimeAvailability | null;
  availabilityPending: boolean;
  availabilityError?: string;
  zoneReady: boolean;
  awaitingZone: boolean;
  onEditRoute?(): void;
  refreshAgenda(): void;
  visitLocationKey: string;
  setVisitLocationKey(value: string): void;
  durationMinutes: number;
  setDurationMinutes(value: number): void;
  evaluatorRef: string;
  setEvaluatorRef(value: string): void;
  visitReasonRef: string;
  setVisitReasonRef(value: string): void;
  reason: string;
  setReason(value: string): void;
  instruction: string;
  setInstruction(value: string): void;
  saving: boolean;
  needsException: boolean;
  exceptionRequested: boolean;
  canViewFee: boolean;
  feeApprovalPending: boolean;
  canConfirm: boolean;
  onSavePending?(): void;
  onPrepareFeeApproval?(): void;
  reprogramming: boolean;
  onSave(): void;
  onRequestException(): void;
}>;

const SCHEDULE_FIELD = "h-9 w-full min-w-0 rounded border-0 bg-slate-100 px-2.5 text-sm text-slate-900 shadow-none outline-none focus-visible:ring-2 focus-visible:ring-sky-600 disabled:opacity-50";

function ScheduleEditor({
  workspace,
  method,
  date,
  setDate,
  arrivalTime,
  setArrivalTime,
  availability,
  availabilityPending,
  availabilityError,
  zoneReady,
  awaitingZone,
  onEditRoute,
  refreshAgenda,
  visitLocationKey,
  setVisitLocationKey,
  durationMinutes,
  setDurationMinutes,
  evaluatorRef,
  setEvaluatorRef,
  visitReasonRef,
  setVisitReasonRef,
  reason,
  setReason,
  instruction,
  setInstruction,
  saving,
  needsException,
  exceptionRequested,
  canViewFee,
  feeApprovalPending,
  canConfirm,
  onSavePending,
  onPrepareFeeApproval,
  reprogramming,
  onSave,
  onRequestException,
}: ScheduleEditorProps) {
  const physicalVisit = method === "IN_PERSON";
  const location = workspace.visitLocations.find((row) => locationKey(row) === visitLocationKey);
  const locationRequired = !reprogramming && physicalVisit && workspace.visitLocations.length > 0;
  const availableEvaluators = workspace.evaluatorCandidates.filter((entry) => availability?.evaluators.includes(entry.membershipRef));
  const agendaEvaluatorRef = reprogramming ? workspace.assignment?.evaluator.membershipRef
    : evaluatorRef || workspace.evaluatorCandidates[0]?.membershipRef;
  const agendaEvaluator = reprogramming ? workspace.assignment?.evaluator
    : workspace.evaluatorCandidates.find((entry) => entry.membershipRef === agendaEvaluatorRef);
  const timezone = availability?.timezone ?? scheduleTimezone(workspace);
  const agenda = availability?.agenda ?? [];
  const visits = agenda.filter((entry) => entry.evaluatorMembershipRef === agendaEvaluatorRef)
    .map((entry) => ({ ...entry, preview: false }));
  if (evaluatorRef && availability?.scheduledStart && availability.scheduledEnd) {
    visits.push({
      evaluatorMembershipRef: evaluatorRef,
      scheduledStart: availability.scheduledStart,
      scheduledEnd: availability.scheduledEnd,
      label: "Esta visita · Por confirmar",
      outsideMetro: false,
      returnedToMetroAt: null,
      preview: true,
    });
    visits.sort((first, second) => first.scheduledStart.localeCompare(second.scheduledStart));
  }
  const outsideVisits = agenda.filter((entry) => entry.outsideMetro);
  const saturdayApproval = workspace.availability?.date === date && workspace.availability.saturdayApprovalRequired;
  const reasonRequired = reprogramming || needsException || saturdayApproval;
  const alternatives = availability && (!availableEvaluators.length || needsException) ? availability.alternatives : [];
  const valid = canConfirm && zoneReady && !feeApprovalPending && !saving
    && Boolean(evaluatorRef && availability?.scheduledStart && availability.scheduledEnd)
    && (!reasonRequired || Boolean(reason.trim()));
  const reasonRef = reprogramming ? workspace.assignment?.reason?.reasonRef : visitReasonRef;
  const canSave = valid && Boolean(availability?.slotKey)
    && (!workspace.operationalPolicy || reprogramming || Boolean(reasonRef))
    && (!locationRequired || Boolean(visitLocationKey));
  const canRequestException = valid && Boolean(workspace.operationalPolicy?.canRequestException && reasonRef) && !exceptionRequested;
  const zoneType = (!reprogramming ? location?.metroZone : null) ?? workspace.schedulingContext?.zoneType ?? null;
  const zone = zoneType === "METRO" ? "Zona metro" : zoneType ? "Fuera de zona metro" : "Zona por confirmar";
  const fee = workspace.visitFee;
  const feeLabel = fee?.disposition === "WAIVED" ? "Exonerada" : zoneType === "METRO" || fee?.disposition === "FREE"
    ? "Sin cargo" : fee?.suggestedAmount != null && fee.currency
      ? new Intl.NumberFormat("es-DO", { style: "currency", currency: fee.currency }).format(fee.suggestedAmount)
      : "Cargo por confirmar";
  const durations = [...new Set([30, 45, 60, durationMinutes])].sort((first, second) => first - second);
  const scheduleLabel = reprogramming ? "Confirmar reprogramación" : "Confirmar visita";

  return (
    <div className="grid min-w-0 gap-x-5 gap-y-4 md:grid-cols-[minmax(0,1.2fr)_minmax(14rem,1fr)]" data-testid="survey-schedule-editor">
      <div className="min-w-0 space-y-3">
        {physicalVisit && !reprogramming && (
          <div>
            {locationRequired && <>
              <Label htmlFor="survey-location">Lugar de la visita</Label>
              <select id="survey-location" className={SCHEDULE_FIELD} value={visitLocationKey} disabled={saving} onChange={(event) => setVisitLocationKey(event.target.value)}>
                <option value="" disabled>Seleccione la dirección</option>
                {workspace.visitLocations.map((entry) => (
                  <option key={locationKey(entry)} value={locationKey(entry)}>
                    {locationRoleLabel(entry.role)} · {entry.compactAddress || entry.sector || entry.cityMunicipality}
                  </option>
                ))}
              </select>
            </>}
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" aria-live="polite">
              <span className={zoneReady && zoneType === "METRO" ? "text-emerald-800" : "text-amber-800"}>
                {awaitingZone ? "Verificando dirección…" : zone + (canViewFee && zoneType ? " · " + feeLabel : "")}
              </span>
              {!awaitingZone && !zoneReady && <>
                <span className="text-slate-600">
                  {!location ? "Registre la dirección donde será la visita."
                    : workspace.schedulingIssue === "CRM_SURVEY_SCHEDULE_POLICY_NOT_READY" ? "La agenda de visitas requiere configuración."
                    : zoneType ? "Confirme la distancia o la cobertura de la agenda."
                    : "Seleccione una dirección del caso que tenga cobertura."}
                </span>
                {onEditRoute && <button type="button" className="font-semibold text-sky-800 underline" onClick={onEditRoute}>Editar dirección del caso</button>}
              </>}
              {feeApprovalPending && <span className="font-semibold text-amber-800">Pendiente de autorización del cliente</span>}
            </div>
            {location?.arrivalReference && <p className="mt-1 text-xs text-slate-600">{location.arrivalReference}</p>}
          </div>
        )}
        {method === "VIRTUAL" && <p className="text-xs text-slate-600">Visita virtual · sin traslado</p>}
        <div className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(5.5rem,.62fr)]">
          <div>
            <Label htmlFor="survey-date">Fecha</Label>
            <Input id="survey-date" type="date" className={SCHEDULE_FIELD} disabled={!zoneReady || saving} value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="survey-arrival">Hora de llegada</Label>
            <Input id="survey-arrival" type="time" className={SCHEDULE_FIELD} disabled={!zoneReady || saving} value={arrivalTime} onChange={(event) => setArrivalTime(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="survey-duration">Duración</Label>
            <select id="survey-duration" className={SCHEDULE_FIELD} disabled={saving} value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))}>
              {durations.map((minutes) => <option key={minutes} value={minutes}>{minutes} min</option>)}
            </select>
          </div>
        </div>

        <div aria-live="polite" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {availabilityPending ? <span className="text-slate-600">Consultando disponibilidad…</span>
            : availabilityError ? <>
              <span className="text-red-700">{availabilityError}</span>
              <Button size="icon-sm" variant="ghost" title="Reintentar consulta" aria-label="Reintentar consulta" onClick={refreshAgenda}><RefreshCw /></Button>
            </> : zoneReady && date && arrivalTime && !availability ? <span className="text-amber-800">La agenda aún no está configurada para esta visita.</span>
            : availability && needsException && availableEvaluators.length > 0 ? <span className="rounded bg-amber-50 px-2 py-1 font-semibold text-amber-900">Requiere autorización extraordinaria</span>
            : availability && availableEvaluators.length > 0 ? <span className="rounded bg-emerald-50 px-2 py-1 font-semibold text-emerald-800">{saturdayApproval ? "Disponible con autorización de sábado" : "Hora disponible"}</span>
            : availability ? <span className="rounded bg-amber-50 px-2 py-1 font-semibold text-amber-900">Hora sin disponibilidad</span>
            : null}
          {alternatives.length > 0 && <>
            <span className="font-medium text-slate-700">Horarios disponibles</span>
            {alternatives.map((alternative) => (
              <Button key={alternative.time} size="sm" variant="ghost" className="h-7 bg-sky-50 px-2 text-xs text-sky-900 hover:bg-sky-100"
                onClick={() => setArrivalTime(alternative.time)}>
                {clientTime(alternative.time)}
              </Button>
            ))}
          </>}
          {availability && availableEvaluators.length === 0 && alternatives.length === 0 && <span className="text-slate-600">Pruebe otra fecha.</span>}
        </div>

        {!reprogramming && <div>
          <Label htmlFor="survey-evaluator">Evaluador disponible</Label>
          <select id="survey-evaluator" className={SCHEDULE_FIELD} value={evaluatorRef} disabled={availableEvaluators.length === 0}
            onChange={(event) => setEvaluatorRef(event.target.value)}>
            <option value="" disabled>{availability ? "Sin evaluadores para esta hora" : "Consulte una hora de llegada"}</option>
            {availableEvaluators.map((entry) => <option key={entry.membershipRef} value={entry.membershipRef}>{entry.displayName}</option>)}
          </select>
        </div>}
        {!reprogramming && (
          <div className="grid gap-2 sm:grid-cols-2">
            {workspace.operationalPolicy && <div>
              <Label htmlFor="survey-visit-reason">Tipo de visita</Label>
              <select id="survey-visit-reason" className={SCHEDULE_FIELD} value={visitReasonRef} onChange={(event) => setVisitReasonRef(event.target.value)}>
                <option value="" disabled>Seleccione</option>
                {workspace.visitReasons.map((entry) => <option key={entry.reasonRef} value={entry.reasonRef}>{entry.name}</option>)}
              </select>
            </div>}
            <div className={workspace.operationalPolicy ? undefined : "sm:col-span-2"}>
              <Label htmlFor="survey-evaluator-instruction">Notas para el evaluador</Label>
              <Input id="survey-evaluator-instruction" className={SCHEDULE_FIELD} value={instruction} maxLength={1000}
                placeholder="Acceso, alcance o indicaciones" onChange={(event) => setInstruction(event.target.value)} />
            </div>
          </div>
        )}
        {reasonRequired && <div>
          <Label htmlFor="schedule-reason">{reprogramming ? "Motivo de reprogramación" : "Motivo para la autorización"}</Label>
          <Input id="schedule-reason" className={SCHEDULE_FIELD} value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} />
        </div>}
        <div className="flex flex-wrap items-center gap-2">
          {feeApprovalPending && onPrepareFeeApproval
            ? <Button size="sm" disabled={saving} onClick={onPrepareFeeApproval}>Solicitar autorización</Button>
            : canConfirm && <Button size="sm" disabled={needsException ? !canRequestException : !canSave} onClick={needsException ? onRequestException : onSave}>
              {saving ? "Guardando…" : needsException ? exceptionRequested ? "Excepción solicitada" : "Solicitar excepción" : scheduleLabel}
            </Button>}
          {onSavePending && <Button size="sm" variant="ghost" disabled={saving} onClick={onSavePending}>Guardar pendiente</Button>}
        </div>
      </div>

      <section className="min-w-0 md:pl-2" aria-label="Agenda del evaluador">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[#003366]"><CalendarClock className="size-4" /> Agenda del día</h3>
        {availability && agendaEvaluator ? (
          <>
            <p className="mt-1 text-xs text-slate-600">{agendaEvaluator.displayName}</p>
            {visits.length ? (
              <table className="mt-2 w-full text-left text-xs" aria-label={"Visitas de " + agendaEvaluator.displayName}>
                <thead className="bg-slate-100 text-slate-600"><tr><th scope="col" className="px-2 py-1.5">Hora</th><th scope="col" className="px-2 py-1.5">Visita</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {visits.map((visit) => <tr key={visit.scheduledStart + visit.label} className={visit.preview ? "bg-sky-50 font-medium text-sky-950" : undefined}>
                    <td className="whitespace-nowrap px-2 py-1.5">{agendaTime(visit.scheduledStart, timezone)}{visit.scheduledEnd ? " – " + agendaTime(visit.scheduledEnd, timezone) : ""}</td>
                    <td className="px-2 py-1.5">{visit.label}</td>
                  </tr>)}
                </tbody>
              </table>
            ) : <p className="mt-2 text-xs text-slate-600">Sin otras visitas programadas.</p>}
          </>
        ) : (
          <p className="mt-2 text-xs text-slate-600">{availability ? "No hay evaluadores para esta consulta." : "Seleccione fecha y hora para consultar la agenda."}</p>
        )}
        {outsideVisits.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs" aria-label="Visitas fuera de zona metro">
            {outsideVisits.map((visit) => {
              const name = workspace.evaluatorCandidates.find((entry) => entry.membershipRef === visit.evaluatorMembershipRef)?.displayName;
              if (!name) return null;
              return (
                <li key={visit.evaluatorMembershipRef + visit.scheduledStart}
                  className={visit.returnedToMetroAt ? "rounded bg-emerald-50 px-2 py-1.5 text-emerald-900" : "rounded bg-amber-50 px-2 py-1.5 text-amber-900"}>
                  <strong>{name}</strong>{" · "}
                  {visit.returnedToMetroAt ? "Regreso registrado a las " + agendaTime(visit.returnedToMetroAt, timezone) : "Fuera de zona metro · regreso pendiente"}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
