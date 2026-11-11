import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, CheckCircle2, Clock3, PackageCheck, Printer, RefreshCw, ScanLine, ShieldCheck, Truck, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { COMPACT_FORM_FIELD } from "@/components/ui/compact-form";
import { materialsApi, type WarehouseRow } from "@/materials-inventory/api";
import CustodyReceptionWorkflow from "./CustodyReceptionWorkflow";
import {
  CustomerCustodyApi,
  CustomerCustodyApiError,
  customerCustodyErrorText,
  type CustomerStorageAuthorization,
  type CustomerStorageLot,
  type CustomerStoredItem,
} from "./api";

type Props = Readonly<{
  authorization?: string;
  effectivePermissions: readonly string[];
  deniedPermissions: readonly string[];
  onBack(): void;
  onUnauthorized(): void;
}>;
type LabelBatch = Readonly<{ items: readonly CustomerStoredItem[]; declaredContentQuantity: number | null }>;
type LabelFormat = "THERMAL" | "MACO_ML1000";

const PRIMARY = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#003b70] px-4 text-sm font-bold text-white shadow-sm hover:bg-[#002d57] disabled:opacity-40";
const SECONDARY = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40";

function isOpenReception(lot: CustomerStorageLot) {
  return lot.receptionStage !== "CLOSED" && lot.status !== "RELEASED";
}

function authorizationLabel(order: CustomerStorageAuthorization) {
  return `${order.authorizationCode} · ${order.client.name}`;
}

export default function CustomerCustodyMobileApp({ authorization, effectivePermissions, deniedPermissions, onBack, onUnauthorized }: Props) {
  const api = useMemo(() => new CustomerCustodyApi(authorization), [authorization]);
  const canReceive = effectivePermissions.includes("customer-custody:receive") && !deniedPermissions.includes("customer-custody:receive");
  const canOperate = effectivePermissions.includes("customer-custody:operate") && !deniedPermissions.includes("customer-custody:operate");
  const [orders, setOrders] = useState<readonly CustomerStorageAuthorization[]>([]);
  const [lots, setLots] = useState<readonly CustomerStorageLot[]>([]);
  const [warehouses, setWarehouses] = useState<readonly WarehouseRow[]>([]);
  const [selectedLotRef, setSelectedLotRef] = useState<string | null>(null);
  const [selectedAuthorizationRef, setSelectedAuthorizationRef] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [labelBatch, setLabelBatch] = useState<LabelBatch | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [availableOrders, storageLots, warehouseRows] = await Promise.all([
        api.authorizations({ movementType: "ENTRY", available: true }),
        api.list("", "ALL"),
        materialsApi.warehouses(authorization),
      ]);
      setOrders(availableOrders);
      setLots(storageLots);
      setWarehouses(warehouseRows);
      setSelectedLotRef((current) => current && storageLots.some((lot) => lot.storageRef === current) ? current : null);
      setSelectedAuthorizationRef((current) => current && availableOrders.some((order) => order.authorizationRef === current) ? current : null);
    } catch (cause) {
      if (cause instanceof CustomerCustodyApiError && cause.status === 401) onUnauthorized();
      else setError(customerCustodyErrorText(cause));
    } finally {
      setLoading(false);
    }
  }, [api, authorization, onUnauthorized]);

  useEffect(() => { void refresh(); }, [refresh]);

  const replaceLot = (saved: CustomerStorageLot) => {
    setLots((current) => current.some((lot) => lot.storageRef === saved.storageRef)
      ? current.map((lot) => lot.storageRef === saved.storageRef ? saved : lot)
      : [saved, ...current]);
    setSelectedLotRef(saved.storageRef);
  };
  const selectedLot = lots.find((lot) => lot.storageRef === selectedLotRef) ?? null;
  const selectedOrder = orders.find((order) => order.authorizationRef === selectedAuthorizationRef) ?? null;
  const activeLots = lots.filter(isOpenReception);

  if (selectedLot) {
    return <MobileShell onBack={() => setSelectedLotRef(null)} title="Recepción activa" subtitle={`${selectedLot.lotCode} · ${selectedLot.warehouse.name}`}>
      <CustodyReceptionWorkflow
        lot={selectedLot}
        api={api}
        canOperate={canOperate}
        onMove={() => undefined}
        onSaved={replaceLot}
        onLabelsGenerated={(items, declaredContentQuantity) => setLabelBatch({ items, declaredContentQuantity })}
      />
      {labelBatch && <PrintableCustodyLabels lot={selectedLot} batch={labelBatch} onClose={() => setLabelBatch(null)} />}
    </MobileShell>;
  }

  if (selectedOrder) {
    return <MobileShell onBack={() => setSelectedAuthorizationRef(null)} title="Preparar recepción" subtitle={authorizationLabel(selectedOrder)}>
      <StartReception
        api={api}
        order={selectedOrder}
        warehouses={warehouses}
        canReceive={canReceive}
        onSaved={replaceLot}
      />
    </MobileShell>;
  }

  return <MobileShell onBack={onBack} title="OSi Custodia" subtitle="Recepción móvil de bienes de clientes">
    <div className="space-y-4" data-testid="customer-custody-mobile-app">
      <section className="rounded-2xl bg-[#003b70] p-4 text-white shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-[10px] font-black uppercase tracking-[.2em] text-sky-200">Cadena de custodia</p><h2 className="mt-1 text-xl font-black">Entradas autorizadas</h2><p className="mt-1 text-xs leading-5 text-sky-100">Seleccione una autorización de Comercial o continúe una recepción iniciada.</p></div>
          <button type="button" aria-label="Actualizar" onClick={() => void refresh()} disabled={loading} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/10 hover:bg-white/20"><RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} /></button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-center"><MobileMetric label="Autorizaciones" value={orders.length} /><MobileMetric label="Recepciones activas" value={activeLots.length} /></div>
      </section>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <MobileList title="Continuar recepción" icon={ScanLine} empty="No hay recepciones abiertas.">
        {activeLots.map((lot) => <button key={lot.storageRef} type="button" onClick={() => setSelectedLotRef(lot.storageRef)} className="grid w-full grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 border-t px-3 py-3 text-left first:border-t-0 hover:bg-sky-50">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-100 text-[#003b70]"><PackageCheck className="h-5 w-5" /></span>
          <span className="min-w-0"><b className="block truncate text-sm text-[#003b70]">{lot.client.name}</b><small className="block truncate text-xs text-slate-500">{lot.lotCode} · {lot.manifestCode || "Sin manifiesto"}</small></span>
          <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800">{lot.receptionStage}</span>
        </button>)}
      </MobileList>

      <MobileList title="Autorizaciones pendientes" icon={ShieldCheck} empty="No hay entradas autorizadas pendientes.">
        {orders.map((order) => <button key={order.authorizationRef} type="button" onClick={() => setSelectedAuthorizationRef(order.authorizationRef)} className="grid w-full grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 border-t px-3 py-3 text-left first:border-t-0 hover:bg-emerald-50">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-100 text-emerald-800"><Truck className="h-5 w-5" /></span>
          <span className="min-w-0"><b className="block truncate text-sm text-[#003b70]">{order.client.name}</b><small className="block truncate text-xs text-slate-500">{order.authorizationCode} · {order.warehouse.name}</small></span>
          <span className="text-right text-[10px] text-slate-500"><Clock3 className="mb-1 ml-auto h-3.5 w-3.5" />{new Date(order.plannedAt).toLocaleDateString("es-DO")}</span>
        </button>)}
      </MobileList>
    </div>
  </MobileShell>;
}

function MobileShell({ onBack, title, subtitle, children }: { onBack(): void; title: string; subtitle: string; children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-100">
    <header className="sticky top-0 z-30 border-b bg-white/95 px-3 py-2 backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center gap-3"><button type="button" onClick={onBack} aria-label="Volver" className="grid h-11 w-11 place-items-center rounded-xl border bg-white text-slate-700"><ArrowLeft className="h-5 w-5" /></button><div className="min-w-0"><h1 className="truncate text-base font-black text-[#003b70]">{title}</h1><p className="truncate text-xs text-slate-500">{subtitle}</p></div></div>
    </header>
    <main className="mx-auto max-w-4xl p-3 sm:p-5">{children}</main>
  </div>;
}

function MobileMetric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl bg-white/10 px-3 py-2"><b className="block text-xl">{value}</b><span className="text-[10px] uppercase tracking-wide text-sky-100">{label}</span></div>;
}

function MobileList({ title, icon: Icon, empty, children }: { title: string; icon: typeof ScanLine; empty: string; children: React.ReactNode }) {
  const rows = Array.isArray(children) ? children : [children];
  return <section className="overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="flex items-center gap-2 border-b px-3 py-3"><Icon className="h-4 w-4 text-sky-700" /><h3 className="text-sm font-black text-[#003b70]">{title}</h3></div>{rows.length && rows.some(Boolean) ? children : <p className="p-5 text-center text-sm text-slate-500">{empty}</p>}</section>;
}

function StartReception({ api, order, warehouses, canReceive, onSaved }: { api: CustomerCustodyApi; order: CustomerStorageAuthorization; warehouses: readonly WarehouseRow[]; canReceive: boolean; onSaved(lot: CustomerStorageLot): void }) {
  const warehouse = warehouses.find((row) => row.warehouseRef === order.warehouse.warehouseRef);
  const locations = useMemo(() => warehouse?.locations.filter((location) => location.status === "ACTIVE") ?? [], [warehouse]);
  const [locationRef, setLocationRef] = useState(locations[0]?.locationRef ?? "");
  const [groupLeadName, setGroupLeadName] = useState("");
  const [driverName, setDriverName] = useState("");
  const [vehicleCode, setVehicleCode] = useState("");
  const [sealNumber, setSealNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (!locationRef && locations[0]) setLocationRef(locations[0].locationRef); }, [locationRef, locations]);

  const save = async () => {
    if (!canReceive || !locationRef || !order.intakeSource) return;
    setSaving(true); setError(null);
    try {
      const receivedAt = new Date().toISOString();
      const direct = order.intakeSource === "DIRECT_WAREHOUSE";
      onSaved(await api.receive({
        authorizationRef: order.authorizationRef,
        clientRef: order.client.clientRef,
        caseRef: order.case.caseRef,
        warehouseRef: order.warehouse.warehouseRef,
        destinationLocationRef: locationRef,
        storageType: order.storageType,
        intakeSource: order.intakeSource,
        manifestCode: order.manifestCode,
        expectedUnits: null,
        groupLeadName: groupLeadName.trim() || null,
        driverName: driverName.trim() || null,
        vehicleCode: vehicleCode.trim() || null,
        sealNumber: sealNumber.trim() || null,
        departedAt: null,
        arrivedAt: direct ? receivedAt : null,
        receivedAt,
        billingStartAt: direct ? receivedAt : null,
        notes: order.instructions,
        items: [],
      }));
    } catch (cause) { setError(customerCustodyErrorText(cause)); } finally { setSaving(false); }
  };

  return <section className="space-y-3" data-testid="customer-custody-start-reception">
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm"><p className="text-[10px] font-black uppercase tracking-wide text-emerald-800">Autorización verificada</p><h2 className="mt-1 font-black text-[#003b70]">{order.client.name}</h2><dl className="mt-3 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-slate-500">Caso</dt><dd className="font-bold">{order.case.caseNumber}</dd></div><div><dt className="text-slate-500">Manifiesto</dt><dd className="font-bold">{order.manifestCode || "Se genera al recibir"}</dd></div><div><dt className="text-slate-500">Almacén</dt><dd className="font-bold">{order.warehouse.name}</dd></div><div><dt className="text-slate-500">Vigente hasta</dt><dd className="font-bold">{new Date(order.validUntil).toLocaleDateString("es-DO")}</dd></div></dl></div>
    <div className="rounded-2xl border bg-white p-4 shadow-sm"><label className="text-xs font-bold text-slate-700">Zona de recepción<select value={locationRef} onChange={(event) => setLocationRef(event.target.value)} className={`${COMPACT_FORM_FIELD} mt-1 w-full`}><option value="">Seleccione una zona</option>{locations.map((location) => <option key={location.locationRef} value={location.locationRef}>{location.path}</option>)}</select></label><p className="mt-2 text-[11px] text-slate-500">La ubicación final de cada unidad se confirmará después mediante doble lectura.</p></div>
    <details className="rounded-2xl border bg-white p-4 shadow-sm"><summary className="cursor-pointer text-sm font-black text-[#003b70]">Transporte y entrega</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><CompactInput label="Jefe de grupo" value={groupLeadName} onChange={setGroupLeadName} /><CompactInput label="Chofer" value={driverName} onChange={setDriverName} /><CompactInput label="Camión / placa" value={vehicleCode} onChange={setVehicleCode} /><CompactInput label="Sello" value={sealNumber} onChange={setSealNumber} /></div></details>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {!canReceive && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Su acceso permite consultar, pero no iniciar recepciones.</p>}
    <button type="button" className={`${PRIMARY} w-full`} disabled={!canReceive || saving || !locationRef} onClick={() => void save()}><ScanLine className="h-5 w-5" />{saving ? "Iniciando…" : "Iniciar recepción por escaneo"}</button>
  </section>;
}

function CompactInput({ label, value, onChange }: { label: string; value: string; onChange(value: string): void }) {
  return <label className="text-xs font-bold text-slate-700">{label}<input value={value} onChange={(event) => onChange(event.target.value)} className={`${COMPACT_FORM_FIELD} mt-1 w-full`} /></label>;
}

function PrintableCustodyLabels({ lot, batch, onClose }: { lot: CustomerStorageLot; batch: LabelBatch; onClose(): void }) {
  const [format, setFormat] = useState<LabelFormat>("MACO_ML1000");
  const [startPosition, setStartPosition] = useState(1);
  const [firstLabel, setFirstLabel] = useState(1);
  const [printQuantity, setPrintQuantity] = useState(batch.items.length);
  const availableQuantity = Math.max(1, batch.items.length - firstLabel + 1);
  const selectedItems = useMemo(() => batch.items.slice(firstLabel - 1, firstLabel - 1 + printQuantity), [batch.items, firstLabel, printQuantity]);
  const sheets = useMemo(() => buildMacoSheets(selectedItems, startPosition, firstLabel - 1), [firstLabel, selectedItems, startPosition]);
  const previewItem = selectedItems[0];
  const sheetCount = format === "MACO_ML1000" ? sheets.length : selectedItems.length;
  const changeFirstLabel = (value: number) => { const next = Math.min(batch.items.length, Math.max(1, value || 1)); setFirstLabel(next); setPrintQuantity((current) => Math.min(current, Math.max(1, batch.items.length - next + 1))); };
  const changePrintQuantity = (value: number) => setPrintQuantity(Math.min(availableQuantity, Math.max(1, value || 1)));
  return createPortal(<div role="dialog" aria-modal="true" aria-label="Imprimir etiquetas de custodia" className="custody-label-dialog fixed inset-0 z-50 overflow-auto bg-slate-950/60 p-3 sm:p-6">
    <style>{`@media print {
      @page { size: ${format === "MACO_ML1000" ? "Letter" : "100mm 65mm"}; margin: 0; }
      html, body { margin: 0 !important; padding: 0 !important; overflow: visible !important; background: white !important; }
      body > *:not(.custody-label-dialog) { display: none !important; }
      .custody-label-dialog { position: static !important; inset: auto !important; display: block !important; width: auto !important; height: auto !important; overflow: visible !important; margin: 0 !important; padding: 0 !important; background: white !important; }
      .custody-label-print-area { position: static !important; inset: auto !important; display: block !important; width: 100% !important; height: auto !important; overflow: visible !important; background: white !important; }
      .custody-label-actions, .custody-label-preview { display: none !important; }
      .custody-maco-sheet { width: 8.5in !important; min-width: 8.5in !important; max-width: 8.5in !important; height: 11in !important; min-height: 11in !important; max-height: 11in !important; margin: 0 !important; padding: .5in .15625in !important; display: grid !important; grid-template-columns: repeat(2, 4in) !important; grid-template-rows: repeat(5, 2in) !important; column-gap: .1875in !important; row-gap: 0 !important; overflow: hidden !important; break-inside: avoid-page !important; page-break-inside: avoid !important; break-after: page !important; page-break-after: always !important; box-sizing: border-box !important; }
      .custody-maco-sheet:last-child { break-after: auto !important; page-break-after: auto !important; }
      .custody-maco-sheet > *, .custody-thermal-label { break-inside: avoid-page !important; page-break-inside: avoid !important; }
      .custody-thermal-label { width: 100mm !important; height: 65mm !important; margin: 0 !important; overflow: hidden !important; break-after: page !important; page-break-after: always !important; box-sizing: border-box !important; }
      .custody-thermal-label:last-child { break-after: auto !important; page-break-after: auto !important; }
    }`}</style>
    <div className="custody-label-actions mx-auto mb-3 max-w-3xl rounded-2xl bg-white p-4 shadow-2xl">
      <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-sky-700">Impresión de custodia</p><h2 className="text-lg font-black text-[#003b70]">{batch.items.length} {batch.items.length === 1 ? "etiqueta preparada" : "etiquetas preparadas"}</h2></div><button type="button" className={SECONDARY} aria-label="Cerrar etiquetas" onClick={onClose}><X className="h-4 w-4" /></button></div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-700">Formato<select value={format} onChange={(event) => setFormat(event.target.value as LabelFormat)} className={`${COMPACT_FORM_FIELD} mt-1 w-full`}><option value="MACO_ML1000">Maco ML-1000 · Carta · 10 por hoja</option><option value="THERMAL">Individual térmica · 100 × 65 mm</option></select></label>{format === "MACO_ML1000" && <label className="text-xs font-bold text-slate-700">Inicio en la hoja<select value={startPosition} onChange={(event) => setStartPosition(Number(event.target.value))} className={`${COMPACT_FORM_FIELD} mt-1 w-full`}>{Array.from({ length: 10 }, (_, index) => index + 1).map((position) => <option key={position} value={position}>{position === 1 ? "Hoja nueva · Posición 1" : `Hoja usada · Posición ${position}`}</option>)}</select></label>}<label className="text-xs font-bold text-slate-700">Desde la etiqueta<input type="number" min={1} max={batch.items.length} value={firstLabel} onChange={(event) => changeFirstLabel(Number(event.target.value))} className={`${COMPACT_FORM_FIELD} mt-1 w-full`} /></label><label className="text-xs font-bold text-slate-700">Cantidad a imprimir<input type="number" min={1} max={availableQuantity} value={printQuantity} onChange={(event) => changePrintQuantity(Number(event.target.value))} className={`${COMPACT_FORM_FIELD} mt-1 w-full`} /></label></div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-xs"><span><b>{selectedItems.length}</b> de {batch.items.length} etiquetas · <b>{sheetCount}</b> {format === "MACO_ML1000" ? sheetCount === 1 ? "hoja Carta" : "hojas Carta" : sheetCount === 1 ? "página individual" : "páginas individuales"}</span><span>Serie <b>{String(firstLabel).padStart(3, "0")}–{String(firstLabel + selectedItems.length - 1).padStart(3, "0")}</b>{batch.declaredContentQuantity ? ` · ${batch.declaredContentQuantity} unidades declaradas` : ""}</span><button type="button" className={PRIMARY} disabled={selectedItems.length === 0} onClick={() => window.print()}><Printer className="h-4 w-4" />Imprimir {selectedItems.length}</button></div>
      <p className="mt-2 text-[10px] text-slate-500"><CheckCircle2 className="mr-1 inline h-3.5 w-3.5 text-emerald-600" />Cada hoja se imprime completa y no se divide entre páginas. Use “Hoja nueva” salvo que reutilice una Maco parcialmente usada; seleccione escala 100 % o tamaño real y desactive encabezados y pies.</p>
      {previewItem && <div className="custody-label-preview mt-3 overflow-hidden rounded-xl border bg-slate-100 p-3"><p className="mb-2 text-[10px] font-bold uppercase text-slate-500">Vista previa</p><div className="mx-auto aspect-[2/1] max-w-md bg-white"><CustodyLabel lot={lot} item={previewItem} sequence={firstLabel} total={batch.items.length} declaredContentQuantity={batch.declaredContentQuantity} compact /></div></div>}
    </div>
    <div className="custody-label-print-area absolute -left-[10000px] top-0 h-0 overflow-hidden print:h-auto print:overflow-visible">
      {format === "MACO_ML1000" ? sheets.map((sheet, sheetIndex) => <div key={`sheet-${sheetIndex}`} className="custody-maco-sheet bg-white">{sheet.map((entry, position) => entry ? <CustodyLabel key={entry.item.itemRef} lot={lot} item={entry.item} sequence={entry.sequence} total={batch.items.length} declaredContentQuantity={batch.declaredContentQuantity} compact /> : <div key={`blank-${sheetIndex}-${position}`} aria-hidden="true" />)}</div>) : selectedItems.map((item, index) => <div key={item.itemRef} className="custody-thermal-label bg-white"><CustodyLabel lot={lot} item={item} sequence={firstLabel + index} total={batch.items.length} declaredContentQuantity={batch.declaredContentQuantity} /></div>)}
    </div>
  </div>, document.body);
}

function buildMacoSheets(items: readonly CustomerStoredItem[], startPosition: number, sequenceOffset = 0) {
  const slots: Array<{ item: CustomerStoredItem; sequence: number } | null> = Array.from({ length: Math.max(0, startPosition - 1) }, () => null);
  items.forEach((item, index) => slots.push({ item, sequence: sequenceOffset + index + 1 }));
  while (slots.length % 10 !== 0) slots.push(null);
  const sheets: Array<typeof slots> = [];
  for (let index = 0; index < slots.length; index += 10) sheets.push(slots.slice(index, index + 10));
  return sheets;
}

function CustodyLabel({ lot, item, sequence, total, declaredContentQuantity, compact = false }: { lot: CustomerStorageLot; item: CustomerStoredItem; sequence: number; total: number; declaredContentQuantity: number | null; compact?: boolean }) {
  const sequenceText = `${String(sequence).padStart(3, "0")} / ${String(total).padStart(3, "0")}`;
  return <article className={`h-full w-full overflow-hidden border border-slate-400 bg-white text-slate-950 ${compact ? "p-[.125in]" : "p-3"}`}>
    <div className="grid h-full grid-cols-[1fr_auto] gap-2"><div className="min-w-0"><p className="text-[8px] font-black uppercase tracking-[.12em] text-[#003b70]">International Packers · OSi Custodia</p><p className="mt-1 truncate text-[12px] font-black">{lot.client.name}</p><dl className="mt-1 grid gap-0.5 text-[8px]"><div><dt className="inline text-slate-500">Lote: </dt><dd className="inline font-bold">{lot.lotCode}</dd></div>{declaredContentQuantity && <div><dt className="inline text-slate-500">Declarado: </dt><dd className="inline font-bold">{declaredContentQuantity} unidades</dd></div>}</dl><p className="mt-1 font-mono text-[7px] leading-tight">{item.itemCode}</p></div><div className="flex flex-col items-center justify-between"><QRCodeSVG value={item.itemCode} size={compact ? 78 : 104} level="M" /><b className="text-[9px] text-[#003b70]">{sequenceText}</b></div></div>
  </article>;
}
