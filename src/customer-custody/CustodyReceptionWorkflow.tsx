import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, Camera, CheckCircle2, MapPinCheck, Package, ScanLine, ShieldCheck, Truck, UserCheck } from "lucide-react";
import { COMPACT_FORM_FIELD } from "@/components/ui/compact-form";
import { CustomerCustodyApi, customerCustodyErrorText, type CustomerStorageLot, type CustomerStoredItem } from "./api";

type WorkflowStep = "handoff" | "receiving" | "exceptions" | "putaway";
type Props = Readonly<{ lot: CustomerStorageLot; api: CustomerCustodyApi; canOperate: boolean; onSaved(lot: CustomerStorageLot): void; onMove(item: CustomerStoredItem): void }>;
const PRIMARY = "inline-flex min-h-9 items-center justify-center gap-1.5 rounded border border-[#003366] bg-[#003366] px-3 text-xs font-semibold text-white hover:bg-[#00264d] disabled:opacity-40";
const SECONDARY = "inline-flex min-h-9 items-center justify-center gap-1.5 rounded border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40";
const STEPS: readonly Readonly<{ id: WorkflowStep; label: string; hint: string }>[] = Object.freeze([
  { id: "handoff", label: "Entrega", hint: "Transporte" },
  { id: "receiving", label: "Recepción", hint: "Escaneo" },
  { id: "exceptions", label: "Diferencias", hint: "Incidencias" },
  { id: "putaway", label: "Ubicación", hint: "Custodia" },
]);

function stepFor(stage: string): WorkflowStep { if (["PLANNED", "IN_TRANSIT", "ARRIVED"].includes(stage)) return "handoff"; if (stage === "RECEIVING") return "receiving"; if (stage === "EXCEPTIONS") return "exceptions"; return "putaway"; }
function formatDateTime(value: string | null) { return value ? new Intl.DateTimeFormat("es-DO", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "Pendiente"; }
function itemLabel(item: CustomerStoredItem) { return item.externalCode || item.itemCode; }

export default function CustodyReceptionWorkflow({ lot, api, canOperate, onSaved, onMove }: Props) {
  const [step, setStep] = useState<WorkflowStep>(() => stepFor(lot.receptionStage));
  const [scanCode, setScanCode] = useState(""); const [note, setNote] = useState(""); const [exceptionItem, setExceptionItem] = useState<CustomerStoredItem | null>(null);
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null); const scanRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setStep(stepFor(lot.receptionStage)); }, [lot.receptionStage]);
  const expected = useMemo(() => lot.items.filter((item) => item.status === "EXPECTED"), [lot.items]);
  const exceptions = useMemo(() => lot.items.filter((item) => item.status === "HOLD" || item.condition === "DAMAGED"), [lot.items]);
  const received = lot.items.length - expected.length; const canClose = expected.length === 0 && lot.items.every((item) => item.status !== "HOLD");

  const act = async (action: string, item: CustomerStoredItem | null = null, code: string | null = null, actionNote: string | null = null) => {
    setSaving(true); setError(null);
    try {
      const saved = await api.receptionAction({ storageRef: lot.storageRef, action, itemRef: item?.itemRef ?? null, scanCode: code, occurredAt: new Date().toISOString(), notes: actionNote, evidence: null, expectedLotVersion: lot.version, expectedItemVersion: item?.version ?? null });
      onSaved(saved); setScanCode(""); setNote(""); setExceptionItem(null);
      if (action === "SCAN_ITEM") window.setTimeout(() => scanRef.current?.focus(), 0);
    } catch (cause) { setError(customerCustodyErrorText(cause)); } finally { setSaving(false); }
  };
  const scan = () => { const code = scanCode.trim(); const item = lot.items.find((row) => row.status === "EXPECTED" && [row.itemCode, row.externalCode].includes(code)); if (!item) { setError("El código no corresponde a una unidad pendiente de este manifiesto."); return; } void act("SCAN_ITEM", item, code); };

  return <section className="overflow-hidden rounded-xl border bg-white" aria-label="Recepción y cadena de custodia">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-[#003366] px-3 py-2 text-white">
      <div><p className="text-[9px] font-bold uppercase tracking-[.15em] text-sky-200">Recepción activa</p><h4 className="text-sm font-bold">{lot.client.name} · {lot.manifestCode || lot.lotCode}</h4></div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-sky-100"><span><b className="text-white">Camión</b> {lot.vehicleCode || "—"}</span><span><b className="text-white">Chofer</b> {lot.driverName || "—"}</span><span><b className="text-white">Esperado</b> {lot.expectedUnits ?? lot.items.length}</span></div>
    </div>
    <div className="grid md:grid-cols-[150px_minmax(0,1fr)]">
      <nav className="grid grid-cols-4 border-b bg-slate-50 p-1 md:block md:border-b-0 md:border-r" aria-label="Etapas de recepción">{STEPS.map((row, index) => { const active = step === row.id; return <button key={row.id} type="button" aria-pressed={active} onClick={() => setStep(row.id)} className={`flex min-h-12 w-full items-center gap-2 rounded px-2 py-1 text-left ${active ? "bg-sky-100 text-[#003366]" : "text-slate-500 hover:bg-slate-100"}`}><span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[10px] ${active ? "border-sky-700 bg-sky-700 text-white" : "border-slate-300"}`}>{index + 1}</span><span className="hidden md:block"><b className="block text-xs text-slate-800">{row.label}</b><small className="text-[10px]">{row.hint}</small></span></button>; })}</nav>
      <div className="min-w-0 p-3">
        <div className="mb-3 grid grid-cols-4 divide-x border-y"><Metric label="Esperado" value={lot.expectedUnits ?? lot.items.length} /><Metric label="Recibido" value={received} /><Metric label="Diferencias" value={exceptions.length} alert={exceptions.length > 0} /><Metric label="Pendiente" value={expected.length} /></div>
        {step === "handoff" && <Handoff lot={lot} canOperate={canOperate} saving={saving} onAction={(action) => void act(action)} />}
        {step === "receiving" && <div><Header icon={ScanLine} title="Recepción por escaneo" hint="Lectura continua durante la descarga." badge={`${expected.length} pendientes`} /><div className="mt-3 flex gap-2"><label className="relative min-w-0 flex-1"><span className="sr-only">Código de unidad</span><ScanLine className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-sky-700" /><input ref={scanRef} value={scanCode} onChange={(event) => setScanCode(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); scan(); } }} placeholder="Escanear QR o escribir código" className={`${COMPACT_FORM_FIELD} w-full border-2 border-sky-600 pl-9`} autoComplete="off" /></label><button type="button" className={PRIMARY} onClick={() => scanRef.current?.focus()} aria-label="Activar lectura"><Camera className="h-4 w-4" /></button></div><CompactItems items={lot.items.slice(0, 8)} onException={canOperate ? setExceptionItem : undefined} /></div>}
        {step === "exceptions" && <div><Header icon={AlertTriangle} title="Diferencias e incidencias" hint="Solo artículos que requieren atención." badge={`${exceptions.length} abiertas`} alert /><CompactItems items={exceptions} onResolve={canOperate ? (item) => void act("RESOLVE_EXCEPTION", item, null, "Incidencia revisada y liberada") : undefined} empty="No existen diferencias abiertas." /></div>}
        {step === "putaway" && <div><Header icon={MapPinCheck} title="Ubicación de custodia" hint={`Recepción temporal: ${lot.receptionLocation.path}`} badge={`${lot.items.filter((item) => item.location).length} ubicadas`} /><CompactItems items={lot.items} onMove={canOperate ? onMove : undefined} /><div className="mt-3 flex justify-end"><button type="button" className={PRIMARY} disabled={!canOperate || saving || !canClose || lot.receptionStage === "CLOSED"} onClick={() => void act("CLOSE")}><CheckCircle2 className="h-4 w-4" />{lot.receptionStage === "CLOSED" ? "Recepción cerrada" : "Cerrar recepción"}</button></div></div>}
        {exceptionItem && <div className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-[1fr_auto]"><label className="text-xs font-semibold">Incidencia en {itemLabel(exceptionItem)}<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Daño, humedad, faltante o sello" className={`${COMPACT_FORM_FIELD} mt-1 w-full`} /></label><button type="button" className={`${PRIMARY} self-end`} disabled={!note.trim() || saving} onClick={() => void act("REPORT_EXCEPTION", exceptionItem, null, note.trim())}><AlertTriangle className="h-4 w-4" />Registrar</button></div>}
        {error && <p role="alert" className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p>}
      </div>
    </div>
  </section>;
}

function Handoff({ lot, canOperate, saving, onAction }: { lot: CustomerStorageLot; canOperate: boolean; saving: boolean; onAction(action: "ARRIVE" | "CONFIRM_HANDOFF"): void }) {
  const arrivalPending = ["PLANNED", "IN_TRANSIT"].includes(lot.receptionStage); const handoffPending = lot.receptionStage === "ARRIVED";
  return <div><Header icon={Truck} title="Entrega del transporte" hint="Confirmación antes de descargar." badge={lot.sealNumber ? `Sello ${lot.sealNumber}` : "Sin sello"} /><div className="mt-3 divide-y border-y text-xs"><Fact icon={UserCheck} label="Jefe de grupo" value={lot.groupLeadName || "No registrado"} detail={lot.departedAt ? `Salida ${formatDateTime(lot.departedAt)}` : "Salida pendiente"} /><Fact icon={Truck} label="Transporte" value={`${lot.driverName || "Chofer no registrado"}${lot.vehicleCode ? ` · ${lot.vehicleCode}` : ""}`} detail={lot.arrivedAt ? `Llegada ${formatDateTime(lot.arrivedAt)}` : "En tránsito"} /><Fact icon={ShieldCheck} label="Encargado de recepción" value={lot.warehouse.name} detail={lot.handoffConfirmedAt ? `Custodia aceptada ${formatDateTime(lot.handoffConfirmedAt)}` : "Pendiente de aceptar"} /></div><div className="mt-3 flex justify-end gap-2">{arrivalPending && <button type="button" className={PRIMARY} disabled={!canOperate || saving} onClick={() => onAction("ARRIVE")}><Truck className="h-4 w-4" />Registrar llegada</button>}{handoffPending && <button type="button" className={PRIMARY} disabled={!canOperate || saving} onClick={() => onAction("CONFIRM_HANDOFF")}><ShieldCheck className="h-4 w-4" />Aceptar custodia</button>}{!arrivalPending && !handoffPending && <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" />Entrega confirmada</span>}</div></div>;
}

function Header({ icon: Icon, title, hint, badge, alert = false }: { icon: typeof Truck; title: string; hint: string; badge: string; alert?: boolean }) { return <div className="flex items-start justify-between gap-2"><div className="flex gap-2"><Icon className={`mt-0.5 h-4 w-4 ${alert ? "text-red-700" : "text-sky-700"}`} /><div><h5 className="text-sm font-bold text-[#003366]">{title}</h5><p className="text-[11px] text-slate-500">{hint}</p></div></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${alert ? "bg-red-50 text-red-700" : "bg-sky-50 text-sky-800"}`}>{badge}</span></div>; }
function Metric({ label, value, alert = false }: { label: string; value: number; alert?: boolean }) { return <div className="px-2 py-1.5 text-center"><span className="block text-[9px] font-semibold uppercase text-slate-500">{label}</span><b className={`text-base ${alert ? "text-red-700" : "text-[#003366]"}`}>{value}</b></div>; }
function Fact({ icon: Icon, label, value, detail }: { icon: typeof Truck; label: string; value: string; detail: string }) { return <div className="grid min-h-12 grid-cols-[28px_minmax(120px,1fr)_minmax(120px,1fr)] items-center gap-2 py-1.5"><span className="grid h-7 w-7 place-items-center rounded bg-sky-50 text-sky-700"><Icon className="h-4 w-4" /></span><span><b className="block">{label}</b><span>{value}</span></span><span className="text-right text-[11px] text-slate-500">{detail}</span></div>; }

function CompactItems({ items, onException, onResolve, onMove, empty = "No hay unidades para mostrar." }: { items: readonly CustomerStoredItem[]; onException?(item: CustomerStoredItem): void; onResolve?(item: CustomerStoredItem): void; onMove?(item: CustomerStoredItem): void; empty?: string }) {
  if (items.length === 0) return <p className="mt-3 border-y py-6 text-center text-xs text-slate-500">{empty}</p>;
  return <div className="mt-3 divide-y border-y">{items.map((item) => <div key={item.itemRef} className="grid min-h-11 grid-cols-[28px_minmax(140px,1.3fr)_minmax(90px,.7fr)_auto] items-center gap-2 py-1.5 text-xs"><span className={`grid h-7 w-7 place-items-center rounded ${item.status === "HOLD" ? "bg-red-50 text-red-700" : "bg-sky-50 text-sky-700"}`}>{item.status === "HOLD" ? <AlertTriangle className="h-4 w-4" /> : <Package className="h-4 w-4" />}</span><span><b className="block">{itemLabel(item)} · {item.description}</b><small className="text-[10px] text-slate-500">{item.quantity} {item.unit}{item.notes ? ` · ${item.notes}` : ""}</small></span><span className="text-[11px] text-slate-500">{item.location?.path || (item.status === "EXPECTED" ? "Pendiente" : "Sin ubicación")}</span><span className="flex gap-1">{onException && item.status !== "HOLD" && <button type="button" className={SECONDARY} onClick={() => onException(item)} aria-label={`Registrar incidencia en ${itemLabel(item)}`}><AlertTriangle className="h-3.5 w-3.5" /></button>}{onResolve && item.status === "HOLD" && <button type="button" className={SECONDARY} onClick={() => onResolve(item)}>Resolver</button>}{onMove && item.status === "IN_CUSTODY" && <button type="button" className={SECONDARY} onClick={() => onMove(item)} aria-label={`Ubicar ${itemLabel(item)}`}><ArrowRight className="h-3.5 w-3.5" /></button>}</span></div>)}</div>;
}
