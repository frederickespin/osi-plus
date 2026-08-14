import type { CrmPipelineCase, PipelineCaseStatus } from "@/crm-relational/types";

export type ModernPipelineRow = Readonly<{
  id: string;
  code: string;
  customer: string;
  service: string;
  route: string;
  status: PipelineCaseStatus;
  ownerLabel: string;
  assignment: "ASSIGNED" | "UNASSIGNED";
  estimatedCbm: number;
  versionAuthority: "SERVER";
}>;

/**
 * Frontera visual: transforma únicamente el contrato público CRM. No acepta
 * LeadLite, /cases, stores locales, tenantId, membershipId ni ownerId crudos.
 */
export function toModernPipelineRow(value: CrmPipelineCase): ModernPipelineRow {
  return Object.freeze({
    id: value.id,
    code: value.caseCode,
    customer: value.clientName ?? "Cliente pendiente",
    service: value.serviceType,
    route: [value.originLocation, value.destinationLocation].filter(Boolean).join(" → ") || "Ruta pendiente",
    status: value.status,
    ownerLabel: value.owner?.displayName ?? "Sin asignar",
    assignment: value.owner ? "ASSIGNED" : "UNASSIGNED",
    estimatedCbm: value.estimatedCbm,
    versionAuthority: "SERVER",
  });
}

export function summarizeModernPipelineRows(values: readonly CrmPipelineCase[]) {
  const rows = Object.freeze(values.map(toModernPipelineRow));
  const assigned = rows.filter((row) => row.assignment === "ASSIGNED").length;
  return Object.freeze({ rows, total: rows.length, assigned, unassigned: rows.length - assigned });
}
