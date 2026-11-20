import { useEffect, useState, type FormEvent } from "react";
import { Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { COMPACT_FORM_DIALOG, COMPACT_FORM_FIELD } from "@/components/ui/compact-form";
import { NumericInput } from "@/components/ui/numeric-input";
import { costingApi, type QuoteCatalogItem } from "@/costing/api";
import { COST_FAMILY_LABELS, filterBySearch } from "@/costing/componentLabels";
import { pricingDecimal, pricingMoney } from "@/costing/pricingInput";

const FIELD = COMPACT_FORM_FIELD + " mt-1 w-full";
const catalogQuantity = new Intl.NumberFormat("es-DO", { maximumFractionDigits: 4 });

export type AdditionalCharge = Readonly<{
  id: string; concept: string; quantity: string; unit: string; unitCost: string; unitPrice: string;
  classification: "PR" | "EX" | "DE"; catalog?: QuoteCatalogItem;
}>;

export function QuoteAdditionPicker({ caseRef, currency, authorization, included, canAddManual, onSelect, onManual, onClose }: {
  caseRef: string; currency: string; authorization?: string; included: ReadonlyMap<string, number>; canAddManual: boolean;
  onSelect(charge: AdditionalCharge): void; onManual(): void; onClose(): void;
}) {
  const [catalog, setCatalog] = useState<readonly QuoteCatalogItem[] | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void costingApi.quoteCatalog(authorization, caseRef, currency, controller.signal).then((items) => {
      if (!controller.signal.aborted) setCatalog(items);
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [authorization, caseRef, currency]);
  const results = catalog?.filter((item) => filterBySearch(item.name + " " + (COST_FAMILY_LABELS[item.family] ?? item.family), search));

  return <section aria-label="Catálogo de adicionales" className="mt-2 divide-y rounded border bg-white text-xs"
    onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
    <div className="flex flex-wrap items-center gap-2 p-1.5">
      <label className="flex min-w-40 flex-1 items-center gap-2">
        <Search className="ml-1 size-4 text-slate-500" aria-hidden="true" />
        <span className="sr-only">Buscar servicio, producto o cargo</span>
        <input autoFocus placeholder="Buscar en el catálogo" value={search} onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} className={COMPACT_FORM_FIELD + " w-full"} />
      </label>
      {canAddManual && <Button type="button" size="sm" variant="ghost" onClick={onManual}>Cargo particular</Button>}
      <Button size="icon" type="button" variant="ghost" className="size-8" aria-label="Cerrar catálogo" title="Cerrar catálogo" onClick={onClose}><X aria-hidden="true" /></Button>
    </div>
    {error ? <p role="alert" className="p-2 text-red-800">No se pudo consultar el catálogo de adicionales.</p>
      : results ? <ul className="max-h-48 divide-y overflow-y-auto">
        {results.map((item) => {
          const includedQuantity = included.get(item.ruleRef) ?? 0;
          return <li key={item.ruleRef} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1">
            <div className="min-w-28 flex-1">
              <p className="font-semibold">{item.name}</p>
              {includedQuantity > 0 && <p className="text-slate-600">En el paquete · {catalogQuantity.format(includedQuantity)}</p>}
            </div>
            <span className="text-slate-700">{pricingMoney(item.unitPrice, item.currency)} / {item.unit}</span>
            <Button size="icon" type="button" variant="ghost" className="size-8" aria-label={"Agregar " + item.name} title={"Agregar " + item.name} onClick={() => onSelect({
              id: crypto.randomUUID(), concept: item.name, quantity: "1", unit: item.unit, unitCost: "",
              unitPrice: item.unitPrice, classification: item.classification, catalog: item,
            })}><Plus aria-hidden="true" /></Button>
          </li>;
        })}
        {!results.length && <li className="p-2 text-slate-600">No hay coincidencias en {currency}.</li>}
      </ul> : <p role="status" className="p-2 text-slate-600">Cargando adicionales…</p>}
  </section>;
}

export function QuoteManualChargeDialog({ onSelect, onClose }: { onSelect(charge: AdditionalCharge): void; onClose(): void }) {
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className={COMPACT_FORM_DIALOG}>
      <DialogHeader><DialogTitle>Cargo particular</DialogTitle>
        <DialogDescription>El cargo se guarda en esta propuesta.</DialogDescription></DialogHeader>
      <ManualCharge onSelect={onSelect} onBack={onClose} />
    </DialogContent>
  </Dialog>;
}

function ManualCharge({ onSelect, onBack }: { onSelect(charge: AdditionalCharge): void; onBack(): void }) {
  const [concept, setConcept] = useState("");
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");
  const [classification, setClassification] = useState<AdditionalCharge["classification"]>("PR");
  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const unitCost = pricingDecimal(cost, 2);
    const unitPrice = pricingDecimal(price, 2);
    if (concept.trim() && unitCost !== null && unitPrice !== null) onSelect({
      id: crypto.randomUUID(), concept: concept.trim(), quantity: "1", unit: "servicio", unitCost, unitPrice, classification,
    });
  }
  return <form onSubmit={add} className="grid gap-2 sm:grid-cols-2">
    <label className="text-xs font-semibold sm:col-span-2">Concepto<input className={FIELD} required maxLength={240} value={concept} onChange={(event) => setConcept(event.target.value)} /></label>
    <label className="text-xs font-semibold">Precio unitario<NumericInput className={FIELD} required allowDecimalComma min={0} step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
    <label className="text-xs font-semibold">Costo unitario<NumericInput className={FIELD} required allowDecimalComma min={0} step="0.01" value={cost} onChange={(event) => setCost(event.target.value)} /></label>
    <label className="text-xs font-semibold">Clase<select className={FIELD} value={classification} onChange={(event) => setClassification(event.target.value as AdditionalCharge["classification"])}>
      <option value="PR">Propio</option><option value="EX">Externo</option><option value="DE">Desembolso</option>
    </select></label>
    <div className="flex items-end justify-end gap-2">
      <Button type="button" variant="outline" size="sm" onClick={onBack}>Volver</Button>
      <Button type="submit" size="sm">Agregar cargo</Button>
    </div>
  </form>;
}
