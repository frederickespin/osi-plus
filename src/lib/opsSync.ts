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
      status: a.status as OSI["status"],
      type: (a.type as OSI["type"]) || "local",
      origin: a.origin,
      destination: a.destination,
      scheduledDate: a.scheduledDate,
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
      scheduledStartAt: existing.scheduledStartAt,
      scheduledEndAt: existing.scheduledEndAt,
      assignedDriverId: existing.assignedDriverId,
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
    notes: p.notes ?? undefined,
  }));
}

