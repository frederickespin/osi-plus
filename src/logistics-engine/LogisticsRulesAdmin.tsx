import { type FormEvent, lazy, Suspense, useCallback, useEffect, useId, useMemo, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { AdministrationHelp } from "@/administration/AdministrationHelp";
import { COMPACT_FORM_FIELD } from "@/components/ui/compact-form";
import { NumericInput } from "@/components/ui/numeric-input";
import { cn } from "@/lib/utils";
import { logisticsApi, logisticsErrorMessage, type LogisticsRule } from "./api";
import type { LogisticsUiAccess } from "./access";
import { NO_COSTING_ACCESS, type CostingUiAccess } from "@/costing/access";
import { isCostingUiEnabled } from "@/costing/mode";
import { resolveTransportUiAccess } from "./transportAccess";

const TransportZonesAdmin = lazy(() => import("./TransportZonesAdmin"));
const TransportCalculationPanel = lazy(() => import("./TransportCalculationPanel"));

type Props = Readonly<{ authorization?: string; access: LogisticsUiAccess; costingAccess?: CostingUiAccess; onUnauthorized(): void }>;
type Draft = Readonly<{ requestId: string; seriesRef: string | null; family: string; code: string; name: string; priority: string; specificity: string; mode: string; kind: string; label: string; quantity: string; state: string }>;
const FAMILIES = ["LABOR", "TIME", "TRANSPORT", "MATERIAL", "ASSET", "EXTERNAL", "PER_DIEM", "LODGING", "TOLL", "PARKING", "PERMIT", "ZONE", "CRATING"];
const EMPTY: Omit<Draft, "requestId"> = { seriesRef: null, family: "LABOR", code: "", name: "", priority: "100", specificity: "0", mode: "", kind: "", label: "", quantity: "1", state: "DRAFT" };
const field = cn(COMPACT_FORM_FIELD, "mt-1 block w-full font-normal");
const numberField = cn(field, "w-24 tabular-nums");

function fromRule(rule: LogisticsRule): Draft {
  const result = rule.result as Record<string, unknown>; const conditions = rule.conditions as Record<string, unknown>; const modes = Array.isArray(conditions.modes) ? conditions.modes : [];
  return { requestId: crypto.randomUUID(), seriesRef: rule.seriesRef, family: rule.family, code: rule.code, name: rule.name, priority: String(rule.priority), specificity: String(rule.specificity), mode: typeof modes[0] === "string" ? modes[0] : "", kind: typeof result.kind === "string" ? result.kind : "", label: typeof result.label === "string" ? result.label : rule.name, quantity: typeof result.quantity === "number" ? String(result.quantity) : "1", state: "DRAFT" };
}

export default function LogisticsRulesAdmin({ authorization, access, costingAccess = NO_COSTING_ACCESS, onUnauthorized }: Props) {
  const transportAccess = resolveTransportUiAccess(access, isCostingUiEnabled() ? costingAccess : NO_COSTING_ACCESS);
  const [selected, setSelected] = useState<"zones" | "calculate" | "rules">(() => transportAccess.canZonesView ? "zones" : "rules");
  const visible = selected === "zones" && !transportAccess.canZonesView || selected === "calculate" && !transportAccess.canView ? "rules" : selected;
  if (!access.canRulesView) return null;
  return <section id="admin-logistics-engine" data-testid="logistics-rules-admin" className="mt-3 min-w-0 scroll-mt-3 space-y-3">
    <header className="flex items-center gap-1"><h2 className="text-base font-semibold text-[#003366]">Motor Logístico</h2><AdministrationHelp title="Motor Logístico"><p>Defina geocercas y costos por zona. El transporte considera combustible, peajes, dietas y viáticos para cotizaciones, servicios y visitas.</p><p>El cálculo conserva las tarifas y el recorrido utilizados. El costo de una visita se distingue de lo que se cobra al cliente.</p><p>Las reglas operativas conservan la configuración de personal, materiales, equipos y otras necesidades.</p></AdministrationHelp></header>
    <div role="tablist" aria-label="Configuración del Motor Logístico" className="flex gap-1 overflow-x-auto border-b border-slate-200">
      {transportAccess.canZonesView && <button type="button" role="tab" aria-selected={visible === "zones"} onClick={() => setSelected("zones")} className={`shrink-0 border-b-2 px-3 py-2 text-xs font-medium ${visible === "zones" ? "border-[#003366] text-[#003366]" : "border-transparent text-slate-500"}`}>Zonas y costos</button>}
      {transportAccess.canView && <button type="button" role="tab" aria-selected={visible === "calculate"} onClick={() => setSelected("calculate")} className={`shrink-0 border-b-2 px-3 py-2 text-xs font-medium ${visible === "calculate" ? "border-[#003366] text-[#003366]" : "border-transparent text-slate-500"}`}>Calcular transporte</button>}
      <button type="button" role="tab" aria-selected={visible === "rules"} onClick={() => setSelected("rules")} className={`shrink-0 border-b-2 px-3 py-2 text-xs font-medium ${visible === "rules" ? "border-[#003366] text-[#003366]" : "border-transparent text-slate-500"}`}>Reglas operativas</button>
    </div>
    <Suspense fallback={<p role="status" className="py-8 text-center text-sm text-slate-500">Cargando transporte…</p>}>
      {visible === "zones" && <TransportZonesAdmin authorization={authorization} access={transportAccess} onUnauthorized={onUnauthorized} />}
      {visible === "calculate" && <TransportCalculationPanel authorization={authorization} access={transportAccess} onUnauthorized={onUnauthorized} />}
      {visible === "rules" && <OperationalRules authorization={authorization} access={access} onUnauthorized={onUnauthorized} />}
    </Suspense>
  </section>;
}

function OperationalRules({ authorization, access, onUnauthorized }: Props) {
  const formId = useId();
  const [rules, setRules] = useState<readonly LogisticsRule[]>([]); const [family, setFamily] = useState("ALL"); const [error, setError] = useState<string | null>(null); const [draft, setDraft] = useState<Draft | null>(null); const [saving, setSaving] = useState(false);
  const load = useCallback(async () => { try { setRules(await logisticsApi.rules(authorization)); setError(null); } catch (cause) { const code = cause instanceof Error ? cause.message : "LOGISTICS_REQUEST_FAILED"; if (code.includes("AUTH")) onUnauthorized(); else setError(logisticsErrorMessage(cause)); } }, [authorization, onUnauthorized]);
  useEffect(() => { if (access.canRulesView) void load(); }, [access.canRulesView, load]);
  const visible = useMemo(() => rules.filter((row) => family === "ALL" || row.family === family), [family, rules]);
  const change = (key: Exclude<keyof Draft, "seriesRef" | "requestId">, value: string) => setDraft((current) => current ? { ...current, [key]: value } : current);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft || saving) return;
    setSaving(true); setError(null);
    try {
      await logisticsApi.versionRule(authorization, { seriesRef: draft.seriesRef, family: draft.family, code: draft.code.trim() || null, name: draft.name.trim(), priority: Number(draft.priority), specificity: Number(draft.specificity), conditions: draft.mode ? { modes: [draft.mode] } : {}, result: { kind: draft.kind.trim(), label: draft.label.trim(), quantity: Number(draft.quantity), unit: "unidad" }, state: draft.state, validFrom: null, validTo: null }, draft.requestId);
      setDraft(null); await load();
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "";
      if (code.includes("AUTH")) onUnauthorized(); else setError(logisticsErrorMessage(cause));
    } finally { setSaving(false); }
  };
  if (!access.canRulesView) return null;
  return <section className="min-w-0" data-testid="logistics-operational-rules">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
      <div className="flex items-center gap-1"><h2 className="text-base font-semibold text-slate-950">Reglas logísticas</h2><AdministrationHelp title="Motor Logístico"><p>Configura las reglas para personal, tiempos, transporte, materiales, equipos, viáticos, zonas y otros recursos del servicio.</p><p>Filtra por familia y crea una nueva versión para actualizar una regla. Las versiones anteriores conservan su historial.</p></AdministrationHelp></div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <select aria-label="Familia logística" value={family} onChange={(event) => setFamily(event.target.value)} className={cn(COMPACT_FORM_FIELD, "max-w-full")}><option value="ALL">Todas las familias</option>{FAMILIES.map((value) => <option key={value}>{value}</option>)}</select>
        <button type="button" disabled={saving} onClick={() => void load()} aria-label="Actualizar reglas" className="grid h-9 w-9 place-items-center rounded border text-slate-600 disabled:opacity-40"><RefreshCw aria-hidden="true" className="h-4 w-4" /></button>
        {access.canRulesManage && <button type="button" disabled={saving} onClick={() => { setDraft({ ...EMPTY, requestId: crypto.randomUUID() }); setError(null); }} className="inline-flex min-h-9 items-center gap-1.5 rounded bg-[#003366] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"><Plus aria-hidden="true" className="h-4 w-4" />Nueva regla</button>}
      </div>
    </div>
    {error && <p role="alert" className="mt-3 border border-red-200 bg-red-50 p-3 text-xs text-red-800">{error}</p>}
    {draft && <form onSubmit={(event) => void submit(event)} className="mt-3 border bg-slate-50 p-3" data-testid="logistics-rule-form">
      <fieldset disabled={saving} className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4 disabled:opacity-70">
        <label className="text-xs font-semibold">Familia<select value={draft.family} onChange={(event) => change("family", event.target.value)} className={field}>{FAMILIES.map((value) => <option key={value}>{value}</option>)}</select></label>
        <div className="lg:col-span-3"><label className="text-xs font-semibold">Nombre empresarial<input required value={draft.name} onChange={(event) => change("name", event.target.value)} className={field} /></label><p className="mt-1 text-[11px] text-slate-500">{draft.seriesRef ? `Código: ${draft.code}` : "Código automático al guardar"}</p></div>
        <div className="text-xs font-semibold"><label htmlFor={`${formId}-priority`}>Prioridad</label><div className="flex items-center gap-1"><NumericInput id={`${formId}-priority`} required min="0" step="1" value={draft.priority} onChange={(event) => change("priority", event.target.value)} className={numberField} /><AdministrationHelp title="Prioridad de reglas"><p>Ordena las reglas que cumplen sus condiciones, de mayor a menor prioridad. Las reglas independientes que correspondan siguen aplicándose.</p><p>Ejemplo: una prioridad de 200 se evalúa antes que una de 100. Cambiar de 100 a 200 no duplica la cantidad ni el costo.</p><p>Si dos reglas tienen la misma prioridad, se ordenan por especificidad.</p></AdministrationHelp></div></div>
        <div className="text-xs font-semibold"><label htmlFor={`${formId}-specificity`}>Especificidad</label><div className="flex items-center gap-1"><NumericInput id={`${formId}-specificity`} required min="0" step="1" value={draft.specificity} onChange={(event) => change("specificity", event.target.value)} className={numberField} /><AdministrationHelp title="Especificidad de reglas"><p>Ordena las reglas que tienen la misma prioridad; se evalúa primero la especificidad mayor.</p><p>Ejemplo: con prioridad 100 en ambas reglas, una especificidad de 2 va antes que una de 1. Este número no aumenta cantidades ni costos y no descarta otras reglas independientes.</p></AdministrationHelp></div></div>
        <label className="text-xs font-semibold">Modo aplicable<select value={draft.mode} onChange={(event) => change("mode", event.target.value)} className={field}><option value="">Todos</option><option>LOCAL</option><option>EXPORT</option><option>IMPORT</option></select></label>
        <label className="text-xs font-semibold">Estado<select value={draft.state} onChange={(event) => change("state", event.target.value)} className={field}><option>DRAFT</option><option>ACTIVE</option><option>INACTIVE</option></select></label>
        <label className="text-xs font-semibold">Tipo de necesidad<input required value={draft.kind} onChange={(event) => change("kind", event.target.value)} className={field} /></label>
        <label className="text-xs font-semibold sm:col-span-2">Etiqueta visible<input required value={draft.label} onChange={(event) => change("label", event.target.value)} className={field} /></label>
        <div className="text-xs font-semibold"><label htmlFor={`${formId}-quantity`}>Cantidad</label><div className="flex items-center gap-1"><NumericInput id={`${formId}-quantity`} required min="0" step="0.01" value={draft.quantity} onChange={(event) => change("quantity", event.target.value)} className={numberField} /><AdministrationHelp title="Cantidad de la regla"><p>Es la cantidad sugerida de esta necesidad cuando la regla se aplica.</p><p>Ejemplo: pasar de 2 a 3 unidades añade 1 unidad, un aumento del 50 %. La tarifa y el costo se determinan en el costeo correspondiente.</p><p>Ingrese 0 solo cuando la cantidad realmente sea cero.</p></AdministrationHelp></div></div>
        <div className="flex items-end justify-end gap-2 sm:col-span-2 lg:col-span-4"><button type="button" onClick={() => setDraft(null)} className="min-h-9 rounded border bg-white px-3 py-2 text-xs font-bold">Cancelar</button><button type="submit" disabled={saving} className="min-h-9 rounded bg-[#003366] px-3 py-2 text-xs font-bold text-white">{saving ? "Guardando…" : draft.seriesRef ? "Crear nueva versión" : "Guardar regla"}</button></div>
      </fieldset>
    </form>}
    <div className="mt-3 overflow-x-auto border bg-white"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="p-2">Familia</th><th className="p-2">Regla</th><th className="p-2">Prioridad</th><th className="p-2">Especificidad</th><th className="p-2">Versión</th><th className="p-2">Estado</th>{access.canRulesManage && <th className="p-2">Acción</th>}</tr></thead><tbody>{visible.map((row) => <tr key={row.ruleRef} className="border-t hover:bg-slate-50"><td className="p-2 font-bold">{row.family}</td><td className="p-2"><strong>{row.name}</strong><span className="block font-mono text-[10px] text-slate-500">{row.code}</span></td><td className="p-2">{row.priority}</td><td className="p-2">{row.specificity}</td><td className="p-2">v{row.version}</td><td className="p-2">{row.state}</td>{access.canRulesManage && <td className="p-2"><button type="button" disabled={saving} onClick={() => { setDraft(fromRule(row)); setError(null); }} className="rounded border px-2 py-1 font-bold disabled:opacity-40">Nueva versión</button></td>}</tr>)}</tbody></table></div>
    {visible.length === 0 && <p className="border border-t-0 bg-white p-4 text-center text-xs text-slate-500">Sin reglas para este filtro.</p>}
  </section>;
}
