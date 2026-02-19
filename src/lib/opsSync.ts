import type { OSI, OpsProject } from "@/types/osi.types";
import type { OsiDto, ProjectDto } from "@/lib/api";

// Merge API OSIs into local NOTA OSI list, preserving NOTA-only fields.
export function mergeOsisPreservingNota(localOsis: OSI[], apiOsis: OsiDto[]): OSI[] {
  const byId = new Map(localOsis.map((o) => [o.id, o]));

  const merged: OSI[] = apiOsis.map((a) => {
    const existing = byId.get(a.id);
    const base: OSI = {
      id: a.id,
      code: a.code,
      projectId: a.projectId,
      projectCode: a.projectCode,
      clientId: a.clientId,
      clientName: a.clientName,
      kind: (a.kind as OSI["kind"]) || "EXTERNAL",
      status: a.status as OSI["status"],
      type: (a.type as OSI["type"]) || "local",
      origin: a.origin,
      destination: a.destination,
      scheduledDate: a.scheduledDate,
      scheduledStartAt: a.scheduledStartAt ?? undefined,
      scheduledEndAt: a.scheduledEndAt ?? undefined,
      supervisorId: a.supervisorId ?? undefined,
      driverId: a.driverId ?? undefined,
      pstCode: a.pstCode ?? undefined,
      pstTemplateVersionId: a.pstTemplateVersionId ?? undefined,
      ptfCode: a.ptfCode ?? undefined,
      petCode: a.petCode ?? undefined,
      ptfMaterialPlan: (a.ptfMaterialPlan as OSI["ptfMaterialPlan"]) ?? undefined,
      petPlan: (a.petPlan as OSI["petPlan"]) ?? undefined,
      ptfEditedManually: Boolean(a.ptfEditedManually),
      petEditedManually: Boolean(a.petEditedManually),
      custodyStatus: (a.custodyStatus as OSI["custodyStatus"]) || "DRIVER",
      custodyTransferredAt: a.custodyTransferredAt ?? undefined,
      driverAvailable: Boolean(a.driverAvailable),
      vehicleAvailable: Boolean(a.vehicleAvailable),
      lastMaterialDeviation: (a.lastMaterialDeviation as OSI["lastMaterialDeviation"]) ?? undefined,
      startedAt: a.startedAt ?? undefined,
      endedAt: a.endedAt ?? undefined,
      npsScore: a.npsScore ?? undefined,
      supervisorNotes: a.supervisorNotes ?? undefined,
      ecoPoints: a.ecoPoints ?? undefined,
      createdAt: a.createdAt,
      assignedTo: a.assignedTo ?? undefined,
      team: Array.isArray(a.team) ? a.team : [],
      vehicles: Array.isArray(a.vehicles) ? a.vehicles : [],
      value: Number(a.value || 0),
      notes: a.notes ?? undefined,
    };

    if (!existing) return base;

    // Keep any NOTA plan/events/allowances/materials tracking that only exists locally.
    return {
      ...base,
      scheduledStartAt: base.scheduledStartAt || existing.scheduledStartAt,
      scheduledEndAt: base.scheduledEndAt || existing.scheduledEndAt,
      assignedDriverId: base.driverId || existing.assignedDriverId,
      materialsStatus: existing.materialsStatus,
      materialsLocation: existing.materialsLocation,
      materialsUpdatedAt: existing.materialsUpdatedAt,
      materialsUpdatedBy: existing.materialsUpdatedBy,
      osiNotaPlan: existing.osiNotaPlan,
      allowances: existing.allowances,
      notaEvents: existing.notaEvents,
    };
  });

  // Keep local OSIs that are not present in API yet (draft/offline)
  const apiIds = new Set(apiOsis.map((o) => o.id));
  localOsis.forEach((l) => {
    if (!apiIds.has(l.id)) merged.push(l);
  });

  return merged;
}

export function mapProjectsFromApi(apiProjects: ProjectDto[]): OpsProject[] {
  return apiProjects.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    clientId: p.clientId,
    clientName: p.clientName,
    status: (String(p.status || "active").toLowerCase() as OpsProject["status"]) || "active",
    startDate: p.startDate,
    endDate: p.endDate ?? undefined,
    osiCount: Number(p.osiCount || 0),
    totalValue: Number(p.totalValue || 0),
    assignedTo: p.assignedTo || "",
    quoteId: p.quoteId ?? undefined,
    leadId: p.leadId ?? undefined,
    pstCode: p.pstCode ?? undefined,
    pstServiceName: p.pstServiceName ?? undefined,
    notes: p.notes ?? undefined,
  }));
}
