import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Search, ShieldCheck, UserCog, UserPlus, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AdminApiError, AdminTenantApi, type AdminIdentityInvitation, type AdminMembership } from "./adminApi";
import { ADMIN_IDENTITY_INVITATION_MODES, type AdminTenantMembershipMode } from "./adminMode";
import { NO_CRM_SERVICES_ACCESS, type CrmServicesUiAccess } from "@/crm-services/access";
import { isCrmServicesUiEnabled } from "@/crm-services/mode";
import { resolveLogisticsUiAccess } from "@/logistics-engine/access";
import { isLogisticsUiEnabled } from "@/logistics-engine/mode";

const ServiceCatalogAdmin = lazy(() => import("@/crm-services/ServiceCatalogAdmin"));
const LogisticsRulesAdmin = lazy(() => import("@/logistics-engine/LogisticsRulesAdmin"));

const ADMIN_PERMISSIONS = Object.freeze([
  "membership:view",
  "membership:update:role",
  "membership:update:permissions",
  "membership:update:status",
]);

type Props = Readonly<{
  authorization?: string;
  effectivePermissions: readonly string[];
  deniedPermissions: readonly string[];
  servicesAccess?: CrmServicesUiAccess;
  invitationEnabled?: boolean;
  invitationMode?: AdminTenantMembershipMode;
  onUnauthorized(): void;
  api?: AdminTenantApi;
}>;

function label(code: string) {
  return ({
    "membership:view": "Consultar membresías",
    "membership:update:role": "Cambiar rol",
    "membership:update:permissions": "Administrar permisos",
    "membership:update:status": "Cambiar estado",
  } as Record<string, string>)[code] || code;
}

function errorText(error: unknown) {
  const code = error instanceof AdminApiError ? error.code : "ADMIN_MEMBERSHIP_UNAVAILABLE";
  return ({
    ADMIN_MEMBERSHIP_VERSION_CONFLICT: "La membresía cambió. Recargue antes de guardar.",
    ADMIN_MEMBERSHIP_CONTINUITY_REQUIRED: "El tenant debe conservar continuidad administrativa.",
    ADMIN_MEMBERSHIP_SELF_PROTECTION: "No puede suspender o degradar su propia membresía.",
    ADMIN_MEMBERSHIP_FORBIDDEN: "No tiene permiso para esta operación.",
  } as Record<string, string>)[code] || "No fue posible completar la operación.";
}

export default function AdminTenantMembershipModule({ authorization, effectivePermissions, deniedPermissions, servicesAccess = NO_CRM_SERVICES_ACCESS, invitationEnabled = false, invitationMode = ADMIN_IDENTITY_INVITATION_MODES.DISABLED, onUnauthorized, api: suppliedApi }: Props) {
  const api = useMemo(() => suppliedApi || new AdminTenantApi(() => authorization || null), [authorization, suppliedApi]);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<readonly AdminMembership[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminMembership | null>(null);
  const [draft, setDraft] = useState<AdminMembership | null>(null);
  const [saving, setSaving] = useState(false);
  const [invitations, setInvitations] = useState<readonly AdminIdentityInvitation[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [activationPath, setActivationPath] = useState<string | null>(null);
  const [inviteSaving, setInviteSaving] = useState(false);
  const fence = useRef(0);
  const can = (permission: string) => effectivePermissions.includes(permission) && !deniedPermissions.includes(permission);
  const canInvite = invitationEnabled && ADMIN_PERMISSIONS.every(can);
  const corporateRecipient = invitationMode === ADMIN_IDENTITY_INVITATION_MODES.PRODUCTION_PILOT;

  useEffect(() => {
    const controller = new AbortController();
    const current = ++fence.current;
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      void api.list({ search, role, status, page, pageSize: 20 }, controller.signal).then((result) => {
        if (current !== fence.current) return;
        setRows(result.data);
        setTotal(result.total);
      }).catch((cause) => {
        if (controller.signal.aborted || current !== fence.current) return;
        if (cause instanceof AdminApiError && cause.status === 401) onUnauthorized();
        else setError(errorText(cause));
      }).finally(() => { if (current === fence.current) setLoading(false); });
    }, 150);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [api, onUnauthorized, page, role, search, status]);

  useEffect(() => {
    if (!canInvite) { setInvitations([]); return undefined; }
    const controller = new AbortController();
    void api.listInvitations(corporateRecipient, controller.signal).then(setInvitations).catch((cause) => {
      if (!controller.signal.aborted && cause instanceof AdminApiError && cause.status === 401) onUnauthorized();
    });
    return () => controller.abort();
  }, [api, canInvite, corporateRecipient, onUnauthorized]);

  const open = (membership: AdminMembership) => { setSelected(membership); setDraft(membership); setError(null); };
  const toggle = (kind: "grantedPermissions" | "deniedPermissions", permission: string) => {
    if (!draft) return;
    const own = new Set(draft[kind]);
    const other = new Set(draft[kind === "grantedPermissions" ? "deniedPermissions" : "grantedPermissions"]);
    if (own.has(permission)) own.delete(permission); else { own.add(permission); other.delete(permission); }
    setDraft({ ...draft, [kind]: [...own].sort(), [kind === "grantedPermissions" ? "deniedPermissions" : "grantedPermissions"]: [...other].sort() });
  };
  const save = async () => {
    if (!draft || !selected) return;
    setSaving(true); setError(null);
    try {
      const updated = await api.update(selected.membershipRef, {
        requestId: crypto.randomUUID(), expectedVersion: selected.authorizationVersion,
        role: draft.role, status: draft.status,
        grantedPermissions: draft.grantedPermissions, deniedPermissions: draft.deniedPermissions,
      });
      setRows((current) => current.map((row) => row.membershipRef === updated.membershipRef ? updated : row));
      setSelected(updated); setDraft(updated);
    } catch (cause) {
      if (cause instanceof AdminApiError && cause.status === 401) onUnauthorized();
      else setError(errorText(cause));
    } finally { setSaving(false); }
  };
  const issueInvitation = async () => {
    setInviteSaving(true); setError(null); setActivationPath(null);
    try {
      const issued = corporateRecipient
        ? await api.issueCorporateInvitation()
        : await api.issueInvitation(inviteEmail);
      setInvitations((current) => [issued.invitation, ...current.filter((row) => row.invitationRef !== issued.invitation.invitationRef)]);
      setActivationPath(issued.activationPath);
    } catch (cause) { setError(errorText(cause)); } finally { setInviteSaving(false); }
  };
  const revokeInvitation = async (invitationRef: string) => {
    try {
      const revoked = await api.revokeInvitation(invitationRef, corporateRecipient);
      setInvitations((current) => current.map((row) => row.invitationRef === revoked.invitationRef ? revoked : row));
    } catch (cause) { setError(errorText(cause)); }
  };

  return <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-7" data-testid="admin-tenant-memberships">
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div><p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-600">Administración tenant-first</p><h1 className="mt-1 text-2xl font-black text-slate-950">Acceso y membresías</h1><p className="mt-1 text-sm text-slate-600">Roles A/V, permisos explícitos y estado. No incluye RRHH.</p></div>
        <div className="flex items-center gap-2">{canInvite && <button type="button" onClick={() => { setInviteOpen(true); setInviteEmail(""); setActivationPath(null); }} className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white"><UserPlus className="mr-2 inline h-4 w-4" />Invitar administrador</button>}<div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800"><ShieldCheck className="mr-2 inline h-4 w-4" />Auditoría obligatoria</div></div>
      </div>
      <div className="mt-5 grid gap-3 rounded-xl border bg-white p-3 shadow-sm sm:grid-cols-[1fr_150px_170px]">
        <label className="relative"><span className="sr-only">Buscar por nombre o correo</span><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar nombre o correo" className="h-9 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm" /></label>
        <select aria-label="Filtrar rol" value={role} onChange={(event) => { setRole(event.target.value); setPage(1); }} className="h-9 rounded-lg border border-slate-200 px-3 text-sm"><option value="">Todos los roles</option><option value="A">Administrador</option><option value="V">Ventas</option></select>
        <select aria-label="Filtrar estado" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="h-9 rounded-lg border border-slate-200 px-3 text-sm"><option value="">Todos los estados</option><option value="ACTIVE">Activo</option><option value="SUSPENDED">Suspendido</option><option value="INACTIVE">Inactivo</option></select>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="grid grid-cols-[minmax(220px,1.6fr)_90px_120px_minmax(220px,1fr)_120px] gap-3 border-b bg-slate-50 px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500 max-md:hidden"><span>Persona</span><span>Rol</span><span>Estado</span><span>Permisos</span><span>Actualización</span></div>
        {loading && <p className="p-8 text-center text-sm text-slate-500" role="status">Cargando membresías…</p>}
        {!loading && error && <p className="p-8 text-center text-sm text-red-700" role="alert">{error}</p>}
        {!loading && !error && rows.map((row) => <button key={row.membershipRef} type="button" onClick={() => open(row)} className="grid w-full gap-2 border-b px-4 py-3 text-left hover:bg-indigo-50/60 md:grid-cols-[minmax(220px,1.6fr)_90px_120px_minmax(220px,1fr)_120px] md:items-center md:gap-3">
          <span className="min-w-0"><strong className="block truncate text-sm text-slate-950">{row.name}</strong><span className="block truncate text-xs text-slate-500">{row.email}</span></span>
          <span className="text-xs font-bold text-slate-700">{row.role === "A" ? "Administrador" : "Ventas"}</span>
          <span className={`w-fit rounded-full px-2 py-1 text-[10px] font-bold ${row.status === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>{row.status}</span>
          <span className="truncate text-xs text-slate-500">{row.grantedPermissions.length} grants · {row.deniedPermissions.length} denies</span>
          <span className="text-xs text-slate-500">{new Intl.DateTimeFormat("es-DO", { dateStyle: "short" }).format(new Date(row.updatedAt))}</span>
        </button>)}
        {!loading && !error && rows.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No hay membresías para estos filtros.</p>}
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-slate-600"><span>{total} membresía(s)</span><div className="flex items-center gap-2"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded border p-2 disabled:opacity-40" aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></button><span>Página {page}</span><button disabled={page * 20 >= total} onClick={() => setPage((value) => value + 1)} className="rounded border p-2 disabled:opacity-40" aria-label="Página siguiente"><ChevronRight className="h-4 w-4" /></button></div></div>
      {canInvite && <section className="mt-7" aria-labelledby="admin-invitations-title"><div className="flex items-end justify-between"><div><h2 id="admin-invitations-title" className="text-sm font-black text-slate-950">Invitaciones administrativas</h2><p className="text-xs text-slate-500">El enlace sólo se muestra al emitirlo.</p></div><span className="text-xs text-slate-500">{invitations.length} registrada(s)</span></div><div className="mt-2 divide-y overflow-hidden rounded-xl border bg-white">{invitations.map((invitation) => <div key={invitation.invitationRef} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs"><div className="min-w-0"><strong className="block truncate text-slate-900">{corporateRecipient ? "Destinatario corporativo configurado" : invitation.email}</strong><span className="text-slate-500">Administrador · {invitation.status}</span></div>{invitation.status === "PENDING" && <button type="button" onClick={() => void revokeInvitation(invitation.invitationRef)} className="rounded-lg border border-red-200 px-3 py-1.5 font-semibold text-red-700"><XCircle className="mr-1 inline h-3.5 w-3.5" />Revocar</button>}</div>)}{invitations.length === 0 && <p className="p-5 text-center text-xs text-slate-500">No hay invitaciones.</p>}</div></section>}
      {isCrmServicesUiEnabled() && servicesAccess.canCatalogView && <Suspense fallback={<p className="mt-7 p-6 text-center text-sm text-slate-500">Cargando catálogo de Servicios…</p>}><ServiceCatalogAdmin authorization={authorization} canManage={servicesAccess.canCatalogManage} onUnauthorized={onUnauthorized} /></Suspense>}
      {isLogisticsUiEnabled() && resolveLogisticsUiAccess(effectivePermissions, deniedPermissions).canRulesView && <Suspense fallback={<p className="mt-7 p-6 text-center text-sm text-slate-500">Cargando reglas logísticas…</p>}><LogisticsRulesAdmin authorization={authorization} access={resolveLogisticsUiAccess(effectivePermissions, deniedPermissions)} onUnauthorized={onUnauthorized} /></Suspense>}
    </div>
    <Dialog open={Boolean(draft)} onOpenChange={(openValue) => { if (!openValue) { setSelected(null); setDraft(null); setError(null); } }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><UserCog className="h-5 w-5" />Editar membresía</DialogTitle><DialogDescription>Actualice exclusivamente el acceso de esta persona dentro del tenant activo.</DialogDescription></DialogHeader>
        {draft && <div className="space-y-5">
          <div className="rounded-lg bg-slate-50 p-3"><strong className="block text-sm">{draft.name}</strong><span className="text-xs text-slate-500">{draft.email}</span></div>
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold">Rol<select disabled={!can("membership:update:role")} value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as "A" | "V" })} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm"><option value="A">Administrador</option><option value="V">Ventas</option></select></label><label className="text-xs font-semibold">Estado<select disabled={!can("membership:update:status")} value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as AdminMembership["status"] })} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm"><option value="ACTIVE">Activo</option><option value="SUSPENDED">Suspendido</option><option value="INACTIVE">Inactivo</option></select></label></div>
          <div><h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Permisos administrativos</h3><div className="mt-2 divide-y rounded-lg border">{ADMIN_PERMISSIONS.map((permission) => <div key={permission} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 p-3 text-xs"><span>{label(permission)}</span><label className="flex items-center gap-1"><input type="checkbox" disabled={!can("membership:update:permissions")} checked={draft.grantedPermissions.includes(permission)} onChange={() => toggle("grantedPermissions", permission)} />Grant</label><label className="flex items-center gap-1"><input type="checkbox" disabled={!can("membership:update:permissions")} checked={draft.deniedPermissions.includes(permission)} onChange={() => toggle("deniedPermissions", permission)} />Deny</label></div>)}</div></div>
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-800">{error}</p>}
          <button type="button" disabled={saving || !can("membership:update:role") && !can("membership:update:permissions") && !can("membership:update:status")} onClick={() => void save()} className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? "Guardando…" : "Guardar cambios"}</button>
        </div>}
      </DialogContent>
    </Dialog>
    <Dialog open={inviteOpen} onOpenChange={(value) => { setInviteOpen(value); if (!value) { setActivationPath(null); setInviteEmail(""); } }}>
      <DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Invitar administrador</DialogTitle><DialogDescription>La cuenta recibirá rol A y los cuatro permisos administrativos explícitos. El enlace se mostrará una sola vez y vence en 24 horas.</DialogDescription></DialogHeader><div className="space-y-4">{corporateRecipient ? <p className="rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-sm font-semibold text-indigo-950">Destinatario corporativo configurado</p> : <label className="block text-sm font-semibold">Email corporativo<input type="email" autoComplete="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} disabled={Boolean(activationPath)} className="mt-1 h-11 w-full rounded-lg border px-3" /></label>}{activationPath ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-4"><p className="text-xs font-bold text-amber-950">Copie este enlace ahora. No podrá recuperarse después.</p><code className="mt-2 block break-all rounded bg-white p-2 text-xs">{`${window.location.origin}${activationPath}`}</code><button type="button" onClick={() => void navigator.clipboard.writeText(`${window.location.origin}${activationPath}`)} className="mt-3 rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white">Copiar enlace</button></div> : <button type="button" disabled={inviteSaving || !corporateRecipient && !inviteEmail} onClick={() => void issueInvitation()} className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{inviteSaving ? "Generando…" : corporateRecipient ? "Generar invitación corporativa" : "Generar invitación"}</button>}</div></DialogContent>
    </Dialog>
  </main>;
}
