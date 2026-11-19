import { useCallback, useId, useRef, useState, type FormEvent } from "react";
import { Check, Pencil, Plus, Search, X } from "lucide-react";
import { AdministrationHelp, AdministrationIconAction } from "@/administration/AdministrationHelp";
import { COMPACT_TABLE_BODY, COMPACT_TABLE_FIELD, COMPACT_TABLE_HEAD } from "@/components/ui/compact-form";
import { NumericInput } from "@/components/ui/numeric-input";
import { costingApi, type CostingRule } from "./api";
import { COST_FAMILY_LABELS, costUnitLabel, filterBySearch } from "./componentLabels";
import { pricingDecimal, pricingMoney } from "./pricingInput";

const CLASSES: Record<string, string> = { PR: "Propio", EX: "Externo", DE: "Desembolso" };
const AMOUNT = COMPACT_TABLE_FIELD + " text-right tabular-nums";
const ACTION = "border-transparent bg-transparent";

type Props = Readonly<{
  authorization?: string;
  costs: readonly CostingRule[];
  currency: string;
  canManage: boolean;
  editCost?: CostingRule;
  onPick?(cost: CostingRule): void;
  onEditingChange?(editing: boolean): void;
  onSaved(cost: CostingRule): void;
  onClose?(): void;
  onUnauthorized(): void;
}>;

export function PackageCostTable({ authorization, costs, currency, canManage, editCost, onPick, onSaved, onClose, onUnauthorized, onEditingChange }: Props) {
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<CostingRule | "NEW" | null>(editCost ?? null);
  const [saving, setSaving] = useState(false);
  const matching = costs.filter((cost) => filterBySearch(
    [cost.name, COST_FAMILY_LABELS[cost.family], costUnitLabel(String(cost.result?.unit ?? ""))].join(" "), search,
  ));
  const editing = draft && draft !== "NEW" ? draft : null;
  const editingRef = editing?.seriesRef;
  const visible = editCost ? [editCost] : matching;
  const rows = draft === "NEW" ? [null, ...visible] : editing && !visible.some((item) => item.seriesRef === editingRef)
    ? [editing, ...visible] : visible;

  function changeDraft(next: CostingRule | "NEW" | null) {
    setDraft(next);
    onEditingChange?.(Boolean(next));
    if (!next && editCost) onClose?.();
  }

  return <section aria-label={onPick ? "Costos para agregar al paquete" : editCost ? "Actualizar costo del componente" : "Tabla de costos"}>
    {!editCost && <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 py-1.5">
      {onPick && <span className="text-xs font-semibold text-[#003366]">Agregar al paquete</span>}
      <label className="relative flex min-w-48 max-w-sm flex-1 items-center">
        <Search aria-hidden="true" className="absolute left-2 size-4 text-slate-500" />
        <input className={COMPACT_TABLE_FIELD + " bg-white pl-8"} aria-label="Buscar componente" placeholder="Buscar producto, servicio o cargo"
          value={search} onChange={(event) => setSearch(event.target.value)} />
      </label>
      {canManage && <AdministrationIconAction label="Nuevo componente" mobileLabel="Nuevo" disabled={Boolean(draft)}
        onClick={() => changeDraft("NEW")}><Plus aria-hidden="true" className="size-4" /></AdministrationIconAction>}
      <AdministrationHelp title={onPick ? "agregar componentes" : "la tabla de costos"}>
        {onPick && <p>Usa el signo + de una fila para agregar ese costo al paquete. Puedes agregar varios sin cerrar la lista.</p>}
        <p>Registra cada producto, servicio o cargo una sola vez. El costo unitario vigente se aplica al calcular nuevas cotizaciones.</p>
        <p>Si completas «Venta adic.», Comercial también puede cotizar ese componente por separado.</p>
      </AdministrationHelp>
      {onClose && <AdministrationIconAction label="Cerrar búsqueda de componentes" className={ACTION}
        disabled={Boolean(draft)} onClick={onClose}><X aria-hidden="true" className="size-4" /></AdministrationIconAction>}
    </div>}
    {editCost && <p className="border-b border-slate-200 py-1.5 text-xs font-semibold text-[#003366]">Actualizar costo</p>}
    <div className={"overflow-auto border-b border-slate-200 " + (onPick ? "max-h-48" : "max-h-[max(14rem,calc(100dvh-17rem))]")}>
      <table className="w-full min-w-[690px] table-fixed text-left" aria-label={onPick ? "Costos disponibles" : "Costos unitarios y precios adicionales"}>
        <thead className={COMPACT_TABLE_HEAD}><tr>
          <th className="w-[26%]" scope="col">Componente</th><th className="w-[15%]" scope="col">Familia</th>
          <th className="w-[12%]" scope="col">Tipo</th><th className="w-[10%]" scope="col">Unidad</th>
          <th className="w-[7%]" scope="col">Mon.</th><th className="w-[10%] text-right" scope="col">Costo unit.</th>
          <th className="w-[11%] text-right" scope="col">Venta adic.</th><th scope="col"><span className="sr-only">Acciones</span></th>
        </tr></thead>
        <tbody className={COMPACT_TABLE_BODY}>
          {rows.map((cost) => !cost || cost.seriesRef === editingRef
            ? <CostEditor key={cost?.ruleRef ?? "new"} current={cost ?? undefined} currency={currency} authorization={authorization}
              saving={saving} setSaving={setSaving} onUnauthorized={onUnauthorized} onCancel={() => changeDraft(null)}
              onSaved={(saved) => {
                onSaved(saved);
                if (!cost) onPick?.(saved);
                changeDraft(null);
              }} />
            : <tr key={cost.seriesRef} className="h-9 text-slate-700 hover:bg-slate-50">
              <td className="break-words font-semibold text-slate-900">{cost.name}</td>
              <td>{COST_FAMILY_LABELS[cost.family] ?? cost.family}</td>
              <td>{CLASSES[cost.classification] ?? cost.classification}</td>
              <td>{costUnitLabel(String(cost.result?.unit ?? ""))}</td>
              <td>{cost.currency}</td>
              <td className="text-right tabular-nums">{pricingMoney(cost.unitCost!, cost.currency)}</td>
              <td className="text-right tabular-nums">{cost.result?.saleUnitPrice == null ? "—" : pricingMoney(String(cost.result.saleUnitPrice), cost.currency)}</td>
              <td className="text-right">
                {onPick ? <AdministrationIconAction label={"Agregar " + cost.name} className={ACTION} disabled={Boolean(draft)}
                  onClick={() => onPick(cost)}><Plus aria-hidden="true" className="size-4" /></AdministrationIconAction>
                  : canManage && <AdministrationIconAction label={"Editar costo de " + cost.name} className={ACTION} disabled={Boolean(draft)}
                    onClick={() => changeDraft(cost)}><Pencil aria-hidden="true" className="size-4" /></AdministrationIconAction>}
              </td>
            </tr>)}
          {!rows.length && <tr><td colSpan={8} className="h-11 text-slate-500">{search.trim() ? "Sin coincidencias." : onPick ? "No quedan componentes por agregar." : "Todavía no hay costos. Usa + para registrar el primero."}</td></tr>}
        </tbody>
      </table>
    </div>
  </section>;
}

function CostEditor({ authorization, currency, current, saving, setSaving, onCancel, onSaved, onUnauthorized }: {
  authorization?: string; currency: string; current?: CostingRule; saving: boolean;
  setSaving(value: boolean): void; onCancel(): void; onSaved(rule: CostingRule): void; onUnauthorized(): void;
}) {
  const form = useId();
  const [name, setName] = useState(current?.name ?? "");
  const [family, setFamily] = useState(current?.family ?? "MATERIAL");
  const [classification, setClassification] = useState(current?.classification ?? "PR");
  const [unit, setUnit] = useState(String(current?.result?.unit ?? "unidad"));
  const [amount, setAmount] = useState(current?.unitCost ?? "");
  const [sale, setSale] = useState(String(current?.result?.saleUnitPrice ?? ""));
  const [money, setMoney] = useState(current?.currency ?? currency);
  const [error, setError] = useState("");
  const [code] = useState(() => current?.code ?? "COMP_" + crypto.randomUUID().replaceAll("-", "").toUpperCase());
  const request = useRef<{ key: string; id: string } | null>(null);
  const focusOnOpen = useCallback((input: HTMLInputElement | null) => input?.focus(), []);
  const hasCatalogPrice = !current || typeof current.conditions?.packageComponentCode === "string";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const unitCost = pricingDecimal(amount, 6);
    const saleUnitPrice = hasCatalogPrice ? pricingDecimal(sale, 2) : null;
    if (saving) return;
    if (unitCost === null || !name.trim() || !unit.trim() || hasCatalogPrice && sale.trim() && saleUnitPrice === null) {
      setError("Completa el nombre, la unidad y el costo. La venta adicional admite dos decimales.");
      return;
    }
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
      const saved = await costingApi.versionRule(authorization, payload, request.current.id);
      onSaved({ ...payload, ...saved });
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "";
      if (code.includes("UNAUTHORIZED")) onUnauthorized();
      else setError(code === "COSTING_RULE_VERSION_CONFLICT"
        ? "Otra persona actualizó este costo. Recarga la configuración antes de volver a editar."
        : code === "COSTING_TRANSPORT_RULE_PROTECTED"
          ? "Este costo de transporte se actualiza en Motor Logístico."
          : "No se pudo guardar el costo. Revisa los campos e inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <tr className="bg-sky-50/70">
      <td><input ref={current ? undefined : focusOnOpen} form={form} aria-label="Nombre del componente" placeholder="Nombre"
        className={COMPACT_TABLE_FIELD + " font-semibold"} required maxLength={180} disabled={saving} value={name} onChange={(event) => setName(event.target.value)} /></td>
      <td>{current ? COST_FAMILY_LABELS[family] ?? family : <select form={form} aria-label="Familia" className={COMPACT_TABLE_FIELD} disabled={saving} value={family} onChange={(event) => setFamily(event.target.value)}>
        {Object.entries(COST_FAMILY_LABELS).filter(([key]) => key !== "CURRENCY_COMPENSATION").map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>}</td>
      <td>{current ? CLASSES[classification] ?? classification : <select form={form} aria-label="Tipo de costo" className={COMPACT_TABLE_FIELD} disabled={saving} value={classification} onChange={(event) => setClassification(event.target.value)}>
        {Object.entries(CLASSES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>}</td>
      <td>{current ? costUnitLabel(unit) : <input form={form} aria-label="Unidad" className={COMPACT_TABLE_FIELD} required disabled={saving} maxLength={32} value={unit} onChange={(event) => setUnit(event.target.value)} />}</td>
      <td><input form={form} aria-label="Moneda del costo" className={COMPACT_TABLE_FIELD} required disabled={saving} maxLength={3} pattern="[A-Z]{3}" value={money} onChange={(event) => setMoney(event.target.value.toUpperCase())} /></td>
      <td><NumericInput ref={current ? focusOnOpen : undefined} form={form} aria-label="Costo unitario" placeholder="0.00"
        className={AMOUNT} required allowDecimalComma disabled={saving} min={0} max={100_000_000} step="0.000001" value={amount} onChange={(event) => setAmount(event.target.value)} /></td>
      <td>{hasCatalogPrice ? <NumericInput form={form} aria-label="Precio unitario como adicional" placeholder="Opcional"
        className={AMOUNT} allowDecimalComma disabled={saving} min={0} max={100_000_000} step="0.01" value={sale} onChange={(event) => setSale(event.target.value)} /> : <span className="block text-right">—</span>}</td>
      <td><form id={form} onSubmit={(event) => void submit(event)} className="flex justify-end">
        <AdministrationIconAction label="Guardar costo" type="submit" className={ACTION + " text-emerald-700"} disabled={saving || !name.trim() || !amount.trim()}><Check aria-hidden="true" className="size-4" /></AdministrationIconAction>
        <AdministrationIconAction label="Cancelar edición del costo" className={ACTION} disabled={saving} onClick={onCancel}><X aria-hidden="true" className="size-4" /></AdministrationIconAction>
      </form></td>
    </tr>
    {error && <tr><td colSpan={8}><p role="alert" className="py-1 text-xs text-red-800">{error}</p></td></tr>}
  </>;
}
