import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NumericInput } from "@/components/ui/numeric-input";
import { COMPACT_FORM_FIELD, COMPACT_TABLE_FIELD } from "@/components/ui/compact-form";
import type { CostingLine, CostingPackageOption, CostingRevision } from "@/costing/api";
import type { PlanPricedAddition } from "@/crm-services/planPricedAdditions";
import { catalogAmountCents, pricingDecimal, pricingMoney, pricingVolume } from "@/costing/pricingInput";
import { eligibleCostingLines } from "../../shared/quoteCostingSelection.js";
import { isPackageMinimumLine } from "../../shared/servicePackagePricing.js";
import { QuoteAdditionPicker, type AdditionalCharge } from "./QuoteAdditionPicker";
import { quoteApi, type QuoteLine, type QuoteProposal } from "./api";

type Props = Readonly<{
  caseRef: string;
  authorization?: string;
  costing: CostingRevision | null;
  position: number;
  canConfirmCharges: boolean;
  defaultPayer?: string;
  autoOpen?: boolean;
  awaitingPackage?: boolean;
  packages?: readonly CostingPackageOption[];
  selectedPackageVersionRef?: string;
  currency?: string;
  currencyOptions?: readonly string[];
  suggestedGroupName?: string;
  proposal?: QuoteProposal;
  planAdditions?: readonly PlanPricedAddition[];
  extraControls?: ReactNode;
  onCurrencyChange?(currency: string): void;
  onSelectPackage?(option: CostingPackageOption): void;
  onRemovePackage?(): void;
  onClose?(): void;
  errorText(code: string): string;
  onCreated(proposalRef: string): void;
}>;
type Adjustment = Readonly<{ quantity?: string; price?: string; removed?: boolean }>;
type ChargeState = Readonly<{ basis: string | null; rows: readonly AdditionalCharge[]; included: readonly AdditionalCharge[] }>;
const FIELD = COMPACT_FORM_FIELD + " w-full";
const CELL = COMPACT_TABLE_FIELD + " text-right tabular-nums";
const ROW = "grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_2rem] items-center gap-1 px-2 py-0.5 text-xs sm:grid-cols-[minmax(0,1fr)_6rem_8rem_8rem_2rem]";
const CONCEPT = "min-w-0 break-words max-sm:col-span-4";
const MOBILE_LABEL = "block text-slate-600 sm:hidden";
const DEFAULT_CONTEXT = { company: null, leadAccount: null, booker: null, tariff: null, associations: [], referral: null, commissionContext: null };
const PLAN_ADDITION_REASON = "Necesidad adicional del plan";
const DEFAULT_TERMS = { paymentTerms: "Según propuesta comercial", scope: "", exclusions: [], clientNotes: null, specialConditions: [], templateRef: null, templateVersion: null };

function scaled(value: string, decimals: number) {
  const [units, fraction = ""] = value.split(".");
  return BigInt(units + fraction.padEnd(decimals, "0"));
}

function moneyFromCents(cents: bigint) {
  if (cents >= 100_000_000_000n) return null;
  return String(cents / 100n) + "." + String(cents % 100n).padStart(2, "0");
}

function amountFor(quantity: string | null, unitAmount: string | null) {
  if (!quantity || !unitAmount) return null;
  return moneyFromCents((scaled(quantity, 6) * scaled(unitAmount, 2) + 500_000n) / 1_000_000n);
}

function priorAmount(quantity: string, oldQuantity: string, oldAmount: string) {
  if (Number(quantity) === Number(oldQuantity)) return oldAmount;
  const denominator = scaled(oldQuantity, 6) * 10_000n;
  const numerator = scaled(quantity, 6) * scaled(oldAmount, 6);
  return moneyFromCents((numerator + denominator / 2n) / denominator);
}

function decimalEntry(value: string, digits: number, format: (number: number) => string) {
  const accepted = pricingDecimal(value, digits);
  return accepted === null ? value : format(Number(accepted));
}

function normalizeCharges(charges: readonly AdditionalCharge[], currency: string) {
  const lines = [];
  for (const charge of charges) {
    const quantity = pricingDecimal(charge.quantity, 6);
    if (!quantity || Number(quantity) <= 0 || Number(quantity) > 1_000_000) return null;
    const unitPrice = pricingDecimal(charge.unitPrice, 2);
    const catalogCents = charge.catalog ? catalogAmountCents(quantity, charge.catalog.unitPrice) : null;
    const catalogAmount = catalogCents === null ? null : moneyFromCents(catalogCents);
    const usesCatalogPrice = charge.catalog && Number(pricingDecimal(charge.unitPrice, 10) ?? NaN) === Number(charge.catalog.unitPrice);
    const retained = charge.prior && (unitPrice === null ? charge.unitPrice === charge.prior.unitPrice : Number(unitPrice) === Number(charge.prior.unitPrice));
    const quotedPrice = retained && charge.prior
      ? charge.prior.quotedPrice === null ? null : priorAmount(quantity, charge.prior.quantity, charge.prior.quotedPrice)
      : usesCatalogPrice ? catalogAmount : amountFor(quantity, unitPrice);
    const cost = charge.catalog || charge.prior ? null : amountFor(quantity, pricingDecimal(charge.unitCost, 2));
    const suggestedRate = charge.catalog?.unitPrice ?? charge.suggestedUnitPrice;
    const suggested = charge.catalog ? catalogAmount : suggestedRate ? amountFor(quantity, pricingDecimal(suggestedRate, 2)) : quotedPrice;
    if (quotedPrice === null && !(retained && charge.prior?.quotedPrice === null)
      || !charge.catalog && !charge.prior && cost === null) return null;
    lines.push({
      input: {
        sourceKind: "MANUAL", costingLineRef: null, concept: charge.concept, quantity, unit: charge.unit,
        economicClass: charge.classification, quotedPrice, currency, reason: charge.planAddition ? PLAN_ADDITION_REASON : "Concepto de la propuesta",
        ...(charge.prior && { lineRef: charge.prior.lineRef }),
        manualAuthority: charge.prior ? null : charge.catalog ? {
          kind: "QUOTE_CATALOG_COMPONENT", reference: charge.catalog.ruleRef, version: charge.catalog.version,
          status: "CONFIRMED", capturedCost: null, suggestedPrice: null,
        } : {
          kind: "QUOTE_ADDITIONAL_CHARGE", reference: charge.id, version: 1, status: "CONFIRMED",
          capturedCost: cost, suggestedPrice: suggested,
        },
      },
      suggested,
    });
  }
  return lines;
}

function priceKey(line: CostingLine, packageRef?: string) {
  if (!packageRef) return String(line.lineRef);
  return JSON.stringify([packageRef, line.logisticsItemRef ?? line.sourceRef ?? line.family, line.concept]);
}

function quantityText(value: number) {
  return String(Number(value.toFixed(6)));
}

function includedKey(ruleRef: string, version: number, unit: string, currency: string) {
  return JSON.stringify([ruleRef, version, unit, currency]);
}

function changeCombination(state: ChargeState, basis: string | null, preview: CostingRevision | null, sourceLines: readonly CostingLine[]): ChargeState {
  const available = new Map<string, number>();
  const packageRef = preview?.packagePricing?.versionRef;
  if (packageRef) {
    for (const line of sourceLines) {
      if (!line.sourceRef || line.sourceVersion == null) continue;
      const key = includedKey(line.sourceRef, line.sourceVersion, line.unit, preview.baseCurrency);
      available.set(key, (available.get(key) ?? 0) + Number(line.quantity));
    }
  }
  const rows: AdditionalCharge[] = [];
  const included: AdditionalCharge[] = [];
  for (const draft of [...state.rows, ...state.included]) {
    const { catalog } = draft;
    // Solo absorbe selecciones anteriores de la misma tarifa. Una cantidad adicional
    // que el vendedor añadió con la combinación aplicada sigue siendo un adicional.
    if (draft.planAddition || !packageRef || !catalog || draft.addedDuringPackage === packageRef
      || Number(pricingDecimal(draft.unitPrice, 10) ?? NaN) !== Number(catalog.unitPrice)) {
      rows.push(draft);
      continue;
    }
    const key = includedKey(catalog.ruleRef, catalog.version, draft.unit, catalog.currency);
    const remaining = available.get(key) ?? 0;
    const quantity = Number(pricingDecimal(draft.quantity, 6) ?? NaN);
    if (!remaining || !Number.isFinite(quantity) || quantity <= 0) {
      rows.push(draft);
      continue;
    }
    const overlap = Math.min(quantity, remaining);
    available.set(key, Number((remaining - overlap).toFixed(6)));
    if (quantity > overlap) {
      rows.push({ ...draft, quantity: quantityText(quantity - overlap) });
      included.push({ ...draft, id: draft.id + "-included", quantity: quantityText(overlap) });
    } else included.push(draft);
  }
  return { basis, rows, included };
}

function initialCharges(proposal: QuoteProposal | undefined, packageRef?: string): readonly AdditionalCharge[] {
  return (proposal?.lines ?? []).filter((line) => line.sourceKind === "MANUAL" && !line.packageMinimum).map((line) => {
    const unitPrice = line.quotedPrice === null ? "" : (Number(line.quotedPrice) / Number(line.quantity)).toFixed(2);
    return {
      id: line.lineRef, concept: line.concept, quantity: line.quantity, unit: line.unit,
      unitCost: "", unitPrice, classification: line.economicClass, addedDuringPackage: packageRef,
      planAddition: Boolean(line.catalog && line.reason === PLAN_ADDITION_REASON),
      ...(line.catalog && { catalog: { ...line.catalog, currency: line.currency } }),
      prior: { lineRef: line.lineRef, quantity: line.quantity, quotedPrice: line.quotedPrice, unitPrice },
    };
  });
}

function initialAdjustments(proposal: QuoteProposal | undefined, sourceLines: readonly CostingLine[], packageRef?: string) {
  if (!proposal) return {};
  const original = new Map(proposal.lines.filter((line) => line.sourceKind === "COSTING" && !line.packageMinimum).map((line) => [line.costingLineRef, line]));
  const adjustments: Record<string, Adjustment> = {};
  for (const line of sourceLines) {
    const prior = original.get(line.lineRef);
    const key = priceKey(line, packageRef);
    if (!prior) adjustments[key] = { removed: true };
    else if (prior.quotedPrice !== null) {
      adjustments[key] = {
        quantity: prior.quantity,
        price: packageRef ? (Number(prior.quotedPrice) / Number(prior.quantity)).toFixed(2) : prior.quotedPrice,
      };
    }
  }
  return adjustments;
}

function NumberField({ label, mobileLabel, value, edit, minimum = 0, precision, priceTone }: {
  label: string; mobileLabel: string; value: string; edit?: (value: string) => void;
  minimum?: number; precision: number; priceTone?: string;
}) {
  const format = (number: number) => precision <= 2 ? number.toFixed(precision) : String(number);
  return <div className="min-w-0">
    <span className={MOBILE_LABEL} aria-hidden="true">{mobileLabel}</span>
    {edit ? <NumericInput aria-label={label} className={CELL + (priceTone ? " " + priceTone : "")}
      value={value} onChange={(event) => edit(event.target.value)}
      onBlur={(event) => edit(decimalEntry(event.target.value, precision, format))}
      allowDecimalComma min={minimum} max={minimum ? 1_000_000 : undefined}
      step={10 ** -precision} required /> : <span className={"block px-1.5 py-2 text-right tabular-nums " + (priceTone ?? "text-slate-700")}>{value || "—"}</span>}
  </div>;
}

function priceTreatment(value: number, regular: number) {
  return value < regular ? { color: "text-red-700", detail: value === 0 ? "Bonificado" : "Precio reducido" }
    : value > regular ? { color: "text-[#0070a8]", detail: "Precio aumentado" } : null;
}

function Amount({ value, currency }: { value: string | null; currency: string }) {
  return <div className="min-w-0 break-words px-1.5 text-right font-semibold tabular-nums">
    <span className={MOBILE_LABEL} aria-hidden="true">Importe</span>{value === null ? "—" : pricingMoney(value, currency)}
  </div>;
}

export default function ProposalComposer({ caseRef, authorization, costing, position, canConfirmCharges, defaultPayer,
  autoOpen, awaitingPackage, packages, selectedPackageVersionRef, currency: directCurrency = "DOP", currencyOptions,
  suggestedGroupName, proposal, planAdditions, extraControls, onCurrencyChange, onSelectPackage,
  onRemovePackage, onClose, errorText, onCreated }: Props) {
  const pkg = costing?.packagePricing;
  const basis = costing?.revisionRef ?? null;
  const sourceLines = eligibleCostingLines(costing?.lines ?? []).filter((line) => !isPackageMinimumLine(line));
  const packageLabel = pkg ? pkg.name + " · " + pricingVolume.format(pkg.measures.volumeM3) + " m³" : "";
  const canEditIncluded = Boolean(pkg && canConfirmCharges && pkg.allowEdits !== false);
  const canEditBasePrice = pkg ? canEditIncluded : canConfirmCharges;
  const [open, setOpen] = useState(Boolean(proposal));
  const [dismissed, setDismissed] = useState(false);
  const [name, setName] = useState(proposal?.proposalName ?? "Propuesta " + position);
  const [dates, setDates] = useState(() => {
    const today = new Date();
    const valid = new Date(today);
    valid.setUTCDate(valid.getUTCDate() + 30);
    return {
      issueDate: proposal?.issueDate ?? today.toISOString().slice(0, 10),
      validUntil: proposal?.validUntil ?? valid.toISOString().slice(0, 10),
    };
  });
  const [payerName, setPayerName] = useState(proposal?.payer.displayName ?? defaultPayer ?? "");
  const [groupName, setGroupName] = useState(proposal?.groupName ?? proposal?.terms?.groupName ?? suggestedGroupName ?? "");
  const [scope, setScope] = useState<string | null>(proposal?.terms?.scope ?? null);
  const [adjustments, setAdjustments] = useState(() => initialAdjustments(proposal, sourceLines, pkg?.versionRef));
  const [chargeState, setChargeState] = useState<ChargeState>(() => {
    if (proposal) return { basis, rows: initialCharges(proposal, pkg?.versionRef), included: [] };
    const rows = (planAdditions ?? []).map((item) => ({
      id: item.ruleRef, concept: item.name, quantity: item.quantity.replace(",", "."), unit: item.unit,
      unitCost: "", unitPrice: item.unitPrice, classification: item.classification, catalog: item, planAddition: true,
    }));
    return changeCombination({ basis: null, rows, included: [] }, basis, costing, sourceLines);
  });
  const [reason, setReason] = useState(proposal?.packageScope?.adjustmentReason ?? "");
  const [approvalRef, setApprovalRef] = useState(proposal?.marginAuthorization?.authorizationRef ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<{ key: string; id: string } | null>(null);
  const currency = costing?.baseCurrency ?? proposal?.currency ?? directCurrency;
  const description = scope?.trim() || groupName.trim() || packageLabel || "Servicios y productos de la propuesta";
  if (chargeState.basis !== basis) {
    setChargeState(changeCombination(chargeState, basis, costing, sourceLines));
  }
  const charges = chargeState.rows;
  const setCharges = (update: (current: readonly AdditionalCharge[]) => readonly AdditionalCharge[]) =>
    setChargeState((current) => ({ ...current, rows: update(current.rows) }));
  const original = new Map<string, QuoteLine>((proposal?.lines ?? []).flatMap((line) =>
    line.costingLineRef ? [[line.costingLineRef, line]] : []));

  const baseRows = sourceLines.map((line) => {
    const key = priceKey(line, pkg?.versionRef);
    const draft = adjustments[key];
    const prior = original.get(line.lineRef ?? "");
    const sourceQuantity = Number(line.quantity);
    const suggested = line.suggestedPrice!;
    const regularPrice = pkg ? Number(suggested) / sourceQuantity : Number(suggested);
    const quantity = pricingDecimal(draft?.quantity ?? line.quantity, 6);
    const price = draft?.price ?? regularPrice.toFixed(2);
    const priorPrice = prior?.quotedPrice == null ? null : pkg
      ? (Number(prior.quotedPrice) / Number(prior.quantity)).toFixed(2) : prior.quotedPrice;
    const suggestion = quantity && Number(quantity) !== sourceQuantity ? (Number(quantity) * regularPrice).toFixed(6) : suggested;
    const hasPriceOverride = draft?.price !== undefined && Number(pricingDecimal(price, pkg ? 2 : 6) ?? NaN) !== Number(regularPrice.toFixed(2));
    const quotedPrice = prior && priorPrice !== null && quantity && Number(quantity) === Number(prior.quantity)
      && pricingDecimal(price, pkg ? 2 : 6) !== null && Number(price.replace(",", ".")) === Number(priorPrice)
      ? prior.quotedPrice : !hasPriceOverride ? suggestion
        : pkg ? amountFor(quantity, pricingDecimal(price, 2)) : pricingDecimal(price, 6);
    return { line, key, draft, quantity, price, quotedPrice, suggestion, regularPrice, adjusted: Number(quantity) !== sourceQuantity || hasPriceOverride };
  });
  const presentBase = baseRows.filter((row) => !row.draft?.removed);
  const extraLines = normalizeCharges(charges, currency);
  const count = presentBase.length + charges.length;
  const maxLines = pkg ? 119 : 120;
  const canAddCharge = count < maxLines;
  const included = new Map<string, number>();
  if (pkg) {
    for (const { line, quantity } of presentBase) {
      if (line.sourceRef && quantity) included.set(line.sourceRef, (included.get(line.sourceRef) ?? 0) + Number(quantity));
    }
  }
  const baseTotal = presentBase.reduce((sum, row) => sum + Number(row.quotedPrice), 0);
  const floor = Number(pkg?.minimumSale ?? 0);
  const payableBase = Math.max(baseTotal, floor);
  const extraTotal = (extraLines ?? []).reduce((sum, line) => sum + Number(line.input.quotedPrice), 0);
  const suggested = Math.max(floor, presentBase.reduce((sum, row) => sum + Number(row.suggestion), 0))
    + (extraLines ?? []).reduce((sum, line) => sum + Number(line.suggested), 0);
  const existingDiscount = Number(proposal?.totals.discountAmount ?? 0);
  const total = Math.max(0, payableBase + extraTotal - existingDiscount);
  const foregoneRevenue = Math.max(0, Number((suggested - total).toFixed(6)));
  const modified = Boolean(pkg && (presentBase.length !== sourceLines.length || presentBase.some((row) => row.adjusted)));
  const currencyMismatch = charges.some((charge) => charge.catalog && charge.catalog.currency !== currency);
  const complete = Boolean(!awaitingPackage && !currencyMismatch && name.trim() && payerName.trim() && extraLines
    && dates.validUntil >= dates.issueDate
    && count > 0 && count <= maxLines && (!pkg || presentBase.length > 0)
    && presentBase.every((row) => row.quotedPrice !== null && Number(row.quantity) > 0 && Number(row.quantity) <= 1_000_000)
    && (!modified || reason.trim()));
  const approvals = (costing?.overrides ?? []).flatMap((override) =>
    override.authorization?.decision === "AUTHORIZED" ? [override.authorization] : []);

  function updateAdjustment(key: string, patch: Adjustment) {
    setAdjustments((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  }
  function addCharge(charge: AdditionalCharge) {
    setCharges((current) => {
      const existing = charge.catalog && current.find((row) => !row.planAddition && row.catalog?.ruleRef === charge.catalog?.ruleRef
        && row.catalog?.version === charge.catalog?.version && row.catalog?.currency === charge.catalog?.currency
        && row.addedDuringPackage === pkg?.versionRef
        && Number(pricingDecimal(row.unitPrice, 2) ?? NaN) === Number(charge.unitPrice));
      const quantity = existing && pricingDecimal(existing.quantity, 6);
      if (existing && quantity && Number(quantity) <= 999_999) {
        return current.map((row) => row.id === existing.id ? { ...row, quantity: quantityText(Number(quantity) + 1) } : row);
      }
      return presentBase.length + current.length < maxLines
        ? [...current, { ...charge, addedDuringPackage: pkg?.versionRef }] : current;
    });
  }
  function revisePayloadContext() {
    if (!proposal) return DEFAULT_CONTEXT;
    const withConditions = (person: typeof proposal.commercialContext.company) =>
      person ? { ...person, conditions: "conditions" in person ? person.conditions : null } : null;
    const context = proposal.commercialContext;
    return {
      ...context, company: withConditions(context.company), leadAccount: withConditions(context.leadAccount),
      booker: withConditions(context.booker), tariff: withConditions(context.tariff), referral: withConditions(context.referral),
    };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!complete || !extraLines || saving) return;
    const payload = {
      caseRef, costingRevisionRef: basis, position, proposalName: name.trim(), currency,
      ...dates,
      commercialContext: revisePayloadContext(),
      payer: {
        kind: "AUTHORIZED_ENTITY", reference: "payer-explicit-" + position, sourceVersion: 1, validFrom: null, validUntil: null,
        ...proposal?.payer, displayName: payerName.trim(), conditions: proposal?.payer.conditions ?? null,
      },
      terms: { ...DEFAULT_TERMS, ...proposal?.terms, scope: description, groupName: groupName.trim() || null },
      exchange: proposal?.exchange ?? null, discount: proposal?.discount ?? null,
      marginAuthorizationRef: approvals.some((item) => item.authorizationRef === approvalRef) ? approvalRef : proposal?.marginAuthorization?.authorizationRef ?? null,
      ...(modified && { packageAdjustmentReason: reason.trim() }),
      lines: [...presentBase.map(({ line, quantity, quotedPrice }) => ({
        sourceKind: "COSTING", costingLineRef: line.lineRef, concept: line.concept, quantity: pkg ? quantity : line.quantity,
        unit: line.unit, economicClass: line.classification, quotedPrice, currency, reason: null, manualAuthority: null,
      })), ...extraLines.map(({ input }) => input)],
      ...(proposal && { proposalRef: proposal.proposalRef, expectedRevision: proposal.revision }),
    };
    const key = JSON.stringify(payload);
    if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
    setSaving(true);
    setError("");
    try {
      const mutation = proposal ? quoteApi.revise : quoteApi.create;
      const updated = await mutation(authorization, payload, request.current.id);
      onCreated(updated.proposalRef);
    } catch (cause) { setError(errorText(cause instanceof Error ? cause.message : "QUOTE_REQUEST_FAILED")); }
    finally { setSaving(false); }
  }

  if (!open && (!autoOpen || dismissed)) return <Button size="sm" onClick={() => { setOpen(true); setDismissed(false); }}>
    <Plus aria-hidden="true" />Nueva propuesta {position}
  </Button>;

  const matchingPackages = charges.length ? packages?.filter((item) => item.currency === currency) : packages;
  return <form onSubmit={(event) => void submit(event)} className="min-w-0 space-y-2 text-slate-900" aria-label={proposal ? "Revisar propuesta" : "Nueva propuesta"}>
    <fieldset disabled={saving} className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <h3 className="text-sm font-bold text-[#003366]">{proposal ? "Revisar propuesta" : "Nueva propuesta " + position}</h3>
        <span className="text-xs text-slate-600">{currency}</span>
      </div>

      <QuoteAdditionPicker key={currency} caseRef={caseRef} currency={currency} authorization={authorization}
        included={included} packages={matchingPackages} selectedPackageVersionRef={selectedPackageVersionRef}
        packageRef={pkg?.versionRef} canAddManual={canConfirmCharges}
        disabled={!canAddCharge || Boolean(awaitingPackage)} onSelect={addCharge} onSelectPackage={onSelectPackage} />
      {extraControls}

      <div className="flex flex-wrap items-center justify-between gap-1">
        <label className="flex min-w-40 flex-1 items-center gap-1 sm:max-w-sm">
          <span className="sr-only">Nombre del grupo</span>
          <Pencil className="size-3.5 shrink-0 text-slate-500" aria-hidden="true" />
          <input className={COMPACT_TABLE_FIELD + " text-sm font-semibold"} placeholder={pkg?.name ?? "Nombre del grupo"}
            value={groupName} maxLength={120} onChange={(event) => setGroupName(event.target.value)} />
        </label>
        {pkg && <div className="flex max-w-full items-center gap-1 text-xs text-slate-700">
          <span className="min-w-0 break-words">{packageLabel}</span>
          {onRemovePackage && <Button type="button" size="icon" variant="ghost" className="size-8 shrink-0"
            disabled={awaitingPackage} aria-label="Quitar combinación" onClick={onRemovePackage}><X aria-hidden="true" /></Button>}
        </div>}
      </div>
      <section aria-label="Renglones de la propuesta" className="divide-y divide-slate-200 border-y border-slate-200">
        <div className={ROW + " hidden bg-slate-100 py-1.5 font-semibold text-slate-600 sm:grid"} aria-hidden="true">
          <span>Concepto</span><span className="text-right">Cant.</span><span className="text-right">{costing && !pkg ? "Precio cotizado" : "Precio unit."}</span><span className="px-1.5 text-right">Importe</span>
        </div>
        {baseRows.map(({ line, key, draft, price, quotedPrice, regularPrice }) => {
          const treatment = priceTreatment(Number(pricingDecimal(price, pkg ? 2 : 6) ?? NaN), Number(regularPrice.toFixed(2)));
          return <div key={line.lineRef} className={ROW}>
            <div className={CONCEPT}><p className="font-semibold">{line.concept}</p>
              <span className="text-slate-600">{line.unit}{draft?.removed ? " · Quitado" : ""}</span>
              {treatment && !draft?.removed && <span className={"ml-1 " + treatment.color}>{treatment.detail}</span>}
            </div>
            {draft?.removed ? <Button aria-label={"Restaurar " + line.concept} type="button" size="icon" variant="ghost"
              className="col-start-4 size-8 sm:col-start-5" onClick={() => updateAdjustment(key, { removed: false })}><RotateCcw aria-hidden="true" /></Button> : <>
              <NumberField label={"Cantidad de " + line.concept} mobileLabel="Cant." precision={6} minimum={0.000001}
                value={draft?.quantity ?? line.quantity} edit={canEditIncluded ? (quantity) => updateAdjustment(key, { quantity }) : undefined} />
              <NumberField label={(pkg ? "Precio unitario de " : "Precio cotizado ") + line.concept}
                mobileLabel={pkg ? "Precio unit." : "Precio cotizado"} precision={pkg ? 2 : 6} value={price}
                edit={canEditBasePrice ? (next) => updateAdjustment(key, { price: next }) : undefined} priceTone={treatment?.color} />
              <Amount value={quotedPrice} currency={currency} />
              {canEditIncluded && <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={"Quitar " + line.concept}
                onClick={() => updateAdjustment(key, { removed: true })}><Trash2 aria-hidden="true" /></Button>}
            </>}
          </div>;
        })}
        {charges.map((charge, index) => {
          const update = (patch: Partial<AdditionalCharge>) => setCharges((current) => current.map((item) => item.id === charge.id ? { ...item, ...patch } : item));
          const regularPrice = charge.catalog?.unitPrice ?? charge.suggestedUnitPrice;
          const treatment = regularPrice ? priceTreatment(Number(pricingDecimal(charge.unitPrice, 2) ?? NaN), Number(regularPrice)) : null;
          const label = "adicional " + (index + 1);
          const pendingPrice = charge.prior?.quotedPrice === null;
          return <div key={charge.id} className={ROW}>
            <div className={CONCEPT}><p className="font-semibold">{charge.concept}</p>
              <span className="text-slate-600">{charge.planAddition ? "Adicional del plan · " : pkg ? "Adicional · " : ""}{charge.unit}</span>
              {treatment && <span className={"ml-1 " + treatment.color}>{treatment.detail}</span>}
            </div>
            <NumberField label={pkg ? "Cantidad " + label : "Cantidad de " + charge.concept} mobileLabel="Cant." precision={6}
              minimum={0.000001} value={charge.quantity} edit={pendingPrice ? undefined : (quantity) => update({ quantity })} />
            <NumberField label={pkg ? "Venta unitaria " + label : "Precio unitario de " + charge.concept} mobileLabel="Precio unit."
              precision={2} value={charge.unitPrice} edit={canConfirmCharges && !pendingPrice ? (unitPrice) => update({ unitPrice }) : undefined}
              priceTone={treatment?.color} />
            <Amount value={extraLines?.[index]?.input.quotedPrice ?? null} currency={currency} />
            <Button type="button" size="icon" variant="ghost" className="size-8" aria-label={"Quitar " + (pkg ? label : charge.concept)}
              onClick={() => setCharges((current) => current.filter((row) => row.id !== charge.id))}><Trash2 aria-hidden="true" /></Button>
          </div>;
        })}
        {!baseRows.length && !charges.length && <p className="px-2 py-3 text-xs text-slate-600">Agrega el primer concepto desde el catálogo.</p>}
      </section>

      {modified && <label className="block text-xs font-semibold">Motivo del ajuste<input className={FIELD} required maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></label>}
      {currencyMismatch && <p role="alert" className="text-xs text-amber-900">Selecciona los conceptos en la moneda de la propuesta.</p>}
      {count > maxLines && <p role="alert" className="text-xs text-amber-900">Reduce los renglones a {maxLines} antes de guardar.</p>}
      {foregoneRevenue >= 0.01 && <div className="text-xs text-amber-900">
        <p>Descuento respecto al sugerido {pricingMoney(foregoneRevenue, currency)}. Requiere autorización de Administración para publicar.</p>
        {approvals.length > 0 && <label className="block max-w-sm">Autorización<select className={FIELD} value={approvalRef} onChange={(event) => setApprovalRef(event.target.value)}>
          <option value="">Seleccionar</option>{approvals.map((item) => <option key={item.authorizationRef} value={item.authorizationRef}>{item.reason}</option>)}
        </select></label>}
      </div>}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}

      <div className="flex flex-wrap items-start justify-between gap-2">
        <details className="min-w-40 flex-1 px-1 py-1.5" open={!payerName.trim() || Boolean(costing && !pkg)}>
          <summary className="cursor-pointer text-xs font-semibold">Datos de la propuesta</summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="text-xs font-semibold">Nombre<input className={FIELD} required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label className="text-xs font-semibold">Responsable del pago<input className={FIELD} required maxLength={180} value={payerName} onChange={(event) => setPayerName(event.target.value)} /></label>
            <label className="text-xs font-semibold sm:col-span-2">Alcance<input className={FIELD} maxLength={2000} value={scope ?? ""} placeholder={description} onChange={(event) => setScope(event.target.value)} /></label>
            <label className="text-xs font-semibold">Vigente hasta<input className={FIELD} required type="date" min={dates.issueDate}
              value={dates.validUntil} onChange={(event) => {
                const validUntil = event.target.value;
                setDates((current) => ({ ...current, validUntil }));
              }} /></label>
            {!basis && !proposal && !charges.length && (currencyOptions?.length ?? 0) > 1 && onCurrencyChange &&
              <label className="text-xs font-semibold">Moneda<select className={FIELD} value={currency} onChange={(event) => onCurrencyChange(event.target.value)}>
                {currencyOptions?.map((option) => <option key={option} value={option}>{option}</option>)}
              </select></label>}
          </div>
        </details>
        <dl aria-label="Totales de la propuesta" aria-live="polite" className="max-w-full space-y-1 px-2 py-1 text-right text-xs tabular-nums">
          {floor > baseTotal && <div className="flex justify-between gap-3 text-amber-800"><dt>Ajuste al mínimo</dt><dd>{pricingMoney(floor - baseTotal, currency)}</dd></div>}
          {existingDiscount > 0 && <div className="flex justify-between gap-3"><dt>Descuento</dt><dd>{pricingMoney(existingDiscount, currency)}</dd></div>}
          <div className="flex flex-wrap justify-end gap-2 text-sm font-bold text-[#003366]"><dt>Total propuesta</dt><dd>{extraLines ? pricingMoney(total, currency) : "Pendiente"}</dd></div>
        </dl>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" type="button" variant="ghost" onClick={() => { setOpen(false); setDismissed(true); onClose?.(); }}>Cancelar</Button>
        <Button size="sm" type="submit" disabled={saving || !complete}>{saving ? "Guardando…" : proposal ? "Guardar revisión" : "Guardar borrador"}</Button>
      </div>
    </fieldset>
  </form>;
}
