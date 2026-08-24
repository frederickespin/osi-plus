import { useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  BriefcaseBusiness,
  CalendarDays,
  ClipboardCheck,
  FileText,
  Gauge,
  MapPin,
  PackageOpen,
  Route,
  UserRound,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { CrmPipelineReadError } from "@/crm-relational/readApi";
import type { CrmPipelineCaseDetail } from "@/crm-relational/types";
import { STATUS_LABELS, commercialReadErrorCopy, statusClass } from "./presentation";

type Props = Readonly<{
  state: Readonly<{ loading: boolean; value: CrmPipelineCaseDetail | null; error: CrmPipelineReadError | null }>;
  onBack(): void;
  onReload(): void;
}>;

type WorkspaceTab = "CASE" | "SURVEY" | "QUOTE";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "No disponible"
    : new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatCbm(value: number | null) {
  return value === null
    ? "No disponible"
    : `${new Intl.NumberFormat("es-DO", { maximumFractionDigits: 2 }).format(value)} m³`;
}

function DataCard({ icon: Icon, label, value, helper }: { icon: typeof BriefcaseBusiness; label: string; value: string; helper?: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.14em] text-slate-500"><Icon className="h-4 w-4 text-[#0070a8]" />{label}</div>
    <p className="mt-2 break-words text-sm font-semibold text-slate-950">{value}</p>
    {helper && <p className="mt-1 text-xs leading-5 text-slate-500">{helper}</p>}
  </div>;
}

function IntegrationPanel({ title, description }: { title: string; description: string }) {
  return <section className="rounded-xl border border-dashed border-amber-300 bg-amber-50/70 px-6 py-12 text-center" role="tabpanel">
    <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-amber-100 text-amber-700"><ClipboardCheck className="h-5 w-5" /></span>
    <h2 className="mt-4 text-lg font-black text-[#003366]">{title}</h2>
    <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">{description}</p>
    <Badge variant="outline" className="mt-4 border-amber-300 bg-white text-amber-800">En integración</Badge>
  </section>;
}

export default function CommercialCaseDetail({ state, onBack, onReload }: Props) {
  const [tab, setTab] = useState<WorkspaceTab>("CASE");
  const item = state.value;
  return <section className="mx-auto max-w-[1420px] space-y-4 px-4 py-5 sm:px-6 lg:px-8" data-testid="commercial-case-detail">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-[11px] font-bold uppercase tracking-[.2em] text-[#0070a8]">Workspace Comercial · sólo lectura</p><h1 className="mt-1 text-2xl font-black tracking-tight text-[#003366]">Ficha del Caso</h1></div>
      <Button variant="outline" onClick={onBack}><ArrowLeft />Volver al Pipeline</Button>
    </div>
    {state.loading && <Card><CardContent className="py-16 text-center text-sm text-slate-500">Cargando la autoridad relacional del caso…</CardContent></Card>}
    {state.error && <Alert variant="destructive" role="alert"><AlertCircle /><AlertTitle>{state.error.code}</AlertTitle><AlertDescription>{commercialReadErrorCopy(state.error)}<Button className="mt-3" size="sm" variant="outline" onClick={onReload}>Reintentar lectura</Button></AlertDescription></Alert>}
    {item && <>
      <header className="overflow-hidden rounded-xl border border-sky-200 bg-white shadow-sm">
        <div className="h-1 bg-gradient-to-r from-[#003366] via-[#0079b8] to-amber-400" />
        <div className="flex flex-col gap-4 bg-gradient-to-r from-sky-50/90 via-white to-white p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#0070a8]">Caso Comercial</p><p className="mt-1 truncate font-mono text-xl font-black text-[#003366]">{item.caseCode}</p><p className="mt-1 text-sm text-slate-600">Receptor verificado: <strong>{item.client?.displayName || "Sin Client vinculado"}</strong></p></div>
          <div className="flex flex-wrap gap-2"><Badge variant="outline" className={statusClass(item.status)}>{STATUS_LABELS[item.status]}</Badge>{item.mode && <Badge variant="outline">{item.mode}</Badge>}<Badge variant="outline" className="bg-slate-50 text-slate-600">Prioridad no disponible</Badge></div>
        </div>
        <div role="tablist" aria-label="Áreas del Caso Comercial" className="flex gap-1 overflow-x-auto border-t border-slate-200 bg-[#c9c5c2] p-1">
          {([
            ["CASE", "Ficha del Caso", FileText],
            ["SURVEY", "Survey", ClipboardCheck],
            ["QUOTE", "Cotización", BriefcaseBusiness],
          ] as const).map(([value, label, Icon]) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`flex min-w-44 flex-1 shrink-0 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-bold ${tab === value ? "border-[#bd6937] bg-[#df8750] text-white shadow-sm" : "border-transparent text-slate-700 hover:bg-white/35 hover:text-[#003366]"}`}><Icon className="h-4 w-4" />{label}{value !== "CASE" && <span className={`rounded px-1.5 py-0.5 text-[9px] uppercase ${tab === value ? "bg-white/20 text-white" : "bg-amber-100 text-amber-800"}`}>En integración</span>}</button>)}
        </div>
      </header>

      {tab === "CASE" && <div role="tabpanel" className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <DataCard icon={BriefcaseBusiness} label="Cliente receptor" value={item.client?.displayName || "Sin Client vinculado"} helper={item.client ? `${item.client.type || "Tipo no registrado"} · ${item.client.status}` : "No se infiere desde nombre histórico, pagador o Lead Account."} />
          <DataCard icon={Route} label="Servicio" value={`${item.mode || "Modo no disponible"} · ${item.serviceType || "Tipo no disponible"}`} helper={`Perfil: ${item.customerType || "No disponible"}`} />
          <DataCard icon={UserRound} label="Canal y responsable" value={item.owner?.displayName || "Sin asignar"} helper="Canal de procedencia: no disponible en el contrato actual." />
          <DataCard icon={CalendarDays} label="Fechas" value={`Creado ${formatDate(item.createdAt)}`} helper={`Actualizado ${formatDate(item.updatedAt)}`} />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.35fr_.65fr]">
          <Card className="border-slate-200 shadow-sm"><CardContent className="p-0"><div className="border-b border-slate-200 px-5 py-4"><h2 className="font-black text-[#003366]">Direcciones del servicio</h2><p className="mt-1 text-xs text-slate-500">Autoridad disponible actualmente en PipelineCase.</p></div><div className="grid gap-4 p-5 sm:grid-cols-2">
            <DataCard icon={MapPin} label="Origen" value={item.originLocation || "No registrado"} helper="Dirección textual canónica disponible." />
            <DataCard icon={MapPin} label="Destino" value={item.destinationLocation || "No registrado"} helper={item.destinationContracted === null ? "Condición no disponible." : item.destinationContracted ? "Destino contratado." : "Destino no contratado."} />
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 sm:col-span-2"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Orígenes, destinos y paradas adicionales</p><p className="mt-2 text-sm text-slate-600">No disponibles hasta incorporar una autoridad tenant-first 1:N. La segunda dirección no se reduce a una nota.</p></div>
          </div></CardContent></Card>

          <Card className="border-slate-200 shadow-sm"><CardContent className="space-y-3 p-5"><h2 className="font-black text-[#003366]">Alcance publicado</h2>
            <DataCard icon={Gauge} label="Volumen estimado" value={formatCbm(item.estimatedCbm)} />
            <DataCard icon={PackageOpen} label="Activos" value={String(item.assetsCount)} helper="Conteo relacional publicado." />
            <DataCard icon={ClipboardCheck} label="Survey" value={item.requiresSurvey ? "Requerido" : "No requerido"} helper={item.surveyMethod || "Método no disponible"} />
          </CardContent></Card>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Eventos</p><p className="mt-1 text-2xl font-black text-[#003366]">{item.eventCount}</p><p className="text-xs text-slate-500">Sólo conteo; historial aún no integrado.</p></div>
          <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Cotizaciones</p><p className="mt-1 text-2xl font-black text-[#003366]">{item.quoteCount}</p><p className="text-xs text-slate-500">Sólo conteo; workspace aún no integrado.</p></div>
          <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Cumplimiento</p><p className="mt-1 text-sm font-bold text-slate-800">No disponible</p><p className="text-xs text-slate-500">No se infiere régimen diplomático desde pagador o institución.</p></div>
        </div>
      </div>}

      {tab === "SURVEY" && <IntegrationPanel title="Survey en integración" description="La pestaña conserva la organización del ERP recuperado. Programación, Precarga Mini, historial, resultado y PIC se incorporarán cuando exista autoridad Survey tenant-first; no se muestran mocks." />}
      {tab === "QUOTE" && <IntegrationPanel title="Cotización en integración" description="Alcance, materiales, cajas, tarifas, costos, monedas, márgenes y aprobaciones se integrarán como un vertical coordinado. Esta vista no simula una cotización ni ejecuta mutaciones." />}

      {item.status === "APPROVED" && <Alert><AlertTitle>Legacy congelado</AlertTitle><AlertDescription>APPROVED permanece visible, pero no admite acciones en esta fase.</AlertDescription></Alert>}
      {item.status === "OPS_HANDOFF" && <Alert><AlertTitle>Estado terminal</AlertTitle><AlertDescription>La oportunidad ya fue entregada a Operaciones.</AlertDescription></Alert>}
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4"><p className="text-sm font-semibold text-slate-800">Edición y acciones empresariales</p><p className="mt-1 text-sm text-slate-500">Disponible en una fase posterior. Esta Ficha no ejecuta mutaciones ni inventa autoridades ausentes.</p></div>
    </>}
  </section>;
}
