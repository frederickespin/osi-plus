import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Building2, CircleDollarSign, Handshake, Pencil, RefreshCw, Save, UserRoundCheck, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CommercialRelationshipsApi, type CommercialCaseSnapshot, type CommercialEntitySummary } from "./api";
import type { CommercialRelationshipsAccess } from "./access";

type Props = Readonly<{ caseRef: string; authorization?: string; access: CommercialRelationshipsAccess; onUnauthorized(): void }>;
const LABELS = Object.freeze({ COMPANY: "Empresa", LEAD_ACCOUNT: "Lead Account", BOOKER: "Booker", PAYER: "Pagador", APPROVER: "Aprobador", REFERRER: "Referido", AGENT: "Agente", SUPPLIER: "Proveedor" });
type Role = keyof typeof LABELS;

export default function CaseCommercialContextPanel({ caseRef, authorization, access, onUnauthorized }: Props) {
  const api = useMemo(() => new CommercialRelationshipsApi(authorization), [authorization]);
  const [snapshot, setSnapshot] = useState<CommercialCaseSnapshot | null>(null);
  const [entities, setEntities] = useState<readonly CommercialEntitySummary[]>([]);
  const [selection, setSelection] = useState<Partial<Record<Role, string>>>({});
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([api.caseContext(caseRef), api.entities("")])
      .then(([value, page]) => {
        if (!active) return;
        setSnapshot(value);
        setEntities(page.items);
        setSelection(Object.fromEntries((value?.parties || []).map((party) => [party.role, party.entityRef])));
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        const code = cause instanceof Error ? cause.message : "COMMERCIAL_RELATIONSHIPS_REQUEST_FAILED";
        if (code.includes("FORBIDDEN") || code.includes("UNAUTHORIZED")) onUnauthorized(); else setError(code);
      });
    return () => { active = false; };
  }, [api, caseRef, onUnauthorized, reload]);

  async function publish() {
    setSaving(true);
    setError(null);
    try {
      const parties = Object.entries(selection).filter((entry): entry is [Role, string] => Boolean(entry[1])).map(([role, entityRef]) => ({ role, entityRef, relationshipRef: null }));
      const next = await api.publishContext(caseRef, { seriesRef: snapshot?.seriesRef || null, expectedVersion: snapshot?.version || 0, parties, pricingAgreementRef: snapshot?.pricingAgreementRef || null, referralAgreementRef: snapshot?.referralAgreementRef || null });
      setSnapshot(next);
      setEditing(false);
      setReload((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "COMMERCIAL_RELATIONSHIPS_REQUEST_FAILED");
    } finally {
      setSaving(false);
    }
  }

  if (!access.canView) return null;
  if (error && !editing) return <Alert variant="destructive"><AlertCircle /><AlertTitle>No pudimos cargar el contexto comercial</AlertTitle><AlertDescription>{error}<Button variant="outline" size="sm" className="mt-2" onClick={() => setReload((value) => value + 1)}><RefreshCw />Reintentar</Button></AlertDescription></Alert>;

  return <section data-testid="case-commercial-context" className="border border-slate-200 bg-white">
    <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-slate-50 px-3 py-2">
      <div><h2 className="text-xs font-black uppercase tracking-wide text-[#003366]">Relaciones Comerciales</h2><p className="text-[10px] text-slate-500">Snapshot publicado e inmutable para Costing y Cotización</p></div>
      {access.canManage && !editing && <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil />{snapshot ? "Crear nueva versión" : "Definir contexto"}</Button>}
    </header>
    {editing ? <div className="p-3" data-testid="commercial-context-editor">
      <p className="mb-3 text-xs text-slate-600">Selecciona cada autoridad explícitamente. Una entidad no adquiere otro rol por nombre, Client o relación histórica.</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{(Object.keys(LABELS) as Role[]).map((role) => <label key={role} className="text-[10px] font-bold uppercase tracking-wide text-slate-600">{LABELS[role]}{role === "PAYER" && <span className="ml-1 text-amber-700">requerido al publicar Quote</span>}<select aria-label={LABELS[role]} value={selection[role] || ""} onChange={(event) => setSelection((current) => ({ ...current, [role]: event.target.value || undefined }))} className="mt-1 h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm font-normal normal-case"><option value="">No seleccionado</option>{entities.map((entity) => <option key={entity.entityRef} value={entity.entityRef}>{entity.displayName} · {entity.kind}</option>)}</select></label>)}</div>
      {error && <p role="alert" className="mt-3 text-xs font-semibold text-red-700">{error}</p>}
      <div className="mt-4 flex justify-end gap-2"><Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saving}><X />Cancelar</Button><Button size="sm" onClick={publish} disabled={saving}><Save />{saving ? "Publicando…" : "Publicar versión"}</Button></div>
    </div> : snapshot ? <>
      <dl className="grid sm:grid-cols-2 xl:grid-cols-3">{(Object.keys(LABELS) as Role[]).map((role) => { const party = snapshot.parties.find((item) => item.role === role); return <div key={role} className="border-b border-r border-slate-100 p-3"><dt className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{role === "PAYER" ? <CircleDollarSign className="h-3.5 w-3.5" /> : role === "REFERRER" ? <Handshake className="h-3.5 w-3.5" /> : role === "COMPANY" || role === "LEAD_ACCOUNT" ? <Building2 className="h-3.5 w-3.5" /> : <UserRoundCheck className="h-3.5 w-3.5" />}{LABELS[role]}</dt><dd className="mt-1 text-sm font-semibold text-slate-900">{party?.displayName || "No seleccionado"}</dd><p className="text-[10px] text-slate-500">{party ? party.kind : "Sin inferencia"}</p></div>; })}</dl>
      <div className="grid border-t sm:grid-cols-3"><div className="p-3"><p className="text-[10px] font-bold uppercase text-slate-500">Acuerdo</p><p className="text-xs font-semibold">{snapshot.pricingAgreementRef ? "Acuerdo publicado" : "Sin acuerdo"}</p></div><div className="p-3"><p className="text-[10px] font-bold uppercase text-slate-500">Referido</p><p className="text-xs font-semibold">{snapshot.referralAgreementRef ? "Acuerdo publicado" : "Sin referido"}</p></div><div className="p-3"><p className="text-[10px] font-bold uppercase text-slate-500">Asociaciones / instrucciones</p><p className="text-xs font-semibold">{snapshot.associations.length} / {snapshot.instructions.length}</p></div></div>
    </> : <div className="border border-dashed border-slate-300 p-5 text-sm text-slate-600"><p className="font-semibold text-slate-800">Contexto comercial pendiente</p><p className="mt-1">Empresa, Lead Account, Booker, pagador y aprobador deben seleccionarse explícitamente. Ninguna relación se infiere del Client.</p></div>}
  </section>;
}
