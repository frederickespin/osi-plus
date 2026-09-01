import { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, Check, LoaderCircle, MapPin, Plus, Search, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  CrmIcpV2Api,
  CrmIcpV2ClientError,
  type IcpAddressInput,
  type IcpChannel,
  type IcpClientProfile,
  type IcpClientSearchResult,
  type IcpCreateReceipt,
  type IcpDraft,
  type IcpMode,
  type IcpSurveyMethod,
} from "./api";

type Props = Readonly<{
  open: boolean;
  api: Pick<CrmIcpV2Api, "searchClients" | "create">;
  canCreatePendingDestination: boolean;
  onOpenChange(open: boolean): void;
  onCommitted(receipt: IcpCreateReceipt): void;
}>;

type ClientKind = "EXISTING" | "INLINE";
type Step = 1 | 2 | 3;

const blankAddress = (countryCode = "DO"): IcpAddressInput => ({
  countryCode,
  provinceState: "",
  cityMunicipality: "",
  streetAndNumber: "",
  saveForClient: false,
  label: "",
});

const STEPS = ["Cliente", "Servicio", "Ruta"] as const;
const CHANNELS: readonly Readonly<{ value: IcpChannel; label: string }>[] = [
  { value: "WHATSAPP", label: "WhatsApp" }, { value: "CALL", label: "Llamada" },
  { value: "EMAIL", label: "Correo" }, { value: "WEB", label: "Web" },
  { value: "REFERRED", label: "Referido" }, { value: "RECOMMENDATION", label: "Recomendación" },
  { value: "INSTAGRAM", label: "Instagram" }, { value: "FACEBOOK", label: "Facebook" },
  { value: "YOUTUBE", label: "YouTube" }, { value: "PROMOTION", label: "Promoción" },
  { value: "OTHER_SOCIAL", label: "Otra red" },
];

const inputClass = "mt-1";
const selectClass = "mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm";

function normalizeError(cause: unknown) {
  if (!(cause instanceof CrmIcpV2ClientError)) return { title: "No fue posible completar el ICP", detail: "Ocurrió un error inesperado. Revisa los datos e inténtalo nuevamente." };
  const copy: Record<string, string> = {
    CRM_ICP_INPUT_INVALID: "Hay datos incompletos o con un formato no válido.",
    CRM_ICP_ROUTE_INVALID: "La ruta no cumple las reglas del modo de servicio seleccionado.",
    CRM_ICP_SURVEY_INVALID: "Selecciona un método de Survey válido.",
    CRM_ICP_CLIENT_DUPLICATE: "Ya existe un cliente con esta identificación o combinación de contacto. Búscalo y selecciónalo.",
    CRM_ICP_PENDING_DESTINATION_FORBIDDEN: "Tu acceso no permite registrar un destino pendiente.",
    CRM_PIPELINE_PERMISSION_FORBIDDEN: "Tu sesión no tiene permiso para crear este ICP.",
    CRM_ICP_V2_API_DISABLED: "El API del ICP permanece desactivado en este entorno.",
  };
  return { title: "No fue posible completar el ICP", detail: copy[cause.code] || cause.code };
}

function AddressFields({ title, value, onChange, domesticRequired = false }: {
  title: string;
  value: IcpAddressInput;
  onChange(value: IcpAddressInput): void;
  domesticRequired?: boolean;
}) {
  const update = <K extends keyof IcpAddressInput>(key: K, next: IcpAddressInput[K]) => onChange({ ...value, [key]: next });
  return <fieldset className="rounded-xl border border-slate-200 bg-white p-4">
    <legend className="px-1 text-sm font-black text-[#003366]">{title}</legend>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-semibold text-slate-700">País (ISO)<Input aria-label={`${title} país`} className={inputClass} maxLength={2} value={value.countryCode} onChange={(event) => update("countryCode", event.target.value.toUpperCase())} placeholder="DO" /></label>
      <label className="text-xs font-semibold text-slate-700">Provincia / Estado{domesticRequired && " *"}<Input aria-label={`${title} provincia`} className={inputClass} maxLength={160} value={value.provinceState} onChange={(event) => update("provinceState", event.target.value)} /></label>
      <label className="text-xs font-semibold text-slate-700">Ciudad / Municipio *<Input aria-label={`${title} ciudad`} className={inputClass} maxLength={160} value={value.cityMunicipality} onChange={(event) => update("cityMunicipality", event.target.value)} /></label>
      <label className="text-xs font-semibold text-slate-700">Calle y número{domesticRequired && " *"}<Input aria-label={`${title} calle`} className={inputClass} maxLength={240} value={value.streetAndNumber} onChange={(event) => update("streetAndNumber", event.target.value)} /></label>
      <label className="text-xs font-semibold text-slate-700 sm:col-span-2">Nombre de la dirección (opcional)<Input aria-label={`${title} etiqueta`} className={inputClass} maxLength={80} value={value.label} onChange={(event) => update("label", event.target.value)} placeholder="Casa, oficina, almacén…" /></label>
      <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 sm:col-span-2"><input type="checkbox" checked={value.saveForClient} onChange={(event) => update("saveForClient", event.target.checked)} />Guardar esta dirección en el cliente</label>
    </div>
  </fieldset>;
}

function ClientStep({ kind, setKind, query, setQuery, results, searching, selected, setSelected, inline, setInline, profile, setProfile, contact, setContact }: {
  kind: ClientKind; setKind(value: ClientKind): void; query: string; setQuery(value: string): void;
  results: readonly IcpClientSearchResult[]; searching: boolean; selected: IcpClientSearchResult | null; setSelected(value: IcpClientSearchResult | null): void;
  inline: { displayName: string; taxId: string; phone: string; email: string }; setInline(value: { displayName: string; taxId: string; phone: string; email: string }): void;
  profile: IcpClientProfile; setProfile(value: IcpClientProfile): void;
  contact: { displayName: string; phone: string; email: string }; setContact(value: { displayName: string; phone: string; email: string }): void;
}) {
  return <div className="space-y-5">
    <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-1" role="group" aria-label="Origen del cliente">
      <button type="button" onClick={() => setKind("EXISTING")} className={`rounded-md px-3 py-2 text-sm font-bold ${kind === "EXISTING" ? "bg-white text-[#003366] shadow-sm" : "text-slate-500"}`}>Cliente existente</button>
      <button type="button" onClick={() => setKind("INLINE")} className={`rounded-md px-3 py-2 text-sm font-bold ${kind === "INLINE" ? "bg-white text-[#003366] shadow-sm" : "text-slate-500"}`}>Cliente nuevo</button>
    </div>
    {kind === "EXISTING" ? <section>
      <label className="text-xs font-semibold text-slate-700">Buscar por nombre, RNC, teléfono o correo<span className="relative mt-1 block"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input className="pl-9" value={query} onChange={(event) => { setQuery(event.target.value); setSelected(null); }} placeholder="Escribe al menos 2 caracteres" /></span></label>
      <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-slate-200" aria-live="polite">
        {searching && <p className="p-3 text-xs text-slate-500">Buscando en el tenant…</p>}
        {!searching && query.trim().length >= 2 && results.length === 0 && <p className="p-3 text-xs text-slate-500">No se encontraron coincidencias. Puedes crear un cliente nuevo.</p>}
        {results.map((client) => <button key={client.clientRef} type="button" onClick={() => setSelected(client)} className={`flex w-full items-start justify-between gap-3 border-b p-3 text-left last:border-b-0 ${selected?.clientRef === client.clientRef ? "bg-sky-50" : "hover:bg-slate-50"}`}>
          <span><strong className="block text-sm text-slate-900">{client.displayName}</strong><small className="text-slate-500">{[client.matchHints.taxId, client.matchHints.phone, client.matchHints.email].filter(Boolean).join(" · ") || "Datos protegidos"}</small></span>
          <Badge variant="outline">{client.type}</Badge>
        </button>)}
      </div>
    </section> : <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-semibold text-slate-700 sm:col-span-2">Nombre o razón social *<Input className={inputClass} value={inline.displayName} maxLength={200} onChange={(event) => setInline({ ...inline, displayName: event.target.value })} /></label>
      <label className="text-xs font-semibold text-slate-700">RNC / identificación<Input className={inputClass} value={inline.taxId} maxLength={48} onChange={(event) => setInline({ ...inline, taxId: event.target.value })} /></label>
      <label className="text-xs font-semibold text-slate-700">Perfil<select className={selectClass} value={profile} onChange={(event) => setProfile(event.target.value as IcpClientProfile)}><option value="INDIVIDUAL">Individual</option><option value="CORPORATE">Corporativo</option><option value="LEAD_ACCOUNT">Cuenta prospecto</option><option value="COMMERCIAL">Comercial</option><option value="DIPLOMATIC">Diplomático</option></select></label>
      <label className="text-xs font-semibold text-slate-700">Teléfono *<Input className={inputClass} type="tel" value={inline.phone} maxLength={40} onChange={(event) => setInline({ ...inline, phone: event.target.value })} placeholder="+1 809 555 0000" /></label>
      <label className="text-xs font-semibold text-slate-700">Correo<Input className={inputClass} type="email" value={inline.email} maxLength={320} onChange={(event) => setInline({ ...inline, email: event.target.value })} /></label>
    </div>}
    {kind === "EXISTING" && <label className="block text-xs font-semibold text-slate-700">Perfil del cliente<select className={selectClass} value={profile} onChange={(event) => setProfile(event.target.value as IcpClientProfile)}><option value="INDIVIDUAL">Individual</option><option value="CORPORATE">Corporativo</option><option value="LEAD_ACCOUNT">Cuenta prospecto</option><option value="COMMERCIAL">Comercial</option><option value="DIPLOMATIC">Diplomático</option></select></label>}
    <fieldset className="rounded-xl border border-slate-200 p-4"><legend className="px-1 text-sm font-black text-[#003366]">Contacto principal del caso</legend><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-700 sm:col-span-2">Nombre *<Input className={inputClass} value={contact.displayName} maxLength={160} onChange={(event) => setContact({ ...contact, displayName: event.target.value })} /></label><label className="text-xs font-semibold text-slate-700">Teléfono / WhatsApp *<Input className={inputClass} type="tel" value={contact.phone} maxLength={40} onChange={(event) => setContact({ ...contact, phone: event.target.value })} placeholder="+1 809 555 0000" /></label><label className="text-xs font-semibold text-slate-700">Correo<Input className={inputClass} type="email" value={contact.email} maxLength={320} onChange={(event) => setContact({ ...contact, email: event.target.value })} /></label></div></fieldset>
  </div>;
}

export default function IcpIntakeForm({ open, api, canCreatePendingDestination, onOpenChange, onCommitted }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [kind, setKind] = useState<ClientKind>("EXISTING");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly IcpClientSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<IcpClientSearchResult | null>(null);
  const [inline, setInline] = useState({ displayName: "", taxId: "", phone: "", email: "" });
  const [profile, setProfile] = useState<IcpClientProfile>("INDIVIDUAL");
  const [contact, setContact] = useState({ displayName: "", phone: "", email: "" });
  const [mode, setMode] = useState<IcpMode>("LOCAL");
  const [serviceType, setServiceType] = useState("Mudanza residencial");
  const [channel, setChannel] = useState<IcpChannel>("WHATSAPP");
  const [requiresSurvey, setRequiresSurvey] = useState(true);
  const [surveyMethod, setSurveyMethod] = useState<IcpSurveyMethod>("PRESENCIAL");
  const [destinationStatus, setDestinationStatus] = useState<"CONFIRMED" | "APPROXIMATE" | "PENDING">("CONFIRMED");
  const [origin, setOrigin] = useState<IcpAddressInput>(() => blankAddress());
  const [destination, setDestination] = useState<IcpAddressInput>(() => blankAddress());
  const [stops, setStops] = useState<readonly IcpAddressInput[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);
  const [duplicateFingerprint, setDuplicateFingerprint] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);

  useEffect(() => {
    if (!open || kind !== "EXISTING" || query.trim().length < 2) { setResults([]); return undefined; }
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => {
      setSearching(true);
      void api.searchClients(query, controller.signal).then((value) => setResults(value.data)).catch((cause) => { if (!controller.signal.aborted) setError(normalizeError(cause)); }).finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 300);
    return () => { globalThis.clearTimeout(timer); controller.abort(); };
  }, [api, kind, open, query]);

  useEffect(() => {
    if (!open) return;
    setStep(1); setError(null); setDuplicateFingerprint(null); requestId.current = null;
  }, [open]);

  useEffect(() => {
    if (mode !== "LOCAL" && destinationStatus === "PENDING") setDestinationStatus("CONFIRMED");
  }, [destinationStatus, mode]);

  const phoneValid = (value: string) => /^\+[1-9][0-9\s().-]{7,20}$/.test(value.trim());
  const emailValid = (value: string) => !value.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  const clientValid = kind === "EXISTING" ? Boolean(selected) : inline.displayName.trim().length >= 2 && phoneValid(inline.phone) && emailValid(inline.email);
  const contactValid = contact.displayName.trim().length >= 2 && phoneValid(contact.phone) && emailValid(contact.email);
  const serviceValid = serviceType.trim().length >= 2 && (requiresSurvey ? surveyMethod !== "NO_APLICA" : surveyMethod === "NO_APLICA");
  const domestic = (address: IcpAddressInput) => address.countryCode.trim().toUpperCase() === "DO" && address.provinceState.trim() && address.cityMunicipality.trim() && address.streetAndNumber.trim();
  const international = (address: IcpAddressInput) => /^[A-Z]{2}$/.test(address.countryCode.trim().toUpperCase()) && address.cityMunicipality.trim();
  const routeValid = mode === "LOCAL"
    ? Boolean(domestic(origin) && (destinationStatus === "PENDING" || domestic(destination)))
    : mode === "EXPORT"
      ? Boolean(domestic(origin) && destinationStatus !== "PENDING" && international(destination))
      : Boolean(international(origin) && destinationStatus !== "PENDING" && domestic(destination));
  const stopsValid = stops.every((item) => domestic(item));
  const currentValid = step === 1 ? clientValid && contactValid : step === 2 ? serviceValid : routeValid && stopsValid;

  const buildDraft = (fingerprint: string | null): IcpDraft => ({
    client: kind === "EXISTING"
      ? { kind: "EXISTING", clientRef: selected!.clientRef }
      : { kind: "INLINE", ...inline, duplicateFingerprint: fingerprint },
    clientProfileType: profile,
    caseContact: contact,
    mode,
    serviceType,
    intakeChannel: channel,
    requiresSurvey,
    surveyMethod,
    destinationStatus,
    origin,
    destination,
    additionalStops: stops,
  });

  const submit = async (fingerprint: string | null = duplicateFingerprint) => {
    if (!currentValid || saving) return;
    setSaving(true); setError(null);
    try {
      requestId.current ||= crypto.randomUUID();
      const receipt = await api.create(buildDraft(fingerprint), requestId.current);
      requestId.current = null;
      onCommitted(receipt);
      onOpenChange(false);
    } catch (cause) {
      if (cause instanceof CrmIcpV2ClientError && cause.code === "CRM_ICP_CLIENT_DUPLICATE_CONFIRMATION_REQUIRED" && cause.matchFingerprint) {
        setDuplicateFingerprint(cause.matchFingerprint);
        setError({ title: "Posible cliente duplicado", detail: "Encontramos una coincidencia parcial. Confirma que revisaste los datos antes de crear un cliente separado." });
      } else setError(normalizeError(cause));
    } finally { setSaving(false); }
  };

  return <Dialog open={open} onOpenChange={(value) => { if (!saving) onOpenChange(value); }}>
    <DialogContent className="max-h-[94vh] overflow-y-auto p-0 sm:max-w-4xl" data-testid="crm-icp-v2-intake-form">
      <DialogHeader className="border-b border-slate-200 px-6 py-5 text-left">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-[#0070a8]">ICP v2 · Captura inicial</p><DialogTitle className="mt-1 text-2xl font-black text-[#003366]">Nuevo caso comercial</DialogTitle><DialogDescription className="mt-1">Registra identidad, servicio y ruta. El volumen se determina después del ICP.</DialogDescription></div><Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">Volumen pendiente</Badge></div>
        <ol className="mt-5 grid grid-cols-3 gap-2" aria-label="Progreso del ICP">{STEPS.map((label, index) => { const number = index + 1; const active = number === step; const done = number < step; return <li key={label} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold ${active ? "border-sky-400 bg-sky-50 text-[#003366]" : done ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-500"}`}><span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] ${active ? "bg-[#0079b8] text-white" : done ? "bg-emerald-600 text-white" : "bg-slate-200"}`}>{done ? <Check className="h-3 w-3" /> : number}</span>{label}</li>; })}</ol>
      </DialogHeader>
      <div className="px-6 py-5">
        {error && <Alert variant={duplicateFingerprint ? "default" : "destructive"} className="mb-5"><AlertCircle /><AlertTitle>{error.title}</AlertTitle><AlertDescription>{error.detail}{duplicateFingerprint && <Button type="button" className="mt-3 block" size="sm" onClick={() => void submit(duplicateFingerprint)}>Confirmar y crear separado</Button>}</AlertDescription></Alert>}
        {step === 1 && <ClientStep kind={kind} setKind={setKind} query={query} setQuery={setQuery} results={results} searching={searching} selected={selected} setSelected={setSelected} inline={inline} setInline={setInline} profile={profile} setProfile={setProfile} contact={contact} setContact={setContact} />}
        {step === 2 && <div className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-700">Modalidad<select className={selectClass} value={mode} onChange={(event) => setMode(event.target.value as IcpMode)}><option value="LOCAL">Local / Nacional</option><option value="EXPORT">Exportación</option><option value="IMPORT">Importación</option></select></label><label className="text-xs font-semibold text-slate-700">Canal de entrada<select className={selectClass} value={channel} onChange={(event) => setChannel(event.target.value as IcpChannel)}>{CHANNELS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className="text-xs font-semibold text-slate-700 sm:col-span-2">Tipo de servicio<Input className={inputClass} value={serviceType} maxLength={80} onChange={(event) => setServiceType(event.target.value)} /></label></div><fieldset className="rounded-xl border border-slate-200 p-4"><legend className="px-1 text-sm font-black text-[#003366]">Survey</legend><label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={requiresSurvey} onChange={(event) => { const checked = event.target.checked; setRequiresSurvey(checked); setSurveyMethod(checked ? "PRESENCIAL" : "NO_APLICA"); }} />Este caso requiere Survey</label>{requiresSurvey && <label className="mt-4 block text-xs font-semibold text-slate-700">Método previsto<select className={selectClass} value={surveyMethod} onChange={(event) => setSurveyMethod(event.target.value as IcpSurveyMethod)}><option value="PRESENCIAL">Presencial</option><option value="VIRTUAL">Virtual</option><option value="LISTADO_FOTOS">Listado / Fotos</option></select></label>}</fieldset><Alert className="border-sky-200 bg-sky-50 text-[#003366]"><MapPin /><AlertTitle>El ICP no calcula volumen</AlertTitle><AlertDescription>No se solicita CBM en esta etapa. El volumen seguirá pendiente hasta recibir un Survey o datos proporcionados con procedencia.</AlertDescription></Alert></div>}
        {step === 3 && <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-700">Estado del destino<select className={selectClass} value={destinationStatus} onChange={(event) => setDestinationStatus(event.target.value as typeof destinationStatus)}><option value="CONFIRMED">Confirmado</option><option value="APPROXIMATE">Aproximado</option>{mode === "LOCAL" && canCreatePendingDestination && <option value="PENDING">Pendiente</option>}</select></label><div className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">{mode === "LOCAL" ? "Origen y destino deben estar en República Dominicana." : mode === "EXPORT" ? "El origen debe estar en RD y el destino fuera o dentro del país según el servicio." : "El destino debe estar en RD; el origen puede ser internacional."}</div></div><AddressFields title="Origen" value={origin} onChange={setOrigin} domesticRequired={mode !== "IMPORT"} />{destinationStatus !== "PENDING" && <AddressFields title="Destino" value={destination} onChange={setDestination} domesticRequired={mode !== "EXPORT"} />}<section className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-black text-[#003366]">Paradas adicionales</h3><p className="text-xs text-slate-500">Opcional · máximo 8</p></div><Button type="button" size="sm" variant="outline" disabled={stops.length >= 8} onClick={() => setStops((current) => [...current, blankAddress()])}><Plus />Añadir parada</Button></div><div className="mt-3 space-y-3">{stops.map((stop, index) => <div key={index} className="relative"><AddressFields title={`Parada ${index + 1}`} value={stop} domesticRequired onChange={(value) => setStops((current) => current.map((item, itemIndex) => itemIndex === index ? value : item))} /><Button type="button" aria-label={`Eliminar parada ${index + 1}`} size="icon" variant="ghost" className="absolute right-2 top-0 text-red-600" onClick={() => setStops((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 /></Button></div>)}{stops.length === 0 && <p className="py-3 text-center text-xs text-slate-500">Sin paradas adicionales.</p>}</div></section></div>}
      </div>
      <DialogFooter className="border-t border-slate-200 bg-slate-50 px-6 py-4 sm:justify-between"><Button type="button" variant="ghost" disabled={saving} onClick={() => step === 1 ? onOpenChange(false) : setStep((step - 1) as Step)}>{step > 1 && <ArrowLeft />}{step === 1 ? "Cancelar" : "Anterior"}</Button>{step < 3 ? <Button type="button" disabled={!currentValid} onClick={() => { setError(null); setStep((step + 1) as Step); }}>Continuar<ArrowRight /></Button> : <Button type="button" disabled={!currentValid || saving} onClick={() => void submit()}>{saving ? <LoaderCircle className="animate-spin" /> : <Check />}{saving ? "Creando caso…" : "Crear ICP"}</Button>}</DialogFooter>
    </DialogContent>
  </Dialog>;
}
