import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowRight, CalendarDays, ListChecks, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CrmServicesApi, CrmServicesApiError } from "@/crm-services/api";
import type { ServiceCaseIntake } from "@/crm-services/ServiceCasePanel";
import type { SurveyIntakeMethod } from "@/survey/SurveyCasePanel";
import { commercialIntake, isServiceIntakeDate, type CaseDirectQuote } from "./caseCommercialIntake";

type Plan = Parameters<NonNullable<ServiceCaseIntake["nextStep"]>>[0];
type Props = Readonly<{
  caseRef: string;
  authorization?: string;
  estimatedCbm: number | null;
  plan: Plan;
  canCapture: boolean;
  onSchedule?: (method: SurveyIntakeMethod) => void;
  onQuote?: () => void;
  onSavingChange(saving: boolean): void;
  onUnauthorized(): void;
}>;
type DirectDraft = {
  source: CaseDirectQuote["source"];
  clientList: string;
  volume: string;
  originAccess: string;
  destinationAccess: string;
  specialWork: string;
};
type Destination = "DATE" | "SURVEY" | "QUOTE";

const FIELD = "h-9 w-full min-w-0 rounded-sm border-0 bg-slate-100 px-2 text-sm font-normal text-slate-900 outline-none focus:bg-sky-50 focus-visible:ring-2 focus-visible:ring-[#0070a8] disabled:opacity-70";
const LABEL = "grid min-w-0 gap-1 text-xs font-semibold text-slate-600";
const METHODS: readonly [SurveyIntakeMethod, string][] = [
  ["IN_PERSON", "Presencial"], ["VIRTUAL", "Virtual"], ["MINI", "Mini Survey"], ["SPECIAL", "Especial"],
];

const saveError = (cause: unknown) => {
  const code = cause instanceof CrmServicesApiError ? cause.code : "";
  if (code === "SERVICE_PACKAGES_SELECTION_INVALID") return "El plan cambió. Actualiza el caso antes de continuar.";
  if (["SERVICE_PACKAGES_VERSION_CONFLICT", "SERVICE_PACKAGES_IDEMPOTENCY_CONFLICT"].includes(code)) {
    return "Los datos del caso cambiaron. Revisa la versión actual y vuelve a guardar.";
  }
  if (code === "SERVICE_PACKAGES_PERMISSION_FORBIDDEN") return "Tu usuario no tiene permiso para guardar estos datos.";
  return "No se pudieron guardar los datos. Intenta de nuevo.";
};

export default function CommercialCaseIntake({ caseRef, authorization, estimatedCbm, plan, canCapture, onSchedule, onQuote, onSavingChange, onUnauthorized }: Props) {
  const api = useMemo(() => new CrmServicesApi(() => authorization ?? null), [authorization]);
  const current = plan.configuration?.current;
  const saved = commercialIntake(current && current.serviceSelectionRef === plan.selectionRef &&
    current.serviceSelectionRevision === plan.selectionRevision ? current.preference : undefined);
  const [choice, setChoice] = useState<"SURVEY" | "DIRECT" | null>(null);
  const [method, setMethod] = useState<SurveyIntakeMethod>("IN_PERSON");
  const [dateEdit, setDateEdit] = useState<string | null>(null);
  const [directEdit, setDirectEdit] = useState<DirectDraft | null>(null);
  const [saving, setSaving] = useState<Destination | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const active = useRef(true);
  const previousRequest = useRef<{ key: string; id: string } | null>(null);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  const step = choice ?? (saved.directQuote && canCapture ? "DIRECT" : onSchedule ? "SURVEY" : "DIRECT");
  const date = dateEdit ?? saved.serviceStartDate ?? "";
  const dateChanged = date !== (saved.serviceStartDate ?? "");
  const dateValid = !date || isServiceIntakeDate(date);
  const hasCaseVolume = typeof estimatedCbm === "number" && estimatedCbm > 0;
  const draft: DirectDraft = directEdit ?? {
    source: saved.directQuote?.source ?? "ESTIMATE",
    clientList: saved.directQuote?.clientList ?? "",
    volume: saved.directQuote ? (saved.directQuote.volumeM3?.toString() ?? "") : hasCaseVolume ? String(estimatedCbm) : "",
    originAccess: saved.directQuote?.originAccess ?? "",
    destinationAccess: saved.directQuote?.destinationAccess ?? "",
    specialWork: saved.directQuote?.specialWork ?? "",
  };
  const volume = draft.volume.trim();
  const amount = volume ? Number(volume.replace(",", ".")) : null;
  const validVolume = amount === null || (/^\d+(?:[.,]\d+)?$/u.test(volume) && amount > 0 && amount <= 100_000);
  const ready = canCapture && Boolean(plan.configuration) && !plan.configurationLoading && !plan.configurationUnavailable;
  const canSave = plan.canContinue && ready && dateValid && !saving;
  const hasList = draft.source === "CLIENT_LIST" && Boolean(draft.clientList.trim());
  const directFieldsPresent = Boolean(amount || hasList || [draft.originAccess, draft.destinationAccess, draft.specialWork].some((value) => value.trim()));
  const canAdvanceQuote = draft.source === "ESTIMATE" ? Boolean(amount) : hasList;
  const directAction = onQuote && canAdvanceQuote ? "Guardar y cotizar" : "Guardar datos";

  function edit(field: keyof DirectDraft, value: string) {
    setDirectEdit({ ...draft, [field]: value });
    setError("");
    setStatus("");
  }

  function openStep(next: "SURVEY" | "DIRECT") {
    setChoice(next);
    setError("");
    setStatus("");
  }

  async function save(destination: Destination, directQuote?: CaseDirectQuote) {
    if (!canSave || !plan.selectionRef) return;
    const command = {
      expectedRevision: current?.revision ?? 0,
      serviceSelectionRef: plan.selectionRef,
      serviceSelectionRevision: plan.selectionRevision,
      intake: { serviceStartDate: date || null, ...(directQuote && { directQuote }) },
    };
    const key = JSON.stringify(command);
    if (previousRequest.current?.key !== key) previousRequest.current = { key, id: crypto.randomUUID() };
    setSaving(destination);
    onSavingChange(true);
    setStatus("");
    setError("");
    try {
      await api.saveCaseIntake(caseRef, { requestId: previousRequest.current.id, ...command });
      if (!active.current) return;
      previousRequest.current = null;
      if (destination === "SURVEY") {
        onSchedule?.(method);
        return;
      }
      if (destination === "QUOTE" && onQuote && canAdvanceQuote) {
        onQuote();
        return;
      }
      plan.reloadConfiguration();
      setStatus(destination === "DATE" ? "Fecha guardada." : "Datos guardados.");
    } catch (cause) {
      if (!active.current) return;
      if (cause instanceof CrmServicesApiError && cause.status === 401) onUnauthorized();
      else {
        setError(saveError(cause));
        if (cause instanceof CrmServicesApiError && cause.status === 409) plan.reloadConfiguration();
      }
    } finally {
      onSavingChange(false);
      if (active.current) setSaving(null);
    }
  }

  function submitDirect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validVolume || !directFieldsPresent) return;
    const clean = (value: string) => value.trim() || null;
    void save("QUOTE", {
      source: draft.source,
      clientList: draft.source === "CLIENT_LIST" ? clean(draft.clientList) : null,
      volumeM3: amount,
      originAccess: clean(draft.originAccess),
      destinationAccess: clean(draft.destinationAccess),
      specialWork: clean(draft.specialWork),
    });
  }

  if (!canCapture && !onSchedule) return null;
  return <section aria-label="Cómo levantar los datos" className="space-y-2.5 border-t border-slate-200 pt-2.5">
    {canCapture && <div className="flex flex-wrap items-end gap-2">
      <label className={cn(LABEL, "min-w-36 max-w-52 flex-1")}>Fecha prevista del servicio
        <input type="date" className={FIELD} value={date} disabled={!ready || Boolean(saving)}
          onChange={(event) => { setDateEdit(event.target.value); setStatus(""); setError(""); }} />
      </label>
      {dateChanged && <Button type="button" size="sm" variant="ghost" disabled={!canSave}
        onClick={() => void save("DATE")}><Save aria-hidden="true" />Guardar fecha</Button>}
    </div>}
    {canCapture && plan.configurationUnavailable && <p role="alert" className="text-xs text-red-700">
      No se pudieron cargar los datos del caso. <button type="button" className="font-semibold underline" onClick={plan.reloadConfiguration}>Reintentar</button>
    </p>}
    <h3 className="text-sm font-semibold text-[#003366]">Cómo levantar los datos</h3>
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Decisión de Survey">
      {onSchedule && <Button type="button" size="sm" aria-pressed={step === "SURVEY"} variant={step === "SURVEY" ? "default" : "ghost"}
        disabled={Boolean(saving)} onClick={() => openStep("SURVEY")}><CalendarDays aria-hidden="true" />Agendar Survey</Button>}
      {canCapture && <Button type="button" size="sm" aria-pressed={step === "DIRECT"} variant={step === "DIRECT" ? "default" : "ghost"}
        disabled={Boolean(saving)} onClick={() => openStep("DIRECT")}><ListChecks aria-hidden="true" />Tomar datos y cotizar</Button>}
    </div>
    {step === "SURVEY" && onSchedule && <div className="flex flex-wrap items-end gap-2">
      <label className={cn(LABEL, "min-w-36 max-w-52 flex-1")}>Tipo de Survey
        <select className={FIELD} value={method} disabled={Boolean(saving)} onChange={(event) => setMethod(event.target.value as SurveyIntakeMethod)}>
          {METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <Button type="button" size="sm" disabled={!plan.canContinue || Boolean(saving) || (dateChanged && !canSave)}
        onClick={() => dateChanged ? void save("SURVEY") : onSchedule(method)}>
        <CalendarDays aria-hidden="true" />{saving === "SURVEY" ? "Guardando…" : "Ver calendario"}
      </Button>
    </div>}
    {step === "DIRECT" && canCapture && <form className="space-y-2" onSubmit={submitDirect}>
      <fieldset disabled={!ready || Boolean(saving)} className="grid min-w-0 gap-2 sm:grid-cols-2">
        <label className={LABEL}>Datos disponibles
          <select className={FIELD} value={draft.source} onChange={(event) => edit("source", event.target.value)}>
            <option value="ESTIMATE">Volumen estimado</option>
            <option value="CLIENT_LIST">Listado del cliente</option>
          </select>
        </label>
        <label className={LABEL}>Volumen estimado (m³)
          <input className={FIELD} inputMode="decimal" maxLength={14} placeholder="Pendiente"
            value={draft.volume} aria-invalid={!validVolume || undefined} onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => edit("volume", event.target.value)} />
        </label>
        {draft.source === "CLIENT_LIST" && <label className={cn(LABEL, "sm:col-span-2")}>Listado del cliente
          <textarea className={cn(FIELD, "h-auto min-h-14 py-2")} rows={2} maxLength={800}
            placeholder="Ej. 1 sofá, 1 mesa y 6 cajas" value={draft.clientList} onChange={(event) => edit("clientList", event.target.value)} />
        </label>}
        <label className={LABEL}>Acceso en origen
          <input className={FIELD} maxLength={100} placeholder="Ej. Ascensor" value={draft.originAccess} onChange={(event) => edit("originAccess", event.target.value)} />
        </label>
        <label className={LABEL}>Acceso en destino
          <input className={FIELD} maxLength={100} placeholder="Por confirmar" value={draft.destinationAccess} onChange={(event) => edit("destinationAccess", event.target.value)} />
        </label>
        <label className={cn(LABEL, "sm:col-span-2")}>Trabajos especiales
          <input className={FIELD} maxLength={260} placeholder="Ej. Dos cajas de madera" value={draft.specialWork} onChange={(event) => edit("specialWork", event.target.value)} />
        </label>
      </fieldset>
      {!validVolume && <p role="alert" className="text-xs text-red-700">Indica un volumen mayor que cero y de hasta 100,000 m³.</p>}
      {draft.source === "CLIENT_LIST" && !amount && <p className="text-xs text-slate-600">Volumen pendiente para calcular por m³.</p>}
      <Button type="submit" size="sm" disabled={!canSave || !validVolume || !directFieldsPresent}>
        {saving === "QUOTE" ? "Guardando…" : directAction}<ArrowRight aria-hidden="true" />
      </Button>
    </form>}
    {!plan.canContinue && <p className="text-xs text-slate-600">Guarda el plan de servicios para continuar.</p>}
    {status && <p role="status" className="text-xs text-emerald-800">{status}</p>}
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
  </section>;
}
