import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleDollarSign, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { AdministrationHelp, AdministrationIconAction } from "@/administration/AdministrationHelp";
import { NumericInput } from "@/components/ui/numeric-input";
import type { CostingUiAccess } from "./access";
import { costingApi, type CostingRate, type CostingRule } from "./api";
import { pricingDecimal } from "./pricingInput";
import { isPackagePricingRule } from "../../shared/servicePackagePricing.js";

const FAMILIES = ["LABOR", "TRANSPORT", "MATERIAL", "CRATING", "ASSET", "TRAVEL", "THIRD_PARTY", "FREIGHT", "CUSTOMS", "PERMIT", "ADDITIONAL", "RISK", "CURRENCY_COMPENSATION"];
type Props = Readonly<{ authorization?: string; access: CostingUiAccess; onUnauthorized(): void }>;

const EMPTY_RULE = {
  seriesRef: null as string | null, expectedVersion: 0, family: "LABOR", code: "", name: "", classification: "PR", source: "ADMIN",
  unitCost: "", currency: "DOP", minimumMargin: "20", recommendedMargin: "30", unit: "unidad", saleUnitPrice: null as string | null, useInPackages: false,
};
const FAMILY_LABELS: Record<string, string> = {
  LABOR: "Personal", TRANSPORT: "Transporte", MATERIAL: "Materiales", CRATING: "Huacales", ASSET: "Equipos",
  TRAVEL: "Dietas y viáticos", THIRD_PARTY: "Terceros", FREIGHT: "Flete", CUSTOMS: "Aduanas", PERMIT: "Permisos",
  ADDITIONAL: "Otros cargos", RISK: "Riesgos", CURRENCY_COMPENSATION: "Compensación de moneda",
};
const FIELD = "mt-1 w-full rounded border bg-white p-2";
const EMPTY_RATE = { baseCurrency: "USD", quoteCurrency: "DOP", rate: "", source: "Administración", effectiveAt: new Date().toISOString().slice(0, 16) };

export default function CostingRulesAdmin({ authorization, access, onUnauthorized }: Props) {
  const [section, setSection] = useState<"RULES" | "RATES">("RULES");
  const [family, setFamily] = useState("ALL");
  const [rules, setRules] = useState<readonly CostingRule[]>([]);
  const [rates, setRates] = useState<readonly CostingRate[]>([]);
  const [ruleDraft, setRuleDraft] = useState<typeof EMPTY_RULE | null>(null);
  const [rateDraft, setRateDraft] = useState<typeof EMPTY_RATE | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setBusy(true); setError(null);
    try { const [nextRules, nextRates] = await Promise.all([costingApi.rules(authorization), costingApi.rates(authorization)]); setRules(nextRules); setRates(nextRates); }
    catch (cause) { const message = cause instanceof Error ? cause.message : "COSTING_REQUEST_FAILED"; if (message.includes("UNAUTHORIZED")) onUnauthorized(); else setError(message); }
    finally { setBusy(false); }
  }, [authorization, onUnauthorized]);
  useEffect(() => { void load(); }, [load]);
  const visibleRules = useMemo(() => rules.filter((row) => !isPackagePricingRule(row) && (family === "ALL" || row.family === family)), [family, rules]);
  const saveRule = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ruleDraft) return;
    const unitCost = pricingDecimal(ruleDraft.unitCost, 6);
    const min = pricingDecimal(ruleDraft.minimumMargin, 2);
    const rec = ruleDraft.useInPackages ? min : pricingDecimal(ruleDraft.recommendedMargin, 2);
    if ((ruleDraft.unitCost && !unitCost) || (ruleDraft.useInPackages && (!unitCost || !ruleDraft.unit.trim()))
      || (ruleDraft.classification === "PR" && (!min || !rec || Number(min) > Number(rec)))) {
      setError("Revise el costo unitario, su unidad y los márgenes.");
      return;
    }
    setBusy(true); setError(null);
    try {
      const code = ruleDraft.code.trim();
      await costingApi.versionRule(authorization, {
        seriesRef: ruleDraft.seriesRef, expectedVersion: ruleDraft.expectedVersion, family: ruleDraft.family, code, name: ruleDraft.name.trim(),
        classification: ruleDraft.classification, source: ruleDraft.source, priority: 100, specificity: 0,
        conditions: ruleDraft.useInPackages ? { packageComponentCode: code.toUpperCase() } : {},
        unitCost, currency: ruleDraft.currency,
        minimumMarginBps: ruleDraft.classification === "PR" ? Math.round(Number(min) * 100) : null,
        recommendedMarginBps: ruleDraft.classification === "PR" ? Math.round(Number(rec) * 100) : null,
        result: ruleDraft.useInPackages ? { unit: ruleDraft.unit.trim(), saleUnitPrice: ruleDraft.saleUnitPrice } : { unit: "UNIT" },
        state: "ACTIVE", validFrom: new Date().toISOString(), validTo: null,
      });
      setRuleDraft(null);
      await load();
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "COSTING_REQUEST_FAILED"); } finally { setBusy(false); }
  };
  const saveRate = async (event: React.FormEvent) => {
    event.preventDefault(); if (!rateDraft) return; setBusy(true); setError(null);
    try { await costingApi.versionRate(authorization, { seriesRef: null, baseCurrency: rateDraft.baseCurrency, quoteCurrency: rateDraft.quoteCurrency, rate: rateDraft.rate, source: rateDraft.source, state: "ACTIVE", effectiveAt: new Date(rateDraft.effectiveAt).toISOString(), validTo: null }); setRateDraft(null); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "COSTING_REQUEST_FAILED"); } finally { setBusy(false); }
  };
  if (!access.canRulesView) return null;
  return <section className="mt-3 min-w-0" data-testid="costing-rules-admin"><header className="flex flex-wrap items-center justify-between gap-2 border-b pb-3"><div className="flex items-center gap-1"><h2 className="text-base font-semibold text-slate-950">Costos y monedas</h2><AdministrationHelp title="Costos y monedas"><p>Administra costos, márgenes y tasas de cambio. Cada regla y tasa conserva su versión y fecha de vigencia.</p><p>Configure el margen de cada paquete en Servicios y combinaciones → Tarifas.</p></AdministrationHelp></div><div className="flex flex-wrap items-center gap-1"><button type="button" onClick={() => setSection("RULES")} aria-pressed={section === "RULES"} className={`rounded px-3 py-2 text-xs font-semibold ${section === "RULES" ? "bg-[#003366] text-white" : "border bg-white"}`}>Reglas</button><button type="button" onClick={() => setSection("RATES")} aria-pressed={section === "RATES"} className={`rounded px-3 py-2 text-xs font-semibold ${section === "RATES" ? "bg-[#003366] text-white" : "border bg-white"}`}>Monedas</button><AdministrationIconAction label="Actualizar costos" mobileLabel="Actualizar" disabled={busy} onClick={() => void load()}><RefreshCw aria-hidden="true" className="h-4 w-4" /></AdministrationIconAction></div></header>{error && <p role="alert" className="mt-3 border border-red-200 bg-red-50 p-3 text-xs text-red-800">{error}</p>}
    {section === "RULES" && <>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select aria-label="Familia económica" value={family} onChange={(event) => setFamily(event.target.value)} className="rounded-lg border px-3 py-2 text-xs">
          <option value="ALL">Todas las familias</option>{FAMILIES.map((value) => <option key={value} value={value}>{FAMILY_LABELS[value]}</option>)}
        </select>
        {access.canRulesManage && <button type="button" onClick={() => setRuleDraft({ ...EMPTY_RULE })} className="inline-flex min-h-9 items-center gap-1.5 rounded bg-[#003366] px-3 py-2 text-xs font-semibold text-white"><Plus aria-hidden="true" className="h-4 w-4" />Nueva regla económica</button>}
      </div>
      <div className="mt-3 overflow-x-auto border bg-white"><table className="w-full min-w-[760px] text-left text-xs">
        <thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr>
          {["Familia", "Regla", "Clase", "Costo", "Margen mín./rec.", "Versión", "Estado", "Acción"].map((label) => <th key={label} className="border-b px-3 py-2">{label}</th>)}
        </tr></thead>
        <tbody>{visibleRules.map((row) => {
          const packageOnly = typeof row.conditions?.packageComponentCode === "string";
          const unit = typeof row.result?.unit === "string" ? row.result.unit : "";
          return <tr key={row.ruleRef} className="border-b last:border-0">
            <td className="px-3 py-2 font-bold">{FAMILY_LABELS[row.family] || row.family}</td>
            <td className="px-3 py-2"><strong>{row.name}</strong><span className="block text-[10px] text-slate-500">{row.code}{packageOnly && " · Paquetes"}</span></td>
            <td className="px-3 py-2">{row.classification}</td>
            <td className="px-3 py-2">{row.unitCost == null ? "Derivado" : `${row.currency} ${row.unitCost}${packageOnly ? ` / ${unit}` : ""}`}</td>
            <td className="px-3 py-2">{row.minimumMarginBps == null ? "No aplica" : `${row.minimumMarginBps / 100}% / ${(row.recommendedMarginBps || 0) / 100}%`}</td>
            <td className="px-3 py-2">v{row.version}</td>
            <td className="px-3 py-2"><span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-bold">{row.state}</span></td>
            <td className="px-3 py-2">{packageOnly && access.canRulesManage && row.state === "ACTIVE" && <button type="button" className="font-semibold text-[#003366] hover:underline"
              onClick={() => setRuleDraft({
                seriesRef: row.seriesRef, expectedVersion: row.version, family: row.family, code: row.code, name: row.name, classification: row.classification,
                source: row.source, unitCost: row.unitCost ?? "", currency: row.currency, unit, useInPackages: true,
                saleUnitPrice: typeof row.result?.saleUnitPrice === "string" ? row.result.saleUnitPrice : null,
                minimumMargin: String((row.minimumMarginBps ?? 0) / 100), recommendedMargin: String((row.recommendedMarginBps ?? 0) / 100),
              })}>Actualizar</button>}</td>
          </tr>;
        })}</tbody>
      </table></div>
    </>}
    {section === "RATES" && <><div className="mt-3 flex justify-end">{access.canRulesManage && <button type="button" onClick={() => setRateDraft({ ...EMPTY_RATE })} className="inline-flex min-h-9 items-center gap-1.5 rounded bg-[#003366] px-3 py-2 text-xs font-semibold text-white"><Plus aria-hidden="true" className="h-4 w-4" />Nueva tasa</button>}</div><div className="mt-3 overflow-x-auto border bg-white"><table className="w-full min-w-[640px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="px-3 py-2">Monedas</th><th className="px-3 py-2">Tasa</th><th className="px-3 py-2">Fuente</th><th className="px-3 py-2">Vigente desde</th><th className="px-3 py-2">Versión</th></tr></thead><tbody>{rates.map((row) => <tr key={row.rateRef} className="border-t hover:bg-slate-50"><td className="px-3 py-2 font-semibold text-slate-950">{row.baseCurrency} → {row.quoteCurrency}</td><td className="px-3 py-2 font-semibold tabular-nums">{row.rate}</td><td className="px-3 py-2">{row.source}</td><td className="px-3 py-2">{new Date(row.effectiveAt).toLocaleString("es-DO")}</td><td className="px-3 py-2">v{row.version}</td></tr>)}</tbody></table>{rates.length === 0 && <p className="p-4 text-center text-xs text-slate-500">Sin tasas registradas.</p>}</div></>}
    {section === "RULES" && ruleDraft && <form onSubmit={(event) => void saveRule(event)} className="mt-3 grid gap-3 border bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-4">
      <h3 className="text-sm font-black sm:col-span-2 lg:col-span-4">{ruleDraft.seriesRef ? "Actualizar costo" : "Nueva regla económica"}</h3>
      {ruleDraft.family !== "CURRENCY_COMPENSATION" && <label className="flex items-center gap-2 text-xs font-semibold sm:col-span-2 lg:col-span-4">
        <input type="checkbox" checked={ruleDraft.useInPackages} disabled={Boolean(ruleDraft.seriesRef)} onChange={(event) => setRuleDraft({ ...ruleDraft, useInPackages: event.target.checked, minimumMargin: event.target.checked ? "0" : "20", recommendedMargin: event.target.checked ? "0" : "30" })} />
        Costo unitario para seleccionar en paquetes
      </label>}
      <label className="text-xs font-semibold">Familia<select value={ruleDraft.family} disabled={Boolean(ruleDraft.seriesRef)} onChange={(event) => setRuleDraft({ ...ruleDraft, family: event.target.value })} className={FIELD}>
        {FAMILIES.filter((value) => !ruleDraft.useInPackages || value !== "CURRENCY_COMPENSATION").map((value) => <option key={value} value={value}>{FAMILY_LABELS[value]}</option>)}
      </select></label>
      <label className="text-xs font-semibold">Clase<select value={ruleDraft.classification} onChange={(event) => setRuleDraft({ ...ruleDraft, classification: event.target.value })} className={FIELD}>
        <option value="PR">Propio</option><option value="EX">Externo</option><option value="DE">Desembolso</option>
      </select></label>
      <label className="text-xs font-semibold">Código<input required readOnly={Boolean(ruleDraft.seriesRef)} maxLength={80} value={ruleDraft.code} onChange={(event) => setRuleDraft({ ...ruleDraft, code: event.target.value })} className={FIELD} /></label>
      <label className="text-xs font-semibold">Nombre<input required maxLength={180} value={ruleDraft.name} onChange={(event) => setRuleDraft({ ...ruleDraft, name: event.target.value })} className={FIELD} /></label>
      <label className="text-xs font-semibold">Costo unitario<NumericInput required={ruleDraft.useInPackages} allowDecimalComma min={0} step="0.000001" value={ruleDraft.unitCost} onChange={(event) => setRuleDraft({ ...ruleDraft, unitCost: event.target.value })} className={FIELD} /></label>
      {ruleDraft.useInPackages && <label className="text-xs font-semibold">Unidad de costo<input required readOnly={Boolean(ruleDraft.seriesRef)} maxLength={32} placeholder="Ej. hora, viaje, caja" value={ruleDraft.unit} onChange={(event) => setRuleDraft({ ...ruleDraft, unit: event.target.value })} className={FIELD} /></label>}
      <label className="text-xs font-semibold">Moneda<input required maxLength={3} pattern="[A-Z]{3}" value={ruleDraft.currency} onChange={(event) => setRuleDraft({ ...ruleDraft, currency: event.target.value.toUpperCase() })} className={FIELD} /></label>
      {ruleDraft.classification === "PR" && <>
        <label className="text-xs font-semibold">Margen mínimo (%)<NumericInput required allowDecimalComma min={0} max={99.99} step="0.01" value={ruleDraft.minimumMargin} onChange={(event) => setRuleDraft({ ...ruleDraft, minimumMargin: event.target.value })} className={FIELD} /></label>
        {!ruleDraft.useInPackages && <label className="text-xs font-semibold">Margen recomendado (%)<NumericInput required allowDecimalComma min={0} max={99.99} step="0.01" value={ruleDraft.recommendedMargin} onChange={(event) => setRuleDraft({ ...ruleDraft, recommendedMargin: event.target.value })} className={FIELD} /></label>}
      </>}
      <div className="flex justify-end gap-2 sm:col-span-2 lg:col-span-4"><button type="button" onClick={() => setRuleDraft(null)} className="rounded border bg-white px-3 py-2 text-xs font-bold">Cancelar</button><button disabled={busy} className="rounded bg-[#003366] px-3 py-2 text-xs font-semibold text-white"><ShieldCheck className="mr-1 inline h-4 w-4" />Guardar versión</button></div>
    </form>}
    {rateDraft && <form onSubmit={(event) => void saveRate(event)} className="mt-3 grid gap-3 border bg-slate-50 p-3 sm:grid-cols-2"><h3 className="sm:col-span-2 text-sm font-black"><CircleDollarSign className="mr-1 inline h-4 w-4" />Nueva tasa histórica</h3><label className="text-xs font-semibold">Moneda origen<input required pattern="[A-Z]{3}" value={rateDraft.baseCurrency} onChange={(event) => setRateDraft({ ...rateDraft, baseCurrency: event.target.value })} className="mt-1 w-full rounded border p-2" /></label><label className="text-xs font-semibold">Moneda base<input required pattern="[A-Z]{3}" value={rateDraft.quoteCurrency} onChange={(event) => setRateDraft({ ...rateDraft, quoteCurrency: event.target.value })} className="mt-1 w-full rounded border p-2" /></label><label className="text-xs font-semibold">Tasa<input required type="number" min="0.0000000001" step="0.0000000001" value={rateDraft.rate} onChange={(event) => setRateDraft({ ...rateDraft, rate: event.target.value })} className="mt-1 w-full rounded border p-2" /></label><label className="text-xs font-semibold">Fuente<input required value={rateDraft.source} onChange={(event) => setRateDraft({ ...rateDraft, source: event.target.value })} className="mt-1 w-full rounded border p-2" /></label><label className="text-xs font-semibold sm:col-span-2">Vigente desde<input required type="datetime-local" value={rateDraft.effectiveAt} onChange={(event) => setRateDraft({ ...rateDraft, effectiveAt: event.target.value })} className="mt-1 w-full rounded border p-2" /></label><div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setRateDraft(null)} className="rounded border bg-white px-3 py-2 text-xs font-bold">Cancelar</button><button disabled={busy} className="rounded bg-[#003366] px-3 py-2 text-xs font-semibold text-white">Versionar tasa</button></div></form>}
  </section>;
}
