import { useMemo, useState } from "react";
import { Check, Minus, Search } from "lucide-react";
import { AdministrationHelp } from "@/administration/AdministrationHelp";
import type { AdminMembership, AdminMembershipCatalog } from "./adminApi";
import { permissionPresentationRows, type MembershipPermissionOverride } from "./adminMembershipDraft";

type Props = Readonly<{
  draft: AdminMembership;
  catalog: AdminMembershipCatalog;
  canEdit: boolean;
  busy: boolean;
  onChange(code: string, value: MembershipPermissionOverride): void;
}>;

export default function AdminMembershipPermissions({ draft, catalog, canEdit, busy, onChange }: Props) {
  const [group, setGroup] = useState("");
  const [search, setSearch] = useState("");
  const rows = useMemo(() => permissionPresentationRows(draft, catalog), [catalog, draft]);
  const groups = [...new Set(rows.map((row) => row.group))].sort((a, b) => a.localeCompare(b, "es"));
  const needle = search.toLocaleLowerCase("es").trim();
  const visible = rows.filter((row) => (!group || row.group === group)
    && (!needle || `${row.label} ${row.code} ${row.group}`.toLocaleLowerCase("es").includes(needle)));

  return <section aria-labelledby="membership-permissions-title">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-1"><h3 id="membership-permissions-title" className="text-sm font-semibold text-slate-900">Permisos por área</h3><AdministrationHelp title="Permisos por área"><p>Heredado identifica el acceso del rol. Permitir añade una excepción y Denegar impide el acceso, incluso si el rol lo concede.</p><p>Sin excepción conserva el acceso del rol. Efectivo muestra el resultado de rol y excepciones; cada módulo mantiene sus requisitos de disponibilidad.</p><p>Los permisos existentes fuera del catálogo se conservan y aparecen como sólo lectura.</p></AdministrationHelp></div>
      <span className="text-xs text-slate-500">{rows.filter((row) => row.effective).length} efectivos · {draft.deniedPermissions.length} denegados</span>
    </div>
    <div className="mb-2 grid gap-2 sm:grid-cols-[190px_minmax(0,1fr)]">
      <select aria-label="Área de permisos" value={group} onChange={(event) => setGroup(event.target.value)} className="h-9 min-w-0 rounded border border-slate-300 bg-white px-2 text-xs"><option value="">Todas las áreas</option>{groups.map((name) => <option key={name} value={name}>{name}</option>)}</select>
      <label className="relative min-w-0"><span className="sr-only">Buscar permiso</span><Search aria-hidden="true" className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar permiso" className="h-9 w-full rounded border border-slate-300 pl-8 pr-2 text-xs" /></label>
    </div>
    <div className="max-h-[38vh] overflow-y-auto border-y border-slate-200">
      <div className="sticky top-0 z-10 hidden grid-cols-[minmax(0,1fr)_140px_88px] gap-3 border-b bg-slate-50 px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:grid"><span>Permiso y origen</span><span>Excepción</span><span>Resultado</span></div>
      {visible.map((row) => <div key={row.code} data-testid={`membership-permission-${row.code}`} className="grid grid-cols-[minmax(0,1fr)_132px] gap-x-3 gap-y-1 border-b border-slate-100 px-2 py-2 text-xs last:border-b-0 sm:grid-cols-[minmax(0,1fr)_140px_88px] sm:items-center">
        <div className="min-w-0"><span className={`block font-medium text-slate-800 ${row.known ? "" : "break-all"}`}>{row.label}</span><span className="mt-0.5 block text-[11px] text-slate-500">{row.group} · {[row.inherited && "Heredado", row.granted && "Adicional", row.denied && "Denegado"].filter(Boolean).join(" · ") || "Sin asignar"}</span></div>
        <div className="row-span-2 self-center sm:row-span-1"><label><span className="sr-only">Excepción de {row.label}</span><select aria-label={`Excepción de ${row.label}`} value={row.override} disabled={!canEdit || busy || !row.known} onChange={(event) => onChange(row.code, event.target.value as MembershipPermissionOverride)} className="h-9 w-full rounded border border-slate-300 bg-white px-2 text-xs disabled:bg-slate-50 disabled:text-slate-500"><option value="INHERIT">Sin excepción</option><option value="ALLOW">Permitir</option><option value="DENY">Denegar</option></select></label>{!row.known && <span className="mt-1 block text-[10px] text-slate-500">Sólo lectura</span>}</div>
        <span className={`col-start-1 inline-flex items-center gap-1 text-[11px] sm:col-start-auto ${row.effective ? "text-emerald-700" : "text-slate-500"}`}>{row.effective ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : <Minus aria-hidden="true" className="h-3.5 w-3.5" />}{row.effective ? "Efectivo" : "Sin acceso"}</span>
      </div>)}
      {visible.length === 0 && <p className="py-5 text-center text-xs text-slate-500">No hay permisos para estos filtros.</p>}
    </div>
    {!canEdit && <p className="mt-2 text-xs text-slate-500">Consulta de permisos. Su acceso no permite modificarlos.</p>}
  </section>;
}
