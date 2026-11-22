import { Fragment, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Check, History, Layers3, Pencil, Plus, Power, Search, X } from "lucide-react";
import { AdministrationHelp, AdministrationIconAction } from "@/administration/AdministrationHelp";
import { Button } from "@/components/ui/button";
import { COMPACT_TABLE_BODY, COMPACT_TABLE_FIELD as FIELD, COMPACT_TABLE_HEAD } from "@/components/ui/compact-form";
import { filterBySearch } from "@/costing/componentLabels";
import { serviceCatalogNameKey } from "../../shared/serviceCatalogNames.js";
import { CrmServicesApi, CrmServicesApiError, type ServiceCatalogItem } from "./api";

type Props = Readonly<{
  api: CrmServicesApi; rows: readonly ServiceCatalogItem[]; canManage: boolean;
  onUpdate(rows: readonly ServiceCatalogItem[]): void; onUnauthorized(): void;
}>;
type Scope = ServiceCatalogItem["compatibleModes"][number];
type Draft = Pick<ServiceCatalogItem, "name" | "usage" | "compatibleModes" | "status" | "sortOrder" | "allowedComplementaryRefs">
  & { serviceRef?: string; version?: number; category: string };
type Defaults = { combinationRef: string; code: string; name: string; version: number };
type Event = { action: string; version: number; createdAt: string };

const EMPTY: Draft = { name: "", category: "", usage: "PRIMARY", compatibleModes: ["LOCAL"], status: "ACTIVE", sortOrder: 0, allowedComplementaryRefs: [] };
const SERVICE_CATEGORIES = new Map([
  ["CUSTOMS", "Aduanas y documentación"],
  ["STORAGE", "Almacenaje con custodia"],
  ["PACKING", "Empaque y embalaje"],
  ["FREIGHT", "Flete internacional"],
  ["ENGINEERING", "Ingeniería y huacales"],
  ["INSTALLATION", "Instalación y desmontaje"],
  ["INVENTORY", "Inventario y etiquetado"],
  ["MOVING", "Mudanzas"],
  ["TRANSPORT", "Transporte"],
  ["OTHER", "Otros servicios"],
]);
const ROLE_LABELS = { PRIMARY: "Principal", COMPLEMENTARY: "Complementario", BOTH: "Ambos" };
const ROLE_LOCKED_HELP = "El rol queda fijo cuando el servicio figura en un plan guardado.";
const DUPLICATE_NAME_ERROR = "Ya existe un servicio con este nombre en la categoría seleccionada.";
const SCOPES: Record<Scope, string> = { LOCAL: "Local / Nacional", EXPORT: "Exportación", IMPORT: "Importación" };
const STATUS = { ACTIVE: "Activo", INACTIVE: "Inactivo" };
const EVENT_LABELS: Record<string, string> = {
  SERVICE_CATALOG_CREATED: "Creación", SERVICE_CATALOG_UPDATED: "Edición",
  SERVICE_CATALOG_ACTIVATED: "Activación", SERVICE_CATALOG_DEACTIVATED: "Desactivación",
  SERVICE_CATALOG_MODES_CHANGED: "Cambio de modalidades",
};
const DATE = new Intl.DateTimeFormat("es-DO", { timeZone: "America/Santo_Domingo", dateStyle: "short", timeStyle: "short" });
const SERVICE_NAME_ORDER = new Intl.Collator("es-DO", { sensitivity: "base", numeric: true });
const ACTION = "border-transparent bg-transparent";
const TABLE_WRAP = "overflow-auto border-b border-slate-200 max-h-[max(15rem,calc(100dvh-17rem))]";

function categoryLabel(category: string | null) {
  if (!category) return "Sin clasificar";
  if (category === "PREVIEW_SYNTHETIC") return "Demostración";
  return SERVICE_CATEGORIES.get(category) ?? category;
}

function similarName(name: string, candidate: string) {
  const shortest = Math.min(name.length, candidate.length);
  const tolerance = shortest >= 12 ? 2 : 1;
  if (shortest < 5 || Math.abs(name.length - candidate.length) > tolerance ||
    name.startsWith(candidate) || candidate.startsWith(name)) return false;

  let previous = Array.from({ length: candidate.length + 1 }, (_, index) => index);
  for (let row = 1; row <= name.length; row++) {
    const next = [row];
    for (let column = 1; column <= candidate.length; column++) {
      next[column] = Math.min(previous[column] + 1, next[column - 1] + 1,
        previous[column - 1] + Number(name[row - 1] !== candidate[column - 1]));
    }
    if (Math.min(...next) > tolerance) return false;
    previous = next;
  }
  return previous[candidate.length] <= tolerance;
}

export default function ServiceCatalogAdmin({ api, rows, canManage, onUpdate, onUnauthorized }: Props) {
  const form = useId();
  const nameNotice = useId();
  const nameInput = useRef<HTMLInputElement>(null);
  const request = useRef("");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [details, setDetails] = useState<{ service: ServiceCatalogItem; kind: "DEFAULTS" | "HISTORY" } | null>(null);
  const [history, setHistory] = useState<readonly Event[] | null>(null);
  const [defaultRefs, setDefaultRefs] = useState<readonly string[]>([]);
  const [defaultRecord, setDefaultRecord] = useState<Defaults | null>(null);
  const [detailStatus, setDetailStatus] = useState<"loading" | "ready" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const editedService = rows.find((item) => item.serviceRef === draft?.serviceRef);
  const roleLocked = (editedService?.usageCount ?? 0) > 0;
  const savedCategory = editedService?.category;
  const legacyCategory = savedCategory && !SERVICE_CATEGORIES.has(savedCategory) ? savedCategory : null;
  const orderedRows = useMemo(() => [...rows].sort((a, b) => SERVICE_NAME_ORDER.compare(a.name, b.name)), [rows]);
  const nameIndex = useMemo(() => orderedRows.map((item) => ({ item, key: serviceCatalogNameKey(item.name) })), [orderedRows]);
  const nameKey = draft ? serviceCatalogNameKey(draft.name) : "";
  const nameChanged = draft && (!editedService ||
    nameKey !== serviceCatalogNameKey(editedService.name) || draft.category !== (savedCategory ?? ""));
  const matches = nameKey && nameChanged ? nameIndex.filter(({ item, key }) => key === nameKey && item.serviceRef !== draft?.serviceRef) : [];
  const sameCategory = draft?.category ? matches.filter(({ item }) => item.category === draft.category) : [];
  const duplicate = (sameCategory.find(({ item }) => item.status === "ACTIVE") ?? sameCategory[0])?.item;
  const sameName = duplicate ? undefined : matches[0]?.item;
  const similar = !duplicate && !sameName && nameChanged && nameKey.length >= 5
    ? nameIndex.find(({ item, key }) => item.serviceRef !== draft?.serviceRef && similarName(nameKey, key))?.item
    : undefined;
  const canSaveDraft = Boolean(draft && nameKey && draft.compatibleModes.length && !duplicate &&
    (SERVICE_CATEGORIES.has(draft.category) || draft.category === legacyCategory));
  const reactivationConflict = editedService?.status === "INACTIVE" ? findActiveDuplicate(editedService) : undefined;
  const offerReactivation = editedService?.status === "INACTIVE" && draft &&
    draft.name === editedService.name && draft.category === (savedCategory ?? "") && draft.usage === editedService.usage &&
    draft.compatibleModes.length === editedService.compatibleModes.length &&
    draft.compatibleModes.every((mode) => editedService.compatibleModes.includes(mode)) &&
    draft.allowedComplementaryRefs.length === editedService.allowedComplementaryRefs.length &&
    draft.allowedComplementaryRefs.every((ref) => editedService.allowedComplementaryRefs.includes(ref));
  const matchedService = duplicate ?? sameName ?? similar ?? (offerReactivation ? reactivationConflict : undefined);
  const nameNoticeText = duplicate ? "Ya existe en esta categoría" :
    sameName ? "El nombre está registrado en" : similar ? "Nombre parecido" : "Ya existe un servicio activo en esta categoría";
  const editorKey = draft ? draft.serviceRef ?? "new" : undefined;
  const complementary = orderedRows.filter((item) => item.status === "ACTIVE" && item.usage !== "PRIMARY");
  const visible = orderedRows.filter((item) => item.serviceRef === draft?.serviceRef || filterBySearch(
    [item.name, item.category, categoryLabel(item.category), ROLE_LABELS[item.usage], ...item.compatibleModes.map((mode) => SCOPES[mode])].join(" "), search,
  ));
  const allowDefaults = details?.kind === "DEFAULTS" && details.service.usage !== "COMPLEMENTARY";

  useEffect(() => {
    if (editorKey) nameInput.current?.focus();
  }, [editorKey]);

  function findActiveDuplicate(service: ServiceCatalogItem) {
    const key = serviceCatalogNameKey(service.name);
    return nameIndex.find(({ item, key: candidate }) => candidate === key && item.serviceRef !== service.serviceRef &&
      item.status === "ACTIVE" && item.category === service.category)?.item;
  }

  function openDraft(item?: ServiceCatalogItem) {
    request.current = crypto.randomUUID();
    setError("");
    setDraft(item ? { ...item, category: item.category ?? "" } : EMPTY);
  }
  function report(cause: unknown, message: string) {
    if (cause instanceof CrmServicesApiError && cause.status === 401) onUnauthorized();
    else setError(message);
  }
  function changeNameOrCategory(patch: Partial<Pick<Draft, "name" | "category">>) {
    setDraft((value) => value && { ...value, ...patch });
    if (error === DUPLICATE_NAME_ERROR) setError("");
  }
  async function refresh() {
    try {
      onUpdate(await api.catalog());
    } catch (cause) { report(cause, "El servicio se guardó. Actualiza el listado para ver el cambio."); }
  }
  async function reportDuplicate() {
    setError(DUPLICATE_NAME_ERROR);
    try {
      onUpdate(await api.catalog());
    } catch (cause) {
      if (cause instanceof CrmServicesApiError && cause.status === 401) onUnauthorized();
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !canManage || saving || !canSaveDraft) return;
    setSaving(true);
    setError("");
    try {
      const common = {
        requestId: request.current, name: draft.name.trim(), category: draft.category,
        usage: draft.usage, compatibleModes: [...draft.compatibleModes].sort(), sortOrder: draft.sortOrder,
        allowedComplementaryRefs: draft.allowedComplementaryRefs,
      };
      if (draft.serviceRef) await api.updateCatalog(draft.serviceRef, { ...common, expectedVersion: draft.version, status: draft.status });
      else await api.createCatalog({ ...common, code: null });
      setDraft(null);
      await refresh();
    } catch (cause) {
      if (cause instanceof CrmServicesApiError && cause.code === "CRM_SERVICES_DUPLICATE_NAME") {
        await reportDuplicate();
        return;
      }
      if (cause instanceof CrmServicesApiError && cause.code === "CRM_SERVICES_USED_TYPE_IMMUTABLE") {
        setError("El servicio figura en un plan guardado. Actualiza el catálogo para revisar su rol.");
        return;
      }
      report(cause, cause instanceof CrmServicesApiError && cause.code === "CRM_SERVICES_VERSION_CONFLICT"
        ? "Otra persona modificó el servicio. Actualiza antes de volver a editar."
        : cause instanceof CrmServicesApiError && cause.code === "CRM_SERVICES_IDEMPOTENCY_CONFLICT"
          ? "El guardado anterior ya se registró. Actualiza el listado para ver el servicio."
          : "No se pudo guardar el servicio. Revisa el nombre, la categoría y las modalidades.");
    } finally { setSaving(false); }
  }
  async function toggleStatus(item: ServiceCatalogItem) {
    if (!canManage || saving) return;
    if (item.status === "INACTIVE" && findActiveDuplicate(item)) {
      openDraft(item);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { name, category, usage, sortOrder, allowedComplementaryRefs, compatibleModes } = item;
      await api.updateCatalog(item.serviceRef, {
        requestId: crypto.randomUUID(), expectedVersion: item.version, name, category, usage, sortOrder, allowedComplementaryRefs,
        compatibleModes: [...compatibleModes].sort(), status: item.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
      });
      if (draft?.serviceRef === item.serviceRef) setDraft(null);
      await refresh();
    } catch (cause) {
      if (cause instanceof CrmServicesApiError && cause.code === "CRM_SERVICES_DUPLICATE_NAME") {
        openDraft(item);
        await reportDuplicate();
      } else {
        report(cause, "No se pudo cambiar el estado del servicio. Revisa sus usos.");
      }
    }
    finally { setSaving(false); }
  }
  async function openDetails(service: ServiceCatalogItem, kind: "DEFAULTS" | "HISTORY") {
    request.current = crypto.randomUUID();
    setError("");
    setDetailStatus("loading");
    setHistory(null);
    setDefaultRecord(null);
    setDefaultRefs([]);
    setDetails({ service, kind });
    try {
      if (kind === "HISTORY") {
        setHistory((await api.history(service.serviceRef)).events);
      } else {
        const current = (await api.defaults(service.serviceRef)).find((value) => value.isDefault && value.status === "ACTIVE");
        setDefaultRecord(current ?? null);
        setDefaultRefs(current?.complementaries.map((entry) => entry.serviceRef) ?? []);
      }
      setDetailStatus("ready");
    } catch (cause) {
      setDetailStatus("error");
      report(cause, "No se pudo cargar el detalle del servicio.");
    }
  }
  async function saveDefaults() {
    if (!details || !allowDefaults || !canManage || saving || detailStatus !== "ready") return;
    setSaving(true);
    setError("");
    try {
      await api.saveDefaults({
        requestId: request.current, primaryServiceRef: details.service.serviceRef,
        combinationRef: defaultRecord?.combinationRef ?? null, code: defaultRecord?.code ?? null,
        name: defaultRecord?.name ?? "Predeterminado " + details.service.name, isDefault: true, status: "ACTIVE",
        expectedVersion: defaultRecord?.version ?? null, complementaryRefs: defaultRefs,
      });
      setDetails(null);
    } catch (cause) { report(cause, "No se pudieron guardar los complementarios iniciales."); }
    finally { setSaving(false); }
  }

  const editor = draft && <>
    <tr className="bg-sky-50/70">
      <td><input ref={nameInput} form={form} aria-label="Nombre del servicio" aria-invalid={duplicate ? true : undefined}
        aria-describedby={matchedService ? nameNotice : undefined} placeholder="Nombre del servicio" className={FIELD} required maxLength={160}
        disabled={saving} value={draft.name} onChange={(event) => changeNameOrCategory({ name: event.target.value })} /></td>
      <td><select form={form} aria-label="Categoría" className={FIELD} required disabled={saving}
        title={draft.category ? categoryLabel(draft.category) : undefined}
        value={draft.category} onChange={(event) => changeNameOrCategory({ category: event.target.value })}>
        <option value="" disabled>Selecciona categoría</option>
        {legacyCategory && <option value={legacyCategory}>{categoryLabel(legacyCategory)} (registrada)</option>}
        {Array.from(SERVICE_CATEGORIES, ([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></td>
      <td title={roleLocked ? ROLE_LOCKED_HELP : undefined}><select form={form} aria-label="Rol en el caso" className={FIELD} disabled={saving || roleLocked} value={draft.usage}
        onChange={(event) => setDraft({ ...draft, usage: event.target.value as Draft["usage"] })}>
        {Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></td>
      <td><div className="flex flex-wrap gap-x-2 gap-y-1">
        {([["LOCAL", "Local"], ["EXPORT", "Exp."], ["IMPORT", "Imp."]] as const).map(([mode, label]) => <label key={mode} className="flex items-center gap-1" title={SCOPES[mode]}>
          <input type="checkbox" aria-label={SCOPES[mode]} disabled={saving} checked={draft.compatibleModes.includes(mode)}
            onChange={() => setDraft({ ...draft, compatibleModes: draft.compatibleModes.includes(mode) ? draft.compatibleModes.filter((item) => item !== mode) : [...draft.compatibleModes, mode] })} />{label}
        </label>)}
      </div></td>
      <td>{draft.serviceRef ? STATUS[draft.status] : "Nuevo"}</td><td className="text-right">{editedService?.usageCount ?? "—"}</td>
      <td><form id={form} onSubmit={(event) => void save(event)} className="flex justify-end">
        <AdministrationIconAction label="Guardar servicio" type="submit" className={ACTION + " text-emerald-700"} disabled={saving || !canSaveDraft}><Check aria-hidden="true" className="size-4" /></AdministrationIconAction>
        <AdministrationIconAction label="Cancelar edición del servicio" className={ACTION} disabled={saving} onClick={() => { setDraft(null); setError(""); }}><X aria-hidden="true" className="size-4" /></AdministrationIconAction>
      </form></td>
    </tr>
    {matchedService && <tr><td colSpan={7}>
      <div className={"flex flex-wrap items-center gap-x-2 gap-y-1 py-1 " + (duplicate || matchedService === reactivationConflict ? "text-red-800" : "text-amber-900")}>
        <p id={nameNotice} role="status">
          {nameNoticeText} · <strong>{matchedService.name}</strong> · {categoryLabel(matchedService.category)} · {STATUS[matchedService.status]}
        </p>
        <button type="button" disabled={saving} onClick={() => openDraft(matchedService)}
          aria-label={"Abrir servicio " + matchedService.name}
          className="font-semibold text-[#003366] underline underline-offset-2 disabled:opacity-50">
          {matchedService.status === "INACTIVE" ? "Ver para reactivar" : "Abrir"}
        </button>
      </div>
    </td></tr>}
    {offerReactivation && !reactivationConflict && <tr><td colSpan={7}>
      <button type="button" disabled={saving} onClick={() => void toggleStatus(editedService)}
        className="py-1 font-semibold text-[#003366] underline underline-offset-2 disabled:opacity-50">Reactivar</button>
    </td></tr>}
    {draft.usage !== "COMPLEMENTARY" && <tr className="bg-sky-50/70"><td colSpan={7}>
      <details className="py-1.5">
        <summary className="cursor-pointer font-semibold text-[#003366]">Complementarios permitidos · {draft.allowedComplementaryRefs.length}</summary>
        <div className="flex max-h-24 flex-wrap gap-x-4 gap-y-2 overflow-auto py-2">
          {complementary.filter((item) => item.serviceRef !== draft.serviceRef).map((item) => <label key={item.serviceRef} className="flex items-center gap-1">
            <input type="checkbox" disabled={saving} checked={draft.allowedComplementaryRefs.includes(item.serviceRef)} onChange={() => setDraft({
              ...draft, allowedComplementaryRefs: draft.allowedComplementaryRefs.includes(item.serviceRef)
                ? draft.allowedComplementaryRefs.filter((ref) => ref !== item.serviceRef) : [...draft.allowedComplementaryRefs, item.serviceRef],
            })} />{item.name}
          </label>)}
          {!complementary.length && <span className="text-slate-500">Sin servicios complementarios activos.</span>}
        </div>
      </details>
    </td></tr>}
    {error && !(error === DUPLICATE_NAME_ERROR && (duplicate || reactivationConflict)) &&
      <tr><td colSpan={7}><p role="alert" className="py-1 text-red-800">{error}</p></td></tr>}
  </>;

  return <section data-testid="service-catalog-admin" aria-label="Catálogo de servicios" className="min-w-0 pt-1">
    {details ? <>
      <header className="flex flex-wrap items-center gap-2 border-b py-2">
        <AdministrationIconAction label="Volver a servicios" className={ACTION} disabled={detailStatus === "loading" || saving}
          onClick={() => { setDetails(null); setError(""); }}><ArrowLeft aria-hidden="true" className="size-4" /></AdministrationIconAction>
        <h3 className="flex-1 text-sm font-semibold text-[#003366]">{details.kind === "HISTORY" ? "Historial" : "Complementarios iniciales"} · {details.service.name}</h3>
        {allowDefaults && <>
          <AdministrationHelp title="complementarios iniciales"><p>Marca los complementarios permitidos que deben quedar preseleccionados al elegir este servicio como principal en Comercial.</p></AdministrationHelp>
          <Button size="sm" type="button" disabled={saving || detailStatus !== "ready"}
            onClick={() => void saveDefaults()}><Check aria-hidden="true" />Guardar</Button>
        </>}
      </header>
      {detailStatus === "loading" && <p role="status" className="py-2 text-xs text-slate-500">Cargando…</p>}
      {error && <p role="alert" className="py-2 text-xs text-red-800">{error}</p>}
      {detailStatus === "ready" && (details.kind === "HISTORY" ? <ul className="divide-y divide-slate-200 bg-white text-xs">
        {history?.map((event, index) => <li key={event.createdAt + "-" + index} className="flex justify-between gap-3 px-2 py-2">
          <span>{EVENT_LABELS[event.action] ?? "Cambio de configuración"}</span><span>v{event.version} · {DATE.format(new Date(event.createdAt))}</span>
        </li>)}
        {history?.length === 0 && <li className="px-2 py-2 text-slate-500">Sin cambios registrados.</li>}
      </ul> : <div className="divide-y divide-slate-200 bg-white text-xs">
        {complementary.filter((item) => details.service.allowedComplementaryRefs.includes(item.serviceRef)).map((item) => <label key={item.serviceRef} className="flex items-center gap-2 px-2 py-2">
          <input type="checkbox" disabled={saving} checked={defaultRefs.includes(item.serviceRef)} onChange={() => setDefaultRefs((current) =>
            current.includes(item.serviceRef) ? current.filter((ref) => ref !== item.serviceRef) : [...current, item.serviceRef])} />{item.name}
        </label>)}
        {!complementary.some((item) => details.service.allowedComplementaryRefs.includes(item.serviceRef)) && <p className="px-2 py-2 text-slate-500">Primero agrega complementarios permitidos en la edición del servicio.</p>}
      </div>)}
    </> : <>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 py-1.5">
        <div className="relative flex min-w-48 max-w-sm flex-1 items-center">
          <Search aria-hidden="true" className="absolute left-2 size-4 text-slate-500" />
          <input aria-label="Buscar servicio" placeholder="Buscar servicio" className={FIELD + " bg-white pl-8"} value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        {canManage && <AdministrationIconAction label="Nuevo servicio" mobileLabel="Nuevo" disabled={Boolean(draft) || saving}
          onClick={() => openDraft()}><Plus aria-hidden="true" className="size-4" /></AdministrationIconAction>}
        <AdministrationHelp title="catálogo de servicios">
          <p><strong>Rol en el caso.</strong> Elige si el servicio puede ser principal, complementario o ambos. {ROLE_LOCKED_HELP}</p>
          <p><strong>En planes.</strong> Indica cuántas veces figura el servicio en planes guardados de Comercial. Incluye las versiones anteriores de un mismo caso.</p>
          <p><strong>Complementarios.</strong> En la edición, marca los servicios que se pueden agregar cuando este sea el principal. El icono de capas permite elegir cuáles de ellos quedan preseleccionados en Comercial.</p>
          <p>La categoría agrupa servicios en el catálogo. Almacenaje con custodia habilita el flujo de contrato y autorizaciones de almacén cuando el servicio se agrega a un caso. Selecciona la categoría propia de cada trabajo, como Empaque y embalaje o Transporte.</p>
          <p>Si el nombre ya existe en la categoría, abre el servicio existente. Puedes reactivarlo desde su ficha si está inactivo y no hay otro activo con ese nombre.</p>
        </AdministrationHelp>
      </div>
      {error && !draft && <p role="alert" className="py-2 text-xs text-red-800">{error}</p>}
      <div className={TABLE_WRAP}>
        <table aria-label="Servicios disponibles" className="w-full min-w-[770px] table-fixed text-left">
          <thead className={COMPACT_TABLE_HEAD}><tr><th className="w-[19%]" scope="col">Servicio</th><th className="w-[17%]" scope="col">Categoría</th>
            <th className="w-[13%]" scope="col">Rol en el caso</th><th className="w-[16%]" scope="col">Modalidades</th><th className="w-[8%]" scope="col">Estado</th>
            <th className="w-[7%] text-right" scope="col" title="Registros del servicio en planes guardados, incluidas sus versiones">En planes</th><th scope="col"><span className="sr-only">Acciones</span></th></tr></thead>
          <tbody className={COMPACT_TABLE_BODY}>
            {draft && !draft.serviceRef && editor}
            {visible.map((item) => item.serviceRef === draft?.serviceRef ? <Fragment key={item.serviceRef}>{editor}</Fragment> :
              <tr key={item.serviceRef} className="h-9 text-slate-700 hover:bg-slate-50">
                <td className={"break-words font-semibold " + (item.status === "INACTIVE" ? "text-red-700" : "text-slate-900")}>{item.name}</td>
                <td className="break-words">{categoryLabel(item.category)}</td>
                <td>{ROLE_LABELS[item.usage]}</td><td>{item.compatibleModes.map((mode) => SCOPES[mode]).join(", ") || "—"}</td>
                <td className={item.status === "INACTIVE" ? "font-semibold text-red-700" : undefined}>{STATUS[item.status]}</td>
                <td className="text-right tabular-nums">{item.usageCount}</td>
                <td><div className="flex justify-end">
                  {canManage && <AdministrationIconAction label={"Editar servicio " + item.name} disabled={Boolean(draft) || saving} className={ACTION}
                    onClick={() => openDraft(item)}><Pencil aria-hidden="true" className="size-4" /></AdministrationIconAction>}
                  {canManage && item.usage !== "COMPLEMENTARY" && <AdministrationIconAction label={"Complementarios iniciales de " + item.name}
                    disabled={Boolean(draft) || saving} className={ACTION} onClick={() => void openDetails(item, "DEFAULTS")}><Layers3 aria-hidden="true" className="size-4" /></AdministrationIconAction>}
                  <AdministrationIconAction label={"Historial de " + item.name} disabled={Boolean(draft) || saving} className={ACTION}
                    onClick={() => void openDetails(item, "HISTORY")}><History aria-hidden="true" className="size-4" /></AdministrationIconAction>
                  {canManage && <AdministrationIconAction label={(item.status === "ACTIVE" ? "Desactivar " : "Activar ") + item.name}
                    disabled={Boolean(draft) || saving} className={ACTION} onClick={() => void toggleStatus(item)}><Power aria-hidden="true" className="size-4" /></AdministrationIconAction>}
                </div></td>
              </tr>)}
            {!visible.length && !draft && <tr><td colSpan={7} className="h-11 text-slate-500">{search.trim() ? "Sin coincidencias." : "Sin servicios en el catálogo."}</td></tr>}
          </tbody>
        </table>
      </div>
    </>}
  </section>;
}
