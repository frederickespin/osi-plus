import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Save, Search, UserCog, UserPlus, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AdministrationHelp, AdministrationIconAction } from "@/administration/AdministrationHelp";
import { AdminApiError, AdminTenantApi, type AdminIdentityInvitation, type AdminMembership, type AdminMembershipCatalog } from "./adminApi";
import { ADMIN_MEMBERSHIP_ROLE_OPTIONS } from "../../shared/adminMembershipCatalog.js";
import { getMembershipRef } from "@/lib/sessionStore";
import { buildMembershipChanges, setMembershipPermissionOverride, type MembershipPermissionOverride } from "./adminMembershipDraft";
import AdminMembershipPermissions from "./AdminMembershipPermissions";
import { ADMIN_IDENTITY_INVITATION_MODES, type AdminTenantMembershipMode } from "./adminMode";
import { NO_CRM_SERVICES_ACCESS, type CrmServicesUiAccess } from "@/crm-services/access";
import { isCrmServicesUiEnabled } from "@/crm-services/mode";
import { resolveLogisticsUiAccess } from "@/logistics-engine/access";
import { isLogisticsUiEnabled } from "@/logistics-engine/mode";
import type { CostingUiAccess } from "@/costing/access";
import type { CommunicationsAccess } from "@/communications/access";
import type { PersonnelPoliciesAccess } from "@/personnel-policies/access";

const ServiceConfigurationAdmin = lazy(() => import("@/crm-services/ServiceConfigurationAdmin"));
const LogisticsRulesAdmin = lazy(() => import("@/logistics-engine/LogisticsRulesAdmin"));
const CostingRulesAdmin = lazy(() => import("@/costing/CostingRulesAdmin"));
const CommunicationTemplatesAdmin = lazy(() => import("@/communications/CommunicationTemplatesAdmin"));
const PersonnelPoliciesAdmin = lazy(() => import("@/personnel-policies/PersonnelPoliciesAdmin"));

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
  includeConfiguration?: boolean;
  servicesAccess?: CrmServicesUiAccess;
  invitationEnabled?: boolean;
  invitationMode?: AdminTenantMembershipMode;
  costingAccess?: CostingUiAccess;
  costingEnabled?: boolean;
  communicationsEnabled?: boolean;
  communicationsAccess?: CommunicationsAccess;
  personnelPoliciesEnabled?: boolean;
  personnelPoliciesAccess?: PersonnelPoliciesAccess;
  onUnauthorized(): void;
  api?: AdminTenantApi;
}>;

function errorText(error: unknown) {
  const code = error instanceof AdminApiError ? error.code : "ADMIN_MEMBERSHIP_UNAVAILABLE";
  return ({
    ADMIN_MEMBERSHIP_VERSION_CONFLICT: "La membresía cambió. Recargue antes de guardar.",
    ADMIN_MEMBERSHIP_CONTINUITY_REQUIRED: "La empresa debe conservar sus administradores activos.",
    ADMIN_MEMBERSHIP_SELF_PROTECTION: "No puede suspender o degradar su propia membresía.",
    ADMIN_MEMBERSHIP_FORBIDDEN: "No tiene permiso para esta operación.",
    ADMIN_MEMBERSHIP_PERMISSION_UNKNOWN: "El permiso no pertenece al catálogo disponible. Recargue el acceso.",
    ADMIN_MEMBERSHIP_NOT_FOUND: "Este acceso ya no está disponible en la empresa activa.",
  } as Record<string, string>)[code] || "No fue posible completar la operación.";
}

const STATUS_LABELS: Record<AdminMembership["status"], string> = { ACTIVE: "Activo", SUSPENDED: "Suspendido", INACTIVE: "Inactivo" };

export default function AdminTenantMembershipModule(props: Props) {
  const membershipRef = getMembershipRef();
  const scope = JSON.stringify([membershipRef, [...props.effectivePermissions].sort(), [...props.deniedPermissions].sort()]);
  return <AdminMembershipWorkspace key={scope} {...props} membershipRef={membershipRef} />;
}

function AdminMembershipWorkspace({ authorization, membershipRef, effectivePermissions, deniedPermissions, includeConfiguration = true, servicesAccess = NO_CRM_SERVICES_ACCESS, invitationEnabled = false, invitationMode = ADMIN_IDENTITY_INVITATION_MODES.DISABLED, costingAccess, costingEnabled = false, communicationsEnabled = false, communicationsAccess, personnelPoliciesEnabled = false, personnelPoliciesAccess, onUnauthorized, api: suppliedApi }: Props & { membershipRef: string | null }) {
  const api = useMemo(() => suppliedApi || new AdminTenantApi(() => authorization || null, globalThis.fetch.bind(globalThis), () => membershipRef), [authorization, membershipRef, suppliedApi]);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<readonly AdminMembership[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<AdminMembershipCatalog | null>(null);
  const [loadedApi, setLoadedApi] = useState<AdminTenantApi | null>(null);
  const [loadedAuthorization, setLoadedAuthorization] = useState<string | null | undefined>(null);
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<AdminMembership | null>(null);
  const [draft, setDraft] = useState<AdminMembership | null>(null);
  const [saving, setSaving] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [reloadErrors, setReloadErrors] = useState<Readonly<Record<string, string>>>({});
  const [saved, setSaved] = useState(false);
  const [invitations, setInvitations] = useState<readonly AdminIdentityInvitation[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [activationPath, setActivationPath] = useState<string | null>(null);
  const [inviteSaving, setInviteSaving] = useState(false);
  const [invitationError, setInvitationError] = useState<string | null>(null);
  const fence = useRef(0);
  const editorFence = useRef(0);
  const editorRead = useRef<AbortController | null>(null);
  const pending = useRef(new Set<AbortController>());
  const can = (permission: string) => effectivePermissions.includes(permission) && !deniedPermissions.includes(permission);
  const canView = can("membership:view");
  const canInvite = invitationEnabled && ADMIN_PERMISSIONS.every(can);
  const corporateRecipient = invitationMode === ADMIN_IDENTITY_INVITATION_MODES.PRODUCTION_PILOT;
  const mustReload = Boolean(selected && reloadErrors[selected.membershipRef]);

  useEffect(() => {
    const requests = pending.current;
    setRows([]); setCatalog(null); setSelected(null); setDraft(null);
    setLoadedApi(null); setLoadedAuthorization(null); setSaving(false); setReloading(false); setEditError(null);
    setReloadErrors({}); setSaved(false); setInvitations([]); setInviteOpen(false);
    setActivationPath(null); setInviteEmail(""); setInvitationError(null); setInviteSaving(false);
    editorFence.current += 1;
    editorRead.current = null;
    return () => { requests.forEach((controller) => controller.abort()); requests.clear(); };
  }, [api, authorization]);

  useEffect(() => {
    if (!canView) {
      setRows([]); setTotal(0); setLoading(false);
      setListError("No tiene permiso para consultar los usuarios.");
      setLoadedApi(api); setLoadedAuthorization(authorization);
      return undefined;
    }
    const controller = new AbortController();
    const requests = pending.current;
    requests.add(controller);
    const current = ++fence.current;
    setLoading(true);
    setListError(null);
    const timer = window.setTimeout(() => {
      void api.list({ search, role, status, page, pageSize: 20 }, controller.signal).then((result) => {
        if (controller.signal.aborted || current !== fence.current) return;
        setRows(result.data);
        setTotal(result.total);
        setCatalog(result.catalog);
        setLoadedApi(api);
        setLoadedAuthorization(authorization);
      }).catch((cause) => {
        if (controller.signal.aborted || current !== fence.current) return;
        if (cause instanceof AdminApiError && cause.status === 401) onUnauthorized();
        else { setListError(errorText(cause)); setLoadedApi(api); setLoadedAuthorization(authorization); }
      }).finally(() => { requests.delete(controller); if (!controller.signal.aborted && current === fence.current) setLoading(false); });
    }, 150);
    return () => { window.clearTimeout(timer); controller.abort(); requests.delete(controller); };
  }, [api, authorization, canView, onUnauthorized, page, refresh, role, search, status]);

  useEffect(() => {
    if (!canInvite) { setInvitations([]); return undefined; }
    const controller = new AbortController();
    const requests = pending.current;
    requests.add(controller);
    void api.listInvitations(corporateRecipient, controller.signal).then((result) => { if (!controller.signal.aborted) setInvitations(result); }).catch((cause) => {
      if (!controller.signal.aborted && cause instanceof AdminApiError && cause.status === 401) onUnauthorized();
      else if (!controller.signal.aborted) setInvitationError(errorText(cause));
    }).finally(() => requests.delete(controller));
    return () => { controller.abort(); requests.delete(controller); };
  }, [api, authorization, canInvite, corporateRecipient, onUnauthorized]);

  const open = (membership: AdminMembership) => {
    editorFence.current += 1;
    setSelected(membership); setDraft(membership); setEditError(reloadErrors[membership.membershipRef] || null); setSaved(false);
  };
  const closeEditor = () => {
    editorFence.current += 1;
    if (editorRead.current) { editorRead.current.abort(); pending.current.delete(editorRead.current); editorRead.current = null; }
    setReloading(false); setSelected(null); setDraft(null); setEditError(null); setSaved(false);
  };
  const confirmReload = (ref: string) => setReloadErrors((current) => { const next = { ...current }; delete next[ref]; return next; });
  const permissionChange = (permission: string, value: MembershipPermissionOverride) => {
    if (!draft || !catalog || saving || reloading || mustReload || !can("membership:update:permissions") || !catalog.permissions.some((item) => item.code === permission)) return;
    setDraft(setMembershipPermissionOverride(draft, permission, value)); setSaved(false);
  };
  const changes = selected && draft ? buildMembershipChanges(selected, draft, can) : {};
  const hasChanges = Object.keys(changes).length > 0;
  const save = async () => {
    if (!draft || !selected || saving || reloading || mustReload || !hasChanges) return;
    const controller = new AbortController();
    pending.current.add(controller);
    const editor = editorFence.current;
    setSaving(true); setEditError(null); setSaved(false);
    try {
      const updated = await api.update(selected.membershipRef, {
        requestId: crypto.randomUUID(), expectedVersion: selected.authorizationVersion,
        ...changes,
      }, controller.signal);
      if (controller.signal.aborted) return;
      confirmReload(updated.membershipRef);
      setRows((current) => current.map((row) => row.membershipRef === updated.membershipRef ? updated : row));
      if (editor === editorFence.current) { setSelected(updated); setDraft(updated); setSaved(true); }
      setRefresh((value) => value + 1);
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof AdminApiError && cause.status === 401) onUnauthorized();
      else {
        const message = errorText(cause);
        setReloadErrors((current) => ({ ...current, [selected.membershipRef]: message }));
        if (editor === editorFence.current) setEditError(message);
        else { setLoadedApi(null); setRefresh((value) => value + 1); }
      }
    } finally { pending.current.delete(controller); if (!controller.signal.aborted) setSaving(false); }
  };
  const reloadSelected = async () => {
    if (!selected || reloading || saving) return;
    const controller = new AbortController();
    pending.current.add(controller);
    editorRead.current = controller;
    const editor = editorFence.current;
    setReloading(true); setEditError(null); setSaved(false);
    try {
      const updated = await api.get(selected.membershipRef, controller.signal);
      if (controller.signal.aborted || editor !== editorFence.current) return;
      setSelected(updated); setDraft(updated); confirmReload(updated.membershipRef);
      setRows((current) => current.map((row) => row.membershipRef === updated.membershipRef ? updated : row));
      setRefresh((value) => value + 1);
    } catch (cause) {
      if (controller.signal.aborted || editor !== editorFence.current) return;
      if (cause instanceof AdminApiError && cause.status === 401) onUnauthorized();
      else { const message = errorText(cause); setEditError(message); setReloadErrors((current) => ({ ...current, [selected.membershipRef]: message })); }
    } finally {
      pending.current.delete(controller);
      if (editorRead.current === controller) editorRead.current = null;
      if (!controller.signal.aborted) setReloading(false);
    }
  };
  const issueInvitation = async () => {
    if (!canInvite || inviteSaving) return;
    const controller = new AbortController();
    pending.current.add(controller);
    setInviteSaving(true); setInvitationError(null); setActivationPath(null);
    try {
      const issued = corporateRecipient
        ? await api.issueCorporateInvitation(controller.signal)
        : await api.issueInvitation(inviteEmail, controller.signal);
      if (controller.signal.aborted) return;
      setInvitations((current) => [issued.invitation, ...current.filter((row) => row.invitationRef !== issued.invitation.invitationRef)]);
      setActivationPath(issued.activationPath);
    } catch (cause) { if (!controller.signal.aborted) { if (cause instanceof AdminApiError && cause.status === 401) onUnauthorized(); else setInvitationError(errorText(cause)); } }
    finally { pending.current.delete(controller); if (!controller.signal.aborted) setInviteSaving(false); }
  };
  const revokeInvitation = async (invitationRef: string) => {
    if (!canInvite) return;
    const controller = new AbortController();
    pending.current.add(controller);
    setInvitationError(null);
    try {
      const revoked = await api.revokeInvitation(invitationRef, corporateRecipient, controller.signal);
      if (controller.signal.aborted) return;
      setInvitations((current) => current.map((row) => row.invitationRef === revoked.invitationRef ? revoked : row));
    } catch (cause) { if (!controller.signal.aborted) { if (cause instanceof AdminApiError && cause.status === 401) onUnauthorized(); else setInvitationError(errorText(cause)); } }
    finally { pending.current.delete(controller); }
  };
  const logisticsRulesAccess = resolveLogisticsUiAccess(effectivePermissions, deniedPermissions);
  const logisticsAdminEnabled = isLogisticsUiEnabled() && logisticsRulesAccess.canRulesView;
  const roleOptions = catalog?.roles || ADMIN_MEMBERSHIP_ROLE_OPTIONS;
  const roleLabel = (code: AdminMembership["role"]) => roleOptions.find((item) => item.code === code)?.label || code;
  const listReady = loadedApi === api && loadedAuthorization === authorization;

  return <main className={includeConfiguration ? "min-h-screen bg-slate-50 px-4 py-4 sm:px-6" : "py-3"} data-testid="admin-tenant-memberships">
    <div className="mx-auto max-w-7xl">
      <div id="admin-memberships" className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-1"><h2 className="text-base font-semibold text-slate-950">Usuarios y roles</h2><AdministrationHelp title="Usuarios y roles"><p>Consulta los accesos por nombre, correo, rol o estado. Selecciona una persona para revisar sus permisos.</p><p>El rol aporta permisos heredados; las excepciones pueden añadir o denegar acceso. Los cambios se aplican a la empresa activa y quedan registrados.</p><p>Las invitaciones administrativas conservan su alcance y disponibilidad propios.</p></AdministrationHelp></div>
        <div className="flex items-center gap-2"><AdministrationIconAction label="Recargar usuarios" mobileLabel="Recargar" disabled={loading || saving} onClick={() => setRefresh((value) => value + 1)}><RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></AdministrationIconAction>{canInvite && <button type="button" onClick={() => { setInviteOpen(true); setInviteEmail(""); setActivationPath(null); setInvitationError(null); }} className="inline-flex min-h-9 items-center gap-1.5 rounded bg-[#003366] px-3 py-2 text-xs font-semibold text-white"><UserPlus aria-hidden="true" className="h-4 w-4" />Invitar administrador</button>}</div>
      </div>
      {!draft && Object.keys(reloadErrors).length > 0 && <p role="alert" className="mt-3 rounded bg-amber-50 p-2 text-xs text-amber-900">Hay cambios de acceso que requieren confirmación. Abra la persona afectada y seleccione Recargar acceso antes de volver a editarla.</p>}
      {includeConfiguration && <nav aria-label="Áreas de Administración" className="mt-3 flex flex-wrap gap-2 text-xs font-bold"><a href="#admin-memberships" className="rounded border bg-white px-3 py-1.5 text-slate-700">Usuarios y roles</a>{personnelPoliciesEnabled && personnelPoliciesAccess?.canView && <a href="#admin-personnel-policies" className="rounded border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-indigo-900">Personal y Políticas</a>}{communicationsEnabled && communicationsAccess?.canTemplatesView && <a href="#admin-communications" className="rounded border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-indigo-900">Plantillas y Comunicaciones</a>}{logisticsAdminEnabled && <a href="#admin-logistics-engine" className="rounded border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-indigo-900">Motor Logístico</a>}{costingEnabled && costingAccess?.canRulesView && <a href="#admin-costing" className="rounded border bg-white px-3 py-1.5 text-slate-700">Costos</a>}</nav>}
      <div className="my-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_180px]">
        <label className="relative"><span className="sr-only">Buscar por nombre o correo</span><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar nombre o correo" className="h-9 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm" /></label>
        <select aria-label="Filtrar rol" value={role} onChange={(event) => { setRole(event.target.value); setPage(1); }} className="h-9 min-w-0 rounded-lg border border-slate-200 px-3 text-sm"><option value="">Todos los roles</option>{roleOptions.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select>
        <select aria-label="Filtrar estado" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="h-9 rounded-lg border border-slate-200 px-3 text-sm"><option value="">Todos los estados</option><option value="ACTIVE">Activo</option><option value="SUSPENDED">Suspendido</option><option value="INACTIVE">Inactivo</option></select>
      </div>
      <div className="overflow-hidden border border-slate-200 bg-white">
        <div className="grid grid-cols-[minmax(150px,1.8fr)_minmax(110px,1fr)_90px_minmax(110px,1fr)_80px] gap-3 border-b bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500 max-md:hidden"><span>Persona</span><span>Rol</span><span>Estado</span><span>Excepciones</span><span>Fecha</span></div>
        {(loading || !listReady) && <p className="p-5 text-center text-sm text-slate-500" role="status">Cargando usuarios…</p>}
        {!loading && listReady && listError && <p className="p-5 text-center text-sm text-red-700" role="alert">{listError}</p>}
        {!loading && listReady && !listError && rows.map((row) => <button key={row.membershipRef} type="button" disabled={saving} onClick={() => open(row)} className="grid w-full grid-cols-[minmax(0,1fr)_132px] gap-x-3 gap-y-1 border-b px-3 py-2 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-indigo-600 disabled:opacity-50 md:grid-cols-[minmax(150px,1.8fr)_minmax(110px,1fr)_90px_minmax(110px,1fr)_80px] md:items-center">
          <span className="row-span-2 min-w-0 md:row-span-1"><strong className="block truncate text-sm text-slate-950">{row.name}</strong><span className="block truncate text-xs text-slate-500">{row.email}</span></span>
          <span className="text-xs font-medium text-slate-700">{roleLabel(row.role)}</span>
          <span className={`col-start-2 w-fit rounded-full px-2 py-0.5 text-[10px] font-medium md:col-start-auto ${row.status === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{STATUS_LABELS[row.status]}</span>
          <span className="hidden text-[11px] text-slate-500 md:block">{row.grantedPermissions.length} adicionales · {row.deniedPermissions.length} denegados</span>
          <span className="hidden text-[11px] text-slate-500 md:block">{new Intl.DateTimeFormat("es-DO", { dateStyle: "short" }).format(new Date(row.updatedAt))}</span>
        </button>)}
        {!loading && listReady && !listError && rows.length === 0 && <p className="p-5 text-center text-sm text-slate-500">No hay usuarios para estos filtros.</p>}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-slate-600"><span>{listReady ? total : 0} usuario(s)</span><div className="flex items-center gap-2"><AdministrationIconAction label="Página anterior" disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft aria-hidden="true" className="h-4 w-4" /></AdministrationIconAction><span>Página {page}</span><AdministrationIconAction label="Página siguiente" disabled={loading || page * 20 >= total} onClick={() => setPage((value) => value + 1)}><ChevronRight aria-hidden="true" className="h-4 w-4" /></AdministrationIconAction></div></div>
      {canInvite && invitationError && !inviteOpen && <p role="alert" className="mt-3 text-xs text-red-700">{invitationError}</p>}
      {canInvite && <section className="mt-5" aria-labelledby="admin-invitations-title"><div className="flex items-end justify-between"><div><h2 id="admin-invitations-title" className="text-sm font-black text-slate-950">Invitaciones administrativas</h2><p className="text-xs text-slate-500">El enlace sólo se muestra al emitirlo.</p></div><span className="text-xs text-slate-500">{invitations.length} registrada(s)</span></div><div className="mt-2 divide-y overflow-hidden border border-slate-200 bg-white">{invitations.map((invitation) => <div key={invitation.invitationRef} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs"><div className="min-w-0"><strong className="block truncate text-slate-900">{corporateRecipient ? "Destinatario corporativo configurado" : invitation.email}</strong><span className="text-slate-500">Administrador · {invitation.status}</span></div>{invitation.status === "PENDING" && <button type="button" onClick={() => void revokeInvitation(invitation.invitationRef)} className="rounded-lg border border-red-200 px-3 py-1.5 font-semibold text-red-700"><XCircle className="mr-1 inline h-3.5 w-3.5" />Revocar</button>}</div>)}{invitations.length === 0 && <p className="p-5 text-center text-xs text-slate-500">No hay invitaciones.</p>}</div></section>}
      {includeConfiguration && <>
      {isCrmServicesUiEnabled() && (servicesAccess.canCatalogView || servicesAccess.canPackagesView || servicesAccess.canMaterialsView) && <Suspense fallback={<p className="mt-7 p-6 text-center text-sm text-slate-500">Cargando configuración de Servicios…</p>}><ServiceConfigurationAdmin authorization={authorization} access={servicesAccess} onUnauthorized={onUnauthorized} /></Suspense>}
      {logisticsAdminEnabled && <Suspense fallback={<p className="mt-7 p-6 text-center text-sm text-slate-500">Cargando reglas logísticas…</p>}><LogisticsRulesAdmin authorization={authorization} access={logisticsRulesAccess} onUnauthorized={onUnauthorized} /></Suspense>}
      {costingEnabled && costingAccess?.canRulesView && <section id="admin-costing"><Suspense fallback={<p className="mt-7 p-6 text-center text-sm text-slate-500">Cargando reglas de costos…</p>}><CostingRulesAdmin authorization={authorization} access={costingAccess} onUnauthorized={onUnauthorized} /></Suspense></section>}
      {communicationsEnabled && communicationsAccess?.canTemplatesView && <Suspense fallback={<p className="mt-7 p-6 text-center text-sm text-slate-500">Cargando Plantillas y Comunicaciones…</p>}><CommunicationTemplatesAdmin authorization={authorization} access={communicationsAccess} onUnauthorized={onUnauthorized} /></Suspense>}
      {personnelPoliciesEnabled && personnelPoliciesAccess?.canView && <Suspense fallback={<p className="mt-7 p-6 text-center text-sm text-slate-500">Cargando Personal y Políticas…</p>}><PersonnelPoliciesAdmin authorization={authorization} access={personnelPoliciesAccess} onUnauthorized={onUnauthorized} /></Suspense>}
      </>}
    </div>
    <Dialog open={Boolean(draft && listReady)} onOpenChange={(openValue) => { if (!openValue) closeEditor(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto p-4 sm:max-w-3xl sm:p-5">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><UserCog aria-hidden="true" className="h-5 w-5" />Acceso de usuario</DialogTitle><DialogDescription>Actualice exclusivamente el acceso de esta persona dentro de la empresa activa.</DialogDescription></DialogHeader>
        {draft && catalog && <div className="space-y-3">
          <div className="border-b border-slate-200 pb-2"><strong className="block text-sm">{draft.name}</strong><span className="break-all text-xs text-slate-500">{draft.email}</span></div>
          <div className="grid grid-cols-2 gap-3"><label className="min-w-0 text-xs font-semibold">Rol<select aria-label="Rol" disabled={!can("membership:update:role") || saving || reloading || mustReload} value={draft.role} onChange={(event) => { setDraft({ ...draft, role: event.target.value as AdminMembership["role"] }); setSaved(false); }} className="mt-1 h-9 w-full rounded border border-slate-300 bg-white px-2 text-xs disabled:bg-slate-50">{roleOptions.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label><label className="text-xs font-semibold">Estado<select aria-label="Estado" disabled={!can("membership:update:status") || saving || reloading || mustReload} value={draft.status} onChange={(event) => { setDraft({ ...draft, status: event.target.value as AdminMembership["status"] }); setSaved(false); }} className="mt-1 h-9 w-full rounded border border-slate-300 bg-white px-2 text-xs disabled:bg-slate-50"><option value="ACTIVE">Activo</option><option value="SUSPENDED">Suspendido</option><option value="INACTIVE">Inactivo</option></select></label></div>
          <AdminMembershipPermissions key={draft.membershipRef} draft={draft} catalog={catalog} canEdit={can("membership:update:permissions")} busy={saving || reloading || mustReload} onChange={permissionChange} />
          {editError && <p role="alert" className="rounded bg-red-50 p-2 text-xs text-red-800">{editError}</p>}
          {mustReload && <p className="text-xs text-slate-600">Recargue el acceso para confirmar su estado antes de realizar otro cambio.</p>}
          {saved && <p role="status" className="text-xs font-medium text-emerald-700">Cambios guardados.</p>}
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-3">{mustReload && <button type="button" disabled={reloading || saving} onClick={() => void reloadSelected()} className="inline-flex min-h-9 items-center gap-1.5 rounded border border-slate-300 px-3 text-xs font-medium text-slate-700 disabled:opacity-50"><RefreshCw aria-hidden="true" className={`h-4 w-4 ${reloading ? "animate-spin" : ""}`} />{reloading ? "Recargando…" : "Recargar acceso"}</button>}<button type="button" onClick={closeEditor} className="min-h-9 rounded border border-slate-300 px-3 text-xs font-medium text-slate-600">Cerrar</button><button type="button" disabled={saving || reloading || mustReload || !hasChanges} onClick={() => void save()} className="inline-flex min-h-9 w-fit items-center gap-1.5 rounded bg-[#003366] px-3 text-xs font-semibold text-white disabled:opacity-50"><Save aria-hidden="true" className="h-4 w-4" />{saving ? "Guardando…" : "Guardar cambios"}</button></div>
        </div>}
      </DialogContent>
    </Dialog>
    <Dialog open={inviteOpen} onOpenChange={(value) => { setInviteOpen(value); if (!value) { setActivationPath(null); setInviteEmail(""); } }}>
      <DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Invitar administrador</DialogTitle><DialogDescription>La cuenta recibirá rol A y los cuatro permisos administrativos explícitos. El enlace se mostrará una sola vez y vence en 24 horas.</DialogDescription></DialogHeader><div className="space-y-4">{invitationError && <p role="alert" className="rounded bg-red-50 p-2 text-xs text-red-800">{invitationError}</p>}{corporateRecipient ? <p className="rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-sm font-semibold text-indigo-950">Destinatario corporativo configurado</p> : <label className="block text-sm font-semibold">Email corporativo<input type="email" autoComplete="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} disabled={Boolean(activationPath)} className="mt-1 h-11 w-full rounded-lg border px-3" /></label>}{activationPath ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-4"><p className="text-xs font-bold text-amber-950">Copie este enlace ahora. No podrá recuperarse después.</p><code className="mt-2 block break-all rounded bg-white p-2 text-xs">{`${window.location.origin}${activationPath}`}</code><button type="button" onClick={() => void navigator.clipboard.writeText(`${window.location.origin}${activationPath}`)} className="mt-3 rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white">Copiar enlace</button></div> : <button type="button" disabled={inviteSaving || !corporateRecipient && !inviteEmail} onClick={() => void issueInvitation()} className="ml-auto flex w-fit rounded bg-[#003366] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{inviteSaving ? "Generando…" : corporateRecipient ? "Generar invitación corporativa" : "Generar invitación"}</button>}</div></DialogContent>
    </Dialog>
  </main>;
}
