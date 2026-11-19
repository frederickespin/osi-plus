import { useEffect, useState, type FormEvent } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { COMPACT_FORM_DIALOG, COMPACT_FORM_FIELD } from "@/components/ui/compact-form";
import { NumericInput } from "@/components/ui/numeric-input";
import { costingApi, type QuoteCatalogItem } from "@/costing/api";
import { COST_FAMILY_LABELS, filterBySearch } from "@/costing/componentLabels";
import { pricingDecimal, pricingMoney } from "@/costing/pricingInput";

const FIELD = COMPACT_FORM_FIELD + " mt-1 w-full";

export type AdditionalCharge = Readonly<{
  id: string; concept: string; quantity: string; unit: string; unitCost: string; unitPrice: string;
  classification: "PR" | "EX" | "DE"; catalog?: QuoteCatalogItem;
}>;

export function QuoteAdditionPicker({ caseRef, currency, authorization, canAddManual, onSelect, onClose }: {
  caseRef: string; currency: string; authorization?: string; canAddManual: boolean;
  onSelect(charge: AdditionalCharge): void; onClose(): void;
}) {
  const [catalog, setCatalog] = useState<readonly QuoteCatalogItem[] | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState(false);
  const [manual, setManual] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void costingApi.quoteCatalog(authorization, caseRef, currency, controller.signal).then((items) => {
      if (!controller.signal.aborted) setCatalog(items);
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [authorization, caseRef, currency]);
  const results = catalog?.filter((item) => filterBySearch(item.name + " " + (COST_FAMILY_LABELS[item.family] ?? item.family), search));

  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className={COMPACT_FORM_DIALOG + " max-h-[84vh] overflow-y-auto"}>
      <DialogHeader><DialogTitle>{manual ? "Cargo particular" : "Agregar a la propuesta"}</DialogTitle>
        <DialogDescription>{manual ? "El cargo se guarda en esta propuesta." : "Busca un producto, servicio o cargo del tarifario."}</DialogDescription></DialogHeader>
      {manual ? <ManualCharge onSelect={onSelect} onBack={() => setManual(false)} /> : <>
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-slate-500" aria-hidden="true" />
          <input aria-label="Buscar servicio, producto o cargo" placeholder="Ej. grúa o cajas" value={search} onChange={(event) => setSearch(event.target.value)} className={FIELD} />
        </div>
        {error ? <p role="alert" className="text-xs text-red-800">No se pudo consultar el catálogo de adicionales.</p>
          : results ? <ul className="divide-y rounded border">
            {results.map((item) => <li key={item.ruleRef} className="flex items-center gap-2 px-2 py-1.5">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{item.name}</p>
                <p className="text-xs text-slate-600">{pricingMoney(item.unitPrice, item.currency)} / {item.unit}</p>
              </div>
              <Button size="sm" type="button" variant="outline" aria-label={"Agregar " + item.name} onClick={() => onSelect({
                id: crypto.randomUUID(), concept: item.name, quantity: "1", unit: item.unit, unitCost: "",
                unitPrice: item.unitPrice, classification: item.classification, catalog: item,
              })}><Plus aria-hidden="true" />Agregar</Button>
            </li>)}
            {!results.length && <li className="p-2 text-xs text-slate-600">No hay coincidencias en {currency}.</li>}
          </ul> : <p role="status" className="text-xs text-slate-600">Cargando adicionales…</p>}
        {canAddManual && <div className="flex justify-end"><Button type="button" size="sm" variant="outline" onClick={() => setManual(true)}>Cargo particular</Button></div>}
      </>}
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
