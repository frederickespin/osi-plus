import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertCircle, ArrowLeft, Check, LoaderCircle, Plus, Search, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  CrmIcpV2Api,
  CrmIcpV2ClientError,
  type IcpAddressInput,
  type IcpChannel,
  type IcpClientProfile,
  type IcpClientSearchResult,
  type IcpCreateReceipt,
  type IcpDraft,
} from "./api";

type Props = Readonly<{
  open: boolean;
  api: Pick<CrmIcpV2Api, "searchClients" | "create">;
  canCreatePendingDestination: boolean;
  onOpenChange(open: boolean): void;
  onCommitted(receipt: IcpCreateReceipt): void;
  onUnauthorized(): void;
}>;

type Step = 1 | 2;
type ClientOverlay = "SEARCH" | "CREATE" | null;

const inputClass = "mt-1 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-[#0b5b91] focus:ring-2 focus:ring-sky-100";
const labelClass = "text-[11px] font-bold uppercase tracking-[.06em] text-slate-500";
const CHANNELS: readonly Readonly<{ value: IcpChannel; label: string }>[] = [
  { value: "WHATSAPP", label: "WhatsApp" }, { value: "CALL", label: "Llamada" },
  { value: "EMAIL", label: "Correo" }, { value: "WEB", label: "Web" },
  { value: "REFERRED", label: "Referido" }, { value: "RECOMMENDATION", label: "Recomendación" },
  { value: "INSTAGRAM", label: "Instagram" }, { value: "FACEBOOK", label: "Facebook" },
  { value: "OTHER_SOCIAL", label: "Otra red" },
];

const blankAddress = (countryCode = "DO"): IcpAddressInput => ({
  countryCode, provinceState: "", cityMunicipality: "", sector: "", streetAndNumber: "", saveForClient: false, label: "",
});

function normalizeError(cause: unknown) {
  if (!(cause instanceof CrmIcpV2ClientError)) return "Ocurrió un error inesperado. Revisa los datos e inténtalo nuevamente.";
  const copy: Record<string, string> = {
    COMMERCIAL_AUTH_REQUIRED: "La sesión terminó. Inicia sesión nuevamente.",
    COMMERCIAL_AUTH_INVALID: "La sesión ya no es válida. Inicia sesión nuevamente.",
    CRM_PIPELINE_PERMISSION_FORBIDDEN: "Tu usuario no tiene permiso para crear este ICP.",
    CRM_ICP_INPUT_INVALID: "Hay información incompleta o con un formato no válido.",
    CRM_ICP_ROUTE_INVALID: "Revisa los países y las direcciones de origen y destino.",
    CRM_ICP_CLIENT_DUPLICATE: "El cliente ya existe. Búscalo y selecciónalo.",
    CRM_ICP_PENDING_DESTINATION_FORBIDDEN: "Tu usuario no puede registrar un destino pendiente.",
    CRM_ICP_V2_API_DISABLED: "El ICP funcional no está habilitado en este entorno.",
  };
  return copy[cause.code] || "No fue posible completar el ICP. Inténtalo nuevamente.";
}

function SelectField({ label, value, onChange, children }: Readonly<{ label: string; value: string; onChange(value: string): void; children: ReactNode }>) {
  return <label className={labelClass}>{label}<select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>{children}</select></label>;
}

function TextField({ label, value, onChange, placeholder, required = false, type = "text", maxLength = 320 }: Readonly<{
  label: string; value: string; onChange(value: string): void; placeholder: string; required?: boolean; type?: string; maxLength?: number;
}>) {
  return <label className={labelClass}>{label}{required ? " *" : ""}<input className={inputClass} type={type} value={value} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;
}

function AddressFields({ title, value, onChange, required }: Readonly<{ title: string; value: IcpAddressInput; onChange(value: IcpAddressInput): void; required: boolean }>) {
  const update = <K extends keyof IcpAddressInput>(key: K, next: IcpAddressInput[K]) => onChange({ ...value, [key]: next });
  return <fieldset className="rounded-lg border border-slate-200 p-3">
    <legend className="px-1 text-sm font-black text-[#003366]">{title}{required ? " *" : ""}</legend>
    <div className="grid gap-2 sm:grid-cols-2">
      <TextField label="País (ISO)" value={value.countryCode} onChange={(next) => update("countryCode", next.toUpperCase())} placeholder="DO" required maxLength={2} />
      <TextField label="Provincia / estado" value={value.provinceState} onChange={(next) => update("provinceState", next)} placeholder="Provincia o estado" required={value.countryCode === "DO"} maxLength={160} />
      <TextField label="Ciudad / municipio" value={value.cityMunicipality} onChange={(next) => update("cityMunicipality", next)} placeholder="Ciudad / municipio" required maxLength={160} />
      <TextField label="Sector" value={value.sector} onChange={(next) => update("sector", next)} placeholder="Sector" maxLength={160} />
      <div className="sm:col-span-2"><TextField label="Dirección" value={value.streetAndNumber} onChange={(next) => update("streetAndNumber", next)} placeholder="Calle, edificio y referencia" required={value.countryCode === "DO"} maxLength={240} /></div>
    </div>
  </fieldset>;
}

function ClientOverlayDialog({ value, api, selected, onSelect, onStartInline, onSaveInline, onClose, onUnauthorized }: Readonly<{
  value: ClientOverlay; api: Pick<CrmIcpV2Api, "searchClients">; selected: IcpClientSearchResult | null;
  onSelect(value: IcpClientSearchResult): void; onStartInline(): void;
  onSaveInline(value: { displayName: string; phone: string; email: string }): void;
  onClose(): void; onUnauthorized(): void;
}>) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly IcpClientSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [inline, setInline] = useState({ displayName: "", phone: "", email: "" });
  useEffect(() => {
    if (value !== "SEARCH" || query.trim().length < 2) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true); setError("");
      void api.searchClients(query, controller.signal).then((result) => setResults(result.data)).catch((cause) => {
        if (controller.signal.aborted) return;
        if (cause instanceof CrmIcpV2ClientError && cause.status === 401) onUnauthorized();
        setError(normalizeError(cause));
      }).finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [api, onUnauthorized, query, value]);
  if (!value) return null;
  const visibleResults = query.trim().length >= 2 ? results : [];
  const inlineValid = inline.displayName.trim().length >= 2 && /^\+[1-9][0-9\s()-]{7,20}$/.test(inline.phone.trim());
  return <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/55 p-3">
    <section role="dialog" aria-modal="true" aria-labelledby="client-overlay-title" className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-4 shadow-2xl">
      <header className="flex items-center justify-between gap-3"><h2 id="client-overlay-title" className="text-xl font-black text-[#003366]">{value === "SEARCH" ? "Seleccionar cliente" : "Crear cliente inline"}</h2><button type="button" aria-label="Cerrar selección de cliente" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={onClose}><X className="h-4 w-4" /></button></header>
      {value === "SEARCH" ? <>
        <div className="mt-4 flex gap-2"><input autoFocus aria-label="Buscar cliente" className={inputClass} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, teléfono o correo" /><Button type="button" variant="outline" className="mt-1" onClick={onStartInline}><Plus />Crear</Button></div>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-dashed border-slate-200">
          {searching ? <p className="px-4 py-8 text-center text-sm text-slate-500">Buscando clientes…</p> : visibleResults.length === 0 ? <p className="px-4 py-8 text-center text-sm text-slate-500">{query.trim().length < 2 ? "Escribe al menos dos caracteres." : "No encontramos clientes con ese criterio."}</p> : visibleResults.map((item) => <button key={item.clientRef} type="button" className={`block w-full border-b px-4 py-3 text-left last:border-0 hover:bg-sky-50 ${selected?.clientRef === item.clientRef ? "bg-sky-50" : ""}`} onClick={() => onSelect(item)}><strong className="block text-sm text-[#003366]">{item.displayName}</strong><span className="mt-1 block text-xs text-slate-500">{[item.matchHints.phone, item.matchHints.email].filter(Boolean).join(" · ")}</span></button>)}
        </div>
      </> : <>
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="sm:col-span-2"><TextField label="Nombre / razón social" value={inline.displayName} onChange={(next) => setInline({ ...inline, displayName: next })} placeholder="Nombre del cliente" required maxLength={200} /></div><TextField label="Teléfono" value={inline.phone} onChange={(next) => setInline({ ...inline, phone: next })} placeholder="+1 809…" required type="tel" maxLength={40} /><TextField label="Correo" value={inline.email} onChange={(next) => setInline({ ...inline, email: next })} placeholder="cliente@correo.com" type="email" /></div>
        <footer className="mt-5 flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancelar</Button><Button type="button" disabled={!inlineValid} onClick={() => onSaveInline(inline)}>Guardar cliente</Button></footer>
      </>}
    </section>
  </div>;
}

export default function IcpIntakeForm({ open, api, canCreatePendingDestination, onOpenChange, onCommitted, onUnauthorized }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [overlay, setOverlay] = useState<ClientOverlay>(null);
  const [selected, setSelected] = useState<IcpClientSearchResult | null>(null);
  const [inline, setInline] = useState<{ displayName: string; phone: string; email: string } | null>(null);
  const [profile, setProfile] = useState<IcpClientProfile>("INDIVIDUAL");
  const [contact, setContact] = useState({ displayName: "", phone: "", email: "" });
  const [channel, setChannel] = useState<IcpChannel>("WHATSAPP");
  const [origin, setOrigin] = useState(() => blankAddress());
  const [destination, setDestination] = useState(() => blankAddress());
  const [destinationStatus, setDestinationStatus] = useState<"CONFIRMED" | "APPROXIMATE" | "PENDING">("CONFIRMED");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef<string | null>(null);

  const phoneValid = (value: string) => /^\+[1-9][0-9\s()-]{7,20}$/.test(value.trim());
  const addressValid = (value: IcpAddressInput) => /^[A-Z]{2}$/.test(value.countryCode) && value.cityMunicipality.trim().length >= 2
    && (value.countryCode !== "DO" || (value.provinceState.trim().length >= 2 && value.streetAndNumber.trim().length >= 2));
  const stepOneValid = Boolean(selected || inline) && contact.displayName.trim().length >= 2 && phoneValid(contact.phone);
  const routeCountriesValid = destinationStatus === "PENDING" ? origin.countryCode === "DO" : origin.countryCode === "DO" || destination.countryCode === "DO";
  const stepTwoValid = addressValid(origin) && (destinationStatus === "PENDING" || addressValid(destination)) && routeCountriesValid;

  const reset = () => {
    setStep(1); setOverlay(null); setSelected(null); setInline(null); setProfile("INDIVIDUAL");
    setContact({ displayName: "", phone: "", email: "" }); setChannel("WHATSAPP");
    setOrigin(blankAddress()); setDestination(blankAddress()); setDestinationStatus("CONFIRMED"); setNotes(""); setError(""); requestId.current = null;
  };
  const close = () => { if (!saving) { reset(); onOpenChange(false); } };
  const submit = async () => {
    if (!stepTwoValid || (!selected && !inline)) return;
    setSaving(true); setError("");
    try {
      requestId.current ||= crypto.randomUUID();
      const draft: IcpDraft = {
        client: selected ? { kind: "EXISTING", clientRef: selected.clientRef } : { kind: "INLINE", ...inline! },
        clientProfileType: profile, caseContact: contact, intakeChannel: channel, requirementNotes: notes,
        destinationStatus, origin, destination,
      };
      const receipt = await api.create(draft, requestId.current);
      reset(); onCommitted(receipt); onOpenChange(false);
    } catch (cause) {
      if (cause instanceof CrmIcpV2ClientError && cause.status === 401) onUnauthorized();
      setError(normalizeError(cause));
    } finally { setSaving(false); }
  };

  return <>
    <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogContent className="max-h-[94vh] overflow-y-auto p-0 sm:max-w-4xl" data-testid="crm-icp-v2-intake-form">
        <DialogHeader className="border-b border-slate-200 px-4 py-3 text-left"><DialogTitle className="text-xl font-black text-[#003366]">Nuevo Caso (ICP mínimo)</DialogTitle><DialogDescription>Captura comercial inicial, precisa y rápida.</DialogDescription></DialogHeader>
        <div role="tablist" aria-label="Pasos del ICP" className="grid gap-2 px-4 pt-3 sm:grid-cols-2"><button type="button" role="tab" aria-selected={step === 1} onClick={() => setStep(1)} className={`rounded-lg border px-3 py-2 text-left text-sm ${step === 1 ? "border-[#0b5b91] bg-sky-50 font-bold text-[#003366]" : "border-slate-200 text-slate-500"}`}>Paso 1 · Definición rápida</button><button type="button" role="tab" aria-selected={step === 2} disabled={!stepOneValid} onClick={() => setStep(2)} className={`rounded-lg border px-3 py-2 text-left text-sm disabled:opacity-50 ${step === 2 ? "border-[#0b5b91] bg-sky-50 font-bold text-[#003366]" : "border-slate-200 text-slate-500"}`}>Paso 2 · Origen, destino y notas</button></div>
        <div className="p-4">
          {error && <Alert variant="destructive" className="mb-4"><AlertCircle /><AlertTitle>No fue posible crear el ICP</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
          {step === 1 ? <div role="tabpanel" className="grid gap-3 sm:grid-cols-12">
            <div className="sm:col-span-6"><span className={labelClass}>Cliente *</span><div className="mt-1 flex min-h-16 flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2"><div className="min-w-40 flex-1"><strong className="block text-sm text-slate-900">{selected?.displayName || inline?.displayName || "Seleccionar cliente"}</strong><span className="text-xs text-slate-500">{selected ? "Cliente existente" : inline ? "Cliente nuevo" : "Busca uno existente o créalo inline"}</span></div><Button type="button" size="sm" variant="outline" onClick={() => setOverlay("SEARCH")}><Search />Buscar</Button><Button type="button" size="sm" variant="outline" onClick={() => setOverlay("CREATE")}><Plus />Nuevo</Button></div></div>
            <div className="sm:col-span-6"><TextField label="Contacto del caso" value={contact.displayName} onChange={(next) => setContact({ ...contact, displayName: next })} placeholder="Nombre de la persona de contacto" required maxLength={160} /></div>
            <div className="sm:col-span-4"><SelectField label="Tipo de cliente *" value={profile} onChange={(next) => setProfile(next as IcpClientProfile)}><option value="INDIVIDUAL">Individual</option><option value="CORPORATE">Corporativo</option><option value="DIPLOMATIC">Diplomático</option><option value="COMMERCIAL">Comercial</option><option value="LEAD_ACCOUNT">Cuenta prospecto</option></SelectField></div>
            <div className="sm:col-span-4"><TextField label="Teléfono / WhatsApp" value={contact.phone} onChange={(next) => setContact({ ...contact, phone: next })} placeholder="+1 809…" required type="tel" maxLength={40} /></div>
            <div className="sm:col-span-4"><TextField label="Correo" value={contact.email} onChange={(next) => setContact({ ...contact, email: next })} placeholder="cliente@correo.com" type="email" /></div>
            <div className="sm:col-span-4"><SelectField label="Canal *" value={channel} onChange={(next) => setChannel(next as IcpChannel)}>{CHANNELS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</SelectField></div>
          </div> : <div role="tabpanel" className="grid gap-3 sm:grid-cols-2">
            <AddressFields title="Origen" value={origin} onChange={setOrigin} required />
            <div className="space-y-3"><SelectField label="Estado del destino" value={destinationStatus} onChange={(next) => setDestinationStatus(next as typeof destinationStatus)}><option value="CONFIRMED">Confirmado</option><option value="APPROXIMATE">Aproximado</option>{canCreatePendingDestination && <option value="PENDING">Pendiente</option>}</SelectField>{destinationStatus !== "PENDING" && <AddressFields title="Destino" value={destination} onChange={setDestination} required />}</div>
            <label className={`${labelClass} sm:col-span-2`}>Notas del requerimiento<textarea aria-label="Notas del requerimiento" className="mt-1 min-h-24 w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-[#0b5b91] focus:ring-2 focus:ring-sky-100" value={notes} maxLength={2000} onChange={(event) => setNotes(event.target.value)} placeholder="Particularidades, fechas deseadas, restricciones, tipo de bienes o cualquier requerimiento expresado por el cliente" /></label>
          </div>}
        </div>
        <DialogFooter className="flex-row items-center justify-between border-t border-slate-200 px-4 py-3"><span className="hidden text-xs text-slate-500 sm:block">ICP inicial · captura comercial mínima</span><div className="ml-auto flex gap-2"><Button type="button" variant="outline" disabled={saving} onClick={step === 1 ? close : () => setStep(1)}>{step === 2 && <ArrowLeft />}{step === 1 ? "Cancelar" : "Anterior"}</Button>{step === 1 ? <Button type="button" disabled={!stepOneValid} onClick={() => setStep(2)}>Continuar</Button> : <Button type="button" disabled={!stepTwoValid || saving} onClick={() => void submit()}>{saving ? <LoaderCircle className="animate-spin" /> : <Check />}{saving ? "Creando caso…" : "Crear caso"}</Button>}</div></DialogFooter>
        <ClientOverlayDialog value={overlay} api={api} selected={selected} onSelect={(item) => { setSelected(item); setInline(null); setOverlay(null); }} onStartInline={() => setOverlay("CREATE")} onSaveInline={(item) => { setInline(item); setSelected(null); setOverlay(null); }} onClose={() => setOverlay(null)} onUnauthorized={onUnauthorized} />
      </DialogContent>
    </Dialog>
  </>;
}
