import { useCallback, useEffect, useState } from "react";
import { History, Save } from "lucide-react";
import { COMPACT_FORM_FIELD } from "@/components/ui/compact-form";
import { CustomerCustodyApi, customerCustodyErrorText, type CustomerStorageRequirementWorkspace, type CustomerStorageType } from "./api";

type Props = Readonly<{ api: CustomerCustodyApi; caseRef: string; selectionRef: string | null; canUpdate: boolean }>;
type CapacityBasis = "TWENTY_FOOT_CONTAINER" | "FORTY_FOOT_CONTAINER" | "CUBIC_METER" | "FIXED_SPACE" | "CUSTOM";
type DataSource = "CLIENT_DECLARED" | "COMMERCIAL_ESTIMATE" | "SURVEY_VERIFIED" | "WAREHOUSE_CONFIRMED";
type VisitDecision = "TO_CONFIRM" | "REQUIRED" | "NOT_REQUIRED";

const FIELD = `${COMPACT_FORM_FIELD} mt-1 w-full`;
const STORAGE_TYPES: readonly { value: CustomerStorageType; label: string }[] = [
  { value: "PERSONAL_EFFECTS", label: "Guardamuebles / efectos personales" },
  { value: "IMPORT_STORAGE", label: "Importación" },
  { value: "INTERNATIONAL_DISPATCH", label: "Despacho internacional" },
  { value: "COMMERCIAL_STORAGE", label: "Almacenaje comercial" },
];

export default function StorageRequirementPanel({ api, caseRef, selectionRef, canUpdate }: Props) {
  const [workspace, setWorkspace] = useState<CustomerStorageRequirementWorkspace | null>(null);
  const [storageType, setStorageType] = useState<CustomerStorageType>("PERSONAL_EFFECTS");
  const [capacityBasis, setCapacityBasis] = useState<CapacityBasis>("CUBIC_METER");
  const [capacityQuantity, setCapacityQuantity] = useState(1);
  const [estimatedDurationMonths, setEstimatedDurationMonths] = useState(1);
  const [plannedEntryDate, setPlannedEntryDate] = useState("");
  const [dataSource, setDataSource] = useState<DataSource>("CLIENT_DECLARED");
  const [visitDecision, setVisitDecision] = useState<VisitDecision>("TO_CONFIRM");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hydrate = useCallback((value: CustomerStorageRequirementWorkspace) => {
    setWorkspace(value);
    if (!value.current) return;
    setStorageType(value.current.storageType);
    setCapacityBasis(value.current.capacityBasis);
    setCapacityQuantity(value.current.capacityQuantity);
    setEstimatedDurationMonths(value.current.estimatedDurationMonths);
    setPlannedEntryDate(value.current.plannedEntryDate || "");
    setDataSource(value.current.dataSource);
    setVisitDecision(value.current.visitDecision);
    setNotes(value.current.notes || "");
  }, []);

  const load = useCallback(() => {
    const controller = new AbortController();
    setError(null);
    void api.storageRequirementWorkspace(caseRef, controller.signal).then(hydrate).catch((cause) => setError(customerCustodyErrorText(cause)));
    return () => controller.abort();
  }, [api, caseRef, hydrate]);
  useEffect(load, [load]);

  const authoritative = workspace?.current && ["SURVEY_VERIFIED", "WAREHOUSE_CONFIRMED"].includes(workspace.current.dataSource);
  const editable = canUpdate && !authoritative;
  const complete = Boolean(selectionRef && capacityQuantity > 0 && estimatedDurationMonths > 0);
  const save = async () => {
    if (!complete) return;
    setSaving(true); setError(null);
    try {
      await api.saveStorageRequirement({ caseRef, serviceSelectionRef: selectionRef, expectedRevision: workspace?.current?.revision || 0, storageType, capacityBasis, capacityQuantity, estimatedDurationMonths, plannedEntryDate: plannedEntryDate || null, dataSource, visitDecision, notes: notes.trim() || null });
      load();
    } catch (cause) { setError(customerCustodyErrorText(cause)); } finally { setSaving(false); }
  };

  return <section className="mt-5 border-t-2 border-sky-600 pt-4" data-testid="storage-requirement-panel">
    <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-sky-700">Antes de Survey y Cotización</p><h3 className="text-lg font-black text-[#003366]">Definición inicial del almacenaje</h3><p className="text-xs text-slate-500">Estimación comercial; no representa volumen confirmado ni reserva de espacio.</p></div><span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600"><History className="h-3.5 w-3.5" />{workspace?.historyCount || 0} revisión(es)</span></div>
    <div className="mt-3 grid gap-3 md:grid-cols-4">
      <label className="text-xs font-bold">Modalidad<select disabled={!editable} value={storageType} onChange={(event) => setStorageType(event.target.value as CustomerStorageType)} className={FIELD}>{STORAGE_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label className="text-xs font-bold">Base estimada<select disabled={!editable} value={capacityBasis} onChange={(event) => setCapacityBasis(event.target.value as CapacityBasis)} className={FIELD}><option value="CUBIC_METER">Metros cúbicos</option><option value="FIXED_SPACE">Espacio fijo</option><option value="TWENTY_FOOT_CONTAINER">Equivalente contenedor 20 pies</option><option value="FORTY_FOOT_CONTAINER">Equivalente contenedor 40 pies</option><option value="CUSTOM">Especial</option></select></label>
      <label className="text-xs font-bold">Cantidad aproximada<input disabled={!editable} type="number" min="0.001" step="0.001" value={capacityQuantity} onChange={(event) => setCapacityQuantity(Number(event.target.value))} className={FIELD} /></label>
      <label className="text-xs font-bold">Duración estimada (meses)<input disabled={!editable} type="number" min="1" max="600" value={estimatedDurationMonths} onChange={(event) => setEstimatedDurationMonths(Number(event.target.value))} className={FIELD} /></label>
      <label className="text-xs font-bold">Entrada prevista<input disabled={!editable} type="date" value={plannedEntryDate} onChange={(event) => setPlannedEntryDate(event.target.value)} className={FIELD} /></label>
      <label className="text-xs font-bold">Fuente<select disabled={!editable} value={dataSource} onChange={(event) => setDataSource(event.target.value as DataSource)} className={FIELD}><option value="CLIENT_DECLARED">Declarado por el cliente</option><option value="COMMERCIAL_ESTIMATE">Estimado por Comercial</option>{dataSource === "SURVEY_VERIFIED" && <option value="SURVEY_VERIFIED">Verificado por Survey</option>}{dataSource === "WAREHOUSE_CONFIRMED" && <option value="WAREHOUSE_CONFIRMED">Confirmado por Almacén</option>}</select></label>
      <label className="text-xs font-bold">Visita / Survey<select disabled={!editable} value={visitDecision} onChange={(event) => setVisitDecision(event.target.value as VisitDecision)} className={FIELD}><option value="TO_CONFIRM">Por determinar</option><option value="REQUIRED">Requiere visita</option><option value="NOT_REQUIRED">No requiere visita</option></select></label>
      <label className="text-xs font-bold md:col-span-4">Observaciones iniciales<input disabled={!editable} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} className={FIELD} /></label>
    </div>
    {authoritative && <p className="mt-3 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-900">La última revisión fue publicada por {workspace?.current?.dataSource === "SURVEY_VERIFIED" ? "Survey" : "Almacén"}; Comercial no puede sustituirla silenciosamente.</p>}
    {error && <p role="alert" className="mt-3 bg-red-50 p-2 text-xs text-red-800">{error}</p>}
    <div className="mt-3 flex justify-end"><button type="button" disabled={!editable || !complete || saving} onClick={() => void save()} className="inline-flex min-h-9 items-center gap-1 rounded bg-sky-700 px-3 text-xs font-bold text-white disabled:opacity-40"><Save className="h-4 w-4" />{saving ? "Guardando…" : "Guardar estimación"}</button></div>
  </section>;
}
