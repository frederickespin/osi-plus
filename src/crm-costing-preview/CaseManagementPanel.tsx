import { useState } from "react";
import { AlertTriangle, BellRing, Check, ClipboardList, FileText, Landmark, Truck } from "lucide-react";

type ManagementTab = "PERMITS" | "THIRD_PARTIES";

const money = new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP", maximumFractionDigits: 0 });

const THIRD_PARTIES = [
  { reference: "EXT-001", service: "Grúa para acceso especial", provider: "Grúas del Caribe", requested: "28 ago 2026", quoted: "29 ago 2026", validUntil: "12 sep 2026", contract: "GC-842", cost: 22000, coordinator: "Cam Mionero", status: "Confirmado" },
  { reference: "CAJ-002", service: "Tratamiento y certificado ISPM 15", provider: "FumiCaribe", requested: "29 ago 2026", quoted: "30 ago 2026", validUntil: "15 sep 2026", contract: "FC-191", cost: 6500, coordinator: "Cam Mionero", status: "Confirmado" },
  { reference: "FLT-001", service: "Flete marítimo", provider: "Naviera seleccionada", requested: "27 ago 2026", quoted: "30 ago 2026", validUntil: "06 sep 2026", contract: "BK-7714", cost: 84996, coordinator: "Cam Mionero", status: "Vigilar tasa" },
] as const;

export default function CaseManagementPanel({ permitResolved, onResolvePermit }: Readonly<{ permitResolved: boolean; onResolvePermit: () => void }>) {
  const [tab, setTab] = useState<ManagementTab>("PERMITS");

  return <section role="tabpanel" className="rounded-xl border border-slate-200 bg-white shadow-sm" data-testid="case-management-panel">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
      <div><h2 className="font-black text-[#003366]">Gestiones del servicio</h2><p className="mt-1 text-xs text-slate-500">Permisos y terceros conectados a tareas, alertas, costos y bloqueos.</p></div>
      <div className="flex border-b border-slate-300" role="tablist" aria-label="Tipos de gestiones"><button type="button" role="tab" aria-selected={tab === "PERMITS"} onClick={() => setTab("PERMITS")} className={`flex items-center gap-2 border-b-2 px-3 py-2 text-xs font-bold ${tab === "PERMITS" ? "border-[#0070a8] text-[#003366]" : "border-transparent text-slate-500"}`}><Landmark className="h-4 w-4" />Permisos</button><button type="button" role="tab" aria-selected={tab === "THIRD_PARTIES"} onClick={() => setTab("THIRD_PARTIES")} className={`flex items-center gap-2 border-b-2 px-3 py-2 text-xs font-bold ${tab === "THIRD_PARTIES" ? "border-[#0070a8] text-[#003366]" : "border-transparent text-slate-500"}`}><Truck className="h-4 w-4" />Terceros</button></div>
    </header>

    {tab === "PERMITS" ? <div data-testid="permits-management">
      <div className={`flex items-center gap-3 border-b px-4 py-2 text-xs ${permitResolved ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>{permitResolved ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}<strong>{permitResolved ? "Permisos confirmados: el bloqueo fue liberado." : "1 permiso obligatorio pendiente: Cotización Integral y salida operativa bloqueadas."}</strong></div>
      <div className="overflow-x-auto"><div className="min-w-[920px]"><div className="grid grid-cols-[65px_minmax(180px,1.2fr)_140px_88px_88px_100px_105px_76px] bg-[#edf2f7] px-3 py-2 text-[10px] font-black uppercase text-slate-500"><span>Ref.</span><span>Permiso</span><span>Autoridad</span><span>Solicitado</span><span>Requerido</span><span>Costo oficial</span><span>Gestión propia</span><span>Control</span></div>
        <div className={`grid grid-cols-[65px_minmax(180px,1.2fr)_140px_88px_88px_100px_105px_76px] items-center px-3 py-2 text-xs ${permitResolved ? "bg-white" : "bg-amber-50"}`}><span className="font-mono text-[10px] font-bold">PER-001</span><div><strong>Tránsito en zona restringida</strong><p className="text-[10px] text-slate-500">Origen · acceso y estacionamiento</p></div><span>Ayuntamiento / INTRANT</span><span>31 ago 2026</span><span>05 sep 2026</span><strong>{permitResolved ? money.format(8500) : "Por confirmar"}</strong><span>RD$2,500 · Pr</span><div className="flex gap-1">{!permitResolved && <button type="button" title="Confirmar permiso y costo" aria-label="Confirmar permiso y costo" onClick={onResolvePermit} className="grid h-8 w-8 place-items-center text-emerald-700"><Check className="h-4 w-4" /></button>}<button type="button" title="Abrir tarea y alertas" aria-label="Abrir tarea y alertas del permiso" className="grid h-8 w-8 place-items-center text-amber-800"><BellRing className="h-4 w-4" /></button></div></div>
        <div className="grid grid-cols-[65px_minmax(180px,1.2fr)_140px_88px_88px_100px_105px_76px] items-center bg-slate-50/70 px-3 py-2 text-xs"><span className="font-mono text-[10px] font-bold">PER-002</span><div><strong>Reserva de parqueo</strong><p className="text-[10px] text-slate-500">Destino · espacio para camión</p></div><span>Administración del edificio</span><span>30 ago 2026</span><span>05 sep 2026</span><strong>{money.format(2500)}</strong><span>Incluida · Pr</span><div className="flex items-center gap-1 text-emerald-700"><Check className="h-4 w-4" />Listo</div></div>
      </div></div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-200 px-4 py-3 text-[10px] text-slate-600"><span className="flex items-center gap-1"><ClipboardList className="h-3.5 w-3.5" />Responsable: Cam Mionero</span><span className="flex items-center gap-1"><BellRing className="h-3.5 w-3.5" />Avisos: 48 h y 24 h antes</span><span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" />Evidencia y autorización requeridas</span></div>
    </div> : <div data-testid="third-party-management">
      <div className="overflow-x-auto"><div className="min-w-[990px]"><div className="grid grid-cols-[65px_minmax(175px,1.2fr)_145px_88px_88px_88px_85px_95px_105px] bg-[#edf2f7] px-3 py-2 text-[10px] font-black uppercase text-slate-500"><span>Ref.</span><span>Servicio</span><span>Proveedor</span><span>Solicitado</span><span>Cotizado</span><span>Vence</span><span>Contrato</span><span>Costo</span><span>Coordinador</span></div>
        {THIRD_PARTIES.map((item, index) => <div key={item.reference} className={`grid grid-cols-[65px_minmax(175px,1.2fr)_145px_88px_88px_88px_85px_95px_105px] items-center px-3 py-2 text-xs ${index % 2 ? "bg-slate-50/70" : "bg-white"}`}><span className="font-mono text-[10px] font-bold">{item.reference}</span><div><strong>{item.service}</strong><p className={`text-[10px] ${item.status === "Vigilar tasa" ? "font-bold text-amber-800" : "text-emerald-700"}`}>{item.status}</p></div><span>{item.provider}</span><span>{item.requested}</span><span>{item.quoted}</span><span>{item.validUntil}</span><span>{item.contract}</span><strong>{money.format(item.cost)}</strong><span>{item.coordinator}</span></div>)}
      </div></div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-200 px-4 py-3 text-[10px] text-slate-600"><span>El costo del proveedor se registra como Ex.</span><span>La coordinación propia se registra por separado como Pr.</span><span>Tareas y alertas conservan solicitud, vigencia y referencia contractual.</span></div>
    </div>}
  </section>;
}
