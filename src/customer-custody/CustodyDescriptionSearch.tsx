import { useId, useState } from "react";
import { Plus, X } from "lucide-react";
import { COMPACT_FORM_FIELD } from "@/components/ui/compact-form";
import type { CustomerCustodyCatalogItem } from "./api";

type Props = Readonly<{
  packageFormCode: string;
  contents: readonly string[];
  packageForms: readonly CustomerCustodyCatalogItem[];
  itemNames: readonly CustomerCustodyCatalogItem[];
  onPackageFormCode(value: string): void;
  onContents(value: readonly string[]): void;
}>;

export default function CustodyDescriptionSearch({ packageFormCode, contents, packageForms, itemNames, onPackageFormCode, onContents }: Props) {
  const unitListId = useId();
  const contentListId = useId();
  const initialUnit = packageForms.find((row) => row.code === packageFormCode)?.label ?? "";
  const [unitQuery, setUnitQuery] = useState(initialUnit);
  const [contentQuery, setContentQuery] = useState("");

  const selectUnit = (query: string) => {
    setUnitQuery(query);
    const normalized = query.trim().toLocaleLowerCase("es");
    const match = packageForms.find((row) => row.label.toLocaleLowerCase("es") === normalized);
    onPackageFormCode(match?.code ?? "");
  };
  const addContent = (raw: string) => {
    const value = raw.trim().slice(0, 80);
    if (!value) return;
    const canonical = itemNames.find((entry) => entry.label.toLocaleLowerCase("es") === value.toLocaleLowerCase("es"))?.label ?? value;
    if (!contents.some((entry) => entry.toLocaleLowerCase("es") === canonical.toLocaleLowerCase("es"))) onContents([...contents, canonical]);
    setContentQuery("");
  };

  return <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
    <label className="text-xs font-semibold">Tipo físico
      <input
        list={unitListId}
        value={unitQuery}
        onChange={(event) => selectUnit(event.target.value)}
        placeholder="Escriba: caja, paquete…"
        autoComplete="off"
        className={`${COMPACT_FORM_FIELD} mt-1 w-full`}
      />
      <datalist id={unitListId}>{packageForms.map((row) => <option key={row.catalogRef} value={row.label} />)}</datalist>
      {unitQuery && !packageFormCode && <small className="mt-1 block text-amber-700">Seleccione una opción de la lista.</small>}
    </label>
    <div>
      <label className="text-xs font-semibold" htmlFor={contentListId}>Contenido</label>
      <div className="mt-1 flex gap-1">
        <input
          id={contentListId}
          list={`${contentListId}-options`}
          value={contentQuery}
          onChange={(event) => setContentQuery(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addContent(contentQuery); } }}
          placeholder="Escriba: sofá, ropa, documentos…"
          autoComplete="off"
          className={`${COMPACT_FORM_FIELD} min-w-0 flex-1`}
        />
        <button type="button" aria-label="Agregar contenido" onClick={() => addContent(contentQuery)} disabled={!contentQuery.trim()} className="grid h-9 w-9 shrink-0 place-items-center rounded border border-[#003366] bg-[#003366] text-white disabled:opacity-40"><Plus className="h-4 w-4" /></button>
      </div>
      <datalist id={`${contentListId}-options`}>{itemNames.map((entry) => <option key={entry.catalogRef} value={entry.label} />)}</datalist>
      {contents.length > 0 && <ul className="mt-2 flex flex-wrap gap-1" aria-label="Contenido seleccionado">{contents.map((entry) => <li key={entry} className="inline-flex items-center gap-1 rounded bg-white px-2 py-1 text-[11px] font-medium text-slate-700"><span>{entry}</span><button type="button" aria-label={`Quitar ${entry}`} onClick={() => onContents(contents.filter((value) => value !== entry))} className="text-slate-500 hover:text-red-700"><X className="h-3.5 w-3.5" /></button></li>)}</ul>}
    </div>
  </div>;
}
