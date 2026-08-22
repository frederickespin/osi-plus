import { AlertCircle, ArrowLeft, BriefcaseBusiness, CalendarDays, UserRound } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CrmPipelineReadError } from "@/crm-relational/readApi";
import type { CrmPipelineCaseDetail } from "@/crm-relational/types";
import { STATUS_LABELS, commercialReadErrorCopy, statusClass } from "./presentation";

type Props = Readonly<{
  state: Readonly<{ loading: boolean; value: CrmPipelineCaseDetail | null; error: CrmPipelineReadError | null }>;
  onBack(): void;
  onReload(): void;
}>;

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "No disponible"
    : new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function CommercialCaseDetail({ state, onBack, onReload }: Props) {
  const item = state.value;
  return <section className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6 lg:px-8" data-testid="commercial-case-detail">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-xs font-bold uppercase tracking-[.18em] text-sky-700">Caso Comercial · sólo lectura</p><h1 className="mt-1 text-2xl font-black text-slate-950">Ficha del Caso</h1></div>
      <Button variant="outline" onClick={onBack}><ArrowLeft />Volver al Pipeline</Button>
    </div>
    {state.loading && <Card><CardContent className="py-16 text-center text-sm text-slate-500">Cargando la autoridad relacional del caso…</CardContent></Card>}
    {state.error && <Alert variant="destructive" role="alert"><AlertCircle /><AlertTitle>{state.error.code}</AlertTitle><AlertDescription>{commercialReadErrorCopy(state.error)}<Button className="mt-3" size="sm" variant="outline" onClick={onReload}>Reintentar lectura</Button></AlertDescription></Alert>}
    {item && <>
      <header className="rounded-2xl border border-sky-200 bg-gradient-to-br from-white via-sky-50/60 to-cyan-50/30 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[.18em] text-sky-700">Caso Comercial</p><p className="mt-1 truncate font-mono text-xl font-bold text-slate-950">{item.caseNumber || "Código no publicado"}</p><p className="mt-1 text-sm text-slate-600">Receptor verificado: {item.client?.displayName || "Sin Client vinculado"}</p></div><div className="flex flex-wrap gap-2"><Badge variant="outline" className={statusClass(item.status)}>{STATUS_LABELS[item.status]}</Badge>{item.mode && <Badge variant="outline">{item.mode}</Badge>}</div></div>
      </header>
      <Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="text-base">Ficha del Caso</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><BriefcaseBusiness className="h-4 w-4" />Receptor del servicio</div><p className="mt-2 font-semibold text-slate-950">{item.client?.displayName || "Sin Client vinculado"}</p><p className="mt-1 text-xs text-slate-500">{item.client ? `${item.client.type || "Tipo no registrado"} · ${item.client.status}` : "No se infiere desde datos legacy"}</p></div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><UserRound className="h-4 w-4" />Asignación</div><p className="mt-2 font-semibold text-slate-950">{item.owner?.displayName || "Sin asignar"}</p><p className="mt-1 text-xs text-slate-500">Owner relacional publicado</p></div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><CalendarDays className="h-4 w-4" />Fechas</div><p className="mt-2 text-sm text-slate-800">Creado: {formatDate(item.createdAt)}</p><p className="mt-1 text-sm text-slate-800">Actualizado: {formatDate(item.updatedAt)}</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:col-span-2 lg:col-span-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Servicio</p><div className="mt-2 flex flex-wrap gap-x-8 gap-y-2 text-sm"><span><strong>Modo:</strong> {item.mode || "No publicado"}</span><span><strong>Tipo:</strong> {item.serviceType || "No publicado"}</span><span><strong>Estado:</strong> {STATUS_LABELS[item.status]}</span></div></div>
      </CardContent></Card>
      {item.status === "APPROVED" && <Alert><AlertTitle>Legacy congelado</AlertTitle><AlertDescription>APPROVED permanece visible, pero no admite acciones en esta fase.</AlertDescription></Alert>}
      {item.status === "OPS_HANDOFF" && <Alert><AlertTitle>Estado terminal</AlertTitle><AlertDescription>La oportunidad ya fue entregada a Operaciones.</AlertDescription></Alert>}
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4"><p className="text-sm font-semibold text-slate-800">Edición, Survey, cotización, materiales y operaciones</p><p className="mt-1 text-sm text-slate-500">Disponible en una fase posterior. Esta ficha no ejecuta mutaciones ni presenta módulos sin autoridad canónica.</p></div>
    </>}
  </section>;
}
