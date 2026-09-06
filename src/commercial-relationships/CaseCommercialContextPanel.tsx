import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Building2, CircleDollarSign, Handshake, Pencil, RefreshCw, Save, UserRoundCheck, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CommercialRelationshipsApi, type CommercialCaseSnapshot, type CommercialEntitySummary, type CommercialRelationshipSummary } from "./api";
import type { CommercialRelationshipsAccess } from "./access";

type Props = Readonly<{ caseRef: string; authorization?: string; access: CommercialRelationshipsAccess; onUnauthorized(): void }>;
const LABELS = Object.freeze({ COMPANY: "Empresa", LEAD_ACCOUNT: "Lead Account", BOOKER: "Booker", PAYER: "Pagador", APPROVER: "Aprobador", REFERRER: "Referido", AGENT: "Agente", SUPPLIER: "Proveedor" });
type Role = keyof typeof LABELS;
type Catalog = Awaited<ReturnType<CommercialRelationshipsApi["workspace"]>>;
function period(from: string | null, to: string | null) { return from || to ? `${from ? new Date(from).toLocaleDateString("es-DO") : "inicio abierto"} – ${to ? new Date(to).toLocaleDateString("es-DO") : "sin vencimiento"}` : "Vigencia abierta"; }
function instructionText(content: Record<string, unknown>) { return typeof content.summary === "string" ? content.summary : typeof content.instruction === "string" ? content.instruction : typeof content.rule === "string" ? content.rule : "Instrucción comercial publicada"; }

export default function CaseCommercialContextPanel({ caseRef, authorization, access, onUnauthorized }: Props) {
  const api = useMemo(() => new CommercialRelationshipsApi(authorization), [authorization]);
  const [snapshot, setSnapshot] = useState<CommercialCaseSnapshot | null>(null);
  const [entities, setEntities] = useState<readonly CommercialEntitySummary[]>([]);
  const [relationships, setRelationships] = useState<readonly CommercialRelationshipSummary[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [selection, setSelection] = useState<Partial<Record<Role, string>>>({});
  const [relationshipSelection, setRelationshipSelection] = useState<Partial<Record<Role, string>>>({});
  const [agreementRef, setAgreementRef] = useState("");
  const [referralRef, setReferralRef] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([api.caseContext(caseRef), api.entities(""), api.relationships(), api.workspace()])
      .then(([value, page, relationRows, workspace]) => {
        if (!active) return;
        setSnapshot(value);
        setEntities(page.items);
        setRelationships(relationRows);
        setCatalog(workspace);
        setSelection(Object.fromEntries((value?.parties || []).map((party) => [party.role, party.entityRef])));
        setRelationshipSelection(Object.fromEntries((value?.parties || []).filter((party) => party.relationshipRef).map((party) => [party.role, party.relationshipRef])));
        setAgreementRef(value?.pricingAgreementRef || "");
        setReferralRef(value?.referralAgreementRef || "");
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
      const parties = Object.entries(selection).filter((entry): entry is [Role, string] => Boolean(entry[1])).map(([role, entityRef]) => ({ role, entityRef, relationshipRef: relationshipSelection[role] || null }));
      const next = await api.publishContext(caseRef, { seriesRef: snapshot?.seriesRef || null, expectedVersion: snapshot?.version || 0, parties, pricingAgreementRef: agreementRef || null, referralAgreementRef: referralRef || null });
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
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{(Object.keys(LABELS) as Role[]).map((role) => <div key={role}><label className="text-[10px] font-bold uppercase tracking-wide text-slate-600">{LABELS[role]}{role === "PAYER" && <span className="ml-1 text-amber-700">responsable del pago</span>}<select aria-label={LABELS[role]} value={selection[role] || ""} onChange={(event) => setSelection((current) => ({ ...current, [role]: event.target.value || undefined }))} className="mt-1 h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm font-normal normal-case"><option value="">No definido</option>{entities.map((entity) => <option key={entity.entityRef} value={entity.entityRef}>{entity.displayName} · {entity.kind}</option>)}</select></label><label className="mt-1 block text-[10px] font-semibold text-slate-500">Relación explícita<select aria-label={`Relación ${LABELS[role]}`} value={relationshipSelection[role] || ""} onChange={(event) => setRelationshipSelection((current) => ({ ...current, [role]: event.target.value || undefined }))} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs font-normal"><option value="">Sin relación asociada</option>{relationships.filter((item) => !selection[role] || item.source.entityRef === selection[role] || item.target.entityRef === selection[role]).map((item) => <option key={item.relationshipRef} value={item.relationshipRef}>{item.type} · {item.source.displayName} → {item.target.displayName}</option>)}</select></label></div>)}</div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-[10px] font-bold uppercase text-slate-600">Tarifario / acuerdo<select aria-label="Tarifario o acuerdo" value={agreementRef} onChange={(event) => setAgreementRef(event.target.value)} className="mt-1 h-9 w-full rounded border bg-white px-2 text-sm font-normal normal-case"><option value="">No definido</option>{(catalog?.pricingAgreements || []).map((item) => <option key={String(item.pricingAgreementRef)} value={String(item.pricingAgreementRef)}>{String(item.tariffCode || "Acuerdo")} · v{String(item.version || 1)}</option>)}</select></label><label className="text-[10px] font-bold uppercase text-slate-600">Acuerdo de referido<select aria-label="Acuerdo de referido" value={referralRef} onChange={(event) => setReferralRef(event.target.value)} className="mt-1 h-9 w-full rounded border bg-white px-2 text-sm font-normal normal-case"><option value="">No definido</option>{(catalog?.referrals || []).map((item) => <option key={String(item.referralAgreementRef)} value={String(item.referralAgreementRef)}>{String((item.referrer as { displayName?: string })?.displayName || "Referido")} · v{String(item.version || 1)}</option>)}</select></label></div>
      {error && <p role="alert" className="mt-3 text-xs font-semibold text-red-700">{error}</p>}
      <div className="mt-4 flex justify-end gap-2"><Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saving}><X />Cancelar</Button><Button size="sm" onClick={publish} disabled={saving}><Save />{saving ? "Publicando…" : "Publicar versión"}</Button></div>
    </div> : snapshot ? <>
      <dl className="grid sm:grid-cols-2 xl:grid-cols-3">{(Object.keys(LABELS) as Role[]).map((role) => { const party = snapshot.parties.find((item) => item.role === role); return <div key={role} className={`border-b border-r border-slate-100 p-3 ${role === "PAYER" ? "bg-amber-50/60" : ""}`}><dt className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{role === "PAYER" ? <CircleDollarSign className="h-3.5 w-3.5" /> : role === "REFERRER" ? <Handshake className="h-3.5 w-3.5" /> : role === "COMPANY" || role === "LEAD_ACCOUNT" ? <Building2 className="h-3.5 w-3.5" /> : <UserRoundCheck className="h-3.5 w-3.5" />}{role === "PAYER" ? "Responsable del pago" : LABELS[role]}</dt><dd className="mt-1 text-sm font-semibold text-slate-900">{party?.displayName || "No definido"}</dd><p className="text-[10px] text-slate-500">{party ? `${party.kind} · ${period(party.validFrom, party.validTo)}` : "Sin inferencia"}</p>{party?.contacts.map((contact) => <p key={contact.contactRef} className="mt-1 text-[10px] text-sky-800">{contact.displayName}{contact.position ? ` · ${contact.position}` : ""}</p>)}</div>; })}</dl>
      <div className="grid border-t lg:grid-cols-2"><section className="border-b p-3 lg:border-b-0 lg:border-r"><p className="text-[10px] font-bold uppercase text-slate-500">Tarifario / acuerdo</p>{snapshot.agreement ? <div className="mt-1 space-y-1 text-xs"><p className="font-semibold">{snapshot.agreement.tariff ? `${snapshot.agreement.tariff.name} · ${snapshot.agreement.tariff.currency}` : "Acuerdo publicado"}</p><p className="text-slate-500">Acuerdo v{snapshot.agreement.version}{snapshot.agreement.tariff ? ` · Tarifario ${snapshot.agreement.tariff.code} v${snapshot.agreement.tariff.version}` : ""} · {period(snapshot.agreement.validFrom, snapshot.agreement.validTo)}</p>{snapshot.agreement.adjustments.map((item) => <p key={item.adjustmentRef} className="text-slate-700">{item.kind === "DISCOUNT" ? "Descuento acordado" : "Cargo administrativo"}: {item.value}{item.calculationType === "PERCENTAGE" ? "%" : ` ${snapshot.agreement?.tariff?.currency || ""}`} · {item.authorized ? "Autorizado" : "Regla publicada"}</p>)}</div> : <p className="mt-1 text-xs font-semibold">No definido</p>}</section><section className="p-3"><p className="text-[10px] font-bold uppercase text-slate-500">Referido externo</p>{snapshot.referral ? <div className="mt-1 text-xs"><p className="font-semibold">{snapshot.referral.reference} · {snapshot.referral.value}{snapshot.referral.calculationType === "PERCENTAGE" ? "%" : ` ${snapshot.referral.currency || ""}`}</p><p className="text-slate-500">v{snapshot.referral.version} · {period(snapshot.referral.validFrom, snapshot.referral.validTo)}</p></div> : <p className="mt-1 text-xs font-semibold">No definido</p>}</section></div>
      <div className="grid border-t lg:grid-cols-2"><section className="border-b p-3 lg:border-b-0 lg:border-r"><p className="text-[10px] font-bold uppercase text-slate-500">Asociaciones</p>{snapshot.associations.length ? snapshot.associations.map((item) => <p key={item.membershipRef} className="mt-1 text-xs"><span className="font-semibold">{item.associationName}</span> · {period(item.validFrom, item.validTo)}</p>) : <p className="mt-1 text-xs font-semibold">No definido</p>}</section><section className="p-3"><p className="text-[10px] font-bold uppercase text-slate-500">Instrucciones especiales</p>{snapshot.instructions.length ? <ul className="mt-1 list-disc space-y-1 pl-4 text-xs">{snapshot.instructions.map((item) => <li key={item.instructionRef}>{instructionText(item.content)}</li>)}</ul> : <p className="mt-1 text-xs font-semibold">No definido</p>}</section></div>
    </> : <div className="border border-dashed border-slate-300 p-5 text-sm text-slate-600"><p className="font-semibold text-slate-800">Contexto comercial pendiente</p><p className="mt-1">Empresa, Lead Account, Booker, pagador y aprobador deben seleccionarse explícitamente. Ninguna relación se infiere del Client.</p></div>}
  </section>;
}
