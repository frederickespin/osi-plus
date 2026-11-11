import { useId, useState } from "react";
import { Plus, X } from "lucide-react";
import { COMPACT_FORM_FIELD } from "@/components/ui/compact-form";

const UNIT_TYPES = Object.freeze([
  ["BOX", "Caja"], ["PACKAGE", "Paquete"], ["BUNDLE", "Bulto"],
  ["PALLET", "Pallet"], ["LOOSE_ITEM", "Artículo suelto"], ["CRATE", "Huacal"], ["OTHER", "Otro"],
] as const);
const CONTENT_OPTIONS = Object.freeze([
  "Mobiliario", "Sofá", "Silla", "Mesa", "Cama o colchón", "Ropa",
  "Libros y documentos", "Cocina", "Electrodoméstico", "Arte y decoración",
  "Electrónica", "Herramientas", "Mercancía comercial", "Materia prima", "Otros",
]);

type Props = Readonly<{
  unitType: string;
  contents: readonly string[];
  onUnitType(value: string): void;
  onContents(value: readonly string[]): void;
}>;

export default function CustodyDescriptionSearch({ unitType, contents, onUnitType, onContents }: Props) {
  const unitListId = useId();
  const contentListId = useId();
  const initialUnit = UNIT_TYPES.find(([value]) => value === unitType)?.[1] ?? "";
  const [unitQuery, setUnitQuery] = useState(initialUnit);
  const [contentQuery, setContentQuery] = useState("");

  const selectUnit = (query: string) => {
    setUnitQuery(query);
    const normalized = query.trim().toLocaleLowerCase("es");
    const match = UNIT_TYPES.find(([, label]) => label.toLocaleLowerCase("es") === normalized);
    onUnitType(match?.[0] ?? "");
  };
  const addContent = (raw: string) => {
    const value = raw.trim().slice(0, 80);
    if (!value) return;
    const canonical = CONTENT_OPTIONS.find((entry) => entry.toLocaleLowerCase("es") === value.toLocaleLowerCase("es")) ?? value;
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
      <datalist id={unitListId}>{UNIT_TYPES.map(([value, label]) => <option key={value} value={label} />)}</datalist>
      {unitQuery && !unitType && <small className="mt-1 block text-amber-700">Seleccione una opción de la lista.</small>}
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
      <datalist id={`${contentListId}-options`}>{CONTENT_OPTIONS.map((entry) => <option key={entry} value={entry} />)}</datalist>
      {contents.length > 0 && <ul className="mt-2 flex flex-wrap gap-1" aria-label="Contenido seleccionado">{contents.map((entry) => <li key={entry} className="inline-flex items-center gap-1 rounded bg-white px-2 py-1 text-[11px] font-medium text-slate-700"><span>{entry}</span><button type="button" aria-label={`Quitar ${entry}`} onClick={() => onContents(contents.filter((value) => value !== entry))} className="text-slate-500 hover:text-red-700"><X className="h-3.5 w-3.5" /></button></li>)}</ul>}
    </div>
  </div>;
}
