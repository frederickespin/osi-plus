import { Fragment, lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Calculator, Check, CheckCircle2, CircleDollarSign, Package, RefreshCw, ShieldAlert, ShieldCheck, TrendingDown, TrendingUp, X } from "lucide-react";
import type { CostingUiAccess } from "./access";
import { costingApi, type CostingCalculation, type CostingLine, type CostingPackageEstimate, type CostingRevision } from "./api";
import type { TransportCaseAddresses } from "@/logistics-engine/transportApi";
import type { TransportUiAccess } from "@/logistics-engine/transportAccess";
import { PackageCostingForm, PackageCostingSummary } from "./PackageCosting";

const TransportCalculationPanel = lazy(() => import("@/logistics-engine/TransportCalculationPanel"));

const FAMILY_LABELS: Record<string, string> = { LABOR: "Personal", TRANSPORT: "Transporte", MATERIAL: "Materiales", CRATING: "Cajas de madera", ASSET: "Herramientas y equipos", TRAVEL: "Dietas y viáticos", THIRD_PARTY: "Terceros", FREIGHT: "Fletes", CUSTOMS: "Aduanas", PERMIT: "Permisos y gestiones", ADDITIONAL: "Cargos adicionales", RISK: "Riesgos", CURRENCY_COMPENSATION: "Compensación por moneda" };
const CLASS_LABELS: Record<string, string> = { PR: "Pr · propio", EX: "Ex · externo", DE: "De · desembolso" };
const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  COSTING_INPUT_STALE: "Cambió el plan o una tarifa. Recalcule antes de publicar.",
  LOGISTICS_INPUT_STALE: "Cambió la zona, el trayecto o una tarifa de transporte. Vuelva a calcular el recorrido antes de actualizar los costos.",
  COSTING_BLOCKERS_PRESENT: "Hay datos económicos pendientes. Revise las advertencias antes de publicar.",
  COSTING_LOGISTICS_REVISION_REQUIRED: "Primero calcule el recorrido de esta cotización.",
  COSTING_TRANSPORT_SCOPE_CHANGED: "La publicación anterior incluye costos de personal. Vuelva a calcular el recorrido. Agregue el personal y los viáticos en Servicios y combinaciones.",
  COSTING_TRANSPORT_CONTEXT_INVALID: "La revisión de transporte no corresponde a un contexto válido. Recalcule el transporte de esta cotización.",
  COSTING_TRANSPORT_AUTHORITY_INVALID: "No se pudo verificar la tarifa asociada al transporte. Revise la zona y vuelva a calcular el recorrido.",
  COSTING_TRANSPORT_DUPLICATE_ITEM: "La revisión contiene un gasto de transporte repetido. Recalcule el transporte antes de continuar.",
  COSTING_PACKAGE_NOT_AVAILABLE: "El paquete o su tarifa ya no está vigente para el servicio del caso.",
  COSTING_PACKAGE_PLAN_STALE: "Cambió la ruta o el servicio del caso. Actualice el recorrido y vuelva a calcular.",
  COSTING_PACKAGE_CURRENCY_INVALID: "Cambió la moneda del paquete. Vuelva a abrir el selector y recalcule.",
  COSTING_PACKAGE_RULE_CONFLICT: "Hay más de una tarifa vigente para el paquete. Revise la configuración en Administración.",
  COSTING_PACKAGE_VOLUME_UNSUPPORTED: "El volumen queda fuera de los tramos de este paquete.",
  COSTING_PACKAGE_TRANSPORT_REQUIRED: "Este paquete requiere calcular el transporte de la ruta del caso.",
};

type Props = Readonly<{ caseRef: string; authorization?: string; access: CostingUiAccess; transportAccess?: TransportUiAccess; transportAddresses: TransportCaseAddresses; onUnauthorized(): void; onContinueToProposals?(): void }>;

function money(value: string | number | null, currency: string) {
  if (value == null) return "Pendiente";
  return new Intl.NumberFormat("es-DO", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value));
}

function editableMoney(value: string | number | null) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
}

type InlineOverride = Readonly<{ lineRef: string; amount: string; reason: string }>;

function LineTable({ rows, currency, editable, busy, override, onBegin, onAmount, onReason, onSave, onCancel }: Readonly<{ rows: readonly CostingLine[]; currency: string; editable: boolean; busy: boolean; override: InlineOverride | null; onBegin(line: CostingLine): void; onAmount(line: CostingLine, value: string): void; onReason(value: string): void; onSave(): void; onCancel(): void }>) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[720px] border-collapse text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="border-b px-2 py-1.5">Familia</th><th className="border-b px-2 py-1.5">Concepto</th><th className="border-b px-2 py-1.5">Cantidad</th><th className="border-b px-2 py-1.5">Costo</th><th className="border-b px-2 py-1.5">Precio calculado / editable</th><th className="border-b px-2 py-1.5">Estado</th></tr></thead><tbody>{rows.map((line) => {
    const key = line.lineRef || `${line.position}-${line.concept}`;
    const active = Boolean(line.lineRef && override?.lineRef === line.lineRef);
    const calculated = Number(line.suggestedPrice ?? line.totalCost ?? 0);
    const visibleAmount = active ? override?.amount ?? "" : editableMoney(line.suggestedPrice ?? line.totalCost);
    const numericAmount = Number(visibleAmount);
    const direction = active && visibleAmount !== "" && Number.isFinite(numericAmount) ? Math.sign(numericAmount - calculated) : 0;
    const changed = direction !== 0;
    const tone = direction > 0 ? "text-blue-700" : direction < 0 ? "text-red-700" : "text-slate-900";
    return <Fragment key={key}><tr className="border-b last:border-0"><td className="px-2 py-1.5 font-bold text-[#003366]">{FAMILY_LABELS[line.family] || line.family}</td><td className="px-2 py-1.5"><strong className="block text-slate-900">{line.concept}</strong><span className="text-[10px] text-slate-500">{CLASS_LABELS[line.classification]} · {line.source} v{line.sourceVersion}</span></td><td className="px-2 py-1.5 tabular-nums">{line.quantity} {line.unit}</td><td className="px-2 py-1.5 tabular-nums">{money(line.totalCost, currency)}</td><td className="w-52 px-2 py-1.5 align-middle">{editable && line.lineRef ? <div><label className="sr-only" htmlFor={`costing-price-${line.lineRef}`}>Precio editable {line.concept}</label><div className="relative"><input id={`costing-price-${line.lineRef}`} aria-label={`Precio editable ${line.concept}`} type="number" min="0" step="0.01" value={visibleAmount} disabled={busy} onFocus={() => onBegin(line)} onBlur={(event) => { if (event.target.value !== "" && Number.isFinite(Number(event.target.value))) onAmount(line, Number(event.target.value).toFixed(2)); }} onChange={(event) => onAmount(line, event.target.value)} className={`h-8 w-full border-0 bg-transparent px-2 pr-7 text-right font-bold tabular-nums outline-none focus:bg-slate-50 focus:ring-0 ${tone}`} />{direction > 0 ? <TrendingUp className="pointer-events-none absolute right-2 top-2 h-4 w-4 text-blue-700" /> : direction < 0 ? <TrendingDown className="pointer-events-none absolute right-2 top-2 h-4 w-4 text-red-700" /> : null}</div></div> : <strong className="tabular-nums">{money(line.suggestedPrice, currency)}</strong>}</td><td className="px-2 py-1.5 align-middle"><span className={`rounded px-2 py-1 text-[10px] font-semibold ${direction > 0 ? "bg-blue-50 text-blue-800" : direction < 0 ? "bg-red-50 text-red-700" : "bg-slate-100"}`}>{changed ? "Modificado" : line.priceStatus}</span></td></tr>{active && changed && <tr className={direction > 0 ? "bg-blue-50/60" : "bg-red-50/60"}><td colSpan={6} className="px-2 py-2"><div className="flex flex-wrap items-center gap-2"><span className={`text-[11px] font-bold ${direction > 0 ? "text-blue-800" : "text-red-700"}`}>{direction > 0 ? "Aumento sobre el cálculo" : "Reducción sobre el cálculo; puede requerir autorización"}</span><label className="min-w-64 flex-1"><span className="sr-only">Justificación del ajuste {line.concept}</span><input aria-label={`Justificación del ajuste ${line.concept}`} value={override?.reason ?? ""} minLength={8} maxLength={320} onChange={(event) => onReason(event.target.value)} placeholder="Justificación obligatoria del cambio" className={`h-8 w-full rounded border bg-white px-2 text-xs ${direction < 0 ? "border-red-300 text-red-800" : "border-blue-300 text-blue-900"}`} /></label><button type="button" aria-label={`Cancelar ajuste ${line.concept}`} title="Cancelar cambio" onClick={onCancel} className="grid h-8 w-8 place-items-center rounded border bg-white text-slate-600"><X className="h-4 w-4" /></button><button type="button" aria-label={`Guardar ajuste ${line.concept}`} title="Guardar cambio" disabled={busy || (override?.reason.trim().length ?? 0) < 8 || !Number.isFinite(numericAmount) || numericAmount < 0} onClick={onSave} className="grid h-8 w-8 place-items-center rounded bg-[#003366] text-white disabled:bg-slate-300"><Check className="h-4 w-4" /></button></div></td></tr>}</Fragment>;
  })}</tbody></table></div>;
}

function Totals({ value, currency }: { value: CostingRevision["totals"]; currency: string }) {
  const rows = [["Costos propios", value.ownCosts], ["Costos externos", value.externalCosts], ["Desembolsos", value.disbursements], ["Riesgos", value.risks], ["Compensación moneda", value.currencyCompensation], ["Costo total", value.totalCost], ["Precio sugerido interno", value.suggestedPrice]] as const;
  return <aside className="border bg-white p-3"><h3 className="text-xs font-black uppercase tracking-wide text-[#003366]">Resumen económico</h3><dl className="mt-2 divide-y">{rows.map(([label, amount]) => <div key={label} className="flex items-center justify-between gap-4 py-2 text-xs"><dt className="text-slate-600">{label}</dt><dd className="font-bold tabular-nums">{money(amount, currency)}</dd></div>)}<div className="flex items-center justify-between gap-4 py-2 text-xs"><dt className="text-slate-600">Margen esperado propio</dt><dd className="font-bold">{value.expectedMarginBps == null ? "Sin política" : `${(value.expectedMarginBps / 100).toFixed(2)}%`}</dd></div></dl></aside>;
}

export default function CostingPanel({ caseRef, authorization, access, transportAccess, transportAddresses, onUnauthorized, onContinueToProposals }: Props) {
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
  const [transportChanged, setTransportChanged] = useState(false);
  const [showPackages, setShowPackages] = useState(false);
  const current = calculation?.result || revision;
  const currency = calculation?.baseCurrency || revision?.baseCurrency || "DOP";
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRevision(await costingApi.revision(authorization, caseRef)); }
    catch (cause) { const code = cause instanceof Error ? cause.message : "COSTING_REQUEST_FAILED"; if (code.includes("UNAUTHORIZED")) onUnauthorized(); else setError(code); }
    finally { setLoading(false); }
  }, [authorization, caseRef, onUnauthorized]);
  useEffect(() => { void load(); }, [load]);
  const calculate = async (packageEstimate?: CostingPackageEstimate, packageCurrency?: string, useTransport = true) => {
    setBusy(true); setError(null);
    if (packageEstimate) setCalculation(null);
    try {
      const logistics = useTransport ? await costingApi.currentLogistics(authorization, caseRef) : null;
      if (useTransport && !logistics) throw new Error("COSTING_LOGISTICS_REVISION_REQUIRED");
      setCalculation(await costingApi.calculate(authorization, {
        caseRef, logisticsPlanRevisionRef: logistics?.revisionRef ?? null, baseCurrency: packageCurrency ?? currency,
        ...(packageEstimate && { packageEstimate }),
      }));
      setTransportChanged(false);
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
  const saveOverride = async () => {
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
  return <section role="tabpanel" aria-label="Costos" data-testid="costing-panel" className="space-y-2">
    <header className="flex flex-wrap items-center justify-between gap-2 border bg-slate-50 px-3 py-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-black leading-5 text-[#003366]">Costos</h2>
        <p className="text-[11px] text-slate-500">Fuentes, moneda, margen y precio interno.</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {access.canCalculate && <>
          <button type="button" disabled={busy} aria-expanded={showPackages} onClick={() => { setShowPackages(!showPackages); setError(null); }}
            className={`rounded border px-2.5 py-1.5 text-xs font-bold ${showPackages ? "border-[#003366] bg-[#003366] text-white" : "bg-white"}`}>
            <Package className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Por paquete
          </button>
          {!showPackages && <button type="button" disabled={busy} onClick={() => void calculate()} className="rounded border bg-white px-2.5 py-1.5 text-xs font-bold"><Calculator className="mr-1 inline h-3.5 w-3.5" />{current ? "Recalcular" : "Calcular"}</button>}
        </>}
        {access.canPublish && calculation && <button type="button" disabled={busy || Boolean(calculation.result.packagePricing && calculation.result.issues.some((issue) => issue.severity === "BLOCKER" && issue.status === "OPEN"))} onClick={() => void publish()} className="rounded bg-[#003366] px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-50"><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />Publicar</button>}
        {!calculation && !transportChanged && revision?.packagePricing && onContinueToProposals && <button type="button" disabled={busy} onClick={onContinueToProposals} className="rounded border bg-white px-2.5 py-1.5 text-xs font-bold">Ir a propuestas<ArrowRight className="ml-1 inline h-3.5 w-3.5" aria-hidden="true" /></button>}
        <button type="button" disabled={busy} onClick={() => void load()} className="rounded border bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600"><RefreshCw className="mr-1 inline h-3.5 w-3.5" />Actualizar datos</button>
      </div>
    </header>
    {showPackages && access.canCalculate && <PackageCostingForm key={caseRef} caseRef={caseRef} authorization={authorization} busy={busy} current={current?.packagePricing}
      onCalculate={(estimate, selectedCurrency, useTransport) => void calculate(estimate, selectedCurrency, useTransport)}
      onChange={() => setCalculation((value) => value?.result.packagePricing ? null : value)} onUnauthorized={onUnauthorized} />}
    {current?.packagePricing && <PackageCostingSummary value={current.packagePricing} totals={current.totals} currency={currency} />}
    {transportAccess?.canView && <Suspense fallback={<p className="p-3 text-sm text-slate-500">Cargando transporte de la cotización…</p>}><TransportCalculationPanel caseRef={caseRef} addresses={transportAddresses} authorization={authorization} access={transportAccess} onUnauthorized={onUnauthorized} onPublished={() => { setCalculation(null); setTransportChanged(true); void load(); }} /></Suspense>}
    {transportChanged && <p role="status" className="border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">Transporte actualizado. Recalcule los costos para incorporarlo al resumen económico de esta cotización.</p>}
    {loading && <p className="p-8 text-center text-sm text-slate-500">Cargando Costos…</p>}
    {error && <p role="alert" className="border border-red-200 bg-red-50 p-3 text-sm text-red-800">{ERROR_MESSAGES[error] || error}</p>}
    {revision?.overrides?.length ? <section className="border bg-white p-3" aria-label="Overrides económicos"><h3 className="text-xs font-black uppercase tracking-wide text-[#003366]">Overrides y autorizaciones</h3><div className="mt-2 divide-y">{revision.overrides.map((row) => <div key={row.overrideRef} className="flex flex-wrap items-center gap-2 py-2 text-xs"><span className="font-bold">{row.kind}</span><span className="text-slate-600">{row.reason}</span><span className={`rounded px-2 py-1 text-[10px] font-bold ${row.authorization?.decision === "AUTHORIZED" ? "bg-emerald-100 text-emerald-800" : row.authorization?.decision === "REJECTED" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>{row.authorization?.decision || row.status}</span>{row.status === "AUTHORIZATION_REQUIRED" && !row.authorization && access.canAuthorizeMargin && <span className="ml-auto flex gap-2"><button type="button" disabled={busy} onClick={() => void authorize(row.overrideRef, "REJECTED")} className="rounded border px-2 py-1 font-bold">Rechazar margen</button><button type="button" disabled={busy} onClick={() => void authorize(row.overrideRef, "AUTHORIZED")} className="rounded bg-[#003366] px-2 py-1 font-bold text-white">Autorizar margen</button></span>}</div>)}</div></section> : null}
    {current?.issues?.length ? <div className="grid gap-2 sm:grid-cols-2">{current.issues.map((issue) => <div key={issue.issueRef || `${issue.code}-${issue.family}`} className={`border p-3 text-xs ${issue.severity === "BLOCKER" ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50"}`}><strong>{issue.severity === "BLOCKER" ? <ShieldAlert className="mr-1 inline h-4 w-4" /> : <AlertTriangle className="mr-1 inline h-4 w-4" />}{issue.code}</strong><p className="mt-1 text-slate-700">{issue.message}</p><span className="mt-1 block text-[10px] uppercase text-slate-500">{issue.source} · {issue.status}</span></div>)}</div> : null}
    {current && <div className="flex flex-wrap items-center justify-between gap-2 border bg-white p-2"><div className="flex flex-wrap gap-2"><select aria-label="Filtrar familia de costo" value={family} onChange={(event) => setFamily(event.target.value)} className="rounded border px-3 py-2 text-xs"><option value="ALL">Todas las familias</option>{Object.entries(FAMILY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select aria-label="Filtrar clasificación económica" value={classification} onChange={(event) => setClassification(event.target.value)} className="rounded border px-3 py-2 text-xs"><option value="ALL">Pr + Ex + De</option><option value="PR">Pr · propio</option><option value="EX">Ex · externo</option><option value="DE">De · desembolso</option></select></div><div className="flex flex-wrap items-center gap-1.5" aria-label="Estado económico">{calculation && <span aria-label="Cálculo reproducible pendiente de publicar" title="Cálculo reproducible pendiente de publicar" className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-800"><Calculator className="h-3.5 w-3.5" />Sin publicar</span>}{revision && !calculation && <span aria-label={`Revisión económica ${revision.revision} publicada · snapshot inmutable`} title="Revisión publicada; no se modifica silenciosamente" className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5" />Rev. {revision.revision} publicada</span>}{!current.issues?.length && <span aria-label="Sin bloqueos económicos" title="No existen bloqueos económicos" className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800"><ShieldCheck className="h-3.5 w-3.5" />Sin bloqueos</span>}</div></div>}
    {current && <div className="grid gap-2 2xl:grid-cols-[minmax(0,1fr)_250px]"><section className="overflow-hidden border bg-white"><LineTable rows={rows} currency={currency} editable={Boolean(revision && !calculation && access.canOverride)} busy={busy} override={overrideLine?.lineRef ? { lineRef: overrideLine.lineRef, amount: overrideAmount, reason: overrideReason } : null} onBegin={(line) => { if (overrideLine?.lineRef === line.lineRef) return; setOverrideLine(line); setOverrideAmount(editableMoney(line.suggestedPrice || line.totalCost)); setOverrideReason(""); }} onAmount={(line, value) => { if (overrideLine?.lineRef !== line.lineRef) { setOverrideLine(line); setOverrideReason(""); } setOverrideAmount(value); }} onReason={setOverrideReason} onSave={() => void saveOverride()} onCancel={() => { setOverrideLine(null); setOverrideAmount(""); setOverrideReason(""); }} /></section><Totals value={current.totals} currency={currency} /></div>}
    {!loading && !current && <div className="grid min-h-48 place-items-center border border-dashed text-center text-sm text-slate-500"><div><CircleDollarSign className="mx-auto mb-2 h-7 w-7 text-slate-300" />Calcule los costos del servicio o seleccione un paquete.</div></div>}
  </section>;
}
