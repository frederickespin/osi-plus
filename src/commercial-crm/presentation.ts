import type { CrmPipelineReadError } from "@/crm-relational/readApi";
import type { PipelineCaseStatus } from "@/crm-relational/types";

export const STATUS_LABELS: Readonly<Record<PipelineCaseStatus, string>> = {
  NEW_INBOX: "Nuevo en Inbox", AWAITING_ICP: "Esperando ICP", GOVERNANCE_CONFIRMED: "Gobernanza confirmada",
  REQUIREMENTS_CONFIRMED: "Requisitos confirmados", SURVEY_PLANNING: "Planificando Survey", SURVEY_SCHEDULED: "Survey programado",
  SURVEY_COMPLETED: "Survey completado", CRATING_ESTIMATE_PENDING: "Estimación de cajas", PRICING_IN_PROGRESS: "Costeo en proceso",
  QUOTE_DRAFT: "Cotización borrador", INTERNAL_REVIEW: "Revisión interna", QUOTE_SENT: "Cotización enviada",
  NEGOTIATION: "Negociación", WON: "Ganado", LOST: "Perdido", CHANGE_CONTROL: "Control de cambios",
  APPROVED: "Aprobado · legacy congelado", OPS_HANDOFF: "Handoff a Operaciones · terminal",
};

export function commercialReadErrorCopy(error: CrmPipelineReadError) {
  if (error.status === 401) return "La sesión ya no es válida. Inicia sesión nuevamente.";
  if (error.status === 403) return "Tu membresía no tiene permiso para consultar el Inbox Comercial.";
  if (error.status === 404) return "El caso no existe o no pertenece a este tenant.";
  if (error.status === 409) return "La lectura CRM continúa desactivada en este entorno.";
  if (error.status === 503) return "El servicio relacional no está disponible temporalmente.";
  return "La respuesta del servicio no pudo validarse de forma segura.";
}

export function statusClass(value: PipelineCaseStatus) {
  if (value === "APPROVED") return "border-amber-300 bg-amber-50 text-amber-800";
  if (value === "OPS_HANDOFF") return "border-slate-400 bg-slate-100 text-slate-800";
  if (value === "WON") return "border-emerald-300 bg-emerald-50 text-emerald-800";
  if (value === "LOST") return "border-rose-300 bg-rose-50 text-rose-800";
  return "border-sky-200 bg-sky-50 text-sky-800";
}
