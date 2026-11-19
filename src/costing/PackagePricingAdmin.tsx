import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Layers3, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { COMPACT_FORM_DIALOG, COMPACT_FORM_FIELD } from "@/components/ui/compact-form";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NumericInput } from "@/components/ui/numeric-input";
import type { ServiceCatalogItem, ServiceMode, ServicePackage } from "@/crm-services/api";
import { costingApi, type CostingRule } from "./api";
import { PackageComponentDialog } from "./PackageComponentDialog";
import { pricingDecimal, pricingMoney } from "./pricingInput";
import {
  isPackagePricingRule, minimumForPackage, packageMeasures, packageQuantity, PACKAGE_BASE_LABELS, PACKAGE_PRICING_KIND,
  type PackageBasis, type PackageComponent, type PackagePricingResult, type PackageShipment, type PackageVolumeTier,
} from "../../shared/servicePackagePricing.js";

type ComponentDraft = Omit<PackageComponent, "factor" | "minimumQuantity"> & { factor: string; minimumQuantity: string };
type TierDraft = { id: string; maxM3: string; minimumSale: string };
type CreatePackage = (value: { name: string; modeRef: string; primaryServiceRef: string; requestId: string }) => Promise<ServicePackage>;
type Props = Readonly<{
  authorization?: string; packages: readonly ServicePackage[]; canManage: boolean; onUnauthorized(): void;
  modes: readonly ServiceMode[]; services: readonly ServiceCatalogItem[];
  catalogModes: readonly Readonly<{ serviceRef: string; modeRefs: readonly string[] }>[];
  onCreate?: CreatePackage;
}>;

const FIELD = COMPACT_FORM_FIELD + " mt-1 w-full bg-white";
const UNITS: Record<string, string> = { HOUR: "hora", DAY: "día", TRIP: "viaje", UNIT: "unidad", SERVICE: "servicio", M3: "m³", FT3: "pie³", CWT: "CWT", KG: "kg" };
const BASES = Object.entries(PACKAGE_BASE_LABELS) as [PackageBasis, string][];
const ERRORS: Record<string, string> = {
  COSTING_PACKAGE_RULE_CONFLICT: "Ya existe una tarifa para esta versión. Actualiza el listado y vuelve a abrirla.",
  COSTING_PACKAGE_COMPONENT_MISSING: "Al menos un costo de recurso ya no está vigente.",
  COSTING_PACKAGE_NOT_AVAILABLE: "La versión del paquete ya no está publicada.",
  COSTING_PACKAGE_TRANSPORT_DUPLICATE: "El transporte por ruta ya incluye transporte y viáticos. Revisa esos componentes.",
  COSTING_RULE_VERSION_CONFLICT: "Otra persona publicó una tarifa más reciente. Actualiza antes de guardar.",
  COSTING_PACKAGE_TIERS_INVALID: "Ordena los tramos por volumen máximo y deja un tramo abierto solo al final.",
};

function activeRule(rule: CostingRule, now: number) {
  return rule.state === "ACTIVE" && (!rule.validFrom || Date.parse(rule.validFrom) <= now)
    && (!rule.validTo || Date.parse(rule.validTo) > now);
}

function parseTiers(drafts: readonly TierDraft[]): PackageVolumeTier[] | null {
  const tiers: PackageVolumeTier[] = [];
  let previous = 0;
  for (const [index, row] of drafts.entries()) {
    const limit = pricingDecimal(row.maxM3, 4);
    const minimumSale = pricingDecimal(row.minimumSale, 2);
    const maxM3 = limit === null ? null : Number(limit);
    if (minimumSale === null || Number(minimumSale) > 100_000_000 || (maxM3 === null
      ? Boolean(row.maxM3.trim()) || index !== drafts.length - 1
      : maxM3 <= previous || maxM3 > 100_000)) return null;
    tiers.push({ maxM3, minimumSale });
    previous = maxM3 ?? previous;
  }
  return tiers;
}

function parseComponents(rows: readonly ComponentDraft[], choices: ReadonlyMap<string, CostingRule>, mode: PackageShipment["mode"]): PackageComponent[] | null {
  const components: PackageComponent[] = [];
  for (const row of rows) {
    const factor = Number(pricingDecimal(row.factor, 4));
    const minimum = pricingDecimal(row.minimumQuantity, 4);
    if (!factor || minimum === null || !row.concept.trim() || !row.unit || !choices.has(row.ruleSeriesRef)
      || row.basis === "CHARGEABLE_KG" && mode !== "AIR") return null;
    components.push({ ruleSeriesRef: row.ruleSeriesRef, concept: row.concept.trim(), unit: row.unit,
      basis: row.basis, factor, minimumQuantity: Number(minimum), roundUp: row.roundUp });
  }
  return components;
}

function NewTariffPackage({ modes, services, catalogModes, onCreate, onCreated, onClose }: Pick<Props, "modes" | "services" | "catalogModes">
  & { onCreate: CreatePackage; onCreated(pkg: ServicePackage): void; onClose(): void }) {
  const publishedModes = modes.filter((mode) => mode.state === "PUBLISHED");
  const [modeRef, setModeRef] = useState(publishedModes.length === 1 ? publishedModes[0].modeRef : "");
  const [primaryServiceRef, setPrimaryServiceRef] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestId] = useState(() => crypto.randomUUID());
  const available = services.filter((service) => catalogModes.some((item) => item.serviceRef === service.serviceRef && item.modeRefs.includes(modeRef)));
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !name.trim() || !available.some((item) => item.serviceRef === primaryServiceRef)) return;
    setBusy(true);
    setError("");
    try {
      onCreated(await onCreate({ name: name.trim(), modeRef, primaryServiceRef, requestId }));
    } catch {
      setError("No se pudo crear el paquete. Verifica que el servicio esté disponible para esta modalidad.");
    } finally { setBusy(false); }
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className={COMPACT_FORM_DIALOG} showCloseButton={!busy}>
      <DialogHeader><DialogTitle>Nuevo paquete</DialogTitle><DialogDescription>Identifica el paquete para añadir sus componentes y mínimos.</DialogDescription></DialogHeader>
      <form onSubmit={(event) => void save(event)} className="space-y-3">
        <fieldset disabled={busy} className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-semibold">Modalidad<select className={FIELD} required value={modeRef} onChange={(event) => { setModeRef(event.target.value); setPrimaryServiceRef(""); }}>
            <option value="">Seleccionar</option>{publishedModes.map((mode) => <option key={mode.modeRef} value={mode.modeRef}>{mode.name}</option>)}
          </select></label>
          <label className="text-xs font-semibold">Servicio principal<select className={FIELD} required value={primaryServiceRef} onChange={(event) => setPrimaryServiceRef(event.target.value)}>
            <option value="">Seleccionar</option>{available.map((service) => <option key={service.serviceRef} value={service.serviceRef}>{service.name}</option>)}
          </select></label>
          <label className="text-xs font-semibold sm:col-span-2">Nombre del paquete<input className={FIELD} required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} /></label>
        </fieldset>
        {modeRef && !available.length && <p className="text-xs text-slate-600">Asigna un servicio a esta modalidad en Catálogo y modos.</p>}
        {error && <p role="alert" className="text-xs text-red-800">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" size="sm" disabled={busy} onClick={onClose}>Cancelar</Button>
          <Button type="submit" size="sm" disabled={busy || !name.trim() || !primaryServiceRef}>{busy ? "Guardando…" : "Configurar tarifa"}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}

function TariffSimulation({ components, choices, shipment, recommended, minimum, tiers, currency, routeTransport }: {
  components: readonly PackageComponent[] | null; choices: ReadonlyMap<string, CostingRule>; shipment: PackageShipment | null;
  recommended: string; minimum: string; tiers: readonly PackageVolumeTier[] | null; currency: string; routeTransport: boolean;
}) {
  const [volume, setVolume] = useState("20");
  const [gross, setGross] = useState("");
  const volumeM3 = Number(pricingDecimal(volume, 4));
  const weight = pricingDecimal(gross, 4);
  const usesWeight = shipment?.mode !== "NONE" || components?.some((row) => row.basis === "CWT");
  const tier = minimumForPackage({ minimumSale: minimum, volumeTiers: tiers ?? [] }, volumeM3);
  const measures = shipment && volumeM3 > 0 && volumeM3 <= 100_000 ? packageMeasures(volumeM3, weight == null ? null : Number(weight), shipment) : null;
  const values = (components ?? []).map((row) => ({ row, cost: choices.get(row.ruleSeriesRef), quantity: measures ? packageQuantity(row, measures) : null }));
  const complete = tiers !== null && tier && values.length > 0 && values.every((item) => item.quantity !== null && item.cost?.currency === currency)
    && !routeTransport && Number(recommended) < 100;
  const totalCost = values.reduce((total, item) => total + Number(item.quantity) * Number(item.cost?.unitCost ?? 0), 0);
  const suggested = values.reduce((total, item) => {
    const cost = Number(item.quantity) * Number(item.cost?.unitCost ?? 0);
    const margin = Math.max(Number(recommended), (item.cost?.minimumMarginBps ?? 0) / 100);
    return total + (item.cost?.classification === "PR" ? cost / (1 - margin / 100) : cost);
  }, 0);

  return <details className="rounded border bg-slate-50 px-3 py-2">
    <summary className="cursor-pointer text-sm font-semibold text-[#003366]">Simular volumen</summary>
    <div className="mt-2 flex flex-wrap items-end gap-3 text-xs">
      <label className="w-28 font-semibold">Volumen (m³)<NumericInput className={FIELD} min="0.0001" max={100_000} step="0.0001" allowDecimalComma value={volume} onChange={(event) => setVolume(event.target.value)} /></label>
      {usesWeight && <label className="w-28 font-semibold">Peso bruto (kg)<NumericInput className={FIELD} min="0.0001" max={1_000_000} step="0.0001" allowDecimalComma value={gross} onChange={(event) => setGross(event.target.value)} /></label>}
      {values.filter((item) => item.row.basis === "CAPACITY" && item.quantity).map(({ row, quantity }) => <span key={row.ruleSeriesRef}>{row.concept} <strong>{quantity} {row.unit}(s)</strong></span>)}
      {tier && <span>Mínimo <strong>{pricingMoney(tier.minimumSale, currency)}</strong></span>}
      {complete && <><span>Costo <strong>{pricingMoney(totalCost, currency)}</strong></span>
        <span>Venta estimada <strong>{pricingMoney(Math.max(Number(tier.minimumSale), suggested), currency)}</strong></span></>}
    </div>
    {routeTransport && <p className="mt-2 text-xs text-slate-600">El transporte por ruta se suma al cotizar el caso.</p>}
    {values.some((item) => item.cost?.currency && item.cost.currency !== currency) && <p className="mt-2 text-xs text-slate-600">El total se calcula con las tasas vigentes de la cotización.</p>}
    {!tier && <p className="mt-2 text-xs text-slate-600">El volumen queda fuera de los tramos del paquete.</p>}
  </details>;
}

function RecipeForm({ pkg, rule, choices, authorization, canManage, onSaved, onCostSaved, onUnauthorized }: {
  pkg: ServicePackage; rule?: CostingRule; choices: readonly CostingRule[]; authorization?: string; canManage: boolean;
  onSaved(): void; onCostSaved(rule: CostingRule): void; onUnauthorized(): void;
}) {
  const existing = isPackagePricingRule(rule) ? rule.result : null;
  const [currency, setCurrency] = useState(rule?.currency ?? "DOP");
  const [recommended, setRecommended] = useState(String((rule?.recommendedMarginBps ?? 0) / 100));
  const [minimum, setMinimum] = useState(String((rule?.minimumMarginBps ?? 0) / 100));
  const [minimumSale, setMinimumSale] = useState(existing?.minimumSale ?? "0");
  const [tiers, setTiers] = useState<TierDraft[]>(() => (existing?.volumeTiers ?? []).map((tier) =>
    ({ id: crypto.randomUUID(), maxM3: tier.maxM3 === null ? "" : String(tier.maxM3), minimumSale: tier.minimumSale })));
  const [allowEdits, setAllowEdits] = useState(existing?.allowEdits !== false);
  const [mode, setMode] = useState<PackageShipment["mode"]>(existing?.shipment.mode ?? "NONE");
  const [factor, setFactor] = useState(String(existing?.shipment.factor ?? ""));
  const [roundKg, setRoundKg] = useState(existing?.shipment.roundKg ?? 0);
  const [routeTransport, setRouteTransport] = useState(existing?.includeRouteTransport ?? false);
  const [rows, setRows] = useState<ComponentDraft[]>(() => (existing?.components ?? []).map((row) => ({
    ...row, factor: String(row.factor), minimumQuantity: String(row.minimumQuantity),
  })));
  const [picker, setPicker] = useState<"ADD" | CostingRule | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<{ key: string; id: string } | null>(null);
  const bySeries = new Map(choices.map((choice) => [choice.seriesRef, choice]));
  const parsedTiers = parseTiers(tiers);
  const components = parseComponents(rows, bySeries, mode);
  const shipmentFactor = mode === "NONE" ? null : pricingDecimal(factor, 4);
  const shipment = mode !== "NONE" && !shipmentFactor ? null
    : { mode, factor: shipmentFactor === null ? null : Number(shipmentFactor), roundKg: mode === "AIR" ? roundKg : 0 };

  function updateRow(ref: string, patch: Partial<ComponentDraft>) {
    setRows((current) => current.map((row) => row.ruleSeriesRef === ref ? { ...row, ...patch } : row));
  }
  function addRow(cost: CostingRule) {
    const unit = String(cost.result?.unit ?? "UNIT");
    setRows((current) => current.some((row) => row.ruleSeriesRef === cost.seriesRef) ? current : [...current, {
      ruleSeriesRef: cost.seriesRef, concept: cost.name, unit: UNITS[unit] ?? unit,
      basis: "FIXED", factor: "1", minimumQuantity: "0", roundUp: false,
    }]);
  }
  function updateTier(id: string, update: Partial<TierDraft>) {
    setTiers((current) => current.map((tier) => tier.id === id ? { ...tier, ...update } : tier));
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saleFloor = pricingDecimal(minimumSale, 2);
    const recommendedPercent = pricingDecimal(recommended, 2);
    const minimumPercent = pricingDecimal(minimum, 2);
    if (!saleFloor || !recommendedPercent || !minimumPercent || Number(minimumPercent) > Number(recommendedPercent) || !shipment) {
      setError("Revisa los márgenes, el mínimo de venta y el factor de peso.");
      return;
    }
    if (!parsedTiers) { setError(ERRORS.COSTING_PACKAGE_TIERS_INVALID); return; }
    if (!components || !components.length && !routeTransport) { setError("Completa los componentes, sus unidades y cantidades."); return; }
    if (routeTransport && components.some((row) => ["TRANSPORT", "TRAVEL"].includes(bySeries.get(row.ruleSeriesRef)!.family))) {
      setError(ERRORS.COSTING_PACKAGE_TRANSPORT_DUPLICATE);
      return;
    }
    const result: PackagePricingResult = {
      kind: PACKAGE_PRICING_KIND, components, minimumSale: saleFloor, volumeTiers: parsedTiers, allowEdits, includeRouteTransport: routeTransport, shipment,
    };
    const payload = {
      seriesRef: rule?.seriesRef ?? null, expectedVersion: rule?.version ?? 0, name: pkg.name,
      code: "PKG_" + pkg.versionRef.replaceAll("-", "").toUpperCase(),
      family: "ADDITIONAL", classification: "PR", source: "COMBO", priority: 100, specificity: 1,
      conditions: { packageVersionRef: pkg.versionRef }, unitCost: null, currency,
      minimumMarginBps: Math.round(Number(minimumPercent) * 100), recommendedMarginBps: Math.round(Number(recommendedPercent) * 100),
      result, state: "ACTIVE", validFrom: null, validTo: null,
    };
    const key = JSON.stringify(payload);
    if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
    setError("");
    setSaving(true);
    try {
      await costingApi.versionRule(authorization, payload, request.current.id);
      onSaved();
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "";
      if (code.includes("UNAUTHORIZED")) onUnauthorized();
      else setError(ERRORS[code] ?? "No se pudo publicar la tarifa. Revisa sus componentes e inténtalo de nuevo.");
    } finally { setSaving(false); }
  }

  const excluded = new Set(rows.map((row) => row.ruleSeriesRef));
  return <>
    <form onSubmit={(event) => void save(event)} className="space-y-3 rounded-lg border bg-white p-3">
      <p className="text-xs text-slate-600">{pkg.primary?.name} · {pkg.modes.map((item) => item.name).join(", ")}</p>
      <fieldset disabled={saving || !canManage} className="space-y-3">
        <section aria-label="Componentes incluidos">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[#003366]">Componentes incluidos</h3>
            {canManage && <Button type="button" size="sm" variant="outline" disabled={rows.length >= 30} onClick={() => setPicker("ADD")}><Plus aria-hidden="true" />Componente</Button>}
          </div>
          {!rows.length && <p className="mt-2 text-xs text-slate-600">Agrega los servicios, materiales y cargos que incluye el paquete.</p>}
          {rows.length > 0 && <div className="mt-2 divide-y rounded border">
            {rows.map((row) => {
              const cost = bySeries.get(row.ruleSeriesRef);
              const name = row.concept;
              return <section key={row.ruleSeriesRef} className="space-y-1 px-2 py-1.5">
                <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
                  <div className="min-w-36 flex-1">
                    <p className="text-sm font-semibold">{name}</p>
                    <p className="text-xs text-slate-600">{cost ? pricingMoney(cost.unitCost!, cost.currency) + " / " + row.unit : "Costo fuera de vigencia"}</p>
                  </div>
                  <label className="w-44 text-xs font-semibold">Cálculo<select aria-label={"Cálculo de " + name} className={FIELD} value={row.basis} onChange={(event) => updateRow(row.ruleSeriesRef, { basis: event.target.value as PackageBasis })}>
                    {BASES.map(([basis, label]) => <option key={basis} value={basis} disabled={basis === "CHARGEABLE_KG" && mode !== "AIR"}>{label}</option>)}
                  </select></label>
                  <label className="w-24 text-xs font-semibold">{row.basis === "CAPACITY" ? "m³ por viaje" : "Cantidad"}
                    <NumericInput aria-label={(row.basis === "CAPACITY" ? "Capacidad de " : "Cantidad de ") + name} required allowDecimalComma min="0.0001" max={100_000} step="0.0001" className={FIELD} value={row.factor}
                      onChange={(event) => updateRow(row.ruleSeriesRef, { factor: event.target.value })} />
                  </label>
                  {canManage && <div className="flex gap-1">
                    {cost && <Button type="button" size="icon" variant="ghost" aria-label={"Actualizar costo de " + cost.name} onClick={() => setPicker(cost)}><Pencil aria-hidden="true" /></Button>}
                    <Button type="button" size="icon" variant="ghost" aria-label={"Quitar " + name} onClick={() => setRows(rows.filter((item) => item.ruleSeriesRef !== row.ruleSeriesRef))}><Trash2 aria-hidden="true" /></Button>
                  </div>}
                </div>
                <details className="text-xs text-slate-600"><summary className="cursor-pointer">Ajustes del componente</summary>
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <label className="min-w-40 flex-1 font-semibold">Nombre en la propuesta<input className={FIELD} maxLength={240} value={row.concept} required onChange={(event) => updateRow(row.ruleSeriesRef, { concept: event.target.value })} /></label>
                    <label className="w-28 font-semibold">Cantidad mínima<NumericInput className={FIELD} allowDecimalComma required min={0} max={100_000} step="0.0001" value={row.minimumQuantity} onChange={(event) => updateRow(row.ruleSeriesRef, { minimumQuantity: event.target.value })} /></label>
                    <label className="flex min-h-9 items-center gap-2"><input type="checkbox" checked={row.basis === "CAPACITY" || row.roundUp} disabled={row.basis === "CAPACITY"} onChange={(event) => updateRow(row.ruleSeriesRef, { roundUp: event.target.checked })} />Redondear a unidades completas</label>
                  </div>
                </details>
              </section>;
            })}
          </div>}
        </section>
        <section aria-label="Precio y mínimos" className="space-y-2 border-t pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[#003366]">Precio y mínimos</h3>
            {canManage && <Button type="button" size="sm" variant="outline" disabled={tiers.length >= 20} onClick={() => setTiers([...tiers, { id: crypto.randomUUID(), maxM3: "", minimumSale: minimumSale || "0" }])}><Plus aria-hidden="true" />Tramo</Button>}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <label className="text-xs font-semibold">Moneda<input className={FIELD} required maxLength={3} pattern="[A-Z]{3}" value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} /></label>
            <label className="text-xs font-semibold">Margen de venta (%)<NumericInput className={FIELD} required allowDecimalComma min={0} max={99.99} step="0.01" value={recommended} onChange={(event) => setRecommended(event.target.value)} /></label>
            <label className="text-xs font-semibold">Margen mínimo (%)<NumericInput className={FIELD} required allowDecimalComma min={0} max={99.99} step="0.01" value={minimum} onChange={(event) => setMinimum(event.target.value)} /></label>
            {!tiers.length && <label className="text-xs font-semibold">Mínimo de venta<NumericInput className={FIELD} required allowDecimalComma min={0} max={100_000_000} step="0.01" value={minimumSale} onChange={(event) => setMinimumSale(event.target.value)} /></label>}
          </div>
          {tiers.length > 0 && <div className="divide-y rounded border">
            {tiers.map((tier, index) => <div key={tier.id} className="flex flex-wrap items-end gap-2 p-2">
              <span className="min-w-28 flex-1 text-xs font-semibold text-slate-600">{index === 0 ? "Primer tramo" : tiers[index - 1].maxM3 ? "Más de " + tiers[index - 1].maxM3 + " m³" : "Siguiente tramo"}</span>
              <label className="w-28 text-xs font-semibold">Hasta (m³)<NumericInput aria-label={"Volumen máximo del tramo " + (index + 1)} className={FIELD} allowDecimalComma min="0.0001" max={100_000} step="0.0001" placeholder="Sin límite" value={tier.maxM3} onChange={(event) => updateTier(tier.id, { maxM3: event.target.value })} /></label>
              <label className="w-32 text-xs font-semibold">Mínimo de venta<NumericInput aria-label={"Mínimo de venta del tramo " + (index + 1)} className={FIELD} required allowDecimalComma min={0} max={100_000_000} step="0.01" value={tier.minimumSale} onChange={(event) => updateTier(tier.id, { minimumSale: event.target.value })} /></label>
              <Button type="button" size="icon" variant="ghost" aria-label={"Quitar tramo " + (index + 1)} onClick={() => setTiers(tiers.filter((item) => item.id !== tier.id))}><Trash2 aria-hidden="true" /></Button>
            </div>)}
          </div>}
          <label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={allowEdits} onChange={(event) => setAllowEdits(event.target.checked)} />Permitir ajustes del paquete en Cotización según permisos</label>
        </section>
        <details className="rounded border px-3 py-2 text-xs text-slate-600">
          <summary className="cursor-pointer font-semibold">Peso y ruta</summary>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="w-44 font-semibold">Perfil de peso<select className={FIELD} value={mode} onChange={(event) => {
              const next = event.target.value as PackageShipment["mode"];
              setMode(next); setFactor(next === "AIR" ? "6000" : next === "SEA" ? "100" : "");
            }}><option value="NONE">Peso bruto si aplica</option><option value="SEA">Marítimo</option><option value="AIR">Aéreo</option></select></label>
            {mode !== "NONE" && <label className="w-44 font-semibold">{mode === "AIR" ? "Divisor (cm³/kg)" : "Densidad (kg/m³)"}
              <NumericInput className={FIELD} required allowDecimalComma min={1} max={100_000} step="0.0001" value={factor} onChange={(event) => setFactor(event.target.value)} /></label>}
            {mode === "AIR" && <label className="w-44 font-semibold">Redondeo aéreo<select className={FIELD} value={roundKg} onChange={(event) => setRoundKg(Number(event.target.value))}>
              <option value={0}>Sin redondeo adicional</option><option value={0.5}>Al medio kg superior</option><option value={1}>Al kg superior</option>
            </select></label>}
            <label className="flex min-h-9 items-center gap-2 font-semibold"><input type="checkbox" checked={routeTransport} onChange={(event) => setRouteTransport(event.target.checked)} />Incluir transporte calculado por ruta</label>
          </div>
        </details>
        <TariffSimulation components={components} choices={bySeries} shipment={shipment} recommended={recommended} currency={currency}
          minimum={minimumSale} tiers={parsedTiers} routeTransport={routeTransport} />
        {canManage && <div className="flex justify-end"><Button size="sm" type="submit" disabled={saving || !rows.length && !routeTransport}><Save aria-hidden="true" />{saving ? "Guardando…" : "Publicar tarifa"}</Button></div>}
      </fieldset>
      {error && <p role="alert" className="text-xs text-red-800">{error}</p>}
    </form>
    {picker && <PackageComponentDialog authorization={authorization} currency={currency} canManage={canManage}
      excluded={excluded} costs={choices.filter((cost) => !routeTransport || !["TRANSPORT", "TRAVEL"].includes(cost.family))}
      editing={picker === "ADD" ? undefined : picker} onPick={picker === "ADD" ? addRow : undefined}
      onSave={onCostSaved} onClose={() => setPicker(null)} />}
  </>;
}

export default function PackagePricingAdmin({ authorization, packages, canManage, onUnauthorized, modes, services, catalogModes, onCreate }: Props) {
  const [rules, setRules] = useState<readonly CostingRule[]>([]);
  const [selectedRef, setSelectedRef] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [loadedAt, setLoadedAt] = useState(Date.now);
  const [showComponents, setShowComponents] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  useEffect(() => {
    let disposed = false;
    void costingApi.rules(authorization).then((value) => {
      if (disposed) return;
      setRules(value);
      setLoadedAt(Date.now());
      setError(false);
    }).catch((cause) => {
      if (disposed) return;
      if (cause instanceof Error && cause.message.includes("UNAUTHORIZED")) onUnauthorized();
      else setError(true);
    }).finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, [authorization, onUnauthorized, reload]);

  const onSaved = useCallback(() => {
    setNotice("Tarifa publicada para nuevas cotizaciones.");
    setLoading(true);
    setReload((current) => current + 1);
  }, []);
  function onCostSaved(cost: CostingRule) {
    setRules((current) => [cost, ...current.filter((item) => item.seriesRef !== cost.seriesRef)]);
    setLoadedAt(Math.max(Date.now(), Date.parse(cost.validFrom ?? "") || 0));
    setNotice("Costo guardado para nuevas cotizaciones.");
  }

  const published = packages.filter((pkg) => pkg.state === "PUBLISHED");
  const selected = published.find((pkg) => pkg.versionRef === selectedRef);
  const active = rules.filter((rule) => activeRule(rule, loadedAt));
  const choices = active.filter((rule) => rule.unitCost != null && rule.family !== "CURRENCY_COMPENSATION" && !isPackagePricingRule(rule))
    .sort((a, b) => a.name.localeCompare(b.name, "es") || b.version - a.version)
    .filter((rule, index, current) => current.findIndex((item) => item.seriesRef === rule.seriesRef) === index);
  const pricingByPackage = new Map(active.filter(isPackagePricingRule).map((rule) => [rule.conditions?.packageVersionRef, rule]));
  const rule = pricingByPackage.get(selectedRef);

  return <section aria-label="Tarifario de servicios" className="space-y-3 py-3">
    <div className="flex flex-wrap items-end justify-between gap-2">
      <label className="min-w-56 flex-1 text-xs font-semibold">Paquete
        <select className={FIELD} value={selectedRef} onChange={(event) => { setSelectedRef(event.target.value); setNotice(""); }}>
          <option value="">Buscar un paquete publicado</option>
          {published.map((pkg) => <option key={pkg.versionRef} value={pkg.versionRef}>{pkg.name} · v{pkg.version}{pricingByPackage.has(pkg.versionRef) ? "" : " · Sin tarifa"}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={loading || error} onClick={() => setShowComponents(true)}><Layers3 aria-hidden="true" />Componentes</Button>
        {onCreate && <Button type="button" size="sm" onClick={() => setShowCreate(true)}><Plus aria-hidden="true" />Nuevo paquete</Button>}
      </div>
    </div>
    {rule?.validFrom && <p className="text-xs text-slate-600">Tarifa v{rule.version} · Vigente desde {new Date(rule.validFrom).toLocaleDateString("es-DO", { timeZone: "America/Santo_Domingo" })}</p>}
    {loading && <p role="status" className="text-xs text-slate-600">Cargando componentes…</p>}
    {error && <p role="alert" className="text-xs text-red-800">No se pudo consultar el tarifario. Actualiza la página.</p>}
    {notice && !loading && !error && <p role="status" className="text-xs font-semibold text-emerald-700">{notice}</p>}
    {!published.length && !loading && <p className="text-xs text-slate-600">Crea un paquete para establecer sus componentes y mínimos.</p>}
    {selected && !loading && !error && <RecipeForm key={selectedRef + ":" + (rule?.version ?? 0)} pkg={selected} rule={rule} choices={choices}
      authorization={authorization} canManage={canManage} onSaved={onSaved} onCostSaved={onCostSaved} onUnauthorized={onUnauthorized} />}
    {showComponents && <PackageComponentDialog authorization={authorization} costs={choices} currency={rule?.currency ?? "DOP"} canManage={canManage}
      onSave={onCostSaved} onClose={() => setShowComponents(false)} />}
    {showCreate && onCreate && <NewTariffPackage modes={modes} services={services} catalogModes={catalogModes} onCreate={onCreate}
      onCreated={(pkg) => { setSelectedRef(pkg.versionRef); setShowCreate(false); setNotice(""); }} onClose={() => setShowCreate(false)} />}
  </section>;
}
