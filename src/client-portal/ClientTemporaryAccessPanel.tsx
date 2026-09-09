import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Link2, ShieldX } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { createInternalClientAccessApi, type InternalClientAccess } from "./api";
import type { ClientTemporaryAccessUi } from "./access";

type Contact = Readonly<{ contactRef: string; displayName: string }>;
type Props = Readonly<{ caseRef: string; assignmentRef: string; contacts: readonly Contact[]; authorization?: string; access: ClientTemporaryAccessUi; onUnauthorized(): void }>;

export default function ClientTemporaryAccessPanel({ caseRef, assignmentRef, contacts, authorization, access, onUnauthorized }: Props) {
  const api = useMemo(() => createInternalClientAccessApi(authorization), [authorization]);
  const [items, setItems] = useState<readonly InternalClientAccess[]>([]);
  const [contactRef, setContactRef] = useState(contacts[0]?.contactRef || "");
  const [purpose, setPurpose] = useState<"VISIT" | "MINI_SURVEY">("VISIT");
  const [shortCodeEnabled, setShortCodeEnabled] = useState(false);
  const [credentials, setCredentials] = useState<Readonly<{ link: string; shortCode: string | null }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api.list(caseRef).then(setItems).catch((cause) => { if (cause instanceof Error && cause.message.includes("AUTH")) onUnauthorized(); else setError("No se pudo consultar los accesos temporales."); }), [api, caseRef, onUnauthorized]);
  useEffect(() => { if (access.canView) void load(); }, [access.canView, load]);

  const create = async () => {
    if (!contactRef) return;
    setBusy(true); setError(null); setCredentials(null);
    const scopes = purpose === "MINI_SURVEY" ? ["VISIT_VIEW", "MINI_SURVEY_EDIT", "SURVEY_INFO_UPLOAD"] : ["VISIT_VIEW", "VISIT_CONFIRM", "VISIT_CHANGE_REQUEST", "VISIT_CANCEL_REQUEST", "VISIT_QR_CONFIRM"];
    try {
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      const result = await api.create({ caseRef, assignmentRef, contactRef, purpose, scopes, expiresAt, maxUses: 50, shortCodeEnabled });
      setCredentials(result.oneTimeCredentials); await load();
    } catch { setError("No se pudo generar el acceso temporal."); } finally { setBusy(false); }
  };

  const revoke = async (item: InternalClientAccess) => { setBusy(true); setError(null); try { await api.revoke(item, "Revocación solicitada desde Comercial"); await load(); } catch { setError("No se pudo revocar el acceso."); } finally { setBusy(false); } };
  return <section className="border-t border-slate-200 p-4" aria-labelledby="temporary-client-access-title">
    <h3 id="temporary-client-access-title" className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500"><Link2 className="h-4 w-4" />Acceso temporal del cliente</h3>
    <p className="mt-1 text-xs text-slate-600">Enlace limitado a este caso, visita y contacto seleccionado. No crea una cuenta del ERP.</p>
    {access.canCreate && <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_180px_auto]">
      <select aria-label="Contacto autorizado" value={contactRef} onChange={(event) => setContactRef(event.target.value)} className="h-10 rounded-md border px-3 text-sm"><option value="">Seleccione un contacto publicado</option>{contacts.map((contact) => <option key={contact.contactRef} value={contact.contactRef}>{contact.displayName}</option>)}</select>
      <select aria-label="Propósito del acceso" value={purpose} onChange={(event) => setPurpose(event.target.value as "VISIT" | "MINI_SURVEY")} className="h-10 rounded-md border px-3 text-sm"><option value="VISIT">Visita</option><option value="MINI_SURVEY">Mini-visita</option></select>
      <Button disabled={busy || !contactRef} onClick={() => void create()}>Generar acceso</Button>
      <label className="flex items-center gap-2 text-xs text-slate-600 sm:col-span-3"><input type="checkbox" checked={shortCodeEnabled} onChange={(event) => setShortCodeEnabled(event.target.checked)} />Añadir código de consulta de corta vigencia</label>
    </div>}
    {credentials && <div role="status" className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950"><strong>Comunicación preparada (sin envío externo).</strong> La credencial sólo se muestra una vez: cópiela ahora; no se almacena en texto claro.<div className="mt-2 grid items-start gap-3 sm:grid-cols-[1fr_auto]"><div><div className="flex gap-2"><code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1">{credentials.link}</code><Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(credentials.link)}><Copy className="h-4 w-4" />Copiar</Button></div>{credentials.shortCode && <p className="mt-2">Código temporal: <strong className="font-mono tracking-widest">{credentials.shortCode}</strong></p>}</div><div aria-label="QR del acceso temporal" className="rounded bg-white p-2"><QRCodeSVG value={new URL(credentials.link, window.location.origin).toString()} size={112} level="M" /></div></div></div>}
    {error && <p role="alert" className="mt-3 text-xs font-semibold text-red-700">{error}</p>}
    {access.canView && <div className="mt-3 divide-y rounded-md border">{items.length === 0 ? <p className="p-3 text-xs text-slate-500">Sin accesos emitidos.</p> : items.map((item) => <div key={item.accessRef} className="flex items-center gap-3 p-3 text-xs"><div className="min-w-0 flex-1"><p className="font-bold">{item.contact.displayName} · {item.purpose === "VISIT" ? "Visita" : "Mini-visita"}</p><p className="text-slate-500">{item.status} · {item.useCount}/{item.maxUses} usos · vence {new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.expiresAt))}</p><p className="mt-1 text-slate-500">Scopes: {item.scopes.join(", ")} · Último uso: {item.lastUsedAt ? new Intl.DateTimeFormat("es-DO", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.lastUsedAt)) : "Sin uso"}</p>{item.clientResponseState === "CHANGE_REQUESTED" && <p className="mt-1 font-bold text-amber-700">Cambio solicitado por cliente</p>}{item.clientResponseState === "CANCEL_REQUESTED" && <p className="mt-1 font-bold text-red-700">Cancelación solicitada por cliente</p>}</div>{access.canRevoke && item.status === "ACTIVE" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void revoke(item)}><ShieldX className="h-4 w-4" />Revocar</Button>}</div>)}</div>}
  </section>;
}
