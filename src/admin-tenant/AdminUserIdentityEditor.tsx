import { RefreshCw, Save } from "lucide-react";
import AdminIdentityFields from "./AdminIdentityFields";
import { MAX_IDENTITY_PHOTO_SOURCE_BYTES } from "./adminUserIdentityApi";
import type { useAdminIdentityEditor } from "./useAdminIdentityEditor";

export default function AdminUserIdentityEditor({ editor, onClose }: { editor: ReturnType<typeof useAdminIdentityEditor>; onClose(): void }) {
  return <div className="space-y-3">
    {editor.loading && <p role="status" className="py-8 text-center text-sm text-slate-500">Cargando identidad…</p>}
    {editor.draft && <AdminIdentityFields draft={editor.draft} onChange={editor.setDraft} photo={editor.photo} onPhotoChange={editor.setPhoto} photoUrl={editor.photoState.url} photoLoading={editor.photoState.loading} disabled={!editor.identity?.canEdit || editor.saving || editor.loading || editor.mustReload} maxPhotoBytes={MAX_IDENTITY_PHOTO_SOURCE_BYTES} />}
    {editor.photoState.failed && <p className="text-xs text-amber-800">La foto no pudo cargarse. Los demás datos de la ficha están disponibles.</p>}
    {editor.identity && !editor.identity.canEdit && <p className="text-xs text-slate-500">Tiene acceso de consulta a esta identidad.</p>}
    {editor.error && <p role="alert" className="rounded bg-red-50 p-2 text-xs text-red-800">{editor.error}</p>}
    {editor.mustReload && <p className="text-xs text-slate-600">Recargue la identidad para confirmar su estado antes de realizar otro cambio.</p>}
    {editor.saved && <p role="status" className="text-xs font-medium text-emerald-700">Identidad guardada.</p>}
    <div className="sticky bottom-0 z-10 flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-white pb-2 pt-3">
      {(editor.mustReload || editor.error && !editor.identity) && <button type="button" disabled={editor.loading || editor.saving} onClick={editor.reload} className="inline-flex min-h-9 items-center gap-1.5 rounded border border-slate-300 px-3 text-xs font-medium text-slate-700 disabled:opacity-50"><RefreshCw aria-hidden="true" className={`h-4 w-4 ${editor.loading ? "animate-spin" : ""}`} />Recargar identidad</button>}
      <button type="button" onClick={onClose} className="min-h-9 rounded border border-slate-300 px-3 text-xs font-medium text-slate-600">Cerrar</button>
      <button type="button" onClick={() => void editor.save()} disabled={!editor.identity?.canEdit || editor.loading || editor.saving || editor.mustReload || !editor.hasChanges} className="inline-flex min-h-9 items-center gap-1.5 rounded bg-[#003366] px-3 text-xs font-semibold text-white disabled:opacity-50"><Save aria-hidden="true" className="h-4 w-4" />{editor.saving ? "Guardando…" : "Guardar identidad"}</button>
    </div>
  </div>;
}
