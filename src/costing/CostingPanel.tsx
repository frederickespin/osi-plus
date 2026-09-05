import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Calculator, CheckCircle2, CircleDollarSign, RefreshCw, ShieldAlert, SlidersHorizontal, TrendingDown, TrendingUp } from "lucide-react";
import type { CostingUiAccess } from "./access";
import { costingApi, type CostingCalculation, type CostingLine, type CostingRevision } from "./api";

const FAMILY_LABELS: Record<string, string> = { LABOR: "Personal", TRANSPORT: "Transporte", MATERIAL: "Materiales", CRATING: "Cajas de madera", ASSET: "Herramientas y equipos", TRAVEL: "Dietas y viáticos", THIRD_PARTY: "Terceros", FREIGHT: "Fletes", CUSTOMS: "Aduanas", PERMIT: "Permisos y gestiones", ADDITIONAL: "Cargos adicionales", RISK: "Riesgos", CURRENCY_COMPENSATION: "Compensación por moneda" };
const CLASS_LABELS: Record<string, string> = { PR: "Pr · propio", EX: "Ex · externo", DE: "De · desembolso" };

type Props = Readonly<{ caseRef: string; authorization?: string; access: CostingUiAccess; onUnauthorized(): void }>;

function money(value: string | number | null, currency: string) {
  if (value == null) return "Pendiente";
  return new Intl.NumberFormat("es-DO", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value));
}

function LineTable({ rows, currency, onOverride }: { rows: readonly CostingLine[]; currency: string; onOverride?: (line: CostingLine) => void }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[860px] border-collapse text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr>{["Familia", "Concepto", "Tipo", "Cant.", "Unidad", "Costo", "Sugerido", "Estado", ""].map((label) => <th key={label} className="border-b px-3 py-2">{label}</th>)}</tr></thead><tbody>{rows.map((line) => <tr key={line.lineRef || `${line.position}-${line.concept}`} className="border-b last:border-0"><td className="px-3 py-2 font-bold text-[#003366]">{FAMILY_LABELS[line.family] || line.family}</td><td className="px-3 py-2"><strong className="block text-slate-900">{line.concept}</strong><span className="text-[10px] text-slate-500">{line.source} · v{line.sourceVersion}</span></td><td className="px-3 py-2">{CLASS_LABELS[line.classification]}</td><td className="px-3 py-2 tabular-nums">{line.quantity}</td><td className="px-3 py-2">{line.unit}</td><td className="px-3 py-2 tabular-nums">{money(line.totalCost, currency)}</td><td className="px-3 py-2 tabular-nums font-bold">{money(line.suggestedPrice, currency)}</td><td className="px-3 py-2"><span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-semibold">{line.priceStatus}</span></td><td className="px-3 py-2">{onOverride && line.lineRef && <button type="button" onClick={() => onOverride(line)} className="rounded border px-2 py-1 text-[10px] font-bold"><SlidersHorizontal className="mr-1 inline h-3 w-3" />Ajustar</button>}</td></tr>)}</tbody></table></div>;
}

function Totals({ value, currency }: { value: CostingRevision["totals"]; currency: string }) {
  const rows = [["Costos propios", value.ownCosts], ["Costos externos", value.externalCosts], ["Desembolsos", value.disbursements], ["Riesgos", value.risks], ["Compensación moneda", value.currencyCompensation], ["Costo total", value.totalCost], ["Precio sugerido interno", value.suggestedPrice]] as const;
  return <aside className="border bg-white p-3"><h3 className="text-xs font-black uppercase tracking-wide text-[#003366]">Resumen económico</h3><dl className="mt-2 divide-y">{rows.map(([label, amount]) => <div key={label} className="flex items-center justify-between gap-4 py-2 text-xs"><dt className="text-slate-600">{label}</dt><dd className="font-bold tabular-nums">{money(amount, currency)}</dd></div>)}<div className="flex items-center justify-between gap-4 py-2 text-xs"><dt className="text-slate-600">Margen esperado propio</dt><dd className="font-bold">{value.expectedMarginBps == null ? "Sin política" : `${(value.expectedMarginBps / 100).toFixed(2)}%`}</dd></div></dl></aside>;
}

export default function CostingPanel({ caseRef, authorization, access, onUnauthorized }: Props) {
  const [revision, setRevision] = useState<CostingRevision | null>(null);
  const [calculation, setCalculation] = useState<CostingCalculation | null>(null);
  const [family, setFamily] = useState("ALL");
  const [classification, setClassification] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overrideLine, setOverrideLine] = useState<CostingLine | null>(null);
  const [overrideAmount, setOverrideAmount] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const current = calculation?.result || revision;
  const currency = calculation?.baseCurrency || revision?.baseCurrency || "DOP";
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRevision(await costingApi.revision(authorization, caseRef)); }
    catch (cause) { const code = cause instanceof Error ? cause.message : "COSTING_REQUEST_FAILED"; if (code.includes("UNAUTHORIZED")) onUnauthorized(); else setError(code); }
    finally { setLoading(false); }
  }, [authorization, caseRef, onUnauthorized]);
  useEffect(() => { void load(); }, [load]);
  const calculate = async () => {
    setBusy(true); setError(null);
    try {
      const logistics = await costingApi.currentLogistics(authorization, caseRef);
      if (!logistics) throw new Error("COSTING_LOGISTICS_REVISION_REQUIRED");
      setCalculation(await costingApi.calculate(authorization, { caseRef, logisticsPlanRevisionRef: logistics.revisionRef, baseCurrency: currency }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "COSTING_REQUEST_FAILED"); }
    finally { setBusy(false); }
  };
  const publish = async () => {
    if (!calculation) return;
    setBusy(true); setError(null);
    try { const value = await costingApi.publish(authorization, calculation.calculationRef); setRevision(value); setCalculation(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "COSTING_REQUEST_FAILED"); }
    finally { setBusy(false); }
  };
  const saveOverride = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!overrideLine || !revision) return;
    setBusy(true); setError(null);
    try {
      await costingApi.override(authorization, { revisionRef: revision.revisionRef, lineRef: overrideLine.lineRef, kind: "SUGGESTED_PRICE", expectedSuggested: { totalCost: overrideLine.totalCost, suggestedPrice: overrideLine.suggestedPrice, classification: overrideLine.classification, minimumMarginBps: overrideLine.minimumMarginBps, recommendedMarginBps: overrideLine.recommendedMarginBps }, finalValue: { amount: overrideAmount, currency: revision.baseCurrency }, reason: overrideReason });
      setOverrideLine(null); setOverrideAmount(""); setOverrideReason(""); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "COSTING_REQUEST_FAILED"); }
    finally { setBusy(false); }
  };
  const authorize = async (overrideRef: string, decision: "AUTHORIZED" | "REJECTED") => {
    setBusy(true); setError(null);
    try { await costingApi.authorize(authorization, { overrideRef, decision, reason: decision === "AUTHORIZED" ? "Autorización económica confirmada" : "Ajuste económico rechazado" }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "COSTING_REQUEST_FAILED"); }
    finally { setBusy(false); }
  };
  const rows = useMemo(() => (current?.lines || []).filter((line) => (family === "ALL" || line.family === family) && (classification === "ALL" || line.classification === classification)), [classification, current, family]);
  if (!access.canView) return <div role="tabpanel" className="border border-dashed p-8 text-center text-sm text-slate-600">No tiene acceso a Costos.</div>;
  return <section role="tabpanel" aria-label="Costos" data-testid="costing-panel" className="space-y-3"><header className="flex flex-wrap items-center justify-between gap-3 border bg-slate-50 p-3"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-indigo-600">Después del Motor Logístico</p><h2 className="font-black text-[#003366]">Costos</h2><p className="text-xs text-slate-600">Costos, fuentes, versiones, moneda y margen. No es una Cotización comercial.</p></div><div className="flex gap-2">{access.canCalculate && <button type="button" disabled={busy} onClick={() => void calculate()} className="rounded border bg-white px-3 py-2 text-xs font-bold"><Calculator className="mr-1 inline h-4 w-4" />{current ? "Recalcular" : "Calcular"}</button>}{access.canPublish && calculation && <button type="button" disabled={busy} onClick={() => void publish()} className="rounded bg-[#003366] px-3 py-2 text-xs font-bold text-white"><CheckCircle2 className="mr-1 inline h-4 w-4" />Publicar revisión</button>}<button type="button" aria-label="Actualizar Costos" disabled={busy} onClick={() => void load()} className="rounded border bg-white p-2"><RefreshCw className="h-4 w-4" /></button></div></header>
    {loading && <p className="p-8 text-center text-sm text-slate-500">Cargando Costos…</p>}
    {error && <p role="alert" className="border border-red-200 bg-red-50 p-3 text-sm text-red-800">{({ COSTING_INPUT_STALE: "Cambió el plan o una autoridad económica. Recalcule antes de publicar.", COSTING_BLOCKERS_PRESENT: "Existen blockers económicos; resuélvalos antes de publicar.", COSTING_LOGISTICS_REVISION_REQUIRED: "Primero publique una revisión del Motor Logístico." } as Record<string, string>)[error] || error}</p>}
    {calculation && <p className="border border-sky-200 bg-sky-50 p-3 text-xs font-semibold text-sky-900">Cálculo preview reproducible · aún no publicado.</p>}
    {revision && !calculation && <p className="border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-900">Revisión económica {revision.revision} publicada · snapshot inmutable.</p>}
    {revision?.overrides?.length ? <section className="border bg-white p-3" aria-label="Overrides económicos"><h3 className="text-xs font-black uppercase tracking-wide text-[#003366]">Overrides y autorizaciones</h3><div className="mt-2 divide-y">{revision.overrides.map((row) => <div key={row.overrideRef} className="flex flex-wrap items-center gap-2 py-2 text-xs"><span className="font-bold">{row.kind}</span><span className="text-slate-600">{row.reason}</span><span className={`rounded px-2 py-1 text-[10px] font-bold ${row.authorization?.decision === "AUTHORIZED" ? "bg-emerald-100 text-emerald-800" : row.authorization?.decision === "REJECTED" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>{row.authorization?.decision || row.status}</span>{row.status === "AUTHORIZATION_REQUIRED" && !row.authorization && access.canAuthorizeMargin && <span className="ml-auto flex gap-2"><button type="button" disabled={busy} onClick={() => void authorize(row.overrideRef, "REJECTED")} className="rounded border px-2 py-1 font-bold">Rechazar margen</button><button type="button" disabled={busy} onClick={() => void authorize(row.overrideRef, "AUTHORIZED")} className="rounded bg-[#003366] px-2 py-1 font-bold text-white">Autorizar margen</button></span>}</div>)}</div></section> : null}
    {current?.issues?.length ? <div className="grid gap-2 sm:grid-cols-2">{current.issues.map((issue) => <div key={issue.issueRef || `${issue.code}-${issue.family}`} className={`border p-3 text-xs ${issue.severity === "BLOCKER" ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50"}`}><strong>{issue.severity === "BLOCKER" ? <ShieldAlert className="mr-1 inline h-4 w-4" /> : <AlertTriangle className="mr-1 inline h-4 w-4" />}{issue.code}</strong><p className="mt-1 text-slate-700">{issue.message}</p><span className="mt-1 block text-[10px] uppercase text-slate-500">{issue.source} · {issue.status}</span></div>)}</div> : current && <p className="border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">Sin blockers económicos.</p>}
    {overrideLine && <form onSubmit={(event) => void saveOverride(event)} className="grid gap-3 border border-indigo-200 bg-indigo-50 p-3 sm:grid-cols-2" data-testid="costing-override-form"><div className="sm:col-span-2"><p className="text-xs font-black text-indigo-950">Ajustar precio sugerido interno · {overrideLine.concept}</p><p className="mt-1 text-[10px] text-indigo-700">Costo {money(overrideLine.totalCost, currency)} · sugerido {money(overrideLine.suggestedPrice, currency)}</p></div><label className="text-xs font-semibold">Importe final<input required min="0" step="0.01" type="number" value={overrideAmount} onChange={(event) => setOverrideAmount(event.target.value)} className="mt-1 w-full rounded border bg-white p-2" /></label><label className="text-xs font-semibold">Justificación<input required minLength={8} value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} className="mt-1 w-full rounded border bg-white p-2" /></label><div className="flex items-center gap-2 sm:col-span-2">{Number(overrideAmount) > Number(overrideLine.suggestedPrice) ? <span className="text-xs font-bold text-blue-700"><TrendingUp className="mr-1 inline h-4 w-4" />Superior al sugerido</span> : overrideAmount && Number(overrideAmount) < Number(overrideLine.suggestedPrice) ? <span className="text-xs font-bold text-red-700"><TrendingDown className="mr-1 inline h-4 w-4" />Inferior al sugerido; puede requerir autorización</span> : null}<span className="ml-auto flex gap-2"><button type="button" onClick={() => setOverrideLine(null)} className="rounded border bg-white px-3 py-2 text-xs font-bold">Cancelar</button><button disabled={busy} className="rounded bg-[#003366] px-3 py-2 text-xs font-bold text-white">Registrar override</button></span></div></form>}
    {current && <div className="flex flex-wrap gap-2 border bg-white p-2"><select aria-label="Filtrar familia de costo" value={family} onChange={(event) => setFamily(event.target.value)} className="rounded border px-3 py-2 text-xs"><option value="ALL">Todas las familias</option>{Object.entries(FAMILY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select aria-label="Filtrar clasificación económica" value={classification} onChange={(event) => setClassification(event.target.value)} className="rounded border px-3 py-2 text-xs"><option value="ALL">Pr + Ex + De</option><option value="PR">Pr · propio</option><option value="EX">Ex · externo</option><option value="DE">De · desembolso</option></select></div>}
    {current && <div className="grid gap-3 2xl:grid-cols-[minmax(0,1fr)_270px]"><section className="overflow-hidden border bg-white"><LineTable rows={rows} currency={currency} onOverride={revision && !calculation && access.canOverride ? (line) => { setOverrideLine(line); setOverrideAmount(line.suggestedPrice || line.totalCost); } : undefined} /></section><Totals value={current.totals} currency={currency} /></div>}
    {!loading && !current && <div className="grid min-h-48 place-items-center border border-dashed text-center text-sm text-slate-500"><div><CircleDollarSign className="mx-auto mb-2 h-7 w-7 text-slate-300" />No existe un cálculo de Costos. Primero publique el Motor Logístico.</div></div>}
  </section>;
}
