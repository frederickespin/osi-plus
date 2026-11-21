import { type FormEvent, type ReactNode, lazy, Suspense, useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, Check, MapPin, Pencil, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { AdministrationHelp, AdministrationIconAction } from "@/administration/AdministrationHelp";
import { COMPACT_FORM_FIELD, COMPACT_TABLE_BODY, COMPACT_TABLE_FIELD, COMPACT_TABLE_HEAD } from "@/components/ui/compact-form";
import { transportRingError } from "../../shared/transportGeometry.js";
import TransportPlaceSearch from "./TransportPlaceSearch";
import { findTransportBoundary, type TransportBoundary, type TransportPlace } from "./transportPlaces";
import {
  type LogisticsBase, type LogisticsBaseKind, type LogisticsGeography, type LogisticsGeographyCommand,
  type MetroLocality, type MetroPerimeter, type TransportCoordinate,
  logisticsGeographyApi, isTransportUnauthorized, TransportRequestError,
} from "./transportApi";

const TransportZoneMap = lazy(() => import("./TransportZoneMap"));
const EMPTY_POINTS: readonly TransportCoordinate[] = [];
const field = COMPACT_FORM_FIELD + " mt-1 block w-full";
const saveButton = "inline-flex min-h-9 items-center gap-1.5 rounded bg-[#003366] px-3 text-xs font-semibold text-white disabled:opacity-40";
const baseKinds: Record<LogisticsBaseKind, string> = { OFFICE: "Oficina", WAREHOUSE: "Almacén", YARD: "Patio" };
const areaLabels = { METRO: "Zona metro", INTERIOR: "Fuera de zona metro" };

type BaseDraft = { kind: LogisticsBaseKind; name: string; address: string; point: TransportCoordinate | null; active: boolean };
type MetroLocalityDraft = MetroLocality & { key: string };
type MetroDraft = { name: string; geometry: readonly TransportCoordinate[]; localities: MetroLocalityDraft[] };
type GeographyEditor = { type: "bases"; base: LogisticsBase | null } | { type: "metro"; metro: MetroPerimeter | null };

type Props = Readonly<{
  section: "bases" | "metro";
  authorization?: string;
  canManage: boolean;
  onUnauthorized(): void;
}>;

function errorMessage(cause: unknown, fallback: string): string {
  const code = cause instanceof Error ? cause.message : "";
  if (code === "LOGISTICS_GEOGRAPHY_BASE_DUPLICATE") return "Ya existe una sede con esos datos.";
  if (code === "LOGISTICS_GEOGRAPHY_LOCALITY_DUPLICATE") return "Una ciudad o sector está repetido. Deja un solo registro para cada lugar.";
  if (/VERSION_CONFLICT|REQUEST_CONFLICT|NOT_FOUND/.test(code)) return "Otra sesión actualizó la configuración. Actualiza el listado antes de guardar.";
  if (cause instanceof TransportRequestError && cause.status === 403) return "Tu usuario no tiene permiso para esta configuración.";
  if (cause instanceof TransportRequestError && cause.uncertain) return "No se pudo confirmar el guardado. Reintenta para comprobar la misma solicitud.";
  if (code === "LOGISTICS_GEOGRAPHY_INPUT_INVALID") return "Revisa el nombre, el punto en el mapa o el perímetro y las localidades.";
  return fallback;
}

function MapLoading() {
  return <p role="status" className="grid h-56 place-items-center rounded border bg-slate-50 text-xs text-slate-600">Cargando mapa…</p>;
}

function GeographyToolbar({ title, help, action, actionLabel, loading, onReload }: {
  title: string; help: string; action?: () => void; actionLabel: string; loading: boolean; onReload(): void;
}) {
  return <div className="flex flex-wrap items-center justify-between gap-1 border-b border-slate-200 pb-1.5">
    <div className="flex items-center gap-1">
      <h3 className="text-sm font-semibold text-[#003366]">{title}</h3>
      <AdministrationHelp title={title}><p>{help}</p></AdministrationHelp>
    </div>
    <div className="flex gap-1">
      <AdministrationIconAction label="Actualizar configuración" disabled={loading} onClick={onReload}><RefreshCw className="size-4" aria-hidden="true" /></AdministrationIconAction>
      {action && <AdministrationIconAction label={actionLabel} onClick={action} disabled={loading}>
        {actionLabel.startsWith("Editar") ? <Pencil className="size-4" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
      </AdministrationIconAction>}
    </div>
  </div>;
}

function BaseList({ bases, edit }: { bases: readonly LogisticsBase[]; edit?: (base: LogisticsBase) => void }) {
  return <div className="max-h-[max(14rem,calc(100dvh-16rem))] overflow-auto border-b border-slate-200">
    <table aria-label="Sedes registradas" className="w-full min-w-[470px] text-left">
      <thead className={COMPACT_TABLE_HEAD}><tr><th scope="col">Sede</th><th scope="col">Tipo</th><th scope="col">Dirección</th><th scope="col">Estado</th><th scope="col"><span className="sr-only">Acción</span></th></tr></thead>
      <tbody className={COMPACT_TABLE_BODY}>
        {bases.map((base) => <tr key={base.baseRef} className="h-9">
          <td className="font-semibold text-[#003366]">{base.name}</td>
          <td>{baseKinds[base.kind]}</td><td>{base.address}</td>
          <td><span className={base.active ? "text-emerald-800" : "text-slate-500"}>{base.active ? "Activa" : "Inactiva"}</span></td>
          <td className="text-right">{edit && <AdministrationIconAction label={"Editar sede " + base.name} onClick={() => edit(base)}>
            <Pencil className="size-3.5" aria-hidden="true" />
          </AdministrationIconAction>}</td>
        </tr>)}
        {!bases.length && <tr><td colSpan={5} className="h-10 text-slate-600">Aún no hay sedes registradas.</td></tr>}
      </tbody>
    </table>
  </div>;
}

function LocalityTable({ children }: { children: ReactNode }) {
  return <div className="max-h-[min(18rem,42dvh)] overflow-auto border-b border-slate-200">
    <table aria-label="Ciudades y sectores de cobertura" className="w-full min-w-[430px] text-left">
      <thead className={COMPACT_TABLE_HEAD}><tr>
        <th scope="col">Ciudad o municipio</th><th scope="col">Sector</th><th scope="col">Clasificación</th><th scope="col"><span className="sr-only">Acción</span></th>
      </tr></thead>
      <tbody className={COMPACT_TABLE_BODY}>{children}</tbody>
    </table>
  </div>;
}

function MetroSummary({ metro }: { metro: MetroPerimeter | null }) {
  if (!metro) return <p className="py-3 text-xs text-slate-600">Configura el perímetro que usarán Survey y Cotización.</p>;
  return <>
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <strong className="text-[#003366]">{metro.name}</strong>
      <span className="text-emerald-800">Perímetro configurado</span>
    </div>
    <LocalityTable>
      {metro.localities.map((row) => <tr key={JSON.stringify([row.city, row.sector])} className="h-9">
        <td className="font-semibold">{row.city}</td><td>{row.sector || "Todo el municipio"}</td><td>{areaLabels[row.classification]}</td><td />
      </tr>)}
      {!metro.localities.length && <tr><td colSpan={4} className="h-10 text-slate-600">Aún no hay ciudades ni sectores para clasificar por nombre.</td></tr>}
    </LocalityTable>
  </>;
}

function EditorActions({ label, busy, disabled, onClose, formId }: {
  label: string; busy: boolean; disabled: boolean; onClose(): void; formId: string;
}) {
  return <div className="flex items-center gap-1">
    <AdministrationIconAction label="Volver al listado" onClick={onClose} disabled={busy}>
      <ArrowLeft className="size-4" aria-hidden="true" />
    </AdministrationIconAction>
    <button type="submit" form={formId} disabled={disabled} className={saveButton}><Save className="size-4" aria-hidden="true" />{label}</button>
  </div>;
}

function BaseEditor({ base, busy, onClose, onSave }: {
  base: LogisticsBase | null; busy: boolean; onClose(): void; onSave(command: LogisticsGeographyCommand): void;
}) {
  const formId = useId();
  const [draft, setDraft] = useState<BaseDraft>(() => base ?? { name: "", address: "", kind: "OFFICE", point: null, active: true });
  const [focus, setFocus] = useState<{ point: TransportCoordinate; zoom: number } | null>(null);
  function pickPlace(place: TransportPlace) {
    const address = [...new Set([place.street || place.name, place.sector, place.city, place.province].filter(Boolean))].join(", ");
    setDraft((old) => ({ ...old, address: old.address.trim() || address.slice(0, 240), point: place.point }));
    setFocus({ point: place.point, zoom: 16 });
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { name, address, point, kind, active } = draft;
    if (busy || !name.trim() || !address.trim() || !point) return;
    onSave({ operation: "SAVE_BASE", requestId: crypto.randomUUID(), expectedVersion: base?.version ?? 0,
      baseRef: base?.baseRef ?? null, name: name.trim(), address: address.trim(), point, kind, active });
  }
  return <div className="min-w-0 space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-[#003366]">{base ? "Editar sede" : "Nueva sede"}</h3>
      <EditorActions label="Guardar sede" formId={formId} busy={busy} disabled={busy || !draft.name.trim() || !draft.address.trim() || !draft.point} onClose={onClose} />
    </div>
    <form id={formId} onSubmit={submit}>
      <fieldset disabled={busy} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_8rem_1.4fr_auto]">
        <label className="text-xs font-medium text-slate-700">Nombre de la sede
          <input required value={draft.name} maxLength={160} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={field} />
        </label>
        <label className="text-xs font-medium text-slate-700">Tipo de sede
          <select aria-label="Tipo de sede" value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as LogisticsBaseKind })} className={field}>
            {Object.entries(baseKinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-700">Dirección de la sede
          <input required value={draft.address} maxLength={240} onChange={(event) => setDraft({ ...draft, address: event.target.value })} className={field} />
        </label>
        <label className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap text-xs text-slate-700">
          <input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} className="accent-[#003366]" />Activa
        </label>
      </fieldset>
    </form>
    <TransportPlaceSearch disabled={busy} onSelect={pickPlace} />
    <Suspense fallback={<MapLoading />}>
      <TransportZoneMap points={draft.point ? [draft.point] : EMPTY_POINTS} mode="points" selectedPoint={0} autoSelect
        label="Ubicación de la sede" heightClassName="h-56 md:h-72" focus={focus} disabled={busy}
        onChange={([point]) => setDraft((old) => ({ ...old, point: point ?? null }))} />
    </Suspense>
    <p className="flex items-center gap-1 text-xs text-slate-600"><MapPin className="size-3.5" aria-hidden="true" />{draft.point ? "Punto de salida ubicado" : "Selecciona la salida de los vehículos en el mapa."}</p>
  </div>;
}

function MetroEditor({ metro, busy, onClose, onSave }: {
  metro: MetroPerimeter | null; busy: boolean; onClose(): void; onSave(command: LogisticsGeographyCommand): void;
}) {
  const formId = useId();
  const [draft, setDraft] = useState<MetroDraft>(() => ({
    name: metro?.name ?? "Zona metropolitana",
    geometry: metro?.geometry ?? EMPTY_POINTS,
    localities: (metro?.localities ?? []).map((row) => ({ ...row, key: crypto.randomUUID() })),
  }));
  const [focus, setFocus] = useState<{ point: TransportCoordinate; zoom: number } | null>(null);
  const [suggestion, setSuggestion] = useState<TransportBoundary | null>(null);
  const [finding, setFinding] = useState(false);
  const [formError, setFormError] = useState("");
  const search = useRef<AbortController | null>(null);
  useEffect(() => () => search.current?.abort(), []);

  async function pickPlace(place: TransportPlace) {
    search.current?.abort();
    const request = new AbortController();
    search.current = request;
    setFocus({ point: place.point, zoom: place.municipality ? 13 : 16 });
    setSuggestion(null);
    setFinding(true);
    try {
      const result = await findTransportBoundary(place, request.signal);
      if (!request.signal.aborted) setSuggestion(result);
    } catch {
      // The reference point still lets the user trace the boundary.
    } finally {
      if (!request.signal.aborted) setFinding(false);
    }
  }
  function setGeometry(geometry: readonly TransportCoordinate[]) {
    search.current?.abort();
    setFinding(false);
    setSuggestion(null);
    setFormError("");
    setDraft((old) => ({ ...old, geometry }));
  }
  function updateLocality(key: string, patch: Partial<MetroLocality>) {
    setFormError("");
    setDraft((old) => ({ ...old, localities: old.localities.map((row) => row.key === key ? { ...row, ...patch } : row) }));
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const { name, geometry, localities } = draft;
    if (!name.trim() || geometry.length < 3 || transportRingError([...geometry, geometry[0]])) {
      setFormError("Traza un perímetro de al menos tres puntos sin cruces.");
      return;
    }
    const rows = localities.map((row) => ({ city: row.city.trim(), sector: row.sector?.trim() || null, classification: row.classification }));
    if (rows.some((row) => !row.city)) {
      setFormError("Escribe la ciudad o municipio de cada fila.");
      return;
    }
    onSave({ operation: "SAVE_METRO", requestId: crypto.randomUUID(), expectedVersion: metro?.version ?? 0, name: name.trim(), geometry, localities: rows });
  }
  return <div className="min-w-0 space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-[#003366]">Configurar zona metro</h3>
      <EditorActions label="Guardar zona metro" busy={busy} disabled={busy || !draft.name.trim()} onClose={onClose} formId={formId} />
    </div>
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(23rem,0.92fr)]">
      <div className="min-w-0 space-y-2">
        <TransportPlaceSearch disabled={busy} onSelect={(place) => void pickPlace(place)} />
        {finding && <p role="status" className="text-xs text-slate-600">Consultando el contorno…</p>}
        {suggestion && <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
          <AdministrationIconAction label="Usar contorno sugerido" disabled={busy} onClick={() => setGeometry(suggestion.points)}>
            <Check className="size-4" aria-hidden="true" />
          </AdministrationIconAction>
          <span>{suggestion.label}</span>
        </div>}
        <Suspense fallback={<MapLoading />}>
          <TransportZoneMap label="Perímetro de zona metro" points={draft.geometry} onChange={setGeometry} focus={focus}
            previewBoundary={suggestion?.points ?? EMPTY_POINTS} disabled={busy} heightClassName="h-56 md:h-72" />
        </Suspense>
      </div>
      <form id={formId} onSubmit={submit} className="min-w-0 space-y-2">
        <fieldset disabled={busy} className="min-w-0 space-y-2">
          <label className="block text-xs font-medium text-slate-700">Nombre del perímetro
            <input required maxLength={160} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={field} />
          </label>
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1">
              <h4 className="text-xs font-semibold">Clasificación por localidad</h4>
              <AdministrationHelp title="Ciudades y sectores"><p>Registra un sector específico cuando su clasificación difiera de la del municipio. Deja Sector vacío para cubrir todo el municipio.</p></AdministrationHelp>
            </div>
            <AdministrationIconAction label="Añadir ciudad o sector" onClick={() => {
              const key = crypto.randomUUID();
              setDraft((old) => ({ ...old, localities: [...old.localities, { key, city: "", sector: null, classification: "METRO" }] }));
            }}><Plus className="size-4" aria-hidden="true" /></AdministrationIconAction>
          </div>
          <LocalityTable>
            {draft.localities.map((row, index) => <tr key={row.key} className="h-9">
              <td className="w-[32%]"><input required maxLength={160} aria-label={"Ciudad o municipio " + (index + 1)} value={row.city}
                onChange={(event) => updateLocality(row.key, { city: event.target.value })} className={COMPACT_TABLE_FIELD} /></td>
              <td className="w-[27%]"><input maxLength={160} aria-label={"Sector " + (index + 1)} placeholder="Opcional" value={row.sector ?? ""}
                onChange={(event) => updateLocality(row.key, { sector: event.target.value })} className={COMPACT_TABLE_FIELD} /></td>
              <td><select aria-label={"Clasificación " + (index + 1)} value={row.classification} onChange={(event) => updateLocality(row.key, { classification: event.target.value as MetroLocality["classification"] })} className={COMPACT_TABLE_FIELD}>
                {Object.entries(areaLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select></td>
              <td className="text-right"><AdministrationIconAction label={"Quitar localidad " + (index + 1)} onClick={() => setDraft((old) => ({ ...old, localities: old.localities.filter((item) => item.key !== row.key) }))}>
                <Trash2 className="size-3.5" aria-hidden="true" />
              </AdministrationIconAction></td>
            </tr>)}
            {!draft.localities.length && <tr><td colSpan={4} className="h-10 text-slate-600">Añade localidades para reconocer direcciones por nombre.</td></tr>}
          </LocalityTable>
        </fieldset>
      </form>
    </div>
    {formError && <p role="alert" className="text-xs text-red-800">{formError}</p>}
  </div>;
}

export default function LogisticsGeographyAdmin({ section, authorization, canManage, onUnauthorized }: Props) {
  const [data, setData] = useState<LogisticsGeography | null>(null);
  const [editor, setEditor] = useState<GeographyEditor | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<LogisticsGeographyCommand | null>(null);
  const fetched = useRef<AbortController | null>(null);
  const submitted = useRef(false);

  const load = useCallback(async () => {
    fetched.current?.abort();
    const request = new AbortController();
    fetched.current = request;
    setLoading(true);
    setError("");
    try {
      const workspace = await logisticsGeographyApi.load(authorization, request.signal);
      if (!request.signal.aborted) setData(workspace);
    } catch (cause) {
      if (request.signal.aborted) return;
      if (isTransportUnauthorized(cause)) onUnauthorized();
      else setError(errorMessage(cause, "No se pudo cargar la configuración."));
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }, [authorization, onUnauthorized]);

  useEffect(() => {
    void load();
    return () => fetched.current?.abort();
  }, [load]);

  async function persist(command: LogisticsGeographyCommand) {
    if (!canManage || submitted.current || !data) return;
    submitted.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await logisticsGeographyApi.save(authorization, command);
      setData((old) => {
        if (!old) return old;
        if ("baseRef" in result) return { ...old, bases: [...old.bases.filter((entry) => entry.baseRef !== result.baseRef), result] };
        return { ...old, metro: result };
      });
      setEditor(null);
      setPending(null);
      setNotice("baseRef" in result ? "Sede guardada." : "Zona metro actualizada.");
    } catch (cause) {
      if (isTransportUnauthorized(cause)) onUnauthorized();
      else setError(errorMessage(cause, "No se pudieron guardar los cambios."));
      setPending(cause instanceof TransportRequestError && cause.uncertain ? command : null);
    } finally {
      submitted.current = false;
      setSaving(false);
    }
  }

  const busy = saving || !!pending || !canManage;
  const close = () => { setEditor(null); setError(""); };
  const edit = (next: GeographyEditor) => { setEditor(next); setError(""); setNotice(""); };
  const reload = () => { setNotice(""); void load(); };
  const isBases = section === "bases";
  return <section className="min-w-0 space-y-2" aria-label={isBases ? "Sedes operativas" : "Configuración de zona metro"}>
    {!editor && <GeographyToolbar title={isBases ? "Sedes operativas" : "Zona metro"}
      help={isBases ? "Registra cada punto habitual de salida una vez y selecciónalo cuando configures la flota." : "El perímetro y estas localidades determinan la cobertura que usa el caso."}
      loading={loading} onReload={reload}
      actionLabel={isBases ? "Nueva sede" : data?.metro ? "Editar zona metro" : "Configurar zona metro"}
      action={canManage && data && !error ? () => edit(isBases ? { type: "bases", base: null } : { type: "metro", metro: data.metro }) : undefined} />}
    {loading && <p role="status" className="py-1 text-xs text-slate-600">Cargando configuración…</p>}
    {notice && <p role="status" className="text-xs text-emerald-800">{notice}</p>}
    {error && <p role="alert" className="text-xs text-red-800">{error}</p>}
    {pending && <button type="button" className={saveButton} disabled={saving} onClick={() => void persist(pending)}><RefreshCw className="size-4" aria-hidden="true" />Reintentar guardado</button>}
    {editor?.type === "bases" && <BaseEditor key={editor.base?.baseRef ?? "new"} base={editor.base} busy={busy} onClose={close} onSave={(command) => void persist(command)} />}
    {editor?.type === "metro" && <MetroEditor metro={editor.metro} busy={busy} onClose={close} onSave={(command) => void persist(command)} />}
    {!editor && data && (isBases
      ? <BaseList bases={[...data.bases].sort((a, b) => a.name.localeCompare(b.name, "es"))} edit={canManage && !loading && !error ? (base) => edit({ type: "bases", base }) : undefined} />
      : <MetroSummary metro={data.metro} />)}
  </section>;
}
