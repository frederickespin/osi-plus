import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { LoaderCircle, MapPin, Search } from "lucide-react";
import { COMPACT_FORM_FIELD } from "@/components/ui/compact-form";
import { searchTransportPlaces, type TransportPlace } from "./transportPlaces";

type Props = Readonly<{ disabled?: boolean; onSelect(place: TransportPlace): void }>;

export default function TransportPlaceSearch({ disabled, onSelect }: Props) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<TransportPlace[]>([]);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  function change(value: string) {
    controller.current?.abort();
    setQuery(value);
    setLoading(false);
    setOptions([]);
    setMessage(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (disabled || loading || query.trim().length < 3) return;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setOptions([]);
    setMessage(null);
    try {
      const results = await searchTransportPlaces(query, request.signal);
      if (request.signal.aborted) return;
      setOptions(results);
      if (!results.length) setMessage({ text: "Sin coincidencias. Añada el municipio o ubique el punto en el mapa." });
    } catch {
      if (!request.signal.aborted) setMessage({ text: "La búsqueda no está disponible. Puede usar el mapa.", error: true });
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }

  return <div className="relative min-w-0">
    <form className="flex items-end gap-2" onSubmit={submit} role="search" aria-label="Buscar en el mapa">
      <label htmlFor={inputId} className="min-w-0 flex-1 text-xs font-medium text-slate-600">
        Ciudad, municipio, sector o referencia
        <input id={inputId} className={`${COMPACT_FORM_FIELD} mt-1 w-full`} placeholder="Ej. Ensanche Naco, Santo Domingo" value={query} maxLength={160} disabled={disabled}
          onChange={(event) => change(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape" && options.length) { event.stopPropagation(); setOptions([]); } }} />
      </label>
      <button type="submit" aria-label="Buscar en el mapa" title="Buscar en el mapa" disabled={disabled || loading || query.trim().length < 3} className="grid h-9 w-9 shrink-0 place-items-center rounded bg-[#003366] text-white disabled:opacity-40">
        {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
      </button>
    </form>
    {loading && <p role="status" className="mt-1 text-xs text-slate-500">Buscando ubicaciones…</p>}
    {message && <p role={message.error ? "alert" : "status"} className={`mt-1 text-xs ${message.error ? "text-amber-800" : "text-slate-600"}`}>{message.text}</p>}
    {options.length > 0 && <ul aria-label="Resultados del mapa" className="absolute inset-x-0 top-full z-[1100] mt-1 max-h-64 divide-y overflow-y-auto rounded border border-slate-200 bg-white shadow-md">
      {options.map((item) => {
        const jurisdiction = [...new Set([item.city, item.province].filter((value) => value && value !== item.name))].join(" · ");
        return <li key={item.id}>
          <button type="button" disabled={disabled} onClick={() => { change(item.name); onSelect(item); }} className="flex min-h-11 w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-sky-50 focus-visible:bg-sky-50">
            <MapPin className="h-4 w-4 shrink-0 text-sky-700" aria-hidden="true" />
            <span className="min-w-0"><span className="block break-words font-medium text-[#003366]">{item.name}</span>{jurisdiction && <span className="block text-xs text-slate-600">{jurisdiction}</span>}</span>
          </button>
        </li>;
      })}
    </ul>}
  </div>;
}
