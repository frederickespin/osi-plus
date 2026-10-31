import { AlertTriangle, MapPin, ShieldCheck } from "lucide-react";

import type { CommercialCaseSnapshot } from "@/commercial-relationships/api";
import type { SchedulingWorkspace } from "@/survey/schedulingTypes";
import type { TransportPublication } from "./transportApi";

type Props = Readonly<{
  publication: TransportPublication | null;
  schedulingContext: SchedulingWorkspace["schedulingContext"];
  visitFee: SchedulingWorkspace["visitFee"];
  canViewFee: boolean;
  commercialContext: CommercialCaseSnapshot | null;
}>;

function money(value: string | number, currency: string) {
  return new Intl.NumberFormat("es-DO", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value));
}

function feeCopy(value: SchedulingWorkspace["visitFee"]) {
  if (!value) return "Pendiente de definir";
  if (value.disposition === "FREE") return "Visita gratuita para el cliente";
  if (value.disposition === "WAIVED") return "Cobro exonerado al cliente";
  if (value.suggestedAmount != null && value.currency) return money(value.suggestedAmount, value.currency);
  return "Cobro pendiente de confirmación";
}

export default function LogisticsVisitSummary({ publication, schedulingContext, visitFee, canViewFee, commercialContext }: Props) {
  const revision = publication?.context.purpose === "VISIT" ? publication : null;
  const zones = [...new Set(revision?.result.lines.map((line) => line.zoneCode) || [])];
  const leadAccount = commercialContext?.parties.find((item) => item.role === "LEAD_ACCOUNT")?.displayName || null;
  const agreement = commercialContext?.agreement;

  return <section className="border-y border-slate-200 bg-slate-50/70 p-4" data-testid="logistics-visit-summary" aria-labelledby="logistics-visit-summary-title">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <h3 id="logistics-visit-summary-title" className="text-sm font-bold text-[#003366]">Resumen de la visita presencial</h3>
      <span className={`rounded px-2 py-1 text-xs font-semibold ${revision ? "bg-emerald-100 text-emerald-900" : "bg-slate-200 text-slate-600"}`}>{revision ? `Transporte · revisión ${revision.revision}` : "Transporte pendiente"}</span>
    </div>
    <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-2">
      <div className="rounded border border-sky-200 bg-white p-3"><dt className="font-semibold text-slate-600">Costo interno de transporte</dt><dd className="mt-1 font-bold text-slate-900">{revision?.result.totals.length ? revision.result.totals.map((total) => <span className="block" key={total.currency}>{total.amount == null ? `Pendiente · ${total.currency}` : money(total.amount, total.currency)}</span>) : "Pendiente de calcular y publicar"}</dd><dd className="mt-1 text-xs text-slate-500">Recursos y gastos para realizar esta visita.</dd></div>
      <div className="rounded border border-slate-200 bg-white p-3"><dt className="font-semibold text-slate-600">Visit Fee · cobro al cliente</dt><dd className="mt-1 font-bold text-slate-900">{canViewFee ? feeCopy(visitFee) : "Sin permiso de consulta"}</dd><dd className="mt-1 text-xs text-slate-500">La gratuidad o exoneración conserva el costo interno de la visita.</dd></div>
    </dl>
    <dl className="mt-3 grid gap-x-5 gap-y-2 text-xs sm:grid-cols-3">
      <div><dt className="font-semibold text-slate-500">Zona</dt><dd className="mt-0.5 text-slate-900">{zones.join(", ") || schedulingContext?.zoneCode || "Pendiente"}</dd></div>
      <div><dt className="font-semibold text-slate-500">Distancia para agenda</dt><dd className="mt-0.5 text-slate-900">{schedulingContext?.distanceKm == null ? "Pendiente de fuente autorizada" : `${schedulingContext.distanceKm.toLocaleString("es-DO")} km`}</dd></div>
      <div><dt className="font-semibold text-slate-500">Perfil de agenda</dt><dd className="mt-0.5 text-slate-900">{schedulingContext?.profile || "Pendiente"}</dd></div>
    </dl>
    {!revision && <p className="mt-3 text-xs text-slate-600">Puede calcular el traslado antes de completar el Survey, usando los trayectos previstos para esta visita.</p>}
    {revision?.result.issues.length ? <div className="mt-3 space-y-2" aria-label="Advertencias logísticas">{revision.result.issues.map((issue, index) => <p key={`${issue.code}-${issue.journeyRef}-${index}`} className={`border-l-4 p-2.5 text-xs ${issue.severity === "BLOCKER" ? "border-red-500 bg-red-50 text-red-950" : "border-amber-400 bg-amber-50 text-amber-950"}`}><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />{issue.message}</p>)}</div> : revision && <p className="mt-3 flex items-center gap-1 text-xs font-semibold text-emerald-800"><MapPin className="h-3.5 w-3.5" />Transporte publicado para esta visita.</p>}
    {(leadAccount || agreement) && <p className="mt-3 text-xs text-slate-600"><ShieldCheck className="mr-1 inline h-3.5 w-3.5" />{leadAccount ? `Cuenta comercial: ${leadAccount}. ` : ""}{agreement ? `Acuerdo: ${agreement.tariff?.name || `versión ${agreement.version}`}.` : ""}</p>}
  </section>;
}
