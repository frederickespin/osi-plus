import { useEffect, useMemo, useState } from "react";
import { AlertCircle, LoaderCircle, Search } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  CrmCaseMutationApi,
  CrmCaseMutationClientError,
  type CrmCaseFields,
  type CrmClientOption,
  type CrmMutationReceipt,
} from "@/crm-relational/mutationApi";

type Props = Readonly<{
  open: boolean;
  mode: "CREATE" | "UPDATE";
  api: CrmCaseMutationApi;
  caseRef?: string;
  expectedVersion?: number;
  initial?: CrmCaseFields;
  initialClient?: CrmClientOption;
  onOpenChange(open: boolean): void;
  onCommitted(receipt: CrmMutationReceipt): void;
}>;

const EMPTY: CrmCaseFields = Object.freeze({
  clientRef: null, mode: "LOCAL", serviceType: "Mudanza local", customerType: "L4_PERSONAL",
  estimatedCbm: 0, requiresSurvey: false, surveyMethod: "NO_APLICA",
  originLocation: "", destinationLocation: "", destinationContracted: true,
});

function copy(value: CrmCaseFields): CrmCaseFields { return { ...value }; }

export default function CommercialCaseForm({ open, mode, api, caseRef, expectedVersion, initial, initialClient, onOpenChange, onCommitted }: Props) {
  const [fields, setFields] = useState<CrmCaseFields>(() => copy(initial || EMPTY));
  const [clients, setClients] = useState<readonly CrmClientOption[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [clientPage, setClientPage] = useState(1);
  const [clientTotal, setClientTotal] = useState(0);
  const [loadingClients, setLoadingClients] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = useMemo(() => fields.serviceType.trim().length > 0
    && fields.originLocation.trim().length > 0
    && fields.destinationLocation.trim().length > 0
    && Number.isFinite(fields.estimatedCbm) && fields.estimatedCbm >= 0, [fields]);
  const selectableClients = useMemo(() => initialClient && !clients.some((client) => client.clientRef === initialClient.clientRef)
    ? [initialClient, ...clients]
    : clients, [clients, initialClient]);

  useEffect(() => {
    if (!open) return;
    setFields(copy(initial || EMPTY));
    setError(null);
  }, [initial, open]);

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoadingClients(true);
      void api.clients(clientSearch.trim(), clientPage)
        .then((result) => { if (!controller.signal.aborted) { setClients(result.data); setClientTotal(result.total); } })
        .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof CrmCaseMutationClientError ? cause.code : "CRM_CLIENT_OPTIONS_FAILED"); })
        .finally(() => { if (!controller.signal.aborted) setLoadingClients(false); });
    }, 250);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [api, clientPage, clientSearch, open]);

  const update = <K extends keyof CrmCaseFields>(key: K, value: CrmCaseFields[K]) => setFields((current) => ({ ...current, [key]: value }));
  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true); setError(null);
    try {
      const receipt = mode === "CREATE"
        ? await api.create(fields)
        : await api.update(caseRef!, expectedVersion!, fields);
      onCommitted(receipt);
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof CrmCaseMutationClientError ? cause.code : "CRM_PIPELINE_REQUEST_FAILED");
    } finally { setSaving(false); }
  };

  return <Dialog open={open} onOpenChange={(value) => { if (!saving) onOpenChange(value); }}>
    <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl" data-testid={`commercial-case-${mode.toLowerCase()}-form`}>
      <DialogHeader><DialogTitle>{mode === "CREATE" ? "Nuevo Caso Comercial" : "Editar Ficha del Caso"}</DialogTitle><DialogDescription>Los datos se guardan únicamente cuando el servidor confirma caso, comando y auditoría.</DialogDescription></DialogHeader>
      {error && <Alert variant="destructive"><AlertCircle /><AlertTitle>No fue posible guardar</AlertTitle><AlertDescription>{error === "CRM_PIPELINE_VERSION_CONFLICT" ? "El caso cambió en otra sesión. Cierra el formulario, recarga la Ficha e inténtalo nuevamente." : error}</AlertDescription></Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-semibold text-slate-700 sm:col-span-2">Cliente receptor existente (opcional)<span className="relative mt-1 block"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input className="pl-9" value={clientSearch} onChange={(event) => { setClientSearch(event.target.value); setClientPage(1); }} placeholder="Buscar Client por nombre" /></span><select aria-label="Cliente receptor" className="mt-2 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" value={fields.clientRef || ""} onChange={(event) => update("clientRef", event.target.value || null)}><option value="">Sin Client vinculado</option>{selectableClients.map((client) => <option key={client.clientRef} value={client.clientRef}>{client.displayName} · {client.type || "Tipo no registrado"} · {client.status}</option>)}</select><span className="mt-2 flex items-center justify-between text-[11px] text-slate-500"><span>{loadingClients ? "Consultando…" : `${clientTotal} Client disponibles`}</span><span className="flex gap-1"><Button type="button" size="sm" variant="ghost" disabled={clientPage <= 1} onClick={() => setClientPage((value) => value - 1)}>Anterior</Button><Button type="button" size="sm" variant="ghost" disabled={clientPage * 20 >= clientTotal} onClick={() => setClientPage((value) => value + 1)}>Siguiente</Button></span></span></label>
        <label className="text-xs font-semibold text-slate-700">Modo<select className="mt-1 h-10 w-full rounded-md border px-3" value={fields.mode} onChange={(event) => update("mode", event.target.value as CrmCaseFields["mode"])}><option>LOCAL</option><option>EXPORT</option><option>IMPORT</option></select></label>
        <label className="text-xs font-semibold text-slate-700">Perfil<select className="mt-1 h-10 w-full rounded-md border px-3" value={fields.customerType} onChange={(event) => update("customerType", event.target.value as CrmCaseFields["customerType"])}><option value="L1_AGENT">Agente</option><option value="L2_INTL_DIRECT">Internacional directo</option><option value="L3_CORPORATE">Corporativo</option><option value="L4_PERSONAL">Personal</option></select></label>
        <label className="text-xs font-semibold text-slate-700 sm:col-span-2">Tipo de servicio<Input aria-label="Tipo de servicio" className="mt-1" maxLength={80} value={fields.serviceType} onChange={(event) => update("serviceType", event.target.value)} /></label>
        <label className="text-xs font-semibold text-slate-700">Origen<Input aria-label="Origen" className="mt-1" maxLength={500} value={fields.originLocation} onChange={(event) => update("originLocation", event.target.value)} /></label>
        <label className="text-xs font-semibold text-slate-700">Destino<Input aria-label="Destino" className="mt-1" maxLength={500} value={fields.destinationLocation} onChange={(event) => update("destinationLocation", event.target.value)} /></label>
        <label className="text-xs font-semibold text-slate-700">Volumen estimado m³<Input aria-label="Volumen estimado m³" className="mt-1" type="number" min="0" step="0.01" value={fields.estimatedCbm} onChange={(event) => update("estimatedCbm", Number(event.target.value))} /></label>
        <label className="text-xs font-semibold text-slate-700">Método Survey<select className="mt-1 h-10 w-full rounded-md border px-3" value={fields.surveyMethod} onChange={(event) => update("surveyMethod", event.target.value as CrmCaseFields["surveyMethod"])}><option value="NO_APLICA">No aplica</option><option value="PRESENCIAL">Presencial</option><option value="VIRTUAL">Virtual</option><option value="LISTADO_FOTOS">Listado/Fotos</option></select></label>
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={fields.requiresSurvey} onChange={(event) => update("requiresSurvey", event.target.checked)} />Requiere Survey</label>
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={fields.destinationContracted} onChange={(event) => update("destinationContracted", event.target.checked)} />Destino contratado</label>
      </div>
      <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancelar</Button><Button type="button" disabled={!valid || saving} onClick={() => void submit()}>{saving && <LoaderCircle className="animate-spin" />}{saving ? "Guardando…" : "Guardar"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
