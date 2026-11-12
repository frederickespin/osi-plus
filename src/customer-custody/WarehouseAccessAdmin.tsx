import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, ShieldCheck, ShieldOff } from "lucide-react";
import { AdminTenantApi, type AdminMembership } from "@/admin-tenant/adminApi";
import { materialsApi, type WarehouseRow } from "@/materials-inventory/api";
import { COMPACT_FORM_FIELD } from "@/components/ui/compact-form";
import { CustomerCustodyApi, customerCustodyErrorText, type WarehouseAccessGrant } from "./api";
import CustodyCatalogAdmin from "./CustodyCatalogAdmin";

const OPERATIONS = Object.freeze([
  { code: "VIEW", label: "Consultar" },
  { code: "RECEIVE", label: "Recibir" },
  { code: "PUT_AWAY", label: "Ubicar" },
  { code: "TRANSFER", label: "Trasladar" },
  { code: "COUNT", label: "Contar" },
  { code: "PREPARE_EXIT", label: "Preparar salida" },
  { code: "DISPATCH", label: "Despachar" },
  { code: "RETURN", label: "Retornar" },
  { code: "ADJUST", label: "Ajustar" },
]);
const SCOPES = Object.freeze([
  { code: "INTERNAL_MATERIALS", label: "Materiales internos" },
  { code: "INTERNAL_ASSETS", label: "Herramientas y equipos" },
  { code: "CUSTOMER_CUSTODY", label: "Efectos de clientes" },
]);
const BUTTON = "inline-flex min-h-9 items-center justify-center gap-1.5 rounded border border-slate-300 px-3 text-xs font-semibold disabled:opacity-40";

export default function WarehouseAccessAdmin({ authorization, onUnauthorized }: { authorization?: string; onUnauthorized(): void }) {
  const api = useMemo(() => new CustomerCustodyApi(authorization), [authorization]);
  const membershipApi = useMemo(() => new AdminTenantApi(() => authorization || null), [authorization]);
  const [grants, setGrants] = useState<readonly WarehouseAccessGrant[]>([]);
  const [memberships, setMemberships] = useState<readonly AdminMembership[]>([]);
  const [warehouses, setWarehouses] = useState<readonly WarehouseRow[]>([]);
  const [membershipRef, setMembershipRef] = useState("");
  const [warehouseRef, setWarehouseRef] = useState("");
  const [locationRef, setLocationRef] = useState("");
  const [scope, setScope] = useState("CUSTOMER_CUSTODY");
  const [operations, setOperations] = useState<readonly string[]>(["VIEW"]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [changingRef, setChangingRef] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [grantRows, memberRows, warehouseRows] = await Promise.all([
        api.grants(),
        membershipApi.list({ status: "ACTIVE", pageSize: 100 }),
        materialsApi.warehouses(authorization),
      ]);
      setGrants(grantRows);
      setMemberships(memberRows.data);
      setWarehouses(warehouseRows);
      setMembershipRef((current) => current || memberRows.data[0]?.membershipRef || "");
      setWarehouseRef((current) => current || warehouseRows[0]?.warehouseRef || "");
    } catch (cause) {
      if (cause instanceof Error && "status" in cause && cause.status === 401) onUnauthorized();
      else setError(customerCustodyErrorText(cause));
    }
  }, [api, authorization, membershipApi, onUnauthorized]);

  useEffect(() => { void refresh(); }, [refresh]);

  const warehouse = warehouses.find((row) => row.warehouseRef === warehouseRef);
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const row = await api.grant({ membershipRef, warehouseRef: warehouseRef || null, locationRef: locationRef || null, inventoryScope: scope, operations });
      setGrants((current) => [row, ...current]);
    } catch (cause) {
      setError(customerCustodyErrorText(cause));
    } finally {
      setSaving(false);
    }
  };

  const toggleGrant = async (grant: WarehouseAccessGrant) => {
    setChangingRef(grant.grantRef);
    setError(null);
    try {
      const row = await api.updateGrant(grant.grantRef, { expectedVersion: grant.version, operations: grant.operations, status: grant.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" });
      setGrants((current) => current.map((candidate) => candidate.grantRef === row.grantRef ? row : candidate));
    } catch (cause) {
      setError(customerCustodyErrorText(cause));
    } finally {
      setChangingRef(null);
    }
  };

  return <section className="mt-5 space-y-4" data-testid="warehouse-access-admin">
    <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-sky-700">Autoridad operativa</p><h2 className="text-xl font-black text-[#003366]">Accesos a almacenes e inventarios</h2><p className="mt-1 max-w-4xl text-xs text-slate-500">Asigne explícitamente quién puede trabajar en cada inventario, almacén y ubicación. El rol general no concede recepción, traslado ni salida.</p></div>
    <div className="rounded-xl border bg-white p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-semibold">Usuario<select value={membershipRef} onChange={(event) => setMembershipRef(event.target.value)} className={`${COMPACT_FORM_FIELD} mt-1 w-full`}>{memberships.map((row) => <option key={row.membershipRef} value={row.membershipRef}>{row.name}</option>)}</select></label>
        <label className="text-xs font-semibold">Inventario<select value={scope} onChange={(event) => setScope(event.target.value)} className={`${COMPACT_FORM_FIELD} mt-1 w-full`}>{SCOPES.map((row) => <option key={row.code} value={row.code}>{row.label}</option>)}</select></label>
        <label className="text-xs font-semibold">Almacén<select value={warehouseRef} onChange={(event) => { setWarehouseRef(event.target.value); setLocationRef(""); }} className={`${COMPACT_FORM_FIELD} mt-1 w-full`}><option value="">Todos los almacenes</option>{warehouses.map((row) => <option key={row.warehouseRef} value={row.warehouseRef}>{row.name}</option>)}</select></label>
        <label className="text-xs font-semibold">Ubicación<select value={locationRef} onChange={(event) => setLocationRef(event.target.value)} disabled={!warehouseRef} className={`${COMPACT_FORM_FIELD} mt-1 w-full`}><option value="">Todo el almacén</option>{warehouse?.locations.map((row) => <option key={row.locationRef} value={row.locationRef}>{row.path}</option>)}</select></label>
      </div>
      <fieldset className="mt-3"><legend className="text-xs font-semibold">Trabajos permitidos</legend><div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">{OPERATIONS.map((operation) => <label key={operation.code} className="inline-flex items-center gap-1.5 text-xs"><input type="checkbox" checked={operations.includes(operation.code)} onChange={(event) => setOperations((current) => event.target.checked ? [...current, operation.code] : current.filter((code) => code !== operation.code))} />{operation.label}</label>)}</div></fieldset>
      {error && <p role="alert" className="mt-3 text-xs text-red-700">{error}</p>}
      <div className="mt-4 flex justify-end"><button type="button" disabled={saving || !membershipRef || operations.length === 0 || Boolean(locationRef && !warehouseRef)} onClick={() => void save()} className={`${BUTTON} border-[#003366] bg-[#003366] text-white`}><Plus className="h-4 w-4" />{saving ? "Guardando…" : "Asignar acceso"}</button></div>
    </div>
    <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full min-w-[820px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="px-3 py-2">Usuario</th><th className="px-3 py-2">Inventario</th><th className="px-3 py-2">Alcance</th><th className="px-3 py-2">Trabajos</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2 text-right">Acción</th></tr></thead><tbody>{grants.map((grant) => <tr key={grant.grantRef} className="border-t"><td className="px-3 py-2"><strong className="block">{grant.membership.name}</strong><span className="text-[10px] text-slate-500">{grant.membership.email}</span></td><td className="px-3 py-2">{SCOPES.find((row) => row.code === grant.inventoryScope)?.label || grant.inventoryScope}</td><td className="px-3 py-2">{grant.location?.path || grant.warehouse?.name || "Todos los almacenes"}</td><td className="px-3 py-2">{grant.operations.map((code) => OPERATIONS.find((row) => row.code === code)?.label || code).join(" · ")}</td><td className="px-3 py-2"><span className={`inline-flex items-center gap-1 ${grant.status === "ACTIVE" ? "text-emerald-700" : "text-slate-500"}`}>{grant.status === "ACTIVE" ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldOff className="h-3.5 w-3.5" />}{grant.status === "ACTIVE" ? "Activo" : "Inactivo"}</span></td><td className="px-3 py-2 text-right"><button type="button" className={BUTTON} disabled={changingRef === grant.grantRef} onClick={() => void toggleGrant(grant)} aria-label={`${grant.status === "ACTIVE" ? "Desactivar" : "Activar"} acceso de ${grant.membership.name}`}>{grant.status === "ACTIVE" ? "Desactivar" : "Activar"}</button></td></tr>)}</tbody></table></div>
    <CustodyCatalogAdmin authorization={authorization} onUnauthorized={onUnauthorized} />
  </section>;
}
