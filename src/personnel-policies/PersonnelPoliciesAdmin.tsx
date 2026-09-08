import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  MapPinned,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import type { PersonnelPoliciesAccess } from "./access";
import {
  createPersonnelPoliciesApi,
  type PersonnelPoliciesWorkspace,
  type VisitException,
} from "./api";

type Props = Readonly<{
  authorization?: string;
  access: PersonnelPoliciesAccess;
  onUnauthorized(): void;
}>;
type Tab =
  "PERSONNEL" | "CAPABILITIES" | "HOURS" | "ZONES" | "EXCEPTIONS" | "POLICIES";
const TABS: readonly { id: Tab; label: string }[] = [
  { id: "PERSONNEL", label: "Personal" },
  { id: "CAPABILITIES", label: "Capacidades" },
  { id: "HOURS", label: "Horarios" },
  { id: "ZONES", label: "Zonas" },
  { id: "EXCEPTIONS", label: "Excepciones" },
  { id: "POLICIES", label: "Políticas de visitas" },
];
const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const time = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
type PolicyWindowDraft = {
  key: number;
  weekday: string;
  start: string;
  end: string;
  capacity: string;
  method: string;
  zoneRuleRef: string;
  calendarDate: string;
  requiresApproval: boolean;
  kind: "REGULAR" | "SPECIAL_CLOSURE" | "SPECIAL_OPENING";
};
const policyWindow = (key: number): PolicyWindowDraft => ({
  key,
  weekday: "1",
  start: "08:00",
  end: "17:00",
  capacity: "4",
  method: "IN_PERSON",
  zoneRuleRef: "",
  calendarDate: "",
  requiresApproval: false,
  kind: "REGULAR",
});

export default function PersonnelPoliciesAdmin({
  authorization,
  access,
  onUnauthorized,
}: Props) {
  const api = useMemo(
    () => createPersonnelPoliciesApi(authorization),
    [authorization],
  );
  const [workspace, setWorkspace] = useState<PersonnelPoliciesWorkspace | null>(
    null,
  );
  const [tab, setTab] = useState<Tab>("PERSONNEL");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capability, setCapability] = useState({
    code: "",
    name: "",
    description: "",
  });
  const [reason, setReason] = useState({ code: "", name: "", kind: "VISIT" });
  const [profileEdit, setProfileEdit] = useState({
    profileRef: "",
    jobTitle: "",
    availabilityStatus: "AVAILABLE",
    restrictionSummary: "",
    notes: "",
    validFrom: "",
    validTo: "",
  });
  const [capabilityAssignment, setCapabilityAssignment] = useState({
    profileRef: "",
    capabilityRef: "",
  });
  const [zoneAssignment, setZoneAssignment] = useState({
    profileRef: "",
    ruleRef: "",
  });
  const [override, setOverride] = useState({
    profileRef: "",
    kind: "UNAVAILABLE",
    startsAt: "",
    endsAt: "",
    method: "IN_PERSON",
    travelBufferMinutes: "",
    reason: "",
  });
  const [policyDraft, setPolicyDraft] = useState({
    timezone: "America/Santo_Domingo",
    minimumTravelBufferMinutes: "45",
    virtualPreparationMinutes: "15",
    defaultVisitMinutes: "120",
  });
  const [policyWindows, setPolicyWindows] = useState<PolicyWindowDraft[]>([
    policyWindow(1),
  ]);
  const [nextPolicyWindowKey, setNextPolicyWindowKey] = useState(2);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setWorkspace(await api.workspace());
    } catch (cause) {
      const typed = cause as { status?: number; message?: string };
      if (typed.status === 401) onUnauthorized();
      else setError(typed.message || "PERSONNEL_POLICIES_REQUEST_FAILED");
    } finally {
      setLoading(false);
    }
  }, [api, onUnauthorized]);
  useEffect(() => {
    void load();
  }, [load]);
  const mutate = async (
    operation: string,
    payload: Record<string, unknown>,
  ) => {
    setSaving(true);
    setError(null);
    try {
      await api.mutate(operation, payload);
      await load();
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
  if (!access.canView) return null;
  return (
    <section
      id="admin-personnel-policies"
      className="mt-7 overflow-hidden rounded-xl border bg-white shadow-sm"
      data-testid="personnel-policies-admin"
    >
      <header className="flex flex-wrap items-end justify-between gap-3 border-b bg-slate-50 p-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.18em] text-indigo-600">
            Administración tenant-first
          </p>
          <h2 className="mt-1 text-xl font-black text-slate-950">
            Personal y Políticas
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            Capacidad operacional, agenda y excepciones. No sustituye RRHH ni
            nómina.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border bg-white px-3 py-2 text-xs font-bold"
        >
          <RefreshCw className="mr-1 inline h-3.5 w-3.5" />
          Actualizar
        </button>
      </header>
      <nav
        aria-label="Personal y Políticas"
        className="flex gap-1 overflow-x-auto border-b p-2"
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold ${tab === item.id ? "bg-[#003366] text-white" : "text-slate-600 hover:bg-slate-100"}`}
          >
            {item.label}
          </button>
        ))}
      </nav>
      {loading && (
        <p role="status" className="p-8 text-center text-sm text-slate-500">
          Consultando autoridad operacional…
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="m-4 rounded border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800"
        >
          {error}
        </p>
      )}
      {!loading && workspace && (
        <div className="p-4">
          {tab === "PERSONNEL" && (
            <div className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-2">
                {workspace.personnel.map((row) => (
                  <article
                    key={row.profileRef}
                    className="rounded-lg border p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-slate-950">
                          {row.displayName}
                        </h3>
                        <p className="text-xs text-slate-500">
                          {row.jobTitle || "Función no definida"}
                        </p>
                      </div>
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800">
                        {row.availabilityStatus}
                      </span>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <dt className="text-slate-500">Capacidades</dt>
                        <dd className="font-bold">{row.capabilities.length}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Zonas</dt>
                        <dd className="font-bold">{row.zones.length}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Restricciones</dt>
                        <dd className="font-bold">
                          {Object.keys(row.restrictions || {}).length
                            ? "Configuradas"
                            : "Sin restricciones"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Vigencia</dt>
                        <dd className="font-bold">
                          {row.validTo
                            ? new Date(row.validTo).toLocaleDateString("es-DO")
                            : "Vigente"}
                        </dd>
                      </div>
                    </dl>
                  </article>
                ))}
                {workspace.personnel.length === 0 && (
                  <Empty text="No existen perfiles operacionales vinculados a Membership activa." />
                )}
              </div>
              {access.canManageProfiles && (
                <fieldset className="grid gap-2 rounded-lg bg-slate-50 p-3 md:grid-cols-3">
                  <legend className="px-1 text-xs font-black">
                    Configurar perfil operacional
                  </legend>
                  <select
                    aria-label="Personal"
                    value={profileEdit.profileRef}
                    onChange={(event) =>
                      setProfileEdit({
                        ...profileEdit,
                        profileRef: event.target.value,
                      })
                    }
                    className="rounded border px-3 py-2 text-xs"
                  >
                    <option value="">Seleccionar personal</option>
                    {workspace.personnel.map((row) => (
                      <option key={row.profileRef} value={row.profileRef}>
                        {row.displayName}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label="Cargo operacional"
                    placeholder="Cargo o función"
                    value={profileEdit.jobTitle}
                    onChange={(event) =>
                      setProfileEdit({
                        ...profileEdit,
                        jobTitle: event.target.value,
                      })
                    }
                    className="rounded border px-3 py-2 text-xs"
                  />
                  <select
                    aria-label="Disponibilidad"
                    value={profileEdit.availabilityStatus}
                    onChange={(event) =>
                      setProfileEdit({
                        ...profileEdit,
                        availabilityStatus: event.target.value,
                      })
                    }
                    className="rounded border px-3 py-2 text-xs"
                  >
                    <option>AVAILABLE</option>
                    <option>LIMITED</option>
                    <option>UNAVAILABLE</option>
                  </select>
                  <input
                    aria-label="Restricciones operacionales"
                    placeholder="Resumen de restricciones"
                    value={profileEdit.restrictionSummary}
                    onChange={(event) =>
                      setProfileEdit({
                        ...profileEdit,
                        restrictionSummary: event.target.value,
                      })
                    }
                    className="rounded border px-3 py-2 text-xs"
                  />
                  <input
                    aria-label="Observaciones administrativas"
                    placeholder="Observaciones administrativas"
                    value={profileEdit.notes}
                    onChange={(event) =>
                      setProfileEdit({
                        ...profileEdit,
                        notes: event.target.value,
                      })
                    }
                    className="rounded border px-3 py-2 text-xs"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      aria-label="Vigente desde"
                      type="date"
                      value={profileEdit.validFrom}
                      onChange={(event) =>
                        setProfileEdit({
                          ...profileEdit,
                          validFrom: event.target.value,
                        })
                      }
                      className="rounded border px-2 py-2 text-xs"
                    />
                    <input
                      aria-label="Vigente hasta"
                      type="date"
                      value={profileEdit.validTo}
                      onChange={(event) =>
                        setProfileEdit({
                          ...profileEdit,
                          validTo: event.target.value,
                        })
                      }
                      className="rounded border px-2 py-2 text-xs"
                    />
                  </div>
                  <button
                    disabled={saving || !profileEdit.profileRef}
                    onClick={() =>
                      void mutate("PROFILE_UPDATE", {
                        profileRef: profileEdit.profileRef,
                        jobTitle: profileEdit.jobTitle || null,
                        availabilityStatus: profileEdit.availabilityStatus,
                        restrictions: profileEdit.restrictionSummary
                          ? { summary: profileEdit.restrictionSummary }
                          : {},
                        notes: profileEdit.notes || null,
                        validFrom: dateStart(profileEdit.validFrom),
                        validTo: dateStart(profileEdit.validTo),
                      })
                    }
                    className="rounded bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
                  >
                    Guardar perfil
                  </button>
                </fieldset>
              )}
            </div>
          )}
          {tab === "CAPABILITIES" && (
            <div>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {workspace.capabilities.map((row) => (
                  <article
                    key={row.capabilityRef}
                    className="rounded-lg border p-3"
                  >
                    <strong className="block text-sm">{row.name}</strong>
                    <code className="text-[10px] text-indigo-700">
                      {row.code}
                    </code>
                    <p className="mt-1 text-xs text-slate-500">
                      {row.description || "Sin descripción"}
                    </p>
                  </article>
                ))}
              </div>
              {access.canManageCapabilities && (
                <div className="mt-4 grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-3">
                  <input
                    aria-label="Código de capacidad"
                    placeholder="CAN_PERFORM_…"
                    value={capability.code}
                    onChange={(event) =>
                      setCapability({
                        ...capability,
                        code: event.target.value.toUpperCase(),
                      })
                    }
                    className="rounded border px-3 py-2 text-xs"
                  />
                  <input
                    aria-label="Nombre de capacidad"
                    placeholder="Nombre"
                    value={capability.name}
                    onChange={(event) =>
                      setCapability({ ...capability, name: event.target.value })
                    }
                    className="rounded border px-3 py-2 text-xs"
                  />
                  <button
                    disabled={saving || !capability.code || !capability.name}
                    onClick={() =>
                      void mutate("CAPABILITY_CREATE", {
                        ...capability,
                        description: capability.description || null,
                      })
                    }
                    className="rounded bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
                  >
                    Crear capacidad
                  </button>
                  <select
                    aria-label="Personal para capacidad"
                    value={capabilityAssignment.profileRef}
                    onChange={(event) =>
                      setCapabilityAssignment({
                        ...capabilityAssignment,
                        profileRef: event.target.value,
                      })
                    }
                    className="rounded border px-3 py-2 text-xs"
                  >
                    <option value="">Seleccionar personal</option>
                    {workspace.personnel.map((row) => (
                      <option key={row.profileRef} value={row.profileRef}>
                        {row.displayName}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Capacidad a asignar"
                    value={capabilityAssignment.capabilityRef}
                    onChange={(event) =>
                      setCapabilityAssignment({
                        ...capabilityAssignment,
                        capabilityRef: event.target.value,
                      })
                    }
                    className="rounded border px-3 py-2 text-xs"
                  >
                    <option value="">Seleccionar capacidad</option>
                    {workspace.capabilities.map((row) => (
                      <option key={row.capabilityRef} value={row.capabilityRef}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={
                      saving ||
                      !capabilityAssignment.profileRef ||
                      !capabilityAssignment.capabilityRef
                    }
                    onClick={() =>
                      void mutate("CAPABILITY_ASSIGN", {
                        ...capabilityAssignment,
                        restrictions: {},
                        validFrom: null,
                        validTo: null,
                      })
                    }
                    className="rounded border border-indigo-600 px-3 py-2 text-xs font-bold text-indigo-700 disabled:opacity-40"
                  >
                    Asignar capacidad
                  </button>
                </div>
              )}
            </div>
          )}
          {tab === "HOURS" && (
            <div className="space-y-3">
              <Precedence values={workspace.precedence} />
              {workspace.activePolicy ? (
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {workspace.activePolicy.windows.map((row) => (
                    <article
                      key={row.windowRef}
                      className="flex items-center gap-3 rounded-lg border p-3"
                    >
                      <Clock3 className="h-5 w-5 text-indigo-600" />
                      <div>
                        <strong className="block text-sm">
                          {DAYS[row.weekday]} · {time(row.startMinute)}–
                          {time(row.endMinute)}
                        </strong>
                        <span className="text-xs text-slate-500">
                          {row.method} · capacidad {row.capacity}
                          {row.requiresApproval
                            ? " · aprobación requerida"
                            : ""}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty text="No existe una política semanal publicada." />
              )}
              {access.canManagePolicies && (
                <fieldset className="grid gap-2 rounded-lg bg-slate-50 p-3 md:grid-cols-4">
                  <legend className="px-1 text-xs font-black">
                    Excepción individual de horario
                  </legend>
                  <select
                    aria-label="Personal para horario"
                    value={override.profileRef}
                    onChange={(event) =>
                      setOverride({
                        ...override,
                        profileRef: event.target.value,
                      })
                    }
                    className="rounded border px-3 py-2 text-xs"
                  >
                    <option value="">Seleccionar personal</option>
                    {workspace.personnel.map((row) => (
                      <option key={row.profileRef} value={row.profileRef}>
                        {row.displayName}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Tipo de excepción"
                    value={override.kind}
                    onChange={(event) =>
                      setOverride({ ...override, kind: event.target.value })
                    }
                    className="rounded border px-3 py-2 text-xs"
                  >
                    <option>UNAVAILABLE</option>
                    <option>AVAILABLE</option>
                    <option>TRAVEL_BUFFER</option>
                  </select>
                  <input
                    aria-label="Inicio de excepción"
                    type="datetime-local"
                    value={override.startsAt}
                    onChange={(event) =>
                      setOverride({ ...override, startsAt: event.target.value })
                    }
                    className="rounded border px-2 py-2 text-xs"
                  />
                  <input
                    aria-label="Fin de excepción"
                    type="datetime-local"
                    value={override.endsAt}
                    onChange={(event) =>
                      setOverride({ ...override, endsAt: event.target.value })
                    }
                    className="rounded border px-2 py-2 text-xs"
                  />
                  <input
                    aria-label="Razón de excepción"
                    placeholder="Razón administrativa"
                    value={override.reason}
                    onChange={(event) =>
                      setOverride({ ...override, reason: event.target.value })
                    }
                    className="rounded border px-3 py-2 text-xs"
                  />
                  <input
                    aria-label="Buffer individual"
                    type="number"
                    min="0"
                    disabled={override.kind !== "TRAVEL_BUFFER"}
                    value={override.travelBufferMinutes}
                    onChange={(event) =>
                      setOverride({
                        ...override,
                        travelBufferMinutes: event.target.value,
                      })
                    }
                    className="rounded border px-3 py-2 text-xs"
                  />
                  <button
                    disabled={
                      saving ||
                      !override.profileRef ||
                      !override.startsAt ||
                      !override.endsAt ||
                      !override.reason ||
                      (override.kind === "TRAVEL_BUFFER" &&
                        !override.travelBufferMinutes)
                    }
                    onClick={() =>
                      void mutate("SCHEDULE_OVERRIDE_CREATE", {
                        profileRef: override.profileRef,
                        kind: override.kind,
                        startsAt: localInstant(override.startsAt),
                        endsAt: localInstant(override.endsAt),
                        method: override.method,
                        zoneRuleRef: null,
                        travelBufferMinutes:
                          override.kind === "TRAVEL_BUFFER"
                            ? Number(override.travelBufferMinutes)
                            : null,
                        reason: override.reason,
                      })
                    }
                    className="rounded bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
                  >
                    Registrar excepción
                  </button>
                </fieldset>
              )}
            </div>
          )}
          {tab === "ZONES" && (
            <div className="space-y-4">
              <div className="grid gap-2 md:grid-cols-2">
                {workspace.zones.map((row) => (
                  <article
                    key={row.ruleRef}
                    className="flex items-center gap-3 rounded-lg border p-3"
                  >
                    <MapPinned className="h-5 w-5 text-indigo-600" />
                    <div>
                      <strong className="block text-sm">{row.name}</strong>
                      <span className="text-xs text-slate-500">
                        LogisticsRule · {row.code}
                      </span>
                    </div>
                  </article>
                ))}
                {workspace.zones.length === 0 && (
                  <Empty text="No hay LogisticsRules de zona activas; no se crean zonas duplicadas." />
                )}
              </div>
              {access.canManageProfiles && workspace.zones.length > 0 && (
                <div className="grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-3">
                  <select
                    aria-label="Personal para zona"
                    value={zoneAssignment.profileRef}
                    onChange={(event) =>
                      setZoneAssignment({
                        ...zoneAssignment,
                        profileRef: event.target.value,
                      })
                    }
                    className="rounded border px-3 py-2 text-xs"
                  >
                    <option value="">Seleccionar personal</option>
                    {workspace.personnel.map((row) => (
                      <option key={row.profileRef} value={row.profileRef}>
                        {row.displayName}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Zona operativa"
                    value={zoneAssignment.ruleRef}
                    onChange={(event) =>
                      setZoneAssignment({
                        ...zoneAssignment,
                        ruleRef: event.target.value,
                      })
                    }
                    className="rounded border px-3 py-2 text-xs"
                  >
                    <option value="">Seleccionar zona</option>
                    {workspace.zones.map((row) => (
                      <option key={row.ruleRef} value={row.ruleRef}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={
                      saving ||
                      !zoneAssignment.profileRef ||
                      !zoneAssignment.ruleRef
                    }
                    onClick={() =>
                      void mutate("ZONE_ASSIGN", {
                        ...zoneAssignment,
                        validFrom: null,
                        validTo: null,
                      })
                    }
                    className="rounded bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
                  >
                    Asignar zona
                  </button>
                </div>
              )}
            </div>
          )}
          {tab === "EXCEPTIONS" && (
            <div className="space-y-2">
              {workspace.exceptions.map((row) => (
                <ExceptionRow
                  key={row.requestRef}
                  row={row}
                  access={access}
                  saving={saving}
                  mutate={mutate}
                />
              ))}
              {workspace.exceptions.length === 0 && (
                <Empty text="No existen solicitudes excepcionales." />
              )}
            </div>
          )}
          {tab === "POLICIES" && (
            <div className="grid gap-4 lg:grid-cols-[1.4fr_.6fr]">
              <div className="space-y-3">
                {workspace.activePolicy ? (
                  <article className="rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-black">
                          Política activa v{workspace.activePolicy.version}
                        </h3>
                        <p className="text-xs text-slate-500">
                          {workspace.activePolicy.timezone}
                        </p>
                      </div>
                      <ShieldCheck className="text-emerald-600" />
                    </div>
                    <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                      <Metric
                        label="Visita"
                        value={`${workspace.activePolicy.defaultVisitMinutes} min`}
                      />
                      <Metric
                        label="Traslado mínimo"
                        value={`${workspace.activePolicy.minimumTravelBufferMinutes} min`}
                      />
                      <Metric
                        label="Preparación virtual"
                        value={`${workspace.activePolicy.virtualPreparationMinutes} min`}
                      />
                    </dl>
                    <ul className="mt-3 divide-y rounded-lg border text-xs">
                      {workspace.activePolicy.windows.map((window) => (
                        <li
                          key={window.windowRef}
                          className="flex flex-wrap justify-between gap-2 px-3 py-2"
                        >
                          <span className="font-semibold">
                            {window.calendarDate || DAYS[window.weekday]} ·{" "}
                            {time(window.startMinute)}–{time(window.endMinute)}
                          </span>
                          <span className="text-slate-500">
                            {window.method} · cupo {window.capacity} ·{" "}
                            {window.kind}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </article>
                ) : (
                  <Empty text="Sin política activa: Scheduling falla cerrado." />
                )}
                {access.canManagePolicies && (
                  <fieldset className="space-y-3 rounded-lg bg-slate-50 p-3">
                    <legend className="px-1 text-xs font-black">
                      Publicar siguiente política semanal
                    </legend>
                    <div className="grid gap-2 sm:grid-cols-4">
                      <input
                        aria-label="Zona horaria"
                        value={policyDraft.timezone}
                        onChange={(event) =>
                          setPolicyDraft({
                            ...policyDraft,
                            timezone: event.target.value,
                          })
                        }
                        className="rounded border px-3 py-2 text-xs"
                      />
                      <input
                        aria-label="Duración de visita"
                        type="number"
                        min="15"
                        value={policyDraft.defaultVisitMinutes}
                        onChange={(event) =>
                          setPolicyDraft({
                            ...policyDraft,
                            defaultVisitMinutes: event.target.value,
                          })
                        }
                        className="rounded border px-3 py-2 text-xs"
                      />
                      <input
                        aria-label="Buffer mínimo de traslado"
                        type="number"
                        min="0"
                        value={policyDraft.minimumTravelBufferMinutes}
                        onChange={(event) =>
                          setPolicyDraft({
                            ...policyDraft,
                            minimumTravelBufferMinutes: event.target.value,
                          })
                        }
                        className="rounded border px-3 py-2 text-xs"
                      />
                      <input
                        aria-label="Preparación virtual"
                        type="number"
                        min="0"
                        value={policyDraft.virtualPreparationMinutes}
                        onChange={(event) =>
                          setPolicyDraft({
                            ...policyDraft,
                            virtualPreparationMinutes: event.target.value,
                          })
                        }
                        className="rounded border px-3 py-2 text-xs"
                      />
                    </div>
                    <div className="space-y-2">
                      {policyWindows.map((window, index) => (
                        <div
                          key={window.key}
                          className="grid gap-2 rounded-lg border bg-white p-2 sm:grid-cols-4"
                        >
                          <select
                            aria-label={`Tipo de ventana ${index + 1}`}
                            value={window.kind}
                            onChange={(event) =>
                              setPolicyWindows((rows) =>
                                rows.map((row) =>
                                  row.key === window.key
                                    ? {
                                        ...row,
                                        kind: event.target
                                          .value as PolicyWindowDraft["kind"],
                                        calendarDate:
                                          event.target.value === "REGULAR"
                                            ? ""
                                            : row.calendarDate,
                                      }
                                    : row,
                                ),
                              )
                            }
                            className="rounded border px-2 py-2 text-xs"
                          >
                            <option value="REGULAR">Horario recurrente</option>
                            <option value="SPECIAL_OPENING">
                              Apertura especial
                            </option>
                            <option value="SPECIAL_CLOSURE">
                              Cierre especial
                            </option>
                          </select>
                          {window.kind === "REGULAR" ? (
                            <select
                              aria-label={`Día de ventana ${index + 1}`}
                              value={window.weekday}
                              onChange={(event) =>
                                setPolicyWindows((rows) =>
                                  rows.map((row) =>
                                    row.key === window.key
                                      ? { ...row, weekday: event.target.value }
                                      : row,
                                  ),
                                )
                              }
                              className="rounded border px-2 py-2 text-xs"
                            >
                              {DAYS.map((day, weekday) => (
                                <option key={day} value={weekday}>
                                  {day}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              aria-label={`Fecha especial ${index + 1}`}
                              type="date"
                              value={window.calendarDate}
                              onChange={(event) =>
                                setPolicyWindows((rows) =>
                                  rows.map((row) =>
                                    row.key === window.key
                                      ? {
                                          ...row,
                                          calendarDate: event.target.value,
                                        }
                                      : row,
                                  ),
                                )
                              }
                              className="rounded border px-2 py-2 text-xs"
                            />
                          )}
                          <select
                            aria-label={`Método de ventana ${index + 1}`}
                            value={window.method}
                            onChange={(event) =>
                              setPolicyWindows((rows) =>
                                rows.map((row) =>
                                  row.key === window.key
                                    ? { ...row, method: event.target.value }
                                    : row,
                                ),
                              )
                            }
                            className="rounded border px-2 py-2 text-xs"
                          >
                            <option>IN_PERSON</option>
                            <option>VIRTUAL</option>
                            <option>CLIENT_PHOTOS_DOCUMENTS</option>
                            <option>WRITTEN_REPORT</option>
                          </select>
                          <select
                            aria-label={`Zona de ventana ${index + 1}`}
                            value={window.zoneRuleRef}
                            onChange={(event) =>
                              setPolicyWindows((rows) =>
                                rows.map((row) =>
                                  row.key === window.key
                                    ? {
                                        ...row,
                                        zoneRuleRef: event.target.value,
                                      }
                                    : row,
                                ),
                              )
                            }
                            className="rounded border px-2 py-2 text-xs"
                          >
                            <option value="">Todas las zonas</option>
                            {workspace.zones.map((zone) => (
                              <option key={zone.ruleRef} value={zone.ruleRef}>
                                {zone.name}
                              </option>
                            ))}
                          </select>
                          <input
                            aria-label={`Hora inicial ${index + 1}`}
                            type="time"
                            value={window.start}
                            onChange={(event) =>
                              setPolicyWindows((rows) =>
                                rows.map((row) =>
                                  row.key === window.key
                                    ? { ...row, start: event.target.value }
                                    : row,
                                ),
                              )
                            }
                            className="rounded border px-2 py-2 text-xs"
                          />
                          <input
                            aria-label={`Hora final ${index + 1}`}
                            type="time"
                            value={window.end}
                            onChange={(event) =>
                              setPolicyWindows((rows) =>
                                rows.map((row) =>
                                  row.key === window.key
                                    ? { ...row, end: event.target.value }
                                    : row,
                                ),
                              )
                            }
                            className="rounded border px-2 py-2 text-xs"
                          />
                          <input
                            aria-label={`Capacidad de ventana ${index + 1}`}
                            type="number"
                            min="1"
                            max="100"
                            value={window.capacity}
                            onChange={(event) =>
                              setPolicyWindows((rows) =>
                                rows.map((row) =>
                                  row.key === window.key
                                    ? { ...row, capacity: event.target.value }
                                    : row,
                                ),
                              )
                            }
                            className="rounded border px-2 py-2 text-xs"
                          />
                          <label className="flex items-center gap-2 rounded border px-2 text-xs">
                            <input
                              type="checkbox"
                              checked={window.requiresApproval}
                              onChange={(event) =>
                                setPolicyWindows((rows) =>
                                  rows.map((row) =>
                                    row.key === window.key
                                      ? {
                                          ...row,
                                          requiresApproval:
                                            event.target.checked,
                                        }
                                      : row,
                                  ),
                                )
                              }
                            />
                            Requiere aprobación
                          </label>
                          <button
                            type="button"
                            disabled={policyWindows.length === 1}
                            onClick={() =>
                              setPolicyWindows((rows) =>
                                rows.filter((row) => row.key !== window.key),
                              )
                            }
                            className="rounded border px-2 py-2 text-xs font-bold disabled:opacity-40"
                          >
                            Quitar ventana
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPolicyWindows((rows) => [
                            ...rows,
                            policyWindow(nextPolicyWindowKey),
                          ]);
                          setNextPolicyWindowKey((value) => value + 1);
                        }}
                        className="rounded border px-3 py-2 text-xs font-bold"
                      >
                        Añadir ventana
                      </button>
                      <button
                        disabled={
                          saving ||
                          !policyDraft.timezone ||
                          !policyWindows.length ||
                          policyWindows.some(
                            (window) =>
                              !window.start ||
                              !window.end ||
                              !window.capacity ||
                              (window.kind !== "REGULAR" &&
                                !window.calendarDate),
                          )
                        }
                        onClick={() =>
                          void mutate(
                            "POLICY_PUBLISH",
                            policyPayload(
                              policyDraft,
                              policyWindows,
                              workspace.activePolicy?.version || 0,
                            ),
                          )
                        }
                        className="rounded bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
                      >
                        Publicar política
                      </button>
                    </div>
                  </fieldset>
                )}
              </div>
              <div>
                <h3 className="text-xs font-black uppercase text-slate-500">
                  Razones publicadas
                </h3>
                <ul className="mt-2 divide-y rounded-lg border">
                  {workspace.reasons.map((row) => (
                    <li key={row.reasonRef} className="p-2 text-xs">
                      <strong>{row.name}</strong>
                      <span className="block text-slate-500">
                        {row.kind} ·{" "}
                        {row.visibleToClient ? "Cliente" : "Interno"} ·{" "}
                        {row.visibleToEvaluator ? "Evaluador" : "No evaluador"}
                      </span>
                    </li>
                  ))}
                </ul>
                {access.canManagePolicies && (
                  <div className="mt-3 grid gap-2">
                    <input
                      aria-label="Código de razón"
                      placeholder="EVALUACION_INICIAL"
                      value={reason.code}
                      onChange={(event) =>
                        setReason({
                          ...reason,
                          code: event.target.value.toUpperCase(),
                        })
                      }
                      className="rounded border px-3 py-2 text-xs"
                    />
                    <input
                      aria-label="Nombre de razón"
                      placeholder="Evaluación inicial"
                      value={reason.name}
                      onChange={(event) =>
                        setReason({ ...reason, name: event.target.value })
                      }
                      className="rounded border px-3 py-2 text-xs"
                    />
                    <select
                      aria-label="Tipo de razón"
                      value={reason.kind}
                      onChange={(event) =>
                        setReason({ ...reason, kind: event.target.value })
                      }
                      className="rounded border px-3 py-2 text-xs"
                    >
                      <option value="VISIT">Visita</option>
                      <option value="RESCHEDULE">Reagendamiento</option>
                      <option value="CANCELLATION">Cancelación</option>
                    </select>
                    <button
                      disabled={saving || !reason.code || !reason.name}
                      onClick={() =>
                        void mutate("VISIT_REASON_CREATE", {
                          ...reason,
                          requesterOrigin: null,
                          visibleToClient: true,
                          visibleToEvaluator: true,
                        })
                      }
                      className="rounded bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
                    >
                      Crear razón
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">
      {text}
    </p>
  );
}
function dateStart(value: string) {
  return value ? new Date(`${value}T00:00:00`).toISOString() : null;
}
function localInstant(value: string) {
  return new Date(value).toISOString();
}
function minutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}
function policyPayload(
  draft: {
    timezone: string;
    minimumTravelBufferMinutes: string;
    virtualPreparationMinutes: string;
    defaultVisitMinutes: string;
  },
  drafts: readonly PolicyWindowDraft[],
  expectedVersion: number,
) {
  const windows = drafts.map((window) => ({
    weekday:
      window.kind === "REGULAR"
        ? Number(window.weekday)
        : new Date(`${window.calendarDate}T00:00:00.000Z`).getUTCDay(),
    startMinute: minutes(window.start),
    endMinute: minutes(window.end),
    capacity: Number(window.capacity),
    method: window.method,
    zoneRuleRef: window.zoneRuleRef || null,
    calendarDate: window.kind === "REGULAR" ? null : window.calendarDate,
    requiresApproval: window.requiresApproval,
    kind: window.kind,
  }));
  return {
    expectedVersion,
    timezone: draft.timezone,
    defaultVisitMinutes: Number(draft.defaultVisitMinutes),
    minimumTravelBufferMinutes: Number(draft.minimumTravelBufferMinutes),
    virtualPreparationMinutes: Number(draft.virtualPreparationMinutes),
    validFrom: new Date().toISOString(),
    windows,
  };
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-slate-50 p-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-1 font-black text-slate-900">{value}</dd>
    </div>
  );
}
function Precedence({ values }: { values: readonly string[] }) {
  return (
    <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-xs text-indigo-950">
      <CalendarClock className="mr-2 inline h-4 w-4" />
      <strong>Precedencia:</strong> {values.join(" → ")}
    </div>
  );
}
function ExceptionRow({
  row,
  access,
  saving,
  mutate,
}: {
  row: VisitException;
  access: PersonnelPoliciesAccess;
  saving: boolean;
  mutate(operation: string, payload: Record<string, unknown>): Promise<void>;
}) {
  return (
    <article className="grid gap-3 rounded-lg border p-3 md:grid-cols-[1fr_auto]">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <strong className="text-sm">
            {row.caseCode} · {row.reason.name}
          </strong>
          <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800">
            {row.status}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-600">
          {row.evaluator.displayName} · {row.method} ·{" "}
          {new Date(row.requestedStart).toLocaleString("es-DO")}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Evaluador: {row.evaluatorResponse} · Administración:{" "}
          {row.adminDecision} · recursos {row.requiredResources.length}
        </p>
      </div>
      {row.status === "PENDING" && (
        <div className="flex flex-wrap gap-2">
          {access.canRespondException &&
            row.evaluatorResponse === "PENDING" && (
              <button
                disabled={saving}
                onClick={() =>
                  void mutate("EXCEPTION_RESPOND", {
                    requestRef: row.requestRef,
                    expectedVersion: row.version,
                    response: "ACCEPTED",
                    alternativeStart: null,
                    alternativeEnd: null,
                    reason: null,
                  })
                }
                className="rounded border px-3 py-2 text-xs font-bold"
              >
                <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
                Aceptar disponibilidad
              </button>
            )}
          {access.canApproveException &&
            row.evaluatorResponse === "ACCEPTED" && (
              <button
                disabled={saving}
                onClick={() =>
                  void mutate("EXCEPTION_DECIDE", {
                    requestRef: row.requestRef,
                    expectedVersion: row.version,
                    decision: "APPROVED",
                    reason: "Aprobación administrativa registrada",
                  })
                }
                className="rounded bg-indigo-600 px-3 py-2 text-xs font-bold text-white"
              >
                Aprobar excepción
              </button>
            )}
        </div>
      )}
    </article>
  );
}
