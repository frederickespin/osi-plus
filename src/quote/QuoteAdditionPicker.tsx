import { useEffect, useState, type KeyboardEvent } from "react";
import { Package, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { COMPACT_FORM_FIELD } from "@/components/ui/compact-form";
import { NumericInput } from "@/components/ui/numeric-input";
import { costingApi, type CostingPackageOption, type QuoteCatalogItem } from "@/costing/api";
import { COST_FAMILY_LABELS, filterBySearch } from "@/costing/componentLabels";
import { pricingDecimal, pricingMoney } from "@/costing/pricingInput";

const FIELD = COMPACT_FORM_FIELD + " mt-1 w-full";
const catalogQuantity = new Intl.NumberFormat("es-DO", { maximumFractionDigits: 4 });

export type AdditionalCharge = Readonly<{
  id: string;
  concept: string;
  quantity: string;
  unit: string;
  unitCost: string;
  unitPrice: string;
  suggestedUnitPrice?: string;
  classification: "PR" | "EX" | "DE";
  catalog?: Pick<QuoteCatalogItem, "ruleRef" | "version" | "unitPrice" | "currency">;
  addedDuringPackage?: string;
  prior?: Readonly<{ lineRef: string; quantity: string; quotedPrice: string | null; unitPrice: string }>;
}>;

type Props = Readonly<{
  caseRef: string;
  currency: string;
  authorization?: string;
  included: ReadonlyMap<string, number>;
  packages?: readonly CostingPackageOption[];
  selectedPackageVersionRef?: string;
  packageRef?: string;
  disabled: boolean;
  canAddManual: boolean;
  onSelect(charge: AdditionalCharge): void;
  onSelectPackage?(option: CostingPackageOption): void;
}>;

type CatalogResult =
  | Readonly<{ kind: "component"; item: QuoteCatalogItem }>
  | Readonly<{ kind: "package"; item: CostingPackageOption }>;

export function QuoteAdditionPicker({ caseRef, currency, authorization, included, packages, selectedPackageVersionRef, packageRef,
  disabled, canAddManual, onSelect, onSelectPackage }: Props) {
  const [catalog, setCatalog] = useState<readonly QuoteCatalogItem[] | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void costingApi.quoteCatalog(authorization, caseRef, currency, controller.signal).then((items) => {
      if (controller.signal.aborted) return;
      if (Array.isArray(items)) setCatalog(items);
      else setError(true);
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [authorization, caseRef, currency]);

  const componentResults = (catalog ?? [])
    .filter((item) => filterBySearch(item.name + " " + (COST_FAMILY_LABELS[item.family] ?? item.family), search))
    .map((item): CatalogResult => ({ kind: "component", item }));
  const matchingPackages = onSelectPackage ? (packages ?? [])
    .filter((item) => filterBySearch(item.name + " combinación paquete", search))
    .map((item): CatalogResult => ({ kind: "package", item })) : [];
  const prepared = matchingPackages.find((result) => result.kind === "package" && result.item.versionRef === selectedPackageVersionRef);
  const packageResults = prepared ? [prepared, ...matchingPackages.filter((result) => result !== prepared)] : matchingPackages;
  const results = search.trim()
    ? [...componentResults, ...packageResults]
    : [...packageResults.slice(0, 1), ...componentResults.slice(0, 3), ...packageResults.slice(1)];

  const isAdded = (result: CatalogResult) => result.kind === "package" && result.item.versionRef === packageRef;
  function add(result: CatalogResult) {
    if (disabled || isAdded(result)) return;
    if (result.kind === "package") {
      onSelectPackage?.(result.item);
      setSearch("");
      return;
    }
    const item = result.item;
    onSelect({
      id: crypto.randomUUID(), concept: item.name, quantity: "1", unit: item.unit, unitCost: "",
      unitPrice: item.unitPrice, classification: item.classification, catalog: item,
    });
  }
  function addFromSearch(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    const selection = search.trim() && results.find((result) => !isAdded(result));
    if (selection) add(selection);
  }

  return <section aria-label="Catálogo de conceptos" className="border-b border-slate-200 pb-2 text-xs">
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex min-w-40 flex-1 items-center gap-2 rounded bg-slate-100 px-2 focus-within:ring-1 focus-within:ring-[#0070a8]">
        <Search className="size-4 shrink-0 text-slate-500" aria-hidden="true" />
        <span className="sr-only">Buscar servicio, producto o combinación</span>
        <input type="search" autoComplete="off" placeholder="Buscar servicio, producto o combinación…"
          value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={addFromSearch}
          className="h-9 w-full min-w-0 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-600" />
      </label>
      {canAddManual && <Button type="button" size="sm" variant="ghost" disabled={disabled}
        aria-expanded={manualOpen} onClick={() => setManualOpen((open) => !open)}><Plus aria-hidden="true" /> Cargo particular</Button>}
    </div>

    {manualOpen && canAddManual && <QuoteManualCharge disabled={disabled} onClose={() => setManualOpen(false)}
      onSelect={(charge) => { onSelect(charge); setManualOpen(false); }} />}

    {results.length > 0 && <ul aria-label="Resultados del catálogo" className="max-h-44 divide-y divide-slate-100 overflow-auto">
      {results.map((result) => {
        const item = result.item;
        const combination = result.kind === "package";
        const includedQuantity = result.kind === "component" ? included.get(result.item.ruleRef) ?? 0 : 0;
        const selected = isAdded(result);
        const tariff = result.kind === "package"
          ? "Mínimo " + pricingMoney(result.item.minimumSale, item.currency)
          : pricingMoney(result.item.unitPrice, item.currency) + " / " + result.item.unit;
        return <li key={result.kind === "package" ? result.item.versionRef : result.item.ruleRef}
          className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-1.5 px-1 sm:gap-x-3">
          <div className="min-w-0 [overflow-wrap:anywhere]">
            <p className="flex items-center gap-1.5 font-semibold text-slate-900">
              {combination && <Package className="size-3.5 shrink-0 text-slate-500" aria-hidden="true" />}
              <span className="break-words">{item.name}</span>
            </p>
            {(combination || includedQuantity > 0) && <p className="text-slate-600">
              {selected ? "En la propuesta" : result === prepared ? "Preparada en Servicios"
                : combination ? "Combinación" : "En el paquete · " + catalogQuantity.format(includedQuantity)}
            </p>}
          </div>
          <span className="max-w-24 text-right tabular-nums text-slate-600 sm:max-w-none">{tariff}</span>
          <Button size="icon" type="button" variant="ghost" className="size-9 text-[#0070a8]"
            disabled={disabled || selected} aria-label={"Agregar " + item.name}
            title={includedQuantity ? "Agregar unidad adicional" : "Agregar"}
            onClick={() => add(result)}><Plus aria-hidden="true" /></Button>
        </li>;
      })}
    </ul>}
    {error && <p role="alert" className="p-2 text-red-800">No se pudo consultar el catálogo de servicios y productos.</p>}
    {!error && !catalog && <p role="status" className="p-2 text-slate-600">Cargando catálogo…</p>}
    {catalog && !results.length && <p className="p-2 text-slate-600">Sin coincidencias en el catálogo de {currency}.</p>}
  </section>;
}

function QuoteManualCharge({ disabled, onSelect, onClose }: { disabled: boolean; onSelect(charge: AdditionalCharge): void; onClose(): void }) {
  const [concept, setConcept] = useState("");
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");
  const [classification, setClassification] = useState<AdditionalCharge["classification"]>("PR");
  const unitCost = pricingDecimal(cost, 2);
  const unitPrice = pricingDecimal(price, 2);
  function add() {
    if (!disabled && concept.trim() && unitCost !== null && unitPrice !== null) onSelect({
      id: crypto.randomUUID(), concept: concept.trim(), quantity: "1", unit: "servicio", unitCost, unitPrice,
      suggestedUnitPrice: unitPrice, classification,
    });
  }
  return <div className="my-2 grid grid-cols-2 items-end gap-2 rounded bg-slate-100 px-2 py-1.5 sm:grid-cols-[minmax(0,2fr)_minmax(6rem,1fr)_minmax(6rem,1fr)_minmax(6rem,1fr)_auto]" aria-label="Nuevo cargo particular"
    onKeyDown={(event) => {
      if (event.key === "Enter" && event.target instanceof HTMLInputElement && !event.nativeEvent.isComposing) {
        event.preventDefault();
        add();
      }
    }}>
    <label className="col-span-2 text-xs font-semibold sm:col-span-1">Concepto<input className={FIELD} autoFocus maxLength={240} value={concept} onChange={(event) => setConcept(event.target.value)} /></label>
    <label className="text-xs font-semibold">Costo unitario<NumericInput className={FIELD} allowDecimalComma min={0} step="0.01" value={cost} onChange={(event) => setCost(event.target.value)} /></label>
    <label className="text-xs font-semibold">Precio unitario<NumericInput className={FIELD} allowDecimalComma min={0} step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
    <label className="text-xs font-semibold">Clase<select className={FIELD} value={classification} onChange={(event) => setClassification(event.target.value as AdditionalCharge["classification"])}>
      <option value="PR">Propio</option><option value="EX">Externo</option><option value="DE">Desembolso</option>
    </select></label>
    <div className="flex gap-1">
      <Button type="button" size="sm" variant="secondary" disabled={disabled || !concept.trim() || unitCost === null || unitPrice === null} onClick={add}>Añadir cargo</Button>
      <Button type="button" size="icon" variant="ghost" className="size-8" aria-label="Cancelar cargo particular" onClick={onClose}><X aria-hidden="true" /></Button>
    </div>
  </div>;
}
