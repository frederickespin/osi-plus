import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarClock,
  ClipboardCheck,
  FileCheck2,
  History,
  ListChecks,
  MapPin,
  MessageSquareText,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  UserCog,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import type { EvaluationMethod, SchedulingWorkspace, SurveyTimeAvailability } from "./schedulingTypes";
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
  access: SurveySchedulingUiAccess;
  intakeMethod?: SurveyIntakeMethod;
  communicationsEnabled?: boolean;
  communicationsAccess?: CommunicationsAccess;
  logisticsSummaryEnabled?: boolean;
  transportAccess?: TransportUiAccess;
  clientTemporaryAccessEnabled?: boolean;
  clientTemporaryAccess?: ClientTemporaryAccessUi;
  onOpenCommunications?(surveyAssignmentRef: string): void;
  onNavigate(pathname: string): void;
  onUnauthorized(): void;
}>;

type SurveyWorkspaceView = "REQUEST" | "SCHEDULE" | "RESULT";

const METHOD_LABELS: Readonly<Record<EvaluationMethod, string>> = Object.freeze(
  {
    IN_PERSON: "Visita presencial",
    VIRTUAL: "Visita virtual",
    CLIENT_PHOTOS_DOCUMENTS: "Listado + fotografías",
    WRITTEN_REPORT: "Reporte o listado escrito",
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
function canOpenScheduling(decision: SchedulingWorkspace["decision"] | undefined) {
  return Boolean(decision && [
    "READY_TO_SCHEDULE",
    "SCHEDULED",
    "IN_PROGRESS",
    "COMPLETED",
    "CANCELLED",
  ].includes(decision.state));
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
  access,
  intakeMethod,
  communicationsEnabled = false,
  communicationsAccess,
  clientTemporaryAccessEnabled = false,
  clientTemporaryAccess,
  onOpenCommunications,
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
  const [method, setMethod] = useState<EvaluationMethod>("IN_PERSON");
  const [date, setDate] = useState("");
  const [arrivalTime, setArrivalTime] = useState("");
  const [evaluatorRef, setEvaluatorRef] = useState("");
  const [visitReasonRef, setVisitReasonRef] = useState("");
  const [chosenLocationKey, setVisitLocationKey] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [reason, setReason] = useState("");
  const [instruction, setInstruction] = useState("");
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [editingEvaluator, setEditingEvaluator] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [activeView, setActiveView] =
    useState<SurveyWorkspaceView>("REQUEST");
  const [agendaRefresh, setAgendaRefresh] = useState(0);
  const [agendaResponse, setAgendaResponse] = useState<{
    key: string;
    workspace?: SchedulingWorkspace;
    error?: string;
  } | null>(null);
  const loadVersion = useRef(0);
  const openedIntake = useRef<string | null>(null);

  const load = useCallback(
    async () => {
      const version = ++loadVersion.current;
      setLoading(true);
      setError(null);
      try {
        const [nextWorkspace, nextCommercial] =
          await Promise.all([
            api.workspace(caseRef),
            isCommercialRelationshipsUiEnabled()
              ? commercialApi.caseContext(caseRef)
              : Promise.resolve(null),
          ]);
        if (version !== loadVersion.current) return;
        setWorkspace(nextWorkspace);
        setCommercialContext(nextCommercial);
        const decision = nextWorkspace.decision;
        const intakeKey = intakeMethod ? `${caseRef}:${intakeMethod}` : null;
        if (intakeMethod && openedIntake.current !== intakeKey) {
          openedIntake.current = intakeKey;
          const requestedMethod = intakeMethod === "SPECIAL" ? "IN_PERSON" : intakeMethod;
          const hasAppointment = nextWorkspace.assignment && nextWorkspace.assignment.status !== "CANCELLED";
          const canPrepareRequest = access.canManage && !hasAppointment;
          const readyForRequestedMethod = decision?.method === requestedMethod && decision.state === "READY_TO_SCHEDULE";
          setMethod(canPrepareRequest ? requestedMethod : decision?.method ?? "IN_PERSON");
          if (canPrepareRequest && intakeMethod === "SPECIAL") setInstruction("Visita especial. ");
          setActiveView(canOpenScheduling(decision) && (!canPrepareRequest || readyForRequestedMethod) ? "SCHEDULE" : "REQUEST");
        } else if (decision) {
          setMethod(decision.method);
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
      commercialApi,
      access.canManage,
      intakeMethod,
      onUnauthorized,
    ],
  );
  useEffect(() => {
    void load();
    return () => { loadVersion.current += 1; };
  }, [load]);

  const selectedVisitLocation = workspace?.visitLocations.find(
    (location) => locationKey(location) === chosenLocationKey,
  ) ?? workspace?.visitLocations.find((location) => location.role === "ORIGIN")
    ?? workspace?.visitLocations[0];
  const visitLocationKey = selectedVisitLocation ? locationKey(selectedVisitLocation) : "";
  const assignment = workspace?.assignment;
  const creatingSchedule = workspace?.decision?.state === "READY_TO_SCHEDULE" && access.canAssign;
  const canEditSchedule = activeView === "SCHEDULE" && (creatingSchedule || editingSchedule);
  const queryLocation = !editingSchedule && workspace?.decision?.method === "IN_PERSON"
    ? visitLocationKey
    : "";
  const hasRequestedTime = Boolean(date && /^\d{2}:\d{2}$/.test(arrivalTime));
  const queryKey = canEditSchedule && (hasRequestedTime || (queryLocation && chosenLocationKey))
    ? JSON.stringify([caseRef, date, arrivalTime, durationMinutes, queryLocation, editingSchedule, agendaRefresh])
    : "";
  const currentAgenda = agendaResponse?.key === queryKey ? agendaResponse : null;
  const exactAvailability = currentAgenda?.workspace?.timeAvailability ?? null;
  const eligibleEvaluators = exactAvailability?.evaluators ?? [];
  const selectedEvaluatorRef = eligibleEvaluators.includes(evaluatorRef) ? evaluatorRef : eligibleEvaluators[0] ?? "";
  const availabilityPending = Boolean(hasRequestedTime && queryKey && !currentAgenda);
  const scheduleNeedsException = Boolean(exactAvailability?.requiresApproval || (queryKey && exceptionQueryKey === queryKey));

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
          rescheduling: editingSchedule,
          signal: abort.signal,
        });
        if (abort.signal.aborted) return;
        setAgendaResponse({ key: queryKey, workspace: updated });
        if (updated.timeAvailability?.agenda.some((visit) => visit.outsideMetro && !visit.returnedToMetroAt)) {
          timer = window.setTimeout(checkAvailability, 30_000);
        }
      } catch (cause) {
        if (abort.signal.aborted) return;
        if ((cause as {status?: number})?.status === 401) onUnauthorized();
        setAgendaResponse({ key: queryKey, error: "No se pudo consultar la agenda." });
      }
    };
    timer = window.setTimeout(checkAvailability, 200);
    return () => {
      window.clearTimeout(timer);
      abort.abort();
    };
  }, [api, queryKey, caseRef, date, arrivalTime, durationMinutes, queryLocation, editingSchedule, hasRequestedTime, onUnauthorized]);

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
  const saveDecision = async () => {
    const saved = await mutate(() =>
      api.decide({
        caseRef,
        expectedVersion: workspace?.decision?.version || null,
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
      }),
    );
    if (saved && ["IN_PERSON", "VIRTUAL", "MINI"].includes(method)) {
      setActiveView("SCHEDULE");
    }
  };
  const saveSchedule = async () => {
    if (!workspace?.decision || !exactAvailability?.slotKey || !exactAvailability.scheduledStart || !exactAvailability.scheduledEnd || !selectedEvaluatorRef) return;
    const saturday = new Date(`${date}T12:00:00`).getDay() === 6;
    setSaving(true);
    setError(null);
    setNotice(null);
    setExceptionQueryKey("");
    try {
      await api.schedule({
        decisionRef: workspace.decision.decisionRef,
        expectedDecisionVersion: workspace.decision.version,
        evaluatorMembershipRef: selectedEvaluatorRef,
        scheduledStart: exactAvailability.scheduledStart,
        scheduledEnd: exactAvailability.scheduledEnd,
        slotKey: exactAvailability.slotKey,
        instruction: instruction.trim() || null,
        saturdayApprovalReason: saturday ? reason || null : null,
        ...(workspace.decision.method === "IN_PERSON" && selectedVisitLocation
          ? {
              visitRouteRole: selectedVisitLocation.role,
              visitRouteOrder: selectedVisitLocation.order,
            }
          : {}),
        visitReasonRef: workspace.operationalPolicy
          ? visitReasonRef || null
          : null,
      });
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
      !workspace?.decision ||
      !exactAvailability?.scheduledStart ||
      !exactAvailability.scheduledEnd ||
      !reasonRef ||
      !selectedEvaluatorRef ||
      !reason
    )
      return;
    const evaluator = workspace.evaluatorCandidates.find(
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
        method: workspace.decision.method,
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
  const canOpenSchedule = canOpenScheduling(workspace?.decision);
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
            className="grid border-b bg-white sm:grid-cols-3"
            data-testid="survey-workspace-views"
          >
            <SurveyViewButton
              active={activeView === "REQUEST"}
              complete={Boolean(workspace.decision)}
              icon={ListChecks}
              label="Solicitud"
              onClick={() => setActiveView("REQUEST")}
            />
            <SurveyViewButton
              active={activeView === "SCHEDULE"}
              complete={Boolean(workspace.assignment)}
              disabled={!canOpenSchedule}
              icon={CalendarClock}
              label="Programación"
              onClick={() => setActiveView("SCHEDULE")}
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
            {activeView === "REQUEST" && <div className="divide-y">
            {commercialContext && (
              <section
                className="bg-sky-50/50 p-4"
                data-testid="scheduling-commercial-context"
              >
                <h3 className="text-xs font-black uppercase tracking-wide text-[#003366]">
                  Contexto comercial para Scheduling
                </h3>
                <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="font-bold text-slate-500">Booker</dt>
                    <dd className="font-semibold">
                      {commercialContext.parties.find(
                        (item) => item.role === "BOOKER",
                      )?.displayName || "No definido"}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-bold text-slate-500">Lead Account</dt>
                    <dd className="font-semibold">
                      {commercialContext.parties.find(
                        (item) => item.role === "LEAD_ACCOUNT",
                      )?.displayName || "No definido"}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-bold text-slate-500">
                      Contactos relevantes
                    </dt>
                    <dd className="font-semibold">
                      {commercialContext.parties
                        .filter((item) =>
                          ["BOOKER", "LEAD_ACCOUNT"].includes(item.role),
                        )
                        .flatMap((item) => item.contacts)
                        .map((item) => item.displayName)
                        .join(" · ") || "No definido"}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-bold text-slate-500">
                      Instrucciones especiales
                    </dt>
                    <dd className="font-semibold">
                      {commercialContext.instructions.length
                        ? `${commercialContext.instructions.length} publicada(s)`
                        : "No definido"}
                    </dd>
                  </div>
                </dl>
              </section>
            )}
            <section
              className="p-4"
              aria-labelledby="evaluation-decision-title"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3
                    id="evaluation-decision-title"
                    className="text-xs font-black uppercase tracking-wide text-slate-500"
                  >
                    Solicitud y método
                  </h3>
                  <p className="mt-1 text-lg font-black text-[#003366]">
                    {workspace.decision
                      ? METHOD_LABELS[workspace.decision.method]
                      : "Pendiente de seleccionar método"}
                  </p>
                  <p className="text-sm text-slate-600">
                    {
                      STATE_LABELS[
                        workspace.decision?.state || "PENDING_METHOD"
                      ]
                    }
                  </p>
                </div>
                {workspace.decision && (
                  <Badge variant="outline">v{workspace.decision.version}</Badge>
                )}
              </div>
              {access.canManage &&
                (!workspace.assignment ||
                  workspace.assignment.status === "CANCELLED") && (
                  <div className="mt-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end"><div className="min-w-0 flex-1">
                      <Label htmlFor="survey-method">
                        Método de Survey
                      </Label>
                      <Select
                        value={method}
                        onValueChange={(value) =>
                          setMethod(value as EvaluationMethod)
                        }
                      >
                        <SelectTrigger id="survey-method">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(METHOD_LABELS).map(
                            ([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button disabled={saving} onClick={() => void saveDecision()}>{saving ? "Guardando…" : workspace.decision ? "Actualizar solicitud" : "Crear solicitud"}</Button></div>
                    <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2" data-testid="survey-method-guidance">
                      <p className="border-l-2 border-sky-400 pl-2"><strong>Presencial o especial:</strong> usa la dirección del caso, calcula zona/costo y reserva traslado.</p>
                      <p className="border-l-2 border-violet-400 pl-2"><strong>Virtual:</strong> reserva evaluador y hora, sin tiempo ni costo de traslado.</p>
                    </div>
                  </div>
                )}
            </section>

            </div>}

            {activeView === "SCHEDULE" && <div className="divide-y">
            <section className="p-4" aria-label="Programación de visita">
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
                      La ruta cambió. Debe revalidarse zona, Visit Fee y
                      disponibilidad antes de continuar.
                    </p>
                  )}
                </div>
                {workspace.assignment && (
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
              {canEditSchedule && (
                  <ScheduleEditor
                    workspace={currentAgenda?.workspace ?? workspace}
                    date={date}
                    setDate={setDate}
                    arrivalTime={arrivalTime}
                    setArrivalTime={setArrivalTime}
                    availability={exactAvailability}
                    availabilityPending={availabilityPending}
                    availabilityError={currentAgenda?.error}
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

            {!canEditSchedule && <section className="grid gap-3 bg-slate-50 p-4 sm:grid-cols-2" data-testid="survey-visit-readiness">
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
      className={`flex min-h-14 items-center justify-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition-colors sm:border-b-4 ${
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
  date: string;
  setDate(value: string): void;
  arrivalTime: string;
  setArrivalTime(value: string): void;
  availability: SurveyTimeAvailability | null;
  availabilityPending: boolean;
  availabilityError?: string;
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
  reprogramming: boolean;
  onSave(): void;
  onRequestException(): void;
}>;

const SCHEDULE_FIELD = "h-9 w-full min-w-0 rounded border-0 bg-slate-100 px-2.5 text-sm text-slate-900 shadow-none outline-none focus-visible:ring-2 focus-visible:ring-sky-600 disabled:opacity-50";

function ScheduleEditor({
  workspace,
  date,
  setDate,
  arrivalTime,
  setArrivalTime,
  availability,
  availabilityPending,
  availabilityError,
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
  reprogramming,
  onSave,
  onRequestException,
}: ScheduleEditorProps) {
  const physicalVisit = workspace.decision?.method === "IN_PERSON";
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
  const valid = !saving && Boolean(evaluatorRef && availability?.scheduledStart && availability.scheduledEnd)
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
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
          <strong className="text-sm text-[#003366]">{METHOD_LABELS[workspace.decision?.method ?? "IN_PERSON"]}</strong>
          {physicalVisit ? (
            <span className={zoneType === "METRO" ? "text-emerald-800" : "text-amber-800"}>
              {zone}{canViewFee && zoneType ? " · " + feeLabel : ""}
            </span>
          ) : workspace.decision?.method === "VIRTUAL" ? <span>Sin traslado</span> : null}
        </div>
        {locationRequired && (
          <div>
            <Label htmlFor="survey-location">Lugar de la visita</Label>
            <select id="survey-location" className={SCHEDULE_FIELD} value={visitLocationKey} onChange={(event) => setVisitLocationKey(event.target.value)}>
              <option value="" disabled>Seleccione la dirección</option>
              {workspace.visitLocations.map((entry) => (
                <option key={locationKey(entry)} value={locationKey(entry)}>
                  {locationRoleLabel(entry.role)} · {entry.compactAddress || entry.sector || entry.cityMunicipality}
                </option>
              ))}
            </select>
            {location?.arrivalReference && <p className="mt-1 text-xs text-slate-600">{location.arrivalReference}</p>}
          </div>
        )}
        <div className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(5.5rem,.62fr)]">
          <div>
            <Label htmlFor="survey-date">Fecha</Label>
            <Input id="survey-date" type="date" className={SCHEDULE_FIELD} value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="survey-arrival">Hora de llegada</Label>
            <Input id="survey-arrival" type="time" className={SCHEDULE_FIELD} value={arrivalTime} onChange={(event) => setArrivalTime(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="survey-duration">Duración</Label>
            <select id="survey-duration" className={SCHEDULE_FIELD} value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))}>
              {durations.map((minutes) => <option key={minutes} value={minutes}>{minutes} min</option>)}
            </select>
          </div>
        </div>

        <div aria-live="polite" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {availabilityPending ? <span className="text-slate-600">Consultando disponibilidad…</span>
            : availabilityError ? <>
              <span className="text-red-700">{availabilityError}</span>
              <Button size="icon-sm" variant="ghost" title="Reintentar consulta" aria-label="Reintentar consulta" onClick={refreshAgenda}><RefreshCw /></Button>
            </> : date && arrivalTime && !availability ? <span className="text-amber-800">Confirme la zona y la configuración de agenda para consultar horarios.</span>
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
              <Input id="survey-evaluator-instruction" className={SCHEDULE_FIELD} value={instruction}
                placeholder="Acceso, alcance o indicaciones" onChange={(event) => setInstruction(event.target.value)} />
            </div>
          </div>
        )}
        {reasonRequired && <div>
          <Label htmlFor="schedule-reason">{reprogramming ? "Motivo de reprogramación" : "Motivo para la autorización"}</Label>
          <Input id="schedule-reason" className={SCHEDULE_FIELD} value={reason} onChange={(event) => setReason(event.target.value)} />
        </div>}
        <Button size="sm" disabled={needsException ? !canRequestException : !canSave} onClick={needsException ? onRequestException : onSave}>
          {saving ? "Guardando…" : needsException ? exceptionRequested ? "Excepción solicitada" : "Solicitar excepción" : scheduleLabel}
        </Button>
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
