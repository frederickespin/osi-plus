import { useEffect, useState, type FormEvent } from "react";
import { Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { COMPACT_FORM_FIELD } from "@/components/ui/compact-form";
import { NumericInput } from "@/components/ui/numeric-input";
import { costingApi, type CostingPackageEstimate, type CostingPackageOptions, type CostingPackagePricing, type CostingTotals } from "./api";
import { pricingDecimal, pricingMoney, pricingQuantity } from "./pricingInput";
import { minimumForPackage } from "../../shared/servicePackagePricing.js";

const FIELD = `${COMPACT_FORM_FIELD} w-full bg-white`;

type FormProps = Readonly<{
  authorization?: string; caseRef: string; busy: boolean; current?: CostingPackagePricing;
  actionLabel?: string;
  onCalculate(input: CostingPackageEstimate, currency: string, includeRouteTransport: boolean): void;
  onChange(): void;
  onUnauthorized(): void;
}>;

export function PackageCostingForm({ authorization, caseRef, busy, current, actionLabel, onCalculate, onChange, onUnauthorized }: FormProps) {
  const [options, setOptions] = useState<CostingPackageOptions | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void costingApi.packageOptions(authorization, caseRef, controller.signal).then(setOptions).catch((cause) => {
      if (controller.signal.aborted) return;
      if (cause instanceof Error && cause.message.includes("UNAUTHORIZED")) onUnauthorized();
      else setError(true);
    });
    return () => controller.abort();
  }, [authorization, caseRef, onUnauthorized]);

  if (error) return <p role="alert" className="p-3 text-xs text-red-800">No se pudieron consultar los paquetes. Vuelva a abrir el selector.</p>;
  if (!options) return <p role="status" className="p-3 text-xs text-slate-600">Buscando paquetes del caso…</p>;
  if (!options.packages.length) return <p className="rounded border bg-slate-50 p-3 text-xs text-slate-600">
    {options.hasService ? "Este servicio aún no tiene un paquete con tarifa publicada para esta modalidad." : "Seleccione la necesidad principal del caso en Servicios."}
  </p>;
  return <PackageOptionsForm {...{ options, busy, current, actionLabel, onCalculate, onChange }} />;
}

function PackageOptionsForm({ options, busy, current, actionLabel = "Calcular paquete", onCalculate, onChange }: Pick<FormProps, "busy" | "current" | "actionLabel" | "onCalculate" | "onChange"> & { options: CostingPackageOptions }) {
  const [selected, setSelected] = useState(() => options.packages.find((pkg) => pkg.versionRef === current?.versionRef)?.versionRef ?? (options.packages.length === 1 ? options.packages[0].versionRef : ""));
  const [volume, setVolume] = useState(() => {
    const initial = current?.measures.volumeM3 ?? options.volumeM3;
    return initial == null ? "" : String(Number(initial.toFixed(4)));
  });
  const [gross, setGross] = useState(() => String(current?.measures.grossKg ?? ""));
  const pkg = options.packages.find((option) => option.versionRef === selected);
  const volumeM3 = pricingDecimal(volume, 4);
  const showWeight = Boolean(pkg && (pkg.shipment.mode !== "NONE" || pkg.needsWeight));
  const grossKg = showWeight ? pricingDecimal(gross, 4) : null;
  const tier = pkg && volumeM3 ? minimumForPackage({ ...pkg, minimumSale: pkg.minimumSale ?? "0" }, Number(volumeM3)) : null;
  const valid = pkg && volumeM3 && Number(volumeM3) > 0 && Number(volumeM3) <= 100_000 && tier
    && (!showWeight || !gross.trim() || grossKg && Number(grossKg) > 0 && Number(grossKg) <= 1_000_000)
    && (!pkg.needsWeight || grossKg);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (valid && pkg && volumeM3 && !busy) onCalculate({ versionRef: pkg.versionRef, volumeM3, grossKg }, pkg.currency, pkg.includeRouteTransport);
  };

  return <form onSubmit={submit} aria-label="Calcular paquete" className="space-y-2 rounded-lg border bg-slate-50 p-3">
    <fieldset disabled={busy} className="flex flex-wrap items-end gap-2">
      <label className="min-w-52 flex-1 text-xs font-bold">Paquete
        <select className={FIELD} required value={selected} onChange={(event) => { setSelected(event.target.value); onChange(); }}>
          <option value="">Seleccione un paquete</option>
          {options.packages.map((option) => <option key={option.versionRef} value={option.versionRef}>{option.name} · v{option.version}</option>)}
        </select>
      </label>
      <label className="w-28 text-xs font-bold">Volumen (m³)
        <NumericInput required allowDecimalComma min="0.0001" max={100_000} step="0.0001" className={FIELD} value={volume} onChange={(event) => { setVolume(event.target.value); onChange(); }} />
      </label>
      {pkg && showWeight && <label className="w-36 text-xs font-bold">Peso bruto (kg)
        <NumericInput required={pkg.needsWeight} allowDecimalComma min="0.0001" max={1_000_000} step="0.0001" className={FIELD} value={gross} onChange={(event) => { setGross(event.target.value); onChange(); }} />
      </label>}
      <Button type="submit" size="sm" disabled={!valid || busy}><Calculator aria-hidden="true" />{busy ? "Calculando…" : actionLabel}</Button>
    </fieldset>
    <div className="flex flex-wrap gap-x-3 text-xs text-slate-600">
      {pkg && tier && <span> {tier.afterM3 === null ? "" : "Más de " + pricingQuantity.format(tier.afterM3) + " m³ · "}
        {tier.maxM3 === null ? "" : "Hasta " + pricingQuantity.format(tier.maxM3) + " m³ · "} Mínimo {pricingMoney(tier.minimumSale, pkg.currency)}</span>}
      {pkg && volumeM3 && !tier && <span role="status" className="text-amber-800">El volumen queda fuera de los tramos de este paquete.</span>}
      {pkg?.includeRouteTransport && <span>Incluye el transporte de la ruta.</span>}
    </div>
  </form>;
}

export function PackageCostingSummary({ value, totals, currency }: { value: CostingPackagePricing; totals: CostingTotals; currency: string }) {
  const { measures } = value;
  const format = pricingQuantity.format;
  const measurements: [string, number, string][] = [
    ["Volumen", measures.volumeM3, "m³"],
    ["Volumen", measures.volumeFt3, "pie³"],
  ];
  if (measures.grossKg !== null) measurements.push(["Peso bruto", measures.grossKg, "kg"]);
  if (measures.estimatedKg !== null && measures.grossKg === null) measurements.push(["Peso estimado", measures.estimatedKg, "kg"]);
  if (measures.volumetricKg !== null) measurements.push(["Peso volumétrico", measures.volumetricKg, "kg"]);
  if (measures.chargeableKg !== null) measurements.push([measures.grossKg === null ? "Kg cobrables estimados" : "Peso cobrable", measures.chargeableKg, "kg"]);
  if (measures.cwt !== null) {
    const label = measures.cwtBasis === "CHARGEABLE" ? "Peso cobrable" : measures.cwtBasis === "GROSS" ? "Peso bruto" : "Peso estimado";
    measurements.push([label, measures.cwt, "CWT"]);
  }

  const bases: [string, number][] = [];
  if (measures.volumeM3 > 0) bases.push(["m³", measures.volumeM3]);
  if (measures.volumeFt3 > 0) bases.push(["pie³", measures.volumeFt3]);
  if (measures.cwt && measures.cwt > 0) bases.push(["CWT", measures.cwt]);

  return <section aria-label="Resumen del paquete" className="rounded-lg border bg-white px-3 py-2 text-xs" data-testid="costing-package-summary">
    <div className="flex flex-wrap items-baseline gap-2">
      <h3 className="text-sm font-bold text-[#003366]">{value.name}</h3>
      <span className="text-slate-500">Paquete v{value.version} · Tarifa v{value.pricingVersion}</span>
    </div>
    <dl className="mt-2 flex flex-wrap gap-2">
      {measurements.map(([label, amount, unit]) => <div key={unit + label} className="rounded bg-slate-50 px-2 py-1">
        <dt className="text-slate-600">{label}</dt><dd className="font-semibold tabular-nums">{format(amount)} {unit}</dd>
      </div>)}
    </dl>
    <div className="mt-2 overflow-x-auto">
      <table className="w-full min-w-[420px] text-left">
        <thead className="text-slate-600"><tr><th scope="col">Resultado</th><th scope="col">Total</th>{bases.map(([unit]) => <th key={unit} scope="col">Por {unit}</th>)}</tr></thead>
        <tbody>{([["Costo", totals.totalCost], ["Venta sugerida", totals.suggestedPrice]] as const).map(([label, amount]) => <tr key={label} className="border-t tabular-nums">
          <th scope="row" className="py-1 text-slate-600">{label}</th><td className="font-bold">{pricingMoney(amount, currency)}</td>
          {bases.map(([unit, base]) => <td key={unit}>{pricingMoney(Number(amount) / base, currency)}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}
