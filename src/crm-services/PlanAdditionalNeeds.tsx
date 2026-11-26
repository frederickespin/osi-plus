import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { COMPACT_FORM_FIELD, COMPACT_TABLE_FIELD } from "@/components/ui/compact-form";
import { NumericInput } from "@/components/ui/numeric-input";
import { costingApi, type QuoteCatalogItem } from "@/costing/api";
import { catalogAmountCents, pricingDecimal, pricingMoney } from "@/costing/pricingInput";
import { type PlanPricedAddition, validPlanQuantity } from "./planPricedAdditions";

type Props = Readonly<{
  caseRef: string;
  authorization?: string;
  rows: readonly PlanPricedAddition[];
  onChange(rows: readonly PlanPricedAddition[]): void;
  disabled: boolean;
  canReadCatalog: boolean;
}>;

export function PlanAdditionalNeeds({ caseRef, authorization, rows, onChange, disabled, canReadCatalog }: Props) {
  const [catalog, setCatalog] = useState<readonly QuoteCatalogItem[] | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!canReadCatalog) return;
    const controller = new AbortController();
    setCatalog(null);
    setError("");
    void costingApi.planCatalog(authorization, caseRef, controller.signal).then((items) => {
      if (!controller.signal.aborted) {
        if (!Array.isArray(items)) throw new Error("CATALOG_UNAVAILABLE");
        setCatalog(items);
      }
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error && /FORBIDDEN|PERMISSION/.test(cause.message)
        ? "Tu usuario requiere acceso al catálogo de precios para agregar conceptos."
        : "No se pudieron cargar las tarifas.");
    });
    return () => controller.abort();
  }, [authorization, caseRef, retry, canReadCatalog]);
  if (!canReadCatalog) return null;
  const currentPrices = new Map((catalog ?? []).map((item) => [item.ruleRef, item]));
  const chosen = new Set(rows.map((row) => row.ruleRef));
  const currency = rows[0]?.currency;
  const options = (catalog ?? []).filter((item) => !chosen.has(item.ruleRef));
  const amounts = new Map(rows.map((row) => [row.ruleRef, catalogAmountCents(row.quantity, row.unitPrice) ?? 0n]));
  const total = Number([...amounts.values()].reduce((sum, cents) => sum + cents, 0n)) / 100;
  function add(ruleRef: string) {
    const item = options.find((option) => option.ruleRef === ruleRef);
    if (item && (!currency || item.currency === currency)) onChange([...rows, { ...item, quantity: "1" }]);
  }
  return <section aria-label="Necesidades adicionales" className="space-y-2">
    <div className="flex items-end gap-1"><label className="block min-w-0 flex-1 text-sm font-semibold text-[#003366]">Necesidades adicionales
      <select className={COMPACT_FORM_FIELD + " mt-1 w-full"} value="" disabled={disabled || !catalog?.length || rows.length >= 120}
        onChange={(event) => add(event.target.value)}>
        <option value="">{error ? "Catálogo pendiente" : !catalog ? "Cargando tarifas…" : !catalog.length
          ? "Sin tarifas publicadas" : !options.length ? "Todos los conceptos seleccionados" : "Seleccionar concepto del tarifario…"}</option>
        {options.map((item) => <option key={item.ruleRef} value={item.ruleRef} disabled={Boolean(currency && item.currency !== currency)}>
          {item.name} · {pricingMoney(item.unitPrice, item.currency)} / {item.unit}
        </option>)}
      </select>
    </label><Button size="icon-sm" type="button" variant="ghost" title="Actualizar tarifas" aria-label="Actualizar tarifas"
      disabled={!catalog && !error} onClick={() => setRetry((count) => count + 1)}><RefreshCw /></Button></div>
    {error && <p role="alert" className="text-xs text-amber-800">{error}</p>}
    {rows.length > 0 && <table className="w-full table-fixed text-left text-xs">
      <thead className="text-slate-600"><tr><th>Concepto</th><th className="w-16 text-right">Cantidad</th>
        <th className="w-24 text-right">Tarifa</th><th className="w-24 text-right">Importe</th><th className="w-8"><span className="sr-only">Acciones</span></th></tr></thead>
      <tbody className="divide-y divide-slate-100">{rows.map((row) => <tr key={row.ruleRef}>
        <td className="break-words py-1">{row.name}{catalog && (currentPrices.get(row.ruleRef)?.version !== row.version ||
          currentPrices.get(row.ruleRef)?.unitPrice !== row.unitPrice) &&
          <small className="block text-amber-800">Tarifa anterior. Vuelve a seleccionar el concepto.</small>}</td>
        <td><NumericInput aria-label={"Cantidad de " + row.name} value={row.quantity} disabled={disabled}
          className={COMPACT_TABLE_FIELD + " w-full text-right"} allowDecimalComma min={0.000001} max={1_000_000} step={0.000001}
          onChange={(event) => onChange(rows.map((item) => item.ruleRef === row.ruleRef ? { ...item, quantity: event.target.value } : item))}
          onBlur={(event) => { const value = pricingDecimal(event.target.value, 6); if (value) onChange(rows.map((item) => item.ruleRef === row.ruleRef ? { ...item, quantity: value } : item)); }} /></td>
        <td className="text-right tabular-nums">{pricingMoney(row.unitPrice, row.currency)}<small className="block text-slate-600">por {row.unit}</small></td>
        <td className="text-right tabular-nums">{validPlanQuantity(row) ? pricingMoney(Number(amounts.get(row.ruleRef)) / 100, row.currency) : "Pendiente"}</td>
        <td><Button type="button" variant="ghost" size="icon-sm" aria-label={"Quitar " + row.name} title="Quitar" disabled={disabled}
          onClick={() => onChange(rows.filter((item) => item.ruleRef !== row.ruleRef))}><X /></Button></td>
      </tr>)}</tbody>
      <tfoot className="border-t border-slate-200 text-[#003366]"><tr><th colSpan={3} className="pt-1">Total adicionales</th>
        <td className="pt-1 text-right font-semibold tabular-nums">{currency && rows.every(validPlanQuantity) ? pricingMoney(total, currency) : "Pendiente"}</td><td /></tr></tfoot>
    </table>}
  </section>;
}
