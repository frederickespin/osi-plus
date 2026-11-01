import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { RefreshCw, Save, X } from "lucide-react";
import { WAREHOUSE_BUTTON, WAREHOUSE_PRIMARY_BUTTON } from "./configurationUi";

type Props = Readonly<{
  open: boolean; title: string; description: string; saving: boolean; uncertain: boolean; conflict: boolean;
  error: string | null; canManage: boolean; canSubmit: boolean; children: ReactNode;
  saveLabel?: string;
  triggerRef: RefObject<HTMLElement | null>; onClose(retain: boolean): void; onRefresh(): void; onSubmit(): void;
}>;

export function ConfigurationPanel({ open, title, description, saving, uncertain, conflict, error, canManage, canSubmit, children, saveLabel = "Guardar cambios", triggerRef, onClose, onRefresh, onSubmit }: Props) {
  const headingId = useId();
  const panelRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    panelRef.current?.scrollIntoView({ block: "start" });
    const first = panelRef.current?.querySelector<HTMLElement>("input:not(:disabled), select:not(:disabled), textarea:not(:disabled)");
    (first ?? panelRef.current?.querySelector<HTMLElement>("h3"))?.focus({ preventScroll: true });
    return () => { if (trigger?.isConnected) trigger.focus({ preventScroll: true }); };
  }, [open, triggerRef]);
  if (!open) return null;
  return <section ref={panelRef} role="region" aria-labelledby={headingId} className="mt-4 w-full scroll-mt-4 rounded border border-slate-200 bg-white px-4 py-3 sm:px-5" data-testid="warehouse-inline-editor">
      <div className="mb-3 flex items-start justify-between gap-3"><div><h3 id={headingId} tabIndex={-1} className="text-base font-semibold text-[#003366]">{title}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p></div><button type="button" aria-label="Cerrar formulario" disabled={saving} onClick={() => onClose(uncertain)} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-100 disabled:opacity-40"><X className="h-4 w-4" aria-hidden="true" /></button></div>
      <form onSubmit={(event) => { event.preventDefault(); if (canManage) onSubmit(); }} className="space-y-3">
        {children}
        {error && <p role="alert" className="text-xs leading-5 text-red-800">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-3"><button type="button" disabled={saving} onClick={() => onClose(uncertain)} className={WAREHOUSE_BUTTON}>Cerrar</button>{canManage && (conflict ? <button type="button" onClick={onRefresh} className={WAREHOUSE_BUTTON}><RefreshCw className="h-4 w-4" aria-hidden="true" />Actualizar listado</button> : <button type="submit" disabled={saving || !canSubmit} className={WAREHOUSE_PRIMARY_BUTTON}><Save className="h-4 w-4" aria-hidden="true" />{saving ? "Guardando…" : uncertain ? "Reintentar guardado" : saveLabel}</button>)}</div>
      </form>
  </section>;
}
