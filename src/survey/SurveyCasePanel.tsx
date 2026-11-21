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
  UserRound,
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
import type { EvaluationMethod, SchedulingWorkspace } from "./schedulingTypes";
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

type Props = Readonly<{
  caseRef: string;
  authorization?: string;
  access: SurveySchedulingUiAccess;
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
function localDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00`).toISOString();
}
function localDateTimeAfter(date: string, time: string, minutes: number) {
  const value = new Date(`${date}T${time}:00`);
  value.setMinutes(value.getMinutes() + minutes);
  return value.toISOString();
}
function timeMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}
function clientTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return new Intl.DateTimeFormat("es-DO", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2000, 0, 1, hours, minutes));
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
function defaultDuration(method: EvaluationMethod) {
  return method === "IN_PERSON" ? 45 : 30;
}
function schedulingErrorMessage(code: string) {
  if (code === "CRM_SURVEY_INTERIOR_DAILY_LIMIT")
    return "Este evaluador ya tiene una visita fuera de la zona metropolitana en esa fecha. Seleccione otro evaluador o cambie el día.";
  if (code === "PERSONNEL_AFTER_HOURS_REQUEST_REQUIRED")
    return "El horario seleccionado requiere autorización extraordinaria.";
  if (code === "PERSONNEL_EVALUATOR_UNAVAILABLE")
    return "El evaluador no dispone del tiempo de visita y traslado necesario. Seleccione otro horario o evaluador.";
  if (code === "CRM_SURVEY_SLOT_FULL")
    return "Ese horario acaba de ocuparse. Seleccione otro disponible.";
  return code;
}
function appointmentCopy(workspace: SchedulingWorkspace) {
  if (!workspace.assignment) return "Aún no existe una cita.";
  return new Intl.DateTimeFormat("es-DO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(workspace.assignment.scheduledStart));
}

export default function SurveyCasePanel({
  caseRef,
  authorization,
  access,
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
  const [scheduleNeedsException, setScheduleNeedsException] = useState(false);
  const [method, setMethod] = useState<EvaluationMethod>("IN_PERSON");
  const [date, setDate] = useState("");
  const [slotKey, setSlotKey] = useState("");
  const [evaluatorRef, setEvaluatorRef] = useState("");
  const [visitReasonRef, setVisitReasonRef] = useState("");
  const [visitLocationKey, setVisitLocationKey] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [reason, setReason] = useState("");
  const [instruction, setInstruction] = useState("");
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [editingEvaluator, setEditingEvaluator] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [activeView, setActiveView] =
    useState<SurveyWorkspaceView>("REQUEST");
  const loadVersion = useRef(0);

  const load = useCallback(
    async (availabilityDate?: string, selectedLocation?: string) => {
      const version = ++loadVersion.current;
      setLoading(true);
      setError(null);
      try {
        const [nextWorkspace, nextCommercial] =
          await Promise.all([
            api.workspace(caseRef, availabilityDate, selectedLocation),
            isCommercialRelationshipsUiEnabled()
              ? commercialApi.caseContext(caseRef)
              : Promise.resolve(null),
          ]);
        if (version !== loadVersion.current) return;
        setWorkspace(nextWorkspace);
        if (nextWorkspace.decision) setMethod(nextWorkspace.decision.method);
        setCommercialContext(nextCommercial);
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
      onUnauthorized,
    ],
  );
  useEffect(() => {
    void load();
    return () => { loadVersion.current += 1; };
  }, [load]);

  const slots = useMemo(
    () =>
      workspace?.policy?.slots.filter(
        (slot) => slot.profile === workspace.schedulingContext?.profile,
      ) || [],
    [workspace],
  );
  const selectedSlot = slots.find((slot) => slot.key === slotKey);
  const selectedVisitLocation = workspace?.visitLocations.find(
    (location) => locationKey(location) === visitLocationKey,
  );
  function changeVisitLocation(value: string) {
    setVisitLocationKey(value);
    if (selectedVisitLocation?.metroZone !== undefined) void load(date, value);
  }
  useEffect(() => {
    if (!workspace) return;
    const availableKeys = new Set(
      workspace.availability?.slots
        .filter((slot) => slot.available)
        .map((slot) => slot.key) || [],
    );
    const recommendedSlot = slots.find(
      (slot) => !workspace.availability || availableKeys.has(slot.key),
    );
    const selectedAvailability = workspace.availability?.slots.find(
      (slot) => slot.key === slotKey,
    );
    if (
      !slotKey ||
      !slots.some((slot) => slot.key === slotKey) ||
      selectedAvailability?.available === false
    )
      setSlotKey(recommendedSlot?.key || "");
    const currentEvaluator = workspace.evaluatorCandidates.find(
      (candidate) => candidate.membershipRef === evaluatorRef,
    );
    if (
      !currentEvaluator ||
      (currentEvaluator.dailyLimit !== null &&
        currentEvaluator.dailyAssigned >= currentEvaluator.dailyLimit)
    )
      setEvaluatorRef(
        (workspace.evaluatorCandidates.find(
          (candidate) =>
            candidate.dailyLimit === null ||
            candidate.dailyAssigned < candidate.dailyLimit,
        ) || workspace.evaluatorCandidates[0])?.membershipRef || "",
      );
    if (
      !visitReasonRef ||
      !workspace.visitReasons.some(
        (visitReason) => visitReason.reasonRef === visitReasonRef,
      )
    )
      setVisitReasonRef(workspace.visitReasons[0]?.reasonRef || "");
    if (
      !visitLocationKey ||
      !workspace.visitLocations.some(
        (location) => locationKey(location) === visitLocationKey,
      )
    ) {
      const location =
        workspace.visitLocations.find((entry) => entry.role === "ORIGIN") ||
        workspace.visitLocations[0];
      setVisitLocationKey(location ? locationKey(location) : "");
    }
  }, [
    evaluatorRef,
    slotKey,
    slots,
    visitLocationKey,
    visitReasonRef,
    workspace,
  ]);
  useEffect(() => {
    setDurationMinutes(defaultDuration(workspace?.decision?.method || method));
  }, [method, workspace?.decision?.method]);
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
    if (!workspace?.decision || !selectedSlot || !date || !evaluatorRef) return;
    const saturday = new Date(`${date}T12:00:00`).getDay() === 6;
    setSaving(true);
    setError(null);
    setNotice(null);
    setScheduleNeedsException(false);
    try {
      await api.schedule({
        decisionRef: workspace.decision.decisionRef,
        expectedDecisionVersion: workspace.decision.version,
        evaluatorMembershipRef: evaluatorRef,
        scheduledStart: localDateTime(date, selectedSlot.startTime),
        scheduledEnd: localDateTimeAfter(
          date,
          selectedSlot.startTime,
          durationMinutes,
        ),
        slotKey,
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
      setScheduleNeedsException(
        code === "PERSONNEL_AFTER_HOURS_REQUEST_REQUIRED",
      );
    } finally {
      setSaving(false);
    }
  };
  const requestScheduleException = async () => {
    if (
      !workspace?.decision ||
      !selectedSlot ||
      !date ||
      !visitReasonRef ||
      !reason
    )
      return;
    const evaluator = workspace.evaluatorCandidates.find(
      (entry) => entry.membershipRef === evaluatorRef,
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
        assignmentRef: null,
        profileRef: evaluator.profileRef,
        reasonRef: visitReasonRef,
        method: workspace.decision.method,
        requestedStart: localDateTime(date, selectedSlot.startTime),
        requestedEnd: localDateTimeAfter(
          date,
          selectedSlot.startTime,
          durationMinutes,
        ),
        requesterOrigin: "SALES",
        reasonDescription: reason,
      });
      setScheduleNeedsException(false);
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
    if (!workspace?.assignment || !selectedSlot || !date || !reason) return;
    const saturday = new Date(`${date}T12:00:00`).getDay() === 6;
    void mutate(() =>
      api.reschedule({
        assignmentRef: workspace.assignment!.assignmentRef,
        expectedVersion: workspace.assignment!.version,
        scheduledStart: localDateTime(date, selectedSlot.startTime),
        scheduledEnd: localDateTimeAfter(
          date,
          selectedSlot.startTime,
          durationMinutes,
        ),
        slotKey,
        reasonCode: reason,
        notificationRequired: true,
        saturdayApprovalReason: saturday ? reason : null,
      }),
    ).then(() => setEditingSchedule(false));
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
  const canOpenSchedule = Boolean(
    workspace?.decision &&
      [
        "READY_TO_SCHEDULE",
        "SCHEDULED",
        "IN_PROGRESS",
        "COMPLETED",
        "CANCELLED",
      ].includes(workspace.decision.state),
  );
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
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50 px-4 py-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.18em] text-indigo-600">
            Comercial · Survey / Scheduling
          </p>
          <h2 className="text-lg font-black text-[#003366]">
            Coordinar Survey
          </h2>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()}>
          <RefreshCw />
          Actualizar
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
      {scheduleNeedsException &&
        workspace?.operationalPolicy?.canRequestException && (
          <div className="m-4 flex flex-wrap items-center justify-between gap-3 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <span>
              El horario requiere una excepción. Indique el motivo y solicite
              coordinación.
            </span>
            <Button
              disabled={saving || !reason}
              onClick={() => void requestScheduleException()}
            >
              Solicitar excepción
            </Button>
          </div>
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
            <section className="p-4" aria-labelledby="evaluation-agenda-title">
              <div className="flex flex-wrap items-start justify-between gap-2">
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
                  {workspace.assignment?.routeStale && (
                    <p className="mt-2 rounded bg-amber-50 p-2 text-xs font-semibold text-amber-900">
                      La ruta cambió. Debe revalidarse zona, Visit Fee y
                      disponibilidad antes de continuar.
                    </p>
                  )}
                </div>
                {workspace.assignment && (
                  <div className="flex flex-wrap gap-2">
                    {access.canReschedule && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingSchedule((value) => !value);
                          setEditingEvaluator(false);
                          setCancelling(false);
                        }}
                      >
                        <RotateCcw />
                        Reprogramar
                      </Button>
                    )}
                    {access.canAssign && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingEvaluator((value) => !value);
                          setEditingSchedule(false);
                          setCancelling(false);
                        }}
                      >
                        <UserCog />
                        Cambiar evaluador
                      </Button>
                    )}
                    {access.canManage && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setCancelling((value) => !value);
                          setEditingSchedule(false);
                          setEditingEvaluator(false);
                        }}
                      >
                        <XCircle />
                        Cancelar cita
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {workspace.decision?.state === "READY_TO_SCHEDULE" &&
                access.canAssign && (
                  <ScheduleEditor
                    workspace={workspace}
                    date={date}
                    setDate={(value) => {
                      setDate(value);
                      void load(value, selectedVisitLocation?.metroZone !== undefined ? visitLocationKey : undefined);
                    }}
                    slotKey={slotKey}
                    setSlotKey={setSlotKey}
                    visitLocationKey={visitLocationKey}
                    setVisitLocationKey={changeVisitLocation}
                    durationMinutes={durationMinutes}
                    setDurationMinutes={setDurationMinutes}
                    evaluatorRef={evaluatorRef}
                    setEvaluatorRef={setEvaluatorRef}
                    visitReasonRef={visitReasonRef}
                    setVisitReasonRef={setVisitReasonRef}
                    reason={reason}
                    setReason={setReason}
                    instruction={instruction}
                    setInstruction={setInstruction}
                    saving={saving}
                    needsException={scheduleNeedsException}
                    onSave={saveSchedule}
                  />
                )}
              {editingSchedule && workspace.assignment && (
                <ScheduleEditor
                  workspace={workspace}
                  date={date}
                  setDate={(value) => {
                    setDate(value);
                    void load(value);
                  }}
                  slotKey={slotKey}
                  setSlotKey={setSlotKey}
                  visitLocationKey={visitLocationKey}
                  setVisitLocationKey={setVisitLocationKey}
                  durationMinutes={durationMinutes}
                  setDurationMinutes={setDurationMinutes}
                  evaluatorRef={evaluatorRef}
                  setEvaluatorRef={setEvaluatorRef}
                  reason={reason}
                  setReason={setReason}
                  saving={saving}
                  needsException={scheduleNeedsException}
                  reprogramming
                  onSave={reschedule}
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

            <section className="grid gap-3 bg-slate-50 p-4 sm:grid-cols-3" data-testid="survey-visit-readiness">
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
                  <CalendarClock className="h-4 w-4" />
                  Reserva
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  {workspace.availability
                    ? `${workspace.availability.dayOccupied}/${workspace.availability.dayCapacity} visitas en la fecha consultada`
                    : "Seleccione una fecha para consultar disponibilidad"}
                </p>
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
            </section>
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
  slotKey: string;
  setSlotKey(value: string): void;
  visitLocationKey: string;
  setVisitLocationKey(value: string): void;
  durationMinutes: number;
  setDurationMinutes(value: number): void;
  evaluatorRef: string;
  setEvaluatorRef(value: string): void;
  visitReasonRef?: string;
  setVisitReasonRef?(value: string): void;
  reason: string;
  setReason(value: string): void;
  instruction?: string;
  setInstruction?(value: string): void;
  saving: boolean;
  needsException?: boolean;
  reprogramming?: boolean;
  onSave(): void;
}>;
function ScheduleEditor({
  workspace,
  date,
  setDate,
  slotKey,
  setSlotKey,
  visitLocationKey,
  setVisitLocationKey,
  durationMinutes,
  setDurationMinutes,
  evaluatorRef,
  setEvaluatorRef,
  visitReasonRef = "",
  setVisitReasonRef,
  reason,
  setReason,
  instruction = "",
  setInstruction,
  saving,
  needsException = false,
  reprogramming = false,
  onSave,
}: ScheduleEditorProps) {
  const physicalVisit = workspace.decision?.method === "IN_PERSON";
  const slots =
    workspace.policy?.slots.filter(
      (slot) => slot.profile === workspace.schedulingContext?.profile,
    ) || [];
  const selectedSlot = slots.find((slot) => slot.key === slotKey);
  const selectedEvaluator = workspace.evaluatorCandidates.find(
    (candidate) => candidate.membershipRef === evaluatorRef,
  );
  const evaluatorDailyLimitReached = Boolean(
    selectedEvaluator?.dailyLimit !== null &&
      selectedEvaluator?.dailyLimit !== undefined &&
      selectedEvaluator.dailyAssigned >= selectedEvaluator.dailyLimit,
  );
  const selectedSlotAvailability = workspace.availability?.slots.find(
    (slot) => slot.key === slotKey,
  );
  const selectedStart = selectedSlot
    ? timeMinutes(selectedSlot.startTime)
    : null;
  const selectedEnd =
    selectedStart === null ? null : selectedStart + durationMinutes;
  const weekday = date
    ? new Date(`${date}T12:00:00`).getDay()
    : null;
  const policyWindows = workspace.operationalPolicy?.windows.filter(
    (window) =>
      window.method === workspace.decision?.method &&
      weekday === window.weekday &&
      (!window.calendarDate || window.calendarDate === date),
  );
  const matchingWindow = policyWindows?.find(
    (window) =>
      selectedStart !== null &&
      selectedEnd !== null &&
      window.startMinute <= selectedStart &&
      window.endMinute >= selectedEnd,
  );
  const extraordinary = Boolean(
    selectedStart !== null &&
      (selectedStart < 9 * 60 ||
        selectedStart > 16 * 60 ||
        (workspace.operationalPolicy &&
          (!matchingWindow || matchingWindow.requiresApproval))),
  );
  const morningSlots = slots.filter(
    (slot) => timeMinutes(slot.startTime) < 12 * 60,
  );
  const afternoonSlots = slots.filter(
    (slot) => timeMinutes(slot.startTime) >= 12 * 60,
  );
  const location = workspace.visitLocations.find((row) => locationKey(row) === visitLocationKey);
  const locationPicker = !reprogramming && physicalVisit && workspace.visitLocations.length > 0 && (
    <div>
      <Label>Lugar de la visita</Label>
      <Select value={visitLocationKey} onValueChange={setVisitLocationKey}>
        <SelectTrigger aria-label="Lugar de la visita">
          <SelectValue placeholder="Seleccione origen o destino" />
        </SelectTrigger>
        <SelectContent>
          {workspace.visitLocations.map((row) => (
            <SelectItem key={locationKey(row)} value={locationKey(row)}>
              {locationRoleLabel(row.role)} · {row.sector || row.cityMunicipality}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {location && <div className="mt-2 rounded border border-sky-100 bg-white px-3 py-2">
        <p className="text-xs font-bold text-[#003366]">{location.compactAddress}</p>
        {location.metroZone !== undefined && (
          <p className="mt-1 text-xs font-medium text-slate-600">
            {location.metroZone === "METRO" ? "Zona metro"
              : location.metroZone === "INTERIOR" ? "Fuera de zona metro" : "Zona por confirmar"}
          </p>
        )}
        {location.arrivalReference && (
          <p className="mt-1 text-[11px] text-slate-500">Referencia de llegada · {location.arrivalReference}</p>
        )}
      </div>}
    </div>
  );
  if (!workspace.policy || !workspace.schedulingContext)
    return (
      <div className="mt-4 space-y-3" data-testid="survey-schedule-editor">
        {locationPicker}
        <p className="text-sm text-slate-600">
          Confirme la zona y los datos viales para consultar la disponibilidad.
        </p>
      </div>
    );
  const availability = workspace.availability;
  const availabilityFor = (key: string) =>
    availability?.slots.find((item) => item.key === key);
  const renderSlotGroup = (
    title: string,
    group: typeof slots,
  ) => (
    <div>
      <p className="mb-2 text-[10px] font-black uppercase tracking-[.14em] text-slate-500">
        {title}
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {group.map((slot) => {
          const observed = availabilityFor(slot.key);
          const active = slot.key === slotKey;
          const starts = timeMinutes(slot.startTime);
          const outsideNormal = starts < 9 * 60 || starts > 16 * 60;
          return (
            <button
              key={slot.key}
              type="button"
              disabled={
                !date ||
                evaluatorDailyLimitReached ||
                (observed ? !observed.available : false)
              }
              aria-pressed={active}
              onClick={() => setSlotKey(slot.key)}
              className={`min-h-16 rounded border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
                active
                  ? "border-[#003366] bg-[#003366] text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-800 hover:border-sky-400"
              }`}
            >
              <span className="block text-sm font-black">
                {clientTime(slot.startTime)}
              </span>
              <span
                className={`mt-1 block text-[10px] ${active ? "text-sky-100" : "text-slate-500"}`}
              >
                {durationMinutes} min · {slot.label}
                {observed
                  ? ` · ${observed.occupied}/${observed.capacity}`
                  : ""}
              </span>
              {outsideNormal && (
                <span
                  className={`mt-1 block text-[10px] font-bold ${active ? "text-amber-200" : "text-amber-700"}`}
                >
                  Requiere autorización
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
  return (
    <div
      className="mt-4 space-y-4 rounded border border-slate-200 bg-slate-50 p-3"
      data-testid="survey-schedule-editor"
    >
      {locationPicker}

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="survey-date">Fecha</Label>
          <Input
            id="survey-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
          {availability?.date === date && (
            <p
              className={`mt-1 text-[11px] font-semibold ${availability.closed ? "text-red-700" : "text-slate-500"}`}
            >
              {availability.closed
                ? "Día cerrado"
                : `${availability.dayOccupied}/${availability.dayCapacity} visitas programadas`}
              {availability.saturdayApprovalRequired
                ? " · requiere autorización"
                : ""}
            </p>
          )}
        </div>
        <div>
          <Label>Duración estimada</Label>
          <div className="grid grid-cols-3 gap-1" role="group" aria-label="Duración estimada">
            {[30, 45, 60].map((minutes) => (
              <button
                key={minutes}
                type="button"
                aria-pressed={durationMinutes === minutes}
                onClick={() => setDurationMinutes(minutes)}
                className={`h-10 rounded border text-xs font-bold ${durationMinutes === minutes ? "border-[#003366] bg-[#003366] text-white" : "border-slate-200 bg-white text-slate-700"}`}
              >
                {minutes} min
              </button>
            ))}
          </div>
        </div>
        {!reprogramming && (
          <div>
            <Label>Evaluador recomendado</Label>
          <Select value={evaluatorRef} onValueChange={setEvaluatorRef}>
            <SelectTrigger aria-label="Evaluador recomendado">
              <SelectValue placeholder="Seleccione" />
            </SelectTrigger>
            <SelectContent>
              {workspace.evaluatorCandidates.map((candidate) => (
                <SelectItem
                  key={candidate.membershipRef}
                  value={candidate.membershipRef}
                  disabled={
                    candidate.dailyLimit !== null &&
                    candidate.dailyAssigned >= candidate.dailyLimit
                  }
                >
                  <span className="flex items-center gap-2">
                    <UserRound className="h-3.5 w-3.5" />
                    {candidate.displayName}
                    {candidate.dailyLimit !== null &&
                    candidate.dailyAssigned >= candidate.dailyLimit
                      ? " · exterior completo"
                      : ""}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {physicalVisit && workspace.schedulingContext.zoneType !== "METRO" && (
            <p
              className={`mt-1 text-[11px] font-semibold ${evaluatorDailyLimitReached ? "text-red-700" : "text-slate-500"}`}
            >
              Fuera de zona metropolitana: máximo 1 visita diaria por evaluador.
            </p>
          )}
          </div>
        )}
      </div>

      {date && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <Label>Hora de llegada al cliente</Label>
              <p className="text-[11px] text-slate-500">
                Seleccione la hora exacta que se confirmará con el cliente.
              </p>
            </div>
            {workspace.operationalPolicy && physicalVisit && (
              <span className="rounded-full bg-white px-3 py-1 text-[10px] font-semibold text-slate-600">
                Traslado mínimo entre visitas: {workspace.operationalPolicy.minimumTravelBufferMinutes} min
              </span>
            )}
          </div>
          {morningSlots.length > 0 && renderSlotGroup("Mañana", morningSlots)}
          {afternoonSlots.length > 0 && renderSlotGroup("Tarde", afternoonSlots)}
          {slots.length === 0 && (
            <p className="rounded border border-dashed p-3 text-sm text-slate-500">
              No hay horarios configurados para esta zona.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
      {!reprogramming && workspace.operationalPolicy && (
        <div>
          <Label>Tipo de visita</Label>
          <Select
            value={visitReasonRef}
            onValueChange={(value) => setVisitReasonRef?.(value)}
          >
            <SelectTrigger aria-label="Tipo de visita">
              <SelectValue placeholder="Seleccione" />
            </SelectTrigger>
            <SelectContent>
              {workspace.visitReasons.map((item) => (
                <SelectItem key={item.reasonRef} value={item.reasonRef}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {!reprogramming && (
        <div>
          <Label htmlFor="survey-evaluator-instruction">
            Notas y alcance para el evaluador
          </Label>
          <Input
            id="survey-evaluator-instruction"
            value={instruction}
            placeholder="Qué debe revisar, preferencias del cliente, acceso o indicación importante"
            onChange={(event) => setInstruction?.(event.target.value)}
          />
        </div>
      )}
      {(reprogramming || extraordinary || needsException) && <div className="sm:col-span-2">
        <Label htmlFor="schedule-reason">
          {reprogramming
            ? "Motivo obligatorio"
            : "Motivo para autorización extraordinaria"}
        </Label>
        <Input
          id="schedule-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        {extraordinary && !needsException && (
          <p className="mt-1 text-[11px] font-semibold text-amber-700">
            Este horario queda fuera de la jornada normal o requiere aprobación.
          </p>
        )}
      </div>}
      <div className="sm:col-span-2">
        <Button
          disabled={
            saving ||
            !date ||
            !slotKey ||
            selectedSlotAvailability?.available === false ||
            (!reprogramming && !evaluatorRef) ||
            (!reprogramming && evaluatorDailyLimitReached) ||
            (!reprogramming &&
              Boolean(workspace.operationalPolicy) &&
              !visitReasonRef) ||
            (!reprogramming && physicalVisit && workspace.visitLocations.length > 0 && !visitLocationKey) ||
            ((extraordinary || needsException) && !reason) ||
            (reprogramming && !reason)
          }
          onClick={onSave}
        >
          {saving
            ? "Guardando…"
            : reprogramming
              ? "Confirmar reprogramación"
              : "Confirmar visita"}
        </Button>
        {selectedSlot && (
          <p className="mt-2 text-xs text-slate-600">
            Llegada: <strong>{clientTime(selectedSlot.startTime)}</strong> · duración: {durationMinutes} min
            {extraordinary ? " · autorización requerida" : " · horario regular"}
          </p>
        )}
      </div>
      </div>
    </div>
  );
}
