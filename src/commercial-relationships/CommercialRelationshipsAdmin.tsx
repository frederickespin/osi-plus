import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, BadgeDollarSign, Building2, Handshake, Landmark, Plus, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CommercialRelationshipsApi, type CommercialEntitySummary, type CommercialRelationshipSummary } from "./api";
import type { CommercialRelationshipsAccess } from "./access";

type Props = Readonly<{ authorization?: string; access: CommercialRelationshipsAccess; onBack(): void; onUnauthorized(): void }>;
const TABS = ["Entidades", "Relaciones", "Tarifarios", "Referidos", "Comisiones", "Asociaciones"] as const;
type Tab = (typeof TABS)[number];
const KINDS = ["PERSON", "COMPANY", "ORGANIZATION", "AGENT", "LEAD_ACCOUNT", "SUPPLIER", "REFERRER", "THIRD_PARTY", "ASSOCIATION"] as const;
const RELATIONSHIPS = ["EMPLOYED_BY", "LEAD_ACCOUNT", "BOOKER", "PAYER", "APPROVER", "REFERRER", "AGENT", "SUPPLIER", "ASSOCIATED_WITH"] as const;
const RELATION_LABEL: Record<string, string> = { EMPLOYED_BY: "Empresa / empleador", LEAD_ACCOUNT: "Lead Account", BOOKER: "Booker", PAYER: "Responsable del pago", APPROVER: "Aprobador", REFERRER: "Referidor", AGENT: "Agente", SUPPLIER: "Proveedor", ASSOCIATED_WITH: "Asociación" };
type Workspace = { tariffs: readonly Record<string, unknown>[]; pricingAgreements: readonly Record<string, unknown>[]; referrals: readonly Record<string, unknown>[]; commissions: readonly Record<string, unknown>[]; associations: readonly Record<string, unknown>[]; certifications: readonly Record<string, unknown>[] };

function Empty({ text }: { text: string }) { return <div className="border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">{text}</div>; }
function Line({ title, subtitle, tag }: { title: string; subtitle: string; tag?: string }) { return <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-2 last:border-b-0"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{title}</p><p className="truncate text-xs text-slate-500">{subtitle}</p></div>{tag && <span className="shrink-0 rounded bg-sky-50 px-2 py-1 text-[10px] font-bold uppercase text-sky-800">{tag}</span>}</div>; }

export default function CommercialRelationshipsAdmin({ authorization, access, onBack, onUnauthorized }: Props) {
  const api = useMemo(() => new CommercialRelationshipsApi(authorization), [authorization]);
  const [tab, setTab] = useState<Tab>("Entidades");
  const [search, setSearch] = useState("");
  const [entities, setEntities] = useState<readonly CommercialEntitySummary[]>([]);
  const [relationships, setRelationships] = useState<readonly CommercialRelationshipSummary[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [editor, setEditor] = useState<"ENTITY" | "RELATIONSHIP" | null>(null);
  const [entityDraft, setEntityDraft] = useState({ code: "", displayName: "", kind: "COMPANY" });
  const [relationshipDraft, setRelationshipDraft] = useState({ sourceEntityRef: "", targetEntityRef: "", type: "EMPLOYED_BY" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [entityPage, relationRows, catalog] = await Promise.all([api.entities(search), api.relationships(), api.workspace()]);
      setEntities(entityPage.items); setRelationships(relationRows); setWorkspace(catalog); setError(null);
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "COMMERCIAL_RELATIONSHIPS_REQUEST_FAILED";
      if (code.includes("FORBIDDEN") || code.includes("UNAUTHORIZED")) onUnauthorized(); else setError(code);
    } finally { setLoading(false); }
  }, [api, onUnauthorized, search]);
  useEffect(() => { void load(); }, [load]);

  async function saveEntity() {
    setSaving(true); setError(null);
    try {
      await api.createEntity({ code: entityDraft.code, displayName: entityDraft.displayName, legalName: null, kind: entityDraft.kind, clientRef: null, countryCode: null, taxReference: null, validFrom: null, validTo: null });
      setEntityDraft({ code: "", displayName: "", kind: "COMPANY" }); setEditor(null); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "COMMERCIAL_RELATIONSHIPS_REQUEST_FAILED"); } finally { setSaving(false); }
  }
  async function saveRelationship() {
    setSaving(true); setError(null);
    try {
      await api.createRelationship({ ...relationshipDraft, reference: null, conditions: {}, metadata: {}, validFrom: null, validTo: null });
      setRelationshipDraft({ sourceEntityRef: "", targetEntityRef: "", type: "EMPLOYED_BY" }); setEditor(null); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "COMMERCIAL_RELATIONSHIPS_REQUEST_FAILED"); } finally { setSaving(false); }
  }

  if (!access.canView) return <Alert variant="destructive" className="m-6"><AlertTitle>Acceso no autorizado</AlertTitle><AlertDescription>Tu sesión no permite consultar Relaciones Comerciales.</AlertDescription></Alert>;
  const list = tab === "Tarifarios" ? workspace?.tariffs : tab === "Referidos" ? workspace?.referrals : tab === "Comisiones" ? workspace?.commissions : tab === "Asociaciones" ? workspace?.associations : [];
  return <section className="min-h-screen bg-[#f4f7fb]" data-testid="commercial-relationships-admin">
    <header className="border-b border-slate-200 bg-white px-4 py-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#0070a8]">Administración comercial</p><h1 className="text-xl font-black text-[#003366]">Relaciones Comerciales</h1><p className="text-xs text-slate-500">Autoridad tenant-first · referencias públicas · vigencias explícitas</p></div><Button variant="outline" onClick={onBack}><ArrowLeft />Volver al Inbox</Button></div></header>
    <div className="p-4"><div role="tablist" aria-label="Catálogo de Relaciones Comerciales" className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white p-1">{TABS.map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={`shrink-0 rounded px-3 py-2 text-xs font-bold ${tab === item ? "bg-[#003366] text-white" : "text-slate-600 hover:bg-slate-100"}`}>{item}</button>)}</div>
      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]"><main className="border border-slate-200 bg-white"><div className="flex items-center gap-2 border-b p-3"><Search className="h-4 w-4 text-slate-400" /><Input aria-label="Buscar entidades comerciales" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre o código" className="h-8" />{access.canManage && (tab === "Entidades" || tab === "Relaciones") && <Button size="sm" onClick={() => setEditor(tab === "Entidades" ? "ENTITY" : "RELATIONSHIP")}><Plus />Nuevo</Button>}</div>
        {error && <Alert variant="destructive" className="m-3"><AlertTitle>No fue posible completar la operación</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        {loading ? <p className="p-8 text-center text-sm text-slate-500">Consultando autoridad comercial…</p> : tab === "Entidades" ? entities.length ? entities.map((item) => <Line key={item.entityRef} title={item.displayName} subtitle={`${item.code} · ${item.legalName || "Sin razón social"}`} tag={item.kind} />) : <Empty text="No hay entidades comerciales registradas." /> : tab === "Relaciones" ? relationships.length ? relationships.map((item) => <Line key={item.relationshipRef} title={`${item.source.displayName} → ${item.target.displayName}`} subtitle={`${RELATION_LABEL[item.type] || item.type} · ${item.validFrom || "Inicio abierto"} → ${item.validTo || "Sin vencimiento"}`} tag={item.status} />) : <Empty text="No hay relaciones explícitas registradas." /> : list?.length ? list.map((item, index) => <Line key={String(item.tariffRef || item.referralAgreementRef || item.commissionAgreementRef || item.membershipRef || index)} title={String(item.name || item.reference || (item.association as { displayName?: string })?.displayName || item.kind || "Registro versionado")} subtitle={`Versión ${String(item.version || 1)} · vigencia explícita`} tag="Publicado" />) : <Empty text={`No hay registros en ${tab}. Nada se infiere automáticamente.`} />}
      </main><aside className="border border-slate-200 bg-white p-4">{editor === "ENTITY" ? <div data-testid="commercial-entity-editor"><h2 className="text-xs font-black uppercase text-[#003366]">Nueva entidad</h2><label className="mt-3 block text-xs font-semibold">Código<Input className="mt-1" value={entityDraft.code} onChange={(event) => setEntityDraft((value) => ({ ...value, code: event.target.value.toUpperCase() }))} /></label><label className="mt-3 block text-xs font-semibold">Nombre visible<Input className="mt-1" value={entityDraft.displayName} onChange={(event) => setEntityDraft((value) => ({ ...value, displayName: event.target.value }))} /></label><label className="mt-3 block text-xs font-semibold">Tipo<select className="mt-1 h-10 w-full rounded border px-2" value={entityDraft.kind} onChange={(event) => setEntityDraft((value) => ({ ...value, kind: event.target.value }))}>{KINDS.map((kind) => <option key={kind}>{kind}</option>)}</select></label><div className="mt-4 flex gap-2"><Button size="sm" variant="outline" onClick={() => setEditor(null)}>Cancelar</Button><Button size="sm" onClick={saveEntity} disabled={saving || !entityDraft.code || !entityDraft.displayName}>Guardar</Button></div></div> : editor === "RELATIONSHIP" ? <div data-testid="commercial-relationship-editor"><h2 className="text-xs font-black uppercase text-[#003366]">Nueva relación explícita</h2>{(["sourceEntityRef", "targetEntityRef"] as const).map((field) => <label key={field} className="mt-3 block text-xs font-semibold">{field === "sourceEntityRef" ? "Origen" : "Destino"}<select className="mt-1 h-10 w-full rounded border px-2" value={relationshipDraft[field]} onChange={(event) => setRelationshipDraft((value) => ({ ...value, [field]: event.target.value }))}><option value="">Seleccionar</option>{entities.map((entity) => <option key={entity.entityRef} value={entity.entityRef}>{entity.displayName}</option>)}</select></label>)}<label className="mt-3 block text-xs font-semibold">Tipo<select className="mt-1 h-10 w-full rounded border px-2" value={relationshipDraft.type} onChange={(event) => setRelationshipDraft((value) => ({ ...value, type: event.target.value }))}>{RELATIONSHIPS.map((type) => <option key={type} value={type}>{RELATION_LABEL[type]}</option>)}</select></label><div className="mt-4 flex gap-2"><Button size="sm" variant="outline" onClick={() => setEditor(null)}>Cancelar</Button><Button size="sm" onClick={saveRelationship} disabled={saving || !relationshipDraft.sourceEntityRef || !relationshipDraft.targetEntityRef || relationshipDraft.sourceEntityRef === relationshipDraft.targetEntityRef}>Guardar</Button></div></div> : <><h2 className="text-xs font-black uppercase tracking-wide text-[#003366]">Fronteras del contrato</h2><div className="mt-3 space-y-3 text-xs text-slate-600"><p className="flex gap-2"><Building2 className="h-4 w-4 shrink-0 text-sky-700" />Empresa, Lead Account y Booker son relaciones distintas.</p><p className="flex gap-2"><Landmark className="h-4 w-4 shrink-0 text-sky-700" />Pagador y aprobador se seleccionan explícitamente.</p><p className="flex gap-2"><BadgeDollarSign className="h-4 w-4 shrink-0 text-sky-700" />Costing conserva costo; el acuerdo conserva pricing comercial.</p><p className="flex gap-2"><Handshake className="h-4 w-4 shrink-0 text-sky-700" />Referido externo y comisión interna no comparten autoridad.</p><p className="flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-sky-700" />Asociaciones y certificaciones no activan reglas implícitas.</p></div></>}</aside></div>
    </div>
  </section>;
}
