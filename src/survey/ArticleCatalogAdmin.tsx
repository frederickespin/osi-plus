import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Check, Pencil, Plus, RefreshCw, RotateCcw, Search, Upload, X } from "lucide-react";
import { AdministrationIconAction } from "@/administration/AdministrationHelp";
import AdministrationSetupGuide, { ExampleFields, type SetupLesson } from "@/administration/AdministrationSetupGuide";
import { Button } from "@/components/ui/button";
import {
  COMPACT_FORM_FIELD,
  COMPACT_TABLE_BODY,
  COMPACT_TABLE_FIELD,
  COMPACT_TABLE_HEAD,
} from "@/components/ui/compact-form";
import { NumericInput } from "@/components/ui/numeric-input";
import { filterBySearch } from "@/costing/componentLabels";
import { createArticleCatalogApi, type ArticleCatalogEntry } from "./articleCatalogApi";
import type { SurveyCatalog } from "./types";

type Editor = {
  entry: ArticleCatalogEntry;
  name: string;
  synonyms: string;
  volume: string;
  weight: string;
};

const ARTICLE_LIMIT = 500;
const COLLATOR = new Intl.Collator("es-DO", { sensitivity: "base", numeric: true });
const VOLUME = new Intl.NumberFormat("es-DO", { maximumFractionDigits: 6 });
const WEIGHT = new Intl.NumberFormat("es-DO", { maximumFractionDigits: 3 });
const GUIDE_LABELS = { catalog: "Catálogo", article: "Ficha del artículo" } as const;
type GuideTopic = keyof typeof GUIDE_LABELS;
const GUIDE_TOPICS: readonly GuideTopic[] = ["catalog", "article"];
const GUIDE_LESSONS: Record<GuideTopic, SetupLesson> = {
  catalog: {
    title: "Mantén el catálogo en español",
    purpose: "OSi Survey usa la versión publicada para sugerir artículos al empezar un levantamiento.",
    steps: [
      <>Busca por nombre, código o sinónimo. Usa el lápiz para editar un artículo o pulsa <strong>Nuevo artículo</strong> para agregar uno.</>,
      <>Guarda la fila en el borrador de esta pantalla. Puedes editar varias filas antes de publicar.</>,
      <>Pulsa <strong>Publicar catálogo</strong> para que los cambios estén disponibles en los nuevos levantamientos.</>,
    ],
    example: <p>Al buscar «gavetero» puedes encontrar «Cómoda de madera» por su sinónimo.</p>,
    check: "Cada levantamiento conserva la versión del catálogo con la que empezó.",
  },
  article: {
    title: "Completa una ficha por tipo de artículo",
    purpose: "Los valores de la ficha son referencias por unidad para estimar en Survey.",
    steps: [
      <>Escribe un <strong>Nombre del artículo</strong> reconocible en español. Anota los <strong>Sinónimos</strong> separados por comas.</>,
      <>Registra el <strong>Volumen de referencia</strong> en m³ y el <strong>Peso estimado de referencia</strong> en kg cuando conozcas esos datos.</>,
      <>Usa <strong>Guardar en borrador</strong> para conservar la fila mientras preparas el catálogo.</>,
    ],
    example: <ExampleFields rows={[
      ["Nombre", "Sofá de 3 plazas"],
      ["Sinónimos", "Sofá, sillón de sala"],
      ["Volumen de referencia", "1,2 m³"],
      ["Peso estimado de referencia", "84 kg"],
    ]} />,
    check: "En el ejemplo, 1,2 m³ × 70 kg/m³ da 84 kg estimados. El peso medido se obtiene en la báscula.",
  },
};

function newEntry(): ArticleCatalogEntry {
  return {
    code: "ART_" + crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase(),
    name: "",
    aliases: [],
    frequentAreaRefs: [],
    defaultVolumeM3: null,
    defaultWeightKg: null,
  };
}

function toEditor(entry: ArticleCatalogEntry): Editor {
  return {
    entry,
    name: entry.name,
    synonyms: entry.aliases.join(", "),
    volume: entry.defaultVolumeM3?.toString() ?? "",
    weight: entry.defaultWeightKg?.toString() ?? "",
  };
}

function optionalDecimal(value: string) {
  return value.trim() ? Number(value.trim().replace(",", ".")) : null;
}

function errorMessage(cause: unknown, fallback: string) {
  if (typeof cause !== "object" || cause === null) return fallback;
  if ("status" in cause && cause.status === 403) return "Tu sesión no tiene acceso al catálogo de artículos.";
  if ("code" in cause && cause.code === "CRM_SURVEY_VERSION_CONFLICT") {
    return "Existe una versión más reciente. Tu borrador sigue aquí. Para partir de la versión vigente, descarta el borrador y actualiza el listado.";
  }
  if ("code" in cause && cause.code === "CRM_SURVEY_CONFIGURATION_INVALID") {
    return "El catálogo está pendiente de configuración en este entorno.";
  }
  return fallback;
}

function isUnauthorized(cause: unknown) {
  return typeof cause === "object" && cause !== null && "status" in cause && cause.status === 401;
}

export default function ArticleCatalogAdmin({ authorization, onUnauthorized }: {
  authorization?: string;
  onUnauthorized: () => void;
}) {
  const formId = useId();
  const api = useMemo(() => createArticleCatalogApi(authorization), [authorization]);
  const readRef = useRef<AbortController | null>(null);
  const [snapshot, setSnapshot] = useState<{ catalog: SurveyCatalog | null } | null>(null);
  const [changes, setChanges] = useState<readonly ArticleCatalogEntry[]>([]);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [rowError, setRowError] = useState("");

  const refresh = useCallback(async () => {
    readRef.current?.abort();
    const request = new AbortController();
    readRef.current = request;
    setLoading(true);
    setError("");
    try {
      const catalog = await api.catalog(request.signal);
      if (!request.signal.aborted) setSnapshot({ catalog });
    } catch (cause) {
      if (request.signal.aborted) return;
      setSnapshot(null);
      if (isUnauthorized(cause)) onUnauthorized();
      else setError(errorMessage(cause, "No se pudo cargar el catálogo. Actualiza el listado para volver a intentarlo."));
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }, [api, onUnauthorized]);

  useEffect(() => {
    setSnapshot(null);
    setChanges([]);
    setEditor(null);
    setPublishing(false);
    setNotice("");
    setRowError("");
    void refresh();
    return () => readRef.current?.abort();
  }, [refresh]);

  const rows = useMemo(() => {
    const entries = new Map<string, ArticleCatalogEntry>();
    for (const item of snapshot?.catalog?.articles ?? []) entries.set(item.code, item);
    for (const item of changes) entries.set(item.code, item);
    return [...entries.values()];
  }, [changes, snapshot]);
  const shown = rows
    .filter((item) => item.code === editor?.entry.code ||
      filterBySearch([item.name, ...item.aliases, item.code].join(" "), search))
    .sort((a, b) => COLLATOR.compare(a.name, b.name));
  const busy = loading || publishing;
  const editingNewRow = editor && !rows.some((item) => item.code === editor.entry.code);

  function start(entry: ArticleCatalogEntry = newEntry()) {
    setRowError("");
    setEditor(toEditor(entry));
  }

  function stage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || busy) return;
    const name = editor.name.trim();
    const aliases = editor.synonyms === editor.entry.aliases.join(", ")
      ? editor.entry.aliases
      : [...new Set(editor.synonyms.split(",").map((part) => part.trim()).filter(Boolean))];
    const defaultVolumeM3 = optionalDecimal(editor.volume);
    const defaultWeightKg = optionalDecimal(editor.weight);
    if (!name) {
      setRowError("Escribe el nombre del artículo.");
      return;
    }
    if (aliases.length > 20 || aliases.some((alias) => alias.length > 80)) {
      setRowError("Registra hasta 20 sinónimos, con un máximo de 80 caracteres por sinónimo.");
      return;
    }
    if ((defaultVolumeM3 !== null && !Number.isFinite(defaultVolumeM3)) ||
      (defaultWeightKg !== null && !Number.isFinite(defaultWeightKg))) {
      setRowError("Revisa el volumen y el peso estimado.");
      return;
    }
    const entry = { ...editor.entry, name, aliases, defaultVolumeM3, defaultWeightKg };
    setChanges((prior) => [...prior.filter((item) => item.code !== entry.code), entry]);
    setEditor(null);
    setRowError("");
    setNotice("");
  }

  async function publish() {
    if (!snapshot || busy || editor || !changes.length) return;
    const scope = readRef.current?.signal;
    setPublishing(true);
    setError("");
    setNotice("");
    const result = await api.publish(snapshot.catalog, rows).catch((cause: unknown) => {
      if (scope?.aborted) return;
      if (isUnauthorized(cause)) onUnauthorized();
      else setError(errorMessage(cause, "No se pudo confirmar la publicación. Tu borrador sigue disponible para reintentar."));
    });
    if (scope?.aborted) return;
    setPublishing(false);
    if (!result) return;
    setChanges([]);
    setNotice(`Versión ${result.version} publicada.`);
    await refresh();
  }

  const editorRow = editor && <tr className="bg-sky-50">
    <td className="break-words font-mono text-slate-500">{editor.entry.code}</td>
    <td><input form={formId} aria-label="Nombre del artículo" placeholder="Nombre del artículo"
      className={COMPACT_TABLE_FIELD} maxLength={160} required disabled={busy}
      value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} /></td>
    <td><input form={formId} aria-label="Sinónimos" placeholder="Separados por coma"
      className={COMPACT_TABLE_FIELD} disabled={busy} value={editor.synonyms}
      onChange={(event) => setEditor({ ...editor, synonyms: event.target.value })} /></td>
    <td><NumericInput form={formId} aria-label="Volumen de referencia (m³)" placeholder="—"
      className={COMPACT_TABLE_FIELD + " text-right"} allowDecimalComma min={0} max="999999.999999" step="0.000001" disabled={busy}
      value={editor.volume} onChange={(event) => setEditor({ ...editor, volume: event.target.value })} /></td>
    <td><NumericInput form={formId} aria-label="Peso estimado de referencia (kg)" placeholder="—"
      className={COMPACT_TABLE_FIELD + " text-right"} allowDecimalComma min={0} max={1_000_000} step="0.001" disabled={busy}
      value={editor.weight} onChange={(event) => setEditor({ ...editor, weight: event.target.value })} /></td>
    <td><form id={formId} onSubmit={stage} className="flex justify-end gap-1">
      <AdministrationIconAction type="submit" label="Guardar en borrador" disabled={busy || !editor.name.trim()}>
        <Check aria-hidden="true" className="size-4 text-emerald-700" />
      </AdministrationIconAction>
      <AdministrationIconAction label="Cancelar edición" disabled={busy} onClick={() => { setEditor(null); setRowError(""); }}>
        <X aria-hidden="true" className="size-4" />
      </AdministrationIconAction>
    </form></td>
  </tr>;

  return <section lang="es" className="min-w-0 space-y-2" data-testid="article-catalog-admin">
    <AdministrationSetupGuide title="Catálogo de artículos" activeTopic={editor ? "article" : "catalog"}
      topics={GUIDE_TOPICS} labels={GUIDE_LABELS} lessons={GUIDE_LESSONS}
      actions={<Button type="button" size="sm" disabled={busy || !!editor || !changes.length} onClick={() => void publish()}>
        <Upload aria-hidden="true" />{publishing ? "Publicando…" : "Publicar catálogo"}
      </Button>}
      navigation={<div className="flex flex-wrap items-center gap-2 border-b border-slate-200 py-1.5">
        <div className="relative flex min-w-40 max-w-sm flex-1 items-center">
          <Search aria-hidden="true" className="absolute left-2 size-4 text-slate-500" />
          <input aria-label="Buscar artículo" placeholder="Buscar artículo o sinónimo" className={COMPACT_FORM_FIELD + " w-full pl-8"}
            value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <AdministrationIconAction label="Nuevo artículo" mobileLabel="Nuevo"
          disabled={busy || !snapshot || !!editor || rows.length >= ARTICLE_LIMIT} onClick={() => start()}>
          <Plus aria-hidden="true" className="size-4" />
        </AdministrationIconAction>
        <AdministrationIconAction label="Actualizar catálogo" disabled={busy || !!editor || !!changes.length} onClick={() => void refresh()}>
          <RefreshCw aria-hidden="true" className="size-4" />
        </AdministrationIconAction>
        {!!changes.length && <AdministrationIconAction label="Descartar borrador" disabled={busy || !!editor}
          onClick={() => { setChanges([]); setError(""); }}>
          <RotateCcw aria-hidden="true" className="size-4" />
        </AdministrationIconAction>}
        {snapshot && <span className="text-xs text-slate-600">
          {snapshot.catalog ? `Versión ${snapshot.catalog.version} · ` : ""}{rows.length} artículos
          {!!changes.length && ` · ${changes.length} sin publicar`}
        </span>}
      </div>}>
      {loading && <p role="status" className="py-2 text-xs text-slate-600">Cargando catálogo…</p>}
      {notice && <p role="status" className="py-2 text-xs text-emerald-700">{notice}</p>}
      {error && <p role="alert" className="py-2 text-xs text-red-800">{error}</p>}
      {rowError && <p role="alert" className="py-2 text-xs text-red-800">{rowError}</p>}
      {snapshot && <div className="max-h-[max(15rem,calc(100dvh-16rem))] overflow-auto border-b border-slate-200">
        <table aria-label="Artículos del catálogo" className="w-full min-w-[650px] table-fixed text-left">
          <thead className={COMPACT_TABLE_HEAD}><tr>
            <th scope="col" className="w-[13%]">Código</th>
            <th scope="col" className="w-[24%]">Artículo</th>
            <th scope="col" className="w-[25%]">Sinónimos</th>
            <th scope="col" className="w-[12%] text-right">Volumen m³</th>
            <th scope="col" className="w-[14%] text-right">Peso estimado kg</th>
            <th scope="col" className="w-[12%]"><span className="sr-only">Acciones</span></th>
          </tr></thead>
          <tbody className={COMPACT_TABLE_BODY}>
            {editingNewRow && editorRow}
            {shown.map((item) => item.code === editor?.entry.code
              ? <Fragment key={item.code}>{editorRow}</Fragment>
              : <tr key={item.code} className="h-9 text-slate-700 hover:bg-slate-50">
                <td className="break-words font-mono text-slate-500">{item.code}</td>
                <td className="break-words font-semibold text-slate-900">
                  {item.name}
                  {changes.some((entry) => entry.code === item.code) && <span className="ml-1 text-[10px] font-normal text-sky-700">Borrador</span>}
                </td>
                <td className="break-words">{item.aliases.join(", ") || "—"}</td>
                <td className="text-right tabular-nums">{item.defaultVolumeM3 === null ? "—" : VOLUME.format(item.defaultVolumeM3)}</td>
                <td className="text-right tabular-nums">{item.defaultWeightKg === null ? "—" : WEIGHT.format(item.defaultWeightKg)}</td>
                <td><div className="flex justify-end">
                  <AdministrationIconAction label={`Editar artículo ${item.name}`} disabled={busy || !!editor}
                    className="border-transparent bg-transparent" onClick={() => start(item)}>
                    <Pencil aria-hidden="true" className="size-4" />
                  </AdministrationIconAction>
                </div></td>
              </tr>)}
            {!shown.length && !editor && <tr><td colSpan={6} className="h-11 text-slate-500">
              {search.trim() ? "Sin coincidencias." : "Agrega el primer artículo para empezar el catálogo."}
            </td></tr>}
          </tbody>
        </table>
      </div>}
    </AdministrationSetupGuide>
  </section>;
}
