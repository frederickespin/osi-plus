import { Fragment, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Check, Pencil, Plus, RefreshCw, X } from "lucide-react";
import { AdministrationHelp, AdministrationIconAction } from "@/administration/AdministrationHelp";
import { COMPACT_TABLE_BODY, COMPACT_TABLE_FIELD, COMPACT_TABLE_HEAD } from "@/components/ui/compact-form";
import type { ServiceCatalogCategory } from "../../shared/serviceCatalogCategories.js";
import { serviceCatalogNameKey } from "../../shared/serviceCatalogNames.js";
import { CrmServicesApi, CrmServicesApiError } from "./api";

type Props = Readonly<{
  api: CrmServicesApi;
  categories: readonly ServiceCatalogCategory[];
  state: "loading" | "ready" | "error";
  canManage: boolean;
  onBack(): void;
  onReload(): void;
  onSaved(category: ServiceCatalogCategory): void;
  onUnauthorized(): void;
}>;
type Draft = { name: string; source: ServiceCatalogCategory | null; requestId: string };
const ACTION = "border-transparent bg-transparent";
const DUPLICATE = "Ya existe una categoría con ese nombre.";

export default function ServiceCategoryAdmin({ api, categories, state, canManage, onBack, onReload, onSaved, onUnauthorized }: Props) {
  const form = useId();
  const noticeId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const editingRequest = draft?.requestId;
  const name = draft?.name.trim() ?? "";
  const nameKey = serviceCatalogNameKey(name);
  const previousNameKey = draft?.source ? serviceCatalogNameKey(draft.source.name) : "";
  const duplicate = Boolean(draft && nameKey && nameKey !== previousNameKey && categories.some(
    (category) => category.code !== draft.source?.code && serviceCatalogNameKey(category.name) === nameKey,
  ));
  const canSave = canManage && state === "ready" && !saving && Boolean(nameKey) && !duplicate && name !== draft?.source?.name;
  const notice = duplicate ? DUPLICATE : error;

  useEffect(() => {
    if (editingRequest) nameRef.current?.focus();
  }, [editingRequest]);

  function open(source: ServiceCatalogCategory | null) {
    setError("");
    setDraft({ name: source?.name ?? "", source, requestId: crypto.randomUUID() });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !canSave) return;
    setSaving(true);
    setError("");
    try {
      const category = await api.saveCategory({
        requestId: draft.requestId,
        name,
        ...(draft.source && { code: draft.source.code, expectedVersion: draft.source.version }),
      });
      onSaved(category);
      setDraft(null);
    } catch (cause) {
      if (cause instanceof CrmServicesApiError) {
        if (cause.status === 401) { onUnauthorized(); return; }
        if (cause.code === "CRM_SERVICES_CATEGORY_DUPLICATE_NAME") {
          setError(DUPLICATE);
          onReload();
          return;
        }
        if (cause.code === "CRM_SERVICES_VERSION_CONFLICT" || cause.code === "CRM_SERVICES_CATEGORY_NOT_FOUND") {
          setError("La categoría cambió. Cancela y vuelve a editarla para usar la versión actual.");
          onReload();
          return;
        }
        if (cause.code === "CRM_SERVICES_IDEMPOTENCY_CONFLICT") {
          setError("El guardado anterior ya se registró. Cancela la edición para ver el resultado.");
          onReload();
          return;
        }
        if (cause.code === "CRM_SERVICES_CATEGORY_STORAGE_UNAVAILABLE") {
          setError("La edición de categorías no está disponible en este momento.");
          return;
        }
      }
      setError("No se pudo guardar la categoría. Intenta de nuevo.");
    } finally { setSaving(false); }
  }

  const editor = draft && <>
    <tr className="h-9 bg-sky-50/70">
      <td>
        <input ref={nameRef} form={form} aria-label="Nombre de la categoría" placeholder="Nombre de la categoría"
          aria-invalid={duplicate || undefined} aria-describedby={notice ? noticeId : undefined}
          className={COMPACT_TABLE_FIELD + " max-w-md"} required maxLength={80}
          value={draft.name} disabled={saving} onChange={(event) => {
            setDraft({ ...draft, name: event.target.value });
            setError("");
          }} />
      </td>
      <td>
        <form id={form} className="flex justify-end" onSubmit={(event) => void save(event)}>
          <AdministrationIconAction label="Guardar categoría" type="submit" className={ACTION + " text-emerald-700"} disabled={!canSave}>
            <Check aria-hidden="true" className="size-4" />
          </AdministrationIconAction>
          <AdministrationIconAction label="Cancelar edición de categoría" className={ACTION} disabled={saving}
            onClick={() => { setDraft(null); setError(""); }}><X aria-hidden="true" className="size-4" /></AdministrationIconAction>
        </form>
      </td>
    </tr>
    {notice && <tr><td colSpan={2}><p id={noticeId} role="alert" className="py-1 text-red-800">{notice}</p></td></tr>}
  </>;

  return <div className="max-w-3xl">
    <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 py-1.5">
      <AdministrationIconAction label="Volver a servicios" className={ACTION} disabled={Boolean(draft) || saving} onClick={onBack}>
        <ArrowLeft aria-hidden="true" className="size-4" />
      </AdministrationIconAction>
      <h3 className="flex-1 text-sm font-semibold text-[#003366]">Categorías de servicios</h3>
      {canManage && <AdministrationIconAction label="Nueva categoría" mobileLabel="Nueva" disabled={Boolean(draft) || state !== "ready" || saving}
        onClick={() => open(null)}><Plus aria-hidden="true" className="size-4" /></AdministrationIconAction>}
      <AdministrationHelp title="categorías de servicios">
        <p>Agrega las categorías que necesites para agrupar tus servicios. Por ejemplo, Seguridad y monitoreo.</p>
        <p>Al renombrar una categoría, sus servicios siguen asociados. La categoría de almacenaje con custodia conserva las reglas de ese flujo.</p>
      </AdministrationHelp>
    </header>
    {state === "loading" && <p role="status" className="py-2 text-xs text-slate-500">Cargando categorías…</p>}
    {state === "error" && <div className="flex items-center gap-2 py-1">
      <p role="alert" className="text-xs text-red-800">No se pudieron cargar las categorías.</p>
      <AdministrationIconAction label="Reintentar carga de categorías" className={ACTION} onClick={onReload}>
        <RefreshCw aria-hidden="true" className="size-4" />
      </AdministrationIconAction>
    </div>}
    <div className="max-h-[max(14rem,calc(100dvh-17rem))] overflow-auto border-b border-slate-200">
      <table aria-label="Categorías de servicios" className="w-full table-fixed text-left">
        <thead className={COMPACT_TABLE_HEAD}><tr>
          <th scope="col">Nombre</th>
          <th scope="col" className="w-24"><span className="sr-only">Acciones</span></th>
        </tr></thead>
        <tbody className={COMPACT_TABLE_BODY}>
          {draft && !draft.source && editor}
          {categories.map((category) => draft?.source?.code === category.code ? <Fragment key={category.code}>{editor}</Fragment> :
            <tr key={category.code} className="h-9 text-slate-700 hover:bg-slate-50">
              <td className="break-words font-semibold text-slate-900">{category.name}</td>
              <td className="text-right">
                {canManage && <AdministrationIconAction label={`Editar categoría ${category.name}`} className={ACTION}
                  disabled={Boolean(draft) || state !== "ready" || saving} onClick={() => open(category)}>
                  <Pencil aria-hidden="true" className="size-4" />
                </AdministrationIconAction>}
              </td>
            </tr>)}
        </tbody>
      </table>
    </div>
  </div>;
}
