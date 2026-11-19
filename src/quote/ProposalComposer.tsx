import { useRef, useState, type FormEvent } from "react";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NumericInput } from "@/components/ui/numeric-input";
import { COMPACT_FORM_FIELD } from "@/components/ui/compact-form";
import type { CostingLine, CostingRevision } from "@/costing/api";
import { pricingDecimal, pricingMoney, pricingQuantity } from "@/costing/pricingInput";
import { eligibleCostingLines } from "../../shared/quoteCostingSelection.js";
import { isPackageMinimumLine } from "../../shared/servicePackagePricing.js";
import { QuoteAdditionPicker, type AdditionalCharge } from "./QuoteAdditionPicker";
import { quoteApi } from "./api";

type Props = Readonly<{
  caseRef: string; authorization?: string; costing: CostingRevision; position: number;
  canConfirmCharges: boolean; defaultPayer?: string; autoOpen?: boolean; awaitingPackage?: boolean;
  errorText(code: string): string; onCreated(proposalRef: string): void;
}>;
type Adjustment = Readonly<{ quantity?: string; price?: string; removed?: boolean }>;
const FIELD = COMPACT_FORM_FIELD + " w-full bg-white";

function scaled(value: string, decimals: number) {
  const [units, fraction = ""] = value.split(".");
  return BigInt(units + fraction.padEnd(decimals, "0"));
}

function amountFor(quantity: string | null, unitAmount: string | null) {
  if (!quantity || !unitAmount) return null;
  const cents = (scaled(quantity, 4) * scaled(unitAmount, 2) + 5_000n) / 10_000n;
  if (cents >= 100_000_000_000n) return null;
  return String(cents / 100n) + "." + String(cents % 100n).padStart(2, "0");
}

function normalizeCharges(charges: readonly AdditionalCharge[], currency: string) {
  const lines = [];
  for (const charge of charges) {
    const quantity = pricingDecimal(charge.quantity, 4);
    const price = amountFor(quantity, pricingDecimal(charge.unitPrice, 2));
    const cost = charge.catalog ? null : amountFor(quantity, pricingDecimal(charge.unitCost, 2));
    if (price === null || !quantity || Number(quantity) <= 0 || Number(quantity) > 1_000_000 || !charge.catalog && cost === null) return null;
    lines.push({
      sourceKind: "MANUAL", costingLineRef: null, concept: charge.concept, quantity, unit: charge.unit,
      economicClass: charge.classification, quotedPrice: price, currency, reason: "Cargo adicional del caso",
      manualAuthority: charge.catalog ? {
        kind: "QUOTE_CATALOG_COMPONENT", reference: charge.catalog.ruleRef, version: charge.catalog.version,
        status: "CONFIRMED", capturedCost: null, suggestedPrice: null,
      } : {
        kind: "QUOTE_ADDITIONAL_CHARGE", reference: charge.id, version: 1, status: "CONFIRMED",
        capturedCost: cost, suggestedPrice: price,
      },
    });
  }
  return lines;
}

function priceKey(line: CostingLine, packageRef?: string) {
  if (!packageRef) return String(line.lineRef);
  return JSON.stringify([packageRef, line.logisticsItemRef ?? line.sourceRef ?? line.family, line.concept]);
}

function BaseRow({ line, adjustment, packageRef, canEdit, currency, onEdit }: {
  line: CostingLine; adjustment?: Adjustment; packageRef?: string; canEdit: boolean; currency: string; onEdit(value: Adjustment): void;
}) {
  const changed = Boolean(adjustment?.quantity || adjustment?.price);
  const unitPrice = Number(line.suggestedPrice) / Number(line.quantity);
  const quantity = adjustment?.quantity ?? line.quantity;
  const referencePrice = packageRef ? unitPrice : Number(line.suggestedPrice);
  const quoted = adjustment?.price != null
    ? packageRef ? amountFor(pricingDecimal(quantity, 4), pricingDecimal(adjustment.price, 2)) : pricingDecimal(adjustment.price, 6)
    : line.suggestedPrice === null ? null : Number(quantity) === Number(line.quantity) ? line.suggestedPrice : (unitPrice * Number(quantity)).toFixed(6);
  return <div className="grid grid-cols-[minmax(0,1fr)_6rem_minmax(0,7rem)_minmax(0,8rem)_auto] items-center gap-2 px-2 py-1.5 text-xs max-sm:flex max-sm:flex-wrap">
    <div className="min-w-32 flex-1">
      <p className="font-semibold">{line.concept}</p>
      <p className="text-slate-600">{line.unit}{adjustment?.removed ? " · Quitado" : changed && packageRef ? " · Ajustado" : ""}</p>
    </div>
    {adjustment?.removed ? <Button size="icon" type="button" variant="ghost" aria-label={"Restaurar " + line.concept} onClick={() => onEdit({ removed: false })}><RotateCcw aria-hidden="true" /></Button> : <>
      {packageRef && canEdit ? <NumericInput aria-label={"Cantidad de " + line.concept} className={FIELD + " w-24"} required allowDecimalComma min="0.0001" max={1_000_000} step="0.0001"
        value={quantity} onChange={(event) => onEdit({ quantity: event.target.value })} /> : <span className="text-slate-600">{quantity}</span>}
      <NumericInput aria-label={packageRef ? "Precio unitario de " + line.concept : "Precio cotizado " + line.concept} className={FIELD + " w-28 tabular-nums"}
        required readOnly={!canEdit} allowDecimalComma min={0} step={packageRef ? "0.01" : "0.000001"}
        value={adjustment?.price ?? referencePrice.toFixed(2)} onChange={(event) => onEdit({ price: event.target.value })} />
      <span className="whitespace-nowrap text-right font-semibold tabular-nums">{quoted === null ? "—" : pricingMoney(quoted, currency)}</span>
      {packageRef && canEdit && <Button size="icon" type="button" variant="ghost" aria-label={"Quitar " + line.concept} onClick={() => onEdit({ removed: true })}><Trash2 aria-hidden="true" /></Button>}
    </>}
  </div>;
}

export default function ProposalComposer({ caseRef, authorization, costing, position, canConfirmCharges, defaultPayer, autoOpen, awaitingPackage, errorText, onCreated }: Props) {
  const pkg = costing.packagePricing;
  const sourceLines = eligibleCostingLines(costing.lines).filter((line) => !pkg || !isPackageMinimumLine(line));
  const canEditBase = !pkg || canConfirmCharges && pkg.allowEdits !== false;
  const packageLabel = pkg ? pkg.name + " · " + pricingQuantity.format(pkg.measures.volumeM3) + " m³" : "";
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [name, setName] = useState("Propuesta " + position);
  const [payerName, setPayerName] = useState(defaultPayer ?? "");
  const [scope, setScope] = useState<string | null>(null);
  const [adjustments, setAdjustments] = useState<Record<string, Adjustment>>({});
  const [charges, setCharges] = useState<readonly AdditionalCharge[]>([]);
  const [showAdditions, setShowAdditions] = useState(false);
  const [reason, setReason] = useState("");
  const [approvalRef, setApprovalRef] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<{ key: string; id: string } | null>(null);
  const currency = costing.baseCurrency;
  const description = scope ?? packageLabel;
  const getAdjustment = (line: CostingLine) => canEditBase ? adjustments[priceKey(line, pkg?.versionRef)] : undefined;
  const updateAdjustment = (line: CostingLine, patch: Adjustment) => {
    const id = priceKey(line, pkg?.versionRef);
    setAdjustments((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  };

  const baseRows = sourceLines.flatMap((line) => {
    const draft = getAdjustment(line);
    if (draft?.removed) return [];
    const quantity = pricingDecimal(draft?.quantity ?? line.quantity, 4);
    const unitPrice = Number(line.suggestedPrice) / Number(line.quantity);
    const suggestion = Number(quantity) === Number(line.quantity) ? line.suggestedPrice! : (Number(quantity) * unitPrice).toFixed(6);
    const hasPriceOverride = draft?.price !== undefined && (!pkg || Number(draft.price.replace(",", ".")) !== Number(unitPrice.toFixed(2)));
    const quotedPrice = !hasPriceOverride ? suggestion
      : pkg ? amountFor(quantity, pricingDecimal(draft.price, 2)) : pricingDecimal(draft.price, 6);
    return [{ line, quantity, quotedPrice, suggestion, adjusted: Number(quantity) !== Number(line.quantity) || hasPriceOverride }];
  });
  const extraLines = normalizeCharges(charges, currency);
  const baseTotal = baseRows.reduce((sum, row) => sum + Number(row.quotedPrice), 0);
  const floor = Number(pkg?.minimumSale ?? 0);
  const payableBase = Math.max(baseTotal, floor);
  const extraTotal = (extraLines ?? []).reduce((sum, line) => sum + Number(line.quotedPrice), 0);
  const suggested = Math.max(floor, baseRows.reduce((sum, row) => sum + Number(row.suggestion), 0));
  const foregoneRevenue = Math.max(0, Number((suggested - payableBase).toFixed(6)));
  const modified = Boolean(pkg && (baseRows.length !== sourceLines.length || baseRows.some((row) => row.adjusted)));
  const currencyMismatch = charges.some((charge) => charge.catalog && charge.catalog.currency !== currency);
  const complete = Boolean(!awaitingPackage && !currencyMismatch && name.trim() && payerName.trim() && description.trim() && extraLines
    && baseRows.length && baseRows.every((row) => row.quotedPrice !== null && Number(row.quantity) > 0 && Number(row.quantity) <= 1_000_000)
    && (!modified || reason.trim()));
  const approvals = costing.overrides.filter((override) => override.authorization?.decision === "AUTHORIZED");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!complete || !extraLines || saving) return;
    const today = new Date();
    const valid = new Date(today);
    valid.setUTCDate(valid.getUTCDate() + 30);
    const payload = {
      caseRef, costingRevisionRef: costing.revisionRef, position, proposalName: name.trim(), currency,
      issueDate: today.toISOString().slice(0, 10), validUntil: valid.toISOString().slice(0, 10),
      commercialContext: { company: null, leadAccount: null, booker: null, tariff: null, associations: [], referral: null, commissionContext: null },
      payer: { kind: "AUTHORIZED_ENTITY", reference: "payer-explicit-" + position, displayName: payerName.trim(), sourceVersion: 1, validFrom: null, validUntil: null, conditions: null },
      terms: { paymentTerms: "Según propuesta comercial", scope: description.trim(), exclusions: [], clientNotes: null, specialConditions: [], templateRef: null, templateVersion: null },
      exchange: null, discount: null, marginAuthorizationRef: approvals.some((item) => item.authorization?.authorizationRef === approvalRef) ? approvalRef : null,
      ...(modified && { packageAdjustmentReason: reason.trim() }),
      lines: [...baseRows.map(({ line, quantity, quotedPrice }) => ({
        sourceKind: "COSTING", costingLineRef: line.lineRef, concept: line.concept, quantity: pkg ? quantity : line.quantity,
        unit: line.unit, economicClass: line.classification, quotedPrice, currency, reason: null, manualAuthority: null,
      })), ...extraLines],
    };
    const key = JSON.stringify(payload);
    if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
    setSaving(true);
    setError("");
    try {
      const proposal = await quoteApi.create(authorization, payload, request.current.id);
      onCreated(proposal.proposalRef);
    } catch (cause) { setError(errorText(cause instanceof Error ? cause.message : "QUOTE_REQUEST_FAILED")); }
    finally { setSaving(false); }
  }

  if (!sourceLines.length) return <p className="p-2 text-xs text-slate-600">El cálculo no tiene renglones cotizables.</p>;
  if (!open && (!autoOpen || dismissed === costing.revisionRef)) return <Button size="sm" onClick={() => setOpen(true)}><Plus aria-hidden="true" />Nueva propuesta {position}</Button>;
  const base = <div className="divide-y">{sourceLines.map((line) => <BaseRow key={line.lineRef} line={line} adjustment={getAdjustment(line)}
    packageRef={pkg?.versionRef} canEdit={canEditBase} currency={currency} onEdit={(patch) => updateAdjustment(line, patch)} />)}</div>;
  return <>
    <form onSubmit={(event) => void submit(event)} className="min-w-0 rounded-lg border border-sky-200 bg-sky-50 p-3">
      <fieldset disabled={saving}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-[#003366]">{pkg ? packageLabel : "Propuesta " + position}</h3>
          <Button type="button" variant="outline" size="sm" disabled={baseRows.length + charges.length >= 119} onClick={() => setShowAdditions(true)}><Plus aria-hidden="true" />Agregar</Button>
        </div>
        {pkg ? <section aria-label="Cargos del paquete" className="mt-2 rounded border bg-white">
          <div className="grid grid-cols-[minmax(0,1fr)_6rem_7rem_8rem_2rem] gap-2 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-600 max-sm:hidden">
            <span>Concepto</span><span>Cantidad</span><span>Precio unit.</span><span className="text-right">Importe</span>
          </div>
          {base}
        </section> : <details className="mt-2 rounded border bg-white">
          <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-[#003366]">Revisar detalle y precios</summary>
          {base}
        </details>}
        {charges.length > 0 && <section aria-label="Cargos adicionales" className="mt-2 divide-y rounded border bg-white">
          {charges.map((charge, index) => {
            const label = "adicional " + (index + 1);
            const update = (patch: Partial<AdditionalCharge>) => setCharges((current) => current.map((item) => item.id === charge.id ? { ...item, ...patch } : item));
            const total = amountFor(pricingDecimal(charge.quantity, 4), pricingDecimal(charge.unitPrice, 2));
            return <div key={charge.id} className="grid grid-cols-[minmax(0,1fr)_6rem_7rem_8rem_auto] items-center gap-2 px-2 py-1.5 text-xs max-sm:flex max-sm:flex-wrap">
              <div className="min-w-32 flex-1"><p className="font-semibold">{charge.concept}</p><p className="text-sky-800">Adicional · {charge.unit}</p></div>
              <NumericInput aria-label={"Cantidad " + label} className={FIELD + " w-24"} required allowDecimalComma min="0.0001" max={1_000_000} step="0.0001" value={charge.quantity} onChange={(event) => update({ quantity: event.target.value })} />
              <NumericInput aria-label={"Venta unitaria " + label} className={FIELD + " w-28"} required readOnly={!canConfirmCharges} allowDecimalComma min={0} step="0.01" value={charge.unitPrice} onChange={(event) => update({ unitPrice: event.target.value })} />
              <span className="text-right font-semibold tabular-nums">{total === null ? "—" : pricingMoney(total, currency)}</span>
              <Button type="button" size="icon" variant="ghost" aria-label={"Quitar " + label} onClick={() => setCharges((current) => current.filter((row) => row.id !== charge.id))}><Trash2 aria-hidden="true" /></Button>
            </div>;
          })}
        </section>}
        <div className="mt-3 flex flex-wrap items-start justify-between gap-2">
          <details className="min-w-52 flex-1 rounded border bg-white px-2 py-1.5" open={!pkg}>
            <summary className="cursor-pointer text-xs font-semibold">Datos de la propuesta</summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="text-xs font-semibold">Nombre<input className={FIELD} required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label>
              <label className="text-xs font-semibold">Responsable del pago<input className={FIELD} required value={payerName} onChange={(event) => setPayerName(event.target.value)} /></label>
              <label className="text-xs font-semibold sm:col-span-2">Alcance<input className={FIELD} required value={description} onChange={(event) => setScope(event.target.value)} /></label>
            </div>
          </details>
          <dl aria-label="Totales de la propuesta" className="min-w-56 space-y-1 rounded border bg-white px-3 py-2 text-xs tabular-nums">
            {floor > baseTotal && <div className="flex justify-between gap-3 text-amber-800"><dt>Ajuste al mínimo</dt><dd>{pricingMoney(floor - baseTotal, currency)}</dd></div>}
            <div className="flex justify-between gap-3"><dt>{pkg ? "Paquete" : "Base"}</dt><dd>{pricingMoney(payableBase, currency)}</dd></div>
            <div className="flex justify-between gap-3"><dt>Adicionales</dt><dd>{extraLines ? pricingMoney(extraTotal, currency) : "Pendiente"}</dd></div>
            <div className="flex justify-between gap-3 border-t pt-1 text-sm font-bold text-[#003366]"><dt>Total propuesta</dt><dd>{extraLines ? pricingMoney(payableBase + extraTotal, currency) : "Pendiente"}</dd></div>
          </dl>
        </div>
        {modified && <label className="mt-2 block text-xs font-semibold">Motivo del ajuste<input className={FIELD} required maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></label>}
        {!payerName.trim() && pkg && <p className="mt-2 text-xs text-slate-700">Completa el responsable del pago en Datos de la propuesta.</p>}
        {currencyMismatch && <p role="alert" className="mt-2 text-xs text-amber-900">Selecciona los adicionales en la moneda del paquete.</p>}
        {awaitingPackage && <p role="status" className="mt-2 text-xs text-amber-900">Aplica el paquete para actualizar el volumen y el mínimo.</p>}
        {foregoneRevenue >= 0.01 && <div className="mt-2 text-xs text-amber-900">
          <p>Descuento respecto al sugerido {pricingMoney(foregoneRevenue, currency)}. Requiere autorización de Administración para publicar.</p>
          {approvals.length > 0 && <label className="block max-w-sm">Autorización<select className={FIELD} value={approvalRef} onChange={(event) => setApprovalRef(event.target.value)}>
            <option value="">Seleccionar</option>{approvals.map((item) => <option key={item.overrideRef} value={item.authorization!.authorizationRef}>{item.authorization!.reason}</option>)}
          </select></label>}
        </div>}
        {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <Button size="sm" type="button" variant="outline" onClick={() => { setOpen(false); setDismissed(costing.revisionRef); }}>Cancelar</Button>
          <Button size="sm" type="submit" disabled={saving || !complete}>{saving ? "Guardando…" : "Crear propuesta"}</Button>
        </div>
      </fieldset>
    </form>
    {showAdditions && <QuoteAdditionPicker caseRef={caseRef} currency={currency} authorization={authorization} canAddManual={canConfirmCharges} onClose={() => setShowAdditions(false)}
      onSelect={(charge) => { setCharges((current) => [...current, charge]); setShowAdditions(false); }} />}
  </>;
}
