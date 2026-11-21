import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type Ref } from "react";
import { Check, FileDown, FileUp, Pencil, Plus, RefreshCw, RotateCcw, Search, Upload, X } from "lucide-react";
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
import { createArticleCatalogApi, type ArticleCatalogEntry, type ArticleCatalogRevision } from "./articleCatalogApi";
import {
  ARTICLE_CATALOG_LIMIT,
  createArticleCatalogCode,
  downloadArticleCatalogTemplate,
  readArticleCatalogImport,
  type ArticleCatalogImportPlan,
} from "./articleCatalogSpreadsheet";

type Editor = {
  entry: ArticleCatalogEntry;
  name: string;
  synonyms: string;
  volume: string;
};

const COLLATOR = new Intl.Collator("es-DO", { sensitivity: "base", numeric: true });
const VOLUME = new Intl.NumberFormat("es-DO", { maximumFractionDigits: 6 });
const GUIDE_LABELS = { catalog: "Catálogo", article: "Ficha del artículo", excel: "Importación de Excel" } as const;
type GuideTopic = keyof typeof GUIDE_LABELS;
const GUIDE_TOPICS: readonly GuideTopic[] = ["catalog", "article", "excel"];
const GUIDE_LESSONS: Record<GuideTopic, SetupLesson> = {
  catalog: {
    title: "Mantén el catálogo en español",
    purpose: "Los procesos que usan el catálogo consultan los mismos artículos, sinónimos y volúmenes.",
    steps: [
      <>Busca por nombre, código o sinónimo. Usa el lápiz para editar un artículo o pulsa <strong>Nuevo artículo</strong> para agregar uno.</>,
      <>Guarda la fila en el borrador de esta pantalla. Puedes editar varias filas antes de publicar.</>,
      <>Pulsa <strong>Publicar catálogo</strong> para que la nueva versión esté disponible para los procesos que consultan el catálogo.</>,
    ],
    example: <p>Al buscar «gavetero» puedes encontrar «Cómoda de madera» por su sinónimo.</p>,
    check: "Las versiones publicadas se conservan para consultar los registros anteriores.",
  },
  article: {
    title: "Completa una ficha por tipo de artículo",
    purpose: "El volumen de referencia corresponde a una unidad del artículo.",
    steps: [
      <>Escribe un <strong>Nombre del artículo</strong> reconocible en español. Anota los <strong>Sinónimos</strong> separados por comas.</>,
      <>Registra el <strong>Volumen de referencia</strong> en m³ si lo conoces.</>,
      <>Usa <strong>Guardar en borrador</strong> para conservar la fila mientras preparas el catálogo.</>,
    ],
    example: <ExampleFields rows={[
      ["Nombre", "Sofá de 3 plazas"],
      ["Sinónimos", "Sofá, sillón de sala"],
      ["Volumen de referencia", "1,2 m³"],
    ]} />,
    check: "El peso volumétrico se calcula con los parámetros de la tarifa del servicio aéreo, marítimo o terrestre.",
  },
  excel: {
    title: "Carga varios artículos desde Excel",
    purpose: "Usa la plantilla descargable o un archivo Excel con una columna Artículo o Nombre.",
    steps: [
      <>Registra un artículo por fila y escribe el volumen por unidad en m³.</>,
      <>Para actualizar un artículo, usa su <strong>Código</strong> del catálogo. Si lo dejas vacío, la importación buscará una coincidencia exacta por nombre o asignará un código nuevo.</>,
      <>Pulsa <strong>Importar archivo de Excel</strong>, revisa las filas y aplica los cambios al borrador. Usa <strong>Publicar catálogo</strong> cuando termines.</>,
    ],
    example: <ExampleFields rows={[
      ["Artículo", "Sofá de 3 plazas"],
      ["Sinónimos", "Sofá, sillón de sala"],
      ["Volumen m³", "1,2"],
    ]} />,
    check: "Los artículos que no estén en el archivo se conservan.",
  },
};

function newEntry(): ArticleCatalogEntry {
  return {
    code: createArticleCatalogCode(),
    name: "",
    aliases: [],
    defaultVolumeM3: null,
  };
}

function toEditor(entry: ArticleCatalogEntry): Editor {
  return {
    entry,
    name: entry.name,
    synonyms: entry.aliases.join(", "),
    volume: entry.defaultVolumeM3?.toString() ?? "",
  };
}

function optionalDecimal(value: string) {
  return value.trim() ? Number(value.trim().replace(",", ".")) : null;
}

function errorMessage(cause: unknown, fallback: string) {
  if (typeof cause !== "object" || cause === null) return fallback;
  if ("status" in cause && cause.status === 403) return "Tu sesión no tiene acceso al catálogo de artículos.";
  if ("status" in cause && cause.status === 413) return "El catálogo supera el tamaño permitido para publicarlo. Revisa la longitud de los nombres y sinónimos.";
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

const IMPORT_STATUS = {
  create: { label: "Nuevo", className: "text-emerald-700" },
  update: { label: "Actualizar", className: "text-sky-700" },
  unchanged: { label: "Sin cambios", className: "text-slate-600" },
  error: { label: "Error", className: "text-red-700" },
};

function ArticleImportReview({ name, plan, heading, busy, onCancel, onApply }: {
  name: string;
  plan: ArticleCatalogImportPlan;
  heading: Ref<HTMLHeadingElement>;
  busy: boolean;
  onCancel: () => void;
  onApply: () => void;
}) {
  const counts = { create: 0, update: 0, unchanged: 0, error: 0 };
  for (const row of plan.rows) counts[row.status] += 1;
  return <section aria-label="Revisión de Excel" className="min-w-0 space-y-2">
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 py-2">
      <div className="min-w-0">
        <h3 ref={heading} tabIndex={-1} className="text-sm font-semibold text-[#003366]">Revisar importación</h3>
        <p className="break-words text-xs text-slate-600">{name}</p>
      </div>
      <div className="flex flex-wrap justify-end gap-1.5">
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onCancel}>Cancelar</Button>
        <Button type="button" size="sm" disabled={busy || !!plan.error || counts.error > 0 || !plan.entries.length}
          onClick={onApply}><Check aria-hidden="true" />Aplicar al borrador</Button>
      </div>
    </div>
    {plan.error && <p role="alert" className="text-xs font-medium text-red-800">{plan.error}</p>}
    {plan.rows.length > 0 && <>
      <p className="text-xs text-slate-600">
        {counts.create} nuevos · {counts.update} por actualizar · {counts.unchanged} sin cambios
        {counts.error > 0 && <span className="text-red-800"> · {counts.error} con errores</span>}
      </p>
      {counts.error > 0 && <p role="alert" className="text-xs text-red-800">Corrige las filas señaladas y vuelve a cargar el archivo.</p>}
      <div className="max-h-[max(12rem,calc(100dvh-20rem))] overflow-auto border-b border-slate-200">
        <table aria-label="Filas del archivo de Excel" className="w-full min-w-[620px] table-fixed text-left">
          <thead className={COMPACT_TABLE_HEAD}><tr>
            <th scope="col" className="w-[7%]">Fila</th>
            <th scope="col" className="w-[16%]">Código</th>
            <th scope="col" className="w-[21%]">Artículo</th>
            <th scope="col" className="w-[20%]">Sinónimos</th>
            <th scope="col" className="w-[11%] text-right">Volumen m³</th>
            <th scope="col">Resultado</th>
          </tr></thead>
          <tbody className={COMPACT_TABLE_BODY}>
            {plan.rows.map((row) => <tr key={row.row} className="h-9 text-slate-700">
              <td>{row.row}</td>
              <td className="break-words font-mono text-slate-500">{row.code || "—"}</td>
              <td className="break-words font-medium">{row.name || "—"}</td>
              <td className="break-words">{row.aliases.join(", ") || "—"}</td>
              <td className="text-right tabular-nums">{row.defaultVolumeM3 === null ? "—" : VOLUME.format(row.defaultVolumeM3)}</td>
              <td className={`break-words font-medium ${IMPORT_STATUS[row.status].className}`}>{row.error ?? IMPORT_STATUS[row.status].label}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </>}
  </section>;
}

export default function ArticleCatalogAdmin({ authorization, onUnauthorized }: {
  authorization?: string;
  onUnauthorized: () => void;
}) {
  const formId = useId();
  const api = useMemo(() => createArticleCatalogApi(authorization), [authorization]);
  const readRef = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const [snapshot, setSnapshot] = useState<{ catalog: ArticleCatalogRevision | null } | null>(null);
  const [changes, setChanges] = useState<readonly ArticleCatalogEntry[]>([]);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [rowError, setRowError] = useState("");
  const [readingExcel, setReadingExcel] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [workbook, setWorkbook] = useState<{ name: string; plan: ArticleCatalogImportPlan } | null>(null);

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
    setReadingExcel(false);
    setWorkbook(null);
    void refresh();
    return () => readRef.current?.abort();
  }, [refresh]);

  useEffect(() => {
    if (workbook) reviewHeading.current?.focus();
  }, [workbook]);

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
  const busy = loading || publishing || readingExcel;
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
    if (!name) {
      setRowError("Escribe el nombre del artículo.");
      return;
    }
    if (aliases.length > 20 || aliases.some((alias) => alias.length > 80)) {
      setRowError("Registra hasta 20 sinónimos, con un máximo de 80 caracteres por sinónimo.");
      return;
    }
    if (defaultVolumeM3 !== null && !Number.isFinite(defaultVolumeM3)) {
      setRowError("Revisa el volumen de referencia.");
      return;
    }
    const entry = { ...editor.entry, name, aliases, defaultVolumeM3 };
    setChanges((prior) => [...prior.filter((item) => item.code !== entry.code), entry]);
    setEditor(null);
    setRowError("");
    setNotice("");
  }

  async function downloadTemplate() {
    setDownloadingTemplate(true);
    setError("");
    try {
      await downloadArticleCatalogTemplate();
    } catch {
      setError("No se pudo descargar la plantilla. Inténtalo de nuevo.");
    } finally {
      setDownloadingTemplate(false);
    }
  }

  async function importWorkbook(file: File) {
    if (!snapshot || busy || editor) return;
    const scope = readRef.current?.signal;
    setReadingExcel(true);
    setWorkbook(null);
    setError("");
    setNotice("");
    try {
      const plan = await readArticleCatalogImport(file, rows);
      if (!scope?.aborted) setWorkbook({ name: file.name, plan });
    } catch {
      if (!scope?.aborted) setError("No se pudo leer el archivo. Comprueba que sea un Excel válido (.xlsx o .xls).");
    } finally {
      if (!scope?.aborted) setReadingExcel(false);
    }
  }

  function applyImport() {
    if (busy || !workbook || workbook.plan.error ||
      !workbook.plan.entries.length || workbook.plan.rows.some((row) => row.status === "error")) return;
    const incoming = new Map(workbook.plan.entries.map((entry) => [entry.code, entry]));
    setChanges((prior) => [...prior.filter((entry) => !incoming.has(entry.code)), ...incoming.values()]);
    setSearch("");
    setWorkbook(null);
    setNotice(`${incoming.size} ${incoming.size === 1 ? "artículo agregado o actualizado" : "artículos agregados o actualizados"} en el borrador.`);
  }

  async function publish() {
    if (!snapshot || busy || editor || workbook || !changes.length) return;
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
    <AdministrationSetupGuide title="Catálogo de artículos" activeTopic={workbook ? "excel" : editor ? "article" : "catalog"}
      topics={GUIDE_TOPICS} labels={GUIDE_LABELS} lessons={GUIDE_LESSONS}
      actions={<Button type="button" size="sm" disabled={busy || !!editor || !!workbook || !changes.length} onClick={() => void publish()}>
        <Upload aria-hidden="true" />{publishing ? "Publicando…" : "Publicar catálogo"}
      </Button>}
      navigation={<div className="flex flex-wrap items-center gap-2 border-b border-slate-200 py-1.5">
        <div className="relative flex min-w-40 max-w-sm flex-1 items-center">
          <Search aria-hidden="true" className="absolute left-2 size-4 text-slate-500" />
          <input aria-label="Buscar artículo" placeholder="Buscar artículo o sinónimo" className={COMPACT_FORM_FIELD + " w-full pl-8"}
            disabled={!!workbook} value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <AdministrationIconAction label="Nuevo artículo" mobileLabel="Nuevo"
          disabled={busy || !snapshot || !!editor || !!workbook || rows.length >= ARTICLE_CATALOG_LIMIT} onClick={() => start()}>
          <Plus aria-hidden="true" className="size-4" />
        </AdministrationIconAction>
        <input ref={fileInput} type="file" hidden accept=".xlsx,.xls" aria-label="Seleccionar archivo de Excel"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void importWorkbook(file);
          }} />
        <div className="flex shrink-0 gap-1" role="group" aria-label="Importación de Excel">
          <AdministrationIconAction label="Descargar plantilla de Excel" disabled={downloadingTemplate}
            onClick={() => void downloadTemplate()}>
            <FileDown aria-hidden="true" className="size-4" />
          </AdministrationIconAction>
          <AdministrationIconAction label="Importar archivo de Excel" disabled={busy || !snapshot || !!editor}
            onClick={() => fileInput.current?.click()}>
            <FileUp aria-hidden="true" className="size-4" />
          </AdministrationIconAction>
        </div>
        <AdministrationIconAction label="Actualizar catálogo" disabled={busy || !!editor || !!workbook || !!changes.length} onClick={() => void refresh()}>
          <RefreshCw aria-hidden="true" className="size-4" />
        </AdministrationIconAction>
        {!!changes.length && <AdministrationIconAction label="Descartar borrador" disabled={busy || !!editor || !!workbook}
          onClick={() => { setChanges([]); setError(""); }}>
          <RotateCcw aria-hidden="true" className="size-4" />
        </AdministrationIconAction>}
        {snapshot && <span className="text-xs text-slate-600">
          {snapshot.catalog ? `Versión ${snapshot.catalog.version} · ` : ""}{rows.length} artículos
          {!!changes.length && ` · ${changes.length} sin publicar`}
        </span>}
      </div>}>
      {loading && <p role="status" className="py-2 text-xs text-slate-600">Cargando catálogo…</p>}
      {readingExcel && <p role="status" className="py-2 text-xs text-slate-600">Leyendo archivo de Excel…</p>}
      {notice && <p role="status" className="py-2 text-xs text-emerald-700">{notice}</p>}
      {error && <p role="alert" className="py-2 text-xs text-red-800">{error}</p>}
      {rowError && <p role="alert" className="py-2 text-xs text-red-800">{rowError}</p>}
      {workbook && <ArticleImportReview name={workbook.name} plan={workbook.plan} heading={reviewHeading}
        busy={busy} onCancel={() => setWorkbook(null)} onApply={applyImport} />}
      {snapshot && !workbook && <div className="max-h-[max(15rem,calc(100dvh-16rem))] overflow-auto border-b border-slate-200">
        <table aria-label="Artículos del catálogo" className="w-full min-w-[580px] table-fixed text-left">
          <thead className={COMPACT_TABLE_HEAD}><tr>
            <th scope="col" className="w-[16%]">Código</th>
            <th scope="col" className="w-[30%]">Artículo</th>
            <th scope="col" className="w-[27%]">Sinónimos</th>
            <th scope="col" className="w-[15%] text-right">Volumen m³</th>
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
                <td><div className="flex justify-end">
                  <AdministrationIconAction label={`Editar artículo ${item.name}`} disabled={busy || !!editor}
                    className="border-transparent bg-transparent" onClick={() => start(item)}>
                    <Pencil aria-hidden="true" className="size-4" />
                  </AdministrationIconAction>
                </div></td>
              </tr>)}
            {!shown.length && !editor && <tr><td colSpan={5} className="h-11 text-slate-500">
              {search.trim() ? "Sin coincidencias." : "Agrega el primer artículo para empezar el catálogo."}
            </td></tr>}
          </tbody>
        </table>
      </div>}
    </AdministrationSetupGuide>
  </section>;
}
