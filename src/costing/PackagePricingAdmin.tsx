import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Check, Minus, Pencil, Plus, Save, Search, X } from "lucide-react";
import { AdministrationHelp, AdministrationIconAction } from "@/administration/AdministrationHelp";
import { Button } from "@/components/ui/button";
import { COMPACT_TABLE_BODY, COMPACT_TABLE_FIELD, COMPACT_TABLE_HEAD } from "@/components/ui/compact-form";
import { NumericInput } from "@/components/ui/numeric-input";
import type { ServiceCatalogItem, ServiceMode, ServicePackage } from "@/crm-services/api";
import {
  isPackagePricingRule, minimumForPackage, packageMeasures, packageQuantity, PACKAGE_BASE_LABELS, PACKAGE_PRICING_KIND,
  type PackageBasis, type PackageComponent, type PackagePricingResult, type PackageShipment, type PackageVolumeTier,
} from "../../shared/servicePackagePricing.js";
import { costingApi, type CostingRule } from "./api";
import { costUnitLabel, filterBySearch } from "./componentLabels";
import { PackageCostTable } from "./PackageCostTable";
import { pricingDecimal, pricingMoney, pricingQuantity } from "./pricingInput";

type ComponentDraft = Omit<PackageComponent, "factor" | "minimumQuantity"> & { factor: string; minimumQuantity: string };
type TierDraft = { id: string; maxM3: string; minimumSale: string };
type CreatePackage = (value: { name: string; modeRef: string; primaryServiceRef: string; requestId: string }) => Promise<ServicePackage>;
type Props = Readonly<{
  view: "PRICING" | "COSTS"; authorization?: string; packages: readonly ServicePackage[]; canManage: boolean; onUnauthorized(): void;
  modes: readonly ServiceMode[]; services: readonly ServiceCatalogItem[];
  catalogModes: readonly Readonly<{ serviceRef: string; modeRefs: readonly string[] }>[];
  onCreate?: CreatePackage;
}>;

const FIELD = COMPACT_TABLE_FIELD;
const AMOUNT = FIELD + " text-right tabular-nums";
const ACTION = "border-transparent bg-transparent";
const LIST = "overflow-auto border-b border-slate-200 max-h-[max(14rem,calc(100dvh-19rem))]";
const BASES = Object.entries(PACKAGE_BASE_LABELS) as [PackageBasis, string][];
const PANELS = { COMPONENTS: "Componentes", TIERS: "Tramos", WEIGHT: "Peso y ruta", SIMULATION: "Simular" } as const;
const ERRORS: Record<string, string> = {
  COSTING_PACKAGE_RULE_CONFLICT: "Ya existe una tarifa para esta versión. Actualiza antes de editar.",
  COSTING_PACKAGE_COMPONENT_MISSING: "Al menos un costo de componente ya no está vigente.",
  COSTING_PACKAGE_NOT_AVAILABLE: "La versión del paquete ya no está publicada.",
  COSTING_PACKAGE_TRANSPORT_DUPLICATE: "El transporte por ruta ya cubre el costo del vehículo. Revisa el componente de transporte.",
  COSTING_RULE_VERSION_CONFLICT: "Otra persona publicó una tarifa más reciente. Actualiza antes de guardar.",
  COSTING_PACKAGE_TIERS_INVALID: "Ordena los tramos por volumen máximo. Solo el último puede quedar sin límite.",
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
    if (factor < 0.0001 || factor > 100_000 || minimum === null || Number(minimum) > 100_000 || !row.concept.trim()
      || !row.unit || !choices.has(row.ruleSeriesRef) || row.basis === "CHARGEABLE_KG" && mode !== "AIR") return null;
    components.push({ ruleSeriesRef: row.ruleSeriesRef, concept: row.concept.trim(), unit: row.unit,
      basis: row.basis, factor, minimumQuantity: Number(minimum), roundUp: row.roundUp });
  }
  return components;
}

function NewTariffPackage({ modes, services, catalogModes, onCreate, onCreated, onClose, onUnauthorized }: Pick<Props, "modes" | "services" | "catalogModes" | "onUnauthorized">
  & { onCreate: CreatePackage; onCreated(pkg: ServicePackage): void; onClose(): void }) {
  const form = useId();
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
    } catch (cause) {
      const failure = cause as { status?: number; code?: string };
      if (failure?.status === 401) onUnauthorized();
      else setError(failure?.code === "SERVICE_PACKAGES_IDEMPOTENCY_CONFLICT"
        ? "Este paquete ya pudo haberse creado. Actualiza el listado antes de repetirlo."
        : "No se pudo crear el paquete. Comprueba la modalidad y el servicio principal.");
    } finally { setBusy(false); }
  }

  return <>
    <tr className="bg-sky-50/70">
      <td><input form={form} aria-label="Nombre del paquete" placeholder="Nombre del paquete" className={FIELD} required maxLength={160} disabled={busy}
        value={name} onChange={(event) => setName(event.target.value)} /></td>
      <td><select form={form} aria-label="Modalidad" className={FIELD} required disabled={busy}
        value={modeRef} onChange={(event) => { setModeRef(event.target.value); setPrimaryServiceRef(""); }}>
        <option value="">Modalidad…</option>{publishedModes.map((mode) => <option key={mode.modeRef} value={mode.modeRef}>{mode.name}</option>)}
      </select></td>
      <td><select form={form} aria-label="Servicio principal" className={FIELD} required disabled={busy || !available.length}
        value={primaryServiceRef} onChange={(event) => setPrimaryServiceRef(event.target.value)}>
        <option value="">Servicio principal…</option>{available.map((service) => <option key={service.serviceRef} value={service.serviceRef}>{service.name}</option>)}
      </select></td>
      <td className="text-slate-500">Nuevo</td>
      <td>
        <form id={form} onSubmit={(event) => void save(event)} className="flex justify-end">
          <AdministrationIconAction label="Configurar tarifa" type="submit" className={ACTION + " text-emerald-700"}
            disabled={busy || !name.trim() || !primaryServiceRef}><Check aria-hidden="true" className="size-4" /></AdministrationIconAction>
          <AdministrationIconAction label="Cancelar nuevo paquete" className={ACTION} disabled={busy} onClick={onClose}><X aria-hidden="true" className="size-4" /></AdministrationIconAction>
        </form>
      </td>
    </tr>
    {(!publishedModes.length || modeRef && !available.length || error) && <tr><td colSpan={5}>
      {error ? <p role="alert" className="py-1 text-red-800">{error}</p>
        : <p className="py-1 text-slate-600">{publishedModes.length
          ? "Asigna un servicio principal a esta modalidad en Modalidades."
          : "Publica una modalidad en Modalidades para crear el paquete."}</p>}
    </td></tr>}
  </>;
}

function TariffSimulation({ components, choices, shipment, recommended, minimum, tiers, currency, routeTransport }: {
  components: readonly PackageComponent[] | null; choices: ReadonlyMap<string, CostingRule>; shipment: PackageShipment | null;
  recommended: string; minimum: string; tiers: readonly PackageVolumeTier[] | null; currency: string; routeTransport: boolean;
}) {
  const [volume, setVolume] = useState("20");
  const [gross, setGross] = useState("");
  const volumeM3 = Number(pricingDecimal(volume, 4));
  const weight = pricingDecimal(gross, 4);
  const usesWeight = Boolean(shipment && shipment.mode !== "NONE" || components?.some((row) => row.basis === "CWT"));
  const tier = tiers && minimumForPackage({ minimumSale: minimum, volumeTiers: tiers }, volumeM3);
  const measures = shipment && volumeM3 > 0 && volumeM3 <= 100_000 ? packageMeasures(volumeM3, weight == null ? null : Number(weight), shipment) : null;
  const values = (components ?? []).map((row) => ({ row, cost: choices.get(row.ruleSeriesRef), quantity: measures ? packageQuantity(row, measures) : null }));
  const complete = tier && values.length > 0 && values.every((item) => item.quantity !== null && item.cost?.currency === currency)
    && !routeTransport && Number(recommended) < 100;
  const totalCost = values.reduce((total, item) => total + Number(item.quantity) * Number(item.cost?.unitCost ?? 0), 0);
  const suggested = values.reduce((total, item) => {
    const cost = Number(item.quantity) * Number(item.cost?.unitCost ?? 0);
    const margin = Math.max(Number(recommended), (item.cost?.minimumMarginBps ?? 0) / 100);
    return total + (item.cost?.classification === "PR" ? cost / (1 - margin / 100) : cost);
  }, 0);

  return <section aria-label="Simular volumen" className="space-y-1.5 py-2">
    <div className="flex flex-wrap items-end gap-3 text-xs">
      <label className="w-28 font-semibold">Volumen (m³)<NumericInput className={FIELD + " bg-white"} min="0.0001" max={100_000} step="0.0001" allowDecimalComma value={volume} onChange={(event) => setVolume(event.target.value)} /></label>
      {usesWeight && <label className="w-28 font-semibold">Peso bruto (kg)<NumericInput className={FIELD + " bg-white"} min="0.0001" max={1_000_000} step="0.0001" allowDecimalComma value={gross} onChange={(event) => setGross(event.target.value)} /></label>}
      <AdministrationHelp title="simular una tarifa"><p>Prueba cómo cambian las cantidades, el costo y el precio al variar el volumen. Los datos de esta consulta no se publican.</p></AdministrationHelp>
    </div>
    <div className="flex flex-wrap gap-x-5 gap-y-2 border-y border-slate-200 bg-white py-2 text-xs">
      {values.filter((item) => item.row.basis === "CAPACITY" && item.quantity).map(({ row, quantity }) => <span key={row.ruleSeriesRef}>{row.concept} <strong>{quantity} {costUnitLabel(row.unit)}</strong></span>)}
      {measures?.chargeableKg != null && <span>Kg cobrables <strong>{pricingQuantity.format(measures.chargeableKg)}</strong></span>}
      {tier && <span>Mínimo <strong>{pricingMoney(tier.minimumSale, currency)}</strong></span>}
      {complete && <><span>Costo <strong>{pricingMoney(totalCost, currency)}</strong></span>
        <span>Venta estimada <strong>{pricingMoney(Math.max(Number(tier.minimumSale), suggested), currency)}</strong></span></>}
      {!tier && <span className="text-slate-600">{tiers ? "El volumen queda fuera de los tramos del paquete." : "Completa los tramos para simular el mínimo."}</span>}
    </div>
    {routeTransport && <p className="text-xs text-slate-600">El transporte por ruta se calcula en la cotización del caso.</p>}
    {values.some((item) => item.cost?.currency && item.cost.currency !== currency) && <p className="text-xs text-slate-600">El total se calcula con las tasas vigentes de la cotización.</p>}
  </section>;
}

function RecipeForm({ pkg, rule, choices, authorization, canManage, onBack, onSaved, onCostSaved, onUnauthorized }: {
  pkg: ServicePackage; rule?: CostingRule; choices: readonly CostingRule[]; authorization?: string; canManage: boolean;
  onBack(): void; onSaved(rule: CostingRule): void; onCostSaved(rule: CostingRule): void; onUnauthorized(): void;
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
  const [panel, setPanel] = useState<keyof typeof PANELS>("COMPONENTS");
  const [picker, setPicker] = useState<"ADD" | CostingRule | null>(!rows.length && canManage ? "ADD" : null);
  const [editingNewCost, setEditingNewCost] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<{ key: string; id: string } | null>(null);
  const bySeries = new Map(choices.map((choice) => [choice.seriesRef, choice]));
  const parsedTiers = parseTiers(tiers);
  const components = parseComponents(rows, bySeries, mode);
  const shipmentFactor = Number(pricingDecimal(factor, 4));
  const shipment = mode !== "NONE" && (shipmentFactor < 1 || shipmentFactor > 100_000) ? null
    : { mode, factor: mode === "NONE" ? null : shipmentFactor, roundKg: mode === "AIR" ? roundKg : 0 };
  const excluded = new Set(rows.map((row) => row.ruleSeriesRef));
  const available = choices.filter((cost) => !excluded.has(cost.seriesRef) && (!routeTransport || cost.family !== "TRANSPORT"));
  const editingCost = editingNewCost || Boolean(picker && picker !== "ADD");

  function updateRow(ref: string, patch: Partial<ComponentDraft>) {
    setRows((current) => current.map((row) => row.ruleSeriesRef === ref ? { ...row, ...patch } : row));
  }
  function addRow(cost: CostingRule) {
    setRows((current) => current.length >= 30 || current.some((row) => row.ruleSeriesRef === cost.seriesRef) ? current : [...current, {
      ruleSeriesRef: cost.seriesRef, concept: cost.name, unit: costUnitLabel(String(cost.result?.unit ?? "")),
      basis: "FIXED", factor: "1", minimumQuantity: "0", roundUp: false,
    }]);
  }
  function updateTier(id: string, update: Partial<TierDraft>) {
    setTiers((current) => current.map((tier) => tier.id === id ? { ...tier, ...update } : tier));
    if (error === ERRORS.COSTING_PACKAGE_TIERS_INVALID) setError("");
  }
  async function save() {
    if (saving || !canManage || editingCost) return;
    const saleFloor = pricingDecimal(minimumSale, 2);
    const recommendedPercent = pricingDecimal(recommended, 2);
    const minimumPercent = pricingDecimal(minimum, 2);
    if (saleFloor === null || Number(saleFloor) > 100_000_000 || !/^[A-Z]{3}$/.test(currency)
      || recommendedPercent === null || minimumPercent === null || Number(recommendedPercent) > 99.99
      || Number(minimumPercent) > Number(recommendedPercent)) {
      setError("Revisa la moneda, el mínimo y los márgenes. El margen mínimo debe ser igual o menor al de venta.");
      return;
    }
    if (!shipment) { setPanel("WEIGHT"); setError("Indica un factor de peso entre 1 y 100,000."); return; }
    if (!parsedTiers) { setPanel("TIERS"); setError(ERRORS.COSTING_PACKAGE_TIERS_INVALID); return; }
    if (!components || !components.length && !routeTransport) {
      setPanel("COMPONENTS");
      setError("Selecciona al menos un componente y completa sus cantidades. Verifica que los costos estén vigentes.");
      return;
    }
    if (routeTransport && components.some((row) => bySeries.get(row.ruleSeriesRef)!.family === "TRANSPORT")) {
      setPanel("COMPONENTS"); setError(ERRORS.COSTING_PACKAGE_TRANSPORT_DUPLICATE); return;
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
      const saved = await costingApi.versionRule(authorization, payload, request.current.id);
      onSaved({ ...payload, ...saved });
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "";
      if (code.includes("UNAUTHORIZED")) onUnauthorized();
      else setError(ERRORS[code] ?? "No se pudo publicar la tarifa. Revisa sus componentes e inténtalo de nuevo.");
    } finally { setSaving(false); }
  }

  return <section aria-label={"Tarifa de " + pkg.name}>
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 py-2">
      <AdministrationIconAction label="Volver a paquetes" className={ACTION} disabled={saving || editingCost} onClick={onBack}><ArrowLeft aria-hidden="true" className="size-4" /></AdministrationIconAction>
      <div className="min-w-40 flex-1">
        <h3 className="text-sm font-bold text-[#003366]">{pkg.name}</h3>
        <p className="text-xs text-slate-600">{pkg.modes.map((item) => item.name).join(", ")} · {pkg.primary?.name ?? "—"} · {rule ? "Tarifa v" + rule.version : "Sin tarifa"}</p>
      </div>
      <AdministrationHelp title="publicar una tarifa">
        <p>Agrega los componentes y revisa el margen y el mínimo. Puedes probar el resultado en Simular antes de publicar.</p>
        <p>Una tarifa publicada queda disponible en Comercial para futuras cotizaciones. Si hay tramos, cada uno define el mínimo de su rango de volumen.</p>
      </AdministrationHelp>
      {canManage && <Button size="sm" type="button" disabled={saving || editingCost || !rows.length && !routeTransport}
        onClick={() => void save()}><Save aria-hidden="true" />{saving ? "Publicando…" : "Publicar tarifa"}</Button>}
    </div>
    {error && <p role="alert" className="px-2 py-1.5 text-xs font-medium text-red-800">{error}</p>}
    <fieldset disabled={!canManage || saving} className="min-w-0">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2 border-b border-slate-200 bg-white px-2 py-1.5 text-xs">
        <label className="w-16 font-semibold text-slate-600">Moneda<input className={FIELD} maxLength={3} value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} /></label>
        <label className="w-28 font-semibold text-slate-600">Margen venta (%)<NumericInput className={AMOUNT} min={0} max={99.99} step="0.01" allowDecimalComma value={recommended} onChange={(event) => setRecommended(event.target.value)} /></label>
        <label className="w-28 font-semibold text-slate-600">Margen mín. (%)<NumericInput className={AMOUNT} min={0} max={99.99} step="0.01" allowDecimalComma value={minimum} onChange={(event) => setMinimum(event.target.value)} /></label>
        {tiers.length ? <span className="self-center text-slate-600">Mínimo por tramo · {tiers.length}</span>
          : <label className="w-28 font-semibold text-slate-600">Mínimo de venta<NumericInput className={AMOUNT} min={0} max={100_000_000} step="0.01" allowDecimalComma value={minimumSale} onChange={(event) => setMinimumSale(event.target.value)} /></label>}
      </div>
    </fieldset>
    <nav aria-label="Ajustes de la tarifa" className="flex flex-wrap items-center gap-1 border-b border-slate-200 pt-1">
      {(Object.keys(PANELS) as (keyof typeof PANELS)[]).map((item) => <button key={item} type="button" aria-pressed={panel === item} onClick={() => setPanel(item)}
        className={"border-b-2 px-2.5 py-2 text-xs font-semibold " + (panel === item ? "border-[#0070a8] bg-sky-50 text-[#003366]" : "border-transparent text-slate-600 hover:bg-slate-100")}>
        {PANELS[item]}{item === "COMPONENTS" && rows.length > 0 ? " · " + rows.length : ""}
      </button>)}
    </nav>
    <div hidden={panel !== "COMPONENTS"}>
      <div className={"overflow-auto border-b border-slate-200 " + (picker ? "max-h-[max(10rem,calc(100dvh-35rem))]" : LIST)}>
        <table aria-label="Componentes incluidos" className="w-full min-w-[720px] table-fixed text-left">
          <thead className={COMPACT_TABLE_HEAD}><tr>
            <th scope="col" className="w-[24%]">Nombre en propuesta</th><th scope="col" className="w-[8%]">Unidad</th>
            <th scope="col" className="w-[13%] text-right">Costo unit.</th><th scope="col" className="w-[19%]">Cálculo</th>
            <th scope="col" className="w-[11%] text-right">Cant. / Cap.</th><th scope="col" className="w-[7%] text-right">Mín.</th>
            <th scope="col" className="w-[6%] text-center"><abbr title="Redondear a unidades completas">Red.</abbr></th><th scope="col"><span className="sr-only">Acciones</span></th>
          </tr></thead>
          <tbody className={COMPACT_TABLE_BODY}>
            {rows.map((row) => {
              const cost = bySeries.get(row.ruleSeriesRef);
              const name = cost?.name ?? row.concept;
              const isCapacity = row.basis === "CAPACITY";
              const disabled = saving || !canManage;
              return <tr key={row.ruleSeriesRef} className="text-slate-700 hover:bg-slate-50">
                <td><input aria-label={"Nombre en propuesta de " + name} className={FIELD + " font-semibold"} maxLength={240} disabled={disabled}
                  value={row.concept} onChange={(event) => updateRow(row.ruleSeriesRef, { concept: event.target.value })} /></td>
                <td>{costUnitLabel(row.unit)}</td>
                <td className="text-right tabular-nums">{cost ? pricingMoney(cost.unitCost!, cost.currency) : <span className="text-red-700">Sin costo vigente</span>}</td>
                <td><select aria-label={"Cálculo de " + name} className={FIELD} value={row.basis} disabled={disabled} onChange={(event) => updateRow(row.ruleSeriesRef, { basis: event.target.value as PackageBasis })}>
                  {BASES.map(([basis, label]) => <option key={basis} value={basis} disabled={basis === "CHARGEABLE_KG" && mode !== "AIR"}>{label}</option>)}
                </select></td>
                <td><NumericInput aria-label={(isCapacity ? "Capacidad de " : "Cantidad de ") + name} className={AMOUNT} disabled={disabled} allowDecimalComma min="0.0001" max={100_000} step="0.0001"
                  value={row.factor} onChange={(event) => updateRow(row.ruleSeriesRef, { factor: event.target.value })} /></td>
                <td><NumericInput aria-label={"Cantidad mínima de " + name} className={AMOUNT} disabled={disabled} allowDecimalComma min={0} max={100_000} step="0.0001"
                  value={row.minimumQuantity} onChange={(event) => updateRow(row.ruleSeriesRef, { minimumQuantity: event.target.value })} /></td>
                <td className="text-center"><input type="checkbox" aria-label={"Redondear cantidad de " + name} checked={isCapacity || row.roundUp}
                  disabled={disabled || isCapacity} onChange={(event) => updateRow(row.ruleSeriesRef, { roundUp: event.target.checked })} /></td>
                <td>{canManage && <div className="flex justify-end">
                  {cost && <AdministrationIconAction label={"Actualizar costo de " + cost.name} className={ACTION} disabled={saving || editingCost}
                    onClick={() => setPicker(cost)}><Pencil aria-hidden="true" className="size-4" /></AdministrationIconAction>}
                  <AdministrationIconAction label={"Quitar " + name + " del paquete"} className={ACTION} disabled={saving}
                    onClick={() => setRows((current) => current.filter((item) => item.ruleSeriesRef !== row.ruleSeriesRef))}><Minus aria-hidden="true" className="size-4" /></AdministrationIconAction>
                </div>}</td>
              </tr>;
            })}
            {!rows.length && <tr><td colSpan={8} className="h-10 text-slate-500">Sin componentes en el paquete.</td></tr>}
          </tbody>
        </table>
      </div>
      {picker !== "ADD" && <div className="flex items-center gap-1 py-1">
        {canManage && <AdministrationIconAction label="Agregar componentes" mobileLabel="Agregar" disabled={saving || editingCost || rows.length >= 30}
          onClick={() => setPicker("ADD")}><Plus aria-hidden="true" className="size-4" /></AdministrationIconAction>}
        <AdministrationHelp title="componentes del paquete"><p>Usa + para agregar un costo. En cada fila se indica cómo se calcula la cantidad y qué mínimo aplica.</p><p>Para un camión, elige «Por viaje según capacidad» y anota los m³ útiles por viaje en «Cant. / Cap.».</p></AdministrationHelp>
      </div>}
      {canManage && picker === "ADD" && rows.length < 30 && <PackageCostTable authorization={authorization} costs={available} currency={currency} canManage={!saving}
        onPick={addRow} onEditingChange={setEditingNewCost} onSaved={onCostSaved} onClose={() => setPicker(null)} onUnauthorized={onUnauthorized} />}
      {canManage && picker && picker !== "ADD" && <PackageCostTable key={picker.ruleRef} authorization={authorization} costs={[]} currency={currency} canManage={!saving}
        editCost={picker} onSaved={onCostSaved} onClose={() => setPicker(null)} onUnauthorized={onUnauthorized} />}
    </div>
    <div hidden={panel !== "TIERS"}>
      <div className="flex items-center gap-1 py-1">
        {canManage && <AdministrationIconAction label="Agregar tramo" mobileLabel="Tramo" disabled={saving || tiers.length >= 20}
          onClick={() => setTiers((current) => [...current, { id: crypto.randomUUID(), maxM3: "", minimumSale: minimumSale || "0" }])}><Plus aria-hidden="true" className="size-4" /></AdministrationIconAction>}
        <AdministrationHelp title="tramos de volumen"><p>Indica el volumen máximo y el mínimo de venta de cada tramo, en orden ascendente. Deja vacío el último límite si cubre todos los volúmenes restantes.</p></AdministrationHelp>
      </div>
      <div className={LIST}>
        <table aria-label="Mínimos por tramo" className="w-full min-w-[420px] table-fixed text-left">
          <thead className={COMPACT_TABLE_HEAD}><tr><th scope="col">Desde</th><th scope="col" className="w-[25%] text-right">Hasta (m³)</th><th scope="col" className="w-[25%] text-right">Mínimo de venta</th><th scope="col" className="w-14"><span className="sr-only">Acciones</span></th></tr></thead>
          <tbody className={COMPACT_TABLE_BODY}>
            {tiers.map((tier, index) => <tr key={tier.id} className="text-slate-700">
              <td>{index === 0 ? "Primer tramo" : tiers[index - 1].maxM3 ? "Más de " + tiers[index - 1].maxM3 + " m³" : "Siguiente tramo"}</td>
              <td><NumericInput aria-label={"Volumen máximo del tramo " + (index + 1)} className={AMOUNT} disabled={saving || !canManage}
                allowDecimalComma min="0.0001" max={100_000} step="0.0001" placeholder="Sin límite" value={tier.maxM3} onChange={(event) => updateTier(tier.id, { maxM3: event.target.value })} /></td>
              <td><NumericInput aria-label={"Mínimo de venta del tramo " + (index + 1)} className={AMOUNT} disabled={saving || !canManage}
                allowDecimalComma min={0} max={100_000_000} step="0.01" value={tier.minimumSale} onChange={(event) => updateTier(tier.id, { minimumSale: event.target.value })} /></td>
              <td className="text-right">{canManage && <AdministrationIconAction label={"Quitar tramo " + (index + 1)} className={ACTION} disabled={saving}
                onClick={() => setTiers((current) => current.filter((item) => item.id !== tier.id))}><Minus aria-hidden="true" className="size-4" /></AdministrationIconAction>}</td>
            </tr>)}
            {!tiers.length && <tr><td colSpan={4} className="h-10 text-slate-600">Mínimo general {pricingMoney(minimumSale, currency)}.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
    <section hidden={panel !== "WEIGHT"} aria-label="Peso y ruta">
      <fieldset disabled={saving || !canManage} className="flex flex-wrap items-end gap-x-3 gap-y-1 border-b border-slate-200 bg-white px-2 py-2 text-xs">
        <label className="w-44 font-semibold">Perfil de peso<select aria-label="Perfil de peso" className={FIELD} value={mode} onChange={(event) => {
          const next = event.target.value as PackageShipment["mode"];
          setMode(next); setFactor(next === "AIR" ? "6000" : next === "SEA" ? "100" : "");
        }}><option value="NONE">Peso bruto si aplica</option><option value="SEA">Marítimo</option><option value="AIR">Aéreo</option></select></label>
        {mode !== "NONE" && <label className="w-36 font-semibold">{mode === "AIR" ? "Divisor (cm³/kg)" : "Densidad (kg/m³)"}
          <NumericInput className={AMOUNT} allowDecimalComma min={1} max={100_000} step="0.0001" value={factor} onChange={(event) => setFactor(event.target.value)} /></label>}
        {mode === "AIR" && <label className="w-44 font-semibold">Redondeo aéreo<select aria-label="Redondeo aéreo" className={FIELD} value={roundKg} onChange={(event) => setRoundKg(Number(event.target.value))}>
          <option value={0}>Sin redondeo adicional</option><option value={0.5}>Al medio kg superior</option><option value={1}>Al kg superior</option>
        </select></label>}
        <label className="flex min-h-9 items-center gap-2 font-semibold"><input type="checkbox" checked={routeTransport} onChange={(event) => setRouteTransport(event.target.checked)} />Incluir transporte por ruta</label>
        <label className="flex min-h-9 items-center gap-2 font-semibold"><input type="checkbox" checked={allowEdits} onChange={(event) => setAllowEdits(event.target.checked)} />Permitir ajustes en Cotización</label>
        <AdministrationHelp title="peso y ruta"><p>Para flete aéreo se usa el mayor entre el peso bruto y el volumétrico. Añade choferes, cuadrillas, dietas y viáticos como componentes del paquete. El transporte por ruta aporta el costo del vehículo y sus peajes.</p><p>Los ajustes en Cotización dependen de los permisos del usuario.</p></AdministrationHelp>
      </fieldset>
    </section>
    <div hidden={panel !== "SIMULATION"}>
      <TariffSimulation components={components} choices={bySeries} shipment={shipment} recommended={recommended} currency={currency}
        minimum={minimumSale} tiers={parsedTiers} routeTransport={routeTransport} />
    </div>
  </section>;
}

export default function PackagePricingAdmin({ view, authorization, packages, canManage, onUnauthorized, modes, services, catalogModes, onCreate }: Props) {
  const [rules, setRules] = useState<readonly CostingRule[]>([]);
  const [selectedRef, setSelectedRef] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState("");
  const [loadedAt, setLoadedAt] = useState(Date.now);
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
  }, [authorization, onUnauthorized]);

  function updateRule(rule: CostingRule, message: string) {
    setRules((current) => [rule, ...current.filter((item) => item.seriesRef !== rule.seriesRef)]);
    setLoadedAt(Math.max(Date.now(), Date.parse(rule.validFrom ?? "") || 0));
    setNotice(message);
  }
  function select(ref: string) {
    setSelectedRef(ref);
    setNotice("");
  }

  const published = packages.filter((pkg) => pkg.state === "PUBLISHED");
  const selected = published.find((pkg) => pkg.versionRef === selectedRef);
  const active = rules.filter((rule) => activeRule(rule, loadedAt)).sort((a, b) => b.version - a.version);
  const latest = active.filter((rule, index) => active.findIndex((item) => item.seriesRef === rule.seriesRef) === index);
  const choices = latest.filter((rule) => rule.unitCost != null && rule.family !== "CURRENCY_COMPENSATION" && !isPackagePricingRule(rule))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  const pricingByPackage = new Map(latest.filter(isPackagePricingRule).map((rule) => [rule.conditions?.packageVersionRef, rule]));
  const rule = pricingByPackage.get(selectedRef);
  const matches = published.filter((pkg) => filterBySearch([pkg.name, pkg.primary?.name, ...pkg.modes.map((mode) => mode.name)].join(" "), search));

  if (loading) return <p role="status" className="py-3 text-xs text-slate-600">Cargando tarifas y costos…</p>;
  if (error) return <p role="alert" className="py-3 text-xs text-red-800">No se pudo consultar el tarifario. Actualiza la configuración.</p>;
  return <div className="min-w-0 pt-1">
    {notice && <p role="status" className="py-1 text-xs font-semibold text-emerald-700">{notice}</p>}
    <div hidden={view !== "COSTS"}>
      <PackageCostTable authorization={authorization} costs={choices} currency={rule?.currency ?? "DOP"} canManage={canManage}
        onSaved={(saved) => updateRule(saved, "Costo guardado para nuevas cotizaciones.")} onUnauthorized={onUnauthorized} />
    </div>
    <section aria-label="Tarifario de servicios" hidden={view !== "PRICING"}>
      {selected ? <RecipeForm key={selected.versionRef + ":" + (rule?.version ?? 0)} pkg={selected} rule={rule} choices={choices}
        authorization={authorization} canManage={canManage} onBack={() => select("")}
        onSaved={(saved) => updateRule(saved, "Tarifa publicada para nuevas cotizaciones.")}
        onCostSaved={(saved) => updateRule(saved, "Costo guardado para nuevas cotizaciones.")} onUnauthorized={onUnauthorized} /> : <>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 py-1.5">
          <label className="relative flex min-w-40 max-w-sm flex-1 items-center">
            <Search aria-hidden="true" className="absolute left-2 size-4 text-slate-500" />
            <input aria-label="Buscar paquete" placeholder="Buscar paquete, modalidad o servicio" className={FIELD + " bg-white pl-8"}
              value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          {onCreate && <AdministrationIconAction label="Nuevo paquete" mobileLabel="Paquete" disabled={showCreate}
            onClick={() => setShowCreate(true)}><Plus aria-hidden="true" className="size-4" /></AdministrationIconAction>}
          <AdministrationHelp title="tarifario"><p>Abre un paquete existente o usa + para crearlo. Agrega los costos, fija el margen y el mínimo, y publica la tarifa para usarla en Comercial.</p></AdministrationHelp>
        </div>
        <div className={LIST}>
          <table aria-label="Paquetes y tarifas" className="w-full min-w-[610px] table-fixed text-left">
            <thead className={COMPACT_TABLE_HEAD}><tr>
              <th scope="col" className="w-[31%]">Paquete</th><th scope="col" className="w-[21%]">Modalidad</th><th scope="col" className="w-[25%]">Servicio principal</th>
              <th scope="col" className="w-[13%]">Tarifa</th><th scope="col"><span className="sr-only">Acciones</span></th>
            </tr></thead>
            <tbody className={COMPACT_TABLE_BODY}>
              {showCreate && onCreate && <NewTariffPackage modes={modes} services={services} catalogModes={catalogModes} onCreate={onCreate}
                onCreated={(pkg) => { select(pkg.versionRef); setShowCreate(false); }} onClose={() => setShowCreate(false)} onUnauthorized={onUnauthorized} />}
              {matches.map((pkg) => {
                const current = pricingByPackage.get(pkg.versionRef);
                return <tr key={pkg.versionRef} className="h-9 text-slate-700 hover:bg-slate-50">
                  <td><button type="button" className="min-h-8 text-left font-semibold text-[#003366] hover:underline" disabled={showCreate}
                    onClick={() => select(pkg.versionRef)}>{pkg.name}</button></td>
                  <td>{pkg.modes.map((mode) => mode.name).join(", ")}</td><td>{pkg.primary?.name ?? "—"}</td>
                  <td className={current ? "text-emerald-800" : "font-semibold text-amber-800"}>{current ? "Vigente · v" + current.version : "Sin tarifa"}</td>
                  <td className="text-right"><AdministrationIconAction label={(canManage ? "Editar tarifa de " : "Consultar tarifa de ") + pkg.name} className={ACTION} disabled={showCreate}
                    onClick={() => select(pkg.versionRef)}><Pencil aria-hidden="true" className="size-4" /></AdministrationIconAction></td>
                </tr>;
              })}
              {!matches.length && !showCreate && <tr><td colSpan={5} className="h-10 text-slate-600">{search.trim() ? "Sin coincidencias." : onCreate ? "Usa + para crear el primer paquete." : "Todavía no hay paquetes publicados."}</td></tr>}
            </tbody>
          </table>
        </div>
      </>}
    </section>
  </div>;
}
