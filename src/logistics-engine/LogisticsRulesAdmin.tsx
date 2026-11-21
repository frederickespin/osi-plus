import { type FormEvent, lazy, Suspense, useCallback, useEffect, useId, useMemo, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { AdministrationHelp } from "@/administration/AdministrationHelp";
import AdministrationSetupGuide from "@/administration/AdministrationSetupGuide";
import { COMPACT_FORM_FIELD } from "@/components/ui/compact-form";
import { NumericInput } from "@/components/ui/numeric-input";
import { getMembershipRef } from "@/lib/sessionStore";
import { cn } from "@/lib/utils";
import { logisticsApi, logisticsErrorMessage, type LogisticsRule } from "./api";
import type { LogisticsUiAccess } from "./access";
import { NO_COSTING_ACCESS, type CostingUiAccess } from "@/costing/access";
import { isCostingUiEnabled } from "@/costing/mode";
import { resolveTransportUiAccess } from "./transportAccess";
import type { TransportZoneEditorTab } from "./TransportZoneEditor";
import { LOGISTICS_SETUP_LABELS, LOGISTICS_SETUP_LESSONS, type LogisticsSetupTopic } from "./LogisticsSetupGuide";

const TransportZonesAdmin = lazy(() => import("./TransportZonesAdmin"));
const LogisticsGeographyAdmin = lazy(() => import("./LogisticsGeographyAdmin"));
const ALL_GUIDE_TOPICS: readonly LogisticsSetupTopic[] = ["bases", "metro", "location", "operation", "rules"];
const BASIC_GUIDE_TOPICS: readonly LogisticsSetupTopic[] = ["bases", "metro", "rules"];
const LOGISTICS_TABS = [
  { id: "bases", label: "Sedes" }, { id: "metro", label: "Zona metro" },
  { id: "zones", label: "Ciudades y sectores" }, { id: "rules", label: "Reglas operativas" },
] as const;
type LogisticsTab = typeof LOGISTICS_TABS[number]["id"];

type Props = Readonly<{ authorization?: string; access: LogisticsUiAccess; costingAccess?: CostingUiAccess; onUnauthorized(): void }>;
type Draft = Readonly<{
  requestId: string; sourceRule: LogisticsRule | null; family: string; name: string;
  priority: string; specificity: string; mode: string; kind: string; label: string; quantity: string; state: string;
}>;
const FAMILY_LABELS: Readonly<Record<string, string>> = {
  LABOR: "Personal", TIME: "Tiempo de trabajo", TRANSPORT: "Transporte", MATERIAL: "Materiales", ASSET: "Equipos",
  EXTERNAL: "Proveedores externos", PER_DIEM: "Dietas", LODGING: "Alojamiento", TOLL: "Peajes", PARKING: "Estacionamiento",
  PERMIT: "Permisos y gestiones", ZONE: "Zonas operativas", CRATING: "Huacales",
};
const MODE_LABELS: Readonly<Record<string, string>> = { LOCAL: "Local / Nacional", EXPORT: "Exportación", IMPORT: "Importación" };
const STATE_LABELS: Readonly<Record<string, string>> = { DRAFT: "Borrador", ACTIVE: "Activa", INACTIVE: "Inactiva", SUPERSEDED: "Reemplazada" };
const CURRENT_MODES = "CURRENT_MODES";
const EMPTY: Omit<Draft, "requestId"> = {
  sourceRule: null, family: "LABOR", name: "", priority: "100", specificity: "0", mode: "",
  kind: "", label: "", quantity: "1", state: "DRAFT",
};
const field = cn(COMPACT_FORM_FIELD, "mt-1 block w-full font-normal");
const numberField = cn(field, "w-24 tabular-nums");

function ruleMode(rule: LogisticsRule | null): string {
  const modes = rule?.conditions.modes;
  if (modes === undefined) return "";
  if (Array.isArray(modes) && modes.length === 1 && typeof modes[0] === "string" && Object.hasOwn(MODE_LABELS, modes[0])) return modes[0];
  return CURRENT_MODES;
}

function fromRule(rule: LogisticsRule): Draft {
  const { result } = rule;
  return {
    requestId: crypto.randomUUID(), sourceRule: rule, family: rule.family, name: rule.name,
    priority: String(rule.priority), specificity: String(rule.specificity), mode: ruleMode(rule),
    kind: typeof result.kind === "string" ? result.kind : "",
    label: typeof result.label === "string" ? result.label : rule.name,
    quantity: typeof result.quantity === "number" ? String(result.quantity) : "",
    state: "DRAFT",
  };
}

export default function LogisticsRulesAdmin({ authorization, access, costingAccess = NO_COSTING_ACCESS, onUnauthorized }: Props) {
  const transportAccess = resolveTransportUiAccess(access, isCostingUiEnabled() ? costingAccess : NO_COSTING_ACCESS);
  const [selected, setSelected] = useState<LogisticsTab>(() => transportAccess.canZonesView ? "zones" : "rules");
  const [editorTab, setEditorTab] = useState<TransportZoneEditorTab>("location");
  const visible = selected === "zones" && !transportAccess.canZonesView ? "rules" : selected;
  const tabs = transportAccess.canZonesView ? LOGISTICS_TABS : LOGISTICS_TABS.filter((tab) => tab.id !== "zones");
  if (!access.canRulesView) return null;
  return <section id="admin-logistics-engine" data-testid="logistics-rules-admin" className="mt-3 min-w-0 scroll-mt-3 space-y-3">
    <AdministrationSetupGuide title="Motor Logístico" activeTopic={visible === "zones" ? editorTab : visible}
      topics={transportAccess.canZonesView ? ALL_GUIDE_TOPICS : BASIC_GUIDE_TOPICS} labels={LOGISTICS_SETUP_LABELS} lessons={LOGISTICS_SETUP_LESSONS}
      navigation={<div role="tablist" aria-label="Configuración del Motor Logístico" className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map(({ id, label }) => <button key={id} type="button" role="tab" aria-selected={visible === id}
          onClick={() => { setSelected(id); if (id !== "zones") setEditorTab("location"); }}
          className={cn("shrink-0 border-b-2 px-3 py-2 text-xs font-medium", visible === id ? "border-[#003366] text-[#003366]" : "border-transparent text-slate-500")}>{label}</button>)}
      </div>}>
      <Suspense fallback={<p role="status" className="py-8 text-center text-sm text-slate-500">Cargando transporte…</p>}>
        {(visible === "bases" || visible === "metro") && <LogisticsGeographyAdmin key={[visible, getMembershipRef()].join(":")} section={visible}
          authorization={authorization} canManage={access.canRulesManage} onUnauthorized={onUnauthorized} />}
        {visible === "zones" && <TransportZonesAdmin authorization={authorization} access={transportAccess} onUnauthorized={onUnauthorized}
          editorTab={editorTab} onEditorTabChange={setEditorTab} />}
        {visible === "rules" && <OperationalRules authorization={authorization} access={access} onUnauthorized={onUnauthorized} />}
      </Suspense>
    </AdministrationSetupGuide>
  </section>;
}

function OperationalRules({ authorization, access, onUnauthorized }: Props) {
  const formId = useId();
  const [rules, setRules] = useState<readonly LogisticsRule[]>([]); const [family, setFamily] = useState("ALL"); const [error, setError] = useState<string | null>(null); const [draft, setDraft] = useState<Draft | null>(null); const [saving, setSaving] = useState(false);
  const load = useCallback(async () => { try { setRules(await logisticsApi.rules(authorization)); setError(null); } catch (cause) { const code = cause instanceof Error ? cause.message : "LOGISTICS_REQUEST_FAILED"; if (code.includes("AUTH")) onUnauthorized(); else setError(logisticsErrorMessage(cause)); } }, [authorization, onUnauthorized]);
  useEffect(() => { if (access.canRulesView) void load(); }, [access.canRulesView, load]);
  const visible = useMemo(() => rules.filter((row) => family === "ALL" || row.family === family), [family, rules]);
  const replacesActiveRule = draft?.sourceRule && rules.some((row) => row.seriesRef === draft.sourceRule?.seriesRef && row.state === "ACTIVE");
  const change = (key: Exclude<keyof Draft, "sourceRule" | "requestId">, value: string) => setDraft((current) => current ? { ...current, [key]: value } : current);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft || saving) return;
    setSaving(true); setError(null);
    try {
      const { sourceRule } = draft;
      const conditions = { ...sourceRule?.conditions };
      if (draft.mode === "") delete conditions.modes;
      else if (draft.mode !== CURRENT_MODES) conditions.modes = [draft.mode];

      const result: Record<string, unknown> = { ...sourceRule?.result, kind: draft.kind.trim(), label: draft.label.trim() };
      if (!sourceRule) result.unit = "unidad";
      if (!sourceRule || typeof sourceRule.result.quantity === "number") result.quantity = Number(draft.quantity);
      await logisticsApi.versionRule(authorization, {
        seriesRef: sourceRule?.seriesRef ?? null, code: sourceRule?.code ?? null, family: draft.family,
        name: draft.name.trim(), priority: Number(draft.priority), specificity: Number(draft.specificity),
        conditions, result, state: draft.state, validFrom: null, validTo: null,
      }, draft.requestId);
      setDraft(null); await load();
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "";
      if (code.includes("AUTH")) onUnauthorized(); else setError(logisticsErrorMessage(cause));
    } finally { setSaving(false); }
  };
  if (!access.canRulesView) return null;
  return <section className="min-w-0" data-testid="logistics-operational-rules">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
      <h3 className="text-base font-semibold text-slate-950">Reglas operativas</h3>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <select aria-label="Familia logística" value={family} onChange={(event) => setFamily(event.target.value)} className={cn(COMPACT_FORM_FIELD, "max-w-full")}><option value="ALL">Todas las familias</option>{Object.entries(FAMILY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <button type="button" disabled={saving} onClick={() => void load()} aria-label="Actualizar reglas" className="grid h-9 w-9 place-items-center rounded border text-slate-600 disabled:opacity-40"><RefreshCw aria-hidden="true" className="h-4 w-4" /></button>
        {access.canRulesManage && <button type="button" disabled={saving} onClick={() => { setDraft({ ...EMPTY, requestId: crypto.randomUUID() }); setError(null); }} className="inline-flex min-h-9 items-center gap-1.5 rounded bg-[#003366] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"><Plus aria-hidden="true" className="h-4 w-4" />Nueva regla</button>}
      </div>
    </div>
    {error && <p role="alert" className="mt-3 border border-red-200 bg-red-50 p-3 text-xs text-red-800">{error}</p>}
    {draft && <form onSubmit={(event) => void submit(event)} className="mt-3 border bg-slate-50 p-3" data-testid="logistics-rule-form">
      <fieldset disabled={saving} className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4 disabled:opacity-70">
        <label className="text-xs font-semibold">Familia<select value={draft.family} onChange={(event) => change("family", event.target.value)} className={field}>{Object.entries(FAMILY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <div className="lg:col-span-3"><label className="text-xs font-semibold">Nombre de la regla<input required value={draft.name} onChange={(event) => change("name", event.target.value)} className={field} /></label><p className="mt-1 text-[11px] text-slate-500">{draft.sourceRule ? draft.sourceRule.code : "Código automático al guardar"}</p></div>
        <label className="text-xs font-semibold">Modalidad<select value={draft.mode} onChange={(event) => change("mode", event.target.value)} className={field}>
          <option value="">Todas las modalidades</option>
          {ruleMode(draft.sourceRule) === CURRENT_MODES && <option value={CURRENT_MODES}>Modalidades configuradas</option>}
          {Object.entries(MODE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label className="text-xs font-semibold">Estado<select value={draft.state} onChange={(event) => change("state", event.target.value)} className={field}>
          <option value="DRAFT">{STATE_LABELS.DRAFT}</option><option value="ACTIVE">{STATE_LABELS.ACTIVE}</option><option value="INACTIVE">{STATE_LABELS.INACTIVE}</option>
        </select></label>
        <div className="text-xs font-semibold">
          <label htmlFor={`${formId}-kind`}>Tipo de necesidad</label>
          <div className="flex items-center gap-1">
            <input id={`${formId}-kind`} required value={draft.kind} onChange={(event) => change("kind", event.target.value)} className={cn(field, "min-w-0")} />
            <AdministrationHelp title="Tipo de necesidad"><p>Es el identificador que permite reconocer el mismo recurso en otras configuraciones, por ejemplo GRUA. La descripción es el texto que verá el equipo en el plan.</p></AdministrationHelp>
          </div>
        </div>
        <label className="text-xs font-semibold sm:col-span-2 lg:col-span-3">Descripción para el plan<input required value={draft.label} onChange={(event) => change("label", event.target.value)} className={field} /></label>
        <div className="text-xs font-semibold">
          {draft.sourceRule && typeof draft.sourceRule.result.quantity !== "number" ? (
            <><span>Cantidad</span><p className="mt-2 font-normal text-slate-600">Según la regla configurada</p></>
          ) : (
            <><label htmlFor={`${formId}-quantity`}>Cantidad</label><div className="flex items-center gap-1">
              <NumericInput id={`${formId}-quantity`} required min="0" step="0.01" value={draft.quantity} onChange={(event) => change("quantity", event.target.value)} className={numberField} />
              <AdministrationHelp title="Cantidad de la regla"><p>Es el total que sugiere cada aplicación de la regla. En Personal, cantidad 2 significa dos personas. En Huacales, cantidad 1 significa un huacal.</p></AdministrationHelp>
            </div></>
          )}
        </div>
        <details onInvalidCapture={(event) => { event.currentTarget.open = true; }} className="border-t pt-2 sm:col-span-2 lg:col-span-4">
          <summary className="w-fit cursor-pointer rounded px-1 text-xs font-semibold text-[#003366] focus-visible:outline-2">Orden de aplicación</summary>
          <div className="mt-2 flex flex-wrap gap-4">
            <div className="text-xs font-semibold"><label htmlFor={`${formId}-priority`}>Prioridad</label><div className="flex items-center gap-1">
              <NumericInput id={`${formId}-priority`} required min="0" step="1" value={draft.priority} onChange={(event) => change("priority", event.target.value)} className={numberField} />
              <AdministrationHelp title="Prioridad de reglas"><p>El valor mayor se evalúa primero. Si dos reglas son alternativas del mismo grupo, una prioridad de 200 prevalece sobre una de 100. Si son independientes, ambas pueden aplicar.</p></AdministrationHelp>
            </div></div>
            <div className="text-xs font-semibold"><label htmlFor={`${formId}-specificity`}>Especificidad</label><div className="flex items-center gap-1">
              <NumericInput id={`${formId}-specificity`} required min="0" step="1" value={draft.specificity} onChange={(event) => change("specificity", event.target.value)} className={numberField} />
              <AdministrationHelp title="Especificidad de reglas"><p>Es el segundo criterio de orden cuando la prioridad coincide. En un grupo excluyente, gana el valor mayor. Si ambas cifras coinciden, el sistema señala un conflicto.</p></AdministrationHelp>
            </div></div>
          </div>
        </details>
        {replacesActiveRule && draft.state !== "ACTIVE" && <p className="text-xs text-amber-800 sm:col-span-2 lg:col-span-4">Al guardar esta versión, la regla activa se reemplaza y deja de aplicarse.</p>}
        <div className="flex items-end justify-end gap-2 sm:col-span-2 lg:col-span-4"><button type="button" onClick={() => setDraft(null)} className="min-h-9 rounded border bg-white px-3 py-2 text-xs font-bold">Cancelar</button><button type="submit" disabled={saving} className="min-h-9 rounded bg-[#003366] px-3 py-2 text-xs font-bold text-white">{saving ? "Guardando…" : draft.sourceRule ? "Crear nueva versión" : "Guardar regla"}</button></div>
      </fieldset>
    </form>}
    <div className="mt-3 overflow-x-auto border bg-white"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="p-2">Familia</th><th className="p-2">Regla</th><th className="p-2">Prioridad</th><th className="p-2">Especificidad</th><th className="p-2">Versión</th><th className="p-2">Estado</th>{access.canRulesManage && <th className="p-2">Acción</th>}</tr></thead><tbody>{visible.map((row) => <tr key={row.ruleRef} className="border-t hover:bg-slate-50"><td className="p-2 font-bold">{FAMILY_LABELS[row.family] ?? row.family}</td><td className="p-2"><strong>{row.name}</strong><span className="block font-mono text-[10px] text-slate-500">{row.code}</span></td><td className="p-2">{row.priority}</td><td className="p-2">{row.specificity}</td><td className="p-2">v{row.version}</td><td className="p-2">{STATE_LABELS[row.state] ?? row.state}</td>{access.canRulesManage && <td className="p-2"><button type="button" disabled={saving} onClick={() => { setDraft(fromRule(row)); setError(null); }} className="rounded border px-2 py-1 font-bold disabled:opacity-40">Nueva versión</button></td>}</tr>)}</tbody></table></div>
    {visible.length === 0 && <p className="border border-t-0 bg-white p-4 text-center text-xs text-slate-500">Sin reglas para este filtro.</p>}
  </section>;
}
