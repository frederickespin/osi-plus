import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [labelItem, setLabelItem] = useState<CustomerStoredItem | null>(null);

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
        onLabelGenerated={setLabelItem}
      />
      {labelItem && <PrintableCustodyLabel lot={selectedLot} item={labelItem} onClose={() => setLabelItem(null)} />}
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

function PrintableCustodyLabel({ lot, item, onClose }: { lot: CustomerStorageLot; item: CustomerStoredItem; onClose(): void }) {
  const qrValue = item.itemCode;
  return <div role="dialog" aria-modal="true" aria-label="Etiqueta de custodia" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4">
    <style>{`@media print { body * { visibility: hidden !important; } .custody-label-print, .custody-label-print * { visibility: visible !important; } .custody-label-print { position: fixed !important; inset: 0 auto auto 0 !important; width: 100mm !important; min-height: 65mm !important; border: 0 !important; box-shadow: none !important; } .custody-label-actions { display: none !important; } }`}</style>
    <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl">
      <div className="custody-label-print rounded-xl border-2 border-[#003b70] bg-white p-4 text-slate-950">
        <div className="flex items-center justify-between border-b border-[#003b70] pb-2"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-[#003b70]">OSi Plus · Custodia</p><h3 className="text-lg font-black">{item.itemCode}</h3></div><QRCodeSVG value={qrValue} size={94} level="M" /></div>
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]"><div><dt className="text-slate-500">Lote</dt><dd className="font-bold">{lot.lotCode}</dd></div><div><dt className="text-slate-500">Tipo</dt><dd className="font-bold">{item.unitType}</dd></div><div className="col-span-2"><dt className="text-slate-500">Contenido general</dt><dd className="font-bold">{item.genericContents.join(" · ") || "Sin detalle"}</dd></div></dl>
        <p className="mt-3 border-t pt-2 text-center font-mono text-[10px]">{qrValue}</p>
      </div>
      <div className="custody-label-actions mt-3 grid grid-cols-[1fr_auto] gap-2"><button type="button" className={PRIMARY} onClick={() => window.print()}><Printer className="h-4 w-4" />Imprimir etiqueta</button><button type="button" className={SECONDARY} aria-label="Cerrar etiqueta" onClick={onClose}><X className="h-4 w-4" /></button></div>
      <p className="custody-label-actions mt-2 text-center text-[10px] text-slate-500"><CheckCircle2 className="mr-1 inline h-3.5 w-3.5 text-emerald-600" />El QR contiene solamente el identificador interno de la unidad.</p>
    </div>
  </div>;
}
