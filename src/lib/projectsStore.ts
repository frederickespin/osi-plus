import type { CommercialProject } from "@/types/commercial.types";

export type Project = CommercialProject;

const KEY = "osi-plus.projects";
const nowIso = () => new Date().toISOString();
const uid = () =>
  crypto?.randomUUID ? crypto.randomUUID() : `p_${Date.now()}_${Math.random().toString(16).slice(2)}`;

export function loadProjects(): Project[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveProjects(list: Project[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function upsertProjectByNumber(projectNumber: string, patch: Partial<Project>) {
  const list = loadProjects();
  const existing = list.find((p) => p.projectNumber === projectNumber);

  const next: Project = existing
    ? { ...existing, ...patch, updatedAt: nowIso() }
    : {
        id: uid(),
        projectNumber,
        customerId: patch.customerId,
        customerName: patch.customerName || "Cliente",
        leadId: patch.leadId,
        quoteId: patch.quoteId,
        status: "ACTIVE",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };

  saveProjects([next, ...list.filter((p) => p.projectNumber !== projectNumber)]);
  return next;
}
