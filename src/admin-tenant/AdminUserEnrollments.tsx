import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Link2, RefreshCw, UserPlus, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AdministrationHelp, AdministrationIconAction } from "@/administration/AdministrationHelp";
import type { AdminMembershipRoleCode } from "../../shared/adminMembershipCatalog.js";
import { AdminApiError } from "./adminApi";
import AdminIdentityFields, { type IdentityFieldsDraft, type IdentityPhotoDraft } from "./AdminIdentityFields";
import { AdminUserIdentityApi, MAX_IDENTITY_PHOTO_SOURCE_BYTES, prepareIdentityPhoto, type AdminUserEnrollment } from "./adminUserIdentityApi";
import { identityErrorText } from "./useAdminIdentityEditor";

type Props = Readonly<{
  api: AdminUserIdentityApi;
  open: boolean;
  onOpenChange(open: boolean): void;
  roles: readonly Readonly<{ code: AdminMembershipRoleCode; label: string }>[];
  busy: boolean;
  onBusyChange(busy: boolean): void;
  onUnauthorized(): void;
  refreshKey: number;
}>;
const emptyDraft = (): IdentityFieldsDraft => ({ name: "", documentType: "CEDULA", documentNumber: "", phone: "", email: "", contactEmail: "" });
const statusLabel = { PENDING: "Pendiente", ACTIVATED: "Activado", EXPIRED: "Vencido", REVOKED: "Revocado" };

export default function AdminUserEnrollments({ api, open, onOpenChange, roles, busy, onBusyChange, onUnauthorized, refreshKey }: Props) {
  const [enrollments, setEnrollments] = useState<readonly AdminUserEnrollment[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [photo, setPhoto] = useState<IdentityPhotoDraft>(null);
  const [role, setRole] = useState<AdminMembershipRoleCode>("N");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [activationPath, setActivationPath] = useState<string | null>(null);
  const [created, setCreated] = useState(false);
  const [copied, setCopied] = useState(false);
  const [requiresRefresh, setRequiresRefresh] = useState(false);
  const epoch = useRef(0);
  const requestId = useRef(crypto.randomUUID());
  const requests = useRef(new Set<AbortController>());
  const listRequest = useRef<AbortController | null>(null);
  const mutationPending = useRef(false);
  const callbacks = useRef({ onUnauthorized, onBusyChange });
  useEffect(() => { callbacks.current = { onUnauthorized, onBusyChange }; }, [onUnauthorized, onBusyChange]);
  useEffect(() => { onBusyChange(saving || Boolean(revoking)); }, [onBusyChange, saving, revoking]);
  useEffect(() => {
    const pending = requests.current;
    setEnrollments([]); setLoading(false); setSaving(false); setRevoking(null); setListError(null); setRequiresRefresh(false);
    mutationPending.current = false;
    listRequest.current = null;
    return () => { pending.forEach((controller) => controller.abort()); pending.clear(); callbacks.current.onBusyChange(false); };
  }, [api]);
  useEffect(() => {
    epoch.current += 1;
    setActivationPath(null); setCreated(false); setCopied(false); setError(null); setDraft(emptyDraft()); setPhoto(null); setRole("N");
    if (open) requestId.current = crypto.randomUUID();
  }, [open, api]);

  const reload = useCallback(async () => {
    if (mutationPending.current) return;
    listRequest.current?.abort();
    const controller = new AbortController(); requests.current.add(controller); setLoading(true); setListError(null);
    listRequest.current = controller;
    try { const rows = await api.enrollments(controller.signal); if (!controller.signal.aborted) { setEnrollments(rows); setRequiresRefresh(false); } }
    catch (cause) { if (!controller.signal.aborted) { if (cause instanceof AdminApiError && cause.status === 401) callbacks.current.onUnauthorized(); else setListError(identityErrorText(cause)); } }
    finally { requests.current.delete(controller); if (listRequest.current === controller) listRequest.current = null; if (!controller.signal.aborted) setLoading(false); }
  }, [api]);
  useEffect(() => { void reload(); }, [reload, refreshKey]);

  const submit = async () => {
    if (saving || busy || requiresRefresh || created || !draft.name.trim() || !draft.email.trim() || role === "A") return;
    const controller = new AbortController(); requests.current.add(controller);
    const currentEpoch = epoch.current;
    const currentRequestId = requestId.current;
    mutationPending.current = true; listRequest.current?.abort(); listRequest.current = null; setLoading(false);
    setSaving(true); setError(null); setActivationPath(null); setCopied(false);
    let sent = false;
    try {
      const photoBase64 = photo instanceof File ? await prepareIdentityPhoto(photo, controller.signal) : undefined;
      if (controller.signal.aborted) return;
      sent = true;
      const result = await api.enroll({ requestId: currentRequestId, name: draft.name.trim(), email: draft.email.trim(), phone: draft.phone.trim(), documentType: draft.documentType, documentNumber: draft.documentNumber.trim() || null, role, ...(photoBase64 ? { photoBase64 } : {}) }, controller.signal);
      if (controller.signal.aborted) return;
      setEnrollments((current) => [result.enrollment, ...current.filter((item) => item.enrollmentRef !== result.enrollment.enrollmentRef)]);
      if (currentEpoch === epoch.current) { setCreated(true); setActivationPath(result.activationPath); setPhoto(null); }
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof AdminApiError && cause.status === 401) callbacks.current.onUnauthorized();
      else {
        const message = identityErrorText(cause);
        if (sent && (!(cause instanceof AdminApiError) || cause.status >= 500 || cause.status === 409)) setRequiresRefresh(true);
        if (currentEpoch === epoch.current) setError(message); else setListError(message);
      }
    } finally { requests.current.delete(controller); if (!controller.signal.aborted) { mutationPending.current = false; setSaving(false); } }
  };
  const revoke = async (ref: string) => {
    if (saving || revoking || busy) return;
    const controller = new AbortController(); requests.current.add(controller); setRevoking(ref); setListError(null);
    mutationPending.current = true; listRequest.current?.abort(); listRequest.current = null; setLoading(false);
    try {
      const result = await api.revoke(ref, controller.signal);
      if (!controller.signal.aborted) setEnrollments((current) => current.map((row) => row.enrollmentRef === result.enrollmentRef ? result : row));
    } catch (cause) { if (!controller.signal.aborted) { if (cause instanceof AdminApiError && cause.status === 401) callbacks.current.onUnauthorized(); else { setListError(identityErrorText(cause)); setRequiresRefresh(true); } } }
    finally { requests.current.delete(controller); if (!controller.signal.aborted) { mutationPending.current = false; setRevoking(null); } }
  };
  const copy = async () => {
    if (!activationPath) return;
    try { await navigator.clipboard.writeText(`${window.location.origin}${activationPath}`); setCopied(true); }
    catch { setError("No se pudo copiar el enlace. Puede seleccionarlo y copiarlo manualmente."); }
  };

  return <>
    {(enrollments.length > 0 || listError || requiresRefresh) && <section aria-labelledby="user-enrollments-title" className="mt-5">
      <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-1"><h3 id="user-enrollments-title" className="text-sm font-semibold text-slate-800">Altas de usuarios</h3><AdministrationHelp title="Altas de usuarios"><p>El alta permanece pendiente hasta que la persona activa su cuenta con el enlace.</p><p>El enlace vence y sólo se muestra al crearlo. Si se pierde, revoque el alta pendiente y prepare una nueva.</p></AdministrationHelp></div><AdministrationIconAction label="Recargar altas" disabled={loading || saving || Boolean(revoking)} onClick={() => void reload()}><RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></AdministrationIconAction></div>
      {listError && <p role="alert" className="my-2 rounded bg-red-50 p-2 text-xs text-red-800">{listError}</p>}
      {requiresRefresh && <p role="alert" className="my-2 rounded bg-amber-50 p-2 text-xs text-amber-900">Recargue las altas para confirmar el resultado antes de intentarlo nuevamente.</p>}
      <div className="mt-2 max-h-72 divide-y overflow-y-auto rounded border border-slate-200 bg-white">{enrollments.map((item) => <div key={item.enrollmentRef} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"><div className="min-w-0"><strong className="block truncate text-xs text-slate-900">{item.name}</strong><span className="block break-all text-[11px] text-slate-500">{item.email}</span></div><div className="flex items-center gap-2"><span className="text-[11px] text-slate-500">{roles.find((option) => option.code === item.role)?.label || item.role}</span><span className={`rounded-full px-2 py-0.5 text-[10px] ${item.status === "PENDING" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{statusLabel[item.status]}</span>{item.status === "PENDING" && <AdministrationIconAction label={`Revocar alta de ${item.name}`} disabled={saving || Boolean(revoking) || busy || requiresRefresh} onClick={() => void revoke(item.enrollmentRef)}><XCircle aria-hidden="true" className="h-4 w-4" /></AdministrationIconAction>}</div></div>)}</div>
    </section>}
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto p-4 sm:max-w-2xl sm:p-5">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><UserPlus aria-hidden="true" className="h-5 w-5" />Nuevo usuario</DialogTitle><DialogDescription>Registre la identidad y prepare el acceso a esta empresa.</DialogDescription></DialogHeader>
        {created ? <div className="space-y-4">
          <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900" role="status"><strong className="block">Alta registrada</strong><span className="text-xs">La persona activará su cuenta desde el enlace.</span></div>
          {activationPath ? <div className="space-y-2"><label className="block text-xs font-semibold text-slate-700">Enlace de activación<textarea aria-label="Enlace de activación" readOnly rows={3} value={`${window.location.origin}${activationPath}`} className="mt-1 w-full resize-none rounded border border-slate-300 bg-slate-50 p-2 text-xs font-normal" /></label><p className="text-xs text-slate-500">Cópielo antes de cerrar; sólo está disponible ahora. Compártalo por su canal habitual.</p><button type="button" onClick={() => void copy()} className="inline-flex min-h-9 items-center gap-1.5 rounded bg-[#003366] px-3 text-xs font-semibold text-white">{copied ? <Check aria-hidden="true" className="h-4 w-4" /> : <Copy aria-hidden="true" className="h-4 w-4" />}{copied ? "Enlace copiado" : "Copiar enlace"}</button></div> : <p className="text-xs text-amber-800">El alta ya estaba registrada y el enlace no puede recuperarse. Para reemplazarlo, revoque el alta pendiente y prepare una nueva.</p>}
          {error && <p role="alert" className="rounded bg-red-50 p-2 text-xs text-red-800">{error}</p>}
          <div className="flex justify-end border-t border-slate-200 pt-3"><button type="button" onClick={() => onOpenChange(false)} className="min-h-9 rounded border border-slate-300 px-3 text-xs font-medium text-slate-700">Cerrar</button></div>
        </div> : <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <AdminIdentityFields draft={draft} onChange={setDraft} photo={photo} onPhotoChange={setPhoto} disabled={saving || busy || requiresRefresh} emailEditable maxPhotoBytes={MAX_IDENTITY_PHOTO_SOURCE_BYTES} />
          <div className="flex items-start gap-2"><label className="block min-w-0 flex-1 text-xs font-semibold text-slate-700">Rol inicial<select aria-label="Rol inicial" value={role} onChange={(event) => setRole(event.target.value as AdminMembershipRoleCode)} disabled={saving || busy || requiresRefresh} className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-2 text-sm disabled:bg-slate-50">{roles.filter((option) => option.code !== "A").map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}</select></label><div className="pt-5"><AdministrationHelp title="Rol inicial"><p>El rol aporta sus permisos habituales. Las excepciones se revisan en Acceso después de la activación.</p><p>El alta de administradores conserva su proceso de aprobación específico.</p></AdministrationHelp></div></div>
          <p className="flex items-start gap-2 text-xs text-slate-500"><Link2 aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />La persona elegirá su contraseña al activar una cuenta nueva. Si ya tiene cuenta, aceptará con su sesión existente.</p>
          {error && <p role="alert" className="rounded bg-red-50 p-2 text-xs text-red-800">{error}</p>}
          {requiresRefresh && <div className="flex flex-wrap items-center justify-between gap-2 rounded bg-amber-50 p-2 text-xs text-amber-900"><span>Confirme el resultado antes de repetir el alta.</span><button type="button" onClick={() => void reload()} disabled={loading} className="inline-flex items-center gap-1 rounded border border-amber-300 px-2 py-1"><RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />Recargar altas</button></div>}
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-3"><button type="button" onClick={() => onOpenChange(false)} className="min-h-9 rounded border border-slate-300 px-3 text-xs font-medium text-slate-600">Cancelar</button><button type="submit" disabled={saving || busy || requiresRefresh || !draft.name.trim() || !draft.email.trim()} className="inline-flex min-h-9 items-center gap-1.5 rounded bg-[#003366] px-3 text-xs font-semibold text-white disabled:opacity-50"><UserPlus aria-hidden="true" className="h-4 w-4" />{saving ? "Preparando…" : "Preparar alta"}</button></div>
        </form>}
      </DialogContent>
    </Dialog>
  </>;
}
