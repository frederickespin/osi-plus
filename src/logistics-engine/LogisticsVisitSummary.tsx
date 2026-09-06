import { AlertTriangle, MapPin, Route, ShieldCheck } from "lucide-react";

import type { CommercialCaseSnapshot } from "@/commercial-relationships/api";
import type { SchedulingWorkspace } from "@/survey/schedulingTypes";
import type { LogisticsIssue, LogisticsRevision } from "./api";

type Props = Readonly<{
  revision: LogisticsRevision | null;
  schedulingContext: SchedulingWorkspace["schedulingContext"];
  visitFee: SchedulingWorkspace["visitFee"];
  commercialContext: CommercialCaseSnapshot | null;
}>;

const FAMILY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  LABOR: "Personal",
  TIME: "Tiempo",
  TRANSPORT: "Transporte",
  MATERIAL: "Materiales",
  ASSET: "Herramientas y equipos",
  EXTERNAL: "Terceros",
  TRAVEL: "Dietas, viáticos y hospedaje",
  PERMIT: "Permisos",
  CRATING: "Crating",
});

const RESOLUTION_LABELS: Readonly<Record<string, string>> = Object.freeze({
  ROUTE: "Ficha del caso · Ruta",
  INVENTORY: "Administración · Materiales e Inventario",
  ASSET: "Administración · Herramientas y Equipos",
  VEHICLE: "Administración · Transporte",
  PROVIDER: "Administración · Proveedores",
  ADMIN_RULE: "Administración · Motor Logístico",
});

function resolution(issue: LogisticsIssue) {
  return RESOLUTION_LABELS[issue.source] || "Administración · Motor Logístico";
}

function businessCause(issue: LogisticsIssue) {
  return issue.code.replaceAll("_", " ").toLocaleLowerCase("es-DO");
}

function feeCopy(value: SchedulingWorkspace["visitFee"]) {
  if (!value) return "Pendiente de definir";
  if (value.disposition === "FREE") return "Visita gratuita";
  if (value.disposition === "WAIVED") return "Visita exonerada";
  if (value.suggestedAmount != null && value.currency) return `${value.currency} ${value.suggestedAmount.toLocaleString("es-DO")}`;
  return "Costo pendiente de confirmación";
}

export default function LogisticsVisitSummary({ revision, schedulingContext, visitFee, commercialContext }: Props) {
  const zone = revision?.items.find((item) => item.snapshot?.zoneType);
  const visibleItems = revision?.items.filter((item) => item.kind !== "VISIT_ZONE") || [];
  const leadAccount = commercialContext?.parties.find((item) => item.role === "LEAD_ACCOUNT")?.displayName || null;
  const agreement = commercialContext?.agreement;

  return <section className="border-y border-slate-200 bg-slate-50/70 p-4" data-testid="logistics-visit-summary" aria-labelledby="logistics-visit-summary-title">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-indigo-600">Resultado transversal publicado</p><h3 id="logistics-visit-summary-title" className="mt-0.5 text-sm font-black text-[#003366]">Visita presencial · Motor Logístico</h3></div>
      <span className={`rounded px-2 py-1 text-[10px] font-bold ${revision ? "bg-emerald-100 text-emerald-900" : "bg-slate-200 text-slate-600"}`}>{revision ? `Revisión ${revision.revision}` : "Sin revisión"}</span>
    </div>
    {!revision ? <p className="mt-3 text-sm text-slate-600">Todavía no existe un resultado logístico publicado. Scheduling no calcula fórmulas ni permite editar reglas.</p> : <>
      <dl className="mt-3 grid gap-x-5 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="font-bold text-slate-500">Zona</dt><dd className="mt-0.5 font-semibold text-slate-900">{zone?.snapshot?.zoneCode || schedulingContext?.zoneCode || "Pendiente"}</dd></div>
        <div><dt className="font-bold text-slate-500">Distancia</dt><dd className="mt-0.5 font-semibold text-slate-900">{schedulingContext?.distanceKm == null ? "Pendiente de fuente autorizada" : `${schedulingContext.distanceKm.toLocaleString("es-DO")} km`}</dd></div>
        <div><dt className="font-bold text-slate-500">Perfil de agenda</dt><dd className="mt-0.5 font-semibold text-slate-900">{schedulingContext?.profile || "Pendiente"}</dd></div>
        <div><dt className="font-bold text-slate-500">Visit Fee</dt><dd className="mt-0.5 font-semibold text-slate-900">{feeCopy(visitFee)}</dd></div>
      </dl>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="border-l-2 border-sky-300 pl-3"><p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-slate-500"><Route className="h-3.5 w-3.5" />Incluye según revisión publicada</p>{visibleItems.length ? <ul className="mt-1 space-y-1 text-xs text-slate-700">{visibleItems.map((item) => <li key={item.itemRef || `${item.family}-${item.kind}`}><strong>{FAMILY_LABELS[item.family] || item.family}:</strong> {item.label}{item.quantity == null ? "" : ` · ${item.quantity.toLocaleString("es-DO")} ${item.unit || ""}`}{item.estimatedHours == null ? "" : ` · ${item.estimatedHours.toLocaleString("es-DO")} h`}{item.trips == null ? "" : ` · ${item.trips} viaje(s)`}</li>)}</ul> : <p className="mt-1 text-xs text-slate-500">Sin necesidades adicionales publicadas.</p>}</div>
        <div className="border-l-2 border-indigo-300 pl-3"><p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-slate-500"><ShieldCheck className="h-3.5 w-3.5" />Contexto comercial disponible</p><p className="mt-1 text-xs text-slate-700">Lead Account: <strong>{leadAccount || "No definido"}</strong></p><p className="mt-1 text-xs text-slate-700">Acuerdo/tarifario: <strong>{agreement?.tariff?.name || (agreement ? `Acuerdo v${agreement.version}` : "No definido")}</strong></p><p className="mt-1 text-[11px] text-slate-500">Sólo contexto publicado; no se infieren acuerdos ni se recalculan reglas en Comercial.</p></div>
      </div>
      {revision.issues.length ? <div className="mt-3 space-y-2" aria-label="Advertencias logísticas">{revision.issues.map((issue) => <div key={issue.issueRef || issue.code} className={`border-l-4 p-2.5 text-xs ${issue.severity === "BLOCKER" ? "border-red-500 bg-red-50 text-red-950" : "border-amber-400 bg-amber-50 text-amber-950"}`}><p className="font-bold"><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />{issue.message}</p><p className="mt-0.5 text-[11px]">Causa: {businessCause(issue)}</p><p className="mt-0.5 text-[11px]">Resolver en: {resolution(issue)}</p></div>)}</div> : <p className="mt-3 flex items-center gap-1 text-xs font-semibold text-emerald-800"><MapPin className="h-3.5 w-3.5" />Sin advertencias logísticas publicadas.</p>}
    </>}
  </section>;
}
