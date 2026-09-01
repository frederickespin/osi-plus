import { useState } from "react";
import { BriefcaseBusiness, LayoutGrid, MapPin, Route, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import IcpIntakeForm from "./IcpIntakeForm";
import type { CrmIcpV2Api, IcpCreateReceipt } from "./api";

const CLIENT_REF = "028f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const CASE_REF = "038f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";

const visualApi: Pick<CrmIcpV2Api, "searchClients" | "create"> = Object.freeze({
  async searchClients(query: string) {
    return Object.freeze({
      total: 1,
      data: Object.freeze([{
        clientRef: CLIENT_REF,
        displayName: `Cliente de muestra · ${query.trim()}`,
        type: "INDIVIDUAL",
        status: "ACTIVE",
        matchHints: { taxId: "••••0042", phone: "••••0199", email: "m•••@example.invalid" },
      }]),
    });
  },
  async create() {
    return Object.freeze({ caseRef: CASE_REF, clientRef: CLIENT_REF, version: 1, routeRevision: 1, replayed: false });
  },
});

export default function IcpVisualPreview() {
  const [open, setOpen] = useState(true);
  const [receipt, setReceipt] = useState<IcpCreateReceipt | null>(null);
  return <div className="flex min-h-screen bg-[#f4f7fb]" data-testid="crm-icp-v2-visual-preview">
    <aside className="hidden w-64 shrink-0 bg-[#003366] text-white lg:block"><div className="flex h-16 items-center gap-3 border-b border-white/15 px-5"><span className="grid h-9 w-9 place-items-center rounded-lg bg-white font-black text-[#003366]">OS</span><div><strong className="block">OSi Plus ERP</strong><small className="text-blue-200">Preview visual</small></div></div><nav className="space-y-2 p-4"><div className="flex items-center gap-3 rounded-lg px-3 py-2 text-blue-100"><LayoutGrid className="h-4 w-4" />General</div><div className="flex items-center gap-3 rounded-lg bg-sky-500 px-3 py-2 font-semibold"><BriefcaseBusiness className="h-4 w-4" />Comercial</div><div className="flex items-center gap-3 rounded-lg px-3 py-2 text-blue-100"><Route className="h-4 w-4" />Coordinación</div><div className="flex items-center gap-3 rounded-lg px-3 py-2 text-blue-100"><Users className="h-4 w-4" />Clientes</div></nav></aside>
    <main className="min-w-0 flex-1"><header className="flex h-16 items-center justify-between border-b bg-white px-6"><div><p className="text-sm font-black text-[#003366]">Comercial y CRM</p><p className="text-[10px] uppercase tracking-[.16em] text-slate-500">Comprobación visual · sin datos reales</p></div><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">Preview aislado</span></header><section className="p-6"><div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-white p-5 shadow-sm"><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#0070a8]">Control Comercial</p><h1 className="text-2xl font-black text-[#003366]">Inbox Comercial</h1><p className="mt-1 text-sm text-slate-500">Vista de referencia del ICP v2. No realiza solicitudes al servidor.</p></div><Button onClick={() => { setReceipt(null); setOpen(true); }}>Nuevo ICP</Button></div>{receipt ? <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950"><strong>ICP de muestra creado.</strong><p className="mt-1 text-sm">Ruta versión 1 · Volumen pendiente hasta Survey o datos proporcionados.</p></div> : <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]"><div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center"><MapPin className="mx-auto h-8 w-8 text-slate-400" /><p className="mt-3 font-bold text-slate-700">Cola comercial de muestra</p><p className="mt-1 text-sm text-slate-500">El diálogo permite revisar el flujo completo sin PII ni persistencia.</p></div><div className="rounded-xl border bg-white p-5"><h2 className="font-black text-[#003366]">Regla de volumen</h2><p className="mt-2 text-sm leading-6 text-slate-600">El ICP captura intención, contacto y ruta. El volumen todavía no se conoce y no se calcula aquí.</p></div></div>}</section></main>
    <IcpIntakeForm open={open} api={visualApi} canCreatePendingDestination onOpenChange={setOpen} onCommitted={(value) => setReceipt(value)} />
  </div>;
}
