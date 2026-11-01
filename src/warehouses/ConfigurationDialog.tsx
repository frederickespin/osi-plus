import type { ReactNode, RefObject } from "react";
import { RefreshCw, Save, X } from "lucide-react";
import { COMPACT_FORM_DIALOG } from "@/components/ui/compact-form";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { WAREHOUSE_BUTTON, WAREHOUSE_PRIMARY_BUTTON } from "./configurationUi";

type Props = Readonly<{
  open: boolean; title: string; description: string; saving: boolean; uncertain: boolean; conflict: boolean;
  error: string | null; canManage: boolean; canSubmit: boolean; children: ReactNode;
  triggerRef: RefObject<HTMLElement | null>; onClose(retain: boolean): void; onRefresh(): void; onSubmit(): void;
}>;

export function ConfigurationDialog({ open, title, description, saving, uncertain, conflict, error, canManage, canSubmit, children, triggerRef, onClose, onRefresh, onSubmit }: Props) {
  return <Dialog open={open} onOpenChange={(next) => { if (!next && !saving) onClose(uncertain); }}>
    <DialogContent className={`${COMPACT_FORM_DIALOG} max-h-[90dvh] overflow-y-auto sm:max-w-xl`} showCloseButton={false} onEscapeKeyDown={(event) => { if (saving) event.preventDefault(); }} onInteractOutside={(event) => event.preventDefault()} onCloseAutoFocus={(event) => { event.preventDefault(); triggerRef.current?.focus(); }}>
      <div className="flex items-start justify-between gap-3"><div><DialogTitle className="text-base text-[#003366]">{title}</DialogTitle><DialogDescription className="mt-1 text-xs leading-5">{description}</DialogDescription></div><button type="button" aria-label="Cerrar formulario" disabled={saving} onClick={() => onClose(uncertain)} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-100 disabled:opacity-40"><X className="h-4 w-4" aria-hidden="true" /></button></div>
      <form onSubmit={(event) => { event.preventDefault(); if (canManage) onSubmit(); }} className="space-y-3">
        {children}
        {error && <p role="alert" className="text-xs leading-5 text-red-800">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-3"><button type="button" disabled={saving} onClick={() => onClose(uncertain)} className={WAREHOUSE_BUTTON}>Cerrar</button>{canManage && (conflict ? <button type="button" onClick={onRefresh} className={WAREHOUSE_BUTTON}><RefreshCw className="h-4 w-4" aria-hidden="true" />Actualizar listado</button> : <button type="submit" disabled={saving || !canSubmit} className={WAREHOUSE_PRIMARY_BUTTON}><Save className="h-4 w-4" aria-hidden="true" />{saving ? "Guardando…" : uncertain ? "Reintentar guardado" : "Guardar cambios"}</button>)}</div>
      </form>
    </DialogContent>
  </Dialog>;
}
