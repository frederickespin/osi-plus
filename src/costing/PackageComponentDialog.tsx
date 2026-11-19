import { useRef, useState, type FormEvent } from "react";
import { Pencil, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { COMPACT_FORM_DIALOG, COMPACT_FORM_FIELD } from "@/components/ui/compact-form";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NumericInput } from "@/components/ui/numeric-input";
import { costingApi, type CostingRule } from "./api";
import { COST_FAMILY_LABELS, filterBySearch } from "./componentLabels";
import { pricingDecimal, pricingMoney } from "./pricingInput";

const FIELD = `${COMPACT_FORM_FIELD} mt-1 w-full`;
type Props = Readonly<{
  authorization?: string;
  costs: readonly CostingRule[];
  currency: string;
  excluded?: ReadonlySet<string>;
  editing?: CostingRule;
  canManage: boolean;
  onPick?(rule: CostingRule): void;
  onSave(rule: CostingRule): void;
  onClose(): void;
}>;

export function PackageComponentDialog({ authorization, costs, currency, excluded, editing, canManage, onPick, onSave, onClose }: Props) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CostingRule | "NEW" | null>(editing ?? null);
  const [saving, setSaving] = useState(false);
  const visible = costs.filter((cost) => (!onPick || !excluded?.has(cost.seriesRef))
    && filterBySearch(`${cost.name} ${COST_FAMILY_LABELS[cost.family] ?? cost.family}`, search));

  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
    <DialogContent className={`${COMPACT_FORM_DIALOG} max-h-[84vh] overflow-y-auto`} showCloseButton={!saving}>
      <DialogHeader>
        <DialogTitle>{selected === "NEW" ? "Nuevo componente" : selected ? "Actualizar costo" : onPick ? "Agregar componente" : "Componentes del tarifario"}</DialogTitle>
        <DialogDescription>{selected
          ? "El costo vigente se usa en los paquetes que incluyen este componente."
          : "Busca un producto, servicio o cargo por nombre."}</DialogDescription>
      </DialogHeader>
      {selected ? <ComponentFields key={selected === "NEW" ? "NEW" : selected.ruleRef}
        authorization={authorization} currency={currency} current={selected === "NEW" ? undefined : selected}
        saving={saving} setSaving={setSaving} onCancel={() => editing ? onClose() : setSelected(null)}
        onSaved={(cost) => {
          onSave(cost);
          if (onPick) { onPick(cost); onClose(); }
          else if (editing) onClose();
          else setSelected(null);
        }} /> : <>
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-slate-500" aria-hidden="true" />
          <input aria-label="Buscar componente" placeholder="Ej. cajas o camión" value={search} onChange={(event) => setSearch(event.target.value)} className={FIELD} />
          {canManage && <Button size="sm" type="button" onClick={() => setSelected("NEW")}><Plus aria-hidden="true" />Nuevo</Button>}
        </div>
        <ul className="divide-y rounded border">
          {visible.map((cost) => <li key={cost.seriesRef} className="flex items-center gap-2 px-2 py-1.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{cost.name}</p>
              <p className="text-xs text-slate-600">{COST_FAMILY_LABELS[cost.family] ?? cost.family} · {pricingMoney(cost.unitCost!, cost.currency)} / {String(cost.result?.unit ?? "unidad")}</p>
            </div>
            {onPick ? <Button size="sm" type="button" variant="outline" onClick={() => { onPick(cost); onClose(); }} aria-label={`Agregar ${cost.name}`}><Plus aria-hidden="true" />Agregar</Button>
              : canManage && <Button size="icon" type="button" variant="ghost" onClick={() => setSelected(cost)} aria-label={`Editar costo de ${cost.name}`}><Pencil aria-hidden="true" /></Button>}
          </li>)}
          {!visible.length && <li className="p-3 text-xs text-slate-600">No hay componentes disponibles para esta búsqueda.</li>}
        </ul>
      </>}
    </DialogContent>
  </Dialog>;
}

function ComponentFields({ authorization, currency, current, saving, setSaving, onCancel, onSaved }: {
  authorization?: string; currency: string; current?: CostingRule; saving: boolean;
  setSaving(value: boolean): void; onCancel(): void; onSaved(rule: CostingRule): void;
}) {
  const [name, setName] = useState(current?.name ?? "");
  const [family, setFamily] = useState(current?.family ?? "MATERIAL");
  const [classification, setClassification] = useState(current?.classification ?? "PR");
  const [unit, setUnit] = useState(String(current?.result?.unit ?? "unidad"));
  const [amount, setAmount] = useState(current?.unitCost ?? "");
  const [sale, setSale] = useState(String(current?.result?.saleUnitPrice ?? ""));
  const [money, setMoney] = useState(current?.currency ?? currency);
  const [error, setError] = useState("");
  const [code] = useState(() => current?.code ?? `COMP_${crypto.randomUUID().replaceAll("-", "").toUpperCase()}`);
  const request = useRef<{ key: string; id: string } | null>(null);
  const hasCatalogPrice = !current || typeof current.conditions?.packageComponentCode === "string";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const unitCost = pricingDecimal(amount, 6);
    const saleUnitPrice = pricingDecimal(sale, 2);
    if (!unitCost || !name.trim() || !unit.trim() || sale.trim() && !saleUnitPrice || saving) return;
    const payload = {
      seriesRef: current?.seriesRef ?? null, expectedVersion: current?.version ?? 0,
      name: name.trim(), code, family, classification, source: current?.source ?? "ADMIN",
      priority: current?.priority ?? 100, specificity: current?.specificity ?? 0,
      conditions: current?.conditions ?? { packageComponentCode: code },
      result: hasCatalogPrice ? { unit: unit.trim(), saleUnitPrice } : current?.result ?? {},
      currency: money, unitCost,
      minimumMarginBps: classification === "PR" ? current?.minimumMarginBps ?? 0 : null,
      recommendedMarginBps: classification === "PR" ? current?.recommendedMarginBps ?? 0 : null,
      validFrom: null, validTo: null, state: "ACTIVE",
    };
    const key = JSON.stringify(payload);
    if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
    setSaving(true);
    setError("");
    try {
      const result = await costingApi.versionRule(authorization, payload, request.current.id);
      onSaved({ ...payload, ...result });
    } catch (cause) {
      setError(cause instanceof Error && cause.message === "COSTING_RULE_VERSION_CONFLICT"
        ? "El componente tiene una versión más reciente. Actualiza el tarifario y vuelve a abrirlo."
        : "No se pudo guardar el costo. Revisa sus datos e inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return <form onSubmit={(event) => void submit(event)} className="space-y-3">
    <fieldset disabled={saving} className="grid gap-2 sm:grid-cols-2">
      <label className="text-xs font-semibold sm:col-span-2">Nombre<input className={FIELD} required maxLength={180} value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label className="text-xs font-semibold">Familia<select disabled={Boolean(current)} className={FIELD} value={family} onChange={(event) => setFamily(event.target.value)}>
        {Object.entries(COST_FAMILY_LABELS).filter(([key]) => key !== "CURRENCY_COMPENSATION").map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <label className="text-xs font-semibold">Clase<select disabled={Boolean(current)} className={FIELD} value={classification} onChange={(event) => setClassification(event.target.value)}>
        <option value="PR">Propio</option><option value="EX">Externo</option><option value="DE">Desembolso</option>
      </select></label>
      <label className="text-xs font-semibold">Unidad<input className={FIELD} required readOnly={Boolean(current)} maxLength={32} placeholder="Ej. hora, caja o viaje" value={unit} onChange={(event) => setUnit(event.target.value)} /></label>
      <label className="text-xs font-semibold">Moneda<input className={FIELD} required maxLength={3} pattern="[A-Z]{3}" value={money} onChange={(event) => setMoney(event.target.value.toUpperCase())} /></label>
      <label className="text-xs font-semibold">Costo unitario<NumericInput className={FIELD} required allowDecimalComma min={0} max={100_000_000} step="0.000001" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
      {hasCatalogPrice && <label className="text-xs font-semibold">Precio unitario como adicional<NumericInput className={FIELD} allowDecimalComma min={0} max={100_000_000} step="0.01" value={sale} onChange={(event) => setSale(event.target.value)} /></label>}
    </fieldset>
    {hasCatalogPrice && <p className="text-xs text-slate-600">Al asignarle un precio de venta aparecerá en el catálogo de adicionales de Cotización.</p>}
    {current?.validFrom && <p className="text-xs text-slate-600">Vigente desde {new Date(current.validFrom).toLocaleString("es-DO", { timeZone: "America/Santo_Domingo", dateStyle: "short", timeStyle: "short" })}</p>}
    {error && <p role="alert" className="text-xs text-red-800">{error}</p>}
    <div className="flex justify-end gap-2">
      <Button variant="outline" size="sm" type="button" disabled={saving} onClick={onCancel}>Cancelar</Button>
      <Button size="sm" type="submit" disabled={saving || !name.trim() || !amount.trim()}>{saving ? "Guardando…" : "Guardar costo"}</Button>
    </div>
  </form>;
}
