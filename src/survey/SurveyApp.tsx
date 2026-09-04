import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Download,
  MapPin,
  Minus,
  Plus,
  Search,
  Signature,
  Trash2,
} from "lucide-react";
import { createSurveyApi } from "./api";
import { SignaturePad, type SignaturePoint } from "./SignaturePad";
import type {
  SurveyAccess,
  SurveyAssignment,
  SurveyDraft,
  SurveyItem,
} from "./types";

type Screen =
  "AGENDA" | "INVENTORY" | "ACCESS" | "REVIEW" | "SIGN" | "PUBLISHED";
const MODES = ["LOCAL", "ROAD", "AIR", "SEA", "STORAGE"] as const;
const CONDITIONS = ["GOOD", "USED", "DAMAGED", "PRE_EXISTING_DAMAGE"] as const;
const FLAGS = [
  ["CRATING_CANDIDATE", "Huacal"],
  ["FRAGILE", "Frágil"],
  ["ASSEMBLE", "Armar"],
  ["DISASSEMBLE", "Desarmar"],
  ["CRANE_CANDIDATE", "Grúa"],
  ["VALUABLE", "Valioso"],
  ["OVERSIZED", "Sobredimensionado"],
] as const;
const ACCESS_FLAGS = [
  ["STAIRS", "Escaleras"],
  ["PASSENGER_ELEVATOR", "Elevador"],
  ["FREIGHT_ELEVATOR", "Elevador de carga"],
  ["NARROW_PASSAGE", "Paso estrecho"],
  ["LONG_CARRY", "Acarreo largo"],
  ["RESTRICTED_PARKING", "Parqueo restringido"],
  ["LOADING_DOCK", "Muelle"],
  ["RESTRICTED_HOURS", "Horario restringido"],
  ["PERMIT_REQUIRED", "Permiso"],
  ["CRANE_OR_HOIST", "Grúa/polipasto"],
] as const;
const label: Record<string, string> = {
  ASSIGNED: "Asignada",
  ARRIVED: "Llegada registrada",
  IN_PROGRESS: "En progreso",
  READY_FOR_REVIEW: "Lista para revisión",
  GOOD: "Bueno",
  USED: "Usado",
  DAMAGED: "Averiado",
  PRE_EXISTING_DAMAGE: "Daño preexistente",
  ORIGIN: "Origen",
  DESTINATION: "Destino",
};

function Button({
  children,
  secondary = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { secondary?: boolean }) {
  return (
    <button
      {...props}
      className={`${secondary ? "border border-slate-300 bg-white text-slate-800" : "bg-[#00447c] text-white"} min-h-11 rounded-xl px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50 ${props.className || ""}`}
    >
      {children}
    </button>
  );
}
function Field({
  label: fieldLabel,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs font-bold uppercase tracking-wide text-slate-600">
      <span className="mb-1.5 block">{fieldLabel}</span>
      {children}
    </label>
  );
}
const inputClass =
  "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

function Agenda({
  rows,
  busy,
  onAction,
}: {
  rows: readonly SurveyAssignment[];
  busy: boolean;
  onAction: (row: SurveyAssignment, operation: string) => void;
}) {
  const [now] = useState(() => Date.now());
  const upcoming = rows.find(
    (row) =>
      new Date(row.scheduledStart).getTime() >= now &&
      row.status !== "CANCELLED",
  );
  return (
    <section className="mx-auto max-w-4xl p-4 sm:p-6">
      <header className="mb-5">
        <p className="text-xs font-black uppercase tracking-[.2em] text-indigo-600">
          OSi Survey
        </p>
        <h1 className="mt-1 text-2xl font-black text-slate-950">
          Agenda de visitas
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Hechos observados, borrador persistente y publicaciones inmutables.
        </p>
      </header>
      {upcoming && (
        <div className="mb-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
          <p className="text-xs font-bold uppercase text-indigo-700">
            Próxima visita
          </p>
          <p className="mt-1 font-black">
            {upcoming.caseCode} · {upcoming.clientDisplayName || "Sin Client"}
          </p>
        </div>
      )}
      <div className="space-y-3">
        {rows.map((row) => {
          const distant =
            new Date(row.scheduledStart).getTime() - now > 7 * 864e5;
          return (
            <article
              key={row.assignmentRef}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-bold uppercase text-slate-500">
                    {new Date(row.scheduledStart).toLocaleString()}
                  </p>
                  <h2 className="mt-1 text-lg font-black">
                    {row.clientDisplayName || "Sin Client"}
                  </h2>
                  <p className="text-sm font-semibold text-[#00447c]">
                    {row.caseCode} · {label[row.status] || row.status}
                  </p>
                </div>
                {distant && (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">
                    Visita distante
                  </span>
                )}
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-bold text-slate-500">Origen</dt>
                  <dd>{row.context.origin || "No disponible"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold text-slate-500">Destino</dt>
                  <dd>{row.context.destination || "No disponible"}</dd>
                </div>
              </dl>
              {row.instruction && (
                <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
                  <strong>Instrucciones:</strong> {row.instruction}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                {!row.arrivalAt && (
                  <Button
                    disabled={busy}
                    onClick={() => onAction(row, "ARRIVAL_RECORD")}
                  >
                    <MapPin className="mr-2 inline h-4 w-4" />
                    Llegué
                  </Button>
                )}
                {row.arrivalAt && !row.punctualityConfirmedAt && (
                  <Button
                    secondary
                    disabled={busy}
                    onClick={() => onAction(row, "PUNCTUALITY_CONFIRM")}
                  >
                    <Check className="mr-2 inline h-4 w-4" />
                    Llegué a la hora acordada
                  </Button>
                )}
                <Button
                  disabled={busy}
                  onClick={() => onAction(row, "START_SURVEY")}
                >
                  {row.surveyRef ? "Continuar Survey" : "Iniciar Survey"}
                </Button>
              </div>
            </article>
          );
        })}
        {rows.length === 0 && (
          <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-500">
            No hay visitas asignadas para esta membresía.
          </div>
        )}
      </div>
    </section>
  );
}

function ItemEditor({
  draft,
  busy,
  onSave,
  onPhoto,
  onDelete,
}: {
  draft: SurveyDraft;
  busy: boolean;
  onSave: (payload: Record<string, unknown>) => void;
  onPhoto: (item: SurveyItem, file: File) => void;
  onDelete: (item: SurveyItem) => void;
}) {
  const [selectedArea, setSelectedArea] = useState(
    draft.catalog.areas[0]?.areaRef || "",
  );
  const [mode, setMode] = useState<(typeof MODES)[number]>("LOCAL");
  const [query, setQuery] = useState("");
  const [articleRef, setArticleRef] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [condition, setCondition] =
    useState<(typeof CONDITIONS)[number]>("GOOD");
  const [flags, setFlags] = useState<string[]>([]);
  const [unit, setUnit] = useState<"CM" | "IN">("CM");
  const [dimensions, setDimensions] = useState({
    length: "",
    width: "",
    height: "",
  });
  const [editing, setEditing] = useState<SurveyItem | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    searchRef.current?.focus();
  }, []);
  const articles = useMemo(
    () =>
      draft.catalog.articles
        .filter(
          (article) =>
            !query ||
            `${article.name} ${article.code} ${article.aliases.join(" ")}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .sort(
          (a, b) =>
            Number(b.frequentAreaRefs.includes(selectedArea)) -
            Number(a.frequentAreaRefs.includes(selectedArea)),
        ),
    [draft.catalog.articles, query, selectedArea],
  );
  const items = draft.items.filter(
    (item) => item.area.areaRef === selectedArea,
  );
  const reset = () => {
    setArticleRef("");
    setQuery("");
    setQuantity(1);
    setCondition("GOOD");
    setFlags([]);
    setDimensions({ length: "", width: "", height: "" });
    setEditing(null);
    queueMicrotask(() => searchRef.current?.focus());
  };
  const edit = (item: SurveyItem) => {
    setEditing(item);
    setSelectedArea(item.area.areaRef);
    setArticleRef(item.article.articleRef);
    setQuery(item.article.name);
    setQuantity(item.quantity);
    setCondition(item.condition as (typeof CONDITIONS)[number]);
    setFlags([...item.flags]);
    setMode(item.shipmentMode as (typeof MODES)[number]);
    if (item.dimensions) {
      setUnit(item.dimensions.unit);
      setDimensions({
        length: String(item.dimensions.length),
        width: String(item.dimensions.width),
        height: String(item.dimensions.height),
      });
    }
  };
  const submit = () => {
    const completeDimensions =
      dimensions.length && dimensions.width && dimensions.height
        ? {
            unit,
            length: Number(dimensions.length),
            width: Number(dimensions.width),
            height: Number(dimensions.height),
          }
        : null;
    onSave({
      expectedDraftVersion: draft.version,
      itemRef: editing?.itemRef || null,
      expectedItemVersion: editing?.version || null,
      articleRef,
      areaRef: selectedArea,
      shipmentMode: mode,
      quantity,
      condition,
      flags,
      dimensions: completeDimensions,
      note: null,
    });
    reset();
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-2xl border bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Área / habitación">
            <select
              className={inputClass}
              value={selectedArea}
              onChange={(event) => setSelectedArea(event.target.value)}
            >
              {draft.catalog.areas.map((area) => (
                <option key={area.areaRef} value={area.areaRef}>
                  {area.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Modo">
            <select
              className={inputClass}
              value={mode}
              onChange={(event) =>
                setMode(event.target.value as (typeof MODES)[number])
              }
            >
              {MODES.map((entry) => (
                <option key={entry}>{entry}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Buscar artículo">
          <div className="relative">
            <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
            <input
              ref={searchRef}
              className={`${inputClass} pl-10`}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setArticleRef("");
              }}
              autoComplete="off"
            />
          </div>
        </Field>
        <div className="mt-2 max-h-44 overflow-y-auto rounded-xl border">
          {articles.slice(0, 12).map((article) => (
            <button
              type="button"
              key={article.articleRef}
              className={`block min-h-11 w-full border-b px-3 text-left text-sm last:border-0 ${articleRef === article.articleRef ? "bg-indigo-50 font-bold text-indigo-800" : "bg-white"}`}
              onClick={() => {
                setArticleRef(article.articleRef);
                setQuery(article.name);
              }}
            >
              {article.name}
              <small className="ml-2 text-slate-400">{article.code}</small>
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Field label="Cantidad">
            <div className="flex">
              <button
                type="button"
                aria-label="Reducir cantidad"
                className="h-11 w-11 rounded-l-xl border"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
              >
                <Minus className="mx-auto h-4 w-4" />
              </button>
              <input
                aria-label="Cantidad"
                className="h-11 min-w-0 flex-1 border-y text-center"
                inputMode="numeric"
                value={quantity}
                onChange={(event) =>
                  setQuantity(
                    Math.max(1, Math.min(999, Number(event.target.value) || 1)),
                  )
                }
              />
              <button
                type="button"
                aria-label="Aumentar cantidad"
                className="h-11 w-11 rounded-r-xl border"
                onClick={() => setQuantity(Math.min(999, quantity + 1))}
              >
                <Plus className="mx-auto h-4 w-4" />
              </button>
            </div>
          </Field>
          <Field label="Condición">
            <select
              className={inputClass}
              value={condition}
              onChange={(event) =>
                setCondition(event.target.value as (typeof CONDITIONS)[number])
              }
            >
              {CONDITIONS.map((entry) => (
                <option key={entry} value={entry}>
                  {label[entry]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Unidad">
            <select
              className={inputClass}
              value={unit}
              onChange={(event) => setUnit(event.target.value as "CM" | "IN")}
            >
              <option>CM</option>
              <option>IN</option>
            </select>
          </Field>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(["length", "width", "height"] as const).map((key) => (
            <Field
              key={key}
              label={
                key === "length" ? "Largo" : key === "width" ? "Ancho" : "Alto"
              }
            >
              <input
                className={inputClass}
                type="number"
                min="0"
                step="0.1"
                value={dimensions[key]}
                onChange={(event) =>
                  setDimensions({ ...dimensions, [key]: event.target.value })
                }
              />
            </Field>
          ))}
        </div>
        <fieldset className="mt-4">
          <legend className="text-xs font-bold uppercase text-slate-600">
            Indicadores especiales
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {FLAGS.map(([value, text]) => (
              <label
                key={value}
                className={`min-h-11 cursor-pointer rounded-full border px-3 py-2 text-sm ${flags.includes(value) ? "border-indigo-500 bg-indigo-50 text-indigo-800" : "bg-white"}`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={flags.includes(value)}
                  onChange={() =>
                    setFlags(
                      flags.includes(value)
                        ? flags.filter((item) => item !== value)
                        : [...flags, value],
                    )
                  }
                />
                {text}
              </label>
            ))}
          </div>
        </fieldset>
        {["DAMAGED", "PRE_EXISTING_DAMAGE"].includes(condition) && (
          <p className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            La publicación exigirá una foto de daño.
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button secondary type="button" onClick={reset}>
            Limpiar
          </Button>
          <Button
            type="button"
            disabled={busy || !articleRef || !selectedArea}
            onClick={submit}
          >
            {editing ? "Guardar cambios" : "Próximo"}
            <ChevronRight className="ml-1 inline h-4 w-4" />
          </Button>
        </div>
      </section>
      <aside className="rounded-2xl border bg-white p-4">
        <h2 className="font-black">
          Inventario ·{" "}
          {
            draft.catalog.areas.find((area) => area.areaRef === selectedArea)
              ?.name
          }
        </h2>
        <p className="text-xs text-slate-500">
          {items.reduce((sum, item) => sum + item.quantity, 0)} unidades
          observadas
        </p>
        <div className="mt-3 space-y-2">
          {items.map((item) => (
            <article key={item.itemRef} className="rounded-xl border p-3">
              <button
                type="button"
                className="w-full text-left"
                onClick={() => edit(item)}
              >
                <strong className="text-sm">
                  {item.quantity} × {item.article.name}
                </strong>
                <span className="block text-xs text-slate-500">
                  {label[item.condition] || item.condition} ·{" "}
                  {item.shipmentMode}
                </span>
              </button>
              <div className="mt-2 flex items-center justify-between gap-2">
                <label className="cursor-pointer text-xs font-bold text-indigo-700">
                  <Camera className="mr-1 inline h-4 w-4" />
                  Foto
                  <input
                    className="sr-only"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) onPhoto(item, file);
                    }}
                  />
                </label>
                <span className="text-xs text-slate-500">
                  {item.photos.length} evidencia(s)
                </span>
                <button
                  type="button"
                  className="min-h-11 rounded-lg px-2 text-xs font-bold text-red-700"
                  aria-label={`Eliminar ${item.article.name}`}
                  onClick={() => {
                    if (window.confirm(`¿Eliminar ${item.article.name} del borrador?`)) onDelete(item);
                  }}
                >
                  <Trash2 className="mr-1 inline h-4 w-4" />Eliminar
                </button>
              </div>
            </article>
          ))}
          {items.length === 0 && (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              Agrega el primer artículo. El área y modo permanecerán
              seleccionados.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}

function AccessEditor({
  draft,
  busy,
  onSave,
  onPhoto,
}: {
  draft: SurveyDraft;
  busy: boolean;
  onSave: (
    side: "ORIGIN" | "DESTINATION",
    current: SurveyAccess | undefined,
    values: Record<string, unknown>,
  ) => void;
  onPhoto: (access: SurveyAccess, file: File) => void;
}) {
  const accessForm = (entry: SurveyAccess | undefined) => ({
    floorNumber: entry?.floorNumber == null ? "" : String(entry.floorNumber),
    stairsFloors: entry?.stairsFloors == null ? "" : String(entry.stairsFloors),
    elevatorAvailable:
      entry?.elevatorAvailable == null ? "" : String(entry.elevatorAvailable),
    elevatorFloor:
      entry?.elevatorFloor == null ? "" : String(entry.elevatorFloor),
    parkingDistanceM:
      entry?.parkingDistanceM == null ? "" : String(entry.parkingDistanceM),
    flags: [...(entry?.flags || [])],
    notes: entry?.notes || "",
  });
  const [side, setSide] = useState<"ORIGIN" | "DESTINATION">("ORIGIN");
  const current = draft.access.find((entry) => entry.side === side);
  const [form, setForm] = useState(() =>
    accessForm(draft.access.find((entry) => entry.side === "ORIGIN")),
  );
  const number = (value: string) => (value === "" ? null : Number(value));
  return (
    <section className="mx-auto max-w-3xl rounded-2xl border bg-white p-4 sm:p-6">
      <div className="grid grid-cols-2 gap-2">
        {(["ORIGIN", "DESTINATION"] as const).map((entry) => (
          <button
            key={entry}
            type="button"
            onClick={() => {
              setSide(entry);
              setForm(
                accessForm(draft.access.find((item) => item.side === entry)),
              );
            }}
            className={`min-h-12 rounded-xl font-bold ${side === entry ? "bg-[#00447c] text-white" : "border bg-white"}`}
          >
            {label[entry]}
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Piso">
          <input
            className={inputClass}
            type="number"
            value={form.floorNumber}
            onChange={(event) =>
              setForm({ ...form, floorNumber: event.target.value })
            }
          />
        </Field>
        <Field label="Pisos por escalera">
          <input
            className={inputClass}
            type="number"
            min="0"
            value={form.stairsFloors}
            onChange={(event) =>
              setForm({ ...form, stairsFloors: event.target.value })
            }
          />
        </Field>
        <Field label="Elevador disponible">
          <select
            className={inputClass}
            value={form.elevatorAvailable}
            onChange={(event) =>
              setForm({ ...form, elevatorAvailable: event.target.value })
            }
          >
            <option value="">No observado</option>
            <option value="true">Sí</option>
            <option value="false">No</option>
          </select>
        </Field>
        <Field label="Piso del elevador">
          <input
            className={inputClass}
            type="number"
            value={form.elevatorFloor}
            onChange={(event) =>
              setForm({ ...form, elevatorFloor: event.target.value })
            }
          />
        </Field>
        <Field label="Distancia de parqueo (m)">
          <input
            className={inputClass}
            type="number"
            min="0"
            value={form.parkingDistanceM}
            onChange={(event) =>
              setForm({ ...form, parkingDistanceM: event.target.value })
            }
          />
        </Field>
      </div>
      <fieldset className="mt-4">
        <legend className="text-xs font-bold uppercase text-slate-600">
          Facilidades e inconvenientes observados
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {ACCESS_FLAGS.map(([value, text]) => (
            <label
              key={value}
              className={`min-h-11 cursor-pointer rounded-full border px-3 py-2 text-sm ${form.flags.includes(value) ? "border-indigo-500 bg-indigo-50" : ""}`}
            >
              <input
                className="sr-only"
                type="checkbox"
                checked={form.flags.includes(value)}
                onChange={() =>
                  setForm({
                    ...form,
                    flags: form.flags.includes(value)
                      ? form.flags.filter((item) => item !== value)
                      : [...form.flags, value],
                  })
                }
              />
              {text}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Notas complementarias">
        <textarea
          className={`${inputClass} mt-4 min-h-24 py-3`}
          value={form.notes}
          onChange={(event) => setForm({ ...form, notes: event.target.value })}
        />
      </Field>
      <div className="mt-4 flex flex-wrap justify-between gap-2">
        {current ? (
          <label className="min-h-11 cursor-pointer rounded-xl border px-4 py-2 text-sm font-bold text-indigo-700">
            <Camera className="mr-2 inline h-4 w-4" />
            Agregar foto
            <input
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onPhoto(current, file);
              }}
            />
          </label>
        ) : (
          <span className="text-xs text-slate-500">
            Guarda el acceso antes de adjuntar fotos.
          </span>
        )}
        <Button
          disabled={busy}
          onClick={() =>
            onSave(side, current, {
              floorNumber: number(form.floorNumber),
              stairsFloors: number(form.stairsFloors),
              elevatorAvailable:
                form.elevatorAvailable === ""
                  ? null
                  : form.elevatorAvailable === "true",
              elevatorFloor: number(form.elevatorFloor),
              parkingDistanceM: number(form.parkingDistanceM),
              flags: form.flags,
              notes: form.notes || null,
            })
          }
        >
          Guardar acceso
        </Button>
      </div>
    </section>
  );
}

function Review({
  draft,
  busy,
  onReady,
  onContinue,
}: {
  draft: SurveyDraft;
  busy: boolean;
  onReady: () => void;
  onContinue: () => void;
}) {
  const areas = draft.catalog.areas
    .map((area) => ({
      area,
      items: draft.items.filter((item) => item.area.areaRef === area.areaRef),
    }))
    .filter((entry) => entry.items.length);
  return (
    <section className="mx-auto max-w-4xl space-y-4">
      <div className="rounded-2xl border bg-white p-5">
        <p className="text-xs font-bold uppercase text-indigo-600">
          Vista previa A4
        </p>
        <h2 className="mt-1 text-2xl font-black">Survey · {draft.caseCode}</h2>
        <p className="text-sm text-slate-600">
          {draft.clientDisplayName || "Sin Client"} · Catálogo v
          {draft.catalog.version} · Ruta v{draft.routeVersion}
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-slate-50 p-3">
            <strong className="block text-xl">{draft.totals.quantity}</strong>
            <span className="text-xs">unidades</span>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <strong className="block text-xl">
              {draft.totals.volumeM3.toFixed(2)}
            </strong>
            <span className="text-xs">m³</span>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <strong className="block text-xl">
              {draft.totals.weightKg.toFixed(1)}
            </strong>
            <span className="text-xs">kg</span>
          </div>
        </div>
        {areas.map(({ area, items }) => (
          <div key={area.areaRef} className="mt-5 border-t pt-3">
            <h3 className="text-sm font-black uppercase text-slate-700">
              {area.name}
            </h3>
            {items.map((item) => (
              <div
                key={item.itemRef}
                className="flex justify-between border-b py-2 text-sm"
              >
                <span>
                  {item.quantity} × {item.article.name}
                </span>
                <span>{label[item.condition] || item.condition}</span>
              </div>
            ))}
          </div>
        ))}
        <div className="mt-5 border-t pt-3">
          <h3 className="text-sm font-black uppercase">Accesos</h3>
          {draft.access.map((entry) => (
            <p key={entry.side} className="mt-2 text-sm">
              <strong>{label[entry.side]}:</strong> piso{" "}
              {entry.floorNumber ?? "no observado"}, escaleras{" "}
              {entry.stairsFloors ?? "no observado"}, elevador{" "}
              {entry.elevatorAvailable == null
                ? "no observado"
                : entry.elevatorAvailable
                  ? "sí"
                  : "no"}
              .
            </p>
          ))}
        </div>
        <div className="mt-5 rounded-xl border border-dashed p-3 text-sm text-slate-600">
          <strong>Materiales derivados:</strong> en integración con la futura
          autoridad de recetas. El evaluador no selecciona materiales.
        </div>
      </div>
      <div className="flex flex-wrap justify-between gap-2">
        <Button secondary onClick={onContinue}>
          <ChevronLeft className="mr-1 inline h-4 w-4" />
          Volver al inventario
        </Button>
        <Button disabled={busy} onClick={onReady}>
          {draft.status === "READY_FOR_REVIEW"
            ? "Continuar a firma"
            : "Confirmar revisión"}
        </Button>
      </div>
    </section>
  );
}

export default function SurveyApp({
  authorization,
  onUnauthorized,
}: {
  authorization?: string;
  onUnauthorized: () => void;
}) {
  const api = useMemo(() => createSurveyApi(authorization), [authorization]);
  const [agenda, setAgenda] = useState<readonly SurveyAssignment[]>([]);
  const [draft, setDraft] = useState<SurveyDraft | null>(null);
  const [screen, setScreen] = useState<Screen>("AGENDA");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signerName, setSignerName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [strokes, setStrokes] = useState<
    readonly (readonly SignaturePoint[])[]
  >([]);
  const [published, setPublished] = useState<{
    publicationRef: string;
    pdfSha256: string;
  } | null>(null);
  const guard = useCallback(
    (error: unknown) => {
      if (
        typeof error === "object" &&
        error &&
        "status" in error &&
        Number((error as { status: number }).status) === 401
      )
        onUnauthorized();
      else
        setError(
          error instanceof Error ? error.message : "CRM_SURVEY_REQUEST_FAILED",
        );
    },
    [onUnauthorized],
  );
  const loadAgenda = useCallback(async () => {
    try {
      setAgenda(await api.agenda());
    } catch (cause) {
      guard(cause);
    }
  }, [api, guard]);
  const loadDraft = async (surveyRef: string) => {
    const next = await api.draft(surveyRef);
    setDraft(next);
    return next;
  };
  useEffect(() => {
    void loadAgenda();
  }, [loadAgenda]);
  const run = async (task: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (cause) {
      guard(cause);
    } finally {
      setBusy(false);
    }
  };
  const assignmentAction = (row: SurveyAssignment, operation: string) =>
    void run(async () => {
      const result = await api.assignmentAction(
        row.assignmentRef,
        operation,
        row.version,
      );
      if (operation === "START_SURVEY" && result.surveyRef) {
        await loadDraft(result.surveyRef);
        setScreen("INVENTORY");
      } else await loadAgenda();
    });
  const mutate = (
    operation: string,
    payload: Record<string, unknown>,
    after?: (next: SurveyDraft) => void,
  ) =>
    draft &&
    void run(async () => {
      await api.mutateDraft(draft.surveyRef, operation, payload);
      const next = await loadDraft(draft.surveyRef);
      after?.(next);
    });
  const photo = (
    metadata: { purpose: string; itemRef?: string; accessRef?: string },
    file: File,
  ) =>
    draft &&
    void run(async () => {
      await api.uploadPhoto(draft.surveyRef, file, metadata);
      await loadDraft(draft.surveyRef);
    });
  const downloadPublishedPdf = () =>
    published &&
    void run(async () => {
      const blob = await api.downloadPdf(published.publicationRef);
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = "survey-publicado.pdf";
      anchor.click();
      URL.revokeObjectURL(href);
    });
  if (screen === "AGENDA")
    return <Agenda rows={agenda} busy={busy} onAction={assignmentAction} />;
  if (!draft) return <div className="p-8">Cargando Survey…</div>;
  return (
    <div className="min-h-screen bg-slate-100 pb-24">
      <header className="sticky top-0 z-20 border-b bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <button
            type="button"
            className="min-h-11 rounded-xl px-2 text-sm font-bold text-slate-700"
            onClick={() => {
              setScreen("AGENDA");
              setDraft(null);
              void loadAgenda();
            }}
          >
            <ChevronLeft className="mr-1 inline h-4 w-4" />
            Agenda
          </button>
          <div className="min-w-0 text-center">
            <p className="truncate text-sm font-black">
              {draft.clientDisplayName || "Sin Client"}
            </p>
            <p className="text-xs text-slate-500">
              {draft.caseCode} · v{draft.version}
            </p>
          </div>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
            Guardado
          </span>
        </div>
      </header>
      {error && (
        <div
          role="alert"
          className="mx-auto mt-3 max-w-5xl rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800"
        >
          {error}
        </div>
      )}
      <main className="mx-auto max-w-6xl p-4 sm:p-6">
        {screen === "INVENTORY" && (
          <ItemEditor
            draft={draft}
            busy={busy}
            onSave={(payload) => mutate("UPSERT_ITEM", payload)}
            onDelete={(item) =>
              mutate("DELETE_ITEM", {
                expectedDraftVersion: draft.version,
                itemRef: item.itemRef,
                expectedItemVersion: item.version,
              })
            }
            onPhoto={(item, file) =>
              photo(
                {
                  purpose: ["DAMAGED", "PRE_EXISTING_DAMAGE"].includes(
                    item.condition,
                  )
                    ? "DAMAGE"
                    : "ITEM",
                  itemRef: item.itemRef,
                },
                file,
              )
            }
          />
        )}
        {screen === "ACCESS" && (
          <AccessEditor
            key={`${draft.surveyRef}:${draft.version}`}
            draft={draft}
            busy={busy}
            onSave={(side, current, values) =>
              mutate("SAVE_ACCESS", {
                expectedDraftVersion: draft.version,
                expectedAccessVersion: current?.version || null,
                side,
                ...values,
              })
            }
            onPhoto={(access, file) =>
              photo(
                {
                  purpose:
                    access.side === "ORIGIN"
                      ? "ORIGIN_ACCESS"
                      : "DESTINATION_ACCESS",
                  accessRef: access.accessRef,
                },
                file,
              )
            }
          />
        )}
        {screen === "REVIEW" && (
          <Review
            draft={draft}
            busy={busy}
            onContinue={() => setScreen("INVENTORY")}
            onReady={() =>
              draft.status === "READY_FOR_REVIEW"
                ? setScreen("SIGN")
                : mutate(
                    "MARK_READY",
                    { expectedDraftVersion: draft.version, notes: null },
                    () => setScreen("SIGN"),
                  )
            }
          />
        )}
        {screen === "SIGN" && (
          <section className="mx-auto max-w-3xl rounded-2xl border bg-white p-5">
            <Signature className="h-7 w-7 text-indigo-600" />
            <h2 className="mt-2 text-2xl font-black">Firma y publicación</h2>
            <p className="mt-1 text-sm text-slate-600">
              La firma quedará vinculada a esta publicación. El resultado y su
              PDF serán inmutables.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Nombre del firmante">
                <input
                  className={inputClass}
                  value={signerName}
                  onChange={(event) => setSignerName(event.target.value)}
                />
              </Field>
              <Field label="Relación con el cliente">
                <input
                  className={inputClass}
                  value={relationship}
                  onChange={(event) => setRelationship(event.target.value)}
                />
              </Field>
            </div>
            <div className="mt-4">
              <SignaturePad onChange={setStrokes} />
            </div>
            <div className="mt-4 flex justify-between gap-2">
              <Button secondary onClick={() => setScreen("REVIEW")}>
                Vista previa
              </Button>
              <Button
                disabled={
                  busy || !signerName || !relationship || !strokes.length
                }
                onClick={() =>
                  void run(async () => {
                    const result = await api.publish(draft.surveyRef, {
                      expectedDraftVersion: draft.version,
                      signerName,
                      relationship,
                      signatureStrokes: strokes,
                    });
                    setPublished(result);
                    setScreen("PUBLISHED");
                  })
                }
              >
                Firmar y publicar
              </Button>
            </div>
          </section>
        )}
        {screen === "PUBLISHED" && (
          <section className="mx-auto max-w-2xl rounded-2xl border bg-white p-8 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100">
              <ClipboardCheck className="h-7 w-7 text-emerald-700" />
            </span>
            <h2 className="mt-4 text-2xl font-black">Survey publicado</h2>
            <p className="mt-2 text-sm text-slate-600">
              La revisión y el PDF corresponden exactamente a esta versión. Los
              módulos posteriores consumirán estos hechos sin reescribirlos.
            </p>
            <p className="mt-4 text-xs text-slate-500">
              PDF verificado · {published?.pdfSha256.slice(0, 12)}…
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button secondary disabled={busy || !published} onClick={downloadPublishedPdf}>
                <Download className="mr-2 inline h-4 w-4" />Descargar PDF
              </Button>
              <Button
                onClick={() => {
                  setScreen("AGENDA");
                  setDraft(null);
                  void loadAgenda();
                }}
              >
                Volver a agenda
              </Button>
            </div>
          </section>
        )}
      </main>
      {!["SIGN", "PUBLISHED"].includes(screen) && (
        <nav
          className="fixed inset-x-0 bottom-0 z-30 border-t bg-white p-2"
          aria-label="Flujo Survey"
        >
          <div className="mx-auto grid max-w-xl grid-cols-3 gap-1">
            {(
              [
                ["INVENTORY", "Inventario", ClipboardCheck],
                ["ACCESS", "Accesos", MapPin],
                ["REVIEW", "Revisión", CalendarDays],
              ] as const
            ).map(([target, text, Icon]) => (
              <button
                key={target}
                className={`min-h-12 rounded-xl text-xs font-bold ${screen === target ? "bg-[#00447c] text-white" : "text-slate-600"}`}
                onClick={() => setScreen(target)}
              >
                <Icon className="mx-auto mb-1 h-4 w-4" />
                {text}
              </button>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
